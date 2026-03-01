import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, AlertTriangle, Search, Clock, Eye,
  ThumbsUp, ThumbsDown, Receipt, DollarSign, User, Calendar,
  Store, Filter, FileText, ShoppingCart
} from "lucide-react";

export default function AprovacoesParceiros() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"pendente" | "aprovado" | "rejeitado" | "todos">("pendente");
  const [filtroParceiroId, setFiltroParceiroId] = useState<string>("todos");
  const [selectedLancamento, setSelectedLancamento] = useState<any>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [competencia, setCompetencia] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: lancamentos, isLoading, refetch } = trpc.parceiros.lancamentos.list.useQuery(
    {
      companyId: companyId ?? 0,
      status: filtroStatus === "todos" ? undefined : filtroStatus,
      parceiroId: filtroParceiroId !== "todos" ? parseInt(filtroParceiroId) : undefined,
      competencia: competencia || undefined,
    },
    { enabled: !!companyId }
  );

  const { data: parceirosData } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const aprovarMutation = trpc.parceiros.lancamentos.aprovar.useMutation({
    onSuccess: () => { toast.success("Lançamento processado com sucesso"); refetch(); setSelectedLancamento(null); setMotivoRejeicao(""); },
    onError: () => toast.error("Erro ao processar lançamento"),
  });

  const parceiros = parceirosData || [];

  const lancamentosFiltrados = useMemo(() => {
    if (!lancamentos) return [];
    let filtered = lancamentos as any[];
    if (search) {
      filtered = filtered.filter((l: any) =>
        l.employeeNome?.toLowerCase().includes(search.toLowerCase()) ||
        l.descricaoItens?.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered;
  }, [lancamentos, search]);

  const getParceiroNome = (parceiroId: number) => {
    const p = parceiros.find((p: any) => p.id === parceiroId);
    return p?.nomeFantasia || p?.razaoSocial || `Parceiro #${parceiroId}`;
  };

  const totalPendentes = lancamentos ? (lancamentos as any[]).filter((l: any) => l.status === "pendente").length : 0;
  const totalAprovados = lancamentos ? (lancamentos as any[]).filter((l: any) => l.status === "aprovado").length : 0;
  const totalRejeitados = lancamentos ? (lancamentos as any[]).filter((l: any) => l.status === "rejeitado").length : 0;
  const valorTotalPendente = lancamentos
    ? (lancamentos as any[]).filter((l: any) => l.status === "pendente").reduce((sum: number, l: any) => sum + parseFloat(l.valor || "0"), 0)
    : 0;

  const handleAprovar = (id: number) => {
    aprovarMutation.mutate({ id, aprovado: true });
  };

  const handleRejeitar = (id: number) => {
    if (!motivoRejeicao.trim()) {
      toast.error("Informe o motivo da rejeição");
      return;
    }
    aprovarMutation.mutate({ id, aprovado: false, motivoRejeicao });
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CheckCircle className="w-7 h-7 text-purple-500" /> Aprovações de Parceiros
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Aprovação de lançamentos de conveniados para desconto em folha</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium">Competência:</label>
            <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-[180px]" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-yellow-300 transition-colors"
            onClick={() => setFiltroStatus("pendente")}>
            <Clock className="w-6 h-6 mx-auto text-yellow-500 mb-2" />
            <div className="text-2xl font-bold text-yellow-600">{totalPendentes}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-green-300 transition-colors"
            onClick={() => setFiltroStatus("aprovado")}>
            <ThumbsUp className="w-6 h-6 mx-auto text-green-500 mb-2" />
            <div className="text-2xl font-bold text-green-600">{totalAprovados}</div>
            <div className="text-xs text-muted-foreground">Aprovados</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center cursor-pointer hover:border-red-300 transition-colors"
            onClick={() => setFiltroStatus("rejeitado")}>
            <ThumbsDown className="w-6 h-6 mx-auto text-red-500 mb-2" />
            <div className="text-2xl font-bold text-red-600">{totalRejeitados}</div>
            <div className="text-xs text-muted-foreground">Rejeitados</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center">
            <DollarSign className="w-6 h-6 mx-auto text-purple-500 mb-2" />
            <div className="text-xl font-bold text-purple-600">{formatCurrency(valorTotalPendente)}</div>
            <div className="text-xs text-muted-foreground">Valor Pendente</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por colaborador ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filtroParceiroId} onValueChange={setFiltroParceiroId}>
            <SelectTrigger className="w-[220px]">
              <Store className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Parceiro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Parceiros</SelectItem>
              {parceiros.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.nomeFantasia || p.razaoSocial}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {(["pendente", "aprovado", "rejeitado", "todos"] as const).map((s) => (
              <Button key={s} variant={filtroStatus === s ? "default" : "outline"} size="sm"
                onClick={() => setFiltroStatus(s)}
                className={filtroStatus === s ? "bg-purple-600 hover:bg-purple-700" : ""}>
                {s === "pendente" ? "Pendentes" : s === "aprovado" ? "Aprovados" : s === "rejeitado" ? "Rejeitados" : "Todos"}
              </Button>
            ))}
          </div>
        </div>

        {/* Lancamentos List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-3"></div>
            Carregando lançamentos...
          </div>
        ) : lancamentosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum lançamento encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lancamentosFiltrados.map((lancamento: any) => (
              <div key={lancamento.id}
                className={`bg-card border rounded-lg p-4 transition-all hover:shadow-md ${
                  lancamento.status === "pendente" ? "border-l-4 border-l-yellow-400" :
                  lancamento.status === "aprovado" ? "border-l-4 border-l-green-400" :
                  "border-l-4 border-l-red-400"
                }`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground text-sm">{lancamento.employeeNome}</h3>
                      <Badge variant={
                        lancamento.status === "pendente" ? "secondary" :
                        lancamento.status === "aprovado" ? "default" : "destructive"
                      } className={`text-xs ${lancamento.status === "aprovado" ? "bg-green-100 text-green-700 border-green-200" : ""}`}>
                        {lancamento.status === "pendente" ? "Pendente" : lancamento.status === "aprovado" ? "Aprovado" : "Rejeitado"}
                      </Badge>
                      <span className="text-lg font-bold text-purple-600">{formatCurrency(lancamento.valor)}</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Store className="w-3.5 h-3.5" /> {getParceiroNome(lancamento.parceiroId)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {lancamento.dataCompra ? new Date(lancamento.dataCompra).toLocaleDateString("pt-BR") : ""}
                      </span>
                      {lancamento.competenciaDesconto && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" /> Desc: {lancamento.competenciaDesconto}
                        </span>
                      )}
                    </div>
                    {lancamento.descricaoItens && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <ShoppingCart className="w-3.5 h-3.5" /> {lancamento.descricaoItens}
                      </p>
                    )}
                    {lancamento.status === "aprovado" && lancamento.aprovadoPor && (
                      <p className="text-xs text-green-600 mt-1">
                        Aprovado por {lancamento.aprovadoPor} em {lancamento.aprovadoEm ? new Date(lancamento.aprovadoEm).toLocaleDateString("pt-BR") : ""}
                      </p>
                    )}
                    {lancamento.status === "rejeitado" && lancamento.motivoRejeicao && (
                      <p className="text-xs text-red-600 mt-1">
                        Motivo: {lancamento.motivoRejeicao}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {lancamento.comprovanteUrl && (
                      <a href={lancamento.comprovanteUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-1" /> Comprovante
                        </Button>
                      </a>
                    )}
                    {lancamento.status === "pendente" && (
                      <>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleAprovar(lancamento.id)} disabled={aprovarMutation.isPending}>
                          <ThumbsUp className="w-4 h-4 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setSelectedLancamento(lancamento); setMotivoRejeicao(""); }}>
                          <ThumbsDown className="w-4 h-4 mr-1" /> Rejeitar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rejeição Dialog */}
        <FullScreenDialog
          open={!!selectedLancamento}
          onClose={() => { setSelectedLancamento(null); setMotivoRejeicao(""); }}
          title="Rejeitar Lançamento"
          subtitle={`${selectedLancamento?.employeeNome || ""} - ${selectedLancamento ? formatCurrency(selectedLancamento.valor) : ""}`}
          icon={<ThumbsDown className="w-5 h-5" />}
          headerColor="bg-gradient-to-r from-red-600 to-red-400"
        >
          {selectedLancamento && (
            <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
              {/* Lancamento Details */}
              <div className="bg-card border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Detalhes do Lançamento</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Colaborador:</span>
                    <p className="font-medium">{selectedLancamento.employeeNome}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Parceiro:</span>
                    <p className="font-medium">{getParceiroNome(selectedLancamento.parceiroId)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor:</span>
                    <p className="font-medium text-purple-600">{formatCurrency(selectedLancamento.valor)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data da Compra:</span>
                    <p className="font-medium">{selectedLancamento.dataCompra ? new Date(selectedLancamento.dataCompra).toLocaleDateString("pt-BR") : ""}</p>
                  </div>
                </div>
                {selectedLancamento.descricaoItens && (
                  <div>
                    <span className="text-sm text-muted-foreground">Descrição:</span>
                    <p className="text-sm">{selectedLancamento.descricaoItens}</p>
                  </div>
                )}
              </div>

              {/* Motivo */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Motivo da Rejeição *</label>
                <Textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Informe o motivo da rejeição..."
                  rows={4}
                />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => { setSelectedLancamento(null); setMotivoRejeicao(""); }}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={() => handleRejeitar(selectedLancamento.id)} disabled={aprovarMutation.isPending}>
                  <ThumbsDown className="w-4 h-4 mr-1" /> {aprovarMutation.isPending ? "Processando..." : "Confirmar Rejeição"}
                </Button>
              </div>
            </div>
          )}
        </FullScreenDialog>
      </div>
    </DashboardLayout>
  );
}
