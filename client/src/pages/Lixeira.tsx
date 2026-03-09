import DashboardLayout from "@/components/DashboardLayout";
import PrintFooterLGPD from "@/components/PrintFooterLGPD";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Trash2, RotateCcw, AlertTriangle, Search, Filter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { removeAccents } from "@/lib/searchUtils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const ENTITY_LABELS: Record<string, string> = {
  company: "Empresa",
  employee: "Colaborador",
  obra: "Obra",
  sector: "Setor",
  jobFunction: "Função",
  dixiDevice: "Relógio de Ponto",
  aso: "ASO",
  atestado: "Atestado",
  training: "Treinamento",
  warning: "Advertência",
  goldenRule: "Regra de Ouro",
  documentTemplate: "Modelo de Documento",
  epiDelivery: "Entrega de EPI",
  user: "Usuário",
};

const ENTITY_COLORS: Record<string, string> = {
  company: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  employee: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  obra: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  sector: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  jobFunction: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  dixiDevice: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  aso: "bg-red-500/20 text-red-400 border-red-500/30",
  atestado: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  training: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  goldenRule: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  documentTemplate: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  epiDelivery: "bg-lime-500/20 text-lime-400 border-lime-500/30",
  user: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

function formatDate(d: any) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeSince(d: any) {
  if (!d) return "";
  const now = new Date();
  const date = new Date(d);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 30) return `${diffDays} dias atrás`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`;
  return `${Math.floor(diffDays / 365)} anos atrás`;
}

export default function Lixeira() {
  return (
    <DashboardLayout>
      <LixeiraContent />
    <PrintFooterLGPD />
    </DashboardLayout>
  );
}

function LixeiraContent() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery} = useCompany();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [confirmRestore, setConfirmRestore] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const companyIdNum = selectedCompanyId ? Number(selectedCompanyId) : 0;

  const trashQuery = trpc.trash.listAll.useQuery(
    { companyId: companyIdNum },
    { enabled: !!selectedCompanyId, refetchOnWindowFocus: false }
  );

  const restoreMutation = trpc.trash.restore.useMutation({
    onSuccess: () => {
      toast.success("Item restaurado com sucesso!");
      trashQuery.refetch();
      setConfirmRestore(null);
    },
    onError: (err) => toast.error(`Erro ao restaurar: ${err.message}`),
  });

  const permanentDeleteMutation = trpc.trash.permanentDelete.useMutation({
    onSuccess: () => {
      toast.success("Item excluído permanentemente.");
      trashQuery.refetch();
      setConfirmDelete(null);
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err.message}`),
  });

  const items = trashQuery.data ?? [];

  const entityTypes = useMemo(() => {
    const types = new Set(items.map((i: any) => i.entity));
    return Array.from(types).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (entityFilter !== "all") {
      result = result.filter((i: any) => i.entity === entityFilter);
    }
    if (search.trim()) {
      const q = removeAccents(search);
      result = result.filter((i: any) =>
        (i.label || "").toLowerCase().includes(q) ||
        (ENTITY_LABELS[i.entity] || "").toLowerCase().includes(q) ||
        (i.deletedBy || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, entityFilter, search]);

  const toggleSelect = (key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBulkRestore = async () => {
    const toRestore = filteredItems.filter((i: any) => selectedItems.has(`${i.entity}-${i.id}`));
    for (const item of toRestore) {
      try {
        await restoreMutation.mutateAsync({ id: item.id, entity: item.entity, companyId: companyIdNum });
      } catch {}
    }
    setSelectedItems(new Set());
  };

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione uma empresa para ver a lixeira.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-red-400" />
            Lixeira
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Itens excluídos podem ser restaurados ou removidos permanentemente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedItems.size > 0 && (
            <Button variant="outline" size="sm" onClick={handleBulkRestore} disabled={restoreMutation.isPending}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Restaurar {selectedItems.size} selecionado(s)
            </Button>
          )}
          <Badge variant="outline" className="text-muted-foreground">
            {filteredItems.length} item(ns)
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, tipo ou quem excluiu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {entityTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {ENTITY_LABELS[type] || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Loading */}
      {trashQuery.isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!trashQuery.isLoading && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Trash2 className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm">
            {items.length === 0 ? "A lixeira está vazia." : "Nenhum item encontrado com os filtros aplicados."}
          </p>
        </div>
      )}

      {/* Items list */}
      {filteredItems.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="w-10 p-3">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={filteredItems.length > 0 && filteredItems.every((i: any) => selectedItems.has(`${i.entity}-${i.id}`))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(filteredItems.map((i: any) => `${i.entity}-${i.id}`)));
                      } else {
                        setSelectedItems(new Set());
                      }
                    }}
                  />
                </th>
                <th className="text-left p-3 text-xs font-semibold uppercase text-muted-foreground">Tipo</th>
                <th className="text-left p-3 text-xs font-semibold uppercase text-muted-foreground">Item</th>
                <th className="text-left p-3 text-xs font-semibold uppercase text-muted-foreground">Excluído por</th>
                <th className="text-left p-3 text-xs font-semibold uppercase text-muted-foreground">Data de Exclusão</th>
                <th className="text-right p-3 text-xs font-semibold uppercase text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any) => {
                const key = `${item.entity}-${item.id}`;
                const isSelected = selectedItems.has(key);
                return (
                  <tr key={key} className={`border-b last:border-b-0 hover:bg-muted/20 transition-colors ${isSelected ? "bg-muted/30" : ""}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={isSelected}
                        onChange={() => toggleSelect(key)}
                      />
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-xs ${ENTITY_COLORS[item.entity] || ""}`}>
                        {ENTITY_LABELS[item.entity] || item.entity}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <span className="font-medium text-sm">{item.label || `#${item.id}`}</span>
                    </td>
                    <td className="p-3">
                      <span className="text-sm text-muted-foreground">{item.deletedBy || "—"}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="text-sm">{formatDate(item.deletedAt)}</span>
                        <span className="text-xs text-muted-foreground">{timeSince(item.deletedAt)}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => setConfirmRestore(item)}
                          disabled={restoreMutation.isPending}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restaurar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => setConfirmDelete(item)}
                          disabled={permanentDeleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Restore confirmation dialog */}
      <AlertDialog open={!!confirmRestore} onOpenChange={() => setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar item?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja restaurar <strong>{confirmRestore?.label}</strong> ({ENTITY_LABELS[confirmRestore?.entity] || confirmRestore?.entity})?
              O item voltará a aparecer no sistema normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRestore) {
                  restoreMutation.mutate({ id: confirmRestore.id, entity: confirmRestore.entity, companyId: companyIdNum });
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent delete confirmation dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Excluir permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é <strong>irreversível</strong>. O item <strong>{confirmDelete?.label}</strong> ({ENTITY_LABELS[confirmDelete?.entity] || confirmDelete?.entity})
              será removido permanentemente do banco de dados e não poderá ser recuperado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) {
                  permanentDeleteMutation.mutate({ id: confirmDelete.id, entity: confirmDelete.entity, companyId: companyIdNum });
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
