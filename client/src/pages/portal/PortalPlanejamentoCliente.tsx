import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft, Calendar, MapPin, TrendingUp, AlertTriangle, Clock,
  CheckCircle2, Building2, Lock, ListTree, Activity, BarChart3, History,
  CalendarDays,
} from "lucide-react";
import { PORTAL_CLIENTE_ABAS, type PortalClienteAbaKey } from "@shared/portalClienteAbas";

const fmtBR = (s?: string | null) => (s ? s.split("T")[0].split("-").reverse().join("/") : "—");
const fmtPct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;

const ABA_ICONS: Record<string, any> = {
  visao_geral: TrendingUp,
  cronograma: ListTree,
  avanco_semanal: Activity,
  prog_semanal: CalendarDays,
  curva_s: BarChart3,
  revisoes: History,
};

function statusBadge(realizado: number, dataFim: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  if (realizado >= 100) return { label: "Concluída", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (dataFim && dataFim < today && realizado < 100) return { label: "Atrasada", cls: "bg-red-100 text-red-700 border-red-200" };
  if (realizado > 0) return { label: "Em execução", cls: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "Prevista", cls: "bg-slate-100 text-slate-600 border-slate-200" };
}

export default function PortalPlanejamentoCliente() {
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ obraId: string }>("/portal/cliente/obra/:obraId");
  const obraId = params?.obraId ? Number(params.obraId) : 0;
  const token = localStorage.getItem("portal_token") || "";
  const tipo = localStorage.getItem("portal_tipo") || "";

  useEffect(() => {
    if (!token) { navigate("/portal/cliente/login"); return; }
    if (tipo && tipo !== "cliente") { navigate("/portal/dashboard"); }
  }, [token, tipo, navigate]);

  const { data, isLoading, error } = trpc.portalExterno.cliente.planejamentoObra.useQuery(
    { token, obraId },
    { enabled: !!token && tipo === "cliente" && obraId > 0 }
  );

  const obra = data?.obra as any;
  const projeto = data?.projeto as any;
  const kpis = data?.kpis as any;
  const semanaAtual = (data?.semanaAtual || []) as any[];
  const atrasadas = (data?.atrasadas || []) as any[];
  const proximas = (data?.proximas || []) as any[];
  const progSemanal = ((data as any)?.progSemanal || []) as any[];
  const curvaS = ((data as any)?.curvaS || []) as { semana: string; previsto: number; realizado: number }[];
  const atividadesTodas = ((data as any)?.atividadesTodas || []) as any[];
  const revisoes = ((data as any)?.revisoes || []) as any[];
  const abasLiberadas = ((data as any)?.abasLiberadas || ["visao_geral"]) as PortalClienteAbaKey[];

  const abasVisiveis = useMemo(() => {
    const liber = new Set(abasLiberadas);
    return PORTAL_CLIENTE_ABAS.filter((a) => liber.has(a.key));
  }, [abasLiberadas]);

  const [aba, setAba] = useState<PortalClienteAbaKey>("visao_geral");

  useEffect(() => {
    if (abasVisiveis.length > 0 && !abasVisiveis.find((a) => a.key === aba)) {
      setAba(abasVisiveis[0].key);
    }
  }, [abasVisiveis, aba]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" size="sm" onClick={() => navigate("/portal/cliente/dashboard")} className="gap-1.5 shrink-0">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
            <div className="min-w-0">
              <h1 className="font-semibold text-slate-800 text-sm truncate">{obra?.nome || "Carregando..."}</h1>
              <p className="text-xs text-slate-500 truncate">Planejamento da obra</p>
            </div>
          </div>
          {obra?.status && <Badge variant="outline" className="text-[10px] shrink-0">{obra.status}</Badge>}
        </div>
        {abasVisiveis.length > 1 && (
          <div className="max-w-7xl mx-auto px-2 overflow-x-auto">
            <div className="flex gap-0.5 border-t pt-1">
              {abasVisiveis.map((a) => {
                const Icon = ABA_ICONS[a.key] || TrendingUp;
                const ativo = aba === a.key;
                return (
                  <button
                    key={a.key}
                    onClick={() => setAba(a.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition ${ativo ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {a.label}
                    {a.status === "em_breve" && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded">em breve</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {isLoading && (
          <div className="bg-white border rounded-xl p-12 text-center text-slate-400">Carregando planejamento...</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 text-sm">
            {error.message || "Erro ao carregar planejamento"}
          </div>
        )}

        {!isLoading && !error && obra && (
          <>
            {/* Cabeçalho da obra (sempre visível) */}
            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-slate-800">{obra.nome}</h2>
                  {obra.codigo && <p className="text-xs text-slate-500 mt-0.5">{obra.codigo}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                    {(obra.cidade || obra.estado) && (
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{[obra.cidade, obra.estado].filter(Boolean).join(" / ")}</span>
                    )}
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Início: <strong className="text-slate-800">{fmtBR(obra.dataInicio)}</strong></span>
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Previsão fim: <strong className="text-slate-800">{fmtBR(obra.dataPrevisaoFim)}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {!projeto && (
              <Aviso>Esta obra ainda não possui um cronograma de planejamento publicado.</Aviso>
            )}
            {projeto && !kpis && (
              <Aviso>O cronograma desta obra está em elaboração — nenhuma revisão consolidada ainda.</Aviso>
            )}

            {/* Conteúdo por aba */}
            {kpis && (() => {
              const abaInfo = PORTAL_CLIENTE_ABAS.find((x) => x.key === aba);
              if (abaInfo?.status === "em_breve") {
                return (
                  <div className="bg-white border rounded-xl p-12 text-center">
                    <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-700">Aba “{abaInfo.label}” em breve</p>
                    <p className="text-xs text-slate-500 mt-1">Esta visão está sendo preparada para o Portal do Cliente.</p>
                  </div>
                );
              }
              if (aba === "visao_geral") return <AbaVisaoGeral kpis={kpis} projeto={projeto} semanaAtual={semanaAtual} atrasadas={atrasadas} proximas={proximas} />;
              if (aba === "cronograma") return <AbaCronograma atividades={atividadesTodas} />;
              if (aba === "avanco_semanal") return <AbaAvancoSemanal kpis={kpis} semanaAtual={semanaAtual} atrasadas={atrasadas} />;
              if (aba === "prog_semanal") return <AbaProgSemanal kpis={kpis} progSemanal={progSemanal} />;
              if (aba === "curva_s") return <AbaCurvaS curvaS={curvaS} kpis={kpis} />;
              if (aba === "revisoes") return <AbaRevisoes revisoes={revisoes} />;
              return null;
            })()}
          </>
        )}
      </main>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800 text-sm">{children}</div>
  );
}

function AbaVisaoGeral({ kpis, projeto, semanaAtual, atrasadas, proximas }: any) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Avanço Previsto" value={fmtPct(kpis.previsto)} icon={<TrendingUp className="w-5 h-5 text-blue-600" />} />
        <KpiCard label="Avanço Realizado" value={fmtPct(kpis.realizado)} icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} accent={kpis.realizado >= kpis.previsto ? "bg-emerald-50" : undefined} />
        <KpiCard
          label="Desvio"
          value={`${kpis.desvio >= 0 ? "+" : ""}${fmtPct(kpis.desvio)}`}
          icon={<AlertTriangle className={`w-5 h-5 ${kpis.desvio < 0 ? "text-red-600" : "text-emerald-600"}`} />}
          accent={kpis.desvio < 0 ? "bg-red-50" : "bg-emerald-50"}
          sub={kpis.desvio < 0 ? "atrasado" : kpis.desvio > 0 ? "adiantado" : "no prazo"}
        />
        <KpiCard label="Atividades concluídas" value={`${kpis.atividadesConcluidas}/${kpis.totalAtividades}`} icon={<CheckCircle2 className="w-5 h-5 text-slate-600" />} />
      </div>
      <div className="bg-white border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Avanço físico geral</h3>
        <div className="space-y-2">
          <BarRow label="Previsto" pct={kpis.previsto} cor="bg-amber-400" />
          <BarRow label="Realizado" pct={kpis.realizado} cor={kpis.realizado >= kpis.previsto ? "bg-emerald-500" : "bg-blue-500"} />
        </div>
        <p className="text-xs text-slate-500 mt-3">Revisão {projeto.revisaoNumero} de {fmtBR(projeto.revisaoData)}</p>
      </div>
      <SecaoAtividades titulo={`Atividades da semana atual (${fmtBR(kpis.semanaInicio)} – ${fmtBR(kpis.semanaFim)})`} vazio="Nenhuma atividade prevista para esta semana." itens={semanaAtual} cor="border-blue-200" />
      {atrasadas.length > 0 && (
        <SecaoAtividades titulo={`Atividades atrasadas (${atrasadas.length})`} vazio="" itens={atrasadas} cor="border-red-200" />
      )}
      <SecaoAtividades titulo="Próximas atividades" vazio="Nenhuma próxima atividade cadastrada." itens={proximas} cor="border-slate-200" />
    </>
  );
}

function AbaCronograma({ atividades }: { atividades: any[] }) {
  const [busca, setBusca] = useState("");
  const filtradas = useMemo(() => {
    const t = busca.toLowerCase();
    const arr = atividades.slice().sort((a, b) => (a.eapCodigo || "").localeCompare(b.eapCodigo || "", "pt-BR", { numeric: true }));
    if (!t) return arr;
    return arr.filter((a) => (a.nome || "").toLowerCase().includes(t) || (a.eapCodigo || "").toLowerCase().includes(t));
  }, [atividades, busca]);
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h3 className="text-sm font-semibold text-slate-800">Cronograma completo ({atividades.length} itens)</h3>
        <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar EAP ou nome..." className="border rounded px-2.5 py-1.5 text-xs w-60" />
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 max-h-[70vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-slate-500 border-b">
              <th className="text-left px-3 py-2 font-medium">EAP</th>
              <th className="text-left px-3 py-2 font-medium">Atividade</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Início</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Fim</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Realizado</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((a) => {
              const real = a.percentRealizado ?? 0;
              const idente = (a.nivel || 0) * 12;
              return (
                <tr key={a.id} className={`border-b border-slate-50 hover:bg-slate-50 ${a.isGrupo ? "bg-slate-50/60 font-semibold" : ""}`}>
                  <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{a.eapCodigo || "—"}</td>
                  <td className="px-3 py-1.5 text-slate-800" style={{ paddingLeft: idente + 12 }}>
                    {a.isMarco && <span className="text-purple-600 mr-1">◆</span>}
                    {a.nome}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                  <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                    {a.isGrupo ? "—" : fmtPct(real)}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Nenhuma atividade encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbaAvancoSemanal({ kpis, semanaAtual, atrasadas }: any) {
  const totalSemana = semanaAtual.reduce((s: number, a: any) => s + (a.pesoFinanceiro || 0), 0);
  const realSemana = semanaAtual.reduce((s: number, a: any) => s + (a.pesoFinanceiro || 0) * (a.percentRealizado / 100), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Atividades na semana" value={String(semanaAtual.length)} icon={<Activity className="w-5 h-5 text-blue-600" />} />
        <KpiCard label="Peso da semana" value={`${totalSemana.toFixed(2).replace(".", ",")}%`} icon={<TrendingUp className="w-5 h-5 text-emerald-600" />} />
        <KpiCard label="Realizado na semana" value={totalSemana > 0 ? fmtPct((realSemana / totalSemana) * 100) : "0,00%"} icon={<CheckCircle2 className="w-5 h-5 text-blue-600" />} />
      </div>
      <SecaoAtividades titulo={`Semana ${fmtBR(kpis.semanaInicio)} a ${fmtBR(kpis.semanaFim)}`} vazio="Nenhuma atividade nesta semana." itens={semanaAtual} cor="border-blue-200" />
      {atrasadas.length > 0 && <SecaoAtividades titulo={`Atrasadas (${atrasadas.length})`} vazio="" itens={atrasadas} cor="border-red-200" />}
    </div>
  );
}

function AbaProgSemanal({ kpis, progSemanal }: any) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Programação para as próximas 3 semanas a partir de {fmtBR(kpis.semanaInicio)}.</p>
      <SecaoAtividades titulo={`${progSemanal.length} atividade${progSemanal.length === 1 ? "" : "s"} programada${progSemanal.length === 1 ? "" : "s"}`} vazio="Nenhuma atividade programada para as próximas 3 semanas." itens={progSemanal} cor="border-indigo-200" />
    </div>
  );
}

function AbaCurvaS({ curvaS, kpis }: any) {
  if (curvaS.length === 0) {
    return <div className="bg-white border rounded-xl p-12 text-center text-slate-400">Sem dados suficientes para gerar a Curva S.</div>;
  }
  const W = 720, H = 280, P = 36;
  const xStep = (W - P * 2) / Math.max(1, curvaS.length - 1);
  const y = (v: number) => H - P - (v / 100) * (H - P * 2);
  const path = (key: "previsto" | "realizado") =>
    curvaS.map((p: any, i: number) => `${i === 0 ? "M" : "L"} ${P + i * xStep} ${y(p[key])}`).join(" ");
  const todayStr = new Date().toISOString().slice(0, 10);
  const idxToday = curvaS.findIndex((p: any) => p.semana >= todayStr);
  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-4 items-center">
        <h3 className="text-sm font-semibold text-slate-800">Curva S — Previsto x Realizado</h3>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> Previsto</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-600 inline-block" /> Realizado</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[800px] mx-auto bg-slate-50 rounded">
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeDasharray="2 3" />
              <text x={P - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#64748b">{v}%</text>
            </g>
          ))}
          {idxToday > 0 && (
            <line x1={P + idxToday * xStep} x2={P + idxToday * xStep} y1={P} y2={H - P} stroke="#dc2626" strokeDasharray="3 3" />
          )}
          <path d={path("previsto")} fill="none" stroke="#f59e0b" strokeWidth="2" />
          <path d={path("realizado")} fill="none" stroke="#2563eb" strokeWidth="2.5" />
          <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">{curvaS.length} semanas</text>
        </svg>
      </div>
      <p className="text-xs text-slate-500">Hoje ({fmtBR(todayStr)}): previsto <b>{fmtPct(kpis.previsto)}</b> · realizado <b>{fmtPct(kpis.realizado)}</b>.</p>
    </div>
  );
}

function AbaRevisoes({ revisoes }: { revisoes: any[] }) {
  if (revisoes.length === 0) {
    return <div className="bg-white border rounded-xl p-12 text-center text-slate-400">Nenhuma revisão cadastrada.</div>;
  }
  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">Histórico de revisões</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b">
              <th className="text-left px-3 py-2 font-medium">Revisão</th>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Motivo</th>
              <th className="text-center px-3 py-2 font-medium">Consolidada</th>
            </tr>
          </thead>
          <tbody>
            {revisoes.map((r) => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-3 py-2 font-semibold text-slate-700">Rev. {String(r.numero).padStart(2, "0")}</td>
                <td className="px-3 py-2 text-slate-600">{fmtBR(r.dataRevisao)}</td>
                <td className="px-3 py-2 text-slate-700">{r.motivo || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-center">
                  {r.consolidado ? <Badge className="bg-emerald-600 text-[10px]">Sim</Badge> : <Badge variant="outline" className="text-[10px]">Não</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, sub, accent }: { label: string; value: string; icon: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className={`border rounded-xl p-4 ${accent || "bg-white"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarRow({ label, pct, cor }: { label: string; pct: number; cor: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-800">{fmtPct(pct)}</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${cor} transition-all`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function SecaoAtividades({ titulo, vazio, itens, cor }: { titulo: string; vazio: string; itens: any[]; cor: string }) {
  return (
    <div className={`bg-white border-2 ${cor} rounded-xl p-4`}>
      <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4 text-slate-500" />{titulo}
      </h3>
      {itens.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">{vazio}</p>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100">
                <th className="text-left px-3 py-2 font-medium">EAP</th>
                <th className="text-left px-3 py-2 font-medium">Atividade</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Início</th>
                <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Fim</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Realizado</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((a: any) => {
                const real = a.percentRealizado ?? 0;
                const st = statusBadge(real, a.dataFim);
                return (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{a.eapCodigo || "—"}</td>
                    <td className="px-3 py-2 text-slate-800">{a.nome}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtBR(a.dataInicio)}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtBR(a.dataFim)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">{fmtPct(real)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
