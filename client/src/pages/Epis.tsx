import DashboardLayout from "@/components/DashboardLayout";
import PrintActions from "@/components/PrintActions";
import PrintHeader from "@/components/PrintHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Plus, Search, Pencil, Trash2, HardHat, Package, AlertTriangle,
  ShieldCheck, Calendar, ArrowRight, ChevronLeft, User, ClipboardList,
  DollarSign, Clock, Settings2, Printer, Upload, Eye, FileText
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";

type ViewMode = "catalogo" | "entregas" | "novo_epi" | "nova_entrega" | "config_bdi" | "ficha_epi";

export default function Epis() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const { user } = useAuth();
  const isMaster = user?.role === "admin_master";

  const [viewMode, setViewMode] = useState<ViewMode>("catalogo");
  const [search, setSearch] = useState("");
  const [editingEpi, setEditingEpi] = useState<any>(null);
  const [selectedEpis, setSelectedEpis] = useState<Set<number>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [fichaDelivery, setFichaDelivery] = useState<any>(null);

  // Queries
  const episQ = trpc.epis.list.useQuery({ companyId }, { enabled: !!companyId });
  const deliveriesQ = trpc.epis.listDeliveries.useQuery({ companyId }, { enabled: !!companyId });
  const statsQ = trpc.epis.stats.useQuery({ companyId }, { enabled: !!companyId });
  const employeesQ = trpc.employees.list.useQuery({ companyId, status: "Ativo" }, { enabled: !!companyId });
  const bdiQ = trpc.epis.getBdi.useQuery({ companyId }, { enabled: !!companyId });
  const formTextQ = trpc.epis.getFormText.useQuery({ companyId }, { enabled: !!companyId });

  const episList = episQ.data ?? [];
  const deliveriesList = deliveriesQ.data ?? [];
  const stats = statsQ.data;
  const employeesList = useMemo(() => (employeesQ.data ?? []).sort((a: any, b: any) => a.nomeCompleto.localeCompare(b.nomeCompleto)), [employeesQ.data]);

  // Form state - EPI
  const [epiForm, setEpiForm] = useState({
    nome: "", ca: "", validadeCa: "", fabricante: "", fornecedor: "",
    quantidadeEstoque: 0, valorProduto: "", tempoMinimoTroca: "",
  });

  // Form state - Entrega
  const [entregaForm, setEntregaForm] = useState({
    epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0],
    motivo: "", observacoes: "", motivoTroca: "",
  });

  // BDI config
  const [bdiValue, setBdiValue] = useState("");

  // Mutations
  const createEpiMut = trpc.epis.create.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); setViewMode("catalogo"); toast.success("EPI cadastrado!"); resetEpiForm(); },
    onError: (err) => toast.error(err.message),
  });
  const updateEpiMut = trpc.epis.update.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); setEditingEpi(null); toast.success("EPI atualizado!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteEpiMut = trpc.epis.delete.useMutation({
    onSuccess: () => { episQ.refetch(); statsQ.refetch(); toast.success("EPI removido!"); },
    onError: (err) => toast.error(err.message),
  });
  const createDeliveryMut = trpc.epis.createDelivery.useMutation({
    onSuccess: (result: any) => {
      deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch();
      if (result?.valorCobrado) {
        toast.success(`Entrega registrada! Valor cobrado: R$ ${parseFloat(result.valorCobrado).toFixed(2)}`);
      } else {
        toast.success("Entrega registrada!");
      }
      setViewMode("entregas"); resetEntregaForm();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteDeliveryMut = trpc.epis.deleteDelivery.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); episQ.refetch(); statsQ.refetch(); toast.success("Entrega removida!"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteBatchMut = trpc.epis.deleteBatch.useMutation({
    onSuccess: (data: any) => { episQ.refetch(); statsQ.refetch(); setSelectedEpis(new Set()); setShowBatchDeleteDialog(false); toast.success(`${data.deleted} EPI(s) removido(s)!`); },
    onError: (err: any) => toast.error(err.message),
  });
  const setBdiMut = trpc.epis.setBdi.useMutation({
    onSuccess: () => { bdiQ.refetch(); toast.success("BDI atualizado!"); },
    onError: (err) => toast.error(err.message),
  });
  const uploadFichaMut = trpc.epis.uploadFicha.useMutation({
    onSuccess: () => { deliveriesQ.refetch(); toast.success("Ficha assinada anexada!"); },
    onError: (err) => toast.error(err.message),
  });

  const toggleSelectEpi = (id: number) => {
    setSelectedEpis(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAllEpis = () => {
    if (selectedEpis.size === filteredEpis.length) {
      setSelectedEpis(new Set());
    } else {
      setSelectedEpis(new Set(filteredEpis.map((e: any) => e.id)));
    }
  };

  function resetEpiForm() {
    setEpiForm({ nome: "", ca: "", validadeCa: "", fabricante: "", fornecedor: "", quantidadeEstoque: 0, valorProduto: "", tempoMinimoTroca: "" });
  }
  function resetEntregaForm() {
    setEntregaForm({ epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0], motivo: "", observacoes: "", motivoTroca: "" });
  }

  const hoje = new Date().toISOString().split("T")[0];

  // Filtered lists
  const filteredEpis = useMemo(() => {
    if (!search) return episList;
    const s = search.toLowerCase();
    return episList.filter((e: any) =>
      e.nome?.toLowerCase().includes(s) ||
      (e.ca || "").toLowerCase().includes(s) ||
      (e.fabricante || "").toLowerCase().includes(s)
    );
  }, [episList, search]);

  const filteredDeliveries = useMemo(() => {
    if (!search) return deliveriesList;
    const s = search.toLowerCase();
    return deliveriesList.filter((d: any) =>
      (d.nomeEpi || "").toLowerCase().includes(s) ||
      (d.nomeFunc || "").toLowerCase().includes(s)
    );
  }, [deliveriesList, search]);

  const formatCurrency = (val: any) => {
    if (!val) return "—";
    return `R$ ${parseFloat(String(val)).toFixed(2)}`;
  };

  // ============================================================
  // BDI CONFIG VIEW
  // ============================================================
  if (viewMode === "config_bdi") {
    return (
      <DashboardLayout>
        <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("catalogo")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Configurações de EPI</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-600" />
                BDI sobre EPI (%)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Percentual de BDI (Benefícios e Despesas Indiretas) aplicado sobre o custo do EPI quando o colaborador
                perde, danifica ou tem o EPI furtado antes do tempo mínimo de troca. O colaborador não visualiza o BDI,
                apenas o valor final de cobrança.
              </p>
              <div className="flex items-center gap-3">
                <Label className="w-24">BDI (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  className="w-32"
                  value={bdiValue || String(bdiQ.data?.bdiPercentual ?? 40)}
                  onChange={e => setBdiValue(e.target.value)}
                  placeholder="40"
                />
                <Button
                  onClick={() => setBdiMut.mutate({ companyId, bdiPercentual: parseFloat(bdiValue || "40") })}
                  disabled={setBdiMut.isPending}
                  className="bg-[#1B2A4A] hover:bg-[#243660]"
                >
                  {setBdiMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                <p className="font-semibold text-amber-800 mb-1">Base Legal</p>
                <p className="text-amber-700">
                  Art. 462, §1º da CLT: "É lícito ao empregador efetuar descontos nos salários do empregado em caso de
                  dano causado pelo empregado, desde que esta possibilidade tenha sido acordada ou na ocorrência de dolo do empregado."
                </p>
                <p className="text-amber-700 mt-2">
                  NR-6 do MTE: O empregador deve fornecer EPIs gratuitamente, mas pode cobrar em caso de extravio ou dano doloso.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // FORM: NOVO EPI
  // ============================================================
  if (viewMode === "novo_epi") {
    return (
      <DashboardLayout>
        <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("catalogo")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Cadastrar Novo EPI</h1>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4 w-full">
              <div>
                <Label>Nome do EPI *</Label>
                <Input value={epiForm.nome} onChange={e => setEpiForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Capacete de Segurança, Luva de Proteção..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Número do CA</Label>
                  <Input value={epiForm.ca} onChange={e => setEpiForm(f => ({ ...f, ca: e.target.value }))}
                    placeholder="Ex: 12345" />
                </div>
                <div>
                  <Label>Validade do CA</Label>
                  <Input type="date" value={epiForm.validadeCa} onChange={e => setEpiForm(f => ({ ...f, validadeCa: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fabricante</Label>
                  <Input value={epiForm.fabricante} onChange={e => setEpiForm(f => ({ ...f, fabricante: e.target.value }))}
                    placeholder="Nome do fabricante" />
                </div>
                <div>
                  <Label>Fornecedor</Label>
                  <Input value={epiForm.fornecedor} onChange={e => setEpiForm(f => ({ ...f, fornecedor: e.target.value }))}
                    placeholder="Nome do fornecedor" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Quantidade em Estoque</Label>
                  <Input type="number" min={0} value={epiForm.quantidadeEstoque}
                    onChange={e => setEpiForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3 text-green-600" />
                    Valor do Produto (R$)
                  </Label>
                  <Input type="number" min={0} step="0.01" value={epiForm.valorProduto}
                    onChange={e => setEpiForm(f => ({ ...f, valorProduto: e.target.value }))}
                    placeholder="0.00" />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-blue-600" />
                    Tempo Mín. Troca (dias)
                  </Label>
                  <Input type="number" min={0} value={epiForm.tempoMinimoTroca}
                    onChange={e => setEpiForm(f => ({ ...f, tempoMinimoTroca: e.target.value }))}
                    placeholder="Ex: 180" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("catalogo"); resetEpiForm(); }}>Cancelar</Button>
                <Button onClick={() => {
                  if (!epiForm.nome.trim()) return toast.error("Nome do EPI é obrigatório");
                  createEpiMut.mutate({
                    companyId, nome: epiForm.nome,
                    ca: epiForm.ca || undefined, validadeCa: epiForm.validadeCa || undefined,
                    fabricante: epiForm.fabricante || undefined, fornecedor: epiForm.fornecedor || undefined,
                    quantidadeEstoque: epiForm.quantidadeEstoque,
                    valorProduto: epiForm.valorProduto ? parseFloat(epiForm.valorProduto) : undefined,
                    tempoMinimoTroca: epiForm.tempoMinimoTroca ? parseInt(epiForm.tempoMinimoTroca) : undefined,
                  });
                }} disabled={createEpiMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {createEpiMut.isPending ? "Salvando..." : "Cadastrar EPI"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // FORM: NOVA ENTREGA
  // ============================================================
  if (viewMode === "nova_entrega") {
    const selectedEpi = episList.find((e: any) => String(e.id) === entregaForm.epiId);
    const bdiPct = bdiQ.data?.bdiPercentual ?? 40;
    const showCharge = entregaForm.motivoTroca && ['perda', 'mau_uso', 'furto'].includes(entregaForm.motivoTroca) && selectedEpi?.valorProduto;
    const chargeValue = showCharge ? (parseFloat(String(selectedEpi.valorProduto)) * (1 + bdiPct / 100)).toFixed(2) : null;

    return (
      <DashboardLayout>
        <PrintHeader />
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setViewMode("entregas")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Registrar Entrega de EPI</h1>
          </div>

          <Card>
            <CardContent className="p-6 space-y-4 w-full">
              <div>
                <Label>EPI *</Label>
                <Select value={entregaForm.epiId || undefined} onValueChange={v => setEntregaForm(f => ({ ...f, epiId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o EPI..." /></SelectTrigger>
                  <SelectContent>
                    {episList.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.nome} {e.ca ? `(CA: ${e.ca})` : ""} — Estoque: {e.quantidadeEstoque ?? 0}
                        {e.valorProduto ? ` — R$ ${parseFloat(String(e.valorProduto)).toFixed(2)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Funcionário *</Label>
                <Select value={entregaForm.employeeId || undefined} onValueChange={v => setEntregaForm(f => ({ ...f, employeeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o funcionário..." /></SelectTrigger>
                  <SelectContent>
                    {employeesList.map((e: any) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.nomeCompleto} — {e.funcao || "Sem função"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Quantidade *</Label>
                  <Input type="number" min={1} value={entregaForm.quantidade}
                    onChange={e => setEntregaForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label>Data da Entrega *</Label>
                  <Input type="date" value={entregaForm.dataEntrega}
                    onChange={e => setEntregaForm(f => ({ ...f, dataEntrega: e.target.value }))} />
                </div>
                <div>
                  <Label>Motivo da Troca</Label>
                  <Select value={entregaForm.motivoTroca || "nova_entrega"} onValueChange={v => setEntregaForm(f => ({ ...f, motivoTroca: v === "nova_entrega" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nova_entrega">Nova Entrega (sem troca)</SelectItem>
                      <SelectItem value="desgaste_normal">Desgaste Normal</SelectItem>
                      <SelectItem value="perda">Perda</SelectItem>
                      <SelectItem value="mau_uso">Mau Uso / Dano</SelectItem>
                      <SelectItem value="furto">Furto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {showCharge && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-700 font-semibold mb-1">
                    <AlertTriangle className="h-4 w-4" />
                    Cobrança Automática
                  </div>
                  <p className="text-sm text-red-600">
                    Custo do EPI: R$ {parseFloat(String(selectedEpi.valorProduto)).toFixed(2)} + BDI {bdiPct}% = <strong>R$ {chargeValue}</strong>
                  </p>
                  <p className="text-xs text-red-500 mt-1">
                    Base legal: Art. 462, §1º da CLT — desconto por dano causado pelo empregado
                  </p>
                </div>
              )}

              <div>
                <Label>Motivo / Observações</Label>
                <Input value={entregaForm.motivo} onChange={e => setEntregaForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Motivo da entrega ou observações" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("entregas"); resetEntregaForm(); }}>Cancelar</Button>
                <Button onClick={() => {
                  if (!entregaForm.epiId || !entregaForm.employeeId) return toast.error("Selecione EPI e funcionário");
                  createDeliveryMut.mutate({
                    companyId,
                    epiId: parseInt(entregaForm.epiId),
                    employeeId: parseInt(entregaForm.employeeId),
                    quantidade: entregaForm.quantidade,
                    dataEntrega: entregaForm.dataEntrega,
                    motivo: entregaForm.motivo || undefined,
                    observacoes: entregaForm.observacoes || undefined,
                    motivoTroca: entregaForm.motivoTroca || undefined,
                  });
                }} disabled={createDeliveryMut.isPending} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  {createDeliveryMut.isPending ? "Salvando..." : "Registrar Entrega"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // FICHA DE ENTREGA DE EPI (PRINTABLE)
  // ============================================================
  if (viewMode === "ficha_epi" && fichaDelivery) {
    const emp = employeesList.find((e: any) => e.id === fichaDelivery.employeeId);
    const epi = episList.find((e: any) => e.id === fichaDelivery.epiId);
    const textoFicha = formTextQ.data?.texto || '';

    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-3 print:hidden">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("entregas"); setFichaDelivery(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <h1 className="text-xl font-bold">Ficha de Entrega de EPI</h1>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf,.jpg,.jpeg,.png';
                input.onchange = async (e: any) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    uploadFichaMut.mutate({ deliveryId: fichaDelivery.id, fileBase64: base64, fileName: file.name });
                  };
                  reader.readAsDataURL(file);
                };
                input.click();
              }}>
                <Upload className="h-4 w-4 mr-1" /> Upload Assinada
              </Button>
              {fichaDelivery.fichaUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(fichaDelivery.fichaUrl, '_blank')}>
                  <Eye className="h-4 w-4 mr-1" /> Ver Assinada
                </Button>
              )}
            </div>
          </div>

          {/* Printable Form */}
          <div className="bg-white border rounded-lg p-8 max-w-3xl mx-auto print:border-0 print:shadow-none print:p-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-[#1B2A4A] pb-4 mb-6">
              <div className="flex items-center gap-3">
                <img src="/fc-logo.png" alt="FC Engenharia" className="h-12" onError={(e: any) => e.target.style.display = 'none'} />
                <div>
                  <h2 className="text-lg font-bold text-[#1B2A4A]">FC ENGENHARIA</h2>
                  <p className="text-xs text-gray-500">Ficha de Entrega de EPI</p>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Data: {fichaDelivery.dataEntrega ? new Date(fichaDelivery.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
              </div>
            </div>

            {/* Employee Info */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div><strong>Funcionário:</strong> {fichaDelivery.nomeFunc || emp?.nomeCompleto || "—"}</div>
              <div><strong>Função:</strong> {fichaDelivery.funcaoFunc || emp?.funcao || "—"}</div>
              <div><strong>CPF:</strong> {emp?.cpf || "—"}</div>
              <div><strong>Matrícula:</strong> {emp?.codigoInterno || "—"}</div>
            </div>

            {/* EPI Table */}
            <table className="w-full text-sm border mb-6">
              <thead>
                <tr className="bg-[#1B2A4A] text-white">
                  <th className="p-2 text-left">EPI</th>
                  <th className="p-2 text-center">CA</th>
                  <th className="p-2 text-center">Qtd</th>
                  <th className="p-2 text-center">Motivo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-2">{fichaDelivery.nomeEpi || epi?.nome || "—"}</td>
                  <td className="p-2 text-center">{fichaDelivery.caEpi || epi?.ca || "—"}</td>
                  <td className="p-2 text-center">{fichaDelivery.quantidade}</td>
                  <td className="p-2 text-center">{fichaDelivery.motivo || "Entrega regular"}</td>
                </tr>
              </tbody>
            </table>

            {/* Declaration Text */}
            <div className="text-sm text-justify mb-8 leading-relaxed">
              <p>{textoFicha}</p>
            </div>

            {/* Signature Lines */}
            <div className="grid grid-cols-2 gap-16 mt-12 pt-8">
              <div className="text-center">
                <div className="border-t border-black pt-2 text-sm">
                  Assinatura do Funcionário
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-black pt-2 text-sm">
                  Responsável pela Entrega
                </div>
              </div>
            </div>

            {/* Legal Footer */}
            <div className="mt-8 pt-4 border-t text-[10px] text-gray-400 text-center">
              Conforme Art. 462, §1º da CLT e NR-6 do MTE — Equipamentos de Proteção Individual
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ============================================================
  // MAIN VIEW
  // ============================================================
  return (
    <DashboardLayout>
      <PrintHeader />
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <HardHat className="h-6 w-6 text-amber-600" />
            <h1 className="text-xl font-bold text-gray-800">Equipamentos de Proteção Individual</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isMaster && (
              <Button variant="outline" size="sm" onClick={() => setViewMode("config_bdi")}>
                <Settings2 className="h-4 w-4 mr-1" /> BDI / Config
              </Button>
            )}
            {viewMode === "catalogo" && (
              <>
                {selectedEpis.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={() => setShowBatchDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir {selectedEpis.size}
                  </Button>
                )}
                <Button size="sm" onClick={() => setViewMode("novo_epi")} className="bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-1" /> Novo EPI
                </Button>
              </>
            )}
            {viewMode === "entregas" && (
              <Button size="sm" onClick={() => setViewMode("nova_entrega")} className="bg-[#1B2A4A] hover:bg-[#243660]">
                <Plus className="h-4 w-4 mr-1" /> Nova Entrega
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total EPIs</p>
                <p className="text-lg font-bold">{stats.totalItens}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Estoque Total</p>
                <p className="text-lg font-bold">{stats.estoqueTotal}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Estoque Baixo</p>
                <p className="text-lg font-bold text-amber-600">{stats.estoqueBaixo}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">CA Vencido</p>
                <p className="text-lg font-bold text-red-600">{stats.caVencido}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Total Entregas</p>
                <p className="text-lg font-bold">{stats.totalEntregas}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-cyan-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Entregas/Mês</p>
                <p className="text-lg font-bold">{stats.entregasMes}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Valor Inventário</p>
                <p className="text-lg font-bold text-emerald-700">
                  {stats.valorTotalInventario > 0 ? `R$ ${stats.valorTotalInventario.toFixed(2)}` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs + Search */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setViewMode("catalogo")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "catalogo" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <Package className="h-3.5 w-3.5 inline mr-1" /> Catálogo
            </button>
            <button onClick={() => setViewMode("entregas")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "entregas" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <ClipboardList className="h-3.5 w-3.5 inline mr-1" /> Entregas
            </button>
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>

        {/* ============================================================ */}
        {/* CATÁLOGO */}
        {/* ============================================================ */}
        {viewMode === "catalogo" && (
          filteredEpis.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhum EPI cadastrado</h3>
                <p className="text-muted-foreground text-sm mt-1">Cadastre os EPIs disponíveis para controle.</p>
                <Button onClick={() => setViewMode("novo_epi")} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-2" /> Cadastrar EPI
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-center w-10">
                          <input type="checkbox" checked={selectedEpis.size === filteredEpis.length && filteredEpis.length > 0}
                            onChange={toggleSelectAllEpis} className="rounded" />
                        </th>
                        <th className="p-3 text-left font-medium">EPI</th>
                        <th className="p-3 text-center font-medium">CA</th>
                        <th className="p-3 text-center font-medium">Validade CA</th>
                        <th className="p-3 text-center font-medium">Estoque</th>
                        <th className="p-3 text-center font-medium">Valor (R$)</th>
                        <th className="p-3 text-center font-medium">Vida Útil</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEpis.map((epi: any) => {
                        const caVencido = epi.validadeCa && epi.validadeCa < hoje;
                        const estoqueBaixo = (epi.quantidadeEstoque || 0) <= 5;
                        if (editingEpi?.id === epi.id) {
                          return (
                            <tr key={epi.id} className="border-b bg-blue-50">
                              <td colSpan={8} className="p-3">
                                <EditEpiInline epi={epi} onSave={(data: any) => updateEpiMut.mutate({ id: epi.id, ...data })} onCancel={() => setEditingEpi(null)} isPending={updateEpiMut.isPending} />
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={epi.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 text-center">
                              <input type="checkbox" checked={selectedEpis.has(epi.id)}
                                onChange={() => toggleSelectEpi(epi.id)} className="rounded" />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <HardHat className="h-4 w-4 text-amber-600 shrink-0" />
                                <div>
                                  <span className="font-medium">{epi.nome}</span>
                                  {epi.fabricante && <span className="text-xs text-muted-foreground ml-1">({epi.fabricante})</span>}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {epi.ca ? <Badge variant="outline">{epi.ca}</Badge> : "—"}
                            </td>
                            <td className="p-3 text-center">
                              {epi.validadeCa ? (
                                <Badge variant={caVencido ? "destructive" : "outline"} className="text-xs">
                                  {new Date(epi.validadeCa + "T00:00:00").toLocaleDateString("pt-BR")}
                                </Badge>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant={estoqueBaixo ? "destructive" : "secondary"} className="text-xs">
                                {epi.quantidadeEstoque ?? 0}
                              </Badge>
                            </td>
                            <td className="p-3 text-center text-xs">
                              {epi.valorProduto ? `R$ ${parseFloat(String(epi.valorProduto)).toFixed(2)}` : "—"}
                            </td>
                            <td className="p-3 text-center text-xs">
                              {epi.tempoMinimoTroca ? `${epi.tempoMinimoTroca} dias` : "—"}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar"
                                  onClick={() => setEditingEpi(epi)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" title="Excluir"
                                  onClick={() => { if (confirm("Excluir este EPI?")) deleteEpiMut.mutate({ id: epi.id }); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                  {filteredEpis.length} EPI{filteredEpis.length !== 1 ? "s" : ""} encontrado{filteredEpis.length !== 1 ? "s" : ""}
                </div>

                {/* Batch Delete Dialog */}
                {showBatchDeleteDialog && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBatchDeleteDialog(false)}>
                    <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-bold text-red-700 mb-2">Confirmar Exclusão em Lote</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Tem certeza que deseja excluir <strong>{selectedEpis.size}</strong> EPI(s)?
                      </p>
                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowBatchDeleteDialog(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={() => deleteBatchMut.mutate({ ids: Array.from(selectedEpis) })} disabled={deleteBatchMut.isPending}>
                          {deleteBatchMut.isPending ? "Excluindo..." : `Excluir ${selectedEpis.size} EPI(s)`}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        )}

        {/* ============================================================ */}
        {/* ENTREGAS */}
        {/* ============================================================ */}
        {viewMode === "entregas" && (
          filteredDeliveries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg">Nenhuma entrega registrada</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Registre as entregas de EPIs aos funcionários.
                </p>
                <Button onClick={() => setViewMode("nova_entrega")} className="mt-4 bg-[#1B2A4A] hover:bg-[#243660]">
                  <Plus className="h-4 w-4 mr-2" /> Nova Entrega
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left font-medium">Data</th>
                        <th className="p-3 text-left font-medium">Funcionário</th>
                        <th className="p-3 text-left font-medium">EPI</th>
                        <th className="p-3 text-center font-medium">Qtd</th>
                        <th className="p-3 text-left font-medium">Motivo Troca</th>
                        <th className="p-3 text-center font-medium">Cobrança</th>
                        <th className="p-3 text-center font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeliveries.map((d: any) => {
                        const motivoLabel: Record<string, string> = {
                          perda: "Perda",
                          mau_uso: "Mau Uso",
                          desgaste_normal: "Desgaste",
                          furto: "Furto",
                        };
                        return (
                          <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 text-xs">
                              {d.dataEntrega ? new Date(d.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-blue-600" />
                                <div>
                                  <span className="font-medium text-xs">{d.nomeFunc || "—"}</span>
                                  {d.funcaoFunc && <span className="text-[10px] text-muted-foreground ml-1">({d.funcaoFunc})</span>}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <HardHat className="h-3.5 w-3.5 text-amber-600" />
                                <span className="text-xs">{d.nomeEpi || "—"}</span>
                                {d.caEpi && <Badge variant="outline" className="text-[10px]">CA: {d.caEpi}</Badge>}
                              </div>
                            </td>
                            <td className="p-3 text-center font-bold">{d.quantidade}</td>
                            <td className="p-3 text-xs">
                              {d.motivoTroca ? (
                                <Badge variant={['perda', 'mau_uso', 'furto'].includes(d.motivoTroca) ? "destructive" : "secondary"} className="text-[10px]">
                                  {motivoLabel[d.motivoTroca] || d.motivoTroca}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">Entrega regular</span>
                              )}
                            </td>
                            <td className="p-3 text-center text-xs">
                              {d.valorCobrado ? (
                                <span className="text-red-600 font-semibold">R$ {parseFloat(String(d.valorCobrado)).toFixed(2)}</span>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Ficha de Entrega"
                                  onClick={() => { setFichaDelivery(d); setViewMode("ficha_epi"); }}>
                                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                                </Button>
                                {d.fichaUrl && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver ficha assinada"
                                    onClick={() => window.open(d.fichaUrl, "_blank")}>
                                    <Eye className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remover entrega" onClick={() => {
                                  if (confirm("Remover esta entrega? O estoque será devolvido.")) {
                                    deleteDeliveryMut.mutate({ id: d.id, epiId: d.epiId, quantidade: d.quantidade });
                                  }
                                }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t bg-muted/30 p-3 text-sm text-muted-foreground">
                  {filteredDeliveries.length} entrega{filteredDeliveries.length !== 1 ? "s" : ""} encontrada{filteredDeliveries.length !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </DashboardLayout>
  );
}

// ============================================================
// Inline Edit Component
// ============================================================
function EditEpiInline({ epi, onSave, onCancel, isPending }: { epi: any; onSave: (data: any) => void; onCancel: () => void; isPending: boolean }) {
  const [form, setForm] = useState({
    nome: epi.nome || "",
    ca: epi.ca || "",
    validadeCa: epi.validadeCa || "",
    fabricante: epi.fabricante || "",
    fornecedor: epi.fornecedor || "",
    quantidadeEstoque: epi.quantidadeEstoque ?? 0,
    valorProduto: epi.valorProduto ? parseFloat(String(epi.valorProduto)) : null,
    tempoMinimoTroca: epi.tempoMinimoTroca ?? null,
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="h-8 text-xs" placeholder="Nome" />
        <Input value={form.ca} onChange={e => setForm(f => ({ ...f, ca: e.target.value }))} className="h-8 text-xs" placeholder="CA" />
        <Input type="number" value={form.quantidadeEstoque} onChange={e => setForm(f => ({ ...f, quantidadeEstoque: parseInt(e.target.value) || 0 }))} className="h-8 text-xs" placeholder="Estoque" />
        <Input type="number" step="0.01" value={form.valorProduto ?? ""} onChange={e => setForm(f => ({ ...f, valorProduto: e.target.value ? parseFloat(e.target.value) : null }))} className="h-8 text-xs" placeholder="Valor R$" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Input value={form.fabricante} onChange={e => setForm(f => ({ ...f, fabricante: e.target.value }))} className="h-8 text-xs" placeholder="Fabricante" />
        <Input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className="h-8 text-xs" placeholder="Fornecedor" />
        <Input type="number" value={form.tempoMinimoTroca ?? ""} onChange={e => setForm(f => ({ ...f, tempoMinimoTroca: e.target.value ? parseInt(e.target.value) : null }))} className="h-8 text-xs" placeholder="Vida útil (dias)" />
        <div className="flex gap-1">
          <Button size="sm" className="h-8 text-xs flex-1" onClick={() => onSave(form)} disabled={isPending}>
            {isPending ? "..." : "Salvar"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>✕</Button>
        </div>
      </div>
    </div>
  );
}
