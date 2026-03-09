import { useState, useCallback } from "react";
import { Upload, FileJson, CheckCircle, AlertCircle, Loader2, Database, ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

interface ImportResult {
    success: boolean;
    table: string;
    rowsImported: number;
    errors: string[];
}

interface ImportResponse {
    success: boolean;
    totalTablesProcessed: number;
    totalRowsImported: number;
    results: ImportResult[];
}

interface ParsedTable {
    tableName: string;
    columns: string[];
    rows: any[][];
    rowCount: number;
}

export default function ImportData() {
    const [, navigate] = useLocation();
    const [files, setFiles] = useState<File[]>([]);
    const [parsedTables, setParsedTables] = useState<ParsedTable[]>([]);
    const [importMode, setImportMode] = useState<string>("insert");
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importResults, setImportResults] = useState<ImportResponse | null>(null);
    const [step, setStep] = useState<"upload" | "review" | "importing" | "done">("upload");

  // Parse CSV file
  const parseCSV = useCallback((content: string, fileName: string): ParsedTable => {
        const lines = content.split("\\n").filter(l => l.trim());
        const tableName = fileName.replace(/\\.csv$/i, "").replace(/\\.json$/i, "");

                                   if (lines.length < 2) {
                                           return { tableName, columns: [], rows: [], rowCount: 0 };
                                   }

                                   const columns = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const rows = lines.slice(1).map(line => {
                const values: any[] = [];
                let current = "";
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                          const char = line[i];
                          if (char === '"') inQuotes = !inQuotes;
                          else if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; }
                          else current += char;
                }
                values.push(current.trim());
                return values.map(v => (v === "" || v === "NULL" || v === "null") ? null : v);
        });

                                   return { tableName, columns, rows, rowCount: rows.length };
  }, []);

  // Parse JSON file (Manus export format)
  const parseJSON = useCallback((content: string): ParsedTable[] => {
        try {
                const data = JSON.parse(content);

          // If it's an array of objects (single table export)
          if (Array.isArray(data) && data.length > 0) {
                    const columns = Object.keys(data[0]);
                    const rows = data.map(row => columns.map(col => row[col] ?? null));
                    return [{ tableName: "imported_data", columns, rows, rowCount: rows.length }];
          }

          // If it's our structured format { tables: [...] }
          if (data.tables && Array.isArray(data.tables)) {
                    return data.tables.map((t: any) => ({
                                tableName: t.tableName || t.name,
                                columns: t.columns || Object.keys(t.data?.[0] || {}),
                                rows: t.rows || t.data?.map((row: any) => (t.columns || Object.keys(row)).map((col: string) => row[col] ?? null)) || [],
                                rowCount: (t.rows || t.data || []).length,
                    }));
          }

          // If it's { tableName: [rows] } format
          const tables: ParsedTable[] = [];
                for (const [tableName, tableData] of Object.entries(data)) {
                          if (Array.isArray(tableData) && tableData.length > 0) {
                                      const columns = Object.keys((tableData as any[])[0]);
                                      const rows = (tableData as any[]).map(row => columns.map(col => row[col] ?? null));
                                      tables.push({ tableName, columns, rows, rowCount: rows.length });
                          }
                }
                return tables;
        } catch (e) {
                toast.error("Erro ao processar arquivo JSON");
                return [];
        }
  }, []);

  // Handle file selection
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        setFiles(selectedFiles);

                                           const allTables: ParsedTable[] = [];

                                           for (const file of selectedFiles) {
                                                   const content = await file.text();

          if (file.name.endsWith(".csv")) {
                    allTables.push(parseCSV(content, file.name));
          } else if (file.name.endsWith(".json")) {
                    allTables.push(...parseJSON(content));
          }
                                           }

                                           setParsedTables(allTables);
        if (allTables.length > 0) setStep("review");
  }, [parseCSV, parseJSON]);

  // Handle drag and drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files);
        const validFiles = droppedFiles.filter(f => f.name.endsWith(".csv") || f.name.endsWith(".json"));

                                     if (validFiles.length === 0) {
                                             toast.error("Apenas arquivos CSV e JSON sao aceitos");
                                             return;
                                     }

                                     setFiles(validFiles);
        const allTables: ParsedTable[] = [];

                                     for (const file of validFiles) {
                                             const content = await file.text();
                                             if (file.name.endsWith(".csv")) {
                                                       allTables.push(parseCSV(content, file.name));
                                             } else if (file.name.endsWith(".json")) {
                                                       allTables.push(...parseJSON(content));
                                             }
                                     }

                                     setParsedTables(allTables);
        if (allTables.length > 0) setStep("review");
  }, [parseCSV, parseJSON]);

  // Execute import
  const handleImport = useCallback(async () => {
        if (parsedTables.length === 0) return;

                                       setStep("importing");
        setIsImporting(true);
        setImportProgress(0);

                                       try {
                                               const payload = {
                                                         tables: parsedTables.map(t => ({
                                                                     tableName: t.tableName,
                                                                     columns: t.columns,
                                                                     rows: t.rows,
                                                         })),
                                                         mode: importMode,
                                               };

          const response = await fetch("/api/import-data", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
          });

          const result: ImportResponse = await response.json();
                                               setImportResults(result);
                                               setStep("done");

          if (result.success) {
                    toast.success(`Importacao concluida! ${result.totalRowsImported} registros importados.`);
          } else {
                    toast.warning("Importacao concluida com erros. Verifique os detalhes.");
          }
                                       } catch (error: any) {
                                               toast.error(`Erro na importacao: ${error.message}`);
                                               setStep("review");
                                       } finally {
                                               setIsImporting(false);
                                       }
  }, [parsedTables, importMode]);

  const resetImport = () => {
        setFiles([]);
        setParsedTables([]);
        setImportResults(null);
        setStep("upload");
        setImportProgress(0);
  };

  return (
        <div className="min-h-screen bg-gray-50 p-6">
              <Toaster />
              <div className="max-w-4xl mx-auto">
                      <div className="flex items-center gap-4 mb-6">
                                <Button variant="ghost" onClick={() => navigate("/")}>
                                            <ArrowLeft className="h-4 w-4 mr-2" />
                                            Voltar
                                </Button>
                                <div>
                                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                                          <Database className="h-6 w-6" />
                                                          Importacao de Dados
                                            </h1>
                                            <p className="text-gray-500">Importe dados de arquivos CSV ou JSON para o sistema</p>
                                </div>
                      </div>
              
                {/* Step 1: Upload */}
                {step === "upload" && (
                    <Card>
                                <CardHeader>
                                              <CardTitle>1. Selecione os arquivos</CardTitle>
                                              <CardDescription>
                                                              Arraste arquivos CSV ou JSON exportados da Manus ou de outro sistema.
                                                              Cada arquivo CSV sera importado como uma tabela separada.
                                              </CardDescription>
                                </CardHeader>
                                <CardContent>
                                              <div
                                                                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
                                                                onDrop={handleDrop}
                                                                onDragOver={(e) => e.preventDefault()}
                                                                onClick={() => document.getElementById("file-input")?.click()}
                                                              >
                                                              <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                                              <p className="text-lg font-medium text-gray-700">
                                                                                Arraste arquivos aqui ou clique para selecionar
                                                              </p>
                                                              <p className="text-sm text-gray-500 mt-2">
                                                                                Formatos aceitos: .csv, .json
                                                              </p>
                                                              <input
                                                                                  id="file-input"
                                                                                  type="file"
                                                                                  multiple
                                                                                  accept=".csv,.json"
                                                                                  className="hidden"
                                                                                  onChange={handleFileChange}
                                                                                />
                                              </div>
                                
                                              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                                              <h3 className="font-semibold text-amber-800 mb-2">Formato esperado para JSON:</h3>
                                                              <pre className="text-xs text-amber-700 bg-amber-100 p-3 rounded overflow-x-auto">
                                                                {`{
                                                                  "tables": [
                                                                      {
                                                                            "tableName": "users",
                                                                                  "columns": ["id", "name", "email"],
                                                                                        "rows": [[1, "Felipe", "felipe@email.com"]]
                                                                                            }
                                                                                              ]
                                                                                              }`}
                                                              </pre>
                                              </div>
                                </CardContent>
                    </Card>
                      )}
              
                {/* Step 2: Review */}
                {step === "review" && (
                    <div className="space-y-4">
                                <Card>
                                              <CardHeader>
                                                              <CardTitle>2. Revise os dados</CardTitle>
                                                              <CardDescription>
                                                                {parsedTables.length} tabela(s) encontrada(s) com{" "}
                                                                {parsedTables.reduce((sum, t) => sum + t.rowCount, 0)} registros no total
                                                              </CardDescription>
                                              </CardHeader>
                                              <CardContent className="space-y-4">
                                                              <div className="flex items-center gap-4">
                                                                                <label className="font-medium text-sm">Modo de importacao:</label>
                                                                                <Select value={importMode} onValueChange={setImportMode}>
                                                                                                    <SelectTrigger className="w-64">
                                                                                                                          <SelectValue />
                                                                                                      </SelectTrigger>
                                                                                                    <SelectContent>
                                                                                                                          <SelectItem value="insert">Inserir (ignora duplicados)</SelectItem>
                                                                                                                          <SelectItem value="upsert">Atualizar ou inserir</SelectItem>
                                                                                                                          <SelectItem value="replace">Substituir existentes</SelectItem>
                                                                                                      </SelectContent>
                                                                                </Select>
                                                              </div>
                                              
                                                {parsedTables.map((table, idx) => (
                                        <div key={idx} className="border rounded-lg p-4">
                                                            <div className="flex items-center justify-between mb-2">
                                                                                  <div className="flex items-center gap-2">
                                                                                                          <FileSpreadsheet className="h-5 w-5 text-green-600" />
                                                                                                          <span className="font-semibold">{table.tableName}</span>
                                                                                    </div>
                                                                                  <div className="flex gap-2">
                                                                                                          <Badge variant="secondary">{table.columns.length} colunas</Badge>
                                                                                                          <Badge variant="outline">{table.rowCount} registros</Badge>
                                                                                    </div>
                                                            </div>
                                                            <div className="text-xs text-gray-500 overflow-x-auto">
                                                                                  Colunas: {table.columns.join(", ")}
                                                            </div>
                                          {table.rowCount > 0 && (
                                                                <div className="mt-2 text-xs bg-gray-50 p-2 rounded max-h-32 overflow-auto">
                                                                                        <strong>Preview (primeiras 3 linhas):</strong>
                                                                  {table.rows.slice(0, 3).map((row, ri) => (
                                                                                            <div key={ri} className="truncate">
                                                                                              {row.map((v, ci) => `${table.columns[ci]}=${v}`).join(" | ")}
                                                                                              </div>
                                                                                          ))}
                                                                </div>
                                                            )}
                                        </div>
                                      ))}
                                              
                                                              <div className="flex gap-3 pt-4">
                                                                                <Button variant="outline" onClick={resetImport}>
                                                                                                    Cancelar
                                                                                </Button>
                                                                                <Button onClick={handleImport} className="bg-green-600 hover:bg-green-700">
                                                                                                    <Database className="h-4 w-4 mr-2" />
                                                                                                    Iniciar Importacao
                                                                                </Button>
                                                              </div>
                                              </CardContent>
                                </Card>
                    </div>
                      )}
              
                {/* Step 3: Importing */}
                {step === "importing" && (
                    <Card>
                                <CardContent className="py-12 text-center">
                                              <Loader2 className="h-12 w-12 mx-auto text-blue-500 animate-spin mb-4" />
                                              <h3 className="text-lg font-semibold">Importando dados...</h3>
                                              <p className="text-gray-500 mt-2">Aguarde enquanto os dados sao processados</p>
                                              <Progress value={importProgress} className="mt-6 max-w-md mx-auto" />
                                </CardContent>
                    </Card>
                      )}
              
                {/* Step 4: Results */}
                {step === "done" && importResults && (
                    <div className="space-y-4">
                                <Card>
                                              <CardHeader>
                                                              <CardTitle className="flex items-center gap-2">
                                                                {importResults.success ? (
                                          <CheckCircle className="h-6 w-6 text-green-500" />
                                        ) : (
                                          <AlertCircle className="h-6 w-6 text-yellow-500" />
                                        )}
                                                                                Importacao {importResults.success ? "Concluida" : "Concluida com Erros"}
                                                              </CardTitle>
                                                              <CardDescription>
                                                                {importResults.totalTablesProcessed} tabela(s) processada(s),{" "}
                                                                {importResults.totalRowsImported} registro(s) importado(s)
                                                              </CardDescription>
                                              </CardHeader>
                                              <CardContent>
                                                {importResults.results.map((result, idx) => (
                                        <div key={idx} className={`border rounded-lg p-3 mb-2 ${result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                                                            <div className="flex items-center justify-between">
                                                                                  <span className="font-medium">{result.table}</span>
                                                                                  <div className="flex gap-2">
                                                                                                          <Badge variant={result.success ? "default" : "destructive"}>
                                                                                                            {result.rowsImported} importados
                                                                                                            </Badge>
                                                                                    {result.errors.length > 0 && (
                                                                    <Badge variant="destructive">{result.errors.length} erro(s)</Badge>
                                                                                                          )}
                                                                                    </div>
                                                            </div>
                                          {result.errors.length > 0 && (
                                                                <div className="mt-2 text-xs text-red-600">
                                                                  {result.errors.map((err, ei) => (
                                                                                            <div key={ei}>{err}</div>
                                                                                          ))}
                                                                </div>
                                                            )}
                                        </div>
                                      ))}
                                              
                                                              <div className="flex gap-3 pt-4">
                                                                                <Button variant="outline" onClick={resetImport}>
                                                                                                    Nova Importacao
                                                                                </Button>
                                                                                <Button onClick={() => navigate("/")}>
                                                                                                    Voltar ao Dashboard
                                                                                </Button>
                                                              </div>
                                              </CardContent>
                                </Card>
                    </div>
                      )}
              </div>
        </div>
      );
}
