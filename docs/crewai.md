# Recepção Sabor Express com CrewAI

## O que foi implementado

```text
WhatsApp demonstrativo
  → POST /api/assistant (Next.js, servidor)
  → POST /chat (FastAPI, Python)
  → CrewAI ReceptionFlow
      → Exceção explícita? Equipe humana
      → Lia, recepcionista: classifica a intenção com o histórico
      → Router:
          Pedidos       → catálogo e ações controladas
          Reservas      → coleta → agenda fictícia → resumo → confirmação
          Aniversários  → coleta → capacidade → resumo → confirmação
          Informações   → base da unidade
          Ambiguidade   → uma pergunta de esclarecimento
          Humano        → fila do inbox com contexto
  → validação estrutural → resposta + encaminhamento + dados coletados
```

O CrewAI é um serviço Python separado, porque o SDK oficial não roda no navegador nem no runtime Node.js do Next.js. A interface continua em Next.js 16. Não há dependência do CrewAI AMP pago para executar esse serviço.

## Configuração rápida · Windows / PowerShell

### 1. Preparar Python

Use **Python 3.12 ou 3.13**. A versão CrewAI 1.15.21 exige Python menor que 3.14.

Na raiz do projeto:

```powershell
py -3.12 -m venv services/concierge/.venv
services/concierge/.venv/Scripts/python.exe -m pip install -e services/concierge
```

Neste ambiente o Python 3.12 e as dependências já foram instalados. No macOS/Linux, use `python3.12` e `.venv/bin/python`.

### 2. Configurar Azure Foundry

Preencha o **`.env` da raiz do projeto** com os dados da implantação de vocês no Azure Foundry. O Next.js e o serviço Python leem esse mesmo arquivo, que já está criado e organizado:

```dotenv
AZURE_ENDPOINT=https://SEU-RECURSO.services.ai.azure.com/models
AZURE_API_KEY=sua_chave_do_azure
AZURE_MODEL=nome-exato-do-deployment
AZURE_API_MODE=inference
AZURE_API_VERSION=2024-05-01-preview
CREWAI_SERVICE_TOKEN=seu_token_interno
CREWAI_TRACING_ENABLED=false
OTEL_SDK_DISABLED=true
```

Copie **endpoint de inferência, chave e nome do deployment/modelo** do exemplo de código da implantação no portal. Não use a URL de projeto que contém `/api/projects/...`. `AZURE_MODEL` é o nome publicado no Azure, sem prefixos `azure/` ou `openai/`; não há modelo padrão presumido.

#### Formato do endpoint

| Modo | Endpoint | Integração utilizada |
|---|---|---|
| `inference` | `https://RECURSO.services.ai.azure.com/models` | Provedor Azure nativo do CrewAI + Azure AI Inference SDK |
| `inference` | `https://NOME.REGIAO.models.ai.azure.com` | Endpoint dedicado de inferência |
| `openai_v1` | `https://RECURSO.openai.azure.com/openai/v1/` | SDK compatível com OpenAI, direcionado explicitamente ao Azure |
| `openai_v1` | `https://RECURSO.services.ai.azure.com/openai/v1/` | Foundry via API v1 |

No modo `inference`, confira `AZURE_API_VERSION` no exemplo do portal; o padrão é `2024-05-01-preview`. No modo `openai_v1`, a versão datada não é enviada. Ao informar somente a raiz de um recurso, o serviço acrescenta `/models` para Foundry inference ou `/openai/v1/` para v1. Não inclua `/chat/completions`, parâmetros de consulta ou uma URL legada `/openai/deployments/...`.

Para um endpoint v1, por exemplo:

```dotenv
AZURE_API_MODE=openai_v1
AZURE_ENDPOINT=https://SEU-RECURSO.openai.azure.com/openai/v1/
AZURE_API_KEY=sua_chave_do_azure
AZURE_MODEL=nome-exato-do-deployment
```

Os agentes usam **Chat Completions e saídas estruturadas**. Escolha uma implantação compatível com essas operações. Modelos que exigem outro protocolo precisam de um adaptador específico. A autenticação implementada é por chave do Azure; autenticação Microsoft Entra ID não está configurada nesta versão.

`OPENAI_API_KEY`, `OPENAI_BASE_URL` e `CREWAI_MODEL` não são mais usados pela aplicação. No modo v1, o nome do SDK é OpenAI, mas a URL e a credencial são explicitamente do Azure Foundry; não há fallback para a API pública da OpenAI.

A chave é utilizada pelo serviço Python e permanece no servidor. Não use prefixo `NEXT_PUBLIC_`. O `.env` está ignorado no Git. Chamadas a um modelo real podem ter custo conforme o provedor.

### 3. Selecionar o CrewAI no Next.js

