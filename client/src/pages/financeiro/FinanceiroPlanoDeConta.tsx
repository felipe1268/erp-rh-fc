import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, BookOpen, RefreshCw, Sprout } from "lucide-react";

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

export default function FinanceiroPlanoDeConta() {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    codigo: "", nome: "", tipo: "custo_obra", natureza: "devedora", nivel: "1",
    classificacaoDRE: "", ordem: "0",
  });

  const { data: contas, isLoading, refetch } = (trpc as any).financial.getAccounts.useQuery(
    { companyId, tipo: tipoFilter !== "all" ? tipoFilter : undefined },
    { enabled: !!companyId }
  );

  const seedMut = (trpc as any).financial.seedAccounts.useMutation({
    onSuccess: () => { toast({ title: "Plano de contas carregado!" }); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const createMut = (trpc as any).financial.createAccount.useMutation({
    onSuccess: () => { toast({ title: "Conta criada!" }); setShowNew(false); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const filtered = (contas ?? []).filter((c: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.codigo.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q);
  });

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
            {(!contas || contas.length === 0) && (
              <Button variant="outline" onClick={() => seedMut.mutate({ companyId })} disabled={seedMut.isPending}>
                <Sprout className="w-4 h-4 mr-2 text-green-600" />
                {seedMut.isPending ? "Carregando..." : "Carregar Padrão"}
              </Button>
            )}
            <Button onClick={() => setShowNew(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
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
                    className="px-5 py-2.5 flex items-center justify-between hover:bg-gray-50"
                    style={{ paddingLeft: `${20 + (c.nivel - 1) * 20}px` }}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono text-gray-500 w-16 flex-shrink-0`}>{c.codigo}</span>
                      <span className={`text-sm ${c.nivel === 1 ? "font-bold text-gray-800" : c.nivel === 2 ? "font-medium text-gray-700" : "text-gray-600"}`}>
                        {c.nome}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${TIPO_COLORS[c.tipo] ?? "bg-gray-100"}`}>
                        {TIPOS.find(t => t.value === c.tipo)?.label ?? c.tipo}
                      </Badge>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.natureza === "credora" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {c.natureza}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal nova conta */}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nova Conta Contábil</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código *</Label>
                  <Input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ex: 3.1.5" />
                </div>
                <div>
                  <Label>Nível</Label>
                  <Input type="number" value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))} min="1" max="5" />
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
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button onClick={() => createMut.mutate({ companyId, codigo: form.codigo, nome: form.nome, tipo: form.tipo, natureza: form.natureza, nivel: parseInt(form.nivel) || 1, classificacaoDRE: form.classificacaoDRE || undefined, ordem: parseInt(form.ordem) || 0 })} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                {createMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
