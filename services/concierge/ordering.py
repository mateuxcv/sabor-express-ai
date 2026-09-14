"""Preferências de entrega e resumos, com valores controlados pelo catálogo."""


def needs_setup(preferences):
    return bool(preferences and (not preferences.storeSelected or not preferences.fulfillment or
                                (preferences.fulfillment == "delivery" and not preferences.address)))


def address_label(address):
    return f"{address.street}, {address.number} · {address.district}" + (f" · {address.complement}" if address.complement else "")


def money(value):
    return f"R$ {value:.2f}".replace(".", ",")


def order_summary(order, store, catalog):
    delivery = order.fulfillment == "delivery"
    destination = f"Entrega: {address_label(order.address)}" if delivery and order.address else "Retirada na loja"
    estimate = catalog["fulfillment"]["deliveryEstimate" if delivery else "pickupEstimate"]
    return (f"{order.quantity}× {order.product}\nUnidade: {store.split(' · ')[-1]}\n{destination}\n"
            f"Itens: {money(order.subtotal if order.subtotal is not None else order.price)}\n"
            f"Frete fictício: {money(order.deliveryFee)}\nTotal: {money(order.price)}\n"
            f"Prazo estimado: {estimate}\nPagamento {'na entrega' if delivery else 'na retirada'}. "
            "Simulação, sem cobrança real.")
