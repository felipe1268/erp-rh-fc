import { useState, useMemo, useRef } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Globe, Store, Search, Building2, DollarSign, Calendar, User, FileText,
  Plus, Send, Eye, CheckCircle, Clock, XCircle, Upload, ShoppingCart,
  Shield, Key, Pencil, Trash2, AlertTriangle
} from "lucide-react";

// Calcula a competência do desconto a partir da data da compra.
// Regra (mesma do servidor em `parceiros.lancamentos.create`):
//   dia <= 15 → competência = mês da compra
//   dia >= 16 → competência = mês seguinte
function calcCompetenciaDesconto(dataCompra?: string | null): string | null {
  if (!dataCompra) return null;
  const m = dataCompra.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Valida data civil real (rejeita 2026-02-31 etc.)
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  if (d >= 16) {
    mo += 1;
    if (mo > 12) { mo = 1; y += 1; }
  }
  return `${String(mo).padStart(2, "0")}/${y}`;
}

export default function PortalParceiro() {
  const { user } = useAuth();
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) || 0 : 0;
  const companyIds = getCompanyIdsForQuery();
  const [search, setSearch] = useState("");
  const [simulacaoOpen, setSimulacaoOpen] = useState(false);
  const [simulacaoParceiro, setSimulacaoParceiro] = useState<any>(null);
  const [editLancamento, setEditLancamento] = useState<any>(null);
  const [deleteLancamento, setDeleteLancamento] = useState<any>(null);
  const [novoLancamento, setNovoLancamento] = useState({
    employeeId: 0,
    employeeNome: "",
    dataCompra: new Date().toISOString().split("T")[0],
    descricaoItens: "",
    valor: "",
  });
  const [competencia, setCompetencia] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const { data: parceirosData, isLoading } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const { data: employeesData } = trpc.employees.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const { data: lancamentosData, refetch: refetchLancamentos } = trpc.parceiros.lancamentos.list.useQuery(
    { companyId: companyId ?? 0, competencia },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  // Rev. 4696 — senha padrão configurável + edição de acesso
  const [senhaPadraoOpen, setSenhaPadraoOpen] = useState(false);
  const [novaSenhaPadrao, setNovaSenhaPadrao] = useState("");
  const [editAcesso, setEditAcesso] = useState<any>(null);
  const [editAcessoForm, setEditAcessoForm] = useState({ nomeResponsavel: "", emailResponsavel: "" });
  const [resetConfirm, setResetConfirm] = useState<any>(null);

  const { data: senhaPadraoData, refetch: refetchSenhaPadrao } = trpc.portalExterno.admin.getSenhaPadraoParceiro.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: companyId > 0 }
  );
  const senhaPadrao = senhaPadraoData?.senhaPadrao ?? "mudar123";

  const setSenhaPadraoMutation = trpc.portalExterno.admin.setSenhaPadraoParceiro.useMutation({
    onSuccess: () => {
      toast.success("Senha padrão atualizada — os próximos resets usarão a nova senha");
      setSenhaPadraoOpen(false);
      setNovaSenhaPadrao("");
      refetchSenhaPadrao();
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar senha padrão"),
  });

  const atualizarAcessoMutation = trpc.portalExterno.admin.atualizarAcessoParceiro.useMutation({
    onSuccess: () => { toast.success("Acesso atualizado"); setEditAcesso(null); refetchAcessos(); },
    onError: (e) => toast.error(e.message || "Erro ao atualizar acesso"),
  });

  // Rev. 4697 — convite de boas-vindas por e-mail + link do portal
  const [conviteParceiro, setConviteParceiro] = useState<any>(null);
  const [conviteForm, setConviteForm] = useState({ email: "", nomeResponsavel: "" });
  const linkPortal = `${window.location.origin}/portal/login`;

  const enviarConviteMutation = trpc.portalExterno.admin.enviarConviteParceiro.useMutation({
    onSuccess: (data) => {
      toast.success(`Convite enviado para ${data.email}${data.acessoNovo ? " (acesso criado com a senha padrão)" : ""}`);
      setConviteParceiro(null);
      refetchAcessos();
    },
    onError: (e) => toast.error(e.message || "Erro ao enviar convite"),
  });

  const copiarLinkPortal = async () => {
    try {
      await navigator.clipboard.writeText(linkPortal);
      toast.success("Link do portal copiado");
    } catch {
      toast.info(linkPortal);
    }
  };

  const { data: acessosData, refetch: refetchAcessos } = trpc.portalExterno.admin.listarAcessos.useQuery(
    { companyId: companyId ?? 0, tipo: "parceiro" },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const createMutation = trpc.parceiros.lancamentos.create.useMutation({
    onSuccess: () => {
      toast.success("Lançamento registrado com sucesso");
      refetchLancamentos();
      setNovoLancamento({ employeeId: 0, employeeNome: "", dataCompra: new Date().toISOString().split("T")[0], descricaoItens: "", valor: "" });
    },
    onError: () => toast.error("Erro ao registrar lançamento"),
  });

  const gerarAcessoMutation = trpc.portalExterno.admin.gerarAcesso.useMutation({
    onSuccess: (data) => {
      toast.success(`Acesso pronto! Login: ${data.cnpj} | Senha: ${data.senhaTemporaria} (troca obrigatória no 1º acesso)`);
      refetchAcessos();
    },
    onError: (e) => toast.error(e.message || "Erro ao gerar acesso"),
  });

  const editMutation = trpc.parceiros.lancamentos.editarLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento atualizado"); refetchLancamentos(); setEditLancamento(null); },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const deleteMutation = trpc.parceiros.lancamentos.excluirLancamento.useMutation({
    onSuccess: () => { toast.success("Lançamento excluído"); refetchLancamentos(); setDeleteLancamento(null); },
    onError: () => toast.error("Erro ao excluir"),
  });

  const uploadMutation = trpc.parceiros.lancamentos.uploadComprovante.useMutation({
    onSuccess: () => { toast.success("Comprovante enviado"); refetchLancamentos(); },
    onError: () => toast.error("Erro ao enviar comprovante"),
  });

  const parceiros = useMemo(() => {
    if (!parceirosData) return [];
    if (!search) return parceirosData;
    return (parceirosData as any[]).filter((p: any) =>
      p.razaoSocial?.toLowerCase().includes(search.toLowerCase()) ||
      p.nomeFantasia?.toLowerCase().includes(search.toLowerCase()) ||
      p.cnpj?.includes(search)
    );
  }, [parceirosData, search]);

  const employees = useMemo(() => {
    if (!employeesData) return [];
    return (employeesData as any[]).filter((e: any) => e.status === "Ativo");
  }, [employeesData]);

  const getLancamentosParceiro = (parceiroId: number) => {
    if (!lancamentosData) return [];
    return (lancamentosData as any[]).filter((l: any) => l.parceiroId === parceiroId);
  };

  const getAcessoParceiro = (parceiroId: number) => {
    if (!acessosData) return null;
    return (acessosData as any[]).find((a: any) => a.parceiroId === parceiroId && a.ativo);
  };

  const handleGerarAcesso = (parceiro: any) => {
    if (!companyId) return;
    gerarAcessoMutation.mutate({
      tipo: "parceiro",
      parceiroId: parceiro.id,
      companyId,
      cnpj: parceiro.cnpj,
      emailResponsavel: parceiro.emailPrincipal || undefined,
      nomeResponsavel: parceiro.responsavelNome || undefined,
      nomeEmpresa: parceiro.nomeFantasia || parceiro.razaoSocial,
    });
  };

  const handleCriarLancamento = (parceiroId: number) => {
    if (!companyId || !novoLancamento.employeeId || !novoLancamento.valor) {
      toast.error("Preencha colaborador e valor");
      return;
    }
    createMutation.mutate({
      parceiroId,
      companyId,
      employeeId: novoLancamento.employeeId,
      employeeNome: novoLancamento.employeeNome,
      dataCompra: novoLancamento.dataCompra,
      descricaoItens: novoLancamento.descricaoItens,
      valor: novoLancamento.valor,
      competenciaDesconto: competencia,
    });
  };

  const handleUploadComprovante = (lancamentoId: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({ lancamentoId, fileName: file.name, fileBase64: base64, contentType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const tipoLabel = (tipo: string) => {
    const map: Record<string, string> = { farmacia: "Farmácia", posto_combustivel: "Posto de Combustível", restaurante: "Restaurante", mercado: "Mercado", outros: "Outros" };
    return map[tipo] || tipo;
  };

  const formatCurrency = (v: number | string) => {
    const n = typeof v === "string" ? parseFloat(v) : v;
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Globe className="w-7 h-7 text-purple-500" /> Portal Externo do Parceiro
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Gestão de acesso externo para parceiros conveniados lançarem consumo</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => window.open("/portal/login", "_blank")}
            >
              <Globe className="w-4 h-4 mr-1.5" /> Portal do Parceiro
            </Button>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Competência:</label>
              <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-[180px]" />
            </div>
          </div>
        </div>

        {/* Info Banner — Rev. 4696: senha padrão dinâmica + controle geral */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <Shield className="w-5 h-5 text-purple-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-purple-800">Portal de Acesso para Parceiros</p>
            <p className="text-xs text-purple-600 mt-1 break-words">
              Cada parceiro tem <strong>um acesso único</strong> (login = CNPJ). Ao gerar ou resetar, a senha volta para a
              senha padrão <strong className="font-mono">{senhaPadrao}</strong> e o parceiro é obrigado a trocá-la no primeiro acesso.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="border-purple-300 text-purple-700 hover:bg-purple-100"
              onClick={copiarLinkPortal}
            >
              <Globe className="w-4 h-4 mr-1" /> Copiar Link do Portal
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-purple-300 text-purple-700 hover:bg-purple-100"
              onClick={() => { setNovaSenhaPadrao(senhaPadrao); setSenhaPadraoOpen(true); }}
            >
              <Key className="w-4 h-4 mr-1" /> Alterar Senha Padrão
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar parceiro..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* Parceiro List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-3"></div>
            Carregando...
          </div>
        ) : parceiros.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
            Nenhum parceiro conveniado encontrado
          </div>
        ) : (
          <div className="space-y-3">
            {(parceiros as any[]).map((parceiro: any) => {
              const lancamentos = getLancamentosParceiro(parceiro.id);
              const totalMes = lancamentos.reduce((sum: number, l: any) => sum + parseFloat(l.valor || "0"), 0);
              const pendentes = lancamentos.filter((l: any) => l.status === "pendente").length;
              const acesso = getAcessoParceiro(parceiro.id);

              return (
                <div key={parceiro.id} className="bg-card border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{parceiro.nomeFantasia || parceiro.razaoSocial}</h3>
                        <Badge variant="outline" className="text-xs">{tipoLabel(parceiro.tipoConvenio)}</Badge>
                        <Badge variant={parceiro.status === "ativo" ? "default" : "secondary"}
                          className={`text-xs ${parceiro.status === "ativo" ? "bg-green-100 text-green-700 border-green-200" : ""}`}>
                          {parceiro.status === "ativo" ? "Ativo" : parceiro.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">CNPJ: {parceiro.cnpj} | {parceiro.emailPrincipal || "Sem e-mail"}</p>

                      {/* Stats */}
                      <div className="flex flex-wrap gap-4 mt-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <ShoppingCart className="w-3.5 h-3.5" /> {lancamentos.length} lançamentos
                        </span>
                        <span className="flex items-center gap-1 text-purple-600 font-medium">
                          <DollarSign className="w-3.5 h-3.5" /> {formatCurrency(totalMes)}
                        </span>
                        {pendentes > 0 && (
                          <span className="flex items-center gap-1 text-yellow-600">
                            <Clock className="w-3.5 h-3.5" /> {pendentes} pendentes
                          </span>
                        )}
                      </div>

                      {/* Acesso Info */}
                      <div className="mt-3">
                        {acesso ? (
                          <div className="flex items-center gap-2 text-xs">
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                              <Key className="w-3 h-3 mr-1" /> Acesso Ativo
                            </Badge>
                            <span className="text-muted-foreground">Login: {acesso.cnpj}</span>
                            {acesso.ultimoLogin && (
                              <span className="text-muted-foreground">| Último acesso: {new Date(acesso.ultimoLogin).toLocaleDateString("pt-BR")}</span>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <XCircle className="w-3 h-3 mr-1" /> Sem acesso ao portal
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acesso ? setResetConfirm(parceiro) : handleGerarAcesso(parceiro)}
                        disabled={gerarAcessoMutation.isPending}
                      >
                        <Key className="w-4 h-4 mr-1" /> {acesso ? "Resetar Senha" : "Gerar Acesso"}
                      </Button>
                      {acesso && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditAcesso(acesso);
                            setEditAcessoForm({
                              nomeResponsavel: acesso.nomeResponsavel || "",
                              emailResponsavel: acesso.emailResponsavel || "",
                            });
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Editar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-purple-300 text-purple-700 hover:bg-purple-50"
                        onClick={() => {
                          setConviteParceiro(parceiro);
                          setConviteForm({
                            email: acesso?.emailResponsavel || parceiro.emailPrincipal || "",
                            nomeResponsavel: acesso?.nomeResponsavel || parceiro.responsavelNome || "",
                          });
                        }}
                      >
                        <Send className="w-4 h-4 mr-1" /> Enviar Convite
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSimulacaoParceiro(parceiro); setSimulacaoOpen(true); }}>
                        <Eye className="w-4 h-4 mr-1" /> Simular Portal
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Simulação Portal Dialog */}
        <FullScreenDialog
          open={simulacaoOpen}
          onClose={() => { setSimulacaoOpen(false); setSimulacaoParceiro(null); }}
          title={`Portal - ${simulacaoParceiro?.nomeFantasia || simulacaoParceiro?.razaoSocial || ""}`}
          subtitle={`Simulação do portal externo | Competência: ${competencia}`}
          icon={<Globe className="w-5 h-5" />}
          headerColor="bg-gradient-to-r from-purple-600 to-purple-400"
        >
          {simulacaoParceiro && (
            <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
              {/* Welcome Banner */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-5 text-center">
                <Store className="w-10 h-10 mx-auto text-purple-500 mb-2" />
                <h2 className="text-lg font-bold text-purple-800">Portal do Parceiro Conveniado</h2>
                <p className="text-sm text-purple-600 mt-1">{simulacaoParceiro.nomeFantasia || simulacaoParceiro.razaoSocial}</p>
                <p className="text-xs text-muted-foreground mt-2">Registre o consumo dos colaboradores para a competência <strong>{competencia}</strong></p>
              </div>

              {/* New Lancamento Form */}
              <div className="bg-card border rounded-lg p-4 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Plus className="w-5 h-5 text-purple-500" /> Novo Lançamento de Consumo
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Colaborador *</label>
                    <Select
                      value={novoLancamento.employeeId ? String(novoLancamento.employeeId) : ""}
                      onValueChange={(v) => {
                        const emp = employees.find((e: any) => e.id === parseInt(v));
                        setNovoLancamento({
                          ...novoLancamento,
                          employeeId: parseInt(v),
                          employeeNome: emp ? (emp as any).nomeCompleto : "",
                        });
                      }}
                    >
                      <SelectTrigger>
                        <User className="w-4 h-4 mr-1" />
                        <SelectValue placeholder="Selecione o colaborador" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e: any) => (
                          <SelectItem key={e.id} value={String(e.id)}>{e.nomeCompleto}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Data da Compra *</label>
                    <Input type="date" value={novoLancamento.dataCompra} onChange={(e) => setNovoLancamento({ ...novoLancamento, dataCompra: e.target.value })} />
                    {(() => {
                      const comp = calcCompetenciaDesconto(novoLancamento.dataCompra);
                      if (!comp) return null;
                      return (
                        <p className="text-xs text-muted-foreground mt-1" data-testid="text-competencia-desconto">
                          Competência do desconto: <span className="font-medium text-foreground">{comp}</span>
                        </p>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Valor (R$) *</label>
                    <Input type="number" step="0.01" placeholder="0,00" value={novoLancamento.valor} onChange={(e) => setNovoLancamento({ ...novoLancamento, valor: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Descrição dos Itens</label>
                    <Input placeholder="Ex: Medicamentos, combustível..." value={novoLancamento.descricaoItens} onChange={(e) => setNovoLancamento({ ...novoLancamento, descricaoItens: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => handleCriarLancamento(simulacaoParceiro.id)} disabled={createMutation.isPending}>
                    <Send className="w-4 h-4 mr-1" /> {createMutation.isPending ? "Enviando..." : "Registrar Consumo"}
                  </Button>
                </div>
              </div>

              {/* Lancamentos do Mês */}
              <div className="bg-card border rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-500" /> Lançamentos do Mês ({competencia})
                </h3>
                {(() => {
                  const lancamentos = getLancamentosParceiro(simulacaoParceiro.id);
                  if (lancamentos.length === 0) {
                    return <p className="text-center text-sm text-muted-foreground py-6">Nenhum lançamento registrado neste mês</p>;
                  }
                  const total = lancamentos.reduce((sum: number, l: any) => sum + parseFloat(l.valor || "0"), 0);
                  return (
                    <div className="space-y-2">
                      {lancamentos.map((l: any) => (
                        <div key={l.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                          l.status === "aprovado" ? "border-l-4 border-l-green-400 bg-green-50/50" :
                          l.status === "rejeitado" ? "border-l-4 border-l-red-400 bg-red-50/50" :
                          "border-l-4 border-l-yellow-400 bg-yellow-50/50"
                        }`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{l.employeeNome}</span>
                              <Badge variant={l.status === "aprovado" ? "default" : l.status === "rejeitado" ? "destructive" : "secondary"}
                                className={`text-xs ${l.status === "aprovado" ? "bg-green-100 text-green-700" : ""}`}>
                                {l.status === "aprovado" ? "Aprovado" : l.status === "rejeitado" ? "Rejeitado" : "Pendente"}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {l.dataCompra ? new Date(l.dataCompra).toLocaleDateString("pt-BR") : ""}
                              {l.descricaoItens ? ` — ${l.descricaoItens}` : ""}
                            </p>
                            {l.comentarioAdmin && (
                              <p className="text-xs text-blue-600 mt-0.5">Comentário RH: {l.comentarioAdmin}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-purple-600 mr-2">{formatCurrency(l.valor)}</span>
                            {l.status === "pendente" && (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => setEditLancamento(l)} title="Editar">
                                  <Pencil className="w-4 h-4 text-blue-500" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteLancamento(l)} title="Excluir">
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </>
                            )}
                            {l.comprovanteUrl ? (
                              <a href={l.comprovanteUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                              </a>
                            ) : (
                              <label className="cursor-pointer">
                                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadComprovante(l.id, f); }} />
                                <Button variant="ghost" size="sm" asChild><span><Upload className="w-4 h-4" /></span></Button>
                              </label>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-3 border-t font-bold">
                        <span>Total do Mês</span>
                        <span className="text-purple-600">{formatCurrency(total)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Parceiro Info */}
              <div className="bg-card border rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-purple-500" /> Dados do Parceiro
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Razão Social:</span><p className="font-medium">{simulacaoParceiro.razaoSocial}</p></div>
                  <div><span className="text-muted-foreground">CNPJ:</span><p className="font-medium">{simulacaoParceiro.cnpj}</p></div>
                  <div><span className="text-muted-foreground">Tipo:</span><p className="font-medium">{tipoLabel(simulacaoParceiro.tipoConvenio)}</p></div>
                  <div><span className="text-muted-foreground">Dia de Fechamento:</span><p className="font-medium">{simulacaoParceiro.diaFechamento || "Não definido"}</p></div>
                  {simulacaoParceiro.limiteMensalPorColaborador && (
                    <div><span className="text-muted-foreground">Limite Mensal/Colaborador:</span><p className="font-medium">{formatCurrency(simulacaoParceiro.limiteMensalPorColaborador)}</p></div>
                  )}
                  <div><span className="text-muted-foreground">Contato:</span><p className="font-medium">{simulacaoParceiro.responsavelNome || "—"} | {simulacaoParceiro.telefone || "—"}</p></div>
                </div>
              </div>
            </div>
          )}
        </FullScreenDialog>

        {/* Edit Dialog */}
        <Dialog open={!!editLancamento} onOpenChange={(o) => !o && setEditLancamento(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Lançamento</DialogTitle></DialogHeader>
            {editLancamento && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Colaborador</label>
                  <Input value={editLancamento.employeeNome || ""} onChange={(e) => setEditLancamento({ ...editLancamento, employeeNome: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Data da Compra</label>
                  <Input type="date" value={editLancamento.dataCompra?.split("T")[0] || ""} onChange={(e) => setEditLancamento({ ...editLancamento, dataCompra: e.target.value })} />
                  {(() => {
                    const comp = calcCompetenciaDesconto(editLancamento.dataCompra?.split("T")[0]);
                    if (!comp) return null;
                    return (
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-competencia-desconto-edit">
                        Competência do desconto: <span className="font-medium text-foreground">{comp}</span>
                      </p>
                    );
                  })()}
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Valor (R$)</label>
                  <Input type="number" step="0.01" value={editLancamento.valor || ""} onChange={(e) => setEditLancamento({ ...editLancamento, valor: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Descrição</label>
                  <Input value={editLancamento.descricaoItens || ""} onChange={(e) => setEditLancamento({ ...editLancamento, descricaoItens: e.target.value })} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditLancamento(null)}>Cancelar</Button>
              <Button className="bg-purple-600 hover:bg-purple-700" disabled={editMutation.isPending}
                onClick={() => editMutation.mutate({
                  id: editLancamento.id,
                  employeeNome: editLancamento.employeeNome,
                  dataCompra: editLancamento.dataCompra?.split("T")[0],
                  valor: editLancamento.valor,
                  descricaoItens: editLancamento.descricaoItens,
                })}>
                {editMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteLancamento} onOpenChange={(o) => !o && setDeleteLancamento(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" /> Excluir Lançamento</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir o lançamento de <strong>{deleteLancamento?.employeeNome}</strong> no valor de <strong>{deleteLancamento ? formatCurrency(deleteLancamento.valor) : ""}</strong>?
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteLancamento(null)}>Cancelar</Button>
              <Button variant="destructive" disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate({ id: deleteLancamento.id })}>
                {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 4696 — Alterar Senha Padrão */}
        <Dialog open={senhaPadraoOpen} onOpenChange={(o) => !o && setSenhaPadraoOpen(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-purple-500" /> Senha Padrão dos Parceiros</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground break-words">
                Esta é a senha inicial definida toda vez que um acesso é gerado ou resetado.
                O parceiro é sempre obrigado a trocá-la no primeiro acesso. Alterar aqui
                <strong> não muda</strong> senhas já em uso — vale para os próximos resets.
              </p>
              <div>
                <label className="text-sm font-medium">Nova senha padrão</label>
                <Input
                  value={novaSenhaPadrao}
                  onChange={(e) => setNovaSenhaPadrao(e.target.value)}
                  placeholder="mín. 6 caracteres"
                  className="mt-1 font-mono"
                  maxLength={30}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSenhaPadraoOpen(false)}>Cancelar</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={setSenhaPadraoMutation.isPending || novaSenhaPadrao.trim().length < 6}
                onClick={() => setSenhaPadraoMutation.mutate({ companyId, senha: novaSenhaPadrao.trim() })}
              >
                {setSenhaPadraoMutation.isPending ? "Salvando..." : "Salvar Senha Padrão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 4696 — Confirmação de reset de senha */}
        <Dialog open={!!resetConfirm} onOpenChange={(o) => !o && setResetConfirm(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-yellow-500" /> Resetar Senha do Parceiro</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground break-words">
              A senha de <strong>{resetConfirm?.nomeFantasia || resetConfirm?.razaoSocial}</strong> voltará
              para a senha padrão <strong className="font-mono">{senhaPadrao}</strong> e ele deverá trocá-la
              no primeiro acesso. A senha atual deixa de funcionar imediatamente.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetConfirm(null)}>Cancelar</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={gerarAcessoMutation.isPending}
                onClick={() => { const p = resetConfirm; setResetConfirm(null); handleGerarAcesso(p); }}
              >
                {gerarAcessoMutation.isPending ? "Resetando..." : "Resetar Senha"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 4697 — Enviar convite de boas-vindas por e-mail */}
        <Dialog open={!!conviteParceiro} onOpenChange={(o) => !o && setConviteParceiro(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-purple-500" /> Enviar Convite — {conviteParceiro?.nomeFantasia || conviteParceiro?.razaoSocial}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground break-words">
                O responsável recebe um e-mail de boas-vindas com o link do portal, o login
                (CNPJ), a senha inicial e o passo a passo dos lançamentos. Se o parceiro ainda
                não tiver acesso, ele é criado com a senha padrão. Acessos existentes <strong>não</strong> têm
                a senha resetada.
              </p>
              <div>
                <label className="text-sm font-medium">Nome do responsável</label>
                <Input value={conviteForm.nomeResponsavel} onChange={(e) => setConviteForm(f => ({ ...f, nomeResponsavel: e.target.value }))} className="mt-1" placeholder="Quem vai operar o portal" />
              </div>
              <div>
                <label className="text-sm font-medium">E-mail do responsável *</label>
                <Input type="email" value={conviteForm.email} onChange={(e) => setConviteForm(f => ({ ...f, email: e.target.value }))} className="mt-1" placeholder="email@parceiro.com.br" />
              </div>
              <div className="bg-muted rounded-md p-2.5 text-xs text-muted-foreground break-all">
                Link enviado: <span className="font-mono">{linkPortal}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConviteParceiro(null)}>Cancelar</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={enviarConviteMutation.isPending || !/^\S+@\S+\.\S+$/.test(conviteForm.email.trim())}
                onClick={() => enviarConviteMutation.mutate({
                  parceiroId: conviteParceiro.id,
                  companyId,
                  email: conviteForm.email.trim(),
                  nomeResponsavel: conviteForm.nomeResponsavel.trim() || undefined,
                  portalBaseUrl: window.location.origin,
                })}
              >
                {enviarConviteMutation.isPending ? "Enviando..." : "Enviar Convite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rev. 4696 — Editar acesso do parceiro */}
        <Dialog open={!!editAcesso} onOpenChange={(o) => !o && setEditAcesso(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5 text-purple-500" /> Editar Acesso — {editAcesso?.nomeEmpresa}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Login (CNPJ)</label>
                <Input value={editAcesso?.cnpj || ""} disabled className="mt-1 font-mono bg-muted" />
              </div>
              <div>
                <label className="text-sm font-medium">Nome do responsável</label>
                <Input value={editAcessoForm.nomeResponsavel} onChange={(e) => setEditAcessoForm(f => ({ ...f, nomeResponsavel: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">E-mail do responsável</label>
                <Input type="email" value={editAcessoForm.emailResponsavel} onChange={(e) => setEditAcessoForm(f => ({ ...f, emailResponsavel: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAcesso(null)}>Cancelar</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={atualizarAcessoMutation.isPending}
                onClick={() => atualizarAcessoMutation.mutate({
                  id: editAcesso.id,
                  companyId,
                  nomeResponsavel: editAcessoForm.nomeResponsavel,
                  emailResponsavel: editAcessoForm.emailResponsavel,
                })}
              >
                {atualizarAcessoMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
