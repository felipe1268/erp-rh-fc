import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Users, AlertTriangle, CheckCircle2, XCircle, ShieldAlert,
  Package, Settings, Plus, Trash2, Save, ChevronDown, ChevronUp,
  Building2, TrendingUp, Info, Loader2, Bell, BellRing, Mail,
  Clock, Send, History
} from "lucide-react";

const NIVEL_CONFIG: Record<string, { cor: string; bg: string; label: string; desc: string }> = {
  critico: { cor: "#DC2626", bg: "#FEE2E2", label: "CRÍTICO", desc: "Estoque insuficiente para novas contratações" },
  baixo: { cor: "#EA580C", bg: "#FFF7ED", label: "BAIXO", desc: "Capacidade muito limitada" },
  medio: { cor: "#EAB308", bg: "#FEFCE8", label: "MÉDIO", desc: "Capacidade razoável" },
  bom: { cor: "#16A34A", bg: "#F0FDF4", label: "BOM", desc: "Boa capacidade de contratação" },
  otimo: { cor: "#059669", bg: "#ECFDF5", label: "ÓTIMO", desc: "Excelente capacidade" },
};

function getNivelIcon(nivelKey: string | undefined) {
  switch (nivelKey) {
    case "critico": return <XCircle className="w-5 h-5" style={{ color: "#DC2626" }} />;
    case "baixo": return <ShieldAlert className="w-5 h-5" style={{ color: "#EA580C" }} />;
    case "medio": return <AlertTriangle className="w-5 h-5" style={{ color: "#EAB308" }} />;
    case "bom": return <CheckCircle2 className="w-5 h-5" style={{ color: "#16A34A" }} />;
    case "otimo": return <TrendingUp className="w-5 h-5" style={{ color: "#059669" }} />;
    default: return <Users className="w-5 h-5 text-gray-400" />;
  }
}

interface EpiCapacidadeProps {
  companyId: number;
}

