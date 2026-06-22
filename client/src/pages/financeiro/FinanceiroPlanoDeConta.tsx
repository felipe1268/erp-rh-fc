import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, BookOpen, Pencil, Trash2, Check, ChevronsUpDown,
  ChevronRight, Layers, Tag, ArrowRight, Info, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tipos e constantes ────────────────────────────────────────────────────────

const TIPOS = [
  {
    value: "receita_bruta",
    label: "Receita Bruta",
    desc: "Faturamento da empresa: obras, serviços prestados, medições.",
    group: "receita",
  },
  {
    value: "deducao_receita",
    label: "Dedução da Receita",
    desc: "Impostos sobre vendas (ISS, PIS, COFINS), devoluções.",
    group: "receita",
  },
  {
    value: "custo_obra",
    label: "Custo de Obra",
    desc: "Material, mão de obra e subcontratados diretamente na obra.",
    group: "custo",
  },
  {
    value: "despesa_fixa",
    label: "Despesa Fixa",
    desc: "Gastos mensais que não variam: aluguel, salários admin.",
    group: "despesa",
  },
  {
    value: "despesa_variavel",
    label: "Despesa Variável",
    desc: "Gastos que variam conforme a operação: combustível, viagem.",
    group: "despesa",
  },
  {
    value: "despesa_financeira",
    label: "Despesa Financeira",
    desc: "Juros, tarifas bancárias, IOF, multas.",
    group: "despesa",
  },
  {
    value: "receita_financeira",
    label: "Receita Financeira",
    desc: "Rendimentos de aplicações, juros recebidos.",
    group: "receita",
  },
  {
    value: "imposto_resultado",
    label: "Imposto s/ Resultado",
    desc: "IRPJ, CSLL — impostos sobre o lucro da empresa.",
    group: "imposto",
  },
];

