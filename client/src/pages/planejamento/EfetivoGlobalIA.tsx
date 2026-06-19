import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, Users, ArrowRight, MapPin, AlertTriangle,
  TrendingUp, TrendingDown, CheckCircle2, Building2, RefreshCw, Lightbulb, Clock, Plane, CalendarClock,
} from "lucide-react";

type Props = { companyId: number };

const norm = (s: any) => String(s ?? "").trim();

function deltaTone(delta: number) {
  if (delta > 0) return { txt: "text-red-700", bg: "bg-red-50", border: "border-red-200", label: "Falta", icon: <TrendingUp className="h-3.5 w-3.5" /> };
  if (delta < 0) return { txt: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "Sobra", icon: <TrendingDown className="h-3.5 w-3.5" /> };
  return { txt: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "Equilibrado", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
}

export default function EfetivoGlobalIA({ companyId }: Props) {
  const [resultado, setResultado] = useState<any | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [criadoPor, setCriadoPor] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<any>(null);

  const utils = trpc.useUtils();

  // Restaura a última análise global salva (recuperação após queda / reabertura).
  const ultima = trpc.iaCronograma.ultimaEfetivoGlobal.useQuery(
    { companyId }, { enabled: !!companyId, refetchOnWindowFocus: false },
  );
  useEffect(() => {
    if (!resultado && ultima.data?.resultado) {
      setResultado(ultima.data.resultado);
      setGeradoEm(ultima.data.resultado?.geradoEm ?? ultima.data.criadoEm ?? null);
      setCriadoPor(ultima.data.criadoPor ?? null);
    }
  }, [ultima.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const analisar = trpc.iaCronograma.efetivoGlobal.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setGeradoEm(data?.geradoEm ?? new Date().toISOString());
      setCriadoPor(null);
      utils.iaCronograma.ultimaEfetivoGlobal.invalidate({ companyId });
    },
    onError: async () => {
      // iPad/Safari pode derrubar a conexão mesmo com o servidor tendo concluído
      // e PERSISTIDO. Tenta recuperar o resultado fresco antes de mostrar erro.
      const fresh = await utils.iaCronograma.ultimaEfetivoGlobal.fetch({ companyId });
      if (fresh?.resultado) {
        setResultado(fresh.resultado);
        setGeradoEm(fresh.resultado?.geradoEm ?? fresh.criadoEm ?? null);
        setCriadoPor(fresh.criadoPor ?? null);
      }
    },
  });

  const loading = analisar.isPending;

  useEffect(() => {
    if (loading) {
      setProgress(8);
      progressTimer.current = setInterval(() => {
        setProgress((p) => (p >= 95 ? 95 : p + Math.max(1, Math.round((95 - p) / 14))));
      }, 700);
    } else {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setProgress(resultado ? 100 : 0);
    }
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const histMax = useMemo(() => {
    const hs = (resultado?.histograma ?? []) as any[];
    return Math.max(1, ...hs.map((h) => Math.max(Number(h.atualTotal) || 0, Number(h.recomendadoTotal) || 0)));
  }, [resultado]);

  const erroIa = resultado?.erroIa as string | null | undefined;
  const transferencias = (resultado?.transferencias ?? []) as any[];
  const previsaoDisponibilidade = (resultado?.previsaoDisponibilidade ?? []) as any[];
  const histograma = (resultado?.histograma ?? []) as any[];
  const totais = resultado?.resumoTotais ?? null;
  const obrasIgnoradas = (resultado?.obrasIgnoradas ?? []) as any[];
  const grupos = (resultado?.gruposProximidade ?? []) as any[];

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white shadow-sm mb-5 overflow-hidden">
      {/* Cabeçalho do painel */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-indigo-100 bg-white/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              Efetivo × IA — Todas as Obras
            </h2>
            <p className="text-[11px] text-slate-500 leading-tight">
              Cruza o efetivo de cada obra com o cronograma e sugere remanejamento entre obras próximas (mesma cidade).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {geradoEm && !loading && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400">
              <Clock className="h-3 w-3" />
              {new Date(geradoEm).toLocaleString("pt-BR")}{criadoPor ? ` · ${criadoPor}` : ""}
            </span>
          )}
          <Button
            size="sm"
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
            disabled={loading || !companyId}
            onClick={() => analisar.mutate({ companyId })}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (resultado ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />)}
            {loading ? "Analisando..." : (resultado ? "Reanalisar" : "Analisar todas as obras")}
          </Button>
        </div>
      </div>

      {/* Barra de progresso */}
      {loading && (
        <div className="px-4 pt-3">
          <div className="h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Lendo o efetivo e o cronograma de cada obra e consolidando uma única análise de IA...
          </p>
        </div>
      )}

      {/* Conteúdo */}
      <div className="p-4">
        {!resultado && !loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 gap-2">
            <Users className="h-8 w-8 text-indigo-200" />
            <p className="text-sm text-slate-500 max-w-md">
              Clique em <strong>Analisar todas as obras</strong> para ver onde sobra e onde falta equipe,
              e receber sugestões de remanejamento entre obras da mesma cidade.
            </p>
          </div>
        )}

        {resultado && (
          <div className="space-y-4">
            {erroIa && (
              <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div><strong>IA indisponível.</strong> {erroIa} O efetivo atual por função (abaixo) continua válido — vem direto do banco.</div>
              </div>
            )}

            {/* Totais */}
            {totais && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: "Obras analisadas", value: resultado.totalObras ?? 0, icon: <Building2 className="h-4 w-4" />, color: "text-indigo-600", bg: "bg-indigo-50" },
                  { label: "Efetivo total", value: totais.efetivoTotal ?? 0, icon: <Users className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Disponíveis (ativos)", value: totais.ativos ?? 0, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-600", bg: "bg-emerald-50" },
                  ...(Number(totais.feriasHorizonte) > 0
                    ? [{ label: "Entram de férias (8 sem)", value: totais.feriasHorizonte ?? 0, icon: <Plane className="h-4 w-4" />, color: "text-amber-600", bg: "bg-amber-50" }]
                    : [{ label: "Funções", value: totais.funcoes ?? 0, icon: <TrendingUp className="h-4 w-4" />, color: "text-purple-600", bg: "bg-purple-50" }]),
                ].map((k, i) => (
                  <div key={i} className="bg-white rounded-lg border border-slate-100 p-2.5 flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-md ${k.bg} ${k.color} flex items-center justify-center shrink-0`}>{k.icon}</div>
                    <div>
                      <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
                      <p className={`text-base font-bold ${k.color} leading-tight`}>{k.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resumo executivo */}
            {resultado.resumoExecutivo && (
              <div className="rounded-lg border border-indigo-100 bg-white p-3">
                <p className="text-xs font-semibold text-indigo-700 mb-1 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Leitura geral</p>
                <p className="text-sm text-slate-700 leading-relaxed">{resultado.resumoExecutivo}</p>
              </div>
            )}

            {/* Transferências sugeridas */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5 text-indigo-600" /> Remanejamento sugerido (entre obras próximas)
              </p>
              {transferencias.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
                  Nenhuma transferência sugerida entre obras da mesma cidade no momento.
                  {grupos.length === 0 && " (Não há 2+ obras ativas na mesma cidade/estado para remanejar.)"}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {transferencias.map((t, i) => (
                    <div key={i} className="rounded-lg border border-indigo-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-semibold text-slate-800">{t.cargo}</span>
                        <span className="text-[10px] font-bold text-white bg-indigo-600 rounded-full px-2 py-0.5">{t.quantidade} pessoa(s)</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-700 mb-1.5">
                        <span className="font-medium text-amber-700 truncate max-w-[40%]">{t.deObra}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <span className="font-medium text-emerald-700 truncate max-w-[40%]">{t.paraObra}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> {t.cidade}</p>
                        {norm(t.dataDisponivel) && (
                          <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Disponível a partir de {t.dataDisponivel}</span>
                        )}
                      </div>
                      {t.motivo && <p className="text-[11px] text-slate-600 leading-snug">{t.motivo}</p>}
                      {t.impacto && <p className="text-[11px] text-slate-500 leading-snug mt-1"><strong>Impacto:</strong> {t.impacto}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Previsão de disponibilidade — QUANDO sobra mão de obra p/ realocar */}
            {previsaoDisponibilidade.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-emerald-600" /> Previsão de disponibilidade (quando sobra mão de obra)
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {previsaoDisponibilidade.map((d, i) => (
                    <div key={i} className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-800">{d.cargo}</span>
                        <span className="text-[10px] font-bold text-white bg-emerald-600 rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0">
                          <CalendarClock className="h-3 w-3" /> {d.dataEstimada}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-1.5">
                        <Building2 className="h-3 w-3" /> {d.obra}
                        {Number(d.quantidade) > 0 && <span className="font-semibold text-emerald-700">· {d.quantidade} pessoa(s)</span>}
                      </p>
                      {d.motivo && <p className="text-[11px] text-slate-600 leading-snug">{d.motivo}</p>}
                      {d.sugestao && <p className="text-[11px] text-slate-500 leading-snug mt-1"><strong>Sugestão:</strong> {d.sugestao}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histograma por função */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-600" /> Efetivo por função (atual × recomendado)
              </p>
              {histograma.length === 0 ? (
                <p className="text-xs text-slate-400">Sem efetivo alocado nas obras analisadas.</p>
              ) : (
                <div className="space-y-1.5">
                  {histograma.map((h, i) => {
                    const tone = deltaTone(Number(h.delta) || 0);
                    const atual = Number(h.atualTotal) || 0;
                    const reco = Number(h.recomendadoTotal) || 0;
                    return (
                      <div key={i} className={`rounded-lg border ${tone.border} ${tone.bg} p-2.5`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {h.cargo}{h.categoria ? <span className="text-[10px] font-normal text-slate-400"> · {h.categoria}</span> : null}
                          </span>
                          <span className={`text-[10px] font-bold flex items-center gap-1 ${tone.txt}`}>
                            {tone.icon} {tone.label}{h.delta ? ` (${h.delta > 0 ? "+" : ""}${h.delta})` : ""}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 w-20 shrink-0">Atual: {atual}</span>
                            <div className="flex-1 h-2 rounded-full bg-white overflow-hidden border border-slate-100">
                              <div className="h-full bg-slate-400" style={{ width: `${(atual / histMax) * 100}%` }} />
                            </div>
                          </div>
                          {Number(h.feriasHorizonte) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-amber-600 w-20 shrink-0 flex items-center gap-0.5"><Plane className="h-2.5 w-2.5" /> Disp.: {Number(h.disponivelHorizonte) || 0}</span>
                              <div className="flex-1 h-2 rounded-full bg-white overflow-hidden border border-slate-100">
                                <div className="h-full bg-amber-400" style={{ width: `${((Number(h.disponivelHorizonte) || 0) / histMax) * 100}%` }} />
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 w-20 shrink-0">Recom.: {reco}</span>
                            <div className="flex-1 h-2 rounded-full bg-white overflow-hidden border border-slate-100">
                              <div className="h-full bg-indigo-500" style={{ width: `${(reco / histMax) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                        {Number(h.feriasHorizonte) > 0 && (
                          <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                            <Plane className="h-3 w-3" /> {h.feriasHorizonte} pessoa(s) entram de férias inadiáveis nas próximas 8 semanas (já abatidas do "Disp.")
                          </p>
                        )}
                        {h.leitura && <p className="text-[11px] text-slate-600 leading-snug mt-1.5">{h.leitura}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Riscos + recomendações */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.isArray(resultado.riscos) && resultado.riscos.length > 0 && (
                <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Riscos</p>
                  <ul className="space-y-1 text-[11px] text-slate-700 list-disc pl-4">
                    {resultado.riscos.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(resultado.recomendacoes) && resultado.recomendacoes.length > 0 && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> Recomendações</p>
                  <ul className="space-y-1 text-[11px] text-slate-700 list-disc pl-4">
                    {resultado.recomendacoes.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Obras ignoradas */}
            {obrasIgnoradas.length > 0 && (
              <details className="text-[11px] text-slate-500">
                <summary className="cursor-pointer select-none">{obrasIgnoradas.length} obra(s) sem cronograma/efetivo (não entraram na análise)</summary>
                <ul className="mt-1.5 space-y-0.5 pl-4 list-disc">
                  {obrasIgnoradas.map((o: any, i: number) => <li key={i}>{norm(o.obra)} — {norm(o.motivo)}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
