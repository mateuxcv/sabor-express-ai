# Capa Sabor Express — O restaurante por dentro

Proposta de direção criativa e prompt de implementação. Pesquisa realizada em 14/09/2026. Este documento especifica uma experiência futura; não representa uma implementação concluída.

## Diagnóstico de produto e design

A capa atual tem identidade editorial, mas concentra sua hierarquia em um balão que comunica pouco sobre o produto. A primeira interação troca o conteúdo do painel; o visitante precisa investigar para descobrir a conexão entre conversa, operação e CRM. Há espaço visual, mas pouco acontecimento significativo antes do clique.

A oportunidade é tornar essa conexão a própria peça central da capa. O visitante deve reconhecer o restaurante, provocar uma mudança e entender a consequência. O encantamento vem da combinação de composição, materialidade, continuidade e resposta à ação.

## Três direções possíveis

1. **O restaurante por dentro — recomendada.** Uma maquete interativa do restaurante se abre em camadas. Uma solicitação atravessa cliente, Lia, equipe e registro. Alta ambição visual, metáfora próxima ao negócio e exploração espacial. Exige maior cuidado com modelagem, luz e performance.
2. **A comanda impossível.** Uma comanda sai de uma impressora, se desdobra e vira um palco de papel: mensagem, mesa reservada, atendimento e registro. O usuário puxa o papel ou avança por controles. Excelente identidade gastronômica; viável com SVG, HTML e GSAP. O desafio é fazer a dobradura parecer material e evitar texto em perspectiva ilegível.
3. **Uma noite, dois pontos de vista.** Um cenário de restaurante com um divisor interativo revela o salão de um lado e o atendimento digital do outro. A mesma solicitação fica alinhada nas duas perspectivas. Excelente clareza comercial; requer arte em camadas cuidadosamente produzida. Uma fotografia única não oferece profundidade suficiente para essa interação.

**Escolha:** desenvolver a primeira direção. Sua interação principal é abrir o restaurante e revelar o que sustenta uma experiência simples para o cliente.

## Bibliotecas pesquisadas e decisão

| Tecnologia | Aplicação concreta | Decisão |
| --- | --- | --- |
| Three.js + React Three Fiber | Maquete 3D, objetos interativos, câmera e materiais | Base da cena. O README oficial associa Fiber 9 ao React 19; conferir peer dependencies antes de instalar. |
| Drei | Auxiliares de câmera, sombras, HTML ancorado e ajuste de qualidade | Usar apenas os auxiliares necessários. |
| GSAP + @gsap/react | Uma timeline para a revelação, câmera, objetos, linhas e transições DOM | Motor principal de animação; usar cleanup e contextSafe nas interações. |
| GSAP Flip | Continuidade de posição e tamanho de elementos HTML | Útil para mensagem virar resumo; limitado ao DOM 2D, não anima meshes nem resolve transformações CSS 3D. |
| Motion for React | Layout, gestos e transições declarativas de interface | Boa opção para a direção 2D; não acrescentar junto de GSAP sem necessidade concreta. |
| Rive | Ilustração interativa com estados e respostas a inputs | Interessante para direção ilustrada; depende de um arquivo .riv realmente produzido. Não integra o escopo principal. |
| Lenis | Suavização da rolagem em narrativas longas | Avaliado, mas dispensável nesta capa: interação direta e rolagem nativa são suficientes. |
| Lucide React | Ícones funcionais | Já instalado no projeto. |

A stack sugerida é Next.js + React + CSS Modules + Three/Fiber/Drei + GSAP. As ferramentas viabilizam a direção; a qualidade depende da arte, da composição e da coreografia.

---

# Prompt pronto para implementação

Atue como diretor de criação digital, product designer sênior e creative developer. Redesenhe e implemente a capa `/` do projeto Sabor Express como uma experiência autoral de produto, com acabamento de um estúdio de design interativo.

## 1. Contexto e preparação

O projeto é um case Customer Success & IA Solutions para HeadOffice.ai. Conecta atendimento de restaurante via WhatsApp, Lia como recepcionista com IA, especialistas, equipe humana e RD Station CRM. A aplicação usa Next.js 16, React 19, TypeScript, CSS próprio e Lucide React.

Leia `AGENTS.md` e os guias relevantes de `node_modules/next/dist/docs/` antes de escrever código. Confira o projeto e as versões instaladas. Comece por:

- `src/app/page.tsx`;
- `src/components/project-cover.tsx`;
- `src/components/project-cover.module.css`;
- `src/components/brand.tsx`;
- `README.md` e os assets disponíveis.

A capa atual contém cenários de reserva, pedido e imprevisto. Use o conhecimento de negócio para construir a nova experiência. As rotas de destino são `/whatsapp`, `/dashboard`, `/crm` e `/apresentacao`.

