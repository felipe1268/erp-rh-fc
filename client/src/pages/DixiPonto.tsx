import React, { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { fmtNum } from "@/lib/formatters";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Upload, FileText, Wifi, Clock, AlertTriangle, History,
  BarChart3, Search, CheckCircle, XCircle, Loader2, Eye,
  Trash2, Download, RefreshCw, Info, ChevronDown, ChevronUp,
  Building2, Users, FileSpreadsheet, ArrowRight, Filter,
} from "lucide-react";

type TabKey = "dashboard" | "importar" | "historico" | "marcacoes" | "alertas";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "importar", label: "Importar AFD", icon: Upload },
  { key: "historico", label: "Histórico", icon: History },
  { key: "marcacoes", label: "Marcações", icon: Clock },
  { key: "alertas", label: "Alertas", icon: AlertTriangle },
];

export default function DixiPonto() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Building2 className="w-5 h-5 mr-2" />
        Selecione uma empresa para acessar o módulo Dixi Ponto
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wifi className="w-6 h-6 text-blue-600" />
            Dixi Ponto — Integração
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importação e gestão de marcações de ponto via arquivo AFD (Portaria 671)
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto pb-px">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "dashboard" && <DashboardTab companyId={Number(selectedCompanyId)} companyIds={getCompanyIdsForQuery()} />}
      {activeTab === "importar" && <ImportarTab companyId={Number(selectedCompanyId)} companyIds={getCompanyIdsForQuery()} />}
      {activeTab === "historico" && <HistoricoTab companyId={Number(selectedCompanyId)} companyIds={getCompanyIdsForQuery()} />}
      {activeTab === "marcacoes" && <MarcacoesTab companyId={Number(selectedCompanyId)} companyIds={getCompanyIdsForQuery()} />}
      {activeTab === "alertas" && <AlertasTab companyId={Number(selectedCompanyId)} companyIds={getCompanyIdsForQuery()} />}
    </div>
  );
}

