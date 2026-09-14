import { z } from "zod";

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 120;
export const MAX_TRANSCRIPT_CHARS = 2000;
export const AUDIO_ACCEPT = ".wav,.mp3,.m4a,.mp4,.webm,.mpeg,.mpga";
export const RECORDING_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export const transcriptionSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARS),
  provider: z.literal("azure"),
  mimeType: z.string(),
});

export function audioTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
