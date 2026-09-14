import assert from "node:assert/strict";
import { test } from "node:test";
import { generateReply } from "../src/lib/automation";
import { initialState, type Conversation } from "../src/lib/demo-data";

const conversation = initialState.conversations[0];

test("cardápio oferece produtos sem confirmar um pedido", () => {
  const result = generateReply("Quero ver o cardápio", conversation);
  assert.equal(result.kind, "menu");
  assert.equal(result.order, undefined);
});

test("escolha cria rascunho e exige confirmação explícita", () => {
  const result = generateReply("Quero pedir o Combo Veggie", conversation);
  assert.equal(result.order?.confirmed, false);
  assert.equal(result.order?.product, "Combo Veggie");
  assert.equal(result.order?.price, 34.9);
  assert.match(result.text, /Posso confirmar/);
});

test("confirmar duas vezes preserva ID e não cria outro pedido", () => {
  const first = generateReply("Confirmar pedido", conversation);
  assert.equal(first.order?.confirmed, true);
  assert.equal(first.order?.id, conversation.order?.id);
  const second = generateReply("Confirmar pedido", { ...conversation, order: first.order });
  assert.equal(second.order, undefined);
  assert.match(second.text, /já está confirmado/);
});

test("pedidos de humano, reclamações e situações sensíveis vão para a equipe", () => {
  for (const text of ["Meu pedido está atrasado", "Quero um atendente", "Tenho alergia", "Quero cancelar", "Preciso de reembolso"]) {
    assert.equal(generateReply(text, conversation).status, "waiting", text);
  }
});

test("aniversário com 15 pessoas não é confundido com pedido de humano", () => {
  const result = generateReply("Quero um aniversário para 15 pessoas", conversation);
  assert.equal(result.routing?.agent, "birthdays");
  assert.equal(result.booking?.guests, 15);
  assert.notEqual(result.status, "waiting");
  assert.match(result.text, /dia\/mês/);
});

test("reserva coleta apenas o que falta e sempre termina em validação humana", () => {
  const first = generateReply("Reservar mesa para 4 pessoas", conversation);
  const second = generateReply("24/10", { ...conversation, booking: first.booking });
  assert.match(second.text, /horário/);
  const third = generateReply("19h30", { ...conversation, booking: second.booking });
  assert.equal(third.status, "waiting");
  assert.equal(third.booking?.date, "24/10");
  assert.equal(third.booking?.time, "19:30");
  assert.equal(third.booking?.guests, 4);
  assert.equal(third.booking?.stage, "pending_human");
  assert.match(third.text, /ainda não é uma confirmação/);
});

test("datas e horários inválidos não entram no pré-cadastro", () => {
  const result = generateReply("Reservar em 31/02 às 19:90 para 4 pessoas", conversation);
  assert.equal(result.booking?.date, undefined);
  assert.equal(result.booking?.time, undefined);
});

test("estacionamento respeita a base da unidade", () => {
  assert.match(generateReply("Vocês têm estacionamento?", conversation).text, /primeira hora gratuita/);
  const moema: Conversation = { ...conversation, store: "São Paulo · Moema" };
  assert.equal(generateReply("Vocês têm estacionamento?", moema).status, "waiting");
});

test("informação desconhecida não gera uma resposta inventada", () => {
  assert.equal(generateReply("Qual é a origem de todos os ingredientes?", conversation).status, "waiting");
});

test("não confirma um pedido inexistente", () => {
  const result = generateReply("Confirmar pedido", { ...conversation, order: undefined });
  assert.equal(result.order, undefined);
  assert.equal(result.status, "waiting");
});

test("menções ou recusas não são tratadas como consentimento", () => {
  for (const text of ["Não confirme o pedido", "Como confirmar um pedido?", "Não quero pedir o Combo Clássico"]) {
    assert.equal(generateReply(text, conversation).order, undefined, text);
  }
  assert.equal(generateReply("Sim, pode confirmar!", conversation).order?.confirmed, true);
});