export default function EpiCapacidade({ companyId }: EpiCapacidadeProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [showPorObra, setShowPorObra] = useState(false);
  const [showAlertas, setShowAlertas] = useState(false);
  const [showLogsAlerta, setShowLogsAlerta] = useState(false);
  const [obraFiltro, setObraFiltro] = useState<number | undefined>(undefined);

  // Alerta state
  const [alertaLimiar, setAlertaLimiar] = useState(5);
  const [alertaAtivo, setAlertaAtivo] = useState(true);
  const [alertaIntervalo, setAlertaIntervalo] = useState(24);
  const [alertaEmails, setAlertaEmails] = useState("");

  // Queries - só habilita se companyId > 0
  const capacidade = trpc.epiAvancado.capacidadeContratacao.useQuery(
    { companyId, obraId: obraFiltro },
    { enabled: companyId > 0 }
  );
  const capacidadePorObra = trpc.epiAvancado.capacidadePorObra.useQuery(
    { companyId },
    { enabled: companyId > 0 && showPorObra }
  );
  const kitBasico = trpc.epiAvancado.kitBasicoContratacao.useQuery(
    { companyId },
    { enabled: companyId > 0 && showConfig }
  );
  const episList = trpc.epis.list.useQuery(
    { companyId },
    { enabled: companyId > 0 && showConfig }
  );
  const obrasQ = trpc.obras.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const alertaConfig = trpc.epiAvancado.getAlertaCapacidade.useQuery(
    { companyId },
    { enabled: companyId > 0 && showAlertas }
  );
  const alertaLogs = trpc.epiAvancado.getAlertaCapacidadeLogs.useQuery(
    { companyId },
    { enabled: companyId > 0 && showLogsAlerta }
  );

  // Preencher form de alerta quando dados carregam
  useEffect(() => {
    if (alertaConfig.data) {
      setAlertaLimiar(alertaConfig.data.limiar || 5);
      setAlertaAtivo(alertaConfig.data.ativo === 1);
      setAlertaIntervalo(alertaConfig.data.intervaloMinHoras || 24);
      try {
        const emails = alertaConfig.data.emailDestinatarios ? JSON.parse(alertaConfig.data.emailDestinatarios) : [];
        setAlertaEmails(Array.isArray(emails) ? emails.join(", ") : "");
      } catch {
        setAlertaEmails("");
      }
    }
  }, [alertaConfig.data]);

  // Mutations
  const salvarKit = trpc.epiAvancado.salvarKitBasicoContratacao.useMutation({
    onSuccess: () => {
      toast.success("Kit básico de contratação atualizado com sucesso.");
      capacidade.refetch();
      kitBasico.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const salvarAlerta = trpc.epiAvancado.salvarAlertaCapacidade.useMutation({
    onSuccess: () => {
      toast.success("Configuração de alerta salva com sucesso.");
      alertaConfig.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const verificarAlerta = trpc.epiAvancado.verificarAlertaCapacidade.useMutation({
    onSuccess: (result) => {
      if (result.disparado) {
        toast.success(`Alerta enviado para ${result.enviados} destinatário(s)!`);
        alertaLogs.refetch();
        alertaConfig.refetch();
      } else {
        toast.info(result.motivo || "Alerta não disparado.");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // State para edição do kit
  const [editItens, setEditItens] = useState<{
    epiId: number | null;
    nomeEpi: string;
    categoria: string;
    quantidade: number;
    obrigatorio: number;
  }[]>([]);
  const [editMode, setEditMode] = useState(false);

  const startEdit = () => {
    if (kitBasico.data?.itens && kitBasico.data.itens.length > 0) {
      setEditItens(kitBasico.data.itens.map((i: any) => ({
        epiId: i.epiId ?? null,
        nomeEpi: i.nomeEpi || "",
        categoria: i.categoria || "EPI",
        quantidade: i.quantidade || 1,
        obrigatorio: i.obrigatorio ?? 1,
      })));
    } else {
      setEditItens([
        { epiId: null, nomeEpi: "Capacete de Segurança", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Óculos de Proteção", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Protetor Auricular", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Luva de Segurança", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Botina de Segurança", categoria: "Calcado", quantidade: 1, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Camisa Manga Longa", categoria: "Uniforme", quantidade: 2, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Calça de Brim", categoria: "Uniforme", quantidade: 2, obrigatorio: 1 },
        { epiId: null, nomeEpi: "Máscara PFF2", categoria: "EPI", quantidade: 1, obrigatorio: 1 },
      ]);
    }
    setEditMode(true);
  };

  const addItem = () => {
    setEditItens([...editItens, { epiId: null, nomeEpi: "", categoria: "EPI", quantidade: 1, obrigatorio: 1 }]);
  };

  const removeItem = (idx: number) => {
    setEditItens(editItens.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...editItens];
    (updated[idx] as any)[field] = value;
    setEditItens(updated);
  };

  const saveKit = () => {
    const valid = editItens.filter(i => i.nomeEpi.trim());
    if (valid.length === 0) {
      toast.error("Adicione pelo menos um item ao kit.");
      return;
    }
    salvarKit.mutate({ companyId, itens: valid as any });
    setEditMode(false);
  };

  const handleSalvarAlerta = () => {
    const emailsArray = alertaEmails
      .split(",")
      .map(e => e.trim())
      .filter(e => e && e.includes("@"));
    
    salvarAlerta.mutate({
      companyId,
      limiar: alertaLimiar,
      ativo: alertaAtivo ? 1 : 0,
      emailDestinatarios: emailsArray.length > 0 ? JSON.stringify(emailsArray) : undefined,
      intervaloMinHoras: alertaIntervalo,
    });
  };

  const handleTestarAlerta = () => {
    verificarAlerta.mutate({ companyId, forcar: true });
  };

  // Proteção contra dados não carregados
  if (companyId <= 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>Selecione uma empresa para ver a capacidade de contratação.</p>
      </div>
    );
  }

  if (capacidade.isLoading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-blue-500" />
        <p>Calculando capacidade de contratação...</p>
      </div>
    );
  }

  if (capacidade.isError) {
    return (
      <div className="text-center py-12 text-red-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3" />
        <p>Erro ao calcular capacidade: {capacidade.error?.message || "Erro desconhecido"}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => capacidade.refetch()}>
          Tentar Novamente
        </Button>
      </div>
    );
  }

  const data = capacidade.data;
  const nivelKey = data?.nivel || "critico";
  const nivel = NIVEL_CONFIG[nivelKey] || NIVEL_CONFIG.critico;
  const obras = obrasQ.data || [];

  return (
    <div className="space-y-6">
      {/* Card Principal de Capacidade */}
      <div className="rounded-xl border-2 overflow-hidden" style={{ borderColor: nivel.cor + '40' }}>
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ backgroundColor: nivel.bg }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: nivel.cor + '20' }}>
              <Users className="w-6 h-6" style={{ color: nivel.cor }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Capacidade de Contratação</h2>
              <p className="text-sm text-gray-600">Quantos novos funcionários você consegue equipar com o estoque atual</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {obras.length > 0 && (
              <Select
                value={obraFiltro?.toString() || "todas"}
                onValueChange={(v) => setObraFiltro(v === "todas" ? undefined : parseInt(v))}
              >
                <SelectTrigger className="w-full sm:w-[200px] bg-white">
                  <SelectValue placeholder="Todas as obras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Estoque Geral (Central + Obras)</SelectItem>
                  {obras.map((o: any) => (
                    <SelectItem key={o.id} value={o.id.toString()}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => { setShowConfig(!showConfig); if (!showConfig) startEdit(); }}>
              <Settings className="w-4 h-4 mr-1" /> Configurar Kit
            </Button>
          </div>
        </div>

        {/* Número Grande */}
        <div className="px-4 sm:px-6 py-6 sm:py-8 flex flex-col sm:flex-row items-center justify-between bg-white gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <div className="text-center">
              <div className="text-6xl sm:text-7xl font-black" style={{ color: nivel.cor }}>
                {data?.capacidade ?? 0}
              </div>
              <div className="text-sm font-medium text-gray-500 mt-1">
                {(data?.capacidade ?? 0) === 1 ? "funcionário" : "funcionários"}
              </div>
            </div>
            <div className="sm:border-l sm:pl-6 space-y-1 text-center sm:text-left">
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                {getNivelIcon(nivelKey)}
                <span className="text-sm font-bold" style={{ color: nivel.cor }}>{nivel.label}</span>
              </div>
              <p className="text-sm text-gray-600 max-w-md">
                {data?.mensagem || nivel.desc}
              </p>
              {data?.gargalo && (
                <div className="flex items-center gap-1 mt-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-800">
                    <strong>Gargalo:</strong> {data.gargalo.nomeEpi} (estoque: {data.gargalo.estoqueTotal})
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right space-y-1 hidden sm:block">
            {data?.kitConfigurado && (
              <>
                <div className="text-xs text-gray-400">Kit: {data.kitNome || "Básico"}</div>
                <div className="text-xs text-gray-400">{data.totalItensKit || 0} itens ({data.itensObrigatorios || 0} obrigatórios)</div>
              </>
            )}
          </div>
        </div>

        {/* Botões de expansão */}
        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t flex flex-wrap gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetalhes(!showDetalhes)}
            className="text-gray-600"
          >
            <Package className="w-4 h-4 mr-1" />
            Detalhes por Item
            {showDetalhes ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPorObra(!showPorObra)}
            className="text-gray-600"
          >
            <Building2 className="w-4 h-4 mr-1" />
            Capacidade por Obra
            {showPorObra ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAlertas(!showAlertas)}
            className="text-gray-600"
          >
            <BellRing className="w-4 h-4 mr-1" />
            Alertas por E-mail
            {showAlertas ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>

      {/* Detalhes por Item */}
      {showDetalhes && data?.detalhes && Array.isArray(data.detalhes) && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Package className="w-4 h-4" /> Detalhes por Item do Kit
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Item do Kit</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Categoria</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Qtd/Pessoa</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Estoque Central</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Estoque Obras</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Total</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Capacidade</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.detalhes.map((item: any, idx: number) => {
                  const isGargalo = data.gargalo && item.nomeEpi === data.gargalo?.nomeEpi;
                  const cap = item.capacidade ?? 0;
                  const corItem = cap === 0 ? "#DC2626" : cap <= 3 ? "#EA580C" : cap <= 10 ? "#EAB308" : "#16A34A";
                  return (
                    <tr key={idx} className={`border-b ${isGargalo ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {isGargalo && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                          <span className={`font-medium ${isGargalo ? 'text-red-700' : 'text-gray-800'}`}>
                            {item.nomeEpi || "—"}
                          </span>
                          {!item.encontradoNoCatalogo && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Não vinculado</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{item.categoria || "—"}</span>
                      </td>
                      <td className="text-center px-4 py-2.5 font-medium">{item.qtdNecessariaPorPessoa ?? 1}</td>
                      <td className="text-center px-4 py-2.5">{item.estoqueCentral ?? 0}</td>
                      <td className="text-center px-4 py-2.5">{item.estoqueObra ?? 0}</td>
                      <td className="text-center px-4 py-2.5 font-bold">{item.estoqueTotal ?? 0}</td>
                      <td className="text-center px-4 py-2.5">
                        <span className="font-bold text-lg" style={{ color: corItem }}>{cap}</span>
                      </td>
                      <td className="text-center px-4 py-2.5">
                        {cap === 0 ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">Sem estoque</span>
                        ) : cap <= 3 ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium">Crítico</span>
                        ) : cap <= 10 ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 font-medium">Atenção</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-blue-50 border-t flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-xs text-blue-700">
              A capacidade geral é determinada pelo item com menor disponibilidade (gargalo). Itens "Não vinculado" não foram encontrados no catálogo — vincule-os na configuração do kit.
            </span>
          </div>
        </div>
      )}

      {/* Capacidade por Obra */}
      {showPorObra && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Capacidade por Obra (somente estoque da obra)
            </h3>
          </div>
          {capacidadePorObra.isLoading ? (
            <div className="p-6 text-center text-gray-400">
              <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
              Calculando...
            </div>
          ) : !capacidadePorObra.data?.kitConfigurado ? (
            <div className="p-6 text-center text-gray-500">Configure o kit básico primeiro.</div>
          ) : !capacidadePorObra.data?.obras || capacidadePorObra.data.obras.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Nenhuma obra ativa encontrada.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
              {capacidadePorObra.data.obras.map((obra: any) => {
                const cap = obra.capacidade ?? 0;
                const corObra = cap === 0 ? "#DC2626" : cap <= 3 ? "#EA580C" : cap <= 10 ? "#EAB308" : "#16A34A";
                return (
                  <div key={obra.obraId} className="rounded-lg border p-4 text-center" style={{ borderColor: corObra + '40' }}>
                    <div className="text-3xl font-black" style={{ color: corObra }}>{cap}</div>
                    <div className="text-xs text-gray-500 mt-1">funcionários</div>
                    <div className="text-sm font-medium text-gray-800 mt-2 truncate" title={obra.obraNome || ""}>
                      {obra.obraNome || "Obra sem nome"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Configuração de Alertas Automáticos */}
      {showAlertas && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-600" /> Alertas Automáticos por E-mail
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Ativo</span>
              <Switch
                checked={alertaAtivo}
                onCheckedChange={setAlertaAtivo}
              />
            </div>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-600">
              Configure alertas automáticos por e-mail quando a capacidade de contratação cair abaixo de um limiar.
              Os alertas são enviados para todos os destinatários de notificação cadastrados, mais os e-mails extras abaixo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-500" />
                  Limiar de Alerta (funcionários)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={alertaLimiar}
                  onChange={(e) => setAlertaLimiar(parseInt(e.target.value) || 5)}
                  className="bg-white"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Alerta disparado quando capacidade &lt; {alertaLimiar}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  <Clock className="w-3.5 h-3.5 inline mr-1 text-gray-500" />
                  Intervalo Mínimo entre Alertas (horas)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={alertaIntervalo}
                  onChange={(e) => setAlertaIntervalo(parseInt(e.target.value) || 24)}
                  className="bg-white"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Evita envio excessivo de alertas
                </p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                <Mail className="w-3.5 h-3.5 inline mr-1 text-gray-500" />
                E-mails Extras (além dos destinatários de notificação)
              </label>
              <Input
                value={alertaEmails}
                onChange={(e) => setAlertaEmails(e.target.value)}
                placeholder="email1@empresa.com, email2@empresa.com"
                className="bg-white"
              />
              <p className="text-xs text-gray-400 mt-1">
                Separe múltiplos e-mails por vírgula
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" onClick={handleSalvarAlerta} disabled={salvarAlerta.isPending}>
                <Save className="w-4 h-4 mr-1" />
                {salvarAlerta.isPending ? "Salvando..." : "Salvar Configuração"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestarAlerta}
                disabled={verificarAlerta.isPending}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <Send className="w-4 h-4 mr-1" />
                {verificarAlerta.isPending ? "Verificando..." : "Verificar e Enviar Agora"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowLogsAlerta(!showLogsAlerta)}
                className="text-gray-500"
              >
                <History className="w-4 h-4 mr-1" />
                Histórico de Alertas
                {showLogsAlerta ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
              </Button>
            </div>

            {alertaConfig.data?.ultimoAlertaEm && (
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Último alerta: {new Date(alertaConfig.data.ultimoAlertaEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                {alertaConfig.data.ultimaCapacidade !== null && (
                  <span> — Capacidade: {alertaConfig.data.ultimaCapacidade}</span>
                )}
              </div>
            )}
          </div>

          {/* Histórico de Alertas */}
          {showLogsAlerta && (
            <div className="border-t">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <History className="w-4 h-4" /> Histórico de Alertas Enviados
                </h4>
              </div>
              {alertaLogs.isLoading ? (
                <div className="p-4 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                </div>
              ) : !alertaLogs.data || alertaLogs.data.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">Nenhum alerta enviado ainda.</div>
              ) : (
                <div className="divide-y max-h-64 overflow-y-auto">
                  {alertaLogs.data.map((log: any) => (
                    <div key={log.id} className="px-4 py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: log.capacidade === 0 ? '#FEE2E2' : log.capacidade <= 3 ? '#FFF7ED' : '#FEFCE8',
                            color: log.capacidade === 0 ? '#DC2626' : log.capacidade <= 3 ? '#EA580C' : '#EAB308',
                          }}>
                          <span className="font-bold text-xs">{log.capacidade}</span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">
                            Capacidade: {log.capacidade} (limiar: {log.limiar})
                          </div>
                          {log.gargaloItem && (
                            <div className="text-xs text-gray-500">
                              Gargalo: {log.gargaloItem} (estoque: {log.gargaloEstoque})
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">
                          {new Date(log.enviadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                        </div>
                        <div className="text-xs">
                          <span className="text-green-600">{log.emailsEnviados} enviado{log.emailsEnviados !== 1 ? 's' : ''}</span>
                          {log.emailsErros > 0 && (
                            <span className="text-red-500 ml-1">{log.emailsErros} erro{log.emailsErros !== 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Configuração do Kit Básico */}
      {showConfig && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Settings className="w-4 h-4" /> Configuração do Kit Básico de Contratação
            </h3>
            <div className="flex gap-2">
              {!editMode ? (
                <Button size="sm" onClick={startEdit}>Editar Kit</Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                  <Button size="sm" onClick={saveKit} disabled={salvarKit.isPending}>
                    <Save className="w-4 h-4 mr-1" /> {salvarKit.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {editMode ? (
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-500 mb-3">
                Defina os itens obrigatórios para equipar um novo funcionário. A capacidade será calculada com base no estoque disponível.
              </p>
              {editItens.map((item, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-gray-50">
                  <span className="text-xs text-gray-400 w-6">{idx + 1}.</span>
                  <Input
                    value={item.nomeEpi}
                    onChange={(e) => updateItem(idx, "nomeEpi", e.target.value)}
                    placeholder="Nome do EPI"
                    className="flex-1 min-w-[150px] bg-white"
                  />
                  <Select
                    value={item.categoria}
                    onValueChange={(v) => updateItem(idx, "categoria", v)}
                  >
                    <SelectTrigger className="w-[120px] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EPI">EPI</SelectItem>
                      <SelectItem value="Uniforme">Uniforme</SelectItem>
                      <SelectItem value="Calcado">Calçado</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Qtd:</span>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => updateItem(idx, "quantidade", parseInt(e.target.value) || 1)}
                      className="w-16 bg-white text-center"
                    />
                  </div>
                  {episList.data && Array.isArray(episList.data) && (
                    <Select
                      value={item.epiId?.toString() || "none"}
                      onValueChange={(v) => updateItem(idx, "epiId", v === "none" ? null : parseInt(v))}
                    >
                      <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue placeholder="Vincular ao catálogo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem vínculo</SelectItem>
                        {episList.data.map((epi: any) => (
                          <SelectItem key={epi.id} value={epi.id.toString()}>
                            {epi.nome} (est: {epi.quantidadeEstoque || 0})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addItem} className="mt-2">
                <Plus className="w-4 h-4 mr-1" /> Adicionar Item
              </Button>
            </div>
          ) : (
            <div className="p-4">
              {kitBasico.isLoading ? (
                <div className="text-center text-gray-400 py-4">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                  Carregando...
                </div>
              ) : !kitBasico.data?.kit ? (
                <div className="text-center py-6">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">Nenhum kit básico configurado.</p>
                  <Button size="sm" className="mt-3" onClick={startEdit}>Configurar Agora</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(kitBasico.data.itens || []).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{idx + 1}.</span>
                        <span className="font-medium text-gray-800">{item.nomeEpi || "—"}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">{item.categoria || "—"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">{item.quantidade || 1}x por pessoa</span>
                        {item.epiId && <span className="text-xs text-green-600">Vinculado</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
