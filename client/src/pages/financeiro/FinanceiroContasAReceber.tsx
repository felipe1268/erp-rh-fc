import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Plus, Building2,
  FileText, Clock, CheckCircle2, ReceiptText, Send, ThumbsUp, AlertCircle,
  TrendingUp, Wallet, BadgeCheck, CalendarClock, DollarSign, ChevronDown, ChevronUp,
  Pencil, Trash2, AlertTriangle, ArrowRight,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function BRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function parseBRL(s: string): number {
  const clean = s.replace(/[R$\s.]/g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

function formatBRLInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const commaIdx = cleaned.indexOf(",");
  let intPart = commaIdx >= 0 ? cleaned.slice(0, commaIdx) : cleaned;
  const decPart = commaIdx >= 0 ? cleaned.slice(commaIdx + 1, commaIdx + 3) : null;
  intPart = intPart.replace(/^0+(\d)/, "$1");
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart !== null ? `${intPart},${decPart}` : intPart;
}

const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_CHAVE = (ano: number) =>
  Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);

const FORMAS_PAGAMENTO = ["PIX","TED","Boleto","Cheque","Dinheiro","Cartão","Outro"];

// ─── Status ───────────────────────────────────────────────────────────────────

type StatusKey =
  | "pendente" | "a_faturar" | "medicao_enviada" | "aprovada_parcial"
  | "faturado" | "a_receber" | "recebido_parcial" | "recebido_total"
  | "cancelado";

