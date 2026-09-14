# Roteiro de apresentação · Sabor Express

## Mensagem central

**Atendimento rápido para recuperar oportunidades de venda, com controle humano para proteger a experiência.**

A demo materializa a proposta. O projeto inclui diagnóstico, implantação, adoção e medição de valor.

**Atualização técnica:** a recepção agora suporta CrewAI Flows com especialistas em pedidos, reservas, aniversários e informações. O modo demo local continua disponível. Veja a configuração e os limites em [crewai.md](crewai.md).

## Premissas explícitas

- Os dados informados pelo cliente são: 42 lojas, mais de 3 mil mensagens/dia, ticket médio de R$ 35, crescimento de 15%/ano e esperas de até 40 minutos em algumas lojas. Mensagens não equivalem a conversas, pedidos ou compradores.
- As três lojas da demo são exemplos fictícios. A seleção real considera volume, perfil de cliente, maturidade operacional e ao menos um franqueado cético.
- A proposta ao conselho ocorre nas próximas três semanas. O cronograma de 60 dias começa **após aprovação e disponibilização dos acessos**, hipótese a confirmar com a diretora.
- Acesso à WhatsApp Business Platform, sandbox da API de pedidos e plano/produto do RD Station ainda precisam ser validados. Atrasos de aprovação externa são dependências de cronograma.
- Tempos, preços, horários e métricas na demo são fictícios. Metas dependem da baseline e de aprovação conjunta.
- Começamos com pedidos para retirada e pagamento na loja. Entrega, cálculo de frete e pagamento online exigem regras e integrações adicionais.

## Agenda · 20 minutos

| Tempo | Tema | O que mostrar |
|---|---|---|
| 0–2 min | Diagnóstico e objetivo | Dor de receita, inconsistência e trauma do bot anterior |
| 2–5 min | Solução e escopo | Inbox, assistente, conhecimento por unidade e controle humano |
| 5–9 min | Demonstração | Cardápio → pedido confirmado → reclamação → humano |
| 9–12 min | Implantação e pessoas | Piloto em 3 lojas, controles, expansão e donos |
| 12–15 min | KPIs e valor | Indicadores simples e o que queremos melhorar |
| 15–17 min | Riscos e automação | Fallback, integrações e fluxo proposto no n8n |
| 17–20 min | Pitch em inglês | Síntese do valor e próximo passo concreto |

## 1. Escopo

**Incluído no piloto:** informações aprovadas da loja, cardápio, triagem de intenção, criação de pedidos simples após confirmação, consulta de status, registro no CRM, fila por unidade e transferência com histórico. A qualidade é avaliada pelo desfecho da demanda e pelo motivo de eventuais retornos, vinculados ao pedido. Um novo pedido não é uma reabertura; uma consulta legítima de status não é automaticamente erro da IA.

**Fora do escopo inicial:** reembolsos e cancelamentos autônomos, negociação de reclamações, reservas confirmadas automaticamente, respostas sobre alergênicos sem validação, campanhas de marketing em massa, pagamentos online e decisões sobre exceções financeiras. A assistente encaminha esses casos.

### Validação técnica sem depender de escrever código

- Fazer uma sessão com o dono da API e o administrador do CRM. Confirmar produto do RD Station, autenticação, permissões, endpoints, webhooks, limites e ambiente de testes.
- Usar Postman para consultar um cardápio, criar um pedido fictício, receber o ID e consultar seu status. Verificar a unidade correta e o preço retornado.
- Enviar um evento de teste para n8n e visualizar cada etapa. Repetir o mesmo evento para validar deduplicação.
- Simular API lenta, erro 429, credencial inválida e resposta incompleta. Confirmar alerta, retry limitado e encaminhamento para um humano.
- Definir o identificador de correlação para rastrear mensagem → conversa → pedido → contato no CRM.
- Validar opt-in, janela de atendimento e templates quando aplicáveis ao WhatsApp; confirmar requisitos de retenção e acesso com a pessoa responsável por dados.

## 2. Implantação

### Antes da aprovação · até 3 semanas

Entrevistas com operações e franqueados, amostra anonimizada de conversas, auditoria da experiência anterior, checagem dos acessos, mapa de sistemas e proposta ao conselho com custos, riscos, capacidade e metas preliminares.

### Após a aprovação · 60 dias

