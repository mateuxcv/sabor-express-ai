"use client";

import { useState, type FormEvent } from "react";
import { MapPin, ShoppingBag, Truck, Check, ArrowLeft } from "lucide-react";
import catalog from "@/lib/catalog.json";
import { currency, type Conversation, type Order } from "@/lib/demo-data";
import { demoActions } from "@/lib/demo-store";
import { addressLabel, deliveryAddressSchema, needsOrderSetup } from "@/lib/ordering";
import "@/app/ordering.css";

export function OrderSetupCards({ conversation: c }: { conversation: Conversation }) {
  const preferences = c.orderPreferences;
  const [error, setError] = useState("");
  if (c.status !== "ai" || c.call?.status === "active" || c.call?.status === "connecting" || !preferences || (!c.orderSetupActive && (!needsOrderSetup(preferences) || c.messages.length > 0))) return null;
  const unit = catalog.stores.find((store) => store.name === c.store)!;
  const step = !preferences.storeSelected ? 1 : !preferences.fulfillment ? 2 : 3;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = deliveryAddressSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) { setError("Informe rua, número e bairro para continuar."); return; }
    setError(""); demoActions.saveDeliveryAddress(c.id, parsed.data);
  }
  return <section className="order-setup" aria-label="Escolhas do pedido">
    <div className="order-setup-heading"><span>SEU PEDIDO, DO SEU JEITO</span><small>{step === 1 ? "Unidade" : step === 2 ? "Recebimento" : "Endereço"}</small></div>
    <h3>{step === 1 ? "Em qual unidade você quer pedir?" : step === 2 ? "Como você prefere receber?" : "Onde será a entrega?"}</h3>
    {step > 1 && <p className="selected-unit"><Check size={13} />{unit.name}</p>}
    {step === 1 && <div className="order-choice-grid units">{catalog.stores.map((store) => <button type="button" key={store.name} disabled={c.id === "session-start" || Boolean((c.order || c.booking) && store.name !== c.store)} onClick={() => demoActions.chooseOrderStore(c.id, store.name)}>
      <MapPin size={20} /><span><strong>{store.name.split(" · ")[1]}</strong><small>Entrega ou retirada</small></span><b>Frete fictício {currency(store.deliveryFee)}</b>
    </button>)}</div>}
    {step === 2 && <div className="order-choice-grid fulfillment">
      <button type="button" onClick={() => demoActions.chooseOrderFulfillment(c.id, "pickup")}><ShoppingBag size={23} /><strong>Retirar na loja</strong><span>Sem frete</span><small>{catalog.fulfillment.pickupEstimate}</small></button>
      <button type="button" onClick={() => demoActions.chooseOrderFulfillment(c.id, "delivery")}><Truck size={23} /><strong>Receber por entrega</strong><span>Frete fictício {currency(unit.deliveryFee)}</span><small>{catalog.fulfillment.deliveryEstimate}</small></button>
    </div>}
    {step === 3 && <form onSubmit={submit} className="delivery-address-form">
      <label>Rua / avenida<input name="street" required minLength={3} maxLength={120} autoComplete="street-address" placeholder="Ex.: Rua dos Pinheiros" defaultValue={preferences.address?.street} /></label>
      <div><label>Número<input name="number" required maxLength={20} placeholder="123 ou s/n" defaultValue={preferences.address?.number} /></label><label>Bairro<input name="district" required minLength={2} maxLength={80} placeholder="Seu bairro" defaultValue={preferences.address?.district} /></label></div>
      <label>Complemento (opcional)<input name="complement" maxLength={100} placeholder="Apartamento, bloco..." defaultValue={preferences.address?.complement} /></label>
      <p>Frete fixo fictício: <strong>{currency(unit.deliveryFee)}</strong>. Não consultamos distância ou cobertura real.</p>
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" type="submit">Usar este endereço</button>
      <button className="order-back" type="button" onClick={() => demoActions.editOrderPreferences(c.id)}><ArrowLeft size={13} />Voltar às opções de recebimento</button>
    </form>}
    <small className="order-demo-notice">{catalog.fulfillment.disclaimer}</small>
    <p className="order-setup-help">Para dúvidas, reservas ou falar com uma pessoa, você também pode escrever abaixo.</p>
  </section>;
}

export function OrderBreakdown({ order, store }: { order: Order; store: string }) {
  return <div className="order-breakdown" aria-label="Resumo de entrega e valores">
    <div><span>Unidade</span><strong>{store.split(" · ")[1]}</strong></div>
    <div><span>Recebimento</span><strong>{order.fulfillment === "delivery" ? "Entrega" : "Retirada na loja"}</strong></div>
    {order.fulfillment === "delivery" && order.address && <p><MapPin size={13} />{addressLabel(order.address)}</p>}
    <div><span>Itens</span><strong>{currency(order.subtotal ?? order.price)}</strong></div>
    <div><span>Frete fictício</span><strong>{currency(order.deliveryFee || 0)}</strong></div>
    <div className="order-grand-total"><span>Total do pedido</span><strong>{currency(order.price)}</strong></div>
  </div>;
}
