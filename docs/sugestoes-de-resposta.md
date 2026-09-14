# Sugestões de resposta com IA para a equipe

O botão **Sugerir resposta**, no campo de resposta do inbox, consulta o modelo Azure para preparar mensagens com o tom de uma profissional experiente de Customer Success. A geração ocorre somente ao clicar no botão.

## Como usar

1. Reinicie o serviço Python e recarregue o dashboard após atualizar o projeto.
2. Abra uma conversa com ao menos uma mensagem do cliente e selecione **Responder**.
3. Clique em **Sugerir resposta**. O botão mostra o estado de geração enquanto a IA analisa o contexto.
4. Escolha uma das três versões: **Empática**, **Direta** ou **Próximo passo**.
5. Revise o texto no campo, ajuste se necessário e clique em **Enviar**.

Quando o campo está vazio e não foi editado durante a geração, a primeira alternativa é inserida automaticamente como rascunho. Se já houver texto, ou se a pessoa digitar durante a espera, o texto é preservado e as opções ficam disponíveis para aplicação explícita.

Gerar ou escolher uma sugestão não envia mensagens, não assume a conversa, não cria tarefas no RD e não confirma pedidos ou reservas. O envio continua sendo a ação normal da operadora no botão **Enviar**.

## Contexto e tom

- A análise recebe até 30 mensagens recentes, incluindo respostas da IA e da equipe. A última mensagem do cliente é identificada explicitamente e mantida no contexto mesmo quando há muitas respostas posteriores.
- Áudios já transcritos participam como texto. Arquivos de áudio não são enviados por este recurso.
- Notas internas, eventos da interface e mensagens de pesquisas CSAT são excluídos.
- O catálogo da unidade, as preferências de recebimento, pedidos/reservas e sinais de insatisfação ajudam a contextualizar a resposta.
- Quando há contexto operacional salvo no backend, ele tem prioridade sobre os dados do navegador. Sem registro persistido, os dados da interface são identificados como contexto demonstrativo.
- As instruções pedem acolhimento específico, clareza, continuidade da conversa e um próximo passo útil. Orientam a evitar perguntas repetidas, apresentações desnecessárias, culpa, excesso de emojis e promessas sem evidência.
- O modelo não deve inventar reembolso, desconto, prazo de solução, contato já realizado com a cozinha ou status de entrega. As opções continuam sendo rascunhos para revisão humana.

A operadora usada neste protótipo é **Ana Carvalho**, como no restante do inbox. O tom não se apresenta como Lia nem envia explicações sobre o raciocínio do modelo.

## Comportamento durante a edição

- Uma nova mensagem ou mudança relevante no contexto cancela a geração anterior. A resposta antiga não é aplicada ao novo contexto.
- Trocar de conversa, entrar no modo de nota interna ou sair do inbox também cancela a geração em andamento.
- Rascunhos de resposta e de nota interna são separados por conversa na memória da página, preservando a edição ao alternar entre eles. Não são persistidos após recarregar a página.
- Clicar em outra versão aplica esse texto ao campo para edição. Clicar novamente em **Sugerir resposta** pede um novo conjunto de alternativas.
- O botão fica desativado para conversas encerradas, sem mensagem do cliente, durante ligação ativa ou no modo **Nota interna**.

## Configuração e falhas

São reutilizados `AZURE_ENDPOINT`, `AZURE_API_KEY`, `AZURE_MODEL` e a configuração de API do modelo de atendimento, além de `CREWAI_SERVICE_URL` e `CREWAI_SERVICE_TOKEN` para a comunicação entre serviços.

As sugestões são um recurso manual de IA e usam Azure **mesmo quando as respostas automáticas estão em `ASSISTANT_PROVIDER=demo`**. Não há um texto fixo apresentado como se tivesse sido gerado pelo modelo. Se faltar configuração, houver timeout ou o resultado for inválido, o dashboard informa a falha e permite tentar novamente, preservando o rascunho.

## Estrutura

- `src/app/api/suggestions/route.ts`: validação pública e proxy com token somente no servidor.
- `src/lib/suggestion-contract.ts`: seleção do contexto e contratos de entrada/saída.
- `src/components/reply-suggestions.tsx`: botão, alternativas, cancelamento e proteção da edição.
- `services/concierge/suggestions.py`: contexto operacional somente para leitura, geração estruturada e limite de oito gerações simultâneas por processo.
- `services/concierge/support_prompts.py`: instruções versionadas de tom e atendimento.

O endpoint Python é `POST /suggestions`, protegido pelo mesmo token do serviço. A chamada ao modelo tem limite de 18 segundos; o proxy e o navegador possuem limites externos para falhas de conexão. O conteúdo gerado não é registrado em logs nem gravado no CRM por este endpoint.

## Verificação

Na raiz:

```powershell
npm run typecheck
npm run lint
npm test
$env:PLAYWRIGHT_CHANNEL = "msedge"
$env:PLAYWRIGHT_PORT = "3000"
npx playwright test e2e/suggestions.spec.ts
```

Em `services/concierge`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_suggestions.py"
```

Os testes usam contexto temporário e geração simulada. Cobrem seleção da última mensagem, três alternativas, dados salvos com prioridade, ausência de ações operacionais, autenticação, falhas, proteção do rascunho, mudanças de contexto, envio explícito e interface mobile.