// ============================================================
// DASHBOARD TAB
// ============================================================
function DashboardTab({ companyId, companyIds }: { companyId: number; companyIds?: number[] }) {
  const { data: stats, isLoading } = trpc.dixiPonto.dashboardStats.useQuery({ companyId, companyIds });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cards = [
    { label: "Obras Ativas", value: stats?.obrasAtivas || 0, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Relógios (SN)", value: stats?.relogios || 0, icon: Wifi, color: "text-green-600", bg: "bg-green-50" },
    { label: "Funcionários", value: stats?.funcionarios || 0, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Importações", value: stats?.totalImportacoes || 0, icon: Upload, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "Marcações AFD", value: stats?.totalMarcacoes || 0, icon: Clock, color: "text-cyan-600", bg: "bg-cyan-50" },
    { label: "Alertas Pendentes", value: stats?.inconsistenciasPendentes || 0, icon: AlertTriangle, color: stats?.inconsistenciasPendentes ? "text-red-600" : "text-gray-400", bg: stats?.inconsistenciasPendentes ? "bg-red-50" : "bg-gray-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(card => (
          <Card key={card.label} className="border">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fmtNum(card.value)}</p>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Última Importação */}
      {stats?.ultimaImportacao && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Última Importação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Arquivo</p>
                <p className="font-medium">{stats.ultimaImportacao.arquivoNome || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Obra</p>
                <p className="font-medium">{stats.ultimaImportacao.obraNome || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SN Relógio</p>
                <p className="font-medium font-mono">{stats.ultimaImportacao.snRelogio || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Data</p>
                <p className="font-medium">
                  {stats.ultimaImportacao.dataImportacao
                    ? new Date(stats.ultimaImportacao.dataImportacao).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Marcações</p>
                <p className="font-medium">{stats.ultimaImportacao.totalMarcacoes}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Funcionários</p>
                <p className="font-medium">{stats.ultimaImportacao.totalFuncionarios}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Inconsistências</p>
                <p className="font-medium">{stats.ultimaImportacao.totalInconsistencias}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant={stats.ultimaImportacao.status === "sucesso" ? "default" : stats.ultimaImportacao.status === "parcial" ? "secondary" : "destructive"}>
                  {stats.ultimaImportacao.status === "sucesso" ? "Sucesso" : stats.ultimaImportacao.status === "parcial" ? "Parcial" : "Erro"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-blue-800">Como funciona a importação AFD?</p>
              <ol className="mt-2 space-y-1 text-blue-700 list-decimal list-inside">
                <li>Exporte o arquivo AFD do relógio Dixi Ponto (formato Portaria 671)</li>
                <li>Na aba <strong>Importar AFD</strong>, selecione o arquivo e visualize o preview</li>
                <li>O sistema identifica o SN do relógio e vincula à obra cadastrada</li>
                <li>Confirme a importação — as marcações são processadas automaticamente</li>
                <li>Verifique inconsistências na aba <strong>Alertas</strong></li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// IMPORTAR TAB
// ============================================================
function ImportarTab({ companyId, companyIds }: { companyId: number; companyIds?: number[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const utils = trpc.useUtils();
  const previewMut = trpc.dixiPonto.previewAFD.useMutation();
  const importMut = trpc.dixiPonto.importAFD.useMutation();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setPreviewData(null);
    setImportResult(null);

    try {
      const text = await file.text();
      setFileContent(text);

      const result = await previewMut.mutateAsync({ companyId, companyIds, fileContent: text,
        fileName: file.name,
      });
      setPreviewData(result);
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo AFD");
    }
  };

  const handleImport = async () => {
    if (!fileContent || !fileName) return;
    setImporting(true);
    try {
      const result = await importMut.mutateAsync({ companyId, companyIds, fileContent,
        fileName,
      });
      setImportResult(result);
      setPreviewData(null);
      toast.success(`Importação concluída! ${result.totalDiasProcessados} dias processados para ${result.totalFuncionarios} funcionários.`);
      utils.dixiPonto.dashboardStats.invalidate();
      utils.dixiPonto.listImportacoes.invalidate();
      utils.dixiPonto.listMarcacoes.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Erro na importação");
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setFileName("");
    setFileContent("");
    setPreviewData(null);
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload de Arquivo AFD
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.afd,.AFD"
              className="hidden"
              onChange={handleFileSelect}
            />
            {previewMut.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-sm text-muted-foreground">Processando arquivo AFD...</p>
              </div>
            ) : fileName ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-10 h-10 text-green-500" />
                <p className="font-medium">{fileName}</p>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); resetForm(); }}>
                  Trocar arquivo
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-10 h-10 text-muted-foreground" />
                <p className="font-medium">Clique para selecionar ou arraste o arquivo AFD</p>
                <p className="text-xs text-muted-foreground">Aceita arquivos .txt e .afd (Portaria 671)</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {previewData && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview da Importação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Header Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">SN Relógio</p>
                <p className="font-mono font-bold">{previewData.header.sn}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Obra Vinculada</p>
                <p className="font-medium">
                  {previewData.header.snVinculado ? (
                    <span className="text-green-600">{previewData.header.obraNome}</span>
                  ) : (
                    <span className="text-red-600">SN NÃO VINCULADO</span>
                  )}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Período</p>
                <p className="font-medium">{previewData.resumo.dataInicio} a {previewData.resumo.dataFim}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground text-xs">Razão Social</p>
                <p className="font-medium text-xs">{previewData.header.razaoSocial || "—"}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-3">
                <Clock className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-lg font-bold">{previewData.resumo.totalMarcacoes}</p>
                  <p className="text-xs text-muted-foreground">Marcações</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-green-50 rounded-lg p-3">
                <Users className="w-4 h-4 text-green-600" />
                <div>
                  <p className="text-lg font-bold">{previewData.resumo.funcionariosIdentificados}</p>
                  <p className="text-xs text-muted-foreground">Identificados</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-red-50 rounded-lg p-3">
                <XCircle className="w-4 h-4 text-red-600" />
                <div>
                  <p className="text-lg font-bold">{previewData.resumo.funcionariosNaoIdentificados}</p>
                  <p className="text-xs text-muted-foreground">Não Identificados</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-purple-50 rounded-lg p-3">
                <FileSpreadsheet className="w-4 h-4 text-purple-600" />
                <div>
                  <p className="text-lg font-bold">{previewData.resumo.mesesDetectados?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Meses Detectados</p>
                </div>
              </div>
            </div>

            {/* Meses detectados */}
            {previewData.resumo.mesesDetectados?.length > 0 && (
              <div className="text-sm">
                <p className="text-muted-foreground mb-1">Meses detectados no arquivo:</p>
                <div className="flex gap-1 flex-wrap">
                  {previewData.resumo.mesesDetectados.map((m: string) => (
                    <Badge key={m} variant="outline">{m}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* CPFs não encontrados */}
            {previewData.resumo.cpfsNaoEncontrados?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-medium text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  CPFs não encontrados no cadastro ({previewData.resumo.cpfsNaoEncontrados.length}):
                </p>
                <div className="mt-2 flex gap-2 flex-wrap">
                  {previewData.resumo.cpfsNaoEncontrados.map((cpf: string) => (
                    <Badge key={cpf} variant="destructive" className="font-mono text-xs">{cpf}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Preview Marcações */}
            {previewData.previewMarcacoes?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Amostra de marcações (primeiras 20):</p>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">NSR</th>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Hora</th>
                        <th className="px-3 py-2 text-left">CPF</th>
                        <th className="px-3 py-2 text-left">Funcionário</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.previewMarcacoes.map((m: any, i: number) => (
                        <tr key={i} className={`border-t ${m.status !== "ok" ? "bg-red-50" : ""}`}>
                          <td className="px-3 py-1.5 font-mono text-xs">{m.nsr}</td>
                          <td className="px-3 py-1.5">{m.data ? new Date(m.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                          <td className="px-3 py-1.5 font-mono">{m.hora}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{m.cpf}</td>
                          <td className="px-3 py-1.5">{m.funcionario}</td>
                          <td className="px-3 py-1.5">
                            {m.status === "ok" ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={importing || !previewData.header.snVinculado}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Confirmar Importação
                  </>
                )}
              </Button>
            </div>

            {!previewData.header.snVinculado && (
              <p className="text-sm text-red-600 text-right">
                O SN "{previewData.header.sn}" não está vinculado a nenhuma obra. Cadastre-o primeiro na aba de Relógios/Obras.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import Result */}
      {importResult && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5" />
              Importação Concluída com Sucesso!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Obra</p>
                <p className="font-medium">{importResult.obraNome}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SN Relógio</p>
                <p className="font-mono font-medium">{importResult.snRelogio}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Marcações Processadas</p>
                <p className="font-medium">{importResult.totalMarcacoes}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dias Processados</p>
                <p className="font-medium">{importResult.totalDiasProcessados}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Funcionários</p>
                <p className="font-medium">{importResult.totalFuncionarios}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Inconsistências</p>
                <p className="font-medium">{importResult.totalInconsistencias > 0 ? (
                  <span className="text-orange-600">{importResult.totalInconsistencias}</span>
                ) : "0"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">CPFs Não Encontrados</p>
                <p className="font-medium">{importResult.cpfsNaoEncontrados?.length || 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Meses Afetados</p>
                <div className="flex gap-1 flex-wrap">
                  {importResult.mesesAfetados?.map((m: string) => (
                    <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>
                <Upload className="w-4 h-4 mr-1" />
                Nova Importação
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// HISTÓRICO TAB
// ============================================================
function HistoricoTab({ companyId, companyIds }: { companyId: number; companyIds?: number[] }) {
  const { data: importacoes, isLoading } = trpc.dixiPonto.listImportacoes.useQuery({ companyId, companyIds });
  const utils = trpc.useUtils();
  const deleteMut = trpc.dixiPonto.deleteImportacao.useMutation({
    onSuccess: () => {
      toast.success("Importação excluída");
      utils.dixiPonto.listImportacoes.invalidate();
      utils.dixiPonto.dashboardStats.invalidate();
    },
  });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) {
    return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!importacoes?.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">Nenhuma importação realizada</p>
          <p className="text-sm mt-1">Use a aba "Importar AFD" para fazer a primeira importação.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{importacoes.length} importação(ões) registradas</p>

      {importacoes.map((imp: any) => (
        <Card key={imp.id} className="border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={imp.status === "sucesso" ? "default" : imp.status === "parcial" ? "secondary" : "destructive"}>
                    {imp.status === "sucesso" ? "Sucesso" : imp.status === "parcial" ? "Parcial" : "Erro"}
                  </Badge>
                  <Badge variant="outline">{imp.metodo}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {imp.dataImportacao ? new Date(imp.dataImportacao).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Arquivo: </span>
                    <span className="font-medium">{imp.arquivoNome || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">SN: </span>
                    <span className="font-mono">{imp.snRelogio || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Obra: </span>
                    <span>{imp.obraNome || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Marcações: </span>
                    <span className="font-bold">{imp.totalMarcacoes}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Funcionários: </span>
                    <span className="font-bold">{imp.totalFuncionarios}</span>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === imp.id && imp.detalhes && (
                  <div className="mt-3 pt-3 border-t text-sm">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {imp.detalhes.mesesAfetados && (
                        <div>
                          <span className="text-muted-foreground">Meses: </span>
                          {imp.detalhes.mesesAfetados.map((m: string) => (
                            <Badge key={m} variant="outline" className="text-xs mr-1">{m}</Badge>
                          ))}
                        </div>
                      )}
                      {imp.detalhes.totalDiasProcessados && (
                        <div>
                          <span className="text-muted-foreground">Dias processados: </span>
                          <span>{imp.detalhes.totalDiasProcessados}</span>
                        </div>
                      )}
                      {imp.detalhes.cpfsNaoEncontrados?.length > 0 && (
                        <div className="col-span-full">
                          <span className="text-muted-foreground">CPFs não encontrados: </span>
                          {imp.detalhes.cpfsNaoEncontrados.map((cpf: string) => (
                            <Badge key={cpf} variant="destructive" className="text-xs mr-1 font-mono">{cpf}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Importado por: {imp.importadoPor || "Sistema"}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 ml-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedId(expandedId === imp.id ? null : imp.id)}>
                  {expandedId === imp.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-700"
                  onClick={() => setConfirmDelete(imp.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Delete Confirmation */}
      <Dialog open={confirmDelete !== null} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Importação?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isso irá excluir o registro de importação e todas as marcações AFD brutas associadas. Os registros de ponto processados <strong>não</strong> serão afetados.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDelete) {
                  deleteMut.mutate({ id: confirmDelete, companyId });
                  setConfirmDelete(null);
                }
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MARCAÇÕES TAB
// ============================================================
function MarcacoesTab({ companyId, companyIds }: { companyId: number; companyIds?: number[] }) {
  const [searchCpf, setSearchCpf] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const [selectedImportId, setSelectedImportId] = useState<number | undefined>(undefined);

  const { data: importacoes } = trpc.dixiPonto.listImportacoes.useQuery({ companyId, companyIds });
  const { data: marcacoes, isLoading } = trpc.dixiPonto.listMarcacoes.useQuery({ companyId, companyIds, importacaoId: selectedImportId,
    data: searchDate || undefined,
    cpf: searchCpf || undefined,
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Importação</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={selectedImportId || ""}
                onChange={e => setSelectedImportId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Todas as importações</option>
                {importacoes?.map((imp: any) => (
                  <option key={imp.id} value={imp.id}>
                    {imp.arquivoNome} — {imp.obraNome} ({imp.dataImportacao ? new Date(imp.dataImportacao).toLocaleDateString("pt-BR") : ""})
                  </option>
                ))}
              </select>
            </div>
            <div className="w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">Data</label>
              <Input
                type="date"
                value={searchDate}
                onChange={e => setSearchDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-[180px]">
              <label className="text-xs text-muted-foreground mb-1 block">CPF</label>
              <Input
                placeholder="Buscar por CPF..."
                value={searchCpf}
                onChange={e => setSearchCpf(e.target.value)}
                className="h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => { setSearchCpf(""); setSearchDate(""); setSelectedImportId(undefined); }}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !marcacoes?.length ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Nenhuma marcação encontrada</p>
            <p className="text-sm mt-1">Ajuste os filtros ou importe um arquivo AFD.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium">NSR</th>
                    <th className="px-3 py-2.5 text-left font-medium">Data</th>
                    <th className="px-3 py-2.5 text-left font-medium">Hora</th>
                    <th className="px-3 py-2.5 text-left font-medium">CPF</th>
                    <th className="px-3 py-2.5 text-left font-medium">Funcionário</th>
                    <th className="px-3 py-2.5 text-left font-medium">SN</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {marcacoes.slice(0, 200).map((m: any, i: number) => (
                    <tr key={m.id || i} className={`border-t ${m.status === "cpf_nao_encontrado" ? "bg-red-50" : ""}`}>
                      <td className="px-3 py-1.5 font-mono text-xs">{m.nsr || "—"}</td>
                      <td className="px-3 py-1.5">{m.data ? new Date(m.data + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{m.hora}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{m.cpf}</td>
                      <td className="px-3 py-1.5">{m.employeeName || <span className="text-red-500">Não identificado</span>}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{m.snRelogio || "—"}</td>
                      <td className="px-3 py-1.5">
                        {m.status === "processado" ? (
                          <Badge variant="default" className="text-xs">OK</Badge>
                        ) : m.status === "cpf_nao_encontrado" ? (
                          <Badge variant="destructive" className="text-xs">CPF não encontrado</Badge>
                        ) : m.status === "duplicado" ? (
                          <Badge variant="secondary" className="text-xs">Duplicado</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">{m.status}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {marcacoes.length > 200 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Mostrando 200 de {marcacoes.length} marcações. Use os filtros para refinar.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// ALERTAS TAB
// ============================================================
function AlertasTab({ companyId, companyIds }: { companyId: number; companyIds?: number[] }) {
  const { data: marcacoes } = trpc.dixiPonto.listMarcacoes.useQuery({ companyId, companyIds });

  // Filter only unmatched CPFs
  const alertas = useMemo(() => {
    if (!marcacoes) return [];
    const unmatched = marcacoes.filter((m: any) => m.status === "cpf_nao_encontrado");
    // Group by CPF
    const grouped: Record<string, { cpf: string; count: number; datas: string[] }> = {};
    for (const m of unmatched) {
      if (!grouped[m.cpf]) grouped[m.cpf] = { cpf: m.cpf, count: 0, datas: [] };
      grouped[m.cpf].count++;
      const dataStr = m.data ? new Date(m.data + "T12:00:00").toLocaleDateString("pt-BR") : "";
      if (dataStr && !grouped[m.cpf].datas.includes(dataStr)) {
        grouped[m.cpf].datas.push(dataStr);
      }
    }
    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }, [marcacoes]);

  return (
    <div className="space-y-4">
      {alertas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
            <p className="font-medium">Nenhum alerta pendente</p>
            <p className="text-sm mt-1">Todos os CPFs das marcações foram identificados no cadastro.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="font-medium">{alertas.length} CPF(s) não encontrado(s) no cadastro</span>
          </div>

          <div className="space-y-2">
            {alertas.map(alerta => (
              <Card key={alerta.cpf} className="border-orange-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-bold text-lg">{alerta.cpf}</p>
                      <p className="text-sm text-muted-foreground">
                        {alerta.count} marcação(ões) em {alerta.datas.length} dia(s)
                      </p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {alerta.datas.slice(0, 10).map(d => (
                          <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                        ))}
                        {alerta.datas.length > 10 && (
                          <Badge variant="outline" className="text-xs">+{alerta.datas.length - 10} dias</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">
                        <XCircle className="w-3 h-3 mr-1" />
                        Não cadastrado
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
