import React, { useState, useMemo } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus, Search, Loader2, CalendarRange, Building2, User, DollarSign,
  TrendingUp, Clock, CheckCircle2, AlertTriangle, Trash2, Eye, MapPin,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const n = (v: any) => parseFloat(v || "0") || 0;

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() ?? "";
  if (s.includes("conclu")) return "bg-emerald-100 text-emerald-700";
  if (s.includes("atraso") || s.includes("suspen")) return "bg-red-100 text-red-700";
  if (s.includes("parado")) return "bg-gray-100 text-gray-600";
  return "bg-blue-100 text-blue-700";
}
function statusIcon(status: string) {
  const s = status?.toLowerCase() ?? "";
  if (s.includes("conclu")) return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s.includes("atraso") || s.includes("suspen")) return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

const STATUS_OPTIONS = [
  "Em andamento", "Concluído", "Suspenso", "Atrasado", "Planejamento",
];

export default function PlanejamentoLista() {
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;

  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);

  // Formulário novo projeto
  const [form, setForm] = useState({
    obraId: "",
    orcamentoId: "",
    status: "Em andamento",
    descricao: "",
  });

  const utils = trpc.useUtils();
  const { data: projetos = [], isLoading } = trpc.planejamento.listarProjetos.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: obras = [] } = trpc.obras.list.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: orcamentos = [] } = trpc.orcamento.list.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const obraSelecionada = useMemo(() =>
    (obras as any[]).find((o: any) => String(o.id) === form.obraId) ?? null,
  [obras, form.obraId]);

  const criarMutation = trpc.planejamento.criarProjeto.useMutation({
    onSuccess: () => { utils.planejamento.listarProjetos.invalidate(); setModalAberto(false); resetForm(); },
  });
  const excluirMutation = trpc.planejamento.excluirProjeto.useMutation({
    onSuccess: () => { utils.planejamento.listarProjetos.invalidate(); setExcluindo(null); },
  });

  function resetForm() {
    setForm({ obraId: "", orcamentoId: "", status: "Em andamento", descricao: "" });
  }

  function handleCriar() {
    if (!obraSelecionada) return;
    const local = [obraSelecionada.cidade, obraSelecionada.estado].filter(Boolean).join(" / ")
      || obraSelecionada.endereco || undefined;
    criarMutation.mutate({
      companyId,
      nome:                  obraSelecionada.nome,
      cliente:               obraSelecionada.cliente || undefined,
      local:                 local,
      responsavel:           obraSelecionada.responsavel || undefined,
      dataInicio:            obraSelecionada.dataInicio || undefined,
      dataTerminoContratual: obraSelecionada.dataPrevisaoFim || undefined,
      valorContrato:         obraSelecionada.valorContrato ? parseFloat(obraSelecionada.valorContrato) : undefined,
      status:                form.status,
      descricao:             form.descricao || undefined,
      orcamentoId:           form.orcamentoId ? parseInt(form.orcamentoId) : undefined,
    });
  }

  const filtrados = projetos.filter(p =>
    [p.nome, p.cliente, p.local, p.responsavel].some(v =>
      v?.toLowerCase().includes(busca.toLowerCase())
    )
  );

  return (
    <DashboardLayout>
      <div className="p-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-blue-600" />
              Planejamento de Obras
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Cronograma · Curva S · REFIS · Controle de Avanço
            </p>
          </div>
          <Button onClick={() => setModalAberto(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Novo Projeto
          </Button>
        </div>

        {/* KPIs rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total de Projetos", value: projetos.length, icon: <Building2 className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Em Andamento", value: projetos.filter(p => p.status?.toLowerCase().includes("andamento")).length, icon: <TrendingUp className="h-4 w-4" />, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Com Atraso", value: projetos.filter(p => p.status?.toLowerCase().includes("atraso")).length, icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-600", bg: "bg-red-50" },
            { label: "Valor Total", value: formatBRL(projetos.reduce((s, p) => s + n(p.valorContrato), 0)), icon: <DollarSign className="h-4 w-4" />, color: "text-purple-600", bg: "bg-purple-50" },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg ${k.bg} ${k.color} flex items-center justify-center shrink-0`}>
                {k.icon}
              </div>
              <div>
                <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
                <p className={`text-base font-bold ${k.color} leading-tight mt-0.5`}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Busca */}
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar projeto, cliente, local..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Carregando projetos...</span>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <CalendarRange className="h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">Nenhum projeto de planejamento encontrado</p>
            <Button variant="outline" size="sm" onClick={() => setModalAberto(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Criar primeiro projeto
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtrados.map(projeto => (
              <div key={projeto.id}
                className="bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                onClick={() => setLocation(`/planejamento/${projeto.id}`)}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2 flex-1">
                      {projeto.nome}
                    </h3>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusBadge(projeto.status ?? "")}`}>
                      {statusIcon(projeto.status ?? "")}
                      {projeto.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-500">
                    {projeto.cliente && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{projeto.cliente}</span>
                      </div>
                    )}
                    {projeto.responsavel && (
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{projeto.responsavel}</span>
                      </div>
                    )}
                    {(projeto.dataInicio || projeto.dataTerminoContratual) && (
                      <div className="flex items-center gap-1.5">
                        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {projeto.dataInicio ?? "—"} → {projeto.dataTerminoContratual ?? "—"}
                        </span>
                      </div>
                    )}
                    {n(projeto.valorContrato) > 0 && (
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                        <DollarSign className="h-3.5 w-3.5 shrink-0" />
                        <span>{formatBRL(n(projeto.valorContrato))}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 px-4 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    Criado {new Date(projeto.criadoEm ?? "").toLocaleDateString("pt-BR")}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); setLocation(`/planejamento/${projeto.id}`); }}
                      className="p-1 rounded hover:bg-blue-50 text-blue-500"
                      title="Abrir"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm("Excluir este projeto e todos os seus dados?")) excluirMutation.mutate({ id: projeto.id }); }}
                      className="p-1 rounded hover:bg-red-50 text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal novo projeto */}
        <Dialog open={modalAberto} onOpenChange={open => { setModalAberto(open); if (!open) resetForm(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Projeto de Planejamento</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-4 mt-1">

              {/* Seleção da Obra */}
              <div>
                <Label className="text-xs font-medium">Selecionar Obra *</Label>
                <select
                  value={form.obraId}
                  onChange={e => setForm(f => ({ ...f, obraId: e.target.value }))}
                  className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">— Selecione uma obra —</option>
                  {(obras as any[]).map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}{o.cliente ? ` · ${o.cliente}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Preview dos dados da obra selecionada */}
              {obraSelecionada && (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-xs text-slate-600">
                  {obraSelecionada.cliente && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{obraSelecionada.cliente}</span>
                    </div>
                  )}
                  {obraSelecionada.responsavel && (
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{obraSelecionada.responsavel}</span>
                    </div>
                  )}
                  {(obraSelecionada.cidade || obraSelecionada.estado || obraSelecionada.endereco) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>
                        {[obraSelecionada.cidade, obraSelecionada.estado].filter(Boolean).join(" / ")
                          || obraSelecionada.endereco}
                      </span>
                    </div>
                  )}
                  {(obraSelecionada.dataInicio || obraSelecionada.dataPrevisaoFim) && (
                    <div className="flex items-center gap-2">
                      <CalendarRange className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>
                        {obraSelecionada.dataInicio ?? "—"} → {obraSelecionada.dataPrevisaoFim ?? "—"}
                      </span>
                    </div>
                  )}
                  {obraSelecionada.valorContrato && n(obraSelecionada.valorContrato) > 0 && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-emerald-700">
                        {formatBRL(n(obraSelecionada.valorContrato))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Orçamento e Status lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Orçamento (opcional)</Label>
                  <select
                    value={form.orcamentoId}
                    onChange={e => setForm(f => ({ ...f, orcamentoId: e.target.value }))}
                    className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="">— Sem vínculo —</option>
                    {(orcamentos as any[]).map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.descricao ?? o.nome ?? `#${o.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-medium">Status</Label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <Label className="text-xs font-medium">Observações (opcional)</Label>
                <textarea
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Informações adicionais sobre o projeto..."
                  className="mt-1 w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => { setModalAberto(false); resetForm(); }}>Cancelar</Button>
                <Button
                  disabled={!form.obraId || criarMutation.isPending}
                  onClick={handleCriar}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {criarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Projeto"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
