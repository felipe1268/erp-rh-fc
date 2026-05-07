import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckSquare, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ComprasAprovacoes() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;
  const [recusaId, setRecusaId] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRecusaOpen, setBulkRecusaOpen] = useState(false);
  const [bulkJustificativa, setBulkJustificativa] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; ok: number; fail: number } | null>(null);

  const { data: pendentes, isLoading, refetch } = trpc.compras.listarSolicitacoes.useQuery(
    { companyId, aprovacaoStatus: "aguardando" },
    { enabled: !!companyId }
  );

  const aprovarMut = trpc.compras.aprovarSolicitacao.useMutation({
    onSuccess: (r: any) => {
      toast.success(r?.cotacaoCriada ? `Solicitação aprovada! Cotação ${r.cotacaoCriada.numeroCotacao} criada.` : "Solicitação aprovada!");
      refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao aprovar"),
  });
  const recusarMut = trpc.compras.aprovarSolicitacao.useMutation({
    onSuccess: () => { toast.success("Solicitação recusada."); setRecusaId(null); setJustificativa(""); refetch(); },
    onError: (e: any) => toast.error(e?.message || "Erro ao recusar"),
  });
  const aprovarBulkMut = trpc.compras.aprovarSolicitacao.useMutation();
  const recusarBulkMut = trpc.compras.aprovarSolicitacao.useMutation();

  const lista = useMemo(
    () => (pendentes ?? []).filter((r: any) => r.status !== "cancelado"),
    [pendentes],
  );

  const allIds = useMemo(() => lista.map((sc: any) => sc.id as number), [lista]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const isBulkRunning = bulkProgress !== null;

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  }
  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function executarBulk(acao: "aprovada" | "recusada", justificativaTxt?: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const mut = acao === "aprovada" ? aprovarBulkMut : recusarBulkMut;
    setBulkProgress({ done: 0, total: ids.length, ok: 0, fail: 0 });
    let ok = 0, fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await mut.mutateAsync({
          id: ids[i],
          aprovacaoStatus: acao,
          aprovadorId: user?.id ?? undefined,
          aprovadorNome: user?.name ?? undefined,
          ...(acao === "recusada" && justificativaTxt ? { motivoRecusa: justificativaTxt } as any : {}),
        } as any);
        ok++;
      } catch (e: any) {
        fail++;
        console.warn(`Falha ao ${acao} #${ids[i]}:`, e?.message);
      }
      setBulkProgress({ done: i + 1, total: ids.length, ok, fail });
    }
    if (acao === "aprovada") {
      toast.success(`${ok} aprovada(s)${fail > 0 ? `, ${fail} falharam` : ""}.`);
    } else {
      toast.success(`${ok} recusada(s)${fail > 0 ? `, ${fail} falharam` : ""}.`);
    }
    setSelectedIds(new Set());
    setBulkProgress(null);
    setBulkRecusaOpen(false);
    setBulkJustificativa("");
    await refetch();
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <CheckSquare className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Aprovações de Compras</h1>
            <p className="text-sm text-gray-500">Solicitações aguardando sua aprovação</p>
          </div>
          <Badge className="ml-auto bg-amber-100 text-amber-700 text-base px-4 py-1">
            {lista.length} pendente{lista.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {selectedCount > 0 && (
          <div className="sticky top-2 z-10 bg-blue-50 border-2 border-blue-200 rounded-lg p-3 flex flex-wrap items-center gap-3 shadow-md">
            <Badge className="bg-blue-600 text-white text-base px-3 py-1">
              {selectedCount} selecionada{selectedCount !== 1 ? "s" : ""}
            </Badge>
            <span className="text-sm text-blue-900">Aplicar ação em lote:</span>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              disabled={isBulkRunning}
              onClick={() => executarBulk("aprovada")}
            >
              {isBulkRunning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Aprovar selecionadas
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isBulkRunning}
              onClick={() => { setBulkJustificativa(""); setBulkRecusaOpen(true); }}
            >
              <XCircle className="h-4 w-4 mr-1" />Recusar selecionadas
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkRunning}
              onClick={() => setSelectedIds(new Set())}
            >
              Limpar seleção
            </Button>
            {bulkProgress && (
              <span className="ml-auto text-sm text-blue-900">
                Processando {bulkProgress.done}/{bulkProgress.total}
                {bulkProgress.fail > 0 ? ` (${bulkProgress.fail} falhas)` : ""}…
              </span>
            )}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Pendentes de Aprovação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : lista.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-400" />
                <p className="font-medium">Nada pendente!</p>
                <p className="text-sm">Todas as solicitações foram processadas.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? "indeterminate" : false}
                        onCheckedChange={toggleAll}
                        aria-label="Selecionar todas"
                      />
                    </TableHead>
                    <TableHead>SC #</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((sc: any) => {
                    const isEmerg = sc.tipo === "emergencial" || sc.prioridade === "urgente";
                    const checked = selectedIds.has(sc.id);
                    return (
                      <TableRow key={sc.id} className={`${isEmerg ? "bg-red-50" : ""} ${checked ? "ring-2 ring-blue-300" : ""}`}>
                        <TableCell>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(sc.id)}
                            aria-label={`Selecionar SC ${sc.numeroSc || sc.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium">{sc.numeroSc || `#${sc.id}`}</TableCell>
                        <TableCell className="max-w-[240px] truncate" title={sc.titulo || ""}>{sc.titulo || "—"}</TableCell>
                        <TableCell>{sc.departamento || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{sc.tipo || "material"}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-gray-600">{sc._itens?.total ?? 0} itens</span>
                        </TableCell>
                        <TableCell>
                          {sc.prazoNecessidade
                            ? format(new Date(sc.prazoNecessidade), "dd/MM/yyyy", { locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {isEmerg ? (
                            <Badge className="bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                              <AlertTriangle className="h-3 w-3" />{sc.prioridade === "urgente" ? "Urgente" : "Emergencial"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500 capitalize">{sc.prioridade || "normal"}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700"
                              disabled={aprovarMut.isPending || isBulkRunning}
                              onClick={() => aprovarMut.mutate({
                                id: sc.id,
                                aprovacaoStatus: "aprovada",
                                aprovadorId: user?.id ?? undefined,
                                aprovadorNome: user?.name ?? undefined,
                              })}>
                              <CheckCircle2 className="h-3 w-3 mr-1" />Aprovar
                            </Button>
                            <Button size="sm" variant="destructive"
                              disabled={isBulkRunning}
                              onClick={() => { setRecusaId(sc.id); setJustificativa(""); }}>
                              <XCircle className="h-3 w-3 mr-1" />Recusar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={recusaId !== null} onOpenChange={() => setRecusaId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Recusar Solicitação #{recusaId}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Informe o motivo da recusa para o solicitante:</p>
              <Textarea placeholder="Ex: Valor acima do orçamento previsto..." value={justificativa}
                onChange={e => setJustificativa(e.target.value)} rows={4} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRecusaId(null)}>Cancelar</Button>
                <Button variant="destructive" disabled={!justificativa.trim() || recusarMut.isPending}
                  onClick={() => recusaId && recusarMut.mutate({
                    id: recusaId,
                    aprovacaoStatus: "recusada",
                    aprovadorId: user?.id ?? undefined,
                    aprovadorNome: user?.name ?? undefined,
                  })}>
                  {recusarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar Recusa
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkRecusaOpen} onOpenChange={(v) => { if (!isBulkRunning) setBulkRecusaOpen(v); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Recusar {selectedCount} solicitação(ões) em lote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                A justificativa abaixo será aplicada a todas as {selectedCount} solicitações selecionadas.
              </p>
              <Textarea
                placeholder="Ex: Solicitações duplicadas — refazer consolidando os itens..."
                value={bulkJustificativa}
                onChange={(e) => setBulkJustificativa(e.target.value)}
                rows={4}
                disabled={isBulkRunning}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" disabled={isBulkRunning} onClick={() => setBulkRecusaOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={!bulkJustificativa.trim() || isBulkRunning}
                  onClick={() => executarBulk("recusada", bulkJustificativa.trim())}
                >
                  {isBulkRunning && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar recusa em lote
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