const STATUS_CFG: Record<string, { label: string; cell: string; badge: string; icon: any }> = {
  previsto:              { label: "Previsto",         cell: "bg-indigo-50 text-indigo-500",  badge: "bg-indigo-100 text-indigo-600", icon: CalendarClock },
  previsao_faturamento:  { label: "Prev. Faturamento",cell: "bg-orange-50 text-orange-600",  badge: "bg-orange-100 text-orange-600", icon: TrendingUp },
  pendente:              { label: "Pendente",         cell: "bg-gray-50 text-gray-500",      badge: "bg-gray-100 text-gray-500",     icon: Clock },
  a_faturar:             { label: "A Faturar",        cell: "bg-amber-50 text-amber-700",    badge: "bg-amber-100 text-amber-700",   icon: Clock },
  medicao_enviada:       { label: "Med. Enviada",     cell: "bg-sky-50 text-sky-700",        badge: "bg-sky-100 text-sky-700",       icon: Send },
  aprovada_parcial:      { label: "Aprov. Parcial",   cell: "bg-orange-50 text-orange-700",  badge: "bg-orange-100 text-orange-700", icon: ThumbsUp },
  faturado:              { label: "Faturado",         cell: "bg-blue-50 text-blue-700",      badge: "bg-blue-100 text-blue-700",     icon: FileText },
  a_receber:             { label: "A Receber",        cell: "bg-purple-50 text-purple-700",  badge: "bg-purple-100 text-purple-700", icon: ReceiptText },
  recebido_parcial:      { label: "Parc. Recebido",   cell: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-300", badge: "bg-amber-100 text-amber-700", icon: AlertTriangle },
  recebido_total:        { label: "Recebido",         cell: "bg-green-50 text-green-700",    badge: "bg-green-100 text-green-700",   icon: BadgeCheck },
  cancelado:             { label: "Cancelado",        cell: "bg-gray-50 text-gray-300",      badge: "bg-gray-100 text-gray-400",     icon: AlertCircle },
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
  // Camada 4: Recebido
  if (m.statusFinanceiro && ["recebido_total","recebido_parcial"].includes(m.statusFinanceiro)) {
    // Detecta recebimento parcial: valor recebido menor que o previsto
    if (m.valorRecebido > 0 && m.valorRecebido < m.valor - 0.01) return "recebido_parcial";
    return "recebido_total";
  }
  // Camada 3: Faturado / A Receber
  if (m.statusFinanceiro && m.statusFinanceiro !== "previsto" && m.statusFinanceiro !== "previsao_faturamento") return m.statusFinanceiro;
  if (m.statusMedicao === "aprovada" || m.statusMedicao === "faturada") return "faturado";
  if (m.valor > 0 && m.statusMedicao !== "previsto") return "a_faturar";
  // Camada 2: Previsão de Faturamento (avanço físico)
  if (m.valorPrevisao > 0 && m.valorPrevisto === 0) return "previsao_faturamento";
  // Camada 1: Previsto (cronograma)
  if (m.statusMedicao === "previsto" || m.valorPrevisto > 0) return "previsto";
  if (m.valor > 0) return "previsto";
  return "pendente";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MedicaoCell {
  id: number;
  competencia: string;
  numero: number;
  valorPrevisto: number;
  valorContratoBL: number;
  valorMedido: number;
  valorPrevisao: number;
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
  totalRecebidoHistorico: number;
  saldoContrato: number;
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
  const [baixa, setBaixa] = useState<{ obra: ObraRow; mes: string; cell: MedicaoCell } | null>(null);

  // ─── Query ─────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = (trpc as any).financial.getContasReceberMatrix.useQuery(
    { companyId, ano },
    { enabled: !!companyId, staleTime: 0, refetchOnWindowFocus: true }
  );

  const mesesChave = MESES_CHAVE(ano);

  const obras: ObraRow[] = (data?.projetos ?? []).map((p: any) => {
    const byMes: Record<string, MedicaoCell> = {};
    for (const [mes, raw] of Object.entries(p.meses ?? {})) {
      const r = raw as any;
      const valorPrevisao = r.valorPrevisao ?? 0;
      const valorDisplay = r.valorMedido > 0 ? r.valorMedido : (r.valorPrevisto > 0 ? r.valorPrevisto : valorPrevisao);
      if (valorDisplay === 0 && valorPrevisao === 0) continue;
      byMes[mes] = {
        id: r.medicaoId ?? 0,
        competencia: mes,
        numero: 0,
        valorPrevisto: r.valorPrevisto,
        valorContratoBL: r.valorContratoBL ?? r.valorPrevisto,
        valorMedido: r.valorMedido,
        valorPrevisao,
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
    return {
      ...p,
      totalRecebidoHistorico: p.totalRecebidoHistorico ?? 0,
      saldoContrato: p.saldoContrato ?? Math.max(0, (p.valorContrato ?? 0) - (p.totalRecebidoHistorico ?? 0)),
      byMes,
      totalAno,
    } as ObraRow;
  });

  const kpis = data?.kpis ?? { totalContrato: 0, totalPrevisto: 0, totalPrevisaoFaturamento: 0, totalFaturado: 0, totalAReceber: 0, totalRecebido: 0 };
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
  const baixaMut = (trpc as any).financial.registrarRecebimento.useMutation({
    onSuccess: () => {
      toast({ title: "✅ Recebimento registrado!", description: "Valor atualizado em todos os módulos." });
      setBaixa(null);
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao registrar", description: e.message, variant: "destructive" }),
  });

  const cancelarMut = (trpc as any).financial.cancelarRecebimento.useMutation({
    onSuccess: () => {
      toast({ title: "Recebimento cancelado", description: "O registro foi removido." });
      setBaixa(null);
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao cancelar", description: e.message, variant: "destructive" }),
  });

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

        {/* KPIs — 2 linhas de 3 */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard icon={Wallet}        label="Total Contratos"       value={BRL(kpis.totalContrato)}               color="text-gray-700"   bg="bg-gray-50" />
          <KpiCard icon={CalendarClock} label="Previsto no Ano"       value={BRL(kpis.totalPrevisto)}               color="text-blue-700"   bg="bg-blue-50" />
          <KpiCard icon={TrendingUp}    label="Prev. Faturamento"     value={BRL(kpis.totalPrevisaoFaturamento)}    color="text-orange-600" bg="bg-orange-50"
            sub={kpis.totalPrevisaoFaturamento > 0 ? "Baseado no avanço físico" : "Sem avanço físico registrado"} />
          <KpiCard icon={FileText}      label="Já Faturado"           value={BRL(kpis.totalFaturado)}               color="text-blue-700"   bg="bg-blue-50" />
          <KpiCard icon={ReceiptText}   label="A Receber"             value={BRL(kpis.totalAReceber)}               color="text-purple-700" bg="bg-purple-50"
            sub="Faturado ainda não recebido" />
          <KpiCard icon={CheckCircle2}  label="Recebido"              value={BRL(kpis.totalRecebido)}               color="text-green-700"  bg="bg-green-50" />
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
                      onCellClick={(mes, cell) => {
                        setBaixa({ obra, mes, cell });
                      }}
                      onDetalheClick={(mes, cell) => setDetalhe({ obra, mes, cell })}
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
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            <span className="font-medium">Legenda:</span>
            {(["previsto","previsao_faturamento","a_faturar","faturado","a_receber","recebido_total"] as any[]).map((s: any) => {
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

      {/* Modal Dar Baixa */}
      {baixa && (
        <DarBaixaModal
          obra={baixa.obra}
          mes={baixa.mes}
          cell={baixa.cell}
          companyId={companyId}
          isPending={baixaMut.isPending || cancelarMut.isPending}
          onClose={() => setBaixa(null)}
          onSave={(payload) => baixaMut.mutate(payload)}
          onCancel={(frId, medicaoId) => cancelarMut.mutate({ companyId, frId, medicaoId })}
          onVerDetalhes={() => { setDetalhe(baixa); setBaixa(null); }}
        />
      )}

      {/* Painel de Detalhe (fluxo completo) */}
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

function ObraTableRow({ obra, mesesChave, zebra, onCellClick, onDetalheClick }: {
  obra: ObraRow;
  mesesChave: string[];
  zebra: boolean;
  onCellClick: (mes: string, cell: MedicaoCell) => void;
  onDetalheClick: (mes: string, cell: MedicaoCell) => void;
}) {
  const rowBg = zebra ? "bg-white" : "bg-gray-50/50";
  const hasPartial = mesesChave.some(mk => {
    const c = obra.byMes[mk];
    return c && resolveStatus(c) === "recebido_parcial";
  });
  return (
    <tr className={`border-b border-gray-100 hover:bg-blue-50/20 transition-colors ${rowBg} ${hasPartial ? "border-l-2 border-l-amber-400" : ""}`}>
      {/* Obra */}
      <td className={`sticky left-0 z-10 px-4 py-2.5 ${rowBg}`}>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${hasPartial ? "bg-amber-100" : "bg-blue-100"}`}>
            {hasPartial
              ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              : <Building2 className="w-3.5 h-3.5 text-blue-600" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs font-semibold text-gray-800 truncate max-w-[130px]">{obra.obraNome}</p>
              {hasPartial && (
                <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-100 rounded text-[9px] font-bold text-amber-700 shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Parcial
                </span>
              )}
            </div>
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
        const isRecebido = status === "recebido_total" || status === "recebido_parcial";

        // Divergência cronograma vs baseline: >5% e status ainda não tem medição real
        const noMedicao = status === "previsto" || status === "previsao_faturamento";
        const blDivergence = noMedicao && cell.valorContratoBL > 0 &&
          Math.abs(cell.valorContratoBL - cell.valorPrevisto) > cell.valorContratoBL * 0.05;
        const blAbaixo = blDivergence && cell.valorPrevisto < cell.valorContratoBL; // blAcima = !blAbaixo (usado no JSX)
        // Barra de progresso para células recebidas
        const pctRecebido = cell.valor > 0 ? Math.min(100, (cell.valorRecebido / cell.valor) * 100) : 0;
        const isParcial = status === "recebido_parcial";

        return (
          <td key={mk} className="px-1 py-1.5 text-center">
            <div className="relative group">
              <button
                onClick={() => onCellClick(mk, cell)}
                className={`w-full rounded-lg px-2 py-1.5 text-xs font-medium transition-all hover:ring-2 hover:ring-blue-300 cursor-pointer ${cfg.cell}`}
              >
                {/* Status badge */}
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Icon className="w-3 h-3 shrink-0" />
                  <span className="text-[10px] leading-none">{cfg.label}</span>
                </div>

                {/* Valor principal (cronograma) */}
                <p className="font-bold text-xs">{BRL(cell.valor)}</p>

                {/* Divergência: cronograma revisado difere do contrato original */}
                {blDivergence && (
                  <div className={`mt-0.5 rounded px-1 py-0.5 text-[8px] flex items-center justify-center gap-0.5 ${blAbaixo ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {blAbaixo ? "↓" : "↑"}
                    <span>Contrato: {BRL(cell.valorContratoBL)}</span>
                  </div>
                )}

                {/* Barra de progresso + valor recebido */}
                {cell.valorRecebido > 0 && (
                  <div className="mt-1">
                    <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isParcial ? "bg-amber-500" : "bg-green-500"}`}
                        style={{ width: `${pctRecebido}%` }}
                      />
                    </div>
                    {isParcial ? (
                      <p className="text-[8px] font-bold text-amber-700 mt-0.5">↙ {BRL(cell.valorRecebido)} · Δ {BRL(cell.valor - cell.valorRecebido)}</p>
                    ) : (
                      <p className="text-[8px] text-green-700 mt-0.5">{BRL(cell.valorRecebido)}</p>
                    )}
                  </div>
                )}
              </button>
              {/* Ícone "detalhes" para células já recebidas */}
              {!isRecebido && (
                <div
                  className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => { e.stopPropagation(); onDetalheClick(mk, cell); }}
                  title="Ver detalhes / fluxo de status"
                >
                  <div className="w-4 h-4 bg-gray-400 hover:bg-gray-600 rounded-full flex items-center justify-center cursor-pointer">
                    <span className="text-white text-[8px] font-bold leading-none">···</span>
                  </div>
                </div>
              )}
            </div>
          </td>
        );
      })}

      {/* Total obra + saldo contrato */}
      <td className="px-3 py-2.5 text-right bg-gray-50 border-l border-gray-100 min-w-[130px]">
        <p className="text-xs font-bold text-gray-700">{BRL(obra.totalAno)}</p>
        {obra.valorContrato > 0 && (
          <p className="text-[10px] text-gray-400">
            {((obra.totalAno / obra.valorContrato) * 100).toFixed(0)}% contrato
          </p>
        )}
        {obra.saldoContrato > 0 && (
          <p className="text-[10px] text-emerald-600 font-medium mt-0.5" title="Saldo a receber do contrato (histórico)">
            Saldo: {BRL(obra.saldoContrato)}
          </p>
        )}
      </td>
    </tr>
  );
}

// ─── Modal Dar Baixa ──────────────────────────────────────────────────────────

function DarBaixaModal({ obra, mes, cell, companyId, isPending, onClose, onSave, onCancel, onVerDetalhes }: {
  obra: ObraRow; mes: string; cell: MedicaoCell; companyId: number;
  isPending: boolean;
  onClose: () => void;
  onSave: (d: any) => void;
  onCancel: (frId: number, medicaoId: number | null) => void;
  onVerDetalhes: () => void;
}) {
  const mesIdx = parseInt(mes.slice(5, 7)) - 1;
  const anoStr = mes.slice(0, 4);
  const hoje = new Date().toISOString().split("T")[0];
  const isEdit = !!(cell.frId && (cell.statusMedicao === "recebido_total" || cell.statusMedicao === "recebido_parcial" || cell.statusFinanceiro === "recebido_total" || cell.statusFinanceiro === "recebido_parcial"));

  const initValor = isEdit && cell.valorRecebido > 0
    ? cell.valorRecebido.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : cell.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [valorStr, setValorStr] = useState(initValor);
  const [data, setData] = useState(isEdit && cell.dataRecebimento ? cell.dataRecebimento.slice(0, 10) : hoje);
  const [forma, setForma] = useState("PIX");
  const [obs, setObs] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [step, setStep] = useState<"form" | "carry">("form");

  const valorNum = parseBRL(valorStr);
  const valido = valorNum > 0 && data;
  const diferenca = cell.valor - valorNum;
  const isParcial = valorNum > 0 && diferenca > 0.01;

  function handleSave(carryNote?: string) {
    if (!valido) return;
    onSave({
      companyId,
      projetoId: obra.projetoId,
      obraId: obra.obraId,
      obraNome: obra.obraNome,
      clienteNome: obra.cliente,
      competencia: mes,
      valorPrevisto: cell.valorPrevisto || cell.valor,
      valorRecebido: valorNum,
      dataRecebimento: data,
      formaPagamento: forma,
      frId: cell.frId,
      observacoes: [obs, carryNote].filter(Boolean).join(" | ") || undefined,
    });
  }

  function handleConfirmClick() {
    if (!valido) return;
    if (isParcial && !isEdit) {
      setStep("carry");
    } else {
      handleSave();
    }
  }

  const headerGradient = isEdit
    ? "bg-gradient-to-r from-blue-600 to-indigo-500"
    : "bg-gradient-to-r from-green-600 to-emerald-500";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        {/* Cabeçalho colorido */}
        <div className={`${headerGradient} px-5 py-4 text-white`}>
          <div className="flex items-center gap-2 mb-1">
            {isEdit ? <Pencil className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
            <DialogHeader>
              <DialogTitle className="text-white text-base font-bold">
                {isEdit ? "Editar Recebimento" : "Registrar Recebimento"}
              </DialogTitle>
            </DialogHeader>
          </div>
          <p className="text-sm font-semibold opacity-90 truncate">{obra.obraNome}</p>
          <p className="text-xs opacity-75">{MESES_CURTOS[mesIdx]} {anoStr} · Previsto: {BRL(cell.valor)}</p>

          {/* Saldo de Contrato — dentro do header colorido */}
          {obra.valorContrato > 0 && (
            <div className="bg-white/15 rounded-lg mt-3 px-3 py-2 flex items-center justify-between gap-2">
              <div className="text-center">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">Contrato</p>
                <p className="text-xs font-bold text-white">{BRL(obra.valorContrato)}</p>
              </div>
              <div className="w-px h-6 bg-white/20" />
              <div className="text-center">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">Recebido</p>
                <p className="text-xs font-bold text-white">{BRL(obra.totalRecebidoHistorico)}</p>
              </div>
              <div className="w-px h-6 bg-white/20" />
              <div className="text-center">
                <p className="text-[10px] text-white/60 uppercase tracking-wide">Saldo</p>
                <p className={`text-xs font-bold ${obra.saldoContrato > 0 ? "text-emerald-300" : "text-white"}`}>
                  {BRL(obra.saldoContrato)}
                </p>
              </div>
            </div>
          )}
        </div>

        {step === "form" && <div className="p-5 space-y-4">
          {/* Valor */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Valor recebido (R$)</Label>
            <Input
              value={valorStr}
              onChange={e => setValorStr(formatBRLInput(e.target.value))}
              onFocus={e => e.target.select()}
              className="text-lg font-bold text-center h-11 border-2 focus:border-green-500"
              placeholder="0,00"
            />
            {isParcial && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <div className="flex items-center gap-1 mb-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Recebimento parcial</span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Previsto</span>
                    <span className="font-medium">{BRL(cell.valor)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Recebendo</span>
                    <span className="font-bold text-green-700">{BRL(valorNum)}</span>
                  </div>
                  <div className="border-t border-amber-200 pt-1 mt-1 flex justify-between text-xs">
                    <span className="font-semibold text-amber-700">Diferença</span>
                    <span className="font-bold text-amber-700">- {BRL(diferenca)}</span>
                  </div>
                </div>
              </div>
            )}
            {valorNum > 0 && valorNum > cell.valor && (
              <p className="text-xs text-blue-600 mt-1">✓ Acima do previsto</p>
            )}
          </div>

          {/* Data */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Data do recebimento</Label>
            <Input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Forma de pagamento */}
          <div>
            <Label className="text-xs text-gray-600 font-semibold mb-1 block">Forma de pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGAMENTO.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Observação (colapsável) */}
          <ObsField value={obs} onChange={setObs} />

          {/* Botão principal */}
          <Button
            className={`w-full h-11 text-sm font-bold text-white ${isEdit ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}`}
            disabled={!valido || isPending}
            onClick={handleConfirmClick}
          >
            {isPending ? "Salvando..." : isEdit ? "✓ Salvar Alterações" : isParcial ? "Continuar →" : "✓ Confirmar Recebimento"}
          </Button>

          {/* Cancelar recebimento (só em modo edição) */}
          {isEdit && cell.frId && (
            <div className="border-t border-gray-100 pt-3">
              {!confirmCancel ? (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors py-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Cancelar recebimento
                </button>
              ) : (
                <div className="bg-red-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-red-700 font-medium text-center">Confirmar cancelamento do recebimento?</p>
                  <p className="text-xs text-red-500 text-center">Esta ação não pode ser desfeita.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmCancel(false)}
                      className="flex-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md py-1.5"
                    >
                      Não
                    </button>
                    <button
                      onClick={() => onCancel(cell.frId!, cell.id || null)}
                      disabled={isPending}
                      className="flex-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-md py-1.5 font-semibold disabled:opacity-50"
                    >
                      {isPending ? "..." : "Sim, cancelar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onVerDetalhes}
            className="w-full text-xs text-gray-400 hover:text-gray-600 text-center transition-colors"
          >
            Ver fluxo completo de status →
          </button>
        </div>}

        {step === "carry" && (
          <div className="p-5">
            {/* Resumo da diferença */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-bold text-amber-800">Recebimento parcial registrado</span>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor previsto</span>
                  <span className="font-medium">{BRL(cell.valor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Valor recebido</span>
                  <span className="font-bold text-green-700">{BRL(valorNum)}</span>
                </div>
                <div className="border-t border-amber-200 pt-1.5 mt-1.5 flex justify-between">
                  <span className="font-bold text-amber-800">Diferença em aberto</span>
                  <span className="font-bold text-amber-800">{BRL(diferenca)}</span>
                </div>
              </div>
            </div>

            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
              A diferença de <span className="text-amber-700">{BRL(diferenca)}</span> deve ser relançada no próximo mês?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleSave(`Diferença de ${BRL(diferenca)} relançada no próximo mês sem correção`)}
                disabled={isPending}
                className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm font-medium text-blue-800 transition-colors disabled:opacity-50"
              >
                <span>Sim, sem correção</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSave(`Diferença de ${BRL(diferenca)} relançada no próximo mês com correção monetária`)}
                disabled={isPending}
                className="w-full flex items-center justify-between px-4 py-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-sm font-medium text-orange-800 transition-colors disabled:opacity-50"
              >
                <span>Sim, com correção monetária</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSave()}
                disabled={isPending}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 transition-colors disabled:opacity-50"
              >
                Não, registrar apenas o valor recebido
              </button>
            </div>

            <button
              onClick={() => setStep("form")}
              className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 text-center transition-colors"
            >
              ← Voltar e corrigir valor
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ObsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "Ocultar observação" : "Adicionar observação (opcional)"}
      </button>
      {open && (
        <Textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          placeholder="Ex: pagamento parcial referente à medição nº 3..."
          className="mt-2 text-sm"
        />
      )}
    </div>
  );
}

// ─── Painel de Detalhe (fluxo completo de status) ────────────────────────────

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
            {cell.valorRecebido > 0 && (
              <p className="text-sm font-semibold mt-1">Recebido: {BRL(cell.valorRecebido)}</p>
            )}
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
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione a obra" />
              </SelectTrigger>
              <SelectContent>
                {obras.map(o => (
                  <SelectItem key={o.projetoId} value={String(o.projetoId)}>{o.obraNome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nº Medição</Label>
              <Input type="number" value={form.medicaoNumero} onChange={e => set("medicaoNumero", +e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={form.valorMedicao} onChange={e => set("valorMedicao", formatBRLInput(e.target.value))} className="h-9 text-sm" placeholder="0,00" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Data de Vencimento</Label>
            <Input type="date" value={form.dataVencimento} onChange={e => set("dataVencimento", e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.observacoes} onChange={e => set("observacoes", e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isPending || !form.valorMedicao}
            onClick={() => onSave({
              companyId,
              obraId: form.obraId,
              obraNome: form.obraNome,
              clienteNome: form.clienteNome,
              valorContrato: form.valorContrato,
              medicaoNumero: form.medicaoNumero,
              valorMedicao: parseBRL(form.valorMedicao),
              dataVencimento: form.dataVencimento,
              observacoes: form.observacoes,
            })}
          >
            {isPending ? "Criando..." : "Criar Medição"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
