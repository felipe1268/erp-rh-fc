import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeftRight, Plus, Loader2, Building2, ShieldAlert, Undo2, TrendingDown, Lock, Wallet, CheckCircle, PackageSearch, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ComprasRealocacao() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;
  const [showNova, setShowNova] = useState(false);
  const [obraId, setObraId] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [filtroObraRisco, setFiltroObraRisco] = useState("all");
  const [filtroObraSaldo, setFiltroObraSaldo] = useState("all");
  const [desfazerModal, setDesfazerModal] = useState<{ id: number; valor: number; numeroCotacao: string | null } | null>(null);
  const [justificativa, setJustificativa] = useState("");

  const { data: obras } = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });

  const { data, isLoading, refetch } = trpc.purchase.listarRealocacoes.useQuery(
    { companyId, obraId: obraId ? parseInt(obraId) : undefined },
    { enabled: !!companyId }
  );

  const obraIdFiltro = filtroObraRisco && filtroObraRisco !== "all" ? parseInt(filtroObraRisco) : undefined;
  const { data: debitosRisco, isLoading: loadingRisco, refetch: refetchRisco } = trpc.compras.listarDebitosRisco.useQuery(
    { companyId, obraId: obraIdFiltro },
    { enabled: !!companyId }
  );

  const obraIdSaldo = filtroObraSaldo !== "all" ? parseInt(filtroObraSaldo) : undefined;
  const { data: saldos, isLoading: loadingSaldos } = trpc.compras.getSaldosRealocacaoGeral.useQuery(
    { companyId, obraId: obraIdSaldo },
    { enabled: !!companyId }
  );

  const criarMut = trpc.purchase.criarRealocacao.useMutation({
    onSuccess: () => {
      toast.success("Realocação registrada!");
      setShowNova(false); setOrigem(""); setDestino(""); setValor(""); setMotivo("");
      refetch();
    },
    onError: () => toast.error("Erro ao criar realocação"),
  });

  const isMasterAdmin = (user as any)?.role === "admin_master";

  const reverterMut = trpc.compras.reverterDebitoRisco.useMutation({
    onSuccess: (d) => {
      toast.success(`Débito revertido! ${fmt(d.valorRestituido)} devolvidos à reserva.`);
      setDesfazerModal(null);
      setJustificativa("");
      refetchRisco();
    },
    onError: (e) => toast.error(e.message),
  });

  const realocacoes = data ?? [];
  const totalRealocado = realocacoes.reduce((s: number, r: any) => s + Number(r.valorRealocado), 0);

  const debitos = debitosRisco ?? [];
  const totalDebitado = debitos.reduce((s: number, d: any) => s + Number(d.valor), 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <ArrowLeftRight className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Realocações</h1>
            <p className="text-sm text-gray-500">Histórico de realocações de verba e débitos da reserva de risco</p>
          </div>
        </div>

        {/* ── Painel: Saldo Disponível para Realocação ───────────────── */}
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              <h2 className="text-sm font-semibold text-emerald-800 uppercase tracking-wider">Saldo Disponível para Realocação</h2>
              {loadingSaldos && <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-700 font-medium">Obra:</span>
              <Select value={filtroObraSaldo} onValueChange={setFiltroObraSaldo}>
                <SelectTrigger className="h-7 text-xs w-52 bg-white border-emerald-200">
                  <SelectValue placeholder="Todas as obras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as obras</SelectItem>
                  {(obras ?? []).map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* DI-08 Total orçado */}
            <div className="bg-white rounded-xl border border-emerald-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-gray-500 font-medium">DI-08 — Orçado</p>
              </div>
              <p className="text-base font-bold text-blue-700">{fmt(saldos?.di08Total ?? 0)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Taxa de risco, Imprevistos e Pós Obra</p>
            </div>

            {/* DI-08 Utilizado */}
            <div className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-orange-500" />
                <p className="text-xs text-gray-500 font-medium">DI-08 — Utilizado</p>
              </div>
              <p className="text-base font-bold text-orange-600">{fmt(saldos?.di08Usado ?? 0)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Débitos realizados da reserva</p>
            </div>

            {/* Sobras de compras */}
            <div className="bg-white rounded-xl border border-teal-100 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <PackageSearch className="h-4 w-4 text-teal-500" />
                <p className="text-xs text-gray-500 font-medium">Economia em Compras</p>
              </div>
              <p className="text-base font-bold text-teal-700">{fmt(saldos?.totalSobras ?? 0)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">OCs aprovadas abaixo da meta</p>
            </div>

            {/* Total disponível — destaque */}
            <div className="bg-emerald-600 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-emerald-100" />
                <p className="text-xs text-emerald-100 font-medium">Total Disponível</p>
              </div>
              <p className="text-xl font-extrabold text-white">{fmt(saldos?.totalDisponivel ?? 0)}</p>
              <p className="text-[10px] text-emerald-200 mt-0.5">DI-08 disponível + economias</p>
            </div>
          </div>

          {/* Barra de progresso DI-08 */}
          {(saldos?.di08Total ?? 0) > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Utilização DI-08</span>
                <span>{(((saldos?.di08Usado ?? 0) / (saldos?.di08Total ?? 1)) * 100).toFixed(1)}% utilizado</span>
              </div>
              <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-400 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((saldos?.di08Usado ?? 0) / (saldos?.di08Total ?? 1)) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="risco">
          <TabsList className="mb-4">
            <TabsTrigger value="verba" className="gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Realocação de Verba
            </TabsTrigger>
            <TabsTrigger value="risco" className="gap-2">
              <ShieldAlert className="h-4 w-4" /> Reserva de Risco (DI-08)
            </TabsTrigger>
          </TabsList>

          {/* ── ABA 1: REALOCAÇÃO DE VERBA ─────────────────────────────── */}
          <TabsContent value="verba" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="grid grid-cols-2 gap-4 flex-1 mr-4">
                <Card className="border-purple-200 bg-purple-50">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <ArrowLeftRight className="h-7 w-7 text-purple-600" />
                      <div>
                        <p className="text-xl font-bold text-purple-700">{realocacoes.length}</p>
                        <p className="text-xs text-purple-600">Total de Realocações</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-7 w-7 text-blue-600" />
                      <div>
                        <p className="text-base font-bold text-blue-700">{fmt(totalRealocado)}</p>
                        <p className="text-xs text-blue-600">Volume Realocado</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <Button className="bg-purple-600 hover:bg-purple-700 whitespace-nowrap" onClick={() => setShowNova(true)}>
                <Plus className="h-4 w-4 mr-2" />Nova Realocação
              </Button>
            </div>

            <Card>
              <CardHeader><CardTitle>Histórico de Realocações de Verba</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : realocacoes.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ArrowLeftRight className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>Nenhuma realocação registrada.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Destino</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {realocacoes.map((r: any) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono">#{r.id}</TableCell>
                          <TableCell>{r.obraId || "—"}</TableCell>
                          <TableCell>{r.origemEapItemNome || `Item #${r.origemEapItemId}` || "—"}</TableCell>
                          <TableCell>{r.destinoEapItemNome || `Item #${r.destinoEapItemId}` || "—"}</TableCell>
                          <TableCell className="font-medium text-purple-700">{fmt(Number(r.valorRealocado))}</TableCell>
                          <TableCell className="max-w-xs truncate">{r.motivo}</TableCell>
                          <TableCell>{r.usuarioNome || "—"}</TableCell>
                          <TableCell>{format(new Date(r.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── ABA 2: RESERVA DE RISCO ─────────────────────────────── */}
          <TabsContent value="risco" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <ShieldAlert className="h-7 w-7 text-orange-600" />
                    <div>
                      <p className="text-xl font-bold text-orange-700">{debitos.length}</p>
                      <p className="text-xs text-orange-600">Débitos realizados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="h-7 w-7 text-red-600" />
                    <div>
                      <p className="text-base font-bold text-red-700">{fmt(totalDebitado)}</p>
                      <p className="text-xs text-red-600">Total debitado da reserva</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <CardTitle>Histórico de Débitos — Reserva de Risco BDI (DI-08)</CardTitle>
                  <div className="w-52">
                    <Select value={filtroObraRisco} onValueChange={setFiltroObraRisco}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas as obras" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as obras</SelectItem>
                        {(obras ?? []).map((o: any) => (
                          <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingRisco ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                ) : debitos.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShieldAlert className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>Nenhum débito de reserva de risco registrado.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Cotação</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead>Valor debitado</TableHead>
                        <TableHead>Observação</TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead className="text-center">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {debitos.map((d: any) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-xs text-gray-400">#{d.id}</TableCell>
                          <TableCell>{d.numeroCotacao ? <span className="font-medium text-blue-700">#{d.numeroCotacao}</span> : <span className="text-gray-400">—</span>}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{d.obraNome || "—"}</TableCell>
                          <TableCell><span className="font-semibold text-orange-700">{fmt(Number(d.valor))}</span></TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-gray-600">{d.observacao || "—"}</TableCell>
                          <TableCell className="text-xs text-gray-500">{format(new Date(d.criadoEm), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                          <TableCell className="text-center">
                            {isMasterAdmin ? (
                              <Button size="sm" variant="ghost"
                                disabled={reverterMut.isPending}
                                onClick={() => setDesfazerModal({ id: d.id, valor: Number(d.valor), numeroCotacao: d.numeroCotacao ?? null })}
                                className="h-7 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 gap-1">
                                <Undo2 className="h-3 w-3" /> Desfazer
                              </Button>
                            ) : (
                              <span className="flex items-center justify-center gap-1 text-xs text-gray-300" title="Apenas o Administrador Master pode desfazer">
                                <Lock className="h-3 w-3" />
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialog Nova Realocação */}
        <Dialog open={showNova} onOpenChange={setShowNova}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Realocação de Verba</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Obra</Label>
                <Select value={obraId} onValueChange={setObraId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    {(obras ?? []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Item de Origem (EAP)</Label>
                  <Input placeholder="Nome do item de origem" value={origem} onChange={e => setOrigem(e.target.value)} />
                </div>
                <div>
                  <Label>Item de Destino (EAP)</Label>
                  <Input placeholder="Nome do item de destino" value={destino} onChange={e => setDestino(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Valor a Realocar (R$)</Label>
                <Input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
              <div>
                <Label>Motivo da Realocação</Label>
                <Textarea placeholder="Justifique a necessidade da realocação..." value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button className="bg-purple-600 hover:bg-purple-700"
                  disabled={!obraId || !valor || !motivo.trim() || criarMut.isPending}
                  onClick={() => criarMut.mutate({
                    companyId, obraId: parseInt(obraId),
                    origemEapItemNome: origem, destinoEapItemNome: destino,
                    valorRealocado: Number(valor), motivo,
                    usuarioId: user?.id ?? 0, usuarioNome: user?.nome,
                  })}>
                  {criarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar Realocação
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal: Desfazer Débito de Risco — somente Admin Master */}
        <Dialog open={!!desfazerModal} onOpenChange={(o) => { if (!o) { setDesfazerModal(null); setJustificativa(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <ShieldAlert className="h-5 w-5" /> Desfazer Débito da Reserva de Risco
              </DialogTitle>
            </DialogHeader>
            {desfazerModal && (
              <div className="space-y-4">
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  <p>Você está prestes a reverter o débito de <strong>{fmt(desfazerModal.valor)}</strong>
                  {desfazerModal.numeroCotacao ? ` da cotação #${desfazerModal.numeroCotacao}` : ""}.</p>
                  <p className="mt-1">O valor será restituído à Reserva de Risco (DI-08). Esta ação é irreversível pelo sistema — ficará registrada no audit trail.</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">
                    Justificativa <span className="text-red-600">*</span>
                  </Label>
                  <Textarea
                    className="mt-1"
                    placeholder="Descreva o motivo da reversão (ex: débito lançado indevidamente, cotação cancelada)..."
                    value={justificativa}
                    onChange={e => setJustificativa(e.target.value)}
                    rows={4}
                  />
                  {justificativa.trim().length === 0 && (
                    <p className="text-xs text-red-500 mt-1">Justificativa obrigatória</p>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => { setDesfazerModal(null); setJustificativa(""); }}>Cancelar</Button>
                  <Button
                    variant="destructive"
                    disabled={!justificativa.trim() || reverterMut.isPending}
                    onClick={() => reverterMut.mutate({ id: desfazerModal.id, companyId, justificativa: justificativa.trim() })}
                  >
                    {reverterMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Undo2 className="h-4 w-4 mr-1" />}
                    Confirmar Reversão
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
