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
  ChevronRight, Building2, Calendar, DollarSign, FileText,
  Zap, ClipboardCheck, X
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

type Tab = "itens" | "medicoes" | "documentos";

export default function ContratoDetalhe() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/terceiros/contratos/:id");
  const id = parseInt(params?.id || "0");
  const [tab, setTab] = useState<Tab>("itens");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showGerarMedicao, setShowGerarMedicao] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [newItem, setNewItem] = useState({ descricao: "", unidade: "m²", quantidade: "1", valorUnitario: "0", eapCodigo: "", planejamentoAtividadeId: "" });
  const [newDoc, setNewDoc] = useState({ tipo: "INSS", descricao: "", competencia: "", dataVencimento: "", bloqueiaPagemento: false });

  const utils = trpc.useUtils();
  const { data: contrato, isLoading } = trpc.terceiroContratos.getContrato.useQuery({ id }, { enabled: id > 0 });

  const adicionarItemMut = trpc.terceiroContratos.adicionarItem.useMutation({
    onSuccess: () => { toast.success("Item adicionado!"); setShowAddItem(false); setNewItem({ descricao: "", unidade: "m²", quantidade: "1", valorUnitario: "0", eapCodigo: "", planejamentoAtividadeId: "" }); utils.terceiroContratos.getContrato.invalidate({ id }); },
    onError: (e) => toast.error(e.message),
  });

  const removerItemMut = trpc.terceiroContratos.removerItem.useMutation({
    onSuccess: () => { toast.success("Item removido"); utils.terceiroContratos.getContrato.invalidate({ id }); },
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

  if (isLoading) return <DashboardLayout><div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div></DashboardLayout>;
  if (!contrato) return <DashboardLayout><div className="p-8 text-center text-gray-400">Contrato não encontrado</div></DashboardLayout>;

  const pct = contrato.percentualMedidoGlobal || 0;
  const pctPago = Number(contrato.valorTotal) > 0 ? (Number(contrato.valorPago) / Number(contrato.valorTotal)) * 100 : 0;

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
              {contrato.dataInicio && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(contrato.dataInicio)} → {fmtDate(contrato.dataTermino)}</span>}
            </div>
          </div>
          <Button onClick={() => setShowGerarMedicao(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Zap className="w-4 h-4" /> Gerar Medição
          </Button>
        </div>

        {/* Resumo financeiro */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Valor Contratado", value: BRL(contrato.valorTotal), color: "text-gray-900" },
            { label: "Medido Acumulado", value: BRL(contrato.valorMedidoAcumulado), color: "text-blue-700" },
            { label: "Total Pago", value: BRL(contrato.valorPago), color: "text-green-700" },
            { label: "Saldo a Liberar", value: BRL(contrato.saldoALiberar), color: contrato.saldoALiberar > 0 ? "text-yellow-700" : "text-gray-400" },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className={`text-base font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

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
          {(["itens", "medicoes", "documentos"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "itens" ? `Itens (${contrato.itens.length})` : t === "medicoes" ? `Medições (${contrato.medicoes.length})` : `Documentos (${contrato.documentos.length})`}
            </button>
          ))}
        </div>

        {/* Tab: Itens */}
        {tab === "itens" && (
          <div className="space-y-3">
            <div className="flex justify-end">
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
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="px-4 py-2 text-left">EAP</th>
                      <th className="px-4 py-2 text-left">Descrição</th>
                      <th className="px-4 py-2 text-right">Qtd</th>
                      <th className="px-4 py-2 text-right">Unit.</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Medido</th>
                      <th className="px-4 py-2 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {contrato.itens.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-gray-400">{item.eapCodigo || "—"}</td>
                        <td className="px-4 py-2 font-medium text-gray-900">{item.descricao}</td>
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
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-semibold">
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-right text-gray-700">Total</td>
                      <td className="px-4 py-2 text-right">{BRL(contrato.valorTotal)}</td>
                      <td className="px-4 py-2 text-right text-blue-700">{pct.toFixed(1)}%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
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
      </div>
    </DashboardLayout>
  );
}
