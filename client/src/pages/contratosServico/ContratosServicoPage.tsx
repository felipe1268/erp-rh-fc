/**
 * Contratos de Serviço Continuado
 * Gestão de contratos recorrentes (contabilidade, jurídico, saúde ocupacional, etc.)
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, FileSignature, ChevronRight, Pencil, Trash2,
         CheckCircle, AlertTriangle, Clock, Receipt, X, Check,
         Users, UserPlus, UserMinus, Stethoscope, Calculator,
         DollarSign, Building2, ChevronLeft, Info } from "lucide-react";
import { toast } from "sonner";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const BR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = (v: unknown) => BR.format(Number(v ?? 0));
const monthName = (comp: string) => {
  const [y, m] = comp.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};
const currentComp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const prevComp = (c: string) => {
  const [y, m] = c.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const nextComp = (c: string) => {
  const [y, m] = c.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const TIPOS_SERVICO_LABEL: Record<string, string> = {
  contabilidade: "Contabilidade",
  juridico: "Jurídico",
  saude_ocupacional: "Saúde Ocupacional",
  limpeza: "Limpeza / Conservação",
  seguranca: "Segurança Patrimonial",
  ti: "TI / Tecnologia",
  outro: "Outro",
};
const TIPOS_ITEM_LABEL: Record<string, string> = {
  fixo: "Parcela Fixa",
  por_funcionario_ativo: "Por funcionário ativo",
  por_admissao: "Por admissão",
  por_demissao: "Por desligamento",
  por_exame: "Por exame realizado",
  por_folha: "% sobre a folha",
  outro: "Outro (manual)",
};
const STATUS_COMP_LABEL: Record<string, { label: string; color: string }> = {
  aberta:     { label: "Aguardando fatura",  color: "bg-slate-100 text-slate-600" },
  com_fatura: { label: "Fatura registrada", color: "bg-amber-100 text-amber-700" },
  aprovada:   { label: "Aprovada",           color: "bg-sky-100 text-sky-700" },
  paga:       { label: "Paga",               color: "bg-blue-100 text-blue-700" },
};
const STATUS_CONTRATO_LABEL: Record<string, string> = { ativo: "Ativo", encerrado: "Encerrado" };

type Tab = "contrato" | "itens" | "historico";

/* ─── Formulário de contrato ─────────────────────────────────────────────── */
interface ContratoForm {
  nome: string; tipoServico: string; fornecedorId: number | null;
  vigenciaInicio: string; vigenciaFim: string; renovacaoAutomatica: boolean;
  diaVencimento: number; toleranciaDivergencia: number; observacoes: string; status: string;
}
const emptyForm = (): ContratoForm => ({
  nome: "", tipoServico: "contabilidade", fornecedorId: null,
  vigenciaInicio: "", vigenciaFim: "", renovacaoAutomatica: false,
  diaVencimento: 10, toleranciaDivergencia: 5, observacoes: "", status: "ativo",
});

/* ─── Formulário de item ─────────────────────────────────────────────────── */
interface ItemForm { tipo: string; descricao: string; valorUnitario: string; percentual: string; }
const emptyItemForm = (): ItemForm => ({ tipo: "fixo", descricao: "", valorUnitario: "", percentual: "" });

/* ─── Formulário de fatura ───────────────────────────────────────────────── */
interface FaturaForm { valorCobrado: string; notaNumero: string; notaChave: string; observacoes: string; }
const emptyFaturaForm = (): FaturaForm => ({ valorCobrado: "", notaNumero: "", notaChave: "", observacoes: "" });

