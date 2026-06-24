import React, { useState, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, RefreshCw, Printer,
  FileSpreadsheet, AlertTriangle, CheckCircle2,
  Info, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownLeft,
  ShoppingCart, FileWarning, Receipt,
} from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtBRL(v: number | string | null | undefined, opts?: { compact?: boolean }) {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "R$ 0";
  if (opts?.compact) {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
    if (abs >= 1_000) return `R$ ${(abs / 1_000).toFixed(0)}k`;
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(n));
}
function fmtDate(s: string | Date | null | undefined) {
  if (!s) return "—";
  if (s instanceof Date) return s.toLocaleDateString("pt-BR");
  const str = String(s);
  // "YYYY-MM-DD" ou "YYYY-MM-DDTHH:..." → pega os 10 primeiros chars
  const t = str.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t.split("-").reverse().join("/");
  // fallback: tenta parsear qualquer string reconhecível como data
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
  return str;
}
function fmtCnpj(c: string | null | undefined) {
  if (!c) return "—";
  const d = String(c).replace(/\D/g, "");
  if (d.length !== 14) return String(c);
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

// ── Medidor circular SVG ─────────────────────────────────────────────────────
function GaugeMeter({ pct, label, sublabel, size = 96 }: {
  pct: number | null; label: string; sublabel: string; size?: number;
}) {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const circ = 2 * Math.PI * r;
  const val  = pct ?? 0;
  const dash = (val / 100) * circ;
  const color = val >= 80 ? "#10b981" : val >= 50 ? "#f59e0b" : "#ef4444";
  const bg    = val >= 80 ? "#d1fae5" : val >= 50 ? "#fef3c7" : "#fee2e2";
  const textColor = val >= 80 ? "text-emerald-700" : val >= 50 ? "text-amber-700" : "text-red-600";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={bg} strokeWidth="10" />
          <circle
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {pct === null
            ? <span className="text-slate-400 text-lg font-bold">—</span>
            : <span className={`text-xl font-extrabold ${textColor}`}>{val}%</span>
          }
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-700 text-center leading-tight">{label}</p>
      <p className="text-[10px] text-slate-400 text-center">{sublabel}</p>
    </div>
  );
}

// ── Card de alerta de ação ────────────────────────────────────────────────────
function AlertCard({ icon, title, count, total, variant, onClick }: {
  icon: React.ReactNode; title: string; count: number; total: number;
  variant: "danger" | "warn" | "ok"; onClick?: () => void;
}) {
  const styles = {
    danger: "border-red-200 bg-red-50 hover:bg-red-100/80",
    warn:   "border-amber-200 bg-amber-50 hover:bg-amber-100/80",
    ok:     "border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80",
  };
  const countStyle = {
    danger: "bg-red-500 text-white",
    warn:   "bg-amber-500 text-white",
    ok:     "bg-emerald-500 text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-2 p-4 rounded-2xl border transition-colors text-left w-full ${styles[variant]} ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="p-2 rounded-xl bg-white/70">{icon}</div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${countStyle[variant]}`}>{count}</span>
      </div>
      <p className="text-sm font-semibold text-slate-800 leading-snug">{title}</p>
      <p className="text-lg font-extrabold text-slate-900">{fmtBRL(total)}</p>
    </button>
  );
}

