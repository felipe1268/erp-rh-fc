import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Upload, Database, FileArchive, HardDrive,
  AlertTriangle, CheckCircle, Loader2, FileJson, Files, Shield,
  Server, ExternalLink, Info
} from "lucide-react";

type ExportPhase = "idle" | "exporting-db" | "exporting-files" | "done" | "error";
type ImportPhase = "idle" | "reading" | "importing" | "done" | "error";

export default function Migration() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // Export state
  const [exportPhase, setExportPhase] = useState<ExportPhase>("idle");
  const [exportResult, setExportResult] = useState<any>(null);
  const [filesResult, setFilesResult] = useState<any>(null);

  // Import state
  const [importPhase, setImportPhase] = useState<ImportPhase>("idle");
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace");
  const [importResult, setImportResult] = useState<any>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // tRPC mutations
  const exportMutation = trpc.migration.exportar.useMutation();
  const exportFilesMutation = trpc.migration.exportarArquivos.useMutation();
  const importMutation = trpc.migration.importar.useMutation();

  // Stats query
  const statsQuery = trpc.migration.stats.useQuery(undefined, {
    enabled: user?.role === "admin_master" || user?.role === "admin",
  });

  // ============================================================
  // EXPORTAR
  // ============================================================
  const handleExportDB = useCallback(async () => {
    setExportPhase("exporting-db");
    setExportResult(null);
    try {
      const result = await exportMutation.mutateAsync();
      setExportResult(result);
      setExportPhase("done");
      toast.success("Banco de dados exportado com sucesso!");
    } catch (e: any) {
      setExportPhase("error");
      toast.error(`Erro na exportação: ${e.message}`);
    }
  }, [exportMutation]);

  const handleExportFiles = useCallback(async () => {
    setExportPhase("exporting-files");
    setFilesResult(null);
    try {
      const result = await exportFilesMutation.mutateAsync();
      setFilesResult(result);
      setExportPhase("done");
      toast.success("Manifesto de arquivos gerado com sucesso!");
    } catch (e: any) {
      setExportPhase("error");
      toast.error(`Erro: ${e.message}`);
    }
  }, [exportFilesMutation]);

  const handleExportAll = useCallback(async () => {
    setExportPhase("exporting-db");
    setExportResult(null);
    setFilesResult(null);
    try {
      // 1. Exportar banco
      const dbResult = await exportMutation.mutateAsync();
      setExportResult(dbResult);

      // 2. Exportar manifesto de arquivos
      setExportPhase("exporting-files");
      const filesRes = await exportFilesMutation.mutateAsync();
      setFilesResult(filesRes);

      setExportPhase("done");
      toast.success("Exportação completa realizada com sucesso!");
    } catch (e: any) {
      setExportPhase("error");
      toast.error(`Erro na exportação: ${e.message}`);
    }
  }, [exportMutation, exportFilesMutation]);

  // ============================================================
  // IMPORTAR
  // ============================================================
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".json")) {
        toast.error("Selecione um arquivo JSON de exportação");
        return;
      }
      setImportFile(file);
      setImportPhase("idle");
      setImportResult(null);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importFile) return;

    setImportPhase("reading");
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);

      if (!data._meta) {
        toast.error("Arquivo inválido: não contém metadados de exportação (_meta)");
        setImportPhase("error");
        return;
      }

      setImportPhase("importing");
      const result = await importMutation.mutateAsync({ data, mode: importMode });
      setImportResult(result);
      setImportPhase("done");

      if (result.success) {
        toast.success(`Importação concluída! ${result.stats.totalRecords} registros importados.`);
      } else {
        toast.warning(`Importação concluída com ${result.errors.length} erro(s).`);
      }
    } catch (e: any) {
      setImportPhase("error");
      toast.error(`Erro na importação: ${e.message}`);
    }
  }, [importFile, importMode, importMutation]);

  // ============================================================
  // HELPERS
  // ============================================================
  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Access check
  if (user?.role !== "admin_master" && user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Acesso Restrito</h2>
            <p className="text-gray-500">Apenas administradores podem acessar a migração de dados.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/configuracoes")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <HardDrive className="h-6 w-6" />
              Migração de Dados
            </h1>
            <p className="text-gray-500 text-sm">
              Exporte ou importe todos os dados do ERP para migrar entre plataformas
            </p>
          </div>
        </div>

        {/* Stats Card */}
        {statsQuery.data && (
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <Database className="h-8 w-8 mx-auto text-blue-600 mb-1" />
                  <div className="text-2xl font-bold">{statsQuery.data.totalTables}</div>
                  <div className="text-xs text-gray-500">Tabelas</div>
                </div>
                <div className="text-center">
                  <FileJson className="h-8 w-8 mx-auto text-green-600 mb-1" />
                  <div className="text-2xl font-bold">{statsQuery.data.totalRecords.toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-gray-500">Registros</div>
                </div>
                <div className="text-center">
                  <Files className="h-8 w-8 mx-auto text-orange-600 mb-1" />
                  <div className="text-2xl font-bold">{statsQuery.data.totalFiles.toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-gray-500">Arquivos Anexados</div>
                </div>
                <div className="text-center">
                  <Server className="h-8 w-8 mx-auto text-purple-600 mb-1" />
                  <div className="text-2xl font-bold">
                    {statsQuery.data.tableStats.filter((t: any) => t.records > 0).length}
                  </div>
                  <div className="text-xs text-gray-500">Tabelas com Dados</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================ */}
        {/* EXPORTAR */}
        {/* ============================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-green-600" />
              Exportar Dados
            </CardTitle>
            <CardDescription>
              Exporte todo o banco de dados e documentos para migrar para outra plataforma (Railway, Vercel, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Info box */}
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-semibold mb-1">O que será exportado:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Banco de dados</strong>: Todas as {statsQuery.data?.totalTables || "160+"} tabelas em formato JSON</li>
                    <li><strong>Manifesto de arquivos</strong>: Lista de todos os documentos anexados (ASOs, certificados, fotos, contratos) com URLs de download</li>
                  </ul>
                  <p className="mt-2 text-amber-700 dark:text-amber-300">
                    Após exportar, use o manifesto para baixar os arquivos com um script (instruções incluídas).
                  </p>
                </div>
              </div>
            </div>

            {/* Export buttons */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                onClick={handleExportAll}
                disabled={exportPhase !== "idle" && exportPhase !== "done" && exportPhase !== "error"}
                className="h-auto py-4 bg-green-600 hover:bg-green-700"
              >
                <div className="flex flex-col items-center gap-1">
                  <FileArchive className="h-6 w-6" />
                  <span className="font-semibold">Exportar Tudo</span>
                  <span className="text-xs opacity-80">Banco + Manifesto de Arquivos</span>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={handleExportDB}
                disabled={exportPhase !== "idle" && exportPhase !== "done" && exportPhase !== "error"}
                className="h-auto py-4"
              >
                <div className="flex flex-col items-center gap-1">
                  <Database className="h-6 w-6" />
                  <span className="font-semibold">Só Banco de Dados</span>
                  <span className="text-xs opacity-60">JSON com todas as tabelas</span>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={handleExportFiles}
                disabled={exportPhase !== "idle" && exportPhase !== "done" && exportPhase !== "error"}
                className="h-auto py-4"
              >
                <div className="flex flex-col items-center gap-1">
                  <Files className="h-6 w-6" />
                  <span className="font-semibold">Só Manifesto de Arquivos</span>
                  <span className="text-xs opacity-60">Lista de URLs para download</span>
                </div>
              </Button>
            </div>

            {/* Export progress */}
            {(exportPhase === "exporting-db" || exportPhase === "exporting-files") && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200">
                    {exportPhase === "exporting-db" ? "Exportando banco de dados..." : "Gerando manifesto de arquivos..."}
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Isso pode levar alguns minutos dependendo do volume de dados.
                  </p>
                </div>
              </div>
            )}

            {/* Export results */}
            {exportPhase === "done" && (exportResult || filesResult) && (
              <div className="space-y-3">
                {exportResult && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-green-800 dark:text-green-200">Banco de Dados Exportado</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                          <div>
                            <span className="text-gray-500">Tabelas:</span>{" "}
                            <strong>{exportResult.stats.tablesExported}</strong>
                          </div>
                          <div>
                            <span className="text-gray-500">Registros:</span>{" "}
                            <strong>{exportResult.stats.totalRecords.toLocaleString("pt-BR")}</strong>
                          </div>
                          <div>
                            <span className="text-gray-500">Tamanho:</span>{" "}
                            <strong>{formatBytes(exportResult.stats.totalSizeBytes)}</strong>
                          </div>
                          <div>
                            <span className="text-gray-500">Duração:</span>{" "}
                            <strong>{formatDuration(exportResult.stats.duration)}</strong>
                          </div>
                        </div>
                        {exportResult.downloadUrl && (
                          <a
                            href={exportResult.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-3 text-green-700 hover:text-green-800 font-medium text-sm"
                          >
                            <Download className="h-4 w-4" />
                            Baixar JSON do Banco de Dados
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {filesResult && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-green-800 dark:text-green-200">Manifesto de Arquivos Gerado</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {filesResult.totalFiles} arquivos mapeados em {filesResult.byTable?.length || 0} tabelas
                        </p>
                        {filesResult.byTable && filesResult.byTable.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {filesResult.byTable.slice(0, 8).map((t: any) => (
                              <Badge key={t.table} variant="secondary" className="text-xs">
                                {t.table}: {t.count}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {filesResult.downloadUrl && (
                          <a
                            href={filesResult.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-3 text-green-700 hover:text-green-800 font-medium text-sm"
                          >
                            <Download className="h-4 w-4" />
                            Baixar Manifesto de Arquivos (JSON)
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {exportPhase === "error" && (
              <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <p className="text-red-800 dark:text-red-200">Erro na exportação. Tente novamente.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================================ */}
        {/* IMPORTAR */}
        {/* ============================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Importar Dados
            </CardTitle>
            <CardDescription>
              Restaure dados de um pacote de exportação previamente gerado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Warning */}
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  <p className="font-semibold">Atenção: Operação irreversível no modo "Substituir"</p>
                  <p className="mt-1">
                    No modo <strong>Substituir</strong>, todos os dados existentes serão apagados antes da importação.
                    Faça um backup antes de prosseguir. No modo <strong>Mesclar</strong>, registros existentes serão atualizados.
                  </p>
                </div>
              </div>
            </div>

            {/* Import mode */}
            <div className="flex items-center gap-4">
              <label className="font-medium text-sm whitespace-nowrap">Modo de importação:</label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as any)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Substituir (apaga dados existentes)</SelectItem>
                  <SelectItem value="merge">Mesclar (atualiza/insere)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File input */}
            <div
              className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
              {importFile ? (
                <div>
                  <p className="text-lg font-medium text-gray-700 dark:text-gray-300">{importFile.name}</p>
                  <p className="text-sm text-gray-500 mt-1">{formatBytes(importFile.size)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
                    Clique para selecionar o arquivo JSON de exportação
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Arquivo gerado pela função "Exportar Banco de Dados"</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Import button */}
            {importFile && importPhase !== "importing" && (
              <Button
                onClick={handleImport}
                disabled={importPhase === "importing"}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                Iniciar Importação ({importMode === "replace" ? "Substituir" : "Mesclar"})
              </Button>
            )}

            {/* Import progress */}
            {(importPhase === "reading" || importPhase === "importing") && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                <div>
                  <p className="font-medium text-blue-800 dark:text-blue-200">
                    {importPhase === "reading" ? "Lendo arquivo..." : "Importando dados..."}
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Isso pode levar vários minutos. Não feche esta página.
                  </p>
                </div>
              </div>
            )}

            {/* Import results */}
            {importPhase === "done" && importResult && (
              <div className={`p-4 rounded-lg border ${importResult.success
                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                : "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
              }`}>
                <div className="flex items-start gap-3">
                  {importResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">
                      Importação {importResult.success ? "Concluída" : "Concluída com Erros"}
                    </p>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                      <div>
                        <span className="text-gray-500">Tabelas:</span>{" "}
                        <strong>{importResult.stats.tablesImported}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Registros:</span>{" "}
                        <strong>{importResult.stats.totalRecords.toLocaleString("pt-BR")}</strong>
                      </div>
                      <div>
                        <span className="text-gray-500">Duração:</span>{" "}
                        <strong>{formatDuration(importResult.stats.duration)}</strong>
                      </div>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="mt-3 max-h-40 overflow-auto text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
                        {importResult.errors.slice(0, 20).map((err: string, i: number) => (
                          <div key={i}>{err}</div>
                        ))}
                        {importResult.errors.length > 20 && (
                          <div className="font-medium mt-1">... e mais {importResult.errors.length - 20} erro(s)</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================================ */}
        {/* GUIA DE MIGRAÇÃO */}
        {/* ============================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-purple-600" />
              Guia de Migração para Railway
            </CardTitle>
            <CardDescription>
              Passo a passo para hospedar seu ERP em infraestrutura independente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold">1</div>
                <div>
                  <p className="font-semibold">Exporte seus dados</p>
                  <p className="text-gray-500">Use o botão "Exportar Tudo" acima para gerar o JSON do banco e o manifesto de arquivos.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold">2</div>
                <div>
                  <p className="font-semibold">Baixe os arquivos anexados</p>
                  <p className="text-gray-500">
                    Use o manifesto de arquivos com um script para baixar todos os documentos. Exemplo com Node.js:
                  </p>
                  <pre className="mt-2 bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto">
{`// download-files.mjs
import fs from 'fs';
import path from 'path';

const manifest = JSON.parse(fs.readFileSync('files-manifest.json', 'utf-8'));

for (const file of manifest.files) {
  const dir = path.dirname(file.suggestedPath);
  fs.mkdirSync(dir, { recursive: true });
  
  const res = await fetch(file.originalUrl);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file.suggestedPath, buffer);
  
  console.log(\`Downloaded: \${file.suggestedPath}\`);
}`}
                  </pre>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold">3</div>
                <div>
                  <p className="font-semibold">Configure o Railway</p>
                  <p className="text-gray-500">
                    Crie um projeto no Railway com MySQL (ou TiDB) e um serviço Node.js.
                    Configure as variáveis de ambiente (DATABASE_URL, JWT_SECRET, etc.).
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold">4</div>
                <div>
                  <p className="font-semibold">Importe os dados</p>
                  <p className="text-gray-500">
                    No novo servidor, use a função "Importar Dados" desta página para restaurar o banco.
                    Para os arquivos, configure um bucket S3 (AWS, Cloudflare R2, etc.) e faça upload dos documentos.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-700 dark:text-purple-300 font-bold">5</div>
                <div>
                  <p className="font-semibold">Atualize as URLs dos arquivos</p>
                  <p className="text-gray-500">
                    Após migrar os arquivos para o novo storage, atualize as URLs no banco de dados
                    usando um script de find-and-replace nas colunas de URL.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
