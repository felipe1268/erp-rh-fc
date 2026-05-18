// Rev. 2088 — Página de cadastro/edição de Centros de Custo.
// Pedido do user: "preciso ter a opção de editar, excluir ou inativar".
// Sem DELETE (R-007): inativação é soft (ativo=0). Layout alinhado ao
// padrão visual do FinanceiroCategorias (header gradient + KPI bar +
// ações inline editar/inativar + toggle "só ativos").
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Layers, Building2, Edit2, Power, Loader2, PlusCircle, Eye, EyeOff, Search,
} from "lucide-react";

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const TIPO_COLORS: Record<string, string> = {
  obra: "bg-blue-100 text-blue-800",
  administrativo: "bg-gray-100 text-gray-700",
  comercial: "bg-green-100 text-green-800",
  financeiro: "bg-purple-100 text-purple-800",
};

type CC = {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  obraId: number | null;
  responsavelNome: string | null;
  orcamentoMensal: number | string | null;
  ativo: number;
};

type FormState = {
  id: number | null;
  codigo: string;
  nome: string;
  tipo: string;
  obraId: string;
  responsavelNome: string;
  orcamentoMensal: string;
};

const INITIAL_FORM: FormState = {
  id: null, codigo: "", nome: "", tipo: "obra",
  obraId: "", responsavelNome: "", orcamentoMensal: "",
};