| Período | Entregável | Critério de saída |
|---|---|---|
| Dias 1–10 | Baseline, escopo, matriz de responsáveis e 3 lojas-piloto + controles | Donos definidos, acessos e fontes disponíveis |
| Dias 11–25 | Conectores em sandbox, conhecimento validado e testes com equipe | Fluxos críticos aprovados, falhas e duplicatas testadas |
| Dias 26–40 | Piloto assistido em 3 lojas | Qualidade estável, adoção e metas acompanhadas |
| Dias 41–60 | Expansão progressiva para 10, depois 15, depois 14 lojas adicionais | Gate após cada onda; capacidade operacional confirmada |

O objetivo em 60 dias é resultado demonstrável. A expansão para todas as 42 lojas é condicionada aos gates, não uma promessa independente da qualidade. Se uma onda falhar, estabilizamos as lojas atuais.

### Piloto controlado

1. Baseline de pelo menos uma semana, cobrindo picos, fim de semana, volume, conversão e satisfação. Se não houver histórico comparável, estender a janela de medição.
2. Três lojas com perfis diferentes e três controles comparáveis. Normalizar por horário, intenção, promoção e volume; não atribuir todo aumento à IA.
3. Primeiro operar em modo sombra, com revisão das sugestões. Ativar respostas automáticas apenas nos assuntos aprovados.
4. Atendimento humano disponível no horário publicado, botão de pausa por loja e responsável pelo fallback.
5. Revisão diária de falhas e amostra de conversas. Check-in semanal com franqueados, treinamento curto e canal de feedback.
6. Avançar quando não houver falhas críticas, CSAT não deteriorar, transferências funcionarem e adoção/conversão atingirem patamares acordados. Proposta: 7 dias estáveis antes de cada onda.

### Stakeholders

| Pessoa / equipe | Responsabilidade e cadência |
|---|---|
| Diretora de Operações | Sponsor; remove bloqueios e aprova escopo; atualização semanal |
| Conselho | Aprova investimento e acompanha resultado; proposta em 3 semanas e balanço do piloto |
| Franqueados-piloto | Validam dados, indicam atendentes e cocriam fluxos; encontros semanais |
| Atendentes / líderes de loja | Usam inbox, revisam exceções e reportam falhas; check-in diário inicial |
| CS / liderança HeadOffice.ai | Coordena entregas, riscos, treinamento e narrativa de valor |
| TI / responsável pelo sistema de pedidos | Acessos, contratos de API, sandbox e incidentes |
| Marketing / dono do RD Station | Mapeamento de contatos, campos, consentimento e funil |
| Responsável por dados e segurança | Permissões, minimização de dados e retenção |

## 3. KPIs

Use cinco indicadores familiares de atendimento, vendas e adoção. A apresentação não exige contas nem traz metas numéricas sem diagnóstico.

**Abertura:** “Vamos olhar cinco coisas simples: rapidez, resolução, satisfação, pedidos concluídos e uso pela equipe.”

- **Tempo de resposta — TPR:** “Vamos acompanhar se o cliente recebe uma primeira resposta útil mais rápido.”
- **Resolução no primeiro contato — FCR:** “Queremos resolver a solicitação no primeiro atendimento, sem fazer o cliente voltar pelo mesmo problema.”
- **Satisfação do cliente — CSAT:** “Vamos perguntar ao cliente se ele ficou satisfeito com o atendimento recebido.”
- **Conversão em pedidos:** “Vamos observar se quem procura a loja para comprar consegue concluir o pedido.”
- **Adoção da equipe:** “Vamos acompanhar se os atendentes realmente usam a central no dia a dia.”

**Fechamento:** “O piloto precisa ajudar o cliente a comprar, facilitar o trabalho da equipe e manter a satisfação.”

As metas serão combinadas com Operações no diagnóstico. Acompanhar histórico de atendimento, pesquisa de satisfação, pedidos confirmados e uso da plataforma, comparando a situação atual com o piloto em lojas semelhantes. Os resultados reais ainda precisam ser coletados e validados.

**Se perguntarem sobre retornos:** um novo pedido é um novo atendimento. Voltar pelo mesmo problema pode indicar falta de resolução; uma consulta legítima de status não é automaticamente falha. A equipe pode assumir e resolver no próprio atendimento. Para o piloto, considerar retirada; delivery, se incluído depois, é avaliado separadamente.

O botão **Guia de fala dos KPIs** no slide 5 e suas notas trazem essas frases, onde acompanhar cada indicador e um lembrete simples para perguntas. Conteúdo editável em `src/components/presentation/measurement.ts`.

### Como falar de dinheiro sem inventar ROI

