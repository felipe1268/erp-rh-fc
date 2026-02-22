import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Search, Trash2, Clock, Wifi, WifiOff, Building2, AlertTriangle, Pencil, X, Save } from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { Badge } from "@/components/ui/badge";

type SnForm = {
  sn: string;
  obraId: string;
  status: string;
};

const emptyForm: SnForm = { sn: "", obraId: "", status: "ativo" };

function flattenSn(raw: any) {
  if (raw.obraSn) {
    return {
      ...raw.obraSn,
      obraNome: raw.obraNome || null,
      obraStatus: raw.obraStatus || null,
    };
  }
  return raw;
}

export default function RelogiosPonto() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;

  const snsQ = trpc.obras.listSnsByCompany.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const snsRaw = snsQ.data ?? [];
  const sns = useMemo(() => snsRaw.map(flattenSn), [snsRaw]);

  const obrasQ = trpc.obras.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const obrasAtivas = useMemo(() =>
    (obrasQ.data ?? []).filter((o: any) => o.status === "Em Andamento"),
    [obrasQ.data]
  );
  const todasObras = obrasQ.data ?? [];

  const addSnMut = trpc.obras.addSn.useMutation({
    onSuccess: () => { snsQ.refetch(); setDialogOpen(false); toast.success("Relógio de ponto cadastrado com sucesso!"); },
    onError: (err) => toast.error(err.message),
  });
  const updateSnMut = trpc.obras.updateSn.useMutation({
    onSuccess: () => { snsQ.refetch(); setEditingId(null); toast.success("Relógio atualizado com sucesso!"); },
    onError: (err) => toast.error(err.message),
  });
  const removeSnMut = trpc.obras.removeSn.useMutation({
    onSuccess: () => { snsQ.refetch(); toast.success("Relógio de ponto removido!"); },
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SnForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "ativo" | "inativo">("all");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<SnForm>(emptyForm);

  const filtered = useMemo(() => {
    let result = sns;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((sn: any) =>
        (sn.sn || "").toLowerCase().includes(s) ||
        (sn.obraNome || "").toLowerCase().includes(s)
      );
    }
    if (filterStatus !== "all") {
      result = result.filter((sn: any) => sn.status === filterStatus);
    }
    return result;
  }, [sns, search, filterStatus]);

  const ativos = sns.filter((s: any) => s.status === "ativo").length;
  const inativos = sns.filter((s: any) => s.status === "inativo").length;

  const openNew = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.sn.trim()) { toast.error("Número de série (SN) é obrigatório"); return; }
    addSnMut.mutate({
      companyId,
      obraId: form.obraId ? parseInt(form.obraId, 10) : undefined,
      sn: form.sn.trim(),
    });
  };

  const handleEdit = (sn: any) => {
    setEditingId(sn.id);
    setEditForm({
      sn: sn.sn || "",
      obraId: String(sn.obraId || ""),
      status: sn.status || "ativo",
    });
  };

  const handleEditSave = () => {
    if (!editForm.sn.trim()) { toast.error("SN é obrigatório"); return; }
    updateSnMut.mutate({
      id: editingId!,
      sn: editForm.sn.trim(),
      obraId: editForm.obraId ? parseInt(editForm.obraId, 10) : undefined,
      status: editForm.status,
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const handleDelete = (id: number, sn: string) => {
    if (confirm(`Tem certeza que deseja remover o relógio SN ${sn}?`)) {
      removeSnMut.mutate({ id });
    }
  };

  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relógios de Ponto</h1>
            <p className="text-muted-foreground text-sm">
              Cadastro de relógios de ponto (SN) e vinculação com obras
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PrintActions title="Relógios de Ponto" />
            <Button onClick={openNew} className="bg-[#1B2A4A] hover:bg-[#243660]">
              <Plus className="h-4 w-4 mr-2" /> Novo Relógio
            </Button>
          </div>
        </div>

        {/* Cards resumo */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setFilterStatus("all")}
            className={`text-left ${filterStatus === "all" ? "ring-2 ring-blue-500 rounded-lg" : ""}`}
          >
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-blue-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{sns.length}</p>
                  <p className="text-xs text-muted-foreground">Total de Relógios</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === "ativo" ? "all" : "ativo")}
            className={`text-left ${filterStatus === "ativo" ? "ring-2 ring-green-500 rounded-lg" : ""}`}
          >
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Wifi className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{ativos}</p>
                  <p className="text-xs text-muted-foreground">Ativos</p>
                </div>
              </CardContent>
            </Card>
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === "inativo" ? "all" : "inativo")}
            className={`text-left ${filterStatus === "inativo" ? "ring-2 ring-red-500 rounded-lg" : ""}`}
          >
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <WifiOff className="h-5 w-5 text-red-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inativos}</p>
                  <p className="text-xs text-muted-foreground">Inativos</p>
                </div>
              </CardContent>
            </Card>
          </button>
        </div>

        {/* Busca */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por SN ou obra..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Tabela de relógios */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg">Nenhum relógio de ponto encontrado</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {sns.length === 0
                  ? "Cadastre os relógios de ponto (SN) e vincule-os às obras."
                  : "Nenhum resultado para o filtro aplicado."}
              </p>
              {sns.length === 0 && (
                <Button onClick={openNew} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-2" /> Novo Relógio
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-left font-medium">SN</th>
                      <th className="p-3 text-left font-medium">Obra Vinculada</th>
                      <th className="p-3 text-left font-medium">Status Obra</th>
                      <th className="p-3 text-center font-medium">Status</th>
                      <th className="p-3 text-left font-medium">Data Vínculo</th>
                      <th className="p-3 text-center font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((sn: any) => (
                      editingId === sn.id ? (
                        /* LINHA DE EDIÇÃO INLINE */
                        <tr key={sn.id} className="border-b bg-blue-50/50">
                          <td className="p-2">
                            <Input
                              value={editForm.sn}
                              onChange={e => setEditForm(f => ({ ...f, sn: e.target.value }))}
                              className="font-mono h-9 text-sm"
                            />
                          </td>
                          <td className="p-2">
                            <Select
                              value={editForm.obraId || undefined}
                              onValueChange={v => setEditForm(f => ({ ...f, obraId: v }))}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                {todasObras.map((obra: any) => (
                                  <SelectItem key={obra.id} value={String(obra.id)}>
                                    {obra.nome} {obra.status !== "Em Andamento" ? `(${obra.status})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2 text-muted-foreground text-xs">—</td>
                          <td className="p-2">
                            <Select
                              value={editForm.status}
                              onValueChange={v => setEditForm(f => ({ ...f, status: v }))}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ativo">Ativo</SelectItem>
                                <SelectItem value="inativo">Inativo</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {sn.dataVinculo ? new Date(sn.dataVinculo).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="default"
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 h-8 px-2"
                                onClick={handleEditSave}
                                disabled={updateSnMut.isPending}
                              >
                                <Save className="h-3.5 w-3.5 mr-1" /> Salvar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                onClick={handleEditCancel}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        /* LINHA NORMAL — clicável para editar */
                        <tr
                          key={sn.id}
                          className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => handleEdit(sn)}
                        >
                          <td className="p-3 font-mono font-bold text-base">{sn.sn || "—"}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-teal-600" />
                              <span className="font-medium">{sn.obraNome || `Obra #${sn.obraId}`}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            {sn.obraStatus ? (
                              <Badge variant={sn.obraStatus === "Em Andamento" ? "default" : "secondary"} className="text-xs">
                                {sn.obraStatus}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant={sn.status === "ativo" ? "default" : "destructive"}
                              className={`text-xs ${sn.status === "ativo" ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}`}
                            >
                              {sn.status === "ativo" ? "Ativo" : "Inativo"}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground">
                            {sn.dataVinculo ? new Date(sn.dataVinculo).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => handleEdit(sn)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive h-8 px-2"
                                onClick={() => handleDelete(sn.id, sn.sn)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Rodapé */}
              <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                Exibindo {filtered.length} de {sns.length} relógio{sns.length !== 1 ? "s" : ""}
                {filterStatus !== "all" && (
                  <button onClick={() => setFilterStatus("all")} className="ml-2 text-blue-600 hover:underline text-xs">
                    Limpar filtro
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Alerta informativo */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm text-amber-800">Sobre os Relógios de Ponto</h4>
              <p className="text-xs text-amber-700 mt-1">
                O número SN (Serial Number) é o identificador único do relógio de ponto Dixi.
                Cada SN só pode estar ativo em uma obra por vez. Clique em qualquer linha para editar o relógio.
                O SN é usado para identificar automaticamente a obra durante a importação dos arquivos DIXI.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de criação */}
      <FullScreenDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Novo Relógio de Ponto"
        icon={<Clock className="h-5 w-5 text-white" />}
      >
        <div className="w-full max-w-2xl">
          <div className="space-y-4">
            <div>
              <Label>Número de Série (SN) *</Label>
              <Input
                value={form.sn}
                onChange={e => setForm(f => ({ ...f, sn: e.target.value }))}
                placeholder="Ex: AYSJ31011442"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Número de série do relógio de ponto Dixi
              </p>
            </div>

            <div>
              <Label>Obra para Vincular (opcional)</Label>
              <Select
                value={form.obraId || undefined}
                onValueChange={v => setForm(f => ({ ...f, obraId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma obra..." />
                </SelectTrigger>
                <SelectContent>
                  {obrasAtivas.map((obra: any) => (
                    <SelectItem key={obra.id} value={String(obra.id)}>
                      {obra.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {obrasAtivas.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Nenhuma obra com status "Em Andamento" disponível.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={addSnMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                {addSnMut.isPending ? "Salvando..." : "Cadastrar Relógio"}
              </Button>
            </div>
          </div>
        </div>
      </FullScreenDialog>
    </DashboardLayout>
  );
}
