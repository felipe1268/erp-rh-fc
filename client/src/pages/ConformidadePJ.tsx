import { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2, FileText,
  Receipt, Building2, Shield, Briefcase, ChevronLeft, ChevronRight, Calendar,
  Download, Upload, FileDown, Paperclip, BarChart3, Send,
} from "lucide-react";
import { toast } from "sonner";

type TipoConformidade = "das" | "nf" | "cnd" | "seguro_vida" | "status_cnpj";

const TIPOS_META: Record<TipoConformidade, { label: string; icon: any; color: string; mensal: boolean; descricao: string }> = {
  das:         { label: "DAS-MEI",     icon: Receipt,    color: "blue",    mensal: true,  descricao: "Documento de Arrecadação do Simples Nacional (vence dia 20)" },
  nf:          { label: "NF do mês",   icon: FileText,   color: "indigo",  mensal: true,  descricao: "Nota Fiscal de prestação de serviço" },
  cnd:         { label: "CND CNPJ",    icon: Building2,  color: "purple",  mensal: false, descricao: "Certidão Negativa de Débitos do CNPJ" },
  seguro_vida: { label: "Seguro Vida", icon: Shield,     color: "emerald", mensal: false, descricao: "Seguro de Vida (Cláusula 5.1 do contrato)" },
  status_cnpj: { label: "CNPJ Ativo",  icon: Briefcase,  color: "amber",   mensal: false, descricao: "Status do CNPJ na Receita Federal" },
};

const ORDEM_TIPOS: TipoConformidade[] = ["das", "nf", "cnd", "seguro_vida", "status_cnpj"];

