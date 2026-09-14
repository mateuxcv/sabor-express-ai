import { z } from "zod";
import { deliveryAddressSchema, orderPreferencesSchema } from "./ordering";

export const agentIdSchema = z.enum(["reception", "orders", "reservations", "birthdays", "information", "human"]);
export const orderSchema = z.object({ id: z.string().max(120), product: z.string().max(100), price: z.number().min(0).max(10000), confirmed: z.boolean(), status: z.string().max(100), quantity: z.number().int().min(1).max(10).optional(), subtotal: z.number().min(0).optional(), deliveryFee: z.number().min(0).optional(), fulfillment: z.enum(["pickup", "delivery"]).optional(), address: deliveryAddressSchema.optional() });
export const bookingSchema = z.object({ kind: z.enum(["reservation", "birthday"]), date: z.string().max(30).optional(), time: z.string().max(20).optional(), guests: z.number().int().min(1).max(500).optional(), stage: z.enum(["collecting", "awaiting_confirmation", "confirmed", "unavailable", "cancelled", "pending_human"]), attempts: z.number().int().min(0).max(20), id: z.string().max(120).optional(), askedField: z.enum(["date", "time", "guests"]).optional(), suggestedTimes: z.array(z.string().max(20)).max(3).optional() });
export const pendingActionSchema = z.object({ kind: z.enum(["order", "booking"]), id: z.string().min(1).max(120) });
export const routingSchema = z.object({ agent: agentIdSchema, source: z.enum(["demo", "crewai", "fallback"]), reason: z.string().max(300), summary: z.string().max(800), missingFields: z.array(z.string().max(40)).max(5), checks: z.array(z.string().max(200)).max(8).optional() });
export const chatRequestSchema = z.object({
  requestId: z.string().min(1).max(120),
  confirmationId: z.string().max(120).optional(),
  conversation: z.object({
    id: z.string().min(1).max(120), name: z.string().min(1).max(100), customerId: z.string().max(120).optional(), store: z.string().min(1).max(100), status: z.enum(["ai", "human", "waiting", "resolved"]),
    messages: z.array(z.object({ id: z.string().max(120), author: z.enum(["customer", "ai", "agent"]), text: z.string().min(1).max(4000) })).min(1).max(30),
    order: orderSchema.optional(), booking: bookingSchema.optional(), pendingAction: pendingActionSchema.optional(), clarificationCount: z.number().int().min(0).max(5).default(0),
    orderPreferences: orderPreferencesSchema.optional(),
  }),
}).refine(({ requestId, conversation }) => conversation.messages.at(-1)?.id === requestId && conversation.messages.at(-1)?.author === "customer", { message: "A solicitação deve identificar a última mensagem do cliente." });

export const chatReplySchema = z.object({
  text: z.string().min(1).max(4000), status: z.enum(["ai", "waiting"]).optional(), topic: z.string().max(100).optional(), kind: z.enum(["menu", "order", "order_setup"]).optional(), order: orderSchema.optional(), booking: bookingSchema.optional(), routing: routingSchema,
  orderPreferences: orderPreferencesSchema.optional(),
  clarificationCount: z.number().int().min(0).max(5).optional(),
  pendingAction: pendingActionSchema.optional(),
});

export function unavailableReply(reason = "Serviço indisponível. Encaminhamento para a equipe."): z.infer<typeof chatReplySchema> {
  return { text: "Não consegui continuar o atendimento automático agora. Vou encaminhar sua conversa à equipe, com todo o histórico. 💚", status: "waiting", topic: "Atendimento humano", routing: { agent: "human", source: "fallback", reason, summary: "A automação não concluiu esta mensagem. A equipe deve continuar a partir do histórico.", missingFields: [] } };
}