## 2. Conceito obrigatório: O restaurante por dentro

Transforme a capa em uma maquete viva de restaurante, com qualidade de fotografia de uma miniatura arquitetônica feita à mão. Ao revelar os bastidores, o cenário se abre em camadas e mostra o caminho de uma solicitação.

A mensagem de produto é: **o cliente faz um pedido simples; atendimento, operação e relacionamento se conectam para dar continuidade.**

Headline visível:

> Uma mensagem.
> Um restaurante inteiro em movimento.

Subheadline:

> Explore como a Lia conecta clientes, equipe e operação no Sabor Express.

Ação principal: **Revelar os bastidores**.

O objetivo inicial é despertar curiosidade em aproximadamente cinco segundos e permitir compreender a proposta em uma exploração curta. São intenções de design a validar, não resultados já comprovados.

## 3. Direção de arte

- Maquete tátil de restaurante contemporâneo brasileiro, com cerâmica, madeira fosca, papel e terracota.
- Fundo marfim `#F3EFE6`, texto carvão `#252720`, destaque terracota `#C8492C`, detalhes oliva `#68725B` e âmbar `#C8944D`. Verificar contraste nas aplicações reais.
- Usar a cor terracota para o percurso principal; prioridades e estados também precisam de texto ou símbolos.
- Luz quente lateral, sombras suaves de contato, volumes arredondados com sobriedade e objetos com escala consistente.
- Cena recortada com duas paredes baixas, piso, três mesas, cadeiras, balcão de recepção, luminárias e um detalhe vegetal. A composição deve parecer um restaurante antes de qualquer interação.
- Um celular próximo à cena conecta a conversa ao mundo físico. Uma comanda representa a memória do atendimento.
- Tipografia display expressiva no título e sans-serif legível na interface. No máximo duas famílias. Priorizar fontes locais disponíveis e fallbacks adequados.
- Composição assimétrica: título no terço esquerdo e maquete dominante no centro/direita, com equilíbrio de massa e espaço negativo intencional.
- Poucos detalhes excelentes. Valorizar iluminação, enquadramento, proporção e materialidade acima da quantidade de objetos.
- Evitar estética de dashboard na abertura, cards genéricos em grade, robô mascote, neon, partículas aleatórias e efeitos que disputem atenção com a cena.

## 4. Storyboard da entrada

### Estado inicial

Texto, marca, acessos às quatro rotas e controle principal ficam disponíveis imediatamente. A área da maquete tem dimensões reservadas e um fallback ilustrado autoral enquanto o 3D carrega.

Quando a cena estiver pronta, fazer uma entrada curta, de aproximadamente 900–1.200 ms: iluminação se estabelece, maquete acomoda suavemente e uma mensagem de exemplo aparece junto ao celular. O visitante pode interagir durante essa entrada; qualquer comando assume prioridade.

Mensagem inicial: **“Uma mesa para 2, às 20h?”**

Manter a cena quase imóvel após a entrada. Um único detalhe ambiente discreto, como vapor, pode existir se houver orçamento de renderização. A animação ambiente deve poder ser pausada.

### Revelação — o wow moment

Ao acionar “Revelar os bastidores”, executar uma transição contínua de aproximadamente 1,6–2,2 segundos:

1. A mensagem ganha destaque e dela parte uma linha terracota.
2. A câmera recua e inclina levemente para mostrar o conjunto.
3. O salão sobe um pouco e aparecem, abaixo dele, duas camadas simbólicas: atendimento e memória.
4. A linha conecta a mensagem à recepção de Lia, à consulta de disponibilidade e à preparação do resumo.
5. Uma mesa ganha destaque e a comanda exibe os mesmos detalhes da solicitação.
6. O conjunto termina em uma composição estável e explorável, com poucos rótulos legíveis.

O restaurante se torna um mapa do produto. As camadas inferiores são uma metáfora visual, não uma representação literal da arquitetura do software.

Texto do estado final: **“Por trás de uma resposta, o contexto continua.”**

Nesta prévia, a reserva fica **aguardando confirmação**. A disponibilidade é ilustrativa. O registro deve refletir essa situação, sem representar uma reserva efetivada.

### Controle contínuo

Após a revelação, mostrar um controle “Salão — Bastidores” que permite percorrer e reverter a abertura. Usar um range HTML acessível estilizado como instrumento editorial. O botão e o range controlam a mesma timeline, sem disputar o progresso.

A interação acontece no controle indicado; arrastar livremente a página não controla a câmera. A rolagem vertical permanece natural. Usuários podem explorar, retornar ou abrir uma rota a qualquer momento.

## 5. Interação que demonstra valor

Apresente três situações com rótulos curtos: **Reservar**, **Pedir**, **Resolver**. Elas alteram um estado local compartilhado entre mensagem, cena, atendimento e comanda.

