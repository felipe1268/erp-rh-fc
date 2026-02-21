import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Upload, CalendarDays, DollarSign, CreditCard, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle, FileText, Users, Lock, Unlock, Search,
  Eye, Trash2, RefreshCw, ArrowLeft, XCircle, Info, Building2,
  FileSpreadsheet, AlertCircle, ShieldCheck, Clock, TrendingUp,
  Filter, Briefcase, BarChart3, ChevronDown, ChevronUp
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function formatMesAno(mesAno: string): string {
  const [ano, mes] = mesAno.split("-");
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`;
}

function formatBRL(val: string | number | null | undefined): string {
  if (!val) return "R$ 0,00";
  if (typeof val === "number") return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (val.includes(",")) return `R$ ${val}`;
  const num = parseFloat(val);
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseBRLNum(val: string | number | null | undefined): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const clean = val.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

type ViewMode = "resumo" | "detalhes" | "custos_obra" | "horas_extras" | "verificacao";

export default function FolhaPagamento() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
  const mesAno = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}`;

  // Upload refs (direto no seletor de arquivos)
  const valeInputRef = useRef<HTMLInputElement>(null);
  const pagInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<"vale" | "pagamento" | null>(null);

  // Views
  const [viewMode, setViewMode] = useState<ViewMode>("resumo");
  const [viewLancId, setViewLancId] = useState<number | null>(null);
  const [viewTipo, setViewTipo] = useState<string>("");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFuncao, setFilterFuncao] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // ===== QUERIES =====
  const statusMes = trpc.folha.statusMes.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const mesesComLanc = trpc.folha.listarMesesComLancamentos.useQuery({ companyId, ano: anoSelecionado }, { enabled: companyId > 0 });
  const lancamentos = trpc.folha.listarLancamentos.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const itensDetail = trpc.folha.listarItens.useQuery(
    { folhaLancamentoId: viewLancId! },
    { enabled: !!viewLancId && (viewMode === "detalhes" || viewMode === "verificacao") }
  );
  const verificacao = trpc.folha.verificacaoCruzada.useQuery(
    { folhaLancamentoId: viewLancId!, companyId, mesReferencia: mesAno },
    { enabled: !!viewLancId && viewMode === "verificacao" }
  );
  const custosPorObra = trpc.folha.custosPorObra.useQuery(
    { folhaLancamentoId: viewLancId!, companyId, mesReferencia: mesAno },
    { enabled: !!viewLancId && companyId > 0 && viewMode === "custos_obra" }
  );
  const horasExtras = trpc.folha.horasExtrasPorFuncionario.useQuery(
    { companyId, mesReferencia: mesAno },
    { enabled: companyId > 0 && viewMode === "horas_extras" }
  );

  // ===== MUTATIONS =====
  const importarAutoMut = trpc.folha.importarFolhaAuto.useMutation({
    onSuccess: (data) => {
      const parts = [
        `${data.totalFuncionarios} funcionários processados`,
        `${data.match.matched} vinculados`,
        data.match.unmatched > 0 ? `${data.match.unmatched} não encontrados` : null,
        data.match.divergentes > 0 ? `${data.match.divergentes} com divergências` : null,
        data.match.codigosAtualizados > 0 ? `${data.match.codigosAtualizados} códigos cadastrados` : null,
      ].filter(Boolean);

      const fileInfo = data.arquivosProcessados.map((f: any) => `${f.fileName} → ${f.tipo} (${f.registros})`).join("\n");
      toast.success(
        <div>
          <p className="font-medium">{parts.join(" | ")}</p>
          <p className="text-xs mt-1 opacity-80">Arquivos: {data.arquivosProcessados.map((f: any) => `${f.tipo}: ${f.registros}`).join(", ")}</p>
        </div>,
        { duration: 8000 }
      );
      statusMes.refetch();
      lancamentos.refetch();
      mesesComLanc.refetch();
      setUploading(null);
    },
    onError: (err) => {
      toast.error(`Erro na importação: ${err.message}`);
      setUploading(null);
    },
  });

  const reprocessarMut = trpc.folha.reprocessarMatch.useMutation({
    onSuccess: (data) => {
      const parts = [
        `Re-match: ${data.matched} vinculados`,
        data.unmatched > 0 ? `${data.unmatched} não encontrados` : null,
        data.divergentes > 0 ? `${data.divergentes} divergentes` : null,
        data.codigosAtualizados > 0 ? `${data.codigosAtualizados} códigos atualizados` : null,
      ].filter(Boolean);
      toast.success(parts.join(" | "), { duration: 6000 });
      itensDetail.refetch();
      statusMes.refetch();
      lancamentos.refetch();
    },
  });

  const consolidarMut = trpc.folha.consolidarLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento consolidado!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch(); },
  });
  const desconsolidarMut = trpc.folha.desconsolidarLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento desconsolidado!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch(); },
  });
  const excluirMut = trpc.folha.excluirLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento excluído!"); statusMes.refetch(); lancamentos.refetch(); mesesComLanc.refetch(); setViewMode("resumo"); },
  });

  // ===== HANDLERS =====
  const handleFileSelect = useCallback(async (files: FileList | null, tipo: "vale" | "pagamento") => {
    if (!files || files.length === 0) return;
    setUploading(tipo);

    const arquivos: Array<{ fileName: string; fileBase64: string; mimeType: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      arquivos.push({ fileName: file.name, fileBase64: base64, mimeType: file.type || "application/pdf" });
    }

    importarAutoMut.mutate({
      companyId,
      mesReferencia: mesAno,
      tipoLancamento: tipo,
      arquivos,
    });

    // Reset input
    if (tipo === "vale" && valeInputRef.current) valeInputRef.current.value = "";
    if (tipo === "pagamento" && pagInputRef.current) pagInputRef.current.value = "";
  }, [companyId, mesAno, importarAutoMut]);

  function openView(mode: ViewMode, lancId?: number, tipo?: string) {
    setViewMode(mode);
    if (lancId) setViewLancId(lancId);
    if (tipo) setViewTipo(tipo);
    setSearchTerm("");
    setFilterStatus("all");
    setFilterFuncao("all");
    setExpandedRows(new Set());
  }

  function toggleRow(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getMonthStatus(mes: number): "sem_dados" | "parcial" | "completo" | "consolidado" {
    const mesRef = `${anoSelecionado}-${String(mes).padStart(2, "0")}`;
    const info = mesesComLanc.data?.[mesRef];
    if (!info) return "sem_dados";
    if (info.vale === "consolidado" && info.pagamento === "consolidado") return "consolidado";
    if (info.vale || info.pagamento) return "completo";
    return "parcial";
  }

  // Filter itens
  const filteredItens = useMemo(() => {
    if (!itensDetail.data) return [];
    let items = [...itensDetail.data];
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      items = items.filter((i: any) =>
        i.nomeColaborador.toUpperCase().includes(term) ||
        (i.codigoContabil && i.codigoContabil.includes(term)) ||
        (i.funcao && i.funcao.toUpperCase().includes(term))
      );
    }
    if (filterStatus !== "all") items = items.filter((i: any) => i.matchStatus === filterStatus);
    if (filterFuncao !== "all") items = items.filter((i: any) => (i.funcao || "").toUpperCase() === filterFuncao);
    return items;
  }, [itensDetail.data, searchTerm, filterStatus, filterFuncao]);

  // Unique funcoes for filter
  const funcoes = useMemo(() => {
    if (!itensDetail.data) return [];
    const set = new Set<string>();
    itensDetail.data.forEach((i: any) => { if (i.funcao) set.add(i.funcao.toUpperCase()); });
    return Array.from(set).sort();
  }, [itensDetail.data]);

  const vale = statusMes.data?.vale;
  const pagamento = statusMes.data?.pagamento;

  // Hidden file inputs for direct upload
  const fileInputs = (
    <>
      <input ref={valeInputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "vale")} />
      <input ref={pagInputRef} type="file" accept=".pdf" multiple className="sr-only"
        onChange={e => handleFileSelect(e.target.files, "pagamento")} />
    </>
  );

  // ===== SUB-VIEWS =====
  if (viewMode === "detalhes" && viewLancId) {
    return (
      <DashboardLayout>
        {fileInputs}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold">Detalhes — {viewTipo}</h1>
              <p className="text-sm text-muted-foreground">{formatMesAno(mesAno)} | {filteredItens.length} funcionários</p>
            </div>
          </div>

          {/* Stats bar */}
          {itensDetail.data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{itensDetail.data.length}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-green-700">{itensDetail.data.filter((i: any) => i.matchStatus === "matched").length}</p>
                <p className="text-xs text-muted-foreground">Vinculados</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-amber-700">{itensDetail.data.filter((i: any) => i.matchStatus === "divergente").length}</p>
                <p className="text-xs text-muted-foreground">Divergentes</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-red-700">{itensDetail.data.filter((i: any) => i.matchStatus === "unmatched").length}</p>
                <p className="text-xs text-muted-foreground">Não Encontrados</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input type="text" placeholder="Buscar nome, código ou função..." value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background">
              <option value="all">Todos os Status</option>
              <option value="matched">Vinculados</option>
              <option value="divergente">Divergentes</option>
              <option value="unmatched">Não Encontrados</option>
            </select>
            <select value={filterFuncao} onChange={e => setFilterFuncao(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-background max-w-[200px]">
              <option value="all">Todas as Funções</option>
              {funcoes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => reprocessarMut.mutate({ folhaLancamentoId: viewLancId, companyId })}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${reprocessarMut.isPending ? "animate-spin" : ""}`} /> Re-Match
            </Button>
          </div>

          {/* Table */}
          {itensDetail.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="p-2.5 font-medium w-8"></th>
                        <th className="p-2.5 font-medium">Cód.</th>
                        <th className="p-2.5 font-medium">Colaborador</th>
                        <th className="p-2.5 font-medium">Função</th>
                        <th className="p-2.5 font-medium text-center">Status</th>
                        <th className="p-2.5 font-medium text-right">Proventos</th>
                        <th className="p-2.5 font-medium text-right">Descontos</th>
                        <th className="p-2.5 font-medium text-right">Líquido</th>
                        <th className="p-2.5 font-medium">Divergências</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItens.map((item: any) => {
                        const divergencias = item.divergencias ? (typeof item.divergencias === "string" ? JSON.parse(item.divergencias) : item.divergencias) : [];
                        const isExpanded = expandedRows.has(item.id);
                        const proventos = item.proventos ? (typeof item.proventos === "string" ? JSON.parse(item.proventos) : item.proventos) : [];
                        const descontos = item.descontos ? (typeof item.descontos === "string" ? JSON.parse(item.descontos) : item.descontos) : [];
                        return (
                          <tr key={item.id} className="contents">
                            <tr className={`border-b hover:bg-muted/30 cursor-pointer ${
                              item.matchStatus === "unmatched" ? "bg-red-50/50" :
                              item.matchStatus === "divergente" ? "bg-amber-50/50" : ""
                            }`} onClick={() => toggleRow(item.id)}>
                              <td className="p-2.5">
                                {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                              </td>
                              <td className="p-2.5 font-mono text-xs">{item.codigoContabil || "—"}</td>
                              <td className="p-2.5 font-medium text-sm">{item.nomeColaborador}</td>
                              <td className="p-2.5 text-xs text-muted-foreground">{item.funcao || "—"}</td>
                              <td className="p-2.5 text-center">
                                {item.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />}
                                {item.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />}
                                {item.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600 mx-auto" />}
                              </td>
                              <td className="p-2.5 text-right text-sm">{formatBRL(item.totalProventos)}</td>
                              <td className="p-2.5 text-right text-sm text-red-600">{formatBRL(item.totalDescontos)}</td>
                              <td className="p-2.5 text-right font-bold text-sm">{formatBRL(item.liquido)}</td>
                              <td className="p-2.5">
                                {divergencias.length > 0 ? (
                                  <Badge variant="outline" className="border-red-300 text-red-700 text-xs">{divergencias.length} alerta{divergencias.length > 1 ? "s" : ""}</Badge>
                                ) : item.matchStatus === "unmatched" ? (
                                  <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Não encontrado</Badge>
                                ) : null}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-muted/20 border-b">
                                <td colSpan={9} className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Proventos */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-green-700 mb-2 flex items-center gap-1">
                                        <TrendingUp className="h-3.5 w-3.5" /> Proventos
                                      </h4>
                                      {proventos.length > 0 ? proventos.map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs py-0.5">
                                          <span className="text-muted-foreground">{p.descricao}</span>
                                          <span className="font-medium">{formatBRL(p.valor)}</span>
                                        </div>
                                      )) : <p className="text-xs text-muted-foreground">—</p>}
                                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold">
                                        <span>Total</span>
                                        <span className="text-green-700">{formatBRL(item.totalProventos)}</span>
                                      </div>
                                    </div>
                                    {/* Descontos */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-red-700 mb-2 flex items-center gap-1">
                                        <AlertCircle className="h-3.5 w-3.5" /> Descontos
                                      </h4>
                                      {descontos.length > 0 ? descontos.map((d: any, i: number) => (
                                        <div key={i} className="flex justify-between text-xs py-0.5">
                                          <span className="text-muted-foreground">{d.descricao}</span>
                                          <span className="font-medium text-red-600">{formatBRL(d.valor)}</span>
                                        </div>
                                      )) : <p className="text-xs text-muted-foreground">—</p>}
                                      <div className="border-t mt-1 pt-1 flex justify-between text-xs font-bold">
                                        <span>Total</span>
                                        <span className="text-red-700">{formatBRL(item.totalDescontos)}</span>
                                      </div>
                                    </div>
                                    {/* Info */}
                                    <div>
                                      <h4 className="font-semibold text-xs text-blue-700 mb-2 flex items-center gap-1">
                                        <Info className="h-3.5 w-3.5" /> Informações
                                      </h4>
                                      <div className="space-y-1 text-xs">
                                        <div className="flex justify-between"><span className="text-muted-foreground">Admissão</span><span>{item.dataAdmissao || "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Salário Base</span><span>{item.salarioBase ? formatBRL(item.salarioBase) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Horas Mensais</span><span>{item.horasMensais || "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">INSS</span><span>{item.valorInss ? formatBRL(item.valorInss) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">FGTS</span><span>{item.valorFgts ? formatBRL(item.valorFgts) : "—"}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">IRRF</span><span>{item.valorIrrf ? formatBRL(item.valorIrrf) : "—"}</span></div>
                                      </div>
                                      {divergencias.length > 0 && (
                                        <div className="mt-2 pt-2 border-t">
                                          <h5 className="text-xs font-semibold text-red-700 mb-1">Divergências:</h5>
                                          {divergencias.map((d: string, i: number) => (
                                            <p key={i} className="text-xs text-red-600">{d}</p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredItens.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">Nenhum item encontrado.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "custos_obra") {
    return (
      <DashboardLayout>
        {fileInputs}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#1B2A4A]" /> Custos por Obra — {viewTipo === "vale" ? "Vale" : "Pagamento"}
              </h1>
              <p className="text-sm text-muted-foreground">{formatMesAno(mesAno)} | Distribuição proporcional baseada no controle de ponto</p>
            </div>
          </div>

          {custosPorObra.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Calculando custos por obra...</div>
          ) : custosPorObra.data && (custosPorObra.data.obrasResumo.length > 0 || custosPorObra.data.semObra) ? (
            <>
              {/* Summary cards */}
              {(() => {
                const allObras = [...custosPorObra.data.obrasResumo, ...(custosPorObra.data.semObra ? [custosPorObra.data.semObra] : [])];
                const totalFuncs = allObras.reduce((s, o: any) => s + (o.funcionarios?.length || 0), 0);
                const totalHE = allObras.reduce((s, o: any) => s + (o.totalHE || 0), 0);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-blue-700">{custosPorObra.data.obrasResumo.length}</p>
                      <p className="text-xs text-muted-foreground">Obras</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-green-700">{formatBRL(custosPorObra.data.totalGeral)}</p>
                      <p className="text-xs text-muted-foreground">Custo Total</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-purple-700">{totalFuncs}</p>
                      <p className="text-xs text-muted-foreground">Funcionários</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-amber-700">{totalHE.toFixed(1)}h</p>
                      <p className="text-xs text-muted-foreground">Horas Extras</p>
                    </div>
                  </div>
                );
              })()}

              {/* Obra cards */}
              <div className="space-y-3">
                {[...custosPorObra.data.obrasResumo, ...(custosPorObra.data.semObra ? [custosPorObra.data.semObra] : [])].map((obra: any) => (
                  <Card key={obra.obraId || "sem"} className="border-l-4 border-l-[#1B2A4A]">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-base">{obra.obraNome || "Sem Obra Vinculada"}</h3>
                          <p className="text-xs text-muted-foreground">{obra.funcionarios?.length || 0} funcionários | {(obra.totalHoras || 0).toFixed(1)}h trabalhadas | {(obra.totalHE || 0).toFixed(1)}h extras</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-[#1B2A4A]">{formatBRL(obra.totalCusto)}</p>
                          <p className="text-xs text-muted-foreground">
                            {((parseBRLNum(obra.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100).toFixed(1)}% do total
                          </p>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-[#1B2A4A] h-2 rounded-full" style={{
                          width: `${Math.min(100, (parseBRLNum(obra.totalCusto) / Math.max(parseBRLNum(custosPorObra.data.totalGeral), 0.01)) * 100)}%`
                        }} />
                      </div>
                      {/* Funcionários da obra */}
                      {obra.funcionarios && obra.funcionarios.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-left">
                                <th className="pb-1 font-medium">Funcionário</th>
                                <th className="pb-1 font-medium">Função</th>
                                <th className="pb-1 font-medium text-right">Horas Trab.</th>
                                <th className="pb-1 font-medium text-right">Horas Extras</th>
                                <th className="pb-1 font-medium text-right">Custo Alocado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {obra.funcionarios.map((f: any) => (
                                <tr key={f.id} className="border-b last:border-0">
                                  <td className="py-1.5 font-medium">{f.nome}</td>
                                  <td className="py-1.5 text-muted-foreground">{f.funcao || "—"}</td>
                                  <td className="py-1.5 text-right">{(f.horas || 0).toFixed(1)}h</td>
                                  <td className="py-1.5 text-right">{(f.horasExtras || 0) > 0 ? <span className="text-amber-600 font-medium">{f.horasExtras.toFixed(1)}h</span> : "—"}</td>
                                  <td className="py-1.5 text-right font-bold">{formatBRL(f.custoEstimado)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum dado de custos por obra disponível.</p>
              <p className="text-xs text-muted-foreground mt-1">É necessário ter o controle de ponto importado e a folha de pagamento processada.</p>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "horas_extras") {
    return (
      <DashboardLayout>
        {fileInputs}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" /> Horas Extras — {formatMesAno(mesAno)}
              </h1>
              <p className="text-sm text-muted-foreground">Análise detalhada de horas extras por funcionário e por obra</p>
            </div>
          </div>

          {horasExtras.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Calculando horas extras...</div>
          ) : horasExtras.data ? (
            <>
              {/* Ranking de Obras */}
              {horasExtras.data.rankingObras && horasExtras.data.rankingObras.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-amber-600" /> Ranking de Obras — Horas Extras
                    </h3>
                    <div className="space-y-2">
                      {horasExtras.data.rankingObras.map((obra: any, idx: number) => (
                        <div key={obra.obraId || "sem"} className="flex items-center gap-3">
                          <span className={`font-bold text-lg w-8 text-center ${idx === 0 ? "text-amber-600" : idx === 1 ? "text-gray-500" : idx === 2 ? "text-orange-700" : "text-muted-foreground"}`}>
                            {idx + 1}º
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">{obra.obraNome || "Sem Obra"}</span>
                              <span className="font-bold text-amber-700">{obra.totalHE.toFixed(1)}h</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-amber-500 h-2 rounded-full" style={{
                                width: `${Math.min(100, (obra.totalHE / (horasExtras.data.rankingObras[0]?.totalHE || 1)) * 100)}%`
                              }} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{obra.totalHE.toFixed(1)}h extras</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tabela de funcionários */}
              {horasExtras.data.funcionarios && horasExtras.data.funcionarios.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b">
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        <Users className="h-4 w-4" /> Funcionários com Horas Extras ({horasExtras.data.funcionarios.length})
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/50">
                            <th className="p-2.5 font-medium">Funcionário</th>
                            <th className="p-2.5 font-medium">Função</th>
                            <th className="p-2.5 font-medium">Obra</th>
                            <th className="p-2.5 font-medium text-right">HE 50%</th>
                            <th className="p-2.5 font-medium text-right">HE 100%</th>
                            <th className="p-2.5 font-medium text-right">Total HE</th>
                            <th className="p-2.5 font-medium text-right">Valor Est.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {horasExtras.data.funcionarios.map((f: any) => (
                            <tr key={f.employeeId} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-2.5 font-medium">{f.nome}</td>
                              <td className="p-2.5 text-xs text-muted-foreground">{f.funcao || "—"}</td>
                              <td className="p-2.5 text-xs">{f.obraNome || "—"}</td>
                              <td className="p-2.5 text-right">{f.he50 > 0 ? `${f.he50.toFixed(1)}h` : "—"}</td>
                              <td className="p-2.5 text-right">{f.he100 > 0 ? `${f.he100.toFixed(1)}h` : "—"}</td>
                              <td className="p-2.5 text-right font-bold text-amber-700">{f.totalHE.toFixed(1)}h</td>
                              <td className="p-2.5 text-right font-bold">{formatBRL(f.valorEstimado)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {(!horasExtras.data.funcionarios || horasExtras.data.funcionarios.length === 0) && (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">Nenhuma hora extra registrada neste período.</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

  if (viewMode === "verificacao" && viewLancId) {
    return (
      <DashboardLayout>
        {fileInputs}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("resumo")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-700" /> Verificação Cruzada — Folha × Ponto × Cadastro
              </h1>
              <p className="text-sm text-muted-foreground">{formatMesAno(mesAno)}</p>
            </div>
          </div>

          {verificacao.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Processando verificação cruzada...</div>
          ) : verificacao.data ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{verificacao.data.totalItens}</p>
                  <p className="text-xs text-muted-foreground">Total na Folha</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-700">{verificacao.data.totalItens - verificacao.data.totalAlertas}</p>
                  <p className="text-xs text-muted-foreground">OK</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${verificacao.data.totalAlertas > 0 ? "bg-red-50" : "bg-green-50"}`}>
                  <p className={`text-xl font-bold ${verificacao.data.totalAlertas > 0 ? "text-red-600" : "text-green-600"}`}>
                    {verificacao.data.totalAlertas}
                  </p>
                  <p className="text-xs text-muted-foreground">Com Alertas</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-purple-700">
                    {verificacao.data.verificacoes.filter((v: any) => v.ponto).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Com Ponto</p>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/50">
                          <th className="p-2.5 font-medium">Cód.</th>
                          <th className="p-2.5 font-medium">Colaborador</th>
                          <th className="p-2.5 font-medium">Função</th>
                          <th className="p-2.5 font-medium text-center">Match</th>
                          <th className="p-2.5 font-medium text-right">Líquido</th>
                          <th className="p-2.5 font-medium">Sal. Folha</th>
                          <th className="p-2.5 font-medium">Sal. Cadastro</th>
                          <th className="p-2.5 font-medium">Ponto</th>
                          <th className="p-2.5 font-medium">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {verificacao.data.verificacoes.map((v: any) => (
                          <tr key={v.id} className={`border-b last:border-0 hover:bg-muted/30 ${v.alertas.length > 0 ? "bg-red-50/30" : ""}`}>
                            <td className="p-2.5 font-mono text-xs">{v.codigo || "—"}</td>
                            <td className="p-2.5 font-medium">{v.nome}</td>
                            <td className="p-2.5 text-xs text-muted-foreground">{v.funcao || "—"}</td>
                            <td className="p-2.5 text-center">
                              {v.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />}
                              {v.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />}
                              {v.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600 mx-auto" />}
                            </td>
                            <td className="p-2.5 text-right font-bold">{formatBRL(v.liquido)}</td>
                            <td className="p-2.5">{v.salarioFolha ? formatBRL(v.salarioFolha) : "—"}</td>
                            <td className="p-2.5">{v.salarioCadastro ? formatBRL(v.salarioCadastro) : "—"}</td>
                            <td className="p-2.5 text-xs">
                              {v.ponto ? (
                                <span>{v.ponto.diasTrabalhados}d / {v.ponto.totalHoras}h{v.ponto.faltas > 0 && <span className="text-red-600 ml-1">({v.ponto.faltas} faltas)</span>}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-2.5">
                              {v.alertas.length > 0 ? (
                                <div className="space-y-0.5">
                                  {v.alertas.map((a: string, i: number) => (
                                    <p key={i} className="text-xs text-red-600">{a}</p>
                                  ))}
                                </div>
                              ) : <CheckCircle className="h-4 w-4 text-green-500" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Nenhum dado disponível.</div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ===== MAIN VIEW (resumo) =====
  return (
    <DashboardLayout>
      {fileInputs}
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Folha de Pagamento</h1>
            <p className="text-muted-foreground text-sm">Importação e verificação da folha da contabilidade</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openView("horas_extras")}>
              <Clock className="h-4 w-4 mr-1" /> Horas Extras
            </Button>
          </div>
        </div>

        {/* CALENDÁRIO */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(a => a - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-bold text-lg min-w-[60px] text-center">{anoSelecionado}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAnoSelecionado(a => a + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500" /> Com lançamento</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500" /> Consolidado</div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-gray-200" /> Sem dados</div>
              </div>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
              {MESES_CURTOS.map((nome, i) => {
                const mes = i + 1;
                const isSelected = mes === mesSelecionado;
                const status = getMonthStatus(mes);
                return (
                  <button key={mes} onClick={() => setMesSelecionado(mes)}
                    className={`rounded-lg p-2 text-center text-xs font-medium transition-all border-2 ${
                      isSelected ? "border-[#1B2A4A] ring-2 ring-[#1B2A4A]/30 shadow-md" :
                      status === "consolidado" ? "bg-green-100 border-green-300 text-green-800 hover:bg-green-200" :
                      status === "completo" ? "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200" :
                      "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200"
                    }`}>
                    <div>{nome}</div>
                    {status === "consolidado" && <Lock className="h-3 w-3 mx-auto mt-0.5 text-green-600" />}
                    {status === "completo" && <FileText className="h-3 w-3 mx-auto mt-0.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* MÊS SELECIONADO */}
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#1B2A4A]" />
          <span className="text-sm font-semibold text-[#1B2A4A]">{formatMesAno(mesAno)}</span>
        </div>

        {/* CARDS VALE + PAGAMENTO */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* VALE */}
          <Card className={`border-2 ${vale ? "border-orange-200" : "border-dashed border-gray-300"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Vale / Adiantamento</p>
                    <p className="text-xs text-muted-foreground">Pago dia 20</p>
                  </div>
                </div>
                {vale && (
                  <Badge className={
                    vale.status === "consolidado" ? "bg-green-100 text-green-700" :
                    "bg-amber-100 text-amber-700"
                  }>
                    {vale.status === "consolidado" && <Lock className="h-3 w-3 mr-1" />}
                    {vale.status.charAt(0).toUpperCase() + vale.status.slice(1)}
                  </Badge>
                )}
              </div>

              {vale ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-orange-700">{vale.totalFuncionarios}</p>
                      <p className="text-[10px] text-muted-foreground">Funcionários</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className="text-base font-bold text-orange-700">{formatBRL(vale.totalLiquido)}</p>
                      <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className={`text-lg font-bold ${(vale.totalDivergencias || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                        {vale.totalDivergencias || 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Divergências</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView("detalhes", vale.id, "Vale/Adiantamento")}>
                      <Eye className="h-3 w-3 mr-1" /> Detalhes
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView("verificacao", vale.id, "vale")}>
                      <ShieldCheck className="h-3 w-3 mr-1" /> Verificação
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView("custos_obra", vale.id, "vale")}>
                      <Building2 className="h-3 w-3 mr-1" /> Custos/Obra
                    </Button>
                    {vale.status !== "consolidado" && (
                      <Button size="sm" variant="outline" className="text-xs h-8 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: vale.id })}>
                        <Lock className="h-3 w-3 mr-1" /> Consolidar
                      </Button>
                    )}
                    {vale.status === "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-xs h-8 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: vale.id })}>
                        <Unlock className="h-3 w-3 mr-1" /> Desconsolidar
                      </Button>
                    )}
                    {vale.status !== "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-xs h-8 text-red-600" onClick={() => {
                        if (confirm("Excluir lançamento de Vale?")) excluirMut.mutate({ folhaLancamentoId: vale.id });
                      }}>
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                  {/* Re-importar */}
                  {vale.status !== "consolidado" && (
                    <Button size="sm" variant="ghost" className="text-xs w-full text-orange-700 hover:bg-orange-50"
                      disabled={uploading === "vale"}
                      onClick={() => valeInputRef.current?.click()}>
                      {uploading === "vale" ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Reimportar PDFs</>}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="h-10 w-10 text-orange-300 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum lançamento de vale para este mês</p>
                  <Button className="bg-orange-600 hover:bg-orange-700"
                    disabled={uploading === "vale"}
                    onClick={() => valeInputRef.current?.click()}>
                    {uploading === "vale" ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4 mr-2" /> Importar Vale</>}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-2">Selecione todos os PDFs de uma vez. O sistema detecta automaticamente o tipo.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* PAGAMENTO */}
          <Card className={`border-2 ${pagamento ? "border-green-200" : "border-dashed border-gray-300"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Pagamento</p>
                    <p className="text-xs text-muted-foreground">5º dia útil</p>
                  </div>
                </div>
                {pagamento && (
                  <Badge className={
                    pagamento.status === "consolidado" ? "bg-green-100 text-green-700" :
                    "bg-amber-100 text-amber-700"
                  }>
                    {pagamento.status === "consolidado" && <Lock className="h-3 w-3 mr-1" />}
                    {pagamento.status.charAt(0).toUpperCase() + pagamento.status.slice(1)}
                  </Badge>
                )}
              </div>

              {pagamento ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-green-700">{pagamento.totalFuncionarios}</p>
                      <p className="text-[10px] text-muted-foreground">Funcionários</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-base font-bold text-green-700">{formatBRL(pagamento.totalLiquido)}</p>
                      <p className="text-[10px] text-muted-foreground">Total Líquido</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className={`text-lg font-bold ${(pagamento.totalDivergencias || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                        {pagamento.totalDivergencias || 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Divergências</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView("detalhes", pagamento.id, "Pagamento")}>
                      <Eye className="h-3 w-3 mr-1" /> Detalhes
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView("verificacao", pagamento.id, "pagamento")}>
                      <ShieldCheck className="h-3 w-3 mr-1" /> Verificação
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => openView("custos_obra", pagamento.id, "pagamento")}>
                      <Building2 className="h-3 w-3 mr-1" /> Custos/Obra
                    </Button>
                    {pagamento.status !== "consolidado" && (
                      <Button size="sm" variant="outline" className="text-xs h-8 text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: pagamento.id })}>
                        <Lock className="h-3 w-3 mr-1" /> Consolidar
                      </Button>
                    )}
                    {pagamento.status === "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-xs h-8 text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: pagamento.id })}>
                        <Unlock className="h-3 w-3 mr-1" /> Desconsolidar
                      </Button>
                    )}
                    {pagamento.status !== "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-xs h-8 text-red-600" onClick={() => {
                        if (confirm("Excluir lançamento de Pagamento?")) excluirMut.mutate({ folhaLancamentoId: pagamento.id });
                      }}>
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                  {pagamento.status !== "consolidado" && (
                    <Button size="sm" variant="ghost" className="text-xs w-full text-green-700 hover:bg-green-50"
                      disabled={uploading === "pagamento"}
                      onClick={() => pagInputRef.current?.click()}>
                      {uploading === "pagamento" ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Processando...</> : <><Upload className="h-3 w-3 mr-1" /> Reimportar PDFs</>}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <DollarSign className="h-10 w-10 text-green-300 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">Nenhum lançamento de pagamento para este mês</p>
                  <Button className="bg-green-600 hover:bg-green-700"
                    disabled={uploading === "pagamento"}
                    onClick={() => pagInputRef.current?.click()}>
                    {uploading === "pagamento" ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</> : <><Upload className="h-4 w-4 mr-2" /> Importar Pagamento</>}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-2">Selecione todos os PDFs de uma vez. O sistema detecta automaticamente o tipo.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* INFO PONTO */}
        {statusMes.data?.pontoConsolidado && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800">Ponto Consolidado</p>
              <p className="text-sm text-blue-700">O controle de ponto deste mês está consolidado. A verificação cruzada e custos por obra utilizam os dados do ponto.</p>
            </div>
          </div>
        )}

        {/* UPLOAD PROGRESS */}
        {uploading && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-amber-600 animate-spin shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Processando importação...</p>
              <p className="text-sm text-amber-700">Os PDFs estão sendo analisados, classificados e processados automaticamente. Aguarde.</p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
