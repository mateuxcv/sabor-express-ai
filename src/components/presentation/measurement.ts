/** Familiar service, sales and adoption KPIs, explained for a spoken pitch.
 * No calculated examples, benchmarks or unsupported numeric targets. */
export type PresentationMetric = {
  id: string;
  name: string;
  label: string;
  summary: string;
  source: string;
  care: string;
  speech: string;
  featured?: boolean;
};

export const metrics: PresentationMetric[] = [
  {
    id: 'speed', name: 'Tempo de resposta', label: 'TPR',
    summary: 'Menos espera no WhatsApp.',
    speech: '“Vamos acompanhar se o cliente recebe uma primeira resposta útil mais rápido.”',
    source: 'Histórico de atendimento, observando os horários de pico de cada loja.',
    care: 'TPR significa tempo de primeira resposta. Uma saudação automática não é uma resposta útil; observar também quem continua esperando.',
  },
  {
    id: 'resolution', name: 'Resolução no primeiro contato', label: 'FCR',
    summary: 'Resolver sem o cliente precisar voltar.',
    speech: '“Queremos resolver a solicitação no primeiro atendimento, sem fazer o cliente voltar pelo mesmo problema.”',
    source: 'Histórico e revisão de atendimentos, identificando o pedido e o motivo do contato.',
    care: 'FCR significa resolução no primeiro contato. Um novo pedido não é uma falha. A equipe pode assumir e resolver no mesmo atendimento; uma transferência necessária não é automaticamente um problema.',
  },
  {
    id: 'experience', name: 'Satisfação do cliente', label: 'CSAT', featured: true,
    summary: 'Clientes satisfeitos com o atendimento.',
    speech: '“Vamos perguntar ao cliente se ele ficou satisfeito com o atendimento recebido.”',
    source: 'Pesquisa curta ao finalizar o atendimento, acompanhada dos comentários dos clientes.',
    care: 'CSAT mede satisfação com essa experiência. Separar problemas do atendimento de problemas do produto ou da entrega e observar se há respostas suficientes para concluir algo.',
  },
  {
    id: 'conversion', name: 'Conversão em pedidos', label: 'Vendas',
    summary: 'Mais conversas virando pedidos.',
    speech: '“Vamos observar se quem procura a loja para comprar consegue concluir o pedido.”',
    source: 'Conversas com intenção de compra e pedidos confirmados pelo sistema da loja.',
    care: 'Mensagens não são pedidos. Considerar desistências, estoque e promoções ao comparar os resultados; um contato no CRM não comprova uma venda.',
  },
  {
    id: 'adoption', name: 'Adoção da equipe', label: 'Uso',
    summary: 'A central fazendo parte da rotina.',
    speech: '“Vamos acompanhar se os atendentes realmente usam a central no dia a dia.”',
    source: 'Uso da plataforma para assumir, responder e finalizar atendimentos, junto do feedback das lojas.',
    care: 'Ter uma conta ou apenas fazer login não é adoção. Ouvir as dificuldades e considerar a escala e a oportunidade real de uso.',
  },
];

export const measurementGuide = {
  title: 'Guia de fala dos KPIs',
  lead: 'Cinco indicadores usuais de atendimento, vendas e adoção. Explique o que cada um mostra e por que ele importa para a loja.',
  opening: '“Vamos olhar cinco coisas simples: rapidez, resolução, satisfação, pedidos concluídos e uso pela equipe.”',
  goal: 'Comparar a situação atual com o piloto em lojas semelhantes. As metas serão combinadas com Operações no diagnóstico, preservando a qualidade do atendimento.',
  closing: '“O piloto precisa ajudar o cliente a comprar, facilitar o trabalho da equipe e manter a satisfação.”',
  status: 'Estes são os indicadores que propomos acompanhar. Os resultados reais ainda precisam ser coletados e validados nas lojas.',
  newOrder: 'Um novo pedido é um novo atendimento. Um retorno pelo mesmo problema pode indicar falta de resolução. Uma consulta legítima de status não é automaticamente falha.',
  scope: 'O piloto segue focado em retirada. Se delivery entrar depois, avaliar essa operação separadamente; espera por uma resposta e prazo de entrega são coisas diferentes.',
};
