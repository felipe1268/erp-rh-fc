import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FullScreenDialog from "@/components/FullScreenDialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  PenLine,
  AlertTriangle,
  ChevronsUpDown,
  Check,
  CalendarDays,
  Plus,
  X,
} from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatMesAno(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}

function fmtBr(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function maskTimeValue(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2, 4);
}

function normalizeTimeOnBlur(val: string): string {
  if (!val) return "";
  const parts = val.split(":");
  const h = Math.min(23, parseInt(parts[0] || "0", 10));
  const m = Math.min(59, parseInt(parts[1] || "0", 10));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getScheduleForDay(
  jornadaTrabalho: string | null | undefined,
  dateStr: string,
): { entrada1: string; saida1: string; entrada2: string; saida2: string } {
  const empty = { entrada1: "", saida1: "", entrada2: "", saida2: "" };
  if (!jornadaTrabalho || !dateStr) return empty;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00").getDay()];
    const day = parsed[dayKey];
    if (!day?.entrada || !day?.saida) return empty;
    const entrada1 = day.entrada;
    const saida2 = day.saida;
    if (day.intervalo) {
      const [ih, im] = day.intervalo.split(":").map(Number);
      const breakMins = (ih || 0) * 60 + (im || 0);
      if (breakMins > 0) {
        const lunchOutMins = 12 * 60;
        const lunchInMins = lunchOutMins + breakMins;
        const fmt = (m: number) =>
          `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        return { entrada1, saida1: fmt(lunchOutMins), entrada2: fmt(lunchInMins), saida2 };
      }
    }
    return { entrada1, saida1: "", entrada2: "", saida2 };
  } catch {
    return empty;
  }
}

type ManualDay = {
  id: string;
  data: string;
  entrada1: string;
  saida1: string;
  entrada2: string;
  saida2: string;
  entrada3: string;
  saida3: string;
  feriado?: boolean;
};

export type ManualEntryInitialData = {
  employeeId?: number;
  obraId?: number;
  data?: string;
  entrada1?: string;
  saida1?: string;
  entrada2?: string;
  saida2?: string;
  entrada3?: string;
  saida3?: string;
  justificativa?: string;
};

type ManualEntryDialogProps = {
  open: boolean;
  onClose: () => void;
  mode: "mes" | "periodo";
  companyId: number;
  companyIds?: number[];
  /** Required when mode = "mes" — formato "YYYY-MM" */
  mesAno?: string;
  /** Required when mode = "periodo" — formato ISO "YYYY-MM-DD" */
  dataInicio?: string;
  /** Required when mode = "periodo" — formato ISO "YYYY-MM-DD" */
  dataFim?: string;
  isConsolidado?: boolean;
  initialData?: ManualEntryInitialData;
  /** Chamado após salvar com sucesso (para refetch das listagens da página) */
  onSaved?: () => void;
};

export default function ManualEntryDialog({
  open,
  onClose,
  mode,
  companyId,
  companyIds,
  mesAno,
  dataInicio,
  dataFim,
  isConsolidado = false,
  initialData,
  onSaved,
}: ManualEntryDialogProps) {
  const [manualData, setManualData] = useState({
    employeeId: 0,
    obraId: 0,
    data: "",
    entrada1: "",
    saida1: "",
    entrada2: "",
    saida2: "",
    entrada3: "",
    saida3: "",
    justificativa: "",
  });
  const [manualEmpPopoverOpen, setManualEmpPopoverOpen] = useState(false);
  const [manualDays, setManualDays] = useState<ManualDay[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [showRangePopover, setShowRangePopover] = useState(false);

  // Mês mode (1..31)
  const [rangeFromDay, setRangeFromDay] = useState(1);
  const [rangeToDay, setRangeToDay] = useState(31);

  // Período mode (ISO datas)
  const [rangeFromDate, setRangeFromDate] = useState("");
  const [rangeToDate, setRangeToDate] = useState("");

  const obrasList = trpc.obras.listActive.useQuery(
    { companyId, companyIds },
    { enabled: open && (companyId > 0 || (companyIds || []).length > 0) },
  );
  const employeesList = trpc.employees.list.useQuery(
    {
      companyId,
      companyIds,
      excludeTerminated: true,
      includeTerminatedInMonth: mode === "mes" ? mesAno : undefined,
    } as any,
    { enabled: open && (companyId > 0 || (companyIds || []).length > 0) },
  );
  const atestadosMesQ = trpc.pontoDescontos.atestadosMes.useQuery(
    { companyId, companyIds, mesReferencia: mesAno || "" } as any,
    { enabled: open && mode === "mes" && !!mesAno && (companyId > 0 || (companyIds || []).length > 0) },
  );
  const atestados: any[] = atestadosMesQ.data || [];

  const manualBatchMut = trpc.fechamentoPonto.manualEntry.useMutation({
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  // Sync state quando o dialog abre
  useEffect(() => {
    if (!open) return;

    // Reset de UI controlada (evita vazamento entre aberturas)
    setManualEmpPopoverOpen(false);
    setShowRangePopover(false);
    setManualSaving(false);

    // Defaults para os range pickers
    if (mode === "mes" && mesAno) {
      const [y, m] = mesAno.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      setRangeFromDay(1);
      setRangeToDay(daysInMonth);
    }
    if (mode === "periodo") {
      setRangeFromDate(dataInicio || "");
      setRangeToDate(dataFim || "");
    }

    // Pré-fill (vem de uma inconsistência ou single-day)
    if (initialData?.data) {
      setManualData({
        employeeId: initialData.employeeId || 0,
        obraId: initialData.obraId || 0,
        data: initialData.data,
        entrada1: initialData.entrada1 || "",
        saida1: initialData.saida1 || "",
        entrada2: initialData.entrada2 || "",
        saida2: initialData.saida2 || "",
        entrada3: initialData.entrada3 || "",
        saida3: initialData.saida3 || "",
        justificativa: initialData.justificativa || "",
      });
      setManualDays([
        {
          id: String(Date.now()),
          data: initialData.data,
          entrada1: initialData.entrada1 || "",
          saida1: initialData.saida1 || "",
          entrada2: initialData.entrada2 || "",
          saida2: initialData.saida2 || "",
          entrada3: initialData.entrada3 || "",
          saida3: initialData.saida3 || "",
        },
      ]);
    } else {
      setManualData({
        employeeId: initialData?.employeeId || 0,
        obraId: initialData?.obraId || 0,
        data: "",
        entrada1: "",
        saida1: "",
        entrada2: "",
        saida2: "",
        entrada3: "",
        saida3: "",
        justificativa: initialData?.justificativa || "",
      });
      setManualDays([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Geração de dias para mode="mes"
  const gerarDiasUteisDoMes = (fromDay?: number, toDay?: number) => {
    if (!mesAno) return;
    const [y, m] = mesAno.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const start = Math.max(1, fromDay ?? 1);
    const end = Math.min(daysInMonth, toDay ?? daysInMonth);
    const emp = (employeesList.data || []).find((e: any) => e.id === manualData.employeeId);
    const jornada = emp?.jornadaTrabalho || null;
    const dias: ManualDay[] = [];
    const d = new Date(y, m - 1, start);
    while (d.getDate() <= end && d.getMonth() === m - 1) {
      const dow = d.getDay();
      const dateStr = d.toISOString().split("T")[0];
      const isWeekend = dow === 0 || dow === 6;
      if (isWeekend) {
        dias.push({
          id: `${dateStr}-${Math.random()}`,
          data: dateStr,
          entrada1: "",
          saida1: "",
          entrada2: "",
          saida2: "",
          entrada3: "",
          saida3: "",
        });
      } else {
        const sched = getScheduleForDay(jornada, dateStr);
        dias.push({
          id: `${dateStr}-${Math.random()}`,
          data: dateStr,
          ...sched,
          entrada3: "",
          saida3: "",
        });
      }
      d.setDate(d.getDate() + 1);
    }
    setManualDays(dias);
  };

  // Geração de dias para mode="periodo" (intervalo de datas ISO)
  const gerarDiasPorIntervalo = (deISO: string, ateISO: string) => {
    if (!deISO || !ateISO) return;
    const [yi, mi, di] = deISO.split("-").map(Number);
    const [yf, mf, df] = ateISO.split("-").map(Number);
    const start = new Date(yi, mi - 1, di);
    const end = new Date(yf, mf - 1, df);
    if (start > end) {
      toast.error("Data inicial deve ser menor ou igual à data final");
      return;
    }
    // Limite de segurança: 366 dias inclusivos (1 ano bissexto)
    const diffDias = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDias > 366) {
      toast.error("Intervalo não pode exceder 366 dias");
      return;
    }
    const emp = (employeesList.data || []).find((e: any) => e.id === manualData.employeeId);
    const jornada = emp?.jornadaTrabalho || null;
    const dias: ManualDay[] = [];
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const dateStr = `${y}-${mo}-${da}`;
      const isWeekend = dow === 0 || dow === 6;
      if (isWeekend) {
        dias.push({
          id: `${dateStr}-${Math.random()}`,
          data: dateStr,
          entrada1: "",
          saida1: "",
          entrada2: "",
          saida2: "",
          entrada3: "",
          saida3: "",
        });
      } else {
        const sched = getScheduleForDay(jornada, dateStr);
        dias.push({
          id: `${dateStr}-${Math.random()}`,
          data: dateStr,
          ...sched,
          entrada3: "",
          saida3: "",
        });
      }
      d.setDate(d.getDate() + 1);
    }
    setManualDays(dias);
  };

  const saveManualBatch = async () => {
    if (!manualData.employeeId) return toast.error("Selecione o colaborador");
    const filled = manualDays.filter((d) => d.data);
    if (filled.length === 0) return toast.error("Adicione pelo menos um dia");
    setManualSaving(true);
    let saved = 0;
    let errors = 0;
    for (const day of filled) {
      try {
        await manualBatchMut.mutateAsync({
          companyId,
          companyIds,
          employeeId: manualData.employeeId,
          obraId: manualData.obraId || undefined,
          mesReferencia: day.data.substring(0, 7),
          data: day.data,
          entrada1: day.entrada1 || undefined,
          saida1: day.saida1 || undefined,
          entrada2: day.entrada2 || undefined,
          saida2: day.saida2 || undefined,
          entrada3: day.entrada3 || undefined,
          saida3: day.saida3 || undefined,
          justificativa: manualData.justificativa || undefined,
          tipoDia: day.feriado ? "feriado" : "normal",
        } as any);
        saved++;
      } catch {
        errors++;
      }
    }
    setManualSaving(false);
    if (errors === 0) {
      toast.success(`${saved} lançamento(s) salvo(s) com sucesso!`);
      onSaved?.();
      onClose();
    } else {
      toast.warning(`${saved} salvo(s), ${errors} com erro.`);
      onSaved?.();
    }
  };

  const subtitle = useMemo(() => {
    if (mode === "mes") return `Competência: ${mesAno ? formatMesAno(mesAno) : ""}`;
    if (dataInicio && dataFim) return `Período: ${fmtBr(dataInicio)} a ${fmtBr(dataFim)}`;
    return "";
  }, [mode, mesAno, dataInicio, dataFim]);

  const emptyHint = useMemo(() => {
    if (mode === "mes" && mesAno) {
      return `Clique em "Adicionar dia" para inserir um dia, ou "Preencher período" para gerar dias automaticamente de ${formatMesAno(mesAno)} — fins de semana aparecem sem horário.`;
    }
    if (mode === "periodo" && dataInicio && dataFim) {
      return `Clique em "Adicionar dia" para inserir um dia, ou "Preencher período" para gerar dias automaticamente do intervalo ${fmtBr(dataInicio)} a ${fmtBr(dataFim)} — fins de semana aparecem sem horário.`;
    }
    return `Clique em "Adicionar dia" ou "Preencher período" para começar.`;
  }, [mode, mesAno, dataInicio, dataFim]);

  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      title="Lançamento Manual"
      subtitle={subtitle}
      icon={<PenLine className="h-5 w-5 text-white" />}
      headerColor="bg-gradient-to-r from-purple-800 to-purple-600"
    >
      <div className="w-full max-w-5xl">
        <div className="space-y-3">
          <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 text-xs text-purple-800">
            Registros manuais ficam <strong>destacados</strong> e são rastreados. Você pode lançar vários dias de uma vez —
            use <strong>"Preencher período"</strong> para gerar um intervalo de datas {mode === "periodo" ? "(ex.: 16/03 a 15/04)" : "(ex.: 16/03 a 31/03)"} ao invés de adicionar dia a dia.
          </div>
          {isConsolidado && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Mês consolidado.</strong> Você está em modo administrador — os lançamentos serão aceitos apenas em datas <strong>fora de ciclos parciais bloqueados</strong>. Datas dentro de um ciclo consolidado por intervalo continuam protegidas e precisam ser desconsolidadas antes.
              </div>
            </div>
          )}

          {/* Colaborador + Obra */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block">Colaborador</Label>
              <Popover open={manualEmpPopoverOpen} onOpenChange={setManualEmpPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent/10 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <span className={manualData.employeeId ? "text-foreground" : "text-muted-foreground"}>
                      {manualData.employeeId
                        ? (employeesList.data || []).find((e: any) => e.id === manualData.employeeId)?.nomeCompleto || "Colaborador"
                        : "Pesquisar colaborador..."}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                  <Command>
                    <CommandInput placeholder="Digite nome ou função..." />
                    <CommandList className="max-h-64">
                      <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                        Nenhum colaborador encontrado
                      </CommandEmpty>
                      <CommandGroup>
                        {(employeesList.data || []).map((e: any) => (
                          <CommandItem
                            key={e.id}
                            value={`${e.nomeCompleto || ""} ${e.funcao || ""}`}
                            onSelect={() => {
                              setManualData((p) => ({ ...p, employeeId: e.id, obraId: e.obraAtualId || 0 }));
                              setManualEmpPopoverOpen(false);
                              if (e.jornadaTrabalho) {
                                setManualDays((prev) =>
                                  prev.map((d) =>
                                    d.data ? { ...d, ...getScheduleForDay(e.jornadaTrabalho, d.data) } : d,
                                  ),
                                );
                              }
                            }}
                            className="flex items-center justify-between py-2 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${e.status === "Desligado" || e.status === "Lista_Negra" ? "bg-red-100 text-red-700" : "bg-purple-100 text-purple-700"}`}
                              >
                                {(e.nomeCompleto || "").charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium text-sm">
                                  {e.nomeCompleto}
                                  {(e.status === "Desligado" || e.status === "Lista_Negra") && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                      DESLIGADO
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {e.funcao || ""}
                                  {e.obraAtualNome ? <span className="ml-1 text-purple-600">· {e.obraAtualNome}</span> : ""}
                                </p>
                              </div>
                            </div>
                            {manualData.employeeId === e.id && <Check className="h-4 w-4 text-purple-600 shrink-0" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="mb-1 block">Obra (opcional)</Label>
              <Select
                value={String(manualData.obraId || "0")}
                onValueChange={(v) => setManualData((p) => ({ ...p, obraId: v === "0" ? 0 : parseInt(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a obra..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">— Sem obra —</SelectItem>
                  {(obrasList.data || []).map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tabela de dias */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <Label>
                Dias lançados{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  ({manualDays.length} {manualDays.length === 1 ? "dia" : "dias"})
                </span>
              </Label>
              <div className="flex gap-2">
                <Popover open={showRangePopover} onOpenChange={setShowRangePopover}>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                      type="button"
                    >
                      <CalendarDays className="h-3.5 w-3.5" /> Preencher período
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className={mode === "periodo" ? "w-72 p-3" : "w-64 p-3"} align="end">
                    <p className="text-xs font-semibold mb-3 text-foreground">Gerar dias automaticamente</p>
                    {mode === "mes" ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1">
                            <label className="text-[11px] text-muted-foreground mb-1 block">De dia</label>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={rangeFromDay}
                              onChange={(e) => setRangeFromDay(Math.max(1, Math.min(31, Number(e.target.value))))}
                              className="w-full border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                          <span className="text-muted-foreground mt-4">→</span>
                          <div className="flex-1">
                            <label className="text-[11px] text-muted-foreground mb-1 block">Até dia</label>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={rangeToDay}
                              onChange={(e) => setRangeToDay(Math.max(1, Math.min(31, Number(e.target.value))))}
                              className="w-full border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs"
                            type="button"
                            onClick={() => setShowRangePopover(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                            type="button"
                            onClick={() => {
                              gerarDiasUteisDoMes(rangeFromDay, rangeToDay);
                              setShowRangePopover(false);
                            }}
                          >
                            Gerar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex-1">
                            <label className="text-[11px] text-muted-foreground mb-1 block">De</label>
                            <input
                              type="date"
                              value={rangeFromDate}
                              onChange={(e) => setRangeFromDate(e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                          <span className="text-muted-foreground mt-4">→</span>
                          <div className="flex-1">
                            <label className="text-[11px] text-muted-foreground mb-1 block">Até</label>
                            <input
                              type="date"
                              value={rangeToDate}
                              onChange={(e) => setRangeToDate(e.target.value)}
                              className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-2">
                          Dica: o período já vem preenchido com o filtro atual. Você pode alterar antes de gerar.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs"
                            type="button"
                            onClick={() => setShowRangePopover(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                            type="button"
                            onClick={() => {
                              if (!rangeFromDate || !rangeToDate) {
                                toast.error("Informe data inicial e final");
                                return;
                              }
                              gerarDiasPorIntervalo(rangeFromDate, rangeToDate);
                              setShowRangePopover(false);
                            }}
                          >
                            Gerar
                          </Button>
                        </div>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1"
                  onClick={() =>
                    setManualDays((p) => [
                      ...p,
                      {
                        id: String(Date.now()),
                        data: "",
                        entrada1: "",
                        saida1: "",
                        entrada2: "",
                        saida2: "",
                        entrada3: "",
                        saida3: "",
                      },
                    ])
                  }
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar dia
                </Button>
              </div>
            </div>

            {manualDays.length === 0 ? (
              <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground bg-muted/20">
                {emptyHint}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div>
                  <table className="text-sm w-full table-fixed">
                    <colgroup>
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "38px" }} />
                      <col style={{ width: "76px" }} />
                      <col style={{ width: "76px" }} />
                      <col style={{ width: "76px" }} />
                      <col style={{ width: "76px" }} />
                      <col style={{ width: "76px" }} />
                      <col style={{ width: "76px" }} />
                      <col style={{ width: "48px" }} />
                      <col style={{ width: "42px" }} />
                      <col style={{ width: "24px" }} />
                    </colgroup>
                    <thead className="bg-muted/40 sticky top-0 z-10">
                      <tr>
                        <th className="px-0.5 py-1 text-left font-medium text-[11px]">Data</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px] text-muted-foreground">Dia</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px]">Entrada</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px]">Saída Int.</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px]">Retorno</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px]">Saída</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px] text-blue-600">Ent.HE</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px] text-blue-600">Saí.HE</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px] text-red-600">Falta</th>
                        <th className="px-0.5 py-1 text-center font-medium text-[11px] text-orange-600">Fer.</th>
                        <th className="px-0.5 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const selectedEmp = (employeesList.data || []).find((em: any) => em.id === manualData.employeeId);
                        const atestadoSet = new Set<string>();
                        for (const a of atestados) {
                          if (a.employeeId !== manualData.employeeId) continue;
                          const afTipo = a.afastamentoTipo || "dia";
                          if (afTipo === "horas") {
                            atestadoSet.add(a.dataEmissao);
                          } else {
                            const dias = a.diasAfastamento || 1;
                            const sd = new Date(a.dataEmissao + "T12:00:00Z");
                            for (let d = 0; d < dias; d++) {
                              const dt = new Date(sd);
                              dt.setUTCDate(sd.getUTCDate() + d);
                              atestadoSet.add(dt.toISOString().substring(0, 10));
                            }
                          }
                        }
                        return manualDays.map((day, idx) => {
                          const dow = day.data
                            ? ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][new Date(day.data + "T12:00:00").getDay()]
                            : "";
                          const dowNum = day.data ? new Date(day.data + "T12:00:00").getDay() : -1;
                          const isWeekend = [0, 6].includes(dowNum);
                          const isFeriadoMarcado = !!day.feriado;
                          const isRed = isWeekend || isFeriadoMarcado;
                          const isAtestado = !!(day.data && atestadoSet.has(day.data));
                          const isFaltaMarcada = !!(
                            day.data &&
                            !isWeekend &&
                            !isFeriadoMarcado &&
                            !isAtestado &&
                            !day.entrada1 &&
                            !day.saida1 &&
                            !day.entrada2 &&
                            !day.saida2
                          );
                          const sched =
                            selectedEmp?.jornadaTrabalho && day.data
                              ? getScheduleForDay(selectedEmp.jornadaTrabalho, day.data)
                              : null;
                          const schedHasTimes = !!(sched?.entrada1 && sched?.saida2);
                          const hasAnyTime = !!(day.entrada1 || day.saida1 || day.entrada2 || day.saida2);
                          const isOnSchedule =
                            !isRed &&
                            !isFaltaMarcada &&
                            hasAnyTime &&
                            schedHasTimes &&
                            day.entrada1 === sched!.entrada1 &&
                            day.saida1 === sched!.saida1 &&
                            day.entrada2 === sched!.entrada2 &&
                            day.saida2 === sched!.saida2;
                          const toMins = (t: string) => {
                            if (!t) return 0;
                            const [h, m] = t.split(":").map(Number);
                            return (h || 0) * 60 + (m || 0);
                          };
                          const workedMins =
                            (day.entrada1 && day.saida1 ? toMins(day.saida1) - toMins(day.entrada1) : 0) +
                            (day.entrada2 && day.saida2 ? toMins(day.saida2) - toMins(day.entrada2) : 0);
                          const schedMins = schedHasTimes
                            ? (sched!.entrada1 && sched!.saida1 ? toMins(sched!.saida1) - toMins(sched!.entrada1) : 0) +
                              (sched!.entrada2 && sched!.saida2 ? toMins(sched!.saida2) - toMins(sched!.entrada2) : 0)
                            : 0;
                          const isHorasExtras =
                            !isRed &&
                            !isFaltaMarcada &&
                            !isAtestado &&
                            !isOnSchedule &&
                            hasAnyTime &&
                            schedHasTimes &&
                            workedMins > schedMins &&
                            workedMins > 0;
                          const isOffSchedule =
                            !isRed &&
                            !isFaltaMarcada &&
                            !isAtestado &&
                            hasAnyTime &&
                            schedHasTimes &&
                            !isOnSchedule &&
                            !isHorasExtras;
                          const rowBg = isAtestado
                            ? "bg-purple-100/70"
                            : isFaltaMarcada
                              ? "bg-red-100/70"
                              : isRed
                                ? "bg-red-50/60"
                                : isOnSchedule
                                  ? "bg-green-50/80"
                                  : isHorasExtras
                                    ? "bg-blue-50/80"
                                    : isOffSchedule
                                      ? "bg-amber-50/80"
                                      : idx % 2 === 0
                                        ? ""
                                        : "bg-muted/10";
                          return (
                            <tr key={day.id} className={`border-t ${rowBg}`}>
                              <td className="px-0.5 py-0.5">
                                <Input
                                  type="date"
                                  value={day.data}
                                  className="h-7 text-[11px]"
                                  style={{ width: "100%", paddingLeft: 4, paddingRight: 1 }}
                                  onChange={(e) => {
                                    const newDate = e.target.value;
                                    const emp = (employeesList.data || []).find(
                                      (em: any) => em.id === manualData.employeeId,
                                    );
                                    const sc =
                                      newDate && emp?.jornadaTrabalho
                                        ? getScheduleForDay(emp.jornadaTrabalho, newDate)
                                        : null;
                                    setManualDays((p) =>
                                      p.map((d) =>
                                        d.id === day.id
                                          ? {
                                              ...d,
                                              data: newDate,
                                              entrada1: d.entrada1 || sc?.entrada1 || "",
                                              saida1: d.saida1 || sc?.saida1 || "",
                                              entrada2: d.entrada2 || sc?.entrada2 || "",
                                              saida2: d.saida2 || sc?.saida2 || "",
                                            }
                                          : d,
                                      ),
                                    );
                                  }}
                                />
                              </td>
                              <td className="px-0.5 py-0.5 text-center">
                                <div className="flex flex-col items-center leading-none">
                                  <span
                                    className={`text-[11px] font-bold ${
                                      isAtestado
                                        ? "text-purple-700"
                                        : isRed || isFaltaMarcada
                                          ? "text-red-600"
                                          : isOnSchedule
                                            ? "text-green-700"
                                            : isHorasExtras
                                              ? "text-blue-700"
                                              : isOffSchedule
                                                ? "text-amber-700"
                                                : "text-muted-foreground"
                                    }`}
                                  >
                                    {dow}
                                  </span>
                                  {isFeriadoMarcado && <span className="text-[8px] text-orange-600 font-bold leading-none">fer.</span>}
                                  {isAtestado && <span className="text-[8px] text-purple-700 font-bold leading-none">ATESTADO</span>}
                                  {isFaltaMarcada && <span className="text-[8px] text-red-700 font-bold leading-none">FALTA</span>}
                                  {isOnSchedule && <span className="text-[8px] text-green-700 font-bold leading-none">✓OK</span>}
                                  {isHorasExtras && <span className="text-[8px] text-blue-700 font-bold leading-none">HE</span>}
                                  {isOffSchedule && <span className="text-[8px] text-amber-700 font-bold leading-none">DIF</span>}
                                </div>
                              </td>
                              <td className="px-0.5 py-0.5">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="--:--"
                                  value={day.entrada1}
                                  className={`h-6 text-[11px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`}
                                  style={{ width: "100%", paddingLeft: 3, paddingRight: 1 }}
                                  onChange={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, entrada1: maskTimeValue(e.target.value) } : d)),
                                    )
                                  }
                                  onBlur={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, entrada1: normalizeTimeOnBlur(e.target.value) } : d)),
                                    )
                                  }
                                />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="--:--"
                                  value={day.saida1}
                                  className={`h-6 text-[11px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`}
                                  style={{ width: "100%", paddingLeft: 3, paddingRight: 1 }}
                                  onChange={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, saida1: maskTimeValue(e.target.value) } : d)),
                                    )
                                  }
                                  onBlur={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, saida1: normalizeTimeOnBlur(e.target.value) } : d)),
                                    )
                                  }
                                />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="--:--"
                                  value={day.entrada2}
                                  className={`h-6 text-[11px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`}
                                  style={{ width: "100%", paddingLeft: 3, paddingRight: 1 }}
                                  onChange={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, entrada2: maskTimeValue(e.target.value) } : d)),
                                    )
                                  }
                                  onBlur={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, entrada2: normalizeTimeOnBlur(e.target.value) } : d)),
                                    )
                                  }
                                />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="--:--"
                                  value={day.saida2}
                                  className={`h-6 text-[11px] font-mono ${isFaltaMarcada ? "opacity-40" : ""}`}
                                  style={{ width: "100%", paddingLeft: 3, paddingRight: 1 }}
                                  onChange={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, saida2: maskTimeValue(e.target.value) } : d)),
                                    )
                                  }
                                  onBlur={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, saida2: normalizeTimeOnBlur(e.target.value) } : d)),
                                    )
                                  }
                                />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="--:--"
                                  value={day.entrada3 || ""}
                                  className={`h-6 text-[11px] font-mono border-blue-200 ${isFaltaMarcada ? "opacity-40" : ""}`}
                                  style={{ width: "100%", paddingLeft: 3, paddingRight: 1 }}
                                  onChange={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, entrada3: maskTimeValue(e.target.value) } : d)),
                                    )
                                  }
                                  onBlur={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, entrada3: normalizeTimeOnBlur(e.target.value) } : d)),
                                    )
                                  }
                                />
                              </td>
                              <td className="px-0.5 py-0.5">
                                <Input
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={5}
                                  placeholder="--:--"
                                  value={day.saida3 || ""}
                                  className={`h-6 text-[11px] font-mono border-blue-200 ${isFaltaMarcada ? "opacity-40" : ""}`}
                                  style={{ width: "100%", paddingLeft: 3, paddingRight: 1 }}
                                  onChange={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, saida3: maskTimeValue(e.target.value) } : d)),
                                    )
                                  }
                                  onBlur={(e) =>
                                    setManualDays((p) =>
                                      p.map((d) => (d.id === day.id ? { ...d, saida3: normalizeTimeOnBlur(e.target.value) } : d)),
                                    )
                                  }
                                />
                              </td>
                              <td className="px-0.5 py-0.5 text-center">
                                <button
                                  type="button"
                                  title={isFaltaMarcada ? "Desfazer falta" : "Marcar como falta"}
                                  onClick={() => {
                                    if (isFaltaMarcada) {
                                      const emp = (employeesList.data || []).find(
                                        (em: any) => em.id === manualData.employeeId,
                                      );
                                      const sc =
                                        day.data && emp?.jornadaTrabalho
                                          ? getScheduleForDay(emp.jornadaTrabalho, day.data)
                                          : null;
                                      setManualDays((p) =>
                                        p.map((d) =>
                                          d.id === day.id
                                            ? {
                                                ...d,
                                                entrada1: sc?.entrada1 || "",
                                                saida1: sc?.saida1 || "",
                                                entrada2: sc?.entrada2 || "",
                                                saida2: sc?.saida2 || "",
                                                entrada3: "",
                                                saida3: "",
                                              }
                                            : d,
                                        ),
                                      );
                                    } else {
                                      setManualDays((p) =>
                                        p.map((d) =>
                                          d.id === day.id
                                            ? {
                                                ...d,
                                                entrada1: "",
                                                saida1: "",
                                                entrada2: "",
                                                saida2: "",
                                                entrada3: "",
                                                saida3: "",
                                              }
                                            : d,
                                        ),
                                      );
                                    }
                                  }}
                                  className={`text-[10px] font-semibold px-1 py-0.5 rounded transition-colors ${
                                    isFaltaMarcada
                                      ? "bg-red-600 text-white hover:bg-red-700"
                                      : "bg-red-100 text-red-700 hover:bg-red-200"
                                  }`}
                                >
                                  {isFaltaMarcada ? "✕" : "F"}
                                </button>
                              </td>
                              <td className="px-0.5 py-0.5 text-center">
                                <button
                                  type="button"
                                  title={isFeriadoMarcado ? "Desmarcar feriado" : "Marcar como feriado"}
                                  onClick={() => {
                                    if (isFeriadoMarcado) {
                                      const emp = (employeesList.data || []).find(
                                        (em: any) => em.id === manualData.employeeId,
                                      );
                                      const sc =
                                        day.data && emp?.jornadaTrabalho
                                          ? getScheduleForDay(emp.jornadaTrabalho, day.data)
                                          : null;
                                      setManualDays((p) =>
                                        p.map((d) =>
                                          d.id === day.id
                                            ? {
                                                ...d,
                                                feriado: false,
                                                entrada1: sc?.entrada1 || "",
                                                saida1: sc?.saida1 || "",
                                                entrada2: sc?.entrada2 || "",
                                                saida2: sc?.saida2 || "",
                                                entrada3: "",
                                                saida3: "",
                                              }
                                            : d,
                                        ),
                                      );
                                    } else {
                                      setManualDays((p) =>
                                        p.map((d) =>
                                          d.id === day.id
                                            ? {
                                                ...d,
                                                feriado: true,
                                                entrada1: "",
                                                saida1: "",
                                                entrada2: "",
                                                saida2: "",
                                                entrada3: "",
                                                saida3: "",
                                              }
                                            : d,
                                        ),
                                      );
                                    }
                                  }}
                                  className={`text-[10px] font-semibold px-1 py-0.5 rounded transition-colors ${
                                    isFeriadoMarcado
                                      ? "bg-orange-500 text-white hover:bg-orange-600"
                                      : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                                  }`}
                                >
                                  {isFeriadoMarcado ? "✕" : "F"}
                                </button>
                              </td>
                              <td className="px-0.5 py-0.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setManualDays((p) => p.filter((d) => d.id !== day.id))}
                                  className="text-muted-foreground hover:text-red-500 transition-colors"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Justificativa */}
          <div>
            <Label className="mb-0.5 block text-xs">
              Justificativa <span className="text-muted-foreground font-normal">(aplica-se a todos os dias)</span>
            </Label>
            <Textarea
              value={manualData.justificativa}
              onChange={(e) => setManualData((p) => ({ ...p, justificativa: e.target.value }))}
              placeholder="Motivo do lançamento manual..."
              rows={1}
              className="text-xs resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-3 pt-3 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={saveManualBatch} disabled={manualSaving} className="bg-[#1B2A4A] hover:bg-[#243660] gap-2">
            {manualSaving
              ? "Salvando..."
              : `Salvar ${manualDays.filter((d) => d.data).length > 1 ? manualDays.filter((d) => d.data).length + " lançamentos" : "lançamento"}`}
          </Button>
        </div>
      </div>
    </FullScreenDialog>
  );
}
