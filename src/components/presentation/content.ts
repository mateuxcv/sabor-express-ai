/** Text, presenter notes and media manifest. Numeric KPI targets await a baseline. */
export { metrics, measurementGuide } from './measurement';
export const media = {
  opening: '/apresentacao/abertura.webp',
  customer: '/apresentacao/cliente.webp',
  operations: '/apresentacao/operacao.webp',
  poster: '/apresentacao/video-capa.webp',
  video: '/apresentacao/comercial-12s.mp4',
  captions: '/apresentacao/comercial-12s.vtt',
  dashboard: '/apresentacao/dashboard.webp',
  order: '/apresentacao/pedido.webp',
  handoff: '/apresentacao/transferencia.webp',
  diagnosis: '/apresentacao/fase-diagnostico.webp',
  preparation: '/apresentacao/fase-preparacao.webp',
  pilot: '/apresentacao/fase-piloto.webp',
  expansion: '/apresentacao/fase-expansao.webp',
};

export const demoLinks = { customer: '/whatsapp', inbox: '/dashboard' };

export const slides = [
  {
    title: 'O desafio da Sabor Express', section: 'O ponto de partida', duration: '1min30',
    cue: 'Menos espera, com a confiança de quem atende.',
    guide: 'Vocês precisam reduzir a demora no atendimento e recuperar oportunidades de venda, com a confiança dos franqueados. Hoje vamos apresentar a solução, o plano de implantação e os critérios para decidir sobre um piloto.',
    notes: [
      '0:00–1:30 · Comece pela dor e reconheça o desgaste causado pelo chatbot anterior. Os números vêm da mensagem da Diretora de Operações.',
      'Pergunta de validação: “Esses são os principais problemas ou existe alguma prioridade que precisamos acrescentar?”',
      'Mais de 3 mil mensagens não significa 3 mil pedidos, conversas ou compradores. Não sabemos quanto de receita foi perdido. Não usar o ticket médio para multiplicar mensagens e estimar perdas.',
      'A apresentação soma 19 minutos, incluindo comercial, demonstração e pitch. A fotografia é gerada por IA, ilustrativa; não é uma loja real da rede.',
    ],
  },
  {
    title: 'Da conversa ao pedido', section: 'A experiência', duration: '2min',
    cue: 'O cliente pede. A equipe acompanha.',
    guide: 'O cliente conversa, escolhe e confirma. A equipe acompanha tudo em uma central organizada.',
    notes: [
      '1:30–3:30 · Reproduza o comercial de 12 segundos. Há controles nativos, áudio inicialmente mudo e legendas opcionais. Ative o som manualmente se desejar. O vídeo nunca inicia sozinho.',
      'Sequência: pedido pelo WhatsApp demonstrativo → resposta da assistente → confirmação → mesmo atendimento no dashboard. Clique em “Revelar central” depois do vídeo; escolha os três destaques para localizar cada parte na captura.',
      'O comercial existente combina cenas geradas por Sora com capturas do aplicativo local. As interfaces não foram inventadas por IA. Captura e vídeo mostram a mesma conversa demonstrativa, Combo Clássico e unidade Pinheiros.',
      'O selo de conexão do CRM é o estado da sessão capturada, não prova de homologação ou integração em produção. A API RD Station é real somente quando uma conta está conectada. A imagem abre ampliada para leitura.',
      'Se o arquivo do comercial faltar, o player oferece seleção de vídeo local para esta sessão. Para substituir permanentemente, use public/apresentacao/comercial-12s.mp4 e revise as legendas.',
    ],
  },
  {
    title: 'Um plano em quatro fases', section: 'O plano', duration: '3min',
    cue: 'Validar primeiro. Expandir depois.',
    guide: 'Começamos com um escopo controlado, validamos em poucas lojas e expandimos conforme os resultados.',
    notes: [
      '3:30–6:30 · Diferencie os dois relógios. Em até três semanas: diagnóstico, validação técnica e proposta ao conselho, com estimativa de custos, dependências, riscos, capacidade e metas preliminares.',
      'As quatro fases ficam visíveis juntas, sem cliques. Apresente primeiro as três semanas para a proposta, depois o plano de 60 dias após aprovação e disponibilização dos acessos. Essa contagem é uma premissa a confirmar com a diretora.',
      'As ilustrações representam o trabalho de cada fase; são conceituais, não imagens de lojas reais ou telas do produto. Na tela ficam período e foco da etapa. Atividades, participantes e critérios de avanço estão no complemento destas notas. Reserve aproximadamente 25 segundos por fase.',
      'Dias 1–10: aprofundar o diagnóstico e medir o cenário inicial, com pelo menos uma semana cobrindo picos e fim de semana. Selecionar lojas e controles. Se não houver amostra suficiente, rever a janela de medição.',
      'Dias 11–25: configuração, integrações, testes de falhas e duplicatas, validação da base por unidade e treinamento. Dias 26–40: piloto assistido em três lojas. Dias 41–60: medição e expansão em ondas, somente com qualidade e capacidade operacional.',
      'Pedidos simples para retirada e pagamento na loja. Não incluir pagamentos online, entrega ou reembolsos autônomos. Reservas, alergênicos sem validação e exceções financeiras seguem para a equipe no piloto, mesmo que o protótipo tenha recursos adicionais.',
      'Expandir às 42 unidades não é uma promessa incondicional. Se qualidade, adoção ou transferências falharem, estabilizar o piloto antes de abrir outra onda.',
    ],
  },
  {
    title: 'Provar em três lojas', section: 'O piloto', duration: '2min',
    cue: 'Comparar resultados. Construir confiança.',
    guide: 'Cada frente tem um responsável. As lojas participam da construção e a expansão depende de evidências.',
    notes: [
      '6:30–8:30 · Operações patrocina e remove bloqueios; o conselho aprova o investimento; CS / HeadOffice.ai coordena entregas, treinamento e resultados; TI e responsável pelo CRM garantem acessos e integrações.',
      'Selecionar três lojas de perfis diferentes por volume, maturidade e tipo de cliente; comparar com lojas semelhantes. Incluir na validação um franqueado insatisfeito com o chatbot anterior e ouvir o que falhou.',
      'Perfis sugeridos: alto volume, operação estável e franqueado cético. São exemplos, não lojas escolhidas ou categorias exclusivas. Compare cada loja-piloto com uma semelhante, ajustando volume, horários e promoções. A tela resume medir, testar e expandir; responsáveis e critérios completos estão abaixo.',
      'Antes de ativar: medir pelo menos uma semana, incluindo pico e fim de semana; selecionar controles comparáveis e combinar escopo e metas. Durante o piloto: primeiro revisar sugestões com humanos; depois automatizar somente assuntos aprovados, com um responsável pelo atendimento humano em cada turno.',
      'Começar com revisão humana das sugestões antes de ampliar a automação. Treinar com casos reais anonimizados e dar aos franqueados um canal de feedback. Confirmar escala e capacidade para receber as transferências no horário publicado.',
      'Durante o piloto, revisar falhas diariamente. Reunião semanal com Operações e franqueados. Critérios de expansão: ausência de falhas críticas, satisfação sem piora, adoção, conversão e atendimento humano funcionando. Propor sete dias estáveis antes de cada onda.',
      'Franqueados aprovam informações da loja; TI, dono do sistema de pedidos e responsável por dados validam acessos, isolamento por unidade e retenção.',
    ],
  },
  {
    title: 'Como comprovar valor', section: 'Resultados', duration: '2min30',
    cue: 'Clientes satisfeitos. Equipe mais eficiente.',
    guide: 'Vamos olhar cinco coisas simples: rapidez, resolução, satisfação, pedidos concluídos e uso pela equipe.',
    notes: [
      '8:30–11:00 · Apresente cada indicador em uma frase. CSAT, tempo de resposta, resolução no primeiro contato, conversão e adoção conectam a experiência do cliente ao resultado da loja.',
      'A eficiência aparece na resolução no primeiro contato: menos necessidade de voltar pelo mesmo problema. Um novo pedido é outro atendimento. A equipe pode assumir e resolver durante o primeiro atendimento; não tratar transferência necessária como fracasso.',
      'A tela mostra o que queremos melhorar, sem resultados inventados. As metas serão combinadas no diagnóstico com Operações e as lojas. Não é preciso explicar contas durante a apresentação.',
      'O botão “Guia de fala dos KPIs” e o complemento abaixo trazem uma frase pronta para cada indicador, onde observá-lo e um lembrete simples para perguntas da banca.',
    ],
  },
  {
    title: 'Agilidade com controle', section: 'Demonstração', duration: '5min',
    cue: 'A IA ajuda. A equipe decide.',
    guide: 'Vamos acompanhar um pedido e uma transferência para mostrar como a solução funciona e como a equipe mantém o controle.',
    notes: [
      '11:00–16:00 · Reserve cerca de três minutos à demonstração e dois minutos a integrações, riscos e uso de IA. Os links abrem abas novas e mantêm a apresentação nesta posição. Use o mesmo navegador e a mesma origem para sincronizar as telas.',
      '1. Visão do cliente: “Bateu aquela fome?”, escolher combo e confirmar. 2. Central: mostrar a mesma conversa, unidade e detalhes do pedido. 3. Cliente: “Quando precisa de uma pessoa.”; na central, “Assumir”, nota interna e resposta humana. A nota não chega ao cliente e assumir pausa a assistente.',
      'IMPLEMENTADO: inbox, histórico sincronizado entre abas, cardápio, confirmação, transferência, pausa da IA, notas internas e CSAT. O backend CrewAI/Azure pode operar agenda, estoque e pedidos fictícios em SQLite. Conferir o provedor exibido na interface antes da fala; se o backend falhar, o atendimento vai à equipe.',
      'DEMONSTRATIVO: WhatsApp, lojas, contatos e sistemas operacionais de pedidos/reservas; não são integrações de produção. Os prints são capturas reais do protótipo. RD Station usa API real quando uma conta está conectada; sem conexão, eventos ficam na fila local. Não criar registros reais apenas para esta apresentação.',
      'PROPOSTO: WhatsApp Business Platform em produção, integração ao sistema próprio da rede, implantação medida nas lojas e workflow n8n de alertas. O fluxo n8n não está implementado.',
      'Integrações: sessão com TI, dono da API de pedidos e administrador do CRM. Conferir documentação, autenticação, permissões, webhooks e limites. Em Postman ou ferramenta visual, consultar cardápio, criar pedido de teste e confirmar ID/unidade/preço. Simular API lenta, 429, credencial inválida e evento duplicado. Validar histórico e transferência de ponta a ponta.',
      'Riscos: informações erradas → fonte aprovada por unidade; pedido duplicado → idempotência e confirmação válida; indisponibilidade → encaminhamento com histórico; abandono pelos franqueados → cocriação e treinamento. Pausar a IA e revisar falhas sempre que necessário. Confirmar que há um atendente disponível.',
      'Na tela, quatro pares curtos de risco e proteção, junto da frase sobre ouvir franqueados, testar juntos e permitir pausa. As explicações completas estão abaixo. Reconheça o fracasso anterior: inclua um franqueado cético, mostre a transferência funcionando, treine com casos da loja e compartilhe resultados e correções.',
      'Os riscos e controles são parte do plano proposto; não afirme que todos estão homologados em produção. Os botões Integrações e Vibe coding abrem painéis de apoio, fechados com Esc. Reserve cerca de três minutos à demo e dois minutos a riscos, confiança e esses detalhes.',
      'Vibe coding: este protótipo foi construído com apoio de IA. Automação proposta no n8n: evento de espera → validar origem → deduplicar → verificar se a conversa continua aguardando e está em horário de atendimento → alertar o responsável da unidade → registrar aceite. Testar em sandbox; não enviar alertas repetidos ou dados desnecessários. IA ajuda a escrever e testar; uma pessoa revisa o fluxo.',
      'Contingência: os seletores Pedido, Central e Transferência trocam a captura de apoio; a central aparece inicialmente. Clique na captura para ampliar. O roteiro completo dos três passos está abaixo.',
    ],
  },
  {
    title: 'Faster service. Teams in control.', section: 'The next step', duration: '3min',
    cue: 'Start small. Earn the right to scale.',
    guide: 'Our proposal is to deliver faster WhatsApp service, help customers complete their orders, and keep franchise teams in control.',
    notes: [
      '16:00–19:00 · Rehearse the pitch below at a natural pace, with pauses. Aim for 2–3 minutes. The opening sentence is part of the pitch.',
    ],
  },
] as const;

