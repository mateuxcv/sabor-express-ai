# Apresentação interativa — Customer Success & IA Solutions

## Abrir

Com o projeto rodando (`npm run dev`), abra **http://localhost:3000/apresentacao**.

- Sete slides HTML, com duração sugerida total de **19 minutos**.
- Acesso direto: `/apresentacao#slide=6` (substitua 6 por 1–7).
- A URL acompanha a navegação. Recarregar ou usar voltar/avançar do navegador preserva o slide indicado.
- No desktop, o canvas 1600 × 900 é escalado proporcionalmente, mantendo 16:9 para projeção. Em janelas de até 1100 px ou em orientação vertical, o conteúdo se reorganiza com fontes legíveis. Há sempre um slide por vez; em telas pequenas, a rolagem ocorre somente dentro do slide atual, sem cortar conteúdo.
- Para apresentação estável, use `npm run build` e `npm start`. O servidor de desenvolvimento também funciona.

## Atalhos e controles

| Tecla | Ação |
|---|---|
| ← / ↑ / Page Up | Slide anterior |
| → / ↓ / Page Down | Próximo slide |
| 1–7 | Ir diretamente ao slide |
| Home / End | Primeiro / último slide |
| F | Entrar/sair da tela cheia |
| G | Visão geral com miniaturas reais dos slides |
| N | Abrir notas do apresentador |
| H | Ocultar/mostrar controles |
| Esc | Fechar notas, visão geral ou captura ampliada |

Os ícones da barra inferior têm rótulos e dicas de atalho. Um pequeno botão no canto permite restaurar a barra com o mouse. Campos, links, mídia e botões de conteúdo mantêm seus próprios comandos; os atalhos do deck não os interceptam. As notas também têm botões anterior/próximo.

Quando o slide precisa de rolagem, ↑/↓, Page Up/Down e Home/End preservam a rolagem nativa. Use ←/→ ou os botões fixos para trocar de slide. A troca retorna ao topo. As miniaturas e os painéis também se adaptam à largura disponível.

As notas começam ocultas. O painel aparece **na mesma tela**, por isso deve ser fechado antes de voltar à projeção/compartilhamento. O foco fica dentro dos diálogos e retorna ao fechar. Não há avanço automático. As transições duram 450 ms. A preferência do sistema por movimento reduzido remove essas animações.

## Roteiro e edição

### Estrutura visual simplificada

Cada slide tem um título direto, uma frase curta para guiar a fala e um visual dominante. Cabeçalhos duplicados, tabelas extensas, faixas de destaque e controles decorativos foram retirados. As quatro fases e os cinco indicadores são estáticos; não precisam de cliques. Os testes limitam o texto visível a 130 palavras por slide para evitar o retorno de telas sobrecarregadas.

O acabamento visual combina essa síntese com mais presença da marca: fundo escuro no slide da experiência, tons quentes e uma linha conectando as fases, fotografia humana no piloto, enquadramento das capturas reais e **CSAT em destaque**. O slide 5 usa KPIs familiares com frases simples e não apresenta metas numéricas sem diagnóstico. A conexão da linha do tempo anima por 550 ms, uma vez ao entrar no slide; a preferência por movimento reduzido a desativa.

Os resumos ficam na tela. As notas guardam as definições completas, critérios, responsáveis e exemplos. Em `content.ts`, `cue` é a frase visível e `guide` é a abertura completa da fala. Os campos `summary` (fases, piloto e indicadores) e `label`/`protection` (riscos) alimentam os resumos; `DetailNotes` renderiza os complementos. Os KPIs e seu guia são definidos em `measurement.ts`, reexportados por `content.ts` e renderizados por `MeasurementGuide` tanto nas notas quanto no guia público.

**`src/components/presentation/content.ts`** centraliza:

- Títulos, mensagens-guia, tempos e notas em `slides`.
- Dados, escopo, fases, responsáveis, indicadores e tópicos da demo.
- `englishPitch`: pitch em inglês, entre 260 e 330 palavras, com contagem exibida nas notas.
- `media`: caminhos locais das mídias.
- `demoLinks`: rotas reais `/whatsapp` e `/dashboard`. A capa do projeto fica em `/`.

**`src/components/presentation/presentation.tsx`** contém a composição HTML, os rótulos dos controles, a navegação, o player e os painéis. O conteúdo é editável em código, não uma imagem de slide.

**`src/app/apresentacao/tokens.css`** herda as cores e fontes do produto: papel `#f8f7f4`, verde profundo `#202923`, tangerina `#ff5a26`, lima `#d6f36a`, Bricolage Grotesque e Public Sans. `presentation.css` contém os layouts e animações, com classes prefixadas para isolar o deck das interfaces do produto.

**`src/app/apresentacao/responsive.css`** define a reorganização para tablet e celular: duas colunas de fases em telas intermediárias e uma coluna em até 650 px; mídias proporcionais, alvos de toque maiores e rodapé no fluxo do conteúdo. Essas regras são isoladas das miniaturas, que mantêm o formato 16:9.

| Slide | Tempo | Interação |
|---|---|---|
| 1. O desafio | 1min30 | Dor, três dados e agenda |
| 2. Da conversa ao pedido | 2min | Player, revelar central, três destaques e ampliação |
| 3. Um plano em quatro fases | 3min | Quatro ilustrações, períodos e focos; escopo resumido e premissa de prazo |
| 4. Provar em três lojas | 2min | Fotografia ilustrativa da equipe e três ações: medir, testar, expandir |
| 5. Como comprovar valor | 2min30 | CSAT, tempo de resposta, resolução no primeiro contato, conversão e adoção; guia de fala |
| 6. Agilidade com controle | 5min | Uma captura real, quatro pares curtos de risco/proteção e uma frase de confiança |
| 7. Faster service. Teams in control. | 3min | Fechamento e pitch em inglês nas notas |

## Guia de fala dos KPIs no slide 5

O slide prioriza cinco indicadores usuais de atendimento, vendas e adoção, com uma frase sobre o que queremos melhorar:

- **Tempo de resposta — TPR:** menos espera no WhatsApp.
- **Resolução no primeiro contato — FCR:** resolver sem o cliente precisar voltar pelo mesmo problema.
- **Satisfação do cliente — CSAT:** clientes satisfeitos com o atendimento.
- **Conversão em pedidos:** mais conversas virando pedidos.
- **Adoção da equipe:** a central fazendo parte da rotina.

Clique em **Guia de fala dos KPIs** ou abra as notas (`N`) para consultar uma frase pronta, onde observar cada indicador e um lembrete simples para perguntas. A versão atual não inclui fórmulas, contas ou exemplos numéricos. As metas serão alinhadas no diagnóstico; nenhum resultado real é declarado.

O guia também deixa claro que um novo pedido é outro atendimento. Voltar pelo mesmo problema pode indicar falta de resolução, mas uma consulta legítima de status ou uma transferência necessária não é automaticamente falha. O piloto segue focado em retirada; delivery é avaliado separadamente se for incluído depois.

Edite **`src/components/presentation/measurement.ts`** para alterar nomes, frases, fontes e lembretes; **`measurement-guide.tsx`** define a apresentação desse conteúdo. O diálogo do guia é visível ao público se a janela estiver compartilhada, assim como o painel de notas quando aberto.

## Vídeo e capturas

Todos os assets servidos estão em **`public/apresentacao/`**. O deck faz carregamento antecipado das imagens e usa `preload="auto"` no vídeo.