// ── Toggle de seção ─────────────────────────────────────────────────────────
function SectionToggle({ title, count, total, open, onToggle, variant = "default" }: {
  title: string; count: number; total?: number; open: boolean; onToggle: () => void;
  variant?: "ok" | "warn" | "default";
}) {
  const base = {
    ok:      "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    warn:    "border-amber-200  bg-amber-50/60  text-amber-800",
    default: "border-slate-200  bg-slate-50/60  text-slate-700",
  };
  const dot = { ok: "bg-emerald-500", warn: "bg-amber-500", default: "bg-slate-400" };
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all hover:brightness-95 ${base[variant]}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot[variant]}`} />
      <span className="flex-1 text-left">{title}</span>
      {total !== undefined && (
        <span className="text-xs font-bold opacity-80 hidden sm:inline">{fmtBRL(total)}</span>
      )}
      <span className="text-xs opacity-60 ml-1">{count} item{count !== 1 ? "s" : ""}</span>
      {open ? <ChevronUp className="h-4 w-4 shrink-0 opacity-50" /> : <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />}
    </button>
  );
}

interface Props {
  companyId: number;
  companyNome?: string;
  companyLogoUrl?: string;
}

export default function PanoramaFiscal({ companyId, companyNome, companyLogoUrl }: Props) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);  // 1-12
  const [ano, setAno] = useState(hoje.getFullYear());
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({
    ocsComNota: false, ocsSemNota: true,
    entComNota: false, entSemNota: true,
    saiComNota: false, saiSemNota: true,
    spedInfo: false,
  });
  const secOcsRef    = useRef<HTMLDivElement>(null);
  const secEntRef    = useRef<HTMLDivElement>(null);
  const secSaiRef    = useRef<HTMLDivElement>(null);
  const printRef     = useRef<HTMLDivElement>(null);

  const toggle = (key: string) => setOpenSec(p => ({ ...p, [key]: !p[key] }));
  const jumpTo = (ref: React.RefObject<HTMLDivElement | null>, secKey: string) => {
    setOpenSec(p => ({ ...p, [secKey]: true }));
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const { data, isFetching, refetch } = trpc.fiscalNotes.getPanoramaFiscal.useQuery(
    { companyId, mes, ano },
    { enabled: !!companyId, staleTime: 60_000 }
  );

  // ── Progresso de loading ──────────────────────────────────────────────────
  const [loadingPct, setLoadingPct] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isFetching) {
      setLoadingPct(0);
      timerRef.current = setInterval(() => {
        setLoadingPct(p => {
          if (p >= 90) { clearInterval(timerRef.current!); return 90; }
          // acelera no início, desacelera perto de 90%
          const step = p < 40 ? 6 : p < 70 ? 3 : 1;
          return Math.min(p + step, 90);
        });
      }, 180);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (loadingPct > 0) setLoadingPct(100);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching]);

  const r = data?.resumo;

  // ── Excel export ──────────────────────────────────────────────────────────
  const exportExcel = useCallback(async () => {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const pl = mes === 0 ? `Ano-${ano}` : `${MESES_SHORT[mes - 1]}/${ano}`;

    const resumoData = [
      ["Panorama Fiscal — " + pl], ["Empresa:", companyNome ?? ""], [""],
      ["INDICADOR", "VALOR (R$)", "COBERTURA NF (%)"],
      ["NFS-e Emitidas", r?.nfseEmitidas.total ?? 0, ""],
      ["NF-e Recebidas", r?.nfeRecebidas.total ?? 0, ""],
      ["Entradas Bancárias", r?.entradasBancarias.total ?? 0, r?.coberturaNfseReceita != null ? `${r.coberturaNfseReceita}%` : "—"],
      ["Saídas Bancárias", r?.saidasBancarias.total ?? 0, r?.coberturaSaidaNfe != null ? `${r.coberturaSaidaNfe}%` : "—"],
      ["Total OCs", r?.totalOcs.total ?? 0, r?.coberturaOcNfe != null ? `${r.coberturaOcNfe}%` : "—"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoData), "Resumo");

    const nfseRows = [["NF#","Tomador","CNPJ Tomador","Valor Bruto","Valor Líquido","Emissão","Status"]];
    for (const n of data.nfseEmitidas ?? [])
      nfseRows.push([n.numero_nf, n.tomador_razao_social ?? "", fmtCnpj(n.tomador_cnpj), parseFloat(n.valor_bruto ?? "0"), parseFloat(n.valor_liquido ?? "0"), fmtDate(n.data_emissao), n.status]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nfseRows), "NFS-e Emitidas");

    const nfeRows = [["NF#","Emitente","CNPJ","Valor","Emissão","Status"]];
    for (const n of data.nfeRecebidas ?? [])
      nfeRows.push([n.numero_nf, n.emitente_nome ?? "", fmtCnpj(n.emitente_cnpj), parseFloat(n.valor_bruto ?? "0"), fmtDate(n.data_emissao), n.status]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nfeRows), "NF-e Recebidas");

    const ocRows = [["OC#","Fornecedor","CNPJ","Valor","Obra","Status","NF#","Emitida em"]];
    for (const o of [...(data.ocsSemNota ?? []), ...(data.ocsComNota ?? [])])
      ocRows.push([o.numero, o.supplier_razao ?? o.supplier_nome, fmtCnpj(o.supplier_cnpj), parseFloat(o.valor_total ?? "0"), o.obra_nome ?? "", o.status, o.nfeNumero ?? "—", fmtDate(o.created_at)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ocRows), "OC vs NF-e");

    const movRows = [["Data","Descrição","Valor","Tipo","Conciliado","NF#"]];
    for (const b of [...(data.saidasSemNota ?? []), ...(data.entradasSemNota ?? [])])
      movRows.push([fmtDate(b.data), b.descricao, parseFloat(b.valor ?? "0"), b.tipo === "credito" ? "Entrada" : "Saída", b.conciliado ? "Sim" : "Não", b.fn_numero ?? "—"]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(movRows), "Movimentos s/ Nota");

    XLSX.writeFile(wb, `panorama-fiscal-${pl.replace("/", "-")}.xlsx`);
  }, [data, mes, ano, companyNome, r]);

  const periodoLabel = mes === 0 ? `Ano ${ano}` : `${MESES[mes - 1]} ${ano}`;
  const periodoShort = mes === 0 ? `${ano}` : `${MESES_SHORT[mes - 1]}/${ano}`;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!data && isFetching) {
    return (
      <div className="flex flex-col items-center justify-center py-28 gap-5 px-6">
        <div className="w-full max-w-sm space-y-3">
          {/* Rótulo */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 font-medium">Carregando panorama fiscal…</span>
            <span className="text-indigo-600 font-bold tabular-nums">{loadingPct}%</span>
          </div>
          {/* Barra de fundo */}
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-200 ease-out"
              style={{ width: `${loadingPct}%` }}
            />
          </div>
          {/* Etapas informativas */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { label: "NFS-e + NF-e", pct: 30 },
              { label: "Extrato bancário", pct: 60 },
              { label: "Cruzamento OC", pct: 90 },
            ].map(step => (
              <div key={step.label}
                className={`flex items-center gap-1.5 text-[11px] transition-colors duration-300 ${
                  loadingPct >= step.pct ? "text-indigo-600 font-semibold" : "text-slate-300"
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-300 ${
                  loadingPct >= step.pct ? "bg-indigo-500" : "bg-slate-200"
                }`} />
                {step.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const ocsSemQtd   = data?.ocsSemNota?.length ?? 0;
  const ocsSemTotal = (data?.ocsSemNota ?? []).reduce((s: number, o: any) => s + parseFloat(o.valor_total ?? "0"), 0);
  const entSemQtd   = data?.entradasSemNota?.length ?? 0;
  const entSemTotal = (data?.entradasSemNota ?? []).reduce((s: number, b: any) => s + Math.abs(parseFloat(b.valor ?? "0")), 0);
  const saiSemQtd   = data?.saidasSemNota?.length ?? 0;
  const saiSemTotal = (data?.saidasSemNota ?? []).reduce((s: number, b: any) => s + Math.abs(parseFloat(b.valor ?? "0")), 0);

  const totalAlerts = ocsSemQtd + entSemQtd + saiSemQtd;
  const saúde = (() => {
    if (!r) return null;
    // Inclui só coberturas com dados reais (null = sem OCs ou sem NFS-e no período → não conta)
    const vals = [r.coberturaNfseReceita, r.coberturaOcNfe, r.coberturaSaidaNfe].filter((v): v is number => v !== null && v !== undefined);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  })();

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #panorama-print-area, #panorama-print-area * { visibility: visible !important; }
          #panorama-print-area { position: fixed; inset: 0; padding: 24px; overflow: visible; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="panorama-print-area" ref={printRef} className="space-y-5 pb-10">

        {/* ── Seletor de período — padrão do sistema ─────────────────────── */}
        <div className="no-print rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
          {/* Linha 1: ano + legend + botões */}
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setAno(a => a - 1)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
              <button type="button" onClick={() => setAno(a => a + 1)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                <ChevronRight className="w-4 h-4" />
              </button>
              {/* Ano todo — mesmo padrão do sistema */}
              <button
                type="button"
                onClick={() => setMes(m => m === 0 ? (hoje.getMonth() + 1) : 0)}
                className={`ml-1 px-3 py-1 rounded-lg border text-xs font-semibold transition-all
                  ${mes === 0
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
              >
                Ano todo
              </button>
            </div>

            <div className="flex-1" />

            {/* Legend */}
            <div className="hidden sm:flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Com dados
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Parcial
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados
              </span>
            </div>

            {/* Botões de ação */}
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => refetch()} disabled={isFetching}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
              <button type="button" onClick={exportExcel} disabled={!data || isFetching}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-40">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel
              </button>
              <button type="button" onClick={() => window.print()} disabled={!data}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-40">
                <Printer className="h-3.5 w-3.5" />
                PDF
              </button>
            </div>
          </div>

          {/* Linha 2: 12 chips de mês */}
          <div className="px-4 py-3 grid grid-cols-6 sm:grid-cols-12 gap-1.5">
            {MESES_SHORT.map((m, i) => {
              const numMes = i + 1;
              const isSelected = mes === numMes;
              const dotColor = isSelected
                ? (data && ((r?.nfseEmitidas.total ?? 0) > 0 || (r?.nfeRecebidas.total ?? 0) > 0)
                    ? "bg-emerald-500"
                    : "bg-amber-400")
                : "bg-gray-300";
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMes(numMes)}
                  className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                    ${isSelected
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                >
                  <span>{m}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Print header */}
        <div className="hidden print:flex items-center justify-between border-b pb-4 mb-4">
          {companyLogoUrl && <img src={companyLogoUrl} alt="" className="h-12 object-contain" />}
          <div className="text-right">
            <p className="text-xl font-bold">Panorama Fiscal — {periodoLabel}</p>
            <p className="text-sm text-slate-500">{companyNome} · {new Date().toLocaleDateString("pt-BR")}</p>
          </div>
        </div>

        {!data ? (
          <div className="text-center py-16 text-slate-400">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Nenhum dado disponível para {periodoShort}.</p>
          </div>
        ) : (
          <>
            {/* ════════════════════════════════════════════════════════════
                PAINEL DE SAÚDE FISCAL
            ════════════════════════════════════════════════════════════ */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
              {/* Header do painel */}
              <div className="px-5 py-4 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold text-base">Saúde Fiscal — {periodoShort}</h2>
                  <p className="text-slate-400 text-xs mt-0.5">Cobertura de documentos fiscais sobre movimentos financeiros</p>
                </div>
                {saúde !== null && (
                  <div className="text-right">
                    <p className={`text-3xl font-black ${saúde >= 80 ? "text-emerald-400" : saúde >= 50 ? "text-amber-400" : "text-red-400"}`}>{saúde}%</p>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wide">índice geral</p>
                  </div>
                )}
              </div>

              {/* Medidores + volumes */}
              <div className="bg-white px-5 py-5">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <GaugeMeter pct={r!.coberturaNfseReceita} label="Receita c/ NFS-e" sublabel="entradas bancárias" size={88} />
                  <GaugeMeter pct={r!.coberturaOcNfe}       label="OC c/ NF-e"      sublabel="ordens de compra"    size={88} />
                  <GaugeMeter pct={r!.coberturaSaidaNfe}    label="Saída c/ nota"   sublabel="débitos bancários"   size={88} />
                </div>

                {/* 5 volumes em linha */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 border-t border-slate-100 pt-4">
                  {[
                    { label: "NFS-e emitidas", val: r!.nfseEmitidas.total,      qtd: r!.nfseEmitidas.qtd,      color: "text-indigo-600",  bg: "bg-indigo-50" },
                    { label: "NF-e recebidas", val: r!.nfeRecebidas.total,       qtd: r!.nfeRecebidas.qtd,      color: "text-sky-600",     bg: "bg-sky-50" },
                    { label: "OCs (compras)",  val: r!.totalOcs.total,           qtd: r!.totalOcs.qtd,          color: "text-violet-600",  bg: "bg-violet-50" },
                    { label: "Entradas banco", val: r!.entradasBancarias.total,  qtd: r!.entradasBancarias.qtd, color: "text-emerald-600", bg: "bg-emerald-50" },
                    { label: "Saídas banco",   val: r!.saidasBancarias.total,    qtd: r!.saidasBancarias.qtd,   color: "text-rose-600",    bg: "bg-rose-50" },
                  ].map(m => (
                    <div key={m.label} className={`rounded-xl px-3 py-2.5 ${m.bg}`}>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">{m.label}</p>
                      <p className={`text-base font-extrabold ${m.color}`}>{fmtBRL(m.val)}</p>
                      <p className="text-[10px] text-slate-400">{m.qtd} doc{m.qtd !== 1 ? "s" : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════
                PAINEL DE AÇÕES — só mostra se há pendências
            ════════════════════════════════════════════════════════════ */}
            {totalAlerts > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold shrink-0">{totalAlerts}</div>
                  <h3 className="text-sm font-bold text-slate-800">Pendências — ação necessária</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ocsSemQtd > 0 && (
                    <AlertCard
                      icon={<ShoppingCart className="h-5 w-5 text-amber-600" />}
                      title="OCs sem NF-e recebida"
                      count={ocsSemQtd} total={ocsSemTotal}
                      variant={ocsSemQtd >= 5 ? "danger" : "warn"}
                      onClick={() => jumpTo(secOcsRef, "ocsSemNota")}
                    />
                  )}
                  {entSemQtd > 0 && (
                    <AlertCard
                      icon={<ArrowDownLeft className="h-5 w-5 text-amber-600" />}
                      title="Entradas sem NFS-e emitida"
                      count={entSemQtd} total={entSemTotal}
                      variant={entSemQtd >= 5 ? "danger" : "warn"}
                      onClick={() => jumpTo(secEntRef, "entSemNota")}
                    />
                  )}
                  {saiSemQtd > 0 && (
                    <AlertCard
                      icon={<ArrowUpRight className="h-5 w-5 text-rose-600" />}
                      title="Saídas sem NF-e recebida"
                      count={saiSemQtd} total={saiSemTotal}
                      variant="warn"
                      onClick={() => jumpTo(secSaiRef, "saiSemNota")}
                    />
                  )}
                </div>
              </div>
            )}
            {totalAlerts === 0 && data && (
              <div className="flex items-center gap-3 px-5 py-4 rounded-2xl border border-emerald-200 bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">Tudo certo! Sem pendências no período.</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Todas as OCs, entradas e saídas têm documentos fiscais vinculados.</p>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 1 — OCs × NF-e
            ════════════════════════════════════════════════════════════ */}
            <div ref={secOcsRef} className="space-y-2">
              <GroupHeading icon={<ShoppingCart className="h-4 w-4 text-violet-600" />}
                title="Ordens de Compra × NF-e Recebida" />

              <SectionToggle title="OCs com NF-e vinculada" count={data.ocsComNota.length}
                total={(data.ocsComNota ?? []).reduce((s: number, o: any) => s + parseFloat(o.valor_total ?? "0"), 0)}
                open={openSec.ocsComNota} onToggle={() => toggle("ocsComNota")} variant="ok" />
              {openSec.ocsComNota && (
                <OcTable rows={data.ocsComNota} variant="ok" />
              )}

              <SectionToggle title="OCs SEM NF-e — solicitar nota fiscal ao fornecedor" count={data.ocsSemNota.length}
                total={ocsSemTotal}
                open={openSec.ocsSemNota} onToggle={() => toggle("ocsSemNota")} variant="warn" />
              {openSec.ocsSemNota && (
                <OcTable rows={data.ocsSemNota} variant="warn" />
              )}
            </div>

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 2 — Entradas bancárias × NFS-e
            ════════════════════════════════════════════════════════════ */}
            <div ref={secEntRef} className="space-y-2">
              <GroupHeading icon={<ArrowDownLeft className="h-4 w-4 text-emerald-600" />}
                title="Entradas Bancárias × NFS-e Emitida" />

              <SectionToggle title="Entradas com NFS-e vinculada" count={data.entradasComNota.length}
                total={(data.entradasComNota ?? []).reduce((s: number, b: any) => s + Math.abs(parseFloat(b.valor ?? "0")), 0)}
                open={openSec.entComNota} onToggle={() => toggle("entComNota")} variant="ok" />
              {openSec.entComNota && <BankTable rows={data.entradasComNota} tipo="entrada" />}

              <SectionToggle title="Entradas SEM NFS-e — verificar nota de serviço" count={data.entradasSemNota.length}
                total={entSemTotal}
                open={openSec.entSemNota} onToggle={() => toggle("entSemNota")} variant="warn" />
              {openSec.entSemNota && <BankTable rows={data.entradasSemNota} tipo="entrada" />}
            </div>

            {/* ════════════════════════════════════════════════════════════
                SEÇÃO 3 — Saídas bancárias × NF-e
            ════════════════════════════════════════════════════════════ */}
            <div ref={secSaiRef} className="space-y-2">
              <GroupHeading icon={<ArrowUpRight className="h-4 w-4 text-rose-600" />}
                title="Saídas Bancárias × NF-e Recebida" />

              <SectionToggle title="Saídas com NF-e vinculada" count={data.saidasComNota.length}
                total={(data.saidasComNota ?? []).reduce((s: number, b: any) => s + Math.abs(parseFloat(b.valor ?? "0")), 0)}
                open={openSec.saiComNota} onToggle={() => toggle("saiComNota")} variant="ok" />
              {openSec.saiComNota && <BankTable rows={data.saidasComNota} tipo="saida" />}

              <SectionToggle title="Saídas SEM NF-e — verificar comprovante fiscal" count={data.saidasSemNota.length}
                total={saiSemTotal}
                open={openSec.saiSemNota} onToggle={() => toggle("saiSemNota")} variant="warn" />
              {openSec.saiSemNota && <BankTable rows={data.saidasSemNota} tipo="saida" />}
            </div>

            {/* ════════════════════════════════════════════════════════════
                GUIA SPED
            ════════════════════════════════════════════════════════════ */}
            <SpedSugestao open={openSec.spedInfo} onToggle={() => toggle("spedInfo")} />
          </>
        )}
      </div>
    </>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function GroupHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {icon}
      <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">{title}</h3>
    </div>
  );
}

function OcTable({ rows, variant }: { rows: any[]; variant: "ok" | "warn" }) {
  const ring  = variant === "ok" ? "border-emerald-100" : "border-amber-100";
  const head  = variant === "ok" ? "bg-emerald-50/80 text-emerald-700" : "bg-amber-50/80 text-amber-700";
  return (
    <div className={`overflow-x-auto rounded-xl border ${ring}`}>
      <table className="w-full text-xs">
        <thead className={`${head} uppercase`}>
          <tr>
            {["OC#","Fornecedor","CNPJ","Valor OC","NF-e#","Obra","Status"].map(h => (
              <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((o: any, i: number) => (
            <tr key={o.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
              <td className="px-3 py-2 font-mono font-bold text-indigo-700 whitespace-nowrap">{o.numero}</td>
              <td className="px-3 py-2 max-w-[180px] truncate font-medium text-slate-800" title={o.supplier_razao || o.supplier_nome}>
                {o.supplier_razao || o.supplier_nome || "—"}
              </td>
              <td className="px-3 py-2 font-mono text-slate-400 whitespace-nowrap text-[11px]">{fmtCnpj(o.supplier_cnpj)}</td>
              <td className="px-3 py-2 text-right font-bold text-slate-800 whitespace-nowrap">{fmtBRL(o.valor_total)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {o.nfeNumero
                  ? <span className="flex items-center gap-1 text-emerald-700 font-semibold"><CheckCircle2 className="h-3 w-3" />{o.nfeNumero}</span>
                  : <span className="text-slate-300">—</span>
                }
              </td>
              <td className="px-3 py-2 max-w-[140px] truncate text-slate-400" title={o.obra_nome}>{o.obra_nome || "—"}</td>
              <td className="px-3 py-2">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{o.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs">Nenhum item nesta categoria</span>
        </div>
      )}
    </div>
  );
}

function BankTable({ rows, tipo }: { rows: any[]; tipo: "entrada" | "saida" }) {
  const ring = tipo === "entrada" ? "border-emerald-100" : "border-rose-100";
  const head = tipo === "entrada" ? "bg-emerald-50/80 text-emerald-700" : "bg-rose-50/80 text-rose-700";
  const valColor = tipo === "entrada" ? "text-emerald-700" : "text-rose-700";
  return (
    <div className={`overflow-x-auto rounded-xl border ${ring}`}>
      <table className="w-full text-xs">
        <thead className={`${head} uppercase`}>
          <tr>
            {["Data","Conta","Descrição","Valor","Conciliado","NF#"].map(h => (
              <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b: any, i: number) => (
            <tr key={b.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500 font-medium">{fmtDate(b.data)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500 text-[11px] max-w-[120px] truncate" title={b.conta_nome}>{b.conta_nome || "—"}</td>
              <td className="px-3 py-2 max-w-[220px] truncate text-slate-700" title={b.descricao}>{b.descricao}</td>
              <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${valColor}`}>
                {fmtBRL(b.valor)}
              </td>
              <td className="px-3 py-2 text-center">
                {b.conciliado
                  ? <span className="text-emerald-500 text-sm">✓</span>
                  : <span className="text-slate-300 text-sm">○</span>
                }
              </td>
              <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{b.fn_numero || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-xs">Nenhum item nesta categoria</span>
        </div>
      )}
    </div>
  );
}

function SpedSugestao({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl border border-blue-200 overflow-hidden no-print">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 bg-blue-50 hover:bg-blue-100 transition-colors text-sm font-semibold text-blue-800">
        <Info className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="flex-1 text-left">Obrigações legais — SPED / EFD</span>
        <span className="text-[10px] text-blue-400 font-normal hidden sm:inline">clique para expandir</span>
        {open ? <ChevronUp className="h-4 w-4 text-blue-400" /> : <ChevronDown className="h-4 w-4 text-blue-400" />}
      </button>
      {open && (
        <div className="px-5 py-4 bg-white">
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            {[
              { t: "EFD-ICMS/IPI (SPED Fiscal)",  p: "Mensal até dia 25",  d: "Todas as NF-e de entrada e saída, ICMS e IPI. Gerado pelo contador via sistema contábil.", c: "border-blue-200 bg-blue-50" },
              { t: "EFD-Contribuições",            p: "Mensal até dia 10",  d: "PIS/COFINS sobre NF-e e NFS-e. Vincula cada nota ao faturamento tributável.",               c: "border-violet-200 bg-violet-50" },
              { t: "EFD-Reinf",                   p: "Mensal até dia 15",  d: "Retenções na fonte sobre NFS-e (CSLL, PIS, COFINS, IR). Serviços prestados e tomados.",     c: "border-indigo-200 bg-indigo-50" },
              { t: "Livro Caixa Digital (ECF)",   p: "Anual até julho",    d: "Para Lucro Presumido/Real: todas as entradas e saídas de caixa com e sem nota.",             c: "border-emerald-200 bg-emerald-50" },
            ].map(s => (
              <div key={s.t} className={`rounded-xl border p-3 text-xs ${s.c}`}>
                <p className="font-bold text-slate-800">{s.t}</p>
                <p className="text-blue-600 font-medium mt-0.5">Prazo: {s.p}</p>
                <p className="text-slate-600 mt-1 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 px-4 py-3 bg-indigo-50 rounded-xl text-xs text-indigo-800">
            <FileWarning className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
            <p><strong>Recomendação:</strong> envie o Excel gerado nesta tela ao contador mensalmente — ele contém todos os cruzamentos necessários para preencher o SPED Fiscal, EFD-Contribuições e EFD-Reinf sem retrabalho.</p>
          </div>
        </div>
      )}
    </div>
  );
}
