"""RD Station CRM v2: OAuth, fila persistida e operações com retomada por etapas."""
import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import urlencode, urlsplit
from uuid import uuid4

import httpx
from cryptography.fernet import Fernet
from pydantic import BaseModel, Field, field_validator

from crm_storage import enqueue_booking, enqueue_order
from crm_formatting import Layout, call_description, csat_description, deal_name, legacy_deal_name, operation_description, sentiment_description, task_name, with_event_marker
from systems import CATALOG, DemoSystems, get_systems

API = "https://api.rd.services/crm/v2"
TOKEN_URL = "https://api.rd.services/oauth2/token"
AUTH_URL = "https://accounts.rdstation.com/oauth/authorize"
ID_PATTERN = r"^[0-9a-f]{24}$"
log = logging.getLogger("sabor.crm")


class CrmError(Exception):
    def __init__(self, code, message, status=400, retry_after=None, uncertain=False):
        self.code, self.message, self.status = code, message, status
        self.retry_after, self.uncertain = retry_after, uncertain
        super().__init__(message)


def normalize_phone(value: str):
    value = value.strip()
    if re.search(r"[^\d+() .-]", value):
        raise ValueError("Telefone inválido")
    digits = re.sub(r"\D", "", value)
    if not value.startswith("+"):
        if len(digits) in (10, 11): digits = "55" + digits
        elif not (digits.startswith("55") and len(digits) in (12, 13)): raise ValueError("Informe o telefone com DDD ou código internacional")
    normalized = "+" + digits
    if not re.fullmatch(r"\+[1-9]\d{7,14}", normalized): raise ValueError("Telefone inválido")
    return normalized


class CustomerInput(BaseModel):
    conversationId: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=8, max_length=40)
    email: str | None = Field(default=None, max_length=254)

    @field_validator("name")
    @classmethod
    def name_clean(cls, value):
        value = " ".join(value.split())
        if len(value) < 2: raise ValueError("Informe um nome")
        return value

    @field_validator("phone")
    @classmethod
    def phone_clean(cls, value): return normalize_phone(value)

    @field_validator("email")
    @classmethod
    def email_clean(cls, value):
        if not value or not value.strip(): return None
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value): raise ValueError("E-mail inválido")
        return value


class MappingInput(BaseModel):
    store: str = Field(max_length=100)
    pipelineId: str = Field(pattern=ID_PATTERN)
    stageId: str = Field(pattern=ID_PATTERN)
    ownerId: str = Field(pattern=ID_PATTERN)