| Arquivo | Uso / origem |
|---|---|
| `comercial-12s.mp4` | Comercial existente: `generated-media/sabor-express-conversa/sabor-express-conversa-e-controle-12s.mp4` |
| `video-capa.webp` | Capa do comercial existente |
| `comercial-12s.vtt` | Legendas PT-BR editáveis da locução |
| `dashboard.webp` | Captura real `generated-media/sabor-express-conversa/05-dashboard.png` |
| `pedido.webp` | Captura real `generated-media/sabor-express-conversa/04-pedido-confirmado.png` |
| `transferencia.webp` | Nova captura da reclamação assumida e respondida pela atendente no aplicativo real |
| `abertura.webp` | Imagem ilustrativa de alimentação e atendimento gerada no Azure |
| `cliente.webp` | Imagem ilustrativa de cliente usando celular gerada no Azure |
| `operacao.webp` | Fotografia ilustrativa de equipe na hamburgueria gerada no Azure; visual principal do slide 4 |
| `fase-diagnostico.webp` | Ilustração de escuta da equipe e diagnóstico |
| `fase-preparacao.webp` | Ilustração de integração de sistemas e testes |
| `fase-piloto.webp` | Ilustração de três lojas com acompanhamento humano na linha do tempo do slide 3 |
| `fase-expansao.webp` | Ilustração de comparação de evidências e expansão por etapas |

Para trocar a mídia, substitua esses arquivos mantendo seus nomes ou edite `media` em `content.ts`. Ao trocar o vídeo, revise também a capa, a duração descrita e as legendas. Ele começa pausado e mudo; os controles nativos permitem reproduzir, pausar, buscar, ativar som e legendas. Sair do slide, abrir um painel ou ocultar a aba pausa a reprodução. Se o vídeo não carregar, há seleção de arquivo local para a sessão e acesso à captura de apoio.

As marcações sobre o dashboard são camadas HTML, sem reconstruir a interface. Ao substituir essa captura, ajuste a proporção de `.deck-capture-frame` e as coordenadas `.focus-0/1/2` no CSS. Clique nas capturas para ampliá-las.

### Originais das três imagens de IA

- `generated-media/image-454ee29b-6bbd-4b0a-98c9-9bbbed6c5ba9-1.png` — abertura.
- `generated-media/image-ed699ac7-ecdf-4e8e-90c4-b2771f3f817f-1.png` — cliente.
- `generated-media/image-2f4ef902-0af5-48e1-8ba4-6347c2cbeb79-1.png` — operação.

Direção compartilhada: fotografia editorial natural, luz prática quente de 3200 K equilibrada com luz de janela, madeira, kraft, aço escovado, azulejos verdes, pele e comida realistas. Imagens sem textos, logotipos ou interfaces; rostos complementares sem promessa de continuidade entre cenas. As cópias WebP otimizadas são derivadas locais dos PNGs gerados; não há dependência de URLs externas.

`node scripts/prepare-presentation-media.mjs` refaz as versões WebP e copia o comercial original. **Executar novamente substitui as cópias públicas listadas no script**, por isso ajuste o mapeamento antes se tiver trocado os arquivos manualmente.

`npx tsx scripts/capture-presentation-handoff.ts` refaz a captura de transferência. Requer o app em localhost:3000, ou `PRESENTATION_BASE_URL`; usa Edge por padrão ou `PLAYWRIGHT_CHANNEL`. A captura roda em navegador isolado com o motor demonstrativo existente e bloqueia serviços externos. Não altera o histórico do navegador do apresentador nem grava no CRM real.

### Fases ilustradas e seleção do piloto

No **slide 3**, as quatro fases aparecem juntas, sem botões para revelar ou abrir detalhes. Cada fase mostra ilustração, período e uma frase curta. Critérios de avanço e participantes ficam nas notas. No desktop, as fases ficam lado a lado; em tablet, duas por linha; no celular, em uma coluna. Os dois prazos continuam separados: proposta em até três semanas; plano de 60 dias após aprovação e acessos, a confirmar.

