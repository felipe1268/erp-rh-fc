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
  DollarSign, Clock, Settings2, Printer, Upload, Eye, FileText,
  Glasses, Hand, Footprints, Ear, Shirt, Wind, Shield, Flame, Droplets, Wrench, Zap, HeartPulse, Umbrella
} from "lucide-react";
import FullScreenDialog from "@/components/FullScreenDialog";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";

type ViewMode = "catalogo" | "entregas" | "novo_epi" | "nova_entrega" | "ficha_epi";

// Mapeamento de ícones dinâmicos por tipo de EPI
function getEpiIcon(nome: string, className: string = "h-4 w-4") {
  const n = (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("capacete") || n.includes("helmet")) return <HardHat className={`${className} text-amber-600`} />;
  if (n.includes("luva")) return <Hand className={`${className} text-blue-600`} />;
  if (n.includes("oculos") || n.includes("viseira") || n.includes("protetor facial") || n.includes("face")) return <Glasses className={`${className} text-sky-600`} />;
  if (n.includes("bota") || n.includes("botina") || n.includes("calcado") || n.includes("sapato")) return <Footprints className={`${className} text-amber-800`} />;
  if (n.includes("auricular") || n.includes("abafador") || n.includes("ouvido") || n.includes("plug")) return <Ear className={`${className} text-purple-600`} />;
  if (n.includes("uniforme") || n.includes("camisa") || n.includes("calca") || n.includes("jaleco") || n.includes("avental") || n.includes("vestimenta") || n.includes("manga")) return <Shirt className={`${className} text-indigo-600`} />;
  if (n.includes("respirador") || n.includes("mascara") || n.includes("respiratoria") || n.includes("pff")) return <Wind className={`${className} text-teal-600`} />;
  if (n.includes("cinto") || n.includes("arnês") || n.includes("arnes") || n.includes("trava-queda") || n.includes("talabarte")) return <Shield className={`${className} text-red-600`} />;
  if (n.includes("soldador") || n.includes("solda") || n.includes("touca")) return <Flame className={`${className} text-orange-600`} />;
  if (n.includes("creme") || n.includes("protetor solar") || n.includes("filtro")) return <Droplets className={`${className} text-cyan-600`} />;
  if (n.includes("ferramenta") || n.includes("chave")) return <Wrench className={`${className} text-gray-600`} />;
  if (n.includes("eletric") || n.includes("isolante")) return <Zap className={`${className} text-yellow-600`} />;
  if (n.includes("primeiros") || n.includes("socorro") || n.includes("kit")) return <HeartPulse className={`${className} text-red-500`} />;
  if (n.includes("chuva") || n.includes("impermeavel")) return <Umbrella className={`${className} text-blue-500`} />;
  return <ShieldCheck className={`${className} text-emerald-600`} />;
}

