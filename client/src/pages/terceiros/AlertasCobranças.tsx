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
  Bell, BellRing, CheckCircle, XCircle, AlertTriangle, Search, Clock,
  Send, Mail, Filter, Calendar, Building2, FileText, Eye
} from "lucide-react";

type AlertaItem = {
  id: number;
  empresaTerceiraId: number;
  companyId: number;
  tipo: string;
  titulo: string;
  descricao: string | null;
  dataVencimento: string | null;
  emailEnviado: number | null;
  emailEnviadoEm: string | null;
  resolvido: number | null;
  resolvidoEm: string | null;
  resolvidoPor: string | null;
  createdAt: string;
};

export default function AlertasCobrancas() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : undefined;
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<"pendentes" | "resolvidos" | "todos">("pendentes");
  const [novoAlertaOpen, setNovoAlertaOpen] = useState(false);
  const [novoAlerta, setNovoAlerta] = useState({ empresaTerceiraId: 0, tipo: "documento_vencendo", titulo: "", descricao: "" });

  const { data: alertas, isLoading, refetch } = trpc.terceiros.alertas.list.useQuery(
    { companyId: companyId ?? 0, resolvido: filtroStatus === "todos" ? undefined : filtroStatus === "pendentes" ? 0 : 1 },
    { enabled: !!companyId }
  );

  const { data: empresasData } = trpc.terceiros.empresas.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const resolverMutation = trpc.terceiros.alertas.resolver.useMutation({
    onSuccess: () => { toast.success("Alerta resolvido com sucesso"); refetch(); },
    onError: () => toast.error("Erro ao resolver alerta"),
  });

  const enviarMutation = trpc.terceiros.alertas.enviar.useMutation({
    onSuccess: () => { toast.success("Alerta criado com sucesso"); refetch(); setNovoAlertaOpen(false); setNovoAlerta({ empresaTerceiraId: 0, tipo: "documento_vencendo", titulo: "", descricao: "" }); },
    onError: () => toast.error("Erro ao criar alerta"),
  });

  const empresas = empresasData || [];

  const alertasFiltrados = useMemo(() => {
    if (!alertas) return [];
    let filtered = alertas as AlertaItem[];
    if (search) {
      filtered = filtered.filter((a) =>
        a.titulo.toLowerCase().includes(search.toLowerCase()) ||
        a.descricao?.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (filtroTipo !== "todos") {
      filtered = filtered.filter((a) => a.tipo === filtroTipo);
    }
    return filtered;
  }, [alertas, search, filtroTipo]);

  const tipoLabel = (tipo: string) => {
    const map: Record<string, string> = {
      documento_vencendo: "Doc. Vencendo",
      obrigacao_pendente: "Obrigação Pendente",
      documento_vencido: "Doc. Vencido",
      obrigacao_atrasada: "Obrigação Atrasada",
    };
    return map[tipo] || tipo;
  };

  const tipoColor = (tipo: string) => {
    if (tipo.includes("vencido") || tipo.includes("atrasada")) return "destructive";
    if (tipo.includes("vencendo")) return "secondary";
    return "outline";
  };

  const tipoIcon = (tipo: string) => {
    if (tipo.includes("vencido") || tipo.includes("atrasada")) return <XCircle className="w-4 h-4 text-red-500" />;
    if (tipo.includes("vencendo")) return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    return <Clock className="w-4 h-4 text-blue-500" />;
  };

  const getEmpresaNome = (empresaId: number) => {
    const emp = empresas.find((e: any) => e.id === empresaId);
    return emp?.razaoSocial || `Empresa #${empresaId}`;
  };

  const totalPendentes = alertas ? (alertas as AlertaItem[]).filter((a) => !a.resolvido).length : 0;
  const totalVencidos = alertas ? (alertas as AlertaItem[]).filter((a) => a.tipo.includes("vencido") || a.tipo.includes("atrasada")).length : 0;

  const handleCriarAlerta = () => {
    if (!companyId || !novoAlerta.empresaTerceiraId || !novoAlerta.titulo) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    enviarMutation.mutate({
      companyId,
      empresaTerceiraId: novoAlerta.empresaTerceiraId,
      tipo: novoAlerta.tipo,
      titulo: novoAlerta.titulo,
      descricao: novoAlerta.descricao,
    });
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BellRing className="w-7 h-7 text-orange-500" /> Alertas e Cobranças
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Gestão de alertas automáticos e cobranças de terceiros</p>
          </div>
          <Button onClick={() => setNovoAlertaOpen(true)} className="bg-orange-600 hover:bg-orange-700">
            <Send className="w-4 h-4 mr-1" /> Novo Alerta Manual
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border rounded-lg p-4 text-center">
            <Bell className="w-6 h-6 mx-auto text-orange-500 mb-2" />
            <div className="text-2xl font-bold">{alertasFiltrados.length}</div>
            <div className="text-xs text-muted-foreground">Total Alertas</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto text-yellow-500 mb-2" />
            <div className="text-2xl font-bold text-yellow-600">{totalPendentes}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center">
            <XCircle className="w-6 h-6 mx-auto text-red-500 mb-2" />
            <div className="text-2xl font-bold text-red-600">{totalVencidos}</div>
            <div className="text-xs text-muted-foreground">Críticos</div>
          </div>
          <div className="bg-card border rounded-lg p-4 text-center">
            <Mail className="w-6 h-6 mx-auto text-blue-500 mb-2" />
            <div className="text-2xl font-bold text-blue-600">
              {alertas ? (alertas as AlertaItem[]).filter((a) => a.emailEnviado).length : 0}
            </div>
            <div className="text-xs text-muted-foreground">E-mails Enviados</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar alertas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="w-[200px]">
              <Filter className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              <SelectItem value="documento_vencendo">Doc. Vencendo</SelectItem>
              <SelectItem value="documento_vencido">Doc. Vencido</SelectItem>
              <SelectItem value="obrigacao_pendente">Obrigação Pendente</SelectItem>
              <SelectItem value="obrigacao_atrasada">Obrigação Atrasada</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {(["pendentes", "resolvidos", "todos"] as const).map((s) => (
              <Button key={s} variant={filtroStatus === s ? "default" : "outline"} size="sm"
                onClick={() => setFiltroStatus(s)}
                className={filtroStatus === s ? "bg-orange-600 hover:bg-orange-700" : ""}>
                {s === "pendentes" ? "Pendentes" : s === "resolvidos" ? "Resolvidos" : "Todos"}
              </Button>
            ))}
          </div>
        </div>

        {/* Alerts List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3"></div>
            Carregando alertas...
          </div>
        ) : alertasFiltrados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum alerta encontrado</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alertasFiltrados.map((alerta) => (
              <div key={alerta.id}
                className={`bg-card border rounded-lg p-4 transition-all hover:shadow-md ${alerta.resolvido ? "opacity-60 border-l-4 border-l-green-400" : alerta.tipo.includes("vencido") || alerta.tipo.includes("atrasada") ? "border-l-4 border-l-red-500" : "border-l-4 border-l-yellow-400"}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {tipoIcon(alerta.tipo)}
                      <h3 className="font-semibold text-foreground text-sm">{alerta.titulo}</h3>
                      <Badge variant={tipoColor(alerta.tipo) as any} className="text-xs">
                        {tipoLabel(alerta.tipo)}
                      </Badge>
                      {alerta.resolvido ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" /> Resolvido
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" /> {getEmpresaNome(alerta.empresaTerceiraId)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Criado: {new Date(alerta.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                      {alerta.dataVencimento && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Vence: {new Date(alerta.dataVencimento).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {alerta.emailEnviado ? (
                        <span className="flex items-center gap-1 text-blue-500">
                          <Mail className="w-3.5 h-3.5" /> E-mail enviado {alerta.emailEnviadoEm ? `em ${new Date(alerta.emailEnviadoEm).toLocaleDateString("pt-BR")}` : ""}
                        </span>
                      ) : null}
                    </div>
                    {alerta.descricao && <p className="text-xs text-muted-foreground mt-2">{alerta.descricao}</p>}
                    {alerta.resolvido && alerta.resolvidoPor && (
                      <p className="text-xs text-green-600 mt-1">
                        Resolvido por {alerta.resolvidoPor} em {alerta.resolvidoEm ? new Date(alerta.resolvidoEm).toLocaleDateString("pt-BR") : ""}
                      </p>
                    )}
                  </div>
                  {!alerta.resolvido && (
                    <Button variant="outline" size="sm" onClick={() => resolverMutation.mutate({ id: alerta.id })}
                      disabled={resolverMutation.isPending} className="shrink-0">
                      <CheckCircle className="w-4 h-4 mr-1" /> Resolver
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Novo Alerta Dialog */}
        <FullScreenDialog
          open={novoAlertaOpen}
          onClose={() => setNovoAlertaOpen(false)}
          title="Novo Alerta Manual"
          subtitle="Enviar alerta/cobrança para empresa terceira"
          icon={<Send className="w-5 h-5" />}
          headerColor="bg-gradient-to-r from-orange-600 to-orange-400"
        >
          <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Empresa Terceira *</label>
              <Select value={novoAlerta.empresaTerceiraId ? String(novoAlerta.empresaTerceiraId) : ""} onValueChange={(v) => setNovoAlerta({ ...novoAlerta, empresaTerceiraId: parseInt(v) })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e: any) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.razaoSocial}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Tipo de Alerta *</label>
              <Select value={novoAlerta.tipo} onValueChange={(v) => setNovoAlerta({ ...novoAlerta, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="documento_vencendo">Documento Vencendo</SelectItem>
                  <SelectItem value="documento_vencido">Documento Vencido</SelectItem>
                  <SelectItem value="obrigacao_pendente">Obrigação Pendente</SelectItem>
                  <SelectItem value="obrigacao_atrasada">Obrigação Atrasada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Título *</label>
              <Input value={novoAlerta.titulo} onChange={(e) => setNovoAlerta({ ...novoAlerta, titulo: e.target.value })} placeholder="Ex: PGR vencendo em 10 dias" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Descrição</label>
              <Textarea value={novoAlerta.descricao} onChange={(e) => setNovoAlerta({ ...novoAlerta, descricao: e.target.value })} placeholder="Detalhes adicionais..." rows={4} />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setNovoAlertaOpen(false)}>Cancelar</Button>
              <Button onClick={handleCriarAlerta} disabled={enviarMutation.isPending} className="bg-orange-600 hover:bg-orange-700">
                <Send className="w-4 h-4 mr-1" /> {enviarMutation.isPending ? "Enviando..." : "Criar Alerta"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      </div>
    </DashboardLayout>
  );
}
