import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--mute-audio"] }, permissions: ["microphone"] });
const id = "10000000-0000-4000-8000-000000000001";
const sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";

async function mockCall(page: Page, context: BrowserContext, rejectConnection = false) {
  await page.addInitScript(() => {
    const sentEvents: string[] = [];
    Object.defineProperty(window, "callSentEvents", { value: sentEvents });
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as typeof window & { callTracks: MediaStreamTrack[] }).callTracks = stream.getTracks();
      return stream;
    };
    class Peer {
      connectionState = "new";
      onconnectionstatechange: (() => void) | null = null;
      ontrack = null;
      channel = { onopen: null as (() => void) | null, onmessage: null, onclose: null as (() => void) | null, send(event: string) { sentEvents.push(event); }, close: () => this.channel.onclose?.() };
      addTrack() {}
      createDataChannel() { return this.channel; }
      async createOffer() { return { type: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" }; }
      async setLocalDescription() {}
      async setRemoteDescription() { this.connectionState = "connected"; this.onconnectionstatechange?.(); this.channel.onopen?.(); this.channel.onopen?.(); }
      close() { this.connectionState = "closed"; this.onconnectionstatechange?.(); }
    }
    Object.defineProperty(window, "RTCPeerConnection", { value: Peer });
  });
  const actions = { connected: 0, ended: 0, chatPosts: 0 };
  let ended = false;
  let reason = "ended";
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "POST") actions.chatPosts++;
    return route.fulfill({ json: { ready: true, provider: "crewai", label: "Teste" } });
  });
  await context.route("**/api/realtime**", (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/realtime") {
      if (method === "GET") return route.fulfill({ json: { ready: true, busy: false, provider: "azure", model: "gpt-realtime-2.1", maxSeconds: 300 } });
      if (rejectConnection) return route.fulfill({ status: 503, json: { error: "Deployment Realtime não encontrado." } });
      actions.connected++;
      return route.fulfill({ json: { id, token: "local-test-capability-123456", answer: sdp, maxSeconds: 300 } });
    }
    expect(route.request().headers()["x-call-token"]).toBe("local-test-capability-123456");
    if (method === "DELETE") { actions.ended++; ended = true; reason = url.searchParams.get("reason") || "ended"; }
    return route.fulfill({ json: { id, status: ended ? (reason === "human" ? "transferred" : "ended") : "active", startedAt: new Date().toISOString(), durationSeconds: 4, reason: ended ? reason : null, business: null, transcripts: [
      { id: "voice-user", author: "customer", text: "Quais são os horários da loja?", time: "12:30" },
      { id: "voice-ai", author: "ai", text: "A loja funciona das 11h às 23h.", time: "12:30" },
    ] } });
  });
  await page.goto("/whatsapp");
  return actions;
}

for (const [width, height] of [[1440, 1000], [390, 844], [844, 390]]) {
  test(`ligação com controles e histórico em ${width}x${height}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height });
    const actions = await mockCall(page, context);
    await page.getByRole("button", { name: "Iniciar ligação com a IA" }).click();
    await expect(page.locator(".realtime-call.active")).toBeVisible();
    expect(await page.evaluate(() => (window as typeof window & { callSentEvents: string[] }).callSentEvents.map((value) => JSON.parse(value)).filter((event) => event.response?.metadata?.purpose === "greeting").length)).toBe(1);
    await page.getByRole("button", { name: "Silenciar microfone" }).click();
    expect(await page.evaluate(() => (window as typeof window & { callTracks: MediaStreamTrack[] }).callTracks.every((track) => !track.enabled))).toBe(true);
    await page.getByRole("button", { name: "Ativar microfone" }).click();
    await page.getByRole("button", { name: "Silenciar som da ligação" }).click();
    expect(await page.locator(".realtime-remote-audio").evaluate((audio: HTMLAudioElement) => audio.muted)).toBe(true);
    await expect(page.getByRole("button", { name: "Encerrar ligação", exact: true })).toBeInViewport({ ratio: 1 });
    expect(await page.locator(".realtime-call").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole("dialog").screenshot({ path: testInfo.outputPath("call.png") });
    const inbox = await context.newPage();
    await inbox.goto("/dashboard");
    await expect(inbox.locator(".chat-panel")).toContainText("A loja funciona das 11h às 23h.");
    expect(actions.chatPosts).toBe(0);
    await page.getByRole("button", { name: "Encerrar ligação", exact: true }).click();
    await expect(page.locator(".realtime-call.ended")).toBeVisible();
    await expect.poll(() => actions.ended).toBe(1);
    expect(await page.evaluate(() => (window as typeof window & { callTracks: MediaStreamTrack[] }).callTracks.every((track) => track.readyState === "ended"))).toBe(true);
    await page.getByRole("button", { name: "Voltar para a conversa" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".customer-thread")).toContainText("Ligação encerrada");
    await expect(page.getByRole("button", { name: "Iniciar ligação com a IA" })).toBeEnabled();
    expect(actions.connected).toBe(1);
  });
}

test("falha de conexão fecha microfone e permite tentar novamente", async ({ page, context }) => {
  const actions = await mockCall(page, context, true);
  await page.getByRole("button", { name: "Iniciar ligação com a IA" }).click();
  await expect(page.locator(".realtime-call.error")).toContainText("Deployment Realtime não encontrado");
  expect(await page.evaluate(() => (window as typeof window & { callTracks: MediaStreamTrack[] }).callTracks.every((track) => track.readyState === "ended"))).toBe(true);
  await page.getByRole("button", { name: "Voltar para a conversa" }).click();
  await expect(page.getByRole("button", { name: "Iniciar ligação com a IA" })).toBeEnabled();
  expect(actions.chatPosts).toBe(0);
});

test("assumir no inbox encerra a ligação e preserva o contexto", async ({ page, context }) => {
  const actions = await mockCall(page, context);
  await page.getByRole("button", { name: "Iniciar ligação com a IA" }).click();
  await expect(page.locator(".realtime-call.active")).toBeVisible();
  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await inbox.getByRole("button", { name: "Assumir", exact: true }).click();
  await expect(page.locator(".realtime-call.ended")).toContainText("A equipe continuará pelo chat");
  await expect.poll(() => actions.ended).toBe(1);
  await expect(inbox.locator(".chat-panel")).toContainText("A loja funciona das 11h às 23h.");
});

test("resolver a conversa encerra sem informar uma transferência humana", async ({ page, context }) => {
  const { mockCsat } = await import("./csat-fixture");
  await mockCsat(context);
  const actions = await mockCall(page, context);
  await page.getByRole("button", { name: "Iniciar ligação com a IA" }).click();
  await expect(page.locator(".realtime-call.active")).toBeVisible();
  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await inbox.getByRole("button", { name: "Resolver", exact: true }).click();
  await expect(page.locator(".call-state")).toHaveText("Ligação encerrada");
  await expect.poll(() => actions.ended).toBe(1);
});
