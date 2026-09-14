import assert from "node:assert/strict";
import { test } from "node:test";
import catalog from "../src/lib/catalog.json";
import { createSession } from "../src/lib/demo-data";
import { generateReply } from "../src/lib/automation";
import { deliveryAddressSchema, needsOrderSetup, orderPreferencesSchema } from "../src/lib/ordering";

const conversation = createSession("test").conversations[0];
const address = { street: "Rua de Teste", number: "123", district: "Moema" };

test("novo pedido pergunta unidade e recebimento sem bloquear pedido de humano", () => {
  assert.equal(generateReply("Quero pedir o Combo Bacon", conversation).kind, "order_setup");
  assert.equal(generateReply("Quero falar com um atendente", conversation).status, "waiting");
  assert.equal(generateReply("Quero reservar mesa para 4 pessoas", conversation).booking?.guests, 4);
});

test("catálogo tem sete itens e a simulação soma frete da unidade uma única vez", () => {
  assert.equal(catalog.products.length, 7);
  for (const store of catalog.stores) {
    for (const product of catalog.products) {
      const reply = generateReply(`Quero pedir o ${product.name}`, { ...conversation, store: store.name, orderPreferences: { storeSelected: true, fulfillment: "delivery", address } });
      assert.equal(reply.order?.price, Math.round((product.price + store.deliveryFee) * 100) / 100);
      assert.equal(reply.order?.deliveryFee, store.deliveryFee);
      assert.equal(reply.order?.confirmed, false);
      assert.match(reply.text, /Posso confirmar/);
    }
  }
});

test("retirada não cobra frete e entrega exige endereço válido", () => {
  const pickup = generateReply("Quero pedir o Brownie de Chocolate", { ...conversation, orderPreferences: { storeSelected: true, fulfillment: "pickup" } });
  assert.equal(pickup.order?.price, 12.9);
  assert.equal(pickup.order?.deliveryFee, 0);
  assert.equal(needsOrderSetup({ storeSelected: true, fulfillment: "delivery" }), true);
  assert.equal(deliveryAddressSchema.safeParse({ street: " ", number: "", district: "x" }).success, false);
  const preferences = orderPreferencesSchema.parse({ storeSelected: true, fulfillment: "delivery", address, deliveryFee: 0 });
  assert.equal("deliveryFee" in preferences, false);
});
