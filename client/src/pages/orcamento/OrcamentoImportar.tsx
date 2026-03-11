import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Upload, FileSpreadsheet, X, AlertCircle,
  CheckCircle, Loader2, Calculator, FileText,
  Building2, MapPin, Search, ChevronRight, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      res(base64);
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

const EXCEL_EXTS = [".xlsx", ".xls", ".xlsm", ".xlsb"];
const EXCEL_ACCEPT = EXCEL_EXTS.join(",");

function isExcelFile(name: string) {
  return EXCEL_EXTS.some(ext => name.toLowerCase().endsWith(ext));
}

function DropZone({ file, onFile, accept = EXCEL_ACCEPT, inputId }: {
  file: File | null;
  onFile: (f: File) => void;
  accept?: string;
  inputId: string;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isExcelFile(dropped.name)) {
      onFile(dropped);
    } else {
      toast.error("Formato inválido. Envie um arquivo Excel (.xlsx, .xls, .xlsm, .xlsb)");
    }
  }, [onFile]);

  if (file) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted border">
        <FileSpreadsheet className="h-8 w-8 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
        </div>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onFile(null as any)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
        ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
      onClick={() => document.getElementById(inputId)?.click()}
    >
      <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">
        Arraste o arquivo aqui ou{" "}
        <span className="text-primary underline cursor-pointer">clique para selecionar</span>
      </p>
      <p className="text-muted-foreground/60 text-xs mt-1">Formatos: .xlsx, .xls, .xlsm, .xlsb</p>
      <input id={inputId} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  Planejamento: "Planejamento",
  Em_Andamento: "Em Andamento",
  Paralisada: "Paralisada",
  Concluida: "Concluída",
  Cancelada: "Cancelada",
};

