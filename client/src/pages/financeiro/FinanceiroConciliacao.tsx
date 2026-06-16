import { useMemo, useState, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, RefreshCw, ArrowUpCircle, ArrowDownCircle, Upload, FileText, Sparkles, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtData(v: any) {
  if (!v) return "—";
  try {
    const d = typeof v === "string" ? new Date(v.length > 10 ? v : v + "T00:00:00") : new Date(v);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function FinanceiroConciliacao() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  // Rev. 3165 — Período pelo MESMO PADRÃO das demais telas do Financeiro: navegação por
  // ANO + meses (Jan–Dez). `mesSel=null` = "Ano todo". dataInicio/dataFim derivam daí.
  const _now = new Date();
  const [ano, setAno] = useState(_now.getFullYear());
  const [mesSel, setMesSel] = useState<number | null>(_now.getMonth() + 1);
  const { dataInicio, dataFim } = useMemo(() => {
    if (mesSel == null) return { dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` };
    const mm = String(mesSel).padStart(2, "0");
    const ultimoDia = new Date(ano, mesSel, 0).getDate();
    return { dataInicio: `${ano}-${mm}-01`, dataFim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
  }, [ano, mesSel]);
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [conciliadoFilter, setConciliadoFilter] = useState("all");
  const [selectedStatement, setSelectedStatement] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFormato, setImportFormato] = useState<"ofx" | "csv">("ofx");
  const [importConta, setImportConta] = useState("");
  const [importContent, setImportContent] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [csvSeparador, setCsvSeparador] = useState(";");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [toleranciaDias, setToleranciaDias] = useState(5);
  const [selSug, setSelSug] = useState<Set<number>>(new Set());

  const { data: bankAccounts } = (trpc as any).financial.getBankAccounts.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: statements, isLoading: stLoading, refetch: refetchSt } = (trpc as any).financial.getBankStatements.useQuery(
    {
      companyId,
      contaBancariaId: parseInt(contaBancariaId) || 0,
      dataInicio,
      dataFim,
      conciliado: conciliadoFilter !== "all" ? conciliadoFilter === "conciliado" : undefined,
    },
    { enabled: !!companyId && !!contaBancariaId }
  );

  const { data: entries } = (trpc as any).financial.getEntries.useQuery(
    { companyId, dataInicio, dataFim, limit: 100 },
    { enabled: !!companyId }
  );

  // Rev. 3165 — Extrato do ANO inteiro (apenas p/ pintar as bolinhas de status de cada mês),
  // independente do mês selecionado na timeline. Só busca quando há conta escolhida.
  const { data: statementsAno } = (trpc as any).financial.getBankStatements.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio: `${ano}-01-01`, dataFim: `${ano}-12-31` },
    { enabled: !!companyId && !!contaBancariaId }
  );
  const mesesStatus: Record<number, "consolidado" | "lancamento" | "vazio"> = useMemo(() => {
    const map: Record<number, "consolidado" | "lancamento" | "vazio"> = {};
    for (let m = 1; m <= 12; m++) map[m] = "vazio";
    const byMonth: Record<number, { total: number; pend: number }> = {};
    for (const s of (statementsAno ?? [])) {
      if (!s?.data) continue;
      const raw = String(s.data);
      const d = new Date(raw.length > 10 ? raw : raw + "T00:00:00");
      if (isNaN(d.getTime())) continue;
      const m = d.getMonth() + 1;
      const b = byMonth[m] ?? { total: 0, pend: 0 };
      b.total++;
      if (!s.conciliado) b.pend++;
      byMonth[m] = b;
    }
    for (let m = 1; m <= 12; m++) {
      const b = byMonth[m];
      map[m] = !b || b.total === 0 ? "vazio" : b.pend === 0 ? "consolidado" : "lancamento";
    }
    return map;
  }, [statementsAno]);

  const conciliarMut = (trpc as any).financial.conciliarLancamento.useMutation({
    onSuccess: () => { toast({ title: "Conciliação registrada!" }); refetchSt(); setSelectedStatement(null); setSelectedEntry(null); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const importMut = (trpc as any).financial.importBankStatement.useMutation({
    onSuccess: (res: any) => {
      toast({ title: `Importação concluída! ${res.inserted} inseridos, ${res.skipped} duplicados ignorados` });
      setShowImport(false);
      setImportContent("");
      setImportFileName("");
      refetchSt();
    },
    onError: (e: any) => toast({ title: "Erro na importação", description: e.message, variant: "destructive" }),
  });

  const { data: sugData, isFetching: sugLoading, refetch: refetchSug } = (trpc as any).financial.sugerirConciliacao.useQuery(
    { companyId, contaBancariaId: parseInt(contaBancariaId) || 0, dataInicio, dataFim, toleranciaDias },
    { enabled: !!companyId && !!contaBancariaId && mostrarSugestoes }
  );
  const sugestoes: any[] = sugData?.sugestoes ?? [];
  const semMatch: any[] = sugData?.semMatch ?? [];

  const conciliarSugMut = (trpc as any).financial.conciliarSugestoes.useMutation({
    onSuccess: (res: any) => {
      toast({ title: `${res.conciliados} de ${res.total} conciliados e baixados!` });
      setSelSug(new Set());
      refetchSt();
      refetchSug();
    },
    onError: (e: any) => toast({ title: "Erro ao conciliar", description: e.message, variant: "destructive" }),
  });

  const toggleSug = (id: number) => setSelSug(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const selecionarAlta = () => setSelSug(new Set(sugestoes.filter(s => s.confianca === "alta").map(s => s.statementLineId)));
  const selecionarTodas = () => setSelSug(new Set(sugestoes.map(s => s.statementLineId)));
  const conciliarSelecionadas = () => {
    const pares = sugestoes.filter(s => selSug.has(s.statementLineId)).map(s => ({ statementLineId: s.statementLineId, entryId: s.entryId }));
    if (pares.length === 0) { toast({ title: "Selecione ao menos uma sugestão", variant: "destructive" }); return; }
    conciliarSugMut.mutate({ companyId, pares });
  };

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "ofx" || ext === "qfx") setImportFormato("ofx");
    else setImportFormato("csv");
    const reader = new FileReader();
    reader.onload = (ev) => { setImportContent(ev.target?.result as string ?? ""); };
    reader.readAsText(file, "ISO-8859-1");
  }

  function handleImport() {
    if (!importContent) { toast({ title: "Selecione um arquivo", variant: "destructive" }); return; }
    if (!importConta) { toast({ title: "Selecione a conta bancária", variant: "destructive" }); return; }
    importMut.mutate({
      companyId,
      contaBancariaId: parseInt(importConta),
      formato: importFormato,
      conteudo: importContent,
      csvSeparador: importFormato === "csv" ? csvSeparador : undefined,
    });
  }

  const pendentes = (statements ?? []).filter((s: any) => !s.conciliado);
  const conciliados = (statements ?? []).filter((s: any) => s.conciliado);
  const totalEntradas = pendentes.filter((s: any) => s.tipo === "credito").reduce((a: number, s: any) => a + Number(s.valor), 0);
  const totalSaidas = pendentes.filter((s: any) => s.tipo === "debito").reduce((a: number, s: any) => a + Math.abs(Number(s.valor)), 0);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-6 h-6 text-blue-600" />Conciliação Bancária
            </h1>
            <p className="text-sm text-gray-500 mt-1">Relacione os lançamentos do sistema com o extrato bancário</p>
          </div>
          <Button size="sm" className="h-9" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
            <Upload className="w-3.5 h-3.5 mr-1.5" />Importar Extrato
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Rev. 3165 — Período pelo MESMO PADRÃO do Lançamentos/Contas a Pagar:
                  navegação por ANO + faixa de meses (Jan–Dez) com bolinhas de status.
                  Clicar num mês filtra aquele mês; "Ano todo" abre o ano. */}
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAno(a => a - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-base font-bold text-gray-800 min-w-[3.5rem] text-center">{ano}</span>
                    <button type="button" onClick={() => setAno(a => a + 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <Button
                      type="button"
                      variant={mesSel == null ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs ml-2"
                      onClick={() => setMesSel(null)}
                    >
                      Ano todo
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Com lançamento</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Consolidado</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />Sem dados</span>
                  </div>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {MESES.map((m, i) => {
                    const num = i + 1;
                    const status = mesesStatus[num];
                    const isSelected = mesSel === num;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMesSel(num)}
                        className={`relative flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-all
                          ${isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        <span>{m}</span>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          status === "consolidado" ? "bg-green-500" :
                          status === "lancamento" ? "bg-blue-500" :
                          "bg-gray-300"
                        }`} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[180px]">
                  <p className="text-xs text-gray-500 mb-1">Conta Bancária</p>
                  <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                    <SelectTrigger><SelectValue placeholder="Selecione a conta..." /></SelectTrigger>
                    <SelectContent>
                      {(bankAccounts ?? []).map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.banco} - {b.agencia}/{b.conta} ({b.descricao ?? b.tipo ?? ""})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <Select value={conciliadoFilter} onValueChange={setConciliadoFilter}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="conciliado">Conciliados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {!contaBancariaId ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <RefreshCw className="w-14 h-14 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">Selecione uma conta bancária para iniciar a conciliação.</p>
              <p className="text-xs text-gray-400 mt-2">Ou importe um extrato bancário (OFX/CSV) para começar</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-500">Entradas Pendentes</span>
                  </div>
                  <p className="text-xl font-bold text-green-600">{formatBRL(totalEntradas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowDownCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-gray-500">Saídas Pendentes</span>
                  </div>
                  <p className="text-xl font-bold text-red-500">{formatBRL(totalSaidas)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span className="text-xs text-gray-500">Itens Conciliados</span>
                  </div>
                  <p className="text-xl font-bold text-blue-600">{conciliados.length}</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Sugestões Automáticas de Conciliação
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-500">Tolerância (dias)</Label>
                    <Select value={String(toleranciaDias)} onValueChange={v => setToleranciaDias(parseInt(v))}>
                      <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2, 3, 5, 7, 10, 15, 30].map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant={mostrarSugestoes ? "outline" : "default"}
                      onClick={() => { setMostrarSugestoes(true); setSelSug(new Set()); if (mostrarSugestoes) refetchSug(); }}
                      disabled={sugLoading}
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      {sugLoading ? "Analisando..." : mostrarSugestoes ? "Reanalisar" : "Sugerir conciliação"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {mostrarSugestoes && (
                <CardContent className="pt-0">
                  {sugLoading ? (
                    <p className="text-sm text-gray-500 py-6 text-center">Cruzando extrato × lançamentos por valor, direção e data…</p>
                  ) : sugestoes.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Nenhuma sugestão automática para a conta/período selecionados.
                      {sugData ? ` (${sugData.totalLinhas ?? 0} linha(s) de extrato analisada(s))` : ""}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <Button size="sm" variant="outline" onClick={selecionarAlta}>Selecionar alta confiança</Button>
                        <Button size="sm" variant="outline" onClick={selecionarTodas}>Selecionar todas</Button>
                        <Button size="sm" variant="outline" onClick={() => setSelSug(new Set())}>Limpar</Button>
                        <Button
                          size="sm"
                          className="ml-auto"
                          onClick={conciliarSelecionadas}
                          disabled={conciliarSugMut.isPending || selSug.size === 0}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {conciliarSugMut.isPending ? "Conciliando..." : `Conciliar selecionadas (${selSug.size})`}
                        </Button>
                      </div>
                      <div className="border rounded-md divide-y max-h-[480px] overflow-y-auto">
                        {sugestoes.map(s => (
                          <label key={s.statementLineId} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                            <Checkbox checked={selSug.has(s.statementLineId)} onCheckedChange={() => toggleSug(s.statementLineId)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Extrato</div>
                              <div className="text-sm font-medium truncate">{s.extratoDescricao || "—"}</div>
                              <div className="text-xs text-gray-500">{fmtData(s.extratoData)} · {formatBRL(Math.abs(s.extratoValor))}</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Lançamento</div>
                              <div className="text-sm font-medium truncate">{s.entryFornecedor || s.entryDescricao || "—"}</div>
                              <div className="text-xs text-gray-500 truncate">
                                {fmtData(s.entryData)} · {formatBRL(Math.abs(s.entryValor))}
                                {s.entryObra ? ` · ${s.entryObra}` : ""}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <Badge variant={s.confianca === "alta" ? "default" : "secondary"}>
                                {s.confianca === "alta" ? "Alta" : "Média"}
                              </Badge>
                              <span className="text-[10px] text-gray-400">{s.deltaDias === 0 ? "mesmo dia" : `±${s.deltaDias}d`}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                      {semMatch.length > 0 && (
                        <p className="text-xs text-gray-400">
                          {semMatch.length} linha(s) de extrato sem lançamento correspondente (concilie manualmente abaixo).
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Extrato Bancário ({pendentes.length} pendentes)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {stLoading ? (
                    <div className="p-6 text-center text-gray-500">Carregando...</div>
                  ) : pendentes.length === 0 ? (
                    <div className="p-6 text-center text-gray-400">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p>Nenhum item pendente.</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => { setShowImport(true); setImportConta(contaBancariaId); }}>
                        Importar Extrato
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                      {pendentes.map((s: any) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedStatement(selectedStatement === s.id ? null : s.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedStatement === s.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                        >
                          <div>
                            <p className="text-xs text-gray-500">{s.data ? new Date(s.data).toLocaleDateString("pt-BR") : "—"}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[180px]">{s.descricao}</p>
                          </div>
                          <p className={`text-sm font-bold ${Number(s.valor) >= 0 ? "text-green-600" : "text-red-500"}`}>
                            {formatBRL(Number(s.valor))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Lançamentos do Sistema</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!selectedStatement ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Selecione um item do extrato para relacionar.</div>
                  ) : (
                    <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                      {(entries?.data ?? []).filter((e: any) => !e.conciliado && e.status !== "cancelado").map((e: any) => (
                        <button
                          key={e.id}
                          onClick={() => setSelectedEntry(selectedEntry === e.id ? null : e.id)}
                          className={`w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors ${selectedEntry === e.id ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                        >
                          <div>
                            <p className="text-xs text-gray-500">{e.dataCompetencia ? new Date(e.dataCompetencia).toLocaleDateString("pt-BR") : "—"}</p>
                            <p className="text-sm text-gray-700 truncate max-w-[180px]">{e.descricao ?? e.contaNome ?? "—"}</p>
                            <p className="text-xs text-gray-400">{e.obraNome ?? ""}</p>
                          </div>
                          <p className={`text-sm font-bold ${e.tipo === "receita" ? "text-green-600" : "text-red-500"}`}>
                            {e.tipo === "receita" ? "+" : "-"}{formatBRL(Number(e.valorPrevisto))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {selectedStatement && selectedEntry && (
              <div className="flex justify-center">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                  disabled={conciliarMut.isPending}
                  onClick={() => conciliarMut.mutate({ companyId, statementLineId: selectedStatement, entryId: selectedEntry })}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {conciliarMut.isPending ? "Conciliando..." : "Conciliar Selecionados"}
                </Button>
              </div>
            )}
          </>
        )}

        <Dialog open={showImport} onOpenChange={setShowImport}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" /> Importar Extrato Bancário
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div>
                <Label>Conta Bancária *</Label>
                <Select value={importConta} onValueChange={setImportConta}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(bankAccounts ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.banco} - {b.agencia}/{b.conta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Arquivo (OFX, QFX ou CSV) *</Label>
                <div className="mt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ofx,.qfx,.csv,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {importFileName || "Selecionar arquivo..."}
                  </Button>
                </div>
                {importContent && (
                  <p className="text-xs text-green-600 mt-1">
                    Arquivo carregado ({importFormato.toUpperCase()}, {(importContent.length / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
              {importFormato === "csv" && (
                <div>
                  <Label>Separador CSV</Label>
                  <Select value={csvSeparador} onValueChange={setCsvSeparador}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=";">Ponto e vírgula (;)</SelectItem>
                      <SelectItem value=",">Vírgula (,)</SelectItem>
                      <SelectItem value="\t">Tab</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-gray-400 mt-1">
                    O CSV deve ter colunas: Data, Descrição, Valor (e opcionalmente Saldo)
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImport(false)}>Cancelar</Button>
              <Button onClick={handleImport} disabled={importMut.isPending || !importContent || !importConta}>
                {importMut.isPending ? "Importando..." : "Importar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
