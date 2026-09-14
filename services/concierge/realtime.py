"""WebRTC com negociação no servidor e controlador WebSocket para ferramentas."""
import asyncio
import hmac
import json
import logging
import re
import secrets
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field
from websockets.asyncio.client import connect

from language import normalize, now_local
from models import ChatReply, ChatRequest, Conversation, Message
from realtime_config import RealtimeConfig, RealtimeError
from systems import CATALOG, get_systems

log = logging.getLogger("sabor.realtime")


class CallContext(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=100)
    store: str = Field(min_length=1, max_length=100)
    status: Literal["ai"]
    messages: list[Message] = Field(default_factory=list, max_length=30)
    customerId: str | None = Field(default=None, max_length=120)


class CallStart(BaseModel):
    sdp: str = Field(min_length=20, max_length=65000)
    conversation: CallContext


@dataclass
class Turn:
    id: str
    quote_id: str | None
    transcript: str = ""
    ready: asyncio.Event = field(default_factory=asyncio.Event)
    stopped: bool = False
    queued: bool = False
    handled: bool = False
    ignored: bool = False
    during_playback: bool = False
    response_id: str | None = None


@dataclass
class Call:
    id: str
    token: str = field(repr=False)
    remote_id: str
    context: CallContext
    config: RealtimeConfig = field(repr=False)
    created: float = field(default_factory=time.monotonic)
    started_at: str = field(default_factory=lambda: now_local().isoformat())
    status: str = "connecting"
    reason: str | None = None
    duration: int = 0
    last_seen: float = field(default_factory=time.monotonic)
    transcripts: list[dict] = field(default_factory=list)
    business: ChatReply | None = None
    latest_turn: str | None = None
    heard_quote: str | None = None
    speaking_quote: str | None = None
    speech_active: bool = False
    response_active: bool = False
    active_response_id: str | None = None
    playback_active: bool = False
    greeting_response_id: str | None = None
    requested_replies: set[str] = field(default_factory=set)
    response_quotes: dict[str, str | None] = field(default_factory=dict)
    completed_responses: set[str] = field(default_factory=set)
    interrupted_responses: set[str] = field(default_factory=set)
    playback_response_id: str | None = None
    last_assistant_text: str = ""
    response_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    interrupted: bool = False
    turns: dict[str, Turn] = field(default_factory=dict)
    response_turns: dict[str, str | None] = field(default_factory=dict)
    jobs: dict[str, asyncio.Task] = field(default_factory=dict)
    ready: asyncio.Event = field(default_factory=asyncio.Event)
    response_idle: asyncio.Event = field(default_factory=asyncio.Event)
    websocket: object = field(default=None, repr=False)
    watcher: asyncio.Task | None = field(default=None, repr=False)
    watchdog: asyncio.Task | None = field(default=None, repr=False)
    closing: bool = False

    def snapshot(self):
        return {"id": self.id, "status": self.status, "startedAt": self.started_at,
                "durationSeconds": self.duration if self.closing else int(time.monotonic() - self.created),
                "reason": self.reason, "transcripts": self.transcripts,
                "diagnostics": {"turns": len(self.turns), "transcribed": sum(t.ready.is_set() for t in self.turns.values()), "queued": sum(t.queued for t in self.turns.values()), "handled": sum(t.handled for t in self.turns.values()), "replies": len(self.requested_replies), "speechActive": self.speech_active, "playbackActive": self.playback_active},
                "business": self.business.model_dump(exclude_none=True) if self.business else None}


