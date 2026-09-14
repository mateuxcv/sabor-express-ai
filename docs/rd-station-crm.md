# RD Station CRM v2

A tela `/crm` conecta uma conta real do **RD Station CRM** à demonstração Sabor Express. A integração usa API direta no Python e uma fila persistida no mesmo SQLite dos pedidos e reservas.

A estrutura sugerida dos funis por unidade e a rotina da equipe estão no [CRM operations guide](crm-operations-guide.md). Os IDs devem ser selecionados na própria conta conectada; configurações locais de uma conta específica não são distribuídas no repositório.

Títulos com emojis e descrições estruturadas seguem o [padrão visual dos registros](padrao-rd-station.md), com moeda brasileira, datas no fuso de Brasília e referências no rodapé. `RD_CRM_TEXT_FORMAT=markdown` é o padrão; `text` permite exibição sem sintaxe Markdown.

## Conectar sua conta

1. No [App Publisher da RD](https://appstore.rdstation.com/pt-BR/publisher), crie um aplicativo para o produto **CRM** e obtenha `client_id` e `client_secret`. A documentação da API v2 indica disponibilidade nos planos Basic, Pro e Advanced.
2. Cadastre o callback completo no aplicativo. Para a demo local:

   ```text
   http://localhost:3000/api/crm/callback
   ```

3. Adicione as variáveis ao **`.env` da raiz**, preservando as configurações Azure existentes:

   ```dotenv
   RD_CRM_CLIENT_ID=seu-client-id
   RD_CRM_CLIENT_SECRET=seu-client-secret
   RD_CRM_REDIRECT_URI=http://localhost:3000/api/crm/callback
   ```

   Em um domínio publicado, use o callback HTTPS desse domínio. A URL cadastrada, a variável e a origem usada no navegador devem corresponder; iniciar em um IP e voltar em localhost perde o cookie de autorização.

4. Reinicie Next.js e Python (`iniciar.bat`, ou `npm run dev` e `npm run dev:crew`).
5. Acesse **http://localhost:3000/crm**, clique em **Conectar RD Station CRM**, selecione a conta e autorize o aplicativo.
6. Selecione **funil, etapa e responsável** de cada unidade que será demonstrada. As opções vêm da conta conectada. Nesta versão, pedidos e reservas da mesma unidade usam a mesma etapa configurada.
7. No WhatsApp demonstrativo, abra **Opções da conversa → Identificar cliente** e salve nome, telefone com DDD e, opcionalmente, e-mail. O perfil também pode ser editado nos detalhes do contato no inbox.
8. Com `ASSISTANT_PROVIDER=crewai`, confirme um pedido ou reserva por texto, áudio ou ligação. Acompanhe a fila em `/crm` ou o card do contato e clique em **Ver no RD** após sincronizar.

É possível preparar o perfil e confirmar operações antes de conectar o CRM. Elas ficam na fila até haver conexão, mapeamento e identificação do cliente.

## O que é enviado

| Evento | Resultado no CRM |
| --- | --- |
| Pedido confirmado | Contato, negociação `🍔 Pedido · Unidade · SE-...` com `one_time_price` calculado pelo catálogo (itens + frete fictício) e anotação de produto, quantidade, unidade, modalidade, endereço quando houver entrega e código. [Detalhes](pedidos-e-entrega.md). |
| Reserva/aniversário confirmado | Contato, negociação `📅 Reserva · Unidade · RS-...` ou `🎂 Aniversário · Unidade · RS-...` e anotação de data, horário, pessoas, unidade e código. Sem valor de venda. |
| Ligação encerrada | Resumo textual como anotação na negociação da última operação confirmada até o término da ligação. Sem operação, o evento fica somente local. |
| CSAT respondido | Nota e comentário como anotação na negociação vinculada no encerramento. Sem operação, cria atendimento sem valor no funil da unidade, em Pós-atendimento. [Detalhes](csat.md). |
| Alerta de prioridade alta | Anotação e tarefa para o responsável. Reutiliza a negociação da operação ou cria atendimento de atenção sem valor no destino da unidade. [Análise preventiva](sentimento.md). |

As negociações são criadas como **`ongoing`**, conforme a API v2. A etapa representa a confirmação operacional. Os pedidos continuam fictícios: o valor informa a negociação, sem cobrança ou venda real. As reservas não contam como receita. O áudio da ligação não é enviado ao CRM.

O telefone normalizado identifica o cliente local. O adaptador reutiliza o vínculo remoto salvo ou busca contato por telefone e, depois, por e-mail. Correspondências múltiplas ou conflitantes aparecem como ação necessária. Cada pedido/reserva tem sua própria negociação, mesmo quando pertence à mesma conversa. Editar o perfil local não atualiza retroativamente contatos já existentes no RD.

## Fila e recuperação

- A confirmação e o evento são gravados **na mesma transação SQLite**. Pedido, estoque e evento são revertidos juntos se essa gravação falhar. A disponibilidade da API RD não interfere na confirmação local.
- O worker roda junto do FastAPI, com limite entre requisições, tratamento de `429`, `Retry-After` e até seis tentativas automáticas para falhas transitórias.
- IDs determinísticos evitam repetir eventos locais. Vínculos persistidos, nome da negociação com código da operação e marcadores nas anotações permitem reconciliar reprocessamentos.
- Se uma escrita remota termina sem resposta conclusiva, o estado é **Conferir no CRM**. Confira o registro e use **Reprocessar**: o worker busca o resultado anterior antes de criar novamente. Não há garantia distribuída de execução exatamente uma vez pela API remota.
- **Ação necessária** indica perfil, mapeamento, autorização ou dados que precisam ser corrigidos. Salvar perfil/mapeamento libera os eventos bloqueados por esse motivo; os demais podem ser reenfileirados na tela.
- Confirmações antigas sem evento podem ser incluídas pelo botão **Sincronizar confirmações** no card do contato. Somente registros confirmados no SQLite são aceitos.
- Uma nova autorização OAuth recebe uma identidade de conexão nova. Refaça o mapeamento e reprocesse explicitamente eventos vinculados à conexão anterior. A troca não reaproveita automaticamente IDs remotos de outra conta.

## Persistência e OAuth

- Banco padrão: `services/concierge/.data/sabor.sqlite3`.
- Tokens criptografados no banco; chave local: `services/concierge/.data/sabor.sqlite3` com extensão substituída por `.crm.key` (`sabor.crm.key`). Ambos devem ser preservados juntos ao transferir a demo. A chave no mesmo computador protege o conteúdo do banco isoladamente, não contra acesso completo à máquina.
- O `access_token` expira em aproximadamente duas horas. A renovação é serializada no processo e salva o novo `refresh_token` retornado pelo RD.
- Cookie OAuth `HttpOnly`, `SameSite=Lax`, validade de dez minutos e validação de `state` antes da troca do código. Segredos e tokens ficam no servidor.
- **Desconectar** remove as credenciais locais e interrompe novas sincronizações; os registros já criados permanecem no RD. A revogação do aplicativo é feita na conta RD.
- A demo utiliza um processo Python/worker. Autenticação de operadores, isolamento entre contas e coordenação de múltiplos workers fazem parte da evolução para produção.

## Verificação local sem acessar a conta RD

```powershell
# Executar a partir de services/concierge
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_crm.py
```

```powershell
# Executar a partir da raiz
npx tsx --test tests/crm-oauth.test.ts
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_PORT = "3000"
npx playwright test e2e/crm.spec.ts
```

Os testes usam transporte HTTP simulado e bancos temporários. A validação na conta real depende de preencher as credenciais, concluir OAuth e escolher o destino das negociações.

## Referências

- [Autenticação CRM v2](https://developers.rdstation.com/reference/crm-v2-authentication)
- [Gerar código](https://developers.rdstation.com/reference/crm-v2-authentication-step-2)
- [Obter tokens](https://developers.rdstation.com/reference/crm-v2-authentication-step-3)
- [Criar negociação](https://developers.rdstation.com/reference/crm-v2-create-deal)
- [Criar anotação](https://developers.rdstation.com/reference/crm-v2-create-note-to-deal)