const STATUS_BADGE: Record<string, { label: string; className: string; icon: any }> = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-700 border-amber-300", icon: Clock },
  ok:       { label: "OK",       className: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  vencido:  { label: "Vencido",  className: "bg-red-100 text-red-700 border-red-300", icon: AlertTriangle },
  na:       { label: "N/A",      className: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
};

function statusEfetivo(item: any): string {
  return item?.statusComputed || item?.status || "pendente";
}

function mesAnterior(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function mesPosterior(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function labelMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[m-1]}/${y}`;
}

function downloadBase64(base64: string, fileName: string) {
  const byteChars = atob(base64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ConformidadePJ() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) || 0 : 0;
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [mesRef, setMesRef] = useState(mesAtual);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ employeeId: number; nome: string; tipo: TipoConformidade; item: any } | null>(null);
  const [form, setForm] = useState({
    status: "pendente" as string,
    dataVencimento: "",
    dataEnvio: "",
    valor: "",
    documentoUrl: "",
    arquivoNome: "",
    observacoes: "",
  });
  const [uploadingArquivo, setUploadingArquivo] = useState(false);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importResultDialog, setImportResultDialog] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  const { data, isLoading, refetch } = trpc.pjConformidade.listar.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );

  const utils = trpc.useUtils();

  const upsertMut = trpc.pjConformidade.upsert.useMutation({
    onSuccess: () => { toast.success("Conformidade atualizada!"); setDialogOpen(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const uploadArquivoMut = trpc.pjConformidade.uploadArquivo.useMutation({
    onSuccess: (r: any) => {
      setForm((f) => ({ ...f, documentoUrl: r.url, arquivoNome: r.fileName }));
      toast.success(`Arquivo "${r.fileName}" anexado!`);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao enviar arquivo"),
    onSettled: () => setUploadingArquivo(false),
  });

  const importarMut = trpc.pjConformidade.importarXLSX.useMutation({
    onSuccess: (r: any) => {
      setImportResultDialog(r);
      refetch();
      if (r.erros?.length === 0) {
        toast.success(`${r.inseridos} novo(s) e ${r.atualizados} atualizado(s)`);
      } else {
        toast.warning(`${r.inseridos} inserido(s), ${r.atualizados} atualizado(s), ${r.erros.length} erro(s)`);
      }
    },
    onError: (e: any) => toast.error(e.message || "Erro ao importar"),
    onSettled: () => setImporting(false),
  });

  const notificarMut = trpc.pjConformidade.notificarManual.useMutation({
    onSuccess: (r: any) => toast.success(`${r.emails} e-mail(s) enviados para ${r.empresas} empresa(s).`),
    onError: (e: any) => toast.error(e.message || "Erro ao notificar"),
  });

  const totais = useMemo(() => {
    const fs = data?.funcionarios || [];
    let pendentes = 0, vencidos = 0, ok = 0, total = 0;
    for (const f of fs) {
      for (const t of ORDEM_TIPOS) {
        const s = statusEfetivo(f.itens[t]);
        if (s === "pendente") pendentes++;
        else if (s === "vencido") vencidos++;
        else if (s === "ok") ok++;
        total++;
      }
    }
    return { pendentes, vencidos, ok, total, pjs: fs.length };
  }, [data]);

  function abrirEdicao(emp: any, tipo: TipoConformidade) {
    const item = emp.itens[tipo] || {};
    setEditing({ employeeId: emp.id, nome: emp.nomeCompleto, tipo, item });
    setForm({
      status: item.status || "pendente",
      dataVencimento: item.dataVencimento ? String(item.dataVencimento).slice(0,10) : "",
      dataEnvio: item.dataEnvio ? String(item.dataEnvio).slice(0,10) : "",
      valor: item.valor ? String(item.valor) : "",
      documentoUrl: item.documentoUrl || "",
      arquivoNome: item.arquivoNome || "",
      observacoes: item.observacoes || "",
    });
    setDialogOpen(true);
  }

  function salvar() {
    if (!editing) return;
    upsertMut.mutate({
      companyId,
      employeeId: editing.employeeId,
      tipo: editing.tipo,
      competencia: TIPOS_META[editing.tipo].mensal ? mesRef : null,
      status: form.status as any,
      dataVencimento: form.dataVencimento || null,
      dataEnvio: form.dataEnvio || null,
      valor: form.valor || null,
      documentoUrl: form.documentoUrl || null,
      arquivoNome: form.arquivoNome || null,
      observacoes: form.observacoes || null,
    });
  }

  async function onSelectArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 15 MB).");
      return;
    }
    setUploadingArquivo(true);
    try {
      const base64 = await fileToBase64(file);
      uploadArquivoMut.mutate({
        companyId,
        employeeId: editing.employeeId,
        tipo: editing.tipo,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileBase64: base64,
      });
    } catch (err: any) {
      setUploadingArquivo(false);
      toast.error("Erro lendo arquivo: " + (err?.message || "desconhecido"));
    }
  }

  async function baixarTemplate() {
    try {
      const r = await utils.client.pjConformidade.gerarTemplate.query({ companyId, mesReferencia: mesRef });
      downloadBase64(r.base64, r.fileName);
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar modelo");
    }
  }
  async function exportar() {
    try {
      const r = await utils.client.pjConformidade.exportarXLSX.query({ companyId, mesReferencia: mesRef });
      downloadBase64(r.base64, r.fileName);
      toast.success("Planilha gerada!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao exportar");
    }
  }
  async function onSelectImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const base64 = await fileToBase64(file);
      importarMut.mutate({ companyId, fileBase64: base64 });
    } catch (err: any) {
      setImporting(false);
      toast.error("Erro lendo arquivo: " + (err?.message || "desconhecido"));
    }
  }

  if (companyId === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-20 text-muted-foreground">
          Selecione uma empresa para ver a conformidade dos PJs.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-600" /> Conformidade PJ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhamento mensal das obrigações dos prestadores PJ: DAS, NF, CND, Seguro de Vida e status do CNPJ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMesRef(mesAnterior(mesRef))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-3 py-1.5 rounded-md border bg-white text-sm font-semibold flex items-center gap-2 min-w-[110px] justify-center">
            <Calendar className="h-4 w-4 text-purple-500" /> {labelMes(mesRef)}
          </div>
          <Button variant="outline" size="sm" onClick={() => setMesRef(mesPosterior(mesRef))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {mesRef !== mesAtual && (
            <Button variant="ghost" size="sm" onClick={() => setMesRef(mesAtual)}>Hoje</Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => window.location.assign("/terceiros/pj/dashboard-conformidade")}>
          <BarChart3 className="h-4 w-4 mr-1" /> Ver Dashboard
        </Button>
        <Button variant="outline" size="sm" onClick={baixarTemplate}>
          <FileDown className="h-4 w-4 mr-1" /> Modelo Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          Importar Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportar}>
          <Download className="h-4 w-4 mr-1" /> Exportar Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => notificarMut.mutate({})} disabled={notificarMut.isPending}>
          {notificarMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
          Notificar agora
        </Button>
        <input ref={importInputRef} type="file" accept=".xlsx,.xls" hidden onChange={onSelectImport} />
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">PJs ativos</div>
          <div className="text-2xl font-bold mt-1">{totais.pjs}</div>
        </CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50/40"><CardContent className="p-4">
          <div className="text-xs text-emerald-700 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> OK</div>
          <div className="text-2xl font-bold mt-1 text-emerald-700">{totais.ok}</div>
        </CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/40"><CardContent className="p-4">
          <div className="text-xs text-amber-700 uppercase tracking-wider flex items-center gap-1"><Clock className="h-3 w-3" /> Pendentes</div>
          <div className="text-2xl font-bold mt-1 text-amber-700">{totais.pendentes}</div>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50/40"><CardContent className="p-4">
          <div className="text-xs text-red-700 uppercase tracking-wider flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Vencidos</div>
          <div className="text-2xl font-bold mt-1 text-red-700">{totais.vencidos}</div>
        </CardContent></Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Carregando...</div>
      ) : !data || data.funcionarios.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground bg-white rounded-xl border">
          <Briefcase className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          Nenhum funcionário PJ ativo nesta empresa.
          <div className="text-xs mt-2">Cadastre PJs em "Prestadores de Serviço" no menu Terceiros &gt; PJ.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">Funcionário PJ</th>
                <th className="p-3 text-center font-semibold text-gray-700">CPF</th>
                {ORDEM_TIPOS.map(t => {
                  const meta = TIPOS_META[t];
                  const Icon = meta.icon;
                  return (
                    <th key={t} className="p-3 text-center font-semibold text-gray-700">
                      <div className="flex flex-col items-center gap-0.5">
                        <Icon className={`h-4 w-4 text-${meta.color}-500`} />
                        <span className="text-xs">{meta.label}</span>
                        {meta.mensal && <span className="text-[9px] text-gray-400">({labelMes(mesRef)})</span>}
                      </div>
                    </th>
                  );
                })}
                <th className="p-3 text-center font-semibold text-gray-700">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {data.funcionarios.map((emp: any) => (
                <tr key={emp.id} className="border-b last:border-0 hover:bg-gray-50/50">
                  <td className="p-3 font-medium text-gray-900 sticky left-0 bg-white z-10">
                    <a href={`/relatorios/raio-x?employeeId=${emp.id}`} className="hover:underline hover:text-purple-700">
                      {emp.nomeCompleto}
                    </a>
                    <div className="text-xs text-muted-foreground">{emp.funcao || '-'}</div>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">{emp.cpf || '-'}</td>
                  {ORDEM_TIPOS.map(tipo => {
                    const item = emp.itens[tipo];
                    const status = statusEfetivo(item);
                    const cfg = STATUS_BADGE[status] || STATUS_BADGE.pendente;
                    const Icon = cfg.icon;
                    return (
                      <td key={tipo} className="p-2 text-center">
                        <button
                          onClick={() => abrirEdicao(emp, tipo)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold transition-all hover:scale-105 ${cfg.className}`}
                          title={item?.dataVencimento ? `Vence: ${String(item.dataVencimento).slice(0,10)}` : (item?.dataEnvio ? `Enviado: ${String(item.dataEnvio).slice(0,10)}` : 'Clique para editar')}
                        >
                          <Icon className="h-3 w-3" /> {cfg.label}
                          {item?.documentoUrl && <Paperclip className="h-2.5 w-2.5 ml-0.5 opacity-70" />}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-3 text-center">
                    {emp.pendencias > 0 ? (
                      <Badge variant="destructive">{emp.pendencias}</Badge>
                    ) : (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700">0</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog de edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing && (() => { const Icon = TIPOS_META[editing.tipo].icon; return <Icon className="h-5 w-5 text-purple-500" />; })()}
              {editing ? TIPOS_META[editing.tipo].label : ''}
            </DialogTitle>
            <DialogDescription>
              {editing?.nome}
              {editing && TIPOS_META[editing.tipo].mensal && <span className="block text-xs mt-1">Competência: <strong>{labelMes(mesRef)}</strong></span>}
              <span className="block text-xs mt-1 text-gray-500">{editing && TIPOS_META[editing.tipo].descricao}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="na">N/A (não se aplica)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editing && !TIPOS_META[editing.tipo].mensal && (
              <div>
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Data de Envio / Emissão</Label>
              <Input type="date" value={form.dataEnvio} onChange={e => setForm(f => ({ ...f, dataEnvio: e.target.value }))} />
            </div>
            {editing && (editing.tipo === 'das' || editing.tipo === 'nf') && (
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
              </div>
            )}
            <div>
              <Label>Anexar arquivo (PDF, imagem, etc.)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileUploadRef.current?.click()}
                  disabled={uploadingArquivo}
                >
                  {uploadingArquivo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {form.arquivoNome ? "Substituir" : "Selecionar"}
                </Button>
                {form.documentoUrl && (
                  <a
                    href={form.documentoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                    title={form.arquivoNome || form.documentoUrl}
                  >
                    <Paperclip className="h-3 w-3 inline mr-1" />
                    {form.arquivoNome || "Ver arquivo"}
                  </a>
                )}
                {form.documentoUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForm(f => ({ ...f, documentoUrl: "", arquivoNome: "" }))}>
                    <XCircle className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <input ref={fileUploadRef} type="file" hidden onChange={onSelectArquivo} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" />
              <p className="text-[10px] text-muted-foreground mt-1">Você também pode colar um link externo abaixo. Máx 15 MB.</p>
            </div>
            <div>
              <Label>Link do Documento (URL externa)</Label>
              <Input value={form.documentoUrl} onChange={e => setForm(f => ({ ...f, documentoUrl: e.target.value, arquivoNome: f.arquivoNome }))} placeholder="https://..." />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={upsertMut.isPending}>
              {upsertMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resultado da importação */}
      <Dialog open={!!importResultDialog} onOpenChange={(o) => !o && setImportResultDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resultado da importação</DialogTitle>
          </DialogHeader>
          {importResultDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
                  <div className="text-xs text-emerald-700">Inseridos</div>
                  <div className="text-2xl font-bold text-emerald-700">{importResultDialog.inseridos}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <div className="text-xs text-blue-700">Atualizados</div>
                  <div className="text-2xl font-bold text-blue-700">{importResultDialog.atualizados}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <div className="text-xs text-red-700">Erros</div>
                  <div className="text-2xl font-bold text-red-700">{importResultDialog.erros?.length || 0}</div>
                </div>
              </div>
              {importResultDialog.erros?.length > 0 && (
                <div className="max-h-60 overflow-y-auto border rounded-md p-2 bg-red-50/40 text-xs space-y-1">
                  {importResultDialog.erros.slice(0, 30).map((e: any, i: number) => (
                    <div key={i}>
                      <strong>Linha {e.linha}:</strong> {e.mensagem}
                    </div>
                  ))}
                  {importResultDialog.erros.length > 30 && (
                    <div className="text-muted-foreground italic">... mais {importResultDialog.erros.length - 30} erro(s)</div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResultDialog(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
