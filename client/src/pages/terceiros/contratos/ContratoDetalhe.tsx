import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, FileCheck, AlertTriangle, CheckCircle,
  ChevronRight, ChevronDown, Building2, Calendar, DollarSign, FileText,
  Zap, ClipboardCheck, X, TrendingUp, TrendingDown, Minus,
  FileEdit, Save, Clock, RefreshCw, History, ExternalLink, Trash2, Pencil, FolderOpen,
  Eye, EyeOff, BarChart3, Loader2, FileDown, Settings, Undo2
} from "lucide-react";
import { toast } from "sonner";

const BRL = (v: any) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
};

const STATUS_MEDICAO: Record<string, { label: string; cls: string }> = {
  rascunho:           { label: "Rascunho",            cls: "bg-gray-100 text-gray-600 border-gray-200" },
  aguardando_aprovacao:{ label: "Aguard. Aprovação",  cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  aprovada:           { label: "Aprovada",             cls: "bg-green-100 text-green-800 border-green-200" },
  paga:               { label: "Paga",                 cls: "bg-blue-100 text-blue-800 border-blue-200" },
  rejeitada:          { label: "Rejeitada",            cls: "bg-red-100 text-red-800 border-red-200" },
};

const STATUS_DOC: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-red-100 text-red-700 border-red-200" },
  enviado:  { label: "Enviado",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  aprovado: { label: "Aprovado", cls: "bg-green-100 text-green-700 border-green-200" },
  vencido:  { label: "Vencido",  cls: "bg-orange-100 text-orange-700 border-orange-200" },
};

type Tab = "itens" | "medicoes" | "comparativo" | "documentos" | "documento";

export default function ContratoDetalheWrapper() {
  const [, params] = useRoute("/terceiros/contratos/:id");
  const id = parseInt(params?.id || "0");
  return <ContratoDetalheInner key={id} routeId={id} />;
}

function ContratoDetalheInner({ routeId }: { routeId: number }) {
  const [, navigate] = useLocation();
  const id = routeId;
  const [tab, setTab] = useState<Tab>("itens");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showGerarMedicao, setShowGerarMedicao] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [medicaoDataInicio, setMedicaoDataInicio] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [medicaoDataFim, setMedicaoDataFim] = useState(() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [newItem, setNewItem] = useState({ descricao: "", unidade: "m²", quantidade: "1", valorUnitario: "0", eapCodigo: "", planejamentoAtividadeId: "" });
  const [newDoc, setNewDoc] = useState({ tipo: "INSS", descricao: "", competencia: "", dataVencimento: "", bloqueiaPagemento: false });
  const [editMedicao, setEditMedicao] = useState<{ id: number; periodo: string; dataReferencia: string; observacoes: string; status: string } | null>(null);

  // Documento tab state
  const [textoEditado, setTextoEditado] = useState<string | null>(null);
  const [obsRevisao, setObsRevisao] = useState("");
  const [showRevisoes, setShowRevisoes] = useState(false);
  const [showObsModal, setShowObsModal] = useState(false);

  const utils = trpc.useUtils();
  const { data: contrato, isLoading } = trpc.terceiroContratos.getContrato.useQuery({ id }, { enabled: id > 0 });

  const recalcularDatasMut = trpc.terceiroContratos.recalcularDatasCronograma.useMutation({
    onSuccess: (r) => { toast.success(`Datas atualizadas do cronograma${r.usouEap ? " (via EAP)" : " (todas atividades)"}: ${fmtDate(r.dataInicio)} → ${fmtDate(r.dataTermino)}`); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const excluirMedicaoMut = trpc.terceiroContratos.excluirMedicao.useMutation({
    onSuccess: () => { toast.success("Medição excluída"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const editarMedicaoMut = trpc.terceiroContratos.editarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição atualizada"); setEditMedicao(null); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const adicionarItemMut = trpc.terceiroContratos.adicionarItem.useMutation({
    onSuccess: () => { toast.success("Item adicionado!"); setShowAddItem(false); setNewItem({ descricao: "", unidade: "m²", quantidade: "1", valorUnitario: "0", eapCodigo: "", planejamentoAtividadeId: "" }); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const removerItemMut = trpc.terceiroContratos.removerItem.useMutation({
    onSuccess: () => { toast.success("Item removido"); utils.terceiroContratos.getContrato.invalidate({ id }); },
  });

  const relinkEapMut = trpc.terceiroContratos.relinkEapItens.useMutation({
    onSuccess: (data) => { toast.success(data.msg); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const gerarMedicaoMut = trpc.terceiroContratos.gerarMedicao.useMutation({
    onSuccess: (data) => {
      if (data.itensNaoVinculados && data.itensNaoVinculados.length > 0) {
        toast.warning(`Medição gerada, mas ${data.itensNaoVinculados.length} item(ns) sem vínculo ao cronograma (avanço = 0%): ${data.itensNaoVinculados.slice(0, 3).join(", ")}${data.itensNaoVinculados.length > 3 ? "..." : ""}`, { duration: 8000 });
      } else {
        toast.success("Medição gerada com base no avanço físico!");
      }
      setShowGerarMedicao(false); setTab("medicoes"); utils.terceiroContratos.getContrato.invalidate({ id });
    },
    onError: (e) => toast.error(e.message),
  });

  const aprovarMut = trpc.terceiroContratos.aprovarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição aprovada!"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const rejeitarMut = trpc.terceiroContratos.rejeitarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição rejeitada"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const cancelarAprovacaoMut = trpc.terceiroContratos.cancelarAprovacao.useMutation({
    onSuccess: () => { toast.success("Aprovação cancelada — medição voltou para aguardando aprovação"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const recalcularMut = trpc.terceiroContratos.recalcularMedicao.useMutation({
    onSuccess: (data) => { toast.success(`Medição recalculada! Valor medido: R$ ${Number(data.valorMedido).toFixed(2)} (${Number(data.percentualGlobal).toFixed(1)}%)`); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const editarMedicaoItemMut = trpc.terceiroContratos.editarMedicaoItem.useMutation({
    onSuccess: () => { utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const removerMedicaoItemMut = trpc.terceiroContratos.removerMedicaoItem.useMutation({
    onSuccess: (data) => { toast.success(`Item removido (${data.restantes} restantes)`); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const criarDocMut = trpc.terceiroContratos.criarDocumento.useMutation({
    onSuccess: () => { toast.success("Documento criado!"); setShowAddDoc(false); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const atualizarDocMut = trpc.terceiroContratos.atualizarDocumento.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); utils.terceiroContratos.getContrato.invalidate({ id }); },
  });

  const gerarTextoMut = trpc.terceiroContratos.gerarTextoContrato.useMutation({
    onSuccess: (r) => { toast.success(`Documento gerado — v${r.versao}`); setTextoEditado(r.texto); utils.terceiroContratos.getContrato.invalidate({ id }); utils.terceiroContratos.listarRevisoes.invalidate({ contratoId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const salvarTextoMut = trpc.terceiroContratos.salvarTextoContrato.useMutation({
    onSuccess: (r) => { toast.success(`Documento salvo — v${r.versao}`); setShowObsModal(false); setObsRevisao(""); utils.terceiroContratos.getContrato.invalidate({ id }); utils.terceiroContratos.listarRevisoes.invalidate({ contratoId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const restaurarMut = trpc.terceiroContratos.restaurarRevisao.useMutation({
    onSuccess: (r) => { toast.success(`Revisão restaurada — v${r.versao}`); utils.terceiroContratos.getContrato.invalidate({ id }); utils.terceiroContratos.listarRevisoes.invalidate({ contratoId: id }); },
    onError: (e) => toast.error(e.message),
  });

  const { data: revisoes = [] } = trpc.terceiroContratos.listarRevisoes.useQuery(
    { contratoId: id },
    { enabled: tab === "documento" && id > 0 }
  );

  const textoAtual = textoEditado ?? contrato?.textoContrato ?? null;

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div></DashboardLayout>;
  if (!contrato) return <DashboardLayout><div className="p-8 text-center text-gray-400">Contrato não encontrado</div></DashboardLayout>;

  const pct = contrato.percentualMedidoGlobal || 0;
  const pctPago = Number(contrato.valorTotal) > 0 ? (Number(contrato.valorPago) / Number(contrato.valorTotal)) * 100 : 0;
  const valOrc = Number(contrato.valorOrcamento ?? 0);
  const valFec = Number(contrato.valorTotal ?? 0);
  const variacao = valFec - valOrc;
  const variacaoPct = valOrc > 0 ? (variacao / valOrc) * 100 : 0;
  const showVariacao = valOrc > 0;

  return (
    <DashboardLayout>
      <div className="p-5 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button onClick={() => navigate("/terceiros/contratos")} className="p-2 hover:bg-gray-100 rounded-lg mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {contrato.numeroContrato && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">{contrato.numeroContrato}</span>}
              <Badge className={`text-xs border ${STATUS_MEDICAO[contrato.status || "ativo"]?.cls || ""}`}>{contrato.status}</Badge>
              {contrato.docsComPendencia > 0 && (
                <Badge className="text-xs border bg-red-100 text-red-700 border-red-200">
                  <AlertTriangle className="w-3 h-3 mr-1" />{contrato.docsComPendencia} doc(s) pendente(s)
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{contrato.descricao}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{contrato.empresa?.nomeFantasia || contrato.empresa?.razaoSocial || "—"}</span>
              {contrato.obraNome && <span>📍 {contrato.obraNome}</span>}
            </div>
          </div>
          <Button onClick={() => setShowGerarMedicao(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Zap className="w-4 h-4" /> Gerar Medição
          </Button>
        </div>

        {/* Vigência do Contrato — destaque */}
        {(() => {
          const ini = contrato.dataInicio;
          const fim = contrato.dataTermino;
          const diasVigencia = ini && fim ? Math.ceil((new Date(fim + "T00:00:00").getTime() - new Date(ini + "T00:00:00").getTime()) / 86400000) : null;
          const hoje = new Date();
          const diasRestantes = fim ? Math.ceil((new Date(fim + "T00:00:00").getTime() - hoje.getTime()) / 86400000) : null;
          const pctDecorrido = ini && fim && diasVigencia && diasVigencia > 0
            ? Math.min(100, Math.max(0, ((Date.now() - new Date(ini + "T00:00:00").getTime()) / (diasVigencia * 86400000)) * 100))
            : 0;
          const corBorda = diasRestantes !== null && diasRestantes <= 15 ? "border-red-300 bg-red-50" : diasRestantes !== null && diasRestantes <= 30 ? "border-amber-300 bg-amber-50" : "border-blue-200 bg-blue-50";
          const corBarra = diasRestantes !== null && diasRestantes <= 15 ? "bg-red-500" : diasRestantes !== null && diasRestantes <= 30 ? "bg-amber-500" : "bg-blue-500";
          return (
            <div className={`rounded-xl border-2 p-4 ${corBorda}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-bold text-gray-700 uppercase tracking-wide">Vigência do Contrato</span>
                </div>
                <button
                  onClick={() => recalcularDatasMut.mutate({ contratoId: id, companyId: contrato.companyId })}
                  disabled={recalcularDatasMut.isPending}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                  title="Recalcular datas a partir do cronograma"
                >
                  <RefreshCw className={`w-3 h-3 ${recalcularDatasMut.isPending ? "animate-spin" : ""}`} />
                  {recalcularDatasMut.isPending ? "Calculando..." : "Atualizar do Cronograma"}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Início</p>
                  <p className="text-lg font-bold text-gray-900">{ini ? fmtDate(ini) : "—"}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Término</p>
                  <p className="text-lg font-bold text-gray-900">{fim ? fmtDate(fim) : "—"}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Duração</p>
                  <p className="text-lg font-bold text-gray-900">{diasVigencia !== null ? `${diasVigencia} dias` : "—"}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Restam</p>
                  <p className={`text-lg font-bold ${diasRestantes !== null && diasRestantes <= 15 ? "text-red-600" : diasRestantes !== null && diasRestantes <= 30 ? "text-amber-600" : "text-blue-700"}`}>
                    {diasRestantes !== null ? (diasRestantes <= 0 ? "Encerrado" : `${diasRestantes} dias`) : "—"}
                  </p>
                </div>
              </div>
              {ini && fim && diasVigencia && diasVigencia > 0 && (
                <div className="mt-3">
                  <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${corBarra}`} style={{ width: `${pctDecorrido}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1 text-right">{pctDecorrido.toFixed(0)}% decorrido</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* Resumo financeiro */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Valor Fechado (Contrato)", value: BRL(contrato.valorTotal), color: "text-gray-900", sub: null },
            { label: "Medido Acumulado", value: BRL(contrato.valorMedidoAcumulado), color: "text-blue-700", sub: `${(contrato.percentualMedidoGlobal || 0).toFixed(1)}%` },
            { label: "Total Pago", value: BRL(contrato.valorPago), color: "text-green-700", sub: `${pctPago.toFixed(1)}%` },
            { label: "Saldo a Liberar", value: BRL(contrato.saldoALiberar), color: contrato.saldoALiberar > 0 ? "text-yellow-700" : "text-gray-400", sub: null },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
              {k.sub && <p className="text-xs text-gray-400">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* Orçamento vs Fechado */}
        {showVariacao && (
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${
            variacao > 0 ? "bg-red-50 border-red-200" :
            variacao < 0 ? "bg-green-50 border-green-200" :
            "bg-gray-50 border-gray-200"
          }`}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              variacao > 0 ? "bg-red-500" : variacao < 0 ? "bg-green-500" : "bg-gray-300"
            }`}>
              {variacao > 0 ? <TrendingUp className="w-5 h-5 text-white" /> :
               variacao < 0 ? <TrendingDown className="w-5 h-5 text-white" /> :
               <Minus className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1">
              <p className={`font-semibold text-sm ${variacao > 0 ? "text-red-700" : variacao < 0 ? "text-green-700" : "text-gray-600"}`}>
                {variacao > 0 ? `Acima do orçamento — ${BRL(variacao)} (+${Math.abs(variacaoPct).toFixed(1)}%)` :
                 variacao < 0 ? `Economia vs orçamento — ${BRL(Math.abs(variacao))} (${Math.abs(variacaoPct).toFixed(1)}% abaixo)` :
                 "Dentro do orçamento"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Valor Orçado: <strong>{BRL(valOrc)}</strong> → Valor Fechado: <strong>{BRL(valFec)}</strong>
              </p>
            </div>
          </div>
        )}

        {/* Barras de progresso */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Avanço Físico (medido)</span><span>{pct.toFixed(1)}%</span></div>
            <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Execução Financeira (pago)</span><span>{pctPago.toFixed(1)}%</span></div>
            <div className="h-2 bg-gray-100 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(pctPago, 100)}%` }} /></div>
          </div>
          {pctPago > pct + 0.1 && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 p-2 rounded-lg">
              <AlertTriangle className="w-4 h-4" /> Pagamento maior que o avanço físico medido — verificar!
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(["itens", "medicoes", "comparativo", "documentos", "documento"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "itens" ? `Itens (${contrato.itens.length})` :
               t === "medicoes" ? `Medições (${contrato.medicoes.length})` :
               t === "comparativo" ? <span className="flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Comparativo</span> :
               t === "documentos" ? `Docs (${contrato.documentos.length})` :
               <span className="flex items-center gap-1.5"><FileEdit className="w-3.5 h-3.5" />Documento</span>}
            </button>
          ))}
        </div>

        {/* Tab: Itens */}
        {tab === "itens" && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              {contrato.itens.length > 0 && contrato.itens.some((it: any) => !it.eapCodigo) && (
                <Button variant="outline" size="sm" className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50" disabled={relinkEapMut.isPending}
                  onClick={() => relinkEapMut.mutate({ contratoId: id })}>
                  <RefreshCw className={`w-4 h-4 ${relinkEapMut.isPending ? "animate-spin" : ""}`} /> Vincular EAP
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddItem(!showAddItem)}>
                <Plus className="w-4 h-4" /> Adicionar Item
              </Button>
            </div>

            {showAddItem && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-blue-800">Novo Item do Contrato</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label className="text-xs">Descrição *</Label><Input className="mt-1 text-sm" placeholder="Ex: Forro de gesso térreo" value={newItem.descricao} onChange={e => setNewItem(f => ({ ...f, descricao: e.target.value }))} /></div>
                  <div><Label className="text-xs">Cód. EAP (Planejamento)</Label><Input className="mt-1 text-sm font-mono" placeholder="Ex: 1.2.3" value={newItem.eapCodigo} onChange={e => setNewItem(f => ({ ...f, eapCodigo: e.target.value }))} /></div>
                  <div><Label className="text-xs">Unidade</Label><Input className="mt-1 text-sm" value={newItem.unidade} onChange={e => setNewItem(f => ({ ...f, unidade: e.target.value }))} /></div>
                  <div><Label className="text-xs">Quantidade</Label><Input type="number" className="mt-1 text-sm" value={newItem.quantidade} onChange={e => setNewItem(f => ({ ...f, quantidade: e.target.value }))} /></div>
                  <div><Label className="text-xs">Valor Unitário (R$)</Label><Input type="number" className="mt-1 text-sm" value={newItem.valorUnitario} onChange={e => setNewItem(f => ({ ...f, valorUnitario: e.target.value }))} /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowAddItem(false)}>Cancelar</Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={adicionarItemMut.isPending}
                    onClick={() => adicionarItemMut.mutate({
                      contratoId: id, companyId: contrato.companyId,
                      descricao: newItem.descricao, unidade: newItem.unidade,
                      quantidade: parseFloat(newItem.quantidade) || 1,
                      valorUnitario: parseFloat(newItem.valorUnitario) || 0,
                      eapCodigo: newItem.eapCodigo || undefined,
                    })}>
                    Adicionar
                  </Button>
                </div>
              </div>
            )}

            {contrato.itens.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum item — adicione atividades vinculadas ao cronograma
              </div>
            ) : (<ItemsTreeTable contrato={contrato} id={id} pct={pct} removerItemMut={removerItemMut} />)}
          </div>
        )}

        {/* Tab: Medições */}
        {tab === "medicoes" && (
          <MedicoesTab contrato={contrato} id={id} aprovarMut={aprovarMut} rejeitarMut={rejeitarMut} cancelarAprovacaoMut={cancelarAprovacaoMut} recalcularMut={recalcularMut} excluirMedicaoMut={excluirMedicaoMut} editarMedicaoItemMut={editarMedicaoItemMut} removerMedicaoItemMut={removerMedicaoItemMut} setEditMedicao={setEditMedicao} />
        )}

        {/* Tab: Comparativo */}
        {tab === "comparativo" && (
          <ComparativoTab contrato={contrato} id={id} />
        )}

        {/* Tab: Documentos */}
        {tab === "documentos" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowAddDoc(!showAddDoc)}>
                <Plus className="w-4 h-4" /> Adicionar Documento
              </Button>
            </div>

            {showAddDoc && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tipo</Label>
                    <Select value={newDoc.tipo} onValueChange={v => setNewDoc(f => ({ ...f, tipo: v }))}>
                      <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["INSS", "FGTS", "CND", "folha_pagamento", "seguro", "ASO", "NR", "outro"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Competência (AAAA-MM)</Label><Input className="mt-1 text-sm" placeholder="2025-03" value={newDoc.competencia} onChange={e => setNewDoc(f => ({ ...f, competencia: e.target.value }))} /></div>
                  <div><Label className="text-xs">Descrição</Label><Input className="mt-1 text-sm" value={newDoc.descricao} onChange={e => setNewDoc(f => ({ ...f, descricao: e.target.value }))} /></div>
                  <div><Label className="text-xs">Vencimento</Label><Input type="date" className="mt-1 text-sm" value={newDoc.dataVencimento} onChange={e => setNewDoc(f => ({ ...f, dataVencimento: e.target.value }))} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={newDoc.bloqueiaPagemento} onChange={e => setNewDoc(f => ({ ...f, bloqueiaPagemento: e.target.checked }))} className="rounded" />
                  Bloquear pagamento se pendente
                </label>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowAddDoc(false)}>Cancelar</Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700" disabled={criarDocMut.isPending}
                    onClick={() => criarDocMut.mutate({
                      contratoId: id, companyId: contrato.companyId, empresaTerceiraId: contrato.empresaTerceiraId,
                      tipo: newDoc.tipo, descricao: newDoc.descricao || undefined,
                      competencia: newDoc.competencia || undefined, dataVencimento: newDoc.dataVencimento || undefined,
                      bloqueiaPagemento: newDoc.bloqueiaPagemento,
                    })}>
                    Criar
                  </Button>
                </div>
              </div>
            )}

            {contrato.documentos.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum documento obrigatório cadastrado
              </div>
            ) : contrato.documentos.map(doc => {
              const st = STATUS_DOC[doc.status || "pendente"] || STATUS_DOC.pendente;
              return (
                <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{doc.tipo}</span>
                      {doc.competencia && <span className="text-xs text-gray-400 font-mono">{doc.competencia}</span>}
                      <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                      {doc.bloqueiaPagemento && <Badge className="text-xs border bg-red-50 text-red-600 border-red-200">Bloqueia pag.</Badge>}
                    </div>
                    {doc.descricao && <p className="text-xs text-gray-400 mt-0.5">{doc.descricao}</p>}
                    {doc.dataVencimento && <p className="text-xs text-gray-400 mt-0.5">Vence: {fmtDate(doc.dataVencimento)}</p>}
                  </div>
                  <div className="flex gap-2">
                    {doc.status === "pendente" && (
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => atualizarDocMut.mutate({ id: doc.id, status: "aprovado", validadoPor: "Responsável" })}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Validar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab: Documento do Contrato */}
        {tab === "documento" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={gerarTextoMut.isPending}
                onClick={() => gerarTextoMut.mutate({ contratoId: id })}
              >
                <RefreshCw className={`w-4 h-4 ${gerarTextoMut.isPending ? "animate-spin" : ""}`} />
                {textoAtual ? "Regenerar documento" : "Gerar documento"}
              </Button>
              {textoAtual && (
                <Button
                  size="sm"
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                  disabled={salvarTextoMut.isPending || !textoEditado}
                  onClick={() => setShowObsModal(true)}
                >
                  <Save className="w-4 h-4" />
                  Salvar alterações
                </Button>
              )}
              {revisoes.length > 0 && (
                <button
                  onClick={() => setShowRevisoes(r => !r)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 ml-auto"
                >
                  <History className="w-4 h-4" />
                  {revisoes.length} revisão(ões)
                </button>
              )}
              <button
                onClick={() => navigate("/terceiros/contratos/template")}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 ml-auto"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Editar template padrão
              </button>
            </div>

            {/* Versão info */}
            {(contrato as any).versaoTexto > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="w-3.5 h-3.5" />
                Versão atual: v{(contrato as any).versaoTexto}
                {textoEditado && <span className="text-orange-500 font-medium ml-2">● Alterações não salvas</span>}
              </div>
            )}

            {!textoAtual ? (
              <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
                <FileEdit className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-400 text-sm mb-1">Nenhum documento gerado ainda</p>
                <p className="text-gray-400 text-xs mb-4">Clique em "Gerar documento" para preencher o template com os dados deste contrato</p>
                <Button size="sm" variant="outline" onClick={() => navigate("/terceiros/contratos/template")}>
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  Configurar template padrão
                </Button>
              </div>
            ) : (
              <div className="flex gap-4">
                {/* Editor */}
                <div className="flex-1">
                  <textarea
                    value={textoAtual}
                    onChange={e => setTextoEditado(e.target.value)}
                    className="w-full h-[680px] rounded-xl border border-gray-200 p-5 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none leading-relaxed"
                    spellCheck={false}
                  />
                </div>

                {/* Histórico de revisões */}
                {showRevisoes && revisoes.length > 0 && (
                  <div className="w-64 flex-shrink-0 space-y-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Histórico de Revisões</p>
                    <div className="space-y-1.5 max-h-[650px] overflow-y-auto">
                      {revisoes.map((rev: any) => (
                        <div key={rev.id} className="bg-white rounded-lg border border-gray-200 p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-mono font-semibold text-blue-600">v{rev.versao}</span>
                            <button
                              onClick={() => { if (confirm(`Restaurar versão v${rev.versao}?`)) restaurarMut.mutate({ contratoId: id, revisaoId: rev.id }); }}
                              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                            >
                              Restaurar
                            </button>
                          </div>
                          {rev.observacao && <p className="text-xs text-gray-500 leading-snug">{rev.observacao}</p>}
                          {rev.criadoPor && <p className="text-xs text-gray-400 mt-0.5">por {rev.criadoPor}</p>}
                          <p className="text-xs text-gray-300 mt-0.5">
                            {rev.criadoEm ? new Date(rev.criadoEm).toLocaleString("pt-BR") : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal: Salvar com observação */}
        {showObsModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-bold mb-1">Salvar Documento</h2>
              <p className="text-sm text-gray-500 mb-4">Adicione uma observação sobre esta revisão (opcional)</p>
              <Input
                placeholder="Ex: Ajustado prazo da Cláusula 2"
                value={obsRevisao}
                onChange={e => setObsRevisao(e.target.value)}
              />
              <div className="flex gap-3 mt-4 justify-end">
                <Button variant="outline" onClick={() => setShowObsModal(false)}>Cancelar</Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={salvarTextoMut.isPending}
                  onClick={() => salvarTextoMut.mutate({ contratoId: id, texto: textoAtual!, observacao: obsRevisao || undefined })}
                >
                  {salvarTextoMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Gerar Medição */}
        {showGerarMedicao && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            {(() => {
              const proximoNumero = (contrato.medicoes?.length || 0) + 1;
              const numStr = String(proximoNumero).padStart(2, "0");
              const isFirst = proximoNumero === 1;
              const ultimaMedicao = contrato.medicoes?.length > 0
                ? [...contrato.medicoes].sort((a: any, b: any) => (b.numero || 0) - (a.numero || 0))[0]
                : null;
              const autoInicio = ultimaMedicao?.dataFim
                ? (() => { const d = new Date(ultimaMedicao.dataFim); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })()
                : null;
              const autoFim = new Date().toISOString().slice(0, 10);
              const inicioEfetivo = isFirst ? medicaoDataInicio : (autoInicio || medicaoDataInicio);
              const fimEfetivo = isFirst ? medicaoDataFim : autoFim;
              const periodoCalc = inicioEfetivo.slice(0, 7);
              return (
                <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                  <h2 className="text-lg font-bold mb-1">Gerar Medição Automática</h2>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl font-bold text-blue-600">Medição {numStr}</span>
                    {!isFirst && ultimaMedicao?.dataFim && (
                      <span className="text-xs text-gray-400">Continuação da Medição {String(ultimaMedicao.numero).padStart(2, "0")}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    O sistema vai buscar o avanço físico atual de cada atividade no planejamento e calcular o valor a medir automaticamente.
                  </p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm">Data Início</Label>
                        {isFirst ? (
                          <Input className="mt-1" type="date" value={medicaoDataInicio} onChange={e => setMedicaoDataInicio(e.target.value)} />
                        ) : (
                          <div className="mt-1 px-3 py-2 bg-gray-100 rounded-md text-sm text-gray-700 border">{inicioEfetivo.split("-").reverse().join("/")}</div>
                        )}
                      </div>
                      <div>
                        <Label className="text-sm">Data Fim</Label>
                        {isFirst ? (
                          <Input className="mt-1" type="date" value={medicaoDataFim} onChange={e => setMedicaoDataFim(e.target.value)} />
                        ) : (
                          <div className="mt-1 px-3 py-2 bg-gray-100 rounded-md text-sm text-gray-700 border">{fimEfetivo.split("-").reverse().join("/")}</div>
                        )}
                      </div>
                    </div>
                    {!isFirst && (
                      <p className="text-xs text-gray-400">Período calculado automaticamente: início no dia seguinte à medição anterior, fim na data de hoje.</p>
                    )}
                    {contrato.docsComPendencia > 0 && (
                      <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-700 text-xs">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        Existem {contrato.docsComPendencia} documento(s) pendentes. A medição será gerada mas poderá ser bloqueada para pagamento.
                      </div>
                    )}
                  </div>
                  {gerarMedicaoMut.isPending && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Gerando medição...
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ animation: "progress-indeterminate 1.5s ease-in-out infinite" }} />
                      </div>
                      <p className="text-xs text-gray-400">Vinculando itens ao planejamento e calculando avanço físico...</p>
                      <style>{`@keyframes progress-indeterminate { 0% { width: 10%; margin-left: 0; } 50% { width: 60%; margin-left: 20%; } 100% { width: 10%; margin-left: 90%; } }`}</style>
                    </div>
                  )}
                  <div className="flex gap-3 mt-5 justify-end">
                    <Button variant="outline" onClick={() => setShowGerarMedicao(false)} disabled={gerarMedicaoMut.isPending}>Cancelar</Button>
                    <Button className="bg-blue-600 hover:bg-blue-700" disabled={gerarMedicaoMut.isPending}
                      onClick={() => gerarMedicaoMut.mutate({ contratoId: id, companyId: contrato.companyId, periodo: periodoCalc, dataInicio: inicioEfetivo, dataFim: fimEfetivo, criadoPor: "Responsável" })}>
                      <Zap className="w-4 h-4 mr-2" />{gerarMedicaoMut.isPending ? "Gerando..." : "Gerar Medição"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {editMedicao && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-bold mb-4">Editar Medição</h2>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">Período (AAAA-MM)</Label>
                  <Input className="mt-1" value={editMedicao.periodo} onChange={e => setEditMedicao(prev => prev ? { ...prev, periodo: e.target.value } : null)} />
                </div>
                <div>
                  <Label className="text-sm">Data de Referência</Label>
                  <Input type="date" className="mt-1" value={editMedicao.dataReferencia} onChange={e => setEditMedicao(prev => prev ? { ...prev, dataReferencia: e.target.value } : null)} />
                </div>
                <div>
                  <Label className="text-sm">Observações</Label>
                  <Input className="mt-1" value={editMedicao.observacoes} onChange={e => setEditMedicao(prev => prev ? { ...prev, observacoes: e.target.value } : null)} placeholder="Observações..." />
                </div>
                <div>
                  <Label className="text-sm">Status</Label>
                  <Select value={editMedicao.status} onValueChange={v => setEditMedicao(prev => prev ? { ...prev, status: v } : null)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="aguardando_aprovacao">Aguardando Aprovação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-3 mt-5 justify-end">
                <Button variant="outline" onClick={() => setEditMedicao(null)}>Cancelar</Button>
                <Button className="bg-blue-600 hover:bg-blue-700" disabled={editarMedicaoMut.isPending}
                  onClick={() => editarMedicaoMut.mutate({
                    id: editMedicao.id,
                    companyId: contrato.companyId,
                    periodo: editMedicao.periodo,
                    dataReferencia: editMedicao.dataReferencia || null,
                    observacoes: editMedicao.observacoes || null,
                    status: editMedicao.status as "rascunho" | "aguardando_aprovacao",
                  })}>
                  <Save className="w-4 h-4 mr-2" />{editarMedicaoMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function MedicoesTab({ contrato, id, aprovarMut, rejeitarMut, cancelarAprovacaoMut, recalcularMut, excluirMedicaoMut, editarMedicaoItemMut, removerMedicaoItemMut, setEditMedicao }: any) {
  const [expandedMedicao, setExpandedMedicao] = useState<number | null>(null);
  const [rejeicaoModal, setRejeicaoModal] = useState<{ id: number; numero: number } | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [editingItem, setEditingItem] = useState<{ id: number; valor: string } | null>(null);
  const [recalcResult, setRecalcResult] = useState<any>(null);

  if (contrato.medicoes.length === 0) {
    return (
      <div className="py-10 text-center text-gray-400 text-sm">
        <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
        Nenhuma medição. Use o botão "Gerar Medição" para criar a primeira.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {contrato.medicoes.map((m: any) => {
        const st = STATUS_MEDICAO[m.status || "rascunho"] || STATUS_MEDICAO.rascunho;
        const isExpanded = expandedMedicao === m.id;
        const isEditable = m.status !== "paga";
        const isPreApproval = m.status === "aguardando_aprovacao" || m.status === "rascunho";
        const itens = m.itens || [];

        return (
          <div key={m.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedMedicao(isExpanded ? null : m.id)}>
                  <div className="flex items-center gap-2 mb-1">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <span className="font-semibold text-gray-900">Medição {String(m.numero).padStart(2, "0")}{m.dataInicio && m.dataFim ? ` — ${fmtDate(m.dataInicio)} a ${fmtDate(m.dataFim)}` : ` — ${m.periodo}`}</span>
                    <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                    {m.geradoAutomaticamente && <Badge className="text-xs border bg-purple-100 text-purple-700 border-purple-200"><Zap className="w-3 h-3 mr-1" />Auto</Badge>}
                  </div>
                  <div className="text-xs text-gray-500 ml-6">
                    Ref: {fmtDate(m.dataReferencia)} • Medido: {BRL(m.valorMedido)} • Acumulado: {BRL(m.valorAcumulado)} • {Number(m.percentualGlobal).toFixed(1)}% global
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {m.status === "aguardando_aprovacao" && (
                    <>
                      <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs" onClick={() => aprovarMut.mutate({ id: m.id, aprovadoPor: "Responsável" })}>
                        <CheckCircle className="w-3 h-3" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { setRejeicaoModal({ id: m.id, numero: String(m.numero).padStart(2, "0") }); setMotivoRejeicao(""); }}>
                        Rejeitar
                      </Button>
                    </>
                  )}
                  {m.status === "aprovada" && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                      disabled={cancelarAprovacaoMut.isPending}
                      onClick={() => { if (confirm(`Cancelar aprovação da Medição ${String(m.numero).padStart(2, "0")}? A medição voltará para "Aguardando Aprovação" e os valores acumulados serão recalculados.`)) cancelarAprovacaoMut.mutate({ id: m.id, companyId: contrato.companyId }); }}>
                      <Undo2 className="w-3 h-3" /> Cancelar Aprovação
                    </Button>
                  )}
                  {(m.status === "aguardando_aprovacao" || m.status === "rascunho") && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                      disabled={recalcularMut.isPending}
                      onClick={() => recalcularMut.mutate({ medicaoId: m.id, companyId: contrato.companyId }, { onSuccess: (data: any) => setRecalcResult(data) })}>
                      <RefreshCw className={`w-3 h-3 ${recalcularMut.isPending ? "animate-spin" : ""}`} /> Recalcular
                    </Button>
                  )}
                  {isPreApproval && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs"
                      onClick={() => setEditMedicao({ id: m.id, periodo: m.periodo, dataReferencia: m.dataReferencia || "", observacoes: m.observacoes || "", status: m.status || "rascunho" })}>
                      <Pencil className="w-3 h-3" /> Editar
                    </Button>
                  )}
                  {m.status !== "paga" && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      disabled={excluirMedicaoMut.isPending}
                      onClick={() => { if (confirm(`Excluir Medição ${String(m.numero).padStart(2, "0")}? ${m.status === "aprovada" ? "Os valores acumulados serão revertidos." : ""}`)) excluirMedicaoMut.mutate({ id: m.id, contratoId: id, companyId: contrato.companyId }); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {m.aprovadoPor && <p className="text-xs text-gray-400 mt-2 ml-6">Aprovado por <span className="font-medium">{m.aprovadoPor}</span> em {fmtDate(m.aprovadoEm)}</p>}
              {m.alertaDivergencia && (
                <div className="mt-2 ml-6 p-2.5 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs text-orange-700 font-medium"><AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 text-orange-500" />{m.alertaDivergencia}</p>
                </div>
              )}
              {m.motivoRejeicao && (
                <div className="mt-2 ml-6 p-2 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-xs text-red-600"><AlertTriangle className="w-3 h-3 inline mr-1" />Rejeitada{(m as any).rejeitadoPor ? ` por ${(m as any).rejeitadoPor}` : ""}{(m as any).rejeitadoEm ? ` em ${fmtDate((m as any).rejeitadoEm)}` : ""}</p>
                  <p className="text-xs text-red-500 mt-0.5">{m.motivoRejeicao}</p>
                </div>
              )}
            </div>

            {isExpanded && itens.length > 0 && (<>
              <div className="border-t border-gray-100 overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="px-3 py-2 text-left w-[80px]">EAP</th>
                      <th className="px-3 py-2 text-left">Atividade</th>
                      <th className="px-2 py-2 text-center w-[45px]">Unid.</th>
                      <th className="px-2 py-2 text-right w-[55px]">Qtd.</th>
                      <th className="px-2 py-2 text-right w-[80px]">V.Unit.</th>
                      <th className="px-2 py-2 text-right w-[80px]">V.Total</th>
                      <th className="px-2 py-2 text-center w-[55px] border-l border-gray-200">Ant.%</th>
                      <th className="px-2 py-2 text-center w-[70px]">% Período</th>
                      <th className="px-2 py-2 text-center w-[55px]">Acum.%</th>
                      <th className="px-2 py-2 text-right w-[90px]">V.Período</th>
                      <th className="px-2 py-2 text-right w-[90px]">V.Acum.</th>
                      {isPreApproval && <th className="px-2 py-2 text-center w-[35px]"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const hierMap = new Map<string, any>();
                      (contrato.itensHierarchy || []).forEach((h: any) => hierMap.set(h.eapCodigo, h));

                      const sorted = [...itens].sort((a: any, b: any) => (a.eapCodigo || "").localeCompare(b.eapCodigo || "", undefined, { numeric: true }));

                      const renderedGroups = new Set<string>();
                      const rows: React.ReactNode[] = [];

                      sorted.forEach((item: any) => {
                        const eap = item.eapCodigo || "";
                        if (eap) {
                          const parts = eap.split(".");
                          for (let depth = 1; depth < parts.length; depth++) {
                            const parentEap = parts.slice(0, depth).join(".");
                            if (!renderedGroups.has(parentEap)) {
                              renderedGroups.add(parentEap);
                              const h = hierMap.get(parentEap);
                              const nivel = depth;
                              const isTopLevel = nivel === 1;
                              const colCount = isPreApproval ? 12 : 11;
                              rows.push(
                                <tr key={`grp-${parentEap}`}
                                  className={`${isTopLevel ? "bg-slate-100 border-l-[3px] border-l-amber-500" : "bg-gray-50/70"} ${isTopLevel && rows.length > 0 ? "border-t-2 border-t-gray-200" : ""}`}>
                                  <td className="px-3 py-1.5 font-mono text-gray-500 text-[11px]">{parentEap}</td>
                                  <td colSpan={colCount - 1} className="px-3 py-1.5">
                                    <div className="flex items-center" style={{ paddingLeft: `${(nivel - 1) * 16}px` }}>
                                      <ChevronDown className="w-3.5 h-3.5 text-gray-400 mr-1.5 flex-shrink-0" />
                                      <span className={`font-semibold ${isTopLevel ? "text-gray-800 text-[12px]" : "text-gray-700 text-[11px]"}`}>
                                        {h?.nome || `Nível ${parentEap}`}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }
                          }
                        }

                        const isEditingThis = editingItem?.id === item.id;
                        const percAnterior = Number(item.percentualAcumuladoAnterior || 0);
                        const percPeriodo = Number(item.percentualMedidoPeriodo || 0);
                        const percAcumulado = Number(item.percentualAvancoFisico || 0);
                        const itemDepth = eap ? eap.split(".").length : 0;

                        rows.push(
                          <tr key={item.id} className="hover:bg-blue-50/30 border-b border-gray-50">
                            <td className="px-3 py-2 font-mono text-[10px] text-gray-400 align-top">{eap}</td>
                            <td className="px-3 py-2">
                              <div style={{ paddingLeft: `${Math.max(0, (itemDepth - 1) * 16)}px` }} className="text-gray-800">
                                {item.descricao}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-center text-gray-500">{item.unidade || "-"}</td>
                            <td className="px-2 py-2 text-right text-gray-500">{Number(item.quantidade || 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right text-gray-500">{BRL(item.valorUnitario)}</td>
                            <td className="px-2 py-2 text-right text-gray-700 font-medium">{BRL(item.valorTotalItem)}</td>
                            <td className="px-2 py-2 text-center text-gray-500 border-l border-gray-100">{percAnterior.toFixed(1)}%</td>
                            <td className="px-2 py-2 text-center">
                              {isEditable && isEditingThis ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="number" step="0.1" min="0" max={100 - percAnterior}
                                    className="w-16 text-center border rounded px-1 py-0.5 text-xs"
                                    value={editingItem.valor}
                                    onChange={e => setEditingItem({ ...editingItem, valor: e.target.value })}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") {
                                        editarMedicaoItemMut.mutate({ medicaoItemId: item.id, medicaoId: m.id, companyId: contrato.companyId, percentualMedidoPeriodo: parseFloat(editingItem.valor) || 0 });
                                        setEditingItem(null);
                                      } else if (e.key === "Escape") setEditingItem(null);
                                    }}
                                    autoFocus
                                  />
                                  <span className="text-gray-400">%</span>
                                </div>
                              ) : (
                                <span
                                  className={`font-semibold ${percPeriodo > 0 ? "text-blue-700" : "text-gray-400"} ${isEditable ? "cursor-pointer hover:underline" : ""}`}
                                  onClick={() => isEditable && setEditingItem({ id: item.id, valor: percPeriodo.toFixed(1) })}
                                  title={item.editadoManualmente ? `Avanço físico real: ${Number(item.percentualFisicoReal || 0).toFixed(1)}% — Editado manualmente` : undefined}
                                >
                                  +{percPeriodo.toFixed(1)}%
                                  {item.editadoManualmente && <AlertTriangle className="w-3 h-3 inline ml-0.5 text-orange-500" />}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center font-semibold text-gray-700">{percAcumulado.toFixed(1)}%</td>
                            <td className="px-2 py-2 text-right text-gray-600">{BRL(item.valorMedidoPeriodo)}</td>
                            <td className="px-2 py-2 text-right font-semibold text-gray-900">{BRL(item.valorAcumulado)}</td>
                            {isPreApproval && (
                              <td className="px-2 py-2 text-center">
                                <button onClick={() => { if (confirm("Remover este item da medição?")) removerMedicaoItemMut.mutate({ medicaoItemId: item.id, medicaoId: m.id }); }}
                                  className="text-red-300 hover:text-red-500 p-0.5">
                                  <X className="w-3 h-3" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      });
                      return rows;
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold text-xs">
                      <td className="px-3 py-2 text-right text-gray-600" colSpan={9}>Total Período</td>
                      <td className="px-2 py-2 text-right text-blue-700">{BRL(m.valorMedido)}</td>
                      <td className="px-2 py-2 text-right text-gray-900">{BRL(m.valorAcumulado)}</td>
                      {isPreApproval && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <RetencoesSec m={m} contrato={contrato} isEditable={isEditable} />
            </>)}

            {isExpanded && itens.length === 0 && (
              <div className="border-t border-gray-100 p-4 text-center text-xs text-gray-400">
                Itens da medição não carregados. Expanda para ver detalhes.
              </div>
            )}
          </div>
        );
      })}

      {rejeicaoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRejeicaoModal(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">Rejeitar Medição #{rejeicaoModal.numero}</h3>
            <div>
              <Label className="text-xs">Motivo da rejeição</Label>
              <textarea className="w-full mt-1 border border-gray-200 rounded-lg p-3 text-sm min-h-[80px]" placeholder="Descreva o motivo..."
                value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setRejeicaoModal(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={!motivoRejeicao.trim() || rejeitarMut.isPending}
                onClick={() => { rejeitarMut.mutate({ id: rejeicaoModal.id, motivo: motivoRejeicao, rejeitadoPor: "Responsável" }); setRejeicaoModal(null); }}>
                Confirmar Rejeição
              </Button>
            </div>
          </div>
        </div>
      )}

      {recalcularMut.isPending && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
              <h3 className="font-semibold text-gray-900">Recalculando medição...</h3>
            </div>
            <p className="text-sm text-gray-500">Buscando avanços do cronograma e vinculando itens ao planejamento.</p>
            <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: "70%" }} />
            </div>
          </div>
        </div>
      )}

      {recalcResult && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setRecalcResult(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" /> Resultado do Recálculo
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600 font-medium">Valor Medido</p>
                <p className="text-lg font-bold text-blue-800">R$ {Number(recalcResult.valorMedido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">% Global</p>
                <p className="text-lg font-bold text-emerald-800">{Number(recalcResult.percentualGlobal).toFixed(1)}%</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Itens vinculados ao cronograma:</span><span className={`font-semibold ${recalcResult.vinculados > 0 ? "text-green-600" : "text-red-600"}`}>{recalcResult.vinculados}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Itens sem vínculo:</span><span className={`font-semibold ${recalcResult.naoVinculados > 0 ? "text-amber-600" : "text-green-600"}`}>{recalcResult.naoVinculados}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">EAPs no planejamento:</span><span className="font-semibold text-gray-700">{recalcResult.totalEaps}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Atividades com avanço:</span><span className="font-semibold text-gray-700">{recalcResult.totalAvancos}</span></div>
            </div>
            {recalcResult.naoVinculados > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-amber-700 mb-1">Itens não vinculados (sem EAP correspondente):</p>
                <ul className="text-xs text-amber-600 space-y-0.5">
                  {recalcResult.itens.filter((i: any) => !i.vinculado).map((i: any, idx: number) => (
                    <li key={idx}>• {i.descricao} {i.eapCodigo ? `(EAP: ${i.eapCodigo})` : "(sem código EAP)"}</li>
                  ))}
                </ul>
                <p className="text-xs text-amber-500 mt-2">Vincule esses itens ao cronograma na aba "Itens" usando o botão "Vincular EAP" para que os avanços sejam puxados automaticamente.</p>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setRecalcResult(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComparativoTab({ contrato, id }: { contrato: any; id: number }) {
  const [historyItem, setHistoryItem] = useState<{ contratoItemId: number; descricao: string } | null>(null);
  const historyQuery = trpc.terceiroContratos.historicoMedicaoItem.useQuery(
    { contratoId: id, contratoItemId: historyItem?.contratoItemId || 0 },
    { enabled: !!historyItem }
  );

  const itens = contrato.itens || [];
  const hasDivergence = itens.some((i: any) => i.divergencia !== null && Math.abs(i.divergencia) > 5);
  const valorPago = Number(contrato.valorPago || 0);

  return (
    <div className="space-y-4">
      {hasDivergence && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Divergências detectadas</p>
            <p className="text-xs text-amber-600 mt-0.5">Alguns itens têm diferença significativa ({">"}5%) entre avanço físico e financeiro.</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1e3a5f] text-white">
              <th className="px-3 py-2.5 text-left font-semibold" rowSpan={2}>Item</th>
              <th className="px-3 py-2.5 text-right font-semibold" rowSpan={2}>Valor Contrato</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" colSpan={2}>Físico</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" colSpan={2}>Medido</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" colSpan={2}>Pago</th>
              <th className="px-3 py-2 text-center font-semibold border-l border-white/20" rowSpan={2}>Δ</th>
              <th className="px-3 py-2 text-center font-semibold" rowSpan={2}></th>
            </tr>
            <tr className="bg-[#2a4a6f] text-white/80 text-[10px]">
              <th className="px-3 py-1 text-center border-l border-white/20">%</th>
              <th className="px-3 py-1 text-right">R$</th>
              <th className="px-3 py-1 text-center border-l border-white/20">%</th>
              <th className="px-3 py-1 text-right">R$</th>
              <th className="px-3 py-1 text-center border-l border-white/20">%</th>
              <th className="px-3 py-1 text-right">R$</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {itens.map((item: any) => {
              const valorTotal = Number(item.valorTotal || 0);
              const avancoFisico = item.avancoFisicoReal;
              const percFinanceiro = item.percentualFinanceiro || 0;
              const valorMedido = Number(item.valorMedidoAcumulado || 0);
              const percPago = valorTotal > 0 ? (valorPago > 0 ? Math.min((valorMedido / valorTotal) * (valorPago / Number(contrato.valorTotal || 1)), 1) * 100 : 0) : 0;
              const valorItemPago = (percPago / 100) * valorTotal;
              const div = item.divergencia;
              const hasDivItem = div !== null && Math.abs(div) > 5;

              return (
                <tr key={item.id} className={`hover:bg-blue-50/30 ${hasDivItem ? "bg-amber-50/40" : ""}`}>
                  <td className="px-3 py-2 text-gray-800 max-w-[200px] truncate" title={item.descricao}>{item.descricao}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{BRL(valorTotal)}</td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    {avancoFisico !== null ? (
                      <span className="font-medium text-green-700">{avancoFisico.toFixed(1)}%</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {avancoFisico !== null ? BRL((avancoFisico / 100) * valorTotal) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    <span className="font-medium text-blue-700">{percFinanceiro.toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">{BRL(valorMedido)}</td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    <span className="text-gray-500">{percPago.toFixed(1)}%</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">{BRL(valorItemPago)}</td>
                  <td className="px-3 py-2 text-center border-l border-gray-100">
                    {div !== null ? (
                      <span className={`font-semibold ${Math.abs(div) > 5 ? (div > 0 ? "text-red-600" : "text-amber-600") : "text-green-600"}`}>
                        {div > 0 ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : div < 0 ? <TrendingDown className="w-3 h-3 inline mr-0.5" /> : <Minus className="w-3 h-3 inline mr-0.5" />}
                        {div > 0 ? "+" : ""}{div.toFixed(1)}%
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => setHistoryItem({ contratoItemId: item.id, descricao: item.descricao })}
                      className="text-gray-400 hover:text-blue-600 p-0.5" title="Histórico">
                      <History className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold text-xs">
              <td className="px-3 py-2 text-right">Total</td>
              <td className="px-3 py-2 text-right">{BRL(contrato.valorTotal)}</td>
              <td className="px-3 py-2" colSpan={2}></td>
              <td className="px-3 py-2 text-center border-l border-gray-100">{Number(contrato.percentualMedidoGlobal || 0).toFixed(1)}%</td>
              <td className="px-3 py-2 text-right">{BRL(contrato.valorMedidoAcumulado)}</td>
              <td className="px-3 py-2 text-center border-l border-gray-100"></td>
              <td className="px-3 py-2 text-right">{BRL(valorPago)}</td>
              <td className="px-3 py-2" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {historyItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setHistoryItem(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-900">Histórico de Medição</h3>
                <p className="text-xs text-gray-500 mt-0.5">{historyItem.descricao}</p>
              </div>
              <button onClick={() => setHistoryItem(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            {historyQuery.isLoading ? (
              <div className="py-6 text-center text-gray-400 text-sm">Carregando...</div>
            ) : historyQuery.data && historyQuery.data.length > 0 ? (
              <div className="space-y-2">
                {historyQuery.data.map((h: any, idx: number) => {
                  const st = STATUS_MEDICAO[h.status || "rascunho"] || STATUS_MEDICAO.rascunho;
                  return (
                    <div key={idx} className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg">
                      <div className="flex-shrink-0 w-16 text-center">
                        <span className="text-xs font-bold text-gray-700">Med #{h.numero}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-500">{h.periodo}</span>
                          <Badge className={`text-[10px] border ${st.cls}`}>{st.label}</Badge>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs">
                          <span className="text-blue-700 font-medium">+{h.percentualPeriodo.toFixed(1)}%</span>
                          <span className="text-gray-600">= {h.percentualAcumulado.toFixed(1)}% acum.</span>
                          <span className="text-gray-500">{BRL(h.valorPeriodo)}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 w-20">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(h.percentualAcumulado, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-gray-400 text-sm">Nenhuma medição encontrada para este item.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RetencoesSec({ m, contrato, isEditable }: { m: any; contrato: any; isEditable: boolean }) {
  const [editingDescontos, setEditingDescontos] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [descontos, setDescontos] = useState(Number(m.descontos || 0));
  const [obsRetencao, setObsRetencao] = useState(m.observacoesRetencao || "");
  const [pdfLoading, setPdfLoading] = useState(false);

  const [percConfig, setPercConfig] = useState({
    percISS: Number(contrato.percISS || 0),
    percINSS: Number(contrato.percINSS || 0),
    percIRRF: Number(contrato.percIRRF || 0),
    percOutrasRetencoes: Number(contrato.percOutrasRetencoes || 0),
    percRetencaoTecnica: Number(contrato.percRetencaoTecnica || 0),
  });

  const utils = trpc.useUtils();
  const salvarRetMut = trpc.terceiroContratos.salvarRetencoes.useMutation({
    onSuccess: () => { toast.success("Descontos salvos"); setEditingDescontos(false); utils.terceiroContratos.getContrato.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const salvarConfigMut = trpc.terceiroContratos.salvarRetencaoConfig.useMutation({
    onSuccess: () => { toast.success("Configuração de retenções salva"); setEditingConfig(false); utils.terceiroContratos.getContrato.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const valorBruto = Number(m.valorMedido || 0);
  const pISS = Number(contrato.percISS || 0);
  const pINSS = Number(contrato.percINSS || 0);
  const pIRRF = Number(contrato.percIRRF || 0);
  const pOutras = Number(contrato.percOutrasRetencoes || 0);
  const pRetTecnica = Number(contrato.percRetencaoTecnica || 0);

  const retISS = valorBruto * pISS / 100;
  const retINSS = valorBruto * pINSS / 100;
  const retIRRF = valorBruto * pIRRF / 100;
  const retOutras = valorBruto * pOutras / 100;
  const retTecnica = valorBruto * pRetTecnica / 100;
  const totalRet = retISS + retINSS + retIRRF + retOutras + retTecnica;
  const valorLiquido = valorBruto - totalRet - descontos;

  const retTecnicaAcumulada = pRetTecnica > 0
    ? (contrato.medicoes || [])
        .filter((med: any) => med.status === "aprovada" || med.status === "paga")
        .reduce((acc: number, med: any) => acc + Number(med.valorMedido || 0) * pRetTecnica / 100, 0)
    : 0;

  const handleSaveDescontos = () => {
    salvarRetMut.mutate({
      medicaoId: m.id,
      companyId: contrato.companyId,
      retencaoISS: retISS,
      retencaoINSS: retINSS,
      retencaoIRRF: retIRRF,
      outrasRetencoes: retOutras,
      retencaoTecnica: retTecnica,
      descontos,
      observacoesRetencao: obsRetencao,
    });
  };

  const handlePdf = async () => {
    setPdfLoading(true);
    try {
      const inputPayload = { json: { medicaoId: m.id, companyId: contrato.companyId } };
      const res = await fetch(`/api/trpc/terceiroContratos.gerarPdfMedicao?input=${encodeURIComponent(JSON.stringify(inputPayload))}`);
      const json = await res.json();
      const data = json?.result?.data?.json || json?.result?.data;
      if (!data?.base64) throw new Error("PDF não gerado");
      const byteChars = atob(data.base64);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || "medicao.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso");
    } catch (e: any) { toast.error(e.message || "Erro ao gerar PDF"); }
    setPdfLoading(false);
  };

  const hasPerc = pISS > 0 || pINSS > 0 || pIRRF > 0 || pOutras > 0 || pRetTecnica > 0;

  return (
    <div className="border-t border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Retenções e Descontos</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handlePdf} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />} Gerar PDF
          </Button>
        </div>
      </div>

      {!hasPerc && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          Nenhum percentual de retenção configurado neste contrato.
          <button className="ml-2 text-amber-900 font-semibold underline" onClick={() => setEditingConfig(true)}>
            Configurar agora
          </button>
        </div>
      )}

      {editingConfig && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-600 mb-1">Configuração de Retenções do Contrato (%)</div>
          <div className="grid grid-cols-5 gap-3">
            {[
              { key: "percISS", label: "ISS %" },
              { key: "percINSS", label: "INSS %" },
              { key: "percIRRF", label: "IRRF %" },
              { key: "percOutrasRetencoes", label: "Outras %" },
              { key: "percRetencaoTecnica", label: "Ret. Técnica %" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-[10px] text-gray-500">{f.label}</Label>
                <Input type="number" step="0.01" min="0" max="100" className="text-xs h-7"
                  value={(percConfig as any)[f.key]}
                  onChange={e => setPercConfig(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingConfig(false)}>Cancelar</Button>
            <Button size="sm" className="text-xs h-7 gap-1" disabled={salvarConfigMut.isPending}
              onClick={() => salvarConfigMut.mutate({ contratoId: contrato.id, companyId: contrato.companyId, ...percConfig })}>
              <Save className="w-3 h-3" /> Salvar Config
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <div className="bg-gray-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px]">Valor Bruto</div>
          <div className="font-semibold text-gray-900">{BRL(valorBruto)}</div>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px] flex items-center gap-1">
            Retenções
            {hasPerc && !editingConfig && (
              <button className="text-gray-300 hover:text-gray-500" onClick={() => setEditingConfig(true)} title="Configurar %">
                <Settings className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="font-semibold text-red-600">{totalRet > 0 ? `- ${BRL(totalRet)}` : BRL(0)}</div>
          {hasPerc && (
            <div className="text-[10px] text-gray-400 mt-0.5 space-y-px">
              {pISS > 0 && <div>ISS {pISS}%: {BRL(retISS)}</div>}
              {pINSS > 0 && <div>INSS {pINSS}%: {BRL(retINSS)}</div>}
              {pIRRF > 0 && <div>IRRF {pIRRF}%: {BRL(retIRRF)}</div>}
              {pOutras > 0 && <div>Outras {pOutras}%: {BRL(retOutras)}</div>}
              {pRetTecnica > 0 && <div>Ret. Técnica {pRetTecnica}%: {BRL(retTecnica)} *</div>}
            </div>
          )}
        </div>
        <div className="bg-orange-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px] flex items-center gap-1">
            Descontos
            {isEditable && !editingDescontos && (
              <button className="text-gray-300 hover:text-gray-500" onClick={() => setEditingDescontos(true)} title="Editar descontos">
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
          {editingDescontos ? (
            <div className="flex items-center gap-1 mt-0.5">
              <Input type="number" step="0.01" min="0" className="text-xs h-6 w-24"
                value={descontos}
                onChange={e => setDescontos(parseFloat(e.target.value) || 0)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") handleSaveDescontos();
                  if (e.key === "Escape") setEditingDescontos(false);
                }}
              />
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingDescontos(false)}>
                <X className="w-3 h-3" />
              </Button>
              <Button size="sm" className="h-6 px-2 text-[10px]" disabled={salvarRetMut.isPending} onClick={handleSaveDescontos}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="font-semibold text-orange-600">{descontos > 0 ? `- ${BRL(descontos)}` : BRL(0)}</div>
          )}
        </div>
        <div className="bg-blue-50 rounded-lg p-2.5">
          <div className="text-gray-400 text-[10px]">Valor Líquido</div>
          <div className="font-bold text-blue-700">{BRL(valorLiquido)}</div>
        </div>
        {pRetTecnica > 0 && (
          <div className="col-span-5 bg-amber-50 border border-amber-200 rounded p-2 text-[10px] text-amber-700 space-y-0.5">
            <div className="font-semibold">* Retenção Técnica ({pRetTecnica}%) — liberada somente após a última medição do contrato.</div>
            <div>Esta medição: {BRL(retTecnica)} | Acumulado aprovado no contrato: <span className="font-bold">{BRL(retTecnicaAcumulada)}</span></div>
          </div>
        )}
        {obsRetencao && (
          <div className="col-span-5 text-[10px] text-gray-400">Obs.: {obsRetencao}</div>
        )}
      </div>
    </div>
  );
}

function ItemsTreeTable({ contrato, id, pct, removerItemMut }: { contrato: any; id: number; pct: number; removerItemMut: any }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const hierarchy: any[] = (contrato as any).itensHierarchy || [];
  const hasHierarchy = hierarchy.length > 0;

  const toggle = (eap: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(eap)) next.delete(eap);
      else next.add(eap);
      return next;
    });
  };

  const isHidden = (eap: string) => {
    if (!eap) return false;
    const parts = eap.split(".");
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join(".");
      if (collapsed.has(ancestor)) return true;
    }
    return false;
  };

  type Row = { type: "grupo"; eapCodigo: string; nome: string; nivel: number }
           | { type: "item"; item: any; nivel: number };

  const buildRows = (): Row[] => {
    if (!hasHierarchy) {
      return contrato.itens.map((item: any) => ({ type: "item" as const, item, nivel: 0 }));
    }

    const itemsByEap = new Map<string, any[]>();
    const itemsNoEap: any[] = [];
    for (const it of contrato.itens) {
      const eap = (it as any).eapCodigo;
      if (eap) {
        if (!itemsByEap.has(eap)) itemsByEap.set(eap, []);
        itemsByEap.get(eap)!.push(it);
      } else {
        itemsNoEap.push(it);
      }
    }

    const allEaps = [...new Set([...hierarchy.map((h: any) => h.eapCodigo), ...contrato.itens.map((it: any) => it.eapCodigo).filter(Boolean)])] as string[];
    allEaps.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const rows: Row[] = [];
    const groupsPlaced = new Set<string>();

    for (const eap of allEaps) {
      const grupo = hierarchy.find((h: any) => h.eapCodigo === eap);
      if (grupo && !groupsPlaced.has(eap)) {
        groupsPlaced.add(eap);
        rows.push({ type: "grupo", eapCodigo: grupo.eapCodigo, nome: grupo.nome, nivel: grupo.nivel });
      }
      const items = itemsByEap.get(eap);
      if (items) {
        for (const it of items) {
          rows.push({ type: "item", item: it, nivel: it.atividadeNivel ?? (eap ? eap.split(".").length : 0) });
        }
      }
    }

    for (const it of itemsNoEap) {
      rows.push({ type: "item" as const, item: it, nivel: 0 });
    }

    return rows;
  };

  const rows = buildRows();

  const minNivel = hasHierarchy
    ? Math.min(...hierarchy.map((h: any) => h.nivel ?? h.eapCodigo.split(".").length), ...contrato.itens.map((it: any) => it.eapCodigo ? it.eapCodigo.split(".").length : 99))
    : 0;

  const hasChildren = (eap: string) => {
    return rows.some(r => {
      const re = r.type === "grupo" ? r.eapCodigo : (r.item?.eapCodigo || "");
      return re !== eap && re.startsWith(eap + ".");
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1e3a5f] text-white text-xs">
            <th className="px-4 py-2.5 text-left font-semibold w-[130px]">Item</th>
            <th className="px-4 py-2.5 text-left font-semibold">Descrição</th>
            <th className="px-4 py-2.5 text-center font-semibold w-[60px]">Un</th>
            <th className="px-4 py-2.5 text-right font-semibold w-[100px]">Qtd</th>
            <th className="px-4 py-2.5 text-right font-semibold w-[100px]">Total</th>
            <th className="px-4 py-2.5 text-center font-semibold w-[60px]">%</th>
            <th className="px-4 py-2.5 text-center font-semibold w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.type === "grupo") {
              if (isHidden(row.eapCodigo)) return null;
              const depth = (row.nivel ?? row.eapCodigo.split(".").length) - minNivel;
              const indent = depth * 24;
              const isCollapsed = collapsed.has(row.eapCodigo);
              const expandable = hasChildren(row.eapCodigo);
              return (
                <tr key={`g-${row.eapCodigo}`} className="border-b border-gray-100 bg-gray-50/50 hover:bg-gray-100/50 cursor-pointer" onClick={() => expandable && toggle(row.eapCodigo)}>
                  <td className="px-4 py-2">
                    <div style={{ paddingLeft: indent }} className="flex items-center gap-1">
                      {expandable && (
                        isCollapsed
                          ? <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      )}
                      <span className="font-mono text-xs font-semibold text-gray-700">{row.eapCodigo}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-bold text-gray-900 uppercase text-xs tracking-wide">{row.nome}:</span>
                  </td>
                  <td colSpan={5} />
                </tr>
              );
            }

            const item = row.item;
            const eap = item.eapCodigo || "";
            if (isHidden(eap)) return null;

            const depth = hasHierarchy ? ((row.nivel ?? 0) - minNivel) * 24 : 0;
            return (
              <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                <td className="px-4 py-2">
                  <div style={{ paddingLeft: Math.max(0, depth) }}>
                    <span className="font-mono text-xs text-gray-500">{eap || "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className="text-gray-800">{item.descricao}</span>
                </td>
                <td className="px-4 py-2 text-center text-gray-500">{item.unidade || "—"}</td>
                <td className="px-4 py-2 text-right text-gray-700 font-mono">{Number(item.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-right font-semibold text-gray-900">{BRL(item.valorTotal)}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-xs font-semibold ${Number(item.percentualMedidoAcumulado) >= 100 ? "text-green-700" : Number(item.percentualMedidoAcumulado) > 0 ? "text-blue-700" : "text-gray-400"}`}>
                    {Number(item.percentualMedidoAcumulado).toFixed(1)}%
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <button onClick={(e) => { e.stopPropagation(); removerItemMut.mutate({ id: item.id, contratoId: id }); }} className="text-red-300 hover:text-red-500 p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-gray-50 border-t border-gray-200">
            <td colSpan={4} className="px-4 py-2.5 text-right font-semibold text-gray-700 text-xs">Total</td>
            <td className="px-4 py-2.5 text-right font-bold text-gray-900">{BRL(contrato.valorTotal)}</td>
            <td className="px-4 py-2.5 text-center font-bold text-blue-700 text-xs">{pct.toFixed(1)}%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