class CallManager:
    def __init__(self, executor):
        self.executor = executor
        self.calls: OrderedDict[str, Call] = OrderedDict()
        self.occupied: set[str] = set()

    def get(self, call_id, token):
        call = self.calls.get(call_id)
        if not call or not hmac.compare_digest(call.token, token or ""):
            raise RealtimeError("call_not_found", "Ligação não encontrada ou já expirada.", 404)
        call.last_seen = time.monotonic()
        return call

    async def azure_error(self, response):
        if response.status_code in (401, 403):
            raise RealtimeError("unauthorized", "O Azure não autorizou a ligação. Confira a chave do recurso Realtime.")
        if response.status_code == 404:
            raise RealtimeError("deployment_not_found", "Deployment Realtime não encontrado. Confira AZURE_REALTIME_DEPLOYMENT no .env.")
        if response.status_code == 429:
            raise RealtimeError("rate_limit", "O serviço de ligações está ocupado. Aguarde e tente novamente.", 429)
        if response.status_code >= 400:
            log.warning("realtime_azure_error status=%s", response.status_code)
            raise RealtimeError("azure_rejected", "O Azure recusou a sessão. Confira o deployment Realtime, a voz e a configuração de transcrição.")

    async def start(self, payload: CallStart):
        config = RealtimeConfig.from_env()
        if not payload.sdp.startswith("v=0"):
            raise RealtimeError("invalid_sdp", "Não foi possível preparar o áudio desta ligação.", 400)
        if not any(store["name"] == payload.conversation.store for store in CATALOG["stores"]):
            raise RealtimeError("invalid_store", "A unidade desta conversa não está cadastrada.", 400)
        if payload.conversation.id in self.occupied:
            raise RealtimeError("already_active", "Esta conversa já tem uma ligação em andamento.", 409)
        if len(self.occupied) >= 8:
            raise RealtimeError("busy", "As linhas da demonstração estão ocupadas. Tente novamente em instantes.", 429)
        self.occupied.add(payload.conversation.id)
        call = None
        remote_id = None
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                token_response = await client.post(config.base_url + "realtime/client_secrets", headers=config.headers, json=config.session_payload(payload.conversation))
                await self.azure_error(token_response)
                ephemeral = token_response.json().get("value")
                if not ephemeral:
                    raise RealtimeError("invalid_session", "O Azure não retornou uma sessão válida.")
                response = await client.post(config.base_url + "realtime/calls?webrtcfilter=on", headers={"Authorization": f"Bearer {ephemeral}", "Content-Type": "application/sdp"}, content=payload.sdp)
                await self.azure_error(response)
                location = response.headers.get("location", "")
                remote_id = urlsplit(location).path.rstrip("/").split("/")[-1]
                if not re.fullmatch(r"[\w-]{5,180}", remote_id) or not response.text.startswith("v=0"):
                    raise RealtimeError("invalid_connection", "A negociação de áudio não foi concluída pelo Azure.")
                answer = response.text
            call = Call(id=str(uuid4()), token=secrets.token_urlsafe(32), remote_id=remote_id, context=payload.conversation, config=config)
            call.response_idle.set()
            self.calls[call.id] = call
            call.watcher = asyncio.create_task(self.observe(call))
            await asyncio.wait_for(call.ready.wait(), timeout=10)
            if call.closing:
                raise RealtimeError("controller_unavailable", "Não foi possível conectar o atendimento da ligação.")
            call.watchdog = asyncio.create_task(self.monitor(call))
            while len(self.calls) > 100:
                removable = next((key for key, value in self.calls.items() if value.closing), None)
                if removable is None:
                    break
                self.calls.pop(removable)
            return {"id": call.id, "token": call.token, "answer": answer, "maxSeconds": config.max_seconds}
        except BaseException:
            self.occupied.discard(payload.conversation.id)
            if call:
                await self.end(call, "error")
            elif remote_id:
                await self.hangup_remote(config, remote_id)
            raise

    async def hangup_remote(self, config, remote_id):
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.post(config.base_url + f"realtime/calls/{remote_id}/hangup", headers=config.headers)
                if response.status_code not in (200, 204, 404, 409):
                    log.warning("realtime_hangup_status status=%s", response.status_code)
        except Exception as error:
            log.warning("realtime_hangup_unavailable type=%s", type(error).__name__)

    async def end(self, call: Call, reason="ended"):
        if call.closing:
            return call.snapshot()
        call.closing = True
        call.duration = int(time.monotonic() - call.created)
        call.status = "transferred" if reason == "human" else "failed" if reason == "error" else "ended"
        call.reason = reason
        if call.transcripts:
            first_request = next((item["text"] for item in call.transcripts if item["author"] == "customer"), "Sem solicitação transcrita")
            summary = f"Ligação com a assistente virtual · {call.context.store}\nDuração: {call.duration}s\nSolicitação: {first_request[:600]}\nResultado: {call.business.text if call.business else 'Atendimento informativo'}"
            try:
                get_systems().record_call_summary(call.id, call.context.id, summary)
            except Exception as error:
                log.warning("crm_call_summary_error type=%s", type(error).__name__)
        self.occupied.discard(call.context.id)
        call.ready.set()
        current = asyncio.current_task()
        for task in [call.watchdog, *call.jobs.values()]:
            if task and task is not current and not task.done():
                task.cancel()
        if call.websocket:
            try:
                await asyncio.wait_for(call.websocket.close(), timeout=3)
            except Exception:
                pass
        if call.watcher and call.watcher is not current and not call.watcher.done():
            call.watcher.cancel()
        await self.hangup_remote(call.config, call.remote_id)
        return call.snapshot()

    async def monitor(self, call):
        while not call.closing:
            await asyncio.sleep(2)
            if time.monotonic() - call.created >= call.config.max_seconds:
                await self.end(call, "time_limit")
            elif time.monotonic() - call.last_seen > 25:
                await self.end(call, "disconnected")

    def add_transcript(self, call, item_id, author, text):
        if not text or len(text) > 4000 or any(item["id"] == item_id for item in call.transcripts):
            return
        call.transcripts.append({"id": item_id, "author": author, "text": text, "time": now_local().strftime("%H:%M")})
        call.transcripts = call.transcripts[-120:]

    async def observe(self, call):
        url = call.config.base_url.replace("https://", "wss://", 1) + f"realtime?call_id={call.remote_id}"
        try:
            async with connect(url, additional_headers=call.config.headers, open_timeout=10, max_size=2_000_000) as websocket:
                call.websocket = websocket
                call.status = "active"
                call.ready.set()
                async for raw in websocket:
                    if call.closing:
                        break
                    event = json.loads(raw)
                    await self.event(call, event)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            log.warning("realtime_controller_error type=%s", type(error).__name__)
            if not call.closing:
                await self.end(call, "error")
        finally:
            call.ready.set()
            if not call.closing:
                await self.end(call, "disconnected")

    async def event(self, call: Call, event: dict):
        if call.closing:
            return
        kind = event.get("type")
        if kind == "input_audio_buffer.speech_started":
            item_id = event.get("item_id")
            if item_id and item_id not in call.turns:
                call.latest_turn = item_id
                call.turns[item_id] = Turn(item_id, call.heard_quote, during_playback=call.playback_active)
                call.speech_active = True
                if call.response_active or call.playback_active:
                    call.interrupted = True
                    call.heard_quote = None
                    for response_id in (call.active_response_id, call.playback_response_id):
                        if response_id:
                            call.interrupted_responses.add(response_id)
        elif kind == "input_audio_buffer.speech_stopped":
            item_id = event.get("item_id") or call.latest_turn
            if item_id == call.latest_turn:
                call.speech_active = False
            if item_id in call.turns:
                call.turns[item_id].stopped = True
                self.queue_turn(call, call.turns[item_id])
        elif kind == "conversation.item.input_audio_transcription.completed":
            item_id, transcript = event.get("item_id"), event.get("transcript", "")
            turn = call.turns.get(item_id)
            if turn and not turn.ready.is_set():
                turn.transcript = transcript.strip() if isinstance(transcript, str) and len(transcript) <= 4000 else ""
                turn.ignored = self.is_echo(call, turn)
                turn.ready.set()
                if not turn.ignored:
                    self.add_transcript(call, item_id, "customer", turn.transcript)
                self.queue_turn(call, turn)
        elif kind == "conversation.item.input_audio_transcription.failed":
            turn = call.turns.get(event.get("item_id"))
            if turn and not turn.ready.is_set():
                turn.ready.set()
                self.queue_turn(call, turn)
        elif kind == "response.created":
            response = event.get("response", {})
            response_id = response.get("id")
            if not response_id or response_id in call.response_turns:
                return
            metadata = response.get("metadata") or {}
            turn_id = metadata.get("turn_id")
            if metadata.get("purpose") == "greeting" and not call.greeting_response_id and call.latest_turn is None:
                call.greeting_response_id = response_id
            elif turn_id in call.requested_replies and call.turns.get(turn_id) and not call.turns[turn_id].response_id and call.latest_turn == turn_id and not call.speech_active:
                call.turns[turn_id].response_id = response_id
            else:
                # Sem autorização de um turno novo, cancelar em vez de iniciar outra resposta.
                await call.websocket.send(json.dumps({"type": "response.cancel", "response_id": response_id}))
                if not call.response_active:
                    call.response_idle.set()
                return
            call.response_turns[response_id] = turn_id
            call.response_quotes[response_id] = call.speaking_quote if turn_id else None
            call.active_response_id = response_id
            call.response_active = True
            call.response_idle.clear()
            call.interrupted = False
        elif kind == "response.done":
            response = event.get("response", {})
            response_id = response.get("id")
            if response_id in call.response_turns:
                if response.get("status") == "completed":
                    call.completed_responses.add(response_id)
                else:
                    call.interrupted_responses.add(response_id)
            if response.get("id") == call.active_response_id:
                call.response_active = False
                call.response_idle.set()
                if response.get("status") not in (None, "completed"):
                    call.interrupted = True
        elif kind == "response.output_audio_transcript.done":
            response_id = event.get("response_id")
            if response_id in call.response_turns:
                call.last_assistant_text = event.get("transcript", "")
                self.add_transcript(call, event.get("item_id") or response_id, "ai", call.last_assistant_text)
        elif kind == "output_audio_buffer.started":
            call.playback_active = True
            call.playback_response_id = event.get("response_id") or call.active_response_id
        elif kind == "output_audio_buffer.cleared":
            call.interrupted = True
            call.heard_quote = None
            call.speaking_quote = None
            call.playback_active = False
            response_id = event.get("response_id") or call.playback_response_id or call.active_response_id
            if response_id:
                call.interrupted_responses.add(response_id)
        elif kind == "output_audio_buffer.stopped":
            call.playback_active = False
            response_id = event.get("response_id") or call.playback_response_id or call.active_response_id
            if not call.speech_active and response_id == call.active_response_id and response_id in call.completed_responses and response_id not in call.interrupted_responses:
                call.heard_quote = call.response_quotes.get(response_id)
            if call.business and call.business.status == "waiting":
                asyncio.create_task(self.end(call, "human"))
        elif kind == "response.function_call_arguments.done":
            # O modelo de voz não dispara o atendimento. A transcrição final é o único gatilho.
            log.warning("realtime_unexpected_tool_blocked")
        elif kind == "error":
            code = event.get("error", {}).get("code", "")
            if code not in ("response_cancel_not_active", "conversation_already_has_active_response"):
                log.warning("realtime_protocol_error code=%s", re.sub(r"[^a-zA-Z0-9_-]", "", str(code))[:80])

    def queue_turn(self, call: Call, turn: Turn):
        if call.closing or turn.queued or turn.ignored or not turn.ready.is_set() or not turn.stopped:
            return
        turn.queued = True
        call.jobs[turn.id] = asyncio.create_task(self.respond_turn(call, turn.id))

    @staticmethod
    def is_echo(call: Call, turn: Turn):
        text = re.sub(r"[^a-z0-9 ]", "", normalize(turn.transcript))
        previous = re.sub(r"[^a-z0-9 ]", "", normalize(call.last_assistant_text))
        if not turn.during_playback or len(text) < 25 or len(text.split()) < 5 or not previous:
            return False
        return SequenceMatcher(None, text, previous).ratio() > 0.9 or (text in previous and len(text) >= len(previous) * 0.75)

    @staticmethod
    def social_reply(text: str):
        value = re.sub(r"[^a-z0-9 ]", "", normalize(text))
        value = re.sub(r"\s+", " ", value).strip()
        if re.fullmatch(r"(?:(?:oi|ola|bom dia|boa tarde|boa noite) )?(?:tudo bem|tudo bom|como vai|como voce esta|voce esta bem)", value):
            return "Tudo bem, sim! Como posso te ajudar hoje?"
        if re.fullmatch(r"(?:tudo bem (?:sim|tambem)|estou bem(?: obrigado| obrigada)?|bem obrigado|bem obrigada)", value):
            return "Que bom! O que você gostaria de pedir ou reservar?"
        return None

    async def respond_turn(self, call: Call, turn_id: str):
        try:
            turn = call.turns.get(turn_id)
            if not turn or turn.handled or turn.ignored:
                return
            turn.handled = True
            await asyncio.wait_for(turn.ready.wait(), timeout=10)
            if call.closing or call.latest_turn != turn_id or call.speech_active:
                return
            quote_to_read = None
            if not turn.transcript:
                text = "Não consegui entender essa parte. Pode repetir, por favor?"
            else:
                text = self.social_reply(turn.transcript)
                if text is None:
                    history = [m.model_dump() for m in call.context.messages]
                    for item in call.transcripts:
                        if item["author"] in ("customer", "ai"):
                            history.append({"id": item["id"], "author": item["author"], "text": item["text"]})
                        if item["id"] == turn_id:
                            break
                    request_id = f"call-{call.id}-{turn.id}"[:120]
                    history = [item for item in history if item["id"] != turn_id]
                    history.append({"id": request_id, "author": "customer", "text": turn.transcript})
                    request = ChatRequest(requestId=request_id, confirmationId=turn.quote_id, conversation=Conversation(id=call.context.id, name=call.context.name, store=call.context.store, status="ai", messages=history[-30:], customerId=call.context.customerId))
                    result = await self.executor(request)
                    if call.closing or call.latest_turn != turn_id:
                        return
                    call.business = result
                    call.heard_quote = None
                    text = result.text
                    quote_to_read = result.pendingAction.id if result.pendingAction else None
            if call.closing or not call.websocket:
                return
            async with call.response_lock:
                await asyncio.wait_for(call.response_idle.wait(), timeout=10)
                if call.closing or call.speech_active or call.latest_turn != turn_id or turn_id in call.requested_replies:
                    return
                call.requested_replies.add(turn_id)
                call.heard_quote = None
                call.speaking_quote = quote_to_read
                call.response_idle.clear()
                await call.websocket.send(json.dumps({"type": "response.create", "response": {
                    "conversation": "none", "output_modalities": ["audio"], "tool_choice": "none",
                    "metadata": {"purpose": "reply", "turn_id": turn_id},
                    "instructions": "Fale em português brasileiro. Leia o texto fornecido uma única vez, de forma natural. Não leia emojis. Não acrescente frases, não repita e pare ao terminar.",
                    "input": [{"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Texto validado para falar uma única vez:\n" + text}]}],
                }}, ensure_ascii=False))
        except asyncio.CancelledError:
            raise
        except Exception as error:
            log.warning("realtime_turn_error type=%s", type(error).__name__)
            if not call.closing:
                await self.end(call, "error")


async def execute_realtime_turn(request):
    # Import tardio evita dependência circular no registro das rotas FastAPI.
    from app import conversation_guard, execute
    async with conversation_guard(request.conversation.id):
        return await execute(request)


manager = CallManager(execute_realtime_turn)
