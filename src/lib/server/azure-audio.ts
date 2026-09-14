import { MAX_AUDIO_BYTES, MAX_TRANSCRIPT_CHARS } from "../audio";

export class AudioRequestError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function audioConfiguration() {
  const deployment = process.env.AZURE_AUDIO_DEPLOYMENT?.trim();
  const endpoint = process.env.AZURE_AUDIO_ENDPOINT?.trim() || process.env.AZURE_ENDPOINT?.trim();
  const useChatKey = process.env.AZURE_AUDIO_USE_CHAT_KEY?.trim().toLowerCase() === "true";
  const apiKey = useChatKey ? process.env.AZURE_API_KEY?.trim() : process.env.AZURE_AUDIO_API_KEY?.trim() || process.env.AZURE_API_KEY?.trim();
  const language = process.env.AZURE_AUDIO_LANGUAGE?.trim() || "pt";
  const apiVersion = process.env.AZURE_AUDIO_API_VERSION?.trim() || "2025-04-01-preview";
  if (!deployment || !endpoint || !apiKey) {
    throw new AudioRequestError("not_configured", "Configure AZURE_AUDIO_DEPLOYMENT no .env da raiz e confira o endpoint e a chave do Azure para áudio.", 503);
  }
  if (!/^[\w.-]{1,128}$/.test(deployment) || !/^[a-z]{2}$/.test(language)) {
    throw new AudioRequestError("invalid_configuration", "Confira AZURE_AUDIO_DEPLOYMENT e AZURE_AUDIO_LANGUAGE no .env.", 503);
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:-preview)?$/.test(apiVersion)) throw new AudioRequestError("invalid_configuration", "Confira AZURE_AUDIO_API_VERSION no .env.", 503);
  let url: URL;
  try { url = new URL(endpoint); } catch {
    throw new AudioRequestError("invalid_configuration", "Configure um endpoint Azure válido em AZURE_AUDIO_ENDPOINT.", 503);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new AudioRequestError("invalid_configuration", "O endpoint de áudio deve ser uma URL HTTPS do recurso Azure.", 503);
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path && !path.endsWith("/openai/v1")) {
    throw new AudioRequestError("invalid_configuration", "Use a raiz do recurso Azure ou seu endpoint /openai/v1/ em AZURE_AUDIO_ENDPOINT.", 503);
  }
  // Transcrição de arquivos usa a rota versionada do deployment, documentada pelo Azure.
  // Aceitar o endpoint v1 do chat permite reutilizar a configuração do mesmo recurso.
  const prefix = path ? path.slice(0, -"/openai/v1".length) : "";
  url.pathname = `${prefix}/openai/deployments/${encodeURIComponent(deployment)}/audio/transcriptions`;
  url.searchParams.set("api-version", apiVersion);
  return { deployment, apiKey, language, url: url.toString() };
}

export function detectAudio(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => new TextDecoder("ascii").decode(bytes.slice(start, end));
  if (bytes.length < 32) throw new AudioRequestError("invalid_audio", "O arquivo de áudio está vazio ou incompleto.");
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { mimeType: "audio/wav", extension: "wav" };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { mimeType: "audio/webm", extension: "webm" };
  if (ascii(4, 8) === "ftyp") return { mimeType: "audio/mp4", extension: "m4a" };
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return { mimeType: "audio/mpeg", extension: "mp3" };
  throw new AudioRequestError("unsupported_format", "Use um áudio WAV, MP3, M4A, MP4 ou WebM.", 415);
}

export async function readAudioUpload(request: Request): Promise<File> {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("multipart/form-data;")) {
    throw new AudioRequestError("invalid_upload", "Envie o áudio como arquivo.");
  }
  const maxUpload = MAX_AUDIO_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > maxUpload) throw new AudioRequestError("too_large", "O áudio deve ter no máximo 4 MB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AudioRequestError("invalid_upload", "Nenhum áudio foi enviado.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxUpload) {
        await reader.cancel();
        throw new AudioRequestError("too_large", "O áudio deve ter no máximo 4 MB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  let form: FormData;
  try { form = await new Response(buffer, { headers: { "Content-Type": type } }).formData(); } catch {
    throw new AudioRequestError("invalid_upload", "Não foi possível ler o arquivo enviado.");
  }
  const files = form.getAll("file");
  if (files.length !== 1 || !(files[0] instanceof File)) throw new AudioRequestError("invalid_upload", "Envie um arquivo de áudio por vez.");
  if (files[0].size > MAX_AUDIO_BYTES) throw new AudioRequestError("too_large", "O áudio deve ter no máximo 4 MB.", 413);
  return files[0];
}

export async function transcribeAudio(file: File, requestSignal?: AbortSignal) {
  if (file.size > MAX_AUDIO_BYTES) throw new AudioRequestError("too_large", "O áudio deve ter no máximo 4 MB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectAudio(bytes);
  const config = audioConfiguration();
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: format.mimeType }), `mensagem.${format.extension}`);
  form.set("model", config.deployment);
  form.set("language", config.language);
  form.set("response_format", "json");
  const timeout = AbortSignal.timeout(40000);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(config.url, { method: "POST", headers: { "api-key": config.apiKey }, body: form, cache: "no-store", signal, redirect: "error" });
  } catch {
    throw new AudioRequestError("transcription_unavailable", timeout.aborted ? "A transcrição demorou demais. Tente um áudio mais curto." : "Não foi possível conectar à transcrição do Azure. Tente novamente.", timeout.aborted ? 504 : 503);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new AudioRequestError("azure_unauthorized", "O Azure não autorizou a transcrição. Confira a chave e o recurso de áudio no .env.", 503);
    if (response.status === 404) throw new AudioRequestError("deployment_not_found", "Deployment de transcrição não encontrado. Confira AZURE_AUDIO_DEPLOYMENT no .env.", 503);
    if (response.status === 429) throw new AudioRequestError("rate_limit", "A transcrição está ocupada. Aguarde um momento e tente novamente.", 429);
    if (response.status === 400 || response.status === 415 || response.status === 422) throw new AudioRequestError("audio_rejected", "O Azure não conseguiu transcrever esse arquivo. Confira o formato e se o deployment aceita transcrição de áudio.", 422);
    throw new AudioRequestError("transcription_unavailable", "A transcrição do Azure está indisponível. Tente novamente.", 503);
  }
  let result: unknown;
  try { result = await response.json(); } catch { throw new AudioRequestError("invalid_response", "O serviço de áudio retornou uma resposta inválida.", 502); }
  const text = result && typeof result === "object" && "text" in result && typeof result.text === "string" ? result.text.trim() : "";
  if (!text) throw new AudioRequestError("no_speech", "Não foi possível reconhecer fala neste áudio. Tente gravar novamente.", 422);
  if (text.length > MAX_TRANSCRIPT_CHARS) throw new AudioRequestError("transcript_too_long", "A transcrição ficou muito longa. Envie um trecho menor.", 422);
  return { text, provider: "azure" as const, mimeType: format.mimeType };
}
