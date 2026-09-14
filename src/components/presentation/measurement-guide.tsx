import { measurementGuide, metrics } from './measurement';

/** The same reference is available in the presenter notes and on demand. */
export function MeasurementGuide() {
  return <div className="deck-measurement-guide">
    <section><h3>Como abrir a fala</h3><blockquote>{measurementGuide.opening}</blockquote><p>{measurementGuide.lead}</p></section>
    {metrics.map(metric => <section key={metric.id} aria-label={`Guia: ${metric.name}`}>
      <h3>{metric.name}</h3><blockquote>{metric.speech}</blockquote>
      <dl><div><dt>Onde acompanhar</dt><dd>{metric.source}</dd></div><div><dt>Lembrete para a conversa</dt><dd>{metric.care}</dd></div></dl>
    </section>)}
    <section><h3>Como fechar a fala</h3><blockquote>{measurementGuide.closing}</blockquote><p>{measurementGuide.goal}</p><p>{measurementGuide.status}</p></section>
    <section><h3>Se perguntarem sobre novos pedidos</h3><p>{measurementGuide.newOrder}</p><p>{measurementGuide.scope}</p></section>
  </div>;
}
