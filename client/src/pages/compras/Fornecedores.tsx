import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { upperCaseEmpresa } from "@shared/normalizeNomeEmpresa";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DialogFooter } from "@/components/ui/dialog";
import { Copy } from "lucide-react";
import {
  Search, Plus, Pencil, Building2, Phone, Mail, MapPin,
  CheckCircle2, XCircle, AlertTriangle, Loader2, X, ChevronDown, ChevronUp, Users,
  Star, Trophy, Medal, ShieldCheck, ShieldAlert, TrendingUp, Package, Clock, BarChart3, Truck,
  CreditCard, FileText, Tag, MessageSquare, Landmark, Hash, KeyRound,
  Eye, ShieldQuestion, Wrench, Trash2,
} from "lucide-react";
import { useLocation } from "wouter";
import FornecedorFormModal from "@/components/FornecedorFormModal";

function StarRating({ value, onChange, size = 18 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={`transition-colors cursor-${onChange ? 'pointer' : 'default'} ${
            i <= (hover || value) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'
          }`}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange && onChange(i)}
        />
      ))}
    </div>
  );
}

function ScoreStars({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => {
        const filled = score >= i;
        const half = !filled && score >= i - 0.5;
        return (
          <Star
            key={i}
            style={{ width: size, height: size }}
            className={`${filled ? 'text-amber-400 fill-amber-400' : half ? 'text-amber-400 fill-amber-200' : 'text-slate-200 fill-slate-200'}`}
          />
        );
      })}
    </div>
  );
}

