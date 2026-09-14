import { z } from "zod";
import { bookingSchema, orderSchema } from "./assistant-contract";
import { orderPreferencesSchema } from "./ordering";
import type { Conversation } from "./demo-data";

const messageSchema = z.object({ id: z.string().min(1).max(120), author: z.enum(["customer", "ai", "agent"]), text: z.string().min(1).max(4000) });
export const suggestionContextSchema = z.object({
  lastCustomerMessageId: z.string().min(1).max(120),
  conversation: z.object({ id: z.string().min(1).max(120), name: z.string().min(1).max(100), store: z.string().min(1).max(100),
    status: z.enum(["ai", "human", "waiting", "resolved"]), messages: z.array(messageSchema).min(1).max(30),
    order: orderSchema.optional(), booking: bookingSchema.optional(), orderPreferences: orderPreferencesSchema.optional(),
  }),
  sentiment: z.object({ level: z.enum(["attention", "high"]), category: z.enum(["service", "automation", "human_request", "other"]),
    reason: z.string().max(300), evidence: z.string().max(500), status: z.enum(["open", "acknowledged", "resolved"]) }).optional(),
});
export const suggestionRequestSchema = suggestionContextSchema.extend({ requestId: z.string().min(1).max(120) }).refine((data) => {
  const messages = data.conversation.messages;
  return messages.filter((message) => message.author === "customer").at(-1)?.id === data.lastCustomerMessageId && new Set(messages.map((m) => m.id)).size === messages.length;
}, { message: "O contexto deve identificar a última mensagem do cliente, sem IDs repetidos." });

export const suggestedReplySchema = z.object({ id: z.enum(["empathetic", "concise", "nextStep"]), label: z.string().min(1).max(40), text: z.string().trim().min(10).max(1400) });
export const suggestionResultSchema = z.object({ requestId: z.string(), lastCustomerMessageId: z.string(), provider: z.literal("azure_foundry"),
  suggestions: z.array(suggestedReplySchema).length(3) }).refine((data) => new Set(data.suggestions.map((s) => s.id)).size === 3 && new Set(data.suggestions.map((s) => s.text.toLocaleLowerCase())).size === 3);
export type SuggestedReply = z.infer<typeof suggestedReplySchema>;

export function suggestionContext(conversation: Conversation) {
  const history = conversation.messages.filter((m) => ["customer", "ai", "agent"].includes(m.author) && !m.csatSurveyId && !m.csatResponse);
  const lastCustomer = history.filter((m) => m.author === "customer").at(-1);
  if (!lastCustomer) return null;
  const recent = history.slice(-30);
  const selected = recent.some((m) => m.id === lastCustomer.id) ? recent : [lastCustomer, ...history.slice(-29)];
  const messages = selected.map(({ id, author, text }) => ({ id, author, text }));
  const sentiment = conversation.sentiment;
  const parsed = suggestionContextSchema.safeParse({ lastCustomerMessageId: lastCustomer.id,
    conversation: { id: conversation.id, name: conversation.name, store: conversation.store, status: conversation.status, messages,
      order: conversation.order, booking: conversation.booking, orderPreferences: conversation.orderPreferences },
    sentiment: sentiment ? { level: sentiment.level, category: sentiment.category, reason: sentiment.reason, evidence: sentiment.evidence, status: sentiment.status } : undefined,
  });
  return parsed.success ? parsed.data : null;
}
