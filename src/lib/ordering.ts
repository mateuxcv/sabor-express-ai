import { z } from "zod";
import catalog from "./catalog.json";
import { currency, type Order } from "./demo-data";

export const deliveryAddressSchema = z.object({
  street: z.string().trim().min(3).max(120), number: z.string().trim().min(1).max(20),
  district: z.string().trim().min(2).max(80), complement: z.string().trim().max(100).optional(),
});
export const orderPreferencesSchema = z.object({
  storeSelected: z.boolean(), fulfillment: z.enum(["pickup", "delivery"]).optional(), address: deliveryAddressSchema.optional(),
});
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;
export type OrderPreferences = z.infer<typeof orderPreferencesSchema>;
export const needsOrderSetup = (preferences?: OrderPreferences) => Boolean(preferences && (!preferences.storeSelected || !preferences.fulfillment || (preferences.fulfillment === "delivery" && !deliveryAddressSchema.safeParse(preferences.address).success)));
export const addressLabel = (address: DeliveryAddress) => `${address.street}, ${address.number} · ${address.district}${address.complement ? ` · ${address.complement}` : ""}`;
export function deliveryFee(store: string, preferences?: OrderPreferences) {
  const unit = catalog.stores.find((item) => item.name === store);
  if (!unit) throw new Error("Unidade inválida.");
  return preferences?.fulfillment === "delivery" ? unit.deliveryFee : 0;
}
export function orderSummary(order: Order, store: string) {
  const delivery = order.fulfillment === "delivery";
  return `${order.quantity || 1}× ${order.product}\nUnidade: ${store.split(" · ")[1]}\n${delivery ? "Entrega" : "Retirada na loja"}${delivery && order.address ? `: ${addressLabel(order.address)}` : ""}\nItens: ${currency(order.subtotal ?? order.price)}\nFrete fictício: ${currency(order.deliveryFee || 0)}\nTotal: ${currency(order.price)}\nPrazo estimado: ${delivery ? catalog.fulfillment.deliveryEstimate : catalog.fulfillment.pickupEstimate}\nPagamento ${delivery ? "na entrega" : "na retirada"}. Simulação, sem cobrança real.`;
}
