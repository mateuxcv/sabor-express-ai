# Cards de unidade, entrega e retirada

## Experimentar

1. Reinicie o serviço Python após atualizar o projeto. A migração adiciona campos de entrega aos pedidos existentes, preservando valores e confirmações, e cadastra estoque simulado para os novos produtos.
2. Abra `/whatsapp` e inicie **Nova conversa**, no menu superior. Conversas antigas continuam com a unidade e o histórico originais.
3. Escolha **Pinheiros**, **Vila Mariana** ou **Moema** no card.
4. Escolha **Retirar na loja** ou **Receber por entrega**. Para entrega, informe rua, número, bairro e, opcionalmente, complemento.
5. Escolha um dos sete itens. Confira unidade, modalidade, endereço, subtotal, frete, total e prazo antes de clicar em **Confirmar pedido**.
6. Confira os mesmos dados no inbox, no card do pedido e em **Ver pedido completo**.

É possível escrever uma dúvida, solicitar reserva ou pedir uma pessoa sem concluir o formulário de pedido. A análise de sentimento continua com prioridade sobre a venda. Se um produto for solicitado antes de escolher os cards, a mensagem é retomada depois das escolhas.

## Valores demonstrativos

| Unidade | Frete de entrega | Retirada |
| --- | ---: | ---: |
| Pinheiros | R$ 6,90 | Sem frete |
| Vila Mariana | R$ 7,90 | Sem frete |
| Moema | R$ 8,90 | Sem frete |

Prazo fictício de retirada: **20 a 30 minutos**. Entrega: **40 a 60 minutos**. Pagamento descrito para entrega/retirada, sem cobrança real. O frete é fixo por unidade e não consulta distância, CEP ou cobertura de entregadores.

| Novo item | Preço |
| --- | ---: |
| Combo Bacon | R$ 39,90 |
| Batata Cheddar | R$ 16,90 |
| Milkshake de Chocolate · 400 ml | R$ 18,90 |
| Brownie de Chocolate | R$ 12,90 |

Os três combos anteriores continuam no cardápio. Acompanhamento, bebida e sobremesa são itens avulsos. O fluxo continua com um tipo de produto por pedido; o backend aceita de 1 a 10 unidades do mesmo produto.

## Implementação e confirmação

- Catálogo, estoque inicial por produto, frete e prazos: `src/lib/catalog.json`.
- Cards e formulário: `src/components/order-setup.tsx`. Escolhas são preservadas entre recargas e abas do mesmo navegador.
- O modo `demo` monta resumos demonstrativos; `crewai` consulta estoque e grava pedidos no SQLite.
- O backend calcula subtotal e frete a partir do catálogo, usando valores decimais. O frete é somado uma única vez por pedido, independentemente da quantidade. Valores de frete enviados pelo navegador não definem o preço.
- Pedidos salvos incluem um retrato dos valores e do endereço. Repetir uma confirmação não desconta estoque novamente.
- **Alterar recebimento**, antes da confirmação, descarta o resumo anterior. O novo resumo exige outra confirmação. Uma mudança de modalidade/endereço também invalida o token antigo no backend.
- A unidade provisória pode mudar na escolha inicial. Depois de vincular a conversa à unidade ou iniciar uma operação, abra outra conversa para trocar de unidade.
- Pedidos anteriores à atualização são lidos como retirada, com frete zero. Não há limpeza ou reposição do estoque existente.

## RD Station

Pedidos confirmados no modo `crewai` continuam usando o funil da unidade escolhida. `one_time_price` recebe o total **incluindo frete fictício**. A anotação inclui subtotal, frete, modalidade e endereço quando houver entrega. Não há cobrança ou acionamento de entrega real. A sincronização usa a fila existente, com identificação do cliente e mapeamento da unidade.

## Testes

Na raiz:

```powershell
npm run typecheck
npm run lint
npm test
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_PORT = "3000"
npx playwright test e2e/ordering.spec.ts e2e/demo.spec.ts e2e/sentiment.spec.ts
```

Em `services/concierge`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_ordering.py"
```

Cobertura: sete produtos, frete por unidade, retirada gratuita, validação de endereço, escolha inicial de unidade, alteração de recebimento, confirmação idempotente, migração de pedidos antigos, contexto no CRM e interface mobile. Os testes usam sistemas temporários e respostas simuladas, sem criar pedidos no CRM conectado.
