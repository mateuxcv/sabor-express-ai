# Mensagens de voz com Azure

## Fluxo implementado

```text
Gravar no navegador ou selecionar arquivo
  → parar e enviar para transcrição
  → Next.js valida o arquivo e chama o Azure
  → ouvir o áudio e conferir/editar a transcrição
  → enviar a mensagem
  → CrewAI interpreta o texto com os mesmos guardrails
  → resposta aparece no WhatsApp e no inbox
```

A IA responde pelo fluxo de texto existente. O áudio recebido tem player e transcrição. Esta implementação é de **mensagens de voz**, não de chamada de voz contínua ou síntese de fala.

## Configuração no `.env` da raiz

```dotenv
# Nome exato de um deployment de transcrição no Azure Foundry / Azure OpenAI.
# Exemplos de famílias de modelos: whisper, gpt-4o-mini-transcribe, gpt-transcribe.
# Use um modelo disponível na região e na assinatura da organização.
AZURE_AUDIO_DEPLOYMENT=

# Opcionais: em branco, reutilizam AZURE_ENDPOINT e AZURE_API_KEY.
AZURE_AUDIO_ENDPOINT=
AZURE_AUDIO_API_KEY=
# true reutiliza AZURE_API_KEY, mesmo se houver uma chave dedicada preenchida.
AZURE_AUDIO_USE_CHAT_KEY=false

AZURE_AUDIO_LANGUAGE=pt
AZURE_AUDIO_API_VERSION=2025-04-01-preview
```

O deployment de chat DeepSeek não faz a transcrição. É necessário implantar um modelo de fala para texto e copiar o **nome do deployment**, que pode ser diferente do nome do modelo.

Se chat e áudio estão no mesmo recurso, `AZURE_AUDIO_USE_CHAT_KEY=true` usa explicitamente a chave do chat. Para um recurso de áudio separado, use `false` e configure a chave correspondente em `AZURE_AUDIO_API_KEY`.

O endpoint aceito é a raiz do recurso ou uma URL terminada em `/openai/v1/`, por exemplo:

```text
https://SEU-RECURSO.openai.azure.com/openai/v1/
https://SEU-RECURSO.services.ai.azure.com/openai/v1/
```

O Next.js usa a API específica de transcrição de arquivos do Azure:

```text
POST /openai/deployments/{AZURE_AUDIO_DEPLOYMENT}/audio/transcriptions?api-version={AZURE_AUDIO_API_VERSION}
```

São enviados `file`, `model`, `language` e `response_format=json`. Quando o endpoint informado termina em `/openai/v1/`, o serviço reaproveita a raiz do recurso e monta a rota versionada de áudio. Confira a versão de API indicada no exemplo de código do seu deployment. A chave vai somente no request de servidor para o Azure, nunca para o navegador.

Reinicie `npm run dev` depois de configurar. O serviço Python continua cuidando da conversa; a transcrição é feita no servidor Next.js.

`GET /api/audio/transcribe` informa se os campos estão preenchidos. Isso não verifica a existência do deployment ou a quota no Azure; o primeiro áudio valida a chamada real. Sem deployment configurado, a interface informa o que preencher e não simula uma transcrição.

## Como usar

1. Abra `/whatsapp`.
2. Com o campo de mensagem vazio, toque no **microfone**.
3. Autorize o microfone e fale.
4. Toque em **Parar e transcrever**.
5. Ouça a prévia e confira a transcrição. Ela pode ser editada.
6. Clique em **Enviar áudio**. Também é possível enviar somente o texto.

O ícone de clipe permite anexar áudio em WAV, MP3, M4A, MP4 ou WebM.

## Celular e tablet

O navegador exige **HTTPS ou localhost** para acessar o microfone. Abrir `http://IP-DO-COMPUTADOR:3000` no tablet não libera gravação: use uma origem HTTPS com certificado aceito pelo aparelho. O upload de arquivo continua disponível por HTTP.

Chrome/Edge gravam em WebM/Opus; o componente tenta MP4 quando esse é o formato suportado, como em navegadores Safari compatíveis. Um navegador sem `MediaRecorder` pode usar upload de arquivo.

## Limites e comportamento

- Gravação limitada a 2 minutos pela interface; arquivos selecionados têm a duração verificada no navegador.
- Upload limitado a **4 MB no servidor**, inclusive sem o header `Content-Length`.
- O servidor verifica o cabeçalho do contêiner, sem confiar apenas no nome/extensão. O Azure valida a decodificação.
- Transcrições vazias são recusadas. Textos maiores que 2.000 caracteres são recusados sem truncamento.
- Falhas de chave, deployment, conexão e quota retornam mensagens específicas. A gravação fica disponível para tentar novamente.
- O microfone para ao concluir, descartar ou trocar de conversa.
- Cancelar ou trocar de conversa descarta respostas de transcrição pendentes.
- A transcrição só entra na conversa após **Enviar áudio** ou **Só texto**.
- Um áudio conserva o identificador do resumo que existia quando a gravação/seleção começou. Um “sim” antigo não recebe o identificador de um resumo novo surgido durante a transcrição.

A revisão da transcrição permite corrigir erros de reconhecimento. O texto é tratado como mensagem do cliente, incluindo os filtros de instruções maliciosas e as validações de pedidos/reservas já existentes.

## Armazenamento

Os arquivos ficam no **IndexedDB do navegador**. O histórico no `localStorage` guarda somente a referência, duração e indicação de transcrição revisada. Assim, o áudio pode ser reproduzido após recarregar ou em outra aba da mesma origem, sem colocar arquivos grandes no `localStorage`.

O Next.js não grava áudio em disco. Ele recebe o arquivo para encaminhá-lo ao Azure e devolve o texto. As mensagens enviadas ao CrewAI contêm a transcrição, não o arquivo binário. Limpar a sessão remove as referências e os áudios locais correspondentes. Limpar dados do navegador elimina a reprodução local.

## Testes

- `tests/audio.test.ts`: formato/tamanho, endpoint, deployment, credenciais, respostas vazias, erros do Azure e proteção de origem.
- `e2e/audio.spec.ts`: upload, edição, envio, reprodução, persistência, limpeza, permissão negada, cancelamento, gravação com microfone sintético e confirmação antiga.

Os testes automatizados usam respostas controladas do serviço de transcrição. A gravação é exercitada com um dispositivo sintético do navegador; não usa o microfone pessoal nem consome quota de transcrição.

## Referência

[Microsoft — Speech to text with transcription models](https://learn.microsoft.com/en-us/azure/foundry/openai/whisper-quickstart)
