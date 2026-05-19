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
import { Plus, Search, BookOpen, Sprout, Pencil, Trash2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TIPOS = [
  { value: "receita_bruta", label: "Receita Bruta" },
  { value: "deducao_receita", label: "Dedução da Receita" },
  { value: "custo_obra", label: "Custo de Obra" },
  { value: "despesa_fixa", label: "Despesa Fixa" },
  { value: "despesa_variavel", label: "Despesa Variável" },
  { value: "despesa_financeira", label: "Despesa Financeira" },
  { value: "receita_financeira", label: "Receita Financeira" },
  { value: "imposto_resultado", label: "Imposto sobre Resultado" },
];

const TIPO_COLORS: Record<string, string> = {
  receita_bruta: "bg-green-100 text-green-800",
  deducao_receita: "bg-yellow-100 text-yellow-800",
  custo_obra: "bg-orange-100 text-orange-800",
  despesa_fixa: "bg-red-100 text-red-800",
  despesa_variavel: "bg-pink-100 text-pink-800",
  despesa_financeira: "bg-purple-100 text-purple-800",
  receita_financeira: "bg-teal-100 text-teal-800",
  imposto_resultado: "bg-gray-100 text-gray-800",
};

// Rev. 2166 — comparador natural por código contábil ("4.9" < "4.10" < "5").
function cmpCodigo(a: string, b: string): number {
  const pa = String(a).split(".").map((s) => Number(s) || 0);
  const pb = String(b).split(".").map((s) => Number(s) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

// Próximo código filho de `parent` (ex.: pai "4" + filhos ["4.1","4.2","4.9"] → "4.10").
// Se `parent` for vazio, devolve próxima raiz (ex.: existentes [1,2,3,4,5] → "6").
function suggestNextCode(parentCodigo: string, allCodigos: string[]): string {
  if (!parentCodigo) {
    const raizes = allCodigos
      .map((c) => Number(String(c).split(".")[0]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const max = raizes.length ? Math.max(...raizes) : 0;
    return String(max + 1);
  }
  const prefix = `${parentCodigo}.`;
  const filhosDiretos = allCodigos
    .filter((c) => c.startsWith(prefix))
    .map((c) => {
      const resto = c.slice(prefix.length);
      const seg = resto.split(".")[0];
      return Number(seg);
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  const max = filhosDiretos.length ? Math.max(...filhosDiretos) : 0;
  return `${parentCodigo}.${max + 1}`;
}

type FormState = {
  id?: number;
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string;
  nivel: number;
  contaPaiId: string; // string vazia = sem pai
  classificacaoDRE: string;
  ordem: string;
};

const EMPTY_FORM: FormState = {
  codigo: "", nome: "", tipo: "custo_obra", natureza: "devedora", nivel: 1,
  contaPaiId: "", classificacaoDRE: "", ordem: "0",
};

export default function FinanceiroPlanoDeConta() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [paiPopoverOpen, setPaiPopoverOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Rev. 2157 — escopo='plano' filtra fora as categorias operacionais (AUTO-*)
  // Rev. 2160 — ativo:true esconde contas soft-deletadas (ex.: órfã 3.3 migrada na Rev. 2159)
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

  // Ordenação natural por código contábil (4.9 antes de 4.10, antes de 5).
  const sortedContas = useMemo(() => {
    return [...allContas].sort((a, b) => cmpCodigo(a.codigo, b.codigo));
  }, [allContas]);

  const filtered = sortedContas.filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q);
  });

  // Pais elegíveis para o select (ordenados naturalmente).
  // Quando editando, exclui a própria conta e suas descendentes pra evitar ciclo.
  const eligibleParents = useMemo(() => {
    const editingCodigo = form.id ? allContas.find((c) => c.id === form.id)?.codigo : null;
    return sortedContas.filter((c: any) => {
      if (!editingCodigo) return true;
      if (c.id === form.id) return false;
      if (c.codigo === editingCodigo || c.codigo.startsWith(`${editingCodigo}.`)) return false;
      return true;
    });
  }, [sortedContas, form.id, allContas]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: any) {
    setForm({
      id: c.id,
      codigo: c.codigo,
      nome: c.nome,
      tipo: c.tipo,
      natureza: c.natureza,
      nivel: Number(c.nivel) || 1,
      contaPaiId: c.contaPaiId ? String(c.contaPaiId) : "",
      classificacaoDRE: c.classificacaoDRE ?? "",
      ordem: String(c.ordem ?? 0),
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setForm(EMPTY_FORM);
  }

  // Ao escolher conta-pai → sugere próximo código + nível + tipo/natureza herdados.
  function onPickParent(paiId: string) {
    if (!paiId) {
      // "Sem pai" (raiz)
      const allCodigos = allContas.filter((c) => c.id !== form.id).map((c) => String(c.codigo));
      setForm((f) => ({
        ...f,
        contaPaiId: "",
        codigo: f.id ? f.codigo : suggestNextCode("", allCodigos),
        nivel: 1,
      }));
      return;
    }
    const pai = allContas.find((c) => String(c.id) === paiId);
    if (!pai) return;
    const allCodigos = allContas.filter((c) => c.id !== form.id).map((c) => String(c.codigo));
    const next = suggestNextCode(String(pai.codigo), allCodigos);
    setForm((f) => ({
      ...f,
      contaPaiId: paiId,
      codigo: f.id ? f.codigo : next,
      nivel: (Number(pai.nivel) || 1) + 1,
      // herda tipo/natureza do pai pra coerência contábil (user pode alterar)
      tipo: f.id ? f.tipo : pai.tipo,
      natureza: f.id ? f.natureza : pai.natureza,
    }));
  }

  function handleSave() {
    if (!form.nome.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!form.codigo.trim()) {
      toast({ title: "Código obrigatório", variant: "destructive" });
      return;
    }
    if (form.id) {
      updateMut.mutate({
        id: form.id,
        companyId,
        nome: form.nome,
        tipo: form.tipo,
        natureza: form.natureza,
        contaPaiId: form.contaPaiId ? Number(form.contaPaiId) : null,
        classificacaoDRE: form.classificacaoDRE || undefined,
        ordem: parseInt(form.ordem) || 0,
        // Rev. 2166 — envia nivel pra acompanhar troca de Conta Pai em edição
        // (onPickParent já recalcula form.nivel = pai.nivel + 1).
        nivel: form.nivel,
      });
    } else {
      createMut.mutate({
        companyId,
        escopo: "plano",
        codigo: form.codigo,
        nome: form.nome,
        tipo: form.tipo,
        natureza: form.natureza,
        nivel: form.nivel,
        contaPaiId: form.contaPaiId ? Number(form.contaPaiId) : undefined,
        classificacaoDRE: form.classificacaoDRE || undefined,
        ordem: parseInt(form.ordem) || 0,
      });
    }
  }

  const paiSelecionado = form.contaPaiId
    ? eligibleParents.find((c: any) => String(c.id) === form.contaPaiId)
    : null;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-600" />Plano de Contas
            </h1>
            <p className="text-sm text-gray-500 mt-1">{filtered.length} conta(s) cadastrada(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => seedMut.mutate({ companyId })} disabled={seedMut.isPending}>
              <Sprout className="w-4 h-4 mr-2 text-green-600" />
              {seedMut.isPending ? "Carregando..." : "Carregar Padrão"}
            </Button>
            <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Nova Conta
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Código ou nome..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Contas */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhuma conta cadastrada.</p>
                <p className="text-sm mt-1">Clique em "Carregar Padrão" para usar o plano de contas FC Engenharia.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map((c: any) => (
                  <div
                    key={c.id}
                    className="px-5 py-2.5 flex items-center justify-between hover:bg-gray-50 group"
                    style={{ paddingLeft: `${20 + (c.nivel - 1) * 20}px` }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-xs font-mono text-gray-500 w-16 flex-shrink-0">{c.codigo}</span>
                      <span className={`text-sm truncate ${c.nivel === 1 ? "font-bold text-gray-800" : c.nivel === 2 ? "font-medium text-gray-700" : "text-gray-600"}`}>
                        {c.nome}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`text-xs ${TIPO_COLORS[c.tipo] ?? "bg-gray-100"}`}>
                        {TIPOS.find(t => t.value === c.tipo)?.label ?? c.tipo}
                      </Badge>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.natureza === "credora" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {c.natureza}
                      </span>
                      <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-gray-400 hover:text-blue-600"
                          onClick={() => openEdit(c)}
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-gray-400 hover:text-red-600"
                          onClick={() => setDeleteTarget(c)}
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal Nova / Editar conta */}
        <Dialog open={dialogOpen} onOpenChange={(o) => o ? setDialogOpen(true) : closeDialog()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar Conta Contábil" : "Nova Conta Contábil"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Rev. 2166 — Conta Pai gera código automático */}
              <div>
                <Label>Conta Pai <span className="text-gray-400 text-xs font-normal">(opcional — escolha pra gerar o código)</span></Label>
                <Popover open={paiPopoverOpen} onOpenChange={setPaiPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={paiPopoverOpen}
                      className={cn(
                        "mt-1 h-9 w-full flex items-center justify-between rounded-md border px-2 text-sm bg-white transition-colors",
                        paiPopoverOpen ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300",
                      )}
                    >
                      <span className={cn("truncate text-left", !paiSelecionado && "text-gray-400")}>
                        {paiSelecionado ? `${paiSelecionado.codigo} · ${paiSelecionado.nome}` : "— Sem pai (conta raiz) —"}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {paiSelecionado && (
                          <span
                            className="text-gray-400 hover:text-red-500 px-1"
                            role="button"
                            tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onPickParent(""); setPaiPopoverOpen(false); }}
                          >×</span>
                        )}
                        <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                    <Command
                      filter={(itemValue, sQ) => {
                        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        return norm(itemValue).includes(norm(sQ)) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Buscar por código ou nome..." />
                      <CommandList className="max-h-72">
                        <CommandEmpty className="py-6 text-center text-sm text-gray-400">Nenhuma conta encontrada.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="--sem-pai--"
                            onSelect={() => { onPickParent(""); setPaiPopoverOpen(false); }}
                            className="text-xs text-gray-500 italic"
                          >
                            <Check className={cn("w-3.5 h-3.5 mr-2", !form.contaPaiId ? "opacity-100" : "opacity-0")} />
                            — Sem pai (conta raiz) —
                          </CommandItem>
                          {eligibleParents.map((p: any) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.codigo} ${p.nome}`}
                              onSelect={() => { onPickParent(String(p.id)); setPaiPopoverOpen(false); }}
                              className="text-xs"
                            >
                              <Check className={cn("w-3.5 h-3.5 mr-2", String(p.id) === form.contaPaiId ? "opacity-100" : "opacity-0")} />
                              <span className="font-mono text-gray-500 mr-2">{p.codigo}</span>
                              <span className="text-gray-800">{p.nome}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código *</Label>
                  <Input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                    placeholder="Ex: 4.9"
                    disabled={!!form.id}
                    className={form.id ? "bg-gray-50 text-gray-500" : ""}
                  />
                  {!form.id && (
                    <p className="text-[10px] text-gray-400 mt-1">
                      Sugerido automaticamente ao escolher a conta pai.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Nível</Label>
                  <Input
                    type="number"
                    value={form.nivel}
                    onChange={e => setForm(f => ({ ...f, nivel: parseInt(e.target.value) || 1 }))}
                    min="1" max="5"
                    disabled={!!form.id}
                    className={form.id ? "bg-gray-50 text-gray-500" : ""}
                  />
                </div>
              </div>
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome da conta" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Natureza</Label>
                  <Select value={form.natureza} onValueChange={v => setForm(f => ({ ...f, natureza: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="devedora">Devedora</SelectItem>
                      <SelectItem value="credora">Credora</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Classificação DRE</Label>
                  <Input value={form.classificacaoDRE} onChange={e => setForm(f => ({ ...f, classificacaoDRE: e.target.value }))} />
                </div>
                <div>
                  <Label>Ordem</Label>
                  <Input type="number" value={form.ordem} onChange={e => setForm(f => ({ ...f, ordem: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
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

        {/* Confirm excluir */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conta contábil?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteTarget?.codigo} — {deleteTarget?.nome}</strong>
                <br />
                A conta será desativada (soft-delete). Se houver lançamentos ou contas filhas vinculadas, a exclusão será bloqueada.
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
