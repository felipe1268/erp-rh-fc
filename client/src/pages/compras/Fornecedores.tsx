import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
  Eye, ShieldQuestion, Wrench,
} from "lucide-react";
import { useLocation } from "wouter";

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

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

// Rev. 4122 — utilitários de dedup de categoria (normaliza acento/caixa/plural
// simples + distância de Levenshtein) pra impedir criar "Ar Condicionado" e
// "Ar condicionados" como categorias diferentes.
function normalizeCategoriaTexto(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/s$/, ""); // remove plural simples no final pra comparação
}

function levenshteinDist(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function similaridadeCategoria(a: string, b: string): number {
  const na = normalizeCategoriaTexto(a);
  const nb = normalizeCategoriaTexto(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshteinDist(na, nb) / maxLen;
}

const LIMIAR_SIMILARIDADE_CATEGORIA = 0.8;

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

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]       = useState<number | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  // Rev. 3516 — regras especiais de pagamento por produto
  type RegraProduto = { id: string; produto: string; formaPagamento: string; numParcelas: number; prazoEntreParcelas: number };
  const [regrasProduto, setRegrasProduto] = useState<RegraProduto[]>([]);
  const [addingRegra, setAddingRegra] = useState(false);
  const [novaRegra, setNovaRegra] = useState({ produto: "", formaPagamento: "cheque", numParcelas: "3", prazoEntreParcelas: "30" });
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false);
  const [buscaCategoria, setBuscaCategoria] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [categoriasCriadasLocal, setCategoriasCriadasLocal] = useState<string[]>([]);
  const [erroCNPJ, setErroCNPJ]       = useState<string | null>(null);
  const [detalheId, setDetalheId]     = useState<number | null>(null);

  const [acessoDialogOpen, setAcessoDialogOpen] = useState(false);
  const [acessoFornecedor, setAcessoFornecedor] = useState<any>(null);
  const [acessoResult, setAcessoResult] = useState<{ senhaTemporaria: string; cnpj: string; nomeEmpresa: string } | null>(null);
  const [nomeResp, setNomeResp] = useState("");
  const [emailResp, setEmailResp] = useState("");

  const buscarCNPJQuery = trpc.compras.buscarCNPJ.useQuery(
    { cnpj: form.cnpj.replace(/\D/g, "") },
    { enabled: false, retry: false }
  );

  const criarMut    = trpc.compras.criarFornecedor.useMutation({ onSuccess: () => { refetch(); fecharModal(); toast.success("Empresa terceira cadastrada!"); }, onError: (e) => toast.error(e.message) });
  const verificarDup = trpc.terceiros.empresas.verificarCadastroDuplicado.useQuery(
    { companyId, cnpj: form.cnpj.replace(/\D/g, ""), excludeFornecedorId: editando ?? undefined },
    { enabled: false, retry: false }
  );
  const [dupDialog, setDupDialog] = useState<null | { mode: "block-same"; nome: string } | { mode: "replicate-from-terceira"; terceira: any }>(null);
  const atualizarMut = trpc.compras.atualizarFornecedor.useMutation({ onSuccess: () => { refetch(); fecharModal(); toast.success("Empresa terceira atualizada!"); }, onError: (e) => toast.error(e.message) });
  const excluirMut  = trpc.compras.excluirFornecedor.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa terceira desativada."); } });
  const reativarMut = trpc.compras.reativarFornecedor.useMutation({ onSuccess: () => { refetch(); toast.success("Empresa terceira reativada!"); } });

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
    setForm({ ...EMPTY_FORM });
    setEditando(null);
    setErroCNPJ(null);
    lastFetchedCNPJ.current = "";
    setModalAberto(true);
  }

  function abrirEditar(f: any) {
    setForm({
      cnpj: f.cnpj ?? "", razaoSocial: f.razaoSocial, nomeFantasia: f.nomeFantasia ?? "",
      situacaoReceita: f.situacaoReceita ?? "", endereco: f.endereco ?? "", numero: f.numero ?? "",
      complemento: f.complemento ?? "", bairro: f.bairro ?? "", cidade: f.cidade ?? "",
      estado: f.estado ?? "", cep: f.cep ?? "", telefone: maskPhone(f.telefone ?? ""), email: f.email ?? "",
      contatoNome: f.contatoNome ?? "", contatoCelular: maskPhone(f.contatoCelular ?? ""), contatoEmail: f.contatoEmail ?? "",
      banco: f.banco ?? "", agencia: f.agencia ?? "", conta: f.conta ?? "", pix: f.pix ?? "",
      naturezaJuridica: f.naturezaJuridica ?? "", porte: f.porte ?? "",
      capitalSocial: f.capitalSocial ?? "", atividadePrincipal: f.atividadePrincipal ?? "",
      atividadesCnae: f.atividadesCnae ?? "", dataAbertura: f.dataAbertura ?? "",
      regimeTributario: f.regimeTributario ?? "", inscricaoEstadual: f.inscricaoEstadual ?? "",
      inscricaoMunicipal: f.inscricaoMunicipal ?? "",
      representanteLegal: f.representanteLegal ?? "", representanteCpf: f.representanteCpf ?? "",
      representanteCargo: f.representanteCargo ?? "",
      socios: Array.isArray(f.socios) ? f.socios : [],
      categorias: Array.isArray(f.categorias) ? f.categorias : [], observacoes: f.observacoes ?? "",
      isPrestadorServico: !!(f as any).isPrestadorServico,
      isFornecedor: (f as any).isFornecedor === undefined ? true : !!(f as any).isFornecedor,
      // Rev. 3440 — Ciclo de Fechamento
      cicloPagamento: (f as any).cicloPagamento ?? "",
      cicloDiaFechamento: (f as any).cicloDiaFechamento != null ? String((f as any).cicloDiaFechamento) : "",
      cicloNumParcelas: (f as any).cicloNumParcelas != null ? String((f as any).cicloNumParcelas) : "",
      cicloPrazoParcela: (f as any).cicloPrazoParcela != null ? String((f as any).cicloPrazoParcela) : "",
      cicloFormaPagamento: (f as any).cicloFormaPagamento ?? "",
      cicloDataReferencia: (f as any).cicloDataReferencia ?? "",
    });
    // Rev. 3516 — carregar regras de produto salvas
    try {
      const raw = (f as any).regrasProdutoJson;
      setRegrasProduto(raw ? JSON.parse(raw) : []);
    } catch { setRegrasProduto([]); }
    setAddingRegra(false);
    setNovaRegra({ produto: "", formaPagamento: "cheque", numParcelas: "3", prazoEntreParcelas: "30" });
    setEditando(f.id);
    setErroCNPJ(null);
    lastFetchedCNPJ.current = "";
    lastCheckedDupCNPJ.current = "";
    originalCnpjRef.current = (f.cnpj ?? "").replace(/\D/g, "");
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setErroCNPJ(null);
    setBuscaCategoria("");
    setRegrasProduto([]);
    setAddingRegra(false);
    setNovaRegra({ produto: "", formaPagamento: "cheque", numParcelas: "3", prazoEntreParcelas: "30" });
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
    abrirNovo();
    setForm(prev => ({
      ...prev,
      cnpj: cnpjDigits.length === 14 ? formatCNPJ(cnpjDigits) : "",
      isPrestadorServico: true,
    }));
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState({}, "", url.pathname);
  }, []);

  const lastFetchedCNPJ = useRef("");

  const buscarCNPJ = useCallback(async () => {
    const cnpj = form.cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) { setErroCNPJ("Digite um CNPJ completo (14 dígitos)."); return; }
    if (cnpj === lastFetchedCNPJ.current) return;
    setBuscandoCNPJ(true);
    setErroCNPJ(null);
    try {
      const res = await buscarCNPJQuery.refetch();
      const d = res.data;
      if (!d) {
        if (res.error) {
          setErroCNPJ("Não foi possível consultar a Receita Federal no momento. Preencha os dados manualmente.");
        } else {
          setErroCNPJ("CNPJ não encontrado na Receita Federal. Verifique o número e tente novamente.");
        }
        return;
      }

      const situacaoTexto = (d.situacaoReceita || "").toUpperCase();
      const situacaoCod = Number(d.situacaoCodigo ?? 0);
      const situacaoAtiva = situacaoCod === 2 || situacaoTexto.includes("ATIVA");
      if (!situacaoAtiva) {
        setErroCNPJ(`Atenção: situação na Receita é "${d.situacaoReceita}".`);
        if ([3, 4, 8].includes(situacaoCod) || situacaoTexto.includes("SUSPENSA") || situacaoTexto.includes("INAPTA") || situacaoTexto.includes("BAIXADA")) return;
      }

      lastFetchedCNPJ.current = cnpj;
      setForm(prev => ({
        ...prev,
        razaoSocial: d.razaoSocial || prev.razaoSocial,
        nomeFantasia: d.nomeFantasia || prev.nomeFantasia,
        situacaoReceita: d.situacaoReceita || prev.situacaoReceita,
        endereco: d.endereco || prev.endereco,
        numero: d.numero || prev.numero,
        complemento: d.complemento || prev.complemento,
        bairro: d.bairro || prev.bairro,
        cidade: d.cidade || prev.cidade,
        estado: d.estado || prev.estado,
        cep: d.cep || prev.cep,
        telefone: maskPhone(d.telefone || prev.telefone),
        email: d.email || prev.email,
        naturezaJuridica: d.naturezaJuridica ?? "",
        porte: d.porte ?? "",
        capitalSocial: d.capitalSocial ?? "",
        atividadePrincipal: d.atividadePrincipal ?? "",
        atividadesCnae: d.atividadesCnae ?? "",
        dataAbertura: d.dataAbertura ?? "",
        regimeTributario: d.regimeTributario ?? "",
        representanteLegal: d.representanteLegal ?? "",
        representanteCpf: d.representanteCpf ?? "",
        representanteCargo: d.representanteCargo ?? "",
        socios: Array.isArray(d.socios) ? d.socios : [],
      }));
      const qtdSocios = Array.isArray(d.socios) ? d.socios.length : 0;
      toast.success(`Dados do CNPJ carregados! ${qtdSocios > 0 ? `${qtdSocios} sócio(s) encontrado(s).` : ""}`);
    } catch {
      setErroCNPJ("Não foi possível consultar a Receita Federal no momento. Preencha os dados manualmente.");
    } finally {
      setBuscandoCNPJ(false);
    }
  }, [form.cnpj]);

  useEffect(() => {
    const cnpjDigits = form.cnpj.replace(/\D/g, "");
    if (cnpjDigits.length === 14 && modalAberto && !editando && cnpjDigits !== lastFetchedCNPJ.current) {
      const timer = setTimeout(() => buscarCNPJ(), 400);
      return () => clearTimeout(timer);
    }
  }, [form.cnpj, modalAberto, editando, buscarCNPJ]);

  // Verificação anti-duplicidade cross-módulo (fornecedores + empresas_terceiras)
  const lastCheckedDupCNPJ = useRef("");
  // CNPJ original ao abrir edição — usado para detectar se o usuário MUDOU o CNPJ.
  const originalCnpjRef = useRef("");
  // Reset do cache sempre que o modal abre/fecha — evita pular a checagem ao reabrir o form com o mesmo CNPJ.
  useEffect(() => {
    if (!modalAberto) {
      lastCheckedDupCNPJ.current = "";
      originalCnpjRef.current = "";
      setDupDialog(null);
    }
  }, [modalAberto]);
  useEffect(() => {
    const cnpjDigits = form.cnpj.replace(/\D/g, "");
    if (!modalAberto) return;
    if (cnpjDigits.length !== 14) return;
    // Em edição: só verifica se o CNPJ foi alterado em relação ao original.
    if (editando && cnpjDigits === originalCnpjRef.current) return;
    if (cnpjDigits === lastCheckedDupCNPJ.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await verificarDup.refetch();
        // Proteção contra resposta stale: confirma se o CNPJ ainda corresponde
        const cnpjAtual = form.cnpj.replace(/\D/g, "");
        if (cancelled || cnpjAtual !== cnpjDigits) return;
        lastCheckedDupCNPJ.current = cnpjDigits;
        const d: any = res.data;
        if (!d?.found) return;
        if (d.fornecedor) {
          setDupDialog({ mode: "block-same", nome: `${d.fornecedor.razaoSocial} (#${d.fornecedor.id})` });
          return;
        }
        if (d.empresaTerceira && !editando) {
          setDupDialog({ mode: "replicate-from-terceira", terceira: d.empresaTerceira });
        }
      } catch { /* silencioso — não bloqueia o usuário */ }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.cnpj, modalAberto, editando]);

  function aplicarDadosDeTerceira(t: any) {
    setForm(prev => ({
      ...prev,
      cnpj: prev.cnpj || (t.cnpj ? formatCNPJ(t.cnpj) : prev.cnpj),
      razaoSocial: t.razaoSocial || prev.razaoSocial,
      nomeFantasia: t.nomeFantasia || prev.nomeFantasia,
      endereco: t.logradouro || prev.endereco,
      numero: t.numero || prev.numero,
      complemento: t.complemento || prev.complemento,
      bairro: t.bairro || prev.bairro,
      cidade: t.cidade || prev.cidade,
      estado: t.estado || prev.estado,
      cep: t.cep || prev.cep,
      telefone: t.telefone ? maskPhone(t.telefone) : prev.telefone,
      email: t.email || prev.email,
      contatoNome: t.responsavelNome || prev.contatoNome,
      contatoCelular: t.celular ? maskPhone(t.celular) : prev.contatoCelular,
      contatoEmail: t.emailFinanceiro || prev.contatoEmail,
      banco: t.banco || prev.banco,
      agencia: t.agencia || prev.agencia,
      conta: t.conta || prev.conta,
      pix: t.pixChave || prev.pix,
      inscricaoEstadual: t.inscricaoEstadual || prev.inscricaoEstadual,
      inscricaoMunicipal: t.inscricaoMunicipal || prev.inscricaoMunicipal,
      isPrestadorServico: true,
    }));
    toast.success("Dados replicados da Empresa Terceira. Revise e salve.");
  }

  function toggleCategoria(c: string) {
    setForm(prev => ({
      ...prev,
      categorias: prev.categorias.includes(c)
        ? prev.categorias.filter(x => x !== c)
        : [...prev.categorias, c],
    }));
  }

  // Rev. 4122 — cria uma nova categoria de fornecimento, bloqueando nomes
  // iguais ou muito parecidos com uma categoria já existente (evita
  // duplicidade tipo "Ar Condicionado" x "Ar condicionados").
  function handleCriarCategoria() {
    const nome = novaCategoria.trim();
    if (!nome) return;
    if (nome.length < 2) { toast.error("Nome de categoria muito curto."); return; }

    const igual = todasCategorias.find(c => normalizeCategoriaTexto(c) === normalizeCategoriaTexto(nome));
    if (igual) {
      toast.error(`A categoria "${igual}" já existe.`);
      if (!form.categorias.includes(igual)) toggleCategoria(igual);
      setNovaCategoria("");
      return;
    }

    let maisParecida: string | null = null;
    let maiorSimilaridade = 0;
    for (const c of todasCategorias) {
      const sim = similaridadeCategoria(c, nome);
      if (sim > maiorSimilaridade) { maiorSimilaridade = sim; maisParecida = c; }
    }
    if (maisParecida && maiorSimilaridade >= LIMIAR_SIMILARIDADE_CATEGORIA) {
      toast.error(`Categoria muito parecida com "${maisParecida}" já cadastrada. Use a existente para não duplicar.`);
      return;
    }

    setCategoriasCriadasLocal(prev => [...prev, nome]);
    setForm(prev => ({ ...prev, categorias: [...prev.categorias, nome] }));
    setNovaCategoria("");
    toast.success(`Categoria "${nome}" criada e selecionada.`);
  }

  async function salvar() {
    // Se o diálogo de duplicidade já foi exibido, não prosseguir.
    if (dupDialog?.mode === "block-same") {
      toast.error("Este CNPJ já está cadastrado. Use ou edite o fornecedor existente.");
      return;
    }
    if (!form.razaoSocial.trim()) { toast.error("Razão Social é obrigatória."); return; }
    // Rev. 4127 — CNPJ é obrigatório para CRIAR um novo fornecedor (edição de
    // cadastros antigos sem CNPJ ainda é permitida, para não travar quem já existe).
    if (!editando && form.cnpj.replace(/\D/g, "").length !== 14) {
      toast.error("CNPJ é obrigatório para cadastrar um novo fornecedor. Digite um CNPJ completo (14 dígitos).");
      return;
    }
    // Verificação de CNPJ duplicado no momento do clique — cobre casos de
    // paste rápido onde o timer de 500ms ainda não disparou, ou edição com
    // troca de CNPJ para um já existente.
    const cnpjDigits = form.cnpj.replace(/\D/g, "");
    const cnpjMudou = editando ? cnpjDigits !== originalCnpjRef.current : cnpjDigits.length === 14;
    if (cnpjDigits.length === 14 && cnpjMudou && cnpjDigits !== lastCheckedDupCNPJ.current) {
      try {
        const res = await verificarDup.refetch();
        const d: any = res.data;
        lastCheckedDupCNPJ.current = cnpjDigits;
        if (d?.found) {
          if (d.fornecedor) {
            setDupDialog({ mode: "block-same", nome: `${d.fornecedor.razaoSocial} (#${d.fornecedor.id})` });
            return;
          }
          if (d.empresaTerceira && !editando) {
            setDupDialog({ mode: "replicate-from-terceira", terceira: d.empresaTerceira });
            return;
          }
        }
      } catch { /* silencioso — backend ainda barra no pior caso */ }
    }
    // Rev. 3440 — converter campos de ciclo: string→number/null/enum para o backend
    const parseCicloInt = (v: string) => { const n = parseInt(v); return isNaN(n) ? null : n; };
    const cicloFields = {
      cicloPagamento: (form.cicloPagamento && form.cicloPagamento !== "avista") ? form.cicloPagamento as any : null,
      cicloDiaFechamento: parseCicloInt(form.cicloDiaFechamento),
      cicloNumParcelas: parseCicloInt(form.cicloNumParcelas),
      cicloPrazoParcela: parseCicloInt(form.cicloPrazoParcela),
      cicloFormaPagamento: form.cicloFormaPagamento || null,
      cicloDataReferencia: (form.cicloPagamento === "quinzenal_semana" && form.cicloDataReferencia) ? form.cicloDataReferencia : null,
    };
    const { cicloPagamento: _cp, cicloDiaFechamento: _cd, cicloNumParcelas: _cn, cicloPrazoParcela: _cpr, cicloFormaPagamento: _cf, cicloDataReferencia: _cdr, ...restForm } = form;
    // Rev. 4119 — regimeTributario pode ter sido gravado como array/objeto por um bug
    // anterior na busca via BrasilAPI; sanitiza pra string antes de enviar (nunca envia array).
    const regimeTributarioSaneado = (() => {
      const v: any = (restForm as any).regimeTributario;
      if (typeof v === "string") return v;
      if (Array.isArray(v) && v.length > 0) {
        const ultimo = v.slice().sort((a: any, b: any) => (b?.ano ?? 0) - (a?.ano ?? 0))[0];
        return ultimo?.forma_de_tributacao ?? "";
      }
      return "";
    })();
    if (editando) {
      atualizarMut.mutate({ id: editando, ...restForm, regimeTributario: regimeTributarioSaneado, ...cicloFields, regrasProdutoJson: JSON.stringify(regrasProduto) });
    } else {
      criarMut.mutate({ companyId, ...restForm, regimeTributario: regimeTributarioSaneado });
    }
  }

  const todasCategorias = useMemo(() => {
    const set = new Set([...CATEGORIAS_PADRAO, ...categorias, ...categoriasCriadasLocal]);
    return Array.from(set).sort();
  }, [categorias, categoriasCriadasLocal]);

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
                      <span className="font-semibold text-slate-800 truncate">{f.nomeFantasia || f.razaoSocial}</span>
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
                      <Button size="sm" variant="outline" className="h-8 text-green-600 border-green-200 hover:bg-green-50 gap-1"
                        onClick={() => reativarMut.mutate({ id: f.id })}
                        disabled={reativarMut.isPending}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Reativar
                      </Button>
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

      {/* Modal de Cadastro/Edição — Tela Paisagem */}
      <Dialog open={modalAberto} onOpenChange={v => !v && fecharModal()}>
        <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col [&>[data-slot=dialog-close]]:top-6 [&>[data-slot=dialog-close]]:right-5" resizable={false} showCloseButton={false}>
          <DialogHeader className="sr-only"><DialogTitle>{editando ? "Editar Empresa Terceira" : "Cadastro de Empresa Terceira"}</DialogTitle></DialogHeader>

          <div className="overflow-y-auto flex-1 bg-slate-50">
            {/* Header com info do fornecedor */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <button onClick={fecharModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="h-5 w-5" />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-800">{editando ? "Editar Empresa Terceira" : "Nova Empresa Terceira"}</h2>
                    {form.situacaoReceita && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        form.situacaoReceita.toUpperCase().includes("ATIVA") ? "bg-emerald-100 text-emerald-700"
                        : form.situacaoReceita.toUpperCase().includes("SUSPENSA") ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-700"
                      }`}>
                        {form.situacaoReceita}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {editando ? `Editando empresa #${editando}` : "Digite o CNPJ para preencher automaticamente"}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, isPrestadorServico: !p.isPrestadorServico }))}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      form.isPrestadorServico
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                        : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`h-4 w-4 rounded border flex items-center justify-center ${
                      form.isPrestadorServico ? "bg-white border-white" : "border-slate-400"
                    }`}>
                      {form.isPrestadorServico && <span className="text-emerald-600 text-[10px] font-bold leading-none">✓</span>}
                    </span>
                    PRESTAÇÃO DE SERVIÇO
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, isFornecedor: !p.isFornecedor }))}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      form.isFornecedor
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`h-4 w-4 rounded border flex items-center justify-center ${
                      form.isFornecedor ? "bg-white border-white" : "border-slate-400"
                    }`}>
                      {form.isFornecedor && <span className="text-blue-600 text-[10px] font-bold leading-none">✓</span>}
                    </span>
                    FORNECEDOR
                  </button>
                </div>
              </div>

              {/* CNPJ + Identificação inline */}
              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-3">
                  <Label className="text-xs font-medium text-slate-600 mb-1 block">CNPJ{!editando ? " *" : ""}</Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={form.cnpj}
                      onChange={e => setForm(p => ({ ...p, cnpj: formatCNPJ(e.target.value) }))}
                      placeholder="00.000.000/0000-00"
                      className="font-mono h-9 text-sm"
                      maxLength={18}
                      autoFocus={!editando}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-xs shrink-0 gap-1.5"
                      onClick={buscarCNPJ}
                      disabled={buscandoCNPJ || form.cnpj.replace(/\D/g, "").length !== 14}
                    >
                      {buscandoCNPJ ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      {buscandoCNPJ ? "..." : "Buscar"}
                    </Button>
                  </div>
                </div>
                <div className="col-span-5">
                  <Label className="text-xs font-medium text-slate-600 mb-1 block">Razão Social *</Label>
                  <Input value={form.razaoSocial} onChange={e => setForm(p => ({ ...p, razaoSocial: e.target.value }))} onBlur={e => setForm(p => ({ ...p, razaoSocial: upperCaseEmpresa(e.target.value) }))} className="h-9 text-sm" />
                </div>
                <div className="col-span-4">
                  <Label className="text-xs font-medium text-slate-600 mb-1 block">Nome Fantasia</Label>
                  <Input value={form.nomeFantasia} onChange={e => setForm(p => ({ ...p, nomeFantasia: e.target.value }))} onBlur={e => setForm(p => ({ ...p, nomeFantasia: upperCaseEmpresa(e.target.value) }))} className="h-9 text-sm" />
                </div>
              </div>
              {erroCNPJ && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {erroCNPJ}
                </div>
              )}
              {buscandoCNPJ && (
                <div className="flex items-center gap-2 mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  Consultando dados na Receita Federal...
                </div>
              )}
            </div>

            {/* Cards de resumo (como na tela de contrato) */}
            <div className="px-6 py-4">
              <div className="grid grid-cols-5 gap-3 mb-5">
                <div className="bg-white rounded-xl border border-blue-100 p-3.5 shadow-sm">
                  <p className="text-[10px] font-medium text-blue-500 uppercase tracking-wide mb-1">Endereço</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {form.cidade && form.estado ? `${form.cidade}/${form.estado}` : "Não informado"}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{form.endereco ? `${form.endereco}, ${form.numero}` : "—"}</p>
                </div>
                <div className="bg-white rounded-xl border border-emerald-100 p-3.5 shadow-sm">
                  <p className="text-[10px] font-medium text-emerald-500 uppercase tracking-wide mb-1">Contato</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{form.telefone || "Não informado"}</p>
                  <p className="text-[11px] text-slate-400 truncate">{form.email || "—"}</p>
                </div>
                <div className="bg-white rounded-xl border border-rose-100 p-3.5 shadow-sm">
                  <p className="text-[10px] font-medium text-rose-500 uppercase tracking-wide mb-1">Representante Legal</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{form.representanteLegal || "Não informado"}</p>
                  <p className="text-[11px] text-slate-400 truncate">{form.representanteCargo || "—"}</p>
                </div>
                <div className="bg-white rounded-xl border border-amber-100 p-3.5 shadow-sm">
                  <p className="text-[10px] font-medium text-amber-500 uppercase tracking-wide mb-1">Banco</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">{form.banco || "Não informado"}</p>
                  <p className="text-[11px] text-slate-400 truncate">{form.agencia ? `Ag. ${form.agencia} / C. ${form.conta}` : "—"}</p>
                </div>
                <div className="bg-white rounded-xl border border-violet-100 p-3.5 shadow-sm">
                  <p className="text-[10px] font-medium text-violet-500 uppercase tracking-wide mb-1">Categorias</p>
                  <p className="text-sm font-semibold text-slate-800">{form.categorias.length} selecionada{form.categorias.length !== 1 ? "s" : ""}</p>
                  <p className="text-[11px] text-slate-400 truncate">{form.categorias.slice(0, 3).join(", ") || "—"}</p>
                </div>
              </div>

              {/* Conteúdo principal em 2 colunas */}
              <div className="grid grid-cols-2 gap-4">
                {/* COLUNA ESQUERDA */}
                <div className="space-y-4">
                  {/* Endereço */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <MapPin className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Endereço</span>
                    </div>
                    <div className="p-4 space-y-2.5">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-8">
                          <Label className="text-[11px] text-slate-500">Logradouro</Label>
                          <Input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[11px] text-slate-500">Nº</Label>
                          <Input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[11px] text-slate-500">CEP</Label>
                          <Input value={form.cep} onChange={e => setForm(p => ({ ...p, cep: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-4">
                          <Label className="text-[11px] text-slate-500">Complemento</Label>
                          <Input value={form.complemento} onChange={e => setForm(p => ({ ...p, complemento: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-[11px] text-slate-500">Bairro</Label>
                          <Input value={form.bairro} onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-[11px] text-slate-500">Cidade</Label>
                          <Input value={form.cidade} onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[11px] text-slate-500">UF</Label>
                          <Input value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value.toUpperCase().slice(0, 2) }))} className="mt-0.5 h-8 text-sm" maxLength={2} placeholder="SP" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contato da Empresa */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <Phone className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Contato da Empresa</span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">Telefone</Label>
                          <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: maskPhone(e.target.value) }))} className="mt-0.5 h-8 text-sm" placeholder="(00) 0000-0000" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">E-mail</Label>
                          <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-0.5 h-8 text-sm" type="email" placeholder="empresa@email.com" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contato Comercial */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center">
                        <Users className="h-3.5 w-3.5 text-teal-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Contato Comercial</span>
                    </div>
                    <div className="p-4 space-y-2.5">
                      <div>
                        <Label className="text-[11px] text-slate-500">Nome do Contato</Label>
                        <Input value={form.contatoNome} onChange={e => setForm(p => ({ ...p, contatoNome: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Responsável comercial" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">Celular</Label>
                          <Input value={form.contatoCelular} onChange={e => setForm(p => ({ ...p, contatoCelular: maskPhone(e.target.value) }))} className="mt-0.5 h-8 text-sm" placeholder="(00) 90000-0000" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">E-mail do Contato</Label>
                          <Input value={form.contatoEmail} onChange={e => setForm(p => ({ ...p, contatoEmail: e.target.value }))} className="mt-0.5 h-8 text-sm" type="email" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dados Jurídicos / Receita Federal */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <FileText className="h-3.5 w-3.5 text-indigo-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Dados Jurídicos / Receita Federal</span>
                      {form.naturezaJuridica && (
                        <Badge className="bg-indigo-100 text-indigo-700 text-[10px] border-0 ml-auto">Receita</Badge>
                      )}
                    </div>
                    <div className="p-4 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">Natureza Jurídica</Label>
                          <Input value={form.naturezaJuridica} onChange={e => setForm(p => ({ ...p, naturezaJuridica: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Ex: Sociedade Empresária Limitada" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Porte</Label>
                          <Input value={form.porte} onChange={e => setForm(p => ({ ...p, porte: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Ex: ME, EPP, Demais" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">Capital Social (R$)</Label>
                          <Input value={form.capitalSocial} onChange={e => setForm(p => ({ ...p, capitalSocial: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="100000" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Data de Abertura</Label>
                          <Input value={form.dataAbertura} onChange={e => setForm(p => ({ ...p, dataAbertura: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="2023-01-15" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Regime Tributário</Label>
                          <Input value={form.regimeTributario} onChange={e => setForm(p => ({ ...p, regimeTributario: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Simples Nacional" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">Atividade Principal (CNAE)</Label>
                        <Input value={form.atividadePrincipal} onChange={e => setForm(p => ({ ...p, atividadePrincipal: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                      </div>
                      {form.atividadesCnae && (
                        <div>
                          <Label className="text-[11px] text-slate-500">Atividades Secundárias (CNAEs)</Label>
                          <Textarea value={form.atividadesCnae} onChange={e => setForm(p => ({ ...p, atividadesCnae: e.target.value }))} className="mt-0.5 text-xs resize-none" rows={2} />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">Inscrição Estadual</Label>
                          <Input value={form.inscricaoEstadual} onChange={e => setForm(p => ({ ...p, inscricaoEstadual: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Inscrição Municipal</Label>
                          <Input value={form.inscricaoMunicipal} onChange={e => setForm(p => ({ ...p, inscricaoMunicipal: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA */}
                <div className="space-y-4">
                  {/* Dados Bancários */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                        <Landmark className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Dados Bancários</span>
                    </div>
                    <div className="p-4 space-y-2.5">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">Banco</Label>
                          <Input value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Ex: Bradesco" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Agência</Label>
                          <Input value={form.agencia} onChange={e => setForm(p => ({ ...p, agencia: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Conta</Label>
                          <Input value={form.conta} onChange={e => setForm(p => ({ ...p, conta: e.target.value }))} className="mt-0.5 h-8 text-sm" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-500">Chave PIX</Label>
                        <Input value={form.pix} onChange={e => setForm(p => ({ ...p, pix: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
                      </div>
                    </div>
                  </div>

                  {/* Representante Legal */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center">
                        <KeyRound className="h-3.5 w-3.5 text-rose-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Representante Legal</span>
                      {form.representanteLegal && (
                        <Badge className="bg-rose-100 text-rose-700 text-[10px] border-0 ml-auto">Identificado</Badge>
                      )}
                    </div>
                    <div className="p-4 space-y-2.5">
                      <div>
                        <Label className="text-[11px] text-slate-500">Nome Completo</Label>
                        <Input value={form.representanteLegal} onChange={e => setForm(p => ({ ...p, representanteLegal: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Nome do representante legal / administrador" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px] text-slate-500">CPF</Label>
                          <Input value={form.representanteCpf} onChange={e => setForm(p => ({ ...p, representanteCpf: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="***000000**" />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Cargo / Qualificação</Label>
                          <Input value={form.representanteCargo} onChange={e => setForm(p => ({ ...p, representanteCargo: e.target.value }))} className="mt-0.5 h-8 text-sm" placeholder="Sócio-Administrador" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quadro Societário (QSA) */}
                  {form.socios.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-cyan-50 flex items-center justify-center">
                          <Users className="h-3.5 w-3.5 text-cyan-600" />
                        </div>
                        <span className="text-xs font-bold text-slate-700">Quadro Societário (QSA)</span>
                        <Badge className="bg-cyan-100 text-cyan-700 text-[10px] border-0 ml-auto">{form.socios.length} sócio{form.socios.length !== 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="p-3">
                        <div className="space-y-2">
                          {form.socios.map((s, i) => (
                            <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                              <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-xs font-bold text-cyan-700">{(s.nome || "?")[0]}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{s.nome}</p>
                                <p className="text-[11px] text-slate-500">{s.qualificacao}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                                  {s.cpfMascarado && <span className="text-[10px] text-slate-400">CPF: {s.cpfMascarado}</span>}
                                  {s.dataEntrada && <span className="text-[10px] text-slate-400">Entrada: {s.dataEntrada}</span>}
                                  {s.faixaEtaria && <span className="text-[10px] text-slate-400">{s.faixaEtaria}</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Categorias */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                        <Tag className="h-3.5 w-3.5 text-violet-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Categorias de Fornecimento</span>
                      {form.categorias.length > 0 && (
                        <Badge className="bg-violet-100 text-violet-700 text-[10px] border-0 ml-auto">{form.categorias.length} selecionada{form.categorias.length !== 1 ? "s" : ""}</Badge>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input
                          value={buscaCategoria}
                          onChange={e => setBuscaCategoria(e.target.value)}
                          placeholder="Filtrar categorias..."
                          className="pl-8 h-8 text-xs"
                        />
                        {buscaCategoria && (
                          <button onClick={() => setBuscaCategoria("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {form.categorias.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-slate-100">
                          {form.categorias.map(c => (
                            <span
                              key={c}
                              className="inline-flex items-center gap-1 text-[10px] font-medium bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full cursor-pointer hover:bg-violet-200 transition-colors"
                              onClick={() => toggleCategoria(c)}
                            >
                              {c}
                              <X className="h-2.5 w-2.5" />
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                        {todasCategorias
                          .filter(c => !buscaCategoria || c.toLowerCase().includes(buscaCategoria.toLowerCase()))
                          .map(c => {
                            const selected = form.categorias.includes(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => toggleCategoria(c)}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all ${
                                  selected
                                    ? "bg-violet-50 text-violet-700 font-medium"
                                    : "text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                                  selected ? "bg-violet-600 border-violet-600" : "border-slate-300"
                                }`}>
                                  {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
                                </div>
                                {c}
                              </button>
                            );
                          })}
                        {todasCategorias.filter(c => !buscaCategoria || c.toLowerCase().includes(buscaCategoria.toLowerCase())).length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-3">Nenhuma categoria encontrada</p>
                        )}
                      </div>
                      {/* Rev. 4122 — criar nova categoria (com bloqueio de duplicidade/similaridade) */}
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                        <Input
                          value={novaCategoria}
                          onChange={e => setNovaCategoria(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleCriarCategoria(); } }}
                          placeholder="Nova categoria..."
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 shrink-0"
                          disabled={!novaCategoria.trim()}
                          onClick={handleCriarCategoria}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Rev. 3440 — Ciclo de Fechamento */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                        <CreditCard className="h-3.5 w-3.5 text-orange-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Ciclo de Fechamento</span>
                      <span className="ml-auto text-[10px] text-slate-400">Agrupa compras na conciliação bancária</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-slate-600 mb-1 block">Ciclo de fechamento</Label>
                          <Select value={form.cicloPagamento || "avista"} onValueChange={v => setForm(p => ({ ...p, cicloPagamento: v === "avista" ? "" : v, cicloDiaFechamento: "", cicloDataReferencia: "" }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="avista">À vista (sem agrupamento)</SelectItem>
                              <SelectItem value="semanal">Semanal</SelectItem>
                              <SelectItem value="quinzenal">Quinzenal (1–15 / 16–fim)</SelectItem>
                              <SelectItem value="quinzenal_semana">Quinzenal (dia da semana)</SelectItem>
                              <SelectItem value="mensal">Mensal</SelectItem>
                              <SelectItem value="personalizado">Personalizado (N dias)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {form.cicloPagamento === "quinzenal_semana" ? (
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">Dia da semana</Label>
                            <Select value={form.cicloDiaFechamento} onValueChange={v => setForm(p => ({ ...p, cicloDiaFechamento: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">Domingo</SelectItem>
                                <SelectItem value="1">Segunda-feira</SelectItem>
                                <SelectItem value="2">Terça-feira</SelectItem>
                                <SelectItem value="3">Quarta-feira</SelectItem>
                                <SelectItem value="4">Quinta-feira</SelectItem>
                                <SelectItem value="5">Sexta-feira</SelectItem>
                                <SelectItem value="6">Sábado</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">Dia de fechamento</Label>
                            <Input
                              type="number" min={1} max={31}
                              value={form.cicloDiaFechamento}
                              onChange={e => setForm(p => ({ ...p, cicloDiaFechamento: e.target.value }))}
                              className="h-8 text-xs" placeholder="ex: 30"
                              disabled={!form.cicloPagamento}
                            />
                          </div>
                        )}
                      </div>
                      {form.cicloPagamento === "quinzenal_semana" && (
                        <div>
                          <Label className="text-xs text-slate-600 mb-1 block">Data de referência</Label>
                          <Input
                            type="date"
                            value={form.cicloDataReferencia}
                            onChange={e => setForm(p => ({ ...p, cicloDataReferencia: e.target.value }))}
                            className="h-8 text-xs"
                          />
                          <p className="text-[10px] text-slate-400 mt-1">Uma data que foi (ou será) um dia real de fechamento. Os próximos fechamentos ocorrerão a cada 14 dias.</p>
                        </div>
                      )}
                      {form.cicloPagamento && (
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">Forma de pagamento</Label>
                            <Select value={form.cicloFormaPagamento || ""} onValueChange={v => setForm(p => ({ ...p, cicloFormaPagamento: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pix">PIX</SelectItem>
                                <SelectItem value="boleto">Boleto</SelectItem>
                                <SelectItem value="cheque">Cheque</SelectItem>
                                <SelectItem value="transferencia">Transferência</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">Nº de parcelas</Label>
                            <Input
                              type="number" min={1} max={24}
                              value={form.cicloNumParcelas}
                              onChange={e => setForm(p => ({ ...p, cicloNumParcelas: e.target.value }))}
                              className="h-8 text-xs" placeholder="ex: 3"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-600 mb-1 block">Prazo entre parcelas (dias)</Label>
                            <Input
                              type="number" min={0} max={365}
                              value={form.cicloPrazoParcela}
                              onChange={e => setForm(p => ({ ...p, cicloPrazoParcela: e.target.value }))}
                              className="h-8 text-xs" placeholder="ex: 30"
                            />
                          </div>
                        </div>
                      )}
                      {form.cicloPagamento && (
                        <p className="text-[10px] text-orange-600 bg-orange-50 rounded px-2 py-1">
                          Na conciliação, as compras deste fornecedor serão agrupadas em
                          {form.cicloFormaPagamento === "cheque" ? ` ${form.cicloNumParcelas || 1} cheque(s)` : " 1 lançamento"} por período
                          {form.cicloNumParcelas && Number(form.cicloNumParcelas) > 1 ? `, parcelado em ${form.cicloNumParcelas}×` : ""}.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Rev. 3516 — Regras especiais por produto */}
                  {editando && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                          <Tag className="h-3.5 w-3.5 text-violet-600" />
                        </div>
                        <span className="text-xs font-bold text-slate-700 flex-1">Regras especiais por produto</span>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1"
                          onClick={() => { setAddingRegra(true); setNovaRegra({ produto: "", formaPagamento: "cheque", numParcelas: "3", prazoEntreParcelas: "30" }); }}>
                          <Plus className="h-3 w-3" />Nova regra
                        </Button>
                      </div>
                      <div className="p-4 space-y-2">
                        <p className="text-[10px] text-slate-400 mb-2">
                          Quando uma Ordem de Compra deste fornecedor contiver o produto cadastrado, o sistema exibe um aviso com as condições especiais de pagamento.
                        </p>
                        {regrasProduto.length === 0 && !addingRegra && (
                          <p className="text-xs text-slate-400 italic">Nenhuma regra cadastrada.</p>
                        )}
                        {regrasProduto.map(r => (
                          <div key={r.id} className="flex items-center gap-2 bg-violet-50 rounded-lg px-3 py-2 border border-violet-100">
                            <Package className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                            <span className="text-xs font-semibold text-violet-800 flex-1">{r.produto}</span>
                            <span className="text-[10px] text-slate-500 bg-white border border-slate-200 rounded px-1.5 py-0.5">
                              {r.formaPagamento === "cheque" ? "Cheque" : r.formaPagamento === "pix" ? "PIX" : r.formaPagamento === "boleto" ? "Boleto" : "Transferência"}
                              {" "}em até {r.numParcelas}×
                              {r.prazoEntreParcelas ? ` / ${r.prazoEntreParcelas}d` : ""}
                            </span>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setRegrasProduto(prev => prev.filter(x => x.id !== r.id))}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {addingRegra && (
                          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
                            <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Nova regra</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="col-span-2">
                                <Label className="text-[10px] text-slate-500">Produto (palavra-chave)</Label>
                                <Input value={novaRegra.produto} onChange={e => setNovaRegra(p => ({ ...p, produto: e.target.value }))}
                                  className="h-8 text-xs mt-0.5" placeholder="ex: Cimento, Areia, Aço..." />
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">Forma de pagamento</Label>
                                <Select value={novaRegra.formaPagamento} onValueChange={v => setNovaRegra(p => ({ ...p, formaPagamento: v }))}>
                                  <SelectTrigger className="h-8 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                    <SelectItem value="pix">PIX</SelectItem>
                                    <SelectItem value="boleto">Boleto</SelectItem>
                                    <SelectItem value="transferencia">Transferência</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">Nº máx. de parcelas</Label>
                                <Input value={novaRegra.numParcelas} onChange={e => setNovaRegra(p => ({ ...p, numParcelas: e.target.value }))}
                                  type="number" min={1} max={24} className="h-8 text-xs mt-0.5" />
                              </div>
                              <div>
                                <Label className="text-[10px] text-slate-500">Prazo entre parcelas (dias)</Label>
                                <Input value={novaRegra.prazoEntreParcelas} onChange={e => setNovaRegra(p => ({ ...p, prazoEntreParcelas: e.target.value }))}
                                  type="number" min={0} max={365} className="h-8 text-xs mt-0.5" placeholder="ex: 30" />
                              </div>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" className="h-7 text-xs px-3 bg-violet-600 hover:bg-violet-700 text-white"
                                onClick={() => {
                                  if (!novaRegra.produto.trim()) { toast.error("Informe o nome do produto."); return; }
                                  const np = parseInt(novaRegra.numParcelas);
                                  const pp = parseInt(novaRegra.prazoEntreParcelas);
                                  setRegrasProduto(prev => [...prev, {
                                    id: crypto.randomUUID(),
                                    produto: novaRegra.produto.trim(),
                                    formaPagamento: novaRegra.formaPagamento,
                                    numParcelas: isNaN(np) ? 1 : np,
                                    prazoEntreParcelas: isNaN(pp) ? 0 : pp,
                                  }]);
                                  setAddingRegra(false);
                                  setNovaRegra({ produto: "", formaPagamento: "cheque", numParcelas: "3", prazoEntreParcelas: "30" });
                                }}>
                                Adicionar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs px-3"
                                onClick={() => setAddingRegra(false)}>Cancelar</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Observações */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center">
                        <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Observações</span>
                    </div>
                    <div className="p-4">
                      <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} className="text-sm resize-none" rows={3} placeholder="Informações adicionais sobre o fornecedor..." />
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Footer fixo fora do scroll */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-400">Campos com * são obrigatórios</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
              <Button onClick={salvar} disabled={criarMut.isPending || atualizarMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-6 gap-2">
                {(criarMut.isPending || atualizarMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {editando ? "Salvar Alterações" : "Cadastrar Empresa Terceira"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

      {/* Diálogo Anti-Duplicidade Cross-Módulo */}
      <Dialog open={!!dupDialog} onOpenChange={v => !v && setDupDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-700">Empresa já cadastrada</DialogTitle>
          </DialogHeader>
          {dupDialog?.mode === "block-same" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Já existe um cadastro em <strong>Compras</strong> com este CNPJ:
                <br /><span className="font-semibold">{dupDialog.nome}</span>.
              </p>
              <p className="text-xs text-gray-500">
                Não é permitido duplicar empresas. Use o cadastro existente ou edite-o pelo catálogo de Fornecedores.
              </p>
              <DialogFooter>
                <Button onClick={() => { setDupDialog(null); fecharModal(); }}>Entendi</Button>
              </DialogFooter>
            </div>
          )}
          {dupDialog?.mode === "replicate-from-terceira" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Esta empresa já está cadastrada em <strong>Terceiros</strong>:
                <br /><span className="font-semibold">{dupDialog.terceira.razaoSocial}</span>
                {dupDialog.terceira.cnpj ? <> — <span className="font-mono">{formatCNPJ(dupDialog.terceira.cnpj)}</span></> : null}.
              </p>
              <p className="text-sm text-gray-700">
                Deseja adicioná-la também ao módulo <strong>Compras</strong>? Os dados de cadastro serão replicados automaticamente.
              </p>
              <p className="text-xs text-gray-500">
                Ao clicar em <strong>Não</strong>, o cadastro não prosseguirá — empresas não podem ser duplicadas.
              </p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setDupDialog(null); fecharModal(); }}>Não</Button>
                <Button onClick={() => { aplicarDadosDeTerceira((dupDialog as any).terceira); setDupDialog(null); }}>Sim, replicar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
