import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, Cell, ComposedChart, Area, Line, ReferenceLine, LabelList,
} from "recharts";
import {
  FileText, ShoppingCart, Receipt, Building2, CheckCircle2,
  ArrowDownLeft, ArrowUpRight, Banknote, Calculator, Percent,
  TrendingUp, TrendingDown, Package, Users, BadgeDollarSign,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  PALETTE, formatBRL, formatBRLCompact, DashHeader, KpiCard, ChartCard,
  EmptyState, BRLTooltip, ComparativoAnual, DetailDialog, DetailColumn,
  MESES_ABREV,
} from "./_kit";
import { formatDate } from "@/lib/dateUtils";

/* ──────────────────────────────────────────────────────────────────────────
 * Dashboard — Notas Fiscais (Rev. 3630)
 * Análise NF-e Recebidas × NFS-e Emitidas × OC × Extrato Bancário
 * READ-ONLY · usa getPanoramaFiscal (fiscalNotes router)
 * ────────────────────────────────────────────────────────────────────────── */

const GREEN  = "#10b981";
const AMBER  = "#f59e0b";
const BLUE   = "#6366f1";
const VIOLET = "#8b5cf6";
const RED    = "#ef4444";

/* ─────────────────── Ring gauge (cobertura %) ─────────────────── */
function RingGauge({
  pct, color, label, sub,
}: { pct: number | null; color: string; label: string; sub: string }) {
  const v = Math.min(100, Math.max(0, pct ?? 0));
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (v / 100) * circ;
  const textColor = pct == null ? "text-slate-400" : v >= 70 ? "text-emerald-600" : v >= 40 ? "text-amber-600" : "text-red-600";
  const stroke    = pct == null ? "#e2e8f0" : v >= 70 ? GREEN : v >= 40 ? AMBER : RED;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
          <circle cx="40" cy="40" r={r} fill="none"
            stroke={stroke} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ - dash}`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-base font-bold ${textColor}`}>
          {pct == null ? "—" : `${v}%`}
        </span>
      </div>
      <span className="text-xs font-semibold text-slate-700 text-center leading-tight">{label}</span>
      <span className="text-[11px] text-slate-400 text-center leading-tight">{sub}</span>
    </div>
  );
}

