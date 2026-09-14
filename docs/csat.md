# CSAT no encerramento da conversa

## Fluxo

1. No inbox, clicar em **Finalizar** registra uma pesquisa no backend e encerra a conversa.
2. A pesquisa aparece como mensagem na visão do cliente (`/whatsapp`), com notas de **1 a 5** e comentário opcional de até 1.000 caracteres.
3. O cliente escolhe uma nota e clica em **Enviar avaliação**. A confirmação só aparece após a resposta ser salva.
4. Nota e comentário aparecem no inbox. A resposta não reabre a conversa nem é enviada ao modelo como mensagem de atendimento.
5. Em **Visão geral → Satisfação dos clientes · CSAT**, os indicadores e o histórico são atualizados a cada cinco segundos. Há filtro por unidade e atualização manual.
6. Um evento `csat.answered` é criado atomicamente com a resposta, para sincronização com o RD Station. A tela `/crm` mostra esse evento como **Avaliação CSAT**.

O envio acontece no canal demonstrativo já utilizado pela ferramenta, sincronizado entre abas do mesmo navegador/origem. Não há envio pela WhatsApp Business Platform. A coleta funciona tanto no atendimento demo quanto no CrewAI, mas depende do serviço Python estar ativo.

## Reabertura e falhas

- Há **uma pesquisa por conversa**. Reabrir e finalizar novamente mantém a pesquisa e a resposta originais. Uma nova conversa pode gerar nova pesquisa.
- Cliques repetidos, recarga e repetição de uma resposta idêntica não geram avaliações ou eventos duplicados. Uma resposta diferente para uma pesquisa já respondida é recusada.
- Se o registro da pesquisa falhar, a conversa não é marcada como finalizada: o inbox mostra erro e permite tentar novamente.
- Se o envio da resposta falhar, a nota e o comentário digitados continuam no formulário para nova tentativa. Em resultado incerto, repetir a mesma resposta é seguro.
- A resposta e as métricas permanecem salvas mesmo com o RD desconectado. O envio remoto usa a fila persistente, com retentativas e reconciliação das anotações.
- Finalizar durante uma ligação preserva o encerramento da ligação existente no fluxo do inbox.

## Dashboard

Os números são calculados no backend sobre todo o histórico salvo, ou sobre a unidade selecionada:

- **CSAT:** quantidade de notas 4 e 5 dividida pelo total de respostas, em percentual.
- **Nota média:** soma das notas dividida pela quantidade de respostas, de 1 a 5.
- **Taxa de resposta:** pesquisas respondidas divididas pelas pesquisas registradas, em percentual.
- **Aguardando resposta:** pesquisas registradas menos pesquisas respondidas.
- Distribuição das notas e até 50 pesquisas recentes, com comentário e situação no CRM.

Sem respostas, média e CSAT aparecem como `—`. Os indicadores são distintos das metas propostas e dos contadores de demonstração já existentes.

## Registro no RD Station

- Com pedido/reserva vinculado até o envio da pesquisa: adiciona anotação na negociação da última operação daquela conversa. Aguarda a sincronização da operação quando necessário. Uma operação criada depois da pesquisa não recebe retroativamente a avaliação anterior.
- Sem operação vinculada: cria uma negociação de atendimento `⭐ CSAT · Unidade · CSAT-…`, sem valor de venda, no funil da unidade e na etapa **Pós-atendimento**, com responsável definido pelo mapeamento. Continua `ongoing`; a avaliação não decide ganho ou perda.
- A anotação contém nota, comentário, unidade, data de encerramento, data da resposta, ID da conversa e ID da pesquisa. Marcadores de evento permitem reconciliar respostas incertas sem repetir a anotação.
- O atendimento sem operação exige cliente identificado (nome e telefone), conta conectada, mapeamento da unidade e etapa **Pós-atendimento**. Se faltar identificação, a avaliação fica no dashboard e o evento aparece como **Ação necessária**. Identificar o cliente pelo card do contato libera o bloqueio correspondente.
- O fluxo não altera etapa, valor ou status de negociações de pedidos/reservas existentes.

## Persistência e ativação

Tabela `csat_surveys` no SQLite operacional (`services/concierge/.data/sabor.sqlite3`), criada automaticamente na inicialização. A fila é a tabela `crm_events` existente. Limpar o histórico visual do navegador não remove as pesquisas do backend.

Após atualizar o código, reinicie o serviço Python e recarregue as telas. Rotas novas: `GET/POST /api/csat` no Next.js, com proxy para `/crm/csat`, `/crm/csat/issue` e `/crm/csat/answer` no Python. As mesmas regras de origem e autenticação entre serviços do CRM são aplicadas.

## Verificação

```powershell
# A partir de services/concierge
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_c*.py"
```

```powershell
# A partir da raiz
npm test
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_PORT = "3000"
npx playwright test e2e/csat.spec.ts
```

Os testes usam banco temporário e transporte RD simulado. Os testes de navegador simulam as rotas CSAT para não registrar avaliações de teste no CRM conectado.
