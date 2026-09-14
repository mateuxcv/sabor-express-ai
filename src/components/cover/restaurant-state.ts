export type Spot = "table" | "counter" | "lia" | "record";
export type Mood = "day" | "night";
export type OrderState = "idle" | "preparing" | "ready";

export interface RestaurantState {
  people: 2 | 4;
  dish: "classic" | "veggie";
  reserved: boolean;
  order: OrderState;
  human: boolean;
  mood: Mood;
}

export const initialRestaurant: RestaurantState = {
  people: 2, dish: "classic", reserved: false, order: "idle", human: false, mood: "day",
};

export const spots = [
  { id: "table", label: "Escolha sua mesa", short: "Uma mesa", number: "01", hint: "Mude os lugares. Faça uma reserva." },
  { id: "counter", label: "Passe no balcão", short: "Um pedido", number: "02", hint: "Escolha um combo e veja o preparo." },
  { id: "lia", label: "Converse com a Lia", short: "Uma conversa", number: "03", hint: "A IA recebe. A equipe continua." },
  { id: "record", label: "Abra a comanda", short: "Sua comanda", number: "04", hint: "Tudo que você fez fica por aqui." },
] as const;

export function summary(state: RestaurantState) {
  return {
    reservation: state.reserved ? `Mesa para ${state.people} · reserva demonstrativa` : `Mesa para ${state.people} · ainda não reservada`,
    dish: state.dish === "classic" ? "Combo clássico" : "Combo vegetariano",
    order: state.order === "ready" ? "Pronto para retirada" : state.order === "preparing" ? "Em preparo" : "Nenhum pedido preparado",
    owner: state.human ? "Ana · equipe humana" : "Lia · recepção",
  };
}
