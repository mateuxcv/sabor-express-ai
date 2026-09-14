"""CSAT por conversa: resposta e outbox na mesma transação, métricas persistidas."""
import time
from uuid import uuid4

from pydantic import BaseModel, Field

from crm import CrmError
from crm_storage import enqueue_event
from systems import CATALOG


class SurveyInput(BaseModel):
    conversationId: str = Field(min_length=1, max_length=120)
    store: str = Field(min_length=1, max_length=100)
    customerName: str = Field(min_length=1, max_length=100)


class AnswerInput(BaseModel):
    surveyId: str = Field(pattern=r"^[a-f0-9-]{36}$")
    conversationId: str = Field(min_length=1, max_length=120)
    score: int = Field(strict=True, ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


def survey_dict(row):
    deal_id = row["deal_id"] if "deal_id" in row.keys() else None
    return {"id": row["id"], "conversationId": row["conversation_id"], "store": row["store"],
            "customerName": row["customer_name"], "createdAt": row["created_at"],
            "score": row["score"], "comment": row["comment"], "answeredAt": row["answered_at"],
            "crmStatus": row["crm_status"] if "crm_status" in row.keys() else None,
            "crmError": row["crm_error"] if "crm_error" in row.keys() else None,
            "dealUrl": f"https://crm.rdstation.com/app/deals/{deal_id}" if deal_id else None}


SURVEY_QUERY = """SELECT s.*, e.status AS crm_status, e.last_error AS crm_error,
    json_extract(e.checkpoint, '$.deal_id') AS deal_id
    FROM csat_surveys s LEFT JOIN crm_events e ON e.id=s.event_id"""


def get_survey(systems, conversation_id):
    with systems.connection() as db:
        row = db.execute(SURVEY_QUERY + " WHERE s.conversation_id=?", (conversation_id,)).fetchone()
    return survey_dict(row) if row else None


def issue_survey(systems, data: SurveyInput):
    if data.store not in [store["name"] for store in CATALOG["stores"]]:
        raise CrmError("invalid_store", "Unidade inválida.")
    with systems.connection() as db:
        db.execute("BEGIN IMMEDIATE")
        # Uma pesquisa por conversa, inclusive após reabertura ou repetição da requisição.
        operation = db.execute("""SELECT aggregate_id FROM crm_events WHERE conversation_id=?
            AND event_type IN ('order.confirmed','reservation.confirmed') ORDER BY created_at DESC LIMIT 1""",
            (data.conversationId,)).fetchone()
        db.execute("""INSERT OR IGNORE INTO csat_surveys
            (id, conversation_id, store, customer_name, operation_id, created_at) VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid4()), data.conversationId, data.store, data.customerName.strip(), operation[0] if operation else None, time.time()))
    return get_survey(systems, data.conversationId)


def answer_survey(systems, data: AnswerInput):
    comment = data.comment.strip()
    with systems.connection() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM csat_surveys WHERE id=? AND conversation_id=?", (data.surveyId, data.conversationId)).fetchone()
        if not row: raise CrmError("survey_not_found", "Pesquisa não encontrada para esta conversa.", 404)
        if row["answered_at"] is not None:
            if row["score"] != data.score or row["comment"] != comment:
                raise CrmError("survey_answered", "Esta pesquisa já foi respondida. Atualize a conversa para ver a avaliação salva.", 409)
        else:
            answered_at = time.time()
            event_id = enqueue_event(db, "csat.answered", "CSAT-" + row["id"], data.conversationId, {
                "store": row["store"], "score": data.score, "comment": comment,
                "survey_id": row["id"], "operation_id": row["operation_id"],
                "closed_at": row["created_at"], "answered_at": answered_at,
            })
            db.execute("UPDATE csat_surveys SET score=?, comment=?, answered_at=?, event_id=? WHERE id=?",
                       (data.score, comment, answered_at, event_id, row["id"]))
    return get_survey(systems, data.conversationId)


def metrics(systems, store=None):
    if store and store not in [item["name"] for item in CATALOG["stores"]]:
        raise CrmError("invalid_store", "Unidade inválida.")
    where, args = (" WHERE store=?", (store,)) if store else ("", ())
    with systems.connection() as db:
        totals = db.execute("SELECT COUNT(*) AS sent, COUNT(score) AS answered, AVG(score) AS average, SUM(CASE WHEN score>=4 THEN 1 ELSE 0 END) AS satisfied FROM csat_surveys" + where, args).fetchone()
        distribution = db.execute("SELECT score, COUNT(*) AS count FROM csat_surveys" + (where + " AND" if store else " WHERE") + " score IS NOT NULL GROUP BY score", args).fetchall()
        recent = db.execute(SURVEY_QUERY + (" WHERE s.store=?" if store else "") + " ORDER BY COALESCE(s.answered_at,s.created_at) DESC LIMIT 50", args).fetchall()
    answered, sent = totals["answered"], totals["sent"]
    return {"sent": sent, "answered": answered, "pending": sent - answered,
            "average": round(totals["average"], 2) if answered else None,
            "csatPercent": round(100 * totals["satisfied"] / answered, 1) if answered else None,
            "responseRate": round(100 * answered / sent, 1) if sent else None,
            "distribution": [{"score": score, "count": next((r["count"] for r in distribution if r["score"] == score), 0)} for score in range(1, 6)],
            "recent": [survey_dict(row) for row in recent]}