export const facts = [
  { value: '42', label: 'unidades' },
  { value: '+3 mil', label: 'mensagens por dia' },
  { value: 'Até 40 min', label: 'de espera em algumas lojas' },
];
export const agenda = ['Experiência', 'Plano', 'Resultados', 'Demonstração'];
export const scope = {
  pilot: 'Informações da loja, cardápio, pedidos simples para retirada, registro no CRM e transferência humana.',
  outside: 'Pagamento online, entrega e reembolsos autônomos.',
  before: 'Em até 3 semanas: diagnóstico, validação técnica e proposta ao conselho.',
  premise: '60 dias após aprovação e disponibilidade dos acessos, a confirmar.',
};
export const phases = [
  {
    days: 'Dias 1–10', title: 'Entender', detail: 'Diagnóstico, cenário inicial e seleção das lojas.',
    summary: 'Diagnóstico e cenário inicial.',
    image: media.diagnosis, imageAlt: 'Ilustração conceitual: escuta da equipe e análise da operação.',
    outcome: 'Saber de onde partimos.',
    actions: ['Ouvir a equipe e revisar conversas.', 'Medir o cenário inicial e escolher lojas.'],
    people: 'CS + Operações + franqueados',
    gate: 'Escopo, fontes e responsáveis definidos.',
  },
  {
    days: 'Dias 11–25', title: 'Preparar', detail: 'Configuração, integrações, testes e treinamento.',
    summary: 'Integrações, testes e treinamento.',
    image: media.preparation, imageAlt: 'Ilustração conceitual: conexão de sistemas e testes com a equipe.',
    outcome: 'Conectar e testar antes de ativar.',
    actions: ['Configurar dados da loja e integrações.', 'Testar falhas e duplicatas; treinar a equipe.'],
    people: 'TI + responsável pelo CRM + CS',
    gate: 'Fluxos críticos e transferência aprovados.',
  },
  {
    days: 'Dias 26–40', title: 'Validar', detail: 'Piloto assistido em 3 lojas.',
    summary: 'Piloto assistido em 3 lojas.',
    image: media.pilot, imageAlt: 'Ilustração conceitual: três lojas com acompanhamento humano.',
    outcome: 'Aprender em três lojas.',
    actions: ['Começar com revisão humana.', 'Acompanhar o uso e corrigir falhas diariamente.'],
    people: 'Atendentes + franqueados + CS',
    gate: 'Qualidade estável e equipe usando a solução.',
  },
  {
    days: 'Dias 41–60', title: 'Medir e expandir', detail: 'Medição e expansão gradual.',
    summary: 'Resultados e expansão gradual.',
    image: media.expansion, imageAlt: 'Ilustração conceitual: comparação de evidências e expansão por etapas.',
    outcome: 'Comprovar para ampliar.',
    actions: ['Comparar piloto, cenário inicial e lojas semelhantes.', 'Avaliar custos e liberar novas ondas.'],
    people: 'Operações + CS + franqueados',
    gate: 'Metas acordadas e capacidade confirmadas.',
  },
];
export const pilotProtocol = [
  { label: 'Medir', summary: '1 semana + lojas semelhantes.', title: 'Antes: medir e comparar', detail: 'Uma semana de cenário inicial. Três lojas-piloto + lojas semelhantes para comparação.' },
  { label: 'Testar', summary: 'Revisão humana + equipe disponível.', title: 'Durante: começar assistido', detail: 'Revisão humana primeiro. Equipe disponível e revisão diária das falhas.' },
  { label: 'Expandir', summary: 'Metas atingidas, sem piora no CSAT.', title: 'Depois: expandir em ondas', detail: 'Comparar qualidade, adoção e conversão. Avançar somente com capacidade operacional.' },
];
export const pilotDecision = {
  title: 'Critério de avanço proposto',
  gate: '7 dias estáveis, sem falhas críticas; CSAT sem piora e metas de adoção e conversão atingidas.',
  fallback: 'Se falhar: pausar a IA e estabilizar antes de expandir.',
};
export const risks = [
  { label: 'Resposta errada', protection: 'Dados aprovados.', risk: 'Bot não entende ou informa errado', mitigation: 'Escopo curto, dados aprovados por loja e saída para humano.' },
  { label: 'Pedido duplicado', protection: 'Testes e confirmação.', risk: 'API falha ou duplica o pedido', mitigation: 'Testar falhas e duplicatas; confirmar só após aceite do sistema.' },
  { label: 'Cliente sem saída', protection: 'Transferência com histórico.', risk: 'Transferência fica sem resposta', mitigation: 'Responsável por turno, histórico completo e alerta de espera.' },
  { label: 'Equipe abandona', protection: 'Treinamento e revisão.', risk: 'Franqueados voltam ao manual', mitigation: 'Cocriação, treinamento prático e revisão dos resultados por loja.' },
];
export const trustActions = [
  'Ouvir quem se frustrou com o chatbot anterior.',
  'Testar juntos e dar poder de pausar a IA.',
  'Mostrar resultados por loja e corrigir falhas.',
];
export const owners = [
  ['Operações', 'Patrocínio e decisões'],
  ['Franqueados e atendentes', 'Validação e uso'],
  ['TI e responsável pelo CRM', 'Integrações e acessos'],
  ['CS / HeadOffice.ai', 'Coordenação, treinamento e resultados'],
  ['Conselho', 'Aprovação do investimento'],
];
export const cadence = [
  ['Diário', 'Acompanhamento durante o piloto.'],
  ['Semanal', 'Operações e franqueados, juntos.'],
  ['Expansão', 'Qualidade, adoção e resultados.'],
];
export const demoSteps = ['Cliente faz e confirma o pedido.', 'Equipe acompanha a conversa e os detalhes.', 'Uma reclamação é transferida e o atendente assume.'];
export const topics = [
  { title: 'Integrações', headline: 'WhatsApp, RD Station e sistema de pedidos.', detail: 'Validação: documentação, permissões e testes de ponta a ponta, incluindo falhas e duplicatas.', flow: ['WhatsApp', 'Atendimento', 'CRM + pedidos'] },
  { title: 'Vibe coding', headline: 'Protótipo construído com apoio de IA.', detail: 'Automação proposta no n8n para alertar sobre clientes aguardando atendimento.', flow: ['Cliente aguarda', 'Verificar espera', 'Alertar equipe'] },
];
export const closing = [
  ['Solution', 'AI-assisted WhatsApp service connected to store information and business systems.'],
  ['Value', 'More completed orders and less repetitive work.'],
  ['Next step', 'Align stakeholders and select three pilot stores.'],
];
export const englishPitch = `Our proposal is to deliver faster WhatsApp service, help customers complete their orders, and keep franchise teams in control.

Today, your teams handle thousands of messages. Some customers wait too long. We do not yet know how many sales are lost, but we can measure whether better service helps more customers complete a purchase.

I understand why franchisees are cautious. The previous chatbot did not understand customers and created more problems for the stores. We need to earn that trust back through a small, useful pilot, built with the people who will use it.

The assistant will answer menu and store questions using approved information. It will help with simple pickup orders and ask the customer to confirm. When someone has a complaint or needs a person, the team will take over with the conversation history. Staff will also be able to pause the assistant.

We propose starting with three stores with different profiles. We will train their teams, review conversations daily, and compare results with the starting point and similar stores. We will expand only when service quality and team readiness support it.

The expected business benefit is more completed orders and less repetitive work. We will track response speed, first-contact resolution, satisfaction, conversion, and team adoption. We will set targets together after measuring the starting point. We will also consider solution costs when evaluating the benefit.

Within three weeks, we will prepare a proposal for your board, including scope, costs, and technical dependencies. After approval and access to the systems, our proposed plan is sixty days, with staged decisions.

The next step is to schedule a working session with Operations, franchise representatives, and the owners of the CRM and order system. Together, we will select three pilot stores and agree on what success looks like.`;
