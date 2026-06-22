import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Plus, Search, BookOpen, Sprout, Pencil, Trash2, Check, ChevronsUpDown,
  ChevronRight, Layers, Tag, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tipos e constantes ────────────────────────────────────────────────────────

const TIPOS = [
  { value: "receita_bruta",       label: "Receita Bruta",          group: "receita" },
  { value: "deducao_receita",     label: "Dedução da Receita",      group: "receita" },
  { value: "custo_obra",          label: "Custo de Obra",           group: "custo"   },
  { value: "despesa_fixa",        label: "Despesa Fixa",            group: "despesa" },
  { value: "despesa_variavel",    label: "Despesa Variável",        group: "despesa" },
  { value: "despesa_financeira",  label: "Despesa Financeira",      group: "despesa" },
  { value: "receita_financeira",  label: "Receita Financeira",      group: "receita" },
  { value: "imposto_resultado",   label: "Imposto s/ Resultado",    group: "imposto" },
];

const TIPO_META: Record<string, { color: string; bar: string; dot: string }> = {
  receita_bruta:      { color: "bg-emerald-100 text-emerald-800 border-emerald-200", bar: "bg-emerald-400", dot: "#10b981" },
  deducao_receita:    { color: "bg-yellow-100  text-yellow-800  border-yellow-200",  bar: "bg-yellow-400",  dot: "#eab308" },
  custo_obra:         { color: "bg-orange-100  text-orange-800  border-orange-200",  bar: "bg-orange-400",  dot: "#f97316" },
  despesa_fixa:       { color: "bg-red-100     text-red-800     border-red-200",     bar: "bg-red-400",     dot: "#ef4444" },
  despesa_variavel:   { color: "bg-pink-100    text-pink-800    border-pink-200",    bar: "bg-pink-400",    dot: "#ec4899" },
  despesa_financeira: { color: "bg-violet-100  text-violet-800  border-violet-200",  bar: "bg-violet-400",  dot: "#8b5cf6" },
  receita_financeira: { color: "bg-teal-100    text-teal-800    border-teal-200",    bar: "bg-teal-400",    dot: "#14b8a6" },
  imposto_resultado:  { color: "bg-slate-100   text-slate-700   border-slate-200",   bar: "bg-slate-400",   dot: "#64748b" },
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
  const filhos = allCodigos.filter((c) => c.startsWith(prefix)).map((c) => Number(c.slice(prefix.length).split(".")[0])).filter((n) => Number.isFinite(n) && n > 0);
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

  const { data: contas, isLoading, refetch } = (trpc as any).financial.getAccounts.useQuery(
    { companyId, escopo: "plano", ativo: true, tipo: tipoFilter !== "all" ? tipoFilter : undefined },
    { enabled: !!companyId }
  );

  const allContas: any[] = Array.isArray(contas) ? contas : [];

  const seedMut = (trpc as any).financial.seedAccounts.useMutation({
    onSuccess: () => { toast({ title: "Plano de contas carregado!" }); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
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
      ...f, contaPaiId: paiId, codigo: suggestNextCode(String(pai.codigo), allCodigos),
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

  // Contadores por grupo de tipo
  const countByTipo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of allContas) m[c.tipo] = (m[c.tipo] ?? 0) + 1;
    return m;
  }, [allContas]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">

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
            <Button variant="outline" size="sm" onClick={() => seedMut.mutate({ companyId })} disabled={seedMut.isPending}>
              <Sprout className="w-4 h-4 mr-1.5 text-emerald-600" />
              {seedMut.isPending ? "Carregando..." : "Carregar Padrão"}
            </Button>
            <Button size="sm" onClick={() => openCreate()} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1.5" />Nova Conta
            </Button>
          </div>
        </div>

        {/* ── Chips de tipo (resumo visual) ── */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTipoFilter("all")}
            className={cn("text-xs px-3 py-1 rounded-full border font-medium transition-colors",
              tipoFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400")}
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
          <Input className="pl-9 bg-white" placeholder="Buscar por código ou nome..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* ── Lista de contas ── */}
        <Card className="border border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-10 text-center text-slate-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Nenhuma conta cadastrada.</p>
                <p className="text-sm mt-1">Clique em "Carregar Padrão" para usar o plano FC Engenharia.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filtered.map((c: any) => {
                  const nivel = Number(c.nivel) || 1;
                  const meta = TIPO_META[c.tipo] ?? TIPO_META.despesa_fixa;
                  const tipoLabel = TIPOS.find(t => t.value === c.tipo)?.label ?? c.tipo;
                  const isRaiz = nivel === 1;

                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "flex items-center gap-0 hover:bg-slate-50 group transition-colors",
                        isRaiz && "bg-slate-50/70",
                      )}
                    >
                      {/* Barra colorida lateral por tipo */}
                      <div className={cn("w-1 self-stretch flex-shrink-0", isRaiz ? meta.bar : "bg-transparent")} />

                      {/* Indentação com marcador de hierarquia */}
                      <div
                        className="flex items-center gap-2 flex-1 min-w-0 py-2.5 pr-3"
                        style={{ paddingLeft: `${12 + (nivel - 1) * 22}px` }}
                      >
                        {/* Indicador de nível */}
                        {nivel > 1 && (
                          <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                        )}

                        {/* Código */}
                        <span className={cn(
                          "font-mono flex-shrink-0 text-right",
                          isRaiz ? "text-xs font-bold text-slate-700 w-16" : "text-[11px] text-slate-400 w-16",
                        )}>
                          {c.codigo}
                        </span>

                        {/* Nome */}
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
                      <div className="flex items-center gap-1.5 pr-3 shrink-0">
                        <Badge className={cn("text-[11px] border hidden sm:inline-flex", meta.color)}>
                          {tipoLabel}
                        </Badge>
                        <span className={cn(
                          "text-[11px] px-2 py-0.5 rounded-full hidden md:inline-block",
                          c.natureza === "credora" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                        )}>
                          {c.natureza}
                        </span>

                        {/* Ações — aparecem no hover */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                          <button
                            className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Adicionar subconta"
                            onClick={() => openCreate(c.id)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                            title="Editar"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title="Excluir"
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600" />
                {form.id ? "Editar Conta" : "Nova Conta"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">

              {/* ── Conta Pai ─────────────────────────────────────────────── */}
              <div>
                <Label className="text-sm font-medium text-slate-700">
                  Dentro de qual grupo?
                </Label>
                <p className="text-[11px] text-slate-400 mb-1.5">
                  Escolha uma conta existente para criar uma subconta, ou deixe em branco para criar um grupo principal.
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
                          Grupo principal (sem pai)
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

              {/* ── Separador visual ── */}
              <div className="h-px bg-slate-100" />

              {/* ── Código (auto) + Nome ── */}
              <div className="grid grid-cols-[140px,1fr] gap-3">
                <div>
                  <Label className="text-sm">Código *</Label>
                  <Input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                    placeholder={paiSelecionado ? `${paiSelecionado.codigo}.X` : "Ex: 4"}
                    className="font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {paiSelecionado ? "Gerado automaticamente — você pode editar." : "Número ou código livre."}
                  </p>
                </div>
                <div>
                  <Label className="text-sm">Nome *</Label>
                  <Input
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Nome da conta"
                    autoFocus
                  />
                </div>
              </div>

              {/* ── Tipo + Natureza ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm">Natureza</Label>
                  <Select value={form.natureza} onValueChange={v => setForm(f => ({ ...f, natureza: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="devedora">Devedora</SelectItem>
                      <SelectItem value="credora">Credora</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Avançado (colapsível) ── */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAvancado(v => !v)}
                  className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
                >
                  <ChevronRight className={cn("w-3 h-3 transition-transform", showAvancado && "rotate-90")} />
                  Configurações avançadas (DRE · Ordem)
                </button>
                {showAvancado && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <Label className="text-sm">Classificação DRE</Label>
                      <Input value={form.classificacaoDRE} onChange={e => setForm(f => ({ ...f, classificacaoDRE: e.target.value }))} placeholder="Opcional" />
                    </div>
                    <div>
                      <Label className="text-sm">Ordem</Label>
                      <Input type="number" value={form.ordem} onChange={e => setForm(f => ({ ...f, ordem: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="mt-2">
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

        {/* ── Confirm excluir ── */}
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

      </div>
    </DashboardLayout>
  );
}
