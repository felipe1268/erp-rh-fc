import React, { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, RefreshCw, Printer, Download,
  FileSpreadsheet, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, XCircle, Info, ChevronDown, ChevronUp,
} from "lucide-react";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtBRL(v: number | string | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  if (isNaN(n)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(n));
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const t = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split("-").reverse().join("/") : t;
}
function fmtCnpj(c: string | null | undefined) {
  if (!c) return "—";
  const d = String(c).replace(/\D/g, "");
  if (d.length !== 14) return c;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function PctBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-400 text-xs">—</span>;
  const color = pct >= 80 ? "bg-emerald-100 text-emerald-800" : pct >= 50 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700";
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{pct}%</span>;
}

function KpiCard({ label, total, qtd, pct, pctLabel, color }: {
  label: string; total: number; qtd: number; pct?: number | null; pctLabel?: string; color: string;
}) {
  return (
    <Card className={`border ${color}`}>
      <CardContent className="p-4">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-1">{fmtBRL(total)}</p>
        <p className="text-xs text-slate-400 mt-0.5">{qtd} documento{qtd !== 1 ? "s" : ""}</p>
        {pct !== undefined && pct !== null && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="text-xs text-slate-500">{pctLabel}</span>
            <PctBadge pct={pct} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, count, open, onToggle, variant = "default" }: {
  title: string; count: number; open: boolean; onToggle: () => void; variant?: "ok" | "warn" | "default";
}) {
  const colors = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    default: "border-slate-200 bg-slate-50 text-slate-700",
  };
  const icons = {
    ok: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    warn: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    default: <Info className="h-4 w-4 text-slate-400" />,
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors hover:brightness-95 ${colors[variant]}`}
    >
      {icons[variant]}
      <span className="flex-1 text-left">{title}</span>
      <span className="text-xs opacity-70">{count} item{count !== 1 ? "s" : ""}</span>
      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
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
  const [mes, setMes]   = useState(hoje.getMonth() + 1);
  const [ano, setAno]   = useState(hoje.getFullYear());
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({
    ocsComNota: false, ocsSemNota: true,
    entComNota: false, entSemNota: true,
    saiComNota: false, saiSemNota: true,
    nfseList: false,   nfeList: false,
  });
  const printRef = useRef<HTMLDivElement>(null);

  const toggle = (key: string) => setOpenSec(p => ({ ...p, [key]: !p[key] }));

  const { data, isFetching, refetch } = trpc.fiscalNotes.getPanoramaFiscal.useQuery(
    { companyId, mes, ano },
    { enabled: !!companyId, staleTime: 60_000 }
  );

  const r = data?.resumo;

  // ── Excel export ─────────────────────────────────────────────────────────
  const exportExcel = useCallback(async () => {
    if (!data) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const periodoLabel = `${MESES[mes - 1]}/${ano}`;

    // Sheet 1: Resumo
    const resumoData = [
      ["Panorama Fiscal — " + periodoLabel, "", ""],
      ["Empresa:", companyNome ?? "", ""],
      ["", "", ""],
      ["INDICADOR", "VALOR (R$)", "COBERTURA NF (%)"],
      ["NFS-e Emitidas",      r?.nfseEmitidas.total ?? 0,    ""],
      ["NF-e Recebidas",      r?.nfeRecebidas.total ?? 0,    ""],
      ["Entradas Bancárias",  r?.entradasBancarias.total ?? 0, r?.coberturaNfseReceita != null ? `${r.coberturaNfseReceita}%` : "—"],
      ["Saídas Bancárias",    r?.saidasBancarias.total ?? 0,   r?.coberturaSaidaNfe != null ? `${r.coberturaSaidaNfe}%` : "—"],
      ["Total OCs (Compras)", r?.totalOcs.total ?? 0,          r?.coberturaOcNfe != null ? `${r.coberturaOcNfe}%` : "—"],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoData), "Resumo");

    // Sheet 2: NFS-e Emitidas
    const nfseRows = [["NF#", "Tomador", "CNPJ Tomador", "Valor Bruto", "Valor Líquido", "Emissão", "Status"]];
    for (const n of data.nfseEmitidas ?? []) {
      nfseRows.push([n.numero_nf, n.tomador_razao_social ?? "", fmtCnpj(n.tomador_cnpj), parseFloat(n.valor_bruto ?? "0"), parseFloat(n.valor_liquido ?? "0"), fmtDate(n.data_emissao), n.status]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nfseRows), "NFS-e Emitidas");

    // Sheet 3: NF-e Recebidas
    const nfeRows = [["NF#", "Emitente", "CNPJ Emitente", "Valor", "Emissão", "Status"]];
    for (const n of data.nfeRecebidas ?? []) {
      nfeRows.push([n.numero_nf, n.emitente_nome ?? "", fmtCnpj(n.emitente_cnpj), parseFloat(n.valor_bruto ?? "0"), fmtDate(n.data_emissao), n.status]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(nfeRows), "NF-e Recebidas");

    // Sheet 4: OCs sem Nota
    const ocRows = [["OC#", "Fornecedor", "CNPJ", "Valor", "Obra", "Status", "Emitida em"]];
    for (const o of data.ocsSemNota ?? []) {
      ocRows.push([o.numero, o.supplier_razao ?? o.supplier_nome, fmtCnpj(o.supplier_cnpj), parseFloat(o.valor_total ?? "0"), o.obra_nome ?? "", o.status, fmtDate(o.created_at)]);
    }
    for (const o of data.ocsComNota ?? []) {
      ocRows.push([o.numero + " ✓", o.supplier_razao ?? o.supplier_nome, fmtCnpj(o.supplier_cnpj), parseFloat(o.valor_total ?? "0"), o.obra_nome ?? "", o.status + " (NF " + (o.nfeNumero ?? "?") + ")", fmtDate(o.created_at)]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ocRows), "OC vs NF-e");

    // Sheet 5: Movimentos sem Nota
    const movRows = [["Data", "Descrição", "Valor", "Tipo", "Conciliado", "NF vinculada"]];
    for (const b of [...(data.saidasSemNota ?? []), ...(data.entradasSemNota ?? [])]) {
      movRows.push([fmtDate(b.data), b.descricao, parseFloat(b.valor ?? "0"), b.tipo === "credito" ? "Entrada" : "Saída", b.conciliado ? "Sim" : "Não", b.fn_numero ?? "—"]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(movRows), "Movimentos s/ Nota");

    XLSX.writeFile(wb, `panorama-fiscal-${periodoLabel.replace("/", "-")}.xlsx`);
  }, [data, mes, ano, companyNome, r]);

  // ── PDF export ────────────────────────────────────────────────────────────
  const exportPdf = () => window.print();

  if (!data && isFetching) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-500 mr-2" />
        <span className="text-slate-500">Carregando panorama fiscal…</span>
      </div>
    );
  }

  const periodoLabel = `${MESES[mes - 1]}/${ano}`;

  return (
    <>
      {/* ── Print CSS ─────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #panorama-print-area, #panorama-print-area * { visibility: visible !important; }
          #panorama-print-area { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div id="panorama-print-area" ref={printRef}>
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              📊 Panorama Fiscal
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cruzamento NFS-e × NF-e × OC × Extrato Bancário
            </p>
          </div>
          {/* Print logo */}
          {companyLogoUrl && (
            <img src={companyLogoUrl} alt="Logo" className="h-10 object-contain hidden print:block" />
          )}
        </div>

        {/* ── Seletor mês/ano + botões ──────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-5 no-print">
          <div className="flex items-center gap-1 border rounded-xl px-3 py-1.5 bg-white shadow-sm">
            <button type="button" onClick={() => { if (mes === 1) { setMes(12); setAno(a => a - 1); } else setMes(m => m - 1); }} className="p-0.5 hover:bg-slate-100 rounded">
              <ChevronLeft className="h-4 w-4 text-slate-500" />
            </button>
            <span className="text-sm font-semibold text-slate-700 w-20 text-center">{periodoLabel}</span>
            <button type="button" onClick={() => { if (mes === 12) { setMes(1); setAno(a => a + 1); } else setMes(m => m + 1); }} className="p-0.5 hover:bg-slate-100 rounded">
              <ChevronRight className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 h-9">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={!data || isFetching} className="gap-1.5 h-9 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={!data} className="gap-1.5 h-9 border-indigo-300 text-indigo-700 hover:bg-indigo-50">
            <Printer className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>

        {/* ── Print header (só no PDF) ─────────────────────────────────── */}
        <div className="hidden print:block mb-6">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            {companyLogoUrl && <img src={companyLogoUrl} alt="Logo" className="h-12 object-contain" />}
            <div className="text-right">
              <p className="text-lg font-bold text-slate-900">Panorama Fiscal</p>
              <p className="text-sm text-slate-600">{companyNome} · {periodoLabel}</p>
              <p className="text-xs text-slate-400">Gerado em {new Date().toLocaleDateString("pt-BR")}</p>
            </div>
          </div>
        </div>

        {!data ? (
          <div className="text-center py-12 text-slate-400">Nenhum dado disponível para {periodoLabel}.</div>
        ) : (
          <>
            {/* ── 6 KPI cards ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <KpiCard label="NFS-e Emitidas" total={r!.nfseEmitidas.total} qtd={r!.nfseEmitidas.qtd}
                pct={r!.coberturaNfseReceita} pctLabel="das entradas" color="border-indigo-100" />
              <KpiCard label="NF-e Recebidas" total={r!.nfeRecebidas.total} qtd={r!.nfeRecebidas.qtd}
                pct={r!.coberturaOcNfe} pctLabel="das OCs" color="border-sky-100" />
              <KpiCard label="OCs (Compras)" total={r!.totalOcs.total} qtd={r!.totalOcs.qtd}
                color="border-violet-100" />
              <KpiCard label="Entradas Bancárias" total={r!.entradasBancarias.total} qtd={r!.entradasBancarias.qtd}
                pct={r!.coberturaNfseReceita} pctLabel="com nota" color="border-emerald-100" />
              <KpiCard label="Saídas Bancárias" total={r!.saidasBancarias.total} qtd={r!.saidasBancarias.qtd}
                pct={r!.coberturaSaidaNfe} pctLabel="com nota" color="border-rose-100" />
              <Card className="border border-amber-100 bg-amber-50/60">
                <CardContent className="p-4">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Cobertura Geral</p>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Receita c/ nota</span>
                      <PctBadge pct={r!.coberturaNfseReceita} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">OC c/ NF-e</span>
                      <PctBadge pct={r!.coberturaOcNfe} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Saídas c/ nota</span>
                      <PctBadge pct={r!.coberturaSaidaNfe} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Seção 1: OCs × NF-e ──────────────────────────────────── */}
            <div className="space-y-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Ordens de Compra × NF-e Recebida</h3>

              <SectionHeader title="✅ OCs com NF-e vinculada" count={data.ocsComNota.length}
                open={openSec.ocsComNota} onToggle={() => toggle("ocsComNota")} variant="ok" />
              {openSec.ocsComNota && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase">
                      <tr>{["OC#","Fornecedor","CNPJ","Valor OC","NF-e#","Valor NF-e","Obra","Status"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.ocsComNota.map((o: any) => (
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-indigo-700">{o.numero}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate" title={o.supplier_razao}>{o.supplier_razao || o.supplier_nome}</td>
                          <td className="px-3 py-2 font-mono text-slate-400">{fmtCnpj(o.supplier_cnpj)}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmtBRL(o.valor_total)}</td>
                          <td className="px-3 py-2 text-emerald-700 font-medium">{o.nfeNumero || "—"}</td>
                          <td className="px-3 py-2 text-right">{o.nfeValor ? fmtBRL(o.nfeValor) : "—"}</td>
                          <td className="px-3 py-2 max-w-[120px] truncate text-slate-400" title={o.obra_nome}>{o.obra_nome || "—"}</td>
                          <td className="px-3 py-2"><Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{o.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.ocsComNota.length === 0 && <p className="text-center py-4 text-slate-400 text-xs">Nenhuma OC com NF-e vinculada</p>}
                </div>
              )}

              <SectionHeader title="⚠️ OCs SEM NF-e — verificar nota fiscal" count={data.ocsSemNota.length}
                open={openSec.ocsSemNota} onToggle={() => toggle("ocsSemNota")} variant="warn" />
              {openSec.ocsSemNota && (
                <div className="overflow-x-auto rounded-xl border border-amber-200">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-50 text-amber-700 uppercase">
                      <tr>{["OC#","Fornecedor","CNPJ","Valor","Obra","Status","Emitida em"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {data.ocsSemNota.map((o: any) => (
                        <tr key={o.id} className="hover:bg-amber-50/60">
                          <td className="px-3 py-2 font-mono text-indigo-700">{o.numero}</td>
                          <td className="px-3 py-2 max-w-[160px] truncate" title={o.supplier_razao}>{o.supplier_razao || o.supplier_nome}</td>
                          <td className="px-3 py-2 font-mono text-slate-400">{fmtCnpj(o.supplier_cnpj)}</td>
                          <td className="px-3 py-2 text-right font-medium text-rose-700">{fmtBRL(o.valor_total)}</td>
                          <td className="px-3 py-2 max-w-[120px] truncate text-slate-400" title={o.obra_nome}>{o.obra_nome || "—"}</td>
                          <td className="px-3 py-2"><Badge className="bg-slate-100 text-slate-700 text-[10px]">{o.status}</Badge></td>
                          <td className="px-3 py-2 text-slate-400">{fmtDate(o.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.ocsSemNota.length === 0 && <p className="text-center py-4 text-slate-400 text-xs">Nenhuma OC sem NF-e neste período</p>}
                </div>
              )}
            </div>

            {/* ── Seção 2: Entradas bancárias × NFS-e ─────────────────── */}
            <div className="space-y-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Entradas Bancárias × NFS-e Emitida</h3>

              <SectionHeader title="✅ Entradas com NFS-e vinculada" count={data.entradasComNota.length}
                open={openSec.entComNota} onToggle={() => toggle("entComNota")} variant="ok" />
              {openSec.entComNota && <BankTable rows={data.entradasComNota} tipo="entrada" />}

              <SectionHeader title="⚠️ Entradas SEM NFS-e — sem nota de serviço" count={data.entradasSemNota.length}
                open={openSec.entSemNota} onToggle={() => toggle("entSemNota")} variant="warn" />
              {openSec.entSemNota && <BankTable rows={data.entradasSemNota} tipo="entrada" />}
            </div>

            {/* ── Seção 3: Saídas bancárias × NF-e ────────────────────── */}
            <div className="space-y-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Saídas Bancárias × NF-e Recebida</h3>

              <SectionHeader title="✅ Saídas com NF-e vinculada" count={data.saidasComNota.length}
                open={openSec.saiComNota} onToggle={() => toggle("saiComNota")} variant="ok" />
              {openSec.saiComNota && <BankTable rows={data.saidasComNota} tipo="saida" />}

              <SectionHeader title="⚠️ Saídas SEM NF-e — verificar comprovante" count={data.saidasSemNota.length}
                open={openSec.saiSemNota} onToggle={() => toggle("saiSemNota")} variant="warn" />
              {openSec.saiSemNota && <BankTable rows={data.saidasSemNota} tipo="saida" />}
            </div>

            {/* ── Caixa SPED ──────────────────────────────────────────── */}
            <SpedSugestao />
          </>
        )}
      </div>
    </>
  );
}

function BankTable({ rows, tipo }: { rows: any[]; tipo: "entrada" | "saida" }) {
  const borderColor = tipo === "entrada" ? "border-emerald-200" : "border-rose-200";
  const headBg      = tipo === "entrada" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  return (
    <div className={`overflow-x-auto rounded-xl border ${borderColor}`}>
      <table className="w-full text-xs">
        <thead className={`${headBg} uppercase`}>
          <tr>{["Data","Descrição","Valor","Conciliado","NF#"].map(h => (
            <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((b: any) => (
            <tr key={b.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(b.data)}</td>
              <td className="px-3 py-2 max-w-[220px] truncate" title={b.descricao}>{b.descricao}</td>
              <td className={`px-3 py-2 text-right font-medium ${tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(parseFloat(b.valor ?? "0")))}
              </td>
              <td className="px-3 py-2">
                {b.conciliado ? <span className="text-emerald-600">✓</span> : <span className="text-amber-500">—</span>}
              </td>
              <td className="px-3 py-2 text-slate-400">{b.fn_numero || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-center py-4 text-slate-400 text-xs">Nenhum item nesta categoria</p>}
    </div>
  );
}

function SpedSugestao() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 mt-6 no-print">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-blue-800"
        onClick={() => setOpen(o => !o)}
      >
        <Info className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="flex-1 text-left">Formatos legais exigidos pelo governo (SPED / EFD)</span>
        {open ? <ChevronUp className="h-4 w-4 text-blue-400" /> : <ChevronDown className="h-4 w-4 text-blue-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-xs text-blue-900">
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { titulo: "EFD-ICMS/IPI (SPED Fiscal)", prazo: "Mensal até dia 25", conteudo: "Todas as NF-e de entrada e saída, ICMS, IPI. Gerado pelo contador via sistema contábil.", cor: "border-blue-300 bg-blue-100" },
              { titulo: "EFD-Contribuições", prazo: "Mensal até dia 10", conteudo: "PIS/COFINS sobre NF-e e NFS-e. Vincula cada nota ao faturamento tributável.", cor: "border-violet-300 bg-violet-100" },
              { titulo: "EFD-Reinf", prazo: "Mensal até dia 15", conteudo: "Retenções na fonte sobre NFS-e (CSLL, PIS, COFINS, IR). Serviços prestados e tomados.", cor: "border-indigo-300 bg-indigo-100" },
              { titulo: "Livro Caixa Digital", prazo: "Anual (ECF até julho)", conteudo: "Para Lucro Presumido/Real: todas as entradas e saídas de caixa com e sem nota.", cor: "border-emerald-300 bg-emerald-100" },
            ].map(s => (
              <div key={s.titulo} className={`rounded-lg border p-3 ${s.cor}`}>
                <p className="font-semibold">{s.titulo}</p>
                <p className="text-blue-600 mt-0.5">Prazo: {s.prazo}</p>
                <p className="mt-1 text-blue-800/80">{s.conteudo}</p>
              </div>
            ))}
          </div>
          <p className="text-blue-600 italic">
            💡 Recomendação: envie o Excel gerado nesta tela ao contador mensalmente — ele contém todos os cruzamentos necessários para preencher o SPED Fiscal, EFD-Contribuições e Reinf sem retrabalho.
          </p>
        </div>
      )}
    </div>
  );
}
