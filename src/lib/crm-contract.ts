import { z } from "zod";

export const customerProfileSchema = z.object({ id: z.string(), name: z.string(), phone: z.string(), email: z.string().nullable().optional() });
export const crmEventSchema = z.object({
  id: z.string(), type: z.string(), reference: z.string(), conversationId: z.string(),
  status: z.enum(["pending", "processing", "synced", "blocked", "failed", "uncertain", "skipped"]),
  attempts: z.number(), error: z.string().nullable(), code: z.string().nullable(),
  syncedAt: z.number().nullable(), createdAt: z.number(), contactId: z.string().nullable(), dealId: z.string().nullable(), dealUrl: z.string().nullable(),
});
export const crmMappingSchema = z.object({ store: z.string(), pipelineId: z.string(), stageId: z.string(), ownerId: z.string(), pipelineName: z.string(), stageName: z.string(), ownerName: z.string() });
export const crmStatusSchema = z.object({ configured: z.boolean(), connected: z.boolean(), connectionStatus: z.string(), configurationMessage: z.string().nullable(), connectedAt: z.string().nullable(), mappings: z.array(crmMappingSchema), events: z.array(crmEventSchema), customer: customerProfileSchema.nullable() });
export type CrmStatus = z.infer<typeof crmStatusSchema>;
export type CrmEvent = z.infer<typeof crmEventSchema>;

export const crmActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("customer"), conversationId: z.string().min(1).max(120), name: z.string().trim().min(2).max(100), phone: z.string().min(8).max(40), email: z.string().max(254).optional() }),
  z.object({ action: z.literal("mapping"), store: z.string().max(100), pipelineId: z.string().regex(/^[0-9a-f]{24}$/), stageId: z.string().regex(/^[0-9a-f]{24}$/), ownerId: z.string().regex(/^[0-9a-f]{24}$/) }),
  z.object({ action: z.literal("enqueue"), conversationId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("retry"), eventId: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal("disconnect") }),
]);
