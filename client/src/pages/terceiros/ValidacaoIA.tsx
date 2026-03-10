import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Brain, ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  FileSearch, Loader2, Building2, Calendar, FileText, Info, Zap
} from "lucide-react";
import { toast } from "sonner";

const DOC_LABELS: Record<string, string> = {
  fgts: "FGTS",
  inss: "INSS",
  folhaPagamento: "Folha de Pagamento",
  comprovantePagamento: "Comprovante de Pagamento",
  gps: "GPS",
  cnd: "CND",
};

const DOC_FIELDS = ["fgts", "inss", "folhaPagamento", "comprovantePagamento", "gps", "cnd"];

type ValidationResult = {
  valido: boolean;
  tipoDetectado: string;
  empresa: string;
  competencia: string;
  valor: string;
  observacoes: string[];
  alertas: string[];
  confianca: number;
};

export default function ValidacaoIA() {
  const [, navigate] = useLocation();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [open, setOpen] = useState(true);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");
  const [selectedCompetencia, setSelectedCompetencia] = useState<string>("");
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [validatingAll, setValidatingAll] = useState(false);

  const { data: empresas } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const { data: obrigacoes } = trpc.terceiros.obrigacoes.list.useQuery(
    { companyId: companyId ?? 0, empresaTerceiraId: selectedEmpresa ? parseInt(selectedEmpresa) : undefined },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const validarMut = trpc.terceiros.ia.validarDocumento.useMutation();

  const competencias = useMemo(() => {
    if (!obrigacoes) return [];
    const set = new Set(obrigacoes.map((o: any) => o.competencia));
    return Array.from(set).sort().reverse();
  }, [obrigacoes]);

  const selectedObrigacao = useMemo(() => {
    if (!obrigacoes || !selectedCompetencia) return null;
    return obrigacoes.find((o: any) => o.competencia === selectedCompetencia && (!selectedEmpresa || o.empresaTerceiraId === parseInt(selectedEmpresa)));
  }, [obrigacoes, selectedCompetencia, selectedEmpresa]);

  const empresaNome = useMemo(() => {
    if (!empresas || !selectedEmpresa) return "";
    const emp = empresas.find((e: any) => e.id === parseInt(selectedEmpresa));
    return emp?.razaoSocial || emp?.nomeFantasia || "";
  }, [empresas, selectedEmpresa]);

  const handleValidar = async (field: string) => {
    if (!selectedObrigacao) return;
    const urlField = `${field}Url`;
    const url = (selectedObrigacao as any)[urlField];
    if (!url) {
      toast.error(`Nenhum documento de ${DOC_LABELS[field]} enviado para validar.`);
      return;
    }
    setValidating(field);
    try {
      const result = await validarMut.mutateAsync({
        documentoUrl: url,
        tipoDocumento: DOC_LABELS[field],
        empresaNome,
        competencia: selectedCompetencia,
      });
      setValidationResults(prev => ({ ...prev, [field]: result }));
      if (result.valido) {
        toast.success(`${DOC_LABELS[field]} validado com sucesso!`);
      } else {
        toast.warning(`${DOC_LABELS[field]}: inconsistências detectadas.`);
      }
    } catch {
      toast.error(`Erro ao validar ${DOC_LABELS[field]}.`);
    } finally {
      setValidating(null);
    }
  };

  const handleValidarTodos = async () => {
    if (!selectedObrigacao) return;
    setValidatingAll(true);
    for (const field of DOC_FIELDS) {
      const urlField = `${field}Url`;
      const url = (selectedObrigacao as any)[urlField];
      if (url) {
        setValidating(field);
        try {
          const result = await validarMut.mutateAsync({
            documentoUrl: url,
            tipoDocumento: DOC_LABELS[field],
            empresaNome,
            competencia: selectedCompetencia,
          });
          setValidationResults(prev => ({ ...prev, [field]: result }));
        } catch { /* continue */ }
        setValidating(null);
      }
    }
    setValidatingAll(false);
    toast.success("Validação em lote concluída!");
  };

  const totalDocs = selectedObrigacao ? DOC_FIELDS.filter(f => (selectedObrigacao as any)[`${f}Url`]).length : 0;
  const validados = Object.keys(validationResults).length;
  const validos = Object.values(validationResults).filter(r => r.valido).length;

  return (
    <FullScreenDialog
      open={open}
      onClose={() => { setOpen(false); navigate("/terceiros/painel"); }}
      title="Validação IA de Documentos"
      icon={<Brain className="h-5 w-5 text-white" />}
      headerColor="bg-gradient-to-r from-violet-700 to-purple-500"
    >
      <div className="w-full space-y-6 py-2">
        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Empresa Terceira</label>
            <Select value={selectedEmpresa || "all"} onValueChange={v => { setSelectedEmpresa(v === "all" ? "" : v); setValidationResults({}); }}>
              <SelectTrigger className="bg-input"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {empresas?.map((e: any) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.nomeFantasia || e.razaoSocial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Competência</label>
            <Select value={selectedCompetencia || "none"} onValueChange={v => { setSelectedCompetencia(v === "none" ? "" : v); setValidationResults({}); }}>
              <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecione</SelectItem>
                {competencias.map((c: string) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleValidarTodos}
              disabled={!selectedObrigacao || validatingAll || totalDocs === 0}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              {validatingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Validar Todos com IA
            </Button>
          </div>
        </div>

        {/* Resumo */}
        {validados > 0 && (
          <div className="bg-muted/30 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">Progresso da Validação</span>
              <span className="text-xs text-muted-foreground">{validados}/{totalDocs} documentos analisados</span>
            </div>
            <Progress value={totalDocs > 0 ? (validados / totalDocs) * 100 : 0} className="h-2 mb-3" />
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span>{validos} válidos</span>
              </div>
              <div className="flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                <span>{validados - validos} com alertas</span>
              </div>
            </div>
          </div>
        )}

        {/* Documentos */}
        {!selectedObrigacao ? (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Selecione uma empresa e competência</p>
            <p className="text-xs mt-1">A IA irá analisar os documentos enviados e verificar consistência.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {DOC_FIELDS.map(field => {
              const urlField = `${field}Url`;
              const statusField = `${field}Status`;
              const url = (selectedObrigacao as any)[urlField];
              const status = (selectedObrigacao as any)[statusField];
              const result = validationResults[field];
              const isValidating = validating === field;

              return (
                <div key={field} className="bg-muted/20 rounded-lg border border-border overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          result ? (result.valido ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') :
                          url ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {result ? (result.valido ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />) :
                           url ? <FileText className="h-5 w-5" /> : <FileSearch className="h-5 w-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{DOC_LABELS[field]}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant={status === "aprovado" ? "default" : status === "enviado" ? "secondary" : "outline"} className="text-[10px]">
                              {status}
                            </Badge>
                            {result && (
                              <span className="text-[10px] text-muted-foreground">
                                Confiança: {result.confianca}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {url && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(url, "_blank")}>
                            <FileSearch className="h-3.5 w-3.5 mr-1" /> Ver
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleValidar(field)}
                          disabled={!url || isValidating}
                          className={url ? "border-violet-300 text-violet-700 hover:bg-violet-50" : ""}
                        >
                          {isValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
                          {isValidating ? "Analisando..." : "Validar IA"}
                        </Button>
                      </div>
                    </div>

                    {/* Resultado da validação */}
                    {result && (
                      <>
                        <Separator className="my-3" />
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-muted-foreground">Tipo Detectado</span>
                              <p className="font-medium">{result.tipoDetectado}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Empresa</span>
                              <p className="font-medium">{result.empresa}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Competência</span>
                              <p className="font-medium">{result.competencia}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Valor</span>
                              <p className="font-medium">{result.valor}</p>
                            </div>
                          </div>

                          {result.observacoes.length > 0 && (
                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2">
                              <div className="flex items-center gap-1 mb-1">
                                <Info className="h-3 w-3 text-blue-600" />
                                <span className="text-[10px] font-semibold text-blue-700">Observações</span>
                              </div>
                              {result.observacoes.map((obs, i) => (
                                <p key={i} className="text-[11px] text-blue-800 dark:text-blue-300">{obs}</p>
                              ))}
                            </div>
                          )}

                          {result.alertas.length > 0 && (
                            <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                              <div className="flex items-center gap-1 mb-1">
                                <AlertTriangle className="h-3 w-3 text-amber-600" />
                                <span className="text-[10px] font-semibold text-amber-700">Alertas</span>
                              </div>
                              {result.alertas.map((alerta, i) => (
                                <p key={i} className="text-[11px] text-amber-800 dark:text-amber-300">{alerta}</p>
                              ))}
                            </div>
                          )}

                          {/* Barra de confiança */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">Confiança:</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  result.confianca >= 80 ? 'bg-green-500' :
                                  result.confianca >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${result.confianca}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${
                              result.confianca >= 80 ? 'text-green-600' :
                              result.confianca >= 50 ? 'text-amber-600' : 'text-red-600'
                            }`}>{result.confianca}%</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FullScreenDialog>
  );
}
