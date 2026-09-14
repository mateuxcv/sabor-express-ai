import { z } from "zod";

export const sentimentAssessmentSchema = z.object({
  level: z.enum(["none", "attention", "high"]), category: z.enum(["service", "automation", "human_request", "other"]),
  reason: z.string().max(300), evidence: z.string().max(500), confidence: z.number().min(0).max(1),
  source: z.enum(["rules", "model", "rules_fallback"]),
});
export const sentimentAlertSchema = sentimentAssessmentSchema.extend({
  id: z.string(), conversationId: z.string(), store: z.string(), customerName: z.string(),
  level: z.enum(["attention", "high"]), status: z.enum(["open", "acknowledged", "resolved"]),
  createdAt: z.number(), updatedAt: z.number(), waitingSince: z.number().nullable(), acknowledgedAt: z.number().nullable(),
  resolvedAt: z.number().nullable(), ownerName: z.string().nullable(), crmStatus: z.string().nullable(),
  crmError: z.string().nullable(), taskId: z.string().nullable(), dealUrl: z.string().nullable(),
});
export const sentimentResultSchema = z.object({ assessment: sentimentAssessmentSchema, alert: sentimentAlertSchema.nullable() });
export const sentimentDashboardSchema = z.object({ alerts: z.array(sentimentAlertSchema) });
export const sentimentActionSchema = z.object({ alertId: z.string().uuid(), action: z.enum(["acknowledge", "resolve"]) });
export type SentimentAlert = z.infer<typeof sentimentAlertSchema>;
export const sentimentTitle = (alert: SentimentAlert) => alert.category === "human_request" ? "Pedido de atendimento humano" : "Possível insatisfação";
export const sentimentHandoff = "Sinto muito pela dificuldade. Encaminhei sua conversa para nossa equipe, com o histórico, para você não precisar explicar tudo novamente. O atendimento humano continuará por aqui.";
export const humanRequestHandoff = "Encaminhei sua conversa para nossa equipe, com o histórico. O atendimento humano continuará por aqui.";
export const needsHandoff = (alert?: SentimentAlert | null) => Boolean(alert && alert.level === "high" && alert.status !== "resolved");

export async function sentimentAction(alertId: string, action: "acknowledge" | "resolve") {
  const response = await fetch("/api/sentiment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertId, action }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível atualizar o alerta.");
  return sentimentAlertSchema.parse(body);
}
