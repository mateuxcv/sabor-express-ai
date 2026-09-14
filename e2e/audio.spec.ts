import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mockSentiment } from "./sentiment-fixture";
test.beforeEach(async ({ context }) => { await mockSentiment(context); });

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] }, permissions: ["microphone"] });

function wav(seconds = 1) {
  const sampleRate = 16000;
  const dataSize = Math.round(sampleRate * seconds) * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < dataSize / 2; i++) buffer.writeInt16LE(Math.round(Math.sin(i / sampleRate * 440 * 2 * Math.PI) * 3000), 44 + i * 2);
  return { name: "mensagem.wav", mimeType: "audio/wav", buffer };
}

async function attachAudio(page: Page) {
  const input = page.getByLabel("Selecionar arquivo de áudio");
  await expect(input).toBeEnabled();
  await input.setInputFiles(wav());
}

async function mockAssistant(context: BrowserContext) {
  const requests: Array<{ confirmationId?: string; conversation: { messages: Array<{ text: string; audio?: unknown }> } }> = [];
  await context.route("**/api/assistant", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ready: true, provider: "crewai", label: "Teste de áudio" } });
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: "Entendi sua mensagem de voz. Qual dia você prefere?", status: "ai", routing: { agent: "reservations", source: "crewai", reason: "Teste", summary: "Teste", missingFields: [] } } });
  });
  return requests;
}

test("anexa áudio, revisa texto, envia para IA e reproduz nas duas telas após recarregar", async ({ page, context }, testInfo) => {
  const requests = await mockAssistant(context);
  await context.route("**/api/audio/transcribe", (route) => route.fulfill({ json: route.request().method() === "GET" ? { ready: true } : { text: "Quero uma reserva para 4 pessoas.", provider: "azure", mimeType: "audio/wav" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/whatsapp");
  await attachAudio(page);
  await expect(page.getByRole("textbox", { name: "Transcrição do áudio" })).toHaveValue("Quero uma reserva para 4 pessoas.");
  await page.locator(".phone-frame").screenshot({ path: testInfo.outputPath("voice-preview.png"), caret: "initial" });
  expect(requests).toHaveLength(0);
  await page.getByRole("textbox", { name: "Transcrição do áudio" }).fill("Quero uma reserva para 5 pessoas.");
  await page.getByRole("button", { name: "Enviar áudio", exact: true }).click();
  await expect(page.locator(".voice-message")).toBeVisible();
  expect((await page.locator(".voice-message").boundingBox())!.width).toBeGreaterThan(200);
  await expect(page.locator(".message-bubble").last()).toContainText("Entendi sua mensagem de voz");
  expect(requests[0].conversation.messages.at(-1)?.text).toBe("Quero uma reserva para 5 pessoas.");
  expect(requests[0].conversation.messages.at(-1)?.audio).toBeUndefined();
  await expect(page.getByLabel("Reproduzir mensagem de voz")).toHaveAttribute("src", /^blob:/);
  expect(await page.getByLabel("Reproduzir mensagem de voz").evaluate(async (element: HTMLAudioElement) => { element.muted = true; await element.play(); const playing = !element.paused; element.pause(); return playing; })).toBe(true);
  await page.locator(".phone-frame").screenshot({ path: testInfo.outputPath("voice-message.png"), caret: "initial" });
  await page.reload();
  await expect(page.getByLabel("Reproduzir mensagem de voz")).toHaveAttribute("src", /^blob:/);
  await page.getByText("Transcrição revisada", { exact: true }).click();
  await expect(page.locator(".voice-transcript")).toContainText("5 pessoas");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const inbox = await context.newPage();
  await inbox.goto("/dashboard");
  await expect(inbox.getByLabel("Reproduzir mensagem de voz")).toHaveAttribute("src", /^blob:/);
  await expect(inbox.locator(".voice-transcript")).toContainText("5 pessoas");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Opções da conversa" }).click();
  await page.getByRole("button", { name: "Limpar histórico da sessão" }).click();
  await expect(page.locator(".voice-message")).toHaveCount(0);
  await expect(inbox.locator(".voice-message")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve) => {
    const open = indexedDB.open("sabor-express-audio-v1", 1);
    open.onsuccess = () => { const db = open.result; const request = db.transaction("clips").objectStore("clips").count(); request.onsuccess = () => { resolve(request.result); db.close(); }; };
  }))).toBe(0);
});

test("cancelar transcrição não envia mensagem atrasada à IA", async ({ page, context }) => {
  const requests = await mockAssistant(context);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/audio/transcribe", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ready: true } });
    await wait;
    await route.fulfill({ json: { text: "sim", provider: "azure", mimeType: "audio/wav" } });
  });
  await page.goto("/whatsapp");
  await attachAudio(page);
  await expect(page.getByRole("status")).toContainText("Transcrevendo");
  await page.getByRole("button", { name: "Descartar áudio" }).click();
  release();
  await expect(page.getByRole("button", { name: "Gravar áudio" })).toBeVisible();
  await expect(page.locator(".message-bubble")).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

for (const originalConfirmation of ["resumo-antigo", null]) {
  test(`áudio preserva o contexto da confirmação capturado no início: ${originalConfirmation}`, async ({ page, context }) => {
    const requests = await mockAssistant(context);
    await context.addInitScript((confirmation) => {
      if (localStorage.getItem("audio-seeded")) return;
      localStorage.setItem("audio-seeded", "yes");
      localStorage.setItem("sabor-express-demo-v1", JSON.stringify({ sessionRevision: 2, activeId: "audio-test", automation: true, conversations: [{ id: "audio-test", name: "Você", initials: "VC", color: "mint", store: "São Paulo · Pinheiros", status: "ai", topic: "Teste", unread: 0, phone: "", messages: [], ...(confirmation ? { pendingAction: { kind: "booking", id: confirmation } } : {}) }] }));
    }, originalConfirmation);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    await context.route("**/api/audio/transcribe", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { ready: true } });
      await wait;
      await route.fulfill({ json: { text: "sim", provider: "azure", mimeType: "audio/wav" } });
    });
    await page.goto("/whatsapp");
    await attachAudio(page);
    await expect(page.getByRole("status")).toContainText("Transcrevendo");
    const other = await context.newPage();
    await other.goto("/dashboard");
    await other.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("sabor-express-demo-v1")!);
      state.conversations[0].pendingAction = { kind: "booking", id: "resumo-novo" };
      localStorage.setItem("sabor-express-demo-v1", JSON.stringify(state));
    });
    release();
    await expect(page.getByRole("textbox", { name: "Transcrição do áudio" })).toHaveValue("sim");
    await page.getByRole("button", { name: "Enviar áudio", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].confirmationId).toBe(originalConfirmation || undefined);
  });
}

