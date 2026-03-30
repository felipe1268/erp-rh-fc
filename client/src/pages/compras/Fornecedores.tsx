import DashboardLayout from "@/components/DashboardLayout";
import { DraggableCommandBar } from "@/components/DraggableCommandBar";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
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
import {
  Search, Plus, Pencil, Building2, Phone, Mail, MapPin,
  CheckCircle2, XCircle, AlertTriangle, Loader2, X, ChevronDown, ChevronUp, Users,
  Star, Trophy, Medal, ShieldCheck, ShieldAlert, TrendingUp, Package, Clock, BarChart3, Truck,
  CreditCard, FileText, Tag, MessageSquare, Landmark, Hash, KeyRound,
} from "lucide-react";

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

const EMPTY_FORM = {
  cnpj: "", razaoSocial: "", nomeFantasia: "", situacaoReceita: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "", cep: "",
  telefone: "", email: "", contatoNome: "", contatoCelular: "", contatoEmail: "",
  banco: "", agencia: "", conta: "", pix: "", categorias: [] as string[], observacoes: "",
};

export default function Fornecedores() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const companyId = selectedCompany?.id ?? 0;

  const [aba, setAba] = useState<"lista" | "ranking">("lista");
  const [busca, setBusca]       = useState("");
  const [filtroCateg, setFiltroCateg] = useState("todas");
  const [apenasAtivos, setApenasAtivos] = useState(true);

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
    return r;
  }, [fornecedores, busca, filtroCateg]);

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]       = useState<number | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false);
  const [erroCNPJ, setErroCNPJ]       = useState<string | null>(null);
  const [detalheId, setDetalheId]     = useState<number | null>(null);

  const buscarCNPJQuery = trpc.compras.buscarCNPJ.useQuery(
    { cnpj: form.cnpj.replace(/\D/g, "") },
    { enabled: false, retry: false }
  );

  const criarMut    = trpc.compras.criarFornecedor.useMutation({ onSuccess: () => { refetch(); fecharModal(); toast.success("Fornecedor cadastrado!"); } });
  const atualizarMut = trpc.compras.atualizarFornecedor.useMutation({ onSuccess: () => { refetch(); fecharModal(); toast.success("Fornecedor atualizado!"); } });
  const excluirMut  = trpc.compras.excluirFornecedor.useMutation({ onSuccess: () => { refetch(); toast.success("Fornecedor desativado."); } });

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
      estado: f.estado ?? "", cep: f.cep ?? "", telefone: f.telefone ?? "", email: f.email ?? "",
      contatoNome: f.contatoNome ?? "", contatoCelular: f.contatoCelular ?? "", contatoEmail: f.contatoEmail ?? "",
      banco: f.banco ?? "", agencia: f.agencia ?? "", conta: f.conta ?? "", pix: f.pix ?? "",
      categorias: Array.isArray(f.categorias) ? f.categorias : [], observacoes: f.observacoes ?? "",
    });
    setEditando(f.id);
    setErroCNPJ(null);
    lastFetchedCNPJ.current = (f.cnpj ?? "").replace(/\D/g, "");
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setEditando(null);
    setErroCNPJ(null);
  }

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
      if (!d) { setErroCNPJ("CNPJ não encontrado na Receita Federal."); return; }

      const situacaoCod = d.situacaoCodigo ?? 0;
      if (situacaoCod !== 2) {
        setErroCNPJ(`Atenção: situação na Receita é "${d.situacaoReceita}". Cadastro bloqueado para situações irregulares.`);
        if ([3, 4, 8].includes(situacaoCod)) return;
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
        telefone: d.telefone || prev.telefone,
        email: d.email || prev.email,
      }));
      toast.success("Dados do CNPJ carregados com sucesso!");
    } catch {
      setErroCNPJ("Erro ao consultar a Receita Federal. Verifique o CNPJ e tente novamente.");
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

  function toggleCategoria(c: string) {
    setForm(prev => ({
      ...prev,
      categorias: prev.categorias.includes(c)
        ? prev.categorias.filter(x => x !== c)
        : [...prev.categorias, c],
    }));
  }

  function salvar() {
    if (!form.razaoSocial.trim()) { toast.error("Razão Social é obrigatória."); return; }
    if (editando) {
      atualizarMut.mutate({ id: editando, ...form });
    } else {
      criarMut.mutate({ companyId, ...form });
    }
  }

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
              Fornecedores
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""} cadastrado{fornecedores.length !== 1 ? "s" : ""}
            </p>
          </div>
          <DraggableCommandBar barId="fornecedores" items={[
            { id: "novo", node: <Button onClick={abrirNovo} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-4 w-4 mr-2" /> Novo Fornecedor</Button> },
          ]} />
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto mt-3 flex gap-1">
          {([["lista", "Lista de Fornecedores", Building2], ["ranking", "Ranking de Avaliações", Trophy]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
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
              <h2 className="text-base font-bold text-slate-800">Ranking de Melhores Fornecedores</h2>
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

        {/* Lista */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
        ) : lista.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
            <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhum fornecedor encontrado</p>
            <p className="text-sm text-slate-400 mt-1">Cadastre seu primeiro fornecedor clicando em "Novo Fornecedor"</p>
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
                    {/* Botão avaliar */}
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
                    {f.ativo && (
                      <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => excluirMut.mutate({ id: f.id })}>
                        <XCircle className="h-3.5 w-3.5" />
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
        <DialogContent className="max-w-[95vw] w-[1200px] max-h-[90vh] overflow-hidden p-0 gap-0 [&>[data-slot=dialog-close]]:text-white [&>[data-slot=dialog-close]]:top-5 [&>[data-slot=dialog-close]]:right-5" resizable={false}>
          <DialogHeader className="sr-only"><DialogTitle>{editando ? "Editar Fornecedor" : "Cadastro de Fornecedor"}</DialogTitle></DialogHeader>
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-lg p-2">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{editando ? "Editar Fornecedor" : "Cadastro de Fornecedor"}</h2>
                <p className="text-blue-200 text-xs">
                  {editando ? "Atualize os dados do fornecedor" : "Digite o CNPJ para preencher automaticamente"}
                </p>
              </div>
            </div>
            {form.situacaoReceita && (
              <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                form.situacaoReceita.toUpperCase().includes("ATIVA") ? "bg-emerald-400/20 text-emerald-100 border border-emerald-400/30"
                : form.situacaoReceita.toUpperCase().includes("SUSPENSA") ? "bg-yellow-400/20 text-yellow-100 border border-yellow-400/30"
                : "bg-red-400/20 text-red-100 border border-red-400/30"
              }`}>
                Receita Federal: {form.situacaoReceita}
              </div>
            )}
          </div>

          <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: "calc(90vh - 140px)" }}>
            {/* CNPJ Hero Row */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">CNPJ</Label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1 max-w-xs">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        value={form.cnpj}
                        onChange={e => setForm(p => ({ ...p, cnpj: formatCNPJ(e.target.value) }))}
                        placeholder="00.000.000/0000-00"
                        className="pl-9 font-mono h-10 text-sm border-slate-300 focus:border-blue-500"
                        maxLength={18}
                        autoFocus={!editando}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 px-4 text-xs font-semibold shrink-0 gap-2"
                      onClick={buscarCNPJ}
                      disabled={buscandoCNPJ || form.cnpj.replace(/\D/g, "").length !== 14}
                    >
                      {buscandoCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      {buscandoCNPJ ? "Consultando..." : "Buscar CNPJ"}
                    </Button>
                    {buscandoCNPJ && (
                      <span className="text-xs text-blue-600 font-medium animate-pulse">
                        Consultando Receita Federal...
                      </span>
                    )}
                  </div>
                </div>
                {!editando && (
                  <div className="text-xs text-slate-400 max-w-[200px] leading-relaxed">
                    Ao digitar o CNPJ completo, o sistema busca automaticamente os dados na Receita Federal.
                  </div>
                )}
              </div>
              {erroCNPJ && (
                <div className="flex items-center gap-2 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {erroCNPJ}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-5">
              {/* COLUNA ESQUERDA */}
              <div className="space-y-5">
                {/* Identificação */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Identificação</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <Label className="text-xs text-slate-500">Razão Social *</Label>
                      <Input value={form.razaoSocial} onChange={e => setForm(p => ({ ...p, razaoSocial: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="Nome registrado na Receita Federal" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Nome Fantasia</Label>
                      <Input value={form.nomeFantasia} onChange={e => setForm(p => ({ ...p, nomeFantasia: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="Nome comercial / marca" />
                    </div>
                  </div>
                </div>

                {/* Endereço */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Endereço</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-8">
                        <Label className="text-xs text-slate-500">Logradouro</Label>
                        <Input value={form.endereco} onChange={e => setForm(p => ({ ...p, endereco: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs text-slate-500">Nº</Label>
                        <Input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs text-slate-500">CEP</Label>
                        <Input value={form.cep} onChange={e => setForm(p => ({ ...p, cep: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-4">
                        <Label className="text-xs text-slate-500">Complemento</Label>
                        <Input value={form.complemento} onChange={e => setForm(p => ({ ...p, complemento: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs text-slate-500">Bairro</Label>
                        <Input value={form.bairro} onChange={e => setForm(p => ({ ...p, bairro: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs text-slate-500">Cidade</Label>
                        <Input value={form.cidade} onChange={e => setForm(p => ({ ...p, cidade: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs text-slate-500">UF</Label>
                        <Input value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value.toUpperCase().slice(0, 2) }))} className="mt-1 h-9 text-sm" maxLength={2} placeholder="SP" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dados Bancários */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Dados Bancários</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-slate-500">Banco</Label>
                        <Input value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="Ex: Bradesco" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Agência</Label>
                        <Input value={form.agencia} onChange={e => setForm(p => ({ ...p, agencia: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Conta</Label>
                        <Input value={form.conta} onChange={e => setForm(p => ({ ...p, conta: e.target.value }))} className="mt-1 h-9 text-sm" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Chave PIX</Label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input value={form.pix} onChange={e => setForm(p => ({ ...p, pix: e.target.value }))} className="mt-1 h-9 text-sm pl-9" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* COLUNA DIREITA */}
              <div className="space-y-5">
                {/* Contato da Empresa */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Contato da Empresa</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-500">Telefone</Label>
                        <Input value={form.telefone} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="(00) 0000-0000" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">E-mail</Label>
                        <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1 h-9 text-sm" type="email" placeholder="empresa@email.com" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contato Comercial */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Contato Comercial</span>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <Label className="text-xs text-slate-500">Nome do Contato</Label>
                      <Input value={form.contatoNome} onChange={e => setForm(p => ({ ...p, contatoNome: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="Responsável comercial" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-500">Celular</Label>
                        <Input value={form.contatoCelular} onChange={e => setForm(p => ({ ...p, contatoCelular: e.target.value }))} className="mt-1 h-9 text-sm" placeholder="(00) 90000-0000" />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">E-mail do Contato</Label>
                        <Input value={form.contatoEmail} onChange={e => setForm(p => ({ ...p, contatoEmail: e.target.value }))} className="mt-1 h-9 text-sm" type="email" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Categorias */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <Tag className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Categorias de Fornecimento</span>
                    {form.categorias.length > 0 && (
                      <Badge className="bg-blue-100 text-blue-700 text-[10px] border-0 ml-auto">{form.categorias.length} selecionada{form.categorias.length !== 1 ? "s" : ""}</Badge>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {todasCategorias.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleCategoria(c)}
                          className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all font-medium ${
                            form.categorias.includes(c)
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Observações */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Observações</span>
                  </div>
                  <div className="p-4">
                    <Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} className="text-sm resize-none" rows={3} placeholder="Informações adicionais sobre o fornecedor..." />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer fixo */}
          <div className="border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              {editando ? `Editando fornecedor #${editando}` : "Campos com * são obrigatórios"}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
              <Button onClick={salvar} disabled={criarMut.isPending || atualizarMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-6">
                {(criarMut.isPending || atualizarMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {editando ? "Salvar Alterações" : "Cadastrar Fornecedor"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