/* ─────────────────── Custom tooltip for ComposedChart ─────────────────── */
function MultiTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[190px]">
      <p className="text-xs font-bold text-slate-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3 mb-0.5">
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="text-xs font-semibold tabular-nums text-slate-800">{formatBRLCompact(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────── Helpers ─────────────────── */
function groupByMonth(items: any[], dateKey: string, valueKey: string): number[] {
  const arr = new Array(12).fill(0);
  for (const item of items) {
    const raw = item[dateKey];
    if (!raw) continue;
    const d = new Date(typeof raw === "string" ? raw.replace(" ", "T") : raw);
    if (isNaN(d.getTime())) continue;
    arr[d.getMonth()] += parseFloat(String(item[valueKey] ?? "0")) || 0;
  }
  return arr;
}

function groupFornecedores(nfeList: any[]) {
  const map = new Map<string, { nome: string; total: number; qtd: number }>();
  for (const nfe of nfeList) {
    const cnpj = (nfe.emitente_cnpj ?? "").replace(/\D/g, "") || "SEM";
    const nome = nfe.emitente_nome ?? nfe.emitente_cnpj ?? "Desconhecido";
    const val = parseFloat(nfe.valor_bruto ?? "0") || 0;
    const e = map.get(cnpj) ?? { nome, total: 0, qtd: 0 };
    e.total += val;
    e.qtd += 1;
    if (e.nome === "Desconhecido" && nome !== "Desconhecido") e.nome = nome;
    map.set(cnpj, e);
  }
  return [...map.entries()]
    .map(([cnpj, v]) => ({ cnpj, name: v.nome, ...v }))
    .sort((a, b) => b.total - a.total);
}

/* ─────────────────── Column definitions ─────────────────── */
const COL_NF: DetailColumn[] = [
  { key: "numero_nf", label: "NF#" },
  { key: "emitente_nome", label: "Emitente" },
  { key: "emitente_cnpj", label: "CNPJ Emitente" },
  { key: "data_emissao", label: "Emissão", format: (v) => v ? formatDate(v) : "—" },
  { key: "valor_bruto", label: "Valor", align: "right", brl: true },
  { key: "status", label: "Status" },
  { key: "chave_acesso", label: "Chave", format: (v) => v ? <span className="text-[10px] font-mono text-slate-400">{String(v).slice(0, 22)}…</span> : "—" },
];
const COL_NFSE: DetailColumn[] = [
  { key: "numero_nf", label: "NFS-e#" },
  { key: "tomador_razao_social", label: "Tomador" },
  { key: "tomador_cnpj", label: "CNPJ Tomador" },
  { key: "data_emissao", label: "Emissão", format: (v) => v ? formatDate(v) : "—" },
  { key: "valor_bruto", label: "Valor Bruto", align: "right", brl: true },
  { key: "valor_liquido", label: "Valor Líquido", align: "right", brl: true },
  { key: "status", label: "Status" },
];
const COL_BANK: DetailColumn[] = [
  { key: "data", label: "Data", format: (v) => v ? formatDate(v) : "—" },
  { key: "descricao", label: "Descrição" },
  { key: "conta_nome", label: "Conta" },
  { key: "valor", label: "Valor", align: "right", brl: true },
  { key: "conciliado", label: "Conciliado", align: "center", format: (v) => v ? "✅" : "—" },
];
const COL_OC: DetailColumn[] = [
  { key: "numero", label: "OC#" },
  { key: "supplier_razao", label: "Fornecedor" },
  { key: "supplier_cnpj", label: "CNPJ" },
  { key: "obra_nome", label: "Obra" },
  { key: "valor_total", label: "Valor OC", align: "right", brl: true },
  { key: "nfeNumero", label: "NF-e#" },
  { key: "nfeValor", label: "Valor NF-e", align: "right", brl: true },
  { key: "status", label: "Status" },
];
const COL_OC_SEM: DetailColumn[] = [
  { key: "numero", label: "OC#" },
  { key: "supplier_razao", label: "Fornecedor" },
  { key: "supplier_cnpj", label: "CNPJ" },
  { key: "obra_nome", label: "Obra" },
  { key: "valor_total", label: "Valor OC", align: "right", brl: true },
  { key: "status", label: "Status" },
  { key: "tipo", label: "Tipo" },
];

/* ─────────────────── Pendência card ─────────────────── */
function PendCard({
  icon: Icon, label, count, total, color, onClick,
}: { icon: any; label: string; count: number; total: number; color: "amber"|"rose"|"orange"; onClick: () => void }) {
  const C = {
    amber:  { bg: "bg-amber-50",  ring: "ring-amber-100",  ic: "text-amber-600 bg-amber-100",   badge: "bg-amber-500",  val: "text-amber-700" },
    rose:   { bg: "bg-rose-50",   ring: "ring-rose-100",   ic: "text-rose-600 bg-rose-100",     badge: "bg-rose-500",   val: "text-rose-700" },
    orange: { bg: "bg-orange-50", ring: "ring-orange-100", ic: "text-orange-600 bg-orange-100", badge: "bg-orange-500", val: "text-orange-700" },
  }[color];
  return (
    <div onClick={onClick}
      className={`${C.bg} ring-1 ${C.ring} rounded-xl p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group`}>
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${C.ic}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className={`text-xs font-bold text-white ${C.badge} rounded-full px-2 py-0.5 tabular-nums`}>{count}</span>
      </div>
      <p className="text-xs font-semibold text-slate-700 leading-tight">{label}</p>
      <p className={`text-lg font-black tabular-nums mt-1 ${C.val}`}>{formatBRL(total)}</p>
      <p className="text-[11px] text-slate-400 mt-1 group-hover:text-slate-600">Clique para ver detalhes →</p>
    </div>
  );
}

/* ─────────────────── OC × NF-e accordion ─────────────────── */
function OcNfeSection({ data, onOpenSem, onOpenCom, onOpenNfeSem }: { data: any; onOpenSem: () => void; onOpenCom: () => void; onOpenNfeSem: () => void }) {
  const [openSem, setOpenSem] = useState(false);
  const [openCom, setOpenCom] = useState(true);
  const [openNfeSem, setOpenNfeSem] = useState(false);
  if (!data) return null;
  const comNota: any[] = data.ocsComNota ?? [];
  const semNota: any[] = data.ocsSemNota ?? [];
  const nfeSemOc: any[] = data.nfeSemOc ?? [];
  const totNfeSemOc = nfeSemOc.reduce((s, r) => s + Math.abs(parseFloat(r.valor_bruto ?? "0")), 0);
  const totCom = comNota.reduce((s, r) => s + parseFloat(r.valor_total ?? "0"), 0);
  const totSem = semNota.reduce((s, r) => s + parseFloat(r.valor_total ?? "0"), 0);

  return (
    <Card className="p-4 border-slate-200">
      <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-violet-500" />
        Ordens de Compra × NF-e Recebida
      </h3>
      <div className="space-y-2">
        {/* Com nota */}
        <div className="rounded-lg border border-emerald-100 overflow-hidden">
          <button type="button" onClick={() => setOpenCom(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 hover:bg-emerald-100 transition-colors text-left">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700">OCs com NF-e vinculada</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-bold text-emerald-700 tabular-nums">{formatBRL(totCom)}</span>
              <span className="text-[11px] text-slate-400">{comNota.length} item{comNota.length !== 1 ? "s" : ""}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenCom(); }}
                className="text-[11px] text-emerald-600 hover:text-emerald-800 font-medium underline">Detalhe</button>
            </div>
          </button>
          {openCom && (
            comNota.length === 0
              ? <p className="text-xs text-slate-400 text-center py-3">Nenhuma OC com NF-e vinculada.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>{["OC#","Fornecedor","CNPJ","Valor OC","NF-e#","Valor NF-e","Obra","Status"].map(h =>
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                      )}</tr>
                    </thead>
                    <tbody>
                      {comNota.slice(0, 25).map((r, i) => (
                        <tr key={i} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/40 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-violet-600">#{r.numero}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate" title={r.supplier_razao}>{r.supplier_razao}</td>
                          <td className="px-3 py-2 text-slate-400 tabular-nums">{r.supplier_cnpj}</td>
                          <td className="px-3 py-2 tabular-nums font-semibold text-right">{formatBRL(parseFloat(r.valor_total ?? "0"))}</td>
                          <td className="px-3 py-2 text-emerald-600 font-medium">#{r.nfeNumero}</td>
                          <td className="px-3 py-2 tabular-nums text-right">{r.nfeValor ? formatBRL(parseFloat(r.nfeValor)) : "—"}</td>
                          <td className="px-3 py-2 text-slate-400 max-w-[120px] truncate">{r.obra_nome ?? "—"}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {comNota.length > 25 && (
                    <div className="text-center py-2 text-xs text-slate-400">
                      … e mais {comNota.length - 25} itens.{" "}
                      <button type="button" onClick={onOpenCom} className="text-violet-600 underline">Ver todos</button>
                    </div>
                  )}
                </div>
              )
          )}
        </div>

        {/* Sem nota */}
        <div className="rounded-lg border border-amber-100 overflow-hidden">
          <button type="button" onClick={() => setOpenSem(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700">OCs SEM NF-e — solicitar nota ao fornecedor</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-bold text-amber-700 tabular-nums">{formatBRL(totSem)}</span>
              <span className="text-[11px] text-slate-400">{semNota.length} item{semNota.length !== 1 ? "s" : ""}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenSem(); }}
                className="text-[11px] text-amber-600 hover:text-amber-800 font-medium underline">Detalhe</button>
            </div>
          </button>
          {openSem && (
            semNota.length === 0
              ? <p className="text-xs text-emerald-600 text-center py-3">✅ Todas as OCs têm NF-e vinculada.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>{["OC#","Fornecedor","CNPJ","Obra","Valor OC","Status","Tipo"].map(h =>
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                      )}</tr>
                    </thead>
                    <tbody>
                      {semNota.slice(0, 25).map((r, i) => (
                        <tr key={i} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/40 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-violet-600">#{r.numero}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate" title={r.supplier_razao}>{r.supplier_razao}</td>
                          <td className="px-3 py-2 text-slate-400 tabular-nums">{r.supplier_cnpj}</td>
                          <td className="px-3 py-2 text-slate-400 max-w-[120px] truncate">{r.obra_nome ?? "—"}</td>
                          <td className="px-3 py-2 tabular-nums font-semibold text-right">{formatBRL(parseFloat(r.valor_total ?? "0"))}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">{r.status}</span></td>
                          <td className="px-3 py-2 text-slate-400">{r.tipo ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {semNota.length > 25 && (
                    <div className="text-center py-2 text-xs text-slate-400">
                      … e mais {semNota.length - 25} itens.{" "}
                      <button type="button" onClick={onOpenSem} className="text-violet-600 underline">Ver todos</button>
                    </div>
                  )}
                </div>
              )
          )}
        </div>
        {/* NF-e sem OC */}
        <div className="rounded-lg border border-rose-100 overflow-hidden">
          <button type="button" onClick={() => setOpenNfeSem(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-rose-50 hover:bg-rose-100 transition-colors text-left">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-xs font-semibold text-slate-700">NF-e sem OC vinculada — verificar se há OC correspondente</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-bold text-rose-700 tabular-nums">{formatBRL(totNfeSemOc)}</span>
              <span className="text-[11px] text-slate-400">{nfeSemOc.length} item{nfeSemOc.length !== 1 ? "s" : ""}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onOpenNfeSem(); }}
                className="text-[11px] text-rose-600 hover:text-rose-800 font-medium underline">Detalhe</button>
            </div>
          </button>
          {openNfeSem && (
            nfeSemOc.length === 0
              ? <p className="text-xs text-emerald-600 text-center py-3">✅ Todas as NF-e recebidas têm OC correspondente.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>{["NF#","Emitente","CNPJ","Valor","Emissão","Status"].map(h =>
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                      )}</tr>
                    </thead>
                    <tbody>
                      {nfeSemOc.slice(0, 25).map((r, i) => (
                        <tr key={i} className="border-b border-slate-50 odd:bg-white even:bg-slate-50/40 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-rose-600">#{r.numero_nf ?? "—"}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate" title={r.emitente_nome}>{r.emitente_nome ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-400 tabular-nums text-[11px]">{r.emitente_cnpj ?? "—"}</td>
                          <td className="px-3 py-2 tabular-nums font-semibold text-right text-rose-700">{formatBRL(parseFloat(r.valor_bruto ?? "0"))}</td>
                          <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{r.data_emissao ? formatDate(r.data_emissao) : "—"}</td>
                          <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{r.status ?? "—"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {nfeSemOc.length > 25 && (
                    <div className="text-center py-2 text-xs text-slate-400">
                      … e mais {nfeSemOc.length - 25} itens.{" "}
                      <button type="button" onClick={onOpenNfeSem} className="text-violet-600 underline">Ver todos</button>
                    </div>
                  )}
                </div>
              )
          )}
        </div>
      </div>
    </Card>
  );
}

/* ─────────────────── Main Dashboard ─────────────────── */
type DlgKey = "nfeRecebidas"|"nfseEmitidas"|"saidasSemNota"|"entradasSemNota"|"ocsSemNota"|"ocsComNota"|"nfeSemOc"|"fornecedorDetail";

export default function DashNotasFiscais() {
  const [, nav] = useLocation();
  const { companyId } = useCompany();
  const curYear = new Date().getFullYear();
  const [ano, setAno] = useState(curYear);
  const [mes, setMes] = useState(0);
  const [dlg, setDlg] = useState<DlgKey | null>(null);
  const [selectedFornCnpj, setSelectedFornCnpj] = useState<string | null>(null);

  const pQuery = (trpc as any).fiscalNotes.getPanoramaFiscal.useQuery(
    { companyId: companyId ?? 0, mes, ano },
    { enabled: !!companyId, staleTime: 60_000 }
  );

  const anoQuery = (trpc as any).fiscalNotes.getPanoramaFiscal.useQuery(
    { companyId: companyId ?? 0, mes: 0, ano },
    { enabled: !!companyId && mes !== 0, staleTime: 60_000 }
  );

  const prevQuery = (trpc as any).fiscalNotes.getPanoramaFiscal.useQuery(
    { companyId: companyId ?? 0, mes: 0, ano: ano - 1 },
    { enabled: !!companyId, staleTime: 300_000 }
  );

  const multiYearQuery = (trpc as any).fiscalNotes.getMultiYearSeries.useQuery(
    { companyId: companyId ?? 0, anos: 5 },
    { enabled: !!companyId, staleTime: 300_000 }
  );
  const multiYearData: Array<{ ano: number; nfeTotal: number; nfeCount: number; nfseTotal: number; nfseCount: number }> =
    multiYearQuery.data ?? [];

  const quarterlyQuery = (trpc as any).fiscalNotes.getQuarterlySeries.useQuery(
    { companyId: companyId ?? 0, anos: 5 },
    { enabled: !!companyId, staleTime: 300_000 }
  );
  const quarterlyData: { anos: number[]; quarters: Record<string,any>[]; anuais: {ano:number;nfseTotal:number;nfeTotal:number}[] } =
    quarterlyQuery.data ?? { anos: [], quarters: [], anuais: [] };

  const tributariaQuery = (trpc as any).fiscalNotes.getAnalyseTributaria.useQuery(
    { companyId: companyId ?? 0, mes, ano },
    { enabled: !!companyId, staleTime: 60_000 }
  );
  const trib = tributariaQuery.data;

  const data     = pQuery.data;
  const anoData  = mes === 0 ? data : anoQuery.data;
  const prevData = prevQuery.data;
  const resumo   = data?.resumo;

  const nfeByMonth  = useMemo(() => groupByMonth(anoData?.nfeRecebidas  ?? [], "data_emissao", "valor_bruto"), [anoData]);
  const nfseByMonth = useMemo(() => groupByMonth(anoData?.nfseEmitidas  ?? [], "data_emissao", "valor_bruto"), [anoData]);
  const saiByMonth  = useMemo(() => groupByMonth(
    [...(anoData?.saidasComNota ?? []), ...(anoData?.saidasSemNota ?? [])],
    "data", "valor"
  ), [anoData]);
  const entByMonth  = useMemo(() => groupByMonth(
    [...(anoData?.entradasComNota ?? []), ...(anoData?.entradasSemNota ?? [])],
    "data", "valor"
  ), [anoData]);
  const prevNfseByMonth = useMemo(() => groupByMonth(prevData?.nfseEmitidas ?? [], "data_emissao", "valor_bruto"), [prevData]);

  /* ComposedChart monthly — bars NF-e + NFS-e, area saídas, line entradas */
  const composedData = useMemo(() => MESES_ABREV.map((m, i) => ({
    mes: m,
    "NF-e Recebidas":  nfeByMonth[i] ?? 0,
    "NFS-e Emitidas":  nfseByMonth[i] ?? 0,
    "Saídas Banco":    Math.abs(saiByMonth[i] ?? 0),
    "Entradas Banco":  Math.abs(entByMonth[i] ?? 0),
  })), [nfeByMonth, nfseByMonth, saiByMonth, entByMonth]);

  const composedDataMes = mes !== 0 ? [{
    mes: MESES_ABREV[mes - 1],
    "NF-e Recebidas":  resumo?.nfeRecebidas.total    ?? 0,
    "NFS-e Emitidas":  resumo?.nfseEmitidas.total    ?? 0,
    "Saídas Banco":    resumo?.saidasBancarias.total  ?? 0,
    "Entradas Banco":  resumo?.entradasBancarias.total ?? 0,
  }] : composedData;

  /* Coverage chart — Saídas c/ NF-e vs Sem NF-e por mês */
  const coverageData = useMemo(() => {
    const filterMonth = (arr: any[], dateKey: string, i: number) =>
      arr.filter((r: any) => {
        const raw = r[dateKey]; if (!raw) return false;
        const d = new Date(typeof raw === "string" ? raw.replace(" ", "T") : raw);
        return !isNaN(d.getTime()) && d.getMonth() === i;
      }).reduce((s: number, r: any) => s + Math.abs(parseFloat(String(r.valor ?? "0")) || 0), 0);
    return MESES_ABREV.map((label, i) => {
      const com  = filterMonth(anoData?.saidasComNota  ?? [], "data", i);
      const sem  = filterMonth(anoData?.saidasSemNota  ?? [], "data", i);
      const tot  = com + sem;
      const pct  = tot > 0 ? Math.round((com / tot) * 100) : null;
      return { mes: label, "c/ NF-e": com, "s/ NF-e": sem, "% Cobert.": pct };
    });
  }, [anoData]);

  /* Treemap fornecedores */
  const prevNfeByMonth = useMemo(() => groupByMonth(prevData?.nfeRecebidas ?? [], "data_emissao", "valor_bruto"), [prevData]);
  const topForn        = useMemo(() => groupFornecedores(data?.nfeRecebidas ?? []), [data]);
  const topFornMax     = topForn[0]?.total ?? 1;
  const totalForn      = useMemo(() => topForn.reduce((s, f) => s + f.total, 0), [topForn]);
  const treemapData    = useMemo(() => topForn.slice(0, 18).map((f, i) => ({
    name:  f.nome ?? "Desconhecido",
    cnpj:  f.cnpj,
    value: f.total,
    qtd:   f.qtd,
    fill:  PALETTE[i % PALETTE.length],
  })), [topForn]);

  const fornRows = useMemo(() =>
    selectedFornCnpj
      ? (data?.nfeRecebidas ?? []).filter((n: any) => n.emitente_cnpj === selectedFornCnpj)
      : [],
  [selectedFornCnpj, data]);
  const fornName = treemapData.find(d => d.cnpj === selectedFornCnpj)?.name ?? "";

  const periodoLabel = mes === 0 ? String(ano) : `${MESES_ABREV[mes - 1]}/${ano}`;
  const indiceGeral  = resumo
    ? Math.round(((resumo.coberturaNfseReceita ?? 0) + (resumo.coberturaOcNfe ?? 0) + (resumo.coberturaSaidaNfe ?? 0)) / 3)
    : 0;

  const sumB = (arr: any[], k = "valor") => arr?.reduce((s, r) => s + Math.abs(parseFloat(r[k] ?? "0")), 0) ?? 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-5 p-4 md:p-6">

        {/* ── Cabeçalho com gradiente — padrão dos outros dashboards ──────── */}
        <DashHeader
          theme="violet"
          icon={FileText}
          title="Dashboard — Notas Fiscais"
          subtitle={`Análise NF-e × NFS-e × OCs × Extrato Bancário · ${ano}`}
          ano={ano}
          onAno={setAno}
          onRefresh={() => { pQuery.refetch(); anoQuery.refetch(); prevQuery.refetch(); }}
        />

        {/* ── Seletor de mês — "Ano todo" + 12 chips ───────────────────────── */}
        <div className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          {/* Linha única: legend + "Ano todo" + meses */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</span>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />Com dados</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />Sem dados</span>
            </div>
          </div>
          <div className="px-4 py-3 grid grid-cols-7 sm:grid-cols-13 gap-1.5">
            {/* "Ano todo" como primeiro chip */}
            <button type="button"
              onClick={() => setMes(0)}
              className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all col-span-1
                ${mes === 0
                  ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}
            >
              <span>Tudo</span>
              <span className="w-1.5 h-1.5 rounded-full bg-transparent" />
            </button>
            {MESES_ABREV.map((m, i) => {
              const numMes = i + 1;
              const isSelected = mes === numMes;
              const dotSrc = (mes === 0 ? pQuery.data : anoQuery.data);
              const hasNfse = (dotSrc?.nfseEmitidas ?? []).some((n: any) => {
                const d = n.data_emissao ? new Date(n.data_emissao).getMonth() + 1 : 0;
                return d === numMes;
              });
              const hasNfe = (dotSrc?.nfeRecebidas ?? []).some((n: any) => {
                const d = n.data_emissao ? new Date(n.data_emissao).getMonth() + 1 : 0;
                return d === numMes;
              });
              const dotColor = (hasNfse || hasNfe) ? "bg-emerald-500" : "bg-gray-300";
              return (
                <button key={m} type="button" onClick={() => setMes(numMes)}
                  className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                    ${isSelected
                      ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"}`}
                >
                  <span>{m}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard icon={Receipt}    label="NFS-e Emitidas"   value={formatBRL(resumo?.nfseEmitidas.total ?? 0)}
            sub={`${resumo?.nfseEmitidas.qtd ?? 0} nota${(resumo?.nfseEmitidas.qtd ?? 0) !== 1 ? "s" : ""}`}
            tone={(resumo?.nfseEmitidas.qtd ?? 0) > 0 ? "good" : "default"}
            onClick={() => setDlg("nfseEmitidas")} />
          <KpiCard icon={FileText}   label="NF-e Recebidas"   value={formatBRL(resumo?.nfeRecebidas.total ?? 0)}
            sub={`${resumo?.nfeRecebidas.qtd ?? 0} nota${(resumo?.nfeRecebidas.qtd ?? 0) !== 1 ? "s" : ""}`}
            tone={(resumo?.nfeRecebidas.qtd ?? 0) > 0 ? "good" : "default"}
            onClick={() => setDlg("nfeRecebidas")} />
          <KpiCard icon={ShoppingCart} label="Ordens de Compra" value={formatBRL(resumo?.totalOcs.total ?? 0)}
            sub={`${resumo?.totalOcs.qtd ?? 0} OC${(resumo?.totalOcs.qtd ?? 0) !== 1 ? "s" : ""}`}
            tone="default" onClick={() => setDlg("ocsComNota")} />
          <KpiCard icon={Building2}  label="Entradas Bancárias" value={formatBRL(resumo?.entradasBancarias.total ?? 0)}
            sub={`${resumo?.entradasBancarias.qtd ?? 0} lançamento${(resumo?.entradasBancarias.qtd ?? 0) !== 1 ? "s" : ""}`}
            tone={(data?.entradasSemNota?.length ?? 0) > 0 ? "warn" : "good"}
            onClick={() => setDlg("entradasSemNota")} />
          <KpiCard icon={Banknote}   label="Saídas Bancárias"  value={formatBRL(resumo?.saidasBancarias.total ?? 0)}
            sub={`${resumo?.saidasBancarias.qtd ?? 0} lançamento${(resumo?.saidasBancarias.qtd ?? 0) !== 1 ? "s" : ""}`}
            tone={(data?.saidasSemNota?.length ?? 0) > 0 ? "warn" : "good"}
            onClick={() => setDlg("saidasSemNota")} />
        </div>

        {/* Saúde Fiscal — gauges */}
        <Card className="p-5 border-slate-200">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-800">Saúde Fiscal — {periodoLabel}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Cobertura de documentos fiscais sobre movimentos financeiros</p>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-3xl font-black tabular-nums ${indiceGeral >= 70 ? "text-emerald-600" : indiceGeral >= 40 ? "text-amber-600" : "text-red-600"}`}>
                {indiceGeral}%
              </span>
              <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Índice Geral</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mb-5">
            <RingGauge pct={resumo?.coberturaNfseReceita ?? null} color={GREEN}  label="Receita c/ NFS-e"  sub="entradas bancárias" />
            <RingGauge pct={resumo?.coberturaOcNfe       ?? null} color={BLUE}   label="OC c/ NF-e"        sub="ordens de compra" />
            <RingGauge pct={resumo?.coberturaSaidaNfe    ?? null} color={VIOLET} label="Saída c/ nota"     sub="débitos bancários" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-4 border-t border-slate-100">
            {[
              { label: "NFS-e Emitidas",   val: resumo?.nfseEmitidas,       color: "text-violet-600"  },
              { label: "NF-e Recebidas",   val: resumo?.nfeRecebidas,       color: "text-blue-600"    },
              { label: "OCs (Compras)",    val: resumo?.totalOcs,           color: "text-amber-600"   },
              { label: "Entradas Banco",   val: resumo?.entradasBancarias,  color: "text-emerald-600" },
              { label: "Saídas Banco",     val: resumo?.saidasBancarias,    color: "text-rose-600"    },
            ].map((k) => (
              <div key={k.label} className="bg-slate-50 rounded-lg p-2 text-center">
                <p className="text-[11px] text-slate-500 font-medium leading-tight">{k.label}</p>
                <p className={`text-sm font-bold tabular-nums ${k.color}`}>{formatBRL(k.val?.total ?? 0)}</p>
                <p className="text-[11px] text-slate-400">{k.val?.qtd ?? 0} docs</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Gráfico PRINCIPAL: Entradas × Saídas com Desvio ─────────────── */}
        {(() => {
          const fcData = composedDataMes.map(d => ({
            mes: d.mes,
            "Entradas (NFS-e)": d["NFS-e Emitidas"]  as number,
            "Saídas (NF-e)":    d["NF-e Recebidas"]  as number,
            Desvio: (d["NFS-e Emitidas"] as number) - (d["NF-e Recebidas"] as number),
          }));
          const totalEnt  = fcData.reduce((s, d) => s + d["Entradas (NFS-e)"], 0);
          const totalSai  = fcData.reduce((s, d) => s + d["Saídas (NF-e)"], 0);
          const desvioTotal = totalEnt - totalSai;
          const hasSomeData = fcData.some(d => d["Entradas (NFS-e)"] > 0 || d["Saídas (NF-e)"] > 0);
          return (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* Header com saldo destacado */}
              <div className="px-5 pt-5 pb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Entradas × Saídas — Notas Fiscais</h2>
                  <p className="text-xs text-slate-500 mt-0.5">NFS-e Emitidas (receita) vs NF-e Recebidas (custo) · {periodoLabel}</p>
                </div>
                <div className="flex gap-6 shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Entradas</p>
                    <p className="text-lg font-black text-violet-700 tabular-nums">{formatBRL(totalEnt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Saídas</p>
                    <p className="text-lg font-black text-blue-700 tabular-nums">{formatBRL(totalSai)}</p>
                  </div>
                  <div className="text-right border-l border-slate-100 pl-6">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desvio</p>
                    <p className={`text-xl font-black tabular-nums ${desvioTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {desvioTotal >= 0 ? "+" : ""}{formatBRL(desvioTotal)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="h-72 px-2 pb-4">
                {!hasSomeData
                  ? <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem notas fiscais no período.</div>
                  : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={fcData} margin={{ top: 6, right: 56, bottom: 4, left: 8 }} barCategoryGap="22%">
                        <defs>
                          <linearGradient id="gradDesvio" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="val"    tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#94a3b8" }} width={68} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="desvio" orientation="right" tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#10b981" }} width={58} axisLine={false} tickLine={false} />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
                              <p className="font-bold text-slate-700 mb-2">{label}</p>
                              {payload.map((p: any) => (
                                <p key={p.dataKey} style={{ color: p.color ?? p.fill }} className="flex justify-between gap-4 mb-0.5">
                                  <span>{p.name}:</span>
                                  <span className="font-bold tabular-nums">{formatBRL(Number(p.value))}</span>
                                </p>
                              ))}
                            </div>
                          );
                        }} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                        <Bar    yAxisId="val"    dataKey="Entradas (NFS-e)" fill={VIOLET} radius={[4,4,0,0]} maxBarSize={24} />
                        <Bar    yAxisId="val"    dataKey="Saídas (NF-e)"   fill={BLUE}   radius={[4,4,0,0]} maxBarSize={24} />
                        <Area   yAxisId="desvio" dataKey="Desvio" fill="url(#gradDesvio)" stroke="#10b981" strokeWidth={2.5}
                          dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 5 }}
                          strokeDasharray={totalSai === 0 ? "5 3" : undefined} />
                        <ReferenceLine yAxisId="desvio" y={0} stroke="#d1fae5" strokeWidth={1.5} strokeDasharray="4 2" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )
                }
              </div>
              {totalSai === 0 && (
                <p className="text-[10px] text-center text-slate-400 pb-3">
                  * NF-e Recebidas disponíveis a partir de 2026. Importe XMLs anteriores para completar o histórico.
                </p>
              )}
            </div>
          );
        })()}

        {/* ── Gráfico 2: Evolução mensal — ComposedChart ────────────────── */}
        <ChartCard
          title="Evolução Fiscal Mensal"
          subtitle={`NF-e + NFS-e emitidas × movimentos bancários · ${ano}`}
          height={320}
        >
          {composedDataMes.every(d =>
            !d["NF-e Recebidas"] && !d["NFS-e Emitidas"] && !d["Saídas Banco"] && !d["Entradas Banco"]
          )
            ? <EmptyState message="Sem dados para o período." />
            : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={composedDataMes} margin={{ top: 6, right: 16, bottom: 4, left: 8 }}>
                  <defs>
                    <linearGradient id="gradSai" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={AMBER}  stopOpacity={0.25} />
                      <stop offset="95%" stopColor={AMBER}  stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradEnt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={GREEN}  stopOpacity={0.20} />
                      <stop offset="95%" stopColor={GREEN}  stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#94a3b8" }} width={68} axisLine={false} tickLine={false} />
                  <Tooltip content={<MultiTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area dataKey="Saídas Banco"   fill="url(#gradSai)" stroke={AMBER}  strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                  <Area dataKey="Entradas Banco" fill="url(#gradEnt)" stroke={GREEN}  strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
                  <Bar  dataKey="NF-e Recebidas" fill={BLUE}   radius={[4,4,0,0]} maxBarSize={20} />
                  <Bar  dataKey="NFS-e Emitidas" fill={VIOLET} radius={[4,4,0,0]} maxBarSize={20} />
                  <ReferenceLine y={0} stroke="#e2e8f0" />
                </ComposedChart>
              </ResponsiveContainer>
            )
          }
        </ChartCard>

        {/* ── Gráfico 2: Cobertura fiscal + Treemap fornecedores ────────── */}
        <div className="grid md:grid-cols-12 gap-4">
          {/* Coverage stacked bar — Saídas c/ NF-e vs s/ NF-e */}
          <ChartCard
            title="Cobertura de NF-e nas Saídas"
            subtitle={`Saídas bancárias c/ nota vs sem nota · ${ano}`}
            height={280}
            className="md:col-span-7"
          >
            {coverageData.every(d => !d["c/ NF-e"] && !d["s/ NF-e"])
              ? <EmptyState message="Sem movimentos no período." />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={coverageData} margin={{ top: 6, right: 40, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="val" tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#94a3b8" }} width={68} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="pct" orientation="right" tickFormatter={v => v == null ? "" : `${v}%`} domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} width={36} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const com  = payload.find((p: any) => p.dataKey === "c/ NF-e")?.value ?? 0;
                      const sem  = payload.find((p: any) => p.dataKey === "s/ NF-e")?.value ?? 0;
                      const pct  = payload.find((p: any) => p.dataKey === "% Cobert.")?.value;
                      const tot  = Number(com) + Number(sem);
                      return (
                        <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[200px]">
                          <p className="text-xs font-bold text-slate-700 mb-2">{label}</p>
                          <div className="flex justify-between text-xs mb-0.5"><span className="flex gap-1 items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>c/ NF-e</span><span className="font-semibold">{formatBRLCompact(Number(com))}</span></div>
                          <div className="flex justify-between text-xs mb-0.5"><span className="flex gap-1 items-center"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block"/>s/ NF-e</span><span className="font-semibold">{formatBRLCompact(Number(sem))}</span></div>
                          <div className="border-t border-slate-100 mt-1.5 pt-1.5 flex justify-between text-xs">
                            <span className="text-slate-500">Total</span><span className="font-bold">{formatBRLCompact(tot)}</span>
                          </div>
                          {pct != null && <div className="flex justify-between text-xs mt-0.5"><span className="text-slate-500">Cobertura</span><span className={`font-bold ${Number(pct) >= 70 ? "text-emerald-600" : Number(pct) >= 40 ? "text-amber-600" : "text-rose-600"}`}>{pct}%</span></div>}
                        </div>
                      );
                    }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar yAxisId="val" dataKey="c/ NF-e" fill={GREEN} stackId="cov" radius={[0,0,0,0]} maxBarSize={28} />
                    <Bar yAxisId="val" dataKey="s/ NF-e" fill={RED}   stackId="cov" radius={[4,4,0,0]} maxBarSize={28} />
                    <Line yAxisId="pct" dataKey="% Cobert." stroke="#6366f1" strokeWidth={2} dot={{ fill: "#6366f1", r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )
            }
          </ChartCard>

          {/* BarChart horizontal — Top fornecedores */}
          <ChartCard
            title="NF-e por Fornecedor"
            subtitle={`Top ${Math.min(topForn.length, 10)} fornecedores · ${periodoLabel}`}
            height={Math.max(240, Math.min(topForn.length, 10) * 36 + 24)}
            className="md:col-span-5"
            onOpen={topForn.length > 0 ? () => setDlg("nfeRecebidas") : undefined}
            openLabel="Ver todas"
          >
            {treemapData.length === 0
              ? <EmptyState />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={treemapData.slice(0, 10)}
                    margin={{ top: 4, right: 120, left: 4, bottom: 4 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 11, fill: "#475569" }}
                      tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 19) + "…" : v}
                    />
                    <Tooltip
                      cursor={{ fill: "#f1f5f9" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[200px]">
                            <p className="text-xs font-bold text-slate-800 mb-1 leading-snug">{d.name}</p>
                            <p className="text-sm font-bold" style={{ color: d.fill }}>{formatBRL(d.value)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{d.qtd} NF{d.qtd !== 1 ? "s" : ""} · {totalForn > 0 ? Math.round((d.value / totalForn) * 100) : 0}% do total</p>
                            <p className="text-xs text-violet-500 mt-1.5 font-medium">Clique para ver as notas →</p>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={28}
                      cursor="pointer"
                      onClick={(barData: any) => {
                        if (!barData?.cnpj) return;
                        setSelectedFornCnpj(barData.cnpj);
                        setDlg("fornecedorDetail");
                      }}
                    >
                      {treemapData.slice(0, 10).map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="right"
                        formatter={(v: number) => formatBRL(v)}
                        style={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </ChartCard>
        </div>

        {/* ── Gráfico 3: Top fornecedores — lista detalhada ─────────────── */}
        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Ranking de Fornecedores — NF-e Recebidas</h3>
              <p className="text-xs text-slate-400">{topForn.length} fornecedor{topForn.length !== 1 ? "es" : ""} · {periodoLabel} · total {formatBRL(totalForn)}</p>
            </div>
            {topForn.length > 10 && (
              <button type="button" onClick={() => setDlg("nfeRecebidas")}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium">
                Ver todos ({topForn.length})
              </button>
            )}
          </div>
          {topForn.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">Sem NF-e recebidas no período.</p>
          )}
          <div className="space-y-2">
            {topForn.slice(0, 10).map((f, i) => {
              const pct   = totalForn > 0 ? (f.total / totalForn) * 100 : 0;
              const ticket = f.qtd > 0 ? f.total / f.qtd : 0;
              return (
                <div
                  key={f.cnpj}
                  className="flex items-center gap-3 group cursor-pointer hover:bg-slate-50 rounded-lg px-1 -mx-1 transition-colors"
                  onClick={() => { setSelectedFornCnpj(f.cnpj); setDlg("fornecedorDetail"); }}
                >
                  <span className="w-5 text-xs font-black tabular-nums shrink-0 text-right"
                    style={{ color: PALETTE[i % PALETTE.length] }}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-slate-700 leading-tight" title={f.nome}
                        style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {f.nome}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] text-slate-400 tabular-nums hidden sm:block">
                          {f.qtd} NF{f.qtd !== 1 ? "s" : ""} · tkt médio {formatBRLCompact(ticket)}
                        </span>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full text-white tabular-nums"
                          style={{ backgroundColor: PALETTE[i % PALETTE.length] }}>
                          {pct.toFixed(1)}%
                        </span>
                        <span className="text-xs font-bold text-slate-800 tabular-nums w-24 text-right">{formatBRL(f.total)}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${(f.total / topFornMax) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Pendências */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1">
            Pendências — ação necessária
          </h2>
          <div className="grid md:grid-cols-4 gap-3">
            <PendCard icon={ArrowDownLeft} label="Entradas sem NFS-e emitida"
              count={data?.entradasSemNota?.length ?? 0}
              total={sumB(data?.entradasSemNota ?? [])}
              color="amber" onClick={() => setDlg("entradasSemNota")} />
            <PendCard icon={ArrowUpRight} label="Saídas sem NF-e recebida"
              count={data?.saidasSemNota?.length ?? 0}
              total={sumB(data?.saidasSemNota ?? [])}
              color="rose" onClick={() => setDlg("saidasSemNota")} />
            <PendCard icon={ShoppingCart} label="OCs sem NF-e vinculada"
              count={data?.ocsSemNota?.length ?? 0}
              total={data?.ocsSemNota?.reduce((s: number, r: any) => s + parseFloat(r.valor_total ?? "0"), 0) ?? 0}
              color="orange" onClick={() => setDlg("ocsSemNota")} />
            <PendCard icon={FileText} label="NF-e sem OC vinculada"
              count={data?.nfeSemOc?.length ?? 0}
              total={data?.nfeSemOc?.reduce((s: number, r: any) => s + Math.abs(parseFloat(r.valor_bruto ?? "0")), 0) ?? 0}
              color="rose" onClick={() => setDlg("nfeSemOc")} />
          </div>
        </div>

        {/* OC × NF-e accordion */}
        <OcNfeSection
          data={data}
          onOpenSem={() => setDlg("ocsSemNota")}
          onOpenCom={() => setDlg("ocsComNota")}
          onOpenNfeSem={() => setDlg("nfeSemOc")}
        />

        {/* ── Carga Tributária — NFS-e Emitidas ─────────────────────────── */}
        <Card className="p-5 border-slate-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-violet-600" />
              <div>
                <h2 className="text-base font-bold text-slate-800">Carga Tributária — NFS-e Emitidas</h2>
                <p className="text-xs text-slate-400 mt-0.5">ISS · INSS · IRRF · PIS/COFINS · CSLL · Outras retenções · {periodoLabel}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-3xl font-black tabular-nums ${(trib?.nfse.cargaEfetiva ?? 0) > 10 ? "text-red-600" : (trib?.nfse.cargaEfetiva ?? 0) > 5 ? "text-amber-600" : "text-emerald-600"}`}>
                {(trib?.nfse.cargaEfetiva ?? 0).toFixed(1)}%
              </span>
              <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Carga Efetiva</p>
            </div>
          </div>

          {/* KPI cards de impostos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {[
              { label: "ISS Retido",   val: trib?.nfse.iss,       color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200", tip: `Alíq. base: ${(trib?.nfse.baseIss ?? 0) > 0 ? ((trib?.nfse.iss ?? 0) / (trib?.nfse.baseIss ?? 1) * 100).toFixed(2) + "%" : "—"}` },
              { label: "INSS Retido",  val: trib?.nfse.inss,      color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200"   },
              { label: "IRRF Retido",  val: trib?.nfse.irrf,      color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200"  },
              { label: "PIS / COFINS", val: trib?.nfse.pisCofins,  color: "text-rose-700",   bg: "bg-rose-50",   border: "border-rose-200"   },
              { label: "CSLL",         val: trib?.nfse.csll,      color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
              { label: "Outras",       val: trib?.nfse.outras,    color: "text-slate-700",  bg: "bg-slate-50",  border: "border-slate-200"  },
            ].map(({ label, val, color, bg, border, tip }) => (
              <div key={label} className={`${bg} ${border} border rounded-xl p-3 text-center`} title={tip}>
                <p className="text-[11px] text-slate-500 font-semibold mb-1 leading-tight">{label}</p>
                <p className={`text-sm font-black tabular-nums ${color}`}>{formatBRL(val ?? 0)}</p>
                {(trib?.nfse.bruto ?? 0) > 0 && (val ?? 0) > 0 && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{((val! / trib!.nfse.bruto) * 100).toFixed(2)}%</p>
                )}
              </div>
            ))}
          </div>

          {/* Fluxo bruto → deduções → retenções → líquido */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            {[
              { label: "Valor Bruto",    val: trib?.nfse.bruto,          color: "bg-slate-700"   },
              { label: "− Deduções",     val: -(trib?.nfse.deducoes ?? 0), color: "bg-rose-400"  },
              { label: "Base ISS",       val: trib?.nfse.baseIss,         color: "bg-violet-400" },
              { label: "− Retenções",    val: -(trib?.nfse.totalRetencoes ?? 0), color: "bg-red-500" },
              { label: "Valor Líquido",  val: trib?.nfse.liquido,         color: "bg-emerald-500" },
            ].map(({ label, val, color }, idx) => (
              <div key={label} className="flex items-center gap-2 shrink-0">
                {idx > 0 && <span className="text-slate-300 font-bold">→</span>}
                <div className={`${color} rounded-lg px-3 py-2 text-white text-center min-w-[100px]`}>
                  <p className="text-[10px] font-semibold opacity-80 uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-black tabular-nums">{formatBRL(Math.abs(val ?? 0))}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Barras de magnitude das retenções */}
          {(trib?.nfse.totalRetencoes ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Distribuição das Retenções</p>
              {[
                { label: "ISS Retido",   val: trib?.nfse.iss,       color: "bg-violet-500" },
                { label: "INSS Retido",  val: trib?.nfse.inss,      color: "bg-blue-500"   },
                { label: "IRRF Retido",  val: trib?.nfse.irrf,      color: "bg-amber-500"  },
                { label: "PIS/COFINS",   val: trib?.nfse.pisCofins,  color: "bg-rose-500"   },
                { label: "CSLL",         val: trib?.nfse.csll,      color: "bg-indigo-500" },
                { label: "Outras",       val: trib?.nfse.outras,    color: "bg-slate-400"  },
              ].filter(x => (x.val ?? 0) > 0).map(({ label, val, color }) => {
                const pct = ((val ?? 0) / trib!.nfse.totalRetencoes) * 100;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 w-24 shrink-0 text-right">{label}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 w-16 tabular-nums text-right">{formatBRL(val ?? 0)}</span>
                    <span className="text-[10px] text-slate-400 w-10 tabular-nums">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-700 w-24 shrink-0 text-right">Total</span>
                <div className="flex-1" />
                <span className="text-[11px] font-black text-slate-800 w-16 tabular-nums text-right">{formatBRL(trib?.nfse.totalRetencoes ?? 0)}</span>
                <span className="text-[10px] text-slate-400 w-10 tabular-nums">{(trib?.nfse.cargaEfetiva ?? 0).toFixed(1)}%</span>
              </div>
            </div>
          )}

          {/* Evolução mensal de retenções (ano todo) */}
          {mes === 0 && (trib?.nfse.mensal ?? []).some((r: any) => r.iss + r.inss + r.irrf + r.csll + r.pisCofins > 0) && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Retenções Mês a Mês — {ano}</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trib!.nfse.mensal} margin={{ top: 4, right: 12, bottom: 2, left: 4 }} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#94a3b8" }} width={60} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
                  <Bar dataKey="iss"       stackId="t" fill="#8b5cf6" name="ISS"      />
                  <Bar dataKey="inss"      stackId="t" fill="#3b82f6" name="INSS"     />
                  <Bar dataKey="irrf"      stackId="t" fill="#f59e0b" name="IRRF"     />
                  <Bar dataKey="pisCofins" stackId="t" fill="#f43f5e" name="PIS/COFINS" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Rodapé: optante simples + tributada no município */}
          {(trib?.nfse.qtd ?? 0) > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>📋 <strong>{trib?.nfse.qtd}</strong> NFS-e no período</span>
              <span>🏛 Optantes Simples: <strong>{trib?.nfse.simplesCount}</strong></span>
              <span>🏙 Tributadas no município: <strong>{trib?.nfse.tributadaCount}</strong></span>
              <span>📐 Base ISS: <strong>{formatBRL(trib?.nfse.baseIss ?? 0)}</strong></span>
            </div>
          )}

          {(trib?.nfse.qtd ?? 0) === 0 && !tributariaQuery.isLoading && (
            <EmptyState message="Nenhuma NFS-e emitida no período para análise tributária." />
          )}
        </Card>

        {/* ── Análise de Entradas — NF-e Recebidas ──────────────────────── */}
        <Card className="p-5 border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-800">Perfil das Entradas — NF-e Recebidas</h2>
              <p className="text-xs text-slate-400 mt-0.5">Ticket médio · fornecedores ativos · status · extremos de valor · {periodoLabel}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <p className="text-[11px] text-slate-500 font-semibold mb-1">Ticket Médio</p>
              <p className="text-sm font-black text-blue-700 tabular-nums">{formatBRL(trib?.nfe.ticketMedio ?? 0)}</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
              <p className="text-[11px] text-slate-500 font-semibold mb-1">Fornecedores Únicos</p>
              <p className="text-sm font-black text-indigo-700 tabular-nums">{trib?.nfe.fornecedoresUnicos ?? 0}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-[11px] text-slate-500 font-semibold mb-1">Pendentes</p>
              <p className="text-sm font-black text-amber-700 tabular-nums">{trib?.nfe.pendentes ?? 0}</p>
              {(trib?.nfe.qtd ?? 0) > 0 && (
                <p className="text-[10px] text-slate-400">{Math.round(((trib?.nfe.pendentes ?? 0) / (trib?.nfe.qtd ?? 1)) * 100)}% do total</p>
              )}
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-[11px] text-slate-500 font-semibold mb-1">Com Lançamento</p>
              <p className="text-sm font-black text-emerald-700 tabular-nums">{trib?.nfe.comLancamento ?? 0}</p>
              {(trib?.nfe.qtd ?? 0) > 0 && (
                <p className="text-[10px] text-slate-400">{Math.round(((trib?.nfe.comLancamento ?? 0) / (trib?.nfe.qtd ?? 1)) * 100)}% do total</p>
              )}
            </div>
          </div>

          {/* Extremos de valor */}
          {(trib?.nfe.qtd ?? 0) > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <TrendingDown className="w-8 h-8 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-500 font-semibold">Menor NF-e</p>
                  <p className="text-sm font-black text-slate-700 tabular-nums">{formatBRL(trib?.nfe.menorNf ?? 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <TrendingUp className="w-8 h-8 text-blue-500 shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-500 font-semibold">Maior NF-e</p>
                  <p className="text-sm font-black text-slate-700 tabular-nums">{formatBRL(trib?.nfe.maiorNf ?? 0)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Barra de status visual */}
          {(trib?.nfe.qtd ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status das NF-e</p>
              {[
                { label: "Com Lançamento", val: trib?.nfe.comLancamento ?? 0, color: "bg-emerald-500", textColor: "text-emerald-700" },
                { label: "Pendentes",      val: trib?.nfe.pendentes ?? 0,     color: "bg-amber-400",   textColor: "text-amber-700"   },
                { label: "Sem vínculo",    val: Math.max(0, (trib?.nfe.qtd ?? 0) - (trib?.nfe.pendentes ?? 0) - (trib?.nfe.comLancamento ?? 0)), color: "bg-slate-300", textColor: "text-slate-500" },
              ].filter(x => x.val > 0).map(({ label, val, color, textColor }) => {
                const pct = (val / (trib?.nfe.qtd ?? 1)) * 100;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`text-[11px] font-medium w-28 shrink-0 text-right ${textColor}`}>{label}</span>
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 tabular-nums w-8 text-right">{val}</span>
                    <span className="text-[10px] text-slate-400 w-10 tabular-nums">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total e rodapé */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>📦 <strong>{trib?.nfe.qtd ?? 0}</strong> NF-e no período</span>
            <span>💰 Total: <strong>{formatBRL(trib?.nfe.total ?? 0)}</strong></span>
            <span>👥 Fornecedores únicos: <strong>{trib?.nfe.fornecedoresUnicos ?? 0}</strong></span>
          </div>

          {(trib?.nfe.qtd ?? 0) === 0 && !tributariaQuery.isLoading && (
            <EmptyState message="Nenhuma NF-e recebida no período." />
          )}
        </Card>

        {/* Evolução 5 Anos — Entradas × Saídas */}
        {multiYearData.length >= 2 && (() => {
          const chartData = multiYearData.map(d => ({
            ano: String(d.ano),
            "NF-e Recebidas": d.nfeTotal,
            "NFS-e Emitidas":  d.nfseTotal,
            _nfeCount: d.nfeCount,
            _nfseCount: d.nfseCount,
          }));
          const totalNfe  = multiYearData.reduce((s, d) => s + d.nfeTotal,  0);
          const totalNfse = multiYearData.reduce((s, d) => s + d.nfseTotal, 0);
          return (
            <Card className="p-4 border-slate-200">
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm md:text-base">
                    Evolução {multiYearData.length} Anos — Entradas × Saídas
                  </h3>
                  <p className="text-xs text-slate-400">
                    NF-e Recebidas (compras) vs NFS-e Emitidas (faturamento) · {multiYearData[0]?.ano}–{multiYearData[multiYearData.length - 1]?.ano}
                  </p>
                </div>
                <div className="flex gap-3 text-xs shrink-0">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: GREEN }} />
                    Entradas
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: VIOLET }} />
                    Saídas
                  </span>
                </div>
              </div>

              {/* BarChart agrupado */}
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barCategoryGap="22%" barGap={3} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="ano" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => formatBRLCompact(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[210px]">
                          <p className="text-xs font-bold text-slate-700 mb-2">{label}</p>
                          {payload.map((p: any) => {
                            const count = p.dataKey === "NF-e Recebidas" ? p.payload._nfeCount : p.payload._nfseCount;
                            return (
                              <div key={p.dataKey} className="flex items-center justify-between gap-3 mb-1">
                                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                                  <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: p.color }} />
                                  {p.name}
                                </span>
                                <div className="text-right">
                                  <span className="text-xs font-semibold tabular-nums text-slate-800">{formatBRLCompact(Number(p.value))}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">({count} NFs)</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="NF-e Recebidas" fill={GREEN} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="NF-e Recebidas" position="top" formatter={(v: number) => v > 0 ? formatBRLCompact(v) : ""} style={{ fontSize: 10, fill: "#64748b" }} />
                  </Bar>
                  <Bar dataKey="NFS-e Emitidas" fill={VIOLET} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="NFS-e Emitidas" position="top" formatter={(v: number) => v > 0 ? formatBRLCompact(v) : ""} style={{ fontSize: 10, fill: "#64748b" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Tabela resumo */}
              <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Ano</th>
                      <th className="px-3 py-2 text-right font-semibold text-emerald-700">NF-e Recebidas</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-400">Δ%</th>
                      <th className="px-3 py-2 text-right font-semibold text-violet-700">NFS-e Emitidas</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-400">Δ%</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiYearData.map((d, i) => {
                      const prev = multiYearData[i - 1];
                      const dNfe  = prev && prev.nfeTotal  > 0 ? ((d.nfeTotal  - prev.nfeTotal)  / prev.nfeTotal)  * 100 : null;
                      const dNfse = prev && prev.nfseTotal > 0 ? ((d.nfseTotal - prev.nfseTotal) / prev.nfseTotal) * 100 : null;
                      const saldo = d.nfseTotal - d.nfeTotal;
                      const isCurrentYear = d.ano === new Date().getFullYear();
                      return (
                        <tr key={d.ano} className={`border-t border-slate-100 ${isCurrentYear ? "bg-violet-50/40" : "hover:bg-slate-50"}`}>
                          <td className="px-3 py-2 font-semibold text-slate-700">
                            {d.ano}{isCurrentYear && <span className="ml-1 text-[10px] text-violet-500 font-normal">atual</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                            {d.nfeTotal > 0 ? formatBRL(d.nfeTotal) : <span className="text-slate-300">—</span>}
                            {d.nfeCount > 0 && <span className="ml-1 text-slate-400">({d.nfeCount})</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {dNfe == null ? <span className="text-slate-300">—</span> : (
                              <span className={dNfe >= 0 ? "text-emerald-600" : "text-red-500"}>
                                {dNfe >= 0 ? "+" : ""}{dNfe.toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                            {d.nfseTotal > 0 ? formatBRL(d.nfseTotal) : <span className="text-slate-300">—</span>}
                            {d.nfseCount > 0 && <span className="ml-1 text-slate-400">({d.nfseCount})</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {dNfse == null ? <span className="text-slate-300">—</span> : (
                              <span className={dNfse >= 0 ? "text-emerald-600" : "text-red-500"}>
                                {dNfse >= 0 ? "+" : ""}{dNfse.toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-semibold ${saldo >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {(d.nfeTotal > 0 || d.nfseTotal > 0) ? formatBRL(saldo) : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-700">Total período</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{formatBRL(totalNfe)}</td>
                      <td />
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-violet-700">{formatBRL(totalNfse)}</td>
                      <td />
                      <td className={`px-3 py-2 text-right tabular-nums font-bold ${totalNfse - totalNfe >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {formatBRL(totalNfse - totalNfe)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          );
        })()}

        {/* ── Comparativo Trimestral — últimos 5 anos ───────────────────── */}
        {quarterlyData.anos.length >= 2 && (() => {
          const anos = quarterlyData.anos;
          const quarters = quarterlyData.quarters;
          const YEAR_COLORS = ["#7c3aed","#2563eb","#059669","#d97706","#dc2626"];
          const fmtDelta = (curr: number, prev: number) => {
            if (!prev) return null;
            const d = ((curr - prev) / prev) * 100;
            return d;
          };
          return (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Comparativo Trimestral — NFS-e Emitidas</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Evolução por trimestre · {anos[0]}–{anos[anos.length-1]} · últimos {anos.length} anos</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {anos.map((a, i) => (
                    <span key={a} className="flex items-center gap-1 text-xs text-slate-600">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              {/* BarChart agrupado */}
              <div className="h-52 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quarters} barCategoryGap="20%" barGap={2} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="trimestre" tick={{ fontSize: 12, fontWeight: 600, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 10, fill: "#94a3b8" }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
                            <p className="font-bold text-slate-700 mb-2">{label}</p>
                            {payload.map((p: any) => (
                              <p key={p.dataKey} style={{ color: p.fill }} className="flex justify-between gap-3 mb-0.5">
                                <span>{p.name}:</span>
                                <span className="font-bold tabular-nums">{formatBRL(Number(p.value))}</span>
                              </p>
                            ))}
                            {payload.length > 1 && (
                              <p className="border-t border-slate-100 mt-1.5 pt-1.5 flex justify-between font-bold text-slate-700">
                                <span>Total:</span>
                                <span className="tabular-nums">{formatBRL(total)}</span>
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    {anos.map((a, i) => (
                      <Bar key={a} dataKey={`nfse_${a}`} name={String(a)}
                        fill={YEAR_COLORS[i % YEAR_COLORS.length]}
                        radius={[3,3,0,0]} maxBarSize={18} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tabela: linhas = trimestres, colunas = anos */}
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Tri</th>
                      {anos.map((a, i) => (
                        <th key={a} className="px-3 py-2 text-right font-semibold" style={{ color: YEAR_COLORS[i % YEAR_COLORS.length] }}>
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quarters.map((q, qi) => (
                      <tr key={q.trimestre as string} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-1.5 font-bold text-slate-700">{q.trimestre}</td>
                        {anos.map((a, ai) => {
                          const val  = Number(q[`nfse_${a}`]) || 0;
                          const prev = ai > 0 ? Number(q[`nfse_${anos[ai-1]}`]) || 0 : null;
                          const delta = prev != null ? fmtDelta(val, prev) : null;
                          return (
                            <td key={a} className="px-3 py-1.5 text-right">
                              {val > 0
                                ? <span className="tabular-nums text-slate-800">{formatBRL(val)}</span>
                                : <span className="text-slate-300">—</span>
                              }
                              {delta != null && (
                                <span className={`ml-1 text-[10px] font-medium ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}%
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-700">Total</td>
                      {quarterlyData.anuais.map((d, ai) => {
                        const prev = ai > 0 ? quarterlyData.anuais[ai-1].nfseTotal : null;
                        const delta = prev != null ? fmtDelta(d.nfseTotal, prev) : null;
                        return (
                          <td key={d.ano} className="px-3 py-2 text-right font-bold text-violet-700 tabular-nums">
                            {d.nfseTotal > 0 ? formatBRL(d.nfseTotal) : <span className="text-slate-300">—</span>}
                            {delta != null && d.nfseTotal > 0 && (
                              <span className={`ml-1 text-[10px] font-medium ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(0)}%
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          );
        })()}

        {/* Comparativo anual — NF-e Recebidas */}
        <ComparativoAnual
          title="Comparativo Anual — NF-e Recebidas"
          subtitle={`Valor mensal · ${ano} vs ${ano - 1}`}
          serieAtual={nfeByMonth}
          seriePrev={prevNfeByMonth}
          anoAtual={ano}
          anoPrev={ano - 1}
          goodWhen="up"
          valorLabel="NF-e"
        />

        {/* Comparativo anual — NFS-e Emitidas */}
        <ComparativoAnual
          title="Comparativo Anual — NFS-e Emitidas"
          subtitle={`Valor mensal · ${ano} vs ${ano - 1}`}
          serieAtual={nfseByMonth}
          seriePrev={prevNfseByMonth}
          anoAtual={ano}
          anoPrev={ano - 1}
          goodWhen="up"
          valorLabel="NFS-e"
        />

        {/* Detail dialogs */}
        <DetailDialog
          open={dlg === "nfeRecebidas"} onOpenChange={o => !o && setDlg(null)}
          title="NF-e Recebidas — Detalhe completo"
          subtitle={`${data?.nfeRecebidas?.length ?? 0} notas · ${periodoLabel}`}
          columns={COL_NF} rows={data?.nfeRecebidas ?? []} totalKey="valor_bruto"
          icon={FileText}
          onGoTo={() => { nav("/financeiro/notas-fiscais"); setDlg(null); }}
          goLabel="Ir para NF-e Recebidas"
        />
        <DetailDialog
          open={dlg === "nfseEmitidas"} onOpenChange={o => !o && setDlg(null)}
          title="NFS-e Emitidas — Detalhe completo"
          subtitle={`${data?.nfseEmitidas?.length ?? 0} notas · ${periodoLabel}`}
          columns={COL_NFSE} rows={data?.nfseEmitidas ?? []} totalKey="valor_bruto"
          icon={Receipt}
          onGoTo={() => { nav("/financeiro/notas-fiscais"); setDlg(null); }}
          goLabel="Ir para NFS-e Emitidas"
        />
        <DetailDialog
          open={dlg === "saidasSemNota"} onOpenChange={o => !o && setDlg(null)}
          title="Saídas Bancárias sem NF-e Recebida"
          subtitle={`${data?.saidasSemNota?.length ?? 0} lançamentos sem nota fiscal de compra`}
          columns={COL_BANK} rows={data?.saidasSemNota ?? []} totalKey="valor"
          icon={ArrowUpRight}
        />
        <DetailDialog
          open={dlg === "entradasSemNota"} onOpenChange={o => !o && setDlg(null)}
          title="Entradas Bancárias sem NFS-e Emitida"
          subtitle={`${data?.entradasSemNota?.length ?? 0} entradas sem nota de serviço vinculada`}
          columns={COL_BANK} rows={data?.entradasSemNota ?? []} totalKey="valor"
          icon={ArrowDownLeft}
        />
        <DetailDialog
          open={dlg === "ocsSemNota"} onOpenChange={o => !o && setDlg(null)}
          title="OCs sem NF-e Vinculada"
          subtitle={`${data?.ocsSemNota?.length ?? 0} ordens de compra sem nota fiscal recebida`}
          columns={COL_OC_SEM} rows={data?.ocsSemNota ?? []} totalKey="valor_total"
          icon={ShoppingCart}
          onGoTo={() => { nav("/financeiro/notas-fiscais"); setDlg(null); }}
          goLabel="Ir para Panorama Fiscal"
        />
        <DetailDialog
          open={dlg === "ocsComNota"} onOpenChange={o => !o && setDlg(null)}
          title="OCs com NF-e Vinculada"
          subtitle={`${data?.ocsComNota?.length ?? 0} ordens conciliadas com nota fiscal`}
          columns={COL_OC} rows={data?.ocsComNota ?? []} totalKey="valor_total"
          icon={CheckCircle2}
        />
        <DetailDialog
          open={dlg === "nfeSemOc"} onOpenChange={o => !o && setDlg(null)}
          title="NF-e sem OC Vinculada"
          subtitle={`${data?.nfeSemOc?.length ?? 0} notas recebidas sem ordem de compra correspondente`}
          columns={COL_NF} rows={data?.nfeSemOc ?? []} totalKey="valor_bruto"
          icon={FileText}
          onGoTo={() => { nav("/financeiro/notas-fiscais"); setDlg(null); }}
          goLabel="Ir para NF-e Recebidas"
        />
        <DetailDialog
          open={dlg === "fornecedorDetail"}
          onOpenChange={o => { if (!o) { setDlg(null); setSelectedFornCnpj(null); } }}
          title={fornName || "Fornecedor"}
          subtitle={`${fornRows.length} NF-e recebidas · ${periodoLabel}`}
          columns={COL_NF} rows={fornRows} totalKey="valor_bruto"
          icon={FileText}
          onGoTo={() => { nav("/financeiro/notas-fiscais"); setDlg(null); setSelectedFornCnpj(null); }}
          goLabel="Ir para NF-e Recebidas"
        />
      </div>
    </DashboardLayout>
  );
}