def oauth_config():
    values = {name: os.getenv(name, "").strip() for name in ("RD_CRM_CLIENT_ID", "RD_CRM_CLIENT_SECRET", "RD_CRM_REDIRECT_URI")}
    missing = [name for name, value in values.items() if not value]
    if missing: raise CrmError("not_configured", "Preencha " + ", ".join(missing) + " no .env da raiz.", 503)
    url = urlsplit(values["RD_CRM_REDIRECT_URI"])
    if (url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1"))) or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise CrmError("invalid_redirect", "RD_CRM_REDIRECT_URI deve ser o callback HTTPS cadastrado (ou localhost para desenvolvimento).", 503)
    return values


class CrmIntegration:
    def __init__(self, systems: DemoSystems, transport=None, interval=0.6):
        self.systems, self.transport, self.interval = systems, transport, interval
        self.token_lock = asyncio.Lock()
        self.process_lock = asyncio.Lock()
        self.rate_lock = asyncio.Lock()
        self.last_request = 0.0
        self.cooldown = 0.0
        self._cipher = None

    def cipher(self):
        if self._cipher: return self._cipher
        path = self.systems.path.with_suffix(".crm.key")
        if not path.exists():
            try:
                fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "wb") as file: file.write(Fernet.generate_key())
            except FileExistsError: pass
        self._cipher = Fernet(path.read_bytes())
        return self._cipher

    def connection(self, decrypt=False):
        with self.systems.connection() as db:
            row = db.execute("SELECT * FROM crm_connection WHERE singleton=1").fetchone()
        if not row: return None
        data = dict(row)
        if decrypt:
            try: data["credentials"] = json.loads(self.cipher().decrypt(data["tokens"]))
            except Exception: raise CrmError("token_storage", "Reconecte o CRM: não foi possível abrir as credenciais salvas.", 503) from None
        return data

    def save_tokens(self, tokens, connection_id=None, connected_at=None):
        if not isinstance(tokens, dict) or not isinstance(tokens.get("access_token"), str) or not tokens["access_token"] or not isinstance(tokens.get("refresh_token"), str) or not tokens["refresh_token"]:
            raise CrmError("invalid_token", "O RD não retornou credenciais válidas. Conecte novamente.", 502)
        try: duration = int(tokens.get("expires_in", 7200))
        except (ValueError, TypeError): duration = 0
        if not 0 < duration <= 31 * 86400: raise CrmError("invalid_token", "O RD não retornou validade de token válida.", 502)
        expiry = time.time() + duration
        encrypted = self.cipher().encrypt(json.dumps({"access_token": tokens["access_token"], "refresh_token": tokens["refresh_token"]}).encode())
        connection_id = connection_id or str(uuid4())
        connected_at = connected_at or datetime.now(timezone.utc).isoformat()
        with self.systems.connection() as db:
            db.execute("INSERT INTO crm_connection VALUES (1, ?, ?, ?, ?, 'connected') ON CONFLICT(singleton) DO UPDATE SET connection_id=excluded.connection_id,tokens=excluded.tokens,expires_at=excluded.expires_at,connected_at=excluded.connected_at,status='connected'", (connection_id, encrypted, expiry, connected_at))

    def authorization_url(self, state):
        config = oauth_config()
        if not re.fullmatch(r"[a-f0-9]{64}", state): raise CrmError("invalid_state", "Solicitação OAuth inválida.")
        return AUTH_URL + "?" + urlencode({"response_type": "code", "client_id": config["RD_CRM_CLIENT_ID"], "redirect_uri": config["RD_CRM_REDIRECT_URI"], "state": state})

    async def token_request(self, data):
        config = oauth_config()
        try:
            async with httpx.AsyncClient(transport=self.transport, timeout=15) as client:
                response = await client.post(TOKEN_URL, data={"client_id": config["RD_CRM_CLIENT_ID"], "client_secret": config["RD_CRM_CLIENT_SECRET"], **data})
        except httpx.HTTPError: raise CrmError("oauth_unavailable", "Não foi possível conectar ao RD. Tente novamente.", 503) from None
        if response.status_code >= 400: raise CrmError("oauth_rejected", "O RD recusou a autorização. Confira as credenciais e o callback e conecte novamente.", 401)
        try: return response.json()
        except ValueError: raise CrmError("oauth_invalid", "Resposta de autorização inválida.", 502) from None

    async def exchange(self, code):
        if not code or len(code) > 2000: raise CrmError("invalid_code", "Código de autorização inválido.")
        async with self.token_lock:
            tokens = await self.token_request({"grant_type": "authorization_code", "code": code, "redirect_uri": oauth_config()["RD_CRM_REDIRECT_URI"]})
            self.save_tokens(tokens)
        return {"connected": True}

    async def access_token(self, expected_connection, invalid_token=None):
        async with self.token_lock:
            connection = self.connection(decrypt=True)
            if not connection or connection["status"] != "connected": raise CrmError("not_connected", "Conecte o RD Station CRM.", 409)
            if connection["connection_id"] != expected_connection: raise CrmError("connection_changed", "A conexão do CRM mudou. Revise o evento antes de reprocessar.", 409)
            token = connection["credentials"]["access_token"]
            if connection["expires_at"] > time.time() + 300 and (invalid_token is None or invalid_token != token): return token
            try:
                result = await self.token_request({"grant_type": "refresh_token", "refresh_token": connection["credentials"]["refresh_token"]})
                self.save_tokens(result, connection["connection_id"], connection["connected_at"])
                return result["access_token"]
            except CrmError as error:
                if error.status == 401:
                    with self.systems.connection() as db: db.execute("UPDATE crm_connection SET status='needs_reconnect' WHERE singleton=1")
                raise

    async def request(self, method, path, connection_id, data=None, params=None):
        if not path.startswith("/") or ".." in path or "://" in path: raise CrmError("invalid_path", "Operação CRM inválida.")
        token = await self.access_token(connection_id)
        for attempt in range(2):
            if self.cooldown > time.monotonic(): raise CrmError("rate_limit", "Limite do RD atingido. O evento será tentado novamente.", 429, int(self.cooldown - time.monotonic()) + 1)
            async with self.rate_lock:
                await asyncio.sleep(max(0, self.last_request + self.interval - time.monotonic()))
                self.last_request = time.monotonic()
            try:
                async with httpx.AsyncClient(transport=self.transport, timeout=12) as client:
                    response = await client.request(method, API + path, headers={"Authorization": f"Bearer {token}"}, json={"data": data} if data is not None else None, params=params)
            except httpx.HTTPError:
                raise CrmError("delivery_unknown" if method == "POST" else "network_error", "O RD não confirmou o resultado. Verifique o registro e reprocesse para reconciliar." if method == "POST" else "Falha de conexão com o RD. Nova tentativa será agendada.", 503, uncertain=method == "POST") from None
            if response.status_code == 401 and attempt == 0:
                token = await self.access_token(connection_id, invalid_token=token)
                continue
            if response.status_code == 429:
                try: wait = min(3600, max(1, int(response.headers.get("Retry-After", "60"))))
                except ValueError: wait = 60
                self.cooldown = time.monotonic() + wait
                raise CrmError("rate_limit", "Limite do RD atingido. Nova tentativa agendada.", 429, wait)
            if response.status_code >= 400:
                messages = {401: "Reconecte a conta do CRM.", 403: "A conta não tem permissão para esta operação na API v2.", 404: "Um registro configurado não foi encontrado no CRM.", 422: "O CRM recusou os campos. Confira as exigências da conta e o mapeamento.", 400: "O CRM recusou os dados desta operação."}
                raise CrmError("rd_rejected", messages.get(response.status_code, "O RD está indisponível. Tente novamente."), response.status_code, uncertain=method == "POST" and response.status_code >= 500)
            if response.status_code == 204: return {}
            try: result = response.json()
            except ValueError: raise CrmError("invalid_response", "O CRM retornou um resultado inválido.", 502, uncertain=method == "POST") from None
            if not isinstance(result, dict) or "data" not in result: raise CrmError("invalid_response", "O CRM retornou um resultado fora do contrato.", 502, uncertain=method == "POST")
            return result
        raise CrmError("not_connected", "Reconecte a conta do CRM.", 401)

    async def listing(self, path, connection_id, params=None, max_pages=10):
        output = []
        for page in range(1, max_pages + 1):
            result = await self.request("GET", path, connection_id, params={**(params or {}), "page[number]": page, "page[size]": 100})
            if not isinstance(result["data"], list): raise CrmError("invalid_response", "Listagem inválida recebida do CRM.", 502)
            output.extend(result["data"])
            if not result.get("links", {}).get("next"): return output
        raise CrmError("listing_limit", "A listagem do CRM excedeu o limite desta demo. Revise os registros antes de sincronizar.", 409)

    @staticmethod
    def remote_id(result):
        value = result.get("data", {}).get("id") if isinstance(result.get("data"), dict) else None
        if not isinstance(value, str) or not re.fullmatch(ID_PATTERN, value): raise CrmError("invalid_remote_id", "O CRM não devolveu um identificador válido. Verifique o registro antes de reprocessar.", 502, uncertain=True)
        return value

    def save_customer(self, profile: CustomerInput):
        with self.systems.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT id FROM crm_customers WHERE phone=?", (profile.phone,)).fetchone()
            customer_id = existing[0] if existing else str(uuid4())
            db.execute("INSERT INTO crm_customers VALUES (?, ?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name,email=excluded.email,updated_at=excluded.updated_at", (customer_id, profile.name, profile.phone, profile.email, datetime.now(timezone.utc).isoformat()))
            db.execute("INSERT INTO crm_conversation_customers VALUES (?, ?) ON CONFLICT(conversation_id) DO UPDATE SET customer_id=excluded.customer_id", (profile.conversationId, customer_id))
            db.execute("UPDATE sentiment_alerts SET customer_name=?,updated_at=? WHERE conversation_id=?", (profile.name, time.time(), profile.conversationId))
            db.execute("UPDATE crm_events SET status='pending',next_attempt=0,attempts=0 WHERE conversation_id=? AND status='blocked' AND error_code='missing_customer'", (profile.conversationId,))
        return {"id": customer_id, "name": profile.name, "phone": profile.phone, "email": profile.email}

    def customer_for(self, conversation_id):
        with self.systems.connection() as db:
            row = db.execute("SELECT c.* FROM crm_customers c JOIN crm_conversation_customers m ON m.customer_id=c.id WHERE m.conversation_id=?", (conversation_id,)).fetchone()
        return dict(row) if row else None

    def checkpoint(self, event_id, values):
        with self.systems.connection() as db:
            row = db.execute("SELECT checkpoint FROM crm_events WHERE id=?", (event_id,)).fetchone()
            state = {**json.loads(row[0]), **values}
            db.execute("UPDATE crm_events SET checkpoint=? WHERE id=?", (json.dumps(state), event_id))
        return state

    async def find_contact(self, customer, connection_id, event_id):
        with self.systems.connection() as db:
            linked = db.execute("SELECT contact_id FROM crm_contact_links WHERE connection_id=? AND customer_id=?", (connection_id, customer["id"])).fetchone()
        if linked:
            try:
                await self.request("GET", f"/contacts/{linked[0]}", connection_id)
                self.checkpoint(event_id, {"contact_id": linked[0], "phase": "contact_ready"})
                return linked[0]
            except CrmError as error:
                if error.status != 404: raise
        contacts = await self.listing("/contacts", connection_id, {"filter": "phone:" + json.dumps(customer["phone"])})
        if not contacts and customer.get("email"):
            contacts = await self.listing("/contacts", connection_id, {"filter": "email:" + json.dumps(customer["email"])})
            if contacts:
                phones = [entry.get("phone", "") for entry in contacts[0].get("phones", [])]
                normalized = []
                for phone in phones:
                    try: normalized.append(normalize_phone(phone))
                    except ValueError: continue
                if normalized and customer["phone"] not in normalized: raise CrmError("contact_conflict", "O e-mail está associado a outro telefone no RD. Revise o contato.", 409)
        if len(contacts) > 1: raise CrmError("duplicate_contact", "Há mais de um contato correspondente no RD. Revise os duplicados.", 409)
        if contacts:
            contact_id = self.remote_id({"data": contacts[0]})
        else:
            self.checkpoint(event_id, {"phase": "creating_contact"})
            data = {"name": customer["name"], "phones": [{"phone": customer["phone"], "type": "mobile"}]}
            if customer.get("email"): data["emails"] = [{"email": customer["email"]}]
            contact_id = self.remote_id(await self.request("POST", "/contacts", connection_id, data=data))
        with self.systems.connection() as db:
            db.execute("INSERT INTO crm_contact_links VALUES (?, ?, ?) ON CONFLICT(connection_id,customer_id) DO UPDATE SET contact_id=excluded.contact_id", (connection_id, customer["id"], contact_id))
        self.checkpoint(event_id, {"contact_id": contact_id, "phase": "contact_ready"})
        return contact_id

    async def add_note(self, event, deal_id, description, connection_id):
        marker = f"[sabor-event:{event['id']}]"
        notes = await self.listing(f"/deals/{deal_id}/notes", connection_id)
        existing = next((note for note in notes if marker in note.get("description", "")), None)
        if existing:
            self.checkpoint(event["id"], {"note_id": existing["id"], "phase": "note_ready"})
            return
        self.checkpoint(event["id"], {"phase": "creating_note"})
        note_id = self.remote_id(await self.request("POST", f"/deals/{deal_id}/notes", connection_id, data={"description": with_event_marker(description, event["id"])}))
        self.checkpoint(event["id"], {"note_id": note_id, "phase": "note_ready"})

    async def process_event(self, event, connection_id):
        try: Layout()  # Validar apresentação antes de qualquer escrita remota.
        except ValueError: raise CrmError("invalid_format", "Configure RD_CRM_TEXT_FORMAT como markdown ou text e reprocesse o evento.", 422) from None
        payload = json.loads(event["payload"])
        is_csat = event["event_type"] == "csat.answered"
        is_sentiment = event["event_type"] == "sentiment.alerted"
        if event["connection_id"] and event["connection_id"] != connection_id: raise CrmError("connection_changed", "Este evento pertence à conexão anterior. Reprocesse explicitamente para usar a conta atual.", 409)
        with self.systems.connection() as db:
            db.execute("UPDATE crm_events SET connection_id=? WHERE id=?", (connection_id, event["id"]))
        if is_sentiment and payload.get("operation_id"):
            with self.systems.connection() as db:
                linked = db.execute("SELECT deal_id FROM crm_deal_links WHERE connection_id=? AND aggregate_id=? AND conversation_id=?",
                                    (connection_id, payload["operation_id"], event["conversation_id"])).fetchone()
            if not linked: raise CrmError("awaiting_deal", "Aguardando o pedido ou reserva para registrar o alerta de atendimento.", 409)
            deal = (await self.request("GET", f"/deals/{linked[0]}", connection_id))["data"]
            owner_id = deal.get("owner_id")
            if not owner_id:
                with self.systems.connection() as db:
                    mapping = db.execute("SELECT settings FROM crm_mappings WHERE connection_id=? AND store=?", (connection_id, payload["store"])).fetchone()
                if not mapping: raise CrmError("missing_mapping", "Configure o responsável da unidade para receber o alerta.", 409)
                owner_id = json.loads(mapping[0])["ownerId"]
            self.checkpoint(event["id"], {"deal_id": linked[0]})
            await self.sync_sentiment(event, payload, linked[0], owner_id, connection_id)
            return "synced"
        if is_csat and payload.get("operation_id"):
            with self.systems.connection() as db:
                linked = db.execute("SELECT deal_id FROM crm_deal_links WHERE connection_id=? AND aggregate_id=? AND conversation_id=?",
                                    (connection_id, payload["operation_id"], event["conversation_id"])).fetchone()
            if not linked:
                raise CrmError("awaiting_deal", "Aguardando o pedido ou reserva para registrar a avaliação CSAT.", 409)
            self.checkpoint(event["id"], {"deal_id": linked[0]})
            await self.add_note(event, linked[0], csat_description(event, payload, self.customer_for(event["conversation_id"])), connection_id)
            return "synced"
        if event["event_type"] == "call.completed":
            with self.systems.connection() as db:
                operation = db.execute("""SELECT aggregate_id FROM crm_events WHERE conversation_id=?
                    AND event_type IN ('reservation.confirmed','order.confirmed') AND created_at<=?
                    ORDER BY created_at DESC LIMIT 1""", (event["conversation_id"], event["created_at"])).fetchone()
                deal = db.execute("SELECT deal_id FROM crm_deal_links WHERE connection_id=? AND aggregate_id=?", (connection_id, operation[0])).fetchone() if operation else None
            if not deal:
                if operation: raise CrmError("awaiting_deal", "Aguardando a sincronização do pedido ou reserva para anexar o resumo da ligação.", 409)
                return "skipped"
            self.checkpoint(event["id"], {"deal_id": deal[0]})
            await self.add_note(event, deal[0], call_description(event, payload, self.customer_for(event["conversation_id"])), connection_id)
            return "synced"
        with self.systems.connection() as db:
            mapping_row = db.execute("SELECT settings FROM crm_mappings WHERE connection_id=? AND store=?", (connection_id, payload["store"])).fetchone()
            customer_id = payload.get("customer_id")
            if not customer_id:
                row = db.execute("SELECT customer_id FROM crm_conversation_customers WHERE conversation_id=?", (event["conversation_id"],)).fetchone()
                customer_id = row[0] if row else None
            customer_row = db.execute("SELECT * FROM crm_customers WHERE id=?", (customer_id,)).fetchone() if customer_id else None
        if not mapping_row: raise CrmError("missing_mapping", "Configure o funil, a etapa e o responsável desta unidade.", 409)
        if not customer_row: raise CrmError("missing_customer", "Cadastre o nome e o telefone do cliente desta conversa.", 409)
        settings, customer = json.loads(mapping_row[0]), dict(customer_row)
        payload["customer_id"] = customer["id"]
        with self.systems.connection() as db:
            db.execute("UPDATE crm_events SET payload=? WHERE id=?", (json.dumps(payload, ensure_ascii=False), event["id"]))
        contact_id = await self.find_contact(customer, connection_id, event["id"])
        is_order = event["event_type"] == "order.confirmed"
        reference = event["aggregate_id"]
        remote_name = deal_name(event, payload)
        with self.systems.connection() as db:
            linked = db.execute("SELECT deal_id FROM crm_deal_links WHERE connection_id=? AND aggregate_id=?", (connection_id, reference)).fetchone()
        deals = []
        if linked:
            try: deals = [(await self.request("GET", f"/deals/{linked[0]}", connection_id))["data"]]
            except CrmError as error:
                if error.status != 404: raise
        if not deals:
            # Uma escrita anterior pode ter sido aceita com o título antigo e sem resposta.
            # Procurar ambos os formatos evita duplicar a operação após esta atualização.
            previous_name = json.loads(event["checkpoint"]).get("deal_name")
            names = dict.fromkeys(name for name in (previous_name, remote_name, legacy_deal_name(event, payload)) if name)
            found = {}
            for name in names:
                for deal in await self.listing("/deals", connection_id, {"filter": "name:" + json.dumps(name, ensure_ascii=False)}):
                    found[self.remote_id({"data": deal})] = deal
            deals = list(found.values())
        if len(deals) > 1: raise CrmError("duplicate_deal", "Há negociações duplicadas para esta operação no RD. Revise os registros.", 409)
        data = {"name": remote_name, "stage_id": settings["stageId"], "owner_id": settings["ownerId"], "contact_ids": [contact_id]}
        if is_csat:
            stages = await self.listing(f"/pipelines/{settings['pipelineId']}/stages", connection_id)
            stage = next((item for item in stages if item.get("name") == "Pós-atendimento"), None)
            if not stage: raise CrmError("missing_csat_stage", "Crie a etapa Pós-atendimento no funil da unidade e reprocesse o CSAT.", 409)
            data["stage_id"] = stage["id"]
        if is_order:
            data["one_time_price"] = payload["total"]
        if deals:
            deal_id = self.remote_id({"data": deals[0]})
        else:
            self.checkpoint(event["id"], {"phase": "creating_deal", "deal_name": remote_name})
            deal_id = self.remote_id(await self.request("POST", "/deals", connection_id, data={**data, "status": "ongoing"}))
        with self.systems.connection() as db:
            db.execute("INSERT INTO crm_deal_links VALUES (?, ?, ?, ?) ON CONFLICT(connection_id,aggregate_id) DO UPDATE SET deal_id=excluded.deal_id", (connection_id, reference, event["conversation_id"], deal_id))
        self.checkpoint(event["id"], {"deal_id": deal_id, "phase": "deal_ready"})
        if is_sentiment:
            await self.sync_sentiment(event, payload, deal_id, settings["ownerId"], connection_id)
            return "synced"
        if is_csat:
            await self.add_note(event, deal_id, csat_description(event, payload, customer), connection_id)
            return "synced"
        description = operation_description(event, payload, customer)
        await self.add_note(event, deal_id, description, connection_id)
        with self.systems.connection() as db:
            db.execute("UPDATE crm_events SET status='pending',next_attempt=0 WHERE conversation_id=? AND status='blocked' AND error_code='awaiting_deal'", (event["conversation_id"],))
        return "synced"

    async def sync_sentiment(self, event, payload, deal_id, owner_id, connection_id):
        with self.systems.connection() as db:
            alert = db.execute("SELECT * FROM sentiment_alerts WHERE id=?", (payload["alert_id"],)).fetchone()
        if not alert: raise CrmError("missing_alert", "Alerta de atendimento não encontrado.", 404)
        marker = f"[sabor-event:{event['id']}]"
        description = with_event_marker(sentiment_description(event, payload, alert), event["id"])
        notes = await self.listing(f"/deals/{deal_id}/notes", connection_id)
        existing = next((note for note in notes if marker in note.get("description", "")), None)
        if existing:
            note_id = self.remote_id({"data": existing})
            # A API v2 publica criação/listagem de notas, sem edição. A tarefa recebe o contexto atualizado.
        else:
            self.checkpoint(event["id"], {"phase": "creating_note"})
            note_id = self.remote_id(await self.request("POST", f"/deals/{deal_id}/notes", connection_id, data={"description": description}))
        self.checkpoint(event["id"], {"note_id": note_id, "phase": "note_ready"})
        tasks = await self.listing("/tasks", connection_id, {"filter": "deal_id:" + deal_id})
        title = task_name(payload)
        old_title = f"Priorizar atendimento — {payload['alert_id']}"
        # O título curto é visual. Só o marcador completo (ou o título legado com UUID
        # completo) identifica a ocorrência; duas tarefas podem ter o mesmo prefixo.
        matching = [task for task in tasks if marker in (task.get("description") or "") or task.get("name") == old_title]
        if len(matching) > 1: raise CrmError("duplicate_task", "Há tarefas duplicadas para o alerta. Confira no CRM.", 409)
        if matching:
            task_id = self.remote_id({"data": matching[0]})
            if matching[0].get("description") != description:
                await self.request("PATCH", f"/tasks/{task_id}", connection_id, data={"description": description})
        else:
            self.checkpoint(event["id"], {"phase": "creating_task"})
            task_id = self.remote_id(await self.request("POST", "/tasks", connection_id, data={
                "name": title, "type": "task", "status": "open", "deal_id": deal_id,
                "owner_ids": [owner_id], "due_date": datetime.fromtimestamp(alert["waiting_since"] or alert["created_at"], timezone.utc).isoformat(),
                "description": description}))
        self.checkpoint(event["id"], {"task_id": task_id, "phase": "task_ready", "sentiment_version": alert["updated_at"]})

    async def process_once(self):
        if self.process_lock.locked(): return False
        async with self.process_lock:
            connection = self.connection()
            if not connection or connection["status"] != "connected": return False
            now = time.time()
            with self.systems.connection() as db:
                db.execute("BEGIN IMMEDIATE")
                expired = db.execute("SELECT id,checkpoint FROM crm_events WHERE status='processing' AND lease_until<?", (now,)).fetchall()
                for expired_event in expired:
                    uncertain = json.loads(expired_event["checkpoint"]).get("phase", "").startswith("creating_")
                    db.execute("UPDATE crm_events SET status=?,last_error=?,error_code=? WHERE id=?", ("uncertain" if uncertain else "pending", "Processamento interrompido durante uma escrita. Verifique o RD e reprocesse para reconciliar." if uncertain else None, "delivery_unknown" if uncertain else None, expired_event["id"]))
                row = db.execute("SELECT * FROM crm_events WHERE status='pending' AND next_attempt<=? ORDER BY created_at LIMIT 1", (now,)).fetchone()
                if not row: return False
                event = dict(row)
                db.execute("UPDATE crm_events SET status='processing',attempts=attempts+1,lease_until=? WHERE id=?", (now + 180, event["id"]))
            try:
                async with asyncio.timeout(90):
                    status = await self.process_event(event, connection["connection_id"])
                with self.systems.connection() as db:
                    db.execute("UPDATE crm_events SET status=?,last_error=NULL,error_code=NULL,synced_at=?,lease_until=0 WHERE id=?", (status, time.time(), event["id"]))
                    # Uma nova mensagem pode chegar durante as chamadas HTTP ao RD.
                    if event["event_type"] == "sentiment.alerted":
                        db.execute("""UPDATE crm_events SET status='pending',next_attempt=0,attempts=0 WHERE id=? AND EXISTS
                            (SELECT 1 FROM sentiment_alerts a WHERE a.event_id=crm_events.id
                            AND a.updated_at>COALESCE(json_extract(crm_events.checkpoint,'$.sentiment_version'),0))""", (event["id"],))
            except Exception as error:
                known = error if isinstance(error, CrmError) else CrmError("worker_error", "Não foi possível concluir a sincronização. Reprocesse o evento.", 503, uncertain=True)
                attempts = event["attempts"] + 1
                status = "uncertain" if known.uncertain else "pending" if (known.status >= 500 or known.status == 429) and attempts < 6 else "blocked" if known.status in (400, 401, 403, 404, 409, 422) else "failed"
                delay = known.retry_after or min(900, 15 * 2 ** min(attempts, 6))
                with self.systems.connection() as db:
                    db.execute("UPDATE crm_events SET status=?,last_error=?,error_code=?,next_attempt=?,lease_until=0 WHERE id=?", (status, known.message, known.code, time.time() + delay, event["id"]))
                log.warning("crm_sync_event code=%s status=%s", known.code, status)
            return True

    def retry(self, event_id):
        connection = self.connection()
        if not connection: raise CrmError("not_connected", "Conecte o CRM antes de reprocessar.", 409)
        with self.systems.connection() as db:
            row = db.execute("SELECT status,connection_id FROM crm_events WHERE id=?", (event_id,)).fetchone()
            if not row: raise CrmError("not_found", "Evento não encontrado.", 404)
            if row["status"] in ("synced", "processing", "skipped"): raise CrmError("invalid_state", "Este evento não pode ser reprocessado agora.", 409)
            if row["connection_id"] != connection["connection_id"]:
                db.execute("UPDATE crm_events SET checkpoint='{}' WHERE id=?", (event_id,))
            db.execute("UPDATE crm_events SET status='pending',attempts=0,next_attempt=0,last_error=NULL,error_code=NULL,connection_id=? WHERE id=?", (connection["connection_id"], event_id))
        return {"queued": True}

    def enqueue_conversation(self, conversation_id):
        with self.systems.connection() as db:
            bookings = db.execute("SELECT * FROM bookings WHERE conversation_id=? AND status='confirmed'", (conversation_id,)).fetchall()
            for booking in bookings: enqueue_booking(db, booking)
            orders = db.execute("SELECT * FROM orders WHERE conversation_id=? AND status='confirmed'", (conversation_id,)).fetchall()
            for order in orders: enqueue_order(db, order, self.systems.product(order["product"])["name"])
        if not bookings and not orders: raise CrmError("no_operation", "Esta conversa ainda não tem pedido ou reserva confirmada no sistema.", 409)
        return {"queued": len(bookings) + len(orders)}

    async def options(self, pipeline_id=None):
        connection = self.connection()
        if not connection: raise CrmError("not_connected", "Conecte o RD Station CRM.", 409)
        cid = connection["connection_id"]
        if pipeline_id:
            if not re.fullmatch(ID_PATTERN, pipeline_id): raise CrmError("invalid_pipeline", "Funil inválido.")
            stages = await self.listing(f"/pipelines/{pipeline_id}/stages", cid)
            return {"stages": [{"id": item["id"], "name": item.get("name", "Etapa")} for item in stages]}
        pipelines = await self.listing("/pipelines", cid)
        users = await self.listing("/users", cid)
        return {"pipelines": [{"id": item["id"], "name": item.get("name", "Funil")} for item in pipelines], "users": [{"id": item["id"], "name": item.get("name", "Responsável")} for item in users]}

    async def save_mapping(self, data: MappingInput):
        if data.store not in [store["name"] for store in CATALOG["stores"]]: raise CrmError("invalid_store", "Unidade inválida.")
        options = await self.options()
        pipeline = next((item for item in options["pipelines"] if item["id"] == data.pipelineId), None)
        owner = next((item for item in options["users"] if item["id"] == data.ownerId), None)
        stages = (await self.options(data.pipelineId))["stages"]
        stage = next((item for item in stages if item["id"] == data.stageId), None)
        if not pipeline or not owner or not stage: raise CrmError("invalid_mapping", "Escolha funil, etapa e responsável da conta conectada.")
        settings = {**data.model_dump(), "pipelineName": pipeline["name"], "stageName": stage["name"], "ownerName": owner["name"]}
        with self.systems.connection() as db:
            db.execute("INSERT INTO crm_mappings VALUES (?, ?, ?) ON CONFLICT(connection_id,store) DO UPDATE SET settings=excluded.settings", (self.connection()["connection_id"], data.store, json.dumps(settings)))
            db.execute("UPDATE crm_events SET status='pending',next_attempt=0,attempts=0 WHERE status='blocked' AND error_code='missing_mapping'")
        return settings

    def disconnect(self):
        with self.systems.connection() as db: db.execute("DELETE FROM crm_connection WHERE singleton=1")
        return {"connected": False}

    def status(self, conversation_id=None):
        try: oauth_config(); configured, configuration_message = True, None
        except CrmError as error: configured, configuration_message = False, error.message
        connection = self.connection()
        cid = connection["connection_id"] if connection else ""
        with self.systems.connection() as db:
            mappings = [json.loads(row[0]) for row in db.execute("SELECT settings FROM crm_mappings WHERE connection_id=?", (cid,))]
            if conversation_id:
                rows = db.execute("SELECT * FROM crm_events WHERE conversation_id=? ORDER BY created_at DESC LIMIT 20", (conversation_id,)).fetchall()
            else:
                rows = db.execute("SELECT * FROM crm_events ORDER BY created_at DESC LIMIT 50").fetchall()
        events = []
        for row in rows:
            checkpoint = json.loads(row["checkpoint"])
            deal_id = checkpoint.get("deal_id")
            events.append({"id": row["id"], "type": row["event_type"], "reference": row["aggregate_id"], "conversationId": row["conversation_id"], "status": row["status"], "attempts": row["attempts"], "error": row["last_error"], "code": row["error_code"], "syncedAt": row["synced_at"], "createdAt": row["created_at"], "contactId": checkpoint.get("contact_id"), "dealId": deal_id, "dealUrl": f"https://crm.rdstation.com/app/deals/{deal_id}" if deal_id and re.fullmatch(ID_PATTERN, deal_id) else None})
        return {"configured": configured, "connected": bool(connection and connection["status"] == "connected"), "connectionStatus": connection["status"] if connection else "disconnected", "configurationMessage": configuration_message, "connectedAt": connection["connected_at"] if connection else None, "mappings": mappings, "events": events, "customer": self.customer_for(conversation_id) if conversation_id else None}


@lru_cache(maxsize=1)
def get_crm(): return CrmIntegration(get_systems())


async def crm_worker():
    while True:
        try:
            processed = await get_crm().process_once()
            await asyncio.sleep(0.2 if processed else 4)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            log.warning("crm_worker_error type=%s", type(error).__name__)
            await asyncio.sleep(10)
