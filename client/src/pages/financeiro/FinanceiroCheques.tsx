import { useMemo, useState, useRef, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, FileText, Sparkles, Loader2, CheckCircle, AlertCircle, AlertTriangle, ShieldCheck, Trash2, Pencil, Search, RotateCcw, Banknote, ChevronLeft, ChevronRight, Link2, X } from "lucide-react";

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
const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const STATUS_OPTS = ["compensado", "pendente", "sustado", "cancelado", "devolvido", "indefinido"];
// "Outros" = agregado dos status fora de compensado/pendente. Filtro client-side.
const OUTROS_SET = ["sustado", "cancelado", "devolvido", "indefinido"];

function statusBadge(s: string) {
  switch (s) {
    case "compensado": return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Compensado</Badge>;
    case "pendente": return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pendente</Badge>;
    case "sustado": return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Sustado</Badge>;
    case "cancelado": return <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">Cancelado</Badge>;
    case "devolvido": return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">Devolvido</Badge>;
    default: return <Badge variant="outline">Indefinido</Badge>;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

const ANO_ATUAL = new Date().getFullYear();

export default function FinanceiroCheques() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const utils = (trpc as any).useUtils?.() ?? (trpc as any).useContext?.();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Filtros ──
  // Mesmo padrão da Conciliação Bancária: navegação por ANO + faixa de meses
  // (Jan–Dez) com bolinhas de status; "Ano todo" (mesSel=null) abre o ano inteiro.
  const [fStatus, setFStatus] = useState<string>("todos");
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [fBusca, setFBusca] = useState<string>("");

  // ── Importação ──
  // Dois modos: "xlsx" (planilha mensal) e "pdf" (vários PDFs/imagens de cheque
  // lidos por IA — o ERP deriva mês/ano da DATA de cada cheque).
  const [importMode, setImportMode] = useState<"xlsx" | "pdf">("xlsx");
  const [dragOver, setDragOver] = useState(false);
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [preview, setPreview] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);
  // PDFs (IA): arquivos selecionados + linhas acumuladas da leitura.
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfFiles, setPdfFiles] = useState<{ name: string; base64: string; mimeType: string }[]>([]);
  const [pdfRows, setPdfRows] = useState<any[]>([]);
  // ── Progresso (barra 0→100%) ──
  const [progresso, setProgresso] = useState<number>(0);
  const [progLabel, setProgLabel] = useState<string>("");
  // Validação da prévia de importação: filtro por categoria + busca livre.
  const [previewFiltro, setPreviewFiltro] = useState<"todos" | "novos" | "jaExistem" | "dup" | "semFornecedor" | "semConta" | "semValor">("todos");
  const [previewBusca, setPreviewBusca] = useState<string>("");
  const progRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progOpRef = useRef<number>(0); // token da operação ativa (evita callback tardio sobrescrever)

  function pararTimersProgresso() {
    if (progRef.current) { clearInterval(progRef.current); progRef.current = null; }
    if (progTimeoutRef.current) { clearTimeout(progTimeoutRef.current); progTimeoutRef.current = null; }
  }
  function iniciarProgresso(label: string): number {
    pararTimersProgresso();
    const token = ++progOpRef.current;
    setProgLabel(label);
    setProgresso(8);
    // Avanço assintótico até ~92% enquanto a operação roda (server single-shot).
    progRef.current = setInterval(() => {
      setProgresso((p) => (p < 92 ? Math.min(92, p + (92 - p) * 0.12) : p));
    }, 180);
    return token;
  }
  function finalizarProgresso(token: number, ok: boolean) {
    if (token !== progOpRef.current) return; // operação obsoleta — ignora
    pararTimersProgresso();
    if (ok) {
      setProgresso(100);
      progTimeoutRef.current = setTimeout(() => {
        if (token !== progOpRef.current) return;
        setProgresso(0); setProgLabel("");
      }, 700);
    } else {
      setProgresso(0);
      setProgLabel("");
    }
  }
  useEffect(() => () => pararTimersProgresso(), []);

  // ── Edição ──
  const [editItem, setEditItem] = useState<any>(null);
  const [excluirItem, setExcluirItem] = useState<any>(null);

  // ── Limpar cadastro (mês / ano inteiro) ──
  // Fluxo: abrir (escopo) → 1ª confirmação → 2ª confirmação + senha → executa.
  const [limparEscopo, setLimparEscopo] = useState<null | "mes" | "ano">(null);
  const [limparEtapa, setLimparEtapa] = useState<1 | 2>(1);
  const [limparSenha, setLimparSenha] = useState("");

  // ── Dupla checagem com o extrato (Rev. 3234) ──
  const [conferirOpen, setConferirOpen] = useState(false);
  const [divergOpen, setDivergOpen] = useState(false);

  const listarArgs: any = { companyId, limit: 2000, ano };
  // "outros" é um agregado client-side (vários status); não mandamos status ao
  // servidor nesse caso — filtramos a lista localmente logo abaixo.
  if (fStatus !== "todos" && fStatus !== "outros") listarArgs.status = fStatus;
  if (mesSel != null) listarArgs.mes = mesSel;
  if (fBusca.trim()) listarArgs.busca = fBusca.trim();

  // Alterna o filtro de status ao clicar num card (clicar de novo no card ativo
  // volta para "todos"). Mantém a régua de mês selecionada.
  const toggleStatus = (s: string) => setFStatus((prev) => (prev === s ? "todos" : s));

  const { data: cheques = [], isLoading } = (trpc as any).cheques.listar.useQuery(
    listarArgs, { enabled: !!companyId }
  );
  const { data: resumo = [] } = (trpc as any).cheques.resumo.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );
  const { data: resumoMensal = [] } = (trpc as any).cheques.resumoMensal.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );
  // Resumo por STATUS do MÊS selecionado (alimenta os 3 cards quando há um mês). Só roda
  // com mês selecionado; em "Ano todo" os cards usam o resumo do ANO (`totais`) — Rev. 3212.
  const { data: resumoMes = [] } = (trpc as any).cheques.resumo.useQuery(
    { companyId, ano, mes: mesSel ?? undefined },
    { enabled: !!companyId && mesSel != null }
  );

  const previewMut = (trpc as any).cheques.importarPreview.useMutation();
  const confirmarMut = (trpc as any).cheques.importarConfirmar.useMutation();
  const lerPdfMut = (trpc as any).cheques.lerChequesPdf.useMutation();
  const pdfPreviewMut = (trpc as any).cheques.importarPdfPreview.useMutation();
  const pdfConfirmarMut = (trpc as any).cheques.importarPdfConfirmar.useMutation();
  const atualizarMut = (trpc as any).cheques.atualizar.useMutation();
  const excluirMut = (trpc as any).cheques.excluir.useMutation();
  const limparMut = (trpc as any).cheques.limparCadastro.useMutation();

  // Dupla checagem com o extrato (Rev. 3234): resumo da conferência do período atual.
  const { data: verif } = (trpc as any).cheques.verificarExtratoResumo.useQuery(
    { companyId, ano, mes: mesSel ?? undefined },
    { enabled: !!companyId }
  );
  const conferirMut = (trpc as any).cheques.conferirExtrato.useMutation();

  async function conferirComExtrato() {
    try {
      const r = await conferirMut.mutateAsync({ companyId, ano, mes: mesSel ?? undefined });
      setConferirOpen(false);
      await Promise.all([
        utils?.cheques?.listar?.invalidate?.(),
        utils?.cheques?.verificarExtratoResumo?.invalidate?.(),
        utils?.cheques?.resumo?.invalidate?.(),
      ]);
      toast({
        title: "Conferência concluída",
        description: `${r.conferidos} cheque(s) marcado(s) como conferido(s) no extrato.` +
          (r.divergencias > 0 ? ` ${r.divergencias} divergência(s) aguardam sua análise.` : ""),
      });
    } catch (err: any) {
      toast({ title: "Não foi possível conferir", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // Prévia da limpeza p/ o escopo aberto: total/conciliados/consolidado/valor.
  // mes = mês selecionado quando escopo="mes" (exige um mês selecionado).
  const limparMesNum = limparEscopo === "mes" ? mesSel : null;
  const { data: limparPrev } = (trpc as any).cheques.limparPreview.useQuery(
    { companyId, ano, mes: limparMesNum ?? undefined },
    { enabled: !!companyId && limparEscopo != null }
  );

  const totais = useMemo(() => {
    const map: Record<string, { qtd: number; total: number }> = {};
    for (const r of resumo) map[r.status] = { qtd: r.qtd, total: r.total };
    const totalGeral = (resumo as any[]).reduce((a, r) => a + (r.total || 0), 0);
    const qtdGeral = (resumo as any[]).reduce((a, r) => a + (r.qtd || 0), 0);
    return { map, totalGeral, qtdGeral };
  }, [resumo]);

  // Agregado do MÊS selecionado (Total / Compensados / Faltam compensar).
  const totaisMes = useMemo(() => {
    const map: Record<string, { qtd: number; total: number }> = {};
    for (const r of resumoMes as any[]) map[r.status] = { qtd: r.qtd, total: r.total };
    const qtd = (resumoMes as any[]).reduce((a, r) => a + (r.qtd || 0), 0);
    const total = (resumoMes as any[]).reduce((a, r) => a + (r.total || 0), 0);
    return { map, qtd, total };
  }, [resumoMes]);

  // Rev. 3212 — os 3 cards de resumo agora aparecem TAMBÉM em "Ano todo" (mesSel=null):
  // com mês selecionado usam o agregado do mês (totaisMes); em "Ano todo" usam o do ano
  // (totais, que já vem de cheques.resumo({companyId,ano}) sem filtro de mês).
  const cardTotais = mesSel != null
    ? { qtd: totaisMes.qtd, total: totaisMes.total, map: totaisMes.map }
    : { qtd: totais.qtdGeral, total: totais.totalGeral, map: totais.map };
  const cardTitulo = mesSel != null ? `Resumo de ${MESES[mesSel]}/${ano}` : `Resumo de ${ano} (ano todo)`;
  const cardEscopo = mesSel != null ? "do mês" : "do ano";

  // Status por mês p/ a bolinha da régua (mesmo padrão da Conciliação):
  // verde = todos compensados; azul = tem cheque(s) mas com pendência; cinza = sem dados.
  const mesesStatus = useMemo(() => {
    const m: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let i = 1; i <= 12; i++) m[i] = "vazio";
    for (const r of resumoMensal as any[]) {
      if (!r.mes) continue;
      m[r.mes] = r.qtd > 0 && r.compensados >= r.qtd ? "consolidado" : r.qtd > 0 ? "lancamento" : "vazio";
    }
    return m;
  }, [resumoMensal]);

  // Lista exibida — aplica o filtro client-side de "Outros" (agregado de status).
  const chequesFiltrados = useMemo(() => {
    const arr = cheques as any[];
    if (fStatus === "outros") return arr.filter((c) => OUTROS_SET.includes(c.status));
    return arr;
  }, [cheques, fStatus]);

  // Lista da PRÉVIA de importação, aplicando filtro de categoria + busca livre.
  // Usa `preview.linhas` (lista completa nova) com fallback p/ `preview.amostra` (compat).
  const previewLinhas = useMemo(() => {
    const base: any[] = (preview?.linhas ?? preview?.amostra ?? []) as any[];
    const porFiltro = base.filter((l) => {
      switch (previewFiltro) {
        case "novos": return l.situacao === "NOVO";
        case "jaExistem": return l.situacao === "JA_EXISTE";
        case "dup": return l.situacao === "DUP_ARQUIVO";
        case "semFornecedor": return !l.fornecedorIdentificado;
        case "semConta": return !l.contaIdentificada;
        case "semValor": return l.semValor === true || l.valor == null || Number(l.valor) <= 0;
        default: return true;
      }
    });
    const q = previewBusca.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!q) return porFiltro;
    return porFiltro.filter((l) => {
      const campos = [
        l.numeroCheque, l.fornecedorNome, l.aba, l.contaCorrenteRaw, l.status,
        l.valor != null ? formatBRL(Number(l.valor)) : "", l.valor != null ? String(l.valor) : "",
        l.dataVencimento ? fmtData(l.dataVencimento) : "",
      ].filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return campos.includes(q);
    });
  }, [preview, previewFiltro, previewBusca]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setArquivoBase64(b64);
      setArquivoNome(file.name);
      setPreview(null);
    } catch {
      toast({ title: "Erro", description: "Não consegui ler o arquivo.", variant: "destructive" });
    }
  }

  async function rodarPreview() {
    if (!arquivoBase64) { toast({ title: "Selecione a planilha .xlsx primeiro." }); return; }
    const tk = iniciarProgresso("Analisando planilha…");
    try {
      const rep = await previewMut.mutateAsync({ companyId, fileBase64: arquivoBase64 });
      setPreview(rep);
      setPreviewFiltro("todos"); setPreviewBusca("");
      finalizarProgresso(tk, true);
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao analisar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarImport() {
    if (!arquivoBase64) return;
    const tk = iniciarProgresso("Gravando cheques…");
    try {
      const r = await confirmarMut.mutateAsync({
        companyId, fileBase64: arquivoBase64, origemArquivo: arquivoNome,
      });
      finalizarProgresso(tk, true);
      toast({ title: "Importação concluída", description: `${r.inseridos} novo(s) cheque(s) gravado(s); ${r.pulados} já existiam.` });
      setImportOpen(false);
      setArquivoBase64(null); setArquivoNome(""); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao gravar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // ── PDFs (IA) ──
  async function onPickPdfs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      const lidos = await Promise.all(files.map(async (f) => ({
        name: f.name, base64: await fileToBase64(f),
        mimeType: f.type || (f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      })));
      // Acumula (permite escolher mais arquivos em cliques sucessivos), evitando dup por nome.
      setPdfFiles((prev) => {
        const map = new Map(prev.map((p) => [p.name, p]));
        for (const l of lidos) map.set(l.name, l);
        return Array.from(map.values());
      });
      setPreview(null); setPdfRows([]);
    } catch {
      toast({ title: "Erro", description: "Não consegui ler um dos arquivos.", variant: "destructive" });
    }
    if (pdfRef.current) pdfRef.current.value = "";
  }

  function removerPdf(name: string) {
    setPdfFiles((prev) => prev.filter((p) => p.name !== name));
    setPreview(null); setPdfRows([]);
  }

  async function rodarPreviewPdf() {
    if (!pdfFiles.length) { toast({ title: "Selecione ao menos um PDF/imagem de cheque." }); return; }
    const tk = iniciarProgresso(`Lendo arquivo 1/${pdfFiles.length}…`);
    try {
      const todas: any[] = [];
      for (let i = 0; i < pdfFiles.length; i++) {
        setProgLabel(`Lendo arquivo ${i + 1}/${pdfFiles.length}…`);
        const f = pdfFiles[i];
        const r = await lerPdfMut.mutateAsync({ companyId, fileBase64: f.base64, mimeType: f.mimeType, fileName: f.name });
        if (Array.isArray(r?.rows)) todas.push(...r.rows);
      }
      setProgLabel("Montando prévia…");
      const rep = await pdfPreviewMut.mutateAsync({ companyId, rows: todas });
      setPdfRows(todas);
      setPreview(rep);
      setPreviewFiltro("todos"); setPreviewBusca("");
      finalizarProgresso(tk, true);
      if (todas.length === 0) toast({ title: "Nenhum cheque lido", description: "A IA não encontrou cheques nos arquivos enviados.", variant: "destructive" });
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao ler por IA", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarImportPdf() {
    if (!pdfRows.length) return;
    const tk = iniciarProgresso("Gravando cheques…");
    try {
      const nomes = pdfFiles.map((p) => p.name).join(", ").slice(0, 200);
      const r = await pdfConfirmarMut.mutateAsync({ companyId, rows: pdfRows, origemArquivo: nomes || "PDFs (IA)" });
      finalizarProgresso(tk, true);
      toast({ title: "Importação concluída", description: `${r.inseridos} novo(s) cheque(s) gravado(s); ${r.pulados} já existiam.` });
      setImportOpen(false);
      setPdfFiles([]); setPdfRows([]); setPreview(null);
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      finalizarProgresso(tk, false);
      toast({ title: "Falha ao gravar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  // Dispara a análise conforme o modo ativo (planilha ou PDFs por IA).
  const analisando = previewMut.isPending || lerPdfMut.isPending || pdfPreviewMut.isPending;
  const gravando = confirmarMut.isPending || pdfConfirmarMut.isPending;
  function analisarAtual() { return importMode === "pdf" ? rodarPreviewPdf() : rodarPreview(); }
  function confirmarAtual() { return importMode === "pdf" ? confirmarImportPdf() : confirmarImport(); }
  function trocarModo(m: "xlsx" | "pdf") {
    if (m === importMode) return;
    setImportMode(m);
    setPreview(null); setPreviewFiltro("todos"); setPreviewBusca("");
    setArquivoBase64(null); setArquivoNome("");
    setPdfFiles([]); setPdfRows([]);
    if (fileRef.current) fileRef.current.value = "";
    if (pdfRef.current) pdfRef.current.value = "";
  }

  async function salvarEdicao() {
    if (!editItem) return;
    try {
      await atualizarMut.mutateAsync({
        id: editItem.id, companyId,
        status: editItem.status,
        fornecedorNome: editItem.fornecedorNome ?? "",
        observacao: editItem.observacao ?? "",
      });
      toast({ title: "Cheque atualizado." });
      setEditItem(null);
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      toast({ title: "Falha ao salvar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarExclusao() {
    if (!excluirItem) return;
    try {
      await excluirMut.mutateAsync({ id: excluirItem.id, companyId });
      toast({ title: "Cheque excluído." });
      setExcluirItem(null);
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      toast({ title: "Falha ao excluir", description: err?.message || String(err), variant: "destructive" });
    }
  }

  function fecharLimpar() {
    setLimparEscopo(null);
    setLimparEtapa(1);
    setLimparSenha("");
  }

  async function executarLimpeza() {
    if (!limparEscopo) return;
    try {
      const r = await limparMut.mutateAsync({
        companyId, ano,
        mes: limparEscopo === "mes" ? (mesSel ?? undefined) : undefined,
        password: limparSenha,
      });
      toast({ title: "Cadastro limpo", description: `${r.removidos} cheque(s) removido(s) do controle.` });
      fecharLimpar();
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
    } catch (err: any) {
      toast({ title: "Não foi possível limpar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Banknote className="h-6 w-6 text-blue-700" /> Controle de Cheques
            </h1>
            <p className="text-sm text-muted-foreground">
              Importe a planilha de cheques para consulta e para identificar as compensações na conciliação bancária. Cheques aqui <strong>não viram lançamento</strong>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => { setLimparEtapa(1); setLimparSenha(""); setLimparEscopo("mes"); }}
              disabled={mesSel == null}
              title={mesSel == null ? "Selecione um mês para limpar" : `Limpar cheques de ${MESES[mesSel]}/${ano}`}
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 className="h-4 w-4" /> Limpar mês
            </Button>
            <Button
              variant="outline"
              onClick={() => { setLimparEtapa(1); setLimparSenha(""); setLimparEscopo("ano"); }}
              title={`Limpar TODOS os cheques de ${ano}`}
              className="gap-2 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 className="h-4 w-4" /> Limpar ano inteiro
            </Button>
            <Button
              variant="outline"
              onClick={() => setConferirOpen(true)}
              title="Cruza os cheques com o extrato bancário importado e marca os confirmados"
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              <ShieldCheck className="h-4 w-4" /> Conferir com o extrato
            </Button>
            <Button onClick={() => setImportOpen(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Importar planilha
            </Button>
          </div>
        </div>

        {/* Alerta de divergência (Rev. 3234) — dupla checagem: o banco compensou cheques
            que no controle constam como devolvido/sustado/pendente. Não altera nada;
            só sinaliza p/ análise manual. */}
        {verif && verif.divergencias > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
            <div className="flex items-start gap-2.5 text-sm text-red-800">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
              <div>
                <strong>{verif.divergencias} divergência(s) entre o controle e o extrato.</strong>{" "}
                O banco compensou cheque(s) que aqui constam como devolvido/sustado/pendente. Confira manualmente.
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDivergOpen(true)} className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100">
              <Search className="h-4 w-4" /> Analisar divergências
            </Button>
          </div>
        )}

        {/* Cards de resumo — clicáveis: clicar filtra a lista por aquele status
            (clicar de novo no card ativo limpa o filtro). Responsivos: 1 col no
            mobile, 2 em telas pequenas, 4 a partir de md. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => toggleStatus("todos")}
            aria-pressed={fStatus === "todos"}
            className={`text-left rounded-xl border bg-card transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-300 ${fStatus === "todos" ? "ring-2 ring-blue-500 border-blue-300" : ""}`}
          >
            <div className="p-4">
              <div className="text-xs text-muted-foreground">Total ({ano})</div>
              <div className="text-xl font-bold">{totais.qtdGeral}</div>
              <div className="text-sm text-muted-foreground">{formatBRL(totais.totalGeral)}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatus("compensado")}
            aria-pressed={fStatus === "compensado"}
            className={`text-left rounded-xl border bg-card transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-300 ${fStatus === "compensado" ? "ring-2 ring-green-500 border-green-300" : ""}`}
          >
            <div className="p-4">
              <div className="text-xs text-muted-foreground">Compensados</div>
              <div className="text-xl font-bold text-green-700">{totais.map["compensado"]?.qtd || 0}</div>
              <div className="text-sm text-muted-foreground">{formatBRL(totais.map["compensado"]?.total || 0)}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatus("pendente")}
            aria-pressed={fStatus === "pendente"}
            className={`text-left rounded-xl border bg-card transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300 ${fStatus === "pendente" ? "ring-2 ring-amber-500 border-amber-300" : ""}`}
          >
            <div className="p-4">
              <div className="text-xs text-muted-foreground">Pendentes</div>
              <div className="text-xl font-bold text-amber-600">{totais.map["pendente"]?.qtd || 0}</div>
              <div className="text-sm text-muted-foreground">{formatBRL(totais.map["pendente"]?.total || 0)}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => toggleStatus("outros")}
            aria-pressed={fStatus === "outros"}
            className={`text-left rounded-xl border bg-card transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-gray-300 ${fStatus === "outros" ? "ring-2 ring-gray-500 border-gray-300" : ""}`}
          >
            <div className="p-4">
              <div className="text-xs text-muted-foreground">Outros</div>
              <div className="text-xl font-bold text-gray-600">
                {(totais.map["sustado"]?.qtd || 0) + (totais.map["cancelado"]?.qtd || 0) + (totais.map["devolvido"]?.qtd || 0) + (totais.map["indefinido"]?.qtd || 0)}
              </div>
              <div className="text-sm text-muted-foreground">sustado/cancelado/devolvido</div>
            </div>
          </button>
        </div>

        {/* Cards de resumo (Total / Compensados / Faltam compensar) — mês selecionado OU ano todo */}
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {cardTitulo}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => toggleStatus("todos")}
              aria-pressed={fStatus === "todos"}
              className={`text-left rounded-xl border bg-blue-50/40 border-blue-200 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-300 ${fStatus === "todos" ? "ring-2 ring-blue-500" : ""}`}
            >
              <div className="p-4">
                <div className="text-xs text-muted-foreground">Total de cheques {cardEscopo}</div>
                <div className="text-xl font-bold text-blue-700">{cardTotais.qtd}</div>
                <div className="text-sm text-muted-foreground">{formatBRL(cardTotais.total)}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => toggleStatus("compensado")}
              aria-pressed={fStatus === "compensado"}
              className={`text-left rounded-xl border bg-emerald-50/40 border-emerald-200 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 ${fStatus === "compensado" ? "ring-2 ring-emerald-500" : ""}`}
            >
              <div className="p-4">
                <div className="text-xs text-muted-foreground">Compensados {cardEscopo}</div>
                <div className="text-xl font-bold text-emerald-700">{cardTotais.map["compensado"]?.qtd || 0}</div>
                <div className="text-sm text-muted-foreground">{formatBRL(cardTotais.map["compensado"]?.total || 0)}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => toggleStatus("pendente")}
              aria-pressed={fStatus === "pendente"}
              className={`text-left rounded-xl border bg-amber-50/40 border-amber-200 transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-300 ${fStatus === "pendente" ? "ring-2 ring-amber-500" : ""}`}
            >
              <div className="p-4">
                <div className="text-xs text-muted-foreground">Faltam compensar (pendentes)</div>
                <div className="text-xl font-bold text-amber-600">{cardTotais.map["pendente"]?.qtd || 0}</div>
                <div className="text-sm text-muted-foreground">{formatBRL(cardTotais.map["pendente"]?.total || 0)}</div>
              </div>
            </button>
          </div>
        </div>

        {/* Filtros — mesmo padrão da Conciliação Bancária:
            busca + status, e a faixa de meses (Jan–Dez) com bolinhas de status. */}
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs">Buscar (nº ou fornecedor)</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" value={fBusca} onChange={(e) => setFBusca(e.target.value)} placeholder="Nº do cheque ou fornecedor…" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}
                    <SelectItem value="outros">Outros (sustado/cancelado/devolvido)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Navegação por ANO + faixa de meses (Jan–Dez) com bolinhas de status.
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
                {MESES.slice(1).map((m, i) => {
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
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base flex items-center gap-2">
              Cheques ({chequesFiltrados.length})
              {fStatus !== "todos" && (
                <button
                  type="button"
                  onClick={() => setFStatus("todos")}
                  className="text-[11px] font-normal text-blue-600 hover:underline"
                >
                  filtrando por “{fStatus}” · limpar
                </button>
              )}
            </CardTitle>
            {/* Legenda de status — p/ rastreio de cada cheque */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium uppercase tracking-wide">Legenda:</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Compensado</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Pendente</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Devolvido</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Sustado</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> Cancelado / Indefinido</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-700"><Link2 className="h-3 w-3" /> Conciliado no extrato</span>
              <span className="inline-flex items-center gap-1.5 text-red-700"><AlertTriangle className="h-3 w-3" /> Divergência (banco compensou, controle não)</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            ) : chequesFiltrados.length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                {fStatus !== "todos"
                  ? <>Nenhum cheque com o filtro selecionado. <button type="button" onClick={() => setFStatus("todos")} className="text-blue-600 hover:underline">Limpar filtro</button>.</>
                  : <>Nenhum cheque encontrado. Use <strong>Importar planilha</strong> para começar.</>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                      <th className="py-2 pr-3">Nº Cheque</th>
                      <th className="py-2 pr-3">Fornecedor</th>
                      <th className="py-2 pr-3">Banco</th>
                      <th className="py-2 pr-3 text-right">Valor</th>
                      <th className="py-2 pr-3">Vencimento</th>
                      <th className="py-2 pr-3">Compensação</th>
                      <th className="py-2 pr-3">Mês</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chequesFiltrados.map((c) => (
                      <tr key={c.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-3 font-mono">{c.numeroCheque || "—"}</td>
                        <td className="py-2 pr-3">
                          {c.fornecedorNome || <span className="text-muted-foreground">—</span>}
                          {!c.fornecedorId && c.fornecedorNome && (
                            <span className="ml-1 text-[10px] text-amber-600" title="Fornecedor não vinculado ao cadastro">●</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs">{c.bancoNome || "—"}</td>
                        <td className="py-2 pr-3 text-right font-medium">{c.valor != null ? formatBRL(Number(c.valor)) : "—"}</td>
                        <td className="py-2 pr-3">{fmtData(c.dataVencimento)}</td>
                        <td className="py-2 pr-3">{fmtData(c.dataCompensacao)}</td>
                        <td className="py-2 pr-3">{c.mes ? `${MESES[c.mes]}/${c.ano}` : c.ano}</td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-col gap-1">
                            {statusBadge(c.status)}
                            {c.conciliado ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700" title={`Conciliado no extrato${c.dataConciliacao ? " em " + fmtData(c.dataConciliacao) : ""}`}>
                                <Link2 className="h-3 w-3" /> Conciliado no extrato{c.dataConciliacao ? ` · ${fmtData(c.dataConciliacao)}` : ""}
                              </span>
                            ) : null}
                            {/* Rev. 3234 — dupla checagem extrato↔controle */}
                            {c.extratoDivergente ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700" title={`O banco compensou este cheque${c.extratoData ? " em " + fmtData(c.extratoData) : ""}, mas no controle está como "${c.status}". Analise.`}>
                                <AlertTriangle className="h-3 w-3" /> Banco compensou — analisar{c.extratoData ? ` · ${fmtData(c.extratoData)}` : ""}
                              </span>
                            ) : c.extratoConfirmado && !c.conciliado ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600" title={`Confere com o extrato${c.extratoData ? " (compensado em " + fmtData(c.extratoData) + ")" : ""}. Use "Conferir com o extrato" para marcar.`}>
                                <CheckCircle className="h-3 w-3" /> Confere com o extrato
                              </span>
                            ) : null}
                            {(c.status === "devolvido" || c.status === "sustado" || c.status === "cancelado") && c.observacao ? (
                              <span className="text-[10px] text-orange-700 max-w-[220px] truncate" title={c.observacao}>Motivo: {c.observacao}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem({ ...c })}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setExcluirItem(c)}><Trash2 className="h-4 w-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dupla checagem (Rev. 3234): confirmar a conferência com o extrato ── */}
      <AlertDialog open={conferirOpen} onOpenChange={setConferirOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Conferir cheques com o extrato
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  O ERP cruza os cheques de <strong>{mesSel != null ? `${MESES[mesSel]}/${ano}` : `${ano} (ano todo)`}</strong> com o
                  extrato bancário importado e marca como <strong>conferidos</strong> apenas os que o banco compensou
                  <strong> e</strong> que aqui já constam como <strong>compensado</strong>. Nada é baixado financeiramente.
                </p>
                {verif ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-2.5">
                      <div className="text-xs text-emerald-700">Serão marcados agora</div>
                      <div className="text-lg font-bold text-emerald-700">{verif.aConferir}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <div className="text-xs text-muted-foreground">Já conferidos</div>
                      <div className="text-lg font-bold">{verif.jaConferidos}</div>
                    </div>
                    <div className="rounded-lg border bg-red-50 border-red-200 p-2.5">
                      <div className="text-xs text-red-700">Divergências (não serão alteradas)</div>
                      <div className="text-lg font-bold text-red-700">{verif.divergencias}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <div className="text-xs text-muted-foreground">Sem correspondência no extrato</div>
                      <div className="text-lg font-bold">{verif.naoEncontrados}</div>
                    </div>
                  </div>
                ) : null}
                {verif && verif.divergencias > 0 ? (
                  <p className="text-red-700">
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                    As <strong>{verif.divergencias} divergência(s)</strong> (banco compensou, mas o controle diz
                    devolvido/sustado/pendente) <strong>NÃO</strong> serão alteradas — o status é mantido para você analisar.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={conferirMut.isLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); conferirComExtrato(); }}
              disabled={conferirMut.isLoading || !verif || verif.aConferir === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {conferirMut.isLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Conferindo…</> : <>Marcar {verif?.aConferir ?? 0} como conferido(s)</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dupla checagem (Rev. 3234): lista de divergências p/ análise ── */}
      <Dialog open={divergOpen} onOpenChange={setDivergOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Divergências entre o controle e o extrato
            </DialogTitle>
            <DialogDescription>
              O banco compensou estes cheques, mas no controle eles constam como devolvido/sustado/pendente/etc.
              O ERP <strong>não corrige o status automaticamente</strong> — revise cada caso e ajuste manualmente se for o caso.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {verif && verif.divergenciasLista && verif.divergenciasLista.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-3">Nº Cheque</th>
                    <th className="py-2 pr-3">Fornecedor</th>
                    <th className="py-2 pr-3 text-right">Valor</th>
                    <th className="py-2 pr-3">Status no controle</th>
                    <th className="py-2 pr-3">Compensado no extrato</th>
                    <th className="py-2 pr-3">Mês</th>
                  </tr>
                </thead>
                <tbody>
                  {verif.divergenciasLista.map((d: any) => (
                    <tr key={d.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-3 font-mono">{d.numeroCheque || "—"}</td>
                      <td className="py-2 pr-3">{d.fornecedorNome || <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatBRL(d.valor)}</td>
                      <td className="py-2 pr-3">{statusBadge(d.status)}</td>
                      <td className="py-2 pr-3 text-red-700">{fmtData(d.dataExtrato)}</td>
                      <td className="py-2 pr-3">{d.mes ? `${MESES[d.mes]}/${d.ano}` : d.ano}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-muted-foreground py-8">Nenhuma divergência no período.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDivergOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de importação */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setPreview(null); setDragOver(false); } }}>
        <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[94vh] max-h-[94vh] flex flex-col p-0 gap-0">
          {/* Cabeçalho com faixa */}
          <div className="flex items-start gap-3 p-5 border-b bg-gradient-to-r from-blue-50 to-transparent shrink-0">
            <div className="rounded-xl bg-blue-600 text-white p-2.5 shadow-sm shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg">Importar Controle de Cheques</DialogTitle>
              <DialogDescription className="mt-0.5">
                {importMode === "pdf"
                  ? <>Selecione <strong>vários PDFs ou fotos</strong> de cheque — a IA lê cada um e o mês/ano é derivado da <strong>data do cheque</strong>. Nada é gravado até você confirmar.</>
                  : <>Arraste ou selecione a planilha <strong>.xlsx</strong>. O ano é lido automaticamente de cada cheque — nada é gravado até você confirmar.</>}
              </DialogDescription>
            </div>
          </div>

          {/* Seletor de modo: planilha mensal × PDFs lidos por IA */}
          <div className="flex gap-2 px-5 pt-3 shrink-0">
            <button type="button" onClick={() => trocarModo("xlsx")}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${importMode === "xlsx" ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-300" : "bg-card hover:bg-muted text-muted-foreground"}`}>
              <FileSpreadsheet className="h-4 w-4" /> Planilha (.xlsx)
            </button>
            <button type="button" onClick={() => trocarModo("pdf")}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${importMode === "pdf" ? "border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-300" : "bg-card hover:bg-muted text-muted-foreground"}`}>
              <Sparkles className="h-4 w-4" /> Cheques em PDF / foto (IA)
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Coluna esquerda: upload + ação */}
              <div className="space-y-4">
                {importMode === "xlsx" ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault(); setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) onPickFile({ target: { files: [f] } } as any);
                    }}
                    className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-16 text-center transition-colors cursor-pointer ${
                      dragOver ? "border-blue-500 bg-blue-50" : arquivoNome ? "border-emerald-300 bg-emerald-50/60" : "border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/40"
                    }`}
                  >
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onPickFile} className="hidden" />
                    {arquivoNome ? (
                      <>
                        <div className="rounded-full bg-emerald-100 text-emerald-700 p-3"><CheckCircle className="h-8 w-8" /></div>
                        <div className="font-medium text-base break-all">{arquivoNome}</div>
                        <div className="text-sm text-muted-foreground">Clique para trocar o arquivo</div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-full bg-blue-100 text-blue-700 p-3"><Upload className="h-8 w-8" /></div>
                        <div className="font-medium text-base">Arraste a planilha aqui ou clique para selecionar</div>
                        <div className="text-sm text-muted-foreground">Formato .xlsx com abas mensais (JAN…DEZ)</div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => pdfRef.current?.click()}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") pdfRef.current?.click(); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOver(false);
                        const fs = Array.from(e.dataTransfer.files || []);
                        if (fs.length) onPickPdfs({ target: { files: fs } } as any);
                      }}
                      className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-12 text-center transition-colors cursor-pointer ${
                        dragOver ? "border-violet-500 bg-violet-50" : pdfFiles.length ? "border-violet-300 bg-violet-50/60" : "border-muted-foreground/25 hover:border-violet-400 hover:bg-muted/40"
                      }`}
                    >
                      <input ref={pdfRef} type="file" accept=".pdf,image/*" multiple onChange={onPickPdfs} className="hidden" />
                      <div className="rounded-full bg-violet-100 text-violet-700 p-3"><FileText className="h-8 w-8" /></div>
                      <div className="font-medium text-base">
                        {pdfFiles.length ? `${pdfFiles.length} arquivo(s) selecionado(s) — clique para adicionar mais` : "Arraste vários PDFs/fotos aqui ou clique para selecionar"}
                      </div>
                      <div className="text-sm text-muted-foreground">PDF ou imagem (JPG/PNG) — um ou vários cheques por arquivo</div>
                    </div>

                    {pdfFiles.length > 0 && (
                      <div className="space-y-1.5 max-h-44 overflow-auto rounded-lg border p-2">
                        {pdfFiles.map((f) => (
                          <div key={f.name} className="flex items-center gap-2 text-sm">
                            <FileText className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                            <span className="truncate flex-1" title={f.name}>{f.name}</span>
                            <button type="button" onClick={() => removerPdf(f.name)} className="text-muted-foreground hover:text-red-600 shrink-0" title="Remover">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <Button onClick={analisarAtual} disabled={(importMode === "pdf" ? pdfFiles.length === 0 : !arquivoBase64) || analisando} className="w-full gap-2" size="lg">
                  {analisando ? <Loader2 className="h-4 w-4 animate-spin" /> : (importMode === "pdf" ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />)}
                  {analisando ? "Analisando…" : (importMode === "pdf" ? "Ler cheques por IA" : "Analisar planilha")}
                </Button>

                {(analisando || (progresso > 0 && (progLabel.startsWith("Analisando") || progLabel.startsWith("Lendo") || progLabel.startsWith("Montando")))) && (
                  <div className="space-y-1.5">
                    <Progress value={progresso} className="h-2.5" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{progLabel || "Analisando…"}</span>
                      <span className="font-semibold tabular-nums">{Math.round(progresso)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Coluna direita: resumo / KPIs */}
              <div className="space-y-4">
                {!preview ? (
                  <div className="rounded-xl border border-dashed border-muted-foreground/25 p-10 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2 min-h-[280px]">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <div className="font-medium">O resumo aparece aqui</div>
                    <div>Selecione a planilha e clique em <strong>Analisar planilha</strong> para ver linhas lidas, novos, duplicados e a lista completa dos cheques.</div>
                  </div>
                ) : (
                  <>
                    {/* KPIs em destaque — clicáveis: cada card filtra a tabela abaixo. */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <button type="button" onClick={() => setPreviewFiltro("todos")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "todos" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Linhas lidas</div>
                        <div className="text-2xl font-bold">{preview.resumo.totalLinhas}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("novos")}
                        className={`text-left rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 transition hover:ring-2 hover:ring-emerald-300 ${previewFiltro === "novos" ? "ring-2 ring-emerald-500" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-emerald-700/70">Novos</div>
                        <div className="text-2xl font-bold text-emerald-700">{preview.resumo.novos}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("jaExistem")}
                        className={`text-left rounded-lg border border-amber-200 bg-amber-50 p-3.5 transition hover:ring-2 hover:ring-amber-300 ${previewFiltro === "jaExistem" ? "ring-2 ring-amber-500" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-amber-700/70">Já existem</div>
                        <div className="text-2xl font-bold text-amber-700">{preview.resumo.jaExistem}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("dup")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "dup" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dup. no arquivo</div>
                        <div className="text-2xl font-bold">{preview.resumo.dupNoArquivo}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("semFornecedor")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "semFornecedor" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem fornecedor</div>
                        <div className="text-2xl font-bold">{preview.resumo.semFornecedor}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("semConta")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "semConta" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem conta</div>
                        <div className="text-2xl font-bold">{preview.resumo.semConta ?? 0}</div>
                      </button>
                      <button type="button" onClick={() => setPreviewFiltro("semValor")}
                        className={`text-left rounded-lg border bg-card p-3.5 transition hover:ring-2 hover:ring-primary/30 ${previewFiltro === "semValor" ? "ring-2 ring-primary" : ""}`}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem valor</div>
                        <div className="text-2xl font-bold">{preview.resumo.semValor ?? 0}</div>
                      </button>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3.5">
                        <div className="text-[11px] uppercase tracking-wide text-blue-700/70">Valor (novos)</div>
                        <div className="text-lg font-bold text-blue-700">{formatBRL(preview.resumo.valorTotalNovos)}</div>
                      </div>
                    </div>

                    {preview.abasLidas?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-muted-foreground">Abas detectadas:</span>
                        {preview.abasLidas.map((a: string, i: number) => (
                          <span key={i} className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5">{a}</span>
                        ))}
                      </div>
                    )}
                    {preview.abasIgnoradas?.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1 rounded-md border border-amber-200 bg-amber-50/60 p-2">
                        <div className="flex items-center gap-1 font-medium text-amber-700">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Abas ignoradas (não importadas): {preview.abasIgnoradas.length}
                        </div>
                        <ul className="ml-1 space-y-0.5">
                          {preview.abasIgnoradas.map((a: any, i: number) => (
                            <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="font-medium text-foreground">{typeof a === "string" ? a : a.nome}</span>
                              {typeof a !== "string" && (
                                <>
                                  <span>— {a.motivo}</span>
                                  {a.linhas > 0 && (
                                    <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-medium">
                                      {a.linhas} linha(s) com cara de cheque ficaram de fora
                                    </span>
                                  )}
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="ml-1 text-[11px] text-muted-foreground">
                          Só abas nomeadas por mês (JAN, FEV, …) são lidas. Se uma aba acima contém cheques a cadastrar, renomeie-a para o mês correspondente e reimporte.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Cheques lidos — tabela COMPLETA, filtrável e pesquisável p/ validar cada item */}
            {(preview?.linhas?.length > 0 || preview?.amostra?.length > 0) && (
              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium">Cheques lidos na planilha</div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input value={previewBusca} onChange={(e) => setPreviewBusca(e.target.value)}
                      placeholder="Buscar nº, fornecedor, aba, valor…" className="pl-8 h-9" />
                  </div>
                </div>

                {/* Chips de filtro (espelham os cards clicáveis) */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {([
                    ["todos", "Todos", preview.resumo.totalLinhas],
                    ["novos", "Novos", preview.resumo.novos],
                    ["jaExistem", "Já existem", preview.resumo.jaExistem],
                    ["dup", "Duplicados", preview.resumo.dupNoArquivo],
                    ["semFornecedor", "Sem fornecedor", preview.resumo.semFornecedor],
                    ["semConta", "Sem conta", preview.resumo.semConta ?? 0],
                    ["semValor", "Sem valor", preview.resumo.semValor ?? 0],
                  ] as [typeof previewFiltro, string, number][]).map(([key, label, count]) => (
                    <button key={key} type="button" onClick={() => setPreviewFiltro(key)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${previewFiltro === key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
                      {label}
                      <span className={`rounded-full px-1.5 text-[10px] font-semibold ${previewFiltro === key ? "bg-primary-foreground/20" : "bg-muted-foreground/10"}`}>{count}</span>
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-muted-foreground mb-1.5">
                  Mostrando {Math.min(previewLinhas.length, 1000)} de {previewLinhas.length} linha(s)
                  {previewLinhas.length > 1000 && " (limitado a 1000 — refine a busca para ver as demais)"}
                </div>

                <div className="border rounded-lg overflow-auto max-h-[46vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/95 backdrop-blur"><tr className="text-left">
                      <th className="p-2.5">Aba / Linha</th>
                      <th className="p-2.5">Nº</th>
                      <th className="p-2.5">Fornecedor</th>
                      <th className="p-2.5">Conta</th>
                      <th className="p-2.5">Vencimento</th>
                      <th className="p-2.5 text-right">Valor</th>
                      <th className="p-2.5">Situação</th>
                    </tr></thead>
                    <tbody>
                      {previewLinhas.length === 0 ? (
                        <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma linha para este filtro/busca.</td></tr>
                      ) : previewLinhas.slice(0, 1000).map((a: any, i: number) => (
                        <tr key={i} className="border-t hover:bg-muted/40">
                          <td className="p-2.5 whitespace-nowrap text-xs text-muted-foreground">
                            {a.aba ? <>{a.aba}{a.linhaExcel ? <span className="font-mono"> · L{a.linhaExcel}</span> : null}</> : "—"}
                          </td>
                          <td className="p-2.5 font-mono">{a.numeroCheque || "—"}</td>
                          <td className="p-2.5">
                            {a.fornecedorNome || "—"}
                            {!a.fornecedorIdentificado && <span className="text-amber-600" title="Fornecedor não vinculado"> ●</span>}
                          </td>
                          <td className="p-2.5 text-xs">
                            {a.contaCorrenteRaw || "—"}
                            {!a.contaIdentificada && <span className="text-amber-600" title="Conta não vinculada"> ●</span>}
                          </td>
                          <td className="p-2.5 whitespace-nowrap text-xs">{a.dataVencimento ? fmtData(a.dataVencimento) : "—"}</td>
                          <td className={`p-2.5 text-right ${a.semValor ? "text-red-600 font-medium" : ""}`}>{a.valor != null && a.valor > 0 ? formatBRL(a.valor) : "—"}</td>
                          <td className="p-2.5">
                            {a.situacao === "NOVO"
                              ? <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px]">Novo</span>
                              : a.situacao === "JA_EXISTE"
                                ? <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px]">Já existe</span>
                                : <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[11px]">Dup.</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {(gravando || (progresso > 0 && progLabel === "Gravando cheques…")) && (
            <div className="px-5 pt-3 space-y-1.5 border-t shrink-0">
              <Progress value={progresso} className="h-2.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progLabel || "Gravando cheques…"}</span>
                <span className="font-semibold tabular-nums">{Math.round(progresso)}%</span>
              </div>
            </div>
          )}

          <DialogFooter className="p-5 border-t shrink-0">
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarAtual} disabled={!preview || preview.resumo.novos === 0 || gravando || analisando} className="gap-2">
              {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Gravar {preview ? preview.resumo.novos : 0} novo(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de edição */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar cheque {editItem?.numeroCheque}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Fornecedor</Label>
                <Input value={editItem.fornecedorNome ?? ""} onChange={(e) => setEditItem({ ...editItem, fornecedorNome: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={editItem.status} onValueChange={(v) => setEditItem({ ...editItem, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea value={editItem.observacao ?? ""} onChange={(e) => setEditItem({ ...editItem, observacao: e.target.value })} />
              </div>
              <div className="text-xs text-muted-foreground">
                Valor {editItem.valor != null ? formatBRL(Number(editItem.valor)) : "—"} · Venc. {fmtData(editItem.dataVencimento)} · Comp. {fmtData(editItem.dataCompensacao)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={atualizarMut.isPending}>
              {atualizarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!excluirItem} onOpenChange={(o) => { if (!o) setExcluirItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cheque {excluirItem?.numeroCheque}?</AlertDialogTitle>
            <AlertDialogDescription>O cheque será removido do controle (exclusão reversível no banco). Esta ação não afeta lançamentos financeiros.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Limpar cadastro (mês / ano inteiro) — dupla confirmação + senha + alerta */}
      <Dialog open={limparEscopo != null} onOpenChange={(o) => { if (!o) fecharLimpar(); }}>
        <DialogContent className="max-w-lg">
          {(() => {
            const escopoLabel = limparEscopo === "mes"
              ? `${mesSel != null ? MESES[mesSel] : ""}/${ano}`
              : `o ano inteiro de ${ano}`;
            const total = limparPrev?.total ?? null;
            const conciliados = limparPrev?.conciliados ?? 0;
            const consolidado = limparPrev?.consolidado ?? false;
            const bloqueado = limparPrev?.bloqueado ?? false;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-5 w-5" />
                    {limparEscopo === "mes" ? "Limpar cheques do mês" : "Limpar cheques do ano inteiro"}
                  </DialogTitle>
                  <DialogDescription>
                    Você está prestes a remover do controle os cheques de <strong>{escopoLabel}</strong>.
                  </DialogDescription>
                </DialogHeader>

                {/* Bloqueio: há cheque conciliado em extrato (mês consolidado) */}
                {bloqueado ? (
                  <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-red-700">
                      <AlertCircle className="h-5 w-5" /> Limpeza proibida
                    </div>
                    <p className="text-sm text-red-700">
                      Existem <strong>{conciliados} cheque(s) já conciliado(s)</strong> em algum extrato neste período
                      (mês consolidado). Apagar geraria <strong>erro na conciliação bancária</strong>.
                      Reverta a conciliação desses cheques antes de limpar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Alerta vermelho — perda de registros */}
                    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4 space-y-1.5">
                      <div className="flex items-center gap-2 font-semibold text-red-700">
                        <AlertCircle className="h-5 w-5" /> Atenção: ação destrutiva
                      </div>
                      <p className="text-sm text-red-700">
                        Todos os <strong>{total ?? "—"} cheque(s)</strong> de <strong>{escopoLabel}</strong> serão
                        removidos do controle. <strong>Você perderá todos esses registros</strong> e precisará
                        reimportar a planilha para recuperá-los.
                      </p>
                      {consolidado && (
                        <p className="text-xs text-red-600">
                          Observação: este período aparece como <strong>consolidado</strong> (todos compensados).
                        </p>
                      )}
                    </div>

                    {limparEtapa === 1 ? (
                      <p className="text-sm text-muted-foreground">
                        Esta é a <strong>1ª confirmação</strong>. Ao continuar, pediremos a confirmação final e a
                        senha do seu login.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-red-700">
                          2ª confirmação — digite a senha do seu login para concluir.
                        </p>
                        <Label className="text-xs">Senha do seu login</Label>
                        <Input
                          type="password"
                          autoFocus
                          value={limparSenha}
                          onChange={(e) => setLimparSenha(e.target.value)}
                          placeholder="••••••••"
                          onKeyDown={(e) => { if (e.key === "Enter" && limparSenha.trim() && !limparMut.isPending) executarLimpeza(); }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={fecharLimpar}>Cancelar</Button>
                  {!bloqueado && (
                    limparEtapa === 1 ? (
                      <Button
                        onClick={() => setLimparEtapa(2)}
                        disabled={total == null || total === 0}
                        className="bg-red-600 hover:bg-red-700 gap-2"
                      >
                        <Trash2 className="h-4 w-4" /> Continuar
                      </Button>
                    ) : (
                      <Button
                        onClick={executarLimpeza}
                        disabled={!limparSenha.trim() || limparMut.isPending}
                        className="bg-red-600 hover:bg-red-700 gap-2"
                      >
                        {limparMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Limpar definitivamente
                      </Button>
                    )
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
