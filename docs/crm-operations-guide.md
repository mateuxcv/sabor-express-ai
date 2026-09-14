# CRM operations guide

This guide describes a reusable operating model for Sabor Express. Pipeline, stage, owner, product and source IDs must come from **your own connected RD Station CRM account**. Local account-specific setup notes are not distributed with the repository.

## 1. Configure ownership and routing

1. Register an application for the **RD Station CRM** product and configure the OAuth callback described in [the integration guide](rd-station-crm.md).
2. Connect the account through `/crm`.
3. Select a pipeline, entry stage and responsible user for each restaurant location. The application validates the identifiers against the connected account.
4. Identify an authorized test customer in `/whatsapp` before validating synchronization.

A pipeline per location is a useful demonstration layout:

| Application location | Suggested pipeline | Suggested entry stage |
| --- | --- | --- |
| São Paulo · Pinheiros | Sabor Express — Pinheiros | Confirmed |
| São Paulo · Vila Mariana | Sabor Express — Vila Mariana | Confirmed |
| São Paulo · Moema | Sabor Express — Moema | Confirmed |

The current adapter uses one configured entry stage for confirmed orders and bookings within a location. Operation type is identified in the deal title and notes. Reauthorize and review mappings when changing CRM accounts.

## 2. Suggested operating stages

| Stage | Team responsibility | Exit condition |
| --- | --- | --- |
| Initial service | Identify the customer, location and request. | Minimum context is available. |
| Awaiting confirmation | Review the pending summary and outstanding details. | Explicit customer confirmation is received. |
| Confirmed | Verify the operation code, contact and synchronized details. | An operator accepts execution. |
| In progress | Follow preparation, pickup, delivery or the scheduled visit. | The operation is fulfilled or an exception is identified. |
| Aftercare | Resolve outstanding issues and follow up on satisfaction. | The outcome and next actions are recorded. |

The adapter creates deals with `ongoing` status. A pipeline stage called Confirmed represents operational confirmation, not recognized revenue or payment settlement.

For orders, mark a deal won only after the team validates fulfillment and the financial outcome. Keep bookings separate from order revenue. For losses, select an appropriate reason and record context. An outstanding commitment should have a task, owner and due date rather than only a note.

## 3. Catalog, source and loss reasons

The authoritative demonstration catalog is [`src/lib/catalog.json`](../src/lib/catalog.json). The adapter sends a one-time order value and contextual notes; it does **not** attach remote catalog products to deals. Adding products manually requires reviewing the final total to avoid counting the value twice.

Suggested acquisition sources are messaging and voice conversations. The current adapter does not assign `source_id`; source attribution is an operator responsibility. A later voice summary does not establish that a sale originated through voice.

Suggested loss reasons:

- Customer cancellation.
- Product unavailable and no accepted alternative.
- No suitable booking availability.
- No-show verified by the location.
- No response after documented follow-up.

Creating or changing these records in the CRM does not change application stock, bookings or catalog prices.

## 4. Daily workflow

### Opening

Review connection status, location mappings, queued events, overdue tasks and operations awaiting action. Assign ownership before making customer commitments.

### After an operation is confirmed

1. Wait for synchronization and open the remote record from the application.
2. Verify the location, customer, operation code and structured notes.
3. Check the order amount, or verify that a booking has no presumed sales revenue.
4. Assign the next task and move the deal when execution begins.
5. Keep the customer context attached when handing the conversation to another operator.

### Closing

Reconcile completed operations, record cancellation reasons, close fulfilled tasks and assign remaining work to the next shift. Check the remote record before retrying an event whose previous write had an uncertain outcome.

## 5. First-operation acceptance checklist

- Use an authorized test identity and a configured location.
- Confirm an order or booking through the normal CrewAI flow.
- Verify the outbox event and remote deal.
- Check pipeline, stage, owner, customer, operation code and notes.
- Verify that retries reconcile the existing record rather than create a duplicate.
- Validate the call summary, satisfaction response and high-priority alert separately if those features are enabled.
- Repeat for each location before treating routing as accepted end to end.

These checks establish integration behavior; they do not turn the simulated WhatsApp channel or restaurant systems into production integrations. See [RD Station CRM v2](rd-station-crm.md), [CSAT](csat.md) and [sentiment monitoring](sentimento.md) for implementation details.