function DesempenhoFornecedor({ fornecedorId, companyId }: { fornecedorId: number; companyId: number }) {
  const { data: score, isLoading } = trpc.compras.scoreFornecedor.useQuery(
    { fornecedorId, companyId },
    { enabled: fornecedorId > 0 && companyId > 0 }
  );

  if (isLoading) return <div className="flex items-center gap-2 py-3"><Loader2 className="h-4 w-4 animate-spin text-blue-400" /><span className="text-xs text-slate-400">Calculando desempenho...</span></div>;
  if (!score) return <p className="text-xs text-slate-400 py-2">Sem dados de desempenho</p>;

  const isRecomendado = score.score >= 4.0 && score.totalOCs >= 1;
  const isAtencao = score.score > 0 && score.score < 2.5 && score.totalOCs >= 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <ScoreStars score={score.score} size={16} />
          <span className="text-sm font-bold text-slate-800">{score.score}/5</span>
        </div>
        {isRecomendado && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
            <ShieldCheck className="h-3 w-3" />Recomendado
          </span>
        )}
        {isAtencao && (
          <span className="flex items-center gap-1 text-[10px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
            <ShieldAlert className="h-3 w-3" />Atenção
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="h-3 w-3 text-blue-500" />
            <span className="text-[10px] text-slate-400 uppercase font-medium">OCs Atendidas</span>
          </div>
          <p className="text-lg font-bold text-slate-800">{score.totalOCs}</p>
          <p className="text-[10px] text-slate-400">
            {score.totalValorOCs > 0 && `Total: ${score.totalValorOCs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] text-slate-400 uppercase font-medium">Pontualidade</span>
          </div>
          <p className={`text-lg font-bold ${score.taxaPontualidade >= 80 ? "text-emerald-600" : score.taxaPontualidade >= 50 ? "text-amber-600" : "text-red-600"}`}>
            {score.taxaPontualidade}%
          </p>
          <p className="text-[10px] text-slate-400">
            {score.ocsPontuais}/{score.ocsComData} no prazo
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3 w-3 text-purple-500" />
            <span className="text-[10px] text-slate-400 uppercase font-medium">Competitividade</span>
          </div>
          <p className={`text-lg font-bold ${score.taxaCompetitividade >= 50 ? "text-emerald-600" : "text-amber-600"}`}>
            {score.taxaCompetitividade}%
          </p>
          <p className="text-[10px] text-slate-400">
            {score.cotacoesParticipadas} cotações · {score.cotacoesVencidas} vencida{score.cotacoesVencidas !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Truck className="h-3 w-3 text-cyan-500" />
            <span className="text-[10px] text-slate-400 uppercase font-medium">Prazo Entrega</span>
          </div>
          <p className={`text-lg font-bold ${score.taxaPrazoEntrega >= 50 ? "text-emerald-600" : "text-amber-600"}`}>
            {score.taxaPrazoEntrega}%
          </p>
          <p className="text-[10px] text-slate-400">
            melhor prazo oferecido
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Star className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] text-slate-400 uppercase font-medium">Avaliações</span>
          </div>
          <p className="text-lg font-bold text-slate-800">
            {score.mediaAvaliacoes !== null ? score.mediaAvaliacoes : "—"}
          </p>
          <p className="text-[10px] text-slate-400">
            {score.totalAvaliacoes} avaliação{score.totalAvaliacoes !== 1 ? "ões" : ""}
          </p>
        </div>
      </div>

      {score.totalDivergencias > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {score.totalDivergencias} recebimento{score.totalDivergencias !== 1 ? "s" : ""} com divergência · {score.taxaSemDivergencia}% sem problemas ({score.totalRecebimentos} recebimento{score.totalRecebimentos !== 1 ? "s" : ""})
        </div>
      )}

      {score.ultimasAvaliacoes && score.ultimasAvaliacoes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-400 uppercase font-medium tracking-wide">Últimas Avaliações</p>
          <div className="space-y-1.5">
            {score.ultimasAvaliacoes.map((av: { nota: number; comentario: string | null; criadoEm: string }, idx: number) => (
              <div key={idx} className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className={`h-3 w-3 ${i <= av.nota ? "text-amber-400 fill-amber-400" : "text-slate-200"}`} />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  {av.comentario && <p className="text-xs text-slate-600 leading-relaxed">{av.comentario}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(av.criadoEm).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const CATEGORIAS_PADRAO = [
  "Cimento e Argamassa", "Aço e Ferro", "Madeira e Compensado", "Elétrico",
  "Hidráulico", "Pintura", "Ferragens", "Locação de Equipamentos",
  "Mão de Obra", "Concreto e Blocos", "Impermeabilização", "EPI e Segurança", "Outros",
];

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function situacaoBadge(s?: string | null) {
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper.includes("ATIVA")) return <Badge className="bg-emerald-100 text-emerald-700 border-0">ATIVA</Badge>;
  if (upper.includes("SUSPENSA")) return <Badge className="bg-yellow-100 text-yellow-700 border-0">SUSPENSA</Badge>;
  if (upper.includes("INAPTA")) return <Badge className="bg-red-100 text-red-700 border-0">INAPTA</Badge>;
  if (upper.includes("BAIXADA")) return <Badge className="bg-slate-100 text-slate-600 border-0">BAIXADA</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

type Socio = { nome: string; qualificacao: string; cpfMascarado: string; dataEntrada: string; faixaEtaria: string; representanteLegal: string };

const EMPTY_FORM = {
  cnpj: "", razaoSocial: "", nomeFantasia: "", situacaoReceita: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
  telefone: "", email: "", contatoNome: "", contatoCelular: "", contatoEmail: "",
  banco: "", agencia: "", conta: "", pix: "", categorias: [] as string[], observacoes: "",
  isPrestadorServico: false, isFornecedor: true,
  naturezaJuridica: "", porte: "", capitalSocial: "", atividadePrincipal: "", atividadesCnae: "",
  dataAbertura: "", regimeTributario: "", inscricaoEstadual: "", inscricaoMunicipal: "",
  representanteLegal: "", representanteCpf: "", representanteCargo: "",
  socios: [] as Socio[],
  // Rev. 3440 — Ciclo de Fechamento
  cicloPagamento: "" as string,
  cicloDiaFechamento: "" as string,
  cicloNumParcelas: "" as string,
  cicloPrazoParcela: "" as string,
  cicloFormaPagamento: "" as string,
  // Rev. 3514 — data de referência para ciclo quinzenal_semana
  cicloDataReferencia: "" as string,
};

export default function Fornecedores() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;
  const [, setLocation] = useLocation();

  const [aba, setAba] = useState<"lista" | "ranking">("lista");
  const [busca, setBusca]       = useState("");
  const [filtroCateg, setFiltroCateg] = useState("todas");
  const [apenasAtivos, setApenasAtivos] = useState(true);
  const [filtroSemCnpj, setFiltroSemCnpj] = useState(false);
  const [filtroSemCategoria, setFiltroSemCategoria] = useState(false);
  const [filtroFichaIncompleta, setFiltroFichaIncompleta] = useState(false);
  const [autoCompletando, setAutoCompletando] = useState(false);
  const [autoCompletarProgresso, setAutoCompletarProgresso] = useState(0);
  const [autoCompletarTotal, setAutoCompletarTotal] = useState(0);

  // Avaliação
  const [modalAvalId, setModalAvalId] = useState<number | null>(null);
  const [modalAvalNome, setModalAvalNome] = useState("");
  const [notaEstrela, setNotaEstrela] = useState(0);
  const [comentarioAval, setComentarioAval] = useState("");
  const [verAvalId, setVerAvalId] = useState<number | null>(null);

  const { data: fornecedores = [], refetch, isLoading } = trpc.compras.listarFornecedores.useQuery(
    { companyId, ativo: apenasAtivos || undefined },
    { enabled: !!companyId }
  );

  const { data: categorias = [] } = trpc.compras.listarCategoriasFornecedores.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const isSemCnpj = (f: any) => !(f.cnpj || "").replace(/\D/g, "");
  const isSemCategoria = (f: any) => !Array.isArray(f.categorias) || f.categorias.length === 0;
  const isFichaIncompleta = (f: any) => !f.cidade || !f.endereco || (!f.telefone && !f.email);

  const lista = useMemo(() => {
    let r = fornecedores;
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(f =>
        f.razaoSocial?.toLowerCase().includes(b) ||
        f.nomeFantasia?.toLowerCase().includes(b) ||
        f.cnpj?.includes(b) ||
        f.cidade?.toLowerCase().includes(b)
      );
    }
    if (filtroCateg !== "todas") {
      r = r.filter(f => Array.isArray(f.categorias) && (f.categorias as string[]).includes(filtroCateg));
    }
    if (filtroSemCnpj) r = r.filter(isSemCnpj);
    if (filtroSemCategoria) r = r.filter(isSemCategoria);
    if (filtroFichaIncompleta) r = r.filter(isFichaIncompleta);
    return r;
  }, [fornecedores, busca, filtroCateg, filtroSemCnpj, filtroSemCategoria, filtroFichaIncompleta]);

  const candidatosAutoCompletarQuery = trpc.compras.autoCompletarCandidatos.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const autoCompletarMut = trpc.compras.autoCompletarFornecedor.useMutation();

  const rodarAutoCompletar = async () => {
    const candidatos = candidatosAutoCompletarQuery.data || [];
    if (candidatos.length === 0) { toast.info("Nenhum fornecedor com CNPJ e ficha incompleta encontrado."); return; }
    setAutoCompletando(true);
    setAutoCompletarTotal(candidatos.length);
    setAutoCompletarProgresso(0);
    let sucesso = 0, semAlteracao = 0, falhas = 0;
    for (let i = 0; i < candidatos.length; i++) {
      try {
        const r = await autoCompletarMut.mutateAsync({ id: candidatos[i].id });
        if (r.skipped) semAlteracao++; else sucesso++;
      } catch {
        falhas++;
      }
      setAutoCompletarProgresso(Math.round(((i + 1) / candidatos.length) * 100));
    }
    await refetch();
    await candidatosAutoCompletarQuery.refetch();
    toast.success(`Concluído! ${sucesso} atualizado(s), ${semAlteracao} sem alteração, ${falhas} falha(s).`);
    setTimeout(() => { setAutoCompletando(false); setAutoCompletarProgresso(0); }, 800);
  };

  // Modal — agora delega ao componente compartilhado <FornecedorFormModal>
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoForn, setEditandoForn] = useState<any | null>(null);
  const [initialForm, setInitialForm] = useState<Partial<typeof EMPTY_FORM> | undefined>(undefined);
  const [detalheId, setDetalheId]     = useState<number | null>(null);

  const [acessoDialogOpen, setAcessoDialogOpen] = useState(false);
  const [acessoFornecedor, setAcessoFornecedor] = useState<any>(null);
  const [acessoResult, setAcessoResult] = useState<{ senhaTemporaria: string; cnpj: string; nomeEmpresa: string } | null>(null);
  const [nomeResp, setNomeResp] = useState("");
  const [emailResp, setEmailResp] = useState("");

  const excluirMut  = trpc.compras.excluirFornecedor.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa terceira desativada."); } });
  const reativarMut = trpc.compras.reativarFornecedor.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa terceira reativada!"); } });
  const deletarMut  = trpc.compras.deletarFornecedor.useMutation({ onSuccess: () => { refetch(); setDeletarConfirmId(null); toast.success("Fornecedor excluído."); }, onError: (e) => { setDeletarConfirmId(null); toast.error(e.message); } });
  const [deletarConfirmId, setDeletarConfirmId] = useState<number | null>(null);

  const avaliarMut  = trpc.compras.avaliarFornecedor.useMutation({
    onSuccess: () => {
      toast.success("Avaliação registrada!");
      setModalAvalId(null);
      setNotaEstrela(0);
      setComentarioAval("");
      refetchRanking();
      if (verAvalId) refetchAvaliacoes();
    },
  });
  const { data: ranking = [], refetch: refetchRanking } = trpc.compras.rankingFornecedores.useQuery(
    { companyId }, { enabled: !!companyId && aba === "ranking" }
  );
  const { data: avaliacoesForn = [], refetch: refetchAvaliacoes } = trpc.compras.listarAvaliacoesFornecedor.useQuery(
    { fornecedorId: verAvalId ?? 0, companyId },
    { enabled: !!verAvalId && !!companyId }
  );

  const gerarAcessoMut = trpc.portalExterno.admin.gerarAcesso.useMutation({
    onSuccess: (data) => setAcessoResult(data),
    onError: (e) => toast.error(e.message),
  });

  function handleGerarAcesso(f: any) {
    setAcessoFornecedor(f);
    setEmailResp(f.contatoEmail || f.email || "");
    setNomeResp(f.contatoNome || "");
    setAcessoResult(null);
    setAcessoDialogOpen(true);
  }

  function confirmarGerarAcesso() {
    if (!acessoFornecedor || !companyId) return;
    const cnpjLimpo = (acessoFornecedor.cnpj || "").replace(/\D/g, "");
    if (!cnpjLimpo) { toast.error("Este fornecedor não possui CNPJ cadastrado. Cadastre antes de gerar acesso."); return; }
    gerarAcessoMut.mutate({ tipo: "terceiro", companyId, cnpj: cnpjLimpo, emailResponsavel: emailResp, nomeResponsavel: nomeResp, nomeEmpresa: acessoFornecedor.razaoSocial });
  }

  function abrirAvaliacao(id: number, nome: string) {
    setModalAvalId(id);
    setModalAvalNome(nome);
    setNotaEstrela(0);
    setComentarioAval("");
  }

  function salvarAvaliacao() {
    if (!notaEstrela) { toast.error("Selecione uma nota de 1 a 5 estrelas."); return; }
    avaliarMut.mutate({
      fornecedorId: modalAvalId!,
      companyId,
      nota: notaEstrela,
      comentario: comentarioAval || undefined,
      criadoPor: user?.id,
    });
  }

  function abrirNovo() {
    setEditandoForn(null);
    setInitialForm(undefined);
    setModalAberto(true);
  }

  function abrirEditar(f: any) {
    setEditandoForn(f);
    setInitialForm(undefined);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditandoForn(null);
    setInitialForm(undefined);
  }

  const editFromUrlRef = useRef(false);
  useEffect(() => {
    if (editFromUrlRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId && fornecedores.length > 0) {
      const f = fornecedores.find((ff: any) => ff.id === parseInt(editId));
      if (f) {
        editFromUrlRef.current = true;
        abrirEditar(f);
        const url = new URL(window.location.href);
        url.searchParams.delete("edit");
        window.history.replaceState({}, "", url.pathname);
      }
    }
  }, [fornecedores]);

  // Rev. 3262 — atalho "Cadastrar" vindo da Folha PJ (?novo=<cnpj> ou ?novo=1):
  // abre o cadastro de nova empresa já marcada como prestador de serviço, com
  // o CNPJ preenchido quando disponível.
  const novoFromUrlRef = useRef(false);
  useEffect(() => {
    if (novoFromUrlRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const novo = params.get("novo");
    if (!novo) return;
    novoFromUrlRef.current = true;
    const cnpjDigits = novo.replace(/\D/g, "");
    setEditandoForn(null);
    setInitialForm({
      cnpj: cnpjDigits.length === 14 ? formatCNPJ(cnpjDigits) : "",
      isPrestadorServico: true,
    });
    setModalAberto(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState({}, "", url.pathname);
  }, []);

  const todasCategorias = useMemo(() => {
    const set = new Set([...CATEGORIAS_PADRAO, ...categorias]);
    return Array.from(set).sort();
  }, [categorias]);

  const detalhe = detalheId !== null ? fornecedores.find(f => f.id === detalheId) : null;

  return (
    <DashboardLayout>
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Empresas Terceiras
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {fornecedores.length} empresa{fornecedores.length !== 1 ? "s" : ""} cadastrada{fornecedores.length !== 1 ? "s" : ""}
            </p>
          </div>
          <DraggableCommandBar barId="fornecedores" items={[
            { id: "auditoria", node: <Button variant="outline" onClick={() => setLocation("/compras/auditoria-fornecedores")}><Wrench className="h-4 w-4 mr-2 text-amber-500" /> Auditoria</Button> },
            { id: "novo", node: <Button onClick={abrirNovo} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-4 w-4 mr-2" /> Nova Empresa Terceira</Button> },
          ]} />
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto mt-3 flex gap-1">
          {([["lista", "Lista de Empresas Terceiras", Building2], ["ranking", "Ranking de Avaliações", Trophy]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setAba(id as any)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                aba === id ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">

        {/* ═══ ABA: RANKING ═══ */}
        {aba === "ranking" && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-800">Ranking de Melhores Empresas Terceiras</h2>
              <span className="text-xs text-slate-400">por média de estrelas</span>
            </div>
            {ranking.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
                <Star className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Nenhuma avaliação registrada ainda</p>
                <p className="text-sm text-slate-400 mt-1">Avalie fornecedores na aba "Lista" clicando no botão de estrela</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {ranking.map((f: any, i: number) => {
                  const medalIcons = ["🥇", "🥈", "🥉"];
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-4">
                      <div className="text-2xl w-8 text-center shrink-0">{medalIcons[i] ?? `#${i + 1}`}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800">{f.nomeFantasia || f.razaoSocial}</p>
                        {f.nomeFantasia && f.nomeFantasia !== f.razaoSocial && <p className="text-xs text-slate-500">{f.razaoSocial}</p>}
                        {f.cidade && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{f.cidade}/{f.estado}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <StarRating value={Math.round(f.mediaEstrelas)} size={16} />
                        <p className="text-xs text-slate-500 mt-1">
                          <span className="font-bold text-slate-700">{Number(f.mediaEstrelas).toFixed(1)}</span>
                          {" "}/ 5 · {f.totalAvaliacoes} avaliação{f.totalAvaliacoes !== 1 ? "ões" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ ABA: LISTA ═══ */}
        {aba === "lista" && (<>
        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, CNPJ ou cidade..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <select
            value={filtroCateg}
            onChange={e => setFiltroCateg(e.target.value)}
            className="h-9 text-sm border border-slate-200 rounded-md px-3 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todas">Todas categorias</option>
            {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={apenasAtivos}
              onChange={e => setApenasAtivos(e.target.checked)}
              className="rounded"
            />
            Apenas ativos
          </label>
          <span className="text-xs text-slate-400">{lista.length} resultado{lista.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Rev. 4117 — filtros de cadastro incompleto + auto-completar via Receita Federal/IA */}
        <div className="flex flex-wrap gap-3 items-center bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Cadastro incompleto:</span>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={filtroSemCnpj} onChange={e => setFiltroSemCnpj(e.target.checked)} className="rounded" />
            Sem CNPJ ({fornecedores.filter(isSemCnpj).length})
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={filtroSemCategoria} onChange={e => setFiltroSemCategoria(e.target.checked)} className="rounded" />
            Sem categoria ({fornecedores.filter(isSemCategoria).length})
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer select-none">
            <input type="checkbox" checked={filtroFichaIncompleta} onChange={e => setFiltroFichaIncompleta(e.target.checked)} className="rounded" />
            Ficha incompleta ({fornecedores.filter(isFichaIncompleta).length})
          </label>
          <div className="flex-1" />
          <Button
            size="sm"
            disabled={autoCompletando || (candidatosAutoCompletarQuery.data || []).length === 0}
            onClick={rodarAutoCompletar}
            className="relative overflow-hidden bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
          >
            {autoCompletando && (
              <span
                className="absolute inset-y-0 left-0 bg-white/15"
                style={{ width: `${autoCompletarProgresso}%`, transition: "width .2s" }}
              />
            )}
            <span className="relative z-10">
              {autoCompletando
                ? `Completando... ${autoCompletarProgresso}%`
                : `Completar automaticamente (${(candidatosAutoCompletarQuery.data || []).length} c/ CNPJ)`}
            </span>
          </Button>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
        ) : lista.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
            <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhuma empresa encontrada</p>
            <p className="text-sm text-slate-400 mt-1">Cadastre sua primeira empresa terceira clicando em "Nova Empresa Terceira"</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {lista.map(f => (
              <div
                key={f.id}
                className={`bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow ${!f.ativo ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="font-semibold text-slate-800 hover:text-blue-600 hover:underline truncate text-left transition-colors cursor-pointer"
                        onClick={() => setLocation(`/compras/fornecedores/${f.id}`)}
                      >
                        {f.nomeFantasia || f.razaoSocial}
                      </button>
                      {situacaoBadge(f.situacaoReceita)}
                      {!f.ativo && <Badge variant="outline" className="text-slate-400 border-slate-300">Inativo</Badge>}
                    </div>
                    {f.nomeFantasia && f.nomeFantasia !== f.razaoSocial && (
                      <p className="text-xs text-slate-500 mt-0.5">{f.razaoSocial}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                      {f.cnpj && <span className="font-mono">{formatCNPJ(f.cnpj)}</span>}
                      {f.cidade && f.estado && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{f.cidade}/{f.estado}</span>}
                      {f.telefone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{f.telefone}</span>}
                      {f.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{f.email}</span>}
                    </div>
                    {Array.isArray(f.categorias) && f.categorias.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(f.categorias as string[]).map(c => (
                          <span key={c} className="bg-blue-50 text-blue-700 text-[10px] font-medium px-2 py-0.5 rounded-full">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0 items-center">
                    <Button
                      size="sm" variant="outline"
                      className="h-8 gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => handleGerarAcesso(f)}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Portal
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-8 gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
                      onClick={() => abrirAvaliacao(f.id, f.nomeFantasia || f.razaoSocial)}
                    >
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      Avaliar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetalheId(detalheId === f.id ? null : f.id)}>
                      {detalheId === f.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => abrirEditar(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {f.ativo ? (
                      <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => excluirMut.mutate({ id: f.id })}
                        disabled={excluirMut.isPending}>
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" className="h-8 text-green-600 border-green-200 hover:bg-green-50 gap-1"
                          onClick={() => reativarMut.mutate({ id: f.id })}
                          disabled={reativarMut.isPending}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Reativar
                        </Button>
                        {deletarConfirmId === f.id ? (
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="destructive" className="h-8 gap-1 text-xs"
                              onClick={() => deletarMut.mutate({ id: f.id })}
                              disabled={deletarMut.isPending}>
                              {deletarMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              Confirmar exclusão
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDeletarConfirmId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-500 border-red-200 hover:bg-red-50"
                            title="Excluir fornecedor definitivamente"
                            onClick={() => setDeletarConfirmId(f.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Detalhe expandido */}
                {detalheId === f.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Desempenho</p>
                      </div>
                      <DesempenhoFornecedor fornecedorId={f.id} companyId={companyId} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs pt-3 border-t border-slate-100">
                      <div>
                        <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Contato Comercial</p>
                        <p className="text-slate-700">{f.contatoNome || "—"}</p>
                        <p className="text-slate-500">{f.contatoCelular || ""}</p>
                        <p className="text-slate-500">{f.contatoEmail || ""}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Endereço</p>
                        <p className="text-slate-700">{[f.endereco, f.numero, f.complemento].filter(Boolean).join(", ") || "—"}</p>
                        <p className="text-slate-500">{f.bairro || ""}</p>
                        <p className="text-slate-500">{f.cep ? `CEP ${f.cep}` : ""}</p>
                      </div>
                      <div>
                        <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Dados Bancários</p>
                        <p className="text-slate-700">{f.banco || "—"}</p>
                        {f.agencia && <p className="text-slate-500">Ag. {f.agencia} / C. {f.conta}</p>}
                        {f.pix && <p className="text-slate-500">PIX: {f.pix}</p>}
                      </div>
                      <div>
                        <p className="text-slate-400 font-medium uppercase tracking-wide mb-1">Observações</p>
                        <p className="text-slate-700">{f.observacoes || "—"}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </>)}
      </div>

      {/* Modal de Avaliação */}
      <Dialog open={!!modalAvalId} onOpenChange={v => !v && setModalAvalId(null)}>
        <DialogContent style={{ background: '#ffffff', color: '#111827' }} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
              Avaliar Fornecedor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-600 font-medium">{modalAvalNome}</p>
            <div>
              <Label className="text-xs text-slate-500 mb-2 block">Nota (1 a 5 estrelas) *</Label>
              <div className="flex items-center gap-3">
                <StarRating value={notaEstrela} onChange={setNotaEstrela} size={28} />
                {notaEstrela > 0 && (
                  <span className="text-sm font-semibold text-amber-600">
                    {["", "Ruim", "Regular", "Bom", "Muito Bom", "Excelente"][notaEstrela]}
                  </span>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Comentário (opcional)</Label>
              <Textarea
                value={comentarioAval}
                onChange={e => setComentarioAval(e.target.value)}
                placeholder="Descreva sua experiência com este fornecedor..."
                rows={3}
                className="text-sm resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setModalAvalId(null)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={salvarAvaliacao}
                disabled={!notaEstrela || avaliarMut.isPending}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {avaliarMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Star className="h-3.5 w-3.5 mr-2 fill-white" />}
                Registrar Avaliação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro/Edição — Tela Paisagem (componente compartilhado) */}
      <FornecedorFormModal
        companyId={companyId}
        open={modalAberto}
        fornecedor={editandoForn}
        initialForm={initialForm}
        onClose={fecharModal}
        onSaved={() => refetch()}
      />

      <Dialog open={acessoDialogOpen} onOpenChange={setAcessoDialogOpen}>
        <DialogContent resizable={false} className="sm:max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-blue-500" /> Gerar Acesso ao Portal</DialogTitle></DialogHeader>
          {!acessoResult ? (
            <div className="space-y-4 overflow-hidden">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 font-bold">{acessoFornecedor?.nomeFantasia || acessoFornecedor?.razaoSocial}</p>
                <p className="text-xs text-blue-600">CNPJ: {acessoFornecedor?.cnpj ? formatCNPJ(acessoFornecedor.cnpj) : "Não cadastrado"}</p>
              </div>
              {!(acessoFornecedor?.cnpj?.replace(/\D/g, "")) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-700 font-semibold">Este fornecedor não possui CNPJ cadastrado. Cadastre o CNPJ antes de gerar o acesso ao portal.</p>
                </div>
              )}
              <div><Label>Nome do Responsável</Label><Input value={nomeResp} onChange={(e) => setNomeResp(e.target.value)} placeholder="Nome" /></div>
              <div><Label>E-mail do Responsável</Label><Input value={emailResp} onChange={(e) => setEmailResp(e.target.value)} placeholder="email@empresa.com" /></div>
              <p className="text-xs text-gray-500">Uma senha temporária será gerada. No primeiro acesso, o fornecedor será obrigado a trocar a senha.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAcessoDialogOpen(false)}>Cancelar</Button>
                <Button onClick={confirmarGerarAcesso} disabled={gerarAcessoMut.isPending || !(acessoFornecedor?.cnpj?.replace(/\D/g, ""))} className="bg-blue-600 hover:bg-blue-700">{gerarAcessoMut.isPending ? "Gerando..." : "Gerar Acesso"}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 overflow-hidden">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-emerald-800">Acesso gerado com sucesso!</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 overflow-hidden">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Login (CNPJ)</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border rounded px-2 py-1 text-sm font-mono flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap block">{acessoResult.cnpj || acessoFornecedor?.cnpj || "—"}</code>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(acessoResult.cnpj || acessoFornecedor?.cnpj || ""); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Senha Temporária</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border rounded px-2 py-1 text-sm font-mono flex-1 min-w-0 text-amber-600 font-bold">{acessoResult.senhaTemporaria}</code>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(acessoResult.senhaTemporaria); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-xs text-gray-500 mb-1">Link do Portal</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white border rounded px-2 py-1 text-xs flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap block">{window.location.origin}/portal/login</code>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/portal/login`); toast.success("Copiado!"); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
              <Button className="w-full" onClick={() => { const loginCnpj = acessoResult.cnpj || acessoFornecedor?.cnpj || ""; const msg = `Portal do Fornecedor - FC Gestão Integrada\n\nOlá ${nomeResp},\n\nSeu acesso ao portal foi criado:\n\nLink: ${window.location.origin}/portal/login\nLogin (CNPJ): ${loginCnpj}\nSenha: ${acessoResult.senhaTemporaria}\n\nNo primeiro acesso, você será solicitado a trocar a senha.`; navigator.clipboard.writeText(msg); toast.success("Mensagem copiada!"); }}><Copy className="w-4 h-4 mr-2" /> Copiar Mensagem Completa</Button>
              <Button variant="outline" className="w-full" onClick={() => setAcessoDialogOpen(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
    </DashboardLayout>
  );
}
