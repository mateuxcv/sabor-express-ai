import hmac
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from crm import CustomerInput, MappingInput, CrmError, get_crm
from csat import SurveyInput, AnswerInput, issue_survey, answer_survey, get_survey, metrics
from models import ChatRequest
from sentiment import AlertAction, analyze, change_alert, dashboard, latest_alert


def authenticate(authorization: str = Header(default="")):
    token = os.getenv("CREWAI_SERVICE_TOKEN")
    if token and not hmac.compare_digest(authorization, f"Bearer {token}"):
        raise HTTPException(401, "unauthorized")


router = APIRouter(prefix="/crm", dependencies=[Depends(authenticate)])


@router.get("/sentiment")
async def sentiment_status(conversation_id: str | None = None, store: str | None = None):
    if conversation_id is not None:
        if not 1 <= len(conversation_id) <= 120: raise HTTPException(400, "invalid_conversation")
        return {"alert": latest_alert(get_crm().systems, conversation_id)}
    return dashboard(get_crm().systems, store)


@router.post("/sentiment/analyze")
async def sentiment_analyze(payload: ChatRequest):
    return await analyze(get_crm().systems, payload)


@router.post("/sentiment/action")
async def sentiment_action(payload: AlertAction):
    return await change_alert(get_crm().systems, payload)


@router.get("/csat")
async def csat_status(conversation_id: str | None = None, store: str | None = None):
    if conversation_id is not None:
        if not 1 <= len(conversation_id) <= 120: raise HTTPException(400, "invalid_conversation")
        return {"survey": get_survey(get_crm().systems, conversation_id)}
    return metrics(get_crm().systems, store)


@router.post("/csat/issue")
async def csat_issue(payload: SurveyInput):
    return issue_survey(get_crm().systems, payload)


@router.post("/csat/answer")
async def csat_answer(payload: AnswerInput):
    return answer_survey(get_crm().systems, payload)


class OAuthStart(BaseModel):
    state: str = Field(pattern=r"^[a-f0-9]{64}$")


class OAuthExchange(BaseModel):
    code: str = Field(min_length=1, max_length=2000)


@router.get("/status")
async def status(conversation_id: str | None = None):
    if conversation_id and len(conversation_id) > 120: raise HTTPException(400, "invalid_conversation")
    return get_crm().status(conversation_id)


@router.post("/oauth/start")
async def oauth_start(payload: OAuthStart):
    return {"url": get_crm().authorization_url(payload.state)}


@router.post("/oauth/exchange")
async def oauth_exchange(payload: OAuthExchange):
    return await get_crm().exchange(payload.code)


@router.post("/disconnect")
async def disconnect():
    return get_crm().disconnect()


@router.get("/options")
async def options(pipeline_id: str | None = None):
    return await get_crm().options(pipeline_id)


@router.put("/mapping")
async def mapping(payload: MappingInput):
    return await get_crm().save_mapping(payload)


@router.put("/customer")
async def customer(payload: CustomerInput):
    from realtime import manager
    if payload.conversationId in manager.occupied: raise CrmError("active_call", "Encerre a ligação antes de alterar o cliente desta conversa.", 409)
    return get_crm().save_customer(payload)


@router.post("/conversations/{conversation_id}/enqueue")
async def enqueue(conversation_id: str):
    if len(conversation_id) > 120: raise HTTPException(400, "invalid_conversation")
    return get_crm().enqueue_conversation(conversation_id)


@router.post("/events/{event_id}/retry")
async def retry(event_id: str):
    if len(event_id) != 64: raise HTTPException(400, "invalid_event")
    return get_crm().retry(event_id)
