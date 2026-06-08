import DashboardLayout from "@/components/DashboardLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { Receipt, DollarSign, AlertTriangle, CheckCircle, Loader2, Shield, History, Plus, Trash2, FileDown, Wallet, TrendingUp, Building2, Layers, ListChecks } from "lucide-react";

const fmt = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: any) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const fdBadgeClass = (m: string) =>
  m === "fd_cliente" ? "bg-blue-100 text-blue-700"
  : m === "fd_fc" ? "bg-indigo-100 text-indigo-700"
  : "bg-purple-100 text-purple-700";
const fdBadgeLabel = (m: string) =>
  m === "fd_cliente" ? "FD Cliente" : m === "fd_fc" ? "Fat. Direto FC" : "FD Terceiro";

function KpiRow({ orcado, utilizado, saldo }: { orcado: number; utilizado: number; saldo: number }) {
  const pct = orcado > 0 ? (utilizado / orcado) * 100 : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <Wallet className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-medium">Orçamento FD (Total)</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{fmt(orcado)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500">
            <TrendingUp className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium">Utilizado (Realizado)</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{fmt(utilizado)}</p>
        </div>
        <div className={`rounded-xl border p-4 shadow-sm ${saldo < 0 ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50/50"}`}>
          <div className="flex items-center gap-2 text-gray-500">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium">Saldo Disponível</span>
          </div>
          <p className={`mt-2 text-2xl font-bold ${saldo < 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(saldo)}</p>
        </div>
      </div>
      {orcado > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Utilização do FD</span>
            <span className={pct > 90 ? "text-red-600 font-semibold" : "font-medium text-gray-700"}>{pct.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-indigo-500"}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          {pct >= 90 && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Atenção: saldo de FD abaixo de 10%. Novas OCs FD podem ser bloqueadas.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const tabTriggerCls = "data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-gray-600 gap-1.5 text-xs";

type FatFiltro = "todos" | "faturado" | "pendente";
function FiltroFatChips({ value, onChange }: { value: FatFiltro; onChange: (v: FatFiltro) => void }) {
  const opts: [FatFiltro, string][] = [["todos", "Todos"], ["faturado", "Faturado"], ["pendente", "Pendente"]];
  return (
    <div className="flex gap-1">
      {opts.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${value === v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function PainelFd() {
  const { selectedCompanyId } = useCompany();
  const { isAdminMaster } = usePermissions();
  const [, navigate] = useLocation();
  const abrirOc = (id: number) => {
    if (!Number.isFinite(Number(id)) || Number(id) <= 0) return;
    navigate(`/compras/ordens?destaque=${id}`);
  };
  const companyId = parseInt(selectedCompanyId || "0");
  const [selectedObra, setSelectedObra] = useState<number>(-1);
  const [showAjuste, setShowAjuste] = useState<any>(null);
  const [ajusteForm, setAjusteForm] = useState({ novoValor: "", justificativa: "", adminEmail: "", adminSenha: "" });
  const [showAddItem, setShowAddItem] = useState(false);
  const [addForm, setAddForm] = useState({ codigoInsumo: "", descricao: "", unidade: "un", qtdOrcada: "", precoUnit: "", fornecedor: "", justificativa: "", adminEmail: "", adminSenha: "" });
  const [showRemoveItem, setShowRemoveItem] = useState<any>(null);
  const [removeForm, setRemoveForm] = useState({ justificativa: "", adminEmail: "", adminSenha: "" });
  const [fItens, setFItens] = useState<FatFiltro>("todos");
  const [fLanc, setFLanc] = useState<FatFiltro>("todos");

  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });
  const obras = (obrasQ.data ?? []) as any[];
  const obraSel = obras.find((o: any) => o.id === selectedObra);
  const orcamentoId = obraSel?.orcamentoId ?? 0;

  const saldoQ = trpc.compras.getSaldoFd.useQuery(
    { companyId, obraId: selectedObra },
    { enabled: selectedObra > 0 }
  );

  const todasQ = trpc.compras.getSaldoFdTodasObras.useQuery(
    { companyId },
    { enabled: companyId > 0 && selectedObra === -1 }
  );
  const todas = todasQ.data;

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

  const adicionarItem = trpc.compras.adicionarItemFd.useMutation({
    onSuccess: (res) => {
      toast.success(`Item adicionado por ${res.adminNome}`);
      saldoQ.refetch();
      historicoQ.refetch();
      setShowAddItem(false);
      setAddForm({ codigoInsumo: "", descricao: "", unidade: "un", qtdOrcada: "", precoUnit: "", fornecedor: "", justificativa: "", adminEmail: "", adminSenha: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const removerItem = trpc.compras.removerItemFd.useMutation({
    onSuccess: (res) => {
      toast.success(`Item removido por ${res.adminNome}`);
      saldoQ.refetch();
      historicoQ.refetch();
      setShowRemoveItem(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const saldo = saldoQ.data;
  const historico = historicoQ.data ?? [];
  const ocsObra = (saldo?.ocsComFd ?? []) as any[];
  const itensFd = (saldo?.itensFd ?? []) as any[];
  const matchFat = (faturado: boolean, f: FatFiltro) => f === "todos" ? true : f === "faturado" ? faturado : !faturado;
  const itensFiltrados = itensFd.filter((i: any) => matchFat(!!i.faturado, fItens));
  const ocsObraFiltradas = ocsObra.filter((oc: any) => matchFat(oc.fdStatus === "aprovado", fLanc));

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-indigo-600" /> Painel de Faturamento Direto
          </h1>
          <p className="text-sm text-gray-500">Controle diário de saldo, itens e lançamentos de FD por obra.</p>
        </div>

        <div className="flex gap-3 items-end">
          <div className="space-y-1 w-72">
            <Label className="text-xs text-gray-700">Obra</Label>
            <Select value={String(selectedObra)} onValueChange={v => setSelectedObra(parseInt(v))}>
              <SelectTrigger className="h-9 bg-white border-gray-300 text-gray-900"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Todas as obras</SelectItem>
                {obras.map((o: any) => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ===================== TODAS AS OBRAS ===================== */}
        {selectedObra === -1 && todasQ.isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        )}

        {selectedObra === -1 && !todas && !todasQ.isLoading && todasQ.isError && (
          <div className="text-center py-16 text-gray-400 text-sm">Erro ao carregar o saldo de FD das obras. Tente novamente.</div>
        )}

        {selectedObra === -1 && todas && (
          <>
            <KpiRow orcado={todas.totais.totalFdOrcado} utilizado={todas.totais.totalFdComprometido} saldo={todas.totais.saldoFd} />

            <Tabs defaultValue="obras" className="w-full">
              <TabsList className="bg-gray-100">
                <TabsTrigger value="obras" className={tabTriggerCls}><Building2 className="h-3.5 w-3.5" /> Por Obra</TabsTrigger>
                <TabsTrigger value="lancamentos" className={tabTriggerCls}><ListChecks className="h-3.5 w-3.5" /> Lançamentos FD ({(todas.ocsComFd as any[])?.length ?? 0})</TabsTrigger>
              </TabsList>

              <TabsContent value="obras" className="mt-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  {todas.porObra.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-200">
                          <TableHead className="text-xs text-gray-500">Obra</TableHead>
                          <TableHead className="text-xs text-gray-500 text-center">OCs FD</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Orçado</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Utilizado</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Saldo</TableHead>
                          <TableHead className="text-xs text-gray-500 text-center">Utilização</TableHead>
                          <TableHead className="text-xs text-gray-500 w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todas.porObra.map((o: any) => {
                          const pct = o.totalFdOrcado > 0 ? (o.totalFdComprometido / o.totalFdOrcado) * 100 : 0;
                          return (
                            <TableRow key={o.obraId} className="border-gray-100">
                              <TableCell className="text-xs text-gray-900 font-medium">{o.obraNome}</TableCell>
                              <TableCell className="text-xs text-center">{o.qtdOcsFd}</TableCell>
                              <TableCell className="text-xs text-right">{fmt(o.totalFdOrcado)}</TableCell>
                              <TableCell className="text-xs text-right text-amber-600">{fmt(o.totalFdComprometido)}</TableCell>
                              <TableCell className={`text-xs text-right font-semibold ${o.saldoFd < 0 ? "text-red-600" : "text-emerald-600"}`}>{fmt(o.saldoFd)}</TableCell>
                              <TableCell className="text-xs text-center">
                                {o.totalFdOrcado > 0 ? (
                                  <span className={pct > 90 ? "text-red-600 font-semibold" : "text-gray-600"}>{pct.toFixed(0)}%</span>
                                ) : <span className="text-gray-300">—</span>}
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-indigo-600 hover:text-indigo-800"
                                  onClick={() => setSelectedObra(o.obraId)}>
                                  Detalhar
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhuma obra com Faturamento Direto nesta empresa.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="lancamentos" className="mt-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  {todas.ocsComFd && (todas.ocsComFd as any[]).length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-200">
                          <TableHead className="text-xs text-gray-500">Nº FD / OC</TableHead>
                          <TableHead className="text-xs text-gray-500">Data</TableHead>
                          <TableHead className="text-xs text-gray-500">Obra</TableHead>
                          <TableHead className="text-xs text-gray-500">Descrição</TableHead>
                          <TableHead className="text-xs text-gray-500">Modalidade</TableHead>
                          <TableHead className="text-xs text-gray-500">Status</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Valor</TableHead>
                          <TableHead className="text-xs text-gray-500 w-16">PDF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(todas.ocsComFd as any[]).map((oc: any) => (
                          <TableRow key={oc.id} className="border-gray-100 cursor-pointer hover:bg-indigo-50/50" onClick={() => abrirOc(oc.id)} title="Abrir OC">
                            <TableCell className="text-xs font-mono text-indigo-600 hover:underline">
                              <span className="font-semibold">{oc.numeroFd || "—"}</span>
                              <span className="text-gray-400"> · {oc.numeroOc ? formatNumeroOcDisplay(oc.numeroOc) : `#${oc.id}`}</span>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{fmtData(oc.data)}</TableCell>
                            <TableCell className="text-xs text-gray-700">{oc.obraNome}</TableCell>
                            <TableCell className="text-xs text-gray-900 max-w-[220px] truncate">{oc.descricao || "—"}</TableCell>
                            <TableCell className="text-xs">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${fdBadgeClass(oc.modalidadeFd)}`}>{fdBadgeLabel(oc.modalidadeFd)}</span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className={`font-medium ${oc.fdStatus === "aprovado" ? "text-emerald-600" : "text-amber-600"}`}>{oc.fdStatus === "aprovado" ? "Aprovado" : "Pendente"}</span>
                            </TableCell>
                            <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(Number(oc.valorEfetivo ?? 0))}</TableCell>
                            <TableCell>
                              {oc.modalidadeFd === "fd_cliente" && (
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-indigo-600 hover:text-indigo-800 gap-1"
                                  onClick={(e) => { e.stopPropagation(); window.open(`/api/download/fd/${oc.id}?mode=view`, "_blank"); }}>
                                  <FileDown className="h-3 w-3" /> PDF
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhum lançamento de FD nesta empresa.</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-3">Valor = valor FD aprovado quando informado; caso contrário, o total da OC.</p>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* ===================== OBRA ESPECÍFICA ===================== */}
        {selectedObra > 0 && saldo && (
          <>
            <KpiRow orcado={saldo.totalFdOrcado} utilizado={saldo.totalFdComprometido} saldo={saldo.saldoFd} />

            <Tabs defaultValue="itens" className="w-full">
              <TabsList className="bg-gray-100">
                <TabsTrigger value="itens" className={tabTriggerCls}><Layers className="h-3.5 w-3.5" /> Itens do FD ({saldo.itensFd.length})</TabsTrigger>
                <TabsTrigger value="lancamentos" className={tabTriggerCls}><ListChecks className="h-3.5 w-3.5" /> Lançamentos FD ({ocsObra.length})</TabsTrigger>
                <TabsTrigger value="historico" className={tabTriggerCls}><History className="h-3.5 w-3.5" /> Histórico ({historico.length})</TabsTrigger>
              </TabsList>

              {/* --- Itens considerados no FD (BDI FD) --- */}
              <TabsContent value="itens" className="mt-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-indigo-500" /> Itens considerados no FD
                    </h3>
                    <div className="flex items-center gap-2">
                      <FiltroFatChips value={fItens} onChange={setFItens} />
                      {isAdminMaster && (
                        <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
                          onClick={() => setShowAddItem(true)}>
                          <Plus className="h-3 w-3" /> Adicionar Item
                        </Button>
                      )}
                    </div>
                  </div>
                  {itensFd.length > 0 ? (
                    itensFiltrados.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-200">
                          <TableHead className="text-xs text-gray-500">Código</TableHead>
                          <TableHead className="text-xs text-gray-500">Descrição</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Qtd</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Preço Unit</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Total</TableHead>
                          <TableHead className="text-xs text-gray-500 text-center">Status</TableHead>
                          {isAdminMaster && <TableHead className="text-xs text-gray-500 w-32">Ações</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensFiltrados.map((item: any) => (
                          <TableRow key={item.id} className={`border-gray-100 ${item.comprado ? "bg-emerald-50/60" : ""}`}>
                            <TableCell className="text-xs font-mono text-gray-700">{item.codigoInsumo || "—"}</TableCell>
                            <TableCell className="text-xs text-gray-900">{item.descricao}</TableCell>
                            <TableCell className="text-xs text-right">{item.qtdOrcada}</TableCell>
                            <TableCell className="text-xs text-right">{fmt(item.precoUnit)}</TableCell>
                            <TableCell className="text-xs text-right font-semibold">{fmt(item.total)}</TableCell>
                            <TableCell className="text-center">
                              {item.faturado ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700"><CheckCircle className="h-3 w-3" /> Faturado</span>
                              ) : item.comprado ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">Comprado</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">Pendente</span>
                              )}
                            </TableCell>
                            {isAdminMaster && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-indigo-600 hover:text-indigo-800 gap-1"
                                    onClick={() => { setShowAjuste(item); setAjusteForm({ novoValor: String(item.total), justificativa: "", adminEmail: "", adminSenha: "" }); }}>
                                    <Shield className="h-3 w-3" /> Ajustar
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600 hover:text-red-800 gap-1"
                                    onClick={() => { setShowRemoveItem(item); setRemoveForm({ justificativa: "", adminEmail: "", adminSenha: "" }); }}>
                                    <Trash2 className="h-3 w-3" /> Remover
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-6">Nenhum item {fItens === "faturado" ? "faturado" : "pendente"} neste orçamento.</p>
                    )
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhum item FD cadastrado neste orçamento.</p>
                  )}
                </div>
              </TabsContent>

              {/* --- Lançamentos FD (OCs com numeração) --- */}
              <TabsContent value="lancamentos" className="mt-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      <Receipt className="h-4 w-4 text-indigo-500" /> Lançamentos de FD (OCs)
                    </h3>
                    <FiltroFatChips value={fLanc} onChange={setFLanc} />
                  </div>
                  {ocsObra.length > 0 ? (
                    ocsObraFiltradas.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-200">
                          <TableHead className="text-xs text-gray-500">Nº FD / OC</TableHead>
                          <TableHead className="text-xs text-gray-500">Data</TableHead>
                          <TableHead className="text-xs text-gray-500">Descrição</TableHead>
                          <TableHead className="text-xs text-gray-500">Modalidade</TableHead>
                          <TableHead className="text-xs text-gray-500">Status</TableHead>
                          <TableHead className="text-xs text-gray-500 text-right">Valor</TableHead>
                          <TableHead className="text-xs text-gray-500 w-16">PDF</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ocsObraFiltradas.map((oc: any) => (
                          <TableRow key={oc.id} className={`border-gray-100 cursor-pointer ${oc.fdStatus === "aprovado" ? "bg-emerald-50/60 hover:bg-emerald-100/60" : "hover:bg-indigo-50/50"}`} onClick={() => abrirOc(oc.id)} title="Abrir OC">
                            <TableCell className="text-xs font-mono text-indigo-600 hover:underline">
                              <span className="font-semibold">{oc.numeroFd || "—"}</span>
                              <span className="text-gray-400"> · {oc.numeroOc ? formatNumeroOcDisplay(oc.numeroOc) : `#${oc.id}`}</span>
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{fmtData(oc.data)}</TableCell>
                            <TableCell className="text-xs text-gray-900 max-w-[260px] truncate">{oc.descricao || "—"}</TableCell>
                            <TableCell className="text-xs">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${fdBadgeClass(oc.modalidadeFd)}`}>{fdBadgeLabel(oc.modalidadeFd)}</span>
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className={`font-medium ${oc.fdStatus === "aprovado" ? "text-emerald-600" : "text-amber-600"}`}>{oc.fdStatus === "aprovado" ? "Faturado" : "Pendente"}</span>
                            </TableCell>
                            <TableCell className="text-xs text-right font-semibold text-gray-900">{fmt(Number(oc.valorEfetivo ?? 0))}</TableCell>
                            <TableCell>
                              {oc.modalidadeFd === "fd_cliente" && (
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-indigo-600 hover:text-indigo-800 gap-1"
                                  onClick={(e) => { e.stopPropagation(); window.open(`/api/download/fd/${oc.id}?mode=view`, "_blank"); }}>
                                  <FileDown className="h-3 w-3" /> PDF
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      {fLanc === "todos" && (
                      <tfoot>
                        <tr className="border-t border-gray-200">
                          <td colSpan={5} className="text-xs text-gray-500 font-medium pt-2 pr-3 text-right">Total utilizado</td>
                          <td className="text-xs text-right font-bold text-amber-600 pt-2">{fmt(saldo.totalFdComprometido)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                      )}
                    </Table>
                    ) : (
                      <p className="text-xs text-gray-400 text-center py-6">Nenhum lançamento {fLanc === "faturado" ? "faturado" : "pendente"} para esta obra.</p>
                    )
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhum lançamento de FD para esta obra.</p>
                  )}
                  <p className="text-[10px] text-gray-400">Valor = valor FD aprovado quando informado; caso contrário, o total da OC.</p>
                </div>
              </TabsContent>

              {/* --- Histórico de ajustes --- */}
              <TabsContent value="historico" className="mt-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <History className="h-4 w-4 text-gray-400" /> Histórico de Ajustes FD
                  </h3>
                  {historico.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
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
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhum ajuste registrado para este orçamento.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {selectedObra > 0 && !saldo && saldoQ.isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        )}

        {selectedObra > 0 && !saldo && !saldoQ.isLoading && (
          <div className="text-center py-16 text-gray-400 text-sm">
            {saldoQ.isError ? "Erro ao carregar o saldo de FD desta obra." : "Esta obra ainda não possui dados de Faturamento Direto."}
          </div>
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

      <Dialog open={showAddItem} onOpenChange={v => { if (!v) setShowAddItem(false); }}>
        <DialogContent className="border-gray-200 max-w-lg" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-indigo-700 flex items-center gap-2"><Plus className="h-5 w-5" /> Adicionar Item FD — Admin Master</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-gray-600">Novo item será adicionado ao BDI FD do orçamento. Requer autenticação Admin Master.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-700">Código Insumo</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" value={addForm.codigoInsumo} onChange={e => setAddForm(p => ({ ...p, codigoInsumo: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Unidade</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" value={addForm.unidade} onChange={e => setAddForm(p => ({ ...p, unidade: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-700">Descrição *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" value={addForm.descricao} onChange={e => setAddForm(p => ({ ...p, descricao: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Quantidade *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="number" step="0.01" value={addForm.qtdOrcada} onChange={e => setAddForm(p => ({ ...p, qtdOrcada: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Preço Unitário (R$) *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="number" step="0.01" value={addForm.precoUnit} onChange={e => setAddForm(p => ({ ...p, precoUnit: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-700">Fornecedor</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" value={addForm.fornecedor} onChange={e => setAddForm(p => ({ ...p, fornecedor: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-gray-700">Justificativa *</Label>
                <Textarea className="text-sm bg-white text-gray-900 border-gray-300 min-h-[50px]" value={addForm.justificativa} onChange={e => setAddForm(p => ({ ...p, justificativa: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Email Admin Master *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="email" value={addForm.adminEmail} onChange={e => setAddForm(p => ({ ...p, adminEmail: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Senha Admin Master *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="password" value={addForm.adminSenha} onChange={e => setAddForm(p => ({ ...p, adminSenha: e.target.value }))} />
              </div>
            </div>
            {addForm.qtdOrcada && addForm.precoUnit && (
              <p className="text-sm font-semibold text-indigo-600">Total: {fmt(parseFloat(addForm.qtdOrcada || "0") * parseFloat(addForm.precoUnit || "0"))}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddItem(false)}>Cancelar</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                disabled={adicionarItem.isPending || !addForm.descricao || !addForm.qtdOrcada || !addForm.precoUnit || !addForm.justificativa || !addForm.adminEmail || !addForm.adminSenha}
                onClick={() => {
                  if (!orcamentoId) return;
                  adicionarItem.mutate({
                    companyId,
                    orcamentoId,
                    codigoInsumo: addForm.codigoInsumo || undefined,
                    descricao: addForm.descricao,
                    unidade: addForm.unidade || undefined,
                    qtdOrcada: parseFloat(addForm.qtdOrcada),
                    precoUnit: parseFloat(addForm.precoUnit),
                    fornecedor: addForm.fornecedor || undefined,
                    justificativa: addForm.justificativa,
                    adminEmail: addForm.adminEmail,
                    adminSenha: addForm.adminSenha,
                  });
                }}>
                {adicionarItem.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar Item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showRemoveItem} onOpenChange={v => { if (!v) setShowRemoveItem(null); }}>
        <DialogContent className="border-gray-200 max-w-md" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2"><Trash2 className="h-5 w-5" /> Remover Item FD — Admin Master</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              <p className="text-sm font-medium text-red-800">Remover item: {showRemoveItem?.descricao}</p>
              <p className="text-xs text-red-600">Valor: {fmt(parseFloat(showRemoveItem?.total ?? "0"))}</p>
              <p className="text-xs text-red-500">Esta ação não pode ser desfeita. Itens com OCs vinculadas não podem ser removidos.</p>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-gray-700">Justificativa *</Label>
                <Textarea className="text-sm bg-white text-gray-900 border-gray-300 min-h-[50px]" value={removeForm.justificativa} onChange={e => setRemoveForm(p => ({ ...p, justificativa: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Email Admin Master *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="email" value={removeForm.adminEmail} onChange={e => setRemoveForm(p => ({ ...p, adminEmail: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-gray-700">Senha Admin Master *</Label>
                <Input className="h-8 text-sm bg-white text-gray-900 border-gray-300" type="password" value={removeForm.adminSenha} onChange={e => setRemoveForm(p => ({ ...p, adminSenha: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowRemoveItem(null)}>Cancelar</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white gap-1.5"
                disabled={removerItem.isPending || !removeForm.justificativa || !removeForm.adminEmail || !removeForm.adminSenha}
                onClick={() => {
                  if (!showRemoveItem || !orcamentoId) return;
                  removerItem.mutate({
                    companyId,
                    orcamentoId,
                    bdiFdId: showRemoveItem.id,
                    justificativa: removeForm.justificativa,
                    adminEmail: removeForm.adminEmail,
                    adminSenha: removeForm.adminSenha,
                  });
                }}>
                {removerItem.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Confirmar Remoção
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
