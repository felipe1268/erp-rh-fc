/**
 * Rev. 2195 — Encargos Sociais sobre Folha
 *
 * Tela de conferência das guias DCTFWeb (DARF INSS/IRRF/Terceiros) e
 * FGTS Digital que a contabilidade terceirizada envia mensalmente.
 * Permite upload, parse automático dos códigos de tributo, comparativo
 * mês a mês e envio ao financeiro para pagamento.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload, FileText, Eye, Trash2, CheckCircle2, Send, RotateCcw, AlertTriangle,
  Receipt, Building2, Calendar, DollarSign, Calculator, FileCheck, Wallet, Loader2, ChevronDown
} from "lucide-react";

const TIPO_LABEL: Record<string, string> = {
  dctfweb: "DCTFWeb (DARF unificada)",
  fgts: "FGTS Digital",
  outro: "Outro",
};

const TIPO_ICON: Record<string, any> = {
  dctfweb: Receipt,
  fgts: Wallet,
  outro: FileText,
};

const STATUS_LABEL: Record<string, string> = {
  importado: "Importado",
  validado: "Validado",
  enviado_financeiro: "Enviado ao Financeiro",
  pago: "Pago",
};

const STATUS_COLOR: Record<string, string> = {
  importado: "bg-gray-100 text-gray-700 border-gray-300",
  validado: "bg-blue-100 text-blue-700 border-blue-300",
  enviado_financeiro: "bg-amber-100 text-amber-700 border-amber-300",
  pago: "bg-green-100 text-green-700 border-green-300",
};

function formatBRL(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompetencia(comp: string): string {
  if (!comp || comp.length !== 7) return comp;
  const [ano, mes] = comp.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[parseInt(mes) - 1]}/${ano}`;
}

export default function EncargosSociais() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;

  const utils = trpc.useUtils();
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "dctfweb" | "fgts" | "outro">("todos");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "importado" | "validado" | "enviado_financeiro" | "pago">("todos");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detalheId, setDetalheId] = useState<number | null>(null);

  // Upload state
  const [upTipo, setUpTipo] = useState<"dctfweb" | "fgts" | "outro">("dctfweb");
  const [upFile, setUpFile] = useState<File | null>(null);
  const [upCompManual, setUpCompManual] = useState("");
  const [upObs, setUpObs] = useState("");
  const [uploading, setUploading] = useState(false);

  const listQ = trpc.encargosSociais.list.useQuery(
    {
      companyId,
      ...(filtroTipo !== "todos" ? { tipo: filtroTipo } : {}),
      ...(filtroStatus !== "todos" ? { status: filtroStatus } : {}),
    },
    { enabled: companyId > 0 }
  );

  const comparativoQ = trpc.encargosSociais.comparativoMensal.useQuery(
    { companyId, anoInicio: new Date().getFullYear() },
    { enabled: companyId > 0 }
  );

  const detalheQ = trpc.encargosSociais.getById.useQuery(
    { id: detalheId || 0 },
    { enabled: !!detalheId }
  );

  const uploadMut = trpc.encargosSociais.upload.useMutation({
    onSuccess: (data) => {
      toast.success(`Documento importado! Competência: ${formatCompetencia(data.competencia)} · Total: ${formatBRL(data.valorTotal)} · ${data.itensCount} itens.`);
      setUploadOpen(false);
      setUpFile(null);
      setUpCompManual("");
      setUpObs("");
      utils.encargosSociais.list.invalidate();
      utils.encargosSociais.comparativoMensal.invalidate();
    },
    onError: (e) => toast.error(`Erro no upload: ${e.message}`),
  });

  const validarMut = trpc.encargosSociais.validar.useMutation({
    onSuccess: () => { toast.success("Documento validado!"); utils.encargosSociais.list.invalidate(); utils.encargosSociais.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const enviarMut = trpc.encargosSociais.enviarFinanceiro.useMutation({
    onSuccess: () => { toast.success("Enviado ao Financeiro para pagamento!"); utils.encargosSociais.list.invalidate(); utils.encargosSociais.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const desfazerMut = trpc.encargosSociais.desfazer.useMutation({
    onSuccess: () => { toast.success("Status revertido para importado."); utils.encargosSociais.list.invalidate(); utils.encargosSociais.getById.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.encargosSociais.delete.useMutation({
    onSuccess: () => { toast.success("Documento excluído."); utils.encargosSociais.list.invalidate(); utils.encargosSociais.comparativoMensal.invalidate(); setDetalheId(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = (f: File | null) => {
    if (!f) return setUpFile(null);
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Só PDF é aceito.");
      return;
    }
    setUpFile(f);
  };

  const handleUpload = async () => {
    if (!upFile) return toast.error("Selecione um PDF.");
    setUploading(true);
    try {
      // Architect Rev. 2195: converter em chunks pra não estourar argument
      // limit do btoa(String.fromCharCode(...spread)) em PDFs grandes
      // (>~100KB já quebra em alguns browsers).
      const buf = await upFile.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const base64 = btoa(binary);
      await uploadMut.mutateAsync({
        companyId,
        tipo: upTipo,
        fileName: upFile.name,
        fileBase64: base64,
        mimeType: upFile.type || "application/pdf",
        competenciaManual: upCompManual || undefined,
        observacoes: upObs || undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  // KPIs agregados (do ano corrente)
  const kpis = useMemo(() => {
    const data = comparativoQ.data || [];
    const totalAno = data.reduce((s, d) => s + d.total, 0);
    const dctfwebAno = data.reduce((s, d) => s + d.dctfweb, 0);
    const fgtsAno = data.reduce((s, d) => s + d.fgts, 0);
    const mediaMensal = data.length > 0 ? totalAno / data.length : 0;
    return { totalAno, dctfwebAno, fgtsAno, mediaMensal, mesesComDados: data.length };
  }, [comparativoQ.data]);

  if (!companyId) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-7xl mx-auto">
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-semibold">Selecione uma empresa</p>
              <p className="text-sm text-muted-foreground">Escolha uma empresa no topo da página para visualizar os encargos sociais.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const docs = listQ.data || [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-6 w-6 text-[#1B2A4A]" />
              Encargos Sociais sobre Folha
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Conferência mensal das guias DCTFWeb (DARF INSS/IRRF/Terceiros) e FGTS Digital enviadas pela contabilidade.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)} className="bg-[#1B2A4A] hover:bg-[#243456] gap-2">
            <Upload className="h-4 w-4" /> Importar PDF
          </Button>
        </div>

        {/* KPIs do Ano */}
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="border-l-4 border-l-[#1B2A4A]">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total {new Date().getFullYear()}</p>
              <p className="text-2xl font-bold text-[#1B2A4A] mt-1">{formatBRL(kpis.totalAno)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{kpis.mesesComDados} meses com dados</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-600">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">DCTFWeb (DARF)</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{formatBRL(kpis.dctfwebAno)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">INSS + IRRF + Terceiros</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-600">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">FGTS Digital</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{formatBRL(kpis.fgtsAno)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Mensal + Consignado</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-600">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Média Mensal</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{formatBRL(kpis.mediaMensal)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Tributos / mês</p>
            </CardContent>
          </Card>
        </div>

        {/* Comparativo Mensal */}
        {comparativoQ.data && comparativoQ.data.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Evolução Mensal {new Date().getFullYear()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 font-medium">Competência</th>
                      <th className="text-right p-2 font-medium text-blue-700">DCTFWeb</th>
                      <th className="text-right p-2 font-medium text-emerald-700">FGTS</th>
                      <th className="text-right p-2 font-medium text-gray-600">Outros</th>
                      <th className="text-right p-2 font-medium text-[#1B2A4A]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparativoQ.data.map((row) => (
                      <tr key={row.competencia} className="border-t hover:bg-slate-50">
                        <td className="p-2 font-semibold">{formatCompetencia(row.competencia)}</td>
                        <td className="p-2 text-right font-mono">{row.dctfweb > 0 ? formatBRL(row.dctfweb) : "—"}</td>
                        <td className="p-2 text-right font-mono">{row.fgts > 0 ? formatBRL(row.fgts) : "—"}</td>
                        <td className="p-2 text-right font-mono">{row.outro > 0 ? formatBRL(row.outro) : "—"}</td>
                        <td className="p-2 text-right font-mono font-bold text-[#1B2A4A]">{formatBRL(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de Documentos */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Documentos Importados
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filtroTipo} onValueChange={(v: any) => setFiltroTipo(v)}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="dctfweb">DCTFWeb</SelectItem>
                  <SelectItem value="fgts">FGTS</SelectItem>
                  <SelectItem value="outro">Outros</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroStatus} onValueChange={(v: any) => setFiltroStatus(v)}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="importado">Importado</SelectItem>
                  <SelectItem value="validado">Validado</SelectItem>
                  <SelectItem value="enviado_financeiro">Enviado ao Financeiro</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {listQ.isLoading ? (
              <div className="text-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando...</div>
            ) : docs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="font-semibold">Nenhum documento importado</p>
                <p className="text-xs mt-1">Clique em "Importar PDF" pra subir a primeira guia.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 font-medium">Competência</th>
                      <th className="text-left p-2 font-medium">Tipo</th>
                      <th className="text-left p-2 font-medium">Nº Doc</th>
                      <th className="text-left p-2 font-medium">Vencimento</th>
                      <th className="text-right p-2 font-medium">Valor Total</th>
                      <th className="text-center p-2 font-medium">Status</th>
                      <th className="text-center p-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc: any) => {
                      const Icon = TIPO_ICON[doc.tipo] || FileText;
                      return (
                        <tr key={doc.id} className="border-t hover:bg-slate-50">
                          <td className="p-2 font-semibold">{formatCompetencia(doc.competencia)}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs">{TIPO_LABEL[doc.tipo]}</span>
                            </div>
                          </td>
                          <td className="p-2 font-mono text-xs">{doc.numeroDocumento || "—"}</td>
                          <td className="p-2 text-xs">{doc.dataVencimento || "—"}</td>
                          <td className="p-2 text-right font-mono font-semibold">{formatBRL(doc.valorTotalNum)}</td>
                          <td className="p-2 text-center">
                            <Badge variant="outline" className={`text-[10px] ${STATUS_COLOR[doc.status]}`}>
                              {STATUS_LABEL[doc.status]}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetalheId(doc.id)} title="Ver detalhes">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {doc.pdfUrl && (
                                <a href={doc.pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-slate-100" title="Baixar PDF">
                                  <FileCheck className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 hover:bg-red-50" onClick={() => { if (confirm(`Excluir documento de ${formatCompetencia(doc.competencia)}?`)) deleteMut.mutate({ id: doc.id }); }} title="Excluir">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog Upload */}
        <Dialog open={uploadOpen} onOpenChange={(o) => !uploading && setUploadOpen(o)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Importar Guia de Encargos</DialogTitle>
              <DialogDescription>
                Suba o PDF da guia. O sistema detecta competência, valor total e composição automaticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Tipo de Documento</Label>
                <Select value={upTipo} onValueChange={(v: any) => setUpTipo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dctfweb">DCTFWeb / DARF unificada (INSS, IRRF, Terceiros)</SelectItem>
                    <SelectItem value="fgts">FGTS Digital</SelectItem>
                    <SelectItem value="outro">Outro tributo sobre folha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Arquivo PDF</Label>
                <Input type="file" accept=".pdf,application/pdf" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
                {upFile && <p className="text-[10px] text-muted-foreground mt-1">📎 {upFile.name} ({(upFile.size / 1024).toFixed(1)} KB)</p>}
              </div>
              <div>
                <Label className="text-xs">Competência (opcional — auto-detectada do PDF)</Label>
                <Input type="month" value={upCompManual} onChange={(e) => setUpCompManual(e.target.value)} placeholder="2026-04" />
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea value={upObs} onChange={(e) => setUpObs(e.target.value)} rows={2} placeholder="Anotações internas..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
              <Button onClick={handleUpload} disabled={!upFile || uploading} className="bg-[#1B2A4A] hover:bg-[#243456] gap-2">
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4" /> Importar</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog Detalhe */}
        <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {detalheQ.data ? `${TIPO_LABEL[(detalheQ.data as any).tipo]} — ${formatCompetencia((detalheQ.data as any).competencia)}` : "Carregando..."}
              </DialogTitle>
              <DialogDescription>
                Composição detalhada dos tributos extraídos do PDF.
              </DialogDescription>
            </DialogHeader>
            {detalheQ.isLoading ? (
              <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Carregando...</div>
            ) : detalheQ.data ? (
              <div className="space-y-4">
                {/* Resumo */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Nº Documento</p>
                    <p className="text-sm font-mono font-semibold">{(detalheQ.data as any).numeroDocumento || "—"}</p>
                  </div>
                  <div className="border rounded p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Vencimento</p>
                    <p className="text-sm font-semibold">{(detalheQ.data as any).dataVencimento || "—"}</p>
                  </div>
                  <div className="border rounded p-3 bg-[#1B2A4A]/5">
                    <p className="text-[10px] text-muted-foreground uppercase">Valor Total</p>
                    <p className="text-sm font-bold text-[#1B2A4A]">{formatBRL((detalheQ.data as any).valorTotalNum)}</p>
                  </div>
                </div>

                {/* Itens */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Composição</h4>
                  {(detalheQ.data as any).itens && (detalheQ.data as any).itens.length > 0 ? (
                    <div className="overflow-x-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left p-2 font-medium">Código</th>
                            <th className="text-left p-2 font-medium">Denominação</th>
                            <th className="text-right p-2 font-medium">Principal</th>
                            <th className="text-right p-2 font-medium">Multa</th>
                            <th className="text-right p-2 font-medium">Juros</th>
                            <th className="text-right p-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detalheQ.data as any).itens.map((it: any, idx: number) => (
                            <tr key={idx} className="border-t hover:bg-slate-50">
                              <td className="p-2 font-mono font-semibold">{it.codigo}</td>
                              <td className="p-2">{it.denominacao}</td>
                              <td className="p-2 text-right font-mono">{formatBRL(it.principal)}</td>
                              <td className="p-2 text-right font-mono text-muted-foreground">{it.multa > 0 ? formatBRL(it.multa) : "—"}</td>
                              <td className="p-2 text-right font-mono text-muted-foreground">{it.juros > 0 ? formatBRL(it.juros) : "—"}</td>
                              <td className="p-2 text-right font-mono font-semibold">{formatBRL(it.total)}</td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-[#1B2A4A] bg-[#1B2A4A]/5">
                            <td colSpan={5} className="p-2 text-right font-semibold">TOTAL</td>
                            <td className="p-2 text-right font-mono font-bold text-[#1B2A4A]">{formatBRL((detalheQ.data as any).valorTotalNum)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-xs text-muted-foreground border rounded">
                      Não foi possível extrair a composição automaticamente. PDF disponível para download.
                    </div>
                  )}
                </div>

                {/* Status + Trilha */}
                <div className="border rounded p-3 bg-slate-50/50 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status atual:</span>
                    <Badge variant="outline" className={STATUS_COLOR[(detalheQ.data as any).status]}>{STATUS_LABEL[(detalheQ.data as any).status]}</Badge>
                  </div>
                  {(detalheQ.data as any).uploadedPor && (
                    <p className="text-muted-foreground">📥 Importado por <strong>{(detalheQ.data as any).uploadedPor}</strong> em {(detalheQ.data as any).uploadedEm ? new Date((detalheQ.data as any).uploadedEm).toLocaleString("pt-BR") : "—"}</p>
                  )}
                  {(detalheQ.data as any).validadoPor && (
                    <p className="text-blue-700">✅ Validado por <strong>{(detalheQ.data as any).validadoPor}</strong> em {(detalheQ.data as any).validadoEm ? new Date((detalheQ.data as any).validadoEm).toLocaleString("pt-BR") : "—"}</p>
                  )}
                  {(detalheQ.data as any).enviadoFinanceiroPor && (
                    <p className="text-amber-700">📤 Enviado ao Financeiro por <strong>{(detalheQ.data as any).enviadoFinanceiroPor}</strong> em {(detalheQ.data as any).enviadoFinanceiroEm ? new Date((detalheQ.data as any).enviadoFinanceiroEm).toLocaleString("pt-BR") : "—"}</p>
                  )}
                </div>
              </div>
            ) : null}
            <DialogFooter className="gap-2 flex-wrap">
              {detalheQ.data && (detalheQ.data as any).pdfUrl && (
                <a href={(detalheQ.data as any).pdfUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2"><FileCheck className="h-4 w-4" /> Baixar PDF</Button>
                </a>
              )}
              {detalheQ.data && (detalheQ.data as any).status === "importado" && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-2" onClick={() => validarMut.mutate({ id: detalheId! })} disabled={validarMut.isPending}>
                  <CheckCircle2 className="h-4 w-4" /> Validar
                </Button>
              )}
              {detalheQ.data && (detalheQ.data as any).status === "validado" && (
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-2" onClick={() => enviarMut.mutate({ id: detalheId! })} disabled={enviarMut.isPending}>
                  <Send className="h-4 w-4" /> Enviar ao Financeiro
                </Button>
              )}
              {detalheQ.data && ((detalheQ.data as any).status === "validado" || (detalheQ.data as any).status === "enviado_financeiro") && (
                <Button size="sm" variant="outline" className="gap-2" onClick={() => desfazerMut.mutate({ id: detalheId! })} disabled={desfazerMut.isPending}>
                  <RotateCcw className="h-4 w-4" /> Desfazer
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setDetalheId(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