Avaliar pedidos adicionais sustentados pela comparação e pelo tamanho da amostra, ticket realmente observado, margem de contribuição e custos de plataforma, IA, WhatsApp e operação. Conversão maior não garante retorno positivo. Não multiplicar mensagens pelo ticket médio nem atribuir toda a diferença antes/depois à IA.

## 4. Riscos e mitigação

| Risco | Mitigação concreta |
|---|---|
| Repetir o bot que não entende | Intenções estreitas e testadas; humano acessível; revisão das conversas desconhecidas |
| Informação errada de uma unidade | Fonte versionada por loja, dono e data de revisão; sem informação, encaminhar |
| Pedido duplicado ou API indisponível | Chave de idempotência; confirmação só após retorno válido; retries limitados e fila de exceção |
| Transferência sem atendente disponível | Escala por loja, alerta de SLA e informação honesta ao cliente sobre espera |
| Franqueados abandonarem a solução | Cocriação, treinamento prático, “campeão” local e resultados por loja; liberdade de pausa |
| Automação encerrar sem resolver | Auditar desfecho e correções da mesma falha por pedido/motivo; distinguir de novo pedido ou consulta legítima de status |
| Integrações atrasarem | Validar acessos cedo; escopo de contingência com FAQ e triagem, sujeito à aprovação |
| Exposição de dados entre unidades | Isolamento por unidade, controle de acesso, logs e retenção definida |

**Confiança com franqueados:** começar ouvindo o que deu errado; mostrar a transferência funcionando; dar visibilidade aos resultados; reconhecer problemas rapidamente. A solução deve reduzir o trabalho deles, não apenas adicionar uma ferramenta.

## 5. Vibe coding e automação

**Já implementado:** recepção identifica intenções, encaminha para especialistas e usa sistemas fictícios de agenda, estoque e pedidos em SQLite. A demo funcional pode confirmar reservas e pedidos após consulta e consentimento contextual, gerando códigos e registros persistentes. Isso demonstra a integração técnica; não representa disponibilidade de lojas reais. O plano inicial do cliente continua sujeito à validação das regras de negócio. Há também um modo local simplificado, identificado na interface.

**Próxima automação proposta no n8n:**

```text
Webhook de evento
  → validar origem e formato
  → deduplicar pelo ID do evento
  → obter unidade e conversa
  → classificar intenção (regras + LLM para casos aprovados)
  → consultar fonte / API autorizada
  → responder ou abrir tarefa humana
  → atualizar contato e resultado no RD Station
  → registrar eventos de KPI
  → alertar responsável quando o SLA se aproximar do limite
```

Validar primeiro em sandbox com payloads reais anonimizados. O workflow acima é um desenho de integração, não um conector já instalado. Um fluxo noturno adicional pode consolidar desconhecidos e gerar uma lista de melhorias da base, aprovada pelo franqueado antes de publicação.

## Pitch em inglês · aproximadamente 2–3 minutos

> Our proposal is simple: give every Sabor Express customer a fast, helpful response on WhatsApp, while keeping your franchise teams in control.
>
> Today, your stores receive more than three thousand messages a day. Some customers wait forty minutes for a reply. We cannot assume that every unanswered message is a lost order, but we can measure where customers drop off and test whether faster service helps them complete a purchase.
>
> We will start with the conversations that are useful and predictable: menu questions, store information, simple orders, and order status. The assistant will use approved information from the right store. It will only confirm an order after the customer agrees and the order system accepts it.
>
> When a customer is upset, asks for a person, or needs something the assistant cannot reliably answer, a team member takes over with the full conversation history. Customers should never have to fight a bot to get help.
>
> I know your franchisees have already had a bad experience with automation. That is why we will build this with them. We will choose three pilot stores, train their teams, review conversations together, and give them a clear way to pause the assistant.
>
> The business outcome we want is more completed orders from the customers who already contact you, with less repetitive work for your teams. We will measure conversion, response time, first-contact resolution, customer satisfaction, and actual team adoption. We will set targets together after measuring the starting point, and compare the pilot with similar stores before claiming a return on investment.
>
> Within three weeks, we will bring your board a scoped proposal, the integration findings, and a measurable pilot plan. After approval, we will work toward demonstrable results within sixty days. Expansion will happen in stages, only when service quality and operational readiness support it.
>
> The next step is a kickoff with you, three franchise representatives, and the owners of your CRM and order system. Together, we will confirm access, select the pilot stores, and agree on what success looks like. Let’s earn the right to scale by proving value in a small, controlled pilot first.
