import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Loader2, Users, HardHat, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Lightbulb,
  ClipboardList, RefreshCw, Building2,
} from "lucide-react";

type Props = {
  projetoId: number;
  companyId: number;
};

type Indicador = { label: string; valor: string; status?: string; descricao?: string };
type CargoLinha = { cargo: string; categoria?: string; atual: number; recomendado: number; delta: number; acao: string; justificativa?: string };
type AtividadeCritica = { atividade: string; periodo?: string; necessidade?: string };

const ACAO_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  contratar: { label: "Contratar", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: ArrowUpRight },
  reduzir:   { label: "Reduzir",   cls: "bg-amber-50 text-amber-700 border-amber-200",       Icon: ArrowDownRight },
  manter:    { label: "Manter",    cls: "bg-slate-50 text-slate-600 border-slate-200",         Icon: Minus },
};

const DIAG_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  equilibrado: { label: "Efetivo equilibrado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  contratar:   { label: "Recomenda contratar", cls: "bg-blue-50 text-blue-700 border-blue-200",          Icon: TrendingUp },
  reduzir:     { label: "Há folga (pode reduzir)", cls: "bg-amber-50 text-amber-700 border-amber-200",   Icon: TrendingDown },
  misto:       { label: "Ajustes mistos",      cls: "bg-violet-50 text-violet-700 border-violet-200",    Icon: RefreshCw },
};

function statusDot(status?: string) {
  if (status === "critico") return "bg-red-500";
  if (status === "alerta")  return "bg-amber-500";
  return "bg-emerald-500";
}

