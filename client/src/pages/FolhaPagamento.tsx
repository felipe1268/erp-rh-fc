import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  Upload, CalendarDays, DollarSign, CreditCard, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle, FileText, Users, Lock, Unlock, Search,
  Eye, Trash2, RefreshCw, ArrowLeft, XCircle, Info, Wallet, Building2,
  FileSpreadsheet, Printer, AlertCircle, ShieldCheck
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useMemo } from "react";
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
  // Already formatted string
  if (val.includes(",")) return `R$ ${val}`;
  const num = parseFloat(val);
  if (isNaN(num)) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type TabAtiva = "vale" | "pagamento";

export default function FolhaPagamento() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth() + 1);
  const mesAno = `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}`;
  const [tabAtiva, setTabAtiva] = useState<TabAtiva>("vale");

  // Upload dialog
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadTipo, setUploadTipo] = useState<"vale" | "pagamento">("vale");
  const [uploadArquivo, setUploadArquivo] = useState<"analitico" | "sintetico">("analitico");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail dialog
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [detailLancamentoId, setDetailLancamentoId] = useState<number | null>(null);
  const [detailTipo, setDetailTipo] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Verificação cruzada dialog
  const [showVerificacaoDialog, setShowVerificacaoDialog] = useState(false);
  const [verificacaoLancId, setVerificacaoLancId] = useState<number | null>(null);

  // ===== QUERIES =====
  const statusMes = trpc.folha.statusMes.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const mesesComLanc = trpc.folha.listarMesesComLancamentos.useQuery({ companyId, ano: anoSelecionado }, { enabled: companyId > 0 });
  const lancamentos = trpc.folha.listarLancamentos.useQuery({ companyId, mesReferencia: mesAno }, { enabled: companyId > 0 });
  const itensDetail = trpc.folha.listarItens.useQuery(
    { folhaLancamentoId: detailLancamentoId! },
    { enabled: !!detailLancamentoId && showDetailDialog }
  );
  const verificacao = trpc.folha.verificacaoCruzada.useQuery(
    { folhaLancamentoId: verificacaoLancId!, companyId, mesReferencia: mesAno },
    { enabled: !!verificacaoLancId && showVerificacaoDialog }
  );

  // ===== MUTATIONS =====
  const importarMut = trpc.folha.importarFolha.useMutation({
    onSuccess: (data) => {
      const r = data.result as any;
      if (r?.match) {
        const parts = [
          `${data.recordsProcessed} funcionários processados`,
          `${r.match.matched} vinculados`,
          r.match.unmatched > 0 ? `${r.match.unmatched} não encontrados` : null,
          r.match.divergentes > 0 ? `${r.match.divergentes} com divergências` : null,
          r.match.codigosAtualizados > 0 ? `${r.match.codigosAtualizados} códigos contábeis cadastrados` : null,
        ].filter(Boolean);
        toast.success(parts.join(" | "), { duration: 8000 });
      } else {
        toast.success(`${data.recordsProcessed} registros processados com sucesso!`);
      }
      statusMes.refetch();
      lancamentos.refetch();
      mesesComLanc.refetch();
      setShowUploadDialog(false);
      setUploadFile(null);
    },
    onError: (err) => toast.error(`Erro na importação: ${err.message}`),
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
    onSuccess: () => {
      toast.success("Lançamento consolidado!");
      statusMes.refetch();
      lancamentos.refetch();
      mesesComLanc.refetch();
    },
  });

  const desconsolidarMut = trpc.folha.desconsolidarLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento desconsolidado!");
      statusMes.refetch();
      lancamentos.refetch();
      mesesComLanc.refetch();
    },
  });

  const excluirMut = trpc.folha.excluirLancamento.useMutation({
    onSuccess: () => {
      toast.success("Lançamento excluído!");
      statusMes.refetch();
      lancamentos.refetch();
      mesesComLanc.refetch();
    },
  });

  // ===== HELPERS =====
  function getMonthStatus(mes: number): "sem_dados" | "parcial" | "completo" | "consolidado" {
    const mesRef = `${anoSelecionado}-${String(mes).padStart(2, "0")}`;
    const info = mesesComLanc.data?.[mesRef];
    if (!info) return "sem_dados";
    if (info.vale === "consolidado" && info.pagamento === "consolidado") return "consolidado";
    if (info.vale || info.pagamento) return "completo";
    return "parcial";
  }

  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await importarMut.mutateAsync({
          companyId,
          mesReferencia: mesAno,
          tipoLancamento: uploadTipo,
          tipoArquivo: uploadArquivo,
          fileName: uploadFile.name,
          fileBase64: base64,
          mimeType: uploadFile.type || "application/pdf",
        });
        setUploading(false);
      };
      reader.readAsDataURL(uploadFile);
    } catch {
      setUploading(false);
    }
  }

  function openDetail(lancId: number, tipo: string) {
    setDetailLancamentoId(lancId);
    setDetailTipo(tipo);
    setSearchTerm("");
    setFilterStatus("all");
    setShowDetailDialog(true);
  }

  function openVerificacao(lancId: number) {
    setVerificacaoLancId(lancId);
    setShowVerificacaoDialog(true);
  }

  // Filter itens
  const filteredItens = useMemo(() => {
    if (!itensDetail.data) return [];
    let items = [...itensDetail.data];
    if (searchTerm) {
      const term = searchTerm.toUpperCase();
      items = items.filter(i =>
        i.nomeColaborador.toUpperCase().includes(term) ||
        (i.codigoContabil && i.codigoContabil.includes(term))
      );
    }
    if (filterStatus !== "all") {
      items = items.filter(i => i.matchStatus === filterStatus);
    }
    return items;
  }, [itensDetail.data, searchTerm, filterStatus]);

  const vale = statusMes.data?.vale;
  const pagamento = statusMes.data?.pagamento;

  // ===== RENDER =====
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Folha de Pagamento</h1>
            <p className="text-muted-foreground text-sm">Importação e verificação da folha da contabilidade</p>
          </div>
        </div>

        {/* CALENDÁRIO DE MESES (igual ao Fechamento de Ponto) */}
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

            <div className="grid grid-cols-12 gap-1.5">
              {MESES_CURTOS.map((nome, i) => {
                const mes = i + 1;
                const isSelected = mes === mesSelecionado;
                const status = getMonthStatus(mes);
                return (
                  <button
                    key={mes}
                    onClick={() => setMesSelecionado(mes)}
                    className={`rounded-lg p-2 text-center text-xs font-medium transition-all border-2 ${
                      isSelected ? "border-[#1B2A4A] ring-2 ring-[#1B2A4A]/30 shadow-md" :
                      status === "consolidado" ? "bg-green-100 border-green-300 text-green-800 hover:bg-green-200" :
                      status === "completo" ? "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200" :
                      status === "parcial" ? "bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200" :
                      "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    <div>{nome}</div>
                    {status === "consolidado" && <Lock className="h-3 w-3 mx-auto mt-0.5 text-green-600" />}
                    {status === "completo" && <FileText className="h-3 w-3 mx-auto mt-0.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* BARRA DE AÇÕES DO MÊS */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#1B2A4A]" />
            <span className="text-sm font-semibold text-[#1B2A4A]">{formatMesAno(mesAno)}</span>
          </div>
          <Button onClick={() => { setShowUploadDialog(true); setUploadFile(null); }} className="bg-[#1B2A4A] hover:bg-[#243660]">
            <Upload className="h-4 w-4 mr-2" /> Importar Folha
          </Button>
        </div>

        {/* CARDS RESUMO */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Card Vale/Adiantamento */}
          <Card className={`border-2 ${vale ? "border-orange-200" : "border-gray-200"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <CreditCard className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Vale / Adiantamento</p>
                    <p className="text-xs text-muted-foreground">Pago dia 20 de cada mês</p>
                  </div>
                </div>
                {vale && (
                  <Badge className={
                    vale.status === "consolidado" ? "bg-green-100 text-green-700" :
                    vale.status === "validado" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }>
                    {vale.status === "consolidado" && <Lock className="h-3 w-3 mr-1" />}
                    {vale.status.charAt(0).toUpperCase() + vale.status.slice(1)}
                  </Badge>
                )}
              </div>

              {vale ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-orange-700">{vale.totalFuncionarios}</p>
                      <p className="text-xs text-muted-foreground">Funcionários</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-orange-700">{formatBRL(vale.totalLiquido)}</p>
                      <p className="text-xs text-muted-foreground">Total Líquido</p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className={`text-lg font-bold ${(vale.totalDivergencias || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                        {vale.totalDivergencias || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Divergências</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openDetail(vale.id, "Vale/Adiantamento")}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Ver Detalhes
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openVerificacao(vale.id)}>
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verificação Cruzada
                    </Button>
                    {vale.status !== "consolidado" && (
                      <Button size="sm" variant="outline" className="text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: vale.id })}>
                        <Lock className="h-3.5 w-3.5 mr-1" /> Consolidar
                      </Button>
                    )}
                    {vale.status === "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: vale.id })}>
                        <Unlock className="h-3.5 w-3.5 mr-1" /> Desconsolidar
                      </Button>
                    )}
                    {vale.status !== "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => {
                        if (confirm("Excluir lançamento de Vale/Adiantamento deste mês?")) excluirMut.mutate({ folhaLancamentoId: vale.id });
                      }}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum lançamento de vale para este mês</p>
                  <Button size="sm" className="mt-3 bg-[#1B2A4A] hover:bg-[#243660]" onClick={() => {
                    setUploadTipo("vale");
                    setShowUploadDialog(true);
                    setUploadFile(null);
                  }}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Importar Vale
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card Pagamento */}
          <Card className={`border-2 ${pagamento ? "border-green-200" : "border-gray-200"}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Pagamento</p>
                    <p className="text-xs text-muted-foreground">Pago no 5º dia útil do mês seguinte</p>
                  </div>
                </div>
                {pagamento && (
                  <Badge className={
                    pagamento.status === "consolidado" ? "bg-green-100 text-green-700" :
                    pagamento.status === "validado" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }>
                    {pagamento.status === "consolidado" && <Lock className="h-3 w-3 mr-1" />}
                    {pagamento.status.charAt(0).toUpperCase() + pagamento.status.slice(1)}
                  </Badge>
                )}
              </div>

              {pagamento ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-green-700">{pagamento.totalFuncionarios}</p>
                      <p className="text-xs text-muted-foreground">Funcionários</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-green-700">{formatBRL(pagamento.totalLiquido)}</p>
                      <p className="text-xs text-muted-foreground">Total Líquido</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className={`text-lg font-bold ${(pagamento.totalDivergencias || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                        {pagamento.totalDivergencias || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Divergências</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => openDetail(pagamento.id, "Pagamento")}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Ver Detalhes
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openVerificacao(pagamento.id)}>
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verificação Cruzada
                    </Button>
                    {pagamento.status !== "consolidado" && (
                      <Button size="sm" variant="outline" className="text-green-700" onClick={() => consolidarMut.mutate({ folhaLancamentoId: pagamento.id })}>
                        <Lock className="h-3.5 w-3.5 mr-1" /> Consolidar
                      </Button>
                    )}
                    {pagamento.status === "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-amber-700" onClick={() => desconsolidarMut.mutate({ folhaLancamentoId: pagamento.id })}>
                        <Unlock className="h-3.5 w-3.5 mr-1" /> Desconsolidar
                      </Button>
                    )}
                    {pagamento.status !== "consolidado" && isAdmin && (
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => {
                        if (confirm("Excluir lançamento de Pagamento deste mês?")) excluirMut.mutate({ folhaLancamentoId: pagamento.id });
                      }}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <DollarSign className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum lançamento de pagamento para este mês</p>
                  <Button size="sm" className="mt-3 bg-[#1B2A4A] hover:bg-[#243660]" onClick={() => {
                    setUploadTipo("pagamento");
                    setShowUploadDialog(true);
                    setUploadFile(null);
                  }}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Importar Pagamento
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* INFO: Verificação cruzada com ponto */}
        {statusMes.data?.pontoConsolidado && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800">Ponto Consolidado</p>
              <p className="text-sm text-blue-700">O controle de ponto deste mês está consolidado. A verificação cruzada irá comparar os dados da folha com os registros de ponto.</p>
            </div>
          </div>
        )}

        {/* HISTÓRICO DE UPLOADS DO MÊS */}
        {lancamentos.data && lancamentos.data.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Histórico de Importações — {formatMesAno(mesAno)}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Tipo</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Funcionários</th>
                      <th className="pb-2 font-medium">Total Líquido</th>
                      <th className="pb-2 font-medium">Divergências</th>
                      <th className="pb-2 font-medium">Importado Em</th>
                      <th className="pb-2 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentos.data.map((l: any) => (
                      <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2.5">
                          <Badge variant="outline" className={l.tipoLancamento === "vale" ? "border-orange-300 text-orange-700" : "border-green-300 text-green-700"}>
                            {l.tipoLancamento === "vale" ? "Vale/Adiantamento" : "Pagamento"}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          <Badge className={
                            l.status === "consolidado" ? "bg-green-100 text-green-700" :
                            l.status === "validado" ? "bg-blue-100 text-blue-700" :
                            "bg-amber-100 text-amber-700"
                          }>
                            {l.status}
                          </Badge>
                        </td>
                        <td className="py-2.5">{l.totalFuncionarios || 0}</td>
                        <td className="py-2.5 font-medium">{formatBRL(l.totalLiquido)}</td>
                        <td className="py-2.5">
                          {(l.totalDivergencias || 0) > 0 ? (
                            <span className="text-red-600 font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" /> {l.totalDivergencias}
                            </span>
                          ) : (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="h-3.5 w-3.5" /> OK
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-muted-foreground text-xs">
                          {l.importadoEm ? new Date(l.importadoEm).toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="py-2.5">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openDetail(l.id, l.tipoLancamento === "vale" ? "Vale/Adiantamento" : "Pagamento")}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openVerificacao(l.id)}>
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===== DIALOG: UPLOAD DE FOLHA ===== */}
      <FullScreenDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        title="Importar Folha de Pagamento"
        subtitle={`Referência: ${formatMesAno(mesAno)}`}
        icon={<Upload className="h-5 w-5 text-white" />}
      >
        <div className="space-y-6 max-w-2xl">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" /> Como funciona a importação
            </h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>1. Selecione o tipo de lançamento (Vale ou Pagamento)</li>
              <li>2. Selecione o tipo de arquivo (Analítico, Sintético ou Banco)</li>
              <li>3. Faça upload do PDF recebido da contabilidade</li>
              <li>4. O sistema irá extrair os dados e vincular com o cadastro de funcionários</li>
              <li><strong>Importante:</strong> Importe primeiro o <strong>Analítico</strong> (espelho completo), depois o Sintético e Banco para complementar.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Tipo de Lançamento *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setUploadTipo("vale")}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    uploadTipo === "vale" ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <CreditCard className={`h-5 w-5 mb-1 ${uploadTipo === "vale" ? "text-orange-600" : "text-gray-400"}`} />
                  <p className="font-medium text-sm">Vale / Adiantamento</p>
                  <p className="text-xs text-muted-foreground">Pago dia 20</p>
                </button>
                <button
                  onClick={() => setUploadTipo("pagamento")}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    uploadTipo === "pagamento" ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <DollarSign className={`h-5 w-5 mb-1 ${uploadTipo === "pagamento" ? "text-green-600" : "text-gray-400"}`} />
                  <p className="font-medium text-sm">Pagamento</p>
                  <p className="text-xs text-muted-foreground">5º dia útil</p>
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Tipo de Arquivo *</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "analitico" as const, label: "Analítico (Espelho)", desc: "Detalhamento completo", icon: FileSpreadsheet },
                  { key: "sintetico" as const, label: "Sintético (Líquido)", desc: "Lista resumida", icon: FileText },

                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setUploadArquivo(opt.key)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      uploadArquivo === opt.key ? "border-[#1B2A4A] bg-blue-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <opt.icon className={`h-4 w-4 mb-1 ${uploadArquivo === opt.key ? "text-[#1B2A4A]" : "text-gray-400"}`} />
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">Arquivo PDF *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-sm border rounded-lg p-3 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#1B2A4A] file:text-white hover:file:bg-[#243660]"
              />
              {uploadFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  Arquivo selecionado: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={() => setShowUploadDialog(false)} variant="outline">Cancelar</Button>
              <Button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="bg-[#1B2A4A] hover:bg-[#243660]"
              >
                {uploading ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Processando...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Importar e Processar</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </FullScreenDialog>

      {/* ===== DIALOG: DETALHE DO LANÇAMENTO ===== */}
      <FullScreenDialog
        open={showDetailDialog}
        onClose={() => setShowDetailDialog(false)}
        title={`Detalhes — ${detailTipo}`}
        subtitle={`Referência: ${formatMesAno(mesAno)} | ${filteredItens.length} funcionários`}
        icon={<Eye className="h-5 w-5 text-white" />}
      >
        <div className="space-y-4">
          {/* Barra de filtros */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nome ou código..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="matched">✅ Vinculados</option>
              <option value="divergente">⚠️ Divergentes</option>
              <option value="unmatched">❌ Não encontrados</option>
            </select>
            {detailLancamentoId && (
              <Button size="sm" variant="outline" onClick={() => reprocessarMut.mutate({ folhaLancamentoId: detailLancamentoId, companyId })}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${reprocessarMut.isPending ? "animate-spin" : ""}`} /> Re-Match
              </Button>
            )}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-green-600" /> Vinculado</div>
            <div className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Divergente</div>
            <div className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-600" /> Não encontrado</div>
          </div>

          {/* Tabela de itens */}
          {itensDetail.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-muted/50">
                    <th className="p-2 font-medium">Cód.</th>
                    <th className="p-2 font-medium">Colaborador</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium text-right">Proventos</th>
                    <th className="p-2 font-medium text-right">Descontos</th>
                    <th className="p-2 font-medium text-right">Líquido</th>
                    <th className="p-2 font-medium">Banco</th>
                    <th className="p-2 font-medium">Divergências</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItens.map((item: any) => {
                    const divergencias = item.divergencias ? (typeof item.divergencias === "string" ? JSON.parse(item.divergencias) : item.divergencias) : [];
                    return (
                      <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/30 ${
                        item.matchStatus === "unmatched" ? "bg-red-50/50" :
                        item.matchStatus === "divergente" ? "bg-amber-50/50" : ""
                      }`}>
                        <td className="p-2 font-mono text-xs">{item.codigoContabil || "—"}</td>
                        <td className="p-2 font-medium">{item.nomeColaborador}</td>
                        <td className="p-2">
                          {item.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600" />}
                          {item.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                          {item.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600" />}
                        </td>
                        <td className="p-2 text-right">{formatBRL(item.totalProventos)}</td>
                        <td className="p-2 text-right text-red-600">{formatBRL(item.totalDescontos)}</td>
                        <td className="p-2 text-right font-bold">{formatBRL(item.liquido)}</td>
                        <td className="p-2 text-xs">{item.banco || "—"}</td>
                        <td className="p-2">
                          {divergencias.length > 0 && (
                            <div className="space-y-0.5">
                              {divergencias.map((d: string, i: number) => (
                                <p key={i} className="text-xs text-red-600">{d}</p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredItens.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">Nenhum item encontrado.</div>
              )}
            </div>
          )}
        </div>
      </FullScreenDialog>

      {/* ===== DIALOG: VERIFICAÇÃO CRUZADA ===== */}
      <FullScreenDialog
        open={showVerificacaoDialog}
        onClose={() => setShowVerificacaoDialog(false)}
        title="Verificação Cruzada — Folha × Ponto × Cadastro"
        subtitle={`Referência: ${formatMesAno(mesAno)}`}
        icon={<ShieldCheck className="h-5 w-5 text-white" />}
        headerColor="bg-gradient-to-r from-[#1B4D3E] to-[#2d7a5a]"
      >
        <div className="space-y-4">
          {verificacao.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Processando verificação cruzada...</div>
          ) : verificacao.data ? (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold">{verificacao.data.totalItens}</p>
                    <p className="text-xs text-muted-foreground">Total na Folha</p>
                  </CardContent>
                </Card>
                <Card className={verificacao.data.totalAlertas > 0 ? "border-red-200" : "border-green-200"}>
                  <CardContent className="p-4 text-center">
                    <p className={`text-2xl font-bold ${verificacao.data.totalAlertas > 0 ? "text-red-600" : "text-green-600"}`}>
                      {verificacao.data.totalAlertas}
                    </p>
                    <p className="text-xs text-muted-foreground">Com Alertas</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabela de verificação */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-muted/50">
                      <th className="p-2 font-medium">Cód.</th>
                      <th className="p-2 font-medium">Colaborador</th>
                      <th className="p-2 font-medium">Match</th>
                      <th className="p-2 font-medium text-right">Líquido</th>
                      <th className="p-2 font-medium">Salário Folha</th>
                      <th className="p-2 font-medium">Salário Cadastro</th>
                      <th className="p-2 font-medium">Ponto</th>
                      <th className="p-2 font-medium">Alertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verificacao.data.verificacoes.map((v: any) => (
                      <tr key={v.id} className={`border-b last:border-0 hover:bg-muted/30 ${v.alertas.length > 0 ? "bg-red-50/30" : ""}`}>
                        <td className="p-2 font-mono text-xs">{v.codigo || "—"}</td>
                        <td className="p-2 font-medium">{v.nome}</td>
                        <td className="p-2">
                          {v.matchStatus === "matched" && <CheckCircle className="h-4 w-4 text-green-600" />}
                          {v.matchStatus === "divergente" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                          {v.matchStatus === "unmatched" && <XCircle className="h-4 w-4 text-red-600" />}
                        </td>
                        <td className="p-2 text-right font-bold">{formatBRL(v.liquido)}</td>
                        <td className="p-2">{v.salarioFolha ? formatBRL(v.salarioFolha) : "—"}</td>
                        <td className="p-2">{v.salarioCadastro ? formatBRL(v.salarioCadastro) : "—"}</td>
                        <td className="p-2 text-xs">
                          {v.ponto ? (
                            <span>{v.ponto.diasTrabalhados}d / {v.ponto.totalHoras}h{v.ponto.faltas > 0 && <span className="text-red-600 ml-1">({v.ponto.faltas} faltas)</span>}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          {v.alertas.length > 0 ? (
                            <div className="space-y-0.5">
                              {v.alertas.map((a: string, i: number) => (
                                <p key={i} className="text-xs text-red-600">{a}</p>
                              ))}
                            </div>
                          ) : (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Nenhum dado disponível.</div>
          )}
        </div>
      </FullScreenDialog>
    </DashboardLayout>
  );
}
