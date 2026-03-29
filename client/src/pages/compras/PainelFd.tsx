import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Receipt, DollarSign, AlertTriangle, CheckCircle, Loader2, Shield, History } from "lucide-react";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PainelFd() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");
  const [selectedObra, setSelectedObra] = useState<number>(0);
  const [showAjuste, setShowAjuste] = useState<any>(null);
  const [ajusteForm, setAjusteForm] = useState({ novoValor: "", justificativa: "", adminEmail: "", adminSenha: "" });

  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const obras = (obrasQ.data ?? []) as any[];
  const obraSel = obras.find((o: any) => o.id === selectedObra);
  const orcamentoId = obraSel?.orcamentoId ?? 0;

  const saldoQ = trpc.compras.getSaldoFd.useQuery(
    { companyId, obraId: selectedObra },
    { enabled: selectedObra > 0 }
  );

  const historicoQ = trpc.compras.getHistoricoFdAjustes.useQuery(
    { companyId, orcamentoId },
    { enabled: orcamentoId > 0 }
  );

  const ajustarFd = trpc.compras.ajustarFd.useMutation({
    onSuccess: (res) => {
      toast.success(`FD ajustado por ${res.adminNome}`);
      saldoQ.refetch();
      historicoQ.refetch();
      setShowAjuste(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const saldo = saldoQ.data;
  const historico = historicoQ.data ?? [];
  const pctUsado = saldo && saldo.totalFdOrcado > 0 ? (saldo.totalFdComprometido / saldo.totalFdOrcado) * 100 : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-indigo-600" /> Painel de Faturamento Direto
          </h1>
          <p className="text-sm text-gray-500">Controle de saldo, itens e ajustes de FD por obra</p>
        </div>

        <div className="flex gap-3 items-end">
          <div className="space-y-1 w-72">
            <Label className="text-xs text-gray-700">Obra</Label>
            <Select value={String(selectedObra)} onValueChange={v => setSelectedObra(parseInt(v))}>
              <SelectTrigger className="h-9 bg-white border-gray-300 text-gray-900"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
              <SelectContent>
                {obras.map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedObra > 0 && saldo && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-1">
                <p className="text-xs text-gray-500 font-medium">Orçamento FD Total</p>
                <p className="text-xl font-bold text-gray-900">{fmt(saldo.totalFdOrcado)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-1">
                <p className="text-xs text-gray-500 font-medium">FD Comprometido</p>
                <p className="text-xl font-bold text-amber-600">{fmt(saldo.totalFdComprometido)}</p>
              </div>
              <div className={`bg-white border rounded-lg p-4 space-y-1 ${saldo.saldoFd < 0 ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
                <p className="text-xs text-gray-500 font-medium">Saldo Disponível</p>
                <p className={`text-xl font-bold ${saldo.saldoFd < 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(saldo.saldoFd)}</p>
              </div>
            </div>

            {pctUsado > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Utilização FD</span>
                  <span className={pctUsado > 90 ? "text-red-600 font-semibold" : ""}>{pctUsado.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${pctUsado > 90 ? "bg-red-500" : pctUsado > 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                    style={{ width: `${Math.min(pctUsado, 100)}%` }}
                  />
                </div>
                {pctUsado >= 90 && (
                  <div className="flex items-center gap-2 text-xs text-red-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Atenção: saldo de FD abaixo de 10%. Novas OCs FD podem ser bloqueadas.</span>
                  </div>
                )}
              </div>
            )}

            {saldo.itensFd.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-indigo-500" /> Itens do BDI FD
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow className="border-gray-200">
                      <TableHead className="text-xs text-gray-500">Código</TableHead>
                      <TableHead className="text-xs text-gray-500">Descrição</TableHead>
                      <TableHead className="text-xs text-gray-500 text-right">Qtd</TableHead>
                      <TableHead className="text-xs text-gray-500 text-right">Preço Unit</TableHead>
                      <TableHead className="text-xs text-gray-500 text-right">Total</TableHead>
                      <TableHead className="text-xs text-gray-500 w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saldo.itensFd.map((item: any) => (
                      <TableRow key={item.id} className="border-gray-100">
                        <TableCell className="text-xs font-mono text-gray-700">{item.codigoInsumo || "—"}</TableCell>
                        <TableCell className="text-xs text-gray-900">{item.descricao}</TableCell>
                        <TableCell className="text-xs text-right">{item.qtdOrcada}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(item.precoUnit)}</TableCell>
                        <TableCell className="text-xs text-right font-semibold">{fmt(item.total)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-indigo-600 hover:text-indigo-800 gap-1"
                            onClick={() => { setShowAjuste(item); setAjusteForm({ novoValor: String(item.total), justificativa: "", adminEmail: "", adminSenha: "" }); }}>
                            <Shield className="h-3 w-3" /> Ajustar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {historico.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <History className="h-4 w-4 text-gray-400" /> Histórico de Ajustes FD
                </h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {historico.map((h: any) => (
                    <div key={h.id} className="flex items-start gap-3 text-xs border-b border-gray-100 pb-2">
                      <div className="bg-indigo-100 text-indigo-700 rounded-full p-1.5 mt-0.5"><Shield className="h-3 w-3" /></div>
                      <div className="flex-1">
                        <p className="text-gray-900 font-medium">{h.descricao}</p>
                        <p className="text-gray-500">{fmt(parseFloat(h.valorAnterior ?? "0"))} → {fmt(parseFloat(h.valorNovo ?? "0"))}</p>
                        <p className="text-gray-400 mt-0.5">por {h.adminNome} — {h.justificativa}</p>
                      </div>
                      <span className="text-gray-400 text-[10px] shrink-0">{new Date(h.createdAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {selectedObra > 0 && !saldo && saldoQ.isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        )}

        {selectedObra === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">Selecione uma obra para visualizar o saldo de FD.</div>
        )}
      </div>

      <Dialog open={!!showAjuste} onOpenChange={v => { if (!v) setShowAjuste(null); }}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-indigo-700 flex items-center gap-2"><Shield className="h-5 w-5" /> Ajuste FD — Admin Master</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-gray-600">Somente Admin Master pode ajustar valores de FD. Todas as alterações são registradas no log de auditoria.</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-gray-700">Novo Valor (R$) *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="number" step="0.01" value={ajusteForm.novoValor} onChange={e => setAjusteForm(p => ({ ...p, novoValor: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Justificativa *</Label>
                <Textarea className="text-sm bg-white text-gray-900 border-gray-300 min-h-[60px]" placeholder="Motivo do ajuste..." value={ajusteForm.justificativa} onChange={e => setAjusteForm(p => ({ ...p, justificativa: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Email Admin Master *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="email" value={ajusteForm.adminEmail} onChange={e => setAjusteForm(p => ({ ...p, adminEmail: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Senha Admin Master *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="password" value={ajusteForm.adminSenha} onChange={e => setAjusteForm(p => ({ ...p, adminSenha: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAjuste(null)}>Cancelar</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                disabled={ajustarFd.isPending || !ajusteForm.novoValor || !ajusteForm.justificativa || !ajusteForm.adminEmail || !ajusteForm.adminSenha}
                onClick={() => {
                  if (!showAjuste || !orcamentoId) return;
                  ajustarFd.mutate({
                    companyId,
                    orcamentoId,
                    bdiFdId: showAjuste.id,
                    novoValor: parseFloat(ajusteForm.novoValor),
                    justificativa: ajusteForm.justificativa,
                    adminEmail: ajusteForm.adminEmail,
                    adminSenha: ajusteForm.adminSenha,
                  });
                }}>
                {ajustarFd.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Confirmar Ajuste
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
