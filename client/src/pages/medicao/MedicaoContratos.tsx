import React, { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Loader2, FileText, Building2, DollarSign,
  ChevronRight, Settings, CheckCircle2, AlertCircle, TrendingUp,
} from "lucide-react";

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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Contrato de Medição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Projeto / Obra *</Label>
              <Select value={form.projetoId} onValueChange={v => setForm(f => ({ ...f, projetoId: v }))}>
                <SelectTrigger>
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
                <p className="text-xs text-amber-600 mt-1">Todos os projetos já possuem contrato de medição ou não há projetos cadastrados.</p>
              )}
            </div>

            <div>
              <Label>Critério de Medição</Label>
              <Select value={form.criterio} onValueChange={v => setForm(f => ({ ...f, criterio: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="avanco_fisico">Avanço Físico</SelectItem>
                  <SelectItem value="parcela_fixa">Parcela Fixa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor Total do Contrato (R$)</Label>
                <Input
                  placeholder="0,00"
                  value={form.valorTotalContrato}
                  onChange={e => setForm(f => ({ ...f, valorTotalContrato: e.target.value }))}
                />
              </div>
              <div>
                <Label>Valor do Sinal Recebido (R$)</Label>
                <Input
                  placeholder="0,00"
                  value={form.valorSinalRecebido}
                  onChange={e => setForm(f => ({ ...f, valorSinalRecebido: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>% Desconto de Sinal por Medição</Label>
                <Input
                  placeholder="ex: 1.00"
                  value={form.percentualSinal}
                  onChange={e => setForm(f => ({ ...f, percentualSinal: e.target.value }))}
                />
              </div>
              <div>
                <Label>% Retenção de Garantia (opcional)</Label>
                <Input
                  placeholder="ex: 5.00"
                  value={form.percentualRetencao}
                  onChange={e => setForm(f => ({ ...f, percentualRetencao: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <Label>Valor Mínimo para Faturamento Direto — FD (R$)</Label>
              <Input
                placeholder="Valor mínimo aceito pelo cliente para FD"
                value={form.valorMinimoFd}
                onChange={e => setForm(f => ({ ...f, valorMinimoFd: e.target.value }))}
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Input
                placeholder="Observações gerais do contrato..."
                value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setModalAberto(false); resetForm(); }}>Cancelar</Button>
              <Button
                onClick={handleCriar}
                disabled={!form.projetoId || criarMutation.isPending}
              >
                {criarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar Contrato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