No **slide 4**, o método fica resumido em **Medir · Testar · Expandir**, ao lado da fotografia ilustrativa da equipe, com um selo de três lojas. A foto é gerada por IA e não retrata uma unidade real. A tela mantém comparação com lojas semelhantes, revisão humana, metas, CSAT, participação de um franqueado cético e a instrução de pausar/corrigir se houver falhas. A governança cabe em uma linha discreta. Nas notas ficam os responsáveis completos, cadência, perfis sugeridos e critérios propostos: sete dias estáveis, ausência de falhas críticas, CSAT sem piora e metas de adoção/conversão atingidas.

Edite `phases`, `pilotProtocol` e `pilotDecision` em `src/components/presentation/content.ts`. As ilustrações usam papel recortado e volumes foscos, com verde profundo, tangerina, lima e fundo creme. São imagens conceituais; os números, prazos e explicações permanecem HTML editável. As quatro imagens são pré-carregadas.

### Riscos e confiança na tela

No **slide 6**, `risks` fornece quatro pares curtos: resposta errada/dados aprovados, pedido duplicado/testes e confirmação, cliente sem saída/transferência com histórico e equipe abandona/treinamento e revisão. A frase de confiança lembra o bot anterior e propõe ouvir franqueados, testar juntos e permitir pausa. As mitigações completas e `trustActions` permanecem no complemento das notas.

A central real é a captura inicial da demonstração. Os seletores **Pedido · Central · Transferência** trocam a imagem de apoio; clicar na imagem amplia. Os dois links abrem as telas reais. **Integrações** e **Vibe coding** abrem diálogos de apoio; feche com Esc ou com o botão de fechar. As setas não mudam o slide enquanto o diálogo está aberto. A duração continua em cinco minutos: cerca de três para a demo e dois para riscos, confiança e detalhes técnicos.

Originais Azure, preservados em `generated-media/`:

- `image-6582c127-d5dc-4a47-83d0-fe20a711a770-1.png` — diagnóstico.
- `image-6ace6e84-ff4f-46f4-88d4-226833e1250a-1.png` — preparação.
- `image-ae6038fb-68d2-4c9d-9f08-408b52984192-1.png` — piloto.
- `image-805f3dfd-a716-4631-8321-3ea3ccf415be-1.png` — expansão.

O script `prepare-presentation-media.mjs` também prepara essas quatro cópias WebP. O tempo sugerido dos slides continua sendo 3 minutos para o plano e 2 minutos para pessoas/piloto; explore cada fase em cerca de 25 segundos.

## Estado real da solução e materiais pendentes

**Não falta mídia obrigatória para apresentar:** comercial, capa, três fotografias e capturas de pedido, central e transferência estão incluídos.

O deck usa o protótipo existente. WhatsApp e sistemas operacionais da demo não são integrações de produção. RD Station usa API real quando uma conta está conectada. O workflow n8n de alertas é **proposto**, não implementado. As notas distinguem esses estados, os dados fornecidos pelo desafio e as metas iniciais.

Para o piloto real, ainda será necessário obter/validar acessos ao WhatsApp Business Platform, conta CRM, API e ambiente de testes do sistema de pedidos, informações aprovadas das lojas, custos, cenário inicial e seleção das três lojas. Isso não impede a apresentação.

## Verificações

```powershell
npm run lint
npm run typecheck
npm run build
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:PLAYWRIGHT_PORT = '3000'
npx playwright test e2e/presentation.spec.ts e2e/presentation-responsive.spec.ts
```

Os testes cobrem URL, histórico, teclado, botões, limites de foco, notas, miniaturas, tela cheia, reprodução/pausa, falha de vídeo, links reais, diálogos de apoio, limites de conteúdo/rodapé, carregamento das imagens e movimento reduzido. Confirmam os resumos visíveis e a preservação dos detalhes de fases, responsáveis, piloto, riscos e confiança nas notas. Há verificações em 320 × 640, 390 × 844, 768 × 1024, 1024 × 768, 844 × 390, 1366 × 768 e 1920 × 1080, incluindo redimensionamento e troca de orientação. Capturas ficam em `test-results/`. Os testes de navegação da demo bloqueiam APIs externas.
