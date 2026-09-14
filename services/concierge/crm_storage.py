"""Persistência da integração CRM, compartilhada com pedidos e reservas."""
import hashlib
import json
import time


def initialize_crm(db):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS crm_connection (singleton INTEGER PRIMARY KEY CHECK(singleton=1),
            connection_id TEXT NOT NULL, tokens BLOB NOT NULL, expires_at REAL NOT NULL, connected_at TEXT NOT NULL, status TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS crm_customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS crm_conversation_customers (conversation_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS crm_mappings (connection_id TEXT NOT NULL, store TEXT NOT NULL, settings TEXT NOT NULL,
            PRIMARY KEY(connection_id, store));
        CREATE TABLE IF NOT EXISTS crm_contact_links (connection_id TEXT NOT NULL, customer_id TEXT NOT NULL, contact_id TEXT NOT NULL,
            PRIMARY KEY(connection_id, customer_id));
        CREATE TABLE IF NOT EXISTS crm_deal_links (connection_id TEXT NOT NULL, aggregate_id TEXT NOT NULL, conversation_id TEXT NOT NULL, deal_id TEXT NOT NULL,
            PRIMARY KEY(connection_id, aggregate_id));
        CREATE TABLE IF NOT EXISTS crm_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, aggregate_id TEXT NOT NULL,
            conversation_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL DEFAULT 0, lease_until REAL NOT NULL DEFAULT 0,
            connection_id TEXT, checkpoint TEXT NOT NULL DEFAULT '{}', last_error TEXT, error_code TEXT,
            created_at REAL NOT NULL, synced_at REAL);
        CREATE INDEX IF NOT EXISTS crm_events_delivery ON crm_events(status, next_attempt);
        CREATE INDEX IF NOT EXISTS crm_events_conversation ON crm_events(conversation_id, created_at);
        CREATE TABLE IF NOT EXISTS crm_call_summaries (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, summary TEXT NOT NULL, created_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS csat_surveys (id TEXT PRIMARY KEY, conversation_id TEXT UNIQUE NOT NULL,
            store TEXT NOT NULL, customer_name TEXT NOT NULL, operation_id TEXT,
            created_at REAL NOT NULL, score INTEGER CHECK(score BETWEEN 1 AND 5),
            comment TEXT NOT NULL DEFAULT '', answered_at REAL, event_id TEXT);
        CREATE TABLE IF NOT EXISTS sentiment_alerts (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
            store TEXT NOT NULL, customer_name TEXT NOT NULL, level TEXT NOT NULL, category TEXT NOT NULL,
            reason TEXT NOT NULL, evidence TEXT NOT NULL, source TEXT NOT NULL, confidence REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'open', created_at REAL NOT NULL, updated_at REAL NOT NULL,
            waiting_since REAL, acknowledged_at REAL, resolved_at REAL, owner_name TEXT, event_id TEXT);
        CREATE UNIQUE INDEX IF NOT EXISTS sentiment_active ON sentiment_alerts(conversation_id) WHERE status!='resolved';
        CREATE INDEX IF NOT EXISTS sentiment_history ON sentiment_alerts(conversation_id, created_at);
        CREATE TABLE IF NOT EXISTS sentiment_assessments (conversation_id TEXT NOT NULL, message_id TEXT NOT NULL,
            text_hash TEXT NOT NULL, assessment TEXT NOT NULL, created_at REAL NOT NULL,
            PRIMARY KEY(conversation_id, message_id));
    """)
    # Preserva vínculos da primeira versão, que sincronizava somente reservas.
    if "booking_id" in {row[1] for row in db.execute("PRAGMA table_info(crm_deal_links)")}:
        db.execute("ALTER TABLE crm_deal_links RENAME COLUMN booking_id TO aggregate_id")


def enqueue_event(db, event_type: str, aggregate_id: str, conversation_id: str, payload: dict):
    event_id = hashlib.sha256(f"{event_type}:{aggregate_id}".encode()).hexdigest()
    customer = db.execute("SELECT customer_id FROM crm_conversation_customers WHERE conversation_id=?", (conversation_id,)).fetchone()
    connection = db.execute("SELECT connection_id FROM crm_connection WHERE singleton=1", ()).fetchone()
    data = {**payload, "customer_id": customer[0] if customer else None}
    db.execute("""INSERT OR IGNORE INTO crm_events
        (id, event_type, aggregate_id, conversation_id, payload, connection_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)""", (event_id, event_type, aggregate_id, conversation_id, json.dumps(data, ensure_ascii=False), connection[0] if connection else None, time.time()))
    return event_id


def enqueue_booking(db, row):
    return enqueue_event(db, "reservation.confirmed", row["id"], row["conversation_id"], {
        "booking_id": row["id"], "store": row["store"], "date": row["day"],
        "time": f"{row['start'] // 60:02d}:{row['start'] % 60:02d}", "guests": row["guests"], "kind": row["kind"],
    })


def enqueue_order(db, row, product_name):
    return enqueue_event(db, "order.confirmed", row["id"], row["conversation_id"], {
        "order_id": row["id"], "store": row["store"], "product": product_name,
        "quantity": row["quantity"], "total": row["total"],
        "subtotal": row["subtotal"] if row["subtotal"] is not None else row["total"],
        "delivery_fee": row["delivery_fee"], "fulfillment": row["fulfillment"],
        "address": json.loads(row["address"]) if row["address"] else None,
    })
