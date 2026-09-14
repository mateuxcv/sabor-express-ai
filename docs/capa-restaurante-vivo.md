# Sabor Express — sinta-se em casa

A rota `/` é um ambiente Three.js em tela inteira. A entrada acontece no próprio salão: câmera explorável, personagens em movimento e objetos que respondem às escolhas do visitante.

## Interações

- **Arrastar:** gira a câmera ao redor do restaurante. O movimento é limitado à região frontal para evitar paredes bloqueando a experiência.
- **Scroll/pinça:** aproxima e afasta. Há controles HTML equivalentes para girar, aproximar, afastar e voltar à vista geral.
- **Uma mesa:** a câmera aproxima a mesa; escolher 2 ou 4 pessoas reorganiza cadeiras e pratos. Reservar na demonstração coloca a identificação de reserva sobre a mesa.
- **Um pedido:** escolher clássico ou vegetariano muda o combo. “Preparar meu combo” inicia uma simulação de 2,8 segundos, anima o cozinheiro, mostra o prato e depois a embalagem pronta no balcão. Trocar o item ou recomeçar cancela o preparo anterior.
- **Uma conversa:** a recepção da Lia permite chamar a equipe. O personagem vai à frente do salão e a comanda passa a indicar Ana. É possível devolver à Lia.
- **Sua comanda:** reúne reserva, pedido e responsável desta visita.
- **Acender a noite:** muda fundo, iluminação ambiente e intensidade das luminárias do restaurante.
- **Pausar animações:** congela o movimento ambiente e torna as transições imediatas. Os controles continuam utilizáveis.

Os pontos sobre os objetos são botões HTML projetados pelas coordenadas 3D. Também há picking diretamente nas superfícies interativas. Um arraste não é tratado como clique; o visitante pode interromper uma viagem de câmera e assumir o controle.

O menu **O projeto**, no topo, abre `/whatsapp`, `/dashboard`, `/crm` e `/apresentacao`. Os links também funcionam sem JavaScript.

## Estado e escopo

As reservas, pedidos e atendimentos desta capa são explicitamente demonstrativos. O estado fica em memória React, sem escrever no localStorage, chamar o concierge ou enviar dados ao RD Station. A simulação local da capa é independente do estado das aplicações completas.

Recomeçar limpa as escolhas, cancela o preparo e retorna ao salão. A versão ilustrada e a recuperação de WebGL preservam o estado da visita enquanto a página continua aberta.

## Arquivos

- `src/components/project-cover.tsx`: marca, título acessível, menu server e composição da experiência.
- `src/components/cover/cover-experience.tsx`: ações, estado, controles, painel contextual, notificações e fallback.
- `src/components/cover/restaurant-state.ts`: tipos e resumo derivado da visita.
- `src/components/cover/restaurant-model.ts`: restaurante, personagens articulados, props e animação local.
- `src/components/cover/restaurant-scene.tsx`: câmera em perspectiva, OrbitControls, iluminação, projeção de botões, picking e renderização.
- `src/components/cover/cover.module.css`: interface sobreposta e layouts responsivos.

**Dependências:** Three.js e GSAP, com `@types/three` em desenvolvimento. OrbitControls e os utilitários de geometria são distribuídos pelo próprio Three.js. React permanece na versão instalada pelo projeto.

## Renderização e movimento

O renderer é carregado em um chunk client separado. A arquitetura estática é agrupada por material e destino interativo, enquanto pessoas e objetos animados permanecem separados. O piso usa instâncias e as texturas são locais.

A animação usa `requestAnimationFrame`, com interrupção quando a aba fica oculta ou a cena sai da viewport. A câmera usa uma timeline GSAP local pausada, avançada por tempo real; a suavização global do ticker não prolonga a duração dos movimentos em dispositivos lentos. Controles de órbita interrompem essa timeline.

A densidade de pixels começa limitada a 1,5. Se vários frames consecutivos forem lentos, a cena reduz a resolução de renderização e desliga sombras dinâmicas, preservando objetos e interações. A qualidade adapta uma vez por montagem para evitar oscilações.

As posições dos botões HTML são atualizadas somente quando mudam; as propriedades de diagnóstico não são escritas em cada frame. Recursos WebGL, geometrias, materiais, texturas, observers, timers e listeners são liberados ao desmontar.

## Mobile, teclado e contingência

- A cena ocupa a largura e altura do viewport, inclusive em paisagem.
- Um dedo gira; pinça controla aproximação. Os mesmos destinos ficam na navegação inferior.
- Em telas pequenas, o painel contextual fica na parte inferior e a projeção da câmera desloca o objeto selecionado para a parte livre da tela.
- Teclado: focar a cena e usar setas horizontais, `+`, `-` ou Home. Todos os destinos têm botões HTML.
- Abrir um contexto move o foco para o painel; Escape ou fechar devolve o foco ao acesso correspondente.
- `prefers-reduced-motion` é observado durante a sessão. O movimento ambiente e as viagens animadas são desativados nessa preferência.
- Falha na criação ou perda de contexto WebGL ativa a versão ilustrada. “Tentar 3D” permite recriar o renderer mantendo as escolhas.
- “Versão leve” troca voluntariamente para a arte. Nesse modo os controles de câmera ficam ocultos e as ações da visita continuam funcionando.

## Arte de apoio

`public/cover/restaurant-editorial.webp` é a versão otimizada da arte Azure produzida para o projeto, usada no carregamento e no modo ilustrado. Original: `generated-media/image-b400c841-0545-4cfb-8770-28b4009803cb-1.png`.

O ambiente 3D usa geometria procedural própria; a imagem de apoio não é apresentada como um modelo 3D.

## Verificação

`e2e/cover.spec.ts` cobre viewport inteiro, arraste, zoom, toque, teclado, reserva, preparo e cancelamento, equipe humana, comanda, dia/noite, pausa, aba oculta, movimento reduzido, recuperação de WebGL, navegação e ausência de JavaScript. Produz capturas em 360, 390, 768, 1440 e 1920 px, além de paisagem 667 × 375.

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
$env:PLAYWRIGHT_PORT='3000'
npx playwright test e2e/cover.spec.ts
```

Testes com Edge headless validam o funcionamento nesse ambiente. Não equivalem a uma medição universal de FPS nem substituem avaliação em aparelhos físicos.
