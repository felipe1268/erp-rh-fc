import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Plus, Building2,
  FileText, Clock, CheckCircle2, ReceiptText, Send, ThumbsUp, AlertCircle,
  TrendingUp, Wallet, BadgeCheck, CalendarClock,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function BRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_CHAVE = (ano: number) =>
  Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);

// ─── Status ───────────────────────────────────────────────────────────────────

type StatusKey =
  | "pendente" | "a_faturar" | "medicao_enviada" | "aprovada_parcial"
  | "faturado" | "a_receber" | "recebido_parcial" | "recebido_total"
  | "cancelado";

const STATUS_CFG: Record<string, { label: string; cell: string; badge: string; icon: any }> = {
  previsto:         { label: "Previsto",       cell: "bg-indigo-50 text-indigo-500",  badge: "bg-indigo-100 text-indigo-600",icon: CalendarClock },
  pendente:         { label: "Pendente",       cell: "bg-gray-50 text-gray-500",      badge: "bg-gray-100 text-gray-500",    icon: Clock },
  a_faturar:        { label: "A Faturar",      cell: "bg-amber-50 text-amber-700",    badge: "bg-amber-100 text-amber-700",  icon: Clock },
  medicao_enviada:  { label: "Med. Enviada",   cell: "bg-sky-50 text-sky-700",        badge: "bg-sky-100 text-sky-700",      icon: Send },
  aprovada_parcial: { label: "Aprov. Parcial", cell: "bg-orange-50 text-orange-700",  badge: "bg-orange-100 text-orange-700",icon: ThumbsUp },
  faturado:         { label: "Faturado",       cell: "bg-blue-50 text-blue-700",      badge: "bg-blue-100 text-blue-700",    icon: FileText },
  a_receber:        { label: "A Receber",      cell: "bg-purple-50 text-purple-700",  badge: "bg-purple-100 text-purple-700",icon: ReceiptText },
  recebido_parcial: { label: "Parc. Recebido", cell: "bg-teal-50 text-teal-700",      badge: "bg-teal-100 text-teal-700",    icon: CheckCircle2 },
  recebido_total:   { label: "Recebido",       cell: "bg-green-50 text-green-700",    badge: "bg-green-100 text-green-700",  icon: BadgeCheck },
  cancelado:        { label: "Cancelado",      cell: "bg-gray-50 text-gray-300",      badge: "bg-gray-100 text-gray-400",    icon: AlertCircle },
};

const STATUS_NEXT: Record<string, string> = {
  a_faturar: "medicao_enviada",
  medicao_enviada: "aprovada_parcial",
  aprovada_parcial: "faturado",
  faturado: "a_receber",
  a_receber: "recebido_total",
  recebido_parcial: "recebido_total",
};

