// Rev. 2083 — Página de cadastro/manutenção de Categorias financeiras (financial_accounts)
// pedida pelo usuário (menu "Categorias" no sidebar Financeiro / Cadastros).
//
// Estrutura: lista agrupada por TIPO (Receita / Despesa), filtros por busca e
// centro de custo, CRUD completo (criar / editar / inativar — sem DELETE por R-007).
// Reusa endpoints `financial.getAccounts`, `financial.createAccount`,
// `financial.updateAccount` (estendido na Rev. 2083 pra aceitar tipo/natureza/centroCustoId).

import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Tag, Search, Edit2, Power, ArrowUpRight, ArrowDownRight, Loader2,
  Layers, PlusCircle, Eye, EyeOff,
} from "lucide-react";

type Categoria = {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  natureza: string;
  centroCustoId: number | null;
  ativo: number;
};

type FormState = {
  id: number | null;
  nome: string;
  tipo: "receita" | "despesa";
  natureza: "fixo" | "variavel";
  centroCustoId: string;
};

const INITIAL_FORM: FormState = {
  id: null,
  nome: "",
  tipo: "despesa",
  natureza: "variavel",
  centroCustoId: "",
};

export default function FinanceiroCategorias() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<"all" | "receita" | "despesa">("all");
  const [filterCC, setFilterCC] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [confirmInactivate, setConfirmInactivate] = useState<Categoria | null>(null);

  const { data: accounts, isLoading, refetch } = (trpc as any).financial.getAccounts.useQuery(
    { companyId },
    { enabled: !!companyId },
  );
  const { data: costCenters } = (trpc as any).financial.getCostCenters.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const createMut = (trpc as any).financial.createAccount.useMutation({
    onSuccess: (res: any) => {
      toast({ title: res?.alreadyExists ? "Categoria já existia — atualizada" : "Categoria cadastrada!" });
      setShowForm(false);
      setForm({ ...INITIAL_FORM });
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" }),
  });

  const updateMut = (trpc as any).financial.updateAccount.useMutation({
    onSuccess: () => {
      toast({ title: "Categoria atualizada!" });
      setShowForm(false);
      setForm({ ...INITIAL_FORM });
      setConfirmInactivate(null);
      refetch();
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });

  // Lista filtrada + dedup visual (case-insensitive por nome dentro do mesmo tipo).
  const categorias: Categoria[] = useMemo(() => {
    const list: any[] = Array.isArray(accounts) ? accounts : [];
    const q = search.trim().toLowerCase();
    return list
      .filter((a) => (showInactive ? true : a.ativo === 1))
      .filter((a) => (filterTipo === "all" ? true : String(a.tipo) === filterTipo))
      .filter((a) => (filterCC === "all" ? true : String(a.centroCustoId ?? "") === filterCC))
      .filter((a) => !q || String(a.nome).toLowerCase().includes(q) || String(a.codigo).toLowerCase().includes(q))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  }, [accounts, search, filterTipo, filterCC, showInactive]);

  const totalAtivas = (Array.isArray(accounts) ? accounts : []).filter((a: any) => a.ativo === 1).length;
  const totalReceitas = (Array.isArray(accounts) ? accounts : []).filter((a: any) => a.ativo === 1 && a.tipo === "receita").length;
  const totalDespesas = (Array.isArray(accounts) ? accounts : []).filter((a: any) => a.ativo === 1 && a.tipo === "despesa").length;
  const semCentroCusto = (Array.isArray(accounts) ? accounts : []).filter((a: any) => a.ativo === 1 && !a.centroCustoId).length;

  function openNew() {
    setForm({ ...INITIAL_FORM });
    setShowForm(true);
  }

  function openEdit(c: Categoria) {
    setForm({
      id: c.id,
      nome: c.nome,
      tipo: (c.tipo === "receita" ? "receita" : "despesa"),
      natureza: (c.natureza === "fixo" ? "fixo" : "variavel"),
      centroCustoId: c.centroCustoId ? String(c.centroCustoId) : "",
    });
    setShowForm(true);
  }

  function handleSave() {
    const nome = form.nome.trim();
    if (nome.length < 2) {
      toast({ title: "Informe o nome (mín. 2 caracteres)", variant: "destructive" });
      return;
    }
    const centroCustoId = form.centroCustoId ? Number(form.centroCustoId) : null;
    if (form.id) {
      updateMut.mutate({
        id: form.id,
        companyId,
        nome,
        tipo: form.tipo,
        natureza: form.natureza,
        centroCustoId,
      });
    } else {
      createMut.mutate({
        companyId,
        nome,
        tipo: form.tipo,
        natureza: form.natureza,
        centroCustoId: centroCustoId ?? undefined,
      });
    }
  }

  function handleInactivate() {
    if (!confirmInactivate) return;
    updateMut.mutate({
      id: confirmInactivate.id,
      companyId,
      ativo: confirmInactivate.ativo === 1 ? false : true,
    });
  }

  function ccLabel(id: number | null): string {
    if (!id) return "—";
    const cc = (Array.isArray(costCenters) ? costCenters : []).find((c: any) => c.id === id);
    return cc ? `${cc.codigo ? cc.codigo + " · " : ""}${cc.nome}` : `#${id}`;
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-5">

        {/* Header gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 ring-4 ring-white/20 backdrop-blur-sm flex items-center justify-center">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Categorias Financeiras</h1>
                <p className="text-sm text-blue-100">Organize receitas e despesas por categoria e centro de custo</p>
              </div>
            </div>
            <Button onClick={openNew} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold h-10 shadow-md">
              <PlusCircle className="w-4 h-4 mr-2" />Nova Categoria
            </Button>
          </div>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Ativas" value={totalAtivas} icon={Tag} color="text-blue-600" bg="bg-blue-50" />
          <KpiCard label="Receitas" value={totalReceitas} icon={ArrowUpRight} color="text-green-600" bg="bg-green-50" />
          <KpiCard label="Despesas" value={totalDespesas} icon={ArrowDownRight} color="text-red-600" bg="bg-red-50" />
          <KpiCard label="Sem CC vinculado" value={semCentroCusto} icon={Layers} color={semCentroCusto > 0 ? "text-amber-600" : "text-gray-400"} bg={semCentroCusto > 0 ? "bg-amber-50" : "bg-gray-50"} />
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou código..."
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <FilterPill active={filterTipo === "all"} onClick={() => setFilterTipo("all")}>Todos</FilterPill>
              <FilterPill active={filterTipo === "receita"} onClick={() => setFilterTipo("receita")} color="green">Receitas</FilterPill>
              <FilterPill active={filterTipo === "despesa"} onClick={() => setFilterTipo("despesa")} color="red">Despesas</FilterPill>
            </div>
            <select
              value={filterCC}
              onChange={(e) => setFilterCC(e.target.value)}
              className="h-9 rounded-md border border-gray-200 px-3 text-sm bg-white min-w-[180px]"
            >
              <option value="all">Todos os centros de custo</option>
              <option value="">— Sem centro de custo —</option>
              {(Array.isArray(costCenters) ? costCenters : []).map((cc: any) => (
                <option key={cc.id} value={String(cc.id)}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowInactive((v) => !v)}
              className="h-9"
              title={showInactive ? "Ocultar inativas" : "Mostrar inativas"}
            >
              {showInactive ? <Eye className="w-3.5 h-3.5 mr-1.5" /> : <EyeOff className="w-3.5 h-3.5 mr-1.5" />}
              {showInactive ? "Mostrando inativas" : "Só ativas"}
            </Button>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="w-4 h-4 text-blue-600" />
              {categorias.length} categoria{categorias.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Carregando...</div>
            ) : categorias.length === 0 ? (
              <div className="p-12 text-center">
                <Tag className="w-14 h-14 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 font-medium">Nenhuma categoria encontrada.</p>
                <p className="text-sm text-gray-400 mt-1">Ajuste os filtros ou cadastre a primeira categoria.</p>
                <Button onClick={openNew} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4 mr-2" />Criar Primeira Categoria
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {categorias.map((c) => (
                  <div key={c.id} className={`px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors ${c.ativo !== 1 ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.tipo === "receita" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                        {c.tipo === "receita" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800 truncate">{c.nome}</p>
                          <span className="font-mono text-[10px] text-gray-400">{c.codigo}</span>
                          {c.ativo !== 1 && <Badge variant="outline" className="text-[10px] py-0 px-1.5">inativa</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                          <Badge className={`text-[10px] py-0 px-1.5 ${c.natureza === "fixo" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"}`}>
                            {c.natureza === "fixo" ? "Fixa" : "Variável"}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {ccLabel(c.centroCustoId)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(c)} title="Editar">
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setConfirmInactivate(c)}
                        title={c.ativo === 1 ? "Inativar" : "Reativar"}
                      >
                        <Power className={`w-3.5 h-3.5 ${c.ativo === 1 ? "text-orange-500" : "text-green-600"}`} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal criar/editar */}
        <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setForm({ ...INITIAL_FORM }); } }}>
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-white/15 ring-2 ring-white/30 flex items-center justify-center">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{form.id ? "Editar Categoria" : "Nova Categoria"}</h3>
                  <p className="text-[11px] text-blue-100">
                    {form.id ? "Atualize os dados da categoria" : "Cadastre uma nova categoria financeira"}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome *</label>
                <Input
                  autoFocus
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Material de escritório, Combustível, Aluguel..."
                  className="mt-1 h-9"
                  onKeyDown={(e) => { if (e.key === "Enter" && !isPending) handleSave(); }}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {([
                    { v: "despesa", label: "Despesa", icon: ArrowDownRight, bg: "bg-red-600", hover: "hover:bg-red-50", text: "text-red-600", border: "border-red-200" },
                    { v: "receita", label: "Receita", icon: ArrowUpRight, bg: "bg-green-600", hover: "hover:bg-green-50", text: "text-green-600", border: "border-green-200" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo: opt.v }))}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        form.tipo === opt.v
                          ? `border-transparent ${opt.bg} text-white`
                          : `bg-white ${opt.border} ${opt.text} ${opt.hover}`
                      }`}
                    >
                      <opt.icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Natureza</label>
                  <select
                    value={form.natureza}
                    onChange={(e) => setForm((f) => ({ ...f, natureza: e.target.value as "fixo" | "variavel" }))}
                    className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm bg-white"
                  >
                    <option value="variavel">Variável</option>
                    <option value="fixo">Fixa</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Centro de Custo</label>
                  <select
                    value={form.centroCustoId}
                    onChange={(e) => setForm((f) => ({ ...f, centroCustoId: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm bg-white"
                  >
                    <option value="">— Nenhum —</option>
                    {(Array.isArray(costCenters) ? costCenters : []).map((cc: any) => (
                      <option key={cc.id} value={cc.id}>{cc.codigo ? `${cc.codigo} · ` : ""}{cc.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              {!form.id && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-700 leading-relaxed">
                  <strong>Dica:</strong> o código contábil é gerado automaticamente. Categorias podem ser usadas em lançamentos imediatamente após o cadastro.
                </div>
              )}
            </div>
            <DialogFooter className="px-5 pb-4">
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setForm({ ...INITIAL_FORM }); }} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || form.nome.trim().length < 2}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Salvando...</> : <><PlusCircle className="w-3.5 h-3.5 mr-1.5" />{form.id ? "Salvar Alterações" : "Cadastrar"}</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmação inativar/reativar */}
        <AlertDialog open={!!confirmInactivate} onOpenChange={(v) => { if (!v) setConfirmInactivate(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmInactivate?.ativo === 1 ? "Inativar categoria?" : "Reativar categoria?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmInactivate?.ativo === 1
                  ? <>A categoria <strong>{confirmInactivate?.nome}</strong> não aparecerá mais nas opções de lançamento. Lançamentos já criados não serão afetados. Você pode reativar depois.</>
                  : <>A categoria <strong>{confirmInactivate?.nome}</strong> voltará a aparecer nas opções de lançamento.</>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={updateMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleInactivate}
                disabled={updateMut.isPending}
                className={confirmInactivate?.ativo === 1 ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}
              >
                {updateMut.isPending ? "Salvando..." : (confirmInactivate?.ativo === 1 ? "Inativar" : "Reativar")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value, icon: Icon, color, bg }: { label: string; value: number; icon: any; color: string; bg: string }) {
  return (
    <div className={`rounded-xl p-3 border border-gray-100 ${bg}`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">{label}</p>
      </div>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function FilterPill({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: "green" | "red" }) {
  const activeColor = color === "green" ? "bg-green-600 text-white" : color === "red" ? "bg-red-600 text-white" : "bg-blue-600 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3 rounded-md text-xs font-semibold border transition-colors ${
        active ? `${activeColor} border-transparent` : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
