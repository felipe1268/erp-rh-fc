import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { useCompany } from "@/hooks/useCompany";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell,
} from "recharts";
import {
  FileText, ShoppingCart, Receipt, Building2, CheckCircle2,
  ArrowDownLeft, ArrowUpRight, Banknote,
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
    .map(([cnpj, v]) => ({ cnpj, ...v }))
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
function OcNfeSection({ data, onOpenSem, onOpenCom }: { data: any; onOpenSem: () => void; onOpenCom: () => void }) {
  const [openSem, setOpenSem] = useState(false);
  const [openCom, setOpenCom] = useState(true);
  if (!data) return null;
  const comNota: any[] = data.ocsComNota ?? [];
  const semNota: any[] = data.ocsSemNota ?? [];
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
      </div>
    </Card>
  );
}

/* ─────────────────── Main Dashboard ─────────────────── */
type DlgKey = "nfeRecebidas"|"nfseEmitidas"|"saidasSemNota"|"entradasSemNota"|"ocsSemNota"|"ocsComNota";

export default function DashNotasFiscais() {
  const [, nav] = useLocation();
  const { companyId } = useCompany();
  const curYear = new Date().getFullYear();
  const [ano, setAno] = useState(curYear);
  const [mes, setMes] = useState(0);
  const [dlg, setDlg] = useState<DlgKey | null>(null);

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
  const prevNfseByMonth = useMemo(() => groupByMonth(prevData?.nfseEmitidas ?? [], "data_emissao", "valor_bruto"), [prevData]);

  const barData = useMemo(() => MESES_ABREV.map((m, i) => ({
    mes: m,
    "NF-e Recebidas": nfeByMonth[i],
    "NFS-e Emitidas": nfseByMonth[i],
    "Saídas Bancárias": saiByMonth[i],
  })), [nfeByMonth, nfseByMonth, saiByMonth]);

  const barDataMes = mes !== 0 ? [{
    mes: MESES_ABREV[mes - 1],
    "NF-e Recebidas": resumo?.nfeRecebidas.total ?? 0,
    "NFS-e Emitidas": resumo?.nfseEmitidas.total ?? 0,
    "Saídas Bancárias": resumo?.saidasBancarias.total ?? 0,
  }] : barData;

  const prevNfeByMonth = useMemo(() => groupByMonth(prevData?.nfeRecebidas ?? [], "data_emissao", "valor_bruto"), [prevData]);
  const topForn        = useMemo(() => groupFornecedores(data?.nfeRecebidas ?? []), [data]);
  const topFornMax     = topForn[0]?.total ?? 1;
  const pieData        = topForn.slice(0, 8).map((f, i) => ({
    name: f.nome.length > 22 ? f.nome.slice(0, 22) + "…" : f.nome,
    value: f.total,
    color: PALETTE[i % PALETTE.length],
  }));

  const periodoLabel = mes === 0 ? String(ano) : `${MESES_ABREV[mes - 1]}/${ano}`;
  const indiceGeral  = resumo
    ? Math.round(((resumo.coberturaNfseReceita ?? 0) + (resumo.coberturaOcNfe ?? 0) + (resumo.coberturaSaidaNfe ?? 0)) / 3)
    : 0;

  const sumB = (arr: any[], k = "valor") => arr?.reduce((s, r) => s + Math.abs(parseFloat(r[k] ?? "0")), 0) ?? 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-5 p-4 md:p-6">

        {/* Header */}
        <DashHeader
          theme="violet"
          icon={FileText}
          title="Dashboard — Notas Fiscais"
          subtitle="Análise NF-e × NFS-e × OCs × Extrato Bancário"
          ano={ano}
          onAno={setAno}
          onRefresh={() => { pQuery.refetch(); anoQuery.refetch(); prevQuery.refetch(); }}
        />

        {/* Seletor de mês */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[{ label: "Ano todo", val: 0 }, ...MESES_ABREV.map((m, i) => ({ label: m, val: i + 1 }))].map(({ label, val }) => (
            <button
              key={val}
              type="button"
              onClick={() => setMes(val)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border
                ${mes === val
                  ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:text-violet-700"
                }`}
            >
              {label}
            </button>
          ))}
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

        {/* Charts */}
        <div className="grid md:grid-cols-3 gap-4">
          <ChartCard
            title="NF-e Recebidas × NFS-e Emitidas × Saídas por mês"
            subtitle={`Valores mensais — ${ano}`}
            height={270}
            className="md:col-span-2"
          >
            {barDataMes.every(d => !d["NF-e Recebidas"] && !d["NFS-e Emitidas"] && !d["Saídas Bancárias"])
              ? <EmptyState message="Sem dados para o período." />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barDataMes} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={formatBRLCompact} tick={{ fontSize: 10 }} width={72} />
                    <Tooltip content={<BRLTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="NF-e Recebidas"  fill={BLUE}   radius={[3,3,0,0]} maxBarSize={22} />
                    <Bar dataKey="NFS-e Emitidas"  fill={GREEN}  radius={[3,3,0,0]} maxBarSize={22} />
                    <Bar dataKey="Saídas Bancárias" fill={AMBER} radius={[3,3,0,0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )
            }
          </ChartCard>

          <ChartCard
            title="NF-e por Fornecedor"
            subtitle={`Top ${pieData.length} · ${periodoLabel}`}
            height={270}
            onOpen={topForn.length > 0 ? () => setDlg("nfeRecebidas") : undefined}
            openLabel="Ver todas"
          >
            {pieData.length === 0
              ? <EmptyState />
              : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData} dataKey="value" nameKey="name"
                      cx="50%" cy="48%" outerRadius={90} innerRadius={46}
                      paddingAngle={2}
                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                      labelLine={false} fontSize={10}
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatBRL(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              )
            }
          </ChartCard>
        </div>

        {/* Top fornecedores lista */}
        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-slate-800 text-sm">Top Fornecedores — NF-e Recebidas</h3>
              <p className="text-xs text-slate-400">{topForn.length} fornecedor{topForn.length !== 1 ? "es" : ""} · {periodoLabel}</p>
            </div>
            {topForn.length > 8 && (
              <button type="button" onClick={() => setDlg("nfeRecebidas")}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium">
                Ver todos ({topForn.length})
              </button>
            )}
          </div>
          {topForn.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">Sem NF-e recebidas no período.</p>
          )}
          <div className="space-y-2.5">
            {topForn.slice(0, 10).map((f, i) => (
              <div key={f.cnpj} className="flex items-center gap-3">
                <span className="w-5 text-xs font-bold text-slate-400 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-700 truncate" title={f.nome}>{f.nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400 tabular-nums">{f.qtd} NF{f.qtd !== 1 ? "s" : ""}</span>
                      <span className="text-xs font-bold text-slate-800 tabular-nums">{formatBRL(f.total)}</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(f.total / topFornMax) * 100}%`, backgroundColor: PALETTE[i % PALETTE.length] }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Pendências */}
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1">
            Pendências — ação necessária
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
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
          </div>
        </div>

        {/* OC × NF-e accordion */}
        <OcNfeSection
          data={data}
          onOpenSem={() => setDlg("ocsSemNota")}
          onOpenCom={() => setDlg("ocsComNota")}
        />

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
      </div>
    </DashboardLayout>
  );
}