/* ══════════════════════════════════════════════════════════════════════════ */
export default function ContratosServicoPage() {
  const { companyId } = useCompany();
  const utils = trpc.useUtils();

  /* ── state ── */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("contrato");
  const [editMode, setEditMode] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<ContratoForm>(emptyForm());
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm());
  const [showItemForm, setShowItemForm] = useState(false);
  const [faturaForm, setFaturaForm] = useState<FaturaForm>(emptyFaturaForm());
  const [showFaturaForm, setShowFaturaForm] = useState(false);
  const [comp, setComp] = useState(currentComp());
  const [calcResult, setCalcResult] = useState<any>(null);
  const [search, setSearch] = useState("");

  /* ── queries ── */
  const listarQ = trpc.contratosServico.listar.useQuery({ companyId }, { enabled: !!companyId });
  const getQ = trpc.contratosServico.get.useQuery(
    { id: selectedId!, companyId },
    { enabled: !!selectedId && !!companyId, staleTime: 0 }
  );
  const fornecedoresQ = trpc.contratosServico.listarFornecedores.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const compsQ = trpc.contratosServico.competencias.listar.useQuery(
    { contratoId: selectedId!, companyId },
    { enabled: !!selectedId && !!companyId && activeTab === "historico" }
  );

  /* ── mutations ── */
  const criarMut    = trpc.contratosServico.criar.useMutation({ onSuccess: () => { utils.contratosServico.listar.invalidate(); setShowNew(false); setForm(emptyForm()); toast.success("Contrato criado."); } });
  const atualizarMut = trpc.contratosServico.atualizar.useMutation({ onSuccess: () => { utils.contratosServico.listar.invalidate(); getQ.refetch(); setEditMode(false); toast.success("Contrato atualizado."); } });
  const excluirMut  = trpc.contratosServico.excluir.useMutation({ onSuccess: () => { utils.contratosServico.listar.invalidate(); setSelectedId(null); toast.success("Contrato removido."); } });
  const criarItemMut = trpc.contratosServico.itens.criar.useMutation({ onSuccess: () => { getQ.refetch(); setShowItemForm(false); setItemForm(emptyItemForm()); toast.success("Item adicionado."); } });
  const excluirItemMut = trpc.contratosServico.itens.excluir.useMutation({ onSuccess: () => { getQ.refetch(); toast.success("Item removido."); } });
  const calcularMut = trpc.contratosServico.competencias.calcular.useMutation({
    onSuccess: (data) => { setCalcResult(data); compsQ.refetch(); toast.success("Cálculo concluído."); },
    onError: (e) => toast.error(e.message),
  });
  const lancarMut   = trpc.contratosServico.competencias.lancar.useMutation({
    onSuccess: (data) => {
      compsQ.refetch();
      setShowFaturaForm(false);
      setFaturaForm(emptyFaturaForm());
      if (data.divergencia) toast.warning("⚠️ Divergência detectada! O valor cobrado difere do esperado acima da tolerância.");
      else toast.success("Fatura registrada.");
    },
    onError: (e) => toast.error(e.message),
  });
  const aprovarMut  = trpc.contratosServico.competencias.aprovar.useMutation({
    onSuccess: () => { compsQ.refetch(); toast.success("Aprovado! Título gerado no Contas a Pagar."); },
    onError: (e) => toast.error(e.message),
  });

  /* ── contrato selecionado ── */
  const contrato = getQ.data;
  const lista = listarQ.data ?? [];
  const filtered = useMemo(() => {
    if (!search) return lista;
    const q = search.toLowerCase();
    return lista.filter((c: any) => c.nome?.toLowerCase().includes(q) || c.fornecedor_nome?.toLowerCase().includes(q));
  }, [lista, search]);

  /* ── current comp record ── */
  const compRecord = compsQ.data?.find((c: any) => c.competencia === comp);

  /* ── helpers ── */
  const openNew = () => { setShowNew(true); setEditMode(false); setSelectedId(null); setForm(emptyForm()); };
  const openEdit = () => {
    if (!contrato) return;
    setForm({
      nome: contrato.nome ?? "",
      tipoServico: contrato.tipo_servico ?? "contabilidade",
      fornecedorId: contrato.fornecedor_id ?? null,
      vigenciaInicio: contrato.vigencia_inicio?.slice(0, 10) ?? "",
      vigenciaFim: contrato.vigencia_fim?.slice(0, 10) ?? "",
      renovacaoAutomatica: !!contrato.renovacao_automatica,
      diaVencimento: Number(contrato.dia_vencimento ?? 10),
      toleranciaDivergencia: Number(contrato.tolerancia_divergencia ?? 5),
      observacoes: contrato.observacoes ?? "",
      status: contrato.status ?? "ativo",
    });
    setEditMode(true);
    setShowNew(false);
  };
  const cancelEdit = () => { setEditMode(false); setForm(emptyForm()); };
  const saveForm = () => {
    const payload = {
      companyId,
      nome: form.nome,
      tipoServico: form.tipoServico as any,
      fornecedorId: form.fornecedorId,
      vigenciaInicio: form.vigenciaInicio || null,
      vigenciaFim: form.vigenciaFim || null,
      renovacaoAutomatica: form.renovacaoAutomatica,
      diaVencimento: form.diaVencimento,
      toleranciaDivergencia: form.toleranciaDivergencia,
      observacoes: form.observacoes || null,
    };
    if (editMode && contrato) {
      atualizarMut.mutate({ ...payload, id: contrato.id, status: form.status as any });
    } else {
      criarMut.mutate(payload as any);
    }
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* ══ COMANDOS DO MÓDULO ══════════════════════════════════════════════ */}
      <aside className="hidden md:flex md:w-14 lg:w-52 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="hidden border-b border-slate-100 bg-slate-50 px-3.5 py-3 lg:block">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Comandos</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">Ações rápidas do módulo.</p>
        </div>
        <nav className="space-y-1 p-2">
          {([
            { key: "lista", label: "Lista de contratos", Icon: FileSignature },
            { key: "novo", label: "Novo contrato", Icon: Plus },
            { key: "contrato", label: "Dados do contrato", Icon: FileSignature, requiresContract: true },
            { key: "itens", label: "Itens de cobrança", Icon: DollarSign, requiresContract: true },
            { key: "historico", label: "Histórico mensal", Icon: Clock, requiresContract: true },
          ] as const).map(command => {
            const isActive = command.key === "novo"
              ? showNew
              : command.key === "lista"
                ? !showNew && !selectedId
                : !showNew && selectedId && activeTab === command.key;
            const disabled = !!command.requiresContract && !selectedId;
            return (
              <button
                key={command.key}
                type="button"
                disabled={disabled}
                title={disabled ? `${command.label} — selecione um contrato` : command.label}
                onClick={() => {
                  if (command.key === "lista") {
                    setShowNew(false);
                    setEditMode(false);
                  } else if (command.key === "novo") {
                    openNew();
                  } else {
                    setShowNew(false);
                    setEditMode(false);
                    setActiveTab(command.key);
                  }
                }}
                className={`flex w-full items-center justify-center gap-2.5 rounded-lg px-2 py-2.5 text-left text-xs font-semibold transition-colors lg:justify-start lg:px-3 ${
                  isActive
                    ? "bg-[#1B2A4A] text-white shadow-sm"
                    : disabled
                      ? "cursor-not-allowed text-slate-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <command.Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{command.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ══ LISTA LATERAL ══════════════════════════════════════════════════ */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-sky-600" />
          <span className="text-sm font-semibold text-slate-800">Contratos de Serviço</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0 text-sky-600 hover:bg-sky-50" onClick={openNew}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-100">
          <Input placeholder="Buscar contrato..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-7 text-xs bg-slate-50 border-slate-200" />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {listarQ.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 px-4 text-slate-400">
              <FileSignature className="h-8 w-8 mx-auto opacity-20 mb-2" />
              <p className="text-xs">Nenhum contrato cadastrado.</p>
              <p className="text-xs text-slate-300 mt-1">Clique em + para adicionar.</p>
            </div>
          ) : filtered.map((c: any) => (
            <button key={c.id} onClick={() => { setSelectedId(c.id); setEditMode(false); setShowNew(false); setActiveTab("contrato"); setCalcResult(null); }}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-sky-50 transition-colors ${selectedId === c.id ? "bg-sky-50 border-l-2 border-l-sky-500" : ""}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{c.nome}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">{TIPOS_SERVICO_LABEL[c.tipo_servico] ?? c.tipo_servico}</p>
                  {c.fornecedor_nome && <p className="text-[10px] text-slate-400 truncate">{c.fornecedor_nome}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {c.status === "encerrado" ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Encerrado</span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">Ativo</span>
                  )}
                  {Number(c.total_itens) > 0 && (
                    <span className="text-[9px] text-slate-400">{c.total_itens} item{Number(c.total_itens)>1?"s":""}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ══ PAINEL PRINCIPAL ═══════════════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto">
        {/* Novo contrato */}
        {showNew && (
          <div className="max-w-2xl mx-auto px-6 py-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Plus className="h-4 w-4 text-sky-600" /> Novo Contrato de Serviço
              </h2>
              <ContratoFormFields form={form} setForm={setForm} fornecedores={fornecedoresQ.data ?? []} isNew />
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={saveForm} disabled={criarMut.isPending || !form.nome}>
                  {criarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              </div>
            </div>
          </div>
        )}

        {/* Detalhe do contrato */}
        {selectedId && !showNew && (
          getQ.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
          ) : contrato ? (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
              {/* Header do contrato */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-semibold text-slate-800">{contrato.nome}</h2>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${contrato.status === "ativo" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {STATUS_CONTRATO_LABEL[contrato.status] ?? contrato.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {TIPOS_SERVICO_LABEL[contrato.tipo_servico] ?? contrato.tipo_servico}
                    {contrato.fornecedor_nome && ` · ${contrato.fornecedor_nome}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Vencimento: todo dia {contrato.dia_vencimento} · Tolerância de divergência: {contrato.tolerancia_divergencia}%
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openEdit}>
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => { if (confirm("Excluir este contrato?")) excluirMut.mutate({ id: contrato.id, companyId }); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex border-b border-slate-200">
                  {(["contrato", "itens", "historico"] as Tab[]).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                      className={`px-5 py-3 text-xs font-medium transition-colors ${activeTab === t ? "text-sky-600 border-b-2 border-sky-500 bg-sky-50/40" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}>
                      {t === "contrato" ? "Contrato" : t === "itens" ? `Itens de Cobrança (${contrato.itens?.length ?? 0})` : "Histórico Mensal"}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {/* ── Tab: Contrato ── */}
                  {activeTab === "contrato" && (
                    editMode ? (
                      <div>
                        <ContratoFormFields form={form} setForm={setForm} fornecedores={fornecedoresQ.data ?? []} />
                        <div className="flex gap-2 mt-4">
                          <Button size="sm" onClick={saveForm} disabled={atualizarMut.isPending || !form.nome}>
                            {atualizarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                            Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <ContratoDetail contrato={contrato} />
                    )
                  )}

                  {/* ── Tab: Itens de Cobrança ── */}
                  {activeTab === "itens" && (
                    <div className="space-y-3">
                      {/* Lista de itens */}
                      {(contrato.itens ?? []).length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                          <DollarSign className="h-8 w-8 mx-auto opacity-20 mb-2" />
                          <p className="text-sm">Nenhum item de cobrança cadastrado.</p>
                          <p className="text-xs text-slate-300 mt-1">Adicione itens fixos e variáveis abaixo.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {contrato.itens.map((item: any) => (
                            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                              <ItemIcon tipo={item.tipo} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-700">{TIPOS_ITEM_LABEL[item.tipo] ?? item.tipo}</p>
                                {item.descricao && <p className="text-[10px] text-slate-500">{item.descricao}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                {item.tipo === "por_folha" ? (
                                  <p className="text-xs font-semibold text-slate-700">{Number(item.percentual ?? 0).toFixed(2)}% da folha</p>
                                ) : item.valor_unitario ? (
                                  <p className="text-xs font-semibold text-slate-700">{fmtBR(item.valor_unitario)}{item.tipo !== "fixo" ? " / un." : ""}</p>
                                ) : (
                                  <p className="text-[10px] text-slate-400">manual</p>
                                )}
                              </div>
                              <button className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                                onClick={() => { if (confirm("Remover item?")) excluirItemMut.mutate({ id: item.id, companyId }); }}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Adicionar item */}
                      {showItemForm ? (
                        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
                          <p className="text-xs font-semibold text-slate-700">Novo item de cobrança</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <Label className="text-[11px] text-slate-500 mb-1 block">Tipo</Label>
                              <select className="w-full text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
                                value={itemForm.tipo} onChange={e => setItemForm(f => ({ ...f, tipo: e.target.value }))}>
                                {Object.entries(TIPOS_ITEM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            </div>
                            <div className="col-span-2">
                              <Label className="text-[11px] text-slate-500 mb-1 block">Descrição (opcional)</Label>
                              <Input className="h-7 text-xs" placeholder="Ex: Honorários mensais"
                                value={itemForm.descricao} onChange={e => setItemForm(f => ({ ...f, descricao: e.target.value }))} />
                            </div>
                            {itemForm.tipo !== "por_folha" && itemForm.tipo !== "por_exame" && itemForm.tipo !== "outro" && (
                              <div className="col-span-2">
                                <Label className="text-[11px] text-slate-500 mb-1 block">
                                  {itemForm.tipo === "fixo" ? "Valor fixo (R$)" : "Valor unitário (R$)"}
                                </Label>
                                <Input className="h-7 text-xs" type="number" min="0" step="0.01" placeholder="0,00"
                                  value={itemForm.valorUnitario} onChange={e => setItemForm(f => ({ ...f, valorUnitario: e.target.value }))} />
                              </div>
                            )}
                            {itemForm.tipo === "por_folha" && (
                              <div className="col-span-2">
                                <Label className="text-[11px] text-slate-500 mb-1 block">Percentual (%)</Label>
                                <Input className="h-7 text-xs" type="number" min="0" max="100" step="0.01" placeholder="Ex: 2.5"
                                  value={itemForm.percentual} onChange={e => setItemForm(f => ({ ...f, percentual: e.target.value }))} />
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs"
                              disabled={criarItemMut.isPending}
                              onClick={() => criarItemMut.mutate({
                                contratoId: contrato.id, companyId,
                                tipo: itemForm.tipo as any,
                                descricao: itemForm.descricao || null,
                                valorUnitario: itemForm.valorUnitario ? Number(itemForm.valorUnitario) : null,
                                percentual: itemForm.percentual ? Number(itemForm.percentual) : null,
                              })}>
                              {criarItemMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                              Adicionar
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowItemForm(false)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs border-dashed"
                          onClick={() => setShowItemForm(true)}>
                          <Plus className="h-3 w-3 mr-1" /> Adicionar item de cobrança
                        </Button>
                      )}
                    </div>
                  )}

                  {/* ── Tab: Histórico Mensal ── */}
                  {activeTab === "historico" && (
                    <div className="space-y-4">
                      {/* Seletor de competência */}
                      <div className="flex items-center gap-3">
                        <button onClick={() => { setComp(prevComp(comp)); setCalcResult(null); }}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                          <ChevronLeft className="h-4 w-4 text-slate-500" />
                        </button>
                        <span className="text-sm font-semibold text-slate-700 capitalize">{monthName(comp)}</span>
                        <button onClick={() => { setComp(nextComp(comp)); setCalcResult(null); }}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        </button>
                      </div>

                      {/* Status da competência atual */}
                      {compRecord ? (
                        <div className="space-y-3">
                          {/* Status badge */}
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COMP_LABEL[compRecord.status]?.color ?? "bg-slate-100 text-slate-600"}`}>
                              {STATUS_COMP_LABEL[compRecord.status]?.label ?? compRecord.status}
                            </span>
                            {compRecord.divergencia && (
                              <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                <AlertTriangle className="h-3 w-3" /> Divergência detectada
                              </span>
                            )}
                          </div>

                          {/* Cards de valores */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Valor Esperado</p>
                              <p className="text-base font-bold text-slate-800">{fmtBR(compRecord.valor_esperado)}</p>
                              <div className="mt-2 space-y-0.5 text-[10px] text-slate-500">
                                {compRecord.qtd_funcionarios != null && <p>{compRecord.qtd_funcionarios} funcionários ativos</p>}
                                {compRecord.qtd_admissoes != null && Number(compRecord.qtd_admissoes) > 0 && <p>{compRecord.qtd_admissoes} admissões</p>}
                                {compRecord.qtd_demissoes != null && Number(compRecord.qtd_demissoes) > 0 && <p>{compRecord.qtd_demissoes} desligamentos</p>}
                              </div>
                            </div>
                            <div className={`rounded-xl border p-3 ${compRecord.divergencia ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                              <p className="text-[10px] text-slate-500 mb-1 uppercase tracking-wide">Valor Cobrado</p>
                              <p className={`text-base font-bold ${compRecord.divergencia ? "text-amber-700" : "text-slate-800"}`}>
                                {compRecord.valor_cobrado ? fmtBR(compRecord.valor_cobrado) : "—"}
                              </p>
                              {compRecord.nota_numero && <p className="text-[10px] text-slate-500 mt-1">NF {compRecord.nota_numero}</p>}
                            </div>
                          </div>

                          {/* Ações disponíveis */}
                          <div className="flex flex-wrap gap-2">
                            {/* Recalcular */}
                            {(compRecord.status === "aberta" || compRecord.status === "com_fatura") && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                disabled={calcularMut.isPending}
                                onClick={() => calcularMut.mutate({ contratoId: contrato.id, companyId, competencia: comp })}>
                                {calcularMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Calculator className="h-3 w-3 mr-1" />}
                                Recalcular
                              </Button>
                            )}

                            {/* Registrar fatura */}
                            {(compRecord.status === "aberta" || compRecord.status === "com_fatura") && !showFaturaForm && (
                              <Button size="sm" variant="outline" className="h-7 text-xs"
                                onClick={() => { setShowFaturaForm(true); setFaturaForm({ ...emptyFaturaForm(), valorCobrado: String(compRecord.valor_cobrado ?? "") }); }}>
                                <Receipt className="h-3 w-3 mr-1" />
                                {compRecord.status === "com_fatura" ? "Atualizar fatura" : "Registrar fatura"}
                              </Button>
                            )}

                            {/* Aprovar */}
                            {compRecord.status === "com_fatura" && (
                              <Button size="sm" className="h-7 text-xs bg-sky-600 hover:bg-sky-700"
                                disabled={aprovarMut.isPending}
                                onClick={() => {
                                  if (compRecord.divergencia && !confirm("Há divergência nesta fatura. Confirma a aprovação assim mesmo?")) return;
                                  aprovarMut.mutate({ contratoId: contrato.id, companyId, competencia: comp, valorAprovado: Number(compRecord.valor_cobrado) });
                                }}>
                                {aprovarMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                                Aprovar e gerar título
                              </Button>
                            )}

                            {/* Aprovada */}
                            {(compRecord.status === "aprovada" || compRecord.status === "paga") && (
                              <div className="flex items-center gap-1 text-xs text-sky-700">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Aprovado por {compRecord.aprovado_por_nome}
                                {compRecord.financial_entry_id && <span className="text-slate-400 ml-1">· Título #{compRecord.financial_entry_id}</span>}
                              </div>
                            )}
                          </div>

                          {/* Formulário de fatura */}
                          {showFaturaForm && (
                            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
                              <p className="text-xs font-semibold text-slate-700">Registrar fatura</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <Label className="text-[11px] text-slate-500 mb-1 block">Valor cobrado (R$) *</Label>
                                  <Input className="h-7 text-xs" type="number" min="0" step="0.01"
                                    value={faturaForm.valorCobrado}
                                    onChange={e => setFaturaForm(f => ({ ...f, valorCobrado: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[11px] text-slate-500 mb-1 block">Número NF</Label>
                                  <Input className="h-7 text-xs" placeholder="Ex: 000123"
                                    value={faturaForm.notaNumero}
                                    onChange={e => setFaturaForm(f => ({ ...f, notaNumero: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[11px] text-slate-500 mb-1 block">Chave NF-e</Label>
                                  <Input className="h-7 text-xs" placeholder="44 dígitos"
                                    value={faturaForm.notaChave}
                                    onChange={e => setFaturaForm(f => ({ ...f, notaChave: e.target.value }))} />
                                </div>
                                <div className="col-span-2">
                                  <Label className="text-[11px] text-slate-500 mb-1 block">Observações</Label>
                                  <Input className="h-7 text-xs"
                                    value={faturaForm.observacoes}
                                    onChange={e => setFaturaForm(f => ({ ...f, observacoes: e.target.value }))} />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs" disabled={lancarMut.isPending || !faturaForm.valorCobrado}
                                  onClick={() => lancarMut.mutate({
                                    contratoId: contrato.id, companyId, competencia: comp,
                                    valorCobrado: Number(faturaForm.valorCobrado),
                                    notaNumero: faturaForm.notaNumero || null,
                                    notaChave: faturaForm.notaChave || null,
                                    observacoes: faturaForm.observacoes || null,
                                  })}>
                                  {lancarMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                  Salvar
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowFaturaForm(false)}>Cancelar</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Sem registro para este mês */
                        <div className="space-y-3">
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                            <Clock className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                            <p className="text-sm text-slate-600 font-medium">Nenhum registro para {monthName(comp)}</p>
                            <p className="text-xs text-slate-400 mt-1">Calcule o valor esperado com base nos dados de RH.</p>
                          </div>
                          {calcResult && (
                            <CalcResultCard result={calcResult} />
                          )}
                          <Button size="sm" disabled={calcularMut.isPending}
                            onClick={() => calcularMut.mutate({ contratoId: contrato.id, companyId, competencia: comp })}>
                            {calcularMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Calculator className="h-3.5 w-3.5 mr-1" />}
                            Calcular valor esperado
                          </Button>
                        </div>
                      )}

                      {/* Resultado de cálculo */}
                      {calcResult && compRecord && (
                        <CalcResultCard result={calcResult} />
                      )}

                      {/* Grid histórico */}
                      {(compsQ.data ?? []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Histórico</p>
                          <div className="space-y-1.5">
                            {compsQ.data?.map((c: any) => (
                              <button key={c.id} onClick={() => { setComp(c.competencia); setCalcResult(null); }}
                                className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition-colors hover:bg-slate-50 ${comp === c.competencia ? "border-sky-300 bg-sky-50" : "border-slate-200"}`}>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-slate-700 capitalize">{monthName(c.competencia)}</span>
                                  <div className="flex items-center gap-3">
                                    {c.divergencia && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COMP_LABEL[c.status]?.color ?? "bg-slate-100 text-slate-500"}`}>
                                      {STATUS_COMP_LABEL[c.status]?.label ?? c.status}
                                    </span>
                                    <span className="text-slate-700 font-semibold tabular-nums">
                                      {c.valor_cobrado ? fmtBR(c.valor_cobrado) : fmtBR(c.valor_esperado)}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null
        )}

        {/* Estado vazio */}
        {!selectedId && !showNew && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <FileSignature className="h-12 w-12 opacity-20" />
            <p className="text-sm">Selecione um contrato ou crie um novo</p>
            <Button size="sm" variant="outline" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> Novo contrato
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function ContratoFormFields({ form, setForm, fornecedores, isNew }: {
  form: ContratoForm; setForm: (f: (prev: ContratoForm) => ContratoForm) => void;
  fornecedores: any[]; isNew?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <Label className="text-[11px] text-slate-500 mb-1 block">Nome do contrato *</Label>
        <Input className="h-8 text-sm" placeholder="Ex: Contrato de Contabilidade — Escritório ABC"
          value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
      </div>
      <div>
        <Label className="text-[11px] text-slate-500 mb-1 block">Tipo de serviço</Label>
        <select className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
          value={form.tipoServico} onChange={e => setForm(f => ({ ...f, tipoServico: e.target.value }))}>
          {Object.entries(TIPOS_SERVICO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <Label className="text-[11px] text-slate-500 mb-1 block">Fornecedor</Label>
        <select className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
          value={form.fornecedorId ?? ""} onChange={e => setForm(f => ({ ...f, fornecedorId: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">— Nenhum —</option>
          {fornecedores.map((f: any) => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
        </select>
      </div>
      <div>
        <Label className="text-[11px] text-slate-500 mb-1 block">Vigência início</Label>
        <Input className="h-8 text-sm" type="date" value={form.vigenciaInicio}
          onChange={e => setForm(f => ({ ...f, vigenciaInicio: e.target.value }))} />
      </div>
      <div>
        <Label className="text-[11px] text-slate-500 mb-1 block">Vigência fim</Label>
        <Input className="h-8 text-sm" type="date" value={form.vigenciaFim}
          onChange={e => setForm(f => ({ ...f, vigenciaFim: e.target.value }))} />
      </div>
      <div>
        <Label className="text-[11px] text-slate-500 mb-1 block">Dia de vencimento</Label>
        <Input className="h-8 text-sm" type="number" min="1" max="31" value={form.diaVencimento}
          onChange={e => setForm(f => ({ ...f, diaVencimento: Number(e.target.value) }))} />
      </div>
      <div>
        <Label className="text-[11px] text-slate-500 mb-1 block">Tolerância de divergência (%)</Label>
        <Input className="h-8 text-sm" type="number" min="0" max="100" step="0.5" value={form.toleranciaDivergencia}
          onChange={e => setForm(f => ({ ...f, toleranciaDivergencia: Number(e.target.value) }))} />
      </div>
      <div className="col-span-2 flex items-center gap-2">
        <input type="checkbox" id="renovacao" checked={form.renovacaoAutomatica}
          onChange={e => setForm(f => ({ ...f, renovacaoAutomatica: e.target.checked }))} className="rounded" />
        <Label htmlFor="renovacao" className="text-xs text-slate-600 cursor-pointer">Renovação automática</Label>
      </div>
      {!isNew && (
        <div>
          <Label className="text-[11px] text-slate-500 mb-1 block">Status</Label>
          <select className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
            value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="ativo">Ativo</option>
            <option value="encerrado">Encerrado</option>
          </select>
        </div>
      )}
      <div className="col-span-2">
        <Label className="text-[11px] text-slate-500 mb-1 block">Observações</Label>
        <textarea className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 h-16 resize-none"
          placeholder="Informações adicionais sobre o contrato..."
          value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
      </div>
    </div>
  );
}

function ContratoDetail({ contrato }: { contrato: any }) {
  const rows = [
    { label: "Tipo de serviço",         value: TIPOS_SERVICO_LABEL[contrato.tipo_servico] ?? contrato.tipo_servico },
    { label: "Fornecedor",              value: contrato.fornecedor_nome ?? "—" },
    { label: "Vigência",                value: `${contrato.vigencia_inicio?.slice(0,10) ?? "—"} até ${contrato.vigencia_fim?.slice(0,10) ?? "indeterminada"}` },
    { label: "Renovação automática",    value: contrato.renovacao_automatica ? "Sim" : "Não" },
    { label: "Dia de vencimento",       value: `Todo dia ${contrato.dia_vencimento}` },
    { label: "Tolerância de divergência", value: `${contrato.tolerancia_divergencia}%` },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {rows.map(r => (
          <div key={r.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{r.label}</p>
            <p className="text-xs font-medium text-slate-700">{r.value}</p>
          </div>
        ))}
      </div>
      {contrato.observacoes && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5 flex items-center gap-1"><Info className="h-3 w-3" /> Observações</p>
          <p className="text-xs text-slate-600 whitespace-pre-wrap">{contrato.observacoes}</p>
        </div>
      )}
    </div>
  );
}

function CalcResultCard({ result }: { result: any }) {
  if (!result) return null;
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-2">
      <p className="text-xs font-semibold text-sky-800 flex items-center gap-1.5">
        <Calculator className="h-3.5 w-3.5" /> Resultado do cálculo
      </p>
      <div className="flex items-end justify-between">
        <div className="space-y-0.5 text-[11px] text-sky-700">
          <p>{result.qtdAtivos} funcionários ativos</p>
          {result.qtdAdmissoes > 0 && <p>{result.qtdAdmissoes} admissões</p>}
          {result.qtdDemissoes > 0 && <p>{result.qtdDemissoes} desligamentos</p>}
        </div>
        <p className="text-lg font-bold text-sky-800">{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(result.valorEsperado)}</p>
      </div>
      {result.breakdown?.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-sky-200">
          {result.breakdown.map((b: any, i: number) => (
            <div key={i} className="flex justify-between text-[10px] text-sky-700">
              <span>{TIPOS_ITEM_LABEL[b.tipo] ?? b.tipo}{b.qtd > 1 ? ` (×${b.qtd})` : ""}</span>
              <span className="font-medium">{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(b.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemIcon({ tipo }: { tipo: string }) {
  const cls = "h-3.5 w-3.5 flex-shrink-0";
  if (tipo === "por_funcionario_ativo") return <Users className={`${cls} text-sky-500`} />;
  if (tipo === "por_admissao")          return <UserPlus className={`${cls} text-green-500`} />;
  if (tipo === "por_demissao")          return <UserMinus className={`${cls} text-red-400`} />;
  if (tipo === "por_exame")             return <Stethoscope className={`${cls} text-purple-500`} />;
  if (tipo === "por_folha")             return <DollarSign className={`${cls} text-amber-500`} />;
  if (tipo === "fixo")                  return <Receipt className={`${cls} text-slate-500`} />;
  return <FileSignature className={`${cls} text-slate-400`} />;
}