export default function OrcamentoImportar() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [, navigate] = useLocation();

  const [step, setStep] = useState<1 | 2>(1);
  const [busca, setBusca] = useState("");
  const [selectedObra, setSelectedObra] = useState<any>(null);

  const [fileOrc, setFileOrc] = useState<File | null>(null);
  const [fileBdi, setFileBdi] = useState<File | null>(null);
  const [metaPerc, setMetaPerc] = useState(20);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingBdi, setIsUploadingBdi] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [resultadoBdi, setResultadoBdi] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroBdi, setErroBdi] = useState<string | null>(null);
  const [orcamentoIdBdi, setOrcamentoIdBdi] = useState<string>("");

  const { data: obras = [] } = trpc.obras.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const { data: listaOrc = [] } = trpc.orcamento.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const importarMutation = trpc.orcamento.importar.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setIsUploading(false);
      toast.success("Planilha importada com sucesso!");
    },
    onError: (e) => {
      setErro(e.message);
      setIsUploading(false);
      toast.error(e.message || "Erro na importação");
    },
  });

  const importarBdiMutation = trpc.orcamento.importarBdi.useMutation({
    onSuccess: (data) => {
      setResultadoBdi(data);
      setIsUploadingBdi(false);
      toast.success("BDI importado com sucesso!");
    },
    onError: (e) => {
      setErroBdi(e.message);
      setIsUploadingBdi(false);
      toast.error(e.message || "Erro na importação do BDI");
    },
  });

  const handleImportar = async () => {
    if (!fileOrc || !companyId) return;
    setIsUploading(true);
    setErro(null);
    try {
      const base64 = await fileToBase64(fileOrc);
      await importarMutation.mutateAsync({
        companyId,
        fileBase64: base64,
        fileName: fileOrc.name,
        metaPercentual: metaPerc / 100,
        userName: (user as any)?.name || (user as any)?.email || "Sistema",
        obraId: selectedObra?.id ?? undefined,
      });
    } catch {
      setIsUploading(false);
    }
  };

  const handleImportarBdi = async () => {
    if (!fileBdi || !companyId || !orcamentoIdBdi) return;
    setIsUploadingBdi(true);
    setErroBdi(null);
    try {
      const base64 = await fileToBase64(fileBdi);
      await importarBdiMutation.mutateAsync({
        companyId,
        orcamentoId: parseInt(orcamentoIdBdi),
        fileBase64: base64,
        fileName: fileBdi.name,
      });
    } catch {
      setIsUploadingBdi(false);
    }
  };

  const obrasFiltradas = obras.filter((o: any) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (
      (o.nome || "").toLowerCase().includes(q) ||
      (o.numOrcamento || "").toLowerCase().includes(q) ||
      (o.endereco || "").toLowerCase().includes(q)
    );
  });

  if (resultado) {
    return (
      <DashboardLayout>
        <div className="max-w-xl mx-auto space-y-6 pt-6 p-4">
          <Card className="border-green-200">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-green-50">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
              </div>
              <h2 className="text-xl font-bold">Importação concluída!</h2>
              {selectedObra && (
                <p className="text-sm text-muted-foreground">
                  Vinculado à obra: <span className="font-medium text-foreground">{selectedObra.nome}</span>
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">{resultado.itemCount}</span> itens importados com sucesso.
              </p>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Venda</p>
                  <p className="text-sm font-bold text-green-600">{formatBRL(resultado.totalVenda)}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Custo</p>
                  <p className="text-sm font-bold text-amber-600">{formatBRL(resultado.totalCusto)}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Meta</p>
                  <p className="text-sm font-bold text-purple-600">{formatBRL(resultado.totalMeta)}</p>
                </div>
              </div>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" onClick={() => {
                  setResultado(null); setFileOrc(null);
                  setStep(1); setSelectedObra(null); setBusca("");
                }}>
                  Novo Orçamento
                </Button>
                <Button onClick={() => navigate(`/orcamento/${resultado.id}`)}>
                  Ver Orçamento <Calculator className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6 pt-4 p-4">

        {/* Indicador de etapas */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (step === 2) setStep(1); else navigate("/orcamento"); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className={`flex items-center gap-1.5 ${step === 1 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                ${step === 1 ? "border-primary bg-primary text-white" : step === 2 ? "border-green-500 bg-green-500 text-white" : "border-border"}`}>
                {step === 2 ? <CheckCircle className="h-3.5 w-3.5" /> : "1"}
              </span>
              <span className="text-sm hidden sm:inline">Selecionar Obra</span>
            </div>
            <div className="flex-1 h-px bg-border mx-1" />
            <div className={`flex items-center gap-1.5 ${step === 2 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2
                ${step === 2 ? "border-primary bg-primary text-white" : "border-border"}`}>
                2
              </span>
              <span className="text-sm hidden sm:inline">Upload das Planilhas</span>
            </div>
          </div>
        </div>

        {/* ── ETAPA 1: Selecionar Obra ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Selecionar Obra</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Escolha a obra à qual este orçamento será vinculado
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar obra por nome, nº orçamento ou endereço..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>

            {obras.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Nenhuma obra cadastrada ainda.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/obras")}>
                    Cadastrar Obra
                  </Button>
                </CardContent>
              </Card>
            ) : obrasFiltradas.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">Nenhuma obra encontrada para "{busca}".</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {obrasFiltradas.map((obra: any) => (
                  <button
                    key={obra.id}
                    onClick={() => setSelectedObra(obra)}
                    className={`w-full text-left rounded-xl border p-4 transition-all hover:shadow-sm
                      ${selectedObra?.id === obra.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/40"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{obra.nome}</span>
                          {obra.numOrcamento && (
                            <span className="text-xs text-muted-foreground font-mono">#{obra.numOrcamento}</span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {STATUS_LABELS[obra.status] ?? obra.status}
                          </Badge>
                        </div>
                        {obra.endereco && (
                          <div className="flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs text-muted-foreground truncate">{obra.endereco}</span>
                          </div>
                        )}
                        {(obra.dataInicio || obra.dataPrevisaoFim) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {obra.dataInicio && <>Início: {obra.dataInicio}</>}
                            {obra.dataInicio && obra.dataPrevisaoFim && " · "}
                            {obra.dataPrevisaoFim && <>Término: {obra.dataPrevisaoFim}</>}
                          </p>
                        )}
                      </div>
                      {selectedObra?.id === obra.id && (
                        <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Continuar sem vincular obra
              </button>
              <Button
                onClick={() => { if (selectedObra) setStep(2); }}
                disabled={!selectedObra}
                className="gap-2"
              >
                Próximo: Upload das Planilhas <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── ETAPA 2: Upload das Planilhas ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Upload das Planilhas</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Importe a planilha de orçamento e/ou o BDI
              </p>
            </div>

            {/* Obra selecionada */}
            {selectedObra ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedObra.nome}</p>
                  {selectedObra.endereco && (
                    <p className="text-xs text-muted-foreground truncate">{selectedObra.endereco}</p>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedObra(null); setStep(1); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-dashed text-muted-foreground text-sm">
                <Building2 className="h-4 w-4 shrink-0" />
                Sem obra vinculada —
                <button onClick={() => setStep(1)} className="underline hover:text-foreground">
                  selecionar obra
                </button>
              </div>
            )}

            <Tabs defaultValue="orcamento">
              <TabsList className="w-full">
                <TabsTrigger value="orcamento" className="flex-1 gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Planilha Orçamento
                </TabsTrigger>
                <TabsTrigger value="bdi" className="flex-1 gap-2">
                  <FileText className="h-4 w-4" /> Planilha BDI
                </TabsTrigger>
              </TabsList>

              {/* ABA ORÇAMENTO */}
              <TabsContent value="orcamento" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Arquivo Excel — Orçamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DropZone file={fileOrc} onFile={f => { setFileOrc(f); setErro(null); }} inputId="file-input-orc" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Percentual de Meta (desconto sobre custo)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Slider min={1} max={50} step={1} value={[metaPerc]}
                          onValueChange={([v]) => setMetaPerc(v)} className="w-full" />
                      </div>
                      <div className="w-20 shrink-0">
                        <Input type="number" min={1} max={50} value={metaPerc}
                          onChange={e => setMetaPerc(Math.min(50, Math.max(1, Number(e.target.value))))}
                          className="text-center font-bold" />
                      </div>
                      <span className="text-muted-foreground text-sm shrink-0">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Meta = Custo × (1 − {metaPerc}%). Padrão: 20%.
                    </p>
                  </CardContent>
                </Card>

                {erro && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{erro}</p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handleImportar} disabled={!fileOrc || isUploading || !companyId} className="gap-2 min-w-[160px]">
                    {isUploading
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                      : <><Upload className="h-4 w-4" /> Importar Orçamento</>}
                  </Button>
                </div>

                <Card className="bg-muted/30">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Estrutura esperada</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li>• Aba <span className="font-medium text-foreground">Orçamento</span>: colunas 9=nível, 10=item EAP, 14=tipo, 15=descrição, 16=unidade, 17=qtd</li>
                      <li>• Colunas de custo: 18=custo mat., 20=custo MO, 30=total mat., 31=total MO, 32=total custo</li>
                      <li>• Aba <span className="font-medium text-foreground">BDI</span> (opcional): linha B-02 = %BDI total</li>
                      <li>• Aba <span className="font-medium text-foreground">Insumos</span> (opcional): gera curva ABC automaticamente</li>
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ABA BDI */}
              <TabsContent value="bdi" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Selecionar Orçamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {listaOrc.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        Nenhum orçamento disponível. Importe um orçamento primeiro na aba ao lado.
                      </p>
                    ) : (
                      <select
                        value={orcamentoIdBdi}
                        onChange={e => setOrcamentoIdBdi(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">— Selecione o orçamento —</option>
                        {listaOrc.map((o: any) => (
                          <option key={o.id} value={o.id}>
                            {o.codigo} {o.revisao ? `· ${o.revisao}` : ""} {o.cliente ? `· ${o.cliente}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Arquivo Excel — BDI</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DropZone file={fileBdi} onFile={f => { setFileBdi(f); setErroBdi(null); }} inputId="file-input-bdi" />
                  </CardContent>
                </Card>

                {resultadoBdi && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800">BDI importado com sucesso!</p>
                      <p className="text-xs text-green-600 mt-0.5">
                        {resultadoBdi.linhasCount} linhas · BDI total: {(resultadoBdi.bdiPercentual * 100).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                )}

                {erroBdi && (
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{erroBdi}</p>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={handleImportarBdi}
                    disabled={!fileBdi || isUploadingBdi || !companyId || !orcamentoIdBdi}
                    className="gap-2 min-w-[160px]"
                  >
                    {isUploadingBdi
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                      : <><Upload className="h-4 w-4" /> Importar BDI</>}
                  </Button>
                </div>

                <Card className="bg-muted/30">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">Estrutura esperada do BDI</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li>• Aba <span className="font-medium text-foreground">BDI</span>: linhas com código (col 2), descrição (col 3) e percentual (col 7)</li>
                      <li>• Linha <span className="font-medium text-foreground">B-02</span> = %BDI total (obrigatório)</li>
                      <li>• O BDI será vinculado ao orçamento selecionado acima</li>
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

      </div>
    </DashboardLayout>
  );
}