O `.env` da raiz já contém a conexão entre Next.js e Python:

```dotenv
ASSISTANT_PROVIDER=crewai
CREWAI_SERVICE_URL=http://127.0.0.1:8000
CREWAI_SERVICE_TOKEN=seu_token_interno
```

O token é opcional na execução local e é lido do mesmo `.env` pelos dois serviços. Para publicar o serviço, configure o token e coloque autenticação de usuários no Next.js antes de expor o endpoint a tráfego público.

### 4. Iniciar os dois serviços

Terminal 1, na raiz do projeto:

```powershell
npm run dev:crew
```

Terminal 2:

```powershell
npm run dev
```

Reinicie os serviços após alterar as variáveis. Para acesso por tablet na mesma rede, o navegador acessa apenas o Next.js; a URL do Python é resolvida pelo servidor Next.js, não pelo tablet.

Abra `/whatsapp`. O indicador mostra **“CrewAI · Azure Foundry configurado”** quando o serviço está acessível e as variáveis são válidas. Isso verifica a configuração local, não as permissões, a quota ou a existência do deployment; a primeira conversa valida a chamada ao Azure. A tela **Assistente IA** tem uma ação para verificar novamente a conexão. `/health` identifica campos faltantes sem retornar valores de credenciais ou o endpoint.

## Modo demonstrativo

Sem `ASSISTANT_PROVIDER=crewai`, o projeto usa `demo`. A recepção, a coleta e o encaminhamento funcionam com regras locais, sem chamar um modelo. A interface identifica isso como **Demonstração local · sem LLM**.

Uma falha quando o CrewAI está selecionado **não muda silenciosamente para a demo**: a conversa vai para a equipe, com o motivo de contingência no inbox.

## Regras derivadas do case

- **Demo funcional:** reservas e aniversários podem ser confirmados na agenda fictícia persistida em SQLite. O código verifica capacidade, datas, horários e consentimento; o LLM não inventa disponibilidade. Isso não cria uma reserva em uma loja real.
- **Uma pergunta por vez.** O especialista pede apenas o campo que falta. Respostas como “15”, “amanhã” e “sete da noite” são normalizadas. Três tentativas sem avanço ou repetidamente inválidas encaminham para a equipe.
- **Acesso humano direto.** Reclamação, atraso, cancelamento, reembolso, alergia e pedido de atendente interrompem a automação.
- **“15 pessoas” é quantidade, não pedido de atendente.** O filtro antigo usava uma correspondência ampla com “pessoa”; isso foi corrigido.
- **Intenção ambígua:** até dois esclarecimentos; se continuar ambígua, transfere. Saudações não contam como falhas. O score do modelo é um sinal heurístico, não uma probabilidade calibrada.
- **Dados com evidência:** os trechos extraídos precisam estar na última mensagem do cliente. O histórico operacional válido vem do servidor. Datas relativas usam America/Sao_Paulo e são apresentadas como data completa no resumo antes de confirmar.
- **Fontes delimitadas:** preços e informações vêm de `src/lib/catalog.json`, compartilhado pelo Next.js e pelo Python.
- **Sem confirmação livre pelo modelo:** a IA só propõe a ação. O código aceita “sim” apenas quando existe um resumo pendente no servidor e o identificador enviado pela tela corresponde a esse resumo. Correções geram outro identificador. Preço, estoque e disponibilidade são revalidados na confirmação.
- **Histórico separado por conversa:** cada execução cria agentes próprios. Notas internas e eventos administrativos não são enviados ao provedor.
- **Tempo e tentativas limitados:** até 2 chamadas de agentes por turno, `max_iter=2`, sem retry do provedor, timeout de 10s por chamada e 30s no fluxo. Timeouts maiores no proxy e no navegador permitem receber a contingência.
- **Atendente tem prioridade:** respostas atrasadas são descartadas se a conversa mudou, foi encerrada, teve nova mensagem ou foi assumida por uma pessoa.
- **Duplicatas:** solicitações idênticas são combinadas; respostas e operações ficam registradas em SQLite. Repetir uma confirmação não cria outra reserva nem desconta estoque novamente. Transações protegem capacidade e estoque quando pedidos chegam ao mesmo tempo.
- **Instruções maliciosas:** tentativas explícitas de extrair chaves/prompts, executar código ou ignorar regras são bloqueadas antes do LLM. Os agentes não recebem segredos, ferramentas de execução, SQL ou acesso à internet. Os prompts reforçam a separação entre instruções e dados; isso não é uma garantia universal contra prompt injection.

Essas medidas reduzem classes de falha; não garantem que um modelo nunca classifique uma intenção incorretamente. O piloto deve medir roteamento, abandono, reabertura e transferência com conversas reais anonimizadas.

