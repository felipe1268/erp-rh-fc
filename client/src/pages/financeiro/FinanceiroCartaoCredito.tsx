import { useEffect, useMemo, useRef, useState } from "react";
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
import { BandeiraLogo, ChipCartao, bandeiraGradiente } from "@/components/BandeiraCartao";
import {
  CreditCard, Upload, Loader2, CheckCircle, AlertTriangle, Trash2, Pencil,
  ChevronLeft, ChevronRight, PlusCircle, ListTree, FileText, Building2, ShieldAlert,
  Search, Layers,
} from "lucide-react";

function formatBRL(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
// Máscara de moeda BRL (digita centavos → "1.234,56"; ponto p/ milhar, vírgula p/ centavos).
function maskBRL(raw: string): string {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  const n = parseInt(digits, 10) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMaskBRL(masked: string): number {
  const digits = String(masked).replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}
function fmtData(v: any) {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v.length > 10 ? v : v + "T00:00:00") : new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
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
const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ANO_ATUAL = new Date().getFullYear();

function tipoBadge(t: string) {
  switch (t) {
    case "compra": return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Compra</Badge>;
    case "encargo": return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Encargo</Badge>;
    case "credito": return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Crédito</Badge>;
    default: return <Badge variant="outline">{t || "—"}</Badge>;
  }
}

const CARTAO_FORM_INICIAL = {
  banco: "", bandeira: "", final4: "", titular: "", tipoPessoa: "PJ", status: "ativo",
  diaFechamento: "", diaVencimento: "", limite: "", observacao: "",
};

const STATUS_CARTAO_OPCOES = [
  { value: "ativo", label: "Ativo" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "renegociado", label: "Renegociado" },
  { value: "cancelado", label: "Cancelado" },
  { value: "inativo", label: "Inativo" },
] as const;

function statusCartaoBadge(status?: string) {
  const s = (status || "ativo").toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    ativo: { label: "Ativo", cls: "bg-green-100 text-green-700 hover:bg-green-100" },
    bloqueado: { label: "Bloqueado", cls: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
    renegociado: { label: "Renegociado", cls: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
    cancelado: { label: "Cancelado", cls: "bg-red-100 text-red-700 hover:bg-red-100" },
    inativo: { label: "Inativo", cls: "bg-gray-200 text-gray-600 hover:bg-gray-200" },
  };
  const it = map[s] || map.ativo;
  return <Badge className={it.cls}>{it.label}</Badge>;
}

export default function FinanceiroCartaoCredito() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const [aba, setAba] = useState<"cartoes" | "faturas">("cartoes");

  // ── Cartões ──────────────────────────────────────────────────────────
  const cartoesQ = (trpc as any).cartao.listarCartoes.useQuery(
    { companyId: companyId!, incluirInativos: true },
    { enabled: !!companyId },
  );
  const cartoes = (cartoesQ.data ?? []) as any[];
  const cartoesAtivos = useMemo(() => cartoes.filter((c) => c.ativo === 1 || c.ativo === true), [cartoes]);

  const [cartaoModal, setCartaoModal] = useState(false);
  const [cartaoEdit, setCartaoEdit] = useState<any | null>(null);
  const [cartaoForm, setCartaoForm] = useState({ ...CARTAO_FORM_INICIAL });
  const [cartaoExcluir, setCartaoExcluir] = useState<any | null>(null);

  const criarCartao = (trpc as any).cartao.criarCartao.useMutation();
  const atualizarCartao = (trpc as any).cartao.atualizarCartao.useMutation();
  const excluirCartao = (trpc as any).cartao.excluirCartao.useMutation();

  function abrirNovoCartao() {
    setCartaoEdit(null);
    setCartaoForm({ ...CARTAO_FORM_INICIAL });
    setCartaoModal(true);
  }
  function abrirEditarCartao(c: any) {
    setCartaoEdit(c);
    setCartaoForm({
      banco: c.banco ?? "", bandeira: c.bandeira ?? "", final4: c.final4 ?? "",
      titular: c.titular ?? "", tipoPessoa: c.tipoPessoa ?? "PJ", status: c.status ?? "ativo",
      diaFechamento: c.diaFechamento != null ? String(c.diaFechamento) : "",
      diaVencimento: c.diaVencimento != null ? String(c.diaVencimento) : "",
      limite: c.limite != null ? maskBRL(String(Math.round(Number(c.limite) * 100))) : "",
      observacao: c.observacao ?? "",
    });
    setCartaoModal(true);
  }
  async function salvarCartao() {
    if (!companyId) return;
    const base = {
      companyId,
      banco: cartaoForm.banco.trim() || undefined,
      bandeira: cartaoForm.bandeira.trim() || undefined,
      final4: cartaoForm.final4.trim() || undefined,
      titular: cartaoForm.titular.trim() || undefined,
      tipoPessoa: cartaoForm.tipoPessoa as "PF" | "PJ",
      status: cartaoForm.status as "ativo" | "bloqueado" | "renegociado" | "cancelado" | "inativo",
      diaFechamento: cartaoForm.diaFechamento ? parseInt(cartaoForm.diaFechamento, 10) : null,
      diaVencimento: cartaoForm.diaVencimento ? parseInt(cartaoForm.diaVencimento, 10) : null,
      limite: cartaoForm.limite.trim() === "" ? null : parseMaskBRL(cartaoForm.limite),
      observacao: cartaoForm.observacao.trim() || undefined,
    };
    try {
      if (cartaoEdit) await atualizarCartao.mutateAsync({ id: cartaoEdit.id, ...base });
      else await criarCartao.mutateAsync(base);
      toast({ title: cartaoEdit ? "Cartão atualizado" : "Cartão cadastrado" });
      setCartaoModal(false);
      cartoesQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message || String(e), variant: "destructive" });
    }
  }
  async function confirmarExcluirCartao() {
    if (!companyId || !cartaoExcluir) return;
    try {
      await excluirCartao.mutateAsync({ id: cartaoExcluir.id, companyId });
      toast({ title: "Cartão excluído" });
      setCartaoExcluir(null);
      cartoesQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Faturas (régua ano/mês) ──────────────────────────────────────────
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [cartaoFiltro, setCartaoFiltro] = useState<number | null>(null);

  const resumoMensalQ = (trpc as any).cartao.resumoMensal.useQuery(
    { companyId: companyId!, ano, cartaoId: cartaoFiltro ?? undefined },
    { enabled: !!companyId && aba === "faturas" },
  );
  const resumoMensal = (resumoMensalQ.data ?? []) as any[];

  const faturasQ = (trpc as any).cartao.listarFaturas.useQuery(
    { companyId: companyId!, ano, mes: mesSel ?? undefined, cartaoId: cartaoFiltro ?? undefined },
    { enabled: !!companyId && aba === "faturas" },
  );
  const faturas = (faturasQ.data ?? []) as any[];
  const totalFaturasMes = useMemo(() => faturas.reduce((a, f) => a + (f.total ?? 0), 0), [faturas]);

  const excluirFatura = (trpc as any).cartao.excluirFatura.useMutation();
  const [faturaExcluir, setFaturaExcluir] = useState<any | null>(null);
  async function confirmarExcluirFatura() {
    if (!companyId || !faturaExcluir) return;
    try {
      await excluirFatura.mutateAsync({ id: faturaExcluir.id, companyId });
      toast({ title: "Fatura excluída" });
      setFaturaExcluir(null);
      faturasQ.refetch(); resumoMensalQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao excluir fatura", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Vincular fatura ⇄ cartão (botão "Vincular" da aba Faturas) ──────────
  const vincularFatura = (trpc as any).cartao.vincularFaturaCartao.useMutation();
  const [faturaVincular, setFaturaVincular] = useState<any | null>(null);
  const [vincularCartaoId, setVincularCartaoId] = useState<string>("none");
  function abrirVincular(f: any) {
    setFaturaVincular(f);
    setVincularCartaoId(f.cartaoId != null ? String(f.cartaoId) : "none");
  }
  async function salvarVincular() {
    if (!companyId || !faturaVincular) return;
    try {
      await vincularFatura.mutateAsync({
        id: faturaVincular.id,
        companyId,
        cartaoId: vincularCartaoId === "none" ? null : parseInt(vincularCartaoId, 10),
      });
      toast({ title: "Fatura vinculada ao cartão" });
      setFaturaVincular(null);
      faturasQ.refetch(); resumoMensalQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao vincular", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Importação por IA ────────────────────────────────────────────────
  const [importModal, setImportModal] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  // Rev. 3267 — barra de progresso 0→100% durante a leitura por IA. Como a leitura é UMA
  // chamada só (sem stream), o progresso é ESTIMADO: sobe assintoticamente até 95% enquanto
  // espera e crava 100% ao concluir.
  const [importPct, setImportPct] = useState(0);
  const [importLabel, setImportLabel] = useState("");
  const progTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const importarPreview = (trpc as any).cartao.importarPreview.useMutation();
  const importarConfirmar = (trpc as any).cartao.importarConfirmar.useMutation();

  function pararProgresso() {
    if (progTimer.current) { clearInterval(progTimer.current); progTimer.current = null; }
  }
  function iniciarProgresso(label: string) {
    pararProgresso();
    setImportPct(3);
    setImportLabel(label);
    progTimer.current = setInterval(() => {
      setImportPct((p) => {
        if (p >= 95) return 95;
        const inc = p < 50 ? 4 : p < 80 ? 2 : 1; // desacelera conforme sobe
        return Math.min(95, p + inc);
      });
    }, 350);
  }

  // Rev. 3267 — garante que o timer de progresso seja sempre limpo no unmount
  // (evita setInterval órfão atualizando estado após o componente sair de tela).
  useEffect(() => () => pararProgresso(), []);

  function abrirImport() {
    pararProgresso(); setImportPct(0); setImportLabel("");
    setPreview(null); setArquivoNome(""); setImportModal(true);
  }
  async function onArquivoSelecionado(file: File | undefined) {
    if (!file || !companyId) return;
    setImportBusy(true); setPreview(null); setArquivoNome(file.name);
    iniciarProgresso(`Lendo "${file.name}" com a IA…`);
    try {
      const b64 = await fileToBase64(file);
      const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      const res = await importarPreview.mutateAsync({ companyId, fileBase64: b64, mimeType: mime });
      pararProgresso(); setImportPct(100); setImportLabel("Leitura concluída");
      setPreview(res);
    } catch (e: any) {
      pararProgresso(); setImportPct(0); setImportLabel("");
      toast({ title: "Falha ao ler a fatura", description: e?.message || String(e), variant: "destructive" });
    } finally {
      pararProgresso();
      setImportBusy(false);
    }
  }
  async function confirmarImport() {
    if (!companyId || !preview?.faturas?.length) return;
    setImportBusy(true);
    try {
      const payload = preview.faturas.map((f: any) => ({
        cartaoId: f.cartaoIdSugerido ?? null,
        cartaoFinal4: f.cartaoFinal4 ?? null,
        cartaoTitular: f.cartaoTitular ?? null,
        banco: f.banco ?? null, bandeira: f.bandeira ?? null,
        vencimento: f.vencimento ?? null, fechamento: f.fechamento ?? null,
        total: f.total ?? null, totalCompras: f.totalCompras ?? null,
        faturaAnterior: f.faturaAnterior ?? null, pagamentos: f.pagamentos ?? null,
        mesRef: f.mesRef ?? null, anoRef: f.anoRef ?? null,
        itens: (f.itens ?? []).map((it: any) => ({
          data: it.data ?? null, descricao: it.descricao ?? null, cidade: it.cidade ?? null,
          valor: it.valor ?? null, moeda: it.moeda ?? null, cotacao: it.cotacao ?? null,
          valorOrigem: it.valorOrigem ?? null, parcelaAtual: it.parcelaAtual ?? null,
          parcelaTotal: it.parcelaTotal ?? null, tipo: it.tipo ?? null,
          centroCustoSugeridoId: it.centroCustoSugeridoId ?? null,
          centroCustoSugeridoNome: it.centroCustoSugeridoNome ?? null,
        })),
      }));
      const res = await importarConfirmar.mutateAsync({ companyId, origemArquivo: arquivoNome, faturas: payload });
      toast({
        title: "Importação concluída",
        description: `${res.faturasInseridas} fatura(s) · ${res.itensInseridos} item(ns)${res.faturasPuladas ? ` · ${res.faturasPuladas} já existia(m)` : ""}`,
      });
      setImportModal(false); setPreview(null);
      faturasQ.refetch(); resumoMensalQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao gravar", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setImportBusy(false);
    }
  }

  // ── Itens da fatura (classificação) ──────────────────────────────────
  const [faturaItens, setFaturaItens] = useState<any | null>(null);
  const itensQ = (trpc as any).cartao.listarItens.useQuery(
    { companyId: companyId!, faturaId: faturaItens?.id },
    { enabled: !!companyId && !!faturaItens?.id },
  );
  const itens = (itensQ.data ?? []) as any[];
  const classificarItem = (trpc as any).cartao.classificarItem.useMutation();

  const accountsQ = (trpc as any).financial.getAccounts.useQuery({ companyId: companyId! }, { enabled: !!companyId });
  const costCentersQ = (trpc as any).financial.getCostCenters.useQuery({ companyId: companyId! }, { enabled: !!companyId });
  const obrasQ = (trpc as any).obras.listActive.useQuery({ companyId: companyId! }, { enabled: !!companyId });
  const categorias = (accountsQ.data ?? []) as any[];
  const costCenters = (costCentersQ.data ?? []) as any[];
  const obras = (obrasQ.data ?? []) as any[];

  async function aplicarClassificacao(item: any, patch: any) {
    if (!companyId) return;
    try {
      await classificarItem.mutateAsync({ id: item.id, companyId, ...patch });
      itensQ.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao classificar", description: e?.message || String(e), variant: "destructive" });
    }
  }

  // ── Filtros, resumo e classificação em massa dos itens da fatura ─────
  const [itemBusca, setItemBusca] = useState("");
  const [itemStatus, setItemStatus] = useState<"todos" | "pendente" | "sugerido" | "confirmado" | "ignorado">("todos");
  const [bulkObra, setBulkObra] = useState("keep");
  const [bulkCC, setBulkCC] = useState("keep");
  const [bulkCat, setBulkCat] = useState("keep");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  function resetFaturaFiltros() {
    setItemBusca(""); setItemStatus("todos");
    setBulkObra("keep"); setBulkCC("keep"); setBulkCat("keep");
    setBulkOpen(false);
  }

  const itensFiltrados = useMemo(() => {
    const q = itemBusca.trim().toLowerCase();
    return itens.filter((it) => {
      if (q && !(`${it.descricao || ""} ${it.cidade || ""}`.toLowerCase().includes(q))) return false;
      if (itemStatus === "pendente") return it.obraId == null;
      if (itemStatus !== "todos") return (it.statusClassificacao || "sugerido") === itemStatus;
      return true;
    });
  }, [itens, itemBusca, itemStatus]);

  const resumoItens = useMemo(() => {
    let classificados = 0, confirmados = 0, pendentes = 0, valorConf = 0, valorPend = 0;
    for (const it of itens) {
      const v = Number(it.valor) || 0;
      if (it.obraId != null) classificados++; else { pendentes++; valorPend += v; }
      if ((it.statusClassificacao || "") === "confirmado") { confirmados++; valorConf += v; }
    }
    const pct = itens.length ? Math.round((classificados / itens.length) * 100) : 0;
    return { total: itens.length, classificados, confirmados, pendentes, valorConf, valorPend, pct };
  }, [itens]);

  async function aplicarBulk() {
    if (!companyId) return;
    const alvos = itensFiltrados;
    if (alvos.length === 0) { setBulkOpen(false); return; }
    const o = obras.find((x) => String(x.id) === bulkObra);
    const cc = costCenters.find((x) => String(x.id) === bulkCC);
    const cat = categorias.find((x) => String(x.id) === bulkCat);
    const patch: any = {};
    if (bulkObra !== "keep") { patch.obraId = bulkObra === "none" ? null : parseInt(bulkObra, 10); patch.obraNome = bulkObra === "none" ? null : (o ? (o.nome ?? o.name ?? null) : null); }
    if (bulkCC !== "keep") { patch.centroCustoId = bulkCC === "none" ? null : parseInt(bulkCC, 10); patch.centroCustoNome = bulkCC === "none" ? null : (cc ? cc.nome : null); }
    if (bulkCat !== "keep") { patch.categoriaId = bulkCat === "none" ? null : parseInt(bulkCat, 10); patch.categoriaNome = bulkCat === "none" ? null : (cat ? cat.nome : null); }
    if (Object.keys(patch).length === 0) { setBulkOpen(false); return; }
    setBulkBusy(true);
    try {
      for (const it of alvos) {
        await classificarItem.mutateAsync({ id: it.id, companyId, ...patch });
      }
      await itensQ.refetch();
      toast({ title: "Classificação aplicada", description: `${alvos.length} item(ns) atualizados.` });
      setBulkOpen(false);
      setBulkObra("keep"); setBulkCC("keep"); setBulkCat("keep");
    } catch (e: any) {
      toast({ title: "Erro ao aplicar em massa", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-blue-700" /> Controle de Cartão de Crédito
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Cadastro de cartões, importação de faturas (PDF lido por IA) e classificação de gastos por obra/centro de custo. O cartão NÃO vira lançamento — é controle.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant={aba === "cartoes" ? "default" : "outline"} size="sm" onClick={() => setAba("cartoes")}>
              <CreditCard className="w-4 h-4 mr-1" /> Cartões
            </Button>
            <Button variant={aba === "faturas" ? "default" : "outline"} size="sm" onClick={() => setAba("faturas")}>
              <FileText className="w-4 h-4 mr-1" /> Faturas
            </Button>
          </div>
        </div>

        {/* ───────────── ABA CARTÕES ───────────── */}
        {aba === "cartoes" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Cartões cadastrados ({cartoesAtivos.length})</CardTitle>
              <Button size="sm" onClick={abrirNovoCartao}><PlusCircle className="w-4 h-4 mr-1" /> Novo cartão</Button>
            </CardHeader>
            <CardContent>
              {cartoesQ.isLoading ? (
                <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
              ) : cartoes.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">Nenhum cartão cadastrado. Clique em "Novo cartão".</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cartoes.map((c) => {
                    const ativo = c.ativo === 1 || c.ativo === true;
                    return (
                      <div
                        key={c.id}
                        className={`group rounded-xl border overflow-hidden bg-white shadow-sm transition hover:shadow-md ${c.alertaPessoal ? "border-amber-300" : "border-gray-200"} ${ativo ? "" : "opacity-60"}`}
                      >
                        {/* Faixa superior — estilo cartão físico */}
                        <div className={`relative px-4 pt-3 pb-4 text-white ${bandeiraGradiente(c.bandeira)}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-sm truncate text-white drop-shadow-sm">{c.banco || "Banco —"}</p>
                            <div className="shrink-0 flex items-center min-h-[24px]">
                              <BandeiraLogo bandeira={c.bandeira} />
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-2">
                            <ChipCartao />
                            <span className="font-mono tracking-[0.18em] text-sm text-white/95">
                              ••••&nbsp;••••&nbsp;••••&nbsp;{c.final4 || "????"}
                            </span>
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[9px] uppercase tracking-wider text-white/60">Titular</p>
                              <p className="text-xs font-medium truncate text-white/95">{c.titular || "sem titular"}</p>
                            </div>
                            <Badge
                              variant={c.tipoPessoa === "PF" ? "outline" : "secondary"}
                              className={c.tipoPessoa === "PF" ? "border-white/60 text-white bg-white/10" : "bg-white/20 text-white border-transparent hover:bg-white/20"}
                            >
                              {c.tipoPessoa}
                            </Badge>
                          </div>
                        </div>

                        {/* Corpo branco — dados + ações */}
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            {statusCartaoBadge(c.status)}
                            <span className="text-xs text-muted-foreground">
                              Limite: <b className="text-foreground">{c.limite != null ? formatBRL(c.limite) : "—"}</b>
                            </span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                            <span>Fecha dia: <b className="text-foreground">{c.diaFechamento ?? "—"}</b></span>
                            <span>Vence dia: <b className="text-foreground">{c.diaVencimento ?? "—"}</b></span>
                          </div>
                          {c.alertaPessoal && (
                            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-100/60 rounded p-1.5">
                              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>Cartão <b>pessoal (PF)</b> usado pela empresa. Avalie regularização (cartão PJ ou reembolso ao titular).</span>
                            </div>
                          )}
                          <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                            <Button size="sm" variant="ghost" onClick={() => abrirEditarCartao(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setCartaoExcluir(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ───────────── ABA FATURAS ───────────── */}
        {aba === "faturas" && (
          <>
            {/* Navegação Ano + Meses (padrão Contas a Pagar) */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setAno((a) => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                    <button onClick={() => setAno((a) => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <Button size="sm" variant={mesSel == null ? "default" : "outline"} className="ml-2 h-7" onClick={() => setMesSel(null)}>Ano todo</Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Com fatura</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem fatura</span>
                  </div>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {MESES.slice(1).map((m, i) => {
                    const num = i + 1;
                    const r = resumoMensal.find((x) => x.mes === num);
                    const temFatura = !!r && r.qtd > 0;
                    const isSelected = mesSel === num;
                    return (
                      <button
                        key={num}
                        onClick={() => setMesSel(num)}
                        className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                          ${isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        <span>{m}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${temFatura ? "bg-green-500" : "bg-gray-300"}`} />
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <div className="text-sm text-muted-foreground">
                    {faturas.length} fatura(s) {mesSel != null ? `em ${MESES[mesSel]}/${ano}` : `em ${ano}`} · total <b className="text-foreground">{formatBRL(totalFaturasMes)}</b>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Select value={cartaoFiltro != null ? String(cartaoFiltro) : "all"} onValueChange={(v) => setCartaoFiltro(v === "all" ? null : parseInt(v, 10))}>
                      <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="Todos os cartões" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os cartões</SelectItem>
                        {cartoesAtivos.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.banco || "Banco"} · final {c.final4 || "????"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={abrirImport}><Upload className="w-4 h-4 mr-1" /> Importar fatura</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                {faturasQ.isLoading ? (
                  <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
                ) : faturas.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">Nenhuma fatura no período. Importe um PDF de fatura.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground border-b">
                          <th className="py-2 pr-3">Cartão</th>
                          <th className="py-2 pr-3">Vencimento</th>
                          <th className="py-2 pr-3">Fechamento</th>
                          <th className="py-2 pr-3 text-right">Total</th>
                          <th className="py-2 pr-3 text-center">Itens</th>
                          <th className="py-2 pr-3">Ref.</th>
                          <th className="py-2 pr-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faturas.map((f) => (
                          <tr key={f.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 pr-3">
                              {f.cartaoId ? (
                                <span>{f.cartaoBanco || "Banco"} · final {f.cartaoFinal4 || "????"}
                                  {f.cartaoTipoPessoa === "PF" && <Badge variant="outline" className="ml-1 border-amber-400 text-amber-700 text-[10px]">PF</Badge>}
                                </span>
                              ) : (
                                <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Não identificado</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">{fmtData(f.vencimento)}</td>
                            <td className="py-2 pr-3">{fmtData(f.fechamento)}</td>
                            <td className="py-2 pr-3 text-right font-medium">{formatBRL(f.total)}</td>
                            <td className="py-2 pr-3 text-center">{f.qtdItens}</td>
                            <td className="py-2 pr-3">{f.mes ? `${MESES[f.mes]}/${f.ano}` : (f.ano ?? "—")}</td>
                            <td className="py-2 pr-3 text-right">
                              <Button size="sm" variant="outline" className="h-7" onClick={() => abrirVincular(f)}><Pencil className="w-3.5 h-3.5 mr-1" /> Vincular</Button>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => setFaturaItens(f)}><ListTree className="w-3.5 h-3.5 mr-1" /> Classificar</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => setFaturaExcluir(f)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ───────────── MODAL CARTÃO (criar/editar) ───────────── */}
      <Dialog open={cartaoModal} onOpenChange={setCartaoModal}>
        <DialogContent resizable={false} className="max-w-xl p-0 overflow-hidden gap-0">
          <DialogHeader className="border-b bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">{cartaoEdit ? "Editar cartão" : "Novo cartão"}</DialogTitle>
                <DialogDescription className="text-xs text-white/70">Cartões pessoais (PF) usados pela empresa geram alerta de regularização.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Identificação</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Banco</Label><Input value={cartaoForm.banco} onChange={(e) => setCartaoForm((f) => ({ ...f, banco: e.target.value }))} placeholder="Ex: Santander" /></div>
                <div className="space-y-1"><Label className="text-xs">Bandeira</Label><Input value={cartaoForm.bandeira} onChange={(e) => setCartaoForm((f) => ({ ...f, bandeira: e.target.value }))} placeholder="Ex: Mastercard" /></div>
                <div className="space-y-1"><Label className="text-xs">Final (4 dígitos)</Label><Input className="tabular-nums" value={cartaoForm.final4} maxLength={4} inputMode="numeric" onChange={(e) => setCartaoForm((f) => ({ ...f, final4: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="1234" /></div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={cartaoForm.tipoPessoa} onValueChange={(v) => setCartaoForm((f) => ({ ...f, tipoPessoa: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PJ">PJ (empresa)</SelectItem>
                      <SelectItem value="PF">PF (pessoal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={cartaoForm.status} onValueChange={(v) => setCartaoForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_CARTAO_OPCOES.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1"><Label className="text-xs">Titular</Label><Input value={cartaoForm.titular} onChange={(e) => setCartaoForm((f) => ({ ...f, titular: e.target.value }))} placeholder="Nome impresso no cartão" /></div>
              </div>
            </section>

            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Datas & limite</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Dia fechamento</Label><Input className="tabular-nums" type="number" min={1} max={31} value={cartaoForm.diaFechamento} onChange={(e) => setCartaoForm((f) => ({ ...f, diaFechamento: e.target.value }))} placeholder="Ex: 5" /></div>
                <div className="space-y-1"><Label className="text-xs">Dia vencimento</Label><Input className="tabular-nums" type="number" min={1} max={31} value={cartaoForm.diaVencimento} onChange={(e) => setCartaoForm((f) => ({ ...f, diaVencimento: e.target.value }))} placeholder="Ex: 12" /></div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Limite</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">R$</span>
                    <Input className="pl-9 tabular-nums" inputMode="decimal" value={cartaoForm.limite} onChange={(e) => setCartaoForm((f) => ({ ...f, limite: maskBRL(e.target.value) }))} placeholder="10.000,00" />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-1">
              <Label className="text-xs">Observação</Label>
              <Textarea rows={2} value={cartaoForm.observacao} onChange={(e) => setCartaoForm((f) => ({ ...f, observacao: e.target.value }))} placeholder="Anotações internas (opcional)" />
            </section>

            {cartaoForm.tipoPessoa === "PF" && (
              <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Este é um cartão <b>pessoal</b>. Ele NÃO será convertido em cartão FC automaticamente — o sistema apenas sinaliza para regularização.</span>
              </div>
            )}
          </div>

          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button variant="outline" onClick={() => setCartaoModal(false)}>Cancelar</Button>
            <Button onClick={salvarCartao} disabled={criarCartao.isLoading || atualizarCartao.isLoading}>
              {(criarCartao.isLoading || atualizarCartao.isLoading) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────── MODAL IMPORTAR FATURA ───────────── */}
      <Dialog open={importModal} onOpenChange={(v) => { if (!importBusy) setImportModal(v); }}>
        <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Importar fatura (PDF)</DialogTitle>
            <DialogDescription>A IA lê o PDF e extrai cabeçalho + itens. Nada é gravado até você confirmar.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto space-y-4">
            {!preview && (
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg py-16 cursor-pointer hover:bg-gray-50 ${importBusy ? "opacity-100 pointer-events-none" : ""}`}>
                {importBusy ? (
                  <div className="w-full max-w-md flex flex-col items-center gap-3 px-6">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    <span className="text-sm text-muted-foreground text-center">{importLabel || `Lendo "${arquivoNome}" com a IA…`}</span>
                    <div className="w-full flex items-center gap-3">
                      <Progress value={importPct} className="h-2 flex-1" />
                      <span className="text-sm font-semibold tabular-nums text-blue-700 w-12 text-right">{Math.round(importPct)}%</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-400" />
                    <span className="text-sm text-muted-foreground">Clique para selecionar o PDF da fatura</span>
                  </>
                )}
                <input type="file" accept="application/pdf,image/*" className="hidden" disabled={importBusy} onChange={(e) => onArquivoSelecionado(e.target.files?.[0])} />
              </label>
            )}
            {preview && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm bg-blue-50 border border-blue-200 rounded p-3">
                  <span><b>{preview.resumo.totalFaturas}</b> fatura(s)</span>
                  <span><b>{preview.resumo.totalItens}</b> item(ns)</span>
                  {preview.resumo.naoIdentificadas > 0 && <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {preview.resumo.naoIdentificadas} cartão(ões) não identificado(s)</span>}
                  {preview.resumo.ccAdministrativo && <span className="text-muted-foreground">Encargos → CC "{preview.resumo.ccAdministrativo}"</span>}
                </div>
                {preview.faturas.map((f: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="font-semibold flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        {f.banco || "Banco"} · final {f.cartaoFinal4 || "????"}
                        {f.cartaoIdentificado ? (
                          <Badge className="bg-green-100 text-green-700">Cartão identificado</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-400 text-amber-700">Não cadastrado</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">Venc. {fmtData(f.vencimento)} · Total <b className="text-foreground">{formatBRL(f.total)}</b></div>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mb-2">
                      <span>{f.qtdCompras} compras</span><span>{f.qtdEncargos} encargos</span><span>{f.qtdCreditos} créditos</span>
                      <span>Soma compras: {formatBRL(f.somaCompras)}</span>
                    </div>
                    <div className="max-h-[28vh] overflow-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-left text-muted-foreground">
                            <th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2">Tipo</th><th className="p-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(f.itens ?? []).map((it: any, j: number) => (
                            <tr key={j} className="border-t">
                              <td className="p-2">{fmtData(it.data)}</td>
                              <td className="p-2">{it.descricao || "—"}{it.parcelaTotal ? <span className="text-muted-foreground"> ({it.parcelaAtual}/{it.parcelaTotal})</span> : ""}</td>
                              <td className="p-2">{tipoBadge(it.tipo)}</td>
                              <td className="p-2 text-right">{formatBRL(it.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModal(false)} disabled={importBusy}>Cancelar</Button>
            {preview && (
              <Button onClick={confirmarImport} disabled={importBusy}>
                {importBusy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                <CheckCircle className="w-4 h-4 mr-1" /> Gravar {preview.resumo.totalFaturas} fatura(s)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────── MODAL CLASSIFICAR ITENS ───────────── */}
      <Dialog open={!!faturaItens} onOpenChange={(v) => { if (!v) { setFaturaItens(null); resetFaturaFiltros(); } }}>
        <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Cabeçalho — faixa azul institucional */}
          <div className="bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-4 text-white shrink-0">
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-white text-lg">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white/15"><ListTree className="w-5 h-5" /></span>
                Classificar itens da fatura
              </DialogTitle>
              <DialogDescription className="text-white/70">
                Vincule cada compra a uma obra, centro de custo e categoria. Use a classificação em massa para acelerar.
              </DialogDescription>
            </DialogHeader>
            {faturaItens && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-full bg-white/10">{faturaItens.cartaoBanco || "Cartão"} · final {faturaItens.cartaoFinal4 || "????"}</span>
                <span className="px-2.5 py-1 rounded-full bg-white/10">Venc. {fmtData(faturaItens.vencimento)}</span>
                <span className="px-2.5 py-1 rounded-full bg-white/20 font-semibold">Total {formatBRL(faturaItens.total)}</span>
              </div>
            )}
          </div>

          {/* Barra de progresso + filtros + ação em massa */}
          {!itensQ.isLoading && itens.length > 0 && (
            <div className="px-6 py-3 border-b bg-muted/30 shrink-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{resumoItens.classificados}/{resumoItens.total}</span>
                  <span className="text-muted-foreground">com obra</span>
                </div>
                <div className="flex-1 min-w-[120px] max-w-[260px] h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${resumoItens.pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{resumoItens.pct}%</span>
                <div className="ml-auto flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">Confirmado: {formatBRL(resumoItens.valorConf)}</span>
                  <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">Sem obra: {formatBRL(resumoItens.valorPend)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input value={itemBusca} onChange={(e) => setItemBusca(e.target.value)} placeholder="Buscar descrição ou cidade…" className="h-8 pl-8 w-[230px]" />
                </div>
                <Select value={itemStatus} onValueChange={(v) => setItemStatus(v as any)}>
                  <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Sem obra</SelectItem>
                    <SelectItem value="sugerido">Sugerido</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="ignorado">Ignorado</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground tabular-nums">{itensFiltrados.length} de {itens.length}</span>
                <Button size="sm" variant="outline" className="h-8 ml-auto" disabled={itensFiltrados.length === 0} onClick={() => setBulkOpen(true)}>
                  <Layers className="w-4 h-4 mr-1" /> Classificar em massa
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {itensQ.isLoading ? (
              <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
            ) : itens.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Esta fatura não tem itens.</div>
            ) : itensFiltrados.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Nenhum item corresponde ao filtro.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                  <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wide">
                    <th className="p-2.5">Data</th><th className="p-2.5">Descrição</th><th className="p-2.5">Tipo</th>
                    <th className="p-2.5 text-right">Valor</th><th className="p-2.5">Obra</th><th className="p-2.5">Centro de custo</th>
                    <th className="p-2.5">Categoria</th><th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {itensFiltrados.map((it) => {
                    const stt = it.statusClassificacao || "sugerido";
                    const sttCls = stt === "confirmado"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : stt === "ignorado"
                      ? "border-gray-300 bg-gray-50 text-gray-500"
                      : "border-amber-300 bg-amber-50 text-amber-700";
                    const semObra = it.obraId == null;
                    return (
                    <tr key={it.id} className={`border-t align-top hover:bg-blue-50/40 ${semObra ? "bg-amber-50/20" : ""}`}>
                      <td className="p-2.5 whitespace-nowrap">{fmtData(it.data)}</td>
                      <td className="p-2.5 min-w-[160px]"><span className="font-medium text-gray-800">{it.descricao || "—"}</span>{it.parcelaTotal ? <span className="text-muted-foreground"> ({it.parcelaAtual}/{it.parcelaTotal})</span> : ""}{it.cidade ? <div className="text-[10px] text-muted-foreground">{it.cidade}</div> : null}</td>
                      <td className="p-2.5">{tipoBadge(it.tipo)}</td>
                      <td className="p-2.5 text-right whitespace-nowrap tabular-nums font-medium">{formatBRL(it.valor)}</td>
                      <td className="p-2.5">
                        <Select value={it.obraId != null ? String(it.obraId) : "none"} onValueChange={(v) => {
                          const o = obras.find((x) => String(x.id) === v);
                          aplicarClassificacao(it, { obraId: v === "none" ? null : parseInt(v, 10), obraNome: o ? (o.nome ?? o.name ?? null) : null });
                        }}>
                          <SelectTrigger className={`h-7 w-[150px] ${semObra ? "border-amber-300 text-amber-700" : ""}`}><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— (sem obra)</SelectItem>
                            {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome ?? o.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2.5">
                        <Select value={it.centroCustoId != null ? String(it.centroCustoId) : "none"} onValueChange={(v) => {
                          const cc = costCenters.find((x) => String(x.id) === v);
                          aplicarClassificacao(it, { centroCustoId: v === "none" ? null : parseInt(v, 10), centroCustoNome: cc ? cc.nome : null });
                        }}>
                          <SelectTrigger className="h-7 w-[150px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {costCenters.map((cc) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2.5">
                        <Select value={it.categoriaId != null ? String(it.categoriaId) : "none"} onValueChange={(v) => {
                          const cat = categorias.find((x) => String(x.id) === v);
                          aplicarClassificacao(it, { categoriaId: v === "none" ? null : parseInt(v, 10), categoriaNome: cat ? cat.nome : null });
                        }}>
                          <SelectTrigger className="h-7 w-[150px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {categorias.map((cat) => <SelectItem key={cat.id} value={String(cat.id)}>{cat.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2.5">
                        <Select value={stt} onValueChange={(v) => aplicarClassificacao(it, { statusClassificacao: v })}>
                          <SelectTrigger className={`h-7 w-[120px] ${sttCls}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sugerido">Sugerido</SelectItem>
                            <SelectItem value="confirmado">Confirmado</SelectItem>
                            <SelectItem value="ignorado">Ignorado</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 shrink-0">
            <Button variant="outline" onClick={() => { setFaturaItens(null); resetFaturaFiltros(); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────── MODAL CLASSIFICAR EM MASSA ───────────── */}
      <AlertDialog open={bulkOpen} onOpenChange={(v) => { if (!bulkBusy) setBulkOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><Layers className="w-5 h-5 text-blue-700" /> Classificar {itensFiltrados.length} item(ns)</AlertDialogTitle>
            <AlertDialogDescription>
              Aplica a definição abaixo a TODOS os itens atualmente filtrados. Deixe "Manter atual" nos campos que não quiser alterar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Obra</Label>
              <Select value={bulkObra} onValueChange={setBulkObra}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter atual</SelectItem>
                  <SelectItem value="none">— (sem obra)</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome ?? o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Centro de custo</Label>
              <Select value={bulkCC} onValueChange={setBulkCC}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter atual</SelectItem>
                  <SelectItem value="none">— (nenhum)</SelectItem>
                  {costCenters.map((cc) => <SelectItem key={cc.id} value={String(cc.id)}>{cc.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={bulkCat} onValueChange={setBulkCat}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter atual</SelectItem>
                  <SelectItem value="none">— (nenhuma)</SelectItem>
                  {categorias.map((cat) => <SelectItem key={cat.id} value={String(cat.id)}>{cat.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancelar</AlertDialogCancel>
            <Button onClick={aplicarBulk} disabled={bulkBusy || (bulkObra === "keep" && bulkCC === "keep" && bulkCat === "keep")}>
              {bulkBusy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Aplicando…</> : <>Aplicar a {itensFiltrados.length}</>}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ───────────── ALERTS EXCLUIR ───────────── */}
      <AlertDialog open={!!cartaoExcluir} onOpenChange={(v) => { if (!v) setCartaoExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão?</AlertDialogTitle>
            <AlertDialogDescription>O cartão "{cartaoExcluir?.banco} · final {cartaoExcluir?.final4}" será removido (as faturas já importadas permanecem).</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExcluirCartao} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ───────────── MODAL VINCULAR FATURA ⇄ CARTÃO ───────────── */}
      <Dialog open={!!faturaVincular} onOpenChange={(v) => { if (!v) setFaturaVincular(null); }}>
        <DialogContent resizable={false} className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="border-b bg-gradient-to-r from-[#1B2A4A] to-[#2c3f63] px-6 py-5 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">Vincular fatura ao cartão</DialogTitle>
                <DialogDescription className="text-xs text-white/70">O vínculo é permanente e também atualiza os itens desta fatura.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            {faturaVincular && (
              <div className="rounded-lg border bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
                Fatura de {faturaVincular.mes ? `${MESES[faturaVincular.mes]}/${faturaVincular.ano}` : (faturaVincular.ano ?? "—")} ·
                {" "}vencimento {fmtData(faturaVincular.vencimento)} · total <span className="font-medium text-gray-700">{formatBRL(faturaVincular.total)}</span>
                {" "}· {faturaVincular.qtdItens} item(ns)
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Cartão</Label>
              <Select value={vincularCartaoId} onValueChange={setVincularCartaoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não identificado (sem cartão)</SelectItem>
                  {cartoes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.banco || "Banco"} · final {c.final4 || "????"}{c.tipoPessoa === "PF" ? " (PF)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cartoes.length === 0 && (
                <p className="text-[11px] text-amber-700">Nenhum cartão cadastrado. Cadastre um cartão na aba "Cartões" primeiro.</p>
              )}
            </div>
          </div>
          <DialogFooter className="border-t bg-gray-50/50 px-6 py-4 sm:gap-2">
            <Button variant="outline" onClick={() => setFaturaVincular(null)} disabled={vincularFatura.isPending}>Cancelar</Button>
            <Button onClick={salvarVincular} disabled={vincularFatura.isPending} className="bg-[#1B2A4A] hover:bg-[#22315a]">
              {vincularFatura.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Salvar vínculo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!faturaExcluir} onOpenChange={(v) => { if (!v) setFaturaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fatura?</AlertDialogTitle>
            <AlertDialogDescription>A fatura e seus {faturaExcluir?.qtdItens ?? 0} item(ns) serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExcluirFatura} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
