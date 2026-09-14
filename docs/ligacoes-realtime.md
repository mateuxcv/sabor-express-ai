# Ligações com Azure Foundry Realtime

## Experiência

O ícone de telefone no cabeçalho do WhatsApp inicia uma ligação pela internet com a Lia. O cliente fala pelo microfone e escuta respostas em voz geradas pelo **deployment `gpt-realtime-2.1`**.

A interface inclui conexão, contador de duração, legendas da resposta, microfone, controle de som e encerramento. As transcrições finalizadas aparecem na conversa e no inbox. Pedidos e reservas atualizam os mesmos sistemas fictícios em SQLite.

É uma ligação WebRTC dentro da demonstração. Não disca números de telefone, não usa PSTN/SIP e não realiza chamadas na plataforma WhatsApp real.

## Arquitetura

```text
Navegador — microfone e alto-falante
  ├─ áudio WebRTC ↔ Azure Foundry Realtime
  └─ Next.js /api/realtime ↔ serviço Python
       ├─ cria credencial efêmera no Azure
       ├─ negocia SDP sem expor a credencial Azure ao navegador
       └─ WebSocket de controle da chamada
            ├─ recebe transcrições e eventos de fala
            ├─ aceita uma transcrição final por turno de fala
            ├─ executa CrewAI + sistemas de pedidos/agenda
            └─ autoriza uma única resposta de voz para esse turno
```

O Realtime é a interface de voz; a recepcionista CrewAI continua responsável pelo atendimento de negócio. Consultas e operações podem levar alguns segundos, durante os quais a Lia pode avisar que está verificando a solicitação.

## Configuração

No `.env` da raiz:

```dotenv
AZURE_REALTIME_DEPLOYMENT=gpt-realtime-2.1
AZURE_REALTIME_ENDPOINT=
AZURE_REALTIME_USE_CHAT_KEY=true
AZURE_REALTIME_API_KEY=
AZURE_REALTIME_VOICE=marin
AZURE_REALTIME_TRANSCRIPTION_MODEL=whisper-1
AZURE_REALTIME_MAX_SECONDS=300
```

- **DEPLOYMENT:** nome exato da implantação no Azure. O nome configurado foi aceito pelo recurso utilizado neste projeto; disponibilidade de modelos depende do recurso/região.
- **ENDPOINT:** vazio reutiliza `AZURE_ENDPOINT`; aceita raiz do recurso ou `/openai/v1/`.
- **USE_CHAT_KEY:** `true` reutiliza `AZURE_API_KEY`. Para outro recurso, use `false` e preencha endpoint e chave próprios.
- **VOICE:** voz de saída aceita pelo modelo, inicialmente `marin`.
- **TRANSCRIPTION_MODEL:** modelo de transcrição dentro da sessão Realtime. É independente do deployment de arquivos de áudio.
- **MAX_SECONDS:** limite de 30 a 900 segundos, padrão 300.

Execute os serviços pelo `iniciar.bat` ou em dois terminais com `npm run dev:crew` e `npm run dev`. Reinicie o serviço Python após mudar variáveis Realtime.

O navegador exige **HTTPS ou localhost** para o microfone. No tablet acessando por IP, use HTTPS aceito pelo dispositivo. É necessário acesso à rede do Azure para WebRTC e WebSocket. Se a reprodução automática for bloqueada, a tela oferece **Ativar som**.

## API GA utilizada

- `POST /openai/v1/realtime/client_secrets`: configura a sessão e cria uma credencial com validade de 60 segundos para negociação.
- `POST /openai/v1/realtime/calls?webrtcfilter=on`: recebe a oferta SDP e devolve a resposta WebRTC.
- `wss://RECURSO/openai/v1/realtime?call_id=...`: controlador do servidor.
- `POST /openai/v1/realtime/calls/{call_id}/hangup`: solicita encerramento remoto.

Não são usados endpoints Preview regionais. Chaves do recurso e credenciais efêmeras do Azure ficam no servidor. O navegador recebe somente o SDP e uma credencial aleatória de controle da chamada local, mantida em memória e vinculada a essa ligação.

## Controle de turnos e guardrails

