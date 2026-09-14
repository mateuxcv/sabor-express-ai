# Alertas preventivos de atendimento

O monitor analisa mensagens de texto e **transcrições revisadas de áudios**, desde a primeira mensagem e também enquanto a conversa aguarda a equipe ou está com uma pessoa. Pesquisas CSAT, notas internas e eventos de interface não entram na análise. Ligações Realtime mantêm seu fluxo de transferência próprio; esta etapa não faz análise contínua da entonação ou dos turnos da ligação.

## Ativar e experimentar

1. Inicie Next.js e o serviço Python com `iniciar.bat`, ou `npm run dev` e `npm run dev:crew`. Reinicie o Python após atualizar: as tabelas são criadas automaticamente no SQLite existente.
2. No modo `crewai`, o monitor reutiliza o modelo Azure configurado na raiz. `SENTIMENT_USE_LLM=true` é o padrão; `false` usa somente regras. No modo `demo`, usa regras, sem chamada ao modelo. A persistência requer Python nos dois modos.
3. Abra `/whatsapp` e envie **“Você não está me entendendo, já expliquei isso”**. A conversa deve ir para a equipe, com uma única mensagem de encaminhamento.
4. No inbox, confira o destaque **Possível insatisfação · Prioridade alta**, o motivo e o trecho original. Em **Visão geral**, consulte **Clientes que precisam de atenção**, filtre por unidade e veja o tempo aguardando humano. Os alertas também aparecem no sino de notificações.
5. Clique em **Assumir atendimento**. O aceite é persistido e o tempo de espera deixa de avançar. A operadora deste protótipo é Ana Carvalho. **Marcar alerta como resolvido** encerra a ocorrência; depois disso é possível devolver a conversa à IA. Finalizar a conversa também resolve o alerta.
6. Em `/crm`, conecte a conta, configure unidade/funil/etapa/responsável e identifique o cliente para sincronizar a anotação e a tarefa. As credenciais existentes são reaproveitadas.

## Critérios

| Sinal | Comportamento |
| --- | --- |
| Pedido explícito de uma pessoa | Prioridade alta imediata; categoria própria, sem inferir que o cliente está insatisfeito. |
| Frustração ou reclamação clara | Prioridade alta, pausa da resposta operacional e encaminhamento. |
| Sinal leve ou solicitação repetida após resposta da IA | Atenção; dois sinais leves distintos na ocorrência elevam a prioridade. |
| Neutro, positivo ou emoção sem relação com o atendimento | Nenhum novo alerta. |

Regras objetivas tratam pedidos explícitos e sinais fortes sem esperar o modelo. A análise contextual usa histórico recente, saída estruturada e trecho literal da última mensagem. Evidência inventada é rejeitada. `confidence` é um sinal heurístico, **não uma probabilidade calibrada**: abaixo de 0,65 não há classificação positiva; entre 0,65 e 0,85, um resultado alto fica em atenção. Uma queda momentânea de sentimento não resolve automaticamente uma ocorrência aberta.

O classificador tem timeout de sete segundos e retorna às regras se o modelo falhar. A origem da classificação fica visível. Se o serviço de persistência falhar, a interface encaminha localmente para a equipe e informa **Análise não registrada**, com retentativa. Mensagens pendentes ficam no navegador e são retomadas na recarga. Não se mostra sucesso de CRM sem confirmação do worker.

## Persistência e concorrência

- `sentiment_assessments`: uma análise por `(conversation_id, message_id)`. Repetir a mensagem não eleva prioridade nem duplica eventos. Reutilizar o mesmo ID com outro texto é recusado.
- `sentiment_alerts`: uma ocorrência ativa por conversa, com nível, categoria, evidência, origem, datas, aceite e resolução. Uma nova reclamação depois da resolução pode abrir outra ocorrência.
- Alerta, análise e evento `sentiment.alerted` são gravados na mesma transação.
- Mensagens rápidas são analisadas em sequência. Uma tomada humana ou mensagem nova invalida respostas da IA em trânsito. A API do assistente também confere os alertas antes do atendimento operacional.
- Alertas permanecem no servidor após limpar o histórico visual. O histórico integral do chat continua no navegador de origem, conforme a arquitetura da demo. O painel informa quando esse histórico não está disponível localmente.

## RD Station CRM

- A prioridade alta gera um único evento por ocorrência. Sinais leves ficam apenas no monitoramento local.
- Havendo pedido/reserva confirmado antes do alerta, usa a negociação dessa operação e seu responsável. Se a operação ainda está na fila, aguarda o vínculo. Não muda o valor, etapa ou status dessa negociação.
- Sem operação, identifica/reutiliza o contato e cria **🚨 Atenção · Unidade · SENT-…**, sem valor de venda, no destino configurado para a unidade.
- Cria uma anotação inicial e uma tarefa aberta **🚨 Priorizar atendimento · Unidade · código curto**, atribuída ao responsável, com vencimento no momento em que a prioridade alta foi identificada. O ID completo está nas referências da descrição. Consulte o [padrão visual](padrao-rd-station.md).
- A anotação mantém o contexto inicial. Novas evidências atualizam a descrição da mesma tarefa; a API v2 documenta criação/listagem de notas, sem edição.
- Marcadores de evento e pesquisa da tarefa por negociação/nome permitem reconciliar respostas incertas sem criar uma tarefa nova. Escritas sem confirmação ficam em **Conferir no CRM** para reprocessamento explícito.
- O aceite e a resolução no painel registram o acompanhamento local. A conclusão da tarefa no RD é gerenciada pela equipe no próprio CRM.
- Push/e-mail nativo depende das configurações da conta RD. O sistema confirma a criação da tarefa e anotação, sem tratar isso como confirmação de push/e-mail.

## Verificação

Na raiz:

```powershell
npm run typecheck
npm run lint
npm test
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_PORT = "3000"
npx playwright test e2e/sentiment.spec.ts e2e/csat.spec.ts e2e/audio.spec.ts
```

Em `services/concierge`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_sentiment.py"
```

Os testes específicos usam SQLite temporário, classificador simulado quando necessário e transporte RD simulado. Cobrem negação, preferência por humano, evidência literal, timeout, deduplicação, elevação de prioridade, falha transacional, recuperação offline, permissões, resposta incerta, atualização da tarefa e preservação dos dados da venda.
