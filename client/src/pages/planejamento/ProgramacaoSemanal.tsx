import React, { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Loader2,
  Brain, AlertTriangle, Wrench, Users, Package, Clock,
  CheckCircle2, ArrowRight, TrendingDown, Zap, RefreshCcw,
  Home, CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBR(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function dateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

interface Week {
  numero: number;
  ini: Date;
  fim: Date;
}

function computeWeeks(atividades: any[]): Week[] {
  const folhas = atividades.filter((a: any) => !a.isGrupo && a.dataInicio && a.dataFim);
  if (!folhas.length) return [];

  const allIni  = folhas.map((a: any) => a.dataInicio).sort();
  const allFim  = folhas.map((a: any) => a.dataFim).sort();
  const minDate = new Date(allIni[0] + "T00:00:00");
  const maxDate = new Date(allFim[allFim.length - 1] + "T00:00:00");

  // Recuar até a segunda-feira da primeira semana
  const firstMon = new Date(minDate);
  const dow = firstMon.getDay();
  firstMon.setDate(firstMon.getDate() - (dow === 0 ? 6 : dow - 1));

  const weeks: Week[] = [];
  let cur = new Date(firstMon);
  let num = 1;
  while (cur <= maxDate) {
    const ini = new Date(cur);
    const fim = new Date(cur);
    fim.setDate(fim.getDate() + 4);
    weeks.push({ numero: num, ini, fim });
    cur.setDate(cur.getDate() + 7);
    num++;
  }
  return weeks;
}

function atividadesDaSemana(atividades: any[], week: Week) {
  const ini = dateStr(week.ini);
  const fim = dateStr(week.fim);
  return atividades.filter((a: any) =>
    !a.isGrupo &&
    a.dataInicio && a.dataFim &&
    a.dataFim >= ini && a.dataInicio <= fim
  );
}

function currentWeekIdx(weeks: Week[]): number {
  const today = new Date();
  const idx = weeks.findIndex(w => w.ini <= today && w.fim >= today);
  return idx >= 0 ? idx : 0;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  projetoId:   number;
  revisaoId:   number;
  orcamentoId: number | null | undefined;
  companyId:   number;
  nomeProjeto: string;
  nomeCliente: string;
  atividades:  any[];
  avancosMap:  Record<number, number>;
}

// ── Cores de status ───────────────────────────────────────────────────────────

function statusColor(atrasada: boolean, avanco: number) {
  if (avanco >= 100) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (atrasada)      return "bg-red-100 text-red-700 border-red-200";
  if (avanco > 0)    return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function statusLabel(atrasada: boolean, avanco: number) {
  if (avanco >= 100) return "Concluída";
  if (atrasada)      return "Atrasada";
  if (avanco > 0)    return "Em execução";
  return "Prevista";
}

function severidadeCor(sev: string) {
  if (sev === "alta")  return "border-l-red-500 bg-red-50";
  if (sev === "media") return "border-l-amber-500 bg-amber-50";
  return "border-l-blue-500 bg-blue-50";
}

function tipoIcon(tipo: string) {
  if (tipo === "recurso")    return <Package className="h-3.5 w-3.5 text-blue-600" />;
  if (tipo === "atraso")     return <TrendingDown className="h-3.5 w-3.5 text-red-600" />;
  if (tipo === "alternativa") return <Zap className="h-3.5 w-3.5 text-amber-600" />;
  return <RefreshCcw className="h-3.5 w-3.5 text-slate-500" />;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProgramacaoSemanal({
  projetoId, revisaoId, orcamentoId, companyId,
  nomeProjeto, nomeCliente, atividades, avancosMap,
}: Props) {
  const semanas  = useMemo(() => computeWeeks(atividades), [atividades]);
  const [idx, setIdx] = useState<number>(() => currentWeekIdx(semanas));
  const [modoRelatorio, setModoRelatorio] = useState(false);
  const [alertas, setAlertas]  = useState<any>(null);
  const [loadIA, setLoadIA]    = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const semanaAtual = semanas[idx];

  const atividadesSemAtual = useMemo(
    () => semanaAtual ? atividadesDaSemana(atividades, semanaAtual) : [],
    [atividades, semanaAtual]
  );

  // EAP codes for the current week (for resource lookup)
  const eapsDaSemana = useMemo(
    () => [...new Set(atividadesSemAtual.map((a: any) => a.eapCodigo).filter(Boolean))] as string[],
    [atividadesSemAtual]
  );

  // ── Próximas 3 semanas para o relatório ──────────────────────────────────
  const proximas3 = useMemo(() => {
    const result = [];
    for (let i = idx; i < Math.min(idx + 3, semanas.length); i++) {
      result.push({ semana: semanas[i], atividades: atividadesDaSemana(atividades, semanas[i]) });
    }
    return result;
  }, [idx, semanas, atividades]);

  // ── Recursos do orçamento ─────────────────────────────────────────────────
  const todosEaps = useMemo(() => {
    const eaps = new Set<string>();
    proximas3.forEach(({ atividades: at }) => at.forEach((a: any) => a.eapCodigo && eaps.add(a.eapCodigo)));
    return [...eaps];
  }, [proximas3]);

  const recursosQuery = trpc.planejamento.buscarRecursosSemana.useQuery(
    { companyId, orcamentoId: orcamentoId ?? 0, eapCodigos: todosEaps },
    { enabled: !!orcamentoId && todosEaps.length > 0 }
  );

  const recursos = recursosQuery.data;

  // ── AI alerts mutation ────────────────────────────────────────────────────
  const alertasMut = trpc.iaCronograma.alertasSemana.useMutation({
    onSuccess: (data) => { setAlertas(data); setLoadIA(false); },
    onError:   ()     => { setLoadIA(false); },
  });

  function gerarAlertas() {
    if (proximas3.length === 0) return;
    setLoadIA(true);
    setAlertas(null);
    alertasMut.mutate({
      projetoId,
      nomeProjeto,
      semanas: proximas3.map(({ semana, atividades: at }) => ({
        numero: semana.numero,
        ini:    dateStr(semana.ini),
        fim:    dateStr(semana.fim),
        atividades: at.map((a: any) => {
          const av = avancosMap[a.id] ?? 0;
          const atrasada = !!a.dataFim && a.dataFim < today && av < 100;
          return {
            eapCodigo:        a.eapCodigo,
            nome:             a.nome,
            dataInicio:       a.dataInicio,
            dataFim:          a.dataFim,
            recursoPrincipal: a.recursoPrincipal,
            avancoPrevisto:   parseFloat(a.pesoFinanceiro ?? "0"),
            avancoReal:       av,
            atrasada,
          };
        }),
        insumos: (recursos?.insumos ?? [])
          .filter((ins: any) => {
            const itensEap = (recursos?.itens ?? []).filter((it: any) =>
              at.some((a: any) => a.eapCodigo === it.eapCodigo) &&
              it.servicoCodigo === ins.composicaoCodigo
            );
            return itensEap.length > 0;
          })
          .map((ins: any) => ({
            descricao:  ins.insumoDescricao ?? "",
            unidade:    ins.unidade ?? "",
            quantidade: ins.quantidade ?? "",
            tipo:       parseFloat(ins.alocacaoMdo ?? "0") > 0 ? "MO" : "MAT",
          })),
      })),
    });
  }

  // ── Impressão ─────────────────────────────────────────────────────────────
  function imprimir() {
    window.print();
  }

  if (!semanas.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <CalendarRange className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Nenhuma atividade com datas no cronograma.</p>
        <p className="text-xs mt-1">Cadastre atividades com início e fim para gerar a programação semanal.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Cabeçalho e navegação ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">Programação Semanal</span>
          <span className="text-xs text-slate-400">{semanas.length} semanas no cronograma</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { setModoRelatorio(!modoRelatorio); }}
          >
            {modoRelatorio ? <Home className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />}
            {modoRelatorio ? "Visão Semanal" : "Relatório 3 Semanas"}
          </Button>
          {modoRelatorio && (
            <Button size="sm" className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700" onClick={imprimir}>
              <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
            </Button>
          )}
        </div>
      </div>

      {/* ── Modo: Visão Semanal ─────────────────────────────────────────────── */}
      {!modoRelatorio && (
        <>
          {/* Navegador de semana */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center justify-between gap-3">
            <button
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>

            <div className="text-center flex-1">
              <p className="text-xs text-slate-500 font-medium">Semana {semanaAtual?.numero}</p>
              <p className="text-base font-bold text-slate-800">
                {semanaAtual ? `${fmtBRDate(semanaAtual.ini)} — ${fmtBRDate(semanaAtual.fim)}` : "—"}
              </p>
              <p className="text-[11px] text-slate-400">
                Segunda a Sexta · {atividadesSemAtual.length} atividade{atividadesSemAtual.length !== 1 ? "s" : ""}
              </p>
            </div>

            <button
              onClick={() => setIdx(Math.min(semanas.length - 1, idx + 1))}
              disabled={idx === semanas.length - 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>

          {/* Linha de navegação rápida */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {semanas.map((s, i) => {
              const atv = atividadesDaSemana(atividades, s);
              const temAtrasada = atv.some((a: any) => a.dataFim && a.dataFim < today && (avancosMap[a.id] ?? 0) < 100);
              const isCurrent   = dateStr(s.ini) <= today && dateStr(s.fim) >= today;
              return (
                <button
                  key={s.numero}
                  onClick={() => setIdx(i)}
                  title={`Sem. ${s.numero} — ${fmtBRDate(s.ini)} a ${fmtBRDate(s.fim)}`}
                  className={`h-6 min-w-[36px] px-1.5 text-[10px] font-bold rounded border shrink-0 transition-colors
                    ${i === idx
                      ? "bg-blue-600 text-white border-blue-600"
                      : isCurrent
                        ? "bg-blue-100 text-blue-700 border-blue-300"
                        : temAtrasada
                          ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  {s.numero}
                </button>
              );
            })}
          </div>

          {/* Tabela de atividades */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">
                Atividades da Semana {semanaAtual?.numero}
              </span>
            </div>

            {atividadesSemAtual.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                Nenhuma atividade prevista para esta semana.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/40 text-left text-[11px] font-semibold text-slate-500">
                      <th className="py-2 px-3 w-16">EAP</th>
                      <th className="py-2 px-3">Atividade</th>
                      <th className="py-2 px-3 w-24">Início</th>
                      <th className="py-2 px-3 w-24">Fim</th>
                      <th className="py-2 px-3 w-28">Recurso</th>
                      <th className="py-2 px-3 w-20 text-right">Previsto%</th>
                      <th className="py-2 px-3 w-20 text-right">Real%</th>
                      <th className="py-2 px-3 w-24 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atividadesSemAtual.map((a: any, i: number) => {
                      const av       = avancosMap[a.id] ?? 0;
                      const atrasada = !!a.dataFim && a.dataFim < today && av < 100;
                      return (
                        <tr key={a.id ?? i}
                          className={`border-b border-slate-50 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} ${atrasada ? "bg-red-50/40" : ""}`}>
                          <td className="py-2 px-3 font-mono text-slate-500">{a.eapCodigo ?? "—"}</td>
                          <td className="py-2 px-3 text-slate-800 font-medium max-w-[260px] truncate">{a.nome}</td>
                          <td className="py-2 px-3 text-slate-600">{fmtBR(a.dataInicio)}</td>
                          <td className="py-2 px-3 text-slate-600">{fmtBR(a.dataFim)}</td>
                          <td className="py-2 px-3 text-slate-500 max-w-[120px] truncate">{a.recursoPrincipal || "—"}</td>
                          <td className="py-2 px-3 text-right text-slate-600">{parseFloat(a.pesoFinanceiro ?? "0").toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-800">{av.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor(atrasada, av)}`}>
                              {statusLabel(atrasada, av)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recursos do orçamento para a semana */}
          {orcamentoId && eapsDaSemana.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Recursos previstos no orçamento</span>
                {recursosQuery.isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400 ml-1" />}
              </div>
              {recursosQuery.data && (
                <RecursosDaSemana
                  recursos={recursosQuery.data}
                  eapsAtivas={eapsDaSemana}
                />
              )}
              {!recursosQuery.data && !recursosQuery.isLoading && (
                <p className="text-xs text-slate-400 p-4">Sem dados de recursos vinculados ao orçamento.</p>
              )}
            </div>
          )}

          {/* Bloco JULINHO Alertas */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-50 bg-gradient-to-r from-blue-50 to-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-slate-700">JULINHO — Alertas das próximas 3 semanas</span>
              </div>
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1 bg-blue-600 hover:bg-blue-700"
                onClick={gerarAlertas}
                disabled={loadIA}
              >
                {loadIA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                {alertas ? "Reanalisar" : "Analisar"}
              </Button>
            </div>

            {!alertas && !loadIA && (
              <div className="py-8 text-center text-slate-400 text-xs">
                Clique em "Analisar" para o JULINHO avaliar as próximas 3 semanas com base no cronograma.
              </div>
            )}
            {loadIA && (
              <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                Analisando programação das próximas {proximas3.length} semanas…
              </div>
            )}
            {alertas && <AlertasBlock alertas={alertas} semanas={proximas3.map(p => p.semana)} />}
          </div>
        </>
      )}

      {/* ── Modo: Relatório 3 Semanas ──────────────────────────────────────── */}
      {modoRelatorio && (
        <RelatorioTresSemanas
          proximas3={proximas3}
          avancosMap={avancosMap}
          today={today}
          nomeProjeto={nomeProjeto}
          nomeCliente={nomeCliente}
          recursos={recursos}
          alertas={alertas}
          loadIA={loadIA}
          onGerarAlertas={gerarAlertas}
        />
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function RecursosDaSemana({ recursos, eapsAtivas }: { recursos: any; eapsAtivas: string[] }) {
  const itensAtivos = (recursos.itens ?? []).filter((it: any) => eapsAtivas.includes(it.eapCodigo));
  const servCodes   = new Set(itensAtivos.map((it: any) => it.servicoCodigo).filter(Boolean));
  const insumos     = (recursos.insumos ?? []).filter((ins: any) => servCodes.has(ins.composicaoCodigo));

  const mat = insumos.filter((i: any) => parseFloat(i.alocacaoMat ?? "0") > 0 && parseFloat(i.alocacaoMdo ?? "0") === 0);
  const mo  = insumos.filter((i: any) => parseFloat(i.alocacaoMdo ?? "0") > 0);

  if (!itensAtivos.length) {
    return <p className="text-xs text-slate-400 p-4">Orçamento vinculado, mas sem EAPs correspondentes.</p>;
  }

  return (
    <div className="p-4 space-y-3">
      {mo.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="h-3 w-3 text-blue-600" />
            <span className="text-[11px] font-semibold text-slate-600">Mão de obra</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mo.map((i: any, idx: number) => (
              <span key={idx} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                {i.insumoDescricao}{i.quantidade ? ` — ${parseFloat(i.quantidade).toFixed(0)} ${i.unidade ?? ""}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {mat.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Package className="h-3 w-3 text-amber-600" />
            <span className="text-[11px] font-semibold text-slate-600">Materiais</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mat.slice(0, 15).map((i: any, idx: number) => (
              <span key={idx} className="text-[11px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                {i.insumoDescricao}{i.quantidade ? ` — ${parseFloat(i.quantidade).toFixed(0)} ${i.unidade ?? ""}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {itensAtivos.length > 0 && !mo.length && !mat.length && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wrench className="h-3 w-3 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600">Composições</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {itensAtivos.slice(0, 10).map((it: any, idx: number) => (
              <span key={idx} className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                {it.descricao}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertasBlock({ alertas, semanas }: { alertas: any; semanas: Week[] }) {
  if (!alertas) return null;
  return (
    <div className="p-4 space-y-4">
      {alertas.resumo && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-700 leading-relaxed">
          <span className="font-semibold text-slate-800">Síntese executiva: </span>
          {alertas.resumo}
        </div>
      )}
      {alertas.alertas?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Alertas</p>
          {alertas.alertas.map((al: any, i: number) => (
            <div key={i} className={`border-l-4 rounded-r-lg p-3 ${severidadeCor(al.severidade)}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                {tipoIcon(al.tipo)}
                <span className="text-xs font-semibold text-slate-800">{al.titulo}</span>
                {al.semana && <span className="text-[10px] text-slate-500 ml-auto">Sem. {al.semana}</span>}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">{al.descricao}</p>
            </div>
          ))}
        </div>
      )}
      {alertas.frentesAlternativas?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Frentes alternativas sugeridas</p>
          {alertas.frentesAlternativas.map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
              <Zap className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] text-amber-600 font-semibold">Sem. {f.semana} — </span>
                <span className="text-xs text-slate-700">{f.sugestao}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {alertas.previsaoImpacto && (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-start gap-2">
          <Clock className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-[11px] font-semibold text-slate-600">Impacto estimado no prazo: </span>
            <span className="text-[11px] text-slate-600">{alertas.previsaoImpacto}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relatório 3 Semanas (tela + print) ──────────────────────────────────────

function RelatorioTresSemanas({
  proximas3, avancosMap, today, nomeProjeto, nomeCliente,
  recursos, alertas, loadIA, onGerarAlertas,
}: {
  proximas3: { semana: Week; atividades: any[] }[];
  avancosMap: Record<number, number>;
  today: string;
  nomeProjeto: string;
  nomeCliente: string;
  recursos: any;
  alertas: any;
  loadIA: boolean;
  onGerarAlertas: () => void;
}) {
  const dataGeracao = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Gerar alertas antes de imprimir */}
      {!alertas && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Brain className="h-4 w-4" />
            Gere os alertas do JULINHO para incluir no relatório
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs" onClick={onGerarAlertas} disabled={loadIA}>
            {loadIA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
            {loadIA ? "Analisando…" : "Gerar alertas IA"}
          </Button>
        </div>
      )}

      {/* Relatório imprimível */}
      <div id="relatorio-semanal-print" className="bg-white rounded-xl border border-slate-200 overflow-hidden print:rounded-none print:border-none print:shadow-none">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-800 to-blue-900 text-white p-5 print:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium opacity-70 uppercase tracking-widest mb-1">Programação Semanal</p>
              <h1 className="text-lg font-bold">{nomeProjeto}</h1>
              <p className="text-sm opacity-80">{nomeCliente}</p>
            </div>
            <div className="text-right text-xs opacity-70">
              <p className="font-semibold">FC Engenharia</p>
              <p>Emitido em: {dataGeracao}</p>
              {proximas3.length > 0 && (
                <p className="mt-1">
                  Sem. {proximas3[0].semana.numero} a {proximas3[proximas3.length - 1].semana.numero}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 3 colunas de semana */}
        <div className={`grid gap-0 divide-x divide-slate-200 ${proximas3.length === 3 ? "grid-cols-3" : proximas3.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {proximas3.map(({ semana, atividades: at }) => {
            const itensEap = (recursos?.itens ?? []).filter((it: any) => at.some((a: any) => a.eapCodigo === it.eapCodigo));
            const servs    = new Set(itensEap.map((it: any) => it.servicoCodigo).filter(Boolean));
            const insEap   = (recursos?.insumos ?? []).filter((ins: any) => servs.has(ins.composicaoCodigo));
            const moEap    = insEap.filter((i: any) => parseFloat(i.alocacaoMdo ?? "0") > 0);
            const matEap   = insEap.filter((i: any) => parseFloat(i.alocacaoMat ?? "0") > 0 && parseFloat(i.alocacaoMdo ?? "0") === 0);
            const atrasadas = at.filter((a: any) => a.dataFim && a.dataFim < today && (avancosMap[a.id] ?? 0) < 100).length;

            return (
              <div key={semana.numero} className="flex flex-col">
                {/* Header da semana */}
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-blue-700">SEMANA {semana.numero}</p>
                    {atrasadas > 0 && (
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                        {atrasadas} atrasada{atrasadas !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {fmtBRDate(semana.ini)} a {fmtBRDate(semana.fim)}
                  </p>
                  <p className="text-[10px] text-slate-400">{at.length} atividade{at.length !== 1 ? "s" : ""}</p>
                </div>

                {/* Atividades */}
                <div className="flex-1 px-3 py-2 space-y-1 min-h-[180px]">
                  {at.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-4 text-center">Sem atividades</p>
                  )}
                  {at.map((a: any, i: number) => {
                    const av       = avancosMap[a.id] ?? 0;
                    const atrasada = !!a.dataFim && a.dataFim < today && av < 100;
                    return (
                      <div key={a.id ?? i}
                        className={`rounded p-1.5 border text-[11px] ${atrasada ? "bg-red-50 border-red-200" : av >= 100 ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold text-slate-700 leading-tight">{a.eapCodigo && <span className="font-mono text-slate-400 mr-1">{a.eapCodigo}</span>}{a.nome}</span>
                          <span className={`shrink-0 text-[10px] font-bold ${atrasada ? "text-red-600" : av >= 100 ? "text-emerald-600" : "text-blue-600"}`}>{av.toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          <span>{fmtBR(a.dataInicio)} → {fmtBR(a.dataFim)}</span>
                          {a.recursoPrincipal && <span className="truncate text-slate-400">· {a.recursoPrincipal}</span>}
                        </div>
                        {/* Barra de progresso mini */}
                        <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${av >= 100 ? "bg-emerald-500" : atrasada ? "bg-red-500" : "bg-blue-500"}`}
                            style={{ width: `${Math.min(100, av)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recursos da semana */}
                {(moEap.length > 0 || matEap.length > 0 || itensEap.length > 0) && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-1.5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Package className="h-2.5 w-2.5" /> Recursos necessários
                    </p>
                    {moEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-blue-600 font-medium flex items-center gap-0.5"><Users className="h-2.5 w-2.5" /> Mão de obra</p>
                        {moEap.slice(0, 4).map((i: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600 pl-3">• {i.insumoDescricao}</p>
                        ))}
                      </div>
                    )}
                    {matEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5"><Package className="h-2.5 w-2.5" /> Materiais</p>
                        {matEap.slice(0, 4).map((i: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600 pl-3">• {i.insumoDescricao}{i.quantidade ? ` (${parseFloat(i.quantidade).toFixed(0)} ${i.unidade ?? ""})` : ""}</p>
                        ))}
                      </div>
                    )}
                    {!moEap.length && !matEap.length && itensEap.length > 0 && (
                      <div>
                        {itensEap.slice(0, 4).map((it: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600">• {it.descricao}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Recursos texto (sem orçamento vinculado) */}
                {!recursos && at.some((a: any) => a.recursoPrincipal) && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Recursos</p>
                    {[...new Set(at.map((a: any) => a.recursoPrincipal).filter(Boolean))].slice(0, 5).map((r: any, i: number) => (
                      <p key={i} className="text-[10px] text-slate-600">• {r}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Alertas IA no rodapé */}
        {alertas && (
          <div className="border-t border-slate-200 p-5 space-y-4 bg-slate-50/40">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-bold text-slate-700">Análise JULINHO — Alertas e Recomendações</p>
            </div>
            {alertas.resumo && (
              <p className="text-xs text-slate-700 leading-relaxed bg-white border border-slate-100 rounded-lg p-3">
                <span className="font-semibold">Síntese: </span>{alertas.resumo}
              </p>
            )}
            {alertas.alertas?.length > 0 && (
              <div className="grid grid-cols-2 gap-2 print:grid-cols-2">
                {alertas.alertas.map((al: any, i: number) => (
                  <div key={i} className={`border-l-4 rounded-r-lg p-2.5 text-xs ${severidadeCor(al.severidade)}`}>
                    <div className="flex items-center gap-1 mb-0.5">
                      {tipoIcon(al.tipo)}
                      <span className="font-semibold text-slate-800">{al.titulo}</span>
                      {al.semana && <span className="text-[10px] text-slate-400 ml-auto">Sem. {al.semana}</span>}
                    </div>
                    <p className="text-[11px] text-slate-600">{al.descricao}</p>
                  </div>
                ))}
              </div>
            )}
            {alertas.frentesAlternativas?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Frentes alternativas</p>
                <div className="space-y-1">
                  {alertas.frentesAlternativas.map((f: any, i: number) => (
                    <p key={i} className="text-[11px] text-slate-700 flex items-start gap-1.5">
                      <Zap className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                      <span><strong>Sem. {f.semana}:</strong> {f.sugestao}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            {alertas.previsaoImpacto && (
              <p className="text-[11px] text-slate-600 bg-white border border-slate-100 rounded-lg p-2.5 flex items-start gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span><strong>Impacto estimado:</strong> {alertas.previsaoImpacto}</span>
              </p>
            )}
          </div>
        )}

        {/* Rodapé */}
        <div className="border-t border-slate-200 px-5 py-3 flex justify-between items-center text-[10px] text-slate-400 bg-slate-50">
          <span>FC Engenharia Civil · Sistema ERP RH&amp;DP</span>
          <span>Gerado em {dataGeracao} · Documento confidencial</span>
        </div>
      </div>

      {/* CSS de impressão embutido */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #relatorio-semanal-print, #relatorio-semanal-print * { visibility: visible; }
          #relatorio-semanal-print { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
