import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  GitCompareArrows, X, CheckCircle2, AlertTriangle, AlertCircle,
  Search, Loader2, Info, Download, FileWarning, ListChecks,
} from "lucide-react";

interface Props {
  projetoId: number;
  revisaoId: number | null | undefined;
  trigger?: React.ReactNode;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

type Aba = "casados" | "soNoOrcamento" | "soNoCronograma";

export default function DiagnosticoEapOrcCron({ projetoId, revisaoId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<Aba>("soNoOrcamento");
  const [busca, setBusca] = useState("");
  const [autoSyncFeito, setAutoSyncFeito] = useState<{ atualizadas: number } | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.planejamento.diagnosticoEapOrcVsCron.useQuery(
    { projetoId, revisaoId: revisaoId ?? 0 },
    { enabled: open && !!revisaoId },
  );

  // Rev. 1798 / R-013 — Auto-sync silencioso ao abrir o diagnóstico:
  // Se houver EAPs casados com nome divergente, corrige no banco automaticamente
  // (sem botão, sem confirmação). Roda UMA vez por abertura do modal.
  const autoSyncMutation = trpc.planejamento.autoSincronizarNomesComOrcamento.useMutation({
    onSuccess: (res) => {
      if (res.atualizadas > 0) {
        setAutoSyncFeito({ atualizadas: res.atualizadas });
        utils.planejamento.diagnosticoEapOrcVsCron.invalidate();
        utils.planejamento.listarAtividades.invalidate();
      }
    },
  });

  const descDivergeData = data?.descDiverge ?? 0;
  React.useEffect(() => {
    if (open && revisaoId && descDivergeData > 0 && !autoSyncMutation.isPending && !autoSyncFeito) {
      autoSyncMutation.mutate({ projetoId, revisaoId });
    }
  }, [open, revisaoId, descDivergeData, projetoId, autoSyncFeito]);

  React.useEffect(() => {
    if (!open) setAutoSyncFeito(null);
  }, [open]);

  const casados = data?.casados ?? [];
  const soNoOrcamento = data?.soNoOrcamento ?? [];
  const soNoCronograma = data?.soNoCronograma ?? [];

  const totalCusto = useMemo(
    () => casados.reduce((s, c) => s + c.custoTotal, 0) + soNoOrcamento.reduce((s, c) => s + c.custoTotal, 0),
    [casados, soNoOrcamento],
  );
  const custoCasado = useMemo(() => casados.reduce((s, c) => s + c.custoTotal, 0), [casados]);
  const custoSoOrc = useMemo(() => soNoOrcamento.reduce((s, c) => s + c.custoTotal, 0), [soNoOrcamento]);

  const pctCasadoQtd = data && data.totalOrcamento > 0
    ? (casados.length / data.totalOrcamento) * 100 : 0;
  const pctCasadoR$ = totalCusto > 0 ? (custoCasado / totalCusto) * 100 : 0;
  const descDiverge = useMemo(() => casados.filter(c => !c.descBate).length, [casados]);

  const filtrar = <T extends { eapCodigo: string }>(arr: T[], extra: (it: T) => string) => {
    if (!busca.trim()) return arr;
    const q = busca.toLowerCase();
    return arr.filter(it => it.eapCodigo.toLowerCase().includes(q) || extra(it).toLowerCase().includes(q));
  };

  const casadosFiltrados = filtrar(casados, c => `${c.descricaoOrc} ${c.nomeCron}`);
  const soOrcFiltrados = filtrar(soNoOrcamento, c => c.descricao);
  const soCronFiltrados = filtrar(soNoCronograma, c => c.nome);

  function exportarCSV() {
    const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const linhas: string[] = [];
    linhas.push(['Categoria','EAP','Descrição (Orçamento)','Nome (Cronograma)','Custo R$','Observação'].map(esc).join(','));
    for (const c of casados) {
      linhas.push(['CASADO', c.eapCodigo, c.descricaoOrc, c.nomeCron, c.custoTotal.toFixed(2), c.descBate ? 'OK' : 'Descrição diverge'].map(esc).join(','));
    }
    for (const c of soNoOrcamento) {
      linhas.push(['SÓ NO ORÇAMENTO', c.eapCodigo, c.descricao, '', c.custoTotal.toFixed(2), 'Item do orçamento sem atividade no cronograma'].map(esc).join(','));
    }
    for (const c of soNoCronograma) {
      linhas.push(['SÓ NO CRONOGRAMA', c.eapCodigo, '', c.nome, '0.00', 'Atividade do cronograma sem item no orçamento'].map(esc).join(','));
    }
    const csv = '\uFEFF' + linhas.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diagnostico-eap-projeto-${projetoId}-rev-${revisaoId}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const abas: { id: Aba; label: string; count: number; cor: string }[] = [
    { id: "soNoOrcamento", label: "Só no Orçamento", count: soNoOrcamento.length, cor: "amber" },
    { id: "soNoCronograma", label: "Só no Cronograma", count: soNoCronograma.length, cor: "rose" },
    { id: "casados", label: "Casados", count: casados.length, cor: "emerald" },
  ];

  const corMap: Record<string, { bg: string; text: string; border: string; ring: string }> = {
    amber:   { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-300",   ring: "ring-amber-400" },
    rose:    { bg: "bg-rose-100",    text: "text-rose-700",    border: "border-rose-300",    ring: "ring-rose-400" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300", ring: "ring-emerald-400" },
  };

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="inline-block cursor-pointer">{trigger}</span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
          onClick={() => setOpen(true)}
          disabled={!revisaoId}
          title="Diagnóstico EAP Orçamento ↔ Cronograma (R-013)"
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
          Diagnóstico EAP
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // @ts-ignore — prop custom shadcn aceita
          resizable={false}
          showCloseButton={false}
          className="w-[100vw] sm:w-[98vw] max-w-none h-[100dvh] sm:h-[96dvh] max-h-[100dvh] sm:max-h-[96dvh] p-0 gap-0 overflow-hidden flex flex-col rounded-none sm:rounded-lg border-0 sm:border"
        >
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 text-white px-4 sm:px-6 py-4 shrink-0 flex items-start gap-3 shadow-lg">
            <div className="bg-white/20 rounded-xl p-2.5 shrink-0">
              <GitCompareArrows className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold leading-tight">Diagnóstico EAP — Orçamento ↔ Cronograma</h2>
              <p className="text-violet-100 text-xs sm:text-sm mt-0.5">
                Auditoria do rastreio entre itens do orçamento e atividades do cronograma (R-013).
                {data && (
                  <> {data.totalOrcamento} itens no orçamento · {data.totalCronograma} atividades-folha no cronograma.</>
                )}
              </p>
            </div>
            <Button
              size="sm" variant="ghost"
              className="text-white hover:bg-white/20 shrink-0"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto bg-slate-50/40">
            {isLoading && (
              <div className="flex items-center justify-center h-full text-slate-500 gap-2 p-10">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando diagnóstico…
              </div>
            )}

            {error && (
              <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 flex gap-3">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Erro ao carregar diagnóstico</p>
                  <p className="text-sm mt-1">{error.message}</p>
                </div>
              </div>
            )}

            {data?.status === "sem_orcamento" && (
              <div className="m-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900 flex gap-3">
                <FileWarning className="h-6 w-6 shrink-0" />
                <div>
                  <p className="font-semibold">Projeto sem orçamento vinculado</p>
                  <p className="text-sm mt-1">Vincule um orçamento na aba "Configurações" do projeto para usar o diagnóstico de rastreio EAP.</p>
                </div>
              </div>
            )}

            {data?.status === "ok" && (
              <>
                {/* KPI cards */}
                <div className="p-4 sm:p-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    cor="emerald"
                    label="EAPs casados"
                    valor={`${casados.length}`}
                    sub={`de ${data.totalOrcamento} (${pctCasadoQtd.toFixed(1)}%)`}
                    title="Itens do orçamento que têm atividade-folha correspondente no cronograma com o MESMO eapCodigo."
                  />
                  <KpiCard
                    icon={<AlertTriangle className="h-5 w-5" />}
                    cor="amber"
                    label="Só no Orçamento"
                    valor={`${soNoOrcamento.length}`}
                    sub={fmtBRL(custoSoOrc) + " sem cronograma"}
                    title="Itens do orçamento que NÃO existem no cronograma — provavelmente atividades não planejadas. R$ não entra na curva S realizada."
                  />
                  <KpiCard
                    icon={<AlertCircle className="h-5 w-5" />}
                    cor="rose"
                    label="Só no Cronograma"
                    valor={`${soNoCronograma.length}`}
                    sub="atividades sem custo"
                    title="Atividades do cronograma cujo EAP não bate com nenhum item do orçamento — sem origem de custo, caem no fallback peso% × venda."
                  />
                  <KpiCard
                    icon={<Info className="h-5 w-5" />}
                    cor="violet"
                    label="Cobertura R$ do Orçamento"
                    valor={`${pctCasadoR$.toFixed(1)}%`}
                    sub={`${fmtBRL(custoCasado)} de ${fmtBRL(totalCusto)}`}
                    title="Percentual do valor R$ do orçamento que tem atividade correspondente no cronograma — meta saudável >95%."
                  />
                </div>

                {/* Banner de auto-sync (Rev. 1798) — confirma que já corrigiu */}
                {autoSyncFeito && autoSyncFeito.atualizadas > 0 && (
                  <div className="mx-4 sm:mx-6 mb-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900 flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      <b>{autoSyncFeito.atualizadas} nome(s) sincronizado(s) automaticamente</b> com o orçamento (R-013).
                      Os nomes do cronograma agora batem 100% com a descrição do orçamento — sem botão, sem perguntar.
                    </span>
                  </div>
                )}
                {/* Alerta de descrição divergente — só aparece enquanto auto-sync ainda não rodou */}
                {descDiverge > 0 && !autoSyncFeito && (
                  <div className="mx-4 sm:mx-6 mb-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-orange-900 flex items-start gap-2 text-sm">
                    {autoSyncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 mt-0.5 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <span>
                      <b>{descDiverge} EAPs casados têm DESCRIÇÃO divergente</b> entre orçamento e cronograma.
                      {autoSyncMutation.isPending
                        ? " Corrigindo automaticamente agora…"
                        : " Serão corrigidos automaticamente em instantes (R-013) — sem perguntar, sem renumeração."}
                    </span>
                  </div>
                )}

                {/* Toolbar abas + busca */}
                <div className="px-4 sm:px-6 sticky top-0 z-10 bg-slate-50/40 backdrop-blur pb-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {abas.map(a => {
                      const c = corMap[a.cor];
                      const active = aba === a.id;
                      return (
                        <button
                          key={a.id}
                          onClick={() => setAba(a.id)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-semibold flex items-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 ${c.ring} ${
                            active ? `${c.bg} ${c.text} ${c.border} shadow-sm` : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                          aria-pressed={active}
                        >
                          {a.label}
                          <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-bold tabular-nums ${
                            active ? `bg-white/70 ${c.text}` : "bg-slate-200 text-slate-700"
                          }`}>{a.count}</span>
                        </button>
                      );
                    })}

                    <div className="ml-auto flex items-center gap-2">
                      <div className="relative">
                        <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <Input
                          placeholder="Filtrar por EAP ou descrição…"
                          value={busca}
                          onChange={e => setBusca(e.target.value)}
                          className="pl-8 h-9 w-56 sm:w-72 bg-white"
                        />
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={exportarCSV} title="Exportar diagnóstico completo em CSV">
                        <Download className="h-3.5 w-3.5" /> CSV
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Conteúdo da aba */}
                <div className="px-4 sm:px-6 pb-6">
                  {aba === "soNoOrcamento" && (
                    <Lista
                      vazioMsg="Nenhum item do orçamento ficou sem cronograma. Cobertura 100%."
                      cor="amber"
                      itens={soOrcFiltrados.map(c => ({
                        eap: c.eapCodigo,
                        principal: c.descricao,
                        secundario: `Nível ${c.nivel}`,
                        valor: fmtBRL(c.custoTotal),
                        valorLabel: "Custo total",
                      }))}
                      explicacao={
                        <>Itens do orçamento que NÃO foram encontrados no cronograma. <b>Causa típica</b>: atividade existe na planilha de orçamento mas não foi adicionada ao MS Project (esquecida ou agrupada). <b>Correção</b>: adicione a atividade no MSP com o EAP IDÊNTICO ao do orçamento e reimporte.</>
                      }
                    />
                  )}

                  {aba === "soNoCronograma" && (
                    <Lista
                      vazioMsg="Toda atividade do cronograma tem item no orçamento. Vínculo perfeito."
                      cor="rose"
                      itens={soCronFiltrados.map(c => ({
                        eap: c.eapCodigo,
                        principal: c.nome,
                        secundario: c.isGrupo ? "Grupo (não conta)" : c.isMarco ? "Marco" : "Folha",
                        valor: "—",
                        valorLabel: "Sem custo de orçamento",
                      }))}
                      explicacao={
                        <>Atividades do cronograma cujo EAP não bate com nenhum item do orçamento. <b>Causa típica</b>: atividade criada direto no MSP sem espelho no orçamento (ex.: indireta esquecida) OU EAP digitado errado em um dos lados. <b>Correção</b>: alinhe o EAP — se a atividade é real, adicione ao orçamento; se é gerencial, marque como Indireta na planilha do MSP.</>
                      }
                    />
                  )}

                  {aba === "casados" && (
                    <Lista
                      vazioMsg="Nenhum casamento ainda. Importe o cronograma."
                      cor="emerald"
                      itens={casadosFiltrados.map(c => ({
                        eap: c.eapCodigo,
                        principal: c.descricaoOrc,
                        secundario: c.descBate
                          ? `MSP: ${c.nomeCron}`
                          : `⚠️ Cronograma: "${c.nomeCron}" (descrição diverge)`,
                        secundarioCor: c.descBate ? "text-slate-500" : "text-orange-600 font-semibold",
                        valor: fmtBRL(c.custoTotal),
                        valorLabel: "Custo total",
                      }))}
                      explicacao={
                        <>EAPs presentes nos DOIS lados (orçamento e cronograma). Estes itens entram corretamente na curva S financeira via custo do orçamento. Linhas em <span className="text-orange-600 font-semibold">laranja</span> têm descrição divergente — confira se não houve troca acidental.</>
                      }
                    />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t bg-white px-4 sm:px-6 py-3 shrink-0 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 hidden sm:flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              R-013: o EAP do orçamento é a chave de rastreio — corrija na planilha de origem, nunca no ERP.
            </p>
            <Button size="sm" onClick={() => setOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon, cor, label, valor, sub, title }: {
  icon: React.ReactNode; cor: "emerald" | "amber" | "rose" | "violet";
  label: string; valor: string; sub: string; title?: string;
}) {
  const corMap = {
    emerald: { bg: "from-emerald-500 to-teal-600", border: "border-emerald-200", text: "text-emerald-700" },
    amber:   { bg: "from-amber-500 to-orange-600", border: "border-amber-200",   text: "text-amber-700" },
    rose:    { bg: "from-rose-500 to-pink-600",    border: "border-rose-200",    text: "text-rose-700" },
    violet:  { bg: "from-violet-500 to-purple-600", border: "border-violet-200", text: "text-violet-700" },
  } as const;
  const c = corMap[cor];
  return (
    <div className={`bg-white rounded-xl border ${c.border} shadow-sm p-3 sm:p-4 flex items-start gap-3 cursor-help`} title={title}>
      <div className={`bg-gradient-to-br ${c.bg} text-white rounded-lg p-2 shrink-0`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${c.text} truncate`}>{label}</p>
        <p className="text-2xl font-black text-slate-900 tabular-nums leading-tight mt-0.5">{valor}</p>
        <p className="text-[11px] text-slate-500 truncate mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

// ── Lista genérica ────────────────────────────────────────────────────────────
function Lista({ itens, vazioMsg, cor, explicacao }: {
  itens: Array<{ eap: string; principal: string; secundario: string; secundarioCor?: string; valor: string; valorLabel: string }>;
  vazioMsg: string;
  cor: "emerald" | "amber" | "rose";
  explicacao: React.ReactNode;
}) {
  const corMap = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
    amber:   { bg: "bg-amber-50",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700" },
    rose:    { bg: "bg-rose-50",    border: "border-rose-200",    badge: "bg-rose-100 text-rose-700" },
  } as const;
  const c = corMap[cor];

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border ${c.border} ${c.bg} p-3 text-sm text-slate-700 flex gap-2`}>
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>{explicacao}</p>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 flex flex-col items-center gap-2">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="font-semibold text-slate-700">{vazioMsg}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          {/* Desktop tabela */}
          <table className="w-full hidden md:table">
            <thead className="bg-slate-100">
              <tr className="text-left text-xs font-semibold text-slate-600 uppercase">
                <th className="py-2 px-3 w-32">EAP</th>
                <th className="py-2 px-3">Descrição</th>
                <th className="py-2 px-3 text-right w-44">{itens[0].valorLabel}</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums ${c.badge}`}>{it.eap}</span>
                  </td>
                  <td className="py-2 px-3">
                    <p className="text-sm font-medium text-slate-800 leading-tight">{it.principal}</p>
                    <p className={`text-xs mt-0.5 ${it.secundarioCor ?? "text-slate-500"}`}>{it.secundario}</p>
                  </td>
                  <td className="py-2 px-3 text-right text-sm font-semibold text-slate-700 tabular-nums">{it.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {itens.map((it, i) => (
              <div key={i} className="p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tabular-nums ${c.badge}`}>{it.eap}</span>
                  <span className="text-sm font-semibold text-slate-700 tabular-nums">{it.valor}</span>
                </div>
                <p className="text-sm font-medium text-slate-800 leading-tight">{it.principal}</p>
                <p className={`text-xs mt-0.5 ${it.secundarioCor ?? "text-slate-500"}`}>{it.secundario}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
