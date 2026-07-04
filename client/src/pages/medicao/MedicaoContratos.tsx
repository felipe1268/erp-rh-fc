import React, { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Loader2, FileText, Building2, DollarSign,
  ChevronRight, Settings, CheckCircle2, AlertCircle, TrendingUp,
  Percent, ClipboardList, StickyNote, Pencil, Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const n = (v: unknown) => parseFloat(String(v || "0")) || 0;
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBrlInput(raw: string | number | null | undefined): string {
  const num = parseFloat(String(raw || "").replace(",", "."));
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBrlInput(formatted: string): string {
  const clean = formatted.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  if (isNaN(num)) return "";
  return num.toFixed(2);
}

function handleBrlChange(
  e: React.ChangeEvent<HTMLInputElement>,
  setter: (v: string) => void
) {
  const raw = e.target.value.replace(/[^\d,]/g, "");
  setter(raw);
}

function StatusBadge({ status }: { status: string }) {
  if (status === "encerrado")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"><AlertCircle className="h-3 w-3" />Encerrado</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-3 w-3" />Ativo</span>;
}

function CriterioTag({ criterio }: { criterio: string }) {
  if (criterio === "parcela_fixa")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700">Parcela Fixa</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Avanço Físico</span>;
}

export default function MedicaoContratos() {
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;

  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  const [form, setForm] = useState({
    projetoId: "",
    criterio: "avanco_fisico",
    valorTotalContrato: "",
    percentualSinal: "",
    valorSinalRecebido: "",
    percentualRetencao: "",
    valorMinimoFd: "",
    observacoes: "",
  });

  const utils = trpc.useUtils();
  const { data: contratos = [], isLoading } = trpc.medicao.listarContratos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const { data: projetos = [] } = trpc.planejamento.listarProjetos.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    criterio: "avanco_fisico",
    valorTotalContrato: "",
    percentualSinal: "",
    valorSinalRecebido: "",
    percentualRetencao: "",
    valorMinimoFd: "",
    observacoes: "",
    status: "ativo",
  });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const criarMutation = trpc.medicao.criarContrato.useMutation({
    onSuccess: () => {
      utils.medicao.listarContratos.invalidate();
      setModalAberto(false);
      resetForm();
    },
  });

  const atualizarMutation = trpc.medicao.atualizarContrato.useMutation({
    onSuccess: () => {
      utils.medicao.listarContratos.invalidate();
      setEditId(null);
    },
  });

  const excluirMutation = trpc.medicao.excluirContrato.useMutation({
    onSuccess: () => {
      utils.medicao.listarContratos.invalidate();
      setConfirmDelete(null);
    },
  });

  function abrirEdicao(c: any, e: React.MouseEvent) {
    e.stopPropagation();
    setEditForm({
      criterio: c.criterio || "avanco_fisico",
      valorTotalContrato: formatBrlInput(c.valorTotalContrato),
      percentualSinal: c.percentualSinal ? String(n(c.percentualSinal)) : "",
      valorSinalRecebido: formatBrlInput(c.valorSinalRecebido),
      percentualRetencao: c.percentualRetencao ? String(n(c.percentualRetencao)) : "",
      valorMinimoFd: formatBrlInput(c.valorMinimoFd),
      observacoes: c.observacoes || "",
      status: c.status || "ativo",
    });
    setEditId(c.id);
  }

  function salvarEdicao() {
    if (!editId) return;
    atualizarMutation.mutate({
      id: editId,
      companyId,
      criterio: editForm.criterio as "avanco_fisico" | "parcela_fixa",
      valorTotalContrato: parseBrlInput(editForm.valorTotalContrato) || undefined,
      percentualSinal: editForm.percentualSinal || undefined,
      valorSinalRecebido: parseBrlInput(editForm.valorSinalRecebido) || undefined,
      percentualRetencao: editForm.percentualRetencao || null,
      valorMinimoFd: parseBrlInput(editForm.valorMinimoFd) || null,
      observacoes: editForm.observacoes || null,
      status: editForm.status as "ativo" | "encerrado",
    });
  }

  function resetForm() {
    setForm({
      projetoId: "",
      criterio: "avanco_fisico",
      valorTotalContrato: "",
      percentualSinal: "",
      valorSinalRecebido: "",
      percentualRetencao: "",
      valorMinimoFd: "",
      observacoes: "",
    });
  }

  async function handleProjetoSelect(projetoId: string) {
    const projeto = (projetos as any[]).find((p: any) => String(p.id) === projetoId);
    let autoValor = "";
    if (projeto) {
      const negociado = parseFloat(projeto.orcamentoValorNegociado || "0");
      const totalVenda = parseFloat(projeto.orcamentoTotalVenda || "0");
      const valor = negociado > 0 ? negociado : totalVenda > 0 ? totalVenda : 0;
      if (valor > 0) autoValor = formatBrlInput(valor);
    }

    let autoCriterio = "avanco_fisico";
    let autoSinalPct = "";
    let autoSinalValor = "";
    let autoRetencaoPct = "";
    let autoFdValor = "";

    try {
      const config = await utils.medicao.getProjetoMedicaoConfig.fetch({ projetoId: parseInt(projetoId) });
      if (config) {
        if (config.tipoMedicao === "parcelas") autoCriterio = "parcela_fixa";
        // Rev. 2891 — "Valor Mínimo para FD" vem da config de Medição do Planejamento.
        const fdV = parseFloat(config.fdValor || "0");
        if (fdV > 0) autoFdValor = formatBrlInput(fdV);
        const sP = parseFloat(config.sinalPct || "0");
        if (sP > 0) autoSinalPct = String(sP);
        const sinalV = parseFloat(config.sinalValor || "0");
        const entrada = parseFloat(config.entrada || "0");
        if (sinalV > 0) {
          autoSinalValor = formatBrlInput(sinalV);
        } else if (entrada > 0) {
          autoSinalValor = formatBrlInput(entrada);
        } else if (sP > 0) {
          const valorBase = parseBrlInput(autoValor);
          const vb = parseFloat(valorBase || "0");
          if (vb > 0) {
            const sinalCalc = (sP / 100) * vb;
            autoSinalValor = formatBrlInput(sinalCalc);
          }
        }
        const rP = parseFloat(config.retencaoPct || "0");
        if (rP > 0) autoRetencaoPct = String(rP);
      }
    } catch {}

    setForm(f => ({
      ...f,
      projetoId,
      valorTotalContrato: autoValor,
      criterio: autoCriterio,
      percentualSinal: autoSinalPct,
      valorSinalRecebido: autoSinalValor,
      percentualRetencao: autoRetencaoPct,
      valorMinimoFd: autoFdValor,
    }));
  }

  function handleCriar() {
    if (!form.projetoId) return;
    criarMutation.mutate({
      companyId,
      projetoId: parseInt(form.projetoId),
      criterio: form.criterio as "avanco_fisico" | "parcela_fixa",
      valorTotalContrato: parseBrlInput(form.valorTotalContrato) || undefined,
      percentualSinal: form.percentualSinal || undefined,
      valorSinalRecebido: parseBrlInput(form.valorSinalRecebido) || undefined,
      percentualRetencao: form.percentualRetencao || null,
      valorMinimoFd: parseBrlInput(form.valorMinimoFd) || null,
      observacoes: form.observacoes || null,
    });
  }

  const filtrados = (contratos as any[]).filter(c =>
    !busca ||
    c.nomeProjeto?.toLowerCase().includes(busca.toLowerCase()) ||
    c.cliente?.toLowerCase().includes(busca.toLowerCase())
  );

  const projetosComContrato = new Set((contratos as any[]).map((c: any) => c.projetoId));
  const projetosDisponiveis = (projetos as any[]).filter((p: any) => !projetosComContrato.has(p.id));

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Medição de Contratos</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gerencie os boletins de medição para faturamento ao cliente</p>
          </div>
          <Button onClick={() => setModalAberto(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Contrato
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por obra ou cliente..."
            className="pl-9"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum contrato de medição cadastrado</p>
            <p className="text-sm mt-1">Crie um contrato para começar a emitir boletins de medição</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtrados.map((c: any) => (
              <div
                key={c.id}
                onClick={() => setLocation(`/medicao/${c.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base text-gray-900 truncate">
                      {c.obraNome || c.nomeProjeto || "Sem nome"}
                    </h3>
                    {c.obraNome && c.nomeProjeto && c.obraNome !== c.nomeProjeto && (
                      <p className="text-xs text-gray-500 truncate">{c.nomeProjeto}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={(e) => abrirEdicao(c, e)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Editar contrato"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(c.id); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Excluir contrato"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                  {c.cliente && <span>{c.cliente}</span>}
                  {c.cliente && c.orcamentoCodigo && <span>·</span>}
                  {c.orcamentoCodigo && (
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                      ORC {c.orcamentoCodigo}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <StatusBadge status={c.status} />
                  <CriterioTag criterio={c.criterio} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-gray-600">
                    <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" />Valor do Contrato</span>
                    <span className="font-semibold text-gray-900">{brl(n(c.valorTotalContrato))}</span>
                  </div>
                  {n(c.percentualSinal) > 0 && (
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" />Desconto de Sinal</span>
                      <span>{n(c.percentualSinal).toFixed(2)}%</span>
                    </div>
                  )}
                  {n(c.percentualRetencao) > 0 && (
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" />Retenção de Garantia</span>
                      <span>{n(c.percentualRetencao).toFixed(2)}%</span>
                    </div>
                  )}
                  {c.local && (
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Local</span>
                      <span className="truncate max-w-[160px]">{c.local}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={modalAberto} onOpenChange={open => { setModalAberto(open); if (!open) resetForm(); }}>
        <DialogContent className="p-0 overflow-hidden" style={{ maxWidth: "95vw", width: "95vw", maxHeight: "95vh", height: "auto" }}>
          {/* Header com gradiente */}
          <div className="bg-gradient-to-r from-[#0f2744] to-[#1a3a5c] px-8 py-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white leading-tight">Novo Contrato de Medição</h2>
                <p className="text-sm text-blue-200/70 mt-0.5">Preencha os dados do contrato para iniciar os boletins</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: "calc(95vh - 140px)" }}>
            {/* Layout 2 colunas: esquerda = Identificação | direita = Valores + Deduções */}
            <div className="grid grid-cols-2 gap-x-10 gap-y-5">

              {/* ---- COLUNA ESQUERDA: Identificação ---- */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Identificação</span>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Projeto / Obra <span className="text-red-500">*</span></Label>
                  <Select value={form.projetoId} onValueChange={handleProjetoSelect}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Selecione o projeto..." className="truncate" />
                    </SelectTrigger>
                    <SelectContent className="max-w-[min(28rem,calc(100vw-2rem))]">
                      {projetosDisponiveis.map((p: any) => (
                        <SelectItem
                          key={p.id}
                          value={String(p.id)}
                          className="whitespace-normal break-words leading-snug py-2"
                        >
                          {p.nome} {p.cliente ? `— ${p.cliente}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {projetosDisponiveis.length === 0 && (
                    <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Todos os projetos já possuem contrato ou não há projetos cadastrados.
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Critério de Medição</Label>
                  <Select value={form.criterio} onValueChange={v => setForm(f => ({ ...f, criterio: v }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avanco_fisico">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                          Avanço Físico
                        </div>
                      </SelectItem>
                      <SelectItem value="parcela_fixa">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-3.5 w-3.5 text-purple-500" />
                          Parcela Fixa
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Observações na coluna esquerda (abaixo) */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <StickyNote className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Observações</span>
                  </div>
                  <Textarea
                    className="text-sm resize-none h-[120px]"
                    placeholder="Condições especiais, observações gerais..."
                    value={form.observacoes}
                    onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  />
                </div>
              </div>

              {/* ---- COLUNA DIREITA: Valores + Deduções ---- */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Valores Contratuais</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                      Valor Total do Contrato
                      {form.valorTotalContrato && (
                        <span className="text-[10px] text-emerald-600 font-normal normal-case">• do orçamento</span>
                      )}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                      <Input
                        className="h-10 text-sm pl-9"
                        placeholder="0,00"
                        value={form.valorTotalContrato}
                        onChange={e => setForm(f => ({ ...f, valorTotalContrato: e.target.value }))}
                        onBlur={e => {
                          const parsed = parseBrlInput(e.target.value);
                          if (parsed) setForm(f => ({ ...f, valorTotalContrato: formatBrlInput(parsed) }));
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                      Sinal Recebido
                      {form.valorSinalRecebido && (
                        <span className="text-[10px] text-emerald-600 font-normal normal-case">• do planejamento</span>
                      )}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                      <Input
                        className="h-10 text-sm pl-9"
                        placeholder="0,00"
                        value={form.valorSinalRecebido}
                        onChange={e => setForm(f => ({ ...f, valorSinalRecebido: e.target.value }))}
                        onBlur={e => {
                          const parsed = parseBrlInput(e.target.value);
                          if (parsed) setForm(f => ({ ...f, valorSinalRecebido: formatBrlInput(parsed) }));
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <Percent className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deduções por Medição</span>
                  </div>

                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                          % Desconto de Sinal
                          {form.percentualSinal && (
                            <span className="text-[10px] text-emerald-600 font-normal normal-case">• do planejamento</span>
                          )}
                        </Label>
                        <div className="relative">
                          <Input
                            className="h-10 text-sm pr-8 bg-white"
                            placeholder="ex: 1.00"
                            value={form.percentualSinal}
                            onChange={e => setForm(f => ({ ...f, percentualSinal: e.target.value }))}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                          % Retenção de Garantia
                          {form.percentualRetencao && (
                            <span className="text-[10px] text-emerald-600 font-normal normal-case">• do planejamento</span>
                          )}
                        </Label>
                        <div className="relative">
                          <Input
                            className="h-10 text-sm pr-8 bg-white"
                            placeholder="opcional"
                            value={form.percentualRetencao}
                            onChange={e => setForm(f => ({ ...f, percentualRetencao: e.target.value }))}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700 mt-3 leading-snug">Descontados automaticamente em cada boletim de medição gerado.</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                      Valor Mínimo para FD — Faturamento Direto
                      {form.valorMinimoFd && (
                        <span className="text-[10px] text-emerald-600 font-normal normal-case">• do planejamento</span>
                      )}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                      <Input
                        className="h-10 text-sm pl-9"
                        placeholder="0,00"
                        value={form.valorMinimoFd}
                        onChange={e => setForm(f => ({ ...f, valorMinimoFd: e.target.value }))}
                        onBlur={e => {
                          const parsed = parseBrlInput(e.target.value);
                          if (parsed) setForm(f => ({ ...f, valorMinimoFd: formatBrlInput(parsed) }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">Campos com <span className="text-red-500">*</span> são obrigatórios</p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-10 px-5"
                onClick={() => { setModalAberto(false); resetForm(); }}
              >
                Cancelar
              </Button>
              <Button
                className="h-10 px-5 bg-[#0f2744] hover:bg-[#1a3a5c] text-white gap-2"
                onClick={handleCriar}
                disabled={!form.projetoId || criarMutation.isPending}
              >
                {criarMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Plus className="h-4 w-4" />
                }
                Criar Contrato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Contrato */}
      <Dialog open={editId !== null} onOpenChange={open => { if (!open) setEditId(null); }}>
        <DialogContent className="p-0 overflow-hidden" style={{ maxWidth: "95vw", width: "95vw", maxHeight: "95vh", height: "auto", backgroundColor: "white" }}>
          <div className="bg-gradient-to-r from-[#0f2744] to-[#1a3a5c] px-8 py-5">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
                <Pencil className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white leading-tight">Editar Contrato de Medição</h2>
                <p className="text-sm text-blue-200/70 mt-0.5">Altere os dados do contrato conforme necessário</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 overflow-y-auto" style={{ maxHeight: "calc(95vh - 140px)" }}>
            <div className="grid grid-cols-2 gap-x-10 gap-y-5">

              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Settings className="h-4 w-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Configuração</span>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Critério de Medição</Label>
                  <Select value={editForm.criterio} onValueChange={v => setEditForm(f => ({ ...f, criterio: v }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avanco_fisico">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                          Avanço Físico
                        </div>
                      </SelectItem>
                      <SelectItem value="parcela_fixa">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="h-3.5 w-3.5 text-purple-500" />
                          Parcela Fixa
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">Status</Label>
                  <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="encerrado">Encerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <StickyNote className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Observações</span>
                  </div>
                  <Textarea className="text-sm resize-none h-[120px]" value={editForm.observacoes}
                    onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Valores Contratuais</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Valor Total do Contrato</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                      <Input className="h-10 text-sm pl-9" value={editForm.valorTotalContrato}
                        onChange={e => handleBrlChange(e, v => setEditForm(f => ({ ...f, valorTotalContrato: v })))}
                        onBlur={e => { const p = parseBrlInput(e.target.value); if (p) setEditForm(f => ({ ...f, valorTotalContrato: formatBrlInput(p) })); }}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Sinal Recebido</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                      <Input className="h-10 text-sm pl-9" value={editForm.valorSinalRecebido}
                        onChange={e => handleBrlChange(e, v => setEditForm(f => ({ ...f, valorSinalRecebido: v })))}
                        onBlur={e => { const p = parseBrlInput(e.target.value); if (p) setEditForm(f => ({ ...f, valorSinalRecebido: formatBrlInput(p) })); }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <Percent className="h-4 w-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deduções por Medição</span>
                  </div>

                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">% Desconto de Sinal</Label>
                        <div className="relative">
                          <Input className="h-10 text-sm pr-8 bg-white" placeholder="ex: 1.00"
                            value={editForm.percentualSinal}
                            onChange={e => setEditForm(f => ({ ...f, percentualSinal: e.target.value }))} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-2 block">% Retenção de Garantia</Label>
                        <div className="relative">
                          <Input className="h-10 text-sm pr-8 bg-white" placeholder="opcional"
                            value={editForm.percentualRetencao}
                            onChange={e => setEditForm(f => ({ ...f, percentualRetencao: e.target.value }))} />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700 mt-3 leading-snug">Descontados automaticamente em cada boletim de medição gerado.</p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Valor Mínimo para FD — Faturamento Direto</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">R$</span>
                      <Input className="h-10 text-sm pl-9" placeholder="0,00" value={editForm.valorMinimoFd}
                        onChange={e => handleBrlChange(e, v => setEditForm(f => ({ ...f, valorMinimoFd: v })))}
                        onBlur={e => { const p = parseBrlInput(e.target.value); if (p) setEditForm(f => ({ ...f, valorMinimoFd: formatBrlInput(p) })); }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-4 bg-gray-50 border-t flex items-center justify-end gap-3">
            <Button variant="outline" className="h-10 px-5" onClick={() => setEditId(null)}>Cancelar</Button>
            <Button className="h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white gap-2" onClick={salvarEdicao} disabled={atualizarMutation.isPending}>
              {atualizarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={confirmDelete !== null} onOpenChange={open => { if (!open) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm" style={{ backgroundColor: "white" }}>
          <div className="space-y-4 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Excluir contrato?</h3>
            <p className="text-sm text-gray-500">Esta ação não pode ser desfeita. Os boletins de medição associados serão mantidos para histórico.</p>
            <div className="flex justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => {
                if (confirmDelete) excluirMutation.mutate({ id: confirmDelete, companyId });
              }} disabled={excluirMutation.isPending}>
                {excluirMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Excluir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