test("erro de transcrição mantém a gravação para tentar de novo", async ({ page, context }) => {
  const requests = await mockAssistant(context);
  await page.route("**/api/audio/transcribe", (route) => route.request().method() === "GET" ? route.fulfill({ json: { ready: true } }) : route.fulfill({ status: 422, json: { error: "Não foi possível reconhecer fala neste áudio." } }));
  await page.goto("/whatsapp");
  await attachAudio(page);
  await expect(page.locator(".voice-error")).toContainText("reconhecer fala");
  await expect(page.getByLabel("Ouvir áudio antes de enviar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar transcrever novamente" })).toBeVisible();
  expect(requests).toHaveLength(0);
});

test("negação de microfone mostra orientação e mantém o texto disponível", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
  });
  await page.route("**/api/audio/transcribe", (route) => route.fulfill({ json: { ready: true } }));
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Gravar áudio" }).click();
  await expect(page.locator(".voice-error")).toContainText("Permita o acesso ao microfone");
  await expect(page.getByRole("textbox", { name: "Mensagem do cliente" })).toBeVisible();
});

test.describe("gravação com dispositivo de áudio de teste do navegador", () => {
  test("grava, interrompe o microfone e transcreve", async ({ page, context }) => {
    await mockAssistant(context);
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        (window as typeof window & { testAudioTracks: MediaStreamTrack[] }).testAudioTracks = stream.getTracks();
        return stream;
      };
    });
    await page.route("**/api/audio/transcribe", (route) => route.fulfill({ json: route.request().method() === "GET" ? { ready: true } : { text: "Quero ver o cardápio", provider: "azure", mimeType: "audio/webm" } }));
    await page.goto("/whatsapp");
    await page.getByRole("button", { name: "Gravar áudio" }).click();
    await expect(page.getByLabel("Tempo de gravação")).toHaveText("0:01", { timeout: 10000 });
    await page.getByRole("button", { name: "Parar e transcrever" }).click();
    await expect(page.getByRole("textbox", { name: "Transcrição do áudio" })).toHaveValue("Quero ver o cardápio");
    expect(await page.evaluate(() => (window as typeof window & { testAudioTracks: MediaStreamTrack[] }).testAudioTracks.every((track) => track.readyState === "ended"))).toBe(true);
    await page.getByRole("button", { name: "Enviar áudio", exact: true }).click();
    await expect(page.locator(".voice-message")).toBeVisible();
  });

  test("trocar de conversa encerra a gravação sem transcrever ou enviar", async ({ page, context }) => {
    await mockAssistant(context);
    let transcriptions = 0;
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        (window as typeof window & { testAudioTracks: MediaStreamTrack[] }).testAudioTracks = stream.getTracks();
        return stream;
      };
    });
    await page.route("**/api/audio/transcribe", (route) => {
      if (route.request().method() === "POST") transcriptions++;
      return route.fulfill({ json: { ready: true } });
    });
    await page.goto("/whatsapp");
    await page.getByRole("button", { name: "Gravar áudio" }).click();
    await expect(page.getByLabel("Tempo de gravação")).toBeVisible();
    await page.getByRole("button", { name: "Reservar uma mesa", exact: true }).click();
    await expect(page.locator(".voice-capture-panel")).toHaveCount(0);
    expect(await page.evaluate(() => (window as typeof window & { testAudioTracks: MediaStreamTrack[] }).testAudioTracks.every((track) => track.readyState === "ended"))).toBe(true);
    expect(transcriptions).toBe(0);
  });
});

test("acesso por HTTP orienta o microfone e permite anexar áudio", async ({ page, context }) => {
  await mockAssistant(context);
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { value: false });
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  await page.route("**/api/audio/transcribe", (route) => route.fulfill({ json: route.request().method() === "GET" ? { ready: true } : { text: "Quero uma reserva", provider: "azure", mimeType: "audio/wav" } }));
  await page.goto("/whatsapp");
  await page.getByRole("button", { name: "Gravar áudio" }).click();
  await expect(page.locator(".voice-error")).toContainText("HTTPS");
  await attachAudio(page);
  await expect(page.getByRole("textbox", { name: "Transcrição do áudio" })).toHaveValue("Quero uma reserva");
});
