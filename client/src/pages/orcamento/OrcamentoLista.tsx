import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calculator, Upload, Eye, Trash2, Pencil,
  FolderOpen, RefreshCw, Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho:             { label: "Rascunho",      variant: "secondary" },
  aguardando_aprovacao: { label: "Ag. Aprovação", variant: "default" },
  aprovado:             { label: "Aprovado",       variant: "default" },
  fechado:              { label: "Fechado",        variant: "secondary" },
};

interface EditForm {
  id: number;
  codigo: string;
  descricao: string;
  cliente: string;
  local: string;
  revisao: string;
  dataBase: string;
  obraId: string;
  tempoObraMeses: string;
}

const EMPTY_FORM: EditForm = {
  id: 0, codigo: "", descricao: "", cliente: "",
  local: "", revisao: "", dataBase: "", obraId: "", tempoObraMeses: "",
};

export default function OrcamentoLista() {
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const [, navigate] = useLocation();
  const [busca, setBusca] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);

  const { data: lista = [], isLoading, refetch } = trpc.orcamento.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const { data: obras = [] } = trpc.obras.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );

  const deleteMutation = trpc.orcamento.delete.useMutation({
    onSuccess: () => { toast.success("Orçamento excluído."); refetch(); },
    onError: (e) => toast.error(e.message || "Erro ao excluir"),
  });

  const updateMutation = trpc.orcamento.update.useMutation({
    onSuccess: () => {
      toast.success("Orçamento atualizado com sucesso.");
      setEditOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e.message || "Erro ao salvar"),
  });

  const openEdit = (orc: any) => {
    setForm({
      id:            orc.id,
      codigo:        orc.codigo        || "",
      descricao:     orc.descricao     || "",
      cliente:       orc.cliente       || "",
      local:         orc.local         || "",
      revisao:       orc.revisao       || "",
      dataBase:      orc.dataBase      || "",
      obraId:        orc.obraId        ? String(orc.obraId) : "",
      tempoObraMeses: orc.tempoObraMeses ? String(orc.tempoObraMeses) : "",
    });
    setEditOpen(true);
  };

  const handleSave = () => {
    if (!form.codigo.trim()) { toast.error("Código é obrigatório."); return; }
    updateMutation.mutate({
      id:             form.id,
      codigo:         form.codigo.trim(),
      descricao:      form.descricao.trim() || undefined,
      cliente:        form.cliente.trim()   || undefined,
      local:          form.local.trim()     || undefined,
      revisao:        form.revisao.trim()   || undefined,
      dataBase:       form.dataBase.trim()  || undefined,
      obraId:         form.obraId ? parseInt(form.obraId) : null,
      tempoObraMeses: form.tempoObraMeses ? parseInt(form.tempoObraMeses) : null,
    });
  };

  const set = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const filtrado = lista.filter((o: any) => {
    const q = busca.toLowerCase();
    return (
      o.codigo?.toLowerCase().includes(q) ||
      o.cliente?.toLowerCase().includes(q) ||
      o.descricao?.toLowerCase().includes(q) ||
      o.revisao?.toLowerCase().includes(q)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-5 p-4">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-blue-600" />
              Orçamentos
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {filtrado.length} orçamento{filtrado.length !== 1 ? "s" : ""} encontrado{filtrado.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Link href="/orcamento/importar">
              <Button size="sm" className="gap-2">
                <Upload className="h-4 w-4" /> Novo Orçamento
              </Button>
            </Link>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm text-center py-12">Carregando...</p>
        ) : !filtrado.length ? (
          <div className="py-16 text-center">
            <Calculator className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">
              {busca ? "Nenhum orçamento encontrado para essa busca." : "Nenhum orçamento importado ainda."}
            </p>
            {!busca && (
              <Link href="/orcamento/importar">
                <Button size="sm" className="mt-4">
                  <Upload className="h-3 w-3 mr-1" /> Criar primeiro orçamento
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtrado.map((orc: any) => {
              const st = STATUS_LABELS[orc.status] ?? { label: orc.status, variant: "secondary" as const };
              const bdi = orc.bdiPercentual ? `BDI ${(parseFloat(orc.bdiPercentual) * 100).toFixed(2)}%` : "";
              const meta = orc.metaPercentual ? `Meta −${(parseFloat(orc.metaPercentual) * 100).toFixed(0)}%` : "";
              return (
                <Card key={orc.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{orc.codigo}</span>
                          {orc.revisao && <span className="text-xs text-blue-600 font-mono">{orc.revisao}</span>}
                          <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{orc.descricao || "—"}</p>
                        <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          {orc.cliente && <span>Cliente: {orc.cliente}</span>}
                          {orc.local   && <span>Local: {orc.local}</span>}
                          {bdi  && <span className="text-amber-600 font-medium">{bdi}</span>}
                          {meta && <span className="text-purple-600 font-medium">{meta}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-green-600">
                          {formatBRL(parseFloat(orc.totalVenda || "0"))}
                        </div>
                        <div className="text-xs text-muted-foreground">venda</div>
                        <div className="text-xs text-amber-600 mt-0.5">
                          {formatBRL(parseFloat(orc.totalCusto || "0"))} custo
                        </div>
                        <div className="text-xs text-purple-600">
                          {formatBRL(parseFloat(orc.totalMeta || "0"))} meta
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm" variant="ghost" className="h-8 w-8 p-0"
                          onClick={() => navigate(`/orcamento/${orc.id}`)}
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => openEdit(orc)}
                          disabled={orc.status === "fechado"}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm" variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              disabled={orc.status === "fechado"}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir orçamento?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O orçamento "{orc.codigo}" será excluído permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90"
                                onClick={() => deleteMutation.mutate({ id: orc.id })}
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Dialog de Edição ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Editar Orçamento
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Código <span className="text-destructive">*</span></Label>
              <Input value={form.codigo} onChange={set("codigo")} placeholder="Ex: ORC_747" />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Descrição / Obra</Label>
              <Input value={form.descricao} onChange={set("descricao")} placeholder="Nome da obra ou serviço" />
            </div>

            <div className="space-y-1">
              <Label>Cliente</Label>
              <Input value={form.cliente} onChange={set("cliente")} placeholder="Nome do cliente" />
            </div>

            <div className="space-y-1">
              <Label>Local / Município</Label>
              <Input value={form.local} onChange={set("local")} placeholder="Ex: São Paulo - SP" />
            </div>

            <div className="space-y-1">
              <Label>Revisão</Label>
              <Input value={form.revisao} onChange={set("revisao")} placeholder="Ex: R05" />
            </div>

            <div className="space-y-1">
              <Label>Data Base</Label>
              <Input value={form.dataBase} onChange={set("dataBase")} placeholder="Ex: Jan/2026" />
            </div>

            <div className="space-y-1">
              <Label>Prazo (meses)</Label>
              <Input
                type="number" min={1}
                value={form.tempoObraMeses}
                onChange={set("tempoObraMeses")}
                placeholder="Ex: 24"
              />
            </div>

            <div className="space-y-1">
              <Label>Obra vinculada</Label>
              <select
                value={form.obraId}
                onChange={set("obraId")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Nenhuma —</option>
                {obras.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.codigo ? `${o.codigo} · ` : ""}{o.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