const TIPO_META: Record<string, { color: string; bar: string }> = {
  receita_bruta:      { color: "bg-emerald-100 text-emerald-800 border-emerald-200", bar: "bg-emerald-400" },
  deducao_receita:    { color: "bg-yellow-100  text-yellow-800  border-yellow-200",  bar: "bg-yellow-400"  },
  custo_obra:         { color: "bg-orange-100  text-orange-800  border-orange-200",  bar: "bg-orange-400"  },
  despesa_fixa:       { color: "bg-red-100     text-red-800     border-red-200",     bar: "bg-red-400"     },
  despesa_variavel:   { color: "bg-pink-100    text-pink-800    border-pink-200",    bar: "bg-pink-400"    },
  despesa_financeira: { color: "bg-violet-100  text-violet-800  border-violet-200",  bar: "bg-violet-400"  },
  receita_financeira: { color: "bg-teal-100    text-teal-800    border-teal-200",    bar: "bg-teal-400"    },
  imposto_resultado:  { color: "bg-slate-100   text-slate-700   border-slate-200",   bar: "bg-slate-400"   },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cmpCodigo(a: string, b: string): number {
  const pa = String(a).split(".").map((s) => Number(s) || 0);
  const pb = String(b).split(".").map((s) => Number(s) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? -1, y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

function suggestNextCode(parentCodigo: string, allCodigos: string[]): string {
  if (!parentCodigo) {
    const raizes = allCodigos.map((c) => Number(String(c).split(".")[0])).filter((n) => Number.isFinite(n) && n > 0);
    return String(raizes.length ? Math.max(...raizes) + 1 : 1);
  }
  const prefix = `${parentCodigo}.`;
  const filhos = allCodigos
    .filter((c) => c.startsWith(prefix))
    .map((c) => Number(c.slice(prefix.length).split(".")[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
  return `${parentCodigo}.${filhos.length ? Math.max(...filhos) + 1 : 1}`;
}

type FormState = {
  id?: number;
  codigo: string; nome: string; tipo: string; natureza: string;
  nivel: number; contaPaiId: string; classificacaoDRE: string; ordem: string;
};

const EMPTY_FORM: FormState = {
  codigo: "", nome: "", tipo: "custo_obra", natureza: "devedora",
  nivel: 1, contaPaiId: "", classificacaoDRE: "", ordem: "0",
};

// ─── Sub-componente: legenda de cores ─────────────────────────────────────────

function LegendaCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-blue-100 bg-blue-50 rounded-lg p-3">
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex items-center gap-2 text-xs font-medium text-blue-700">
          <Info className="w-3.5 h-3.5" />
          Como funciona o Plano de Contas?
        </span>
        <ChevronRight className={cn("w-3.5 h-3.5 text-blue-400 transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Hierarquia */}
          <div>
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Hierarquia (níveis)</p>
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
                <span><strong>Grupo principal</strong> — ex: <code className="bg-white px-1 rounded">1 RECEITAS BRUTAS</code> — aparece em negrito, com barra colorida</span>
              </div>
              <div className="flex items-center gap-2 pl-3">
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <span><strong>Subconta</strong> — ex: <code className="bg-white px-1 rounded">1.1 Rec. de Engenharia</code> — criada dentro de um grupo</span>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                <span><strong>Detalhe</strong> — ex: <code className="bg-white px-1 rounded">1.1.1 Medições de Obras</code> — nível mais específico</span>
              </div>
            </div>
          </div>

          {/* Tipos */}
          <div>
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">O que significa cada tipo (cor da barra)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {TIPOS.map(t => {
                const meta = TIPO_META[t.value];
                return (
                  <div key={t.value} className="flex items-start gap-2">
                    <Badge className={cn("text-[10px] border shrink-0 mt-0.5", meta.color)}>{t.label}</Badge>
                    <span className="text-[11px] text-slate-500">{t.desc}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Natureza */}
          <div>
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Natureza da conta</p>
            <div className="space-y-1 text-[11px] text-slate-600">
              <div className="flex items-start gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 shrink-0">credora</span>
                <span>Contas de <strong>receita e passivo</strong> — aumentam com entradas de dinheiro.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 shrink-0">devedora</span>
                <span>Contas de <strong>despesa e ativo</strong> — aumentam com saídas de dinheiro.</span>
              </div>
            </div>
          </div>

          {/* Botões da lista */}
          <div>
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Botões em cada linha</p>
            <div className="space-y-1 text-[11px] text-slate-600">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-white border rounded"><Plus className="w-3 h-3 text-blue-500" /></span>
                <span>Cria uma <strong>subconta</strong> dentro desta conta</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="p-1 bg-white border rounded"><Pencil className="w-3 h-3 text-slate-500" /></span>
                <span><strong>Edita</strong> o nome, tipo ou natureza</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="p-1 bg-white border rounded"><Trash2 className="w-3 h-3 text-red-400" /></span>
                <span><strong>Exclui</strong> a conta (bloqueado se tiver lançamentos)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function FinanceiroPlanoDeConta() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [paiPopoverOpen, setPaiPopoverOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [showAvancado, setShowAvancado] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: contas, isLoading, refetch } = (trpc as any).financial.getAccounts.useQuery(
    { companyId, escopo: "plano", ativo: true, tipo: tipoFilter !== "all" ? tipoFilter : undefined },
    { enabled: !!companyId }
  );

  const allContas: any[] = Array.isArray(contas) ? contas : [];

  const createMut = (trpc as any).financial.createAccount.useMutation({
    onSuccess: () => { toast({ title: "Conta criada!" }); closeDialog(); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const updateMut = (trpc as any).financial.updateAccount.useMutation({
    onSuccess: () => { toast({ title: "Conta atualizada!" }); closeDialog(); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteMut = (trpc as any).financial.deleteAccount.useMutation({
    onSuccess: (r: any) => { toast({ title: "Conta excluída!", description: `${r.codigo} — ${r.nome}` }); setDeleteTarget(null); refetch(); },
    onError: (e: any) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });
  async function handleBulkDelete() {
    setBulkDeleting(true);
    let ok = 0; let fail = 0;
    for (const id of Array.from(selectedIds)) {
      try {
        await deleteMut.mutateAsync({ id, companyId } as any);
        ok++;
      } catch { fail++; }
    }
    setBulkDeleting(false);
    setBulkConfirm(false);
    setSelectedIds(new Set());
    refetch();
    if (fail === 0) toast({ title: `${ok} conta(s) excluída(s) com sucesso.` });
    else toast({ title: `${ok} excluída(s), ${fail} não puderam ser excluídas.`, variant: "destructive" });
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((c: any) => c.id)));
  }

  const sortedContas = useMemo(() => [...allContas].sort((a, b) => cmpCodigo(a.codigo, b.codigo)), [allContas]);
  const filtered = useMemo(() => sortedContas.filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q);
  }), [sortedContas, search]);

  const eligibleParents = useMemo(() => {
    const editingCodigo = form.id ? allContas.find((c) => c.id === form.id)?.codigo : null;
    return sortedContas.filter((c: any) => {
      if (!editingCodigo) return true;
      if (c.id === form.id) return false;
      if (c.codigo === editingCodigo || c.codigo.startsWith(`${editingCodigo}.`)) return false;
      return true;
    });
  }, [sortedContas, form.id, allContas]);

  function openCreate(parentId?: number) {
    if (parentId != null) {
      const pai = allContas.find((c) => c.id === parentId);
      if (pai) {
        const allCodigos = allContas.map((c) => String(c.codigo));
        setForm({
          ...EMPTY_FORM,
          contaPaiId: String(parentId),
          codigo: suggestNextCode(String(pai.codigo), allCodigos),
          nivel: (Number(pai.nivel) || 1) + 1,
          tipo: pai.tipo,
          natureza: pai.natureza,
        });
        setDialogOpen(true);
        return;
      }
    }
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: any) {
    setForm({
      id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, natureza: c.natureza,
      nivel: Number(c.nivel) || 1,
      contaPaiId: c.contaPaiId ? String(c.contaPaiId) : "",
      classificacaoDRE: c.classificacaoDRE ?? "", ordem: String(c.ordem ?? 0),
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setForm(EMPTY_FORM);
    setShowAvancado(false);
  }

  function onPickParent(paiId: string) {
    if (!paiId) {
      const allCodigos = allContas.filter((c) => c.id !== form.id).map((c) => String(c.codigo));
      setForm((f) => ({ ...f, contaPaiId: "", codigo: f.id ? f.codigo : suggestNextCode("", allCodigos), nivel: 1 }));
      return;
    }
    const pai = allContas.find((c) => String(c.id) === paiId);
    if (!pai) return;
    const allCodigos = allContas.filter((c) => c.id !== form.id).map((c) => String(c.codigo));
    setForm((f) => ({
      ...f, contaPaiId: paiId,
      codigo: suggestNextCode(String(pai.codigo), allCodigos),
      nivel: (Number(pai.nivel) || 1) + 1,
      tipo: f.id ? f.tipo : pai.tipo,
      natureza: f.id ? f.natureza : pai.natureza,
    }));
  }

  function handleSave() {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (!form.codigo.trim()) { toast({ title: "Código obrigatório", variant: "destructive" }); return; }
    const payload = {
      companyId, nome: form.nome, tipo: form.tipo, natureza: form.natureza,
      contaPaiId: form.contaPaiId ? Number(form.contaPaiId) : null,
      classificacaoDRE: form.classificacaoDRE || undefined,
      ordem: parseInt(form.ordem) || 0,
      nivel: form.nivel, codigo: form.codigo,
    };
    if (form.id) updateMut.mutate({ id: form.id, ...payload } as any);
    else createMut.mutate({ ...payload, escopo: "plano" } as any);
  }

  const paiSelecionado = form.contaPaiId ? eligibleParents.find((c: any) => String(c.id) === form.contaPaiId) : null;
  const tipoAtual = TIPOS.find(t => t.value === form.tipo);

  const countByTipo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of allContas) m[c.tipo] = (m[c.tipo] ?? 0) + 1;
    return m;
  }, [allContas]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Plano de Contas
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{allContas.length} conta(s) cadastrada(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => openCreate()} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1.5" />Nova Conta
            </Button>
          </div>
        </div>

        {/* ── Legenda ── */}
        <LegendaCard />

        {/* ── Chips de tipo ── */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTipoFilter("all")}
            className={cn("text-xs px-3 py-1 rounded-full border font-medium transition-colors",
              tipoFilter === "all"
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400")}
          >
            Todos
          </button>
          {TIPOS.map(t => {
            const meta = TIPO_META[t.value];
            const active = tipoFilter === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTipoFilter(t.value)}
                title={t.desc}
                className={cn("text-xs px-3 py-1 rounded-full border font-medium transition-colors",
                  active ? `${meta.color} border-current` : "bg-white text-slate-500 border-slate-200 hover:border-slate-300")}
              >
                {t.label}
                {countByTipo[t.value] ? <span className="ml-1 opacity-60">{countByTipo[t.value]}</span> : null}
              </button>
            );
          })}
        </div>

        {/* ── Busca ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9 bg-white"
            placeholder="Buscar por código ou nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ── Barra de seleção múltipla ── */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <span className="text-sm font-medium text-red-700">
              {selectedIds.size} conta(s) selecionada(s)
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}
                className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-100">
                Cancelar
              </Button>
              <Button size="sm" onClick={() => setBulkConfirm(true)}
                className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">
                <Trash2 className="w-3 h-3 mr-1" />
                Excluir {selectedIds.size} selecionada(s)
              </Button>
            </div>
          </div>
        )}

        {/* ── Lista de contas ── */}
        <Card className="border border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center text-slate-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Nenhuma conta cadastrada.</p>
                <p className="text-sm mt-1">Clique em <strong>"+ Nova Conta"</strong> para começar.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {/* Cabeçalho "selecionar todos" */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    className="w-4 h-4"
                    aria-label="Selecionar todas"
                  />
                  <span className="text-xs text-slate-400">Selecionar todas</span>
                </div>

                {filtered.map((c: any) => {
                  const nivel = Number(c.nivel) || 1;
                  const meta = TIPO_META[c.tipo] ?? TIPO_META.despesa_fixa;
                  const tipoLabel = TIPOS.find(t => t.value === c.tipo)?.label ?? c.tipo;
                  const tipoDesc = TIPOS.find(t => t.value === c.tipo)?.desc ?? "";
                  const isRaiz = nivel === 1;
                  const isSel = selectedIds.has(c.id);

                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "flex items-center gap-0 hover:bg-slate-50 group transition-colors",
                        isRaiz && !isSel && "bg-slate-50/70",
                        isSel && "bg-blue-50",
                      )}
                    >
                      {/* Barra colorida lateral */}
                      <div className={cn("w-1 self-stretch flex-shrink-0", isRaiz ? meta.bar : "bg-transparent")} />

                      {/* Checkbox */}
                      <div className="pl-2 pr-1 flex items-center self-stretch">
                        <Checkbox
                          checked={isSel}
                          onCheckedChange={() => toggleSelect(c.id)}
                          className="w-4 h-4"
                          aria-label={`Selecionar ${c.nome}`}
                        />
                      </div>

                      {/* Conteúdo com indentação */}
                      <div
                        className="flex items-center gap-2 flex-1 min-w-0 py-2.5 pr-1"
                        style={{ paddingLeft: `${8 + (nivel - 1) * 20}px` }}
                      >
                        {nivel > 1 && (
                          <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                        )}
                        <span className={cn(
                          "font-mono flex-shrink-0 text-right",
                          isRaiz ? "text-xs font-bold text-slate-700 w-16" : "text-[11px] text-slate-400 w-14",
                        )}>
                          {c.codigo}
                        </span>
                        <span className={cn(
                          "truncate flex-1",
                          nivel === 1 ? "text-sm font-bold text-slate-900" :
                          nivel === 2 ? "text-sm font-semibold text-slate-700" :
                          "text-sm text-slate-600",
                        )} title={c.nome}>
                          {c.nome}
                        </span>
                      </div>

                      {/* Badges + ações */}
                      <div className="flex items-center gap-1 pr-2 shrink-0">
                        <Badge
                          className={cn("text-[11px] border hidden sm:inline-flex", meta.color)}
                          title={tipoDesc}
                        >
                          {tipoLabel}
                        </Badge>
                        <span
                          className={cn(
                            "text-[11px] px-2 py-0.5 rounded-full hidden lg:inline-block",
                            c.natureza === "credora" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                          )}
                          title={c.natureza === "credora" ? "Credora" : "Devedora"}
                        >
                          {c.natureza}
                        </span>

                        {/* Ações — sempre visíveis */}
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Criar subconta dentro desta"
                            onClick={() => openCreate(c.id)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                            title="Editar esta conta"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title="Excluir esta conta"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Modal Nova / Editar ── */}
        <Dialog open={dialogOpen} onOpenChange={(o) => o ? setDialogOpen(true) : closeDialog()}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" />
                {form.id ? "Editar Conta" : "Nova Conta"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 pt-1">

              {/* ── Grupo pai ── */}
              <div>
                <Label className="text-sm font-semibold text-slate-800">
                  Dentro de qual grupo?
                </Label>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-2">
                  Escolha uma conta existente para criar uma <strong>subconta</strong> (ex: "1.1 dentro de 1"), ou deixe em branco para criar um <strong>grupo principal</strong> (nível raiz).
                </p>
                <Popover open={paiPopoverOpen} onOpenChange={setPaiPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "w-full flex items-center justify-between rounded-md border px-3 h-10 text-sm bg-white transition-colors",
                        paiPopoverOpen ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300",
                      )}
                    >
                      {paiSelecionado ? (
                        <span className="flex items-center gap-2 text-slate-900 truncate">
                          <span className="font-mono text-xs text-slate-500">{paiSelecionado.codigo}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{paiSelecionado.nome}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          Grupo principal (conta de nível 1)
                        </span>
                      )}
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {paiSelecionado && (
                          <span
                            className="text-slate-400 hover:text-red-500 px-1 text-base leading-none"
                            role="button"
                            tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPickParent(""); setPaiPopoverOpen(false); }}
                          >×</span>
                        )}
                        <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                    <Command filter={(v, q) => {
                      const n = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      return n(v).includes(n(q)) ? 1 : 0;
                    }}>
                      <CommandInput placeholder="Buscar conta..." />
                      <CommandList className="max-h-72">
                        <CommandEmpty className="py-6 text-center text-sm text-slate-400">Nenhuma conta encontrada.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="--sem-pai--"
                            onSelect={() => { onPickParent(""); setPaiPopoverOpen(false); }}
                            className="text-xs text-slate-500 italic"
                          >
                            <Check className={cn("w-3.5 h-3.5 mr-2 text-blue-600", !form.contaPaiId ? "opacity-100" : "opacity-0")} />
                            <Layers className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                            Grupo principal (sem pai)
                          </CommandItem>
                          {eligibleParents.map((p: any) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.codigo} ${p.nome}`}
                              onSelect={() => { onPickParent(String(p.id)); setPaiPopoverOpen(false); }}
                              className="text-xs"
                              style={{ paddingLeft: `${12 + ((Number(p.nivel) || 1) - 1) * 12}px` }}
                            >
                              <Check className={cn("w-3.5 h-3.5 mr-2 text-blue-600 shrink-0", String(p.id) === form.contaPaiId ? "opacity-100" : "opacity-0")} />
                              <span className="font-mono text-slate-400 mr-2 shrink-0">{p.codigo}</span>
                              <span className={cn("truncate", Number(p.nivel) === 1 ? "font-semibold text-slate-800" : "text-slate-700")}>{p.nome}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="h-px bg-slate-100" />

              {/* ── Código + Nome ── */}
              <div className="grid grid-cols-[140px,1fr] gap-3">
                <div>
                  <Label className="text-sm font-semibold text-slate-800">Código *</Label>
                  <p className="text-[11px] text-slate-500 mt-0.5 mb-1.5">
                    Identificador único. Ex: <code>1</code>, <code>1.1</code>, <code>1.1.2</code>
                  </p>
                  <Input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                    placeholder={paiSelecionado ? `${paiSelecionado.codigo}.X` : "Ex: 1"}
                    className="font-mono"
                  />
                  {paiSelecionado && (
                    <p className="text-[10px] text-blue-500 mt-1">Gerado automaticamente — você pode editar.</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-semibold text-slate-800">Nome *</Label>
                  <p className="text-[11px] text-slate-500 mt-0.5 mb-1.5">
                    Nome descritivo que aparece nos relatórios.
                  </p>
                  <Input
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Receitas de Obras"
                    autoFocus
                  />
                </div>
              </div>

              {/* ── Tipo ── */}
              <div>
                <Label className="text-sm font-semibold text-slate-800">Tipo</Label>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-1.5">
                  Classifica a conta no DRE e nos relatórios financeiros.
                </p>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <div>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-[11px] text-slate-500">{t.desc}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tipoAtual && (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                    <HelpCircle className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
                    {tipoAtual.desc}
                  </p>
                )}
              </div>

              {/* ── Natureza ── */}
              <div>
                <Label className="text-sm font-semibold text-slate-800">Natureza</Label>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-1.5">
                  Define como o saldo se comporta: <strong>Credora</strong> = receitas e passivos · <strong>Devedora</strong> = despesas e ativos.
                </p>
                <Select value={form.natureza} onValueChange={v => setForm(f => ({ ...f, natureza: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credora">
                      <div>
                        <div className="font-medium">Credora</div>
                        <div className="text-[11px] text-slate-500">Contas de receita, passivo e patrimônio</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="devedora">
                      <div>
                        <div className="font-medium">Devedora</div>
                        <div className="text-[11px] text-slate-500">Contas de despesa, custo e ativo</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ── Avançado (colapsível) ── */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAvancado(v => !v)}
                  className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                >
                  <ChevronRight className={cn("w-3 h-3 transition-transform", showAvancado && "rotate-90")} />
                  Configurações avançadas (Classificação DRE · Ordem de exibição)
                </button>
                {showAvancado && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label className="text-sm font-semibold text-slate-800">Classificação DRE</Label>
                      <p className="text-[11px] text-slate-500 mt-0.5 mb-1.5">
                        Código para agrupamento no Demonstrativo de Resultado. Ex: <code>3.1</code>. Opcional.
                      </p>
                      <Input value={form.classificacaoDRE} onChange={e => setForm(f => ({ ...f, classificacaoDRE: e.target.value }))} placeholder="Opcional" />
                    </div>
                    <div>
                      <Label className="text-sm font-semibold text-slate-800">Ordem de exibição</Label>
                      <p className="text-[11px] text-slate-500 mt-0.5 mb-1.5">
                        Número que define a posição desta conta nos relatórios. Menor número aparece primeiro.
                      </p>
                      <Input type="number" value={form.ordem} onChange={e => setForm(f => ({ ...f, ordem: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {createMut.isPending || updateMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Confirmação excluir ── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conta contábil?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteTarget?.codigo} — {deleteTarget?.nome}</strong>
                <br />
                A conta será desativada. Se houver lançamentos ou subcontas vinculadas, a exclusão será bloqueada.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTarget && deleteMut.mutate({ id: deleteTarget.id, companyId })}
                disabled={deleteMut.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteMut.isPending ? "Excluindo..." : "Excluir"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Confirmação excluir múltiplos ── */}
        <AlertDialog open={bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir {selectedIds.size} conta(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                As contas selecionadas serão desativadas. Contas com lançamentos ou subcontas vinculadas serão puladas automaticamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {bulkDeleting ? "Excluindo..." : `Excluir ${selectedIds.size} conta(s)`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </DashboardLayout>
  );
}
