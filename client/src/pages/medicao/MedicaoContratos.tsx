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
  Percent, ClipboardList, StickyNote,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const n = (v: unknown) => parseFloat(String(v || "0")) || 0;
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

  const criarMutation = trpc.medicao.criarContrato.useMutation({
    onSuccess: () => {
      utils.medicao.listarContratos.invalidate();
      setModalAberto(false);
      resetForm();
    },
  });

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

  function handleCriar() {
    if (!form.projetoId) return;
    criarMutation.mutate({
      companyId,
      projetoId: parseInt(form.projetoId),
      criterio: form.criterio as "avanco_fisico" | "parcela_fixa",
      valorTotalContrato: form.valorTotalContrato || undefined,
      percentualSinal: form.percentualSinal || undefined,
      valorSinalRecebido: form.valorSinalRecebido || undefined,
      percentualRetencao: form.percentualRetencao || null,
      valorMinimoFd: form.valorMinimoFd || null,
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
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{c.nomeProjeto}</h3>
                    <p className="text-sm text-gray-500 truncate mt-0.5">{c.cliente || "—"}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 ml-2 flex-shrink-0 mt-0.5 transition-colors" />
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
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          {/* Header com gradiente */}
          <div className="bg-gradient-to-r from-[#0f2744] to-[#1a3a5c] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white leading-tight">Novo Contrato de Medição</h2>
                <p className="text-xs text-blue-200/70 mt-0.5">Preencha os dados do contrato para iniciar os boletins</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">

            {/* Seção: Identificação */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Identificação</span>
              </div>

              <div>
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Projeto / Obra <span className="text-red-500">*</span></Label>
                <Select value={form.projetoId} onValueChange={v => setForm(f => ({ ...f, projetoId: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione o projeto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projetosDisponiveis.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.nome} {p.cliente ? `— ${p.cliente}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projetosDisponiveis.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Todos os projetos já possuem contrato ou não há projetos cadastrados.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Critério de Medição</Label>
                <Select value={form.criterio} onValueChange={v => setForm(f => ({ ...f, criterio: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
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
            </div>

            {/* Seção: Valores Contratuais */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Valores Contratuais</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Valor Total do Contrato</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R$</span>
                    <Input
                      className="h-9 text-sm pl-8"
                      placeholder="0,00"
                      value={form.valorTotalContrato}
                      onChange={e => setForm(f => ({ ...f, valorTotalContrato: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-700 mb-1.5 block">Sinal Recebido</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R$</span>
                    <Input
                      className="h-9 text-sm pl-8"
                      placeholder="0,00"
                      value={form.valorSinalRecebido}
                      onChange={e => setForm(f => ({ ...f, valorSinalRecebido: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Seção: Deduções */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <Percent className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deduções por Medição</span>
              </div>

              <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-1.5 block">% Desconto de Sinal</Label>
                    <div className="relative">
                      <Input
                        className="h-9 text-sm pr-7 bg-white"
                        placeholder="ex: 1.00"
                        value={form.percentualSinal}
                        onChange={e => setForm(f => ({ ...f, percentualSinal: e.target.value }))}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700 mb-1.5 block">% Retenção de Garantia</Label>
                    <div className="relative">
                      <Input
                        className="h-9 text-sm pr-7 bg-white"
                        placeholder="opcional"
                        value={form.percentualRetencao}
                        onChange={e => setForm(f => ({ ...f, percentualRetencao: e.target.value }))}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-amber-700 mt-2 leading-snug">Descontados automaticamente em cada boletim de medição gerado.</p>
              </div>

              <div>
                <Label className="text-xs font-medium text-gray-700 mb-1.5 block">
                  Valor Mínimo para FD — Faturamento Direto
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">R$</span>
                  <Input
                    className="h-9 text-sm pl-8"
                    placeholder="Valor mínimo aceito pelo cliente"
                    value={form.valorMinimoFd}
                    onChange={e => setForm(f => ({ ...f, valorMinimoFd: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Seção: Observações */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <StickyNote className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Observações</span>
              </div>
              <Textarea
                className="text-sm resize-none min-h-[72px]"
                placeholder="Observações gerais sobre o contrato, condições especiais, etc..."
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">Campos com <span className="text-red-500">*</span> são obrigatórios</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => { setModalAberto(false); resetForm(); }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-9 bg-[#0f2744] hover:bg-[#1a3a5c] text-white gap-1.5"
                onClick={handleCriar}
                disabled={!form.projetoId || criarMutation.isPending}
              >
                {criarMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Plus className="h-3.5 w-3.5" />
                }
                Criar Contrato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
