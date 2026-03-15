import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Plus, Search, Trash2, FileText, ChevronRight, Loader2, CheckCircle, X, Building2, Trophy, UserPlus, Save, BarChart3 } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pendente:  { label: "Pendente",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovada:  { label: "Aprovada",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  recusada:  { label: "Recusada",  cls: "bg-red-50 text-red-700 border-red-200" },
  expirada:  { label: "Expirada",  cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const COND_PAG = ["À Vista", "7 dias", "14 dias", "21 dias", "28 dias", "30 dias", "45 dias", "60 dias", "90 dias", "Parcelado"];
const UNIDADES = ["un", "m", "m²", "m³", "kg", "L", "cx", "pç", "sc", "gl", "vb"];

interface ItemForm { descricao: string; unidade: string; quantidade: string; precoUnitario: string; descontoPct: string; solicitacaoItemId?: number | null; }
const newItem = (): ItemForm => ({ descricao: "", unidade: "un", quantidade: "1", precoUnitario: "", descontoPct: "0" });
const calcTotal = (it: ItemForm) => {
  const tot = (parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0);
  const desc = (parseFloat(it.descontoPct) || 0) / 100;
  return tot * (1 - desc);
};

export default function Cotacoes() {
  const { selectedCompanyId } = useCompany();
  const companyId = parseInt(selectedCompanyId || "0");
  const [, navigate] = useLocation();

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNova, setShowNova] = useState(false);
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<"detalhes" | "mapa">("detalhes");

  const [form, setForm] = useState({
    descricao: "", obraId: "", solicitacaoId: "", fornecedorId: "",
    dataValidade: "", condicaoPagamento: "", prazoEntregaDias: "", observacoes: "",
  });
  const [itens, setItens] = useState<ItemForm[]>([newItem()]);

  const [mapaFornSelectId, setMapaFornSelectId] = useState("");
  const [editPrecos, setEditPrecos] = useState<Record<string, string>>({});
  const [editPrazo, setEditPrazo] = useState<Record<number, string>>({});
  const [editCondPag, setEditCondPag] = useState<Record<number, string>>({});
  const [editingFornId, setEditingFornId] = useState<number | null>(null);

  const q = trpc.compras.listarCotacoes.useQuery(
    { companyId, status: filtroStatus === "todos" ? undefined : filtroStatus },
    { enabled: companyId > 0 }
  );
  const detalheQ = trpc.compras.getCotacao.useQuery({ id: showDetalhe! }, { enabled: showDetalhe !== null });
  const mapaQ = trpc.compras.getMapaCotacao.useQuery({ cotacaoId: showDetalhe! }, { enabled: showDetalhe !== null && abaAtiva === "mapa" });
  const scsQ = trpc.compras.listarSolicitacoes.useQuery({ companyId }, { enabled: companyId > 0 });
  const fornQ = trpc.compras.listarFornecedores.useQuery({ companyId, ativo: true }, { enabled: companyId > 0 });
  const obrasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: companyId > 0 });

  const criar = trpc.compras.criarCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação criada!"); setShowNova(false); resetForm(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const gerarOC = trpc.compras.criarOrdemDeCotacao.useMutation({
    onSuccess: () => { toast.success("Ordem de Compra gerada!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarStatus = trpc.compras.atualizarStatusCotacao.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); q.refetch(); detalheQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const excluir = trpc.compras.excluirCotacao.useMutation({
    onSuccess: () => { toast.success("Cotação excluída!"); q.refetch(); setShowDetalhe(null); },
    onError: (e) => toast.error(e.message),
  });
  const gerarContrato = trpc.terceiroContratos.gerarContratoFromCotacao.useMutation({
    onSuccess: (data) => {
      toast.success(`Contrato ${data.numeroContrato} criado!${data.isNova ? " Empresa terceira cadastrada automaticamente." : ""}`);
      setShowDetalhe(null);
      navigate(`/terceiros/contratos/${data.contratoId}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const adicionarForn = trpc.compras.adicionarFornecedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor adicionado!"); setMapaFornSelectId(""); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const removerForn = trpc.compras.removerFornecedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor removido!"); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const salvarRespostas = trpc.compras.salvarRespostasLote.useMutation({
    onSuccess: (data) => { toast.success(`Preços salvos! Total: ${data.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`); setEditingFornId(null); mapaQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const selecionarVencedor = trpc.compras.selecionarVencedorMapa.useMutation({
    onSuccess: () => { toast.success("Fornecedor vencedor selecionado!"); mapaQ.refetch(); detalheQ.refetch(); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (abaAtiva === "mapa" && mapaQ.data) {
      const inicial: Record<string, string> = {};
      const prazoInicial: Record<number, string> = {};
      const condInicial: Record<number, string> = {};
      for (const [key, val] of Object.entries(mapaQ.data.respostaMap)) {
        inicial[key] = (val as any).precoUnitario ?? "0";
      }
      for (const p of mapaQ.data.participantes) {
        prazoInicial[p.fornecedorId] = p.prazoEntregaDias ? String(p.prazoEntregaDias) : "";
        condInicial[p.fornecedorId] = p.condicaoPagamento ?? "";
      }
      setEditPrecos(inicial);
      setEditPrazo(prazoInicial);
      setEditCondPag(condInicial);
    }
  }, [mapaQ.data, abaAtiva]);

  function resetForm() {
    setForm({ descricao: "", obraId: "", solicitacaoId: "", fornecedorId: "", dataValidade: "", condicaoPagamento: "", prazoEntregaDias: "", observacoes: "" });
    setItens([newItem()]);
  }

  function handleScChange(scId: string) {
    setForm(p => ({ ...p, solicitacaoId: scId }));
    if (!scId || scId === "none") return;
    const sc = scsQ.data?.find(s => s.id === parseInt(scId)) as any;
    if (sc?.obraId && !form.obraId) {
      setForm(p => ({ ...p, solicitacaoId: scId, obraId: String(sc.obraId) }));
    }
  }

  function handleSalvar() {
    if (!form.obraId || form.obraId === "none") return toast.error("Selecione a Obra (centro de custo) para esta cotação.");
    const validos = itens.filter(i => i.descricao.trim() && parseFloat(i.precoUnitario) > 0);
    if (validos.length === 0) return toast.error("Adicione pelo menos um item com preço.");
    criar.mutate({
      companyId,
      descricao: form.descricao || undefined,
      obraId: parseInt(form.obraId),
      solicitacaoId: form.solicitacaoId && form.solicitacaoId !== "none" ? parseInt(form.solicitacaoId) : undefined,
      fornecedorId: form.fornecedorId && form.fornecedorId !== "none" ? parseInt(form.fornecedorId) : undefined,
      dataValidade: form.dataValidade || undefined,
      condicaoPagamento: form.condicaoPagamento || undefined,
      prazoEntregaDias: form.prazoEntregaDias ? parseInt(form.prazoEntregaDias) : undefined,
      observacoes: form.observacoes || undefined,
      itens: validos.map(i => ({
        solicitacaoItemId: i.solicitacaoItemId ?? undefined,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: parseFloat(i.quantidade) || 1,
        precoUnitario: parseFloat(i.precoUnitario) || 0,
        descontoPct: parseFloat(i.descontoPct) || 0,
      })),
    });
  }

  function addItem() { setItens(p => [...p, newItem()]); }
  function removeItem(idx: number) { setItens(p => p.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof ItemForm, val: string) {
    setItens(p => p.map((it, i) => i === idx ? { ...it, [field]: val } : it));
  }

  const lista = q.data ?? [];
  const filt = lista.filter(c => !busca || c.numeroCotacao?.toLowerCase().includes(busca.toLowerCase()));
  const fornecedores = fornQ.data ?? [];
  const obras = obrasQ.data ?? [];
  const detalhe = detalheQ.data;
  const totalItens = itens.reduce((s, it) => s + calcTotal(it), 0);

  function nomeObra(id: number | null | undefined) {
    if (!id) return null;
    return obras.find((o: any) => o.id === id)?.nome ?? null;
  }

  /* ── Tela cheia de detalhe ── */
  if (showDetalhe !== null) {
    const detalheFullscreen = detalheQ.data;
    const forn = detalheFullscreen ? fornecedores.find(f => f.id === detalheFullscreen.fornecedorId) : null;
    const st = detalheFullscreen ? (STATUS_LABELS[detalheFullscreen.status] ?? STATUS_LABELS.pendente) : null;
    const mapa = mapaQ.data;

    const fornIdsNoMapa = new Set((mapa?.participantes ?? []).map((p: any) => p.fornecedorId));
    const fornDisponiveis = fornecedores.filter(f => !fornIdsNoMapa.has(f.id));

    function getMelhorPrecoItem(itemId: number): number | null {
      if (!mapa || mapa.participantes.length === 0) return null;
      const precos = mapa.participantes.map((p: any) => {
        const r = mapa.respostaMap[`${itemId}_${p.fornecedorId}`];
        return r ? parseFloat((r as any).precoUnitario ?? "0") : null;
      }).filter((v): v is number => v !== null && v > 0);
      return precos.length > 0 ? Math.min(...precos) : null;
    }

    function getMelhorFornecedor(): any | null {
      if (!mapa || mapa.participantes.length === 0) return null;
      const comTotal = mapa.participantes.filter((p: any) => parseFloat(p.totalOrcado ?? "0") > 0);
      if (comTotal.length === 0) return null;
      return comTotal.reduce((best: any, curr: any) => {
        const bTotal = parseFloat(best.totalOrcado ?? "0");
        const cTotal = parseFloat(curr.totalOrcado ?? "0");
        if (cTotal < bTotal) return curr;
        if (cTotal === bTotal && (curr.prazoEntregaDias ?? 9999) < (best.prazoEntregaDias ?? 9999)) return curr;
        return best;
      }, comTotal[0]);
    }

    function handleSalvarPrecos(fornecedorId: number) {
      if (!mapa || !showDetalhe) return;
      const respostas = mapa.itens.map((it: any) => ({
        itemId: it.id,
        precoUnitario: parseFloat(editPrecos[`${it.id}_${fornecedorId}`] ?? "0") || 0,
        descontoPct: 0,
      }));
      salvarRespostas.mutate({
        cotacaoId: showDetalhe,
        fornecedorId,
        prazoEntregaDias: editPrazo[fornecedorId] ? parseInt(editPrazo[fornecedorId]) : undefined,
        condicaoPagamento: editCondPag[fornecedorId] || undefined,
        respostas,
      });
    }

    const melhorForn = getMelhorFornecedor();

    return (
      <DashboardLayout>
        <div className="p-6 space-y-5 bg-gray-50 min-h-screen">
          {/* Breadcrumb */}
          <div className="flex items-center gap-3">
            <button onClick={() => { setShowDetalhe(null); setAbaAtiva("detalhes"); }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
              <ChevronRight className="h-4 w-4 rotate-180" /> Cotações
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-gray-900 font-mono">{detalheFullscreen?.numeroCotacao ?? "…"}</span>
          </div>

          {detalheQ.isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : detalheFullscreen ? (
            <>
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 font-mono">{detalheFullscreen.numeroCotacao}</h1>
                  {(detalheFullscreen as any).descricao && <p className="text-gray-500 mt-0.5">{(detalheFullscreen as any).descricao}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {st && <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium border ${st.cls}`}>{st.label}</span>}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
                {([["detalhes", <FileText className="h-4 w-4" />, "Detalhes"], ["mapa", <BarChart3 className="h-4 w-4" />, "Mapa de Cotação"]] as const).map(([key, icon, label]) => (
                  <button key={key} onClick={() => setAbaAtiva(key as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${abaAtiva === key ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                    {icon}{label}
                  </button>
                ))}
              </div>

              {/* ── ABA: DETALHES ── */}
              {abaAtiva === "detalhes" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Obra", value: nomeObra((detalheFullscreen as any).obraId) ?? "—" },
                      { label: "Fornecedor Vencedor", value: forn?.nomeFantasia || forn?.razaoSocial || "—" },
                      { label: "Cond. Pagamento", value: detalheFullscreen.condicaoPagamento || "—" },
                      { label: "Prazo Entrega", value: detalheFullscreen.prazoEntregaDias ? `${detalheFullscreen.prazoEntregaDias} dias` : "—" },
                      { label: "Validade", value: detalheFullscreen.dataValidade ? new Date(detalheFullscreen.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—" },
                      { label: "SC Vinculada", value: detalheFullscreen.solicitacaoId ? `SC #${detalheFullscreen.solicitacaoId}` : "—" },
                    ].map(f => (
                      <div key={f.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{f.label}</p>
                        <p className="text-gray-900 font-medium text-sm">{f.value}</p>
                      </div>
                    ))}
                    <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
                      <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">Total</p>
                      <p className="text-emerald-700 font-bold text-lg">{parseFloat(detalheFullscreen.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Itens</h2>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-100 bg-gray-50 hover:bg-gray-50">
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase">Descrição</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-16">Un.</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-24 text-right">Qtd</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-32 text-right">Preço Unit.</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-20 text-right">Desc%</TableHead>
                          <TableHead className="text-gray-500 text-xs font-semibold uppercase w-32 text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(detalheFullscreen.itens as any[]).map((it: any) => (
                          <TableRow key={it.id} className="border-gray-100 hover:bg-gray-50">
                            <TableCell className="text-gray-900 text-sm py-3">{it.descricao}</TableCell>
                            <TableCell className="text-gray-500 text-sm">{it.unidade || "un"}</TableCell>
                            <TableCell className="text-gray-700 text-sm text-right">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-gray-700 text-sm text-right">{parseFloat(it.precoUnitario || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                            <TableCell className="text-gray-500 text-sm text-right">{parseFloat(it.descontoPct || "0")}%</TableCell>
                            <TableCell className="text-emerald-700 text-sm font-semibold text-right">{parseFloat(it.total || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-200">
                    {detalheFullscreen.status === "pendente" && (
                      <>
                        <Button onClick={() => gerarOC.mutate({ companyId, cotacaoId: detalheFullscreen.id })} disabled={gerarOC.isPending}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
                          {gerarOC.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Aprovar e Gerar OC
                        </Button>
                        <Button variant="outline" onClick={() => atualizarStatus.mutate({ id: detalheFullscreen.id, status: "recusada" })}
                          className="border-red-200 text-red-600 hover:bg-red-50 gap-2">
                          <X className="h-4 w-4" /> Recusar
                        </Button>
                      </>
                    )}
                    {detalheFullscreen.status === "aprovada" && !(detalheFullscreen as any).contratoTerceiroId && (
                      <Button onClick={() => gerarContrato.mutate({ cotacaoId: detalheFullscreen.id, companyId })} disabled={gerarContrato.isPending}
                        className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                        {gerarContrato.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Gerar Contrato de Serviço
                      </Button>
                    )}
                    {detalheFullscreen.status === "aprovada" && (detalheFullscreen as any).contratoTerceiroId && (
                      <Button variant="outline" onClick={() => { setShowDetalhe(null); navigate(`/terceiros/contratos/${(detalheFullscreen as any).contratoTerceiroId}`); }}
                        className="border-blue-200 text-blue-600 hover:bg-blue-50 gap-2">
                        <FileText className="h-4 w-4" /> Ver Contrato de Serviço
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => excluir.mutate({ id: detalheFullscreen.id })} disabled={excluir.isPending}
                      className="border-gray-200 text-gray-500 hover:bg-gray-50 gap-2 ml-auto">
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </div>
                </div>
              )}

              {/* ── ABA: MAPA DE COTAÇÃO ── */}
              {abaAtiva === "mapa" && (
                <div className="space-y-5">
                  {/* Adicionar fornecedor */}
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fornecedores Participantes</p>
                    <div className="flex gap-2 mb-4">
                      <Select value={mapaFornSelectId} onValueChange={setMapaFornSelectId}>
                        <SelectTrigger className="flex-1 bg-white border-gray-300 text-gray-900 text-sm">
                          <SelectValue placeholder="Selecionar fornecedor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {fornDisponiveis.map((f: any) => (
                            <SelectItem key={f.id} value={String(f.id)}>{f.nomeFantasia || f.razaoSocial}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={() => { if (mapaFornSelectId && showDetalhe) adicionarForn.mutate({ cotacaoId: showDetalhe, fornecedorId: parseInt(mapaFornSelectId) }); }}
                        disabled={!mapaFornSelectId || adicionarForn.isPending}
                        className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                        <UserPlus className="h-4 w-4" /> Adicionar
                      </Button>
                    </div>
                    {(mapa?.participantes ?? []).length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-3">Nenhum fornecedor adicionado ao mapa ainda.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {(mapa?.participantes ?? []).map((p: any) => {
                          const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
                          const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                          return (
                            <div key={p.fornecedorId} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${isMelhor ? "bg-emerald-50 border-emerald-300 text-emerald-700" : p.selecionado ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-gray-100 border-gray-300 text-gray-700"}`}>
                              {isMelhor && <Trophy className="h-3 w-3" />}
                              {nome}
                              {parseFloat(p.totalOrcado ?? "0") > 0 && <span className="font-normal text-xs opacity-70">· {parseFloat(p.totalOrcado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>}
                              <button onClick={() => removerForn.mutate({ cotacaoId: showDetalhe!, fornecedorId: p.fornecedorId })} className="ml-1 hover:text-red-500 transition-colors"><X className="h-3 w-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Melhor fornecedor banner */}
                  {melhorForn && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Trophy className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="text-emerald-800 font-semibold text-sm">Melhor proposta: {melhorForn.fornecedor?.nomeFantasia || melhorForn.fornecedor?.razaoSocial}</p>
                          <p className="text-emerald-600 text-xs">Total: {parseFloat(melhorForn.totalOrcado ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{melhorForn.prazoEntregaDias ? ` · Prazo: ${melhorForn.prazoEntregaDias} dias` : ""}</p>
                        </div>
                      </div>
                      <Button onClick={() => selecionarVencedor.mutate({ cotacaoId: showDetalhe!, fornecedorId: melhorForn.fornecedorId })}
                        disabled={selecionarVencedor.isPending || melhorForn.selecionado}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 text-sm">
                        {melhorForn.selecionado ? <><CheckCircle className="h-4 w-4" /> Vencedor Selecionado</> : <><Trophy className="h-4 w-4" /> Selecionar como Vencedor</>}
                      </Button>
                    </div>
                  )}

                  {/* Matriz de preços */}
                  {mapaQ.isLoading ? (
                    <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : (mapa?.participantes ?? []).length === 0 ? null : (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 min-w-64">Item</th>
                            <th className="text-center text-xs font-semibold text-gray-500 uppercase px-3 py-3 w-16">Un.</th>
                            <th className="text-right text-xs font-semibold text-gray-500 uppercase px-3 py-3 w-20">Qtd</th>
                            {(mapa?.participantes ?? []).map((p: any) => {
                              const nome = p.fornecedor?.nomeFantasia || p.fornecedor?.razaoSocial || `#${p.fornecedorId}`;
                              const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                              return (
                                <th key={p.fornecedorId} className={`text-center text-xs font-semibold uppercase px-3 py-3 min-w-36 ${isMelhor ? "text-emerald-600" : "text-gray-500"}`}>
                                  <div className="flex flex-col items-center gap-0.5">
                                    {isMelhor && <Trophy className="h-3 w-3 text-emerald-500" />}
                                    <span>{nome}</span>
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                          {/* Prazo + Cond. pag. por fornecedor */}
                          {(mapa?.participantes ?? []).length > 0 && (
                            <tr className="border-b border-gray-100 bg-blue-50/30">
                              <td colSpan={3} className="px-4 py-2 text-xs text-gray-400 italic">Prazo / Cond. pagamento</td>
                              {(mapa?.participantes ?? []).map((p: any) => (
                                <td key={p.fornecedorId} className="px-2 py-2">
                                  {editingFornId === p.fornecedorId ? (
                                    <div className="flex flex-col gap-1">
                                      <Input type="number" placeholder="Prazo (dias)" value={editPrazo[p.fornecedorId] ?? ""} onChange={e => setEditPrazo(prev => ({ ...prev, [p.fornecedorId]: e.target.value }))} className="h-6 text-xs border-gray-300 bg-white text-gray-900 w-full" />
                                      <Input placeholder="Cond. pagamento" value={editCondPag[p.fornecedorId] ?? ""} onChange={e => setEditCondPag(prev => ({ ...prev, [p.fornecedorId]: e.target.value }))} className="h-6 text-xs border-gray-300 bg-white text-gray-900 w-full" />
                                    </div>
                                  ) : (
                                    <div className="text-xs text-center text-gray-500">
                                      {p.prazoEntregaDias ? `${p.prazoEntregaDias}d` : "—"} / {p.condicaoPagamento || "—"}
                                    </div>
                                  )}
                                </td>
                              ))}
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {(mapa?.itens ?? []).map((it: any) => {
                            const melhorPreco = getMelhorPrecoItem(it.id);
                            return (
                              <tr key={it.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-gray-900 text-xs">{it.descricao}</td>
                                <td className="px-3 py-2.5 text-gray-500 text-xs text-center">{it.unidade || "un"}</td>
                                <td className="px-3 py-2.5 text-gray-700 text-xs text-right">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</td>
                                {(mapa?.participantes ?? []).map((p: any) => {
                                  const key = `${it.id}_${p.fornecedorId}`;
                                  const precoAtual = editingFornId === p.fornecedorId ? parseFloat(editPrecos[key] ?? "0") : parseFloat(mapa?.respostaMap?.[key]?.precoUnitario ?? "0");
                                  const isBest = melhorPreco !== null && precoAtual > 0 && precoAtual === melhorPreco;
                                  return (
                                    <td key={p.fornecedorId} className={`px-2 py-2 text-center ${isBest ? "bg-emerald-50" : ""}`}>
                                      {editingFornId === p.fornecedorId ? (
                                        <Input
                                          type="number" step="0.01" min="0"
                                          value={editPrecos[key] ?? ""}
                                          onChange={e => setEditPrecos(prev => ({ ...prev, [key]: e.target.value }))}
                                          className={`h-7 text-xs text-right border-gray-300 bg-white text-gray-900 w-28 mx-auto ${isBest ? "border-emerald-400" : ""}`}
                                          placeholder="0,00"
                                        />
                                      ) : (
                                        <span className={`text-xs font-medium ${isBest ? "text-emerald-700 font-bold" : "text-gray-700"}`}>
                                          {precoAtual > 0 ? precoAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : <span className="text-gray-300">—</span>}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300 bg-gray-50">
                            <td colSpan={3} className="px-4 py-3 text-xs font-bold text-gray-700 uppercase">Total por Fornecedor</td>
                            {(mapa?.participantes ?? []).map((p: any) => {
                              const totalForn = editingFornId === p.fornecedorId
                                ? (mapa?.itens ?? []).reduce((acc: number, it: any) => {
                                    const preco = parseFloat(editPrecos[`${it.id}_${p.fornecedorId}`] ?? "0") || 0;
                                    return acc + preco * parseFloat(it.quantidade);
                                  }, 0)
                                : parseFloat(p.totalOrcado ?? "0");
                              const isMelhor = melhorForn?.fornecedorId === p.fornecedorId;
                              return (
                                <td key={p.fornecedorId} className={`px-3 py-3 text-center text-sm font-bold ${isMelhor ? "text-emerald-700 bg-emerald-50" : "text-gray-900"}`}>
                                  {totalForn > 0 ? totalForn.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                          {/* Botões de edição por fornecedor */}
                          <tr className="bg-white border-t border-gray-100">
                            <td colSpan={3} className="px-4 py-2"></td>
                            {(mapa?.participantes ?? []).map((p: any) => (
                              <td key={p.fornecedorId} className="px-2 py-2 text-center">
                                {editingFornId === p.fornecedorId ? (
                                  <div className="flex gap-1 justify-center">
                                    <Button size="sm" onClick={() => handleSalvarPrecos(p.fornecedorId)} disabled={salvarRespostas.isPending}
                                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1">
                                      <Save className="h-3 w-3" /> Salvar
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingFornId(null)} className="h-7 text-xs border-gray-300 text-gray-600">
                                      Cancelar
                                    </Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => setEditingFornId(p.fornecedorId)}
                                    className="h-7 text-xs border-blue-200 text-blue-600 hover:bg-blue-50">
                                    Editar preços
                                  </Button>
                                )}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 border border-blue-200">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cotações</h1>
            <p className="text-sm text-gray-500">Registre propostas de fornecedores e compare preços</p>
          </div>
        </div>
        <DraggableCommandBar barId="cotacoes" items={[
          { id: "nova", node: <Button onClick={() => setShowNova(true)} className="bg-blue-600 hover:bg-blue-500 text-white gap-2"><Plus className="h-4 w-4" /> Nova Cotação</Button> },
        ]} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar por número..." className="pl-9 bg-white border-gray-300 text-gray-900" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <div className="flex gap-2">
          {["todos", "pendente", "aprovada", "recusada", "expirada"].map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filtroStatus === s ? "bg-blue-600 border-blue-500 text-white" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"}`}>
              {s === "todos" ? "Todos" : STATUS_LABELS[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Número</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Descrição / SC</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Obra</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Fornecedor</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Total</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Validade</TableHead>
              <TableHead className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Status</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></TableCell></TableRow>
            ) : filt.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-gray-400">Nenhuma cotação encontrada</TableCell></TableRow>
            ) : filt.map(cot => {
              const st = STATUS_LABELS[cot.status] ?? STATUS_LABELS.pendente;
              const forn = fornecedores.find(f => f.id === cot.fornecedorId);
              return (
                <TableRow key={cot.id} className="border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setShowDetalhe(cot.id)}>
                  <TableCell className="text-gray-900 font-mono font-semibold text-xs">{cot.numeroCotacao}</TableCell>
                  <TableCell>
                    <div className="text-gray-900 text-sm">{(cot as any).descricao || "—"}</div>
                    {cot.solicitacaoId && <div className="text-gray-400 text-xs">SC #{cot.solicitacaoId}</div>}
                  </TableCell>
                  <TableCell>
                    {(cot as any).obraId ? (
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {nomeObra((cot as any).obraId) ?? `#${(cot as any).obraId}`}
                      </div>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-gray-600 text-sm">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</TableCell>
                  <TableCell className="text-emerald-700 font-semibold text-sm">
                    {parseFloat(cot.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{cot.dataValidade ? new Date(cot.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>{st.label}</span></TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-gray-400" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Nova Cotação */}
      <Dialog open={showNova} onOpenChange={v => { setShowNova(v); if (!v) resetForm(); }}>
        <DialogContent className="border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">Nova Cotação</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Descrição da Cotação</Label>
              <Input className="bg-white border-gray-300 text-gray-900" placeholder="Ex: Cotação de materiais de elétrica - Forn. XYZ" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>

            {/* Obra obrigatória */}
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5 text-blue-600" /> Obra / Centro de Custo *
              </Label>
              <Select value={form.obraId} onValueChange={v => setForm(p => ({ ...p, obraId: v }))}>
                <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Selecione a obra vinculada..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {obras.map((o: any) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.codigo ? `[${o.codigo}] ` : ""}{o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">Obrigatório — o custo desta cotação será apropriado à obra selecionada.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">SC Vinculada (opcional)</Label>
                <Select value={form.solicitacaoId} onValueChange={handleScChange}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione uma SC..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {(scsQ.data ?? []).filter(s => ["pendente", "cotacao"].includes(s.status)).map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.numeroSc}{(s as any).titulo ? ` — ${(s as any).titulo}` : s.departamento ? ` — ${s.departamento}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Fornecedor</Label>
                <Select value={form.fornecedorId} onValueChange={v => setForm(p => ({ ...p, fornecedorId: v }))}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="none">Nenhum</SelectItem>
                    {fornecedores.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.nomeFantasia || f.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Validade da Cotação</Label>
                <Input type="date" className="bg-white border-gray-300 text-gray-900" value={form.dataValidade} onChange={e => setForm(p => ({ ...p, dataValidade: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Condição de Pagamento</Label>
                <Select value={form.condicaoPagamento} onValueChange={v => setForm(p => ({ ...p, condicaoPagamento: v }))}>
                  <SelectTrigger className="bg-white border-gray-300 text-gray-900">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {COND_PAG.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-700 text-sm font-medium">Prazo Entrega (dias)</Label>
                <Input type="number" min="0" className="bg-white border-gray-300 text-gray-900" value={form.prazoEntregaDias} onChange={e => setForm(p => ({ ...p, prazoEntregaDias: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 text-sm font-medium">Observações</Label>
              <Textarea className="bg-white border-gray-300 text-gray-900 resize-none" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} />
            </div>

            {/* Itens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-gray-700 font-semibold">Itens da Cotação *</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="border-gray-300 text-gray-600 hover:bg-gray-50 gap-1 text-xs">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {itens.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
                    <div className="flex gap-2">
                      <Input className="flex-1 bg-white border-gray-300 text-gray-900 text-sm" placeholder="Descrição *" value={it.descricao} onChange={e => updateItem(idx, "descricao", e.target.value)} />
                      {itens.length > 1 && (
                        <button onClick={() => removeItem(idx)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Select value={it.unidade} onValueChange={v => updateItem(idx, "unidade", v)}>
                        <SelectTrigger className="w-20 bg-white border-gray-300 text-gray-900 text-sm h-8"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-white border-gray-200">
                          {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="w-24 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" placeholder="Qtd" value={it.quantidade} onChange={e => updateItem(idx, "quantidade", e.target.value)} />
                      <Input className="flex-1 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" step="0.01" placeholder="Preço unit. (R$)" value={it.precoUnitario} onChange={e => updateItem(idx, "precoUnitario", e.target.value)} />
                      <Input className="w-20 bg-white border-gray-300 text-gray-900 text-sm h-8" type="number" min="0" max="100" placeholder="Desc%" value={it.descontoPct} onChange={e => updateItem(idx, "descontoPct", e.target.value)} />
                      <div className="w-28 flex items-center text-emerald-700 text-sm font-medium">
                        {calcTotal(it).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <span className="text-gray-500 text-sm">Total: <span className="text-emerald-700 font-bold text-base">{totalItens.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setShowNova(false); resetForm(); }} className="flex-1 border-gray-300 text-gray-600 hover:bg-gray-50">Cancelar</Button>
              <Button onClick={handleSalvar} disabled={criar.isPending} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white">
                {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Cotação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Detalhe Cotação */}
      <Dialog open={showDetalhe !== null} onOpenChange={v => !v && setShowDetalhe(null)}>
        <DialogContent className="border-gray-200 max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#ffffff', color: '#111827' }}>
          <DialogHeader>
            <DialogTitle className="text-gray-900">{detalhe?.numeroCotacao} — Detalhes</DialogTitle>
          </DialogHeader>
          {detalheQ.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : detalhe ? (() => {
            const forn = fornecedores.find(f => f.id === detalhe.fornecedorId);
            const st = STATUS_LABELS[detalhe.status] ?? STATUS_LABELS.pendente;
            return (
              <div className="space-y-5 pt-2">
                {(detalhe as any).descricao && (
                  <div className="text-gray-700 text-sm bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">{(detalhe as any).descricao}</div>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div><span className="text-gray-400 text-xs">Obra</span><p className="text-gray-900 font-medium flex items-center gap-1"><Building2 className="h-3 w-3 text-gray-400" />{nomeObra((detalhe as any).obraId) ?? "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Status</span><p><span className={`inline-flex px-2 py-0.5 rounded text-xs border ${st.cls}`}>{st.label}</span></p></div>
                  <div><span className="text-gray-400 text-xs">Fornecedor</span><p className="text-gray-900 font-medium">{forn?.nomeFantasia || forn?.razaoSocial || "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Cond. Pagamento</span><p className="text-gray-900 font-medium">{detalhe.condicaoPagamento || "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Prazo Entrega</span><p className="text-gray-900 font-medium">{detalhe.prazoEntregaDias ? `${detalhe.prazoEntregaDias} dias` : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Validade</span><p className="text-gray-900 font-medium">{detalhe.dataValidade ? new Date(detalhe.dataValidade + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p></div>
                  <div><span className="text-gray-400 text-xs">Total</span><p className="text-emerald-700 font-bold">{parseFloat(detalhe.total ?? "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-200 bg-gray-50 hover:bg-gray-50">
                        <TableHead className="text-gray-500 text-xs">Descrição</TableHead>
                        <TableHead className="text-gray-500 text-xs w-16">Un.</TableHead>
                        <TableHead className="text-gray-500 text-xs w-20">Qtd</TableHead>
                        <TableHead className="text-gray-500 text-xs w-28">Preço Unit.</TableHead>
                        <TableHead className="text-gray-500 text-xs w-16">Desc%</TableHead>
                        <TableHead className="text-gray-500 text-xs w-28">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detalhe.itens as any[]).map((it: any) => (
                        <TableRow key={it.id} className="border-gray-100">
                          <TableCell className="text-gray-900 text-sm">{it.descricao}</TableCell>
                          <TableCell className="text-gray-500 text-sm">{it.unidade || "un"}</TableCell>
                          <TableCell className="text-gray-500 text-sm">{parseFloat(it.quantidade).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-gray-700 text-sm">{parseFloat(it.precoUnitario || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                          <TableCell className="text-gray-500 text-sm">{parseFloat(it.descontoPct || "0")}%</TableCell>
                          <TableCell className="text-emerald-700 text-sm font-medium">{parseFloat(it.total || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                  {detalhe.status === "pendente" && (
                    <>
                      <Button size="sm" onClick={() => gerarOC.mutate({ companyId, cotacaoId: detalhe.id })} disabled={gerarOC.isPending}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1">
                        <CheckCircle className="h-3 w-3" /> Aprovar e Gerar OC
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => atualizarStatus.mutate({ id: detalhe.id, status: "recusada" })}
                        className="border-red-200 text-red-600 hover:bg-red-50 text-xs gap-1">
                        <X className="h-3 w-3" /> Recusar
                      </Button>
                    </>
                  )}
                  {detalhe.status === "aprovada" && !(detalhe as any).contratoTerceiroId && (
                    <Button size="sm" onClick={() => gerarContrato.mutate({ cotacaoId: detalhe.id, companyId })}
                      disabled={gerarContrato.isPending}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1">
                      {gerarContrato.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                      Gerar Contrato de Serviço
                    </Button>
                  )}
                  {detalhe.status === "aprovada" && (detalhe as any).contratoTerceiroId && (
                    <Button size="sm" variant="outline" onClick={() => { setShowDetalhe(null); navigate(`/terceiros/contratos/${(detalhe as any).contratoTerceiroId}`); }}
                      className="border-blue-200 text-blue-600 hover:bg-blue-50 text-xs gap-1">
                      <FileText className="h-3 w-3" /> Ver Contrato de Serviço
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => excluir.mutate({ id: detalhe.id })}
                    className="border-gray-200 text-gray-500 hover:bg-gray-50 text-xs ml-auto gap-1">
                    <Trash2 className="h-3 w-3" /> Excluir
                  </Button>
                </div>
              </div>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
