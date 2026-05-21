/**
 * Rev. 2222 — Alerta reutilizável: HE aprovada SEM ponto batido.
 *
 * Mostra um card laranja agrupando solicitações de HE aprovadas cujos
 * funcionários não bateram ponto NO HORÁRIO APROVADO. RH pode:
 *   • Selecionar 1, vários ou todos os funcionários do grupo.
 *   • Editar o horário (default = horaInicio/horaFim da própria HE).
 *   • Clicar "Lançar ponto selecionados" → grava entrada1/saida1 +
 *     horasExtras no Espelho de Ponto (fonte=manual, ajusteManual=1).
 *
 * Usado em: FolhaPagamento (Módulo Hora Extra) — Rev. 2220 retirou de
 * SolicitacaoHE e FechamentoPonto.
 *
 * Não renderiza nada quando não há casos.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, Eye, CheckSquare, Square, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc";
import { toast } from "@/hooks/use-toast";

type Props = {
  companyId: number;
  companyIds?: number[];
  mesReferencia?: string;       // YYYY-MM (fallback)
  dataInicio?: string;          // YYYY-MM-DD (preferido)
  dataFim?: string;             // YYYY-MM-DD
  onOpenEmployee?: (employeeId: number) => void;
  onOpenSolicitacao?: (solicitacaoId: number) => void;
  title?: string;
};

type GrupoState = {
  selecionados: Set<number>;
  horaInicio: string;
  horaFim: string;
};

export default function HEAprovadaSemPontoAlert({
  companyId,
  companyIds,
  mesReferencia,
  dataInicio,
  dataFim,
  onOpenEmployee,
  onOpenSolicitacao,
  title,
}: Props) {
  const enabled = companyId > 0 || (companyIds?.length ?? 0) > 0;
  const utils = trpc.useUtils();
  const query = trpc.heSolicitacoes.aprovadasSemPonto.useQuery(
    { companyId, companyIds, mesReferencia, dataInicio, dataFim },
    { enabled }
  );

  const lancarMut = trpc.heSolicitacoes.lancarPontoFromHE.useMutation({
    onSuccess: (r) => {
      toast({
        title: "Ponto lançado",
        description: `${r.created} criado(s), ${r.updated} atualizado(s) em ${r.total} func(s).`,
      });
      utils.heSolicitacoes.aprovadasSemPonto.invalidate();
    },
    onError: (e) => {
      toast({ title: "Erro ao lançar ponto", description: e.message, variant: "destructive" });
    },
  });

  const items = query.data ?? [];

  // Estado por solicitação (selecionados + horários editados).
  const [state, setState] = useState<Record<number, GrupoState>>({});

  // Grupos memoizados por items
  const grupos = useMemo(() => {
    const m = new Map<number, { sol: any; funcs: any[]; periodoHE: any }>();
    for (const it of items) {
      if (!m.has(it.solicitacaoId)) {
        m.set(it.solicitacaoId, {
          sol: {
            id: it.solicitacaoId,
            dataSolicitacao: it.dataSolicitacao,
            horaInicio: it.horaInicio,
            horaFim: it.horaFim,
            motivo: it.motivo,
            obraNome: it.obraNome,
          },
          funcs: [],
          periodoHE: it.periodoHE || null,
        });
      }
      m.get(it.solicitacaoId)!.funcs.push(it);
    }
    return m;
  }, [items]);

  if (items.length === 0) return null;

  const getGrupoState = (solId: number, defaultIni: string | null, defaultFim: string | null): GrupoState => {
    return (
      state[solId] || {
        selecionados: new Set<number>(),
        horaInicio: defaultIni || "",
        horaFim: defaultFim || "",
      }
    );
  };

  const updateGrupo = (solId: number, patch: Partial<GrupoState>, defaultIni: string | null, defaultFim: string | null) => {
    setState((s) => {
      const prev = s[solId] || {
        selecionados: new Set<number>(),
        horaInicio: defaultIni || "",
        horaFim: defaultFim || "",
      };
      return { ...s, [solId]: { ...prev, ...patch } };
    });
  };

  const toggleEmp = (solId: number, empId: number, defaultIni: string | null, defaultFim: string | null) => {
    setState((s) => {
      const prev = s[solId] || {
        selecionados: new Set<number>(),
        horaInicio: defaultIni || "",
        horaFim: defaultFim || "",
      };
      const next = new Set(prev.selecionados);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return { ...s, [solId]: { ...prev, selecionados: next } };
    });
  };

  const toggleAll = (solId: number, allIds: number[], defaultIni: string | null, defaultFim: string | null) => {
    setState((s) => {
      const prev = s[solId] || {
        selecionados: new Set<number>(),
        horaInicio: defaultIni || "",
        horaFim: defaultFim || "",
      };
      const allSelected = allIds.every((id) => prev.selecionados.has(id));
      const next = new Set<number>(allSelected ? [] : allIds);
      return { ...s, [solId]: { ...prev, selecionados: next } };
    });
  };

  const handleLancar = (solId: number, defaultIni: string | null, defaultFim: string | null) => {
    const gs = getGrupoState(solId, defaultIni, defaultFim);
    const ids = Array.from(gs.selecionados);
    if (ids.length === 0) {
      toast({ title: "Selecione ao menos 1 funcionário", variant: "destructive" });
      return;
    }
    const re = /^\d{2}:\d{2}$/;
    if (!re.test(gs.horaInicio) || !re.test(gs.horaFim)) {
      toast({ title: "Horário inválido", description: "Use o formato HH:MM.", variant: "destructive" });
      return;
    }
    lancarMut.mutate({
      solicitacaoId: solId,
      employeeIds: ids,
      horaInicio: gs.horaInicio,
      horaFim: gs.horaFim,
    });
  };

  const fmtBR = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  return (
    <Card className="border-l-4 border-l-orange-500 bg-orange-50/50 no-print">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm md:text-base font-semibold text-orange-900">
              {title || "HE aprovada SEM ponto no horário aprovado"} ({items.length} {items.length === 1 ? "funcionário" : "funcionários"})
            </h3>
            <p className="text-[11px] md:text-xs text-orange-800/80 mt-0.5">
              Estes funcionários têm hora extra <strong>aprovada</strong> mas <strong>não há batida</strong> dentro do intervalo aprovado.
              Selecione, ajuste o horário se necessário e clique em <strong>Lançar ponto</strong> para gravar direto no Espelho de Ponto
              (entrada1/saída1, fonte=manual, ajusteManual=1). Ou abra o Espelho do funcionário para análise caso a caso.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {Array.from(grupos.values()).map(({ sol, funcs, periodoHE }) => {
            const pStatus = periodoHE?.status as string | undefined;
            const pagoOuAprovado = pStatus === "pago" || pStatus === "aprovado";
            const periodoBadge = periodoHE && (
              <span
                className={
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border " +
                  (pStatus === "pago"
                    ? "bg-red-100 text-red-800 border-red-300"
                    : pStatus === "aprovado"
                    ? "bg-amber-100 text-amber-900 border-amber-300"
                    : "bg-slate-100 text-slate-700 border-slate-300")
                }
                title={
                  pagoOuAprovado
                    ? "Este dia já está em período HE " + pStatus + " — NÃO lançar manualmente no Espelho de Ponto, recalcule o período."
                    : "Este dia está em período HE " + (pStatus || "calculado")
                }
              >
                Período {periodoHE.dataInicio.slice(8, 10)}/{periodoHE.dataInicio.slice(5, 7)}—
                {periodoHE.dataFim.slice(8, 10)}/{periodoHE.dataFim.slice(5, 7)} ·{" "}
                {pStatus === "pago" ? "PAGO" : pStatus === "aprovado" ? "APROVADO" : "calculado"}
                {periodoHE.temLinhaNoPeriodo ? " · c/ linha" : ""}
              </span>
            );

            const gs = getGrupoState(sol.id, sol.horaInicio, sol.horaFim);
            const allIds = funcs.map((f: any) => f.employeeId);
            const allSelected = allIds.length > 0 && allIds.every((id) => gs.selecionados.has(id));
            const someSelected = !allSelected && allIds.some((id) => gs.selecionados.has(id));
            const isPending = lancarMut.isPending && lancarMut.variables?.solicitacaoId === sol.id;

            return (
              <div key={sol.id} className="bg-white border border-orange-200 rounded-md p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] md:text-xs mb-1.5">
                  <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">Aprovada</Badge>
                  <span className="text-muted-foreground">
                    HE-{String(sol.id).padStart(5, "0")} ·{" "}
                    {new Date(sol.dataSolicitacao + "T12:00:00").toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                  {sol.horaInicio && sol.horaFim && (
                    <span className="text-muted-foreground">
                      {sol.horaInicio} — {sol.horaFim}
                    </span>
                  )}
                  {sol.obraNome && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Building2 className="h-3 w-3" /> {sol.obraNome}
                    </span>
                  )}
                  {periodoBadge}
                  {onOpenSolicitacao && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 ml-auto text-[10px] px-2"
                      onClick={() => onOpenSolicitacao(sol.id)}
                    >
                      <Eye className="h-3 w-3 mr-1" /> Ver solicitação
                    </Button>
                  )}
                </div>
                {pagoOuAprovado && (
                  <div className="text-[10px] md:text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1 mb-1.5">
                    ⚠ <strong>Atenção duplicidade:</strong> o período HE de {fmtBR(periodoHE.dataInicio)} a {fmtBR(periodoHE.dataFim)} já está <strong>{pStatus === "pago" ? "PAGO" : "APROVADO"}</strong>
                    {periodoHE.temLinhaNoPeriodo ? " e este funcionário já tem linha no período" : " (sem linha pra este funcionário neste período)"}.
                    Se for pagar agora, faça <strong>desconsolidação/recálculo do período</strong> — não lance HE manual no Espelho de Ponto.
                  </div>
                )}

                {/* Barra de ações: selecionar todos + horários + lançar */}
                <div className="flex flex-wrap items-center gap-2 mb-2 bg-slate-50 border border-slate-200 rounded px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleAll(sol.id, allIds, sol.horaInicio, sol.horaFim)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900"
                    title={allSelected ? "Desmarcar todos" : "Selecionar todos"}
                  >
                    {allSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : someSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-400" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" />
                    )}
                    {allSelected ? "Todos" : someSelected ? `${gs.selecionados.size} sel.` : "Selec. todos"}
                  </button>

                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-slate-600">Entrada</span>
                    <Input
                      type="time"
                      value={gs.horaInicio}
                      onChange={(e) =>
                        updateGrupo(sol.id, { horaInicio: e.target.value }, sol.horaInicio, sol.horaFim)
                      }
                      className="h-7 w-24 text-[11px]"
                    />
                    <span className="text-slate-600 ml-1">Saída</span>
                    <Input
                      type="time"
                      value={gs.horaFim}
                      onChange={(e) =>
                        updateGrupo(sol.id, { horaFim: e.target.value }, sol.horaInicio, sol.horaFim)
                      }
                      className="h-7 w-24 text-[11px]"
                    />
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleLancar(sol.id, sol.horaInicio, sol.horaFim)}
                    disabled={isPending || gs.selecionados.size === 0}
                    className="h-7 text-[11px] ml-auto bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Lançando...
                      </>
                    ) : (
                      <>Lançar ponto ({gs.selecionados.size})</>
                    )}
                  </Button>
                </div>

                {/* Lista de funcionários — cada um com checkbox individual */}
                <div className="flex flex-wrap gap-1.5">
                  {funcs.map((f: any) => {
                    const checked = gs.selecionados.has(f.employeeId);
                    const iniciais = (f.employeeName || "?")
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p: string) => p[0]?.toUpperCase() || "")
                      .join("") || "?";
                    return (
                      <div
                        key={f.employeeId}
                        className={
                          "inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border text-[10px] md:text-xs transition " +
                          (checked
                            ? "bg-blue-100 border-blue-400 text-blue-900"
                            : "bg-orange-100 border-orange-300 text-orange-900")
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleEmp(sol.id, f.employeeId, sol.horaInicio, sol.horaFim)}
                          className="shrink-0"
                          title={checked ? "Desmarcar" : "Selecionar"}
                        >
                          {checked ? (
                            <CheckSquare className="h-3.5 w-3.5 text-blue-700" />
                          ) : (
                            <Square className="h-3.5 w-3.5 text-orange-600" />
                          )}
                        </button>
                        <Avatar className="h-5 w-5 shrink-0 ring-1 ring-white">
                          {f.fotoUrl && <AvatarImage src={f.fotoUrl} alt={f.employeeName} />}
                          <AvatarFallback className={
                            "text-[8px] font-semibold " +
                            (checked ? "bg-blue-200 text-blue-800" : "bg-orange-200 text-orange-800")
                          }>
                            {iniciais}
                          </AvatarFallback>
                        </Avatar>
                        {onOpenEmployee ? (
                          <button
                            type="button"
                            onClick={() => onOpenEmployee(f.employeeId)}
                            className="font-medium hover:underline"
                            title="Abrir Raio-X do funcionário"
                          >
                            {f.employeeName}
                          </button>
                        ) : (
                          <span className="font-medium">{f.employeeName}</span>
                        )}
                        {f.funcao && <span className="opacity-70">· {f.funcao}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
