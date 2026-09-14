import type { BrowserContext } from "@playwright/test";
import type { SentimentAlert } from "../src/lib/sentiment-contract";

export async function mockSentiment(context: BrowserContext, detect = false) {
  const alerts = new Map<string, SentimentAlert>();
  const requests: Array<{ action: string; conversation?: { id: string; messages: Array<{ text: string }> } }> = [];
  const behavior = { fail: false, hold: null as Promise<void> | null };
  const neutral = { level: "none", category: "other", reason: "Sem sinal", evidence: "", confidence: 0, source: "rules" };
  await context.route("**/api/sentiment**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      const conversationId = new URL(req.url()).searchParams.get("conversationId");
      return route.fulfill({ json: conversationId ? { alert: alerts.get(conversationId) || null } : { alerts: [...alerts.values()].filter((a) => a.status !== "resolved") } });
    }
    const data = req.postDataJSON();
    requests.push(data);
    if (behavior.hold) await behavior.hold;
    if (behavior.fail) return route.fulfill({ status: 503, json: { error: "Monitor indisponível" } });
    if (data.action === "analyze") {
      const c = data.conversation;
      const text = c.messages.at(-1).text;
      if (detect && /entend|expliquei|humano/i.test(text)) {
        const previous = alerts.get(c.id);
        const now = Date.now() / 1000;
        const alert: SentimentAlert = { id: previous?.id || "11111111-1111-4111-8111-111111111111", conversationId: c.id, customerName: c.name, store: c.store,
          level: "high", category: /humano/i.test(text) ? "human_request" : "automation", reason: "Cliente demonstra dificuldade com a automação", evidence: text, confidence: 1, source: "rules",
          status: previous?.status || "open", createdAt: previous?.createdAt || now, updatedAt: now, waitingSince: previous?.waitingSince || now, acknowledgedAt: previous?.acknowledgedAt || null, resolvedAt: null, ownerName: previous?.ownerName || null,
          crmStatus: "synced", crmError: null, taskId: "900000000000000000000001", dealUrl: "https://crm.rdstation.com/app/deals/100000000000000000000001" };
        alerts.set(c.id, alert);
        return route.fulfill({ json: { assessment: alert, alert } });
      }
      return route.fulfill({ json: { assessment: neutral, alert: alerts.get(c.id) || null } });
    }
    const alert = [...alerts.values()].find((a) => a.id === data.alertId)!;
    alert.status = data.action === "resolve" ? "resolved" : "acknowledged";
    alert.updatedAt = Date.now() / 1000;
    if (alert.status === "acknowledged") { alert.acknowledgedAt = alert.updatedAt; alert.ownerName = "Ana Carvalho"; }
    else alert.resolvedAt = alert.updatedAt;
    return route.fulfill({ json: alert });
  });
  return { alerts, requests, behavior };
}
