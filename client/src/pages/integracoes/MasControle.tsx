import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, Wifi, WifiOff, Upload,
  Building2, Users, Package, AlertTriangle, FileText, History,
  Download, ChevronDown, ChevronUp, RefreshCw, Info,
} from "lucide-react";

// ── CSV Parser ─────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  if (lines.length < 2) return [];

  // Detecta separador: ponto-e-vírgula (Excel BR) ou vírgula
  const firstLine = lines[0];
  const sep = firstLine.includes(";") ? ";" : ",";

  function parseLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        result.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = parseLine(lines[0]).map(h => h.replace(/^["']|["']$/g, "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? "").replace(/^["']|["']$/g, "").trim(); });
    rows.push(row);
  }
  return rows;
}

// ── Tipos ──────────────────────────────────────────────────────────────────
type ImportResult = {
  total: number; importados: number; duplicados: number;
  erros: number; detalhesErros: string[];
};

type Tab = "config" | "api" | "csv" | "historico";

// ── Componente de resultado de importação ──────────────────────────────────
function ResultCard({ label, r, icon: Icon, color }: { label: string; r: ImportResult; icon: any; color: string }) {
  const [showErros, setShowErros] = useState(false);
  return (
    <div className={`bg-white rounded-xl border p-4 ${r.erros > 0 ? "border-yellow-200" : "border-emerald-200"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="font-semibold text-slate-700">{label}</span>
        </div>
        {r.erros > 0 && (
          <Badge className="bg-yellow-100 text-yellow-700 border-0">
            <AlertTriangle className="h-3 w-3 mr-1" />{r.erros} erros
          </Badge>
        )}
        {r.erros === 0 && r.importados > 0 && <Badge className="bg-emerald-100 text-emerald-700 border-0"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3 text-center">
        <div>
          <p className="text-xs text-slate-400">Encontrados</p>
          <p className="text-xl font-bold text-slate-700">{r.total}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Importados</p>
          <p className="text-xl font-bold text-emerald-600">{r.importados}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Duplicados / Erros</p>
          <p className="text-xl font-bold text-slate-500">{r.duplicados} / {r.erros}</p>
        </div>
      </div>
      {r.erros > 0 && (
        <div className="mt-3">
          <button className="flex items-center gap-1 text-xs text-yellow-700 hover:underline" onClick={() => setShowErros(v => !v)}>
            {showErros ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} Ver erros ({r.erros})
          </button>
          {showErros && (
            <div className="mt-2 max-h-32 overflow-y-auto bg-yellow-50 rounded p-2 text-xs text-yellow-800 space-y-0.5">
              {r.detalhesErros.map((e, i) => <p key={i}>• {e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CSV Upload Card ─────────────────────────────────────────────────────────
function CSVUploadCard({
  label, icon: Icon, color, description, colunas, onImport, loading,
}: {
  label: string; icon: any; color: string; description: string;
  colunas: string[]; onImport: (rows: Record<string, string>[]) => void; loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [erro, setErro] = useState("");

  function handleFile(file: File) {
    setErro("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length === 0) { setErro("Arquivo vazio ou formato inválido."); return; }
        setPreview(rows.slice(0, 3));
        toast.success(`${rows.length} linha(s) lidas do CSV.`);
      } catch {
        setErro("Erro ao ler o arquivo.");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function importar() {
    if (!preview) return;
    // Re-read the file for full data
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target?.result as string);
      onImport(rows);
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="font-semibold text-slate-700">{label}</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">{description}</p>

      {/* Colunas esperadas */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Colunas esperadas (Excel/CSV)</p>
        <div className="flex flex-wrap gap-1">
          {colunas.map(c => <span key={c} className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded font-mono">{c}</span>)}
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
      >
        <Upload className="h-5 w-5 text-slate-400 mx-auto mb-1.5" />
        {fileName ? (
          <p className="text-xs font-medium text-blue-700">{fileName}</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">Arraste o arquivo CSV/Excel aqui</p>
            <p className="text-[10px] text-slate-400">ou clique para selecionar</p>
          </>
        )}
        <input
          ref={inputRef} type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {erro && <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1"><XCircle className="h-3 w-3" />{erro}</p>}

      {/* Pré-visualização */}
      {preview && (
        <div className="mt-3 overflow-x-auto">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Pré-visualização (3 primeiras linhas)</p>
          <table className="text-[10px] w-full border border-slate-100 rounded">
            <thead className="bg-slate-50">
              <tr>
                {Object.keys(preview[0]).map(h => <th key={h} className="px-2 py-1 text-left text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-slate-50">
                  {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 text-slate-600 truncate max-w-[120px]">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <Button onClick={importar} disabled={loading} className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white text-sm h-8">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Upload className="h-3.5 w-3.5 mr-2" />}
          Importar {label}
        </Button>
      )}
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function MasControle() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [tab, setTab] = useState<Tab>("config");
  const [loginEmail, setLoginEmail] = useState("");
  const [token, setToken]           = useState("");
  const [testandoAPI, setTestandoAPI] = useState(false);
  const [statusAPI, setStatusAPI]   = useState<"idle" | "ok" | "error">("idle");
  const [apiBase, setApiBase]       = useState("");
  const [apiErro, setApiErro]       = useState("");

  // Resultados de importação
  const [results, setResults] = useState<Record<string, ImportResult>>({});

  const { data: config } = trpc.masControle.carregarConfig.useQuery({ companyId }, { enabled: !!companyId });
  const { data: logs = [], refetch: refetchLogs } = trpc.masControle.listarLogs.useQuery({ companyId }, { enabled: !!companyId && tab === "historico" });

  const testarConexaoMut     = trpc.masControle.testarConexao.useMutation();
  const salvarConfigMut      = trpc.masControle.salvarConfig.useMutation({ onSuccess: () => toast.success("Credenciais salvas.") });
  const marcarConcluidaMut   = trpc.masControle.marcarMigracaoConcluida.useMutation({ onSuccess: () => toast.success("Migração marcada como concluída!") });

  // API mutations
  const importObrasApiMut    = trpc.masControle.importarObrasAPI.useMutation({
    onSuccess: (r) => { setResults(p => ({ ...p, obras: r })); toast.success(`Obras: ${r.importados} importadas`); },
    onError: (e) => toast.error(e.message),
  });
  const importFornApiMut     = trpc.masControle.importarFornecedoresAPI.useMutation({
    onSuccess: (r) => { setResults(p => ({ ...p, fornecedores: r })); toast.success(`Fornecedores: ${r.importados} importados`); },
    onError: (e) => toast.error(e.message),
  });
  const importInsApiMut      = trpc.masControle.importarInsumosAPI.useMutation({
    onSuccess: (r) => { setResults(p => ({ ...p, insumos: r })); toast.success(`Insumos: ${r.importados} importados`); },
    onError: (e) => toast.error(e.message),
  });

  // CSV mutations
  const importObrasCsvMut    = trpc.masControle.importarObrasCSV.useMutation({
    onSuccess: (r) => { setResults(p => ({ ...p, obras: r })); refetchLogs(); toast.success(`Obras: ${r.importados} importadas`); },
    onError: (e) => toast.error(e.message),
  });
  const importFornCsvMut     = trpc.masControle.importarFornecedoresCSV.useMutation({
    onSuccess: (r) => { setResults(p => ({ ...p, fornecedores: r })); refetchLogs(); toast.success(`Fornecedores: ${r.importados} importados`); },
    onError: (e) => toast.error(e.message),
  });
  const importInsCsvMut      = trpc.masControle.importarInsumosCSV.useMutation({
    onSuccess: (r) => { setResults(p => ({ ...p, insumos: r })); refetchLogs(); toast.success(`Insumos: ${r.importados} importados`); },
    onError: (e) => toast.error(e.message),
  });

  async function testarConexao() {
    if (!loginEmail || !token) { toast.error("Preencha e-mail e token."); return; }
    setTestandoAPI(true); setStatusAPI("idle"); setApiErro("");
    try {
      const r = await testarConexaoMut.mutateAsync({ companyId, loginEmail, token });
      if (r.ok) { setStatusAPI("ok"); setApiBase(r.base); toast.success("Conexão estabelecida com sucesso!"); }
      else { setStatusAPI("error"); setApiErro(r.error || "Falha na conexão"); }
    } catch (e: any) { setStatusAPI("error"); setApiErro(e.message); }
    finally { setTestandoAPI(false); }
  }

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "config",    label: "Configuração",  icon: Wifi },
    { id: "api",       label: "Importar via API",  icon: RefreshCw },
    { id: "csv",       label: "Importar via CSV",  icon: Upload },
    { id: "historico", label: "Histórico",     icon: History },
  ];

  const anyCsvLoading = importObrasCsvMut.isPending || importFornCsvMut.isPending || importInsCsvMut.isPending;
  const anyApiLoading = importObrasApiMut.isPending || importFornApiMut.isPending || importInsApiMut.isPending;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">MC</span>
                </div>
                Integração — Mas Controle ERP
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Migre todos os dados do Mas Controle para o seu ERP antes de cancelar o contrato
              </p>
            </div>
            <div className="flex items-center gap-2">
              {config?.migratedAt ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Migração concluída em {new Date(config.migratedAt).toLocaleDateString("pt-BR")}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500 text-xs">Migração pendente</Badge>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* ═════════════════ ABA: CONFIGURAÇÃO ═════════════════ */}
        {tab === "config" && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-sm text-blue-800">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
              <div>
                <strong>Como obter as credenciais:</strong> No Mas Controle, acesse{" "}
                <strong>Configurações → Integração → Configurar → Ativar API para Relatórios</strong>.
                O sistema gera um e-mail de login e senha/token que devem ser inseridos abaixo.
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-slate-700">Credenciais da API</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">E-mail de login da API</Label>
                  <Input
                    value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                    placeholder="login@sua-empresa.mas.controle"
                    className="mt-1" type="email"
                  />
                </div>
                <div>
                  <Label className="text-xs">Senha / Token</Label>
                  <Input
                    value={token} onChange={e => setToken(e.target.value)}
                    placeholder="Token gerado pelo Mas Controle"
                    className="mt-1" type="password"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={testarConexao} disabled={testandoAPI || !loginEmail || !token} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {testandoAPI ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
                  Testar Conexão
                </Button>
                <Button variant="outline" onClick={() => salvarConfigMut.mutate({ companyId, loginEmail, token })} disabled={!loginEmail || !token}>
                  Salvar Credenciais
                </Button>
              </div>

              {/* Status da conexão */}
              {statusAPI === "ok" && (
                <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-700">Conectado com sucesso!</p>
                    <p className="text-emerald-600 text-xs mt-0.5">URL: {apiBase}</p>
                    <p className="text-emerald-600 text-xs">Vá para a aba <strong>Importar via API</strong> para iniciar a migração.</p>
                  </div>
                </div>
              )}
              {statusAPI === "error" && (
                <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                  <WifiOff className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700">Falha na conexão</p>
                    <p className="text-red-600 text-xs mt-0.5">{apiErro}</p>
                    <p className="text-red-600 text-xs mt-1">
                      Use a aba <strong>Importar via CSV</strong> — exporte os dados do Mas Controle em Excel/CSV e importe aqui.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Instruções para exportar CSV */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <h2 className="font-semibold text-slate-700 mb-3">Exportando dados do Mas Controle via Excel</h2>
              <p className="text-sm text-slate-500 mb-4">Caso a API não esteja disponível, exporte os dados manualmente:</p>
              <div className="space-y-3">
                {[
                  { n: 1, t: "Obras", i: "Relatórios → Obras → Exportar Excel. Colunas mínimas: Nome da Obra, Código, Cliente, Status, Data de Início, Previsão de Término" },
                  { n: 2, t: "Fornecedores", i: "Cadastros → Fornecedores → Exportar. Colunas mínimas: CNPJ, Razão Social, Nome Fantasia, E-mail, Telefone" },
                  { n: 3, t: "Insumos / Materiais", i: "Cadastros → Insumos → Exportar. Colunas mínimas: Descrição, Unidade, Código, Grupo" },
                ].map(s => (
                  <div key={s.n} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{s.t}</p>
                      <p className="text-xs text-slate-500">{s.i}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {!config?.migratedAt && Object.keys(results).length > 0 && (
              <Button
                onClick={() => marcarConcluidaMut.mutate({ companyId })}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Marcar migração como concluída
              </Button>
            )}
          </div>
        )}

        {/* ═════════════════ ABA: IMPORTAR VIA API ═════════════════ */}
        {tab === "api" && (
          <div className="space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <strong>Atenção:</strong> A importação via API depende dos endpoints do Mas Controle estarem acessíveis.
                Se a conexão falhar, use a aba <strong>Importar via CSV</strong> como alternativa garantida.
                Todos os dados importados são marcados com a origem "Mas Controle" nas observações.
              </div>
            </div>

            {/* Credenciais inline */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Credenciais para esta sessão</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">E-mail</Label>
                  <Input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Token</Label>
                  <Input value={token} onChange={e => setToken(e.target.value)} className="mt-1 h-8 text-sm" type="password" />
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {/* Obras via API */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-slate-700">Obras</span>
                    <span className="text-xs text-slate-400">→ tabela obras</span>
                  </div>
                  <Button size="sm" disabled={!loginEmail || !token || importObrasApiMut.isPending}
                    onClick={() => importObrasApiMut.mutate({ companyId, loginEmail, token })}>
                    {importObrasApiMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Importar Obras
                  </Button>
                </div>
                {results.obras && <div className="mt-3"><ResultCard label="Obras" r={results.obras} icon={Building2} color="text-blue-600" /></div>}
              </div>

              {/* Fornecedores via API */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    <span className="font-semibold text-slate-700">Fornecedores</span>
                    <span className="text-xs text-slate-400">→ tabela fornecedores</span>
                  </div>
                  <Button size="sm" disabled={!loginEmail || !token || importFornApiMut.isPending}
                    onClick={() => importFornApiMut.mutate({ companyId, loginEmail, token })}>
                    {importFornApiMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Importar Fornecedores
                  </Button>
                </div>
                {results.fornecedores && <div className="mt-3"><ResultCard label="Fornecedores" r={results.fornecedores} icon={Users} color="text-purple-600" /></div>}
              </div>

              {/* Insumos via API */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-slate-700">Insumos / Materiais</span>
                    <span className="text-xs text-slate-400">→ almoxarifado_itens</span>
                  </div>
                  <Button size="sm" disabled={!loginEmail || !token || importInsApiMut.isPending}
                    onClick={() => importInsApiMut.mutate({ companyId, loginEmail, token })}>
                    {importInsApiMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Importar Insumos
                  </Button>
                </div>
                {results.insumos && <div className="mt-3"><ResultCard label="Insumos" r={results.insumos} icon={Package} color="text-emerald-600" /></div>}
              </div>
            </div>
          </div>
        )}

        {/* ═════════════════ ABA: IMPORTAR VIA CSV ═════════════════ */}
        {tab === "csv" && (
          <div className="space-y-5">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
              <div>
                <strong>Método garantido.</strong> Exporte os dados do Mas Controle em formato Excel ou CSV,
                depois faça upload abaixo. O sistema aceita separadores por vírgula (<code>,</code>) ou
                ponto-e-vírgula (<code>;</code>) e detecta automaticamente.
                A importação é <strong>idempotente</strong> — rodar duas vezes não duplica dados.
              </div>
            </div>

            <div className="grid gap-4">
              <CSVUploadCard
                label="Obras" icon={Building2} color="text-blue-600"
                description="Importe todas as obras cadastradas no Mas Controle."
                colunas={["Nome da Obra", "Código", "Cliente", "Endereço", "Status", "Data de Início", "Previsão de Término", "Valor do Contrato"]}
                loading={importObrasCsvMut.isPending}
                onImport={rows => importObrasCsvMut.mutate({ companyId, rows })}
              />
              {results.obras && <ResultCard label="Obras" r={results.obras} icon={Building2} color="text-blue-600" />}

              <CSVUploadCard
                label="Fornecedores" icon={Users} color="text-purple-600"
                description="Importe o cadastro de fornecedores. O CNPJ é usado para evitar duplicatas."
                colunas={["CNPJ", "Razão Social", "Nome Fantasia", "E-mail", "Telefone", "Cidade", "Estado"]}
                loading={importFornCsvMut.isPending}
                onImport={rows => importFornCsvMut.mutate({ companyId, rows })}
              />
              {results.fornecedores && <ResultCard label="Fornecedores" r={results.fornecedores} icon={Users} color="text-purple-600" />}

              <CSVUploadCard
                label="Insumos / Materiais" icon={Package} color="text-emerald-600"
                description="Importe o catálogo de insumos para o Almoxarifado Central."
                colunas={["Descrição", "Unidade", "Código", "Grupo"]}
                loading={importInsCsvMut.isPending}
                onImport={rows => importInsCsvMut.mutate({ companyId, rows })}
              />
              {results.insumos && <ResultCard label="Insumos" r={results.insumos} icon={Package} color="text-emerald-600" />}
            </div>

            {Object.keys(results).length > 0 && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-semibold text-slate-700 mb-3">Resumo desta sessão</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  {Object.entries(results).map(([key, r]) => (
                    <div key={key} className={`rounded-lg p-3 ${r.erros > 0 ? "bg-yellow-50" : "bg-emerald-50"}`}>
                      <p className="text-xs font-medium text-slate-600 capitalize">{key}</p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1">{r.importados}</p>
                      <p className="text-[10px] text-slate-500">importados de {r.total}</p>
                      {r.erros > 0 && <p className="text-[10px] text-red-600 mt-0.5">{r.erros} erros</p>}
                    </div>
                  ))}
                </div>
                {!config?.migratedAt && (
                  <Button
                    onClick={() => marcarConcluidaMut.mutate({ companyId })}
                    className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar migração como concluída
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═════════════════ ABA: HISTÓRICO ═════════════════ */}
        {tab === "historico" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-700">Histórico de migrações</h2>
              <Button size="sm" variant="outline" onClick={() => refetchLogs()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Atualizar
              </Button>
            </div>

            {logs.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
                <History className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500">Nenhuma migração registrada ainda</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Data</th>
                      <th className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Tipo</th>
                      <th className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Via</th>
                      <th className="text-right px-3 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Encontrados</th>
                      <th className="text-right px-3 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Importados</th>
                      <th className="text-right px-3 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Duplicados</th>
                      <th className="text-right px-3 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Erros</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Usuário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {log.executadoEm ? new Date(log.executadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span className="capitalize font-medium text-slate-700">{log.tipoDado}</span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className="text-[10px]">
                            {log.via?.toUpperCase() ?? "CSV"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-600">{log.totalEncontrado}</td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-600">{log.totalImportado}</td>
                        <td className="px-3 py-3 text-right text-slate-500">{log.totalDuplicado}</td>
                        <td className="px-3 py-3 text-right">
                          {(log.totalErro ?? 0) > 0
                            ? <span className="text-red-600 font-semibold">{log.totalErro}</span>
                            : <span className="text-slate-400">0</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{log.executadoPorNome || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
