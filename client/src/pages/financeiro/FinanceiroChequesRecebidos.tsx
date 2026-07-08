import { useMemo, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Upload, Plus, Pencil, Trash2, Loader2, CheckCircle, RotateCcw, Banknote, ChevronLeft, ChevronRight, Search, FileSpreadsheet, X } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
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
    const d = new Date((String(v).length > 10 ? v : v + "T00:00:00"));
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}
function diasAte(v: any): number | null {
  if (!v) return null;
  try {
    const d = new Date(String(v).length > 10 ? v : v + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    const hoje = new Date();
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const b = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
    return Math.round((a - b) / 86400000);
  } catch { return null; }
}

const STATUS_OPTS = [
  { value: "disponivel",  label: "Disponível",  cls: "bg-green-100 text-green-700" },
  { value: "alocado",     label: "Alocado",     cls: "bg-blue-100 text-blue-700" },
  { value: "compensado",  label: "Compensado",  cls: "bg-teal-100 text-teal-700" },
  { value: "devolvido",   label: "Devolvido",   cls: "bg-orange-100 text-orange-700" },
];

function statusBadge(s: string) {
  const opt = STATUS_OPTS.find(o => o.value === s);
  return opt
    ? <Badge className={`${opt.cls} hover:${opt.cls}`}>{opt.label}</Badge>
    : <Badge variant="outline">{s}</Badge>;
}

function vencCell(c: any) {
  if (!c.data_bom_para) return <span className="text-xs text-muted-foreground">—</span>;
  if (c.status === "compensado") return <span className="text-xs text-green-700 font-medium">Compensado</span>;
  const dias = diasAte(c.data_bom_para);
  if (dias == null) return <span className="text-xs text-muted-foreground">{fmtData(c.data_bom_para)}</span>;
  if (dias > 0) return (
    <span className="text-xs rounded-full bg-blue-50 px-2 py-0.5 text-blue-700 font-medium" title={`Bom para ${fmtData(c.data_bom_para)}`}>
      {fmtData(c.data_bom_para)} · faltam {dias}d
    </span>
  );
  if (dias === 0) return (
    <span className="text-xs rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 font-medium">Hoje</span>
  );
  return (
    <span className="text-xs rounded-full bg-red-100 px-2 py-0.5 text-red-700 font-medium" title={`Bom para ${fmtData(c.data_bom_para)}`}>
      {fmtData(c.data_bom_para)} · vencido
    </span>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

const ANO_ATUAL = new Date().getFullYear();
const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const EMPTY_FORM = {
  numeroCheque: "", emitenteNome: "", banco: "", agencia: "", conta: "",
  valorMask: "", dataEmissao: "", dataBomPara: "", observacao: "",
};

export default function FinanceiroChequesRecebidos() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const utils = (trpc as any).useUtils?.() ?? (trpc as any).useContext?.();
  const fileRef = useRef<HTMLInputElement>(null);

  const [ano, setAno] = useState(ANO_ATUAL);
  const [mesSel, setMesSel] = useState<number | null>(new Date().getMonth() + 1);
  const [fStatus, setFStatus] = useState("todos");
  const [busca, setBusca] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formEdit, setFormEdit] = useState<any | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [excluirId, setExcluirId] = useState<number | null>(null);
  const [alocDrilldown, setAlocDrilldown] = useState<any | null>(null);

  const [importStep, setImportStep] = useState<"idle" | "preview" | "done">("idle");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importBase64, setImportBase64] = useState<string>("");
  const [importFileName, setImportFileName] = useState<string>("");

  // ── Queries ──
  const listQuery = (trpc as any).chequesRecebidos.listar.useQuery(
    { companyId, status: fStatus !== "todos" ? fStatus : undefined, busca: busca || undefined, mes: mesSel, ano },
    { enabled: !!companyId }
  );
  const totaisQuery = (trpc as any).chequesRecebidos.totais.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const cheques: any[] = listQuery.data?.cheques ?? [];
  const totais: any = totaisQuery.data ?? {};

  function invalidate() {
    utils?.chequesRecebidos?.listar?.invalidate?.();
    utils?.chequesRecebidos?.totais?.invalidate?.();
  }

  // ── Mutations ──
  const criarMut = (trpc as any).chequesRecebidos.criar.useMutation({
    onSuccess: () => { toast({ title: "Cheque cadastrado!" }); setFormOpen(false); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atualizarMut = (trpc as any).chequesRecebidos.atualizar.useMutation({
    onSuccess: () => { toast({ title: "Cheque atualizado!" }); setFormOpen(false); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const excluirMut = (trpc as any).chequesRecebidos.excluir.useMutation({
    onSuccess: () => { toast({ title: "Cheque excluído." }); setExcluirId(null); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const atualizarStatusMut = (trpc as any).chequesRecebidos.atualizar.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado." }); invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const previewMut = (trpc as any).chequesRecebidos.importarPreview.useMutation({
    onSuccess: (d: any) => { setImportPreview(d); setImportStep("preview"); },
    onError: (e: any) => toast({ title: "Erro na leitura do arquivo", description: e.message, variant: "destructive" }),
  });
  const confirmarMut = (trpc as any).chequesRecebidos.importarConfirmar.useMutation({
    onSuccess: (d: any) => {
      toast({ title: `Importação concluída: ${d.inseridos} inseridos, ${d.ignorados} ignorados (dedup)` });
      setImportStep("done");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Erro na importação", description: e.message, variant: "destructive" }),
  });

  // ── Form helpers ──
  function abrirNovo() {
    setFormEdit(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }
  function abrirEditar(c: any) {
    setFormEdit(c);
    setForm({
      numeroCheque: c.numero_cheque ?? "",
      emitenteNome: c.emitente_nome ?? "",
      banco:        c.banco ?? "",
      agencia:      c.agencia ?? "",
      conta:        c.conta ?? "",
      valorMask:    c.valor ? maskBRL(String(Math.round(Number(c.valor) * 100))) : "",
      dataEmissao:  c.data_emissao ? String(c.data_emissao).slice(0, 10) : "",
      dataBomPara:  c.data_bom_para ? String(c.data_bom_para).slice(0, 10) : "",
      observacao:   c.observacao ?? "",
    });
    setFormOpen(true);
  }
  function handleSalvar() {
    const valor = parseMaskBRL(form.valorMask);
    if (!form.numeroCheque.trim()) {
      toast({ title: "Informe o número do cheque", variant: "destructive" }); return;
    }
    if (!valor) {
      toast({ title: "Informe o valor", variant: "destructive" }); return;
    }
    const payload: any = {
      companyId,
      numeroCheque: form.numeroCheque.trim(),
      emitenteNome: form.emitenteNome.trim() || undefined,
      banco:        form.banco.trim() || undefined,
      agencia:      form.agencia.trim() || undefined,
      conta:        form.conta.trim() || undefined,
      valor,
      dataEmissao:  form.dataEmissao || undefined,
      dataBomPara:  form.dataBomPara || undefined,
      observacao:   form.observacao.trim() || undefined,
    };
    if (formEdit) {
      atualizarMut.mutate({ ...payload, id: formEdit.id });
    } else {
      criarMut.mutate(payload);
    }
  }

  // ── Import ──
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const b64 = await fileToBase64(file);
    setImportBase64(b64);
    previewMut.mutate({ companyId, base64: b64 });
    e.target.value = "";
  }
  function cancelarImport() {
    setImportStep("idle");
    setImportPreview(null);
    setImportBase64("");
    setImportFileName("");
  }

  // ── Sumário de totais ──
  const totalDisp  = Number(totais?.disponivel?.total  ?? 0);
  const qtdDisp    = Number(totais?.disponivel?.qtd    ?? 0);
  const totalAloc  = Number(totais?.alocado?.total     ?? 0);
  const qtdAloc    = Number(totais?.alocado?.qtd       ?? 0);
  const totalComp  = Number(totais?.compensado?.total  ?? 0);
  const qtdComp    = Number(totais?.compensado?.qtd    ?? 0);
  const totalDev   = Number(totais?.devolvido?.total   ?? 0);
  const qtdDev     = Number(totais?.devolvido?.qtd     ?? 0);

  return (
    <div className="space-y-4">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-green-700 font-medium">Disponíveis</p>
            <p className="text-xl font-bold text-green-800">{qtdDisp}</p>
            <p className="text-xs text-green-600">{formatBRL(totalDisp)}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-blue-700 font-medium">Alocados</p>
            <p className="text-xl font-bold text-blue-800">{qtdAloc}</p>
            <p className="text-xs text-blue-600">{formatBRL(totalAloc)}</p>
          </CardContent>
        </Card>
        <Card className="border-teal-200 bg-teal-50/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-teal-700 font-medium">Compensados</p>
            <p className="text-xl font-bold text-teal-800">{qtdComp}</p>
            <p className="text-xs text-teal-600">{formatBRL(totalComp)}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-orange-700 font-medium">Devolvidos</p>
            <p className="text-xl font-bold text-orange-800">{qtdDev}</p>
            <p className="text-xs text-orange-600">{formatBRL(totalDev)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={abrirNovo} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
          <Plus className="h-4 w-4" /> Lançar cheque
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50">
          <FileSpreadsheet className="h-4 w-4" /> Importar .xlsx
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />

        {/* Navegação de ano */}
        <div className="flex items-center gap-1 ml-auto">
          <Button size="icon" variant="ghost" onClick={() => setAno(a => a - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold w-12 text-center">{ano}</span>
          <Button size="icon" variant="ghost" onClick={() => setAno(a => a + 1)} disabled={ano >= ANO_ATUAL + 1}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {/* Meses */}
        <div className="flex gap-0.5 flex-wrap">
          <button
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${mesSel == null ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            onClick={() => setMesSel(null)}
          >Todos</button>
          {MESES.slice(1).map((m, i) => (
            <button key={i + 1}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${mesSel === i + 1 ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              onClick={() => setMesSel(i + 1)}>{m}</button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nº, emitente, banco…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Painel de importação */}
      {importStep !== "idle" && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-blue-800">Importação — {importFileName}</CardTitle>
            <Button size="icon" variant="ghost" onClick={cancelarImport} className="h-6 w-6"><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {importStep === "preview" && importPreview && (
              <>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-blue-700"><strong>{importPreview.total}</strong> cheques identificados</span>
                  {importPreview.novos != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      {importPreview.novos} novos
                    </span>
                  )}
                  {importPreview.duplicados != null && importPreview.duplicados > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {importPreview.duplicados} já existentes (serão ignorados)
                    </span>
                  )}
                  {importPreview.total === 0 && <span className="text-red-600"> — Nenhuma linha válida. Verifique os cabeçalhos.</span>}
                </div>
                {importPreview.amostra?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full border-collapse">
                      <thead><tr className="text-blue-700">
                        <th className="text-left px-2 py-1">Nº Cheque</th>
                        <th className="text-left px-2 py-1">Emitente</th>
                        <th className="text-left px-2 py-1">Valor</th>
                        <th className="text-left px-2 py-1">Bom para</th>
                      </tr></thead>
                      <tbody>
                        {importPreview.amostra.map((r: any, i: number) => (
                          <tr key={i} className="border-t border-blue-100">
                            <td className="px-2 py-1 font-mono">{r.numeroCheque}</td>
                            <td className="px-2 py-1">{r.emitenteNome ?? "—"}</td>
                            <td className="px-2 py-1">{formatBRL(r.valor ?? 0)}</td>
                            <td className="px-2 py-1">{r.dataBomPara ? fmtData(r.dataBomPara) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.total > 5 && <p className="text-[10px] text-blue-600 mt-1">… e mais {importPreview.total - 5} registros</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => confirmarMut.mutate({ companyId, base64: importBase64 })}
                    disabled={confirmarMut.isPending || importPreview.total === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                    {confirmarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Confirmar importação
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelarImport}>Cancelar</Button>
                </div>
              </>
            )}
            {importStep === "done" && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700">Importação concluída!</span>
                <Button size="sm" variant="outline" onClick={cancelarImport}>Fechar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : cheques.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              Nenhum cheque recebido encontrado. Use "Lançar cheque" ou "Importar .xlsx".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50/60 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2.5 font-medium">Nº Cheque</th>
                    <th className="text-left px-3 py-2.5 font-medium">Emitente</th>
                    <th className="text-left px-3 py-2.5 font-medium">Banco</th>
                    <th className="text-right px-3 py-2.5 font-medium">Valor</th>
                    <th className="text-left px-3 py-2.5 font-medium">Emissão</th>
                    <th className="text-left px-3 py-2.5 font-medium">Bom para</th>
                    <th className="text-left px-3 py-2.5 font-medium">Status</th>
                    <th className="text-left px-3 py-2.5 font-medium">Alocado em</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {cheques.map((c: any) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                      <td className="px-3 py-2 font-mono font-semibold text-blue-800">{c.numero_cheque}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate" title={c.emitente_nome}>{c.emitente_nome || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {[c.banco, c.agencia ? `Ag ${c.agencia}` : null].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBRL(Number(c.valor))}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtData(c.data_emissao)}</td>
                      <td className="px-3 py-2">{vencCell(c)}</td>
                      <td className="px-3 py-2">{statusBadge(c.status)}</td>
                      <td className="px-3 py-2">
                        {c.status === "alocado" && c.fornecedor_alocado_nome ? (
                          <div className="group relative inline-block">
                            <button
                              className="text-xs font-medium text-blue-700 underline decoration-dotted hover:text-blue-900 max-w-[130px] truncate block"
                              title={`Clique para detalhes da alocação — Fornecedor: ${c.fornecedor_alocado_nome}`}
                              onClick={(e) => { e.stopPropagation(); setAlocDrilldown(c); }}
                            >
                              {c.fornecedor_alocado_nome}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          {/* Marcar como compensado */}
                          {(c.status === "disponivel" || c.status === "alocado") && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-teal-600 hover:text-teal-800"
                              title="Marcar como Compensado"
                              onClick={() => atualizarStatusMut.mutate({ id: c.id, companyId, status: "compensado" })}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* Marcar como devolvido */}
                          {(c.status === "disponivel" || c.status === "alocado") && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-orange-600 hover:text-orange-800"
                              title="Marcar como Devolvido"
                              onClick={() => atualizarStatusMut.mutate({ id: c.id, companyId, status: "devolvido" })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* Voltar para disponível */}
                          {(c.status === "compensado" || c.status === "devolvido" || c.status === "alocado") && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-500 hover:text-gray-700"
                              title="Voltar para Disponível"
                              onClick={() => atualizarStatusMut.mutate({ id: c.id, companyId, status: "disponivel", fornecedorAlocadoId: null, fornecedorAlocadoNome: null, entryId: null })}>
                              <Banknote className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => abrirEditar(c)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-700"
                            onClick={() => setExcluirId(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de cadastro/edição */}
      <Dialog open={formOpen} onOpenChange={v => { if (!v) setFormOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{formEdit ? "Editar cheque recebido" : "Lançar cheque recebido"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nº do Cheque *</Label>
                <Input value={form.numeroCheque} onChange={e => setForm(f => ({ ...f, numeroCheque: e.target.value }))} placeholder="000123" />
              </div>
              <div>
                <Label className="text-xs">Valor *</Label>
                <Input
                  value={form.valorMask}
                  onChange={e => setForm(f => ({ ...f, valorMask: maskBRL(e.target.value) }))}
                  placeholder="0,00"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Emitente (cliente / sacado)</Label>
              <Input value={form.emitenteNome} onChange={e => setForm(f => ({ ...f, emitenteNome: e.target.value }))} placeholder="Nome do emitente" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Banco</Label>
                <Input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex.: Bradesco" />
              </div>
              <div>
                <Label className="text-xs">Agência</Label>
                <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000" />
              </div>
              <div>
                <Label className="text-xs">Conta</Label>
                <Input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} placeholder="00000-0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data de emissão</Label>
                <Input type="date" value={form.dataEmissao} onChange={e => setForm(f => ({ ...f, dataEmissao: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Bom para (vencimento)</Label>
                <Input type="date" value={form.dataBomPara} onChange={e => setForm(f => ({ ...f, dataBomPara: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea rows={2} value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={criarMut.isPending || atualizarMut.isPending}
              className="bg-green-600 hover:bg-green-700 text-white">
              {(criarMut.isPending || atualizarMut.isPending) ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1.5" />}
              {formEdit ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drilldown: detalhes do cheque alocado (Rev. 4096) */}
      <Dialog open={alocDrilldown != null} onOpenChange={v => { if (!v) setAlocDrilldown(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Alocado</span>
              Cheque Nº {alocDrilldown?.numero_cheque}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-semibold">{alocDrilldown ? formatBRL(Number(alocDrilldown.valor)) : "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Emitente</span>
              <span className="text-right max-w-[200px] break-words">{alocDrilldown?.emitente_nome || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Fornecedor</span>
              <span className="text-right max-w-[200px] break-words font-medium text-indigo-700">{alocDrilldown?.fornecedor_alocado_nome || "—"}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Bom para</span>
              <span>{alocDrilldown ? fmtData(alocDrilldown.data_bom_para) : "—"}</span>
            </div>
            {alocDrilldown?.entry_id && (
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Lançamento financeiro</span>
                <span className="font-mono text-xs">#{alocDrilldown.entry_id}</span>
              </div>
            )}
            {alocDrilldown?.atualizado_em && (
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Alocado em</span>
                <span className="text-xs">{fmtData(alocDrilldown.atualizado_em)}</span>
              </div>
            )}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setAlocDrilldown(null)}>Fechar</Button>
            <Button variant="ghost" className="text-gray-500 text-xs"
              onClick={() => { atualizarStatusMut.mutate({ id: alocDrilldown.id, companyId, status: "disponivel", fornecedorAlocadoId: null, fornecedorAlocadoNome: null, entryId: null }); setAlocDrilldown(null); }}>
              Liberar alocação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={excluirId != null} onOpenChange={v => { if (!v) setExcluirId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cheque recebido?</AlertDialogTitle>
            <AlertDialogDescription>
              O cheque será removido do controle (exclusão lógica). Esta ação não pode ser desfeita facilmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluirMut.mutate({ id: excluirId!, companyId })}
              className="bg-red-600 hover:bg-red-700">
              {excluirMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
