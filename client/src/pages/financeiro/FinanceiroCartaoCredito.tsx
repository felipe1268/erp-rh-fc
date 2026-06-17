import { useMemo, useState } from "react";
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
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Upload, Loader2, CheckCircle, AlertTriangle, Trash2, Pencil,
  ChevronLeft, ChevronRight, PlusCircle, ListTree, FileText, Building2, ShieldAlert,
} from "lucide-react";

function formatBRL(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
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
  banco: "", bandeira: "", final4: "", titular: "", tipoPessoa: "PJ",
  diaFechamento: "", diaVencimento: "", limite: "", observacao: "",
};

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
      titular: c.titular ?? "", tipoPessoa: c.tipoPessoa ?? "PJ",
      diaFechamento: c.diaFechamento != null ? String(c.diaFechamento) : "",
      diaVencimento: c.diaVencimento != null ? String(c.diaVencimento) : "",
      limite: c.limite != null ? String(c.limite) : "",
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
      diaFechamento: cartaoForm.diaFechamento ? parseInt(cartaoForm.diaFechamento, 10) : null,
      diaVencimento: cartaoForm.diaVencimento ? parseInt(cartaoForm.diaVencimento, 10) : null,
      limite: cartaoForm.limite ? parseFloat(cartaoForm.limite.replace(/\./g, "").replace(",", ".")) : null,
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

  // ── Importação por IA ────────────────────────────────────────────────
  const [importModal, setImportModal] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");
  const importarPreview = (trpc as any).cartao.importarPreview.useMutation();
  const importarConfirmar = (trpc as any).cartao.importarConfirmar.useMutation();

  function abrirImport() {
    setPreview(null); setArquivoNome(""); setImportModal(true);
  }
  async function onArquivoSelecionado(file: File | undefined) {
    if (!file || !companyId) return;
    setImportBusy(true); setPreview(null); setArquivoNome(file.name);
    try {
      const b64 = await fileToBase64(file);
      const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      const res = await importarPreview.mutateAsync({ companyId, fileBase64: b64, mimeType: mime });
      setPreview(res);
    } catch (e: any) {
      toast({ title: "Falha ao ler a fatura", description: e?.message || String(e), variant: "destructive" });
    } finally {
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

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-700" /> Controle de Cartão de Crédito
            </h1>
            <p className="text-sm text-muted-foreground">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cartoes.map((c) => (
                    <div key={c.id} className={`rounded-lg border p-3 ${c.alertaPessoal ? "border-amber-300 bg-amber-50/40" : "bg-white"} ${(c.ativo === 1 || c.ativo === true) ? "" : "opacity-60"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{c.banco || "Banco —"} {c.bandeira ? `· ${c.bandeira}` : ""}</p>
                          <p className="text-sm text-muted-foreground">final {c.final4 || "????"} · {c.titular || "sem titular"}</p>
                        </div>
                        <Badge variant={c.tipoPessoa === "PF" ? "outline" : "secondary"} className={c.tipoPessoa === "PF" ? "border-amber-400 text-amber-700" : ""}>{c.tipoPessoa}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-1">
                        <span>Fecha dia: <b>{c.diaFechamento ?? "—"}</b></span>
                        <span>Vence dia: <b>{c.diaVencimento ?? "—"}</b></span>
                        <span className="col-span-2">Limite: <b>{c.limite != null ? formatBRL(c.limite) : "—"}</b></span>
                      </div>
                      {c.alertaPessoal && (
                        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-100/60 rounded p-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Cartão <b>pessoal (PF)</b> usado pela empresa. Avalie regularização (cartão PJ ou reembolso ao titular).</span>
                        </div>
                      )}
                      <div className="mt-2 flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => abrirEditarCartao(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setCartaoExcluir(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ───────────── ABA FATURAS ───────────── */}
        {aba === "faturas" && (
          <>
            <Card>
              <CardContent className="pt-4 space-y-3">
                {/* Régua ano + meses */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAno((a) => a - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="font-semibold w-14 text-center">{ano}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setAno((a) => a + 1)}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                  <Button size="sm" variant={mesSel == null ? "default" : "outline"} onClick={() => setMesSel(null)}>Ano todo</Button>
                  <div className="flex flex-wrap gap-1">
                    {MESES.slice(1).map((m, i) => {
                      const num = i + 1;
                      const r = resumoMensal.find((x) => x.mes === num);
                      const temFatura = !!r && r.qtd > 0;
                      return (
                        <button
                          key={num}
                          onClick={() => setMesSel(num)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border flex items-center gap-1 ${mesSel === num ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-gray-50"}`}
                        >
                          {m}
                          <span className={`w-1.5 h-1.5 rounded-full ${temFatura ? "bg-green-500" : "bg-gray-300"}`} />
                        </button>
                      );
                    })}
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
                <div className="text-sm text-muted-foreground">
                  {faturas.length} fatura(s) {mesSel != null ? `em ${MESES[mesSel]}/${ano}` : `em ${ano}`} · total <b className="text-foreground">{formatBRL(totalFaturasMes)}</b>
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
        <DialogContent resizable={false} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{cartaoEdit ? "Editar cartão" : "Novo cartão"}</DialogTitle>
            <DialogDescription>Cartões pessoais (PF) usados pela empresa geram alerta de regularização.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Banco</Label><Input value={cartaoForm.banco} onChange={(e) => setCartaoForm((f) => ({ ...f, banco: e.target.value }))} placeholder="Ex: Santander" /></div>
            <div><Label>Bandeira</Label><Input value={cartaoForm.bandeira} onChange={(e) => setCartaoForm((f) => ({ ...f, bandeira: e.target.value }))} placeholder="Ex: Mastercard" /></div>
            <div><Label>Final (4 dígitos)</Label><Input value={cartaoForm.final4} maxLength={4} onChange={(e) => setCartaoForm((f) => ({ ...f, final4: e.target.value.replace(/[^0-9]/g, "") }))} placeholder="1234" /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={cartaoForm.tipoPessoa} onValueChange={(v) => setCartaoForm((f) => ({ ...f, tipoPessoa: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">PJ (empresa)</SelectItem>
                  <SelectItem value="PF">PF (pessoal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Titular</Label><Input value={cartaoForm.titular} onChange={(e) => setCartaoForm((f) => ({ ...f, titular: e.target.value }))} placeholder="Nome impresso no cartão" /></div>
            <div><Label>Dia fechamento</Label><Input type="number" min={1} max={31} value={cartaoForm.diaFechamento} onChange={(e) => setCartaoForm((f) => ({ ...f, diaFechamento: e.target.value }))} /></div>
            <div><Label>Dia vencimento</Label><Input type="number" min={1} max={31} value={cartaoForm.diaVencimento} onChange={(e) => setCartaoForm((f) => ({ ...f, diaVencimento: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Limite (R$)</Label><Input value={cartaoForm.limite} onChange={(e) => setCartaoForm((f) => ({ ...f, limite: e.target.value }))} placeholder="Ex: 10000,00" /></div>
            <div className="col-span-2"><Label>Observação</Label><Textarea rows={2} value={cartaoForm.observacao} onChange={(e) => setCartaoForm((f) => ({ ...f, observacao: e.target.value }))} /></div>
          </div>
          {cartaoForm.tipoPessoa === "PF" && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Este é um cartão <b>pessoal</b>. Ele NÃO será convertido em cartão FC automaticamente — o sistema apenas sinaliza para regularização.</span>
            </div>
          )}
          <DialogFooter>
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
              <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg py-16 cursor-pointer hover:bg-gray-50 ${importBusy ? "opacity-60 pointer-events-none" : ""}`}>
                {importBusy ? <Loader2 className="w-10 h-10 animate-spin text-blue-600" /> : <Upload className="w-10 h-10 text-gray-400" />}
                <span className="text-sm text-muted-foreground">{importBusy ? `Lendo "${arquivoNome}" com a IA…` : "Clique para selecionar o PDF da fatura"}</span>
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
      <Dialog open={!!faturaItens} onOpenChange={(v) => { if (!v) setFaturaItens(null); }}>
        <DialogContent resizable={false} className="max-w-[96vw] w-[96vw] h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ListTree className="w-5 h-5" /> Classificar itens da fatura</DialogTitle>
            <DialogDescription>
              {faturaItens && <>{faturaItens.cartaoBanco || "Cartão"} · final {faturaItens.cartaoFinal4 || "????"} · Venc. {fmtData(faturaItens.vencimento)} · Total {formatBRL(faturaItens.total)}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {itensQ.isLoading ? (
              <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Carregando…</div>
            ) : itens.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Esta fatura não tem itens.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-left text-muted-foreground">
                    <th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2">Tipo</th>
                    <th className="p-2 text-right">Valor</th><th className="p-2">Obra</th><th className="p-2">Centro de custo</th>
                    <th className="p-2">Categoria</th><th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => (
                    <tr key={it.id} className="border-t align-top">
                      <td className="p-2 whitespace-nowrap">{fmtData(it.data)}</td>
                      <td className="p-2 min-w-[160px]">{it.descricao || "—"}{it.parcelaTotal ? <span className="text-muted-foreground"> ({it.parcelaAtual}/{it.parcelaTotal})</span> : ""}{it.cidade ? <div className="text-[10px] text-muted-foreground">{it.cidade}</div> : null}</td>
                      <td className="p-2">{tipoBadge(it.tipo)}</td>
                      <td className="p-2 text-right whitespace-nowrap">{formatBRL(it.valor)}</td>
                      <td className="p-2">
                        <Select value={it.obraId != null ? String(it.obraId) : "none"} onValueChange={(v) => {
                          const o = obras.find((x) => String(x.id) === v);
                          aplicarClassificacao(it, { obraId: v === "none" ? null : parseInt(v, 10), obraNome: o ? (o.nome ?? o.name ?? null) : null });
                        }}>
                          <SelectTrigger className="h-7 w-[150px]"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— (sem obra)</SelectItem>
                            {obras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome ?? o.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
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
                      <td className="p-2">
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
                      <td className="p-2">
                        <Select value={it.statusClassificacao || "sugerido"} onValueChange={(v) => aplicarClassificacao(it, { statusClassificacao: v })}>
                          <SelectTrigger className="h-7 w-[120px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sugerido">Sugerido</SelectItem>
                            <SelectItem value="confirmado">Confirmado</SelectItem>
                            <SelectItem value="ignorado">Ignorado</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaturaItens(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
