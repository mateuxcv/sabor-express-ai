import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { GET, POST } from "../src/app/api/audio/transcribe/route";
import { AudioRequestError, audioConfiguration, readAudioUpload, transcribeAudio } from "../src/lib/server/azure-audio";
import { MAX_AUDIO_BYTES, MAX_TRANSCRIPT_CHARS } from "../src/lib/audio";

function configure(t: TestContext) {
  const values = { AZURE_AUDIO_DEPLOYMENT: "voice-deployment", AZURE_ENDPOINT: "https://test.openai.azure.com/openai/v1", AZURE_API_KEY: "secret-test-key", AZURE_AUDIO_ENDPOINT: "", AZURE_AUDIO_API_KEY: "", AZURE_AUDIO_USE_CHAT_KEY: "false", AZURE_AUDIO_LANGUAGE: "pt", AZURE_AUDIO_API_VERSION: "2025-04-01-preview" };
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

function wave() {
  const data = Buffer.alloc(80);
  data.write("RIFF", 0); data.writeUInt32LE(72, 4); data.write("WAVE", 8);
  return new File([data], "gravacao.wav", { type: "audio/wav" });
}

function upload(file: File) {
  const form = new FormData();
  form.set("file", file);
  return new Request("http://0.0.0.0:3000/api/audio/transcribe", { method: "POST", headers: { Host: "localhost:3000", Origin: "http://localhost:3000" }, body: form });
}

test("áudio usa deployment separado e envia arquivo apenas ao Azure configurado", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://test.openai.azure.com/openai/deployments/voice-deployment/audio/transcriptions?api-version=2025-04-01-preview");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("api-key"), "secret-test-key");
    assert.equal(headers.has("content-type"), false);
    const form = options.body as FormData;
    assert.equal(form.get("model"), "voice-deployment");
    assert.equal(form.get("language"), "pt");
    assert.equal((form.get("file") as File).name, "mensagem.wav");
    assert.equal(options.redirect, "error");
    return Response.json({ text: "Quero reservar para quinze pessoas." });
  });
  const response = await POST(upload(wave()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: "Quero reservar para quinze pessoas.", provider: "azure", mimeType: "audio/wav" });
});

test("modelo do chat não substitui deployment de transcrição", async (t) => {
  configure(t);
  delete process.env.AZURE_AUDIO_DEPLOYMENT;
  const fetch = t.mock.method(globalThis, "fetch");
  assert.equal((await (await GET()).json()).ready, false);
  assert.equal((await POST(upload(wave()))).status, 503);
  assert.equal(fetch.mock.callCount(), 0);
});

test("endpoint dedicado de áudio e sua chave têm prioridade sem vazamento no status", async (t) => {
  configure(t);
  process.env.AZURE_AUDIO_ENDPOINT = "https://audio-resource.services.ai.azure.com";
  process.env.AZURE_AUDIO_API_KEY = "dedicated-secret";
  const config = audioConfiguration();
  assert.equal(config.url, "https://audio-resource.services.ai.azure.com/openai/deployments/voice-deployment/audio/transcriptions?api-version=2025-04-01-preview");
  assert.equal(config.apiKey, "dedicated-secret");
  const status = await (await GET()).text();
  assert.equal(status.includes("secret"), false);
  assert.equal(status.includes("audio-resource"), false);
});

test("configuração explícita reutiliza a chave do chat sem recorrer à chave dedicada", (t) => {
  configure(t);
  process.env.AZURE_AUDIO_API_KEY = "chave-dedicada-invalida";
  process.env.AZURE_AUDIO_USE_CHAT_KEY = "true";
  assert.equal(audioConfiguration().apiKey, "secret-test-key");
  delete process.env.AZURE_API_KEY;
  assert.throws(audioConfiguration, AudioRequestError);
});

test("URLs de projeto ou operação não são usadas para transcrição", (t) => {
  configure(t);
  for (const endpoint of ["https://test.services.ai.azure.com/api/projects/x", "https://test.services.ai.azure.com/models", "https://test.openai.azure.com/openai/v1/audio/transcriptions", "http://test.openai.azure.com", "https://test.openai.azure.com/?key=secret"]) {
    process.env.AZURE_AUDIO_ENDPOINT = endpoint;
    assert.throws(audioConfiguration, AudioRequestError);
  }
});

test("arquivo vazio, conteúdo disfarçado e tamanho excessivo são rejeitados", async (t) => {
  configure(t);
  const fetch = t.mock.method(globalThis, "fetch");
  assert.equal((await POST(upload(new File([], "empty.wav")))).status, 400);
  assert.equal((await POST(upload(new File(["<html>isto não é áudio</html>".repeat(3)], "fake.wav", { type: "audio/wav" })))).status, 415);
  await assert.rejects(() => transcribeAudio(new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "large.wav")), (error: AudioRequestError) => error.status === 413);
  assert.equal(fetch.mock.callCount(), 0);
});

test("limite de upload também funciona sem Content-Length", async () => {
  const request = new Request("http://localhost/api/audio/transcribe", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=demo" }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_AUDIO_BYTES + 65537)); controller.close(); } }), duplex: "half" } as RequestInit & { duplex: string });
  await assert.rejects(() => readAudioUpload(request), (error: AudioRequestError) => error.status === 413);
});

test("transcrição vazia ou longa demais não vira mensagem nem é truncada", async (t) => {
  configure(t);
  let text = "   ";
  t.mock.method(globalThis, "fetch", async () => Response.json({ text }));
  await assert.rejects(() => transcribeAudio(wave()), (error: AudioRequestError) => error.code === "no_speech");
  text = "a".repeat(MAX_TRANSCRIPT_CHARS + 1);
  await assert.rejects(() => transcribeAudio(wave()), (error: AudioRequestError) => error.code === "transcript_too_long");
});

test("falha do Azure informa configuração sem devolver a resposta sensível do provedor", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "detalhes internos secret-test-key" }, { status: 404 }));
  const response = await POST(upload(wave()));
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.code, "deployment_not_found");
  assert.equal(JSON.stringify(result).includes("secret-test-key"), false);
});

test("upload de outra origem é recusado", async () => {
  const response = await POST(new Request("http://localhost/api/audio/transcribe", { method: "POST", headers: { Origin: "https://outra-origem.example" } }));
  assert.equal(response.status, 403);
});
