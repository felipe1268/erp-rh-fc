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
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Trash2, Pencil, Search, RotateCcw, Banknote, ChevronLeft, ChevronRight } from "lucide-react";

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
  // Mesmo padrão da Conciliação Bancária: navegação por ANO + faixa de meses
  // (Jan–Dez) com bolinhas de status; "Ano todo" (mesSel=null) abre o ano inteiro.
  const [fStatus, setFStatus] = useState<string>("todos");
  const [ano, setAno] = useState<number>(ANO_ATUAL);
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [fBusca, setFBusca] = useState<string>("");

  // ── Importação ──
  const [dragOver, setDragOver] = useState(false);
  const [arquivoBase64, setArquivoBase64] = useState<string | null>(null);
  const [arquivoNome, setArquivoNome] = useState<string>("");
  const [preview, setPreview] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);

  // ── Edição ──
  const [editItem, setEditItem] = useState<any>(null);
  const [excluirItem, setExcluirItem] = useState<any>(null);

  const listarArgs: any = { companyId, limit: 2000, ano };
  if (fStatus !== "todos") listarArgs.status = fStatus;
  if (mesSel != null) listarArgs.mes = mesSel;
  if (fBusca.trim()) listarArgs.busca = fBusca.trim();

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
      const rep = await previewMut.mutateAsync({ companyId, fileBase64: arquivoBase64 });
      setPreview(rep);
    } catch (err: any) {
      toast({ title: "Falha ao analisar", description: err?.message || String(err), variant: "destructive" });
    }
  }

  async function confirmarImport() {
    if (!arquivoBase64) return;
    try {
      const r = await confirmarMut.mutateAsync({
        companyId, fileBase64: arquivoBase64, origemArquivo: arquivoNome,
      });
      toast({ title: "Importação concluída", description: `${r.inseridos} novo(s) cheque(s) gravado(s); ${r.pulados} já existiam.` });
      setImportOpen(false);
      setArquivoBase64(null); setArquivoNome(""); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      utils?.cheques?.listar?.invalidate?.();
      utils?.cheques?.resumo?.invalidate?.();
      utils?.cheques?.resumoMensal?.invalidate?.();
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
              <div className="text-xs text-muted-foreground">Total ({ano})</div>
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
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setPreview(null); setDragOver(false); } }}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[94vh] flex flex-col p-0 gap-0">
          {/* Cabeçalho com faixa */}
          <div className="flex items-start gap-3 p-5 border-b bg-gradient-to-r from-blue-50 to-transparent shrink-0">
            <div className="rounded-xl bg-blue-600 text-white p-2.5 shadow-sm shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg">Importar Controle de Cheques</DialogTitle>
              <DialogDescription className="mt-0.5">
                Arraste ou selecione a planilha <strong>.xlsx</strong>. O ano é lido automaticamente
                de cada cheque — nada é gravado até você confirmar.
              </DialogDescription>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Coluna esquerda: upload + ação */}
              <div className="space-y-4">
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

                <Button onClick={rodarPreview} disabled={!arquivoBase64 || previewMut.isPending} className="w-full gap-2" size="lg">
                  {previewMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {previewMut.isPending ? "Analisando…" : "Analisar planilha"}
                </Button>
              </div>

              {/* Coluna direita: resumo / KPIs */}
              <div className="space-y-4">
                {!preview ? (
                  <div className="rounded-xl border border-dashed border-muted-foreground/25 p-10 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2 min-h-[280px]">
                    <Search className="h-8 w-8 text-muted-foreground/40" />
                    <div className="font-medium">O resumo aparece aqui</div>
                    <div>Selecione a planilha e clique em <strong>Analisar planilha</strong> para ver linhas lidas, novos, duplicados e a amostra dos cheques.</div>
                  </div>
                ) : (
                  <>
                    {/* KPIs em destaque */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div className="rounded-lg border bg-card p-3.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Linhas lidas</div>
                        <div className="text-2xl font-bold">{preview.resumo.totalLinhas}</div>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
                        <div className="text-[11px] uppercase tracking-wide text-emerald-700/70">Novos</div>
                        <div className="text-2xl font-bold text-emerald-700">{preview.resumo.novos}</div>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5">
                        <div className="text-[11px] uppercase tracking-wide text-amber-700/70">Já existem</div>
                        <div className="text-2xl font-bold text-amber-700">{preview.resumo.jaExistem}</div>
                      </div>
                      <div className="rounded-lg border bg-card p-3.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Dup. no arquivo</div>
                        <div className="text-2xl font-bold">{preview.resumo.dupNoArquivo}</div>
                      </div>
                      <div className="rounded-lg border bg-card p-3.5">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sem fornecedor</div>
                        <div className="text-2xl font-bold">{preview.resumo.semFornecedor}</div>
                      </div>
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
                      <div className="text-xs text-muted-foreground">
                        <AlertCircle className="inline h-3.5 w-3.5 text-amber-500 mr-1" />
                        Ignoradas: {preview.abasIgnoradas.join(", ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Amostra dos cheques — largura total */}
            {preview?.amostra?.length > 0 && (
              <div className="mt-6">
                <div className="text-sm font-medium mb-2">Amostra dos cheques lidos</div>
                <div className="border rounded-lg overflow-auto max-h-[42vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/95 backdrop-blur"><tr className="text-left">
                      <th className="p-2.5">Nº</th><th className="p-2.5">Fornecedor</th><th className="p-2.5 text-right">Valor</th><th className="p-2.5">Situação</th>
                    </tr></thead>
                    <tbody>
                      {preview.amostra.map((a: any, i: number) => (
                        <tr key={i} className="border-t hover:bg-muted/40">
                          <td className="p-2.5 font-mono">{a.numeroCheque}</td>
                          <td className="p-2.5">{a.fornecedorNome || "—"}{!a.fornecedorIdentificado && a.fornecedorNome && <span className="text-amber-600" title="Fornecedor não vinculado"> ●</span>}</td>
                          <td className="p-2.5 text-right">{a.valor != null ? formatBRL(a.valor) : "—"}</td>
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

          <DialogFooter className="p-5 border-t shrink-0">
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
