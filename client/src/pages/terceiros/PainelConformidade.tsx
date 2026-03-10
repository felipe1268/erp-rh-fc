import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, CheckCircle, XCircle, AlertTriangle, Search, FileText,
  Building2, Users, ClipboardCheck, Eye, Lock, Unlock, Printer
} from "lucide-react";

export default function PainelConformidade() {
  const { user } = useAuth();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? parseInt(selectedCompanyId, 10) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "conforme" | "nao_conforme">("todos");
  const [selectedEmpresa, setSelectedEmpresa] = useState<any>(null);

  const { data, isLoading } = trpc.terceiros.conformidade.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const empresas = useMemo(() => {
    if (!data?.empresas) return [];
    let filtered = data.empresas;
    if (search) {
      filtered = filtered.filter((e: any) =>
        e.empresa.razaoSocial?.toLowerCase().includes(search.toLowerCase()) ||
        e.empresa.cnpj?.includes(search)
      );
    }
    if (filtroStatus === "conforme") filtered = filtered.filter((e: any) => e.conformeGeral);
    if (filtroStatus === "nao_conforme") filtered = filtered.filter((e: any) => !e.conformeGeral);
    return filtered;
  }, [data, search, filtroStatus]);

  const totalEmpresas = data?.empresas?.length || 0;
  const totalConformes = data?.empresas?.filter((e: any) => e.conformeGeral).length || 0;
  const totalNaoConformes = totalEmpresas - totalConformes;
  const percentConformidade = totalEmpresas > 0 ? Math.round((totalConformes / totalEmpresas) * 100) : 0;

  const statusIcon = (status: string) => {
    if (status === "ok") return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (status === "vencido") return <XCircle className="w-4 h-4 text-red-500" />;
    return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  };

  const statusLabel = (status: string) => {
    if (status === "ok") return "OK";
    if (status === "vencido") return "Vencido";
    return "Pendente";
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-orange-500" /> Painel de Conformidade
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Visão consolidada para liberação de medição de obras</p>
          </div>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Imprimir
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-orange-300 transition-colors"
            onClick={() => setFiltroStatus("todos")}>
            <Building2 className="w-6 h-6 mx-auto text-orange-500 mb-2" />
            <div className="text-2xl font-bold">{totalEmpresas}</div>
            <div className="text-xs text-muted-foreground">Total Terceiros</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-green-300 transition-colors"
            onClick={() => setFiltroStatus("conforme")}>
            <Unlock className="w-6 h-6 mx-auto text-green-500 mb-2" />
            <div className="text-2xl font-bold text-green-600">{totalConformes}</div>
            <div className="text-xs text-muted-foreground">Medição Liberada</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-red-300 transition-colors"
            onClick={() => setFiltroStatus("nao_conforme")}>
            <Lock className="w-6 h-6 mx-auto text-red-500 mb-2" />
            <div className="text-2xl font-bold text-red-600">{totalNaoConformes}</div>
            <div className="text-xs text-muted-foreground">Medição Bloqueada</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center">
            <ShieldCheck className="w-6 h-6 mx-auto text-blue-500 mb-2" />
            <div className="text-2xl font-bold text-blue-600">{percentConformidade}%</div>
            <div className="text-xs text-muted-foreground">Índice Conformidade</div>
            <Progress value={percentConformidade} className="mt-2 h-2" />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por razão social ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex gap-2">
            {(["todos", "conforme", "nao_conforme"] as const).map((s) => (
              <Button key={s} variant={filtroStatus === s ? "default" : "outline"} size="sm"
                onClick={() => setFiltroStatus(s)}
                className={filtroStatus === s ? (s === "conforme" ? "bg-green-600 hover:bg-green-700" : s === "nao_conforme" ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700") : ""}>
                {s === "todos" ? "Todos" : s === "conforme" ? "Conformes" : "Não Conformes"}
              </Button>
            ))}
          </div>
        </div>

        {/* Empresa List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3"></div>
            Carregando dados de conformidade...
          </div>
        ) : empresas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            {search || filtroStatus !== "todos" ? "Nenhuma empresa encontrada com os filtros aplicados" : "Nenhuma empresa terceira cadastrada"}
          </div>
        ) : (
          <div className="space-y-3">
            {empresas.map((item: any) => (
              <div key={item.empresa.id}
                className={`bg-card border rounded-lg p-4 transition-all hover:shadow-md ${item.conformeGeral ? "border-l-4 border-l-green-500" : "border-l-4 border-l-red-500"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{item.empresa.razaoSocial}</h3>
                      {item.conformeGeral ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs shrink-0">
                          <Unlock className="w-3 h-3 mr-1" /> MEDIÇÃO LIBERADA
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs shrink-0">
                          <Lock className="w-3 h-3 mr-1" /> MEDIÇÃO BLOQUEADA
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">CNPJ: {item.empresa.cnpj}</p>

                    {/* Quick Status Row */}
                    <div className="flex flex-wrap gap-4 mt-3 text-xs">
                      <div className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Docs: {item.docsOk}/{item.docsTotal}</span>
                        {item.docsOk === item.docsTotal ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Funcionários: {item.funcionarios.aptos}/{item.funcionarios.total} aptos</span>
                        {item.funcionarios.aptos === item.funcionarios.total && item.funcionarios.total > 0 ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                      <div className="flex items-center gap-1">
                        <ClipboardCheck className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Obrigação Mensal: {item.obrigacaoMensal ? (item.obrigacaoMensal.statusGeral === "completo" || item.obrigacaoMensal.statusGeralObrigacao === "completo" ? "Completa" : "Pendente") : "Não enviada"}</span>
                        {(item.obrigacaoMensal?.statusGeral === "completo" || item.obrigacaoMensal?.statusGeralObrigacao === "completo") ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedEmpresa(item)} className="shrink-0">
                    <Eye className="w-4 h-4 mr-1" /> Detalhes
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Dialog */}
        <FullScreenDialog
          open={!!selectedEmpresa}
          onClose={() => setSelectedEmpresa(null)}
          title={selectedEmpresa?.empresa.razaoSocial || ""}
          subtitle="Detalhamento de Conformidade para Medição"
          icon={<ShieldCheck className="w-5 h-5" />}
          headerColor="bg-gradient-to-r from-orange-600 to-orange-400"
        >
          {selectedEmpresa && (
            <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
              {/* Status Geral */}
              <div className={`p-5 rounded-lg text-center ${selectedEmpresa.conformeGeral ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className="text-lg font-bold">
                  {selectedEmpresa.conformeGeral ? (
                    <span className="text-green-700 flex items-center justify-center gap-2">
                      <Unlock className="w-6 h-6" /> MEDIÇÃO LIBERADA
                    </span>
                  ) : (
                    <span className="text-red-700 flex items-center justify-center gap-2">
                      <Lock className="w-6 h-6" /> MEDIÇÃO BLOQUEADA
                    </span>
                  )}
                </div>
                <p className="text-sm mt-2 text-muted-foreground">
                  {selectedEmpresa.conformeGeral
                    ? "Todos os requisitos atendidos. A medição desta empresa pode ser processada."
                    : "Existem pendências que impedem a liberação da medição. Verifique os itens abaixo."}
                </p>
              </div>

              {/* Checklist Visual */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className={`p-4 rounded-lg border text-center ${selectedEmpresa.docsOk === selectedEmpresa.docsTotal ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <FileText className={`w-8 h-8 mx-auto mb-2 ${selectedEmpresa.docsOk === selectedEmpresa.docsTotal ? "text-green-500" : "text-red-500"}`} />
                  <div className="font-semibold text-sm">Documentos</div>
                  <div className="text-xs text-muted-foreground mt-1">{selectedEmpresa.docsOk}/{selectedEmpresa.docsTotal} válidos</div>
                </div>
                <div className={`p-4 rounded-lg border text-center ${selectedEmpresa.funcionarios.aptos === selectedEmpresa.funcionarios.total && selectedEmpresa.funcionarios.total > 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <Users className={`w-8 h-8 mx-auto mb-2 ${selectedEmpresa.funcionarios.aptos === selectedEmpresa.funcionarios.total && selectedEmpresa.funcionarios.total > 0 ? "text-green-500" : "text-red-500"}`} />
                  <div className="font-semibold text-sm">Funcionários</div>
                  <div className="text-xs text-muted-foreground mt-1">{selectedEmpresa.funcionarios.aptos}/{selectedEmpresa.funcionarios.total} aptos</div>
                </div>
                <div className={`p-4 rounded-lg border text-center ${(selectedEmpresa.obrigacaoMensal?.statusGeral === "completo" || selectedEmpresa.obrigacaoMensal?.statusGeralObrigacao === "completo") ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <ClipboardCheck className={`w-8 h-8 mx-auto mb-2 ${(selectedEmpresa.obrigacaoMensal?.statusGeral === "completo" || selectedEmpresa.obrigacaoMensal?.statusGeralObrigacao === "completo") ? "text-green-500" : "text-red-500"}`} />
                  <div className="font-semibold text-sm">Obrigação Mensal</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {selectedEmpresa.obrigacaoMensal
                      ? (selectedEmpresa.obrigacaoMensal.statusGeral === "completo" || selectedEmpresa.obrigacaoMensal.statusGeralObrigacao === "completo" ? "Completa" : "Pendente")
                      : "Não enviada"}
                  </div>
                </div>
              </div>

              {/* Documentos Detalhados */}
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-orange-500" /> Documentos da Empresa
                </h3>
                <div className="space-y-2">
                  {Object.entries(selectedEmpresa.documentos).map(([key, doc]: [string, any]) => (
                    <div key={key} className="flex items-center justify-between bg-card border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        {statusIcon(doc.status)}
                        <span className="font-medium text-sm">{key === "pgr" ? "PGR" : key === "pcmso" ? "PCMSO" : key === "contratoSocial" ? "Contrato Social" : key === "alvara" ? "Alvará" : key.toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {doc.validade && (
                          <span className="text-xs text-muted-foreground">
                            Val: {new Date(doc.validade).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                        <Badge
                          variant={doc.status === "ok" ? "default" : doc.status === "vencido" ? "destructive" : "secondary"}
                          className={`text-xs ${doc.status === "ok" ? "bg-green-100 text-green-700 border-green-200" : ""}`}>
                          {statusLabel(doc.status)}
                        </Badge>
                        {doc.url && (
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700">
                            <Eye className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funcionários */}
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-500" /> Funcionários ({selectedEmpresa.funcionarios.aptos}/{selectedEmpresa.funcionarios.total} aptos)
                </h3>
                <div className="bg-card border rounded-lg p-4">
                  <Progress
                    value={selectedEmpresa.funcionarios.total > 0 ? (selectedEmpresa.funcionarios.aptos / selectedEmpresa.funcionarios.total) * 100 : 0}
                    className="h-3"
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span className="text-green-600 font-medium">{selectedEmpresa.funcionarios.aptos} aptos</span>
                    <span className="text-red-600 font-medium">{selectedEmpresa.funcionarios.total - selectedEmpresa.funcionarios.aptos} pendentes/inaptos</span>
                  </div>
                  {selectedEmpresa.funcionarios.total === 0 && (
                    <p className="text-xs text-yellow-600 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Nenhum funcionário cadastrado para esta empresa
                    </p>
                  )}
                </div>
              </div>

              {/* Obrigação Mensal */}
              <div>
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-orange-500" /> Obrigação Mensal
                </h3>
                {selectedEmpresa.obrigacaoMensal ? (
                  <div className="bg-card border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Competência: {selectedEmpresa.obrigacaoMensal.competencia}</span>
                      <Badge variant={(selectedEmpresa.obrigacaoMensal.statusGeral === "completo" || selectedEmpresa.obrigacaoMensal.statusGeralObrigacao === "completo") ? "default" : "destructive"}
                        className={(selectedEmpresa.obrigacaoMensal.statusGeral === "completo" || selectedEmpresa.obrigacaoMensal.statusGeralObrigacao === "completo") ? "bg-green-100 text-green-700 border-green-200" : ""}>
                        {(selectedEmpresa.obrigacaoMensal.statusGeral === "completo" || selectedEmpresa.obrigacaoMensal.statusGeralObrigacao === "completo") ? "Completa" : "Pendente"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "FGTS", key: "fgtsUrl" },
                        { label: "INSS", key: "inssUrl" },
                        { label: "Folha de Pagamento", key: "folhaPagamentoUrl" },
                        { label: "Comprovante Pgto", key: "comprovantePagamentoUrl" },
                      ].map(({ label, key }) => (
                        <div key={key} className="flex items-center gap-2 p-2 rounded border bg-background">
                          {selectedEmpresa.obrigacaoMensal[key] ? (
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                          )}
                          <span className="text-sm">{label}</span>
                          {selectedEmpresa.obrigacaoMensal[key] && (
                            <a href={selectedEmpresa.obrigacaoMensal[key]} target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-500 hover:text-blue-700">
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                    <p className="text-sm text-yellow-700 font-medium">Obrigação mensal não enviada</p>
                    <p className="text-xs text-yellow-600 mt-1">A empresa ainda não enviou os documentos da competência atual</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </FullScreenDialog>
      </div>
    </DashboardLayout>
  );
}
