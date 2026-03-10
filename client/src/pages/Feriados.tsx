import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar, Plus, Trash2, Download, Upload, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function Feriados() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const companyId = (selectedCompanyId && selectedCompanyId !== 'construtoras') ? Number(selectedCompanyId) : 0;
  const companyIds = getCompanyIdsForQuery();
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: "", data: "", tipo: "nacional" as string, recorrente: "1" });

  const { data: feriados, isLoading, refetch } = trpc.feriados.listar.useQuery(
    { companyId, ano: anoFiltro },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const seedMut = trpc.feriados.seedNacionais.useMutation({
    onSuccess: (r) => { toast.success(`${r.feriadosCriados} feriados nacionais inseridos`); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao inserir"),
  });

  const criarMut = trpc.feriados.criar.useMutation({
    onSuccess: () => { toast.success("Feriado salvo"); setShowDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const atualizarMut = trpc.feriados.atualizar.useMutation({
    onSuccess: () => { toast.success("Feriado atualizado"); setShowDialog(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar"),
  });

  const excluirMut = trpc.feriados.excluir.useMutation({
    onSuccess: () => { toast.success("Feriado excluído"); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir"),
  });

  const filtered = useMemo(() => {
    if (!feriados) return [];
    if (!search) return feriados;
    const s = removeAccents(search);
    return feriados.filter(f => removeAccents(f.nome || '').includes(s) || removeAccents(f.tipo || '').includes(s));
  }, [feriados, search]);

  const abrirNovo = () => {
    setEditId(null);
    setForm({ nome: "", data: `${anoFiltro}-01-01`, tipo: "nacional", recorrente: "1" });
    setShowDialog(true);
  };

  const abrirEditar = (f: any) => {
    setEditId(f.id);
    setForm({ nome: f.nome, data: f.data, tipo: f.tipo || "nacional", recorrente: String(f.recorrente ?? 1) });
    setShowDialog(true);
  };

  const salvar = () => {
    if (!form.nome || !form.data) return toast.error("Preencha nome e data");
    if (editId) {
      atualizarMut.mutate({ id: editId, ...form, tipo: form.tipo as "nacional" | "estadual" | "compensado" | "municipal" | "ponto_facultativo", recorrente: form.recorrente === "1" });
    } else {
      criarMut.mutate({ companyId, companyIds, ...form, tipo: form.tipo as "nacional" | "estadual" | "compensado" | "municipal" | "ponto_facultativo", recorrente: form.recorrente === "1" });
    }
  };

  // Group by month
  const byMonth = useMemo(() => {
    const map: Record<number, typeof filtered> = {};
    for (const f of filtered) {
      const m = new Date(f.data + 'T12:00:00').getMonth();
      if (!map[m]) map[m] = [];
      map[m].push(f);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Feriados
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie feriados nacionais, estaduais e municipais para cálculos de ponto e folha</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => seedMut.mutate({ companyId, companyIds, ano: anoFiltro })} disabled={seedMut.isPending}>
            {seedMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
            Carregar Nacionais {anoFiltro}
          </Button>
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="w-4 h-4 mr-1" /> Novo Feriado
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar feriado..." className="pl-9" />
        </div>
        <Select value={String(anoFiltro)} onValueChange={v => setAnoFiltro(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027, 2028].map(a => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} feriado(s)</span>
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, i) => i).map(m => {
            const items = byMonth[m] || [];
            return (
              <div key={m} className="border border-border rounded-lg overflow-hidden">
                <div className="bg-primary/10 px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-primary">{MESES[m]}</span>
                  <span className="text-xs text-muted-foreground">{items.length} feriado(s)</span>
                </div>
                <div className="p-2 space-y-1 min-h-[60px]">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2 text-center">Nenhum feriado</p>
                  ) : items.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/50 group cursor-pointer" onClick={() => abrirEditar(f)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{f.nome}</div>
                        <div className="text-[10px] text-muted-foreground flex gap-2">
                          <span>{new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          <span className={`px-1 rounded ${f.tipo === 'nacional' ? 'bg-blue-100 text-blue-700' : f.tipo === 'estadual' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {f.tipo}
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0" onClick={e => { e.stopPropagation(); excluirMut.mutate({ id: f.id }); }}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Feriado" : "Novo Feriado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome do Feriado</Label>
              <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} className="mt-1" placeholder="Ex: Natal" />
            </div>
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nacional">Nacional</SelectItem>
                  <SelectItem value="estadual">Estadual</SelectItem>
                  <SelectItem value="municipal">Municipal</SelectItem>
                  <SelectItem value="ponto_facultativo">Ponto Facultativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recorrente (anual)?</Label>
              <Select value={form.recorrente} onValueChange={v => setForm(p => ({ ...p, recorrente: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Sim</SelectItem>
                  <SelectItem value="0">Não (apenas este ano)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criarMut.isPending || atualizarMut.isPending}>
              {(criarMut.isPending || atualizarMut.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