### Reservar

- Alternar entre 2 e 4 pessoas.
- A quantidade de lugares destacados muda.
- Mensagem, resumo e próxima ação mantêm os mesmos dados.
- Exibir “Disponibilidade ilustrativa” e “Aguardando confirmação”.

### Pedir

- Alternar entre clássico e vegetariano.
- Uma embalagem no balcão muda de identificação e o percurso aponta para retirada.
- A comanda acompanha item, unidade e modalidade.
- Estado: “Resumo para revisão”, coerente com o fluxo existente.

### Resolver

- Selecionar “Pedido atrasado”.
- O caminho visual se desvia para a equipe humana, em âmbar e com indicação textual.
- A estação da equipe recebe o mesmo histórico; Lia sinaliza o encaminhamento.
- Oferecer “Assumir na prévia”; ao acionar, mostrar que a automação está pausada nessa conversa ilustrativa.
- Frase contextual: **“Quando precisa de uma pessoa, a conversa vai junto.”**

Trocar cenário interrompe animações pendentes e produz um estado coerente. Evitar uma sequência longa de timers. Animação apresenta estado, não é a fonte de verdade dos dados.

## 6. Navegação espacial e convencional

Quatro objetos ou áreas possuem hotspots HTML com equivalentes em uma navegação visível:

| Área | Prévia | Link explícito |
| --- | --- | --- |
| Celular | Cliente e conversa | Abrir WhatsApp → `/whatsapp` |
| Balcão de atendimento | Lia e equipe | Abrir dashboard → `/dashboard` |
| Comanda | Contexto e próximo passo | Abrir CRM → `/crm` |
| Planta do restaurante | Problema, proposta e piloto | Ver apresentação → `/apresentacao` |

Selecionar uma área destaca o objeto e abre um painel HTML compacto. A navegação real ocorre em um link claramente identificado. Manter os acessos diretos desde o primeiro frame, inclusive durante carregamento ou falha do canvas.

Painéis devem ser legíveis e conter apenas informação relevante à seleção. No desktop, podem ocupar a lateral livre; no mobile, usar painel no fluxo abaixo da cena. Não exigir que o visitante descubra um objeto minúsculo para acessar o produto.

## 7. Linguagem de movimento

- Feedback de controle: 120–200 ms.
- Troca de painel ou detalhe: 250–450 ms.
- Foco de cena: 600–900 ms.
- Revelação principal: 1,6–2,2 s.
- Easing suave com desaceleração; elasticidade muito discreta apenas em objetos leves.
- Parallax por mouse com amplitude pequena, apenas em pointer fino e sem movimento reduzido.
- Mensagem e comanda mantêm identidade visual nas transições. Para HTML 2D, avaliar GSAP Flip; para objetos 3D, animar transformações Three.js pela timeline.
- Transições interrompíveis. Ao receber uma nova intenção, partir da pose atual em vez de acumular movimentos.
- Quando houver foco em leitura, reduzir movimento periférico.
- Áudio é um refinamento opcional posterior, ativado explicitamente e dispensável para entender a cena.

## 8. Mobile, teclado e movimento reduzido

- Projetar composição específica a partir de 360 px: headline curta, cena bem enquadrada, controle grande e painel abaixo.
- Em telas estreitas, aproximar a câmera do objeto selecionado e reduzir a quantidade simultânea de rótulos.
- Área de toque mínima de 44 × 44 px, foco visível, nomes acessíveis e navegação lógica.
- Todas as ações importantes têm controles DOM; objetos WebGL não são a única forma de interação.
- O range funciona com teclado e informa o significado do valor.
- Respeitar `prefers-reduced-motion`, inclusive mudanças durante a sessão. Oferecer a composição aberta estática e mudanças de estado imediatas ou fades curtos, com os mesmos cenários e acessos.
- Sem suporte WebGL ou em caso de perda de contexto, usar ilustração SVG/HTML em camadas com os mesmos controles e conteúdo.
- Informações essenciais continuam legíveis e navegáveis com JavaScript desabilitado.
- A prévia é identificada discretamente como “Demonstração interativa · dados ilustrativos”. Não chamar IA, gravar CRM ou alterar a sessão real a partir da capa.

## 9. Arquitetura e performance

