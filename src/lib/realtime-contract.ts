import { z } from "zod";
import { chatReplySchema } from "./assistant-contract";

export const callStartSchema = z.object({
  sdp: z.string().min(20).max(65000).startsWith("v=0"),
  conversation: z.object({
    id: z.string().min(1).max(120), name: z.string().min(1).max(100), customerId: z.string().max(120).optional(), store: z.string().min(1).max(100), status: z.literal("ai"),
    messages: z.array(z.object({ id: z.string().max(120), author: z.enum(["customer", "ai", "agent"]), text: z.string().min(1).max(4000) })).max(30),
  }),
});

export const callConnectionSchema = z.object({ id: z.string().uuid(), token: z.string().min(20).max(200), answer: z.string().startsWith("v=0").max(100000), maxSeconds: z.number().int().min(30).max(900) });
export const callSnapshotSchema = z.object({
  id: z.string(), status: z.enum(["connecting", "active", "ended", "failed", "transferred"]), startedAt: z.string(), durationSeconds: z.number().min(0), reason: z.string().nullable(),
  transcripts: z.array(z.object({ id: z.string(), author: z.enum(["customer", "ai"]), text: z.string().max(4000), time: z.string() })).max(120),
  business: chatReplySchema.nullable(),
  diagnostics: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
});

export type CallSnapshot = z.infer<typeof callSnapshotSchema>;
