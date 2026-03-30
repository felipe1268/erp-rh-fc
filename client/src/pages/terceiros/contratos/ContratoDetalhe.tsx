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
  FileEdit, Save, Clock, RefreshCw, History, ExternalLink, Trash2, Pencil, FolderOpen
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

type Tab = "itens" | "medicoes" | "documentos" | "documento";

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
    onSuccess: () => { toast.success("Medição gerada com base no avanço físico!"); setShowGerarMedicao(false); setTab("medicoes"); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const aprovarMut = trpc.terceiroContratos.aprovarMedicao.useMutation({
    onSuccess: () => { toast.success("Medição aprovada!"); utils.terceiroContratos.getContrato.invalidate({ id }); },
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
          {(["itens", "medicoes", "documentos", "documento"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "itens" ? `Itens (${contrato.itens.length})` :
               t === "medicoes" ? `Medições (${contrato.medicoes.length})` :
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
            ) : (() => {
              const hierarchy: any[] = (contrato as any).itensHierarchy || [];
              const hasEap = contrato.itens.some((it: any) => it.eapCodigo);
              const hasDates = contrato.itens.some((it: any) => it.atividadeDataInicio || it.atividadeDataFim) || hierarchy.some((h: any) => h.dataInicio || h.dataFim);
              const hasHierarchy = hierarchy.length > 0;

              const buildRows = () => {
                if (!hasHierarchy) {
                  return contrato.itens.map((item: any) => ({ type: "item" as const, item }));
                }

                type Row = { type: "grupo"; eapCodigo: string; nome: string; nivel: number; dataInicio: string | null; dataFim: string | null }
                       | { type: "item"; item: any; nivel: number };

                const allEaps = [...hierarchy.map(h => h.eapCodigo), ...contrato.itens.map((it: any) => it.eapCodigo).filter(Boolean)];
                allEaps.sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));

                const rows: Row[] = [];
                const groupsPlaced = new Set<string>();
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

                const uniqueEaps = [...new Set(allEaps)] as string[];
                uniqueEaps.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

                for (const eap of uniqueEaps) {
                  const grupo = hierarchy.find((h: any) => h.eapCodigo === eap);
                  if (grupo && !groupsPlaced.has(eap)) {
                    groupsPlaced.add(eap);
                    rows.push({ type: "grupo", eapCodigo: grupo.eapCodigo, nome: grupo.nome, nivel: grupo.nivel, dataInicio: grupo.dataInicio, dataFim: grupo.dataFim });
                  }
                  const items = itemsByEap.get(eap);
                  if (items) {
                    for (const it of items) {
                      rows.push({ type: "item", item: it, nivel: (it.atividadeNivel ?? (eap ? eap.split(".").length : 0)) });
                    }
                  }
                }

                for (const it of itemsNoEap) {
                  rows.push({ type: "item" as const, item: it, nivel: 0 });
                }

                return rows;
              };

              const rows = buildRows();

              return (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="px-4 py-2 text-left">EAP</th>
                        <th className="px-4 py-2 text-left">Descrição</th>
                        {hasDates && <th className="px-4 py-2 text-center">Início</th>}
                        {hasDates && <th className="px-4 py-2 text-center">Término</th>}
                        <th className="px-4 py-2 text-right">Qtd</th>
                        <th className="px-4 py-2 text-right">Unit.</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-right">Medido</th>
                        <th className="px-4 py-2 text-center">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, idx) => {
                        if (row.type === "grupo") {
                          const indent = Math.max(0, (row.nivel || 1) - 1) * 16;
                          return (
                            <tr key={`g-${row.eapCodigo}`} className="bg-blue-50/60">
                              <td className="px-4 py-2 font-mono text-xs font-bold text-blue-700">{row.eapCodigo}</td>
                              <td className="px-4 py-2" colSpan={1}>
                                <div style={{ paddingLeft: indent }} className="flex items-center gap-1.5">
                                  <FolderOpen className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                  <span className="font-semibold text-blue-900">{row.nome}</span>
                                </div>
                              </td>
                              {hasDates && (
                                <td className="px-4 py-2 text-center text-xs text-blue-600">{fmtDate(row.dataInicio)}</td>
                              )}
                              {hasDates && (
                                <td className="px-4 py-2 text-center text-xs text-blue-600">{fmtDate(row.dataFim)}</td>
                              )}
                              <td colSpan={4} />
                              <td />
                            </tr>
                          );
                        }

                        const item = row.item;
                        const nivel = (row as any).nivel ?? 0;
                        const indent = Math.max(0, nivel - 1) * 16 + (hasEap ? 20 : 0);
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-mono text-xs text-gray-400">{item.eapCodigo || "—"}</td>
                            <td className="px-4 py-2">
                              <div style={{ paddingLeft: indent }}>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium text-gray-900">
                                    {item.eapCodigo && <span className="text-blue-600 font-mono text-xs mr-1.5">[{item.eapCodigo}]</span>}
                                    {item.descricao}
                                  </span>
                                  {item.origemPath && (
                                    <span className="text-[11px] text-gray-400 leading-tight">
                                      <span className="text-gray-300 mr-1">Origem:</span>{item.origemPath}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            {hasDates && (
                              <td className="px-4 py-2 text-center text-xs text-gray-500">{fmtDate(item.atividadeDataInicio)}</td>
                            )}
                            {hasDates && (
                              <td className="px-4 py-2 text-center text-xs text-gray-500">{fmtDate(item.atividadeDataFim)}</td>
                            )}
                            <td className="px-4 py-2 text-right text-gray-600">{Number(item.quantidade).toFixed(2)} {item.unidade}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{BRL(item.valorUnitario)}</td>
                            <td className="px-4 py-2 text-right font-semibold">{BRL(item.valorTotal)}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`font-semibold ${Number(item.percentualMedidoAcumulado) >= 100 ? "text-green-700" : "text-blue-700"}`}>
                                {Number(item.percentualMedidoAcumulado).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button onClick={() => removerItemMut.mutate({ id: item.id, contratoId: id })} className="text-red-400 hover:text-red-600 p-1">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td colSpan={hasDates ? 6 : 4} className="px-4 py-2 text-right text-gray-700">Total</td>
                        <td className="px-4 py-2 text-right">{BRL(contrato.valorTotal)}</td>
                        <td className="px-4 py-2 text-right text-blue-700">{pct.toFixed(1)}%</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab: Medições */}
        {tab === "medicoes" && (
          <div className="space-y-3">
            {contrato.medicoes.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">
                <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma medição. Use o botão "Gerar Medição" para criar a primeira.
              </div>
            ) : contrato.medicoes.map(m => {
              const st = STATUS_MEDICAO[m.status || "rascunho"] || STATUS_MEDICAO.rascunho;
              return (
                <div key={m.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">Medição #{m.numero} — {m.periodo}</span>
                        <Badge className={`text-xs border ${st.cls}`}>{st.label}</Badge>
                        {m.geradoAutomaticamente && <Badge className="text-xs border bg-purple-100 text-purple-700 border-purple-200"><Zap className="w-3 h-3 mr-1" />Auto</Badge>}
                      </div>
                      <div className="text-xs text-gray-500">
                        Ref: {fmtDate(m.dataReferencia)} • Medido: {BRL(m.valorMedido)} • Acumulado: {BRL(m.valorAcumulado)} • {Number(m.percentualGlobal).toFixed(1)}% global
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {m.status === "aguardando_aprovacao" && (
                        <>
                          <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-xs" onClick={() => aprovarMut.mutate({ id: m.id, aprovadoPor: "Responsável" })}>
                            <CheckCircle className="w-3 h-3" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50">
                            Rejeitar
                          </Button>
                        </>
                      )}
                      {m.status !== "paga" && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1 text-xs"
                            onClick={() => setEditMedicao({ id: m.id, periodo: m.periodo, dataReferencia: m.dataReferencia || "", observacoes: m.observacoes || "", status: m.status || "rascunho" })}>
                            <Pencil className="w-3 h-3" /> Editar
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={excluirMedicaoMut.isPending}
                            onClick={() => { if (confirm(`Excluir Medição #${m.numero}? ${m.status === "aprovada" ? "Os valores acumulados serão revertidos." : ""}`)) excluirMedicaoMut.mutate({ id: m.id, contratoId: id, companyId: contrato.companyId }); }}>
                            <Trash2 className="w-3 h-3" /> Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {m.aprovadoPor && <p className="text-xs text-gray-400 mt-2">Aprovado por {m.aprovadoPor} em {fmtDate(m.aprovadoEm)}</p>}
                  {m.motivoRejeicao && <p className="text-xs text-red-500 mt-2">Motivo da rejeição: {m.motivoRejeicao}</p>}
                </div>
              );
            })}
          </div>
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
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-bold mb-4">Gerar Medição Automática</h2>
              <p className="text-sm text-gray-500 mb-4">
                O sistema vai buscar o avanço físico atual de cada atividade no planejamento e calcular o valor a medir automaticamente.
              </p>
              <div className="space-y-3">
                <div>
                  <Label className="text-sm">Período de Referência (AAAA-MM)</Label>
                  <Input className="mt-1" value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="2025-03" />
                </div>
                {contrato.docsComPendencia > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-700 text-xs">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Existem {contrato.docsComPendencia} documento(s) pendentes. A medição será gerada mas poderá ser bloqueada para pagamento.
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-5 justify-end">
                <Button variant="outline" onClick={() => setShowGerarMedicao(false)}>Cancelar</Button>
                <Button className="bg-blue-600 hover:bg-blue-700" disabled={gerarMedicaoMut.isPending}
                  onClick={() => gerarMedicaoMut.mutate({ contratoId: id, companyId: contrato.companyId, periodo, criadoPor: "Responsável" })}>
                  <Zap className="w-4 h-4 mr-2" />{gerarMedicaoMut.isPending ? "Gerando..." : "Gerar Medição"}
                </Button>
              </div>
            </div>
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