- Manter texto inicial, metadata e navegação em HTML renderizado no servidor.
- Isolar a experiência interativa em componentes client. Carregar o renderer WebGL dinamicamente a partir de um limite client compatível com a versão local do Next.js.
- Usar `three`, Fiber compatível com React 19, Drei compatível e `gsap` com `@gsap/react`; conferir as dependências entre versões.
- Usar GSAP como único motor principal. CSS resolve hover e estados simples.
- Câmera tem um controlador único; timeline, foco de objeto e parallax devem compor valores sem escrever simultaneamente na mesma propriedade.
- Um reducer local pode controlar cenário, opção, atendimento, seleção e estado de revelação. Manter dados demonstrativos tipados.
- Renderizar textos e controles em HTML, mantendo-os fora de transformações 3D que prejudiquem leitura.
- Começar com geometria procedural autoral: piso, paredes, mesas, cadeiras, balcão, luminárias e props construídos como componentes. Trabalhar bevels e materiais para evitar aparência de caixas improvisadas.
- Caso modelos externos sejam necessários, verificar licença, otimizar e hospedar os assets localmente. Não depender de uma cena remota que ainda não existe.
- Usar um único Canvas, geometrias e materiais compartilhados e instâncias para cadeiras repetidas quando fizer sentido.
- Limitar DPR inicialmente a 1–1,5 e ajustar com medições. Simplificar sombras e detalhes para dispositivos mais lentos. Largura da tela sozinha não determina potência.
- Pausar renderização ambiente quando fora da viewport ou com aba oculta. Para renderização sob demanda, invalidar frames enquanto GSAP estiver atualizando a cena.
- Evitar pós-processamento pesado e grandes texturas. Reservar espaço de todos os elementos para prevenir saltos de layout.
- Fazer cleanup de timelines, listeners, observers e recursos. Respeitar Strict Mode e usar `contextSafe` quando apropriado.
- Definir metas de fluidez e carregamento e medir em dispositivos/perfis declarados; não prometer FPS universal.

Estrutura sugerida, adaptável aos padrões reais do projeto:

- `src/components/cover/cover-experience.tsx` — estado e composição;
- `src/components/cover/restaurant-scene.tsx` — renderer e cena;
- `src/components/cover/restaurant-model.tsx` — maquete;
- `src/components/cover/scene-controller.tsx` — animação e câmera;
- `src/components/cover/scenario-controls.tsx` — cenários e controle de abertura;
- `src/components/cover/context-panel.tsx` — prévias HTML;
- `src/components/cover/cover-fallback.tsx` — alternativa ilustrada;
- `src/components/cover/cover.module.css` — estilos isolados;
- `src/components/cover/scenarios.ts` — dados locais tipados.

## 10. Sequência de execução e definição de pronto

1. Definir composição inicial, aberta e mobile; estabelecer materiais, câmera e hierarquia tipográfica.
2. Construir uma fatia completa do cenário de reserva: entrada, revelação, ajuste de pessoas e resumo consistente.
3. Polir luz, sombra, proporções e continuidade até a cena ter identidade própria.
4. Implementar pedido, encaminhamento humano e acessos às rotas.
5. Completar fallback, movimento reduzido, teclado, interrupções e layout mobile.
6. Executar `npm run lint`, `npm run typecheck` e `npm run build`. Verificar os testes relevantes de navegação e capa, atualizando expectativas que dependam da interface anterior.
7. Usar Playwright para verificar cenários, links, teclado, alternância rápida, mobile, reduced motion e fallback. Inspecionar capturas inicial/aberta em 390, 768 e 1440 px e overflow em 360 px. Registrar limitações reais de validação WebGL/headless.
8. Entregar resumo, dependências adicionadas, assets, verificações executadas e capturas. Distinguir comportamento testado de intenção de design.

Critérios visuais e funcionais:

- A primeira tela já tem uma cena autoral e comunica restaurante, atendimento e tecnologia.
- A revelação é contínua: o mesmo restaurante se abre e expõe a jornada.
- Mudar pessoas ou item altera mensagem, objetos e resumo de forma consistente.
- O imprevisto mostra encaminhamento humano com histórico preservado.
- As quatro rotas estão acessíveis sem completar a narrativa.
- A experiência pode ser explorada com mouse, toque ou teclado.
- A composição estática também é bonita; movimento não esconde problemas de layout.
- A capa funciona durante carregamento e falha do 3D.

**Execute a experiência completa com cuidado de direção de arte. Priorize uma transformação memorável e interações causalmente claras, sustentadas por boa composição e acabamento.**

---

## Fontes consultadas

- React Three Fiber — README oficial e compatibilidade React/Fiber: https://github.com/pmndrs/react-three-fiber
- Drei — auxiliares e referências de documentação: https://github.com/pmndrs/drei
- GSAP em React, lifecycle e cleanup: https://gsap.com/resources/React/
- GSAP Flip, comportamento e limitações: https://gsap.com/docs/v3/Plugins/Flip/
- GSAP ScrollTrigger, avaliado para alternativa com rolagem: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Motion for React, layout e gestos: https://motion.dev/docs/react
- Rive para React e arquivos .riv: https://rive.app/docs/runtimes/react/react
- Lenis e showcase de rolagem: https://www.lenis.dev/

Pesquisa documental; bibliotecas não foram instaladas nem tiveram sua integração validada neste trabalho de concepção.
