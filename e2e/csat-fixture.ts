import type { BrowserContext } from "@playwright/test";
import type { CsatSurvey } from "../src/lib/csat-contract";

export async function mockCsat(context: BrowserContext) {
  const surveys = new Map<string, CsatSurvey>();
  const actions: Array<Record<string, unknown>> = [];
  const behavior = { failIssue: false, failAnswer: false };
  await context.route("**/api/csat**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "GET") {
      const conversationId = url.searchParams.get("conversationId");
      if (conversationId) return route.fulfill({ json: { survey: surveys.get(conversationId) || null } });
      const rows = [...surveys.values()].filter((row) => !url.searchParams.get("store") || row.store === url.searchParams.get("store"));
      const answered = rows.filter((row) => row.score !== null);
      return route.fulfill({ json: {
        sent: rows.length, answered: answered.length, pending: rows.length - answered.length,
        average: answered.length ? answered.reduce((sum, row) => sum + row.score!, 0) / answered.length : null,
        csatPercent: answered.length ? 100 * answered.filter((row) => row.score! >= 4).length / answered.length : null,
        responseRate: rows.length ? 100 * answered.length / rows.length : null,
        distribution: [1, 2, 3, 4, 5].map((score) => ({ score, count: answered.filter((row) => row.score === score).length })), recent: rows,
      } });
    }
    const body = route.request().postDataJSON(); actions.push(body);
    if ((body.action === "issue" && behavior.failIssue) || (body.action === "answer" && behavior.failAnswer)) return route.fulfill({ status: 503, json: { error: "Serviço temporariamente indisponível." } });
    if (body.action === "issue") {
      if (!surveys.has(body.conversationId)) surveys.set(body.conversationId, {
        id: `10000000-0000-4000-8000-${String(surveys.size + 1).padStart(12, "0")}`, conversationId: body.conversationId, customerName: body.customerName,
        store: body.store, createdAt: Date.now() / 1000, score: null, comment: "", answeredAt: null, crmStatus: null, crmError: null, dealUrl: null,
      });
    } else {
      const survey = surveys.get(body.conversationId)!;
      if (survey.score !== null && (survey.score !== body.score || survey.comment !== body.comment)) return route.fulfill({ status: 409, json: { error: "Pesquisa já respondida." } });
      Object.assign(survey, { score: body.score, comment: body.comment, answeredAt: Date.now() / 1000, crmStatus: "synced", dealUrl: `https://crm.rdstation.com/app/deals/${"4".repeat(24)}` });
    }
    return route.fulfill({ json: surveys.get(body.conversationId) });
  });
  return { surveys, actions, behavior };
}
