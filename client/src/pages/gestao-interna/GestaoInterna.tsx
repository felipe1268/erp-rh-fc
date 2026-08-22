import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import "./GestaoInterna.css";
import {
  Building2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  Signal,
  SignalLow,
  TimerReset,
  Users,
} from "lucide-react";

type Period = { total: number; validados: number; pendentes: number; glosados: number };
type Plan = { obraId: number; obraNome: string; previstoPercent: number | null; realizadoPercent: number | null; desvioPercent: number | null };
type People = { obraId: number; obraNome: string; alocadosHoje: number; equipePropria: number; terceiros: number; efetivoTotal: number; presentesDdsHoje: number; possiveisAusenciasDdsHoje: number; faltasSemana: number; atestadosSemana: number; advertenciasSemana: number; acidentesSemana: number };

const fmt = (n: number | null | undefined) => new Intl.NumberFormat("pt-BR").format(n ?? 0);
const pct = (n: number | null | undefined) => n == null ? "—" : `${n.toFixed(1).replace(".", ",")}%`;
const hours = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? "—" : `${Math.round(n)}h`;
const cap = (n: number) => Math.max(0, Math.min(100, n));
const shortName = (text: string) => text.length > 19 ? `${text.slice(0, 18)}…` : text;

function Meter({ label, value, detail, tone = "blue" }: { label: string; value: number; detail: string; tone?: "blue" | "amber" | "red" }) {
  const safe = cap(value);
  return <div className="gi-meter" role="img" aria-label={`${label}: ${pct(safe)}`}>
    <div className={`gi-meter-ring ${tone}`} style={{ "--meter": `${safe * 1.8}deg` } as CSSProperties}><div><strong>{pct(safe)}</strong><span>{label}</span></div></div>
    <small>{detail}</small>
  </div>;
}

function Panel({ title, eyebrow, children, className = "" }: { title: string; eyebrow?: string; children: ReactNode; className?: string }) {
  return <article className={`gi-panel ${className}`}><header className="gi-panel-head"><div><span>{eyebrow ?? "Visão operacional"}</span><h2>{title}</h2></div><i /></header>{children}</article>;
}

type ScreenKpi = { label: string; value: string | number; tone?: "warn" | "critical" };

