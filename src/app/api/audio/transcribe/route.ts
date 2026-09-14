import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS } from "@/lib/audio";
import { AudioRequestError, audioConfiguration, readAudioUpload, transcribeAudio } from "@/lib/server/azure-audio";

export const runtime = "nodejs";
export const maxDuration = 45;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    audioConfiguration();
    return json({ ready: true, provider: "azure", label: "Transcrição Azure configurada", maxBytes: MAX_AUDIO_BYTES, maxSeconds: MAX_AUDIO_SECONDS });
  } catch (error) {
    return json({ ready: false, provider: "azure", label: "Configurar transcrição Azure", message: error instanceof AudioRequestError ? error.message : "Confira a configuração de áudio no .env." });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== (request.headers.get("host") || new URL(request.url).host)) return json({ error: "Origem não permitida." }, 403);
    } catch { return json({ error: "Origem inválida." }, 403); }
  }
  try {
    audioConfiguration();
    const file = await readAudioUpload(request);
    return json(await transcribeAudio(file, request.signal));
  } catch (error) {
    if (error instanceof AudioRequestError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Não foi possível processar o áudio. Tente novamente.", code: "audio_error" }, 500);
  }
}
