# Padrão visual dos registros no RD Station

Os textos enviados pela integração são montados em `services/concierge/crm_formatting.py`. O padrão usa emojis por assunto, títulos curtos, seções fixas, listas e referências técnicas no rodapé.

## Ativação e compatibilidade

Reinicie o serviço Python para carregar os novos templates. O padrão é aplicado às próximas sincronizações. As notas já registradas mantêm o histórico original: a API v2 documenta criação e listagem de notas, sem operação de edição.

Configuração opcional no `.env` da raiz:

```dotenv
RD_CRM_TEXT_FORMAT=markdown
```

- **`markdown` (padrão):** `##` e `###` para títulos, negrito nos nomes dos campos, listas e citações para comentários. Não utiliza tabelas, tabulações ou espaços para simular colunas.
- **`text`:** mesmos emojis, ordem, conteúdo e espaçamento, sem sintaxe Markdown. Use se a interface RD exibir os símbolos de Markdown literalmente.

A API recebe `description` como texto e não especifica garantia de renderização Markdown. A aparência final depende da interface do RD. O adaptador não envia HTML para estilização e não pressupõe suporte a cores, fontes ou tabelas. Conteúdo informado pelo cliente é escapado para não virar marcação ou um marcador falso da integração.

## Títulos de negociações

| Tipo | Exemplo de título |
| --- | --- |
| Pedido | 🍔 Pedido · Pinheiros · SE-B2D53AE4 |
| Reserva | 📅 Reserva · Moema · RS-AB12CD34 |
| Aniversário | 🎂 Aniversário · Vila Mariana · RS-AB12CD34 |
| Atendimento de CSAT | ⭐ CSAT · Pinheiros · CSAT-ID_DA_PESQUISA |
| Atendimento prioritário | 🚨 Atenção · Moema · SENT-ID_DA_OCORRÊNCIA |

As tarefas de alerta usam **🚨 Priorizar atendimento · Unidade · código curto**. O código curto é apenas visual: a identificação usa o marcador completo presente na descrição. A preferência por uma pessoa aparece no corpo como **🙋 Atendimento humano solicitado**, sem classificar automaticamente esse cliente como insatisfeito.

Os títulos são determinísticos por operação e unidade. Antes de criar uma negociação, o worker procura vínculos salvos e também os títulos antigo e novo. Isso permite recuperar um envio aceito anteriormente pelo RD sem criar outra negociação. Encontrar dois registros distintos para a mesma operação gera **Ação necessária**, para revisão.

## Organização das descrições

- **Pedidos:** cliente/unidade → itens → recebimento/endereço → valores → próximo passo → data de confirmação → referências.
- **Reservas e aniversários:** cliente/unidade → data/horário/pessoas → próximo passo → confirmação → referências.
- **CSAT:** cliente/unidade → nota e estrelas → comentário citado → encerramento e resposta → referências.
- **Ligações:** cliente → resumo preservado como citação → data → referências.
- **Alertas:** cliente/unidade → prioridade e motivo → trecho da conversa → acompanhamento → próximo passo → referências.

Datas de registro são exibidas em **dd/mm/aaaa às hh:mm (Brasília)**, com conversão pelo fuso `America/Sao_Paulo`. Datas de reservas aparecem em **dd/mm/aaaa**. Valores usam **R$ 1.234,56**, a partir dos valores gravados no evento; a formatação não recalcula nem altera o preço da negociação.

Os marcadores `[sabor-event:…]` ficam no final e continuam sendo usados para evitar duplicação. O histórico inicial da anotação é preservado; quando chega uma nova evidência de insatisfação, a descrição da tarefa da ocorrência é atualizada pelo worker.

## Exemplo de anotação de pedido

Dados ilustrativos; o identificador do evento abaixo é apenas um exemplo.

---

## 🍔 Pedido confirmado · SE-DEMO

### 👤 Cliente e unidade
- **Cliente:** Cliente Teste
- **Telefone:** +5511999990000
- **Unidade:** São Paulo · Pinheiros

### 🛍️ Itens do pedido
- **Produto:** Combo Bacon
- **Quantidade:** 2

### 🚚 Recebimento
- **Modalidade:** Entrega
- **Endereço:** Rua de Teste, 123
- **Bairro:** Pinheiros
- **Complemento:** Apto 4
- **Pagamento previsto:** Na entrega

### 💰 Valores
- **Subtotal:** R$ 79,80
- **Frete fictício:** R$ 6,90
- **Total do pedido:** R$ 86,70

### ✅ Próximo passo
- **Ação da equipe:** Conferir o pedido na unidade e acompanhar o preparo e o recebimento.

🧪 Pedido confirmado no sistema demonstrativo; não houve cobrança real nem acionamento de entrega.

### 🕒 Confirmação
- **Registrada em:** 13/09/2026 às 21:41 (Brasília)

---

### 🔎 Referências da integração
- **Conversa:** conversation-demo
- **Operação:** SE-DEMO

[sabor-event:ID_DO_EVENTO]

---

## Testes

Em `services/concierge`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_crm_formatting.py"
```

Os testes verificam os dois formatos, conteúdo dinâmico, moeda, conversão de fuso, marcadores, recuperação de títulos antigos, resposta incerta e colisão de códigos curtos. Os testes de entrega usam transporte RD simulado, sem escrever registros na conta conectada.