function ScreenKpis({ items }: { items: ScreenKpi[] }) {
  return <section className="gi-screen-kpis">{items.map((item) => <div className={`gi-kpi ${item.tone ?? ""}`} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</section>;
}

function ProductionChart({ periods }: { periods: { name: string; data: Period }[] }) {
  const max = Math.max(1, ...periods.map((p) => p.data.total));
  if (!periods.some((period) => period.data.total > 0)) {
    return <div className="gi-production-empty" role="img" aria-label="Sem registros de produção nos períodos selecionados">
      <div>{periods.map(({ name }) => <span key={name}><i /><b>0</b><small>{name}</small></span>)}</div>
      <p>Nenhum registro de produção no período</p>
    </div>;
  }
  return <div className="gi-production-chart" role="img" aria-label="Produção por período">
    {periods.map(({ name, data }) => {
      const total = data.total || 0;
      const height = total ? Math.max(8, total / max * 100) : 0;
      return <div className="gi-column" key={name}><div className="gi-column-area"><div className="gi-column-stack" style={{ height: `${height}%` }}><i className="validated" style={{ height: `${total ? data.validados / total * 100 : 0}%` }} /><i className="pending" style={{ height: `${total ? data.pendentes / total * 100 : 0}%` }} /><i className="rejected" style={{ height: `${total ? data.glosados / total * 100 : 0}%` }} /></div></div><b>{fmt(total)}</b><span>{name}</span></div>;
    })}
  </div>;
}

function PeopleBars({ rows }: { rows: People[] }) {
  const max = Math.max(1, ...rows.map((row) => row.efetivoTotal));
  return <div className="gi-people-bars" role="img" aria-label="Efetivo próprio e terceiros por obra">
    <div className="gi-legend right"><span><i className="own" />Própria</span><span><i className="third" />Terceiros</span><span><i className="dds" />DDS</span></div>
    {rows.slice(0, 7).map((row) => <div className="gi-people-row" key={row.obraId}><span title={row.obraNome}>{shortName(row.obraNome)}</span><div className="gi-people-track"><i className="own" style={{ width: `${row.equipePropria / max * 100}%` }} /><i className="third" style={{ left: `${row.equipePropria / max * 100}%`, width: `${row.terceiros / max * 100}%` }} /><i className="dds" style={{ width: `${row.presentesDdsHoje / max * 100}%` }} /></div><strong>{fmt(row.efetivoTotal)}<small>{fmt(row.equipePropria)} + {fmt(row.terceiros)}</small></strong></div>)}
    {!rows.length && <p className="gi-empty">Sem efetivo por obra.</p>}
  </div>;
}

function PlanBars({ rows }: { rows: Plan[] }) {
  const active = rows.filter((r) => r.previstoPercent != null || r.realizadoPercent != null).slice(0, 6);
  return <div className="gi-plan-bars" role="img" aria-label="Planejado contra realizado por obra">{active.map((row) => {
    const actual = cap(row.realizadoPercent ?? 0); const planned = cap(row.previstoPercent ?? 0); const late = (row.desvioPercent ?? actual - planned) < 0;
    return <div className="gi-plan-row" key={row.obraId}><span title={row.obraNome}>{shortName(row.obraNome)}</span><div><i className={late ? "late" : ""} style={{ width: `${actual}%` }} /><b style={{ left: `${planned}%` }} /></div><strong className={late ? "late" : ""}>{pct(actual)}</strong></div>;
  })}{!active.length && <p className="gi-empty">Sem avanço registrado.</p>}</div>;
}

function PeriodStrip({ title, values, alert = false }: { title: string; values: { semana: number; mes: number; ano: number }; alert?: boolean }) {
  return <div className={`gi-period-strip ${alert ? "alert" : ""}`}><div><strong>{title}</strong><small>Registros</small></div><div><b>{fmt(values.semana)}</b><small>Semana</small></div><div><b>{fmt(values.mes)}</b><small>Mês</small></div><div><b>{fmt(values.ano)}</b><small>Ano</small></div></div>;
}

function GestaoInternaContent() {
  const screens = ["Operação", "Planejamento e Risco", "Suprimentos", "Segurança", "RH"];
  const { selectedCompany, getCompanyIdsForQuery } = useCompany();
  const companyIds = getCompanyIdsForQuery();
  const [obraId, setObraId] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const [full, setFull] = useState(false);
  const [fullError, setFullError] = useState("");
  const [activeScreen, setActiveScreen] = useState(0);
  const [rotationSeconds, setRotationSeconds] = useState(() => {
    if (typeof window === "undefined") return 20;
    const raw = window.localStorage.getItem("gestao-interna-rotation-seconds");
    if (raw === null) return 20;
    const stored = Number(raw);
    return [0, 10, 15, 20, 30, 45, 60].includes(stored) ? stored : 20;
  });
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(rotationSeconds);
  const [rotationKey, setRotationKey] = useState(0);
  const query = trpc.gestaoInterna.dashboard.useQuery({ companyIds, obraId }, { enabled: companyIds.length > 0, refetchInterval: 120000, staleTime: 60000, retry: 2, refetchOnWindowFocus: false });
  const data = query.data;
  const obras = data?.obras ?? [];
  const plans = data?.planejamento.porObra ?? [];
  const people = data?.pessoas.porObra ?? [];
  const noScope = companyIds.length === 0;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const stale = data ? Date.now() - new Date(data.generatedAt).getTime() > 300000 : false;
  const progress = useMemo(() => {
    const valid = plans.filter((p: Plan) => p.previstoPercent != null || p.realizadoPercent != null);
    const planned = valid.length ? valid.reduce((a: number, p: Plan) => a + (p.previstoPercent ?? 0), 0) / valid.length : 0;
    const actual = valid.length ? valid.reduce((a: number, p: Plan) => a + (p.realizadoPercent ?? 0), 0) / valid.length : 0;
    return { planned, actual, ratio: planned > 0 ? actual / planned * 100 : 0 };
  }, [plans]);
  const radar = useMemo(() => {
    const source = data?.radar ?? [];
    return { normal: source.filter((r) => r.severidade === "normal").length, attention: source.filter((r) => r.severidade === "atencao").length, critical: source.filter((r) => r.severidade === "critico").length };
  }, [data?.radar]);
  const radarTotal = radar.normal + radar.attention + radar.critical;
  const safetyRate = data?.headline.alocadosHoje ? data.headline.presentesDdsHoje / data.headline.alocadosHoje * 100 : 0;
  const coverage = data?.headline.colaboradoresAtivos ? data.headline.alocadosHoje / data.headline.colaboradoresAtivos * 100 : 0;
  const ownTotal = people.reduce((total: number, row: People) => total + row.equipePropria, 0);
  const thirdTotal = people.reduce((total: number, row: People) => total + row.terceiros, 0);

  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); const sync = () => setFull(Boolean(document.fullscreenElement)); document.addEventListener("fullscreenchange", sync); return () => { window.clearInterval(timer); document.removeEventListener("fullscreenchange", sync); }; }, []);
  useEffect(() => { window.localStorage.setItem("gestao-interna-rotation-seconds", String(rotationSeconds)); }, [rotationSeconds]);
  useEffect(() => {
    setRemaining(rotationSeconds);
    if (paused || rotationSeconds === 0) return;
    const timer = window.setInterval(() => setRemaining((seconds) => {
      if (seconds <= 1) {
        setActiveScreen((screen) => (screen + 1) % screens.length);
        return rotationSeconds;
      }
      return seconds - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [paused, rotationKey, rotationSeconds, screens.length]);
  const toggleFullscreen = async () => { setFullError(""); try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setFullError("Tela cheia indisponível."); } };
  const showScreen = (next: number) => { setActiveScreen((next + screens.length) % screens.length); setPaused(true); setRotationKey((key) => key + 1); };
  const changeRotation = (value: number) => { setRotationSeconds(value); setPaused(value === 0); setRotationKey((key) => key + 1); };
  const sync = noScope ? "Sem escopo" : query.isLoading ? "Carregando" : query.isError ? "Falha de conexão" : offline ? "Offline" : stale ? "Dados desatualizados" : "Atualização em dia";

  return <div className={`gi-shell ${full ? "gi-full" : ""}`}><div className="gi-board">
    <header className="gi-topbar"><div className="gi-brand"><div className="gi-mark"><span /><span /><span /></div><div><p>Centro de comando</p><h1>Gestão interna</h1></div></div><div className="gi-actions">
      <label className="gi-filter"><Building2 size={14} /><select aria-label="Filtrar por obra" value={obraId ?? "all"} onChange={(e) => setObraId(e.target.value === "all" ? null : Number(e.target.value))}><option value="all">Consolidado · {selectedCompany?.name ?? "empresa"}</option>{obras.map((obra) => <option value={obra.id} key={obra.id}>{obra.nome}</option>)}</select><ChevronDown size={13} /></label>
      <label className="gi-rotation-select"><TimerReset size={14} /><span>Troca</span><select aria-label="Intervalo de troca automática" value={rotationSeconds} onChange={(event) => changeRotation(Number(event.target.value))}><option value={10}>10 s</option><option value={15}>15 s</option><option value={20}>20 s</option><option value={30}>30 s</option><option value={45}>45 s</option><option value={60}>60 s</option><option value={0}>Manual</option></select></label>
      <div className="gi-time"><Clock3 size={13} />{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div><button className="gi-button" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={14} className={query.isFetching ? "gi-spin" : ""} />Atualizar</button><button className="gi-button icon-button" onClick={toggleFullscreen} aria-label={full ? "Sair da tela cheia" : "Abrir tela cheia"}>{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
    </div></header>
    <div className={`gi-status ${query.isError || offline ? "bad" : stale ? "warn" : ""}`} role="status"><span />{query.isError || offline ? <SignalLow size={13} /> : <Signal size={13} />}{sync}<time>{data ? `Atualizado ${new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</time></div>{fullError && <div className="gi-inline-error">{fullError}</div>}
    {noScope && <div className="gi-state"><Building2 size={32} /><h2>Selecione uma empresa</h2><p>Sem escopo operacional disponível.</p></div>}
    {!noScope && query.isLoading && <div className="gi-loading"><div className="gi-loading-row">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div><div className="gi-loading-main"><i /><i /><i /></div></div>}
    {!noScope && query.isError && <div className="gi-state"><SignalLow size={32} /><h2>Falha ao carregar</h2><p>Não foi possível ler os indicadores.</p><button className="gi-button" onClick={() => query.refetch()}><RefreshCw size={14} />Tentar novamente</button></div>}
    {!noScope && !query.isLoading && !query.isError && data && obras.length === 0 && <div className="gi-state"><Building2 size={32} /><h2>Sem obras ativas</h2><p>Não há indicadores no escopo atual.</p></div>}
    {!noScope && !query.isLoading && !query.isError && data && obras.length > 0 && <main className="gi-rotator">
      <nav className="gi-screen-nav" aria-label="Telas do painel">{screens.map((screen, index) => <button key={screen} className={activeScreen === index ? "active" : ""} aria-pressed={activeScreen === index} onClick={() => showScreen(index)}><span>{String(index + 1).padStart(2, "0")}</span>{screen}</button>)}</nav>
      <div className="gi-rotation-controls"><button className="gi-button icon-button" onClick={() => showScreen(activeScreen - 1)} aria-label="Tela anterior"><ChevronLeft size={17} /></button><button className="gi-button gi-pause" disabled={rotationSeconds === 0} onClick={() => { setPaused((value) => !value); setRotationKey((key) => key + 1); }}>{paused || rotationSeconds === 0 ? <Play size={14} /> : <Pause size={14} />}{paused || rotationSeconds === 0 ? "Retomar" : "Pausar"}</button><button className="gi-button icon-button" onClick={() => showScreen(activeScreen + 1)} aria-label="Próxima tela"><ChevronRight size={17} /></button><span>{rotationSeconds === 0 ? "Navegação manual" : paused ? "Rotação pausada" : `Próxima em ${remaining}s`}</span></div>
      <div className="gi-screen-progress"><i style={{ width: `${rotationSeconds && !paused ? (1 - remaining / rotationSeconds) * 100 : 0}%` }} /></div>
      {activeScreen === 0 && <section className="gi-screen" key="operation"><header className="gi-screen-title"><div><span>01 · Centro de comando</span><h2>Operação</h2><p>Produção e ritmo de execução no campo.</p></div><b>{pct(progress.ratio)}<small>Performance</small></b></header><ScreenKpis items={[{ label: "Obras ativas", value: fmt(data.headline.obrasAtivas) }, { label: "Produção no mês", value: fmt(data.producao.mesAtual.total) }, { label: "Obras atrasadas", value: fmt(data.headline.obrasAtrasadas), tone: data.headline.obrasAtrasadas ? "critical" : undefined }, { label: "Entregas atrasadas", value: fmt(data.headline.entregasAtrasadas), tone: data.headline.entregasAtrasadas ? "critical" : undefined }]} /><div className="gi-screen-grid operation"><Panel title="Produção" eyebrow="Ritmo de entrega"><div className="gi-meter-row"><Meter label="Performance" value={progress.ratio} detail={`Meta ${pct(progress.planned)} · real. ${pct(progress.actual)}`} tone={progress.ratio < 80 && progress.planned > 0 ? "red" : "blue"} /><Meter label="Cobertura" value={coverage} detail={`${fmt(data.headline.alocadosHoje)} alocados`} /></div><ProductionChart periods={[{ name: "Hoje", data: data.producao.hoje }, { name: "Sem. ant.", data: data.producao.semanaAnterior }, { name: "Semana", data: data.producao.semanaAtual }, { name: "Mês", data: data.producao.mesAtual }]} /><div className="gi-legend"><span><i className="validated" />Validado</span><span><i className="pending" />Pendente</span><span><i className="rejected" />Glosado</span></div></Panel><Panel title="Sinais operacionais" eyebrow="Prioridades de hoje"><div className="gi-stat-list"><div><span>Atividades em risco</span><b>{fmt(data.planejamento.atividadesEmRisco)}</b></div><div><span>Atividades atrasadas</span><b className={data.planejamento.atividadesAtrasadas ? "red" : ""}>{fmt(data.planejamento.atividadesAtrasadas)}</b></div><div><span>Compras pendentes</span><b>{fmt(data.headline.comprasPendentes)}</b></div><div><span>Efetivo alocado</span><b>{fmt(data.headline.alocadosHoje)}</b></div></div></Panel></div></section>}
      {activeScreen === 1 && <section className="gi-screen" key="planning"><header className="gi-screen-title"><div><span>02 · Avanço físico</span><h2>Planejamento e Risco</h2><p>Previsto, realizado e desvios por obra.</p></div><b>{fmt(radarTotal)}<small>Itens no radar</small></b></header><ScreenKpis items={[{ label: "Avanço previsto", value: pct(progress.planned) }, { label: "Avanço realizado", value: pct(progress.actual) }, { label: "Atividades em risco", value: fmt(data.planejamento.atividadesEmRisco), tone: data.planejamento.atividadesEmRisco ? "warn" : undefined }, { label: "Atividades atrasadas", value: fmt(data.planejamento.atividadesAtrasadas), tone: data.planejamento.atividadesAtrasadas ? "critical" : undefined }]} /><div className="gi-screen-grid planning"><Panel title="Evolução por obra" eyebrow="Realizado x previsto"><div className="gi-plan-note"><span>Realizado</span><span>Traço = previsto</span></div><PlanBars rows={plans} /></Panel><Panel title="Radar de atenção" eyebrow="Sinalização consolidada"><div className="gi-radar gi-radar-wide"><div className="gi-donut" style={{ "--normal": `${radarTotal ? radar.normal / radarTotal * 100 : 100}%`, "--attention": `${radarTotal ? (radar.normal + radar.attention) / radarTotal * 100 : 100}%` } as CSSProperties}><div><strong>{fmt(radarTotal)}</strong><span>Radar</span></div></div><div className="gi-radar-key"><span><i />Normal {fmt(radar.normal)}</span><span><i className="amber" />Atenção {fmt(radar.attention)}</span><span><i className="red" />Crítico {fmt(radar.critical)}</span></div></div></Panel></div></section>}
      {activeScreen === 2 && <section className="gi-screen" key="supply"><header className="gi-screen-title"><div><span>03 · Cadeia de suprimentos</span><h2>Suprimentos</h2><p>Fila de compras, entregas e tempo de resposta.</p></div><b>{fmt(data.compras.ordensAbertas)}<small>OCs abertas</small></b></header><ScreenKpis items={[{ label: "Solicitações abertas", value: fmt(data.compras.solicitacoesAbertas) }, { label: "Cotações abertas", value: fmt(data.compras.cotacoesAbertas) }, { label: "Ordens abertas", value: fmt(data.compras.ordensAbertas) }, { label: "Entregas em atraso", value: fmt(data.compras.entregasAtrasadas), tone: data.compras.entregasAtrasadas ? "critical" : undefined }]} /><div className="gi-screen-grid supply"><Panel title="Fila de compras" eyebrow="Status das solicitações"><div className="gi-number-grid"><div><b>{fmt(data.compras.solicitacoesAbertas)}</b><span>Solicitações</span></div><div><b>{fmt(data.compras.cotacoesAbertas)}</b><span>Cotações</span></div><div><b>{fmt(data.compras.ordensAbertas)}</b><span>Ordens abertas</span></div><div className={data.compras.entregasAtrasadas ? "critical" : ""}><b>{fmt(data.compras.entregasAtrasadas)}</b><span>Em atraso</span></div></div></Panel><Panel title="Lead time" eyebrow="Tempo de movimentação"><div className="gi-number-grid gi-number-grid-two"><div><b>{hours(data.compras.leadTime.scCotacaoHoras)}</b><span>SC → cotação</span></div><div><b>{hours(data.compras.leadTime.cotacaoOcHoras)}</b><span>Cotação → OC</span></div></div><p className="gi-supply-note">Acompanhamento consolidado das compras no escopo selecionado.</p></Panel></div></section>}
      {activeScreen === 3 && <section className="gi-screen" key="safety"><header className="gi-screen-title"><div><span>04 · Pessoas no campo</span><h2>Segurança</h2><p>Cobertura de DDS e sinais agregados de segurança.</p></div><b>{pct(safetyRate)}<small>Cobertura DDS</small></b></header><ScreenKpis items={[{ label: "DDS presentes", value: fmt(data.headline.presentesDdsHoje) }, { label: "Possíveis ausências", value: fmt(data.headline.possiveisAusenciasDdsHoje), tone: data.headline.possiveisAusenciasDdsHoje ? "warn" : undefined }, { label: "Acidentes semana", value: fmt(data.pessoas.semana.acidentes), tone: data.pessoas.semana.acidentes ? "critical" : undefined }, { label: "Acidentes graves", value: fmt(data.pessoas.semana.acidentesGraves), tone: data.pessoas.semana.acidentesGraves ? "critical" : undefined }]} /><div className="gi-screen-grid safety"><Panel title="Cobertura no campo" eyebrow="DDS por obra"><div className="gi-safety"><Meter label="DDS" value={safetyRate} detail={`${fmt(data.headline.presentesDdsHoje)} presentes · ${fmt(data.headline.alocadosHoje)} alocados`} /><div className="gi-stat-list"><div><span>Possíveis ausências</span><b>{fmt(data.headline.possiveisAusenciasDdsHoje)}</b></div><div><span>Advertências</span><b>{fmt(data.pessoas.semana.advertencias)}</b></div><div><span>Acidentes</span><b className={data.pessoas.semana.acidentes ? "red" : ""}>{fmt(data.pessoas.semana.acidentes)}</b></div></div></div><PeopleBars rows={people} /></Panel><Panel title="Histórico agregado" eyebrow="Saúde e segurança"><div className="gi-health-grid"><PeriodStrip title="Acidentes" values={data.pessoas.saude.acidentes} alert={data.pessoas.saude.acidentes.ano > 0} /><PeriodStrip title="Atestados" values={data.pessoas.saude.atestados} /></div></Panel></div></section>}
      {activeScreen === 4 && <section className="gi-screen" key="rh"><header className="gi-screen-title"><div><span>05 · Gestão de pessoas</span><h2>RH</h2><p>Efetivo, distribuição por obra e movimentações.</p></div><b>{fmt(data.headline.colaboradoresAtivos)}<small>Colaboradores</small></b></header><ScreenKpis items={[{ label: "Efetivo próprio", value: fmt(ownTotal) }, { label: "Terceiros", value: fmt(thirdTotal) }, { label: "Faltas na semana", value: fmt(data.pessoas.semana.faltas), tone: data.pessoas.semana.faltas ? "warn" : undefined }, { label: "Saldo RH", value: fmt(data.pessoas.semana.admissoes - data.pessoas.semana.demissoes) }]} /><div className="gi-screen-grid rh"><Panel title="Efetivo por obra" eyebrow="Própria, terceiros e DDS"><PeopleBars rows={people} /></Panel><Panel title="Movimentação e presença" eyebrow="Resumo da semana"><div className="gi-rh-head"><div><Users size={15} /><b>{fmt(data.headline.colaboradoresAtivos)}</b><span>Colaboradores</span></div><div><b>{fmt(data.pessoas.semana.atestados)}</b><span>Atestados</span></div><div><b>{fmt(data.pessoas.semana.admissoes)}</b><span>Admissões</span></div><div><b>{fmt(data.pessoas.semana.demissoes)}</b><span>Desligamentos</span></div></div><div className="gi-health-grid"><PeriodStrip title="Atestados" values={data.pessoas.saude.atestados} /><PeriodStrip title="Acidentes" values={data.pessoas.saude.acidentes} alert={data.pessoas.saude.acidentes.ano > 0} /></div></Panel></div></section>}
    </main>}
  </div></div>;
}

export default function GestaoInterna() { return <DashboardLayout><GestaoInternaContent /></DashboardLayout>; }