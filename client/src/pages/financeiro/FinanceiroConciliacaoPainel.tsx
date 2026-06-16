import { useMemo, useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle, Upload,
  FileText, Sparkles, ArrowRight, ChevronLeft, ChevronRight, Landmark, Loader2, Eye,
  Paperclip, ExternalLink, Printer, Wallet, Trash2, ArrowLeftRight, Link2,
} from "lucide-react";
import { formatConta, formatAgencia } from "@/lib/formatters";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
function fmtData(v: any) {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v.length > 10 ? v : v + "T00:00:00") : new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function bancoCor(banco?: string): { bg: string; text: string } {
  const b = (banco ?? "").toLowerCase();
  if (b.includes("caixa")) return { bg: "bg-blue-100", text: "text-blue-700" };
  if (b.includes("santander")) return { bg: "bg-red-100", text: "text-red-700" };
  if (b.includes("ita")) return { bg: "bg-orange-100", text: "text-orange-700" };
  if (b.includes("bradesco")) return { bg: "bg-pink-100", text: "text-pink-700" };
  if (b.includes("brasil")) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-gray-100", text: "text-gray-700" };
}

export default function FinanceiroConciliacaoPainel() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const _now = new Date();

  // ---- Estado (carrega de query string ?conta=&ano=&mes= se vier da tela clássica) ----
  const initial = useMemo(() => {
    const fb = { conta: "", ano: _now.getFullYear(), mes: _now.getMonth() + 1 };
    try {
      const sp = new URLSearchParams(window.location.search);
      const anoRaw = parseInt(sp.get("ano") ?? "", 10);
      const mesRaw = parseInt(sp.get("mes") ?? "", 10);
      const contaRaw = parseInt(sp.get("conta") ?? "", 10);
      return {
        conta: Number.isFinite(contaRaw) && contaRaw > 0 ? String(contaRaw) : "",
        ano: Number.isFinite(anoRaw) && anoRaw >= 2000 && anoRaw <= 2100 ? anoRaw : fb.ano,
        mes: Number.isFinite(mesRaw) && mesRaw >= 1 && mesRaw <= 12 ? mesRaw : fb.mes,
      };
    } catch { return fb; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [ano, setAno] = useState<number>(initial.ano);
  const [mesSel, setMesSel] = useState<number>(initial.mes);
  const [contaBancariaId, setContaBancariaId] = useState<string>(initial.conta);
  const [toleranciaDias, setToleranciaDias] = useState<number>(() => new Date(initial.ano, initial.mes, 0).getDate());

  const { dataInicio, dataFim } = useMemo(() => {
    const mm = String(mesSel).padStart(2, "0");
    const ultimoDia = new Date(ano, mesSel, 0).getDate();
    return { dataInicio: `${ano}-${mm}-01`, dataFim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
  }, [ano, mesSel]);

  const diasDoMes = useMemo(() => new Date(ano, mesSel, 0).getDate(), [ano, mesSel]);
  const tolOptions = useMemo(() => {
    const set = new Set<number>([0, 1, 2, 3, 5, 7, 10, 15, diasDoMes]);
    return Array.from(set).sort((a, b) => a - b);
  }, [diasDoMes]);
  const selectMes = (num: number) => { setMesSel(num); setToleranciaDias(new Date(ano, num, 0).getDate()); };

  // Seleção p/ conciliação manual
  const [selExtrato, setSelExtrato] = useState<number | null>(null);
  const [selLanc, setSelLanc] = useState<number | null>(null);
  const [selSug, setSelSug] = useState<Set<number>>(new Set());
  const [detalheEntryId, setDetalheEntryId] = useState<number | null>(null);

  // ---- Import ----
  const [showImport, setShowImport] = useState(false);
  const [importFormato, setImportFormato] = useState<"ofx" | "csv" | "pdf">("ofx");
  const [importConta, setImportConta] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [csvSeparador, setCsvSeparador] = useState(";");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importRunning, setImportRunning] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importLabel, setImportLabel] = useState("");
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [mismatch, setMismatch] = useState<{ selecionado: string; fora: number; total: number; anoNum: number; mesNum: number } | null>(null);

  // ---- Queries ----
  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery({ companyId }, { enabled: !!companyId });
  const contaSel = useMemo(() => (bankAccounts ?? []).find((b: any) => String(b.id) === contaBancariaId), [bankAccounts, contaBancariaId]);

  const { data: statementsAno } = (trpc as any).financial.getBankStatements.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` },
    { enabled: !!companyId && !!contaBancariaId }
  );
  const mesesStatus: Record<number, "consolidado" | "lancamento" | "vazio"> = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    const byMonth: Record<number, { total: number; pend: number }> = {};
    for (const s of (statementsAno ?? [])) {
      if (!s?.data) continue;
      const raw = String(s.data);
      const d = new Date(raw.length > 10 ? raw : raw + "T00:00:00");
      if (isNaN(d.getTime())) continue;
      const m = d.getMonth() + 1;
      const b = byMonth[m] ?? { total: 0, pend: 0 };
      b.total++; if (!s.conciliado) b.pend++; byMonth[m] = b;
    }
    for (let m = 1; m <= 12; m++) {
      const b = byMonth[m];
      map[m] = !b || b.total === 0 ? "vazio" : b.pend === 0 ? "consolidado" : "lancamento";
    }
    return map;
  }, [statementsAno]);

  const { data: report, isFetching: reportLoading, refetch: refetchReport } = (trpc as any).financial.getConciliacaoReport.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim },
    { enabled: !!companyId && !!contaBancariaId }
  );
  const conciliados: any[] = report?.conciliados ?? [];
  const extratoSemLanc: any[] = report?.extratoSemLancamento ?? [];
  const lancSemExtrato: any[] = report?.lancamentosSemExtrato ?? [];

  const { data: sugData, isFetching: sugLoading, refetch: refetchSug } = (trpc as any).financial.sugerirConciliacao.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim, toleranciaDias },
    { enabled: !!companyId && !!contaBancariaId }
  );
  const sugestoes: any[] = sugData?.sugestoes ?? [];

  // Detalhe consultivo do lançamento
  const detailQuery = (trpc as any).financial.getEntryDetalhe.useQuery(
    { id: detalheEntryId ?? 0, companyId }, { enabled: !!detalheEntryId && !!companyId }
  );
  const detEntry: any = detailQuery.data?.entry;
  const detOrigem: any = detailQuery.data?.origemDetalhes;
  const detOrdem: any = detailQuery.data?.ordem;
  const detItens: any[] = detailQuery.data?.itens ?? [];
  const field = (label: string, value: any, k?: string) =>
    (value === null || value === undefined || value === "" || value === "—") ? null : (
      <div key={k ?? label} className="min-w-0">
        <div className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-gray-800 break-words">{value}</div>
      </div>
    );

  // ---- Mutations ----
  const refetchAll = () => { refetchReport(); refetchSug(); };
  const conciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Conciliação registrada!" }); setSelExtrato(null); setSelLanc(null); refetchAll(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const conciliarSugMut = (trpc as any).financial.conciliarSugestoes.useMutation({
    onSuccess: (res: any) => { toast({ title: `${res.conciliados} de ${res.total} conciliados e baixados!` }); setSelSug(new Set()); refetchAll(); },
    onError: (e: any) => toast({ title: "Erro ao conciliar", description: e.message, variant: "destructive" }),
  });
  const limparMut = (trpc as any).financial.limparExtrato.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res.afetados > 0 ? `Extrato limpo! ${res.afetados} linha(s) removida(s).` : "Nada para limpar neste período." });
      setConfirmLimpar(false); refetchAll();
    },
    onError: (e: any) => toast({ title: "Erro ao limpar extrato", description: e.message, variant: "destructive" }),
  });
  const analyzeMut = (trpc as any).financial.analyzeBankStatement.useMutation();
  const insertBatchMut = (trpc as any).financial.insertBankStatementBatch.useMutation();

  // ---- Sugestões helpers ----
  const toggleSug = (id: number) => setSelSug(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selecionarAlta = () => setSelSug(new Set(sugestoes.filter(s => s.confianca === "alta").map(s => s.statementLineId)));
  const selecionarTodas = () => setSelSug(new Set(sugestoes.map(s => s.statementLineId)));
  const conciliarSelecionadas = () => {
    const pares = sugestoes.filter(s => selSug.has(s.statementLineId)).map(s => ({ statementLineId: s.statementLineId, entryId: s.entryId }));
    if (pares.length === 0) { toast({ title: "Selecione ao menos uma sugestão", variant: "destructive" }); return; }
    conciliarSugMut.mutate({ companyId, pares });
  };

  // ---- Import handlers ----
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isImagem = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"].includes(ext);
    if (isImagem) {
      e.target.value = "";
      toast({ title: "Imagem não é lida automaticamente", description: "Envie o PDF do internet banking, ou um arquivo OFX/CSV.", variant: "destructive" });
      return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    if (ext === "pdf") {
      setImportFormato("pdf");
      reader.onload = (ev) => { const res = (ev.target?.result as string) ?? ""; setImportContent(res.replace(/^data:[^,]*,/, "")); };
      reader.readAsDataURL(file);
    } else {
      if (ext === "ofx" || ext === "qfx") setImportFormato("ofx"); else setImportFormato("csv");
      reader.onload = (ev) => { setImportContent(ev.target?.result as string ?? ""); };
      reader.readAsText(file, "ISO-8859-1");
    }
  }

  async function handleImport(skipMonthCheck = false) {
    if (!importContent) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; }
    if (!importConta) { toast({ title: "Selecione a conta bancária", variant: "destructive" }); return; }
    const contaId = parseInt(importConta);
    setImportRunning(true); setImportPct(2); setImportLabel("Lendo e analisando o extrato...");
    try {
      const analysis: any = await analyzeMut.mutateAsync({ companyId, contaBancariaId: contaId, formato: importFormato, conteudo: importContent, csvSeparador: importFormato === "csv" ? csvSeparador : undefined });
      const linhas: any[] = analysis?.lines ?? [];
      const total = linhas.length;
      const importadoEm: string = analysis?.importadoEm;
      if (total === 0) { toast({ title: "Nenhuma transação encontrada no arquivo", variant: "destructive" }); return; }
      setImportPct(10); setImportLabel(`Extrato lido: ${total} transações. Gravando...`);
      if (!skipMonthCheck) {
        const selKey = `${ano}-${String(mesSel).padStart(2, "0")}`;
        const counts = new Map<string, number>();
        for (const l of linhas) { const k = String(l?.data ?? "").slice(0, 7); if (k.length === 7) counts.set(k, (counts.get(k) ?? 0) + 1); }
        let dom = ""; let domN = 0;
        for (const [k, n] of counts) { if (n > domN) { dom = k; domN = n; } }
        if (dom && dom !== selKey) {
          const fora = linhas.filter(l => String(l?.data ?? "").slice(0, 7) !== selKey).length;
          const [ay, am] = dom.split("-");
          setMismatch({ selecionado: selKey, fora, total, anoNum: parseInt(ay, 10), mesNum: parseInt(am, 10) });
          return;
        }
      }
      const CHUNK = 40; let inserted = 0, skipped = 0, processed = 0;
      for (let i = 0; i < total; i += CHUNK) {
        const slice = linhas.slice(i, i + CHUNK); const isLast = i + CHUNK >= total;
        const r: any = await insertBatchMut.mutateAsync({ companyId, contaBancariaId: contaId, formato: importFormato, importadoEm, linhas: slice, finalize: isLast, totalInseridos: inserted, totalDuplicados: skipped });
        inserted += r?.inserted ?? 0; skipped += r?.skipped ?? 0; processed += slice.length;
        setImportPct(10 + Math.round((processed / total) * 90)); setImportLabel(`Gravando ${Math.min(processed, total)} de ${total} transações...`);
      }
      setImportPct(100); setImportLabel("Concluído!");
      toast({ title: `Importação concluída! ${inserted} inseridos, ${skipped} duplicados ignorados` });
      setShowImport(false); setImportContent(""); setImportFileName("");
      if (!contaBancariaId) setContaBancariaId(String(contaId));
      refetchAll();
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e?.message || "Falha ao importar o extrato.", variant: "destructive" });
    } finally {
      setImportRunning(false); setTimeout(() => { setImportPct(0); setImportLabel(""); }, 500);
    }
  }

  // ---- Agregados / KPIs ----
  const totalExtrato = conciliados.length + extratoSemLanc.length;
  const pctConc = totalExtrato > 0 ? Math.round((conciliados.length / totalExtrato) * 100) : 0;
  const sumAbs = (arr: any[], f: (x: any) => any) => arr.reduce((a, x) => a + Math.abs(Number(f(x)) || 0), 0);
  const vConc = sumAbs(conciliados, c => c.valor);
  const vPend = sumAbs(extratoSemLanc, c => c.valor);
  const vLanc = sumAbs(lancSemExtrato, c => c.valor);

  const periodoLabel = `${MESES_LONG[mesSel - 1]}/${ano}`;
  const contaLabel = contaSel ? `${contaSel.banco}${contaSel.descricao ? " · " + contaSel.descricao : ""} — Ag. ${formatAgencia(contaSel.agencia)}/${formatConta(contaSel.conta)}` : "Nenhuma conta selecionada";

  // ---- Conciliação manual ----
  const extSelObj = extratoSemLanc.find((s: any) => s.id === selExtrato);
  const lancSelObj = lancSemExtrato.find((s: any) => s.id === selLanc);
  const manualDiff = extSelObj && lancSelObj ? Math.abs(Math.abs(Number(extSelObj.valor)) - Math.abs(Number(lancSelObj.valor))) : 0;

  // ---- Relatório PDF ----
  function gerarRelatorioPDF() {
    if (!report) { toast({ title: "Relatório ainda carregando", variant: "destructive" }); return; }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
    const conc = conciliados, pend = extratoSemLanc, lanc = lancSemExtrato;
    const rowsConc = conc.length
      ? conc.map((c) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(c.entryFornecedor || c.entryDescricao || ("Lançamento #" + (c.entryId ?? "")))}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhuma linha conciliada no período.</td></tr>`;
    const rowsPend = pend.length
      ? pend.map((c) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(c.tipo === "credito" ? "Entrada" : "Saída")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Sem pendências — todo o extrato está conciliado. 🎉</td></tr>`;
    const rowsLanc = lanc.length
      ? lanc.map((c) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhum lançamento sem extrato no período.</td></tr>`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Conciliação ${esc(periodoLabel)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0;padding:24px;font-size:12px}
  .logo{display:block;height:54px;margin:0 auto 10px}
  h1.brand{text-align:center;font-size:16px;margin:0;color:#1B2A4A;letter-spacing:.5px}
  .band{background:#1B2A4A;color:#fff;text-align:center;padding:10px;margin:14px 0;border-radius:6px;letter-spacing:3px;font-weight:bold;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .meta{display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:14px;flex-wrap:wrap;gap:6px}
  .cards{display:flex;gap:10px;margin:10px 0 18px;flex-wrap:wrap}
  .card{flex:1;min-width:130px;border:1px solid #e5e7eb;border-radius:8px;padding:10px}
  .card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280}
  .card .val{font-size:16px;font-weight:bold;margin-top:2px}
  .green{color:#15803d}.red{color:#b91c1c}.blue{color:#1d4ed8}
  h2{font-size:13px;margin:18px 0 6px;border-left:3px solid #1B2A4A;padding-left:8px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-size:10px;text-transform:uppercase;letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  td.r,th.r{text-align:right;white-space:nowrap}
  td.empty{text-align:center;color:#9ca3af;padding:14px}
  tfoot td{font-weight:bold;background:#f9fafb}
  @media print{body{padding:10px}}
</style></head><body>
  <img class="logo" src="${window.location.origin}/logo-fc-branco-amarelo.png?v=3182" alt="FC Engenharia"/>
  <h1 class="brand">FC ENGENHARIA</h1>
  <div class="band">RELATÓRIO DE CONCILIAÇÃO BANCÁRIA</div>
  <div class="meta">
    <span><strong>Conta:</strong> ${esc(contaLabel)}</span>
    <span><strong>Período:</strong> ${esc(periodoLabel)}</span>
    <span><strong>Emitido em:</strong> ${esc(new Date().toLocaleString("pt-BR"))}</span>
  </div>
  <div class="cards">
    <div class="card"><div class="lbl">Conciliado</div><div class="val blue">${conc.length} <span style="font-size:11px">(${pctConc}%)</span></div><div class="lbl">${esc(formatBRL(vConc))}</div></div>
    <div class="card"><div class="lbl">Extrato sem lançamento</div><div class="val red">${pend.length}</div><div class="lbl">${esc(formatBRL(vPend))}</div></div>
    <div class="card"><div class="lbl">Lançamentos sem extrato</div><div class="val">${lanc.length}</div><div class="lbl">${esc(formatBRL(vLanc))}</div></div>
    <div class="card"><div class="lbl">Total do extrato</div><div class="val">${totalExtrato}</div><div class="lbl">linhas no período</div></div>
  </div>
  <h2>1. Extrato conciliado (${conc.length})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Lançamento casado</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsConc}</tbody>
  <tfoot><tr><td colspan="3">Total conciliado</td><td class="r">${esc(formatBRL(vConc))}</td></tr></tfoot></table>
  <h2>2. Extrato SEM lançamento — o que falta (${pend.length})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Tipo</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsPend}</tbody>
  <tfoot><tr><td colspan="3">Total pendente</td><td class="r">${esc(formatBRL(vPend))}</td></tr></tfoot></table>
  <h2>3. Lançamentos do sistema sem extrato (${lanc.length})</h2>
  <table><thead><tr><th>Data</th><th>Lançamento</th><th>Obra</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsLanc}</tbody>
  <tfoot><tr><td colspan="3">Total sem extrato</td><td class="r">${esc(formatBRL(vLanc))}</td></tr></tfoot></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" }); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 350);
  }

  const semConta = !contaBancariaId;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===== Cabeçalho fixo ===== */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/financeiro/conciliacao")} className="text-gray-500">
            <ArrowLeft className="w-4 h-4 mr-1.5" />Voltar
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-800 leading-tight">Painel de Conciliação</h1>
              <p className="text-[11px] text-gray-500">Casar extrato × lançamentos numa tela só</p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Select value={contaBancariaId} onValueChange={(v) => { setContaBancariaId(v); setSelExtrato(null); setSelLanc(null); setSelSug(new Set()); }}>
              <SelectTrigger className="w-[240px] h-9 text-sm">
                <SelectValue placeholder="Selecione a conta bancária" />
              </SelectTrigger>
              <SelectContent>
                {(bankAccounts ?? []).map((b: any) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.banco}{b.descricao ? ` · ${b.descricao}` : ""} — {formatConta(b.conta)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
              <Upload className="w-4 h-4 mr-1.5" />Importar Extrato
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={refetchAll} disabled={reportLoading || sugLoading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${reportLoading || sugLoading ? "animate-spin" : ""}`} />Atualizar
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={gerarRelatorioPDF} disabled={!report}>
              <Printer className="w-4 h-4 mr-1.5" />Relatório PDF
            </Button>
          </div>
        </div>

        {/* Navegação de período */}
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(a => a - 1)}><ChevronLeft className="w-4 h-4" /></Button>
            <span className="text-sm font-semibold w-12 text-center">{ano}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAno(a => a + 1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {MESES.map((m, i) => {
              const num = i + 1;
              const st = mesesStatus[num];
              const dot = st === "consolidado" ? "bg-green-500" : st === "lancamento" ? "bg-blue-500" : "bg-gray-300";
              const active = num === mesSel;
              return (
                <button key={m} onClick={() => selectMes(num)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 border transition-colors ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                  {m}<span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white/80" : dot}`} />
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Label className="text-xs text-gray-500">Tolerância</Label>
            <Select value={String(toleranciaDias)} onValueChange={(v) => setToleranciaDias(parseInt(v))}>
              <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tolOptions.map(d => <SelectItem key={d} value={String(d)}>{d === 0 ? "Mesmo dia" : `${d} dia${d > 1 ? "s" : ""}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-5 space-y-5 max-w-[1500px] mx-auto">
        {semConta ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
            <Landmark className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-600 font-medium">Selecione uma conta bancária para começar</p>
            <p className="text-sm text-gray-400 mt-1">Use o seletor no topo. Depois importe o extrato e o painel mostra tudo automaticamente.</p>
          </div>
        ) : (
          <>
            {/* ===== KPIs ===== */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Conciliado</div>
                <div className="text-2xl font-bold text-blue-700">{conciliados.length} <span className="text-sm font-medium text-gray-400">({pctConc}%)</span></div>
                <Progress value={pctConc} className="h-1.5 mt-2" />
                <div className="text-xs text-gray-500 mt-1.5">{formatBRL(vConc)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4">
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Extrato sem lançamento</div>
                <div className="text-2xl font-bold text-amber-600">{extratoSemLanc.length}</div>
                <div className="text-xs text-gray-500 mt-1.5">{formatBRL(vPend)} · falta achar no ERP</div>
              </div>
              <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4">
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Lançamento sem extrato</div>
                <div className="text-2xl font-bold text-violet-600">{lancSemExtrato.length}</div>
                <div className="text-xs text-gray-500 mt-1.5">{formatBRL(vLanc)} · falta achar no banco</div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-400">Sugestões automáticas</div>
                  <div className="text-2xl font-bold text-emerald-600 flex items-center gap-1.5"><Sparkles className="w-5 h-5" />{sugestoes.length}</div>
                </div>
                <button onClick={() => setConfirmLimpar(true)} className="text-[11px] text-red-500 hover:underline text-left mt-1.5 inline-flex items-center gap-1">
                  <Trash2 className="w-3 h-3" />Limpar extrato do período
                </button>
              </div>
            </div>

            {/* ===== BLOCO 1 — Sugestões automáticas ===== */}
            <section className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 bg-emerald-50/50 flex items-center gap-2 flex-wrap">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-gray-800">Sugestões automáticas de conciliação</h2>
                <span className="text-xs text-gray-400">por valor, direção e data (±{toleranciaDias}d)</span>
                {sugestoes.length > 0 && (
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <Button size="sm" variant="outline" className="h-8" onClick={selecionarAlta}>Alta confiança</Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={selecionarTodas}>Todas</Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setSelSug(new Set())}>Limpar</Button>
                    <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={conciliarSelecionadas} disabled={conciliarSugMut.isPending || selSug.size === 0}>
                      <CheckCircle className="w-4 h-4 mr-1.5" />{conciliarSugMut.isPending ? "Conciliando..." : `Conciliar (${selSug.size})`}
                    </Button>
                  </div>
                )}
              </div>
              <div className="p-4">
                {sugLoading ? (
                  <p className="text-sm text-gray-500 py-8 text-center flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cruzando extrato × lançamentos…</p>
                ) : sugestoes.length === 0 ? (
                  <p className="text-sm text-gray-400 py-8 text-center">Nenhuma sugestão automática para a conta/período.{sugData ? ` (${sugData.totalLinhas ?? 0} linha(s) analisada(s))` : ""}</p>
                ) : (
                  <div className="border rounded-lg divide-y max-h-[420px] overflow-y-auto">
                    {sugestoes.map(s => (
                      <label key={s.statementLineId} className="flex items-center gap-3 p-3 hover:bg-emerald-50/40 cursor-pointer">
                        <Checkbox checked={selSug.has(s.statementLineId)} onCheckedChange={() => toggleSug(s.statementLineId)} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Extrato</div>
                          <div className="text-sm font-medium truncate">{s.extratoDescricao || "—"}</div>
                          <div className="text-xs text-gray-500">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDetalheEntryId(s.entryId); }} title="Ver detalhes do lançamento"
                          className="flex-1 min-w-0 text-left rounded-md -m-1 p-1 hover:bg-blue-50 transition-colors group/lan">
                          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">Lançamento <Eye className="w-3 h-3 text-blue-400 opacity-0 group-hover/lan:opacity-100 transition-opacity" /></div>
                          <div className="text-sm font-medium truncate text-blue-700 group-hover/lan:underline">{s.entryFornecedor || s.entryDescricao || "—"}</div>
                          <div className="text-xs text-gray-500 truncate">{fmtData(s.entryData)} · {formatBRL(Math.abs(s.entryValor))}{s.entryObra ? ` · ${s.entryObra}` : ""}</div>
                        </button>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge variant={s.confianca === "alta" ? "default" : "secondary"}>{s.confianca === "alta" ? "Alta" : "Média"}</Badge>
                          <span className="text-[10px] text-gray-400">{s.deltaDias === 0 ? "mesmo dia" : `±${s.deltaDias}d`}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ===== BLOCO 2 — Conciliação manual (2 colunas) ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Extrato sem lançamento */}
              <section className="bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 bg-amber-50/50 flex items-center gap-2">
                  <ArrowDownCircle className="w-4 h-4 text-amber-600" />
                  <h2 className="text-sm font-semibold text-gray-800">No extrato, sem lançamento no ERP</h2>
                  <Badge variant="secondary" className="ml-auto">{extratoSemLanc.length}</Badge>
                </div>
                {reportLoading ? (
                  <div className="p-8 text-center text-gray-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
                ) : extratoSemLanc.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                    Todo o extrato deste período já tem lançamento. 🎉
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
                    {extratoSemLanc.map((s: any) => (
                      <button key={s.id} onClick={() => setSelExtrato(selExtrato === s.id ? null : s.id)}
                        className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-amber-50/50 transition-colors ${selExtrato === s.id ? "bg-amber-50 border-l-2 border-l-amber-500" : ""}`}>
                        <div className="min-w-0">
                          <p className="text-xs text-gray-500">{fmtData(s.data)}</p>
                          <p className="text-sm text-gray-700 truncate max-w-[260px]">{s.descricao || "—"}</p>
                        </div>
                        <p className={`text-sm font-bold shrink-0 ${s.tipo === "credito" ? "text-green-600" : "text-red-500"}`}>{s.tipo === "credito" ? "+" : "-"}{formatBRL(Math.abs(Number(s.valor)))}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Lançamento sem extrato */}
              <section className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 bg-violet-50/50 flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4 text-violet-600" />
                  <h2 className="text-sm font-semibold text-gray-800">No ERP, sem extrato bancário</h2>
                  <Badge variant="secondary" className="ml-auto">{lancSemExtrato.length}</Badge>
                </div>
                {reportLoading ? (
                  <div className="p-8 text-center text-gray-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
                ) : lancSemExtrato.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                    Todo lançamento deste período já bate com o extrato.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
                    {lancSemExtrato.map((e: any) => (
                      <div key={e.id}
                        className={`w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-violet-50/50 transition-colors ${selLanc === e.id ? "bg-violet-50 border-l-2 border-l-violet-500" : ""}`}>
                        <button onClick={() => setSelLanc(selLanc === e.id ? null : e.id)} className="min-w-0 flex-1 text-left">
                          <p className="text-xs text-gray-500">{fmtData(e.data)}</p>
                          <p className="text-sm text-gray-700 truncate max-w-[220px]">{e.fornecedorNome ?? e.descricao ?? "—"}</p>
                          <p className="text-xs text-gray-400 truncate">{e.obraNome ?? ""}</p>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => setDetalheEntryId(e.id)} title="Ver detalhes" className="text-blue-400 hover:text-blue-600 p-1"><Eye className="w-4 h-4" /></button>
                          <p className={`text-sm font-bold ${e.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>{e.tipo === "receita" ? "+" : "-"}{formatBRL(Math.abs(Number(e.valor)))}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* ===== Já conciliados (referência) ===== */}
            {conciliados.length > 0 && (
              <details className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <summary className="px-5 py-3.5 cursor-pointer text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />Já conciliados neste período ({conciliados.length}) · {formatBRL(vConc)}
                </summary>
                <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto border-t border-gray-100">
                  {conciliados.map((c: any) => (
                    <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-gray-400 mr-2">{fmtData(c.data)}</span>
                        <span className="text-gray-700 truncate">{c.descricao || "—"}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      <span className="text-blue-700 truncate flex-1 text-right">{c.entryFornecedor || c.entryDescricao || `#${c.entryId}`}</span>
                      <span className="font-semibold text-gray-700 shrink-0 w-28 text-right">{formatBRL(Math.abs(Number(c.valor)))}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </main>

      {/* ===== Barra fixa de conciliação manual ===== */}
      {extSelObj && lancSelObj && (
        <div className="sticky bottom-0 z-30 bg-white border-t-2 border-blue-500 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-4 flex-wrap max-w-[1500px] mx-auto">
            <div className="flex items-center gap-3 text-sm min-w-0 flex-1">
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-amber-600">Extrato</div>
                <div className="truncate font-medium">{extSelObj.descricao || "—"} · {formatBRL(Math.abs(Number(extSelObj.valor)))}</div>
              </div>
              <Link2 className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase text-violet-600">Lançamento</div>
                <div className="truncate font-medium">{lancSelObj.fornecedorNome ?? lancSelObj.descricao ?? "—"} · {formatBRL(Math.abs(Number(lancSelObj.valor)))}</div>
              </div>
              {manualDiff > 0.005 && (
                <Badge variant="destructive" className="shrink-0">Diferença {formatBRL(manualDiff)}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setSelExtrato(null); setSelLanc(null); }}>Cancelar</Button>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={conciliarMut.isPending}
                onClick={() => conciliarMut.mutate({ companyId, statementLineId: selExtrato, entryId: selLanc })}>
                <CheckCircle className="w-4 h-4 mr-1.5" />{conciliarMut.isPending ? "Conciliando..." : "Conciliar manualmente"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Dialog: Importar Extrato ===== */}
      <Dialog open={showImport} onOpenChange={(o) => !importRunning && setShowImport(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-blue-600" />Importar Extrato Bancário</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Conta (só leitura — já escolhida na tela) */}
            <div>
              <Label className="text-xs text-gray-500">Conta bancária</Label>
              {contaSel ? (
                <div className="mt-1 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bancoCor(contaSel.banco).bg}`}>
                    <Landmark className={`w-4 h-4 ${bancoCor(contaSel.banco).text}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{contaSel.banco}{contaSel.descricao ? ` · ${contaSel.descricao}` : ""}</div>
                    <div className="text-xs text-gray-500">Ag. {formatAgencia(contaSel.agencia)} / {formatConta(contaSel.conta)} · {MESES_LONG[mesSel - 1]}/{ano}</div>
                  </div>
                </div>
              ) : (
                <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  Selecione a conta bancária no topo da tela antes de importar.
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs text-gray-500">Arquivo (OFX, CSV ou PDF do internet banking)</Label>
              <input ref={fileInputRef} type="file" accept=".ofx,.qfx,.csv,.txt,.pdf" onChange={handleFileSelect} className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
              {importFileName && <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><FileText className="w-3 h-3" />{importFileName}</p>}
            </div>

            {importFormato === "csv" && (
              <div>
                <Label className="text-xs text-gray-500">Separador do CSV</Label>
                <Select value={csvSeparador} onValueChange={setCsvSeparador}>
                  <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=";">Ponto e vírgula (;)</SelectItem>
                    <SelectItem value=",">Vírgula (,)</SelectItem>
                    <SelectItem value="\t">Tabulação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {importRunning && (
              <div className="space-y-1.5">
                <Progress value={importPct} className="h-2" />
                <p className="text-xs text-gray-500">{importLabel} {importPct}%</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)} disabled={importRunning}>Cancelar</Button>
            <Button onClick={() => handleImport(false)} disabled={importRunning || !importContent || !importConta} className="bg-blue-600 hover:bg-blue-700">
              {importRunning ? `Importando... ${importPct}%` : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Alerta: extrato de outro mês ===== */}
      <AlertDialog open={!!mismatch} onOpenChange={(o) => !o && setMismatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extrato parece ser de outro mês</AlertDialogTitle>
            <AlertDialogDescription>
              {mismatch && (
                <>O arquivo tem {mismatch.fora} de {mismatch.total} transações fora de <strong>{MESES_LONG[mesSel - 1]}/{ano}</strong> (mês dominante: <strong>{MESES_LONG[(mismatch.mesNum) - 1]}/{mismatch.anoNum}</strong>). Importar mesmo assim ou trocar para o mês do extrato?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMismatch(null)}>Cancelar</AlertDialogCancel>
            {mismatch && (
              <Button variant="outline" onClick={() => { setAno(mismatch.anoNum); selectMes(mismatch.mesNum); setMismatch(null); }}>
                Trocar para {MESES[(mismatch.mesNum) - 1]}/{mismatch.anoNum}
              </Button>
            )}
            <AlertDialogAction onClick={() => { setMismatch(null); handleImport(true); }}>Importar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Confirmar limpar extrato ===== */}
      <AlertDialog open={confirmLimpar} onOpenChange={setConfirmLimpar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar extrato deste período?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove as linhas de extrato de <strong>{contaLabel}</strong> em <strong>{periodoLabel}</strong> e desfaz as conciliações ligadas a elas. Os lançamentos do ERP não são apagados. Ação reversível pela equipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" disabled={limparMut.isPending}
              onClick={() => limparMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim })}>
              {limparMut.isPending ? "Limpando..." : "Limpar extrato"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== Detalhe consultivo do lançamento ===== */}
      <Dialog open={!!detalheEntryId} onOpenChange={(o) => !o && setDetalheEntryId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0 pr-14">
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600 shrink-0" />{detEntry ? `Lançamento #${detEntry.id}` : "Lançamento"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {detailQuery.isLoading ? (
              <div className="py-12 text-center text-gray-500 text-sm flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando lançamento…</div>
            ) : detailQuery.error ? (
              <div className="py-12 text-center text-red-600 text-sm">Erro ao carregar o lançamento: {(detailQuery.error as any)?.message ?? "tente novamente"}.</div>
            ) : detEntry ? (
              <div className="space-y-4 text-sm">
                <div className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-gray-900 break-words">{detEntry.fornecedorNome || detEntry.descricao || detEntry.contaNome || "Lançamento"}</div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {detEntry.tipo === "despesa" ? <ArrowDownCircle className="w-3.5 h-3.5 text-red-500" /> : <ArrowUpCircle className="w-3.5 h-3.5 text-green-600" />}
                      <span className="capitalize">{detEntry.tipo ?? "—"}</span>{detEntry.natureza ? <span className="text-gray-400">· {detEntry.natureza}</span> : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-bold ${detEntry.tipo === "despesa" ? "text-red-600" : "text-green-700"}`}>{formatBRL(Number(detEntry.valorRealizado ?? detEntry.valorPrevisto ?? 0))}</div>
                    <Badge variant={detEntry.status === "pago" || detEntry.status === "recebido" ? "default" : detEntry.status === "cancelado" ? "destructive" : "secondary"} className="mt-1 capitalize">{detEntry.status ?? "—"}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {field("Valor Previsto", detEntry.valorPrevisto != null ? formatBRL(Number(detEntry.valorPrevisto)) : null)}
                  {field("Valor Realizado", detEntry.valorRealizado != null ? formatBRL(Number(detEntry.valorRealizado)) : null)}
                  {field("Data Competência", fmtData(detEntry.dataCompetencia))}
                  {field("Data Vencimento", fmtData(detEntry.dataVencimento))}
                  {field("Data Pagamento", fmtData(detEntry.dataPagamento))}
                  {field("Forma de Pagamento", detEntry.formaPagamento)}
                  {field("Conta", detEntry.contaNome)}
                  {field("Obra", detEntry.obraNome)}
                  {field("Cheque nº", detEntry.chequeNumero ? `${detEntry.chequeNumero}${detEntry.chequeBanco ? ` · ${detEntry.chequeBanco}` : ""}` : null)}
                  {field("Origem", detEntry.origemModulo)}
                </div>
                {(detEntry.descricao || detEntry.origemDescricao || detEntry.observacoes) && (
                  <div className="space-y-2 border-t pt-3">
                    {field("Descrição", detEntry.descricao)}
                    {field("Origem (detalhe)", detEntry.origemDescricao)}
                    {field("Observações", detEntry.observacoes)}
                  </div>
                )}
                {(detEntry.comprovanteUrl || detEntry.anexoUrl) && (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {detEntry.comprovanteUrl && <a href={detEntry.comprovanteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"><Paperclip className="w-3.5 h-3.5" /> Comprovante <ExternalLink className="w-3 h-3" /></a>}
                    {detEntry.anexoUrl && <a href={detEntry.anexoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"><Paperclip className="w-3.5 h-3.5" /> {detEntry.anexoNome || "Anexo"} <ExternalLink className="w-3 h-3" /></a>}
                  </div>
                )}
                {detOrdem && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="font-medium text-gray-700 flex items-center gap-1.5"><FileText className="w-4 h-4 text-violet-600" /> Ordem de Compra {detOrdem.numeroOc ?? ""}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {field("Fornecedor (OC)", detOrdem.fornecedorNome)}
                      {field("Nota Fiscal", detOrdem.numeroNf)}
                      {field("Total da OC", detOrdem.total != null ? formatBRL(Number(detOrdem.total)) : null)}
                      {field("Itens", detItens.length ? `${detItens.length} item(ns)` : null)}
                    </div>
                  </div>
                )}
                {detOrigem && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="font-medium text-gray-700">{detOrigem.titulo}</div>
                    {detOrigem.subtitulo && <div className="text-xs text-gray-500">{detOrigem.subtitulo}</div>}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400 text-sm">Lançamento não encontrado.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
