import assert from "node:assert/strict";
import { test } from "node:test";
import { chatReplySchema, chatRequestSchema, unavailableReply } from "../src/lib/assistant-contract";

const payload = { requestId: "m1", conversation: { id: "c1", name: "Cliente", store: "São Paulo · Pinheiros", status: "ai", messages: [{ id: "m1", author: "customer", text: "Quero reservar" }] } };

test("contrato não permite notas internas enviadas ao provedor", () => {
  assert.equal(chatRequestSchema.safeParse(payload).success, true);
  assert.equal(chatRequestSchema.safeParse({ ...payload, conversation: { ...payload.conversation, messages: [{ id: "m1", author: "note", text: "Nota privada" }] } }).success, false);
});

test("contrato exige mensagem atual e aceita somente estágios conhecidos da agenda", () => {
  assert.equal(chatRequestSchema.safeParse({ ...payload, requestId: "outro" }).success, false);
  const result = unavailableReply();
  assert.equal(chatReplySchema.safeParse(result).success, true);
  assert.equal(chatReplySchema.safeParse({ ...result, booking: { kind: "reservation", stage: "confirmed", attempts: 1, id: "RS-test" } }).success, true);
  assert.equal(chatReplySchema.safeParse({ ...result, booking: { kind: "reservation", stage: "paid", attempts: 1 } }).success, false);
});
