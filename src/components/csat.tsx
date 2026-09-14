"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, RefreshCw, Star } from "lucide-react";
import { csatAction, csatLabels, csatMetricsSchema, csatSurveySchema, type CsatMetrics, type CsatSurvey } from "@/lib/csat-contract";
import { demoActions } from "@/lib/demo-store";

const crmLabels: Record<string, string> = { pending: "Na fila do RD", processing: "Sincronizando com RD", synced: "Registrado no RD", blocked: "Ação necessária no CRM", failed: "Falha no CRM", uncertain: "Conferir no CRM", skipped: "Somente local" };
const number = (value: number | null, suffix = "") => value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix}`;

function CsatCrmStatus({ survey }: { survey: CsatSurvey }) {
  return <div className="csat-crm-status"><span>{survey.crmStatus ? crmLabels[survey.crmStatus] : "Aguardando avaliação"}</span>
    {survey.dealUrl && <a href={survey.dealUrl} target="_blank" rel="noopener noreferrer">Ver no RD <ArrowUpRight size={12} /></a>}
    {survey.crmError && <><p>{survey.crmError}</p><a href="/crm">Revisar sincronização <ArrowUpRight size={12} /></a></>}
  </div>;
}

export function CsatSurveyCard({ survey, customerView }: { survey: CsatSurvey; customerView: boolean }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/csat?conversationId=${encodeURIComponent(survey.conversationId)}`, { cache: "no-store", signal: controller.signal });
        if (response.ok) {
          const result = await response.json();
          if (result.survey && !controller.signal.aborted) demoActions.syncCsat(csatSurveySchema.parse(result.survey));
        }
      } catch { /* A resposta salva continua visível; envio possui erro e retentativa próprios. */ }
      finally { inFlight = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [survey.conversationId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (score === null || busy) return;
    setBusy(true); setError("");
    try { demoActions.syncCsat(await csatAction({ action: "answer", surveyId: survey.id, conversationId: survey.conversationId, score, comment })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar. Tente novamente."); }
    finally { setBusy(false); }
  }

  return <section className="csat-survey" aria-label="Pesquisa de satisfação">
    <strong><Star size={16} /> Sua opinião conta</strong>
    {survey.score !== null ? <div className="csat-saved" role="status"><b>{survey.score}/5 · {csatLabels[survey.score - 1]}</b><p>Avaliação registrada. Obrigada!</p>{survey.comment && <blockquote>{survey.comment}</blockquote>}</div> : customerView ? <form onSubmit={submit}>
      <fieldset disabled={busy}><legend>Como foi seu atendimento?</legend><div className="csat-rating">{csatLabels.map((label, index) => <label key={label} title={label} className={score === index + 1 ? "selected" : ""}><input type="radio" name={`score-${survey.id}`} value={index + 1} checked={score === index + 1} onChange={() => setScore(index + 1)} aria-label={`${index + 1} · ${label}`} /><span>{index + 1}</span></label>)}</div><div className="csat-scale"><span>1 · Muito insatisfeito</span><span>5 · Muito satisfeito</span></div>
        <label className="csat-comment">Comentário opcional<textarea maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="O que podemos melhorar?" rows={2} /></label>
      </fieldset>
      {error && <p role="alert" className="crm-error">{error}</p>}
      <button type="submit" className="primary-button" disabled={busy || score === null}>{busy ? "Salvando…" : "Enviar avaliação"}</button>
    </form> : <p>Aguardando o cliente responder na visão do cliente.</p>}
    {!customerView && <CsatCrmStatus survey={survey} />}
  </section>;
}

export function CsatDashboard() {
  const [store, setStore] = useState("");
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ store: string; data: CsatMetrics } | null>(null);
  const [error, setError] = useState("");
  const data = result?.store === store ? result.data : null;
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/csat${store ? `?store=${encodeURIComponent(store)}` : ""}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar o CSAT.");
        const parsed = csatMetricsSchema.parse(body);
        if (!controller.signal.aborted) { setResult({ store, data: parsed }); setError(""); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "CSAT indisponível."); }
      finally { inFlight = false; }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [store, version]);

  return <section className="csat-dashboard" aria-label="Resultados CSAT">
    <div className="section-title"><div><h2>Satisfação dos clientes · CSAT</h2><p>Pesquisas registradas no backend · todo o período</p></div><div className="csat-filters"><label>Unidade<select aria-label="Unidade do CSAT" value={store} onChange={(event) => setStore(event.target.value)}><option value="">Todas as unidades</option>{["Pinheiros", "Vila Mariana", "Moema"].map((unit) => <option key={unit} value={`São Paulo · ${unit}`}>{unit}</option>)}</select></label><button className="icon-button" aria-label="Atualizar CSAT" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={17} /></button></div></div>
    {error && <p role="alert" className="crm-error">{error}{data && " Os números abaixo são da última atualização disponível."}</p>}
    {!data && !error && <p>Carregando avaliações…</p>}
    {data && <>
      <div className="csat-kpis">{[
        ["CSAT · notas 4 e 5", number(data.csatPercent, "%"), "Clientes satisfeitos / respostas recebidas"],
        ["Nota média", number(data.average, "/5"), "Média das notas recebidas"],
        ["Taxa de resposta", number(data.responseRate, "%"), `${data.answered} respostas / ${data.sent} pesquisas`],
        ["Aguardando resposta", String(data.pending), "Pesquisas ainda não respondidas"],
      ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>)}</div>
      <div className="csat-distribution" aria-label="Distribuição das notas">{data.distribution.map((item) => <span key={item.score}>{item.score} <Star size={12} /> <b>{item.count}</b></span>)}</div>
      <div className="csat-history"><h3>Últimas pesquisas <small>Até 50 registros</small></h3>{data.recent.length ? data.recent.map((survey) => <article key={survey.id}>
        <div><strong>{survey.customerName}</strong><span>{survey.store}</span><time>{new Date((survey.answeredAt || survey.createdAt) * 1000).toLocaleString("pt-BR")}</time></div>
        <div><b>{survey.score === null ? "Aguardando resposta" : `${survey.score}/5 · ${csatLabels[survey.score - 1]}`}</b>{survey.comment && <p>{survey.comment}</p>}<CsatCrmStatus survey={survey} /></div>
      </article>) : <p>Nenhuma pesquisa enviada. Finalize uma conversa para solicitar a avaliação.</p>}</div>
    </>}
  </section>;
}