export default function FinanceiroCentrosCusto() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>({ ...INITIAL_FORM });
  const [confirmInactivate, setConfirmInactivate] = useState<CC | null>(null);

  const { data: centros, isLoading, refetch } = (trpc as any).financial.getCostCenters.useQuery(
    { companyId, includeInactive: true },
    { enabled: !!companyId },
  );

  const { data: obras } = (trpc as any).obras.getObras.useQuery(
    { companyId },
    { enabled: !!companyId },
  );

  const createMut = (trpc as any).financial.createCostCenter.useMutation({
    onSuccess: () => {
      toast({ title: "Centro de custo criado!" });
      setShowForm(false); setForm({ ...INITIAL_FORM }); refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const updateMut = (trpc as any).financial.updateCostCenter.useMutation({
    onSuccess: () => {
      toast({ title: "Centro de custo atualizado!" });
      setShowForm(false); setForm({ ...INITIAL_FORM }); setConfirmInactivate(null); refetch();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const isPending = createMut.isPending || updateMut.isPending;

  // Filtros aplicados
  const filtered: CC[] = useMemo(() => {
    const list: CC[] = Array.isArray(centros) ? centros : [];
    const q = search.trim().toLowerCase();
    return list
      .filter(c => showInactive ? true : c.ativo === 1)
      .filter(c => !q ||
        String(c.nome).toLowerCase().includes(q) ||
        String(c.codigo).toLowerCase().includes(q) ||
        String(c.responsavelNome ?? "").toLowerCase().includes(q));
  }, [centros, search, showInactive]);

  // Agrupamento por tipo (mantém visual original)
  const byTipo = useMemo(() => {
    return filtered.reduce((acc: Record<string, CC[]>, c) => {
      const t = c.tipo || "outros";
      if (!acc[t]) acc[t] = [];
      acc[t].push(c);
      return acc;
    }, {});
  }, [filtered]);

  // KPIs (sobre TODOS, não só filtrados)
  const all: CC[] = Array.isArray(centros) ? centros : [];
  const totalAtivos = all.filter(c => c.ativo === 1).length;
  const totalInativos = all.filter(c => c.ativo !== 1).length;
  const totalObras = all.filter(c => c.ativo === 1 && c.tipo === "obra").length;
  const totalAdm = all.filter(c => c.ativo === 1 && c.tipo !== "obra").length;

  function openNew() {
    setForm({ ...INITIAL_FORM });
    setShowForm(true);
  }
  function openEdit(c: CC) {
    setForm({
      id: c.id,
      codigo: c.codigo ?? "",
      nome: c.nome ?? "",
      tipo: c.tipo ?? "obra",
      obraId: c.obraId ? String(c.obraId) : "",
      responsavelNome: c.responsavelNome ?? "",
      orcamentoMensal: c.orcamentoMensal != null ? String(c.orcamentoMensal) : "",
    });
    setShowForm(true);
  }
  function handleSave() {
    const nome = form.nome.trim();
    if (nome.length < 2) {
      toast({ title: "Informe o nome (mín. 2 caracteres)", variant: "destructive" });
      return;
    }
    const obraId = form.obraId ? parseInt(form.obraId) : undefined;
    const orcamento = form.orcamentoMensal ? parseFloat(form.orcamentoMensal) : undefined;
    if (form.id) {
      updateMut.mutate({
        id: form.id,
        companyId,
        nome,
        tipo: form.tipo,
        obraId: obraId ?? null,
        responsavelNome: form.responsavelNome.trim() || null,
        orcamentoMensal: orcamento ?? null,
      });
    } else {
      createMut.mutate({
        companyId,
        codigo: form.codigo.trim() || undefined,
        nome,
        tipo: form.tipo,
        obraId,
        responsavelNome: form.responsavelNome.trim() || undefined,
        orcamentoMensal: orcamento,
      });
    }
  }
  function handleToggleAtivo() {
    if (!confirmInactivate) return;
    updateMut.mutate({
      id: confirmInactivate.id,
      companyId,
      ativo: confirmInactivate.ativo === 1 ? false : true,
    });
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-5">

        {/* Header gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white shadow-lg">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/15 ring-4 ring-white/20 backdrop-blur-sm flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Centros de Custo</h1>
                <p className="text-sm text-blue-100">Organize despesas por projeto, setor ou área administrativa</p>
              </div>
            </div>
            <Button onClick={openNew} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold h-10 shadow-md">
              <PlusCircle className="w-4 h-4 mr-2" />Novo Centro de Custo
            </Button>
          </div>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Total Ativos" value={totalAtivos} icon={Layers} color="text-blue-600" bg="bg-blue-50" />
          <KpiCard label="Obras" value={totalObras} icon={Building2} color="text-emerald-600" bg="bg-emerald-50" />
          <KpiCard label="Adm./Outros" value={totalAdm} icon={Building2} color="text-purple-600" bg="bg-purple-50" />
          <KpiCard label="Inativos" value={totalInativos} icon={Power} color={totalInativos > 0 ? "text-amber-600" : "text-gray-400"} bg={totalInativos > 0 ? "bg-amber-50" : "bg-gray-50"} />
        </div>

        {/* Filtros */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, código ou responsável..."
                className="pl-9 h-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowInactive(v => !v)}
              className="h-9"
              title={showInactive ? "Ocultar inativos" : "Mostrar inativos"}
            >
              {showInactive ? <Eye className="w-3.5 h-3.5 mr-1.5" /> : <EyeOff className="w-3.5 h-3.5 mr-1.5" />}
              {showInactive ? "Mostrando inativos" : "Só ativos"}
            </Button>
          </CardContent>
        </Card>

        {/* Lista */}
        {isLoading ? (
          <div className="p-8 text-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Carregando...</div>
        ) : filtered.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <Layers className="w-14 h-14 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">Nenhum centro de custo encontrado.</p>
              <p className="text-sm text-gray-400 mt-1">Ajuste os filtros ou cadastre o primeiro.</p>
              <Button onClick={openNew} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4 mr-2" />Criar Primeiro Centro
              </Button>
            </CardContent>
          </Card>
        ) : (
          Object.entries(byTipo).map(([tipo, items]) => (
            <Card key={tipo} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm capitalize flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  {tipo.charAt(0).toUpperCase() + tipo.slice(1)} ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-gray-100">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className={`px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors ${c.ativo !== 1 ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="font-mono text-xs text-gray-400 w-16 shrink-0">{c.codigo}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-800 truncate">{c.nome}</p>
                            {c.ativo !== 1 && <Badge variant="outline" className="text-[10px] py-0 px-1.5">inativo</Badge>}
                          </div>
                          {c.responsavelNome && <p className="text-xs text-gray-400">Resp.: {c.responsavelNome}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {c.orcamentoMensal && (
                          <span className="text-sm text-gray-600 hidden sm:inline">{formatBRL(Number(c.orcamentoMensal))}/mês</span>
                        )}
                        <Badge className={`text-xs ${TIPO_COLORS[c.tipo] ?? "bg-gray-100"}`}>{c.tipo}</Badge>
                        <div className="flex items-center gap-1">
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {/* Modal criar/editar — Rev. 2092: padrão Categorias (header gradient, h-9, labels uppercase) */}
        <Dialog open={showForm} onOpenChange={(v) => { if (!v) { setShowForm(false); setForm({ ...INITIAL_FORM }); } }}>
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-white/15 ring-2 ring-white/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">{form.id ? "Editar Centro de Custo" : "Novo Centro de Custo"}</h3>
                  <p className="text-[11px] text-blue-100">
                    {form.id ? "Atualize os dados do centro de custo" : "Cadastre um novo centro de custo"}
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Código</label>
                  <Input
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                    placeholder="Auto (CC-0001…)"
                    disabled={!!form.id}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm bg-white"
                  >
                    <option value="obra">Obra</option>
                    <option value="administrativo">Administrativo</option>
                    <option value="comercial">Comercial</option>
                    <option value="financeiro">Financeiro</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome *</label>
                <Input
                  autoFocus
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome do centro de custo"
                  className="mt-1 h-9"
                  onKeyDown={(e) => { if (e.key === "Enter" && !isPending && form.nome.trim().length >= 2) handleSave(); }}
                />
              </div>
              {form.tipo === "obra" && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Obra Vinculada</label>
                  <select
                    value={form.obraId || ""}
                    onChange={(e) => setForm((f) => ({ ...f, obraId: e.target.value }))}
                    className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm bg-white"
                  >
                    <option value="">— Nenhuma —</option>
                    {(obras ?? []).map((o: any) => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Responsável</label>
                  <Input
                    value={form.responsavelNome}
                    onChange={e => setForm(f => ({ ...f, responsavelNome: e.target.value }))}
                    placeholder="Nome do responsável"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Orçamento (R$/mês)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.orcamentoMensal}
                    onChange={e => setForm(f => ({ ...f, orcamentoMensal: e.target.value }))}
                    placeholder="0,00"
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              {!form.id && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-700 leading-relaxed">
                  <strong>Dica:</strong> deixe o código em branco para gerar automaticamente (CC-0001, CC-0002…). Se o tipo for <strong>Obra</strong>, vincule a obra para que lançamentos herdem o centro de custo.
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
        <AlertDialog open={!!confirmInactivate} onOpenChange={v => { if (!v) setConfirmInactivate(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmInactivate?.ativo === 1 ? "Inativar centro de custo?" : "Reativar centro de custo?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmInactivate?.ativo === 1
                  ? <>O centro de custo <strong>{confirmInactivate?.nome}</strong> não aparecerá mais nas opções de lançamento e cadastro de categorias. Lançamentos já criados não serão afetados. Você pode reativar depois.</>
                  : <>O centro de custo <strong>{confirmInactivate?.nome}</strong> voltará a aparecer nas opções de seleção.</>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={updateMut.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleToggleAtivo}
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