function resolveStatus(m: MedicaoCell): string {
  if (m.statusFinanceiro && m.statusFinanceiro !== "previsto") return m.statusFinanceiro;
  if (m.statusMedicao === "previsto") return "previsto";
  if (m.statusMedicao === "aprovada" || m.statusMedicao === "faturada") return "faturado";
  if (m.valor > 0 && m.statusMedicao !== "previsto") return "a_faturar";
  if (m.valor > 0) return "previsto";
  return "pendente";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MedicaoCell {
  id: number;
  competencia: string;
  numero: number;
  valorPrevisto: number;
  valorMedido: number;
  percentualPrevisto: number;
  percentualMedido: number;
  statusMedicao: string;
  statusFinanceiro: string | null;
  frId: number | null;
  nfNumero: string | null;
  dataVencimento: string | null;
  dataRecebimento: string | null;
  valorRecebido: number;
  valor: number;
}

interface ObraRow {
  projetoId: number;
  obraId: number | null;
  obraNome: string;
  cliente: string;
  valorContrato: number;
  medicoes: MedicaoCell[];
  byMes: Record<string, MedicaoCell>;
  totalAno: number;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroContasAReceber() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [showNew, setShowNew] = useState(false);
  const [detalhe, setDetalhe] = useState<{ obra: ObraRow; mes: string; cell: MedicaoCell } | null>(null);

  // ─── Query ─────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = (trpc as any).financial.getContasReceberMatrix.useQuery(
    { companyId, ano },
    { enabled: !!companyId, staleTime: 30_000 }
  );

  const mesesChave = MESES_CHAVE(ano);

  // Monta linhas com índice por mês — usa meses calculados (previsto das atividades)
  // sobrepostos por medições salvas onde existem
  const obras: ObraRow[] = (data?.projetos ?? []).map((p: any) => {
    const byMes: Record<string, MedicaoCell> = {};
    // Nova estrutura: p.meses é um mapa competencia → {valorPrevisto, valorMedido, status, ...}
    for (const [mes, raw] of Object.entries(p.meses ?? {})) {
      const r = raw as any;
      const valorDisplay = r.valorMedido > 0 ? r.valorMedido : r.valorPrevisto;
      if (valorDisplay === 0) continue;
      byMes[mes] = {
        id: r.medicaoId ?? 0,
        competencia: mes,
        numero: 0,
        valorPrevisto: r.valorPrevisto,
        valorMedido: r.valorMedido,
        percentualPrevisto: 0,
        percentualMedido: 0,
        statusMedicao: r.status ?? "previsto",
        statusFinanceiro: (r.status && r.status !== "previsto") ? r.status : null,
        frId: r.frId ?? null,
        nfNumero: r.nfNumero ?? null,
        dataVencimento: r.dataVencimento ?? null,
        dataRecebimento: r.dataRecebimento ?? null,
        valorRecebido: r.valorRecebido ?? 0,
        valor: valorDisplay,
      };
    }
    const totalAno = Object.values(byMes).reduce((s: number, c: any) => s + (c as MedicaoCell).valor, 0);
    return { ...p, byMes, totalAno } as ObraRow;
  });

  const kpis = data?.kpis ?? { totalContrato: 0, totalPrevisto: 0, totalFaturado: 0, totalRecebido: 0 };
  const totaisMes: Record<string, number> = data?.totaisMes ?? {};

  // Mutations
  const updateMut = (trpc as any).financial.updateRevenueStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); setDetalhe(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const createMut = (trpc as any).financial.createRevenue.useMutation({
    onSuccess: () => { toast({ title: "Medição criada!" }); setShowNew(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ─── KPI Cards ─────────────────────────────────────────────────────────────
  const aReceber = kpis.totalPrevisto - kpis.totalRecebido;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contas a Receber</h1>
            <p className="text-xs text-gray-400 mt-0.5">Espelho do cronograma financeiro · atualizado automaticamente</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Navegação de ano */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
              <button onClick={() => setAno(a => a - 1)} className="p-1 hover:bg-white rounded transition-colors">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-sm font-semibold text-gray-800 w-12 text-center">{ano}</span>
              <button onClick={() => setAno(a => a + 1)} className="p-1 hover:bg-white rounded transition-colors">
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white h-9">
              <Plus className="w-4 h-4 mr-1.5" />Nova Medição
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard icon={Wallet}        label="Total Contratos"  value={BRL(kpis.totalContrato)}  color="text-gray-700"   bg="bg-gray-50" />
          <KpiCard icon={CalendarClock} label="Previsto no Ano"  value={BRL(kpis.totalPrevisto)}  color="text-blue-700"   bg="bg-blue-50" />
          <KpiCard icon={TrendingUp}    label="Já Faturado"      value={BRL(kpis.totalFaturado)}  color="text-purple-700" bg="bg-purple-50" />
          <KpiCard icon={CheckCircle2}  label="Recebido"         value={BRL(kpis.totalRecebido)}  color="text-green-700"  bg="bg-green-50"
            sub={aReceber > 0 ? `A receber: ${BRL(aReceber)}` : undefined} />
        </div>

        {/* Matriz */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-16 text-center text-gray-400 text-sm">Carregando cronograma...</div>
          ) : obras.length === 0 ? (
            <div className="p-16 text-center">
              <Building2 className="w-9 h-9 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">Nenhum projeto encontrado para {ano}</p>
              <p className="text-gray-400 text-xs mt-1">Cadastre o cronograma financeiro no módulo de Planejamento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#1e2d40] text-white">
                    <th className="sticky left-0 z-10 bg-[#1e2d40] px-4 py-3 text-left text-xs font-semibold min-w-[200px]">
                      Obra / Cliente
                    </th>
                    {mesesChave.map((mk, i) => (
                      <th key={mk} className="px-2 py-3 text-center text-xs font-semibold min-w-[110px]">
                        {MESES_CURTOS[i]}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right text-xs font-semibold min-w-[120px] bg-[#162130]">
                      Total Ano
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {obras.map((obra, idx) => (
                    <ObraTableRow
                      key={obra.projetoId}
                      obra={obra}
                      mesesChave={mesesChave}
                      zebra={idx % 2 === 0}
                      onCellClick={(mes, cell) => setDetalhe({ obra, mes, cell })}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1e2d40] text-white font-semibold">
                    <td className="sticky left-0 z-10 bg-[#1e2d40] px-4 py-3 text-xs">TOTAL</td>
                    {mesesChave.map(mk => (
                      <td key={mk} className="px-2 py-3 text-center text-xs">
                        {totaisMes[mk] ? BRL(totaisMes[mk]) : <span className="text-gray-500">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right text-xs bg-[#162130]">
                      {BRL(obras.reduce((s, o) => s + o.totalAno, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Legenda */}
        {obras.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span className="font-medium">Legenda:</span>
            {(["previsto","a_faturar","faturado","a_receber","recebido_total"] as any[]).map((s: any) => {
              const cfg = STATUS_CFG[s];
              const Icon = cfg.icon;
              return (
                <span key={s} className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${cfg.badge}`}>
                  <Icon className="w-3 h-3" />{cfg.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Painel de Detalhe */}
      {detalhe && (
        <DetalhePanel
          obra={detalhe.obra}
          mes={detalhe.mes}
          cell={detalhe.cell}
          onClose={() => setDetalhe(null)}
          onUpdateStatus={(frId, status, obs) =>
            updateMut.mutate({ id: frId, status, observacoes: obs })
          }
          isPending={updateMut.isPending}
        />
      )}

      {/* Modal Nova Medição */}
      {showNew && (
        <NovaMedicaoModal
          companyId={companyId}
          obras={obras}
          onClose={() => setShowNew(false)}
          onSave={(d) => createMut.mutate(d)}
          isPending={createMut.isPending}
        />
      )}
    </DashboardLayout>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, color, bg, sub }: {
  icon: any; label: string; value: string; color: string; bg: string; sub?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-100 p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ObraTableRow({ obra, mesesChave, zebra, onCellClick }: {
  obra: ObraRow;
  mesesChave: string[];
  zebra: boolean;
  onCellClick: (mes: string, cell: MedicaoCell) => void;
}) {
  const rowBg = zebra ? "bg-white" : "bg-gray-50/50";
  return (
    <tr className={`border-b border-gray-100 hover:bg-blue-50/20 transition-colors ${rowBg}`}>
      {/* Obra */}
      <td className={`sticky left-0 z-10 px-4 py-2.5 ${rowBg}`}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate max-w-[150px]">{obra.obraNome}</p>
            <p className="text-xs text-gray-400 truncate max-w-[150px]">{obra.cliente || "—"}</p>
          </div>
        </div>
      </td>

      {/* Células por mês */}
      {mesesChave.map(mk => {
        const cell = obra.byMes[mk];
        if (!cell || cell.valor === 0) {
          return (
            <td key={mk} className="px-2 py-2.5 text-center">
              <span className="text-gray-200 text-xs">—</span>
            </td>
          );
        }
        const status = resolveStatus(cell);
        const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
        const Icon = cfg.icon;
        return (
          <td key={mk} className="px-1 py-1.5 text-center">
            <button
              onClick={() => onCellClick(mk, cell)}
              className={`w-full rounded-lg px-2 py-1.5 text-xs font-medium transition-all hover:ring-2 hover:ring-blue-300 cursor-pointer ${cfg.cell}`}
            >
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <Icon className="w-3 h-3 shrink-0" />
                <span className="text-[10px] leading-none">{cfg.label}</span>
              </div>
              <p className="font-bold text-xs">{BRL(cell.valor)}</p>
              {cell.percentualPrevisto > 0 && (
                <p className="text-[9px] opacity-70">{(cell.percentualPrevisto * 100).toFixed(1)}%</p>
              )}
            </button>
          </td>
        );
      })}

      {/* Total obra */}
      <td className="px-3 py-2.5 text-right bg-gray-50 border-l border-gray-100">
        <p className="text-xs font-bold text-gray-700">{BRL(obra.totalAno)}</p>
        {obra.valorContrato > 0 && (
          <p className="text-[10px] text-gray-400">
            {((obra.totalAno / obra.valorContrato) * 100).toFixed(0)}% contrato
          </p>
        )}
      </td>
    </tr>
  );
}

// ─── Painel de Detalhe ───────────────────────────────────────────────────────

function DetalhePanel({ obra, mes, cell, onClose, onUpdateStatus, isPending }: {
  obra: ObraRow; mes: string; cell: MedicaoCell;
  onClose: () => void;
  onUpdateStatus: (frId: number, status: string, obs: string) => void;
  isPending: boolean;
}) {
  const [obs, setObs] = useState("");
  const status = resolveStatus(cell);
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pendente;
  const Icon = cfg.icon;
  const nextStatus = STATUS_NEXT[status];
  const [mesIdx, anoStr] = [parseInt(mes.slice(5, 7)) - 1, mes.slice(0, 4)];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[400px] h-full bg-white shadow-2xl border-l border-gray-200 overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400">{MESES_CURTOS[mesIdx]} {anoStr}</p>
              <h3 className="text-base font-bold text-gray-900 mt-0.5">{obra.obraNome}</h3>
              <p className="text-xs text-gray-500">{obra.cliente}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg font-bold">×</button>
          </div>

          {/* Status atual */}
          <div className={`rounded-xl p-4 ${cfg.cell}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4" />
              <span className="text-xs font-semibold">{cfg.label}</span>
            </div>
            <p className="text-2xl font-bold">{BRL(cell.valor)}</p>
            <p className="text-xs opacity-70 mt-0.5">
              Medição #{cell.numero} · {(cell.percentualPrevisto * 100).toFixed(1)}% do contrato
            </p>
          </div>

          {/* Detalhes */}
          <div className="space-y-2 text-sm">
            <Row label="Valor Previsto"  value={BRL(cell.valorPrevisto)} />
            <Row label="Valor Medido"    value={cell.valorMedido > 0 ? BRL(cell.valorMedido) : "—"} />
            <Row label="NF"              value={cell.nfNumero || "Não emitida"} />
            <Row label="Vencimento"      value={cell.dataVencimento ? fmtDate(cell.dataVencimento) : "—"} />
            <Row label="Recebimento"     value={cell.dataRecebimento ? fmtDate(cell.dataRecebimento) : "—"} />
            {cell.valorRecebido > 0 && (
              <Row label="Valor Recebido" value={BRL(cell.valorRecebido)} />
            )}
          </div>

          {/* Ação de avanço de status */}
          {cell.frId && nextStatus && (
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <Label className="text-xs text-gray-500">Observação (opcional)</Label>
              <Textarea
                value={obs}
                onChange={e => setObs(e.target.value)}
                rows={2}
                placeholder="Informe observações se necessário..."
                className="text-sm"
              />
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isPending}
                onClick={() => onUpdateStatus(cell.frId!, nextStatus, obs)}
              >
                Avançar para {STATUS_CFG[nextStatus]?.label}
              </Button>
            </div>
          )}
          {!cell.frId && (
            <p className="text-xs text-gray-400 text-center pt-2">
              Esta medição ainda não possui lançamento financeiro.
              Será criada automaticamente na próxima sincronização.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  );
}

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

// ─── Modal Nova Medição ───────────────────────────────────────────────────────

function NovaMedicaoModal({ companyId, obras, onClose, onSave, isPending }: {
  companyId: number;
  obras: ObraRow[];
  onClose: () => void;
  onSave: (d: any) => void;
  isPending: boolean;
}) {
  const hoje = new Date();
  const [form, setForm] = useState({
    obraId: obras[0]?.obraId ?? 0,
    obraNome: obras[0]?.obraNome ?? "",
    clienteNome: obras[0]?.cliente ?? "",
    valorContrato: obras[0]?.valorContrato ?? 0,
    medicaoNumero: 1,
    valorMedicao: "",
    dataVencimento: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-28`,
    observacoes: "",
  });

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function handleObraChange(projetoId: string) {
    const obra = obras.find(o => String(o.projetoId) === projetoId);
    if (obra) {
      set("obraId", obra.obraId ?? 0);
      set("obraNome", obra.obraNome);
      set("clienteNome", obra.cliente);
      set("valorContrato", obra.valorContrato);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova Medição Manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Obra</Label>
            <Select onValueChange={handleObraChange} defaultValue={String(obras[0]?.projetoId)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {obras.map(o => (
                  <SelectItem key={o.projetoId} value={String(o.projetoId)}>{o.obraNome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nº Medição</Label>
              <Input type="number" value={form.medicaoNumero} className="mt-1"
                onChange={e => set("medicaoNumero", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input type="number" value={form.valorMedicao} className="mt-1" placeholder="0,00"
                onChange={e => set("valorMedicao", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Data de Vencimento</Label>
            <Input type="date" value={form.dataVencimento} className="mt-1"
              onChange={e => set("dataVencimento", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.observacoes} rows={2} className="mt-1"
              onChange={e => set("observacoes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={isPending || !form.valorMedicao} className="bg-blue-600 text-white"
            onClick={() => onSave({
              companyId,
              obraId: form.obraId,
              obraNome: form.obraNome,
              clienteNome: form.clienteNome,
              valorContrato: form.valorContrato,
              medicaoNumero: form.medicaoNumero,
              valorMedicao: Number(form.valorMedicao),
              dataVencimento: form.dataVencimento,
              observacoes: form.observacoes || null,
              status: "a_faturar",
            })}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