A geração automática do VAD está desligada (`create_response=false`). Depois que a fala termina e a transcrição final chega, o servidor processa esse turno uma única vez e autoriza uma única resposta de voz. Saudações curtas, como “tudo bem?”, recebem uma resposta breve sem consultar os sistemas de negócio.

O modelo de voz não tem ferramentas disponíveis (`tools=[]`, `tool_choice=none`). Consultas e operações são iniciadas exclusivamente pelo controlador do servidor a partir da transcrição. A voz é gerada com o texto validado em uma resposta fora do histórico automático (`conversation=none`), evitando que o próprio resultado provoque outro ciclo de respostas.

O servidor identifica a fala atual a partir dos eventos de transcrição do Azure e a encaminha para o CrewAI. Assim:

- Operações reutilizam as validações e transações dos sistemas existentes.
- Sem transcrição reconhecida, não há execução da ferramenta de negócio.
- Eventos repetidos de início/fim de fala e transcrição são deduplicados pelo ID do turno; cada turno usa um ID estável para a idempotência existente.
- Respostas sem autorização ou duplicadas para o mesmo turno são canceladas, sem gerar outra resposta em substituição.
- Resultados referentes a uma fala antiga são descartados quando há uma fala mais recente.
- A saudação inicial do navegador é enviada apenas uma vez por ligação. O silêncio não inicia respostas.
- Um filtro conservador ignora transcrições longas quase idênticas à fala da assistente quando a captura começou durante a reprodução. Respostas curtas, como “sim”, não entram nesse filtro de eco.
- O “sim” usa o identificador do resumo lido antes do começo daquela fala. Se a leitura for interrompida, o resumo não fica liberado para confirmação; o sistema deve reapresentá-lo.
- O estado final de pedido/reserva vem do servidor, não da frase gerada pelo Realtime.
- Notas internas ficam fora do contexto enviado.
- Assumir o atendimento no inbox ou pausar a automação encerra a ligação da IA. A continuação humana é pelo chat da demo.

As instruções pedem ao Realtime que leia o texto fornecido uma única vez. Como a voz final é gerada por um modelo, isso é uma orientação de comportamento, não garantia de reprodução literal. O controle de quantidade de respostas e os efeitos nos sistemas são aplicados em código.

## Encerramento e recuperação

- Desligar, fechar a janela de ligação ou sair da página fecha o microfone, o áudio remoto e o peer WebRTC.
- O servidor limita a duração e permite somente uma chamada por conversa, com até oito chamadas simultâneas na demonstração.
- A interface consulta o estado a cada segundo. Sem contato do navegador por cerca de 25 segundos, o controlador encerra a sessão local e tenta finalizar a chamada no Azure.
- Após um recarregamento abrupto, uma chamada antiga pode aparecer ocupada por alguns segundos até essa limpeza.
- Sessões ativas e credenciais locais ficam em memória do serviço Python. Reiniciar esse serviço interrompe o controle das chamadas em andamento. A aplicação deve ser usada com uma instância desse serviço nesta demo.
- As transcrições recebidas são salvas no histórico local do navegador; o áudio bruto da ligação não é gravado.

## Verificação realizada

Foram feitos testes reais com o deployment configurado:

1. Conexão WebRTC, saudação com voz e pergunta sobre o horário de Pinheiros.
2. Transcrição da pergunta, consulta ao atendimento e resposta falada “das 11h às 23h”.
3. Reserva por voz para quatro pessoas, leitura do resumo e confirmação verbal. O sistema gravou a reserva fictícia após validar o consentimento e a capacidade.

O áudio de entrada desses testes foi sintetizado localmente, sem usar o microfone pessoal.

Testes automatizados:

- `services/concierge/tests/test_realtime.py`: configuração, negociação, tokens, transcrição, confirmação, interrupção, duplicatas e expiração.
- `tests/realtime-route.test.ts`: proxy, validação e proteção das credenciais.
- `e2e/realtime.spec.ts`: tela de ligação, controles, sincronização, falhas e tomada humana, com conexão controlada de teste.

## Referência

[Microsoft — GPT Realtime API via WebRTC](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/realtime-audio-webrtc)
