import { test, expect } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });

test("WhatsApp confirma o resumo atual e mostra o registro e as validações no inbox", async ({ page, context }) => {
  const requests: Array<{ confirmationId?: string }> = [];
  const booking = { id: "RS-UI-TEST", kind: "birthday", date: "2026-09-14", time: "19:00", guests: 15, stage: "awaiting_confirmation", attempts: 0 };
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { provider: "crewai", ready: true, label: "CrewAI · teste controlado" } });
    const body = route.request().postDataJSON();
    requests.push(body);
    const confirmed = body.confirmationId === booking.id;
    return route.fulfill({ json: {
      text: confirmed ? `Reserva #${booking.id} confirmada na agenda simulada!` : "Agenda consultada: amanhã, 19h, 15 pessoas. Posso confirmar?",
      status: "ai", topic: confirmed ? "Reserva confirmada" : "Confirmar reserva",
      booking: { ...booking, stage: confirmed ? "confirmed" : "awaiting_confirmation" },
      ...(confirmed ? {} : { pendingAction: { kind: "booking", id: booking.id } }),
      routing: { agent: "birthdays", source: "crewai", reason: "Teste controlado", summary: "Aniversário para 15 pessoas", missingFields: [], checks: confirmed ? ["Capacidade revalidada", "Reserva gravada no sistema simulado"] : ["Agenda simulada consultada"] },
    } });
  });
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Planejar aniversário" }).click();
  await expect(page.getByRole("button", { name: "Confirmar reserva", exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole("textbox", { name: "Mensagem do cliente" }).fill("sim");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await expect(page.locator(".message-bubble").last()).toContainText("confirmada na agenda simulada");
  expect(requests[1].confirmationId).toBe("RS-UI-TEST");
  await expect(page.getByRole("button", { name: "Confirmar reserva", exact: true })).toHaveCount(0);
  await expect(page.locator(".human-handoff")).toHaveCount(0);
  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await expect(inbox.locator(".booking-details")).toContainText("Confirmada na agenda simulada");
  await expect(inbox.locator(".booking-details")).toContainText("14/09/2026");
  await expect(inbox.locator(".booking-details")).toContainText("RS-UI-TEST");
  await expect(inbox.getByLabel("Validações do atendimento")).toContainText("Capacidade revalidada");
});

test("horário alternativo gera um novo resumo sem confirmar automaticamente", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/assistant", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { provider: "crewai", ready: true, label: "Teste controlado" } });
    calls++;
    return route.fulfill({ json: {
      text: calls === 1 ? "Esse horário está cheio. Quer 21:00?" : "Disponível às 21:00. Posso confirmar?", status: "ai",
      booking: { kind: "reservation", date: "2026-09-19", time: calls === 1 ? "19:00" : "21:00", guests: 20, stage: calls === 1 ? "unavailable" : "awaiting_confirmation", attempts: 0, suggestedTimes: calls === 1 ? ["21:00"] : [], ...(calls === 1 ? {} : { id: "RS-ALT" }) },
      ...(calls === 1 ? {} : { pendingAction: { kind: "booking", id: "RS-ALT" } }),
      routing: { agent: "reservations", source: "crewai", reason: "Agenda consultada", summary: "Solicitação", missingFields: [] },
    } });
  });
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Reservar uma mesa" }).click();
  await page.getByRole("button", { name: "21:00", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar reserva", exact: true })).toBeVisible();
  expect(calls).toBe(2);
  await expect(page.locator(".message-bubble").last()).toContainText("Posso confirmar?");
});