## O que continua sendo demonstração

O modelo é real no modo CrewAI configurado. **O canal WhatsApp continua demonstrativo; o RD Station usa a API real quando uma conta é conectada por OAuth.** Pedidos, estoque e reservas usam sistemas fictícios funcionais. O histórico visual fica no navegador; estado operacional, resumos pendentes e confirmações ficam no SQLite local. Alterar um pedido ou preço no browser não altera o estado autoritativo usado para executar operações. Consulte [a integração CRM](rd-station-crm.md) para sincronização e efeitos na conta conectada.

O objetivo atual é o desafio técnico. Identidade corporativa, permissões multiusuário, integrações com lojas reais e operação distribuída seriam uma etapa posterior.

## Como demonstrar

1. Clique em **Planejar aniversário** no WhatsApp.
2. A recepção encaminha a mensagem para **Aniversários** e preserva “15 pessoas”.
3. Informe `amanhã`; em seguida, `sete da noite`.
4. Confira o resumo e responda `sim`. A reserva recebe um código e é gravada na agenda fictícia.
5. No inbox, confira os campos coletados, o código e as validações executadas.
6. Teste uma reclamação para demonstrar a transferência e a resposta humana.

### Regras dos sistemas fictícios

- Agenda de 60 dias, antecedência mínima de 1 hora, início entre 11h e 21h em intervalos de 30 minutos.
- Duração de 2 horas, capacidade de 40 pessoas por unidade e limite de 20 por grupo.
- Sábados às 19h têm uma ocupação fictícia inicial de 24 pessoas, definida no catálogo. Reservas confirmadas também consomem capacidade nos intervalos sobrepostos.
- Um pedido aceita de 1 a 10 unidades do mesmo combo. Estoque inicial por loja: 25 Clássicos, 12 Crispy e 8 Veggie.
- Resumos expiram após 15 minutos. A consulta não bloqueia lugares/estoque; a confirmação revalida tudo em transação.
- Estado salvo em `services/concierge/.data/sabor.sqlite3`. `CONCIERGE_DB_PATH` permite um banco isolado para testes. A pasta é ignorada pelo Git.
- A limpeza da sessão no browser não apaga o banco operacional. Os testes automatizados usam bancos temporários, sem consumir o estoque da demonstração.

### Arquivos de prompts e guardrails

- `prompts.py`: versão `concierge-2.0`, instruções comuns e exemplos por função.
- `language.py`: português contextual e identificação de consentimento/negação.
- `policy.py`: validação de evidências, coleta e mensagens construídas a partir dos resultados do sistema.
- `systems.py`: operações autorizadas, persistência, estoque e capacidade.
- `flow.py`: coordenação dos agentes e confirmação vinculada ao resumo.

Teste também: “Quero um atendente”, “Tenho alergia”, “Meu pedido está atrasado”, “Vocês têm estacionamento?” em outra unidade e interrupção do serviço Python durante uma solicitação.

## Testes

```powershell
npm test
npm run lint
npm run build
$env:PYTHONUTF8 = "1"
services/concierge/.venv/Scripts/python.exe -m unittest discover -s services/concierge/tests -v
```

Os testes de Python executam o Flow real com respostas controladas e verificam o Agent com LLM falso. Cobrem respostas curtas, negações, instruções maliciosas, adulteração do estado no browser, confirmações antigas, expiração e concorrência de agenda/estoque. Os testes de navegador em `functional-booking.spec.ts` validam o resumo, o envio do identificador de confirmação, os horários alternativos e o registro exibido no inbox, sem chamadas pagas.

Se o Next.js já estiver rodando na porta 3000, execute os testes de navegador com `$env:PLAYWRIGHT_PORT = "3000"` para reutilizar o servidor em modo demo.

## Referências oficiais consultadas

- [CrewAI Flows: estado, router e agentes](https://docs.crewai.com/en/concepts/flows)
- [Agentes: kickoff_async e saídas estruturadas](https://docs.crewai.com/en/concepts/agents)
- [Instalação e versões de Python](https://docs.crewai.com/en/installation)
- [Configuração de LLMs](https://docs.crewai.com/en/concepts/llms)
- [Microsoft: Azure AI Inference SDK](https://learn.microsoft.com/en-us/python/api/overview/azure/ai-inference-readme?view=azure-python-preview)
- [Microsoft: Foundry / Azure OpenAI v1](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle)

A dependência foi fixada em `crewai[azure-ai-inference]==1.15.21`, incluindo o SDK Azure. Os testes validam a seleção do provedor nativo, o deployment, os parâmetros e uma requisição HTTP v1 com transporte simulado. Uma chamada real ao tenant depende do preenchimento das credenciais e do endpoint da organização.