export default function Epis() {
  const { selectedCompanyId, selectedCompany } = useCompany();
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
    categoria: "EPI" as "EPI" | "Uniforme" | "Calcado",
    tamanho: "",
    quantidadeEstoque: 0, valorProduto: "", tempoMinimoTroca: "",
  });

  // Form state - Entrega
  const [entregaForm, setEntregaForm] = useState({
    epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0],
    motivo: "", observacoes: "", motivoTroca: "",
  });

  // BDI config
  const [bdiValue, setBdiValue] = useState("");

  // CA lookup state
  const [caLookupLoading, setCaLookupLoading] = useState(false);
  const [caLookupResult, setCaLookupResult] = useState<any>(null);

  // Foto do estado do EPI (para troca)
  const [fotoEstado, setFotoEstado] = useState<{ file: File | null; preview: string }>({ file: null, preview: "" });
  const fotoInputRef = useRef<HTMLInputElement>(null);

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
      // Abrir ficha de entrega automaticamente após registro
      const epi = episList.find((e: any) => String(e.id) === entregaForm.epiId);
      const emp = employeesList.find((e: any) => String(e.id) === entregaForm.employeeId);
      setFichaDelivery({
        id: result.id,
        epiId: parseInt(entregaForm.epiId),
        employeeId: parseInt(entregaForm.employeeId),
        quantidade: entregaForm.quantidade,
        dataEntrega: entregaForm.dataEntrega,
        motivo: entregaForm.motivo,
        motivoTroca: entregaForm.motivoTroca,
        valorCobrado: result.valorCobrado,
        nomeEpi: epi?.nome || "",
        caEpi: epi?.ca || "",
        nomeFunc: emp?.nomeCompleto || "",
        funcaoFunc: emp?.funcao || "",
      });
      setViewMode("ficha_epi");
      resetEntregaForm();
      setFotoEstado({ file: null, preview: "" });
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
    setEpiForm({ nome: "", ca: "", validadeCa: "", fabricante: "", fornecedor: "", categoria: "EPI", tamanho: "", quantidadeEstoque: 0, valorProduto: "", tempoMinimoTroca: "" });
  }

  const TAMANHOS_ROUPA = ['PP', 'P', 'M', 'G', 'GG', 'XGG', 'XXGG', 'XXXGG'];
  const TAMANHOS_CALCADO = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47', '48'];
  function resetEntregaForm() {
    setEntregaForm({ epiId: "", employeeId: "", quantidade: 1, dataEntrega: new Date().toISOString().split("T")[0], motivo: "", observacoes: "", motivoTroca: "" });
    setFotoEstado({ file: null, preview: "" });
  }

  // CA lookup function
  const caLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeCaLookup = useCallback(async (caValue: string) => {
    const caClean = caValue.replace(/\D/g, "");
    if (!caClean || caClean.length < 3) return;
    setCaLookupLoading(true);
    setCaLookupResult(null);
    try {
      const res = await (trpc as any).epis.consultaCa.query({ ca: caClean });
      if (res.found) {
        setCaLookupResult(res);
        setEpiForm(f => ({
          ...f,
          nome: res.descricao || res.nome || f.nome,
          fabricante: res.fabricante || f.fabricante,
          validadeCa: res.validade || f.validadeCa,
        }));
        toast.success(`CA ${res.ca} encontrado!`);
      } else {
        setCaLookupResult({ found: false, error: res.error });
      }
    } catch (err: any) {
      setCaLookupResult({ found: false, error: "Erro na consulta" });
    } finally {
      setCaLookupLoading(false);
    }
  }, []);

  // Auto-search: debounce 800ms after typing
  useEffect(() => {
    const caClean = epiForm.ca.replace(/\D/g, "");
    if (caClean.length < 3) {
      setCaLookupResult(null);
      return;
    }
    if (caLookupTimerRef.current) clearTimeout(caLookupTimerRef.current);
    caLookupTimerRef.current = setTimeout(() => {
      executeCaLookup(epiForm.ca);
    }, 800);
    return () => {
      if (caLookupTimerRef.current) clearTimeout(caLookupTimerRef.current);
    };
  }, [epiForm.ca, executeCaLookup]);

  async function handleCaLookup() {
    if (!epiForm.ca.trim()) return toast.error("Digite o número do CA");
    executeCaLookup(epiForm.ca);
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

  // BDI config agora fica em Configurações > Critérios do Sistema > EPIs / Segurança

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
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input value={epiForm.ca} onChange={e => setEpiForm(f => ({ ...f, ca: e.target.value }))}
                        placeholder="Digite o CA (ex: 15532)" onKeyDown={e => { if (e.key === 'Enter') handleCaLookup(); }} />
                      {caLookupLoading && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <span className="animate-spin text-sm">⏳</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {caLookupResult?.found && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700">
                      <p className="font-semibold">✓ CA {caLookupResult.ca} encontrado</p>
                      {caLookupResult.descricao && <p>{caLookupResult.descricao.substring(0, 100)}</p>}
                      {caLookupResult.situacao && <p>Situação: <strong className={caLookupResult.situacao === 'VÁLIDO' ? 'text-green-700' : 'text-red-600'}>{caLookupResult.situacao}</strong></p>}
                      {caLookupResult.fabricante && <p>Fabricante: {caLookupResult.fabricante}</p>}
                      {caLookupResult.validade && <p>Validade: {caLookupResult.validade}</p>}
                      {caLookupResult.referencia && <p>Referência: {caLookupResult.referencia}</p>}
                    </div>
                  )}
                  {caLookupResult && !caLookupResult.found && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                      <p>⚠ {caLookupResult.error || 'CA não encontrado'}</p>
                    </div>
                  )}
                  {epiForm.ca && epiForm.ca.replace(/\D/g, '').length >= 3 && !caLookupResult && !caLookupLoading && (
                    <p className="mt-1 text-xs text-muted-foreground">Buscando automaticamente...</p>
                  )}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1">
                    <Package className="h-3 w-3 text-indigo-600" />
                    Categoria
                  </Label>
                  <Select value={epiForm.categoria} onValueChange={(v: any) => setEpiForm(f => ({ ...f, categoria: v, tamanho: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EPI">EPI (Equipamento de Proteção)</SelectItem>
                      <SelectItem value="Uniforme">Uniforme (Roupa)</SelectItem>
                      <SelectItem value="Calcado">Calçado (Bota/Sapato)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {epiForm.categoria !== 'EPI' && (
                  <div>
                    <Label className="flex items-center gap-1">
                      {epiForm.categoria === 'Uniforme' ? (
                        <><Shirt className="h-3 w-3 text-indigo-600" /> Tamanho</>
                      ) : (
                        <><Footprints className="h-3 w-3 text-amber-800" /> Número do Calçado</>
                      )}
                    </Label>
                    <Select value={epiForm.tamanho || undefined} onValueChange={v => setEpiForm(f => ({ ...f, tamanho: v }))}>
                      <SelectTrigger><SelectValue placeholder={epiForm.categoria === 'Uniforme' ? 'Selecione o tamanho...' : 'Selecione o número...'} /></SelectTrigger>
                      <SelectContent>
                        {(epiForm.categoria === 'Uniforme' ? TAMANHOS_ROUPA : TAMANHOS_CALCADO).map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
                    categoria: epiForm.categoria,
                    tamanho: epiForm.tamanho || undefined,
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
                    Valor de cobrança: <strong>R$ {chargeValue}</strong>
                  </p>
                  <p className="text-xs text-red-500 mt-1">
                    Base legal: Art. 462, §1º da CLT — desconto por dano causado pelo empregado
                  </p>
                </div>
              )}

              {/* Foto obrigatória para troca por desgaste/perda/mau uso */}
              {entregaForm.motivoTroca && ['desgaste_normal', 'perda', 'mau_uso', 'furto'].includes(entregaForm.motivoTroca) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <Label className="flex items-center gap-2 text-amber-800 font-semibold mb-2">
                    📷 Foto do Estado do EPI (Obrigatória)
                  </Label>
                  <p className="text-xs text-amber-600 mb-3">Para registrar troca por {entregaForm.motivoTroca === 'desgaste_normal' ? 'desgaste' : entregaForm.motivoTroca === 'mau_uso' ? 'mau uso/dano' : entregaForm.motivoTroca === 'perda' ? 'perda' : 'furto'}, é obrigatório anexar uma foto do estado atual do EPI.</p>
                  <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const preview = URL.createObjectURL(file);
                      setFotoEstado({ file, preview });
                    }
                  }} />
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => fotoInputRef.current?.click()}>
                      <Upload className="h-4 w-4 mr-1" /> {fotoEstado.file ? 'Trocar Foto' : 'Anexar Foto'}
                    </Button>
                    {fotoEstado.preview && (
                      <div className="relative">
                        <img src={fotoEstado.preview} alt="Foto EPI" className="h-20 w-20 object-cover rounded border" />
                        <button onClick={() => setFotoEstado({ file: null, preview: '' })} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">✕</button>
                      </div>
                    )}
                    {!fotoEstado.file && <span className="text-xs text-red-500">* Foto obrigatória</span>}
                  </div>
                </div>
              )}

              <div>
                <Label>Motivo / Observações</Label>
                <Input value={entregaForm.motivo} onChange={e => setEntregaForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Motivo da entrega ou observações" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => { setViewMode("entregas"); resetEntregaForm(); }}>Cancelar</Button>
                <Button onClick={async () => {
                  if (!entregaForm.epiId || !entregaForm.employeeId) return toast.error("Selecione EPI e funcionário");
                  // Validar foto obrigatória para troca
                  const requiresFoto = entregaForm.motivoTroca && ['desgaste_normal', 'perda', 'mau_uso', 'furto'].includes(entregaForm.motivoTroca);
                  if (requiresFoto && !fotoEstado.file) return toast.error("Foto do estado do EPI é obrigatória para este tipo de troca");
                  
                  let fotoBase64: string | undefined;
                  let fotoFileName: string | undefined;
                  if (fotoEstado.file) {
                    const buffer = await fotoEstado.file.arrayBuffer();
                    const bytes = new Uint8Array(buffer);
                    let binary = '';
                    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
                    fotoBase64 = btoa(binary);
                    fotoFileName = fotoEstado.file.name;
                  }
                  createDeliveryMut.mutate({
                    companyId,
                    epiId: parseInt(entregaForm.epiId),
                    employeeId: parseInt(entregaForm.employeeId),
                    quantidade: entregaForm.quantidade,
                    dataEntrega: entregaForm.dataEntrega,
                    motivo: entregaForm.motivo || undefined,
                    observacoes: entregaForm.observacoes || undefined,
                    motivoTroca: entregaForm.motivoTroca || undefined,
                    fotoEstadoBase64: fotoBase64,
                    fotoEstadoFileName: fotoFileName,
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
              <Button variant="outline" size="sm" onClick={() => {
                const nomeFunc = fichaDelivery.nomeFunc || emp?.nomeCompleto || 'Funcionario';
                const oldTitle = document.title;
                document.title = `EPI - ${nomeFunc}`;
                window.print();
                setTimeout(() => { document.title = oldTitle; }, 500);
              }}>
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
            {/* Header - Logo centralizado no topo */}
            <div className="mb-6">
              {/* Logo + Nome da empresa centralizado */}
              <div className="flex flex-col items-center justify-center mb-4">
                {selectedCompany?.logoUrl ? (
                  <img src={selectedCompany.logoUrl} alt={selectedCompany?.razaoSocial || 'Empresa'} className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                ) : (
                  <img src="/fc-logo.png" alt="FC Engenharia" className="h-16 mb-2 object-contain" onError={(e: any) => e.target.style.display = 'none'} />
                )}
                <h2 className="text-lg font-bold text-[#1B2A4A] tracking-wide text-center">
                  {selectedCompany?.razaoSocial || 'FC ENGENHARIA PROJETOS E CONSULTORIA LTDA'}
                </h2>
                {selectedCompany?.cnpj && (
                  <p className="text-[10px] text-gray-500">CNPJ: {selectedCompany.cnpj}</p>
                )}
              </div>
              {/* Barra azul com título do documento */}
              <div className="bg-[#1B2A4A] text-white py-2 px-4 text-center">
                <span className="text-sm font-bold tracking-wider">FICHA DE ENTREGA DE EPI</span>
              </div>
              {/* Data de entrega e emissão */}
              <div className="flex justify-between mt-2 text-[10px] text-gray-500 px-1">
                <span>Data da Entrega: {fichaDelivery.dataEntrega ? new Date(fichaDelivery.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</span>
                <div className="text-right">
                  <span>Emitido em: {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                  <br/>
                  <span>Emitido por: {user?.name || user?.email || "—"}</span>
                </div>
              </div>
            </div>

            {/* Employee Info - Box com borda */}
            <div className="border border-gray-300 rounded p-3 mb-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500 text-xs">Funcionário:</span><br/><strong className="text-[#1B2A4A]">{fichaDelivery.nomeFunc || emp?.nomeCompleto || "—"}</strong></div>
                <div><span className="text-gray-500 text-xs">Função:</span><br/><strong className="text-[#1B2A4A]">{fichaDelivery.funcaoFunc || emp?.funcao || "—"}</strong></div>
                <div><span className="text-gray-500 text-xs">CPF:</span><br/><strong>{emp?.cpf || "—"}</strong></div>
                <div><span className="text-gray-500 text-xs">Matrícula:</span><br/><strong>{emp?.codigoInterno || "—"}</strong></div>
              </div>
            </div>

            {/* EPI Table */}
            <table className="w-full text-sm border mb-6">
              <thead>
                <tr className="bg-[#1B2A4A] text-white">
                  <th className="p-2 text-left">EPI</th>
                  <th className="p-2 text-center">CA</th>
                  <th className="p-2 text-center">Qtd</th>
                  <th className="p-2 text-center">Vida Útil</th>
                  <th className="p-2 text-center">Valor Unit.</th>
                  <th className="p-2 text-center">Motivo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-2">{fichaDelivery.nomeEpi || epi?.nome || "—"}</td>
                  <td className="p-2 text-center">{fichaDelivery.caEpi || epi?.ca || "—"}</td>
                  <td className="p-2 text-center">{fichaDelivery.quantidade}</td>
                  <td className="p-2 text-center">
                    {epi?.tempoMinimoTroca ? `${epi.tempoMinimoTroca} dias` : "—"}
                  </td>
                  <td className="p-2 text-center">
                    {epi?.valorProduto ? (() => {
                      const bdiPct = bdiQ.data?.bdiPercentual ?? 40;
                      const valorComBdi = parseFloat(String(epi.valorProduto)) * (1 + bdiPct / 100);
                      return `R$ ${valorComBdi.toFixed(2)}`;
                    })() : "—"}
                  </td>
                  <td className="p-2 text-center">{fichaDelivery.motivo || "Entrega regular"}</td>
                </tr>
              </tbody>
            </table>

            {/* Policy Box - Vida Útil e Desconto */}
            <div className="border-2 border-[#1B2A4A] rounded p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-[#1B2A4A] text-white px-2 py-0.5 rounded text-[10px] font-bold">⚠️ IMPORTANTE</div>
                <p className="font-bold text-[#1B2A4A] text-xs">POLÍTICA DE CONSERVAÇÃO, TROCA E COBRANÇA DE EPI</p>
              </div>
              <div className="text-xs text-gray-700 leading-relaxed space-y-2">
                <p>
                  {epi?.tempoMinimoTroca ? (
                    <>O EPI acima possui <strong>vida útil mínima de {epi.tempoMinimoTroca} dias</strong> a partir da data de entrega. </>
                  ) : null}
                  A troca dentro do prazo de vida útil por <strong>desgaste natural de uso</strong> será realizada <strong>sem custo</strong> ao colaborador,
                  mediante apresentação do EPI danificado e registro fotográfico obrigatório.
                </p>
                <p className="bg-red-50 border border-red-200 rounded p-2 text-red-800">
                  <strong>💰 COBRANÇA:</strong> Em caso de <strong>perda, extravio, furto, dano por mau uso ou negligência</strong>,
                  o valor indicado na coluna "Valor Unit." será <strong>descontado
                  integralmente na folha de pagamento do mesmo mês</strong> em que ocorrer a solicitação de troca,
                  conforme Art. 462, §1º da CLT e acordo firmado neste documento.
                </p>
                <p className="bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                  <strong>📷 FOTO OBRIGATÓRIA:</strong> Para qualquer solicitação de troca (desgaste, perda, mau uso ou furto),
                  é <strong>obrigatório</strong> o registro fotográfico do estado atual do EPI antigo como comprovação.
                  Sem a foto, a troca não será autorizada.
                </p>
              </div>
            </div>

            {/* Declaration Text */}
            <div className="text-sm text-justify mb-4 leading-relaxed">
              <p>{textoFicha || `Declaro ter recebido os Equipamentos de Proteção Individual (EPIs) acima descritos, comprometendo-me a utilizá-los corretamente durante a jornada de trabalho, conforme orientações recebidas. Estou ciente de que a não utilização, o uso inadequado ou a perda/dano por negligência poderá acarretar desconto em meu salário dentro do mesmo mês da ocorrência, conforme Art. 462, §1º da CLT e NR-6 do MTE. Declaro também estar ciente da obrigatoriedade de apresentação de registro fotográfico do EPI antigo para qualquer solicitação de troca.`}</p>
            </div>

            {/* Employee Obligations */}
            <div className="text-[10px] text-gray-600 mb-6 leading-relaxed border rounded p-2 bg-gray-50">
              <p className="font-semibold mb-1">Obrigações do Empregado (NR-6, item 6.7.1 do MTE):</p>
              <p>a) Usar o EPI apenas para a finalidade a que se destina;</p>
              <p>b) Responsabilizar-se pela guarda e conservação;</p>
              <p>c) Comunicar ao empregador qualquer alteração que o torne impróprio para uso;</p>
              <p>d) Cumprir as determinações do empregador sobre o uso adequado.</p>
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
            <div className="mt-6 pt-4 border-t-2 border-[#1B2A4A] text-[10px] text-gray-400 text-center">
              <p>Conforme Art. 462, §1º da CLT e NR-6 (item 6.7.1) do MTE — Equipamentos de Proteção Individual</p>
              <p className="mt-1 text-[#1B2A4A] font-medium">{selectedCompany?.razaoSocial || 'FC Engenharia Projetos e Consultoria Ltda'}</p>
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
                        <th className="p-3 text-center font-medium">Categoria</th>
                        <th className="p-3 text-center font-medium">Tam.</th>
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
                              <td colSpan={10} className="p-3">
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
                                {getEpiIcon(epi.nome, "h-4 w-4 shrink-0")}
                                <div>
                                  <span className="font-medium">{epi.nome}</span>
                                  {epi.fabricante && <span className="text-xs text-muted-foreground ml-1">({epi.fabricante})</span>}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className={`text-xs ${epi.categoria === 'Uniforme' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : epi.categoria === 'Calcado' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {epi.categoria === 'Calcado' ? 'Calçado' : epi.categoria || 'EPI'}
                              </Badge>
                            </td>
                            <td className="p-3 text-center text-xs font-medium">
                              {epi.tamanho || '—'}
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
                                {getEpiIcon(d.nomeEpi || "", "h-3.5 w-3.5")}
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
