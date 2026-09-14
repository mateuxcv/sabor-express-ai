import asyncio
import hashlib
import hmac
import logging
import os
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Configuração única na raiz, independente da pasta usada para iniciar o Python.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from flow import ReceptionFlow
from models import ChatReply, ChatRequest
from policy import handoff
from llm_config import configuration_status
from realtime import CallStart, manager
from realtime_config import RealtimeError, realtime_status
from crm import CrmError, crm_worker, get_crm
from sentiment import analyze
from crm_routes import router as crm_router
from suggestions import SuggestionError, SuggestionRequest, SuggestionResult, generate_suggestions
from systems import get_systems

@asynccontextmanager
async def lifespan(application):
    worker = asyncio.create_task(crm_worker())
    try:
        yield
    finally:
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)


app = FastAPI(title="Sabor Express · CrewAI Concierge", version="0.1.0", lifespan=lifespan)
app.include_router(crm_router)
logger = logging.getLogger("sabor.concierge")
cache: OrderedDict[str, tuple[float, ChatReply]] = OrderedDict()
inflight: dict[str, asyncio.Task] = {}
LIMIT = 64
conversation_locks: dict[str, tuple[asyncio.Lock, int]] = {}


@app.exception_handler(CrmError)
async def crm_error_handler(request: Request, error: CrmError):
    return JSONResponse({"error": error.message, "code": error.code}, status_code=error.status)


@asynccontextmanager
async def conversation_guard(conversation_id: str):
    lock, users = conversation_locks.get(conversation_id, (asyncio.Lock(), 0))
    conversation_locks[conversation_id] = (lock, users + 1)
    try:
        async with lock:
            yield
    finally:
        _, users = conversation_locks[conversation_id]
        if users == 1:
            conversation_locks.pop(conversation_id)
        else:
            conversation_locks[conversation_id] = (lock, users - 1)


@app.get("/health")
async def health():
    return configuration_status()


async def execute(request: ChatRequest) -> ChatReply:
    try:
        async with asyncio.timeout(30):
            result = await analyze(get_crm().systems, request)
            alert = result["alert"]
            if alert and alert["level"] == "high" and alert["status"] != "resolved":
                return handoff(alert["reason"])
            flow = ReceptionFlow(request)
            result = await flow.kickoff_async()
            return ChatReply.model_validate(result)
    except Exception as error:
        # Não registrar mensagens, credenciais ou o conteúdo bruto do provedor.
        logger.warning("assistant_fallback request=%s error=%s", request.requestId, type(error).__name__)
        return handoff("Serviço de IA indisponível ou resposta inválida. Atendimento encaminhado.", source="fallback")


async def run_and_cache(key: str, request: ChatRequest):
    try:
        async with conversation_guard(request.conversation.id):
            result = await execute(request)
        cache[key] = (time.monotonic(), result)
        while len(cache) > 256:
            cache.popitem(last=False)
        return result
    finally:
        inflight.pop(key, None)


@app.post("/chat", response_model=ChatReply, response_model_exclude_none=True)
async def chat(request: ChatRequest, authorization: str = Header(default="")):
    token = os.getenv("CREWAI_SERVICE_TOKEN")
    if token and not hmac.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(401, "unauthorized")
    last = request.conversation.messages[-1]
    if last.author != "customer" or last.id != request.requestId:
        raise HTTPException(422, "requestId deve identificar a última mensagem do cliente")
    key = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    cached = cache.get(key)
    if cached and time.monotonic() - cached[0] < 300:
        return cached[1]
    if key not in inflight:
        if len(inflight) >= LIMIT:
            return handoff("Capacidade da recepção atingida. Encaminhada à equipe.", source="fallback")
        inflight[key] = asyncio.create_task(run_and_cache(key, request))
    return await asyncio.shield(inflight[key])


def check_realtime_service(authorization: str):
    token = os.getenv("CREWAI_SERVICE_TOKEN")
    if token and not hmac.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(401, "unauthorized")


@app.post("/suggestions", response_model=SuggestionResult)
async def suggest_reply(payload: SuggestionRequest, authorization: str = Header(default="")):
    check_realtime_service(authorization)
    try:
        return await generate_suggestions(payload, get_systems())
    except SuggestionError as error:
        return JSONResponse({"error": error.message, "code": error.code}, status_code=error.status)


@app.exception_handler(RealtimeError)
async def realtime_error_handler(request: Request, error: RealtimeError):
    return JSONResponse({"error": error.message, "code": error.code}, status_code=error.status)


@app.get("/realtime/config")
async def realtime_config(conversation_id: str = "", authorization: str = Header(default="")):
    check_realtime_service(authorization)
    return {**realtime_status(), "busy": conversation_id in manager.occupied}


@app.post("/realtime/connect")
async def realtime_connect(payload: CallStart, request: Request, authorization: str = Header(default="")):
    check_realtime_service(authorization)
    try:
        result = await manager.start(payload)
        if await request.is_disconnected():
            await manager.end(manager.get(result["id"], result["token"]), "cancelled")
            raise RealtimeError("cancelled", "Ligação cancelada.", 499)
        return result
    except RealtimeError:
        raise
    except Exception as error:
        logger.warning("realtime_connect_failed type=%s", type(error).__name__)
        raise RealtimeError("connection_failed", "Não foi possível conectar ao Azure Realtime. Tente novamente.") from None


@app.get("/realtime/calls/{call_id}")
async def realtime_call(call_id: str, x_call_token: str = Header(default=""), authorization: str = Header(default="")):
    check_realtime_service(authorization)
    return manager.get(call_id, x_call_token).snapshot()


@app.delete("/realtime/calls/{call_id}")
async def realtime_end(call_id: str, reason: str = "ended", x_call_token: str = Header(default=""), authorization: str = Header(default="")):
    check_realtime_service(authorization)
    if reason not in ("ended", "cancelled", "human", "disconnected", "time_limit"):
        raise HTTPException(400, "invalid_reason")
    return await manager.end(manager.get(call_id, x_call_token), reason)
