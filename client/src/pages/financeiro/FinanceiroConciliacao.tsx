import { useMemo, useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle, Upload, FileText, Sparkles, ArrowRight, ChevronLeft, ChevronRight, Landmark, Check, RotateCcw, Loader2, Eye, Paperclip, ExternalLink, Maximize2, Trash2, CalendarX } from "lucide-react";
import { useLocation } from "wouter";
import { formatConta, formatAgencia } from "@/lib/formatters";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtData(v: any) {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v.length > 10 ? v : v + "T00:00:00") : new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function bancoCor(banco?: string): { bg: string; text: string } {
  const b = (banco ?? "").toLowerCase();
  if (b.includes("caixa")) return { bg: "bg-blue-100", text: "text-blue-700" };
  if (b.includes("santander")) return { bg: "bg-red-100", text: "text-red-700" };
  if (b.includes("ita")) return { bg: "bg-orange-100", text: "text-orange-700" };
  if (b.includes("bradesco")) return { bg: "bg-pink-100", text: "text-pink-700" };
  if (b.includes("brasil")) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-gray-100", text: "text-gray-700" };
}

export default function FinanceiroConciliacao() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  // Rev. 3165 — Período pelo MESMO PADRÃO das demais telas do Financeiro: navegação por
  // ANO + meses (Jan–Dez). `mesSel=null` = "Ano todo". dataInicio/dataFim derivam daí.
  const _now = new Date();
  const [ano, setAno] = useState(_now.getFullYear());
  const [mesSel, setMesSel] = useState<number | null>(_now.getMonth() + 1);
  const { dataInicio, dataFim } = useMemo(() => {
    if (mesSel == null) return { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
    const mm = String(mesSel).padStart(2, "0");
    const ultimoDia = new Date(ano, mesSel, 0).getDate();
    return { dataInicio: `${ano}-${mm}-01`, dataFim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
  }, [ano, mesSel]);
  // Rev. 3176 — A tolerância de conciliação passa a refletir os DIAS EXATOS do mês
  // selecionado (FEV/2026 = 28, JAN = 31, etc.), em vez de um teto fixo de 30. Em
  // "Ano todo" usa 31 (teto razoável; backend limita a 60). É o padrão e re-sincroniza
  // ao trocar de mês/ano.
  const diasDoMes = useMemo(() => {
    if (mesSel == null) return 31;
    return new Date(ano, mesSel, 0).getDate();
  }, [ano, mesSel]);
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [conciliadoFilter, setConciliadoFilter] = useState("all");
  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFormato, setImportFormato] = useState<"ofx" | "csv" | "pdf">("ofx");
  const [importConta, setImportConta] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [csvSeparador, setCsvSeparador] = useState(";");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [toleranciaDias, setToleranciaDias] = useState(() => new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate());
  // Re-sincroniza a tolerância com os dias exatos do mês ao trocar de mês/ano.
  useEffect(() => { setToleranciaDias(diasDoMes); }, [diasDoMes]);
  // Opções do dropdown: presets curtos + os dias exatos do mês (dedup, ordenado).
  const tolOptions = useMemo(() => {
    const set = new Set<number>([0, 1, 2, 3, 5, 7, 10, 15, diasDoMes]);
    return Array.from(set).sort((a, b) => a - b);
  }, [diasDoMes]);
  const [selSug, setSelSug] = useState<Set<number>>(new Set());
  // Rev. 3177 — clicar no lançamento das sugestões abre um detalhe CONSULTIVO (read-only).
  const [detalheEntryId, setDetalheEntryId] = useState<number | null>(null);
  // Rev. 3179 — "Limpar extrato" (confirmação) + alerta de extrato de outro mês.
  const [confirmLimpar, setConfirmLimpar] = useState(false);
  const [mismatch, setMismatch] = useState<{ detectado: string; selecionado: string; fora: number; total: number; anoNum: number; mesNum: number } | null>(null);

  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: statements, isLoading: stLoading, refetch: refetchSt } = (trpc as any).financial.getBankStatements.useQuery(
    {
      companyId,
      contaBancariaId: parseInt(contaBancariaId) || 0,
      dataInicio,
      dataFim,
      conciliado: conciliadoFilter !== "all" ? conciliadoFilter === "conciliado" : undefined,
    },
    { enabled: !!companyId && !!contaBancariaId }
  );

  const { data: entries } = (trpc as any).financial.getEntries.useQuery(
    { companyId, dataInicio, dataFim, limit: 100 },
    { enabled: !!companyId }
  );

  // Rev. 3165 — Extrato do ANO inteiro (apenas p/ pintar as bolinhas de status de cada mês),
  // independente do mês selecionado na timeline. Só busca quando há conta escolhida.
  const { data: statementsAno, refetch: refetchStAno } = (trpc as any).financial.getBankStatements.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` },
    { enabled: !!companyId && !!contaBancariaId }
  );
  // Rev. 3170 — Status de conciliação POR CONTA no período selecionado, p/ pintar cada
  // card de conta (verde = extrato subido e 100% conciliado; azul = tem pendência;
  // cinza = sem extrato no período). Independe da conta selecionada.
  const { data: accStatus, refetch: refetchAccStatus } = (trpc as any).financial.getBankAccountsConciliacaoStatus.useQuery(
    { companyId, dataInicio, dataFim },
    { enabled: !!companyId }
  );
  const accStatusMap: Record<number, "consolidado" | "lancamento" | "vazio"> = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (const a of (accStatus ?? [])) map[Number(a.contaBancariaId)] = a.status;
    return map;
  }, [accStatus]);

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
      b.total++;
      if (!s.conciliado) b.pend++;
      byMonth[m] = b;
    }
    for (let m = 1; m <= 12; m++) {
      const b = byMonth[m];
      map[m] = !b || b.total === 0 ? "vazio" : b.pend === 0 ? "consolidado" : "lancamento";
    }
    return map;
  }, [statementsAno]);

  const conciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Conciliação registrada!" }); refetchSt(); refetchStAno(); refetchAccStatus(); setSelectedStatement(null); setSelectedEntry(null); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Rev. 3175 — Importação em 2 fases com PROGRESSO REAL (0–100%): analisa (parse →
  // devolve linhas) e grava em LOTES; o % = linhas processadas / total.
  const analyzeMut = (trpc as any).financial.analyzeBankStatement.useMutation();
  const insertBatchMut = (trpc as any).financial.insertBankStatementBatch.useMutation();
  const [importRunning, setImportRunning] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [importLabel, setImportLabel] = useState("");

  // Rev. 3169 — Consolidar / desconsolidar o mês de uma vez (fecha/reabre todas as
  // linhas do extrato da conta+período). Repinta o extrato do mês e as bolinhas do ano.
  const consolidarMut = (trpc as any).financial.consolidarMes.useMutation({
    onSuccess: (res: any) => { toast({ title: `Mês consolidado! ${res.afetados} lançamento(s) marcado(s).` }); refetchSt(); refetchStAno(); refetchAccStatus(); },
    onError: (e: any) => toast({ title: "Erro ao consolidar", description: e.message, variant: "destructive" }),
  });
  const desconsolidarMut = (trpc as any).financial.desconsolidarMes.useMutation({
    onSuccess: (res: any) => { toast({ title: `Mês reaberto! ${res.afetados} lançamento(s) desmarcado(s).` }); refetchSt(); refetchStAno(); refetchAccStatus(); },
    onError: (e: any) => toast({ title: "Erro ao desconsolidar", description: e.message, variant: "destructive" }),
  });
  // Rev. 3179 — Limpar extrato importado errado (conta+período). Soft-delete no backend.
  const limparMut = (trpc as any).financial.limparExtrato.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res.afetados > 0 ? `Extrato limpo! ${res.afetados} linha(s) removida(s).` : "Nada para limpar neste período." });
      setConfirmLimpar(false);
      refetchSt(); refetchStAno(); refetchAccStatus(); if (mostrarSugestoes) refetchSug();
    },
    onError: (e: any) => toast({ title: "Erro ao limpar extrato", description: e.message, variant: "destructive" }),
  });

  const { data: sugData, isFetching: sugLoading, refetch: refetchSug } = (trpc as any).financial.sugerirConciliacao.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim, toleranciaDias },
    { enabled: !!companyId && !!contaBancariaId && mostrarSugestoes }
  );
  const sugestoes: any[] = sugData?.sugestoes ?? [];
  const semMatch: any[] = sugData?.semMatch ?? [];

  // Detalhe consultivo do lançamento (mesmo endpoint usado em Contas a Pagar).
  const detailQuery = (trpc as any).financial.getEntryDetalhe.useQuery(
    { id: detalheEntryId ?? 0, companyId },
    { enabled: !!detalheEntryId && !!companyId }
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

  const conciliarSugMut = (trpc as any).financial.conciliarSugestoes.useMutation({
    onSuccess: (res: any) => {
      toast({ title: `${res.conciliados} de ${res.total} conciliados e baixados!` });
      setSelSug(new Set());
      refetchSt();
      refetchStAno();
      refetchAccStatus();
      refetchSug();
    },
    onError: (e: any) => toast({ title: "Erro ao conciliar", description: e.message, variant: "destructive" }),
  });

  const toggleSug = (id: number) => setSelSug(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const selecionarAlta = () => setSelSug(new Set(sugestoes.filter(s => s.confianca === "alta").map(s => s.statementLineId)));
  const selecionarTodas = () => setSelSug(new Set(sugestoes.map(s => s.statementLineId)));
  const conciliarSelecionadas = () => {
    const pares = sugestoes.filter(s => selSug.has(s.statementLineId)).map(s => ({ statementLineId: s.statementLineId, entryId: s.entryId }));
    if (pares.length === 0) { toast({ title: "Selecione ao menos uma sugestão", variant: "destructive" }); return; }
    conciliarSugMut.mutate({ companyId, pares });
  };

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isImagem = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif"].includes(ext);
    if (isImagem) {
      e.target.value = "";
      toast({
        title: "Imagem não é lida automaticamente",
        description: "Extratos em foto/imagem ainda não são interpretados. Envie o PDF gerado pelo internet banking, ou um arquivo OFX/CSV.",
        variant: "destructive",
      });
      return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    if (ext === "pdf") {
      setImportFormato("pdf");
      reader.onload = (ev) => {
        const res = (ev.target?.result as string) ?? "";
        setImportContent(res.replace(/^data:[^,]*,/, ""));
      };
      reader.readAsDataURL(file);
    } else {
      if (ext === "ofx" || ext === "qfx") setImportFormato("ofx");
      else setImportFormato("csv");
      reader.onload = (ev) => { setImportContent(ev.target?.result as string ?? ""); };
      reader.readAsText(file, "ISO-8859-1");
    }
  }

  async function handleImport(skipMonthCheck = false) {
    if (!importContent) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; }
    if (!importConta) { toast({ title: "Selecione a conta bancária", variant: "destructive" }); return; }
    const contaId = parseInt(importConta);
    setImportRunning(true);
    setImportPct(2);
    setImportLabel("Lendo e analisando o extrato...");
    try {
      // FASE 1 — analisar (parse no servidor; nada é gravado ainda)
      const analysis: any = await analyzeMut.mutateAsync({
        companyId,
        contaBancariaId: contaId,
        formato: importFormato,
        conteudo: importContent,
        csvSeparador: importFormato === "csv" ? csvSeparador : undefined,
      });
      const linhas: any[] = analysis?.lines ?? [];
      const total = linhas.length;
      const importadoEm: string = analysis?.importadoEm;
      if (total === 0) {
        toast({ title: "Nenhuma transação encontrada no arquivo", variant: "destructive" });
        return;
      }
      setImportPct(10);
      setImportLabel(`Extrato lido: ${total} transações. Gravando...`);

      // Rev. 3179 — ALERTA/BLOQUEIO: extrato de outro mês ≠ mês selecionado. Detecta o
      // mês DOMINANTE (YYYY-MM mais frequente) entre as linhas; havendo mês selecionado
      // (não "Ano todo") e divergindo, ABORTA a gravação e abre o alerta de decisão.
      if (!skipMonthCheck && mesSel != null) {
        const selKey = `${ano}-${String(mesSel).padStart(2, "0")}`;
        const counts = new Map<string, number>();
        for (const l of linhas) { const k = String(l?.data ?? "").slice(0, 7); if (k.length === 7) counts.set(k, (counts.get(k) ?? 0) + 1); }
        let dom = ""; let domN = 0;
        for (const [k, n] of counts) { if (n > domN) { dom = k; domN = n; } }
        if (dom && dom !== selKey) {
          const fora = linhas.filter(l => String(l?.data ?? "").slice(0, 7) !== selKey).length;
          const [ay, am] = dom.split("-");
          setMismatch({ detectado: dom, selecionado: selKey, fora, total, anoNum: parseInt(ay, 10), mesNum: parseInt(am, 10) });
          return; // não grava — usuário decide no alerta (trocar p/ o mês certo ou cancelar)
        }
      }

      // FASE 2 — gravar em lotes (progresso real = processadas/total)
      const CHUNK = 40;
      let inserted = 0;
      let skipped = 0;
      let processed = 0;
      for (let i = 0; i < total; i += CHUNK) {
        const slice = linhas.slice(i, i + CHUNK);
        const isLast = i + CHUNK >= total;
        const r: any = await insertBatchMut.mutateAsync({
          companyId,
          contaBancariaId: contaId,
          formato: importFormato,
          importadoEm,
          linhas: slice,
          finalize: isLast,
          totalInseridos: inserted,
          totalDuplicados: skipped,
        });
        inserted += r?.inserted ?? 0;
        skipped += r?.skipped ?? 0;
        processed += slice.length;
        setImportPct(10 + Math.round((processed / total) * 90));
        setImportLabel(`Gravando ${Math.min(processed, total)} de ${total} transações...`);
      }

      setImportPct(100);
      setImportLabel("Concluído!");
      toast({ title: `Importação concluída! ${inserted} inseridos, ${skipped} duplicados ignorados` });
      setShowImport(false);
      setImportContent("");
      setImportFileName("");
      refetchSt();
      refetchStAno();
      refetchAccStatus();
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e?.message || "Falha ao importar o extrato.", variant: "destructive" });
    } finally {
      setImportRunning(false);
      setTimeout(() => { setImportPct(0); setImportLabel(""); }, 500);
    }
  }

  const pendentes = (statements ?? []).filter((s: any) => !s.conciliado);
  const conciliados = (statements ?? []).filter((s: any) => s.conciliado);
  const totalEntradas = pendentes.filter((s: any) => s.tipo === "credito").reduce((a: number, s: any) => a + Number(s.valor), 0);
  const totalSaidas = pendentes.filter((s: any) => s.tipo === "debito").reduce((a: number, s: any) => a + Math.abs(Number(s.valor)), 0);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-blue-600" />Conciliação Bancária
            </h1>
            <p className="text-sm text-gray-500 mt-1">Relacione os lançamentos do sistema com o extrato bancário</p>
          </div>
          <div className="flex items-center gap-2">
            {contaBancariaId && mesSel != null && mesesStatus[mesSel] !== "vazio" && (
              mesesStatus[mesSel] === "consolidado" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  disabled={desconsolidarMut.isPending}
                  onClick={() => desconsolidarMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim })}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  {desconsolidarMut.isPending ? "Reabrindo..." : `Desconsolidar ${MESES[mesSel - 1]}`}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-green-600 text-green-700 hover:bg-green-50"
                  disabled={consolidarMut.isPending}
                  onClick={() => consolidarMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim })}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  {consolidarMut.isPending ? "Consolidando..." : `Consolidar ${MESES[mesSel - 1]}`}
                </Button>
              )
            )}
            <Button size="sm" variant="outline" className="h-9 border-blue-600 text-blue-700 hover:bg-blue-50" onClick={() => setLocation("/financeiro/conciliacao/workspace")}>
              <Maximize2 className="w-3.5 h-3.5 mr-1.5" />Abrir em tela cheia
            </Button>
            <Button size="sm" className="h-9" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
              <Upload className="w-3.5 h-3.5 mr-1.5" />Importar Extrato
            </Button>
            {contaBancariaId && (statements ?? []).length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-red-500 text-red-600 hover:bg-red-50"
                disabled={limparMut.isPending}
                onClick={() => setConfirmLimpar(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {limparMut.isPending ? "Limpando..." : "Limpar extrato"}
              </Button>
            )}
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Rev. 3165 — Período pelo MESMO PADRÃO do Lançamentos/Contas a Pagar:
                  navegação por ANO + faixa de meses (Jan–Dez) com bolinhas de status.
                  Clicar num mês filtra aquele mês; "Ano todo" abre o ano. */}
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                    <button type="button" onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <Button
                      type="button"
                      variant={mesSel == null ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs ml-2"
                      onClick={() => setMesSel(null)}
                    >
                      Ano todo
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
                  </div>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {MESES.map((m, i) => {
                    const num = i + 1;
                    const status = mesesStatus[num];
                    const isSelected = mesSel === num;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMesSel(num)}
                        className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                          ${isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        <span>{m}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          status === "consolidado" ? "bg-green-500" :
                          status === "lancamento" ? "bg-blue-500" :
                          "bg-gray-300"
                        }`} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Conta Bancária</p>
                {(bankAccounts ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">Nenhuma conta bancária cadastrada.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {(bankAccounts ?? []).map((b: any) => {
                      const isSel = contaBancariaId === String(b.id);
                      const cor = bancoCor(b.banco);
                      const desc = b.descricao ?? b.tipo ?? "";
                      // Rev. 3170 — status de conciliação da conta no período: verde =
                      // extrato subido e 100% conciliado; azul = tem extrato com pendência;
                      // cinza = sem extrato. A cor do card segue esse status.
                      const accSt = accStatusMap[Number(b.id)] ?? "vazio";
                      const isConsol = accSt === "consolidado";
                      const isLanc = accSt === "lancamento";
                      const cardCls = isSel
                        ? (isConsol
                            ? "border-green-500 bg-green-50 ring-1 ring-green-200 shadow-sm"
                            : "border-blue-500 bg-blue-50 ring-1 ring-blue-200 shadow-sm")
                        : (isConsol
                            ? "border-green-300 bg-green-50/60 hover:border-green-400"
                            : isLanc
                              ? "border-blue-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50");
                      return (
                        <button
                          key={b.id}
                          type="button"
                          aria-pressed={isSel}
                          aria-label={`Conta ${b.banco} agência ${b.agencia} conta ${b.conta} — ${isConsol ? "conciliada" : isLanc ? "com pendências" : "sem extrato"}${isSel ? " (selecionada — clique para desmarcar)" : ""}`}
                          onClick={() => setContaBancariaId(isSel ? "" : String(b.id))}
                          className={`relative flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${cardCls}`}
                        >
                          <div className={`relative h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${cor.bg}`}>
                            <Landmark className={`h-[18px] w-[18px] ${cor.text}`} />
                            {isSel && (
                              <span className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-white ${isConsol ? "bg-green-500" : "bg-blue-500"}`}>
                                <Check className="h-2.5 w-2.5 text-white" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {b.banco}{desc ? ` · ${desc}` : ""}
                            </p>
                            <p className="text-xs text-gray-500 font-mono tracking-wide truncate">
                              Ag. {formatAgencia(b.agencia)} / {formatConta(b.conta)}
                            </p>
                            <span className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isConsol ? "bg-green-100 text-green-700"
                              : isLanc ? "bg-blue-100 text-blue-700"
                              : "bg-gray-100 text-gray-500"
                            }`}>
                              {isConsol ? <><CheckCircle className="h-2.5 w-2.5" />Conciliado</>
                                : isLanc ? <><AlertCircle className="h-2.5 w-2.5" />A conciliar</>
                                : "Sem extrato"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-end">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <Select value={conciliadoFilter} onValueChange={setConciliadoFilter}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="conciliado">Conciliados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!contaBancariaId ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <RefreshCw className="w-14 h-14 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">Selecione uma conta bancária para iniciar a conciliação.</p>
              <p className="text-xs text-gray-400 mt-2">Ou importe um extrato bancário (OFX/CSV) para começar</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-500">Entradas Pendentes</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">{formatBRL(totalEntradas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-gray-500">Saídas Pendentes</span>
                  </div>
                  <p className="text-xl font-bold text-red-500">{formatBRL(totalSaidas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-gray-500">Itens Conciliados</span>
                  </div>
                  <p className="text-xl font-bold text-blue-600">{conciliados.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Sugestões Automáticas de Conciliação
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-500">Tolerância (dias)</Label>
                    <Select value={String(toleranciaDias)} onValueChange={v => setToleranciaDias(parseInt(v))}>
                      <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {tolOptions.map(d => (
                          <SelectItem key={d} value={String(d)}>
                            {d === diasDoMes && mesSel != null ? `${d} (mês)` : d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant={mostrarSugestoes ? "outline" : "default"}
                      onClick={() => { setMostrarSugestoes(true); setSelSug(new Set()); if (mostrarSugestoes) refetchSug(); }}
                      disabled={sugLoading}
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      {sugLoading ? "Analisando..." : mostrarSugestoes ? "Reanalisar" : "Sugerir conciliação"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {mostrarSugestoes && (
                <CardContent className="pt-0">
                  {sugLoading ? (
                    <p className="text-sm text-gray-500 py-6 text-center">Cruzando extrato × lançamentos por valor, direção e data…</p>
                  ) : sugestoes.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Nenhuma sugestão automática para a conta/período selecionados.
                      {sugData ? ` (${sugData.totalLinhas ?? 0} linha(s) de extrato analisada(s))` : ""}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <Button size="sm" variant="outline" onClick={selecionarAlta}>Selecionar alta confiança</Button>
                        <Button size="sm" variant="outline" onClick={selecionarTodas}>Selecionar todas</Button>
                        <Button size="sm" variant="outline" onClick={() => setSelSug(new Set())}>Limpar</Button>
                        <Button
                          size="sm"
                          className="ml-auto"
                          onClick={conciliarSelecionadas}
                          disabled={conciliarSugMut.isPending || selSug.size === 0}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {conciliarSugMut.isPending ? "Conciliando..." : `Conciliar selecionadas (${selSug.size})`}
                        </Button>
                      </div>
                      <div className="border rounded-md divide-y max-h-[480px] overflow-y-auto">
                        {sugestoes.map(s => (
                          <label key={s.statementLineId} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                            <Checkbox checked={selSug.has(s.statementLineId)} onCheckedChange={() => toggleSug(s.statementLineId)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Extrato</div>
                              <div className="text-sm font-medium truncate">{s.extratoDescricao || "—"}</div>
                              <div className="text-xs text-gray-500">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDetalheEntryId(s.entryId); }}
                              title="Ver detalhes do lançamento"
                              className="flex-1 min-w-0 text-left rounded-md -m-1 p-1 hover:bg-blue-50 transition-colors group/lan"
                            >
                              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5 flex items-center gap-1">
                                Lançamento <Eye className="w-3 h-3 text-blue-400 opacity-0 group-hover/lan:opacity-100 transition-opacity" />
                              </div>
                              <div className="text-sm font-medium truncate text-blue-700 group-hover/lan:underline">{s.entryFornecedor || s.entryDescricao || "—"}</div>
                              <div className="text-xs text-gray-500 truncate">
                                {fmtData(s.entryData)} · {formatBRL(Math.abs(s.entryValor))}
                                {s.entryObra ? ` · ${s.entryObra}` : ""}
                              </div>
                            </button>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <Badge variant={s.confianca === "alta" ? "default" : "secondary"}>
                                {s.confianca === "alta" ? "Alta" : "Média"}
                              </Badge>
                              <span className="text-[10px] text-gray-400">{s.deltaDias === 0 ? "mesmo dia" : `±${s.deltaDias}d`}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                      {semMatch.length > 0 && (
                        <p className="text-xs text-gray-400">
                          {semMatch.length} linha(s) de extrato sem lançamento correspondente (concilie manualmente abaixo).
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Rev. 3177 — Detalhe CONSULTIVO (read-only) do lançamento, aberto ao clicar na sugestão. */}
            <Dialog open={!!detalheEntryId} onOpenChange={(o) => !o && setDetalheEntryId(null)}>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader className="shrink-0 pr-14">
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                    {detEntry ? `Lançamento #${detEntry.id}` : "Lançamento"}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                  {detailQuery.isLoading ? (
                    <div className="py-12 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Carregando lançamento…
                    </div>
                  ) : detailQuery.error ? (
                    <div className="py-12 text-center text-red-600 text-sm">
                      Erro ao carregar o lançamento: {(detailQuery.error as any)?.message ?? "tente novamente"}.
                    </div>
                  ) : detEntry ? (
                    <div className="space-y-4 text-sm">
                      {/* Cabeçalho */}
                      <div className="flex items-start justify-between gap-3 bg-gray-50 rounded-lg p-3">
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-gray-900 break-words">
                            {detEntry.fornecedorNome || detEntry.descricao || detEntry.contaNome || "Lançamento"}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {detEntry.tipo === "despesa" ? <ArrowDownCircle className="w-3.5 h-3.5 text-red-500" /> : <ArrowUpCircle className="w-3.5 h-3.5 text-green-600" />}
                            <span className="capitalize">{detEntry.tipo ?? "—"}</span>
                            {detEntry.natureza ? <span className="text-gray-400">· {detEntry.natureza}</span> : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-lg font-bold ${detEntry.tipo === "despesa" ? "text-red-600" : "text-green-700"}`}>
                            {formatBRL(Number(detEntry.valorRealizado ?? detEntry.valorPrevisto ?? 0))}
                          </div>
                          <Badge variant={detEntry.status === "pago" || detEntry.status === "recebido" ? "default" : detEntry.status === "cancelado" ? "destructive" : "secondary"} className="mt-1 capitalize">
                            {detEntry.status ?? "—"}
                          </Badge>
                        </div>
                      </div>

                      {/* Campos principais */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {field("Valor Previsto", detEntry.valorPrevisto != null ? formatBRL(Number(detEntry.valorPrevisto)) : null)}
                        {field("Valor Realizado", detEntry.valorRealizado != null ? formatBRL(Number(detEntry.valorRealizado)) : null)}
                        {field("Data Competência", fmtData(detEntry.dataCompetencia))}
                        {field("Data Vencimento", fmtData(detEntry.dataVencimento))}
                        {field("Data Pagamento", fmtData(detEntry.dataPagamento))}
                        {field("Forma de Pagamento", detEntry.formaPagamento)}
                        {field("Conta", detEntry.contaNome)}
                        {field("Obra", detEntry.obraNome)}
                        {field("Parcela", detEntry.parcelaTotal ? `${detEntry.parcelaNumero ?? 1}/${detEntry.parcelaTotal}` : null)}
                        {field("Cheque nº", detEntry.chequeNumero ? `${detEntry.chequeNumero}${detEntry.chequeBanco ? ` · ${detEntry.chequeBanco}` : ""}` : null)}
                        {field("Cheque bom para", fmtData(detEntry.chequeDataBomPara))}
                        {field("Código de Barras", detEntry.codigoBarras)}
                        {field("Conciliado", Number(detEntry.conciliado) === 1 ? `Sim${detEntry.dataConciliacao ? ` (${fmtData(detEntry.dataConciliacao)})` : ""}` : "Não")}
                        {field("Dias em Atraso", Number(detEntry.diasAtraso) > 0 ? `${detEntry.diasAtraso} dia(s)` : null)}
                        {field("Origem", detEntry.origemModulo)}
                        {field("Criado por", detEntry.criadoPorNome)}
                      </div>

                      {(detEntry.descricao || detEntry.origemDescricao || detEntry.observacoes || detEntry.extratoBancoDescricao) && (
                        <div className="space-y-2 border-t pt-3">
                          {field("Descrição", detEntry.descricao)}
                          {field("Origem (detalhe)", detEntry.origemDescricao)}
                          {field("Observações", detEntry.observacoes)}
                          {field("Descrição no Extrato", detEntry.extratoBancoDescricao)}
                          {detEntry.status === "cancelado" ? field("Motivo do Cancelamento", detEntry.motivoCancelamento) : null}
                        </div>
                      )}

                      {/* Anexos / comprovante */}
                      {(detEntry.comprovanteUrl || detEntry.anexoUrl) && (
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          {detEntry.comprovanteUrl && (
                            <a href={detEntry.comprovanteUrl} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50">
                              <Paperclip className="w-3.5 h-3.5" /> Comprovante <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {detEntry.anexoUrl && (
                            <a href={detEntry.anexoUrl} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50">
                              <Paperclip className="w-3.5 h-3.5" /> {detEntry.anexoNome || "Anexo"} <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Ordem de Compra de origem */}
                      {detOrdem && (
                        <div className="border-t pt-3 space-y-2">
                          <div className="font-medium text-gray-700 flex items-center gap-1.5"><FileText className="w-4 h-4 text-violet-600" /> Ordem de Compra {detOrdem.numeroOc ?? ""}</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {field("Fornecedor (OC)", detOrdem.fornecedorNome)}
                            {field("Nota Fiscal", detOrdem.numeroNf)}
                            {field("Total da OC", detOrdem.total != null ? formatBRL(Number(detOrdem.total)) : null)}
                            {field("Condição", detOrdem.condicaoPagamento)}
                            {field("Status OC", detOrdem.status)}
                            {field("Itens", detItens.length ? `${detItens.length} item(ns)` : null)}
                          </div>
                        </div>
                      )}

                      {/* Origem genérica (folha, cronograma, frota, etc.) */}
                      {detOrigem && (
                        <div className="border-t pt-3 space-y-2">
                          <div className="font-medium text-gray-700">{detOrigem.titulo}</div>
                          {detOrigem.subtitulo && <div className="text-xs text-gray-500">{detOrigem.subtitulo}</div>}
                          {Array.isArray(detOrigem.campos) && (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                              {detOrigem.campos.map((c: any, i: number) => field(c.label ?? `Campo ${i + 1}`, c.kind === "date" ? fmtData(c.value) : (c.value ?? "—"), `campo-${i}`))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                <DialogFooter className="shrink-0">
                  <Button variant="outline" onClick={() => setDetalheEntryId(null)}>Fechar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="grid grid-cols-2 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Extrato Bancário ({pendentes.length} pendentes)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {stLoading ? (
                    <div className="p-6 text-center text-gray-500">Carregando...</div>
                  ) : pendentes.length === 0 ? (
                    <div className="p-6 text-center text-gray-400">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>Nenhum item pendente.</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
                        Importar Extrato
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                      {pendentes.map((s: any) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedStatement(selectedStatement === s.id ? null : s.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedStatement === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                        >
                          <div>
                            <p className="text-xs text-gray-500">{s.data ? new Date(s.data).toLocaleDateString("pt-BR") : "—"}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[180px]">{s.descricao}</p>
                          </div>
                          <p className={`text-sm font-bold ${Number(s.valor) >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {formatBRL(Number(s.valor))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lançamentos do Sistema</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!selectedStatement ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Selecione um item do extrato para relacionar.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                      {(entries?.data ?? []).filter((e: any) => !e.conciliado && e.status !== "cancelado").map((e: any) => (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEntry(selectedEntry === e.id ? null : e.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedEntry === e.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                        >
                          <div>
                            <p className="text-xs text-gray-500">{e.dataCompetencia ? new Date(e.dataCompetencia).toLocaleDateString("pt-BR") : "—"}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[180px]">{e.descricao ?? e.contaNome ?? "—"}</p>
                            <p className="text-xs text-gray-400">{e.obraNome ?? ""}</p>
                          </div>
                          <p className={`text-sm font-bold ${e.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
                            {e.tipo === "receita" ? "+" : "-"}{formatBRL(Number(e.valorPrevisto))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {selectedStatement && selectedEntry && (
              <div className="flex justify-center">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                  disabled={conciliarMut.isPending}
                  onClick={() => conciliarMut.mutate({ companyId, statementLineId: selectedStatement, entryId: selectedEntry })}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {conciliarMut.isPending ? "Conciliando..." : "Conciliar Selecionados"}
                </Button>
              </div>
            )}
          </>
        )}

        <Dialog open={showImport} onOpenChange={setShowImport}>
          <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
            <DialogHeader className="px-6 pt-6 pb-4 pr-14 border-b border-gray-100 space-y-0 shrink-0">
              <DialogTitle className="flex items-start gap-3 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <Upload className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex flex-col justify-center">
                  <span className="block text-base font-semibold leading-tight">Importar Extrato Bancário</span>
                  <span className="block text-xs font-normal text-gray-500 leading-snug mt-1">
                    Anexe o extrato (OFX, QFX, CSV, PDF, imagem...)
                  </span>
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="px-6 py-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Conta Bancária</Label>
                {(() => {
                  const conta = (bankAccounts ?? []).find((b: any) => String(b.id) === importConta);
                  const periodo = mesSel != null ? `${MESES[mesSel - 1]}/${ano}` : `Ano ${ano}`;
                  if (!conta) return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">Selecione a conta bancária na tela antes de importar.</div>
                  );
                  const cor = bancoCor(conta.banco);
                  return (
                    <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2.5">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${cor.bg} ${cor.text}`}><Landmark className="w-4 h-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-800">{conta.banco}{conta.descricao ? ` · ${conta.descricao}` : ""}</span>
                        <span className="block truncate text-[11px] text-gray-500">Ag. {formatAgencia(conta.agencia)}/{formatConta(conta.conta)} · {periodo}</span>
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Arquivo *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
                    importContent
                      ? "border-green-300 bg-green-50/60 hover:bg-green-50"
                      : "border-gray-200 bg-gray-50/60 hover:border-blue-300 hover:bg-blue-50/40"
                  }`}
                >
                  <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${importContent ? "bg-green-100 text-green-600" : "bg-white text-gray-400 border border-gray-200"}`}>
                    {importContent ? <Check className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </span>
                  <span className="mt-2 block truncate text-sm font-medium text-gray-700">
                    {importFileName || "Clique para selecionar um arquivo"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-gray-400">
                    {importContent
                      ? `${(importFileName.split(".").pop() || "arquivo").toUpperCase()} · ${(importContent.length / 1024).toFixed(1)} KB carregado`
                      : "Qualquer formato (OFX, QFX, CSV, PDF, imagem...)"}
                  </span>
                </button>
              </div>

              {importFormato === "csv" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Separador CSV</Label>
                  <Select value={csvSeparador} onValueChange={setCsvSeparador}>
                    <SelectTrigger className="w-full h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=";">Ponto e vírgula (;)</SelectItem>
                      <SelectItem value=",">Vírgula (,)</SelectItem>
                      <SelectItem value="\t">Tab</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-gray-400">
                    O CSV deve ter colunas: Data, Descrição, Valor (e opcionalmente Saldo)
                  </p>
                </div>
              )}

              {importFormato === "pdf" && (
                <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                  <FileText className="w-3.5 h-3.5 shrink-0 mt-px text-blue-500" />
                  PDF de extrato da Caixa (internet banking) detectado — as transações serão extraídas automaticamente. Selecione a conta correta acima.
                </p>
              )}

              {importRunning && (
                <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-blue-800 truncate">
                      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                      <span className="truncate">{importLabel || "Processando..."}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-blue-700">{importPct}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${importPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 sm:gap-2 shrink-0">
              <Button variant="outline" onClick={() => setShowImport(false)} disabled={importRunning}>Cancelar</Button>
              <Button onClick={() => handleImport()} disabled={importRunning || !importContent || !importConta}>
                {importRunning ? `Importando... ${importPct}%` : "Importar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3179 — Confirmação de "Limpar extrato" (soft-delete por conta + período) */}
        <AlertDialog open={confirmLimpar} onOpenChange={(o: boolean) => { if (!o) setConfirmLimpar(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600" />Limpar extrato importado?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso remove as <strong>{(statements ?? []).length}</strong> linha(s) de extrato da conta selecionada no período{mesSel != null ? <> de <strong>{MESES[mesSel - 1]}/{ano}</strong></> : <> do ano <strong>{ano}</strong></>}.
                Os lançamentos do ERP que estavam conciliados com essas linhas voltam a ficar <strong>pendentes</strong> (nada é apagado do ERP).
                Use quando importou o extrato errado e quer reimportar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={limparMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={limparMut.isPending}
                onClick={(e: any) => { e.preventDefault(); limparMut.mutate({ companyId, contaBancariaId: parseInt(contaBancariaId), dataInicio, dataFim }); }}
              >
                {limparMut.isPending ? "Limpando..." : "Sim, limpar extrato"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Rev. 3179 — Alerta de extrato de OUTRO mês ≠ mês selecionado (bloqueia gravação) */}
        <AlertDialog open={mismatch != null} onOpenChange={(o: boolean) => { if (!o) setMismatch(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><CalendarX className="w-5 h-5 text-amber-600" />Extrato de outro mês?</AlertDialogTitle>
              <AlertDialogDescription>
                {mismatch && (
                  <>
                    Você selecionou <strong>{MESES[(mismatch.selecionado.length === 7 ? parseInt(mismatch.selecionado.slice(5, 7), 10) : 1) - 1]}/{mismatch.selecionado.slice(0, 4)}</strong>, mas o extrato parece ser de <strong>{MESES[mismatch.mesNum - 1]}/{mismatch.anoNum}</strong>
                    {mismatch.fora > 0 ? <> ({mismatch.fora} de {mismatch.total} transações fora do mês selecionado)</> : null}.
                    A importação foi <strong>bloqueada</strong> para evitar misturar meses. O que deseja fazer?
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={importRunning}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-blue-600 hover:bg-blue-700"
                disabled={importRunning}
                onClick={(e: any) => {
                  e.preventDefault();
                  if (mismatch) { setAno(mismatch.anoNum); setMesSel(mismatch.mesNum); }
                  setMismatch(null);
                  setTimeout(() => handleImport(true), 0);
                }}
              >
                {mismatch ? `Trocar para ${MESES[mismatch.mesNum - 1]}/${mismatch.anoNum} e importar` : "Importar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