export default function AnaliseEfetivoIA({ projetoId, companyId }: Props) {
  const [result, setResult] = useState<any>(null);
  const mut = trpc.iaCronograma.analisarEfetivo.useMutation({
    onSuccess: (d) => setResult(d),
  });

  const gerar = () => mut.mutate({ projetoId, companyId });

  const analise = result?.analise;
  const diag = DIAG_META[analise?.diagnostico] ?? DIAG_META.misto;
  const DiagIcon = diag.Icon;

  return (
    <div className="space-y-5">
      {/* Cabeçalho / CTA */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50/60 to-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-600/10 p-2.5">
              <Sparkles className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Análise de Efetivo × Cronograma (IA)</h2>
              <p className="text-sm text-slate-500 max-w-2xl mt-0.5">
                Cruza o efetivo atual alocado na obra com as atividades em andamento e das próximas 8 semanas e
                avalia, por função, se a equipe está adequada — indicando onde contratar, reduzir ou manter.
              </p>
            </div>
          </div>
          <Button onClick={gerar} disabled={mut.isPending} className="shrink-0">
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando…</> : <><Sparkles className="h-4 w-4 mr-2" /> {result ? "Refazer análise" : "Gerar análise"}</>}
          </Button>
        </div>

        {result && (
          <div className="flex items-center gap-4 flex-wrap mt-4 text-xs text-slate-500">
            {result.obra && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {result.obra}</span>}
            {result.revisao != null && <span>Revisão {result.revisao}</span>}
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {result.efetivoResumo?.total ?? 0} alocados · {result.efetivoResumo?.ativos ?? 0} ativos</span>
            <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {result.atividadesResumo?.emAndamento ?? 0} em andamento · {result.atividadesResumo?.proximas ?? 0} próximas</span>
            {result.geradoEm && <span>· gerado {new Date(result.geradoEm).toLocaleString("pt-BR")}</span>}
          </div>
        )}
      </div>

      {/* Erro de mutation */}
      {mut.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{(mut.error as any)?.message ?? "Erro ao gerar a análise."}</span>
        </div>
      )}

      {/* Erro de IA (mas dados de efetivo vieram) */}
      {result?.erroIa && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{result.erroIa}</span>
        </div>
      )}

      {/* Estado vazio */}
      {!result && !mut.isPending && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <HardHat className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Clique em <strong>Gerar análise</strong> para a IA cruzar o efetivo da obra com o cronograma.</p>
        </div>
      )}

      {/* Resultado da IA */}
      {analise && (
        <div className="space-y-5">
          {/* Diagnóstico */}
          <div className={`rounded-xl border p-5 ${diag.cls}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <DiagIcon className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{diag.label}</span>
            </div>
            {analise.tituloDiagnostico && <h3 className="text-lg font-semibold leading-snug">{analise.tituloDiagnostico}</h3>}
            {analise.resumoExecutivo && <p className="text-sm mt-1.5 opacity-90 leading-relaxed">{analise.resumoExecutivo}</p>}
          </div>

          {/* Indicadores */}
          {Array.isArray(analise.indicadores) && analise.indicadores.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {analise.indicadores.map((ind: Indicador, i: number) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${statusDot(ind.status)}`} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{ind.label}</span>
                  </div>
                  <div className="text-xl font-bold text-slate-800">{ind.valor}</div>
                  {ind.descricao && <p className="text-xs text-slate-500 mt-1 leading-snug">{ind.descricao}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Por cargo */}
          {Array.isArray(analise.porCargo) && analise.porCargo.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Recomendação por função</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="px-4 py-2 font-medium">Função</th>
                      <th className="px-4 py-2 font-medium">Categoria</th>
                      <th className="px-4 py-2 font-medium text-center">Atual</th>
                      <th className="px-4 py-2 font-medium text-center">Sugerido</th>
                      <th className="px-4 py-2 font-medium text-center">Δ</th>
                      <th className="px-4 py-2 font-medium">Ação</th>
                      <th className="px-4 py-2 font-medium">Justificativa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.porCargo.map((c: CargoLinha, i: number) => {
                      const meta = ACAO_META[c.acao] ?? ACAO_META.manter;
                      const AcaoIcon = meta.Icon;
                      const delta = typeof c.delta === "number" ? c.delta : (c.recomendado - c.atual);
                      return (
                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-medium text-slate-700">{c.cargo}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{c.categoria || "—"}</td>
                          <td className="px-4 py-2.5 text-center text-slate-700">{c.atual}</td>
                          <td className="px-4 py-2.5 text-center text-slate-700 font-semibold">{c.recomendado}</td>
                          <td className={`px-4 py-2.5 text-center font-semibold ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-amber-600" : "text-slate-400"}`}>
                            {delta > 0 ? `+${delta}` : delta}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                              <AcaoIcon className="h-3 w-3" /> {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs max-w-md">{c.justificativa || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Atividades críticas */}
          {Array.isArray(analise.atividadesCriticas) && analise.atividadesCriticas.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Frentes críticas para o dimensionamento</span>
              </div>
              <div className="space-y-2.5">
                {analise.atividadesCriticas.map((a: AtividadeCritica, i: number) => (
                  <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-sm font-medium text-slate-700">{a.atividade}</span>
                      {a.periodo && <span className="text-xs text-slate-400">{a.periodo}</span>}
                    </div>
                    {a.necessidade && <p className="text-xs text-slate-500 mt-1">{a.necessidade}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Riscos + Recomendações */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.isArray(analise.riscos) && analise.riscos.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-slate-700">Riscos</span>
                </div>
                <ul className="space-y-2">
                  {analise.riscos.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(analise.recomendacoes) && analise.recomendacoes.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold text-slate-700">Recomendações</span>
                </div>
                <ul className="space-y-2">
                  {analise.recomendacoes.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sem IA mas com efetivo bruto (fallback) */}
      {!analise && result?.porCargoAtual?.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Efetivo atual por função</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2 font-medium">Função</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium text-center">Total</th>
                  <th className="px-4 py-2 font-medium text-center">Ativos</th>
                </tr>
              </thead>
              <tbody>
                {result.porCargoAtual.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{c.cargo}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{c.categoria || "—"}</td>
                    <td className="px-4 py-2.5 text-center text-slate-700">{c.total}</td>
                    <td className="px-4 py-2.5 text-center text-slate-700">{c.ativos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
