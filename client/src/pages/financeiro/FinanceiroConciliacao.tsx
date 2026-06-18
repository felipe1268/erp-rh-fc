import { useMemo, useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle, Upload, FileText, Sparkles, ArrowRight, ChevronLeft, ChevronRight, Landmark, Check, RotateCcw, Loader2, Eye, Paperclip, ExternalLink, Link2, X, Trash2, CalendarX, FileSpreadsheet, FileDown, Plus, Maximize2, Search } from "lucide-react";
import { formatConta, formatAgencia } from "@/lib/formatters";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
// Rev. 3198 — máscara BRL pt-BR p/ o input de valor do "Lançar no ERP".
function maskBRLInput(raw: string) {
  const d = String(raw).replace(/\D/g, "");
  return (Number(d || "0") / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseBRLInput(masked: string) {
  const d = String(masked).replace(/\D/g, "");
  return Number(d || "0") / 100;
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
  // Rev. 3219 — busca única que filtra AMBAS as listas (extrato sem lançamento + ERP sem extrato).
  const [buscaConc, setBuscaConc] = useState("");
  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
  // Rev. 3205 — expandir uma das listas de pendência em tela cheia p/ analisar melhor.
  const [expandedList, setExpandedList] = useState<"extrato" | "erp" | null>(null);
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
  // Rev. 3187 — ao escolher a conta, já dispara as sugestões automáticas (tela única).
  useEffect(() => { if (contaBancariaId) { setMostrarSugestoes(true); setSelSug(new Set()); } }, [contaBancariaId]);
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
  const [confirmConciliar, setConfirmConciliar] = useState(false);
  const [mismatch, setMismatch] = useState<{ detectado: string; selecionado: string; fora: number; total: number; anoNum: number; mesNum: number } | null>(null);

  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // ── Rev. 3198 — "Lançar no ERP" direto do item do extrato sem lançamento ─────────
  // Carrega obras/categorias/centros de custo/fornecedores p/ o usuário completar o
  // lançamento (data, conta e valor já vêm pré-preenchidos do extrato). Após criar,
  // auto-concilia com a linha do extrato (mesma mutation da conciliação manual).
  const { data: lancObras } = (trpc as any).obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const { data: lancAccounts } = (trpc as any).financial.getAccounts.useQuery({ companyId, ativo: true }, { enabled: !!companyId });
  const { data: lancCostCenters } = (trpc as any).financial.getCostCenters.useQuery({ companyId }, { enabled: !!companyId });
  const { data: lancFornecedores } = (trpc as any).compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: !!companyId });
  const obrasOpts: { id: number; nome: string }[] = useMemo(() => {
    const seen = new Set<string>(); const out: { id: number; nome: string }[] = [];
    for (const o of (Array.isArray(lancObras) ? lancObras : [])) {
      const nome = String(o?.nome ?? "").trim(); if (!nome || seen.has(nome)) continue; seen.add(nome); out.push({ id: Number(o.id), nome });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lancObras]);
  const catOpts: { id: number; nome: string; natureza: string | null; centroCustoId: number | null }[] = useMemo(() => {
    const out: { id: number; nome: string; natureza: string | null; centroCustoId: number | null }[] = [];
    for (const a of (Array.isArray(lancAccounts) ? lancAccounts : [])) {
      const nome = String(a?.nome ?? "").trim(); if (!nome) continue;
      out.push({ id: Number(a.id), nome, natureza: a.natureza ?? null, centroCustoId: a.centroCustoId ?? null });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lancAccounts]);
  const ccOpts: { id: number; nome: string }[] = useMemo(() => {
    const out: { id: number; nome: string }[] = [];
    for (const c of (Array.isArray(lancCostCenters) ? lancCostCenters : [])) {
      const nome = String(c?.nome ?? "").trim(); if (!nome) continue;
      out.push({ id: Number(c.id), nome: c.codigo ? `${c.codigo} · ${nome}` : nome });
    }
    return out;
  }, [lancCostCenters]);
  const fornNomes: string[] = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const f of (Array.isArray(lancFornecedores) ? lancFornecedores : [])) {
      const nome = String(f?.nome ?? f?.razaoSocial ?? f?.nomeFantasia ?? f?.fantasia ?? "").trim();
      if (!nome || seen.has(nome.toLowerCase())) continue; seen.add(nome.toLowerCase()); out.push(nome);
    }
    return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [lancFornecedores]);

  const [lancStatement, setLancStatement] = useState<any | null>(null);
  const [lancBusy, setLancBusy] = useState(false);
  const [lancForm, setLancForm] = useState({ data: "", valor: "", descricao: "", obraId: "", contaNome: "", centroCustoId: "", fornecedorNome: "", formaPagamento: "" });
  // Rev. 3198 — guarda o lançamento JÁ criado p/ a linha atual: se a conciliação
  // automática falhar, um novo clique tenta SÓ conciliar (não recria → sem duplicidade).
  const lancCreatedRef = useRef<{ stmtId: any; entryId: number } | null>(null);
  const criarLancMut = (trpc as any).financial.createEntry.useMutation();

  function abrirLancar(s: any) {
    const abs = Math.abs(Number(s.valor) || 0);
    lancCreatedRef.current = null;
    setLancStatement(s);
    // Rev. 3229 — se a linha do extrato foi identificada como compensação de um cheque do
    // Controle de Cheques, pré-preenche fornecedor/obra/forma e enriquece a descrição p/
    // o cadastro correto da despesa (cruzamento total extrato ↔ controle de cheques).
    const temCheque = !!s.chequeFornecedor || s.chequeNumero != null;
    const obraDoCheque = s.chequeObraId != null ? obrasOpts.find(o => o.id === Number(s.chequeObraId)) : undefined;
    const descBase = String(s.descricao ?? "").trim();
    const descCheque = temCheque
      ? [`Cheque nº ${s.chequeNumero ?? ""}`.trim(), s.chequeFornecedor ? `— ${s.chequeFornecedor}` : "", s.chequeNf ? `(NF ${s.chequeNf})` : ""].filter(Boolean).join(" ")
      : "";
    // Rev. 3230 — fatura de cartão: o ERP só considera o VALOR TOTAL (pagamento único).
    // Sem obra/fornecedor (o detalhe por obra/centro vive no módulo Cartão de Crédito).
    const temFatura = !temCheque && !!s.faturaId;
    const descFatura = temFatura
      ? `Pagamento fatura cartão ${s.faturaCartao ?? ""}${s.faturaMesRef ? ` (${String(s.faturaMesRef).padStart(2, "0")}/${s.faturaAnoRef ?? ""})` : ""}`.trim()
      : "";
    setLancForm({
      data: String(s.data ?? "").slice(0, 10),
      valor: maskBRLInput(String(Math.round(abs * 100))),
      descricao: temCheque ? (descCheque || descBase) : (temFatura ? (descFatura || descBase) : descBase),
      obraId: obraDoCheque ? String(obraDoCheque.id) : "",
      contaNome: "",
      centroCustoId: "",
      fornecedorNome: s.chequeFornecedor ?? "",
      formaPagamento: temCheque ? "cheque" : (temFatura ? "cartao" : ""),
    });
  }

  async function submitLancar() {
    if (!lancStatement) return;
    const valor = parseBRLInput(lancForm.valor);
    if (!valor || valor <= 0) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    if (!lancForm.data) { toast({ title: "Informe a data do lançamento", variant: "destructive" }); return; }
    const tipo = Number(lancStatement.valor) >= 0 ? "receita" : "despesa";
    const cat = catOpts.find(c => c.nome.trim().toLowerCase() === lancForm.contaNome.trim().toLowerCase());
    const natureza = cat?.natureza === "fixo" || cat?.natureza === "variavel" ? cat.natureza : "variavel";
    const obra = obrasOpts.find(o => String(o.id) === lancForm.obraId);
    const cc = ccOpts.find(c => String(c.id) === lancForm.centroCustoId);
    // Se já criamos o lançamento desta linha numa tentativa anterior (e só a
    // conciliação falhou), reaproveita o id — NÃO recria (evita duplicidade).
    const jaCriado = lancCreatedRef.current?.stmtId === lancStatement.id ? lancCreatedRef.current.entryId : undefined;
    try {
      setLancBusy(true);
      let entryId = jaCriado;
      if (!entryId) {
        const novo: any = await criarLancMut.mutateAsync({
          companyId, tipo, natureza,
          valorPrevisto: valor, valorRealizado: valor,
          dataCompetencia: lancForm.data, dataPagamento: lancForm.data,
          status: "pago",
          contaBancariaId: parseInt(contaBancariaId) || undefined,
          obraId: obra?.id, obraNome: obra?.nome,
          contaId: cat?.id, contaNome: lancForm.contaNome.trim() || undefined,
          centroCustoId: cc?.id, centroCustoNome: cc?.nome,
          fornecedorNome: lancForm.fornecedorNome.trim() || undefined,
          descricao: lancForm.descricao.trim() || undefined,
          formaPagamento: lancForm.formaPagamento || undefined,
        });
        entryId = novo?.id;
        if (entryId) lancCreatedRef.current = { stmtId: lancStatement.id, entryId };
      }
      if (entryId) {
        // Auto-concilia o lançamento com a linha do extrato (onSuccess refaz os fetches).
        // Mutation DEDICADA (sem onError próprio) p/ o erro cair no catch abaixo sem toast duplo.
        await lancConciliarMut.mutateAsync({ companyId, statementLineId: lancStatement.id, entryId });
        lancCreatedRef.current = null;
      } else {
        toast({ title: "Lançamento criado!" });
        refetchReport();
      }
      setLancStatement(null);
    } catch (e: any) {
      // Lançamento já criado + conciliação falhou: preserva o id; novo clique só concilia.
      if (lancCreatedRef.current?.stmtId === lancStatement.id) {
        toast({ title: "Lançamento criado, mas a conciliação falhou", description: `${e?.message ?? ""} — clique novamente para tentar conciliar (não recria o lançamento) ou concilie manualmente.`, variant: "destructive" });
      } else {
        toast({ title: "Erro ao lançar no ERP", description: e?.message, variant: "destructive" });
      }
    } finally {
      setLancBusy(false);
    }
  }

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
    onSuccess: () => { toast({ title: "Conciliação registrada!" }); refetchSt(); refetchStAno(); refetchAccStatus(); refetchReport(); refetchSug(); setSelectedStatement(null); setSelectedEntry(null); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  // Rev. 3198 — conciliação do fluxo "Lançar": SEM onError próprio (o erro é tratado
  // no catch do submitLancar, preservando o id criado p/ não duplicar no retry).
  const lancConciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Lançado e conciliado!" }); refetchSt(); refetchStAno(); refetchAccStatus(); refetchReport(); refetchSug(); setSelectedStatement(null); setSelectedEntry(null); },
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
      refetchSt(); refetchStAno(); refetchAccStatus(); refetchSug(); refetchReport();
    },
    onError: (e: any) => toast({ title: "Erro ao limpar extrato", description: e.message, variant: "destructive" }),
  });

  const { data: sugData, isFetching: sugLoading, refetch: refetchSug } = (trpc as any).financial.sugerirConciliacao.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim, toleranciaDias },
    { enabled: !!companyId && !!contaBancariaId && mostrarSugestoes }
  );
  const sugestoes: any[] = sugData?.sugestoes ?? [];
  const semMatch: any[] = sugData?.semMatch ?? [];
  // Rev. 3201 — fonte ÚNICA dos pares selecionados (contador + render do diálogo + payload),
  // p/ o número exibido nunca divergir do que será efetivamente enviado.
  const sugSelecionadas: any[] = sugestoes.filter(s => selSug.has(s.statementLineId));

  // Rev. 3190 — barra de progresso 0→100% durante a análise ("Analisando..."). O
  // sugerirConciliacao é uma query única (sem progresso real do servidor), então
  // animamos: sobe gradual (mais devagar perto do fim) enquanto cruza e completa
  // em 100% ao terminar, dando ao usuário a sensação de evolução.
  const [sugProgress, setSugProgress] = useState(0);
  useEffect(() => {
    if (sugLoading) {
      setSugProgress(8);
      const id = setInterval(() => {
        setSugProgress(p => {
          if (p >= 92) return p;
          const step = p < 50 ? 7 : p < 75 ? 3 : 1;
          return Math.min(92, p + step);
        });
      }, 200);
      return () => clearInterval(id);
    }
    setSugProgress(p => (p > 0 ? 100 : 0));
    const t = setTimeout(() => setSugProgress(0), 700);
    return () => clearTimeout(t);
  }, [sugLoading]);

  // Rev. 3187 — Relatório consolidado da conta/período (3 blocos), agora EMBUTIDO na tela
  // única (o Painel separado foi aposentado). Conciliados, extrato-sem-lançamento e
  // lançamento-sem-extrato vêm de uma fonte só (getConciliacaoReport), READ-ONLY.
  const { data: report, isFetching: reportLoading, isError: reportIsError, error: reportError, refetch: refetchReport } = (trpc as any).financial.getConciliacaoReport.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim },
    { enabled: !!companyId && !!contaBancariaId, retry: false }
  );
  const repConc: any[] = report?.conciliados ?? [];
  // Rev. 3235 — as linhas que formam um par de ESTORNO (débito do cheque + crédito de
  // devolução do MESMO cheque) NÃO entram na lista normal "no extrato, sem lançamento":
  // o par tem saldo zero (tentativa de pagamento frustrada) e é tratado num bloco próprio
  // ("Cheques devolvidos"). A linha de quitação real (reapresentação/PIX) também sai da
  // lista crua porque é exibida amarrada ao par.
  const repExtRaw: any[] = report?.extratoSemLancamento ?? [];
  const repExt: any[] = repExtRaw.filter((r) => !r.reversal && !r.reversalResolveGrupo);
  const repDevol: any[] = report?.chequesDevolvidos ?? [];
  const repLan: any[] = report?.lancamentosSemExtrato ?? [];
  // Rev. 3219 — filtro de busca (texto livre) aplicado às DUAS listas de pendência.
  // Casa por descrição, fornecedor, obra, doc, data e valor (BRL formatado + número cru),
  // normalizando acentos e caixa. String vazia = sem filtro (mantém tudo).
  const normBusca = (v: any) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const termoBusca = normBusca(buscaConc).trim();
  const matchBusca = (r: any) => {
    if (!termoBusca) return true;
    const alvo = normBusca([
      r.descricao, r.fornecedorNome, r.obraNome, r.documento, r.doc, r.formaPagamento,
      r.chequeNumero, r.chequeFornecedor, r.chequeObraNome, r.chequeNf,
      r.faturaCartao, r.faturaMesRef != null ? `${String(r.faturaMesRef).padStart(2, "0")}/${r.faturaAnoRef ?? ""}` : "",
      fmtData(r.data),
      formatBRL(Math.abs(Number(r.valor) || 0)),
      String(Math.abs(Number(r.valor) || 0)),
    ].filter(Boolean).join(" "));
    return alvo.includes(termoBusca);
  };
  const repExtView: any[] = termoBusca ? repExt.filter(matchBusca) : repExt;
  const repLanView: any[] = termoBusca ? repLan.filter(matchBusca) : repLan;
  // Rev. 3188 — lançamentos SEM conta bancária definida vêm num bloco próprio e NÃO entram
  // no número da conta (antes apareciam/contavam em todas as contas, inflando "ERP sem extrato").
  const repSemConta: any[] = report?.lancamentosSemConta ?? [];
  const absSum = (arr: any[]) => arr.reduce((a, r) => a + Math.abs(Number(r.valor) || 0), 0);
  const vConc = absSum(repConc), vExt = absSum(repExt), vLan = absSum(repLan), vSemConta = absSum(repSemConta);
  const totLinhas = repConc.length + repExt.length;
  const pctConc = totLinhas > 0 ? Math.round((repConc.length / totLinhas) * 100) : 0;

  // Rev. 3187 — Anexar comprovante (PIX/boleto/recibo) a um lançamento "sem extrato",
  // direto da tela. Faz upload (uploadComprovante valida tipo/tamanho) e grava a URL no
  // lançamento (anexarComprovanteEntry) — rastreabilidade do PIX/boleto (extrato anônimo).
  const comprovInputRef = useRef<HTMLInputElement>(null);
  const [comprovEntryId, setComprovEntryId] = useState<number | null>(null);
  const [comprovBusy, setComprovBusy] = useState<number | null>(null);
  const uploadComprovanteMut = (trpc as any).financial.uploadComprovante.useMutation();
  const anexarComprovMut = (trpc as any).financial.anexarComprovanteEntry.useMutation();
  // Rev. 3193 — leitura do comprovante por IA (beneficiário / CNPJ-CPF / ID-transação) p/
  // usar como FONTE DE IDENTIFICAÇÃO no match. O usuário SEMPRE confere: nada concilia sozinho.
  const lerComprovanteMut = (trpc as any).financial.lerComprovante.useMutation();
  function pedirComprovante(entryId: number) { setComprovEntryId(entryId); setTimeout(() => comprovInputRef.current?.click(), 0); }
  async function onComprovanteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const entryId = comprovEntryId;
    setComprovEntryId(null);
    if (!file || !entryId) return;
    setComprovBusy(entryId);
    try {
      const b64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(((r.result as string) || "").replace(/^data:[^,]*,/, ""));
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const ct = file.type || "application/octet-stream";
      const up: any = await uploadComprovanteMut.mutateAsync({ fileName: file.name, fileBase64: b64, contentType: ct });
      // Leitura automática por IA ao subir (best-effort: se falhar, anexa sem identificação).
      let extraido: any = undefined;
      let viaMsg = "";
      try {
        const r: any = await lerComprovanteMut.mutateAsync({ companyId, fileBase64: b64, contentType: ct });
        const d = r?.dados;
        if (d && (d.beneficiario || d.documento || d.txid || d.valor || d.data)) {
          extraido = { beneficiario: d.beneficiario ?? null, documento: d.documento ?? null, txid: d.txid ?? null, valor: d.valor ?? null, data: d.data ?? null };
          if (d.beneficiario) viaMsg = ` Beneficiário lido: ${d.beneficiario}.`;
        }
      } catch { /* segue sem identificação por IA */ }
      await anexarComprovMut.mutateAsync({ companyId, entryId, comprovanteUrl: up.url, extraido });
      toast({ title: "Comprovante anexado!", description: `Lançamento agora tem comprovante para rastreabilidade.${viaMsg}` });
      refetchReport(); refetchSug();
    } catch (err: any) {
      toast({ title: "Erro ao anexar comprovante", description: err?.message || "Falha no upload.", variant: "destructive" });
    } finally {
      setComprovBusy(null);
    }
  }

  // Rev. 3193 — RELER COMPROVANTES: relê por IA todos os comprovantes JÁ anexados que ainda
  // não foram lidos (comprovante_extraido_em NULL). Processa em lotes no servidor (free-tier
  // do Gemini) e repete até `restantes`=0; guard de estagnação evita loop infinito num doc
  // ilegível. NÃO concilia nada — só preenche a identificação p/ melhorar as sugestões.
  const relerComprovMut = (trpc as any).financial.relerComprovantesPendentes.useMutation();
  const [relerBusy, setRelerBusy] = useState(false);
  const [relerInfo, setRelerInfo] = useState<{ feitos: number; restantes: number } | null>(null);
  async function relerComprovantes() {
    if (relerBusy) return;
    setRelerBusy(true);
    setRelerInfo(null);
    let feitos = 0;
    try {
      for (let iter = 0; iter < 200; iter++) {
        const r: any = await relerComprovMut.mutateAsync({ companyId, limite: 6 });
        feitos += Number(r?.processados ?? 0);
        const restantes = Number(r?.restantes ?? 0);
        setRelerInfo({ feitos, restantes });
        if (restantes <= 0) break;
        // Guard de estagnação: se um lote não avançou (0 processados) e ainda "restam",
        // os pendentes são ilegíveis e já foram marcados — encerra p/ não rodar à toa.
        if (Number(r?.processados ?? 0) === 0) break;
      }
      toast({ title: "Comprovantes relidos por IA", description: `${feitos} comprovante(s) identificado(s). As sugestões já consideram beneficiário/CNPJ/ID.` });
      refetchSug(); refetchReport();
    } catch (err: any) {
      toast({ title: "Erro ao reler comprovantes", description: err?.message || "Falha na leitura por IA.", variant: "destructive" });
    } finally {
      setRelerBusy(false);
    }
  }

  // Rev. 3216 — Demonstrativos consolidados de pagamento: 1 PDF com TODOS os PIX +
  // 1 PDF com TODOS os boletos pagos do mês. Servem de CONSULTA pra identificar quem
  // recebeu (o extrato só mostra "PIX valor X"). Por conta+ano+mês. NÃO concilia nada.
  const demoInputRef = useRef<HTMLInputElement>(null);
  const [demoKind, setDemoKind] = useState<"pix" | "boleto" | null>(null);
  // Rev. 3236 — progresso REAL (0→100%) do fluxo "anexar vários + ler com IA". Quando
  // ativo, o slot do tipo mostra a barra + rótulo detalhado ("Enviando 2 de 5", "Lendo
  // com IA 3 de 7"). Substitui a antiga barra ASSINTÓTICA/falsa (single-shot da tRPC).
  const [demoProg, setDemoProg] = useState<{ kind: "pix" | "boleto"; pct: number; label: string } | null>(null);
  const demoQuery = (trpc as any).financial.getConciliacaoDemonstrativos.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, ano, mes: mesSel ?? 0 },
    { enabled: !!companyId && !!contaBancariaId && mesSel != null }
  );
  const salvarDemoMut = (trpc as any).financial.salvarConciliacaoDemonstrativo.useMutation();
  const removerDemoMut = (trpc as any).financial.removerConciliacaoDemonstrativo.useMutation();
  // Rev. 3236 — leitura por IA agora é POR ARQUIVO (loop no cliente = progresso real),
  // depois salva a lista combinada. lerDemonstrativoArquivoIA não grava; salvarDemonstrativoExtraido persiste.
  const lerDemoArquivoMut = (trpc as any).financial.lerDemonstrativoArquivoIA.useMutation();
  const salvarDemoExtraidoMut = (trpc as any).financial.salvarDemonstrativoExtraido.useMutation();
  // Rev. 3228 — a leitura da IA aparece INLINE (lista combinada PIX+boletos). `demoFiltro`
  // controla qual tipo a tabela mostra; `buscaLeitura` é a busca livre da lista inline.
  const [demoFiltro, setDemoFiltro] = useState<"todos" | "pix" | "boleto">("todos");
  const [buscaLeitura, setBuscaLeitura] = useState("");
  const _fileToB64 = (file: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(((r.result as string) || "").replace(/^data:[^,]*,/, ""));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const _sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  // Lê TODOS os PDFs do tipo com IA, um a um (progresso real), e salva a lista combinada.
  // `count` permite informar o total já sabido (evita corrida com o refetch logo após o upload).
  async function lerDemoIA(kind: "pix" | "boleto", opts?: { baseStart?: number; count?: number }) {
    if (mesSel == null || !contaBancariaId) return;
    const arrAtual = kind === "pix" ? (demoQuery.data?.pixArquivos || []) : (demoQuery.data?.boletoArquivos || []);
    const n = opts?.count ?? arrAtual.length;
    if (n === 0) { toast({ title: "Anexe ao menos um PDF", description: "Não há demonstrativo para ler.", variant: "destructive" }); return; }
    const base = opts?.baseStart ?? 2;
    const span = Math.max(1, 100 - base);
    const itens: any[] = [];
    let falhas = 0;
    setDemoProg({ kind, pct: base, label: `Lendo com IA — 0 de ${n}…` });
    for (let i = 0; i < n; i++) {
      setDemoProg({ kind, pct: base + Math.round((i / n) * span * 0.9), label: `Lendo com IA — arquivo ${i + 1} de ${n}…` });
      try {
        const r: any = await lerDemoArquivoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, indice: i });
        if (Array.isArray(r?.itens)) itens.push(...r.itens);
      } catch { falhas++; }
      if (i < n - 1) await _sleep(300); // pacing p/ o free-tier do Gemini (429/503 transiente)
    }
    setDemoProg({ kind, pct: base + Math.round(span * 0.95), label: "Salvando leitura…" });
    try {
      await salvarDemoExtraidoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, itens });
    } catch (err: any) {
      setDemoProg(null);
      toast({ title: "Erro ao salvar leitura", description: err?.message || "Falha ao gravar a extração.", variant: "destructive" });
      return;
    }
    setDemoProg({ kind, pct: 100, label: `Concluído · ${itens.length} pagamento(s)` });
    await demoQuery.refetch();
    setBuscaLeitura("");
    setDemoFiltro(kind);
    setTimeout(() => setDemoProg(null), 700);
    if (falhas > 0) toast({ title: `${falhas} arquivo(s) não puderam ser lidos`, description: "Use 'Reler com IA' para tentar novamente.", variant: "destructive" });
  }
  function pedirDemo(kind: "pix" | "boleto") { setDemoKind(kind); setTimeout(() => demoInputRef.current?.click(), 0); }
  // Rev. 3236 — aceita VÁRIOS PDFs de uma vez: faz upload de cada (progresso 1→44%),
  // grava a lista (append) e em seguida lê TODOS com IA (46→100%).
  async function onDemoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const kind = demoKind;
    setDemoKind(null);
    if (!files.length || !kind || mesSel == null || !contaBancariaId) return;
    const pdfs = files.filter(f => (f.type || "").toLowerCase() === "application/pdf");
    const pulados = files.length - pdfs.length;
    if (pdfs.length === 0) { toast({ title: "Use arquivos PDF", description: "Os demonstrativos devem ser PDFs.", variant: "destructive" }); return; }
    const existentes = (kind === "pix" ? demoQuery.data?.pixArquivos?.length : demoQuery.data?.boletoArquivos?.length) || 0;
    const total = pdfs.length;
    setDemoProg({ kind, pct: 1, label: `Enviando — 0 de ${total}…` });
    try {
      const novos: { url: string; nome: string }[] = [];
      for (let i = 0; i < total; i++) {
        setDemoProg({ kind, pct: 1 + Math.round((i / total) * 40), label: `Enviando — arquivo ${i + 1} de ${total}…` });
        const b64 = await _fileToB64(pdfs[i]);
        const up: any = await uploadComprovanteMut.mutateAsync({ fileName: pdfs[i].name, fileBase64: b64, contentType: "application/pdf" });
        novos.push({ url: up.url, nome: pdfs[i].name });
      }
      setDemoProg({ kind, pct: 44, label: "Salvando anexos…" });
      await salvarDemoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, arquivos: novos });
      if (pulados > 0) toast({ title: `${pulados} arquivo(s) ignorado(s)`, description: "Apenas PDFs são aceitos." });
      // Lê TODOS (existentes + novos) com IA, com progresso real 46→100%.
      await lerDemoIA(kind, { baseStart: 46, count: existentes + novos.length });
    } catch (err: any) {
      setDemoProg(null);
      toast({ title: "Erro ao anexar demonstrativo", description: err?.message || "Falha no upload.", variant: "destructive" });
    }
  }
  async function removerDemo(kind: "pix" | "boleto", indice?: number) {
    if (mesSel == null || !contaBancariaId) return;
    setDemoProg({ kind, pct: 50, label: "Removendo…" });
    try {
      await removerDemoMut.mutateAsync({ companyId, contaBancariaId: parseInt(contaBancariaId), ano, mes: mesSel, tipo: kind, indice });
      toast({ title: indice != null ? "Arquivo removido" : "Demonstrativo removido", description: "Use 'Ler com IA' para atualizar a lista." });
      await demoQuery.refetch();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message || "Falha ao remover.", variant: "destructive" });
    } finally {
      setDemoProg(null);
    }
  }

  // Rev. 3188 — renderiza uma linha de lançamento (usada na lista "No ERP, sem extrato" da
  // conta E na lista "Sem conta definida"). Mesma interação: selecionar p/ casar, ver detalhe
  // e anexar/abrir comprovante.
  const renderEntryRow = (e: any) => {
    const forma = String(e.formaPagamento || "").toLowerCase();
    const isPix = forma.includes("pix");
    const isBoleto = forma.includes("boleto");
    const isReceita = e.tipo === "receita";
    return (
      <div
        key={e.id}
        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${selectedEntry === e.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
      >
        <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isReceita ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
          {isReceita ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
        </span>
        <button onClick={() => setSelectedEntry(selectedEntry === e.id ? null : e.id)} className="flex-1 min-w-0 text-left">
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            {fmtData(e.data)}
            {(isPix || isBoleto) && <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${isPix ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>{isPix ? "PIX" : "Boleto"}</span>}
          </p>
          <p className="text-sm font-medium text-gray-700 truncate">{e.fornecedorNome || e.descricao || "—"}</p>
          {e.obraNome && <p className="text-xs text-gray-400 truncate">{e.obraNome}</p>}
        </button>
        <p className={`text-sm font-bold shrink-0 ${isReceita ? "text-emerald-600" : "text-rose-500"}`}>{formatBRL(Math.abs(Number(e.valor)))}</p>
        <button type="button" onClick={() => setDetalheEntryId(e.id)} title="Ver detalhes" className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"><Eye className="w-4 h-4" /></button>
        {e.comprovanteUrl ? (
          <a href={e.comprovanteUrl} target="_blank" rel="noreferrer" title="Comprovante anexado — abrir" className="shrink-0 p-1.5 rounded-md text-green-600 hover:bg-green-50"><Paperclip className="w-4 h-4" /></a>
        ) : (
          <button type="button" onClick={() => pedirComprovante(e.id)} disabled={comprovBusy === e.id} title="Anexar comprovante (PIX/boleto/recibo)" className="shrink-0 p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50">
            {comprovBusy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
        )}
      </div>
    );
  };

  // Rev. 3205 — renderiza uma linha do extrato (lista "No extrato, sem lançamento").
  // Extraída p/ reuso entre a lista inline e o modo tela cheia.
  const renderExtratoRow = (s: any) => {
    const isEntrada = Number(s.valor) >= 0;
    return (
    <div
      key={s.id}
      className={`flex items-stretch ${selectedStatement === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
    >
      <button
        onClick={() => setSelectedStatement(selectedStatement === s.id ? null : s.id)}
        className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isEntrada ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
          {isEntrada ? <ArrowDownCircle className="w-5 h-5" /> : <ArrowUpCircle className="w-5 h-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            {fmtData(s.data)}
            <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${isEntrada ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>{isEntrada ? "Entrada" : "Saída"}</span>
          </p>
          <p className="text-sm font-medium text-gray-700 truncate">{s.descricao || "—"}</p>
          {s.chequeFornecedor && (
            <p className="text-[11px] text-emerald-700 truncate" title={`Cheque nº ${s.chequeNumero ?? "—"} — ${s.chequeFornecedor}${s.chequeObraNome ? ` · ${s.chequeObraNome}` : ""}${s.chequeNf ? ` · NF ${s.chequeNf}` : ""}`}>
              🪙 Cheque nº {s.chequeNumero ?? "—"} · {s.chequeFornecedor}{s.chequeObraNome ? ` · ${s.chequeObraNome}` : ""}
            </p>
          )}
          {s.faturaId && !s.chequeFornecedor && (
            <p className="text-[11px] text-indigo-700 truncate" title={`Fatura do cartão ${s.faturaCartao ?? "—"}${s.faturaVencimento ? ` · venc. ${fmtData(s.faturaVencimento)}` : ""}${s.faturaTotal != null ? ` · total ${formatBRL(Math.abs(Number(s.faturaTotal)))}` : ""}`}>
              💳 Fatura {s.faturaCartao ?? "cartão"}{s.faturaMesRef ? ` · ${String(s.faturaMesRef).padStart(2, "0")}/${s.faturaAnoRef ?? ""}` : ""}{s.faturaVencimento ? ` · venc. ${fmtData(s.faturaVencimento)}` : ""}
            </p>
          )}
        </div>
        <p className={`text-sm font-bold shrink-0 ${isEntrada ? "text-emerald-600" : "text-rose-500"}`}>{formatBRL(Math.abs(Number(s.valor)))}</p>
      </button>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirLancar(s); }}
        title="Lançar este item no ERP"
        className="shrink-0 px-3 flex flex-col items-center justify-center gap-0.5 border-l border-gray-100 text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="text-[10px] font-medium leading-none">Lançar</span>
      </button>
    </div>
    );
  };

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
      setConfirmConciliar(false);
      refetchSt();
      refetchStAno();
      refetchAccStatus();
      refetchSug();
      refetchReport();
    },
    onError: (e: any) => { setConfirmConciliar(false); toast({ title: "Erro ao conciliar", description: e.message, variant: "destructive" }); },
  });

  const toggleSug = (id: number) => setSelSug(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const selecionarAlta = () => setSelSug(new Set(sugestoes.filter(s => s.confianca === "alta").map(s => s.statementLineId)));
  const selecionarTodas = () => setSelSug(new Set(sugestoes.map(s => s.statementLineId)));
  // Rev. 3201 — A conciliação automática é APENAS SUGESTIVA: nada é gravado sem o
  // usuário CONFIRMAR explicitamente cada valor. "Conciliar selecionadas" agora ABRE
  // um diálogo de revisão (extrato → lançamento + valores) e só aplica após o
  // "Confirmar conciliação". Frontend-only (o backend já era query-only p/ sugerir).
  const conciliarSelecionadas = () => {
    if (selSug.size === 0) { toast({ title: "Selecione ao menos uma sugestão", variant: "destructive" }); return; }
    setConfirmConciliar(true);
  };
  const confirmarConciliacao = () => {
    if (conciliarSugMut.isPending) return; // blindagem contra clique duplo
    const pares = sugSelecionadas.map(s => ({ statementLineId: s.statementLineId, entryId: s.entryId }));
    if (pares.length === 0) { setConfirmConciliar(false); return; }
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
      toast({ title: `Importação concluída! ${inserted} inseridos, ${skipped} duplicados ignorados`, description: "Atualizando a conciliação…" });
      setShowImport(false);
      setImportContent("");
      setImportFileName("");
      // Rev. 3187 — após importar, a conta importada vira a conta ATIVA na própria tela e o
      // relatório/sugestões recarregam ali mesmo (Painel separado aposentado).
      if (contaId) setContaBancariaId(String(contaId));
      setMostrarSugestoes(true);
      refetchSt();
      refetchStAno();
      refetchAccStatus();
      refetchReport();
      refetchSug();
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e?.message || "Falha ao importar o extrato.", variant: "destructive" });
    } finally {
      setImportRunning(false);
      setTimeout(() => { setImportPct(0); setImportLabel(""); }, 500);
    }
  }

  const periodoLabel = mesSel != null ? `${MESES[mesSel - 1]}/${ano}` : `Ano ${ano}`;
  const contaSel = (bankAccounts ?? []).find((b: any) => String(b.id) === contaBancariaId);
  const contaLabel = contaSel ? `${contaSel.banco}${contaSel.descricao ? ` · ${contaSel.descricao}` : ""} (Ag. ${formatAgencia(contaSel.agencia)}/${formatConta(contaSel.conta)})` : "—";

  // Rev. 3187 — Relatório PDF (3 blocos) embutido na tela única (absorve o antigo Painel).
  function gerarRelatorioPDF() {
    if (!report) { toast({ title: "Relatório ainda carregando", variant: "destructive" }); return; }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
    const rowsConc = repConc.length
      ? repConc.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(c.entryFornecedor || c.entryDescricao || ("Lançamento #" + (c.entryId ?? "")))}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhuma linha conciliada no período.</td></tr>`;
    const rowsExt = repExt.length
      ? repExt.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}${c.chequeFornecedor ? `<br><span style="color:#047857;font-size:10px">🪙 Cheque nº ${esc(c.chequeNumero ?? "—")} · ${esc(c.chequeFornecedor)}${c.chequeObraNome ? ` · ${esc(c.chequeObraNome)}` : ""}${c.chequeNf ? ` · NF ${esc(c.chequeNf)}` : ""}</span>` : (c.faturaId ? `<br><span style="color:#4338ca;font-size:10px">💳 Fatura ${esc(c.faturaCartao ?? "cartão")}${c.faturaMesRef ? ` · ${esc(String(c.faturaMesRef).padStart(2, "0"))}/${esc(c.faturaAnoRef ?? "")}` : ""}${c.faturaVencimento ? ` · venc. ${esc(fmtData(c.faturaVencimento))}` : ""}</span>` : "")}</td><td>${esc(Number(c.valor) >= 0 ? "Entrada" : "Saída")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Sem pendências — todo o extrato está conciliado.</td></tr>`;
    const rowsLan = repLan.length
      ? repLan.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nenhum lançamento sem extrato no período.</td></tr>`;
    // Rev. 3188 — bloco "sem conta definida" no PDF (não somado ao "ERP sem extrato").
    const rowsSemConta = repSemConta.length
      ? repSemConta.map((c: any) => `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`).join("")
      : "";
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
  <img class="logo" src="${window.location.origin}/logo-fc-branco-amarelo.png?v=3187" alt="FC Engenharia"/>
  <h1 class="brand">FC ENGENHARIA</h1>
  <div class="band">RELATÓRIO DE CONCILIAÇÃO BANCÁRIA</div>
  <div class="meta">
    <span><strong>Conta:</strong> ${esc(contaLabel)}</span>
    <span><strong>Período:</strong> ${esc(periodoLabel)}</span>
    <span><strong>Emitido em:</strong> ${esc(new Date().toLocaleString("pt-BR"))}</span>
  </div>
  <div class="cards">
    <div class="card"><div class="lbl">Conciliado</div><div class="val blue">${repConc.length} <span style="font-size:11px">(${pctConc}%)</span></div><div class="lbl">${esc(formatBRL(vConc))}</div></div>
    <div class="card"><div class="lbl">Extrato sem lançamento</div><div class="val red">${repExt.length}</div><div class="lbl">${esc(formatBRL(vExt))}</div></div>
    <div class="card"><div class="lbl">Lançamentos sem extrato</div><div class="val">${repLan.length}</div><div class="lbl">${esc(formatBRL(vLan))}</div></div>
    <div class="card"><div class="lbl">Total do extrato</div><div class="val">${totLinhas}</div><div class="lbl">linhas no período</div></div>
  </div>
  <h2>1. Extrato conciliado (${repConc.length})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Lançamento casado</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsConc}</tbody>
  <tfoot><tr><td colspan="3">Total conciliado</td><td class="r">${esc(formatBRL(vConc))}</td></tr></tfoot></table>
  <h2>2. Extrato SEM lançamento — o que falta (${repExt.length})</h2>
  <table><thead><tr><th>Data</th><th>Descrição (extrato)</th><th>Tipo</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsExt}</tbody>
  <tfoot><tr><td colspan="3">Total pendente</td><td class="r">${esc(formatBRL(vExt))}</td></tr></tfoot></table>
  <h2>3. Lançamentos do sistema sem extrato (${repLan.length})</h2>
  <table><thead><tr><th>Data</th><th>Lançamento</th><th>Obra</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsLan}</tbody>
  <tfoot><tr><td colspan="3">Total sem extrato</td><td class="r">${esc(formatBRL(vLan))}</td></tr></tfoot></table>
  ${repSemConta.length ? `<h2>4. Lançamentos sem conta bancária definida (${repSemConta.length})</h2>
  <p style="font-size:10px;color:#6b7280;margin:0 0 6px">Não somados ao bloco "ERP sem extrato" — sem conta de origem informada no ERP, aparecem em todas as contas.</p>
  <table><thead><tr><th>Data</th><th>Lançamento</th><th>Obra</th><th class="r">Valor</th></tr></thead>
  <tbody>${rowsSemConta}</tbody>
  <tfoot><tr><td colspan="3">Total sem conta</td><td class="r">${esc(formatBRL(vSemConta))}</td></tr></tfoot></table>` : ""}
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" }); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 350);
  }

  // Rev. 3196 — Exportar SEPARADAMENTE cada lista de pendências (Excel + PDF):
  // "No extrato, sem lançamento" (repExt) e "No ERP, sem extrato" (repLan).
  const slugPeriodo = () => String(periodoLabel || "").replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");

  async function exportarListaExcel(qual: "extrato" | "erp") {
    const lista = qual === "extrato" ? repExt : repLan;
    if (lista.length === 0) { toast({ title: "Nada para exportar nesta lista", variant: "destructive" }); return; }
    try {
      const XLSX = await import("xlsx");
      const titulo = qual === "extrato" ? "No extrato, sem lançamento" : "No ERP, sem extrato";
      const aoa: any[][] = qual === "extrato"
        ? [["Data", "Descrição (extrato)", "Tipo", "Valor (R$)"]]
        : [["Data", "Lançamento", "Obra", "Valor (R$)"]];
      let tot = 0;
      lista.forEach((c: any) => {
        const v = Math.abs(Number(c.valor) || 0); tot += v;
        if (qual === "extrato") aoa.push([fmtData(c.data), c.descricao || "—", Number(c.valor) >= 0 ? "Entrada" : "Saída", v]);
        else aoa.push([fmtData(c.data), c.fornecedorNome || c.descricao || ("Lançamento #" + c.id), c.obraNome || "—", v]);
      });
      aoa.push(["", "", "Total", tot]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 12 }, { wch: 50 }, { wch: 20 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
      const fname = qual === "extrato" ? "extrato-sem-lancamento" : "erp-sem-extrato";
      XLSX.writeFile(wb, `${fname}-${slugPeriodo()}.xlsx`);
    } catch (e: any) {
      toast({ title: "Falha ao gerar Excel", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  function exportarListaPDF(qual: "extrato" | "erp") {
    if (!report) { toast({ title: "Relatório ainda carregando", variant: "destructive" }); return; }
    const lista = qual === "extrato" ? repExt : repLan;
    if (lista.length === 0) { toast({ title: "Nada para exportar nesta lista", variant: "destructive" }); return; }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" } as any)[c]);
    const isExt = qual === "extrato";
    const titulo = isExt ? "EXTRATO SEM LANÇAMENTO NO ERP" : "LANÇAMENTOS DO ERP SEM EXTRATO";
    const total = isExt ? vExt : vLan;
    const head = isExt
      ? `<tr><th>Data</th><th>Descrição (extrato)</th><th>Tipo</th><th class="r">Valor</th></tr>`
      : `<tr><th>Data</th><th>Lançamento</th><th>Obra</th><th class="r">Valor</th></tr>`;
    const body = lista.map((c: any) => isExt
      ? `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.descricao || "—")}</td><td>${esc(Number(c.valor) >= 0 ? "Entrada" : "Saída")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`
      : `<tr><td>${esc(fmtData(c.data))}</td><td>${esc(c.fornecedorNome || c.descricao || ("Lançamento #" + c.id))}</td><td>${esc(c.obraNome || "—")}</td><td class="r">${esc(formatBRL(Math.abs(Number(c.valor) || 0)))}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} ${esc(periodoLabel)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;margin:0;padding:24px;font-size:12px}
  .logo{display:block;height:54px;margin:0 auto 10px}
  h1.brand{text-align:center;font-size:16px;margin:0;color:#1B2A4A;letter-spacing:.5px}
  .band{background:#1B2A4A;color:#fff;text-align:center;padding:10px;margin:14px 0;border-radius:6px;letter-spacing:3px;font-weight:bold;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .meta{display:flex;justify-content:space-between;font-size:11px;color:#4b5563;margin-bottom:14px;flex-wrap:wrap;gap:6px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-size:10px;text-transform:uppercase;letter-spacing:.4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  td.r,th.r{text-align:right;white-space:nowrap}
  tfoot td{font-weight:bold;background:#f9fafb}
  @media print{body{padding:10px}}
</style></head><body>
  <img class="logo" src="${window.location.origin}/logo-fc-branco-amarelo.png?v=3196" alt="FC Engenharia"/>
  <h1 class="brand">FC ENGENHARIA</h1>
  <div class="band">${esc(titulo)}</div>
  <div class="meta">
    <span><strong>Conta:</strong> ${esc(contaLabel)}</span>
    <span><strong>Período:</strong> ${esc(periodoLabel)}</span>
    <span><strong>Emitido em:</strong> ${esc(new Date().toLocaleString("pt-BR"))}</span>
  </div>
  <table><thead>${head}</thead>
  <tbody>${body}</tbody>
  <tfoot><tr><td colspan="3">Total (${lista.length})</td><td class="r">${esc(formatBRL(total))}</td></tr></tfoot></table>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Permita pop-ups para gerar o relatório", variant: "destructive" }); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 350);
  }

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
            {/* Rev. 3216 — Demonstrativos consolidados (1 PDF de TODOS os PIX + 1 de TODOS os
                boletos) por conta+mês. Consulta de apoio: o extrato só mostra "PIX valor X". */}
            <Card className="border-0 shadow-sm ring-1 ring-indigo-100 bg-indigo-50/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-3">
                  <FileText className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Demonstrativos de pagamento (apoio à identificação)</p>
                    <p className="text-xs text-gray-500">Anexe <strong>um ou vários PDFs</strong> com os <strong>PIX</strong> e os <strong>boletos pagos</strong> do mês (pode subir todos de uma vez). Servem só de consulta pra identificar quem recebeu — o extrato mostra apenas "PIX valor X".</p>
                  </div>
                </div>
                {mesSel == null ? (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Selecione um mês (acima) para anexar os demonstrativos — eles são por mês.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([
                      { kind: "pix" as const, label: "Comprovantes de PIX", arquivos: (demoQuery.data?.pixArquivos || []) as { url: string; nome: string | null }[], extraido: demoQuery.data?.pixExtraido, lidoEm: demoQuery.data?.pixLidoEm },
                      { kind: "boleto" as const, label: "Comprovantes de Boletos", arquivos: (demoQuery.data?.boletoArquivos || []) as { url: string; nome: string | null }[], extraido: demoQuery.data?.boletoExtraido, lidoEm: demoQuery.data?.boletoLidoEm },
                    ]).map((slot) => (
                      <div key={slot.kind} className="rounded-lg border border-indigo-200 bg-white p-3">
                        <p className="text-xs font-medium text-gray-600 mb-2">{slot.label} <span className="text-gray-400">· {MESES[mesSel - 1]}/{ano}</span></p>
                        {demoProg?.kind === slot.kind ? (
                          /* Rev. 3236 — barra de progresso REAL (0→100%) com rótulo detalhado */
                          <div className="py-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="flex items-center gap-1.5 text-xs font-medium text-violet-700"><Loader2 className="w-3.5 h-3.5 animate-spin" />{demoProg.label}</span>
                              <span className="text-xs font-semibold tabular-nums text-violet-700">{demoProg.pct}%</span>
                            </div>
                            <Progress value={demoProg.pct} className="h-2" />
                          </div>
                        ) : (
                          <>
                            {slot.arquivos.length > 0 && (
                              <div className="space-y-1.5 mb-2.5">
                                {slot.arquivos.map((f, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="text-xs text-gray-700 truncate flex-1 min-w-[60px]" title={f.nome || "documento.pdf"}>{f.nome || "documento.pdf"}</span>
                                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline">Abrir</a>
                                    <button type="button" onClick={() => removerDemo(slot.kind, idx)} className="text-xs font-medium text-red-500 hover:text-red-700">Remover</button>
                                  </div>
                                ))}
                                <p className="text-[11px] text-gray-400">{slot.arquivos.length} arquivo(s) anexado(s)</p>
                              </div>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button size="sm" variant="outline" onClick={() => pedirDemo(slot.kind)} disabled={demoProg !== null} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 h-8">
                                <Upload className="w-3.5 h-3.5 mr-1.5" />{slot.arquivos.length > 0 ? "Anexar mais PDFs" : "Anexar PDF(s)"}
                              </Button>
                              {slot.arquivos.length > 0 && (
                                <Button size="sm" onClick={() => lerDemoIA(slot.kind)} disabled={demoProg !== null} className="bg-violet-600 hover:bg-violet-700 text-white h-8">
                                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />{Array.isArray(slot.extraido) ? "Reler com IA" : "Ler com IA"}
                                </Button>
                              )}
                            </div>
                            {Array.isArray(slot.extraido) && (
                              <p className="text-[11px] text-gray-400 mt-1.5">Lido por IA{slot.lidoEm ? ` em ${fmtData(slot.lidoEm)}` : ""} · {slot.extraido.length} pagamento(s) · {formatBRL(slot.extraido.reduce((s: number, it: any) => s + (Number(it?.valor) || 0), 0))}</p>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <input ref={demoInputRef} type="file" accept="application/pdf,.pdf" multiple onChange={onDemoFile} className="hidden" />
              </CardContent>
            </Card>

            {/* Rev. 3228 — Lista INLINE "Tudo que a IA leu" (metodologia do extrato): lista
                combinada PIX + boletos logo abaixo dos anexos, com cards de total geral/PIX/
                boletos (reagem ao filtro+busca), chips de tipo e busca livre. Sem modal. */}
            {mesSel != null && (Array.isArray(demoQuery.data?.pixExtraido) || Array.isArray(demoQuery.data?.boletoExtraido)) && (() => {
              const pixArr: any[] = Array.isArray(demoQuery.data?.pixExtraido) ? demoQuery.data.pixExtraido : [];
              const boletoArr: any[] = Array.isArray(demoQuery.data?.boletoExtraido) ? demoQuery.data.boletoExtraido : [];
              const todos = [
                ...pixArr.map((it) => ({ ...it, _tipo: "pix" as const })),
                ...boletoArr.map((it) => ({ ...it, _tipo: "boleto" as const })),
              ];
              const porFiltro = demoFiltro === "todos" ? todos : todos.filter((it) => it._tipo === demoFiltro);
              const termo = normBusca(buscaLeitura).trim();
              const lista = !termo ? porFiltro : porFiltro.filter((it) => normBusca([it?.beneficiario, it?.documento, it?.txid, fmtData(it?.data), formatBRL(Number(it?.valor) || 0), String(it?.valor ?? ""), it._tipo === "pix" ? "pix" : "boleto"].join(" ")).includes(termo));
              const pixVis = lista.filter((it) => it._tipo === "pix");
              const bolVis = lista.filter((it) => it._tipo === "boleto");
              const somaPix = pixVis.reduce((s, it) => s + (Number(it?.valor) || 0), 0);
              const somaBol = bolVis.reduce((s, it) => s + (Number(it?.valor) || 0), 0);
              const total = somaPix + somaBol;
              const chips = [
                { key: "todos" as const, label: `Todos (${todos.length})` },
                { key: "pix" as const, label: `PIX (${pixArr.length})` },
                { key: "boleto" as const, label: `Boletos (${boletoArr.length})` },
              ];
              return (
                <Card className="border-0 shadow-sm ring-1 ring-violet-100">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Tudo que a IA leu nos demonstrativos</p>
                        <p className="text-xs text-gray-500">Lista de TODOS os pagamentos identificados nos PDFs anexados — só consulta, não concilia nada automaticamente.</p>
                      </div>
                    </div>
                    {/* Cards de total (metodologia do extrato) — reagem ao filtro + busca */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0"><Landmark className="w-5 h-5" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-violet-700/80 font-medium">Total geral · {lista.length}</p>
                          <p className="text-lg font-bold text-violet-700 truncate">{formatBRL(total)}</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-5 h-5" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-emerald-700/80 font-medium">PIX · {pixVis.length}</p>
                          <p className="text-lg font-bold text-emerald-700 truncate">{formatBRL(somaPix)}</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-blue-700/80 font-medium">Boletos · {bolVis.length}</p>
                          <p className="text-lg font-bold text-blue-700 truncate">{formatBRL(somaBol)}</p>
                        </div>
                      </div>
                    </div>
                    {/* Chips de tipo + busca livre */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {chips.map((c) => (
                        <button key={c.key} type="button" onClick={() => setDemoFiltro(c.key)}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${demoFiltro === c.key ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                          {c.label}
                        </button>
                      ))}
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <Input value={buscaLeitura} onChange={(e) => setBuscaLeitura(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ, valor, data…" className="pl-8 h-9" />
                        {buscaLeitura && <button type="button" onClick={() => setBuscaLeitura("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
                      </div>
                    </div>
                    {/* Lista (igual ao extrato/erp) */}
                    <div className="overflow-auto max-h-[460px] border border-gray-100 rounded-lg">
                      {lista.length === 0 ? (
                        <div className="text-center text-sm text-gray-500 py-10">{todos.length === 0 ? "A IA não encontrou pagamentos nos PDFs." : "Nenhum pagamento corresponde ao filtro/busca."}</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 z-10">
                            <tr>
                              <th className="text-left font-medium px-2 py-2">Tipo</th>
                              <th className="text-left font-medium px-2 py-2">Beneficiário</th>
                              <th className="text-left font-medium px-2 py-2">CPF/CNPJ</th>
                              <th className="text-left font-medium px-2 py-2">Data</th>
                              <th className="text-left font-medium px-2 py-2">ID transação</th>
                              <th className="text-right font-medium px-2 py-2">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lista.map((it, i) => (
                              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-2 py-2">
                                  <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${it._tipo === "pix" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{it._tipo === "pix" ? "PIX" : "Boleto"}</span>
                                </td>
                                <td className="px-2 py-2 text-gray-800">{it?.beneficiario || <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-gray-600 tabular-nums">{it?.documento || <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-gray-600 tabular-nums whitespace-nowrap">{it?.data ? fmtData(it.data) : <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-gray-500 text-xs max-w-[160px] truncate" title={it?.txid || ""}>{it?.txid || <span className="text-gray-400">—</span>}</td>
                                <td className="px-2 py-2 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">{it?.valor != null ? formatBRL(Number(it.valor)) : <span className="text-gray-400">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">Mostrando {lista.length} de {porFiltro.length}{termo ? ` (filtro "${buscaLeitura.trim()}")` : ""} · A leitura por IA é uma ajuda para identificar quem recebeu — confira sempre no PDF original. Não concilia nada automaticamente.</p>
                  </CardContent>
                </Card>
              );
            })()}
            {/* Rev. 3187 — Estado de ERRO do relatório: sem isso a tela parecia "vazia/zerada"
                quando getConciliacaoReport falhava (falso "tudo conciliado"). */}
            {reportIsError && (
              <Card className="border-0 shadow-sm ring-1 ring-red-200 bg-red-50/60">
                <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Não foi possível carregar a conciliação</p>
                      <p className="text-xs text-red-700 mt-0.5">{reportError?.message || "Falha ao consultar o relatório. Os números abaixo podem estar incompletos."}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetchReport()} className="border-red-300 text-red-700 hover:bg-red-100">
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Tentar novamente
                  </Button>
                </CardContent>
              </Card>
            )}
            {/* Rev. 3187 — Progresso da conciliação + KPIs (fonte única getConciliacaoReport). */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4 space-y-4">
                <div className="flex items-end justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Progresso da conciliação · {periodoLabel}</p>
                    <p className="text-2xl font-bold text-gray-900">{pctConc}<span className="text-base font-semibold text-gray-400">%</span> <span className="text-sm font-medium text-gray-500">conciliado</span></p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <span className="font-semibold text-blue-700">{repConc.length}</span> de {totLinhas} linha(s) do extrato
                  </div>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full transition-all duration-500 ${pctConc >= 100 ? "bg-green-500" : "bg-blue-600"}`} style={{ width: `${pctConc}%` }} />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-blue-700"><CheckCircle className="w-3.5 h-3.5" />Conciliado</div>
                    <p className="text-lg font-bold text-blue-700 mt-0.5">{repConc.length}</p>
                    <p className="text-[11px] text-gray-500">{formatBRL(vConc)}</p>
                  </div>
                  <div className="rounded-xl border border-red-100 bg-red-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="w-3.5 h-3.5" />Extrato sem lançamento</div>
                    <p className="text-lg font-bold text-red-600 mt-0.5">{repExt.length}</p>
                    <p className="text-[11px] text-gray-500">{formatBRL(vExt)}</p>
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-amber-700"><FileText className="w-3.5 h-3.5" />ERP sem extrato</div>
                    <p className="text-lg font-bold text-amber-700 mt-0.5">{repLan.length}</p>
                    <p className="text-[11px] text-gray-500">{formatBRL(vLan)}</p>
                  </div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-violet-700"><Sparkles className="w-3.5 h-3.5" />Sugestões prontas</div>
                    <p className="text-lg font-bold text-violet-700 mt-0.5">{sugLoading ? "…" : sugestoes.length}</p>
                    <p className="text-[11px] text-gray-500">{semMatch.length} sem par</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Sugestões Automáticas de Conciliação
                  </CardTitle>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-500">Tolerância (dias)</Label>
                      {/* Rev. 3189 — native <select>: o dropdown é ancorado pelo browser logo
                          abaixo do campo (o Radix Select caía em modo item-aligned e abria no
                          meio da tela). */}
                      <select
                        value={String(toleranciaDias)}
                        onChange={e => setToleranciaDias(parseInt(e.target.value, 10))}
                        className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {tolOptions.map(d => (
                          <option key={d} value={String(d)}>
                            {d === diasDoMes && mesSel != null ? `${d} (mês)` : d}
                          </option>
                        ))}
                      </select>
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-blue-600 text-blue-700 hover:bg-blue-50"
                      onClick={gerarRelatorioPDF}
                      disabled={!report}
                    >
                      <FileText className="w-4 h-4 mr-1" />Relatório PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {mostrarSugestoes && (
                <CardContent className="pt-0">
                  {sugLoading ? (
                    <div className="py-6 space-y-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-600 flex items-center gap-2 min-w-0">
                          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-500" />
                          <span className="truncate">Cruzando extrato × lançamentos por valor, direção e data…</span>
                        </span>
                        <span className="font-semibold tabular-nums text-amber-600 shrink-0">{sugProgress}%</span>
                      </div>
                      <Progress value={sugProgress} className="h-2" />
                    </div>
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
                        <Button size="sm" variant="outline" onClick={relerComprovantes} disabled={relerBusy} title="Lê por IA os comprovantes anexados (beneficiário/CNPJ/ID) p/ identificar melhor as sugestões">
                          {relerBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                          {relerBusy ? `Lendo${relerInfo ? ` (${relerInfo.feitos}, faltam ${relerInfo.restantes})` : "..."}` : "Reler comprovantes (IA)"}
                        </Button>
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
                      <div className="border rounded-md max-h-[480px] overflow-y-auto">
                        {/* Cabeçalho fixo: deixa explícito qual coluna é o EXTRATO (banco) e qual é o LANÇAMENTO no ERP. */}
                        <div className="sticky top-0 z-10 flex items-center gap-3 px-3 py-2 bg-gray-100 border-b text-xs font-semibold uppercase tracking-wide text-gray-700">
                          <span className="w-4 shrink-0" aria-hidden />
                          <div className="flex-1 min-w-0">Extrato <span className="font-normal normal-case text-gray-400">(banco)</span></div>
                          <span className="w-4 shrink-0" aria-hidden />
                          <div className="flex-1 min-w-0 text-blue-700">Lançamento no ERP</div>
                          <span className="w-16 shrink-0 text-right text-gray-400 font-normal normal-case">Confiança</span>
                        </div>
                        <div className="divide-y">
                        {sugestoes.map(s => (
                          <label key={s.statementLineId} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                            <Checkbox checked={selSug.has(s.statementLineId)} onCheckedChange={() => toggleSug(s.statementLineId)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Extrato</div>
                              <div className="text-sm font-medium truncate">{s.extratoDescricao || "—"}</div>
                              <div className="text-xs text-gray-500">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                              {s.chequeFornecedor && (
                                <div className="text-[11px] text-emerald-700 truncate" title={`Cheque nº ${s.chequeNumero} — ${s.chequeFornecedor}`}>
                                  🪙 Cheque nº {s.chequeNumero} · {s.chequeFornecedor}
                                </div>
                              )}
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
                              {s.identificadoVia && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-medium bg-violet-100 text-violet-700" title={s.entryComprovanteBeneficiario ? `Comprovante: ${s.entryComprovanteBeneficiario}` : `Identificado pelo comprovante (${s.identificadoVia})`}>
                                  <Sparkles className="w-2.5 h-2.5" /> {s.identificadoVia}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400">{s.deltaDias === 0 ? "mesmo dia" : `±${s.deltaDias}d`}</span>
                            </div>
                          </label>
                        ))}
                        </div>
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

            {/* Rev. 3187 — Conciliação manual lado a lado (fonte: getConciliacaoReport). */}
            {/* Rev. 3197 — faixa de ajuda explicando o passo a passo da conciliação manual 1:1. */}
            {(repExt.length > 0 || repLan.length > 0) && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-800">
                <Link2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <p className="leading-relaxed">
                  <strong>Conciliar manualmente:</strong> clique em <strong>um item de cada lado</strong> — uma linha do extrato (esquerda) e o lançamento do ERP correspondente (direita). Aparece uma barra azul no rodapé com os dois lados; confira a diferença (Δ) e toque em <strong>"Conciliar"</strong>. É sempre <strong>1 para 1</strong>.
                </p>
              </div>
            )}
            {(repExt.length > 0 || repLan.length > 0) && (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  value={buscaConc}
                  onChange={(e) => setBuscaConc(e.target.value)}
                  placeholder="Buscar nas duas listas (descrição, fornecedor, obra, valor…)"
                  className="pl-9 pr-9 h-9"
                />
                {buscaConc && (
                  <button
                    type="button"
                    onClick={() => setBuscaConc("")}
                    title="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            {/* Rev. 3235 — CHEQUES DEVOLVIDOS (tentativa de pagamento frustrada). O par
                débito (compensação) + crédito (devolução) do MESMO cheque tem saldo ZERO:
                não é saída nem entrada real. O ERP pareia, traduz o motivo (alínea Bacen)
                e mostra a quitação real encontrada (reapresentação ou PIX/TED) — ou avisa
                que segue PENDENTE p/ o usuário decidir. READ-ONLY: nada é baixado. */}
            {repDevol.length > 0 && (
              <Card className="border-0 shadow-sm mb-6 border-l-4 border-l-amber-400">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-amber-500" />
                    Cheques devolvidos no banco ({repDevol.length})
                    <span className="font-normal text-[11px] text-gray-400">tentativa de pagamento frustrada — saldo zero</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
                    {repDevol.map((d: any) => {
                      const res = d.resolucao ?? { tipo: "pendente" };
                      return (
                        <div key={d.grupoId} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-800 flex items-center flex-wrap gap-x-2 gap-y-1">
                                <span>Cheque {d.chequeNumero ? `nº ${d.chequeNumero}` : (d.doc ? `Doc ${d.doc}` : "—")}</span>
                                <span className="text-rose-500 font-bold">{formatBRL(Math.abs(Number(d.valor) || d.valorCents / 100))}</span>
                                {d.motivoCodigo != null && (
                                  <span className={`px-1.5 py-px rounded-full text-[10px] font-medium ${d.motivoSustado ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} title={d.motivoTexto ?? ""}>
                                    Motivo {d.motivoCodigo}{d.motivoTexto ? ` · ${d.motivoTexto}` : ""}
                                  </span>
                                )}
                              </p>
                              {(d.fornecedor || d.obraNome || d.nf) && (
                                <p className="text-[11px] text-gray-500 truncate">
                                  {[d.fornecedor, d.obraNome, d.nf ? `NF ${d.nf}` : ""].filter(Boolean).join(" · ")}
                                </p>
                              )}
                              <p className="text-[11px] text-gray-400">
                                Compensou {fmtData(d.dataDebito)} → devolvido {fmtData(d.dataCredito)}
                                {d.motivoGrupo ? ` · ${d.motivoGrupo}` : ""}
                                {d.motivoReapresentavel === false ? " · não reapresentável" : ""}
                              </p>
                              {/* Resolução: quitação real encontrada ou pendência */}
                              {res.tipo === "reapresentado" ? (
                                <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5" /> Quitado: cheque reapresentado e compensado em {fmtData(res.data)}.
                                </p>
                              ) : res.tipo === "pix" ? (
                                <p className="text-[11px] text-blue-700 mt-1 flex items-center gap-1">
                                  <CheckCircle className="w-3.5 h-3.5" /> Quitado por outro meio (PIX/TED) em {fmtData(res.data)}{res.descricao ? ` — ${res.descricao}` : ""}.
                                </p>
                              ) : (
                                <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5" /> Sem quitação identificada no período — analisar (reapresentar, cobrar ou substituir).
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-4 py-2 border-t bg-amber-50/40 text-[11px] text-amber-800">
                    Estes pares (compensação + devolução) foram retirados da lista "No extrato, sem lançamento" por terem saldo zero. Nenhuma baixa é feita automaticamente — confira e decida.
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Esquerda: no extrato, sem lançamento */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      No extrato, sem lançamento ({termoBusca ? `${repExtView.length}/${repExt.length}` : repExt.length})
                    </CardTitle>
                    {repExt.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaExcel("extrato")} title="Exportar para Excel">
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaPDF("extrato")} title="Exportar para PDF">
                          <FileDown className="w-3.5 h-3.5 mr-1" />PDF
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => setExpandedList("extrato")} title="Expandir em tela cheia">
                          <Maximize2 className="w-3.5 h-3.5 mr-1" />Expandir
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {reportLoading ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Carregando…</div>
                  ) : repExt.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      {/* Rev. 3200 — a mensagem deriva do RELATÓRIO (fonte única), NÃO do
                          `statements` (query à parte). Antes, com o relatório zerado mas o
                          `statements` com qualquer linha em cache/filtrada, a tela mostrava
                          "Todo o extrato está conciliado 🎉" sem NADA ter sido conciliado
                          (repConc=0). Só dizemos "conciliado" quando HÁ conciliados de fato. */}
                      {repConc.length === 0 ? (
                        <>
                          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          <p>Nenhum extrato importado neste período.</p>
                          <Button variant="outline" size="sm" className="mt-2" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
                            Importar Extrato
                          </Button>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                          <p>Todo o extrato está conciliado. 🎉</p>
                        </>
                      )}
                    </div>
                  ) : repExtView.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Nenhum item do extrato corresponde à busca.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                      {repExtView.map(renderExtratoRow)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Direita: no ERP, sem extrato + comprovantes */}
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-600" />
                      No ERP, sem extrato ({termoBusca ? `${repLanView.length}/${repLan.length}` : repLan.length})
                    </CardTitle>
                    {repLan.length > 0 && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaExcel("erp")} title="Exportar para Excel">
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => exportarListaPDF("erp")} title="Exportar para PDF">
                          <FileDown className="w-3.5 h-3.5 mr-1" />PDF
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => setExpandedList("erp")} title="Expandir em tela cheia">
                          <Maximize2 className="w-3.5 h-3.5 mr-1" />Expandir
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {reportLoading ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Carregando…</div>
                  ) : repLan.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Nenhum lançamento sem extrato no período.</div>
                  ) : repLanView.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Nenhum lançamento do ERP corresponde à busca.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                      {repLanView.map((e: any) => renderEntryRow(e))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Rev. 3188 — Lançamentos SEM conta bancária definida (conta_bancaria_id NULL).
                Bloco à parte, fora do número da conta: o ERP não sabe de qual banco saíram,
                então são candidatos a casar com o extrato de QUALQUER conta. Colapsável. */}
            {repSemConta.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        Sem conta bancária definida ({repSemConta.length}) · {formatBRL(vSemConta)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t">
                      <p className="px-4 py-2 text-[11px] text-gray-500 bg-gray-50/60">
                        Estes lançamentos não têm conta bancária informada no ERP — por isso aparecem em todas as contas e <strong>não entram no número "ERP sem extrato"</strong> acima. Você pode casá-los com o extrato desta conta normalmente.
                      </p>
                      <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                        {repSemConta.map((e: any) => renderEntryRow(e))}
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}

            {/* Conciliação manual do par selecionado */}
            {(selectedStatement || selectedEntry) && (() => {
              const ext = repExt.find((s: any) => s.id === selectedStatement);
              // Rev. 3188 — o lançamento selecionado pode estar na lista da conta OU na lista
              // "sem conta definida" (ambas casáveis contra o extrato desta conta).
              const lan = repLan.find((e: any) => e.id === selectedEntry) || repSemConta.find((e: any) => e.id === selectedEntry);
              const delta = ext && lan ? Math.abs(Math.abs(Number(ext.valor)) - Math.abs(Number(lan.valor))) : null;
              return (
                <Card className="border-0 shadow-sm ring-1 ring-blue-200">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Extrato</p>
                      <p className="text-sm font-medium truncate">{ext ? `${fmtData(ext.data)} · ${ext.descricao || "—"}` : "Selecione uma linha do extrato"}</p>
                      {ext && <p className="text-xs text-gray-500">{formatBRL(Math.abs(Number(ext.valor)))}</p>}
                    </div>
                    <Link2 className="w-5 h-5 text-blue-400 shrink-0 self-center" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Lançamento</p>
                      <p className="text-sm font-medium truncate">{lan ? (lan.fornecedorNome || lan.descricao || "—") : "Selecione um lançamento"}</p>
                      {lan && <p className="text-xs text-gray-500">{formatBRL(Math.abs(Number(lan.valor)))}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {delta != null && delta > 0.005 && <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-700">Δ {formatBRL(delta)}</span>}
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedStatement(null); setSelectedEntry(null); }}><X className="w-4 h-4" /></Button>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={!ext || !lan || conciliarMut.isPending}
                        onClick={() => { if (ext && lan) conciliarMut.mutate({ companyId, statementLineId: ext.id, entryId: lan.id }); }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" />{conciliarMut.isPending ? "Conciliando..." : "Conciliar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Já conciliados (colapsável) */}
            {repConc.length > 0 && (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" />Já conciliados ({repConc.length}) · {formatBRL(vConc)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto border-t">
                      {repConc.map((c: any) => (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-gray-500">{fmtData(c.data)}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[260px]">{c.descricao || "—"}</p>
                            <p className="text-xs text-gray-400 truncate max-w-[260px]">↔ {c.entryFornecedor || c.entryDescricao || `Lançamento #${c.entryId ?? ""}`}</p>
                          </div>
                          <p className={`text-sm font-bold shrink-0 ${Number(c.valor) >= 0 ? "text-green-600" : "text-red-500"}`}>{formatBRL(Math.abs(Number(c.valor)))}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <input ref={comprovInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.doc,.docx" onChange={onComprovanteFile} className="hidden" />

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

        {/* Rev. 3201 — Confirmação OBRIGATÓRIA da conciliação: a sugestão automática é
            apenas sugestiva; o usuário revisa cada par (extrato → lançamento + valores)
            e só então confirma. Nada é gravado sem este passo. */}
        <AlertDialog open={confirmConciliar} onOpenChange={(o: boolean) => { if (!o && !conciliarSugMut.isPending) setConfirmConciliar(false); }}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-600" />Confirmar conciliação?</AlertDialogTitle>
              <AlertDialogDescription>
                Revise os <strong>{sugSelecionadas.length}</strong> par(es) selecionado(s) abaixo. As sugestões são apenas automáticas —
                a conciliação só é aplicada (baixando os lançamentos) após a sua confirmação.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="border rounded-md max-h-[45vh] overflow-y-auto divide-y text-sm">
              {sugSelecionadas.map(s => (
                <div key={s.statementLineId} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Extrato</div>
                    <div className="truncate">{s.extratoDescricao || "—"}</div>
                    <div className="text-xs text-gray-500">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0 text-blue-700">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">Lançamento</div>
                    <div className="truncate">{s.entryFornecedor || s.entryDescricao || "—"}</div>
                    <div className="text-xs text-gray-500">{fmtData(s.entryData)} · {formatBRL(Math.abs(s.entryValor))}</div>
                  </div>
                </div>
              ))}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={conciliarSugMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={conciliarSugMut.isPending || sugSelecionadas.length === 0}
                onClick={(e: any) => { e.preventDefault(); confirmarConciliacao(); }}
              >
                {conciliarSugMut.isPending ? "Conciliando..." : `Confirmar conciliação (${sugSelecionadas.length})`}
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

        {/* Rev. 3198 — Lançar no ERP direto do item do extrato (data/conta/valor pré-preenchidos) */}
        <Dialog open={lancStatement != null} onOpenChange={(o: boolean) => { if (!o && !lancBusy) setLancStatement(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />Lançar no ERP
              </DialogTitle>
            </DialogHeader>
            {lancStatement && (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
                  Item do extrato em <strong>{contaLabel}</strong>. Data, conta e valor já vêm preenchidos — complete <strong>obra</strong>, <strong>fornecedor</strong>, <strong>categoria</strong> e <strong>centro de custo</strong>. Ao salvar, o lançamento é criado como <strong>pago</strong> e <strong>conciliado</strong> com esta linha.
                </div>
                {lancStatement.chequeFornecedor && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-800">
                    🪙 Identificado no <strong>Controle de Cheques</strong>: cheque nº <strong>{lancStatement.chequeNumero ?? "—"}</strong> — <strong>{lancStatement.chequeFornecedor}</strong>
                    {lancStatement.chequeObraNome ? <> · obra <strong>{lancStatement.chequeObraNome}</strong></> : null}
                    {lancStatement.chequeNf ? <> · NF {lancStatement.chequeNf}</> : null}
                    {lancStatement.chequeVencimento ? <> · venc. {fmtData(lancStatement.chequeVencimento)}</> : null}
                    . Fornecedor, obra e forma de pagamento já foram pré-preenchidos — confira a categoria e o centro de custo.
                  </div>
                )}
                {lancStatement.faturaId && !lancStatement.chequeFornecedor && (
                  <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-800">
                    💳 Identificado no <strong>Controle de Cartão de Crédito</strong>: fatura do cartão <strong>{lancStatement.faturaCartao ?? "—"}</strong>
                    {lancStatement.faturaMesRef ? <> · ref. <strong>{String(lancStatement.faturaMesRef).padStart(2, "0")}/{lancStatement.faturaAnoRef ?? ""}</strong></> : null}
                    {lancStatement.faturaVencimento ? <> · venc. {fmtData(lancStatement.faturaVencimento)}</> : null}
                    {lancStatement.faturaTotal != null ? <> · total <strong>{formatBRL(Math.abs(Number(lancStatement.faturaTotal)))}</strong></> : null}
                    . Aqui a fatura entra como <strong>um único pagamento</strong> (forma = cartão); o detalhe dos gastos por obra/centro de custo fica no módulo <strong>Cartão de Crédito</strong>.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Data</Label>
                    <Input type="date" value={lancForm.data} onChange={(e) => setLancForm(f => ({ ...f, data: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input
                      inputMode="numeric"
                      value={lancForm.valor}
                      onChange={(e) => setLancForm(f => ({ ...f, valor: maskBRLInput(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <div className={`h-9 px-3 flex items-center rounded-md border text-sm font-medium ${Number(lancStatement.valor) >= 0 ? "text-green-700 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50"}`}>
                      {Number(lancStatement.valor) >= 0 ? "Receita (entrada)" : "Despesa (saída)"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Forma de pagamento</Label>
                    <Select value={lancForm.formaPagamento || "nenhuma"} onValueChange={(v) => setLancForm(f => ({ ...f, formaPagamento: v === "nenhuma" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhuma">—</SelectItem>
                        <SelectItem value="pix">Pix</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="debito_automatico">Débito automático</SelectItem>
                        <SelectItem value="cartao">Cartão</SelectItem>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="deposito">Depósito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Obra</Label>
                  <Select value={lancForm.obraId || "nenhuma"} onValueChange={(v) => setLancForm(f => ({ ...f, obraId: v === "nenhuma" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">— Sem obra —</SelectItem>
                      {obrasOpts.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Fornecedor / Pagador</Label>
                  <Input
                    list="lanc-fornecedores"
                    value={lancForm.fornecedorNome}
                    onChange={(e) => setLancForm(f => ({ ...f, fornecedorNome: e.target.value }))}
                    placeholder="Digite ou selecione"
                  />
                  <datalist id="lanc-fornecedores">
                    {fornNomes.map((n, i) => <option key={i} value={n} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Input
                    list="lanc-categorias"
                    value={lancForm.contaNome}
                    onChange={(e) => {
                      const nome = e.target.value;
                      const cat = catOpts.find(c => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
                      setLancForm(f => ({ ...f, contaNome: nome, centroCustoId: cat?.centroCustoId != null && !f.centroCustoId ? String(cat.centroCustoId) : f.centroCustoId }));
                    }}
                    placeholder="Digite ou selecione"
                  />
                  <datalist id="lanc-categorias">
                    {catOpts.map(c => <option key={c.id} value={c.nome} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-xs">Centro de custo</Label>
                  <Select value={lancForm.centroCustoId || "nenhum"} onValueChange={(v) => setLancForm(f => ({ ...f, centroCustoId: v === "nenhum" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o centro de custo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">— Sem centro de custo —</SelectItem>
                      {ccOpts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Descrição</Label>
                  <Textarea rows={2} value={lancForm.descricao} onChange={(e) => setLancForm(f => ({ ...f, descricao: e.target.value }))} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={lancBusy} onClick={() => setLancStatement(null)}>Cancelar</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" disabled={lancBusy} onClick={submitLancar}>
                {lancBusy ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Lançando...</> : <><Check className="w-4 h-4 mr-1.5" />Lançar e conciliar</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 3205 — modo tela cheia: expande a lista escolhida p/ analisar melhor.
            Reutiliza exatamente as mesmas linhas (seleção/lançar/conciliar continuam funcionando). */}
        <Dialog open={!!expandedList} onOpenChange={(o: boolean) => { if (!o) setExpandedList(null); }}>
          <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-4 py-3 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                {expandedList === "extrato" ? (
                  <><AlertCircle className="w-4 h-4 text-red-500" />No extrato, sem lançamento ({termoBusca ? `${repExtView.length}/${repExt.length}` : repExt.length})</>
                ) : (
                  <><FileText className="w-4 h-4 text-amber-600" />No ERP, sem extrato ({termoBusca ? `${repLanView.length}/${repLan.length}` : repLan.length})</>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  value={buscaConc}
                  onChange={(e) => setBuscaConc(e.target.value)}
                  placeholder="Buscar (descrição, fornecedor, obra, valor…)"
                  className="pl-9 pr-9 h-8"
                />
                {buscaConc && (
                  <button type="button" onClick={() => setBuscaConc("")} title="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => expandedList && exportarListaExcel(expandedList)} title="Exportar para Excel">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />Excel
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-600" onClick={() => expandedList && exportarListaPDF(expandedList)} title="Exportar para PDF">
                <FileDown className="w-3.5 h-3.5 mr-1" />PDF
              </Button>
            </div>
            {/* Rev. 3221 — Resumo do que está em tela: total de entradas, saídas e o saldo
                (entradas − saídas). Reage à busca (soma só o que está filtrado). Extrato:
                entrada = valor ≥ 0; ERP: entrada = tipo "receita". */}
            {(() => {
              const lista: any[] = expandedList === "extrato" ? repExtView : repLanView;
              const ehEntrada = (r: any) => expandedList === "extrato" ? Number(r.valor) >= 0 : r.tipo === "receita";
              let entrada = 0, saida = 0, ce = 0, cs = 0;
              for (const r of lista) {
                const v = Math.abs(Number(r.valor) || 0);
                if (ehEntrada(r)) { entrada += v; ce++; } else { saida += v; cs++; }
              }
              const saldo = entrada - saida;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3 border-b bg-gray-50/60 shrink-0">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><ArrowDownCircle className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700/80 font-medium">Entradas · {ce}</p>
                      <p className="text-lg font-bold text-emerald-700 truncate">{formatBRL(entrada)}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><ArrowUpCircle className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-rose-700/80 font-medium">Saídas · {cs}</p>
                      <p className="text-lg font-bold text-rose-600 truncate">{formatBRL(saida)}</p>
                    </div>
                  </div>
                  <div className={`rounded-xl border p-3 flex items-center gap-3 ${saldo >= 0 ? "border-blue-100 bg-blue-50/70" : "border-amber-100 bg-amber-50/70"}`}>
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${saldo >= 0 ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}><Landmark className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <p className={`text-[11px] uppercase tracking-wide font-medium ${saldo >= 0 ? "text-blue-700/80" : "text-amber-700/80"}`}>Saldo do mês</p>
                      <p className={`text-lg font-bold truncate ${saldo >= 0 ? "text-blue-700" : "text-amber-600"}`}>{formatBRL(saldo)}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {expandedList === "extrato"
                ? (repExtView.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">{termoBusca ? "Nenhum item corresponde à busca." : "Nada a exibir."}</div> : repExtView.map(renderExtratoRow))
                : (repLanView.length === 0 ? <div className="p-6 text-center text-gray-400 text-sm">{termoBusca ? "Nenhum item corresponde à busca." : "Nada a exibir."}</div> : repLanView.map((e: any) => renderEntryRow(e)))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
