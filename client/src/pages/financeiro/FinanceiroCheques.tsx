import { useMemo, useState, useRef } from "react";
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
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Trash2, Pencil, Search, RotateCcw, Banknote } from "lucide-react";

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
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fAno, setFAno] = useState<string>(String(ANO_ATUAL));
  const [fMes, setFMes] = useState<string>("todos");
  const [fBusca, setFBusca] = useState<string>("");

  // ── Importação ──
  const [importAno, setImportAno] = useState<string>(String(ANO_ATUAL));
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [preview, setPreview] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);

  // ── Edição ──
  const [editItem, setEditItem] = useState<any>(null);
  const [excluirItem, setExcluirItem] = useState<any>(null);

  const listarArgs: any = { companyId, limit: 2000 };
  if (fStatus !== "todos") listarArgs.status = fStatus;
  if (fAno !== "todos") listarArgs.ano = Number(fAno);
  if (fMes !== "todos") listarArgs.mes = Number(fMes);
  if (fBusca.trim()) listarArgs.busca = fBusca.trim();

  const { data: cheques = [], isLoading } = (trpc as any).cheques.listar.useQuery(
    listarArgs, { enabled: !!companyId }
  );
  const { data: resumo = [] } = (trpc as any).cheques.resumo.useQuery(
    { companyId, ano: fAno !== "todos" ? Number(fAno) : undefined },
    { enabled: !!companyId }
  );

  const previewMut = (trpc as any).cheques.importarPreview.useMutation();
  const confirmarMut = (trpc as any).cheques.importarConfirmar.useMutation();
  const atualizarMut = (trpc as any).cheques.atualizar.useMutation();
  const excluirMut = (trpc as any).cheques.excluir.useMutation();

  const totais = useMemo(() => {
    const map: Record<string, { qtd: number; total: number }> = {};
    for (const r of resumo) map[r.status] = { qtd: r.qtd, total: r.total };
    const totalGeral = (resumo as any[]).reduce((a, r) => a + (r.total || 0), 0);
    const qtdGeral = (resumo as any[]).reduce((a, r) => a + (r.qtd || 0), 0);
    return { map, totalGeral, qtdGeral };
  }, [resumo]);

  const anos = useMemo(() => {
    const set = new Set<number>([ANO_ATUAL, ANO_ATUAL - 1]);
    for (const c of cheques as any[]) if (c.ano) set.add(c.ano);
    return Array.from(set).sort((a, b) => b - a);
  }, [cheques]);

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
    try {
      const rep = await previewMut.mutateAsync({ companyId, ano: Number(importAno), fileBase64: arquivoBase64 });
      setPreview(rep);
    } catch (err: any) {
      toast({ title: "Falha ao analisar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarImport() {
    if (!arquivoBase64) return;
    try {
      const r = await confirmarMut.mutateAsync({
        companyId, ano: Number(importAno), fileBase64: arquivoBase64, origemArquivo: arquivoNome,
      });
      toast({ title: "Importação concluída", description: `${r.inseridos} novo(s) cheque(s) gravado(s); ${r.pulados} já existiam.` });
      setImportOpen(false);
      setArquivoBase64(null); setArquivoNome(""); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
    } catch (err: any) {
      toast({ title: "Falha ao gravar", description: err?.message || String(err), variant: "destructive" });
    }
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
    } catch (err: any) {
      toast({ title: "Falha ao excluir", description: err?.message || String(err), variant: "destructive" });
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
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Importar planilha
          </Button>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Total ({fAno})</div>
              <div className="text-xl font-bold">{totais.qtdGeral}</div>
              <div className="text-sm text-muted-foreground">{formatBRL(totais.totalGeral)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Compensados</div>
              <div className="text-xl font-bold text-green-700">{totais.map["compensado"]?.qtd || 0}</div>
              <div className="text-sm text-muted-foreground">{formatBRL(totais.map["compensado"]?.total || 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Pendentes</div>
              <div className="text-xl font-bold text-amber-600">{totais.map["pendente"]?.qtd || 0}</div>
              <div className="text-sm text-muted-foreground">{formatBRL(totais.map["pendente"]?.total || 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">Outros</div>
              <div className="text-xl font-bold text-gray-600">
                {(totais.map["sustado"]?.qtd || 0) + (totais.map["cancelado"]?.qtd || 0) + (totais.map["devolvido"]?.qtd || 0) + (totais.map["indefinido"]?.qtd || 0)}
              </div>
              <div className="text-sm text-muted-foreground">sustado/cancelado/devolvido</div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 flex flex-wrap items-end gap-3">
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
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ano</Label>
              <Select value={fAno} onValueChange={setFAno}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Mês</Label>
              <Select value={fMes} onValueChange={setFMes}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {MESES.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardHeader><CardTitle className="text-base">Cheques ({(cheques as any[]).length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            ) : (cheques as any[]).length === 0 ? (
              <div className="text-center text-muted-foreground py-10">
                Nenhum cheque encontrado. Use <strong>Importar planilha</strong> para começar.
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
                    {(cheques as any[]).map((c) => (
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
                        <td className="py-2 pr-3">{statusBadge(c.status)}</td>
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

      {/* Dialog de importação */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setPreview(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Importar Controle de Cheques</DialogTitle>
            <DialogDescription>
              Selecione o arquivo .xlsx (abas mensais). O sistema analisa antes de gravar — nada é salvo até você confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Ano da planilha</Label>
                <Input type="number" className="w-[120px]" value={importAno} onChange={(e) => setImportAno(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[220px]">
                <Label className="text-xs">Arquivo (.xlsx)</Label>
                <Input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onPickFile} />
              </div>
            </div>

            {arquivoNome && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" /> {arquivoNome}
              </div>
            )}

            <Button onClick={rodarPreview} disabled={!arquivoBase64 || previewMut.isPending} className="gap-2">
              {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Analisar planilha
            </Button>

            {preview && (
              <div className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div className="rounded bg-muted p-2"><div className="text-xs text-muted-foreground">Linhas lidas</div><div className="font-bold">{preview.resumo.totalLinhas}</div></div>
                  <div className="rounded bg-green-50 p-2"><div className="text-xs text-muted-foreground">Novos</div><div className="font-bold text-green-700">{preview.resumo.novos}</div></div>
                  <div className="rounded bg-amber-50 p-2"><div className="text-xs text-muted-foreground">Já existem</div><div className="font-bold text-amber-700">{preview.resumo.jaExistem}</div></div>
                  <div className="rounded bg-muted p-2"><div className="text-xs text-muted-foreground">Dup. no arquivo</div><div className="font-bold">{preview.resumo.dupNoArquivo}</div></div>
                  <div className="rounded bg-muted p-2"><div className="text-xs text-muted-foreground">Sem fornecedor vinc.</div><div className="font-bold">{preview.resumo.semFornecedor}</div></div>
                  <div className="rounded bg-blue-50 p-2"><div className="text-xs text-muted-foreground">Valor (novos)</div><div className="font-bold text-blue-700">{formatBRL(preview.resumo.valorTotalNovos)}</div></div>
                </div>

                {preview.abasLidas?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <CheckCircle className="inline h-3 w-3 text-green-600 mr-1" />
                    Abas lidas: {preview.abasLidas.join(", ")}
                  </div>
                )}
                {preview.abasIgnoradas?.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <AlertCircle className="inline h-3 w-3 text-amber-500 mr-1" />
                    Ignoradas: {preview.abasIgnoradas.join(", ")}
                  </div>
                )}

                {preview.amostra?.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border rounded">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted"><tr className="text-left">
                        <th className="p-1">Nº</th><th className="p-1">Fornecedor</th><th className="p-1 text-right">Valor</th><th className="p-1">Situação</th>
                      </tr></thead>
                      <tbody>
                        {preview.amostra.map((a: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="p-1 font-mono">{a.numeroCheque}</td>
                            <td className="p-1">{a.fornecedorNome || "—"}{!a.fornecedorIdentificado && a.fornecedorNome && <span className="text-amber-600"> ●</span>}</td>
                            <td className="p-1 text-right">{a.valor != null ? formatBRL(a.valor) : "—"}</td>
                            <td className="p-1">{a.situacao === "NOVO" ? <span className="text-green-700">Novo</span> : a.situacao === "JA_EXISTE" ? <span className="text-amber-700">Já existe</span> : <span className="text-gray-500">Dup.</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarImport} disabled={!preview || preview.resumo.novos === 0 || confirmarMut.isPending} className="gap-2">
              {confirmarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
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
    </DashboardLayout>
  );
}
