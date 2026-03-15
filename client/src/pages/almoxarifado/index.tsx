import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Search, Plus, Pencil, Package, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, Loader2, History, X, BarChart2, Boxes,
  LayoutGrid, List, Camera, Trash2, ImageOff,
  Wrench, ClipboardCheck, User, CheckCircle2, XCircle, ChevronRight,
  Building2, HardHat, Sparkles, ScanLine,
} from "lucide-react";


const EMPTY_ITEM = {
  nome: "", unidade: "un", categoria: "", codigoInterno: "",
  quantidadeAtual: 0, quantidadeMinima: 0, observacoes: "", fotoUrl: "",
  origem: "proprio" as "proprio" | "alugado",
  fornecedorLocacao: "", dataInicioLocacao: "", dataVencimentoLocacao: "",
  valorLocacaoMensal: 0, observacoesLocacao: "",
};
const EMPTY_MOV = {
  tipo: "entrada" as "entrada" | "saida" | "ajuste",
  quantidade: 0, obraId: 0, motivo: "", observacoes: "",
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ atual, minimo }: { atual: number; minimo: number }) {
  if (minimo === 0) return <span className="text-xs text-gray-400">Sem mínimo</span>;
  const pct = atual / minimo;
  if (pct >= 1) return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />OK</span>;
  if (pct >= 0.5) return <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />Baixo</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Crítico</span>;
}

