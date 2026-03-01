import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Globe, Upload, CheckCircle, XCircle, AlertTriangle, Search, Building2,
  FileText, Eye, Link2, Copy, ExternalLink, Shield, Clock, Send
} from "lucide-react";

export default function PortalTerceiro() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const [search, setSearch] = useState("");
  const [selectedEmpresa, setSelectedEmpresa] = useState<any>(null);
  const [simulacaoOpen, setSimulacaoOpen] = useState(false);
  const [simulacaoEmpresa, setSimulacaoEmpresa] = useState<any>(null);
  const [competencia, setCompetencia] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: empresasData, isLoading } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const { data: obrigacoesData, refetch: refetchObrigacoes } = trpc.terceiros.obrigacoes.list.useQuery(
    { companyId: companyId ?? 0, competencia },
    { enabled: !!companyId }
  );

  const uploadMutation = trpc.terceiros.obrigacoes.uploadDoc.useMutation({
    onSuccess: () => { toast.success("Documento enviado com sucesso"); refetchObrigacoes(); },
    onError: () => toast.error("Erro ao enviar documento"),
  });

  const createObrigacaoMutation = trpc.terceiros.obrigacoes.create.useMutation({
    onSuccess: () => { toast.success("Obrigação mensal criada"); refetchObrigacoes(); },
    onError: () => toast.error("Erro ao criar obrigação"),
  });

  const empresas = useMemo(() => {
    if (!empresasData) return [];
    if (!search) return empresasData;
    return empresasData.filter((e: any) =>
      e.razaoSocial?.toLowerCase().includes(search.toLowerCase()) ||
      e.cnpj?.includes(search)
    );
  }, [empresasData, search]);

  const getObrigacao = (empresaId: number) => {
    if (!obrigacoesData) return null;
    return (obrigacoesData as any[]).find((o: any) => o.empresaTerceiraId === empresaId);
  };

  const handleFileUpload = async (obrigacaoId: number, field: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        obrigacaoId,
        field,
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCriarObrigacao = (empresaId: number) => {
    if (!companyId) return;
    createObrigacaoMutation.mutate({
      empresaTerceiraId: empresaId,
      companyId,
      competencia,
    });
  };

  const generatePortalLink = (empresa: any) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/portal-terceiro/${empresa.id}?token=${btoa(`${empresa.id}-${empresa.cnpj}`)}`;
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência");
  };

  const docFields = [
    { field: "fgtsUrl", statusField: "fgtsStatus", label: "Guia FGTS" },
    { field: "inssUrl", statusField: "inssStatus", label: "Guia INSS" },
    { field: "folhaPagamentoUrl", statusField: "folhaPagamentoStatus", label: "Folha de Pagamento" },
    { field: "comprovantePagamentoUrl", statusField: "comprovantePagamentoStatus", label: "Comprovante Pgto" },
    { field: "gpsUrl", statusField: "gpsStatus", label: "GPS" },
    { field: "cndUrl", statusField: "cndStatus", label: "CND" },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: string; icon: any }> = {
      pendente: { label: "Pendente", variant: "secondary", icon: <Clock className="w-3 h-3 mr-1" /> },
      enviado: { label: "Enviado", variant: "outline", icon: <Upload className="w-3 h-3 mr-1" /> },
      aprovado: { label: "Aprovado", variant: "default", icon: <CheckCircle className="w-3 h-3 mr-1" /> },
      rejeitado: { label: "Rejeitado", variant: "destructive", icon: <XCircle className="w-3 h-3 mr-1" /> },
    };
    const s = map[status] || map.pendente;
    return (
      <Badge variant={s.variant as any} className={`text-xs ${status === "aprovado" ? "bg-green-100 text-green-700 border-green-200" : ""}`}>
        {s.icon} {s.label}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Globe className="w-7 h-7 text-orange-500" /> Portal Externo do Terceiro
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Gestão de acesso externo e upload de documentos mensais</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Competência:</label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-[180px]" />
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
          <Shield className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-orange-800">Portal de Acesso Externo</p>
            <p className="text-xs text-orange-600 mt-1">
              Cada empresa terceira recebe um link exclusivo para enviar seus documentos mensais (FGTS, INSS, Folha, etc.).
              O link pode ser compartilhado por e-mail ou WhatsApp. Aqui você gerencia os acessos e visualiza os documentos enviados.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar empresa terceira..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* Empresa List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3"></div>
            Carregando...
          </div>
        ) : empresas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            Nenhuma empresa terceira encontrada
          </div>
        ) : (
          <div className="space-y-3">
            {empresas.map((empresa: any) => {
              const obrigacao = getObrigacao(empresa.id);
              const portalLink = generatePortalLink(empresa);
              return (
                <div key={empresa.id} className="bg-card border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{empresa.razaoSocial}</h3>
                        <Badge variant="outline" className="text-xs">
                          {empresa.status === "ativa" ? "Ativa" : empresa.status === "suspensa" ? "Suspensa" : "Inativa"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">CNPJ: {empresa.cnpj} | E-mail: {empresa.email || "Não informado"}</p>

                      {/* Portal Link */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 bg-background border rounded-md px-3 py-1.5 text-xs max-w-md truncate">
                          <Link2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          <span className="truncate">{portalLink}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => copyLink(portalLink)}>
                          <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
                        </Button>
                      </div>

                      {/* Obrigação Status */}
                      {obrigacao ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {docFields.map(({ statusField, label }) => (
                            <div key={statusField} className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">{label}:</span>
                              {statusBadge((obrigacao as any)[statusField])}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          <span className="text-xs text-yellow-600">Obrigação mensal não criada para {competencia}</span>
                          <Button variant="outline" size="sm" onClick={() => handleCriarObrigacao(empresa.id)} disabled={createObrigacaoMutation.isPending}>
                            Criar Obrigação
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => { setSimulacaoEmpresa(empresa); setSimulacaoOpen(true); }}>
                        <ExternalLink className="w-4 h-4 mr-1" /> Simular Portal
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Simulação Portal Dialog */}
        <FullScreenDialog
          open={simulacaoOpen}
          onClose={() => { setSimulacaoOpen(false); setSimulacaoEmpresa(null); }}
          title={`Portal - ${simulacaoEmpresa?.razaoSocial || ""}`}
          subtitle={`Simulação do portal externo | Competência: ${competencia}`}
          icon={<Globe className="w-5 h-5" />}
          headerColor="bg-gradient-to-r from-orange-600 to-orange-400"
        >
          {simulacaoEmpresa && (
            <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
              {/* Welcome Banner */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-5 text-center">
                <Building2 className="w-10 h-10 mx-auto text-orange-500 mb-2" />
                <h2 className="text-lg font-bold text-orange-800">Bem-vindo ao Portal do Terceiro</h2>
                <p className="text-sm text-orange-600 mt-1">{simulacaoEmpresa.razaoSocial}</p>
                <p className="text-xs text-muted-foreground mt-2">Envie seus documentos mensais abaixo para a competência <strong>{competencia}</strong></p>
              </div>

              {/* Upload Section */}
              {(() => {
                const obrigacao = getObrigacao(simulacaoEmpresa.id);
                if (!obrigacao) {
                  return (
                    <div className="text-center py-8">
                      <AlertTriangle className="w-10 h-10 mx-auto text-yellow-500 mb-3" />
                      <p className="text-sm text-muted-foreground">Obrigação mensal não criada para esta competência</p>
                      <Button className="mt-3 bg-orange-600 hover:bg-orange-700" onClick={() => handleCriarObrigacao(simulacaoEmpresa.id)} disabled={createObrigacaoMutation.isPending}>
                        Criar Obrigação para {competencia}
                      </Button>
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                      <Upload className="w-5 h-5 text-orange-500" /> Documentos Mensais
                    </h3>
                    {docFields.map(({ field, statusField, label }) => (
                      <div key={field} className="bg-card border rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <span className="font-medium text-sm">{label}</span>
                              <div className="mt-1">{statusBadge((obrigacao as any)[statusField])}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {(obrigacao as any)[field] && (
                              <a href={(obrigacao as any)[field]} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                                <Eye className="w-4 h-4" />
                              </a>
                            )}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleFileUpload((obrigacao as any).id, field, f);
                                }}
                              />
                              <div className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-md text-sm transition-colors">
                                <Upload className="w-4 h-4" />
                                {(obrigacao as any)[field] ? "Reenviar" : "Enviar"}
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                    {uploadMutation.isPending && (
                      <div className="text-center py-3 text-sm text-orange-600">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500 mx-auto mb-2"></div>
                        Enviando documento...
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </FullScreenDialog>
      </div>
    </DashboardLayout>
  );
}
