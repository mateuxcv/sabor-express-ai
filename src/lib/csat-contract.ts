import { z } from "zod";

export const csatSurveySchema = z.object({
  id: z.string().uuid(), conversationId: z.string(), store: z.string(), customerName: z.string(),
  createdAt: z.number(), score: z.number().int().min(1).max(5).nullable(), comment: z.string(), answeredAt: z.number().nullable(),
  crmStatus: z.enum(["pending", "processing", "synced", "blocked", "failed", "uncertain", "skipped"]).nullable(),
  crmError: z.string().nullable(), dealUrl: z.string().url().nullable(),
});
export type CsatSurvey = z.infer<typeof csatSurveySchema>;
export const csatMetricsSchema = z.object({
  sent: z.number(), answered: z.number(), pending: z.number(), average: z.number().nullable(),
  csatPercent: z.number().nullable(), responseRate: z.number().nullable(),
  distribution: z.array(z.object({ score: z.number(), count: z.number() })), recent: z.array(csatSurveySchema),
});
export type CsatMetrics = z.infer<typeof csatMetricsSchema>;
export const csatActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue"), conversationId: z.string().min(1).max(120), store: z.string().min(1).max(100), customerName: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("answer"), surveyId: z.string().uuid(), conversationId: z.string().min(1).max(120), score: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).default("") }),
]);
export const csatQuestion = "Atendimento finalizado 💚 Como você avalia nosso atendimento? Escolha uma nota de 1 a 5 abaixo. Seu comentário é opcional.";
export const csatLabels = ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"];

export async function csatAction(body: z.input<typeof csatActionSchema>) {
  const response = await fetch("/api/csat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(50000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível salvar a pesquisa. Tente novamente.");
  return csatSurveySchema.parse(result);
}