export default function AlmoxarifadoPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;

  const [busca, setBusca] = useState("");
  const [filtroCateg, setFiltroCateg] = useState("todas");
  const [apenasAbaixo, setApenasAbaixo] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [obraContexto, setObraContexto] = useState<number | null>(null);

  // Busca por foto (IA)
  const fotoIAInputRef = useRef<HTMLInputElement>(null);
  const [modalFotoIA, setModalFotoIA] = useState(false);
  const [fotoIAPreview, setFotoIAPreview] = useState<string>("");
  const [fotoIADescricao, setFotoIADescricao] = useState<string>("");
  const [fotoIAMatches, setFotoIAMatches] = useState<Array<{id:number;nome:string;similaridade:number;motivo:string}>>([]);
  const identificarPorFoto = trpc.warehouse.identificarPorFoto.useMutation({
    onSuccess: (d) => { setFotoIADescricao(d.descricao); setFotoIAMatches(d.matches as any); },
    onError: (e) => { toast.error("Erro ao identificar: " + e.message); setModalFotoIA(false); },
  });

  function handleFotoIAChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setFotoIAPreview(dataUrl);
      setFotoIADescricao("");
      setFotoIAMatches([]);
      setModalFotoIA(true);
      const base64 = dataUrl.split(",")[1];
      identificarPorFoto.mutate({ companyId, obraId: obraContexto, base64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function selecionarItemIA(id: number) {
    const item = itens.find((i: any) => i.id === id);
    if (item) {
      setBusca(item.nome);
      setModalFotoIA(false);
      toast.success(`Item "${item.nome}" selecionado`);
    }
  }

  const { data: obrasAtivas = [] } = trpc.obras.listForAlmoxarifado.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  useEffect(() => {
    if (obrasAtivas.length === 1 && obraContexto === null) {
      setObraContexto((obrasAtivas[0] as any).id);
    }
  }, [obrasAtivas]);

  const { data: itens = [], refetch, isLoading } = trpc.compras.listarItens.useQuery(
    { companyId, obraId: obraContexto }, { enabled: !!companyId }
  );
  const { data: categorias = [] } = trpc.compras.listarCategoriasAlmoxarifado.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: unidades = [], refetch: refetchUnidades } = trpc.compras.listarUnidades.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const lista = useMemo(() => {
    let r = itens;
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(i => i.nome.toLowerCase().includes(b) || i.codigoInterno?.toLowerCase().includes(b) || i.categoria?.toLowerCase().includes(b));
    }
    if (filtroCateg !== "todas") r = r.filter(i => i.categoria === filtroCateg);
    if (apenasAbaixo) r = r.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima));
    return r;
  }, [itens, busca, filtroCateg, apenasAbaixo]);

  const totalCriticos = useMemo(() =>
    itens.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima)).length,
    [itens]
  );

  // ── Modal Unidades ──────────────────────────────────────────────
  const [modalUnidades, setModalUnidades] = useState(false);
  const [novaUnidadeSigla, setNovaUnidadeSigla] = useState("");
  const [novaUnidadeDesc, setNovaUnidadeDesc] = useState("");
  const criarUnidadeMut = trpc.compras.criarUnidade.useMutation({
    onSuccess: () => { refetchUnidades(); setNovaUnidadeSigla(""); setNovaUnidadeDesc(""); toast.success("Unidade cadastrada!"); },
    onError: (e) => toast.error(e.message),
  });
  const excluirUnidadeMut = trpc.compras.excluirUnidade.useMutation({
    onSuccess: () => { refetchUnidades(); toast.success("Unidade removida."); },
    onError: (e) => toast.error(e.message),
  });

  // ── Modal Item ──────────────────────────────────────────────────
  const [modalItem, setModalItem] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formItem, setFormItem] = useState({ ...EMPTY_ITEM });
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [analisandoFotoIA, setAnalisandoFotoIA] = useState(false);
  const [camposPreenchidosIA, setCamposPreenchidosIA] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  function abrirNovo() { setFormItem({ ...EMPTY_ITEM }); setEditandoId(null); setCamposPreenchidosIA(false); setModalItem(true); }
  function abrirEditar(i: any) {
    setFormItem({
      nome: i.nome, unidade: i.unidade, categoria: i.categoria ?? "", codigoInterno: i.codigoInterno ?? "",
      quantidadeAtual: n(i.quantidadeAtual), quantidadeMinima: n(i.quantidadeMinima),
      observacoes: i.observacoes ?? "", fotoUrl: i.fotoUrl ?? "",
      origem: (i.origem === "alugado" ? "alugado" : "proprio") as "proprio" | "alugado",
      fornecedorLocacao: i.fornecedorLocacao ?? "", dataInicioLocacao: i.dataInicioLocacao ?? "",
      dataVencimentoLocacao: i.dataVencimentoLocacao ?? "",
      valorLocacaoMensal: parseFloat(i.valorLocacaoMensal ?? "0") || 0,
      observacoesLocacao: i.observacoesLocacao ?? "",
    });
    setEditandoId(i.id);
    setCamposPreenchidosIA(false);
    setModalItem(true);
  }

  const sugerirCadastroMut = trpc.warehouse.sugerirCadastroItem.useMutation({
    onSuccess: (sug) => {
      setFormItem(p => ({
        ...p,
        nome: p.nome.trim() === "" ? sug.nome : p.nome,
        categoria: p.categoria.trim() === "" ? sug.categoria : p.categoria,
        unidade: p.unidade === "un" ? sug.unidade : p.unidade,
        observacoes: p.observacoes.trim() === "" ? sug.observacoes : p.observacoes,
      }));
      if (sug.nome) setCamposPreenchidosIA(true);
      else toast.error("IA não conseguiu identificar o produto. Preencha manualmente.");
      setAnalisandoFotoIA(false);
    },
    onError: (e) => {
      setAnalisandoFotoIA(false);
      toast.error("Erro na análise IA: " + e.message);
    },
  });

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFoto(true);
    try {
      const compressed = await compressImage(file);
      setFormItem(p => ({ ...p, fotoUrl: compressed }));
      // Só faz análise IA ao cadastrar novo item
      if (editandoId === null) {
        setAnalisandoFotoIA(true);
        setCamposPreenchidosIA(false);
        // compressImage always outputs image/jpeg regardless of input — extract from data URL
        const commaIdx = compressed.indexOf(",");
        const header = compressed.slice(0, commaIdx); // "data:image/jpeg;base64"
        const mimeType = header.split(":")[1]?.split(";")[0] || "image/jpeg";
        const base64 = compressed.slice(commaIdx + 1);
        sugerirCadastroMut.mutate({
          companyId,
          base64,
          mimeType,
          categorias: categorias as string[],
          unidades: (unidades as any[]).map(u => u.sigla),
        });
      }
    } catch { toast.error("Erro ao processar imagem."); }
    finally { setUploadingFoto(false); e.target.value = ""; }
  }

  const { data: itensLocadosVencendo = [] } = trpc.compras.getItensLocadosVencendo.useQuery(
    { companyId, diasAlerta: 30 }, { enabled: !!companyId }
  );

  const [modalDevolverLocacao, setModalDevolverLocacao] = useState(false);
  const [itemDevolverLocacao, setItemDevolverLocacao] = useState<any>(null);
  const [obsDevolucaoLocacao, setObsDevolucaoLocacao] = useState("");

  const criarMut = trpc.compras.criarItem.useMutation({
    onSuccess: () => { refetch(); setModalItem(false); toast.success("Item criado!"); },
  });
  const atualizarMut = trpc.compras.atualizarItem.useMutation({
    onSuccess: () => { refetch(); setModalItem(false); toast.success("Item atualizado!"); },
  });
  const excluirMut = trpc.compras.excluirItem.useMutation({
    onSuccess: () => { refetch(); toast.success("Item removido."); },
  });
  const devolverLocacaoMut = trpc.compras.devolverLocacaoItem.useMutation({
    onSuccess: () => { refetch(); setModalDevolverLocacao(false); setItemDevolverLocacao(null); setObsDevolucaoLocacao(""); toast.success("Equipamento devolvido ao fornecedor. Item desativado."); },
  });

  function abrirDevolverLocacao(item: any) { setItemDevolverLocacao(item); setObsDevolucaoLocacao(""); setModalDevolverLocacao(true); }

  function salvarItem() {
    if (!formItem.nome.trim()) { toast.error("Nome é obrigatório."); return; }
    const locacaoPayload = formItem.origem === "alugado" ? {
      origem: "alugado" as const,
      fornecedorLocacao: formItem.fornecedorLocacao || undefined,
      dataInicioLocacao: formItem.dataInicioLocacao || undefined,
      dataVencimentoLocacao: formItem.dataVencimentoLocacao || undefined,
      valorLocacaoMensal: formItem.valorLocacaoMensal || undefined,
      observacoesLocacao: formItem.observacoesLocacao || undefined,
    } : { origem: "proprio" as const, fornecedorLocacao: null, dataInicioLocacao: null, dataVencimentoLocacao: null, valorLocacaoMensal: null, observacoesLocacao: null };
    if (editandoId) {
      atualizarMut.mutate({
        id: editandoId, nome: formItem.nome, unidade: formItem.unidade,
        categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined,
        quantidadeMinima: formItem.quantidadeMinima, observacoes: formItem.observacoes || undefined,
        fotoUrl: formItem.fotoUrl || null, ...locacaoPayload,
      });
    } else {
      criarMut.mutate({
        companyId, obraId: obraContexto, nome: formItem.nome, unidade: formItem.unidade,
        categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined,
        quantidadeAtual: formItem.quantidadeAtual, quantidadeMinima: formItem.quantidadeMinima,
        observacoes: formItem.observacoes || undefined, fotoUrl: formItem.fotoUrl || undefined,
        ...locacaoPayload,
      });
    }
  }

  // ── Modal Movimentação ──────────────────────────────────────────
  const [modalMov, setModalMov] = useState(false);
  const [movItem, setMovItem] = useState<any>(null);
  const [formMov, setFormMov] = useState({ ...EMPTY_MOV });
  const movMut = trpc.compras.registrarMovimento.useMutation({
    onSuccess: () => { refetch(); setModalMov(false); toast.success("Movimentação registrada!"); },
    onError: (e) => toast.error(e.message),
  });

  function abrirMovimento(i: any, tipo: "entrada" | "saida") {
    setMovItem(i);
    setFormMov({ tipo, quantidade: 0, obraId: obraContexto ?? 0, motivo: "", observacoes: "" });
    setModalMov(true);
  }
  function salvarMovimento() {
    if (!movItem) return;
    if (formMov.quantidade <= 0) { toast.error("Quantidade deve ser maior que zero."); return; }
    if (formMov.tipo === "saida" && !formMov.obraId) { toast.error("Selecione a obra de destino."); return; }
    const obraSel = obrasAtivas.find((o: any) => o.id === formMov.obraId);
    movMut.mutate({ companyId, itemId: movItem.id, tipo: formMov.tipo, quantidade: formMov.quantidade, obraId: formMov.obraId || undefined, obraNome: obraSel ? (obraSel.codigo ? `${obraSel.codigo} – ${obraSel.nome}` : obraSel.nome) : undefined, motivo: formMov.motivo || undefined, observacoes: formMov.observacoes || undefined });
  }

  // ── Modal Histórico ─────────────────────────────────────────────
  const [modalHist, setModalHist] = useState(false);
  const [histItem, setHistItem] = useState<any>(null);
  const { data: movimentos = [], isLoading: loadHist } = trpc.compras.listarMovimentos.useQuery(
    { companyId, itemId: histItem?.id ?? 0 },
    { enabled: !!histItem && modalHist }
  );

  // ── AÇÕES RÁPIDAS MOBILE ─────────────────────────────────────────
  const utils = trpc.useUtils();

  // Modal Entrada Rápida
  const [modalEntrada, setModalEntrada] = useState(false);
  const [entradaItemId, setEntradaItemId] = useState<number>(0);
  const [entradaQtd, setEntradaQtd] = useState("");
  const [entradaMotivo, setEntradaMotivo] = useState("");
  const [entradaOk, setEntradaOk] = useState<boolean | null>(null);
  const registerEntry = trpc.warehouse.registerEntry.useMutation({
    onSuccess: (d) => { refetch(); setEntradaOk(true); },
    onError: (e) => { toast.error(e.message); setEntradaOk(false); },
  });

  // Modal Saída Rápida
  const [modalSaida, setModalSaida] = useState(false);
  const [saidaItemId, setSaidaItemId] = useState<number>(0);
  const [saidaQtd, setSaidaQtd] = useState("");
  const [saidaObraId, setSaidaObraId] = useState<number>(0);
  const [saidaOk, setSaidaOk] = useState<boolean | null>(null);
  const registerExit = trpc.warehouse.registerExit.useMutation({
    onSuccess: () => { refetch(); setSaidaOk(true); },
    onError: (e) => { toast.error(e.message); setSaidaOk(false); },
  });

  // Modal Empréstimo
  const [modalEmprestimo, setModalEmprestimo] = useState(false);
  const [empCodigo, setEmpCodigo] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const [empSelecionado, setEmpSelecionado] = useState<any>(null);
  const [empShowSug, setEmpShowSug] = useState(false);
  const [empItemId, setEmpItemId] = useState<number>(0);
  const [empQtd, setEmpQtd] = useState("1");
  const [empOk, setEmpOk] = useState<null | { nome: string }>(null);
  const [empErr, setEmpErr] = useState<string | null>(null);
  const { data: empFuncionario } = trpc.warehouse.getFuncionarioByCodigo.useQuery(
    { companyId, codigo: empCodigo },
    { enabled: empCodigo.length >= 5 }
  );
  const { data: empSugestoes = [] } = trpc.warehouse.searchFuncionarios.useQuery(
    { companyId, q: empSearch },
    { enabled: empSearch.length >= 2 && !empSelecionado }
  );
  const registerLoan = trpc.warehouse.registerLoan.useMutation({
    onSuccess: (d) => { refetch(); setEmpOk({ nome: d.funcionarioNome }); setEmpErr(null); },
    onError: (e) => { setEmpErr(e.message); setEmpOk(null); },
  });

  // Modal Fechar Dia (devolução)
  const [modalFecharDia, setModalFecharDia] = useState(false);
  const { data: emprestimosHoje = [], refetch: refetchLoans } = trpc.warehouse.listTodayLoans.useQuery(
    { companyId },
    { enabled: modalFecharDia && !!companyId }
  );
  const returnLoan = trpc.warehouse.returnLoanById.useMutation({
    onSuccess: () => { refetchLoans(); refetch(); toast.success("Ferramenta devolvida!"); },
    onError: (e) => toast.error(e.message),
  });

  // ── Modal Registros ─────────────────────────────────────────────
  const [modalRegistros, setModalRegistros] = useState(false);
  const [abaRegistros, setAbaRegistros] = useState<"entradas" | "saidas" | "emprestados" | "cadastros">("entradas");
  const { data: movEntradas = [], isLoading: loadingEntradas } = trpc.warehouse.listMovements.useQuery(
    { companyId, tipo: "entrada", limit: 300 },
    { enabled: !!companyId && modalRegistros && abaRegistros === "entradas" }
  );
  const { data: movSaidas = [], isLoading: loadingSaidas } = trpc.warehouse.listMovements.useQuery(
    { companyId, tipo: "saida", limit: 300 },
    { enabled: !!companyId && modalRegistros && abaRegistros === "saidas" }
  );
  const { data: loansAbertos = [], isLoading: loadingLoans } = trpc.warehouse.listOpenLoans.useQuery(
    { companyId },
    { enabled: !!companyId && modalRegistros && abaRegistros === "emprestados" }
  );

  function resetEntrada() { setEntradaItemId(0); setEntradaQtd(""); setEntradaMotivo(""); setEntradaOk(null); }
  function resetSaida() { setSaidaItemId(0); setSaidaQtd(""); setSaidaObraId(obraContexto ?? 0); setSaidaOk(null); }
  function resetEmprestimo() { setEmpCodigo(""); setEmpSearch(""); setEmpSelecionado(null); setEmpShowSug(false); setEmpItemId(0); setEmpQtd("1"); setEmpOk(null); setEmpErr(null); }
  function selecionarFuncionario(f: any) { setEmpSelecionado(f); setEmpCodigo(f.codigoInterno); setEmpSearch(f.nomeCompleto); setEmpShowSug(false); }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Boxes className="h-5 w-5 text-emerald-600" />
                {obraContexto === null
                  ? "Almoxarifado Central"
                  : `Almoxarifado — ${obrasAtivas.find(o => o.id === obraContexto)?.nome ?? "Obra"}`}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">{itens.length} ite{itens.length !== 1 ? "ns" : "m"} cadastrado{itens.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              {itensLocadosVencendo.length > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5" title={itensLocadosVencendo.map((i: any) => `${i.nome} — vence em ${i.diasParaVencimento <= 0 ? "VENCIDO" : `${i.diasParaVencimento}d`}`).join("\n")}>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">{itensLocadosVencendo.length} locação{itensLocadosVencendo.length > 1 ? "ões" : ""} a vencer</span>
                </div>
              )}
              {totalCriticos > 0 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-700">{totalCriticos} abaixo do mínimo</span>
                </div>
              )}
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition ${viewMode === "cards" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Cards
                </button>
                <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition ${viewMode === "table" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                  <List className="h-3.5 w-3.5" /> Tabela
                </button>
              </div>
              <button onClick={abrirNovo} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
                <Plus className="h-4 w-4" /> Novo Item
              </button>
            </div>
          </div>
        </div>

        {/* ── SELETOR DE CONTEXTO (Central / Obra) ─────────────── */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            {obraContexto === null
              ? <Building2 className="h-4 w-4 text-emerald-600 shrink-0" />
              : <HardHat className="h-4 w-4 text-blue-600 shrink-0" />}
            <select
              value={obraContexto ?? "central"}
              onChange={e => {
                const v = e.target.value;
                setObraContexto(v === "central" ? null : Number(v));
              }}
              className="flex-1 h-9 text-sm font-medium border border-gray-200 rounded-lg px-3 bg-white text-gray-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
            >
              <option value="central">🏢 Almoxarifado Central</option>
              {obrasAtivas.length > 0 && (
                <optgroup label="── Por Obra ──">
                  {obrasAtivas.map((obra: any) => (
                    <option key={obra.id} value={obra.id}>
                      🏗️ {obra.codigo ? `${obra.codigo} – ${obra.nome}` : obra.nome}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {/* ── AÇÕES RÁPIDAS MOBILE ──────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* ENTRADA */}
            <button
              onClick={() => { resetEntrada(); setModalEntrada(true); }}
              className="flex flex-col items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition"
            >
              <ArrowDownCircle className="w-8 h-8" />
              📥 ENTRADA
            </button>
            {/* SAÍDA */}
            <button
              onClick={() => { resetSaida(); setModalSaida(true); }}
              className="flex flex-col items-center justify-center gap-2 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition"
            >
              <ArrowUpCircle className="w-8 h-8" />
              📤 SAÍDA
            </button>
            {/* EMPRESTAR */}
            <button
              onClick={() => { resetEmprestimo(); setModalEmprestimo(true); }}
              className="flex flex-col items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition"
            >
              <Wrench className="w-8 h-8" />
              🔧 EMPRESTAR
            </button>
            {/* FECHAR DIA */}
            <button
              onClick={() => setModalFecharDia(true)}
              className="flex flex-col items-center justify-center gap-2 bg-gray-700 hover:bg-gray-800 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition"
            >
              <ClipboardCheck className="w-8 h-8" />
              📋 FECHAR DIA
            </button>
          </div>

          {/* ── VER REGISTROS (linha secundária) ────────────────── */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[
              { label: "Entradas", aba: "entradas" as const, icon: "↓", color: "text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100" },
              { label: "Saídas",   aba: "saidas"   as const, icon: "↑", color: "text-orange-700 border-orange-300 bg-orange-50 hover:bg-orange-100" },
              { label: "Emprestados", aba: "emprestados" as const, icon: "🔧", color: "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100" },
              { label: "Cadastros",   aba: "cadastros"   as const, icon: "📦", color: "text-gray-700 border-gray-300 bg-gray-50 hover:bg-gray-100" },
            ].map(({ label, aba, icon, color }) => (
              <button
                key={aba}
                onClick={() => { setAbaRegistros(aba); setModalRegistros(true); }}
                className={`flex items-center justify-center gap-1.5 border rounded-xl px-2 py-2 text-xs font-semibold transition active:scale-95 ${color}`}
              >
                <span>{icon}</span>
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label.slice(0, 3)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total de Itens", v: itens.length, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Estoque OK", v: itens.filter(i => n(i.quantidadeMinima) === 0 || n(i.quantidadeAtual) >= n(i.quantidadeMinima)).length, icon: BarChart2, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Estoque Baixo", v: itens.filter(i => { const a = n(i.quantidadeAtual), m = n(i.quantidadeMinima); return m > 0 && a < m && a >= m * 0.5; }).length, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50" },
              { label: "Estoque Crítico", v: totalCriticos, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <div className={`${k.bg} p-2 rounded-lg`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.v}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                placeholder="Buscar por nome, código ou categoria..."
                value={busca} onChange={e => setBusca(e.target.value)}
              />
            </div>
            {/* Botão de busca por foto (IA) */}
            <button
              onClick={() => fotoIAInputRef.current?.click()}
              className="h-9 px-3 flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition shadow-sm"
              title="Identificar item por foto (IA)"
            >
              <ScanLine className="w-4 h-4" />
              <span className="hidden sm:inline">Foto IA</span>
            </button>
            <input
              ref={fotoIAInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFotoIAChange}
            />
            <select
              value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)}
              className="h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-700 outline-none focus:border-emerald-400"
            >
              <option value="todas">Todas categorias</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={apenasAbaixo} onChange={e => setApenasAbaixo(e.target.checked)} className="rounded border-gray-300" />
              Apenas abaixo do mínimo
            </label>
            <span className="text-xs text-gray-400">{lista.length} resultado{lista.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
          ) : lista.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
              <Boxes className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum item no almoxarifado</p>
              <p className="text-sm text-gray-400 mt-1">Clique em "Novo Item" para cadastrar</p>
            </div>
          ) : viewMode === "cards" ? (
            /* ── CARD VIEW ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {lista.map(item => {
                const atual = n(item.quantidadeAtual);
                const minimo = n(item.quantidadeMinima);
                const abaixo = minimo > 0 && atual < minimo;
                return (
                  <div key={item.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col transition hover:shadow-md ${abaixo ? "border-red-200" : "border-gray-100"}`}>
                    {/* Foto */}
                    <div
                      className="relative bg-gray-50 flex items-center justify-center cursor-pointer group"
                      style={{ height: 140 }}
                      onClick={() => abrirEditar(item)}
                    >
                      {(item as any).fotoUrl ? (
                        <>
                          <img src={(item as any).fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center">
                            <Pencil className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-emerald-400 transition">
                          <Camera className="h-8 w-8" />
                          <span className="text-[10px]">Adicionar foto</span>
                        </div>
                      )}
                      {abaixo && (
                        <div className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</div>
                      )}
                      {(item as any).origem === "alugado" && (
                        <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">LOCADO</div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{item.nome}</p>
                        {item.categoria && <p className="text-[11px] text-gray-400 mt-0.5">{item.categoria}</p>}
                        {item.codigoInterno && <p className="text-[11px] font-mono text-gray-400">{item.codigoInterno}</p>}
                      </div>
                      <div className="mt-auto">
                        <p className={`text-lg font-bold ${abaixo ? "text-red-600" : "text-gray-900"}`}>
                          {atual % 1 === 0 ? atual.toFixed(0) : atual.toFixed(2)}
                          <span className="text-xs font-normal text-gray-400 ml-1">{item.unidade}</span>
                        </p>
                        <StatusBadge atual={atual} minimo={minimo} />
                      </div>
                      {(item as any).origem === "alugado" && (item as any).dataVencimentoLocacao && (() => {
                        const dias = Math.ceil((new Date((item as any).dataVencimentoLocacao).getTime() - Date.now()) / 86400000);
                        return (
                          <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full text-center ${dias <= 0 ? "bg-red-100 text-red-700" : dias <= 7 ? "bg-orange-100 text-orange-700" : "bg-amber-50 text-amber-700"}`}>
                            {dias <= 0 ? "⚠ VENCIDO" : `Vence em ${dias}d`} — {(item as any).fornecedorLocacao || "Fornecedor"}
                          </div>
                        );
                      })()}
                      {/* Actions */}
                      <div className="flex gap-1 pt-1 border-t border-gray-50">
                        <button onClick={() => abrirMovimento(item, "entrada")} title="Entrada" className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 rounded transition">
                          <ArrowDownCircle className="h-3.5 w-3.5" />In
                        </button>
                        <button onClick={() => abrirMovimento(item, "saida")} title="Saída" className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] text-orange-700 hover:bg-orange-50 rounded transition">
                          <ArrowUpCircle className="h-3.5 w-3.5" />Out
                        </button>
                        {(item as any).origem === "alugado" && (
                          <button onClick={() => abrirDevolverLocacao(item)} title="Devolver ao fornecedor" className="px-1.5 py-1 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded transition">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => { setHistItem(item); setModalHist(true); }} title="Histórico" className="px-1.5 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition">
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => { if (confirm(`Remover "${item.nome}"?`)) excluirMut.mutate({ id: item.id }); }} title="Remover" className="px-1.5 py-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── TABLE VIEW ── */
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estoque</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mínimo</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(item => {
                    const atual = n(item.quantidadeAtual);
                    const minimo = n(item.quantidadeMinima);
                    const abaixo = minimo > 0 && atual < minimo;
                    return (
                      <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50/70 ${abaixo ? "bg-red-50/20" : ""}`}>
                        <td className="px-3 py-2">
                          <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center">
                            {(item as any).fotoUrl
                              ? <img src={(item as any).fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                              : <ImageOff className="h-4 w-4 text-gray-300" />
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{item.nome}</p>
                          <p className="text-xs text-gray-400">{item.unidade}</p>
                        </td>
                        <td className="px-3 py-3">
                          {item.categoria ? <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{item.categoria}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-500">{item.codigoInterno || "—"}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${abaixo ? "text-red-600" : "text-gray-700"}`}>
                          {atual % 1 === 0 ? atual.toFixed(0) : atual.toFixed(2)} {item.unidade}
                        </td>
                        <td className="px-3 py-3 text-right text-gray-500 text-sm">
                          {minimo > 0 ? `${minimo % 1 === 0 ? minimo.toFixed(0) : minimo.toFixed(2)} ${item.unidade}` : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <StatusBadge atual={atual} minimo={minimo} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => abrirMovimento(item, "entrada")} className="flex items-center gap-1 h-7 px-2 text-xs text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-50 transition">
                              <ArrowDownCircle className="h-3.5 w-3.5" />Entrada
                            </button>
                            <button onClick={() => abrirMovimento(item, "saida")} className="flex items-center gap-1 h-7 px-2 text-xs text-orange-700 border border-orange-200 rounded hover:bg-orange-50 transition">
                              <ArrowUpCircle className="h-3.5 w-3.5" />Saída
                            </button>
                            <button onClick={() => { setHistItem(item); setModalHist(true); }} className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition" title="Histórico">
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => abrirEditar(item)} className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition" title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { if (confirm(`Remover "${item.nome}"?`)) excluirMut.mutate({ id: item.id }); }} className="h-7 w-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition" title="Remover">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Novo/Editar Item ──────────────────────────────────── */}
      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalItem(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">{editandoId ? "Editar Item" : "Novo Item de Estoque"}</h2>
              <button onClick={() => setModalItem(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Foto */}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Foto do Produto</label>
                <div className="flex items-start gap-4">
                  <div
                    className="relative w-28 h-28 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-400 transition group"
                    onClick={() => fotoInputRef.current?.click()}
                  >
                    {uploadingFoto ? (
                      <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                    ) : formItem.fotoUrl ? (
                      <>
                        <img src={formItem.fotoUrl} alt="Produto" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                          <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-emerald-400 transition">
                        <Camera className="h-8 w-8" />
                        <span className="text-[10px] text-center">Clique para<br/>adicionar foto</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    {editandoId === null ? (
                      <p className="text-xs text-gray-500">
                        Tire ou envie uma foto — a <span className="font-medium text-violet-600">IA preencherá os campos automaticamente</span>.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500">Adicione uma foto para identificar visualmente o produto no almoxarifado.</p>
                    )}
                    {analisandoFotoIA && (
                      <div className="flex items-center gap-1.5 text-xs text-violet-600 font-medium">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando com IA…
                      </div>
                    )}
                    {camposPreenchidosIA && !analisandoFotoIA && (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                        <Sparkles className="h-3.5 w-3.5" /> Campos preenchidos pela IA — revise antes de salvar
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                    <button type="button" onClick={() => fotoInputRef.current?.click()} className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg bg-white text-gray-600 hover:bg-gray-50 transition">
                      {formItem.fotoUrl ? "Trocar foto" : "Escolher imagem"}
                    </button>
                    {formItem.fotoUrl && (
                      <button type="button" onClick={() => { setFormItem(p => ({ ...p, fotoUrl: "" })); setCamposPreenchidosIA(false); }} className="text-xs text-red-500 hover:text-red-700">
                        Remover
                      </button>
                    )}
                    </div>
                    <p className="text-[11px] text-gray-400">JPG, PNG ou WEBP • Max. comprimido automaticamente</p>
                  </div>
                </div>
                <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
              </div>

              {/* Nome */}
              <div>
                <label className="text-xs font-medium text-gray-700">Nome do Item *</label>
                <input
                  className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                  placeholder="Ex: Cimento CP-II 50kg"
                  value={formItem.nome} onChange={e => setFormItem(p => ({ ...p, nome: e.target.value }))}
                />
              </div>

              {/* Unidade + Categoria */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-700">Unidade</label>
                    <button
                      type="button"
                      onClick={() => setModalUnidades(true)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 underline"
                    >
                      Gerenciar
                    </button>
                  </div>
                  <select
                    value={formItem.unidade}
                    onChange={e => setFormItem(p => ({ ...p, unidade: e.target.value }))}
                    className="w-full h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white outline-none focus:border-emerald-400 text-gray-900"
                  >
                    {unidades.map(u => (
                      <option key={u.id} value={u.sigla}>
                        {u.sigla}{u.descricao ? ` — ${u.descricao}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Categoria</label>
                  <select
                    className="mt-1 w-full h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white outline-none focus:border-emerald-400 text-gray-900"
                    value={formItem.categoria} onChange={e => setFormItem(p => ({ ...p, categoria: e.target.value }))}
                  >
                    <option value="">— Selecionar —</option>
                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">Qtd. Mínima (alerta)</label>
                <input
                  type="text" inputMode="decimal"
                  className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                  value={formItem.quantidadeMinima === 0 ? "" : formItem.quantidadeMinima}
                  placeholder="0"
                  onChange={e => setFormItem(p => ({ ...p, quantidadeMinima: parseFloat(e.target.value.replace(",", ".")) || 0 }))}
                />
              </div>

              {/* Qtd Inicial (só no novo) */}
              {!editandoId && (
                <div>
                  <label className="text-xs font-medium text-gray-700">Quantidade Inicial em Estoque</label>
                  <input
                    type="text" inputMode="decimal"
                    className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                    value={formItem.quantidadeAtual === 0 ? "" : formItem.quantidadeAtual}
                    placeholder="0"
                    onChange={e => setFormItem(p => ({ ...p, quantidadeAtual: parseFloat(e.target.value.replace(",", ".")) || 0 }))}
                  />
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="text-xs font-medium text-gray-700">Observações</label>
                <textarea
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 resize-none"
                  rows={2} value={formItem.observacoes}
                  onChange={e => setFormItem(p => ({ ...p, observacoes: e.target.value }))}
                />
              </div>

              {/* Origem (Próprio / Alugado) */}
              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 mb-2 block">Origem do Equipamento</label>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setFormItem(p => ({ ...p, origem: "proprio" }))}
                      className={`flex-1 h-9 text-sm rounded-lg border font-medium transition ${formItem.origem === "proprio" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      🏢 Próprio da Empresa
                    </button>
                    <button type="button"
                      onClick={() => setFormItem(p => ({ ...p, origem: "alugado" }))}
                      className={`flex-1 h-9 text-sm rounded-lg border font-medium transition ${formItem.origem === "alugado" ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                      🔑 Alugado / Locado
                    </button>
                  </div>
                </div>
                {formItem.origem === "alugado" && (
                  <div className="space-y-3 pt-2 border-t border-amber-100">
                    <div>
                      <label className="text-xs font-medium text-gray-700">Fornecedor / Locadora</label>
                      <input type="text" placeholder="Ex: Locamig Equipamentos"
                        className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-amber-400"
                        value={formItem.fornecedorLocacao}
                        onChange={e => setFormItem(p => ({ ...p, fornecedorLocacao: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-700">Início da Locação</label>
                        <input type="date"
                          className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-amber-400"
                          value={formItem.dataInicioLocacao}
                          onChange={e => setFormItem(p => ({ ...p, dataInicioLocacao: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-amber-700 font-semibold">⚠ Vencimento</label>
                        <input type="date"
                          className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-amber-300 bg-amber-50 text-gray-900 outline-none focus:border-amber-500"
                          value={formItem.dataVencimentoLocacao}
                          onChange={e => setFormItem(p => ({ ...p, dataVencimentoLocacao: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Valor Mensal da Locação (R$)</label>
                      <input type="text" inputMode="decimal" placeholder="0,00"
                        className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-amber-400"
                        value={formItem.valorLocacaoMensal === 0 ? "" : formItem.valorLocacaoMensal}
                        onChange={e => setFormItem(p => ({ ...p, valorLocacaoMensal: parseFloat(e.target.value.replace(",", ".")) || 0 }))} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Observações da Locação</label>
                      <textarea rows={2} placeholder="Nº do contrato, condições, etc."
                        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400 resize-none"
                        value={formItem.observacoesLocacao}
                        onChange={e => setFormItem(p => ({ ...p, observacoesLocacao: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalItem(false)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Cancelar</button>
                <button onClick={salvarItem} disabled={criarMut.isPending || atualizarMut.isPending} className="flex-1 h-9 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {(criarMut.isPending || atualizarMut.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editandoId ? "Salvar Alterações" : "Criar Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Movimentação ──────────────────────────────────────── */}
      {modalMov && movItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalMov(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                {formMov.tipo === "entrada"
                  ? <><ArrowDownCircle className="h-5 w-5 text-emerald-600" />Entrada de Material</>
                  : <><ArrowUpCircle className="h-5 w-5 text-orange-600" />Saída de Material</>}
              </h2>
              <button onClick={() => setModalMov(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Item info */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                {(movItem as any).fotoUrl ? (
                  <img src={(movItem as any).fotoUrl} alt={movItem.nome} className="w-12 h-12 rounded-lg object-cover border border-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><Package className="h-6 w-6 text-gray-300" /></div>
                )}
                <div>
                  <p className="font-medium text-gray-800 text-sm">{movItem.nome}</p>
                  <p className="text-xs text-gray-500">Saldo atual: <strong>{n(movItem.quantidadeAtual) % 1 === 0 ? n(movItem.quantidadeAtual).toFixed(0) : n(movItem.quantidadeAtual).toFixed(2)}</strong> {movItem.unidade}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">Quantidade ({movItem.unidade}) *</label>
                <input
                  type="number" min={0.001} step={0.001}
                  className="mt-1 w-full h-10 px-3 text-lg font-semibold rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                  value={formMov.quantidade || ""}
                  onChange={e => setFormMov(p => ({ ...p, quantidade: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              {formMov.tipo === "saida" && (
                <div>
                  <label className="text-xs font-medium text-gray-700">Obra de destino *</label>
                  <select
                    className="mt-1 w-full h-9 px-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                    value={formMov.obraId}
                    onChange={e => setFormMov(p => ({ ...p, obraId: Number(e.target.value) }))}
                  >
                    <option value={0}>— selecione a obra —</option>
                    {obrasAtivas.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-700">Motivo</label>
                <input className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400" placeholder="Ex: Compra, Devolução, Ajuste..." value={formMov.motivo} onChange={e => setFormMov(p => ({ ...p, motivo: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Observações</label>
                <textarea className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 resize-none" rows={2} value={formMov.observacoes} onChange={e => setFormMov(p => ({ ...p, observacoes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalMov(false)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Cancelar</button>
                <button
                  onClick={salvarMovimento}
                  disabled={movMut.isPending || formMov.quantidade <= 0}
                  className={`flex-1 h-9 text-sm rounded-lg text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2 ${formMov.tipo === "entrada" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"}`}
                >
                  {movMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrar {formMov.tipo === "entrada" ? "Entrada" : "Saída"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Histórico ─────────────────────────────────────────── */}
      {modalHist && histItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalHist(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <History className="h-5 w-5" /> Histórico — {histItem.nome}
              </h2>
              <button onClick={() => setModalHist(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {loadHist ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
              ) : movimentos.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">Nenhuma movimentação registrada.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Data", "Tipo", "Qtd.", "Obra", "Motivo", "Usuário"].map(h => (
                        <th key={h} className="text-left py-2.5 px-3 text-xs text-gray-500 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map(m => (
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-3 text-xs text-gray-500 whitespace-nowrap">
                          {m.criadoEm ? new Date(m.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            m.tipo === "entrada" ? "bg-emerald-50 text-emerald-700" :
                            m.tipo === "saida"   ? "bg-orange-50 text-orange-700" :
                            "bg-gray-50 text-gray-600"}`}>
                            {m.tipo === "entrada" ? "↓ Entrada" : m.tipo === "saida" ? "↑ Saída" : "≈ Ajuste"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm font-semibold">
                          {m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "-" : ""}
                          {n(m.quantidade) % 1 === 0 ? n(m.quantidade).toFixed(0) : n(m.quantidade).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{m.obraNome || "—"}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{m.motivo || "—"}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-500">{m.usuarioNome || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ENTRADA RÁPIDA ══════════════════════════════════════ */}
      {modalEntrada && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#ffffff", color: "#111827" }}>
            {entradaOk === true ? (
              <div className="p-8 text-center space-y-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <p className="text-xl font-bold text-emerald-700">Entrada registrada!</p>
                <button className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl text-lg" onClick={() => { setModalEntrada(false); resetEntrada(); }}>Fechar</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 border-b">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ArrowDownCircle className="w-5 h-5 text-emerald-500" /> Registrar Entrada</h2>
                  <button onClick={() => setModalEntrada(false)}><X className="w-6 h-6 text-gray-400" /></button>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Selecionar Item *</label>
                    <select className="w-full border-2 rounded-xl p-3 text-base" value={entradaItemId} onChange={e => setEntradaItemId(Number(e.target.value))}>
                      <option value={0}>— escolha o item —</option>
                      {itens.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Quantidade *</label>
                    <input type="number" inputMode="decimal" className="w-full border-2 rounded-xl p-4 text-2xl font-bold text-center" placeholder="0" value={entradaQtd} onChange={e => setEntradaQtd(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Nota Fiscal / Motivo</label>
                    <input type="text" className="w-full border rounded-xl p-3 text-base" placeholder="Ex: NF 12345" value={entradaMotivo} onChange={e => setEntradaMotivo(e.target.value)} />
                  </div>
                  <button
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition"
                    disabled={!entradaItemId || !entradaQtd || registerEntry.isPending}
                    onClick={() => registerEntry.mutate({ companyId, itemId: entradaItemId, quantidade: parseFloat(entradaQtd), notaFiscal: entradaMotivo || undefined })}
                  >
                    {registerEntry.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "✅ CONFIRMAR ENTRADA"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL SAÍDA RÁPIDA ════════════════════════════════════════ */}
      {modalSaida && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#ffffff", color: "#111827" }}>
            {saidaOk === true ? (
              <div className="p-8 text-center space-y-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <p className="text-xl font-bold text-emerald-700">Saída registrada!</p>
                <button className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl text-lg" onClick={() => { setModalSaida(false); resetSaida(); }}>Fechar</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 border-b">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ArrowUpCircle className="w-5 h-5 text-red-500" /> Registrar Saída</h2>
                  <button onClick={() => setModalSaida(false)}><X className="w-6 h-6 text-gray-400" /></button>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Selecionar Item *</label>
                    <select className="w-full border-2 rounded-xl p-3 text-base" value={saidaItemId} onChange={e => setSaidaItemId(Number(e.target.value))}>
                      <option value={0}>— escolha o item —</option>
                      {itens.map(i => <option key={i.id} value={i.id}>{i.nome} — Estoque: {n(i.quantidadeAtual)} {i.unidade}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Quantidade *</label>
                    <input type="number" inputMode="decimal" className="w-full border-2 rounded-xl p-4 text-2xl font-bold text-center" placeholder="0" value={saidaQtd} onChange={e => setSaidaQtd(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Obra de destino *</label>
                    <select
                      className="w-full border-2 rounded-xl p-3 text-base"
                      value={saidaObraId}
                      onChange={e => setSaidaObraId(Number(e.target.value))}
                    >
                      <option value={0}>— selecione a obra —</option>
                      {obrasAtivas.map((o: any) => (
                        <option key={o.id} value={o.id}>
                          {o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition"
                    disabled={!saidaItemId || !saidaQtd || !saidaObraId || registerExit.isPending}
                    onClick={() => {
                      const obraSel = obrasAtivas.find((o: any) => o.id === saidaObraId);
                      registerExit.mutate({ companyId, itemId: saidaItemId, quantidade: parseFloat(saidaQtd), obraId: saidaObraId || undefined, obraNome: obraSel ? (obraSel.codigo ? `${obraSel.codigo} – ${obraSel.nome}` : obraSel.nome) : undefined });
                    }}
                  >
                    {registerExit.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "✅ CONFIRMAR SAÍDA"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL EMPRÉSTIMO ══════════════════════════════════════════ */}
      {modalEmprestimo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#ffffff", color: "#111827" }}>
            {empOk ? (
              <div className="p-8 text-center space-y-4">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                <p className="text-xl font-bold text-emerald-700">Empréstimo registrado!</p>
                <p className="text-gray-600">{empOk.nome}</p>
                <button className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl text-lg" onClick={() => { setModalEmprestimo(false); resetEmprestimo(); }}>Fechar</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 border-b">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Wrench className="w-5 h-5 text-blue-500" /> Emprestar Ferramenta</h2>
                  <button onClick={() => setModalEmprestimo(false)}><X className="w-6 h-6 text-gray-400" /></button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="relative">
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Funcionário *</label>
                    <input
                      type="text"
                      className="w-full border-2 rounded-xl p-3 text-base"
                      placeholder="Digite o código (JFC199) ou nome do funcionário..."
                      value={empSearch}
                      autoComplete="off"
                      onChange={e => {
                        setEmpSearch(e.target.value);
                        setEmpSelecionado(null);
                        setEmpCodigo("");
                        setEmpShowSug(true);
                      }}
                      onFocus={() => setEmpShowSug(true)}
                      onBlur={() => setTimeout(() => setEmpShowSug(false), 180)}
                    />
                    {/* Lista de sugestões */}
                    {empShowSug && empSugestoes.length > 0 && !empSelecionado && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {empSugestoes.map((f: any) => (
                          <button
                            key={f.id}
                            type="button"
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-50 text-left transition"
                            onMouseDown={() => selecionarFuncionario(f)}
                          >
                            {f.fotoUrl
                              ? <img src={f.fotoUrl} alt={f.nomeCompleto} className="w-9 h-9 rounded-full object-cover border border-gray-200 flex-shrink-0" />
                              : <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0"><User className="w-5 h-5 text-blue-500" /></div>
                            }
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{f.nomeCompleto}</p>
                              <p className="text-xs text-gray-500">{f.codigoInterno}{f.cargo ? ` — ${f.cargo}` : f.funcao ? ` — ${f.funcao}` : ""}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Card do funcionário selecionado */}
                    {empSelecionado && (
                      <div className="mt-3 bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex flex-col items-center gap-2 relative">
                        <button
                          type="button"
                          onClick={() => { setEmpSelecionado(null); setEmpSearch(""); setEmpCodigo(""); }}
                          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {empSelecionado.fotoUrl
                          ? <img src={empSelecionado.fotoUrl} alt={empSelecionado.nomeCompleto} className="w-28 h-28 rounded-full object-cover border-4 border-emerald-400 shadow-md" />
                          : <div className="w-28 h-28 rounded-full bg-emerald-100 border-4 border-emerald-300 flex items-center justify-center shadow-md"><User className="w-14 h-14 text-emerald-400" /></div>
                        }
                        <p className="font-bold text-emerald-800 text-center text-base leading-tight">{empSelecionado.nomeCompleto}</p>
                        <p className="text-sm text-emerald-600 text-center">{empSelecionado.codigoInterno}{empSelecionado.cargo ? ` — ${empSelecionado.cargo}` : empSelecionado.funcao ? ` — ${empSelecionado.funcao}` : ""}</p>
                      </div>
                    )}
                    {empSearch.length >= 2 && !empSelecionado && empSugestoes.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">Nenhum funcionário encontrado</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Selecionar Ferramenta *</label>
                    <select className="w-full border-2 rounded-xl p-3 text-base" value={empItemId} onChange={e => setEmpItemId(Number(e.target.value))}>
                      <option value={0}>— escolha o item —</option>
                      {itens.map(i => <option key={i.id} value={i.id}>{i.nome} — Estoque: {n(i.quantidadeAtual)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Quantidade</label>
                    <input type="number" inputMode="numeric" className="w-full border-2 rounded-xl p-4 text-xl font-bold text-center" value={empQtd} onChange={e => setEmpQtd(e.target.value)} />
                  </div>
                  {empErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{empErr}</p>}
                  <button
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition"
                    disabled={!empSelecionado || !empItemId || !empQtd || registerLoan.isPending}
                    onClick={() => registerLoan.mutate({ companyId, itemId: empItemId, quantidade: parseFloat(empQtd), funcionarioCodigo: empSelecionado?.codigoInterno || empCodigo })}
                  >
                    {registerLoan.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "🔧 CONFIRMAR EMPRÉSTIMO"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL FECHAR DIA ════════════════════════════════════════ */}
      {modalFecharDia && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ background: "#ffffff", color: "#111827" }}>
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-gray-700" /> Fechar Dia — Devoluções</h2>
            <button onClick={() => setModalFecharDia(false)}><X className="w-7 h-7 text-gray-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {emprestimosHoje.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-3" />
                <p className="text-lg font-semibold text-gray-700">Nenhum empréstimo hoje!</p>
                <p className="text-sm text-gray-500 mt-1">Todos os itens foram devolvidos.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">{emprestimosHoje.filter(e => e.status === "emprestado").length} item(s) pendente(s) de devolução</p>
                {emprestimosHoje.map(loan => (
                  <div key={loan.id} className="bg-white border-2 rounded-xl p-4 space-y-2" style={{ borderColor: loan.status === "devolvido" ? "#86efac" : "#fca5a5" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-base">{loan.itemNome}</p>
                        <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3" /> {loan.funcionarioNome}
                        </p>
                        <p className="text-xs text-gray-400">{loan.horaEmprestimo} — Qtd: {n(loan.quantidade)}</p>
                      </div>
                      {loan.status === "devolvido" ? (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full flex-shrink-0">✅ Devolvido</span>
                      ) : (
                        <button
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl text-sm flex-shrink-0 active:scale-95 transition disabled:opacity-50"
                          disabled={returnLoan.isPending}
                          onClick={() => returnLoan.mutate({ loanId: loan.id })}
                        >
                          Devolver
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          <div className="p-4 border-t">
            <button className="w-full bg-gray-800 text-white font-bold py-4 rounded-xl text-lg" onClick={() => setModalFecharDia(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL GERENCIAR UNIDADES ──────────────────────────── */}
      {modalUnidades && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalUnidades(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4" style={{ background: '#ffffff', color: '#111827' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Unidades de Medida</h2>
              <button onClick={() => setModalUnidades(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            {/* Lista de unidades */}
            <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
              {unidades.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhuma unidade cadastrada</p>
              ) : (
                unidades.map(u => (
                  <div key={u.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 group">
                    <div>
                      <span className="font-semibold text-sm text-gray-900">{u.sigla}</span>
                      {u.descricao && <span className="text-xs text-gray-400 ml-2">{u.descricao}</span>}
                    </div>
                    <button
                      className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition p-1"
                      onClick={() => {
                        if (window.confirm(`Excluir a unidade "${u.sigla}"?`)) {
                          excluirUnidadeMut.mutate({ id: u.id, companyId });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Adicionar nova unidade */}
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nova Unidade</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Sigla *</label>
                  <input
                    className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                    placeholder="ex: m², t, vb"
                    value={novaUnidadeSigla}
                    onChange={e => setNovaUnidadeSigla(e.target.value)}
                    maxLength={20}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Descrição</label>
                  <input
                    className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                    placeholder="Metro quadrado"
                    value={novaUnidadeDesc}
                    onChange={e => setNovaUnidadeDesc(e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>
              <button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm py-2.5 rounded-xl disabled:opacity-50 transition"
                disabled={!novaUnidadeSigla.trim() || criarUnidadeMut.isPending}
                onClick={() => criarUnidadeMut.mutate({ companyId, sigla: novaUnidadeSigla, descricao: novaUnidadeDesc || undefined })}
              >
                {criarUnidadeMut.isPending ? "Salvando..." : "Adicionar Unidade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL BUSCA POR FOTO IA ══════════════════════════════════ */}
      {modalFotoIA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ background: "#ffffff", color: "#111827" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-violet-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500" />
                <h2 className="text-base font-bold text-gray-900">Identificação por Foto — IA</h2>
              </div>
              <button onClick={() => setModalFotoIA(false)}><X className="w-5 h-5 text-gray-400 hover:text-gray-700" /></button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Preview da foto */}
              {fotoIAPreview && (
                <div className="flex justify-center">
                  <img src={fotoIAPreview} alt="Foto enviada" className="max-h-52 rounded-xl object-contain border border-gray-100 shadow" />
                </div>
              )}

              {/* Processando */}
              {identificarPorFoto.isPending && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="relative">
                    <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
                    <Sparkles className="w-4 h-4 text-violet-400 absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <p className="text-sm text-gray-500 text-center">Analisando a foto com IA...<br /><span className="text-xs text-gray-400">Gemini Vision está identificando o item</span></p>
                </div>
              )}

              {/* Descrição da IA */}
              {fotoIADescricao && !identificarPorFoto.isPending && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> IA identificou:</p>
                  <p className="text-sm text-gray-700">{fotoIADescricao}</p>
                </div>
              )}

              {/* Matches */}
              {fotoIAMatches.length > 0 && !identificarPorFoto.isPending && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Itens do catálogo correspondentes</p>
                  {fotoIAMatches.map((m, idx) => (
                    <button
                      key={m.id}
                      onClick={() => selecionarItemIA(m.id)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-xl border hover:border-violet-400 hover:bg-violet-50 transition group"
                    >
                      {/* Ranking badge */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${idx === 0 ? "bg-violet-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                        #{idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate group-hover:text-violet-700">{m.nome}</p>
                        <p className="text-xs text-gray-500 truncate">{m.motivo}</p>
                      </div>
                      {/* Barra de similaridade */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-xs font-bold text-violet-600">{m.similaridade}%</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${m.similaridade}%` }} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Nenhum match */}
              {!identificarPorFoto.isPending && fotoIADescricao && fotoIAMatches.length === 0 && (
                <div className="text-center py-4 space-y-2">
                  <ImageOff className="w-10 h-10 text-gray-300 mx-auto" />
                  <p className="text-sm text-gray-500">Nenhum item do catálogo foi identificado.<br /><span className="text-xs text-gray-400">Tente uma foto mais próxima ou com melhor iluminação.</span></p>
                </div>
              )}

              {/* Botão tirar outra foto */}
              {!identificarPorFoto.isPending && (
                <button
                  onClick={() => fotoIAInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-violet-200 rounded-xl text-sm text-violet-500 hover:border-violet-400 hover:bg-violet-50 transition"
                >
                  <Camera className="w-4 h-4" /> Tirar outra foto
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL REGISTROS ════════════════════════════════════════ */}
      {modalRegistros && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ background: "#ffffff", color: "#111827" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
            <h2 className="text-base font-bold text-gray-900">Registros do Almoxarifado</h2>
            <button onClick={() => setModalRegistros(false)}><X className="w-6 h-6 text-gray-400" /></button>
          </div>
          {/* Abas */}
          <div className="flex border-b bg-white overflow-x-auto">
            {([
              { key: "entradas",    label: "↓ Entradas",    cls: "text-emerald-700 border-emerald-500" },
              { key: "saidas",      label: "↑ Saídas",      cls: "text-orange-700 border-orange-500" },
              { key: "emprestados", label: "🔧 Emprestados", cls: "text-blue-700 border-blue-500" },
              { key: "cadastros",   label: "📦 Cadastros",   cls: "text-gray-700 border-gray-500" },
            ] as const).map(({ key, label, cls }) => (
              <button
                key={key}
                onClick={() => setAbaRegistros(key)}
                className={`px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition ${abaRegistros === key ? cls + " border-b-2" : "text-gray-400 border-transparent hover:text-gray-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto p-4">

            {/* ENTRADAS */}
            {abaRegistros === "entradas" && (
              loadingEntradas ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div> :
              movEntradas.length === 0 ? <p className="text-center text-gray-400 py-12">Nenhuma entrada registrada.</p> :
              <div className="space-y-2">
                {movEntradas.map((m: any) => (
                  <div key={m.id} className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="mt-0.5 text-emerald-600 font-bold text-lg">↓</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{m.itemNome ?? "—"}</p>
                      <p className="text-xs text-gray-500">
                        +{n(m.quantidade)} {m.unidade ?? "un"}
                        {m.motivo ? ` · ${m.motivo}` : ""}
                        {m.usuarioNome ? ` · ${m.usuarioNome}` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400">{m.criadoEm ? new Date(m.criadoEm).toLocaleString("pt-BR") : "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SAÍDAS */}
            {abaRegistros === "saidas" && (
              loadingSaidas ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div> :
              movSaidas.length === 0 ? <p className="text-center text-gray-400 py-12">Nenhuma saída registrada.</p> :
              <div className="space-y-2">
                {movSaidas.map((m: any) => (
                  <div key={m.id} className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="mt-0.5 text-orange-600 font-bold text-lg">↑</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{m.itemNome ?? "—"}</p>
                      <p className="text-xs text-gray-500">
                        -{n(m.quantidade)} {m.unidade ?? "un"}
                        {m.obraNome ? ` · ${m.obraNome}` : ""}
                        {m.usuarioNome ? ` · ${m.usuarioNome}` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400">{m.criadoEm ? new Date(m.criadoEm).toLocaleString("pt-BR") : "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* EMPRESTADOS */}
            {abaRegistros === "emprestados" && (
              loadingLoans ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div> :
              loansAbertos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  <p className="text-gray-500 font-medium">Nenhuma ferramenta emprestada em aberto</p>
                </div>
              ) :
              <div className="space-y-2">
                {loansAbertos.map((l: any) => (
                  <div key={l.id} className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <Wrench className="w-5 h-5 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{l.itemNome}</p>
                      <p className="text-xs text-gray-600">
                        {n(l.quantidade)} un · <span className="font-medium">{l.funcionarioNome}</span>
                        {l.funcionarioCodigo ? ` (${l.funcionarioCodigo})` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400">Emprestado em {l.dataEmprestimo}{l.horaEmprestimo ? ` às ${l.horaEmprestimo}` : ""}</p>
                    </div>
                    <button
                      onClick={() => returnLoan.mutate({ loanId: l.id })}
                      disabled={returnLoan.isPending}
                      className="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 font-semibold transition disabled:opacity-60"
                    >
                      Devolver
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* CADASTROS */}
            {abaRegistros === "cadastros" && (
              itens.length === 0 ? <p className="text-center text-gray-400 py-12">Nenhum item cadastrado.</p> :
              <div className="space-y-2">
                {itens.map((item: any) => (
                  <div key={item.id} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    {item.fotoUrl
                      ? <img src={item.fotoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center shrink-0"><Package className="w-5 h-5 text-gray-400" /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.nome}</p>
                      <p className="text-xs text-gray-500">{item.categoria ?? "Sem categoria"} · {item.unidade}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{n(item.quantidadeAtual)}</p>
                      <p className="text-[11px] text-gray-400">{item.unidade}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Modal Devolução de Locação ─────────────────────────────── */}
      {modalDevolverLocacao && itemDevolverLocacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalDevolverLocacao(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-amber-500" /> Devolver Equipamento Locado
              </h2>
              <button onClick={() => setModalDevolverLocacao(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-800">{itemDevolverLocacao.nome}</p>
                {itemDevolverLocacao.fornecedorLocacao && (
                  <p className="text-xs text-amber-600 mt-0.5">Fornecedor: {itemDevolverLocacao.fornecedorLocacao}</p>
                )}
                {itemDevolverLocacao.dataVencimentoLocacao && (
                  <p className="text-xs text-amber-600">Vencimento: {new Date(itemDevolverLocacao.dataVencimentoLocacao + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                )}
              </div>
              <p className="text-sm text-gray-600">
                Ao confirmar, o equipamento será marcado como devolvido ao fornecedor e o item será <strong>desativado</strong> do almoxarifado.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-700">Observação (opcional)</label>
                <textarea rows={2} placeholder="Ex: Devolvido conforme contrato, sem avarias"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400 resize-none"
                  value={obsDevolucaoLocacao}
                  onChange={e => setObsDevolucaoLocacao(e.target.value)} />
              </div>
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalDevolverLocacao(false)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Cancelar</button>
                <button
                  onClick={() => devolverLocacaoMut.mutate({ id: itemDevolverLocacao.id, observacao: obsDevolucaoLocacao || undefined })}
                  disabled={devolverLocacaoMut.isPending}
                  className="flex-1 h-9 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {devolverLocacaoMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar Devolução
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
