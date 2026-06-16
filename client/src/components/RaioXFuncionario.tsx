import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatCPF, formatMoeda as _formatMoeda, fmtNum } from "@/lib/formatters";
import { usePermissions } from "@/contexts/PermissionsContext";
import { nowBrasilia, todayBrasilia } from "@/lib/dateUtils";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import {
  User, Stethoscope, GraduationCap, ClipboardList, ShieldAlert,
  Clock, DollarSign, HardHat, Calendar, MapPin, Phone, Building2, Briefcase, CreditCard,
  Printer, FileDown, X, AlertTriangle, FileText, ArrowLeft, Gift, Timer,
  History, Zap, Scale, Car, TrendingUp, ChevronRight, Activity,
  Palmtree, Shield, FileSignature, Ban, Star, Eye, ScrollText, Wrench,
  Package, PackageX, CheckCircle, XCircle, ShoppingCart,
  Trash2, Camera, Video, ImageIcon, Upload, ShieldCheck, Plus, Loader2, Pencil, RotateCcw, UserCheck, Handshake, Receipt, ExternalLink, MessageSquare,
  Lock, RefreshCw, ThumbsUp, ThumbsDown, Sparkles,
} from "lucide-react";
import { useEffect, useState, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import DocumentPreviewDialog, { canPreviewFile } from "@/components/DocumentPreviewDialog";
import { generateCertificadoIntegracaoSstPdf } from "@/lib/certificadoIntegracaoSstPdf";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

// ── FICHA DO ASO (IA) — parsers que estruturam o texto livre em LINHAS DE TABELA ──
// O objetivo é deixar os dados granulares (por restrição / por categoria de risco)
// prontos para leitura tabular e, futuramente, para gráficos de perfil do funcionário.

// Quebra o texto de restrições em itens individuais (1 frase = 1 item).
// Evita lookbehind/lookahead (iOS Safari): split simples em ". " + limpeza.
function parseRestricoesItens(raw: any): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  if (/^(nenhuma|sem restri|n[aã]o|n\/a|-)\.?$/i.test(s)) return [];
  return s
    .split(/\.\s+/)
    .map((x) => x.trim().replace(/\.+$/, "").trim())
    .filter(Boolean);
}

// Quebra os fatores de risco por CATEGORIA ("Físicos:", "Químicos:", ...).
// Retorna [{ categoria, texto }]. Se não houver rótulos reconhecidos, devolve "Geral".
function parseFatoresRiscoCategorias(raw: any): { categoria: string; texto: string }[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const labels = [
    "F[ií]sicos?",
    "Qu[íi]micos?",
    "Biol[óo]gicos?",
    "Ergon[ôo]micos?",
    "Mec[âa]nicos?",
    "(?:De\\s+)?[Aa]cidentes",
    "Psicossociais?",
    "Psicossocial",
  ];
  const re = new RegExp(`(${labels.join("|")})\\s*:`, "gi");
  const matches: { idx: number; len: number; cat: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    matches.push({ idx: m.index, len: m[0].length, cat: m[1] });
    if (m.index === re.lastIndex) re.lastIndex++; // guarda contra match vazio
  }
  const norm = (c: string): string => {
    const t = c.trim().toLowerCase();
    if (t.startsWith("f")) return "Físicos";
    if (t.startsWith("qu")) return "Químicos";
    if (t.startsWith("bi")) return "Biológicos";
    if (t.startsWith("er")) return "Ergonômicos";
    if (t.startsWith("me")) return "Mecânicos";
    if (t.includes("acidente")) return "Acidentes";
    if (t.startsWith("psi")) return "Psicossociais";
    return c.trim();
  };
  if (matches.length === 0) return [{ categoria: "Geral", texto: s }];
  const out: { categoria: string; texto: string }[] = [];
  // Preserva qualquer texto antes do 1º rótulo reconhecido (evita perda de dado).
  const preamble = s.slice(0, matches[0].idx).trim().replace(/[;.:]\s*$/, "").trim();
  if (preamble) out.push({ categoria: "Geral", texto: preamble });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx + matches[i].len;
    const end = i + 1 < matches.length ? matches[i + 1].idx : s.length;
    const texto = s.slice(start, end).trim().replace(/[;.]\s*$/, "").trim();
    if (texto) out.push({ categoria: norm(matches[i].cat), texto });
  }
  return out;
}

// Formata afastamento de horas (decimal → "Xh Ymin") — usado nos atestados parciais.
function fmtHorasAfast(dec: number | string | null | undefined): string {
  const total = Number(dec) || 0;
  let h = Math.floor(total);
  let m = Math.round((total - h) * 60);
  if (m === 60) { h += 1; m = 0; } // carry de arredondamento (evita "Xh 60min")
  if (h > 0 && m > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

// Texto único de afastamento do atestado: "Xh Ymin" (parcial) ou "N dia(s)".
function fmtAfastamentoAtestado(a: any): string {
  if (a?.afastamentoTipo === "horas") return fmtHorasAfast(a?.horasAfastamento);
  const dias = Number(a?.diasAfastamento) || 0;
  return `${dias} dia${dias === 1 ? "" : "s"}`;
}

function parseBRNumber(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  const dotParts = s.split(".");
  if (dotParts.length === 2 && dotParts[1].length === 3) return parseFloat(s.replace(/\./g, ""));
  return parseFloat(s) || 0;
}

function _formatSalario(val: string | null | undefined): string {
  if (!val) return "-";
  const num = parseBRNumber(val);
  if (isNaN(num) || num === 0) return "-";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcTempoEmpresa(dataAdmissao: string | null | undefined): string {
  if (!dataAdmissao) return "-";
  const admissao = new Date(dataAdmissao + "T00:00:00");
  const hoje = new Date();
  let anos = hoje.getFullYear() - admissao.getFullYear();
  let meses = hoje.getMonth() - admissao.getMonth();
  if (hoje.getDate() < admissao.getDate()) meses--;
  if (meses < 0) { anos--; meses += 12; }
  if (anos > 0 && meses > 0) return `${anos} ano${anos > 1 ? "s" : ""} e ${meses} ${meses > 1 ? "meses" : "mês"}`;
  if (anos > 0) return `${anos} ano${anos > 1 ? "s" : ""}`;
  if (meses > 0) return `${meses} ${meses > 1 ? "meses" : "mês"}`;
  return "Menos de 1 mês";
}

function calcIdade(dataNascimento: string | null | undefined): string {
  if (!dataNascimento) return "-";
  const nasc = new Date(dataNascimento.split("T")[0] + "T00:00:00");
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesNasc = nasc.getMonth();
  if (mesAtual < mesNasc || (mesAtual === mesNasc && hoje.getDate() < nasc.getDate())) anos--;
  return `${anos} anos`;
}

function calcDiasAniversario(dataNascimento: string | null | undefined): { aniversario: string; diasFaltando: number; texto: string } {
  if (!dataNascimento) return { aniversario: "-", diasFaltando: -1, texto: "-" };
  const nasc = new Date(dataNascimento.split("T")[0] + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const anivStr = `${String(nasc.getDate()).padStart(2, "0")}/${String(nasc.getMonth() + 1).padStart(2, "0")}`;
  let proxAniv = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
  if (proxAniv < hoje) proxAniv = new Date(hoje.getFullYear() + 1, nasc.getMonth(), nasc.getDate());
  const diff = Math.ceil((proxAniv.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return { aniversario: anivStr, diasFaltando: 0, texto: "🎂 HOJE!" };
  let meses = proxAniv.getMonth() - hoje.getMonth() + (proxAniv.getFullYear() - hoje.getFullYear()) * 12;
  const tempDate = new Date(hoje.getFullYear(), hoje.getMonth() + meses, hoje.getDate());
  let dias = Math.ceil((proxAniv.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24));
  if (dias < 0) { meses--; const tempDate2 = new Date(hoje.getFullYear(), hoje.getMonth() + meses, hoje.getDate()); dias = Math.ceil((proxAniv.getTime() - tempDate2.getTime()) / (1000 * 60 * 60 * 24)); }
  let textoFalta = "";
  if (meses > 0 && dias > 0) textoFalta = `em ${meses} ${meses > 1 ? "meses" : "mês"} e ${dias} dia${dias > 1 ? "s" : ""}`;
  else if (meses > 0) textoFalta = `em ${meses} ${meses > 1 ? "meses" : "mês"}`;
  else textoFalta = `em ${dias} dia${dias > 1 ? "s" : ""}`;
  return { aniversario: anivStr, diasFaltando: diff, texto: textoFalta };
}

function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "VENCIDO") return <Badge variant="destructive" className="text-xs">VENCIDO</Badge>;
  if (status?.includes("DIAS PARA VENCER")) {
    const cor = diasRestantes <= 7 ? "bg-red-100 text-red-800" : diasRestantes <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{status}</span>;
  }
  return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">VÁLIDO</Badge>;
}

const TIMELINE_COLORS: Record<string, string> = {
  green: "bg-green-500", red: "bg-red-500", blue: "bg-blue-500", orange: "bg-orange-500",
  purple: "bg-purple-500", amber: "bg-amber-500", teal: "bg-teal-500", cyan: "bg-cyan-500",
  emerald: "bg-emerald-500", indigo: "bg-indigo-500", gray: "bg-gray-400", violet: "bg-violet-500",
};

// Rev. 3114 — Critérios granulares da Avaliação do Cliente (Portal). Espelham
// exatamente os blocos do formulário (PortalDashboardCliente.tsx). Usados para
// detalhar TODOS os pontos analisados no Raio-X (tela + Ficha PDF), separando
// pontos fortes de pontos a melhorar.
const CRIT_PESSOA_RX: { key: string; label: string }[] = [
  { key: "postura", label: "Postura e reforço positivo" },
  { key: "documentos", label: "Entrega de documentos periódicos" },
  { key: "prontoAtendimento", label: "Pronto atendimento" },
  { key: "disponibilidade", label: "Disponibilidade" },
  { key: "conhecimentoTecnico", label: "Conhecimento técnico" },
  { key: "educacao", label: "Educação e cordialidade" },
];
const CRIT_EQUIPE_RX: { key: string; label: string }[] = [
  { key: "tecnica", label: "Qualidade técnica do serviço" },
  { key: "organizacao", label: "Organização e limpeza" },
  { key: "seguranca", label: "Segurança (EPI / procedimentos)" },
  { key: "pontualidade", label: "Pontualidade e assiduidade" },
  { key: "educacao", label: "Educação e postura" },
  { key: "comunicacao", label: "Comunicação e atendimento" },
];
const CRIT_ESCRITORIO_RX: { key: string; label: string }[] = [
  { key: "atendimento", label: "Atendimento administrativo" },
  { key: "documentacao", label: "Documentação e contratos" },
  { key: "faturamento", label: "Faturamento e financeiro" },
  { key: "agilidade", label: "Agilidade nas respostas" },
  { key: "comunicacao", label: "Comunicação e transparência" },
];
const BLOCOS_AVAL_RX: { key: string; titulo: string; crit: { key: string; label: string }[] }[] = [
  { key: "gestor", titulo: "Gestor", crit: CRIT_PESSOA_RX },
  { key: "encarregado", titulo: "Encarregado", crit: CRIT_PESSOA_RX },
  { key: "equipe", titulo: "Equipe Direta", crit: CRIT_EQUIPE_RX },
  { key: "escritorio", titulo: "Escritório Central", crit: CRIT_ESCRITORIO_RX },
];
// Extrai todos os pontos {bloco, label, nota} de um objeto `detalhes` (jsonb).
function extrairPontosAval(detalhes: any): { bloco: string; key: string; label: string; nota: number; nome?: string }[] {
  if (!detalhes || typeof detalhes !== "object") return [];
  const out: { bloco: string; key: string; label: string; nota: number; nome?: string }[] = [];
  for (const b of BLOCOS_AVAL_RX) {
    const dados = detalhes[b.key];
    if (!dados || typeof dados !== "object") continue;
    const nome = typeof dados.nome === "string" ? dados.nome : undefined;
    for (const c of b.crit) {
      const v = dados[c.key];
      if (v == null || typeof v !== "number" || Number.isNaN(v)) continue;
      out.push({ bloco: b.titulo, key: `${b.key}.${c.key}`, label: c.label, nota: v, nome });
    }
  }
  return out;
}

interface RaioXProps {
  employeeId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function RaioXFuncionario({ employeeId, open, onClose }: RaioXProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { isSensitiveHidden, canAccessModule, isAdminMaster } = usePermissions();
  // LGPD: regra geral (white-list por flag).
  // Cada flag (salarios, dados_pessoais, documentos_rh) é avaliada separadamente.
  // Só revela quando: admin master OU (tem acesso ao rh-dp E a flag NÃO está marcada).
  // Acesso ao Raio-X via "relatorios" sozinho NÃO libera nenhuma das flags.
  const canSeeFlag = (flag: string) =>
    isAdminMaster || (canAccessModule("rh-dp") && !isSensitiveHidden("rh-dp", flag));
  const hideSalary   = !canSeeFlag("salarios");
  const hidePersonal = !canSeeFlag("dados_pessoais");
  const hideDocs     = !canSeeFlag("documentos_rh");
  const SALARY_MASK = "•••••";
  const PII_MASK    = "•••••";
  const formatSalario = (val: string | null | undefined): string =>
    hideSalary ? SALARY_MASK : _formatSalario(val);
  const formatMoeda = (val: any): string =>
    hideSalary ? SALARY_MASK : _formatMoeda(val);
  // Máscaras LGPD para dados pessoais
  const maskPII      = (val: any): string => hidePersonal ? PII_MASK : (val ?? "-");
  const formatCPFSafe = (val: string | null | undefined): string =>
    hidePersonal ? PII_MASK : formatCPF(val || "");
  const formatDateSafe = (val: string | null | undefined): string =>
    hidePersonal ? PII_MASK : formatDate(val);
  const calcIdadeSafe = (val: string | null | undefined): string =>
    hidePersonal ? PII_MASK : calcIdade(val);
  const calcDiasAniversarioSafe = (val: string | null | undefined) =>
    hidePersonal
      ? { aniversario: PII_MASK, diasFaltando: -1, texto: PII_MASK }
      : calcDiasAniversario(val);
  const [activeTab, setActiveTab] = useState("timeline");
  const { data: raioX, isLoading } = trpc.docs.raioX.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId && open }
  );

  useEffect(() => {
    if (open) { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }
  }, [open]);

  // Avaliações de desempenho - MUST be called before any conditional return to avoid hooks order violation
  const empSkillsQuery = trpc.skills.employeeSkills.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId && open }
  );
  const empSkills = empSkillsQuery.data || [];

  const avaliacoesQuery = trpc.avaliacao.avaliacoes.getByEmployee.useQuery(
    { employeeId: employeeId!, companyId: selectedCompany?.id || 0 },
    { enabled: !!employeeId && open && !!selectedCompany?.id }
  );
  const avaliacoesList = avaliacoesQuery.data || [];

  const terminationChecklistQ = trpc.employees.getTerminationChecklist.useQuery(
    { companyId: selectedCompany?.id || 0, employeeId: employeeId! },
    { enabled: !!employeeId && open && !!selectedCompany?.id }
  );
  const terminationChecklist = terminationChecklistQ.data || [];
  const initChecklistMut = trpc.employees.initTerminationChecklist.useMutation({
    onSuccess: () => terminationChecklistQ.refetch(),
  });
  const toggleChecklistMut = trpc.employees.toggleTerminationChecklistItem.useMutation({
    onSuccess: () => terminationChecklistQ.refetch(),
  });

  const coberturaSeguroQ = trpc.seguroVida.getCoberturaByEmployee.useQuery(
    { companyId: selectedCompany?.id || 0, employeeId: employeeId! },
    { enabled: !!employeeId && open && !!selectedCompany?.id }
  );

  const integracoesQ = trpc.integracoes.listar.useQuery(
    { companyId: selectedCompany?.id || 0, employeeId: employeeId! },
    { enabled: !!employeeId && open && !!selectedCompany?.id }
  );
  const integracoes = integracoesQ.data || [];

  const integracoesSSTQ = trpc.integracaoSST.historicoColaborador.useQuery(
    { companyId: selectedCompany?.id || 0, employeeId: employeeId! },
    { enabled: !!employeeId && open && !!selectedCompany?.id }
  );
  const integracoesSST = integracoesSSTQ.data || [];

  const [novaIntegracaoForm, setNovaIntegracaoForm] = useState<any>(null);
  const utils2 = trpc.useUtils();
  const criarIntegracaoMut = trpc.integracoes.criar.useMutation({
    onSuccess: () => { utils2.integracoes.listar.invalidate(); setNovaIntegracaoForm(null); toast.success("Integração registrada!"); },
    onError: (e) => toast.error(e.message || "Erro ao registrar integração"),
  });
  const excluirIntegracaoMut = trpc.integracoes.excluir.useMutation({
    onSuccess: () => { utils2.integracoes.listar.invalidate(); toast.success("Integração removida."); },
  });

  // Rev. 2153 — ADM Master: zerar histórico de Termos FCSign do colaborador
  // (bulk soft-cancel via signatures.adminDelete, idêntico ao padrão da
  // Rev. 2149 no painel Controle de Documentos). Útil pra limpar testes.
  const [zerandoTermos, setZerandoTermos] = useState(false);
  const adminDeleteSigMut = trpc.signatures.adminDelete.useMutation();

  // Estado do lightbox da foto do colaborador (declarado antes do useEffect
  // de ESC para evitar TDZ ao avaliar o array de dependências).
  const [fotoAmpliada, setFotoAmpliada] = useState(false);
  const [acidenteDetalhe, setAcidenteDetalhe] = useState<any>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Se o lightbox da foto estiver aberto, ESC fecha somente o lightbox
      // (não o Raio-X inteiro).
      if (fotoAmpliada) {
        e.stopPropagation();
        setFotoAmpliada(false);
        return;
      }
      // Se o modal de detalhe do acidente estiver aberto, ESC fecha somente
      // ele (não o Raio-X inteiro).
      if (acidenteDetalhe) {
        e.stopPropagation();
        setAcidenteDetalhe(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, fotoAmpliada, acidenteDetalhe]);

  // Limpa o detalhe do acidente quando o Raio-X é fechado (evita reabrir com
  // estado obsoleto, já que o componente pode não desmontar).
  useEffect(() => {
    if (!open) setAcidenteDetalhe(null);
  }, [open]);

  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Almoxarifado — desconto em folha
  const [descontoModal, setDescontoModal] = useState<{ loan: any } | null>(null);
  const [descontoValor, setDescontoValor] = useState("");
  const [descontoDescricao, setDescontoDescricao] = useState("");
  const [descontoMes, setDescontoMes] = useState("");
  const [reprovarModal, setReprovarModal] = useState<{ id: number } | null>(null);
  const [reprovarMotivo, setReprovarMotivo] = useState("");
  const [atestPreviewDoc, setAtestPreviewDoc] = useState<{ url: string; name: string; title: string } | null>(null);
  // Rev. 2543 — rastreabilidade: evento da timeline selecionado p/ modal de detalhe
  const [timelineEvt, setTimelineEvt] = useState<any | null>(null);

  const utils = trpc.useContext();
  const criarDescontoMut = trpc.warehouse.criarDescontoFolha.useMutation({
    onSuccess: () => {
      utils.docs.raioX.invalidate({ employeeId: employeeId! });
      setDescontoModal(null);
      setDescontoValor("");
      setDescontoDescricao("");
      setDescontoMes("");
    },
  });
  const aprovarDescontoMut = trpc.warehouse.aprovarDescontoFolha.useMutation({
    onSuccess: () => utils.docs.raioX.invalidate({ employeeId: employeeId! }),
  });
  const reprovarDescontoMut = trpc.warehouse.reprovarDescontoFolha.useMutation({
    onSuccess: () => {
      utils.docs.raioX.invalidate({ employeeId: employeeId! });
      setReprovarModal(null);
      setReprovarMotivo("");
    },
  });

  // Rev. 1770 — early return MOVIDO pra depois de TODOS os hooks (estava aqui
  // antes da Rev. 1769 introduzir useState/useQuery/useCallback do detalhe DDS,
  // o que violava a ordem de hooks do React quando o modal abria/fechava).

  const emp = raioX?.funcionario;
  const funcaoDetalhes = raioX?.funcaoDetalhes;
  const asos = raioX?.asos || [];
  const treinamentos = raioX?.treinamentos || [];
  const atestados = raioX?.atestados || [];
  const advertencias = raioX?.advertencias || [];
  const pontoResumo = raioX?.ponto || [];
  const atrasosDetalhados = raioX?.atrasosDetalhados || [];
  const faltasDetalhadas = raioX?.faltasDetalhadas || [];
  const assiduidade = (raioX as any)?.assiduidade || { media: 100, totalDiasTrabalhados: 0, totalFaltas: 0, mesesAvaliados: 0 };
  const desempenho = (raioX as any)?.desempenho || { isGestor: false, atrasos: { total: 0, totalMinutos: 0 }, obrasGeridas: [], avaliacaoCliente: { total: 0, mediaGeral: null, mediaGestor: null, mediaEquipe: null, mediaPrazo: null, mediaQualidade: null, historico: [] } };
  const folhaPagamento = raioX?.folhaPagamento || [];
  const episEntregas = raioX?.epis || [];
  const horasExtras = raioX?.horasExtras || [];
  const historicoFuncional = raioX?.historicoFuncional || [];
  const acidentes = raioX?.acidentes || [];
  const processos = raioX?.processos || [];
  const timeline = raioX?.timeline || [];
  const valeAlimentacao = raioX?.valeAlimentacao || [];
  const adiantamentos = raioX?.adiantamentos || [];
  const rateioObras = raioX?.rateioObras || [];
  // Rev. 2150 — Termos Assinados via FCSign (Termo de Responsabilidade etc.)
  const fcsignSessions: any[] = (raioX as any)?.fcsignSessions || [];
  const termosFcsign: any[] = fcsignSessions.filter((s: any) => s && s.status !== "cancelado");
  const avisosPrevios = (raioX as any)?.avisosPrevios || [];
  const ferias = (raioX as any)?.ferias || [];
  const cipa = (raioX as any)?.cipa || [];
  const dds = (raioX as any)?.dds || [];
  // Rev. 1769 — modal de detalhe do DDS clicado (roteiro completo + assinatura + PDF)
  const [ddsDetalhe, setDdsDetalhe] = useState<{ sessaoId: number; sfId: number } | null>(null);
  const ddsDetalheQuery = trpc.dds.getSessao.useQuery(
    { companyId: selectedCompany?.id || 0, id: ddsDetalhe?.sessaoId || 0 },
    { enabled: !!ddsDetalhe?.sessaoId && !!selectedCompany?.id }
  );
  const ddsAssinaturaQuery = trpc.dds.getAssinaturaImg.useQuery(
    { companyId: selectedCompany?.id || 0, sessaoId: ddsDetalhe?.sessaoId || 0, funcionarioId: ddsDetalhe?.sfId || 0 },
    { enabled: !!ddsDetalhe?.sessaoId && !!ddsDetalhe?.sfId && !!selectedCompany?.id }
  );
  const gerarPdfDds = useCallback(() => {
    const sessao: any = ddsDetalheQuery.data;
    if (!sessao) return;
    const meuFunc: any = (sessao.funcionarios || []).find((f: any) => f.id === ddsDetalhe?.sfId);
    const assImg = ddsAssinaturaQuery.data?.assinaturaImg || null;
    const fmt = (d?: string | null) => d ? String(d).split('-').reverse().join('/') : '';
    const presentes = (sessao.funcionarios || []).filter((f: any) => Number(f.presente) === 1);
    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
    const conteudoHtml = sessao.conteudoMd ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:11pt;line-height:1.5;margin:0;">${escapeHtml(sessao.conteudoMd)}</pre>` : '<em style="color:#999">Sem roteiro registrado.</em>';
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DDS — ${escapeHtml(sessao.tituloTema || '')}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; font-size: 11pt; }
  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  h2 { font-size: 12pt; margin: 16px 0 6px 0; padding-bottom: 4px; border-bottom: 1px solid #ccc; color: #234; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 10pt; color: #333; margin-bottom: 8px; }
  .meta b { color: #111; }
  .ass-box { border: 1px solid #999; border-radius: 6px; padding: 12px; margin-top: 8px; }
  .ass-img { max-height: 110px; max-width: 100%; display: block; margin-top: 6px; border: 1px dashed #bbb; padding: 4px; background: #fafafa; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  th { background: #f0f4f8; }
  .small { font-size: 9pt; color: #555; }
</style></head><body>
<h1>Diálogo Diário de Segurança (DDS)</h1>
<div class="small">Documento gerado em ${new Date().toLocaleString('pt-BR')}</div>
<h2>Identificação da Sessão</h2>
<div class="meta">
  <div><b>Tema:</b> ${escapeHtml(sessao.tituloTema || '-')}</div>
  <div><b>Data / Hora:</b> ${fmt(sessao.data)}${sessao.hora ? ' ' + escapeHtml(sessao.hora) : ''}</div>
  <div><b>Obra / Local:</b> ${escapeHtml(sessao.obraNome || sessao.local || '-')}</div>
  <div><b>Instrutor:</b> ${escapeHtml(sessao.instrutor || '-')}</div>
  <div><b>Status:</b> ${escapeHtml(sessao.status || '-')}</div>
  <div><b>Presentes:</b> ${presentes.length} de ${(sessao.funcionarios || []).length}</div>
</div>
<h2>Roteiro do DDS</h2>
${conteudoHtml}
<h2>Assinatura — ${escapeHtml(meuFunc?.nome || emp?.name || '')}</h2>
<div class="ass-box">
  <div><b>CPF:</b> ${escapeHtml(meuFunc?.cpf || emp?.cpf || '-')} &nbsp;&nbsp; <b>Função:</b> ${escapeHtml(meuFunc?.funcao || emp?.funcao || '-')}</div>
  <div style="margin-top:4px;"><b>Presença:</b> ${Number(meuFunc?.presente) === 1 ? 'Presente' : 'Ausente'} &nbsp;&nbsp; <b>Assinatura:</b> ${meuFunc?.assinaturaTipo ? `${meuFunc.assinaturaTipo} em ${meuFunc.assinadoEm ? new Date(meuFunc.assinadoEm).toLocaleString('pt-BR') : '-'}` : 'Pendente'}</div>
  ${assImg ? `<img class="ass-img" src="${assImg}" alt="Assinatura" />` : '<div class="small" style="margin-top:8px;color:#a00">Assinatura não registrada.</div>'}
</div>
<h2>Lista de Presença Completa</h2>
<table><thead><tr><th>Nome</th><th>CPF</th><th>Função</th><th>Presença</th><th>Assinatura</th></tr></thead><tbody>
${(sessao.funcionarios || []).map((f: any) => `<tr><td>${escapeHtml(f.nome || '')}</td><td>${escapeHtml(f.cpf || '')}</td><td>${escapeHtml(f.funcao || '')}</td><td>${Number(f.presente) === 1 ? 'Presente' : 'Ausente'}</td><td>${f.temAssinatura || f.assinaturaTipo === 'fcsign' ? 'Assinada' : 'Pendente'}</td></tr>`).join('')}
</tbody></table>
${sessao.observacoes ? `<h2>Observações</h2><div>${escapeHtml(sessao.observacoes)}</div>` : ''}
<script>window.onload = () => { setTimeout(() => window.print(), 300); };</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Popup bloqueado. Permita pop-ups pra gerar o PDF.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }, [ddsDetalheQuery.data, ddsAssinaturaQuery.data, ddsDetalhe, emp]);

  // Rev. 1770 — early return colocado AQUI (após todos os hooks: useState,
  // useQuery, useCallback) pra cumprir as Rules of Hooks.
  if (!open || !employeeId) return null;

  const pjContratos = (raioX as any)?.pjContratos || [];
  const pjPagamentos = (raioX as any)?.pjPagamentos || [];
  const pjConformidade = (raioX as any)?.pjConformidade || null;
  const emprestimosAlmox = (raioX as any)?.emprestimosAlmox || [];
  const descontosAlmox = (raioX as any)?.descontosAlmox || [];
  const insumosAlmox = (raioX as any)?.insumosAlmox || [];
  const coberturaSeguro = coberturaSeguroQ.data as any | null;

  const fmtCapitalSV = (v: string | null | undefined): string => {
    if (!v) return "-";
    const n = parseBRNumber(v);
    if (!n) return "-";
    return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const fmtPremioSV = (v: string | null | undefined): string => {
    if (!v) return "-";
    const n = parseBRNumber(v);
    if (!n) return "-";
    return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}`;
  };
  const svStatusLabel = (status: string | undefined | null) => {
    if (status === "ativo") return { label: "Segurado Ativo", cls: "bg-green-100 text-green-800" };
    if (status === "pendente_inclusao") return { label: "Pend. Inclusão", cls: "bg-yellow-100 text-yellow-800" };
    if (status === "pendente_cancelamento") return { label: "Pend. Cancelamento", cls: "bg-orange-100 text-orange-800" };
    if (status === "cancelado") return { label: "Sem Cobertura", cls: "bg-red-100 text-red-800" };
    return { label: "Sem Registro", cls: "bg-gray-100 text-gray-600" };
  };

  const asosVencidos = asos.filter((a: any) => a.status === "VENCIDO").length;
  const asosAVencer = asos.filter((a: any) => a.status?.includes("DIAS PARA VENCER")).length;
  const userName = user?.name || user?.username || "Usuário";
  const dataEmissao = nowBrasilia();

  // Total HE
  const totalHEHoras = horasExtras.reduce((s: number, h: any) => s + parseFloat(h.quantidadeHoras || "0"), 0);
  const totalHEValor = horasExtras.reduce((s: number, h: any) => s + parseFloat(h.valorTotal || "0"), 0);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const logoUrl = selectedCompany?.logoUrl || "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "Empresa";
    const cnpjEmpresa = selectedCompany?.cnpj || "";

    const css = `@page{size:A4 portrait;margin:12mm 15mm 20mm 15mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.4;padding-bottom:40px}.logo-bar{background:#1B2A4A;padding:14px 20px;display:flex;align-items:center;gap:16px;margin-bottom:16px;border-radius:6px}.logo-bar img{height:50px;object-fit:contain}.logo-bar .title{color:white;flex:1}.logo-bar .title h1{font-size:16px;font-weight:bold;letter-spacing:1.5px;margin-bottom:2px}.logo-bar .title p{font-size:10px;opacity:0.85}.logo-bar .info-right{color:white;text-align:right;font-size:9px;opacity:0.9}.logo-bar .info-right p{margin-bottom:2px}.emp-name-bar{background:#f0f4f8;border-left:4px solid #1B2A4A;padding:10px 16px;margin-bottom:14px;border-radius:0 4px 4px 0;display:flex;justify-content:space-between;align-items:center}.emp-name-bar h2{font-size:15px;font-weight:700;color:#1B2A4A}.emp-name-bar .status-badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:600}.section{margin-bottom:10px;page-break-inside:avoid}.section-title{font-size:12px;font-weight:700;color:#1B2A4A;border-bottom:2px solid #2d4a7a;padding-bottom:3px;margin-bottom:6px;display:flex;align-items:center;gap:6px}.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px;margin-bottom:8px}.info-item{font-size:10px}.info-item strong{color:#374151}table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px}th{background:#e8edf4;color:#1B2A4A;font-weight:600;text-align:left;padding:4px 6px;border:1px solid #d1d9e6}td{padding:4px 6px;border:1px solid #e5e7eb}tr:nth-child(even){background:#f9fafb}.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:600}.badge-green{background:#dcfce7;color:#166534}.badge-red{background:#fef2f2;color:#991b1b}.badge-yellow{background:#fefce8;color:#854d0e}.badge-blue{background:#e8edf4;color:#1B2A4A}.badge-orange{background:#fff7ed;color:#9a3412}.alert-box{background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:8px 10px;margin-bottom:8px;font-size:9px;color:#991b1b}.footer{position:fixed;bottom:0;left:0;right:0;padding:6px 15mm;border-top:2px solid #1B2A4A;font-size:8px;display:flex;justify-content:space-between;background:white}.lgpd{color:#dc2626;font-weight:600}`;

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Raio-X - ${emp?.nomeCompleto || ""}</title><style>${css}</style></head><body>`;

    // HEADER COM LOGO
    const statusColor = emp?.status === 'Ativo' ? 'background:#dcfce7;color:#166534' : emp?.status === 'Desligado' ? 'background:#fef2f2;color:#991b1b' : emp?.status === 'Ferias' ? 'background:#dbeafe;color:#1e40af' : emp?.status === 'Afastado' ? 'background:#fefce8;color:#854d0e' : 'background:#f3f4f6;color:#374151';
    html += `<div class="logo-bar"><img src="${window.location.origin}/logo-fc-branco-amarelo.png?v=1712" alt="FC Engenharia" /><div class="title"><h1>RAIO-X DO FUNCION\u00C1RIO</h1><p>${nomeEmpresa.toUpperCase()}${cnpjEmpresa ? ' — CNPJ: ' + cnpjEmpresa : ''}</p></div><div class="info-right"><p>CPF: ${formatCPFSafe(emp?.cpf)}</p><p>Status: ${emp?.status || "-"}</p>${(emp as any)?.codigoInterno ? `<p>C\u00F3d: ${(emp as any).codigoInterno}</p>` : ''}<p>${dataEmissao}</p></div></div>`;
    html += `<div class="emp-name-bar">${emp?.fotoUrl ? `<img src="${emp.fotoUrl}" alt="Foto" style="width:60px;height:60px;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #1B2A4A;box-shadow:0 2px 8px rgba(0,0,0,0.15);margin-right:12px;" />` : ''}<h2>${emp?.nomeCompleto || "-"}</h2><span class="status-badge" style="${statusColor}">${emp?.status || "-"}</span></div>`;

    // DADOS PESSOAIS
    html += `<div class="section"><div class="section-title">\u{1F464} Dados Pessoais</div><div class="info-grid">`;
    const campos = [
      ["Fun\u00E7\u00E3o", emp?.funcao || emp?.cargo || "-"],
      ["Setor", emp?.setor || "-"],
      ["Admiss\u00E3o", formatDate(emp?.dataAdmissao)],
      ["Tempo de Empresa", calcTempoEmpresa(emp?.dataAdmissao)],
      ["Sal\u00E1rio Base", formatSalario(emp?.salarioBase)],
      ["Valor/Hora", formatSalario(emp?.valorHora)],
      ["Nascimento", formatDateSafe(emp?.dataNascimento)],
      ["Idade", calcIdadeSafe(emp?.dataNascimento)],
      ["Sexo", hidePersonal ? PII_MASK : (emp?.sexo === "M" ? "Masculino" : emp?.sexo === "F" ? "Feminino" : emp?.sexo || "-")],
      ["Estado Civil", hidePersonal ? PII_MASK : (emp?.estadoCivil?.replace(/_/g, " ") || "-")],
      ["RG", maskPII(emp?.rg)],
      ["CTPS", maskPII(emp?.ctps)],
      ["PIS", maskPII(emp?.pis)],
      ["Telefone", maskPII(emp?.telefone || emp?.celular)],
      ["E-mail", maskPII(emp?.email)],
      ["Contrato", emp?.tipoContrato || "-"],
      ["Banco", maskPII(emp?.bancoNome || emp?.banco)],
      ["Ag\u00EAncia/Conta", hidePersonal ? PII_MASK : `${emp?.agencia || "-"} / ${emp?.conta || "-"}`],
    ];
    campos.forEach(([label, value]) => { html += `<div class="info-item"><strong>${label}:</strong> ${value}</div>`; });
    html += `</div>`;
    // JORNADA DE TRABALHO - tabela visual ou texto
    if (emp?.jornadaTrabalho && emp.jornadaTrabalho !== '-') {
      const jt = emp.jornadaTrabalho;
      const isJson = typeof jt === 'string' && jt.trim().startsWith('{');
      if (isJson) {
        try {
          const jornada = JSON.parse(jt);
const diasMap: Record<string, string> = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
           const diasOrdem = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
           html += `<div style="margin-top:8px"><strong>Jornada de Trabalho:</strong></div>`;
           html += `<table style="width:100%;margin-top:4px;font-size:11px;border-collapse:collapse"><thead><tr style="background:#e0e7ff">`;
           diasOrdem.forEach(d => { if (jornada[d]) html += `<th style="padding:3px 6px;border:1px solid #c7d2fe;text-align:center">${diasMap[d]}</th>`; });
          html += `</tr></thead><tbody><tr>`;
          diasOrdem.forEach(d => { if (jornada[d]) { const j = jornada[d]; html += `<td style="padding:3px 6px;border:1px solid #c7d2fe;text-align:center">${j.entrada || '-'} - ${j.saida || '-'}</td>`; } });
          html += `</tr></tbody></table>`;
        } catch { html += `<div class="info-item"><strong>Jornada:</strong> ${jt}</div>`; }
      } else {
        html += `<div class="info-item" style="margin-top:4px"><strong>Jornada:</strong> ${jt}</div>`;
      }
    }
    if (emp?.logradouro) {
      const enderecoStr = hidePersonal
        ? PII_MASK
        : `${emp.logradouro}${emp.numero ? `, ${emp.numero}` : ""}${emp.complemento ? ` - ${emp.complemento}` : ""}${emp.bairro ? `, ${emp.bairro}` : ""}${emp.cidade ? ` - ${emp.cidade}` : ""}${emp.estado ? `/${emp.estado}` : ""}${emp.cep ? ` - CEP: ${emp.cep}` : ""}`;
      html += `<div class="info-item" style="margin-top:2px"><strong>Endere\u00E7o:</strong> ${enderecoStr}</div>`;
    }
    if (emp?.dataDemissao) html += `<div class="info-item" style="color:#dc2626;margin-top:4px"><strong>Desligado em:</strong> ${formatDate(emp.dataDemissao)}</div>`;
    html += `</div>`;

    // ALERTAS
    if (advertencias.length >= 3) html += `<div class="alert-box"><strong>\u26A0 ALERTA CLT:</strong> ${advertencias.length} advert\u00EAncias registradas. ${advertencias.length >= 4 ? "Recomenda-se an\u00E1lise para poss\u00EDvel Justa Causa (Art. 482 CLT)." : "Pr\u00F3ximo passo: Suspens\u00E3o (Art. 474 CLT)."}</div>`;
    if (acidentes.length > 0) html += `<div class="alert-box" style="background:#fffbeb;border-color:#fde68a;color:#92400e"><strong>\u26A0 Hist\u00F3rico de Acidentes:</strong> ${acidentes.length} acidente(s) de trabalho registrado(s).</div>`;

    // ASOs
    if (asos.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1FA7A} ASOs (${asos.length})</div><table><thead><tr><th>Tipo</th><th>Data Exame</th><th>Validade</th><th>Status</th><th>Vencimento</th><th>Resultado</th><th>M\u00E9dico</th><th>CRM</th></tr></thead><tbody>`;
      asos.forEach((a: any) => {
        const badgeCls = a.status === "VENCIDO" ? "badge-red" : a.status?.includes("DIAS") ? "badge-yellow" : "badge-green";
        html += `<tr><td>${a.tipo}</td><td>${formatDate(a.dataExame)}</td><td>${a.validadeDias || 365} dias</td><td><span class="badge ${badgeCls}">${a.status || "V\u00C1LIDO"}</span></td><td>${formatDate(a.dataVencimento)}</td><td style="color:${a.resultado === "Apto" ? "#166534" : "#991b1b"};font-weight:600">${a.resultado}</td><td>${a.medico || "-"}</td><td>${a.crm || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // TREINAMENTOS
    if (treinamentos.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F393} Treinamentos (${treinamentos.length})</div><table><thead><tr><th>Treinamento</th><th>Norma</th><th>Carga H.</th><th>Realiza\u00E7\u00E3o</th><th>Validade</th><th>Status</th><th>Instrutor</th></tr></thead><tbody>`;
      treinamentos.forEach((t: any) => {
        const badgeCls = t.statusCalculado === "VENCIDO" ? "badge-red" : t.statusCalculado?.includes("DIAS") ? "badge-yellow" : "badge-green";
        html += `<tr><td>${t.nome}</td><td>${t.norma || "-"}</td><td>${t.cargaHoraria || "-"}</td><td>${formatDate(t.dataRealizacao)}</td><td>${formatDate(t.dataValidade)}</td><td><span class="badge ${badgeCls}">${t.statusCalculado || "V\u00C1LIDO"}</span></td><td>${t.instrutor || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ATESTADOS
    if (atestados.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4CB} Atestados (${atestados.length})</div><table><thead><tr><th>Tipo</th><th>Data</th><th>Afastamento</th><th>Retorno</th><th>CID</th><th>M\u00E9dico</th><th>Observa\u00E7\u00F5es</th></tr></thead><tbody>`;
      atestados.forEach((a: any) => {
        const afastTxt = a.afastamentoTipo === "horas" ? `${fmtHorasAfast(a.horasAfastamento)} (horas)` : fmtAfastamentoAtestado(a);
        html += `<tr><td>${a.tipo}</td><td>${formatDate(a.dataEmissao)}</td><td style="text-align:center;font-weight:600">${afastTxt}</td><td>${formatDate(a.dataRetorno)}</td><td>${a.cid || "-"}</td><td>${a.medico || "-"}</td><td>${a.observacoes || a.descricao || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ADVERT\u00CANCIAS
    if (advertencias.length > 0) {
      html += `<div class="section"><div class="section-title">\u26A0\uFE0F Advert\u00EAncias (${advertencias.length})</div><table><thead><tr><th>Seq.</th><th>Tipo</th><th>Data</th><th>Motivo</th><th>Testemunhas</th><th>Aplicado por</th></tr></thead><tbody>`;
      advertencias.forEach((a: any, idx: number) => {
        const tipo = a.tipoAdvertencia === "Suspensao" ? "Suspens\u00E3o" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
        html += `<tr><td style="text-align:center;font-weight:700">${a.sequencia || idx + 1}\u00AA</td><td><span class="badge ${a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "badge-red" : "badge-orange"}">${tipo}</span></td><td>${formatDate(a.dataOcorrencia)}</td><td>${a.motivo || "-"}</td><td>${a.testemunhas || "-"}</td><td>${a.aplicadoPor || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // HORAS EXTRAS
    if (horasExtras.length > 0) {
      html += `<div class="section"><div class="section-title">\u26A1 Horas Extras (${horasExtras.length}) \u2014 Total: ${totalHEHoras.toFixed(1)}h | Custo: ${formatSalario(String(totalHEValor.toFixed(2)))}</div><table><thead><tr><th>Compet\u00EAncia</th><th>Horas</th><th>% Acr\u00E9scimo</th><th>Valor/Hora</th><th>Valor Total</th><th>Descri\u00E7\u00E3o</th></tr></thead><tbody>`;
      horasExtras.forEach((h: any) => {
        html += `<tr><td>${h.mesReferencia ? h.mesReferencia.split("-").reverse().join("/") : "—"}</td><td style="text-align:right;font-weight:600">${h.quantidadeHoras}h</td><td style="text-align:right">${h.percentualAcrescimo || "50"}%</td><td style="text-align:right">${formatSalario(h.valorHoraBase)}</td><td style="text-align:right;font-weight:700;color:#dc2626">${formatSalario(h.valorTotal)}</td><td>${h.descricao || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // EPIs
    if (episEntregas.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F9E4} EPIs Entregues (${episEntregas.length})</div><table><thead><tr><th>EPI</th><th>CA</th><th>Qtd</th><th>Data Entrega</th><th>Data Devolu\u00E7\u00E3o</th><th>Motivo</th></tr></thead><tbody>`;
      episEntregas.forEach((e: any) => {
        html += `<tr><td>${e.nomeEpi || "-"}</td><td>${e.ca || "-"}</td><td style="text-align:center">${e.quantidade || 1}</td><td>${formatDate(e.dataEntrega)}</td><td>${formatDate(e.dataDevolucao)}</td><td>${e.motivo || "Entrega regular"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ACIDENTES
    if (acidentes.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F6A8} Acidentes de Trabalho (${acidentes.length})</div><table><thead><tr><th>Data</th><th>Hora</th><th>Tipo</th><th>Gravidade</th><th>Local</th><th>Parte Corpo</th><th>Dias Afast.</th><th>CAT</th></tr></thead><tbody>`;
      acidentes.forEach((a: any) => {
        html += `<tr><td>${formatDate(a.dataAcidente)}</td><td>${a.horaAcidente || "-"}</td><td>${a.tipoAcidente?.replace(/_/g, " ")}</td><td><span class="badge ${a.gravidade === "Grave" || a.gravidade === "Fatal" ? "badge-red" : "badge-yellow"}">${a.gravidade}</span></td><td>${a.localAcidente || "-"}</td><td>${a.parteCorpoAtingida || "-"}</td><td style="text-align:center;font-weight:600">${a.diasAfastamento || 0}</td><td>${a.catNumero || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // PROCESSOS TRABALHISTAS
    if (processos.length > 0) {
      html += `<div class="section"><div class="section-title">\u2696\uFE0F Processos Trabalhistas (${processos.length})</div><table><thead><tr><th>N\u00FAmero</th><th>Vara</th><th>Comarca</th><th>Tipo A\u00E7\u00E3o</th><th>Risco</th><th>Valor Causa</th><th>Valor Acordo</th><th>Status</th></tr></thead><tbody>`;
      processos.forEach((p: any) => {
        html += `<tr><td>${p.numeroProcesso}</td><td>${p.vara || "-"}</td><td>${p.comarca || "-"}</td><td>${p.tipoAcao?.replace(/_/g, " ") || "-"}</td><td><span class="badge ${p.risco === "alto" || p.risco === "critico" ? "badge-red" : "badge-yellow"}">${p.risco}</span></td><td>${formatSalario(p.valorCausa)}</td><td>${formatSalario(p.valorAcordo)}</td><td>${p.status?.replace(/_/g, " ")}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // HIST\u00D3RICO FUNCIONAL
    if (historicoFuncional.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4C8} Hist\u00F3rico Funcional (${historicoFuncional.length})</div><table><thead><tr><th>Data</th><th>Tipo</th><th>Valor Anterior</th><th>Valor Novo</th><th>Descri\u00E7\u00E3o</th></tr></thead><tbody>`;
      const tipoLabel: Record<string, string> = { Admissao: "Admiss\u00E3o", Promocao: "Promo\u00E7\u00E3o", Transferencia: "Transfer\u00EAncia", Mudanca_Funcao: "Mudan\u00E7a de Fun\u00E7\u00E3o", Mudanca_Setor: "Mudan\u00E7a de Setor", Mudanca_Salario: "Altera\u00E7\u00E3o Salarial", Afastamento: "Afastamento", Retorno: "Retorno", Ferias: "F\u00E9rias", Desligamento: "Desligamento", Outros: "Outros" };
      historicoFuncional.forEach((h: any) => {
        const _maskHist = hideSalary && h.tipo === "Mudanca_Salario";
        const _vAnt = _maskHist ? SALARY_MASK : (h.valorAnterior || "-");
        const _vNov = _maskHist ? SALARY_MASK : (h.valorNovo || "-");
        html += `<tr><td>${formatDate(h.dataEvento)}</td><td><span class="badge badge-blue">${tipoLabel[h.tipo] || h.tipo}</span></td><td>${_vAnt}</td><td style="font-weight:600">${_vNov}</td><td>${h.descricao || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // PONTO
    if (pontoResumo.length > 0) {
      // Banner de assiduidade geral no PDF
      if (assiduidade.mesesAvaliados > 0) {
        const cor = assiduidade.media >= 95 ? "#059669" : assiduidade.media >= 85 ? "#d97706" : "#dc2626";
        const bgCor = assiduidade.media >= 95 ? "#ecfdf5" : assiduidade.media >= 85 ? "#fffbeb" : "#fef2f2";
        html += `<div class="section"><div style="background:${bgCor};border:2px solid ${cor};border-radius:8px;padding:12px;margin-bottom:8px;">`;
        html += `<div style="font-size:11px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.5px">Assiduidade Média Geral</div>`;
        html += `<div style="font-size:24px;font-weight:bold;color:${cor};margin-top:4px">${assiduidade.media}%</div>`;
        html += `<div style="font-size:11px;color:#6b7280;margin-top:2px">${assiduidade.totalDiasTrabalhados} dia(s) trabalhado(s) de ${assiduidade.totalDiasTrabalhados + assiduidade.totalFaltas} registrado(s) — ${assiduidade.totalFaltas} falta(s) em ${assiduidade.mesesAvaliados} mês(es)</div>`;
        html += `</div></div>`;
      }
      html += `<div class="section"><div class="section-title">\u{1F552} Resumo de Ponto (${pontoResumo.length} meses)</div><table><thead><tr><th>Compet\u00EAncia</th><th>Dias Trab.</th><th>Faltas</th><th>Assiduidade</th><th>Ajustes Manuais</th></tr></thead><tbody>`;
      pontoResumo.forEach((p: any) => {
        const perc = typeof p.assiduidadePerc === "number" ? p.assiduidadePerc : 100;
        const corP = perc >= 95 ? "#059669" : perc >= 85 ? "#d97706" : "#dc2626";
        const corF = (p.faltas || 0) > 0 ? "#dc2626" : "#9ca3af";
        html += `<tr><td>${p.mesReferencia ? p.mesReferencia.split("-").reverse().join("/") : "—"}</td><td style="text-align:center">${p.diasTrabalhados}</td><td style="text-align:center;color:${corF};font-weight:600">${p.faltas || 0}</td><td style="text-align:center;color:${corP};font-weight:700">${perc}%</td><td style="text-align:center">${p.ajustesManuais || 0}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // FOLHA
    if (folhaPagamento.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4B0} Folha de Pagamento (${folhaPagamento.length})</div><table><thead><tr><th>Compet\u00EAncia</th><th>Sal\u00E1rio Base</th><th>H. Extras</th><th>Descontos</th><th>L\u00EDquido</th><th>Status</th></tr></thead><tbody>`;
      folhaPagamento.forEach((f: any) => {
        html += `<tr><td>${f.mesReferencia ? f.mesReferencia.split("-").reverse().join("/") : "—"}</td><td style="text-align:right">${formatSalario(f.salarioBase)}</td><td style="text-align:right;color:#166534">${formatSalario(f.horasExtrasValor)}</td><td style="text-align:right;color:#dc2626">${formatSalario(f.totalDescontos)}</td><td style="text-align:right;font-weight:700;font-size:11px">${formatSalario(f.salarioLiquido)}</td><td>${f.status}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // AVISO PRÉVIO
    if (avisosPrevios.length > 0) {
      html += `<div class="section"><div class="section-title">\u26A0\uFE0F Aviso Prévio (${avisosPrevios.length})</div><table><thead><tr><th>Tipo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Redução</th><th>Status</th></tr></thead><tbody>`;
      avisosPrevios.forEach((a: any) => {
        const tipoLabel: Record<string, string> = { empregador_trabalhado: 'Empregador (Trabalhado)', empregador_indenizado: 'Empregador (Indenizado)', empregado_trabalhado: 'Empregado (Trabalhado)', empregado_indenizado: 'Empregado (Indenizado)' };
        html += `<tr><td>${tipoLabel[a.tipo] || a.tipo}</td><td>${formatDate(a.dataInicio)}</td><td>${formatDate(a.dataFim)}</td><td>${a.diasAviso ?? 30}</td><td>${a.reducaoJornada === '2h_dia' ? '2h/dia' : a.reducaoJornada === '7_dias_corridos' ? '7 dias corridos' : 'Nenhuma'}</td><td><span class="badge ${a.status === 'concluido' ? 'badge-green' : a.status === 'cancelado' ? 'badge-red' : 'badge-yellow'}">${a.status}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // FÉRIAS
    if (ferias.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F3D6} Férias (${ferias.length})</div><table><thead><tr><th>Per. Aquisitivo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Abono</th><th>Valor Total</th><th>Status</th></tr></thead><tbody>`;
      ferias.forEach((f: any) => {
        html += `<tr><td>${formatDate(f.periodoAquisitivoInicio)} a ${formatDate(f.periodoAquisitivoFim)}</td><td>${formatDate(f.dataInicio)}</td><td>${formatDate(f.dataFim)}</td><td>${f.diasGozo || 30}</td><td>${f.abonoPecuniario ? 'Sim' : 'Não'}</td><td>${f.valorTotal ? formatSalario(f.valorTotal) : '-'}</td><td><span class="badge ${f.status === 'concluida' ? 'badge-green' : f.status === 'vencida' ? 'badge-red' : f.status === 'em_gozo' ? 'badge-blue' : 'badge-yellow'}">${f.status}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // CIPA
    if (cipa.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F6E1} CIPA (${cipa.length})</div><table><thead><tr><th>Cargo</th><th>Representação</th><th>Mandato</th><th>Estabilidade</th><th>Status</th></tr></thead><tbody>`;
      cipa.forEach((c: any) => {
        html += `<tr><td>${(c.cargoCipa || '').replace(/_/g, ' ')}</td><td>${c.representacao}</td><td>${formatDate(c.mandatoInicio)} a ${formatDate(c.mandatoFim)}</td><td>${formatDate(c.inicioEstabilidade)} a ${formatDate(c.fimEstabilidade)}</td><td><span class="badge ${c.statusMembro === 'Ativo' ? 'badge-green' : 'badge-red'}">${c.statusMembro}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // PJ CONTRATOS
    if (pjContratos.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4DD} Contratos PJ (${pjContratos.length})</div><table><thead><tr><th>Nº Contrato</th><th>Vigência</th><th>Valor Mensal</th><th>Adiant./Fech.</th><th>Status</th></tr></thead><tbody>`;
      pjContratos.forEach((c: any) => {
        html += `<tr><td>${c.numeroContrato || '-'}</td><td>${formatDate(c.dataInicio)} a ${formatDate(c.dataFim)}</td><td>${formatSalario(c.valorMensal || '0')}</td><td>${c.percentualAdiantamento || 40}% / ${c.percentualFechamento || 60}%</td><td><span class="badge ${c.status === 'ativo' ? 'badge-green' : c.status === 'encerrado' ? 'badge-red' : 'badge-yellow'}">${c.status}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // TIMELINE
    // HABILIDADES
    if (empSkills.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F527} Habilidades e Compet\u00EAncias (${empSkills.length})</div><table><thead><tr><th>Habilidade</th><th>Categoria</th><th>N\u00EDvel</th><th>Experi\u00EAncia</th><th>Observa\u00E7\u00E3o</th></tr></thead><tbody>`;
      empSkills.forEach((sk: any) => {
        const nivelLabel: Record<string, string> = { Basico: 'B\u00E1sico', Intermediario: 'Intermedi\u00E1rio', Avancado: 'Avan\u00E7ado' };
        const nivelBadge: Record<string, string> = { Basico: 'badge-blue', Intermediario: 'badge-yellow', Avancado: 'badge-green' };
        html += `<tr><td>${sk.skillNome}</td><td>${sk.skillCategoria || '-'}</td><td><span class="badge ${nivelBadge[sk.nivel] || 'badge-blue'}">${nivelLabel[sk.nivel] || sk.nivel}</span></td><td>${sk.tempoExperiencia || '-'}</td><td>${sk.observacao || '-'}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    if (timeline.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4C5} Timeline (${timeline.length} eventos)</div><table><thead><tr><th>Data</th><th>Tipo</th><th>Descri\u00E7\u00E3o</th></tr></thead><tbody>`;
      timeline.forEach((ev: any) => {
        html += `<tr><td>${formatDate(ev.data)}</td><td><span class="badge badge-blue">${ev.tipo}</span></td><td>${ev.descricao}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // SEGURO DE VIDA
    {
      const sv = coberturaSeguro as any;
      const svLabelPrint = (s: string | undefined | null) => s === "ativo" ? "Segurado Ativo" : s === "pendente_inclusao" ? "Pend. Inclusão" : s === "pendente_cancelamento" ? "Pend. Cancelamento" : s === "cancelado" ? "Sem Cobertura" : "Sem Registro";
      const svBadgePrint = (s: string | undefined | null) => s === "ativo" ? "badge-green" : s === "pendente_inclusao" ? "badge-yellow" : s === "pendente_cancelamento" ? "badge-orange" : "badge-red";
      const fmtCapPrint = (v: string | null | undefined) => { if (!v) return "-"; const n = parseBRNumber(v); if (!n) return "-"; return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
      const fmtPremPrint = (v: string | null | undefined) => { if (!v) return "-"; const n = parseBRNumber(v); if (!n) return "-"; return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}`; };
      html += `<div class="section"><div class="section-title">\u{1F6E1} Seguro de Vida</div>`;
      if (!sv) {
        html += `<p style="color:#6b7280;font-size:9px">Nenhum registro de seguro de vida encontrado.</p>`;
      } else {
        html += `<div class="info-grid">`;
        html += `<div class="info-item"><strong>Status:</strong> <span class="badge ${svBadgePrint(sv.status)}">${svLabelPrint(sv.status)}</span></div>`;
        html += `<div class="info-item"><strong>Seguradora:</strong> ${sv.seguradora || "-"}</div>`;
        html += `<div class="info-item"><strong>Item:</strong> ${sv.item_segurador || "-"}</div>`;
        html += `<div class="info-item"><strong>Apólice VG:</strong> ${sv.apolice_vg || "-"}</div>`;
        html += `<div class="info-item"><strong>Apólice APC:</strong> ${sv.apolice_apc || "-"}</div>`;
        html += `<div class="info-item"><strong>Adesão:</strong> ${formatDate(sv.data_adesao)}</div>`;
        if (sv.data_vencimento_apolice) html += `<div class="info-item"><strong>Venc. Apólice:</strong> ${formatDate(sv.data_vencimento_apolice)}</div>`;
        if (sv.data_cancelamento) html += `<div class="info-item"><strong>Cancelamento:</strong> ${formatDate(sv.data_cancelamento)}</div>`;
        html += `</div>`;
        html += `<table><thead><tr><th>Cobertura</th><th style="text-align:right">Capital Segurado</th></tr></thead><tbody>`;
        if (sv.morte_natural) html += `<tr><td>Morte Natural</td><td style="text-align:right;font-weight:600">${fmtCapPrint(sv.morte_natural)}</td></tr>`;
        if (sv.morte_acidental) html += `<tr><td>Morte Acidental</td><td style="text-align:right;font-weight:600">${fmtCapPrint(sv.morte_acidental)}</td></tr>`;
        if (sv.invalidez_acidente) html += `<tr><td>Invalidez por Acidente</td><td style="text-align:right;font-weight:600">${fmtCapPrint(sv.invalidez_acidente)}</td></tr>`;
        if (sv.invalidez_doenca) html += `<tr><td>Invalidez por Doença</td><td style="text-align:right;font-weight:600">${fmtCapPrint(sv.invalidez_doenca)}</td></tr>`;
        html += `</tbody></table>`;
        html += `<table style="margin-top:4px"><thead><tr><th>Prêmio</th><th style="text-align:right">Valor</th></tr></thead><tbody>`;
        if (sv.premio_vg) html += `<tr><td>Prêmio VG</td><td style="text-align:right">${fmtPremPrint(sv.premio_vg)}</td></tr>`;
        if (sv.premio_apc) html += `<tr><td>Prêmio APC</td><td style="text-align:right">${fmtPremPrint(sv.premio_apc)}</td></tr>`;
        html += `</tbody></table>`;
        if (sv.observacoes) html += `<div class="info-item" style="margin-top:4px"><strong>Obs.:</strong> ${sv.observacoes}</div>`;
      }
      html += `</div>`;
    }

    // FOOTER
    html += `<div class="footer"><span>ERP - Gestão Integrada \u2014 ${nomeEmpresa}</span><span>Gerado por: ${userName} em ${dataEmissao}</span><span class="lgpd">Dados protegidos pela LGPD (Lei 13.709/2018)</span></div></body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 600);
  };

  const handleDownloadZip = async () => {
    if (!employeeId) return;
    setIsDownloadingZip(true);
    try {
      const response = await fetch(`/api/download/sst/${employeeId}`, { credentials: "include" });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erro desconhecido" }));
        alert(err.error || "Nenhum arquivo encontrado para download.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SST_${emp?.nomeCompleto?.replace(/\s+/g, "_") || "Funcionario"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro ao baixar arquivos. Verifique sua conexão.");
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleExportSST = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    // Conteúdo dinâmico (inclusive texto vindo da IA: restrições/fatores de risco) DEVE ser
    // escapado antes de entrar no HTML do PDF — senão abre XSS no contexto autenticado.
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const logoUrl = selectedCompany?.logoUrl || "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "Empresa";
    const cnpjEmpresa = selectedCompany?.cnpj || "";
    const dataEmissao = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const css = `@page{size:A4 portrait;margin:12mm 15mm 20mm 15mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}a{color:inherit!important}}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.4}.logo-bar{background:#1B2A4A;padding:14px 20px;display:flex;align-items:center;gap:16px;margin-bottom:16px;border-radius:6px}.logo-bar img{height:50px;object-fit:contain}.logo-bar .title{color:white;flex:1}.logo-bar .title h1{font-size:16px;font-weight:bold;letter-spacing:1.5px;margin-bottom:2px}.logo-bar .title p{font-size:10px;opacity:0.85}.logo-bar .info-right{color:white;text-align:right;font-size:9px;opacity:0.9}.logo-bar .info-right p{margin-bottom:2px}.emp-bar{background:#f0f4f8;border-left:4px solid #1B2A4A;padding:10px 16px;margin-bottom:14px;border-radius:0 4px 4px 0;display:flex;justify-content:space-between;align-items:center}.emp-bar h2{font-size:15px;font-weight:700;color:#1B2A4A}.emp-bar .sub{font-size:10px;color:#4b5563;margin-top:2px}.section{margin-bottom:14px;page-break-inside:avoid}.section-title{font-size:12px;font-weight:700;color:#1B2A4A;border-bottom:2px solid #2d4a7a;padding-bottom:3px;margin-bottom:6px}.notice{background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:8px 12px;font-size:9px;color:#78350f;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px}th{background:#e8edf4;color:#1B2A4A;font-weight:600;text-align:left;padding:4px 6px;border:1px solid #d1d9e6}td{padding:4px 6px;border:1px solid #e5e7eb}tr:nth-child(even){background:#f9fafb}.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:600}.bg{background:#dcfce7;color:#166534}.br{background:#fef2f2;color:#991b1b}.by{background:#fefce8;color:#854d0e}.link{color:#1d4ed8;text-decoration:underline}.footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:8px;display:flex;justify-content:space-between;font-size:8px;color:#6b7280}`;
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SST - ${esc(emp?.nomeCompleto || "")}</title><style>${css}</style></head><body>`;
    html += `<div class="logo-bar"><img src="${escAttr(logoUrl)}" alt="Logo" /><div class="title"><h1>DOCUMENTOS SST — ASOs &amp; TREINAMENTOS</h1><p>${esc(nomeEmpresa.toUpperCase())}${cnpjEmpresa ? ' — CNPJ: ' + esc(cnpjEmpresa) : ''}</p></div><div class="info-right"><p>Emitido em: ${esc(dataEmissao)}</p><p>Emitido por: ${esc(userName)}</p></div></div>`;
    html += `<div class="emp-bar"><div><h2>${esc(emp?.nomeCompleto || "-")}</h2><div class="sub">Função: ${esc(emp?.funcao || emp?.cargo || "-")} | CPF: ${esc(formatCPFSafe(emp?.cpf))} | Admissão: ${esc(formatDate(emp?.dataAdmissao))}</div></div></div>`;
    html += `<div class="notice">⚠️ Este documento é de uso confidencial. Os links abaixo levam aos arquivos originais anexados no sistema. Para imprimir com acesso completo, abra cada link em um navegador conectado à internet.</div>`;
    html += `<div class="section"><div class="section-title">🩺 ASOs (${asos.length})</div>`;
    if (asos.length === 0) {
      html += `<p style="color:#6b7280;font-size:9px">Nenhum ASO registrado.</p>`;
    } else {
      html += `<table><thead><tr><th>Tipo</th><th>Data Exame</th><th>Validade</th><th>Status</th><th>Vencimento</th><th>Resultado</th><th>Médico</th><th>CRM</th><th>Exames</th><th>Arquivo</th></tr></thead><tbody>`;
      (asos as any[]).forEach((a: any) => {
        const bc = a.status === "VENCIDO" ? "br" : a.status?.includes("DIAS") ? "by" : "bg";
        const linkCell = a.documentoUrl ? `<a class="link" href="${escAttr(a.documentoUrl)}" target="_blank">📄 Ver ASO</a>` : `<span style="color:#9ca3af">—</span>`;
        html += `<tr><td>${esc(a.tipo)}</td><td>${esc(formatDate(a.dataExame))}</td><td>${esc(a.validadeDias || 365)} dias</td><td><span class="badge ${bc}">${esc(a.status || "VÁLIDO")}</span></td><td>${esc(formatDate(a.dataVencimento))}</td><td style="color:${a.resultado === "Apto" ? "#166534" : "#991b1b"};font-weight:600">${esc(a.resultado)}</td><td>${esc(a.medico || "-")}</td><td>${esc(a.crm || "-")}</td><td style="max-width:120px">${esc(a.examesRealizados || "-")}</td><td>${linkCell}</td></tr>`;
        if (a.temIa) {
          const rstxt = a.restricoes && String(a.restricoes).trim() ? String(a.restricoes).trim() : "";
          const temRst = !!(rstxt && !/^(nenhuma|sem restri|n[aã]o|n\/a|-)\.?$/i.test(rstxt));
          const aptoTxt = (v: any) => { const t = String(v || "").trim(); return t || "—"; };
          const aptoCor = (v: any) => { const t = String(v || "").trim(); return /inapto|inad/i.test(t) ? "#991b1b" : /^apto/i.test(t) ? "#166534" : "#6b7280"; };
          const restricoesItens = parseRestricoesItens(a.restricoes);
          const fatoresItens = parseFatoresRiscoCategorias(a.fatoresRisco);
          html += `<tr><td colspan="10" style="background:${temRst ? "#fef2f2" : "#f8fafc"};border-top:none;padding:6px">`;
          html += `<div style="font-size:8px;font-weight:700;color:#7c3aed;margin-bottom:4px">✨ FICHA DO ASO (leitura por IA · revisada)${a.iaConfianca != null ? ` — confiança ${esc(a.iaConfianca)}%` : ""}</div>`;
          // Aptidões — tabela campo/valor
          html += `<table style="margin-bottom:5px"><thead><tr><th colspan="2">Aptidões</th></tr></thead><tbody>`;
          html += `<tr><td style="width:45%">Apto altura (NR-35)</td><td style="color:${aptoCor(a.aptoAltura)};font-weight:600">${esc(aptoTxt(a.aptoAltura))}</td></tr>`;
          html += `<tr><td>Espaço confinado (NR-33)</td><td style="color:${aptoCor(a.aptoEspacoConfinado)};font-weight:600">${esc(aptoTxt(a.aptoEspacoConfinado))}</td></tr>`;
          html += `<tr><td>Resultado geral</td><td style="color:${a.resultado === "Apto" ? "#166534" : "#991b1b"};font-weight:600">${esc(a.resultado || "—")}</td></tr>`;
          if (a.iaConfianca != null) html += `<tr><td>Confiança da leitura</td><td style="color:#7c3aed;font-weight:600">${esc(a.iaConfianca)}%</td></tr>`;
          html += `</tbody></table>`;
          // Restrições — tabela itemizada
          html += `<table style="margin-bottom:5px"><thead><tr><th colspan="2"${temRst ? ' style="background:#fee2e2;color:#991b1b"' : ""}>${temRst ? `⚠️ Restrições (${restricoesItens.length})` : "Restrições"}</th></tr></thead><tbody>`;
          if (temRst && restricoesItens.length > 0) {
            restricoesItens.forEach((r: string, i: number) => {
              html += `<tr><td style="width:24px;color:#991b1b;font-weight:700;vertical-align:top">${i + 1}</td><td style="color:#991b1b;font-weight:600">${esc(r)}</td></tr>`;
            });
          } else {
            html += `<tr><td colspan="2" style="color:#6b7280">Sem restrições registradas.</td></tr>`;
          }
          html += `</tbody></table>`;
          // Fatores de risco — tabela por categoria
          if (fatoresItens.length > 0) {
            html += `<table><thead><tr><th style="width:28%">Categoria de risco</th><th>Fatores identificados</th></tr></thead><tbody>`;
            fatoresItens.forEach((f: { categoria: string; texto: string }) => {
              html += `<tr><td style="font-weight:600;vertical-align:top">${esc(f.categoria)}</td><td>${esc(f.texto)}</td></tr>`;
            });
            html += `</tbody></table>`;
          }
          html += `</td></tr>`;
        }
      });
      html += `</tbody></table>`;
    }
    html += `</div>`;
    html += `<div class="section"><div class="section-title">🎓 Treinamentos (${treinamentos.length})</div>`;
    if (treinamentos.length === 0) {
      html += `<p style="color:#6b7280;font-size:9px">Nenhum treinamento registrado.</p>`;
    } else {
      html += `<table><thead><tr><th>Treinamento</th><th>Norma</th><th>Carga H.</th><th>Realização</th><th>Validade</th><th>Status</th><th>Instrutor</th><th>Certificado</th></tr></thead><tbody>`;
      (treinamentos as any[]).forEach((t: any) => {
        const bc = t.statusCalculado === "VENCIDO" ? "br" : t.statusCalculado?.includes("DIAS") ? "by" : "bg";
        const linkCell = t.certificadoUrl ? `<a class="link" href="${escAttr(t.certificadoUrl)}" target="_blank">📄 Ver Cert.</a>` : `<span style="color:#9ca3af">—</span>`;
        html += `<tr><td>${esc(t.nome)}</td><td>${esc(t.norma || "-")}</td><td>${esc(t.cargaHoraria || "-")}</td><td>${esc(formatDate(t.dataRealizacao))}</td><td>${esc(formatDate(t.dataValidade))}</td><td><span class="badge ${bc}">${esc(t.statusCalculado || "VÁLIDO")}</span></td><td>${esc(t.instrutor || "-")}</td><td>${linkCell}</td></tr>`;
      });
      html += `</tbody></table>`;
    }
    html += `</div>`;
    html += `<div class="footer"><span>ERP FC Engenharia — Gestão SST</span><span>LGPD: Dados protegidos pela Lei 13.709/2018</span><span>${dataEmissao}</span></div></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 600);
  };

  // Rev. 3110 — Ficha de Avaliação do Cliente (PDF/Imprimir) p/ enviar no WhatsApp
  const gerarFichaAvaliacaoCliente = () => {
    const ac = desempenho?.avaliacaoCliente;
    if (!ac || ac.total === 0) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const safeImgUrl = (u: any) => { const s = String(u ?? "").trim(); return /^(https?:|blob:|data:image\/)/i.test(s) ? s : ""; };
    const logoUrl = safeImgUrl(`${window.location.origin}/logo-fc-branco-amarelo.png?v=1712`);
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "Empresa";
    const cnpjEmpresa = selectedCompany?.cnpj || "";
    const corNota = (n: any) => n == null ? "#9ca3af" : Number(n) >= 8 ? "#166534" : Number(n) >= 6 ? "#854d0e" : "#991b1b";
    const css = `@page{size:A4 portrait;margin:8mm 8mm 12mm 8mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.4}.logo-bar{background:#1B2A4A;padding:14px 20px;display:flex;align-items:center;gap:16px;margin-bottom:16px;border-radius:6px}.logo-bar img{height:50px;object-fit:contain}.logo-bar .title{color:white;flex:1}.logo-bar .title h1{font-size:16px;font-weight:bold;letter-spacing:1.5px;margin-bottom:2px}.logo-bar .title p{font-size:10px;opacity:0.85}.logo-bar .info-right{color:white;text-align:right;font-size:9px;opacity:0.9}.logo-bar .info-right p{margin-bottom:2px}.emp-bar{background:#f0f4f8;border-left:4px solid #1B2A4A;padding:10px 16px;margin-bottom:14px;border-radius:0 4px 4px 0;display:flex;align-items:center;gap:12px}.emp-bar img{width:54px;height:54px;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #1B2A4A}.emp-bar h2{font-size:15px;font-weight:700;color:#1B2A4A}.emp-bar .sub{font-size:10px;color:#4b5563;margin-top:2px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}.card{border:1px solid #d1d9e6;border-radius:8px;padding:10px 6px;text-align:center;background:#f9fafb}.card .v{font-size:18px;font-weight:700}.card .l{font-size:9px;color:#6b7280;font-weight:600;margin-top:2px}.section-title{font-size:12px;font-weight:700;color:#1B2A4A;border-bottom:2px solid #2d4a7a;padding-bottom:3px;margin-bottom:6px}table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px}th{background:#e8edf4;color:#1B2A4A;font-weight:600;text-align:left;padding:3px 5px;border:1px solid #d1d9e6;word-break:break-word;overflow-wrap:anywhere}td{padding:3px 5px;border:1px solid #e5e7eb;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}tr:nth-child(even){background:#f9fafb}.footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:8px;display:flex;justify-content:space-between;font-size:8px;color:#6b7280}`;
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ficha de Avaliação do Cliente - ${esc(emp?.nomeCompleto || "")}</title><style>${css}</style></head><body>`;
    html += `<div class="logo-bar"><img src="${escAttr(logoUrl)}" alt="FC Engenharia" /><div class="title"><h1>FICHA DE AVALIAÇÃO DO CLIENTE</h1><p>${esc(nomeEmpresa.toUpperCase())}${cnpjEmpresa ? ' — CNPJ: ' + esc(cnpjEmpresa) : ''}</p></div><div class="info-right"><p>Emitido em: ${esc(dataEmissao)}</p><p>Emitido por: ${esc(userName)}</p></div></div>`;
    const fotoOk = safeImgUrl(emp?.fotoUrl);
    html += `<div class="emp-bar">${fotoOk ? `<img src="${escAttr(fotoOk)}" alt="Foto" />` : ""}<div><h2>${esc(emp?.nomeCompleto || "-")}</h2><div class="sub">Função: ${esc(emp?.funcao || (emp as any)?.cargo || "-")} | CPF: ${esc(formatCPFSafe(emp?.cpf))}${(emp as any)?.codigoInterno ? ` | Cód: ${esc((emp as any).codigoInterno)}` : ""} | ${esc(fmtNum(ac.total))} avaliação(ões)</div></div></div>`;
    const medias = [
      { label: "Geral", v: ac.mediaGeral }, { label: "Gestor", v: ac.mediaGestor },
      { label: "Equipe", v: ac.mediaEquipe }, { label: "Prazo", v: ac.mediaPrazo }, { label: "Qualidade", v: ac.mediaQualidade },
    ];
    html += `<div class="cards">` + medias.map((m) => `<div class="card"><div class="v" style="color:${corNota(m.v)}">${m.v != null ? esc(m.v) : "—"}</div><div class="l">${esc(m.label)}</div></div>`).join("") + `</div>`;
    html += `<div class="section-title">Avaliações Registradas (${esc(fmtNum(ac.total))})</div>`;
    html += `<table><thead><tr><th>Data</th><th>Obra</th><th style="text-align:center">Geral</th><th style="text-align:center">Gestor</th><th style="text-align:center">Equipe</th><th style="text-align:center">Prazo</th><th style="text-align:center">Qualid.</th><th>Comentários do Cliente</th></tr></thead><tbody>`;
    (ac.historico || []).forEach((a: any) => {
      const data = a.criadoEm ? formatDate(String(a.criadoEm).split(/[T ]/)[0]) : (a.anoPeriodo || "—");
      const cel = (n: any) => `<td style="text-align:center;color:${corNota(n)};font-weight:700">${n == null ? "—" : esc(n)}</td>`;
      const coments = [a.comentarioPositivo, a.comentarioMelhoria, a.comentarioGestor].filter(Boolean).map(esc).join(" • ");
      html += `<tr><td style="white-space:nowrap">${esc(data)}</td><td>${esc(a.obraNome || "—")}</td>${cel(a.notaGeral)}${cel(a.notaGestor)}${cel(a.notaEquipe)}${cel(a.notaPrazo)}${cel(a.notaQualidade)}<td>${coments || "—"}</td></tr>`;
    });
    html += `</tbody></table>`;

    // Rev. 3114 — TODOS OS PONTOS ANALISADOS (critérios granulares) na Ficha.
    const histDet = (ac.historico || []).filter((a: any) => extrairPontosAval(a.detalhes).length > 0);
    if (histDet.length > 0) {
      // Consolidado: média por critério.
      const accF = new Map<string, { bloco: string; label: string; soma: number; n: number }>();
      histDet.forEach((a: any) => {
        extrairPontosAval(a.detalhes).forEach((p) => {
          const cur = accF.get(p.key) || { bloco: p.bloco, label: p.label, soma: 0, n: 0 };
          cur.soma += p.nota; cur.n += 1; accF.set(p.key, cur);
        });
      });
      const consol = Array.from(accF.values()).map((c) => ({ ...c, media: Math.round((c.soma / c.n) * 10) / 10 }));
      const fortesF = consol.filter((c) => c.media >= 8).sort((x, y) => y.media - x.media).slice(0, 6);
      const fracosF = consol.filter((c) => c.media < 8).sort((x, y) => x.media - y.media).slice(0, 6);
      const liItem = (c: any) => `<li style="display:flex;justify-content:space-between;gap:8px;padding:2px 0"><span>${esc(c.bloco)} · ${esc(c.label)}</span><b style="color:${corNota(c.media)}">${esc(c.media)}</b></li>`;
      html += `<div class="section-title" style="margin-top:14px">Todos os Pontos Analisados</div>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">`;
      html += `<div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:6px;padding:8px"><div style="font-weight:700;color:#166534;font-size:9px;text-transform:uppercase;margin-bottom:4px">Pontos Fortes</div><ul style="list-style:none;font-size:9px">${fortesF.length ? fortesF.map(liItem).join("") : '<li style="color:#9ca3af">—</li>'}</ul></div>`;
      html += `<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:6px;padding:8px"><div style="font-weight:700;color:#991b1b;font-size:9px;text-transform:uppercase;margin-bottom:4px">Pontos a Melhorar</div><ul style="list-style:none;font-size:9px">${fracosF.length ? fracosF.map(liItem).join("") : '<li style="color:#9ca3af">Nenhum abaixo de 8</li>'}</ul></div>`;
      html += `</div>`;
      // Detalhe por avaliação.
      histDet.forEach((a: any) => {
        const data = a.criadoEm ? formatDate(String(a.criadoEm).split(/[T ]/)[0]) : (a.anoPeriodo || "—");
        html += `<div style="font-size:10px;font-weight:700;color:#1B2A4A;margin:8px 0 4px">${esc(a.obraNome || "—")} — ${esc(data)}</div>`;
        html += `<table style="margin-bottom:6px"><thead><tr><th>Bloco</th><th>Critério</th><th style="text-align:center;width:50px">Nota</th></tr></thead><tbody>`;
        BLOCOS_AVAL_RX.forEach((b) => {
          const dados = a.detalhes?.[b.key];
          if (!dados || typeof dados !== "object") return;
          const itens = b.crit.map((c) => ({ label: c.label, nota: (dados as any)[c.key] })).filter((it) => typeof it.nota === "number");
          if (itens.length === 0) return;
          const blocoNome = dados.nome ? `${b.titulo} · ${esc(dados.nome)}` : b.titulo;
          itens.forEach((it, i) => {
            html += `<tr><td>${i === 0 ? blocoNome : ""}</td><td>${esc(it.label)}</td><td style="text-align:center;font-weight:700;color:${corNota(it.nota)}">${esc(it.nota)}</td></tr>`;
          });
        });
        html += `</tbody></table>`;
      });
    }

    html += `<div class="footer"><span>ERP FC Engenharia — Avaliação do Cliente</span><span>LGPD: Dados protegidos pela Lei 13.709/2018</span><span>${esc(dataEmissao)}</span></div></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 600);
  };

  // ===================== FULL SCREEN OVERLAY =====================
  return createPortal(
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ width: "100vw", height: "100dvh" }}>
      {/* HEADER */}
      <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-3 sm:px-6 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between shadow-lg gap-1 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          {emp?.fotoUrl ? (
            <button
              type="button"
              onClick={() => setFotoAmpliada(true)}
              className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shrink-0 border-2 border-white/40 cursor-zoom-in hover:border-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/70 p-0"
              title="Ampliar foto"
              aria-label="Ampliar foto do colaborador"
            >
              <img src={emp.fotoUrl} alt="" className="w-full h-full object-cover object-top" />
            </button>
          ) : (
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shrink-0 border-2 border-white/40">
              <User className="h-4 w-4 sm:h-6 sm:w-6" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm sm:text-xl font-bold tracking-tight">RAIO-X DO FUNCIONÁRIO</h1>
            {emp && <p className="text-xs sm:text-sm text-white/80 truncate">{emp.nomeCompleto} — CPF: {formatCPFSafe(emp.cpf)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 ml-auto sm:ml-0">
          <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1 sm:gap-1.5 border border-white/30 text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-9">
            <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Imprimir</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1 sm:gap-1.5 border border-white/30 text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-9">
            <FileDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Gerar PDF</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20 gap-1 sm:gap-1.5 border border-white/30 text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-9">
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Voltar</span>
          </Button>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground text-lg">Carregando dados do funcionário...</div>
        ) : !emp ? (
          <div className="text-center py-20 text-muted-foreground text-lg">Funcionário não encontrado</div>
        ) : (
          <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-3 sm:space-y-5">
            {/* DADOS PESSOAIS */}
            <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 rounded-xl p-3 sm:p-6 border border-blue-200 shadow-sm relative">
              {/* BANNER AVISO PRÉVIO - só aparece se status ativo/em_andamento */}
              {(() => {
                const avisoAtivo = avisosPrevios.find((a: any) => a.status === 'ativo' || a.status === 'em_andamento' || a.status === 'pendente');
                if (!avisoAtivo) return null;
                const tipoLabel: Record<string, string> = { empregador_trabalhado: 'Empregador (Trabalhado)', empregador_indenizado: 'Empregador (Indenizado)', empregado_trabalhado: 'Empregado (Trabalhado)', empregado_indenizado: 'Empregado (Indenizado)' };
                const dataFim = avisoAtivo.dataFim ? new Date(avisoAtivo.dataFim) : null;
                const hoje = new Date();
                const diasRestantes = dataFim ? Math.ceil((dataFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)) : null;
                const isUrgente = diasRestantes !== null && diasRestantes <= 3;
                const isVencido = diasRestantes !== null && diasRestantes <= 0;
                return (
                  <div className={`absolute top-2 right-2 sm:top-3 sm:right-3 z-10 ${isUrgente ? 'animate-pulse' : ''}`}>
                    <div className={`${isVencido ? 'bg-red-700' : isUrgente ? 'bg-red-600' : 'bg-red-500'} text-white rounded-lg px-3 py-2 sm:px-4 sm:py-3 shadow-lg border-2 ${isVencido ? 'border-red-900' : 'border-red-700'} max-w-[260px]`}>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                        <span className="font-bold text-xs sm:text-sm">{isVencido ? '⚠️ AVISO VENCIDO!' : 'EM AVISO PRÉVIO'}</span>
                      </div>
                      <div className="text-[10px] sm:text-xs space-y-0.5 opacity-95">
                        <div><strong>Tipo:</strong> {tipoLabel[avisoAtivo.tipo] || avisoAtivo.tipo}</div>
                        <div><strong>Início:</strong> {avisoAtivo.dataInicio ? new Date(avisoAtivo.dataInicio).toLocaleDateString('pt-BR') : '-'}</div>
                        <div><strong>Fim:</strong> {dataFim ? dataFim.toLocaleDateString('pt-BR') : '-'}</div>
                        {diasRestantes !== null && (
                          <div className="font-bold text-xs sm:text-sm mt-1 pt-1 border-t border-white/30">
                            {isVencido ? `Venceu há ${Math.abs(diasRestantes)} dia(s)` : `Faltam ${diasRestantes} dia(s)`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-start gap-3 sm:gap-4">
                {/* FOTO DO COLABORADOR */}
                <div className="shrink-0">
                  {emp.fotoUrl ? (
                    <button
                      type="button"
                      onClick={() => setFotoAmpliada(true)}
                      className="w-28 h-28 sm:w-40 sm:h-40 rounded-full overflow-hidden border-4 border-blue-300 shadow-md bg-blue-100 flex items-center justify-center cursor-zoom-in hover:border-blue-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 p-0"
                      title="Clique para ampliar a foto"
                      aria-label="Ampliar foto do colaborador"
                    >
                      <img src={emp.fotoUrl} alt="Foto do colaborador" className="w-full h-full object-cover object-top" />
                    </button>
                  ) : (
                    <div className="w-28 h-28 sm:w-40 sm:h-40 rounded-full overflow-hidden border-4 border-blue-300 shadow-md bg-blue-100 flex items-center justify-center">
                      <span className="text-3xl sm:text-5xl font-bold text-blue-400">{emp.nomeCompleto?.charAt(0)}{emp.nomeCompleto?.split(' ').pop()?.charAt(0)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                    <h2 className="text-lg sm:text-3xl font-bold text-blue-900">{emp.nomeCompleto}</h2>
                    <Badge className={`text-sm px-3 py-1 ${emp.status === "Ativo" ? "bg-green-100 text-green-800" : emp.status === "Desligado" ? "bg-red-100 text-red-800" : emp.status === "Aviso" ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {emp.status === "Aviso" ? "Em Aviso Prévio" : emp.status}
                    </Badge>
                    {(emp as any).codigoInterno && (
                      <Badge variant="outline" className="text-sm px-3 py-1 border-blue-300 text-blue-700 font-mono">{(emp as any).codigoInterno}</Badge>
                    )}
                    {(emp as any).recontratadoDeEmployeeId && (
                      <Badge className="text-sm px-3 py-1 bg-lime-100 text-lime-800 border border-lime-300 flex items-center gap-1">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Recontratado{(emp as any).recontratadoDeCodigo ? ` de ${(emp as any).recontratadoDeCodigo}` : ""}
                      </Badge>
                    )}
                  </div>
                  {(emp as any).recontratadoDeEmployeeId && (
                    <div className="mb-2 sm:mb-3 bg-lime-50 border border-lime-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-lime-800 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 shrink-0 text-lime-600" />
                      <span>
                        Esta é uma ficha NOVA originada por recontratação{(emp as any).recontratadoDeCodigo ? ` do vínculo anterior ${(emp as any).recontratadoDeCodigo}` : ""}
                        {(emp as any).recontratadoData ? ` em ${new Date((emp as any).recontratadoData).toLocaleDateString("pt-BR")}` : ""}. O histórico anterior permanece encerrado no desligamento, ligado por CPF.
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 sm:gap-x-8 gap-y-2 sm:gap-y-3">
                    {(() => {
                      const anivInfo = calcDiasAniversarioSafe(emp.dataNascimento);
                      const tempoEmp = calcTempoEmpresa(emp.dataAdmissao);
                      return [
                        { icon: CreditCard, label: "CPF", value: formatCPFSafe(emp.cpf) },
                        emp.rg ? { icon: CreditCard, label: "RG", value: maskPII(emp.rg) } : null,
                        emp.funcao ? { icon: Briefcase, label: "Função", value: emp.funcao } : null,
                        funcaoDetalhes?.cbo ? { icon: FileText, label: "CBO", value: funcaoDetalhes.cbo } : null,
                        emp.setor ? { icon: Building2, label: "Setor", value: emp.setor } : null,
                        emp.telefone ? { icon: Phone, label: "Telefone", value: maskPII(emp.telefone) } : null,
                        emp.dataAdmissao ? { icon: Calendar, label: "Admissão", value: formatDate(emp.dataAdmissao) } : null,
                        emp.dataAdmissao ? { icon: Timer, label: "Tempo de Empresa", value: tempoEmp } : null,
                        emp.salarioBase ? { icon: DollarSign, label: "Salário Base", value: formatSalario(emp.salarioBase) } : null,
                        (emp.recebeComplemento && emp.valorComplemento) ? { icon: Plus, label: "Complemento (por fora)", value: formatSalario(emp.valorComplemento) } : null,
                        (emp.recebeComplemento && emp.valorComplemento && emp.salarioBase) ? { icon: TrendingUp, label: "Salário TOTAL (Base + Complemento)", value: formatSalario(String((Number(String(emp.salarioBase).replace(/\./g,"").replace(",",".")) || 0) + (Number(String(emp.valorComplemento).replace(/\./g,"").replace(",",".")) || 0))) } : null,
                        emp.valorHora ? { icon: Clock, label: "Valor/Hora", value: formatSalario(emp.valorHora) } : null,
                        emp.dataNascimento ? { icon: Calendar, label: "Nascimento", value: formatDateSafe(emp.dataNascimento) } : null,
                        emp.dataNascimento ? { icon: User, label: "Idade", value: calcIdadeSafe(emp.dataNascimento) } : null,
                        emp.dataNascimento ? { icon: Gift, label: "Aniversário", value: hidePersonal ? PII_MASK : `${anivInfo.aniversario} (${anivInfo.texto})` } : null,
                        emp.obraAtualNome ? { icon: HardHat, label: "Obra Principal", value: emp.obraAtualNome } : null,
                      ].filter(Boolean);
                    })().map((item: any, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-blue-700">
                        <item.icon className="h-4 w-4 shrink-0 text-blue-500" />
                        <span><strong>{item.label}:</strong> {item.value}</span>
                      </div>
                    ))}
                  </div>
                  {emp.logradouro && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 mt-3">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{hidePersonal ? PII_MASK : `${emp.logradouro}${emp.bairro ? `, ${emp.bairro}` : ""}${emp.cidade ? ` - ${emp.cidade}` : ""}${emp.estado ? `/${emp.estado}` : ""}`}</span>
                    </div>
                  )}
                  {emp.dataDemissao && <p className="text-sm text-red-600 mt-2 font-medium">Desligado em: {formatDate(emp.dataDemissao)}</p>}
                  {/* JORNADA DE TRABALHO - tabela visual ou texto */}
                  {emp.jornadaTrabalho && emp.jornadaTrabalho !== '-' && (() => {
                    const jt = emp.jornadaTrabalho;
                    const isJson = typeof jt === 'string' && jt.trim().startsWith('{');
                    if (isJson) {
                      try {
                        const jornada = JSON.parse(jt);
                        const diasMap: Record<string, string> = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
                        const diasOrdem = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
                        const diasAtivos = diasOrdem.filter(d => jornada[d]);
                        if (diasAtivos.length === 0) return null;
                        return (
                          <div className="mt-3 bg-white/60 rounded-lg border border-blue-100 p-3">
                            <p className="text-xs font-bold text-blue-800 uppercase mb-2">Jornada de Trabalho</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-blue-100/80">
                                    {diasAtivos.map(d => (
                                      <th key={d} className="px-3 py-1.5 text-center font-bold text-blue-800 border border-blue-200">{diasMap[d]}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    {diasAtivos.map(d => {
                                      const j = jornada[d];
                                      return (
                                        <td key={d} className="px-2 py-1.5 text-center border border-blue-200 text-gray-700">
                                          <span className="font-semibold">{j.entrada || '-'}</span>
                                          <span className="text-gray-400 mx-0.5">–</span>
                                          <span className="font-semibold">{j.saida || '-'}</span>
                                          {j.intervalo && <div className="text-[10px] text-gray-400">Int: {j.intervalo}</div>}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      } catch { return null; }
                    } else {
                      // Texto simples: "07:00 às 17:00"
                      return (
                        <div className="mt-3 flex items-center gap-2 text-sm text-blue-700">
                          <Clock className="h-4 w-4 shrink-0 text-blue-500" />
                          <span><strong>Jornada:</strong> {jt}</span>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>

              {/* Rev. 1878 — Isenção de Controle de Jornada (CLT Art. 62)
                  Card índigo com inciso + data + observação + link p/ termo assinado.
                  Visível apenas quando o colaborador tem cargoConfianca=1. */}
              {Number(emp.cargoConfianca) === 1 && (
                <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-indigo-800 font-bold text-sm">
                      <Lock className="h-4 w-4" /> Isenção de Controle de Jornada — Art. 62 CLT
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                      Inciso {emp.cargoConfiancaInciso || "—"}
                    </span>
                    {emp.cargoConfiancaDesde && (
                      <span className="text-xs text-indigo-700">
                        desde <strong>{formatDate(emp.cargoConfiancaDesde)}</strong>
                      </span>
                    )}
                    {emp.cargoConfiancaInciso === "II" && emp.cargoConfiancaGratificacao && (
                      <span className="text-xs text-indigo-700">
                        · gratificação <strong>{emp.cargoConfiancaGratificacao}%</strong>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-indigo-700 mt-2">
                    {emp.cargoConfiancaInciso === "I"
                      ? "Atividade externa incompatível com controle de horário (exige anotação CTPS)."
                      : emp.cargoConfiancaInciso === "II"
                        ? "Cargo de gestão/confiança — gratificação ≥ 40% (Parágrafo único do Art. 62)."
                        : emp.cargoConfiancaInciso === "III"
                          ? "Teletrabalho por produção ou tarefa (Lei 14.442/2022)."
                          : "Funcionário não sujeito a controle de jornada, horas extras, banco de horas ou adicional noturno padrão."}
                  </p>
                  {emp.cargoConfiancaObservacao && (
                    <div className="mt-2 text-xs text-indigo-900 bg-white/60 rounded p-2 whitespace-pre-line border border-indigo-100">
                      <strong>Observação:</strong> {emp.cargoConfiancaObservacao}
                    </div>
                  )}
                  {emp.cargoConfiancaTermoUrl ? (
                    <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 text-xs">
                      <FileText className="h-4 w-4 text-emerald-700 shrink-0" />
                      <a href={emp.cargoConfiancaTermoUrl} target="_blank" rel="noreferrer" className="text-emerald-800 font-medium hover:underline truncate flex-1">
                        Ver Termo Assinado{emp.cargoConfiancaTermoNomeArquivo ? ` (${emp.cargoConfiancaTermoNomeArquivo})` : ""}
                      </a>
                      {emp.cargoConfiancaTermoAssinadoEm && (
                        <span className="text-[10px] text-emerald-700 whitespace-nowrap">
                          anexado em {new Date(emp.cargoConfiancaTermoAssinadoEm).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-amber-700 italic mt-3">
                      ⚠ Sem termo de ciência assinado anexado — recomenda-se gerar e arquivar pelo cadastro do colaborador para ter prova documental em fiscalização do TST/MPT.
                    </p>
                  )}
                </div>
              )}

              {/* DESCRIÇÃO DA FUNÇÃO */}
              {funcaoDetalhes?.descricao && (
                <div className="mt-4 bg-white/70 rounded-lg p-4 border border-blue-100">
                  <p className="text-xs font-bold text-blue-800 uppercase mb-1">Descrição da Função — {funcaoDetalhes.nome} {funcaoDetalhes.cbo ? `(CBO: ${funcaoDetalhes.cbo})` : ""}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{funcaoDetalhes.descricao}</p>
                </div>
              )}

              {/* CARDS DE MÉTRICAS */}
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-10 gap-1.5 sm:gap-2 mt-3 sm:mt-5">
                {[
                  { label: "ASOs", value: asos.length, tab: "asos", bg: "bg-blue-50 border-blue-200", textColor: "text-blue-700", iconColor: "text-blue-400", icon: Stethoscope },
                  { label: "Vencidos", value: asosVencidos, tab: "asos", bg: "bg-rose-50 border-rose-200", textColor: "text-rose-700", iconColor: "text-rose-400", icon: Stethoscope },
                  { label: "A Vencer", value: asosAVencer, tab: "asos", bg: "bg-amber-50 border-amber-200", textColor: "text-amber-700", iconColor: "text-amber-400", icon: Stethoscope },
                  { label: "Treinamentos", value: treinamentos.length, tab: "trein", bg: "bg-emerald-50 border-emerald-200", textColor: "text-emerald-700", iconColor: "text-emerald-400", icon: GraduationCap },
                  { label: "Atestados", value: atestados.length, tab: "atest", bg: "bg-violet-50 border-violet-200", textColor: "text-violet-700", iconColor: "text-violet-400", icon: ClipboardList },
                  { label: "Advertências", value: advertencias.length, tab: "adv", bg: advertencias.length >= 3 ? "bg-red-50 border-red-300" : "bg-orange-50 border-orange-200", textColor: advertencias.length >= 3 ? "text-red-700" : "text-orange-700", iconColor: advertencias.length >= 3 ? "text-red-400" : "text-orange-400", icon: ShieldAlert },
                  { label: "Ponto", value: pontoResumo.length, tab: "ponto", bg: "bg-sky-50 border-sky-200", textColor: "text-sky-700", iconColor: "text-sky-400", icon: Clock },
                  { label: "EPIs", value: episEntregas.length, tab: "epis", bg: "bg-teal-50 border-teal-200", textColor: "text-teal-700", iconColor: "text-teal-400", icon: HardHat },
                  ...(emp?.tipoContrato === 'PJ'
                    ? [{ label: "Adicionais", value: horasExtras.length, tab: "he", bg: "bg-purple-50 border-purple-200", textColor: "text-purple-700", iconColor: "text-purple-400", icon: Zap }]
                    : [{ label: "Horas Extras", value: horasExtras.length, tab: "he", bg: "bg-amber-50 border-amber-200", textColor: "text-amber-700", iconColor: "text-amber-400", icon: Zap }]),
                  { label: "Habilidades", value: empSkills.length, tab: "habilidades", bg: "bg-purple-50 border-purple-200", textColor: "text-purple-700", iconColor: "text-purple-400", icon: Wrench },
                  { label: "Histórico", value: timeline.length, tab: "timeline", bg: "bg-indigo-50 border-indigo-200", textColor: "text-indigo-700", iconColor: "text-indigo-400", icon: History },
                  ...(assiduidade.mesesAvaliados > 0 ? [{
                    label: "Assiduidade",
                    value: `${assiduidade.media}%` as any,
                    tab: "ponto",
                    bg: assiduidade.media >= 95 ? "bg-emerald-50 border-emerald-200" : assiduidade.media >= 85 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-300",
                    textColor: assiduidade.media >= 95 ? "text-emerald-700" : assiduidade.media >= 85 ? "text-amber-700" : "text-red-700",
                    iconColor: assiduidade.media >= 95 ? "text-emerald-400" : assiduidade.media >= 85 ? "text-amber-400" : "text-red-400",
                    icon: UserCheck,
                  }] : []),
                  // Rev. 2853 — Indicadores de DESEMPENHO
                  {
                    label: "Atrasos",
                    value: desempenho.atrasos.total as any,
                    tab: "ponto",
                    bg: desempenho.atrasos.total === 0 ? "bg-emerald-50 border-emerald-200" : desempenho.atrasos.total >= 5 ? "bg-red-50 border-red-300" : "bg-amber-50 border-amber-200",
                    textColor: desempenho.atrasos.total === 0 ? "text-emerald-700" : desempenho.atrasos.total >= 5 ? "text-red-700" : "text-amber-700",
                    iconColor: desempenho.atrasos.total === 0 ? "text-emerald-400" : desempenho.atrasos.total >= 5 ? "text-red-400" : "text-amber-400",
                    icon: Timer,
                  },
                  ...(() => {
                    const medias = avaliacoesList.map((a: any) => parseFloat(a.mediaGeral || '0')).filter((n: number) => n > 0);
                    const mediaInt = medias.length > 0 ? Math.round((medias.reduce((s: number, v: number) => s + v, 0) / medias.length) * 10) / 10 : null;
                    return [{
                      label: "Aval. Interna",
                      value: (mediaInt != null ? `${mediaInt}` : "—") as any,
                      tab: "avaliacoes",
                      bg: mediaInt == null ? "bg-gray-50 border-gray-200" : mediaInt >= 4 ? "bg-emerald-50 border-emerald-200" : mediaInt >= 3 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-300",
                      textColor: mediaInt == null ? "text-gray-500" : mediaInt >= 4 ? "text-emerald-700" : mediaInt >= 3 ? "text-amber-700" : "text-red-700",
                      iconColor: mediaInt == null ? "text-gray-400" : mediaInt >= 4 ? "text-emerald-400" : mediaInt >= 3 ? "text-amber-400" : "text-red-400",
                      icon: Star,
                    }];
                  })(),
                  {
                    label: "Aval. Cliente",
                    value: (desempenho.avaliacaoCliente.mediaGeral != null ? `${desempenho.avaliacaoCliente.mediaGeral}` : "—") as any,
                    tab: "desempenho",
                    bg: desempenho.avaliacaoCliente.mediaGeral == null ? "bg-gray-50 border-gray-200" : desempenho.avaliacaoCliente.mediaGeral >= 8 ? "bg-emerald-50 border-emerald-200" : desempenho.avaliacaoCliente.mediaGeral >= 6 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-300",
                    textColor: desempenho.avaliacaoCliente.mediaGeral == null ? "text-gray-500" : desempenho.avaliacaoCliente.mediaGeral >= 8 ? "text-emerald-700" : desempenho.avaliacaoCliente.mediaGeral >= 6 ? "text-amber-700" : "text-red-700",
                    iconColor: desempenho.avaliacaoCliente.mediaGeral == null ? "text-gray-400" : desempenho.avaliacaoCliente.mediaGeral >= 8 ? "text-emerald-400" : desempenho.avaliacaoCliente.mediaGeral >= 6 ? "text-amber-400" : "text-red-400",
                    icon: Handshake,
                  },
                  ...(desempenho.isGestor ? [{
                    label: "Obras Geridas",
                    value: desempenho.obrasGeridas.length as any,
                    tab: "desempenho",
                    bg: "bg-cyan-50 border-cyan-200",
                    textColor: "text-cyan-700",
                    iconColor: "text-cyan-400",
                    icon: Building2,
                  }] : []),
                ].map(c => {
                  const Icon = c.icon;
                  return (
                    <button key={c.label} onClick={() => setActiveTab(c.tab)} className={`${c.bg} border rounded-xl p-2.5 text-center hover:shadow-md transition-all hover:scale-105 cursor-pointer`}>
                      <Icon className={`h-4 w-4 mx-auto mb-0.5 ${c.iconColor}`} />
                      <p className={`text-xl font-bold ${c.textColor}`}>{c.value}</p>
                      <p className={`text-[10px] font-semibold ${c.textColor} opacity-70`}>{c.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* BANNER LISTA NEGRA */}
            {(emp.listaNegra === 1 || emp.status === 'Lista_Negra') && (
              <div className="bg-red-900 border-2 border-red-600 rounded-xl p-5 flex items-start gap-4 shadow-lg">
                <div className="h-12 w-12 rounded-full bg-red-700 flex items-center justify-center shrink-0">
                  <Ban className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white text-lg tracking-wide">LISTA NEGRA — RECONTRATAÇÃO PROIBIDA</p>
                  <p className="text-sm text-red-200 mt-1">
                    Este colaborador está na <strong className="text-white">Lista Negra</strong> da empresa e <strong className="text-white">NÃO pode ser recontratado</strong>.
                  </p>
                  {(emp as any).motivoListaNegra && (
                    <p className="text-sm text-red-300 mt-2"><strong className="text-red-100">Motivo:</strong> {(emp as any).motivoListaNegra}</p>
                  )}
                  {(emp as any).dataListaNegra && (
                    <p className="text-xs text-red-400 mt-1">Incluído em: {formatDate((emp as any).dataListaNegra)} {(emp as any).listaNegraPor ? `por ${(emp as any).listaNegraPor}` : ''}</p>
                  )}
                </div>
              </div>
            )}

            {/* ALERTAS */}
            {advertencias.length >= 3 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-800 text-base">ALERTA CLT — Advertências Progressivas</p>
                  <p className="text-sm text-red-700 mt-1">
                    Este colaborador possui <strong>{advertencias.length} advertências</strong>.
                    {advertencias.length >= 4 ? " Recomenda-se análise para possível Justa Causa (Art. 482 CLT)." : " Próximo passo: Suspensão (Art. 474 CLT, máx. 30 dias)."}
                  </p>
                </div>
              </div>
            )}
            {acidentes.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800 text-base">Histórico de Acidentes ({acidentes.length})</p>
                  <p className="text-sm text-amber-700 mt-1">Este colaborador possui {acidentes.length} acidente(s) de trabalho registrado(s).</p>
                </div>
              </div>
            )}

            {/* CHECKLIST DE DESLIGAMENTO */}
            {(emp.status === "Aviso" || terminationChecklist.length > 0) && (
              <div className="border-2 border-orange-300 bg-orange-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <h3 className="font-bold text-orange-800">Checklist de Desligamento</h3>
                    {terminationChecklist.length > 0 && (
                      <Badge className="bg-orange-200 text-orange-800 text-xs">
                        {terminationChecklist.filter(i => i.concluido === 1).length}/{terminationChecklist.length} concluídos
                      </Badge>
                    )}
                  </div>
                  {terminationChecklist.length === 0 && emp.status === "Aviso" && (
                    <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={() => initChecklistMut.mutate({ companyId: selectedCompany!.id, employeeId: emp.id })}>
                      Iniciar Checklist
                    </Button>
                  )}
                </div>
                {terminationChecklist.length > 0 && (
                  <div className="space-y-1">
                    {terminationChecklist.map((item: any) => (
                      <div key={item.id} className={`flex items-center gap-3 p-2 rounded-lg ${item.concluido ? 'bg-green-50 border border-green-200' : item.obrigatorio ? 'bg-white border border-orange-200' : 'bg-white border border-gray-200'}`}>
                        <input
                          type="checkbox"
                          checked={item.concluido === 1}
                          onChange={(e) => toggleChecklistMut.mutate({ id: item.id, concluido: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-medium ${item.concluido ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                            {item.label}
                          </span>
                          {item.obrigatorio === 1 && !item.concluido && (
                            <span className="ml-2 text-[10px] font-bold text-red-600 uppercase">obrigatório</span>
                          )}
                          {item.concluido === 1 && item.concluidoPor && (
                            <span className="ml-2 text-[10px] text-gray-400">
                              por {item.concluidoPor} em {new Date(item.concluidoEm).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {terminationChecklist.filter(i => i.obrigatorio === 1 && i.concluido === 0).length === 0 && (
                      <div className="bg-green-100 border border-green-300 rounded-lg p-3 text-center">
                        <p className="text-sm font-semibold text-green-800">✓ Todos os itens obrigatórios concluídos — desligamento liberado</p>
                      </div>
                    )}
                    {terminationChecklist.filter(i => i.obrigatorio === 1 && i.concluido === 0).length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-red-700">Desligamento bloqueado até todos os itens obrigatórios serem concluídos</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ABAS - Agrupadas por Categoria */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {(() => {
                const tabGroups = [
                  {
                    label: "Geral",
                    color: "indigo",
                    tabs: [
                      { value: "timeline", label: "Timeline", icon: History, count: timeline.length },
                      { value: "historico", label: "Hist. Funcional", icon: TrendingUp, count: historicoFuncional.length },
                      { value: "funcao", label: "Função/OS", icon: FileText, count: funcaoDetalhes ? 1 : 0 },
                    ],
                  },
                  {
                    label: "SST",
                    color: "blue",
                    tabs: [
                      { value: "asos", label: "ASOs", icon: Stethoscope, count: asos.length },
                      { value: "trein", label: "Treinamentos", icon: GraduationCap, count: treinamentos.length },
                      { value: "epis", label: "EPIs", icon: HardHat, count: episEntregas.length },
                      { value: "acidentes", label: "Acidentes", icon: AlertTriangle, count: acidentes.length },
                      { value: "cipa", label: "CIPA", icon: Shield, count: cipa.length },
                      { value: "dds", label: "DDS", icon: MessageSquare, count: dds.length },
                      { value: "integracoes", label: "Integrações", icon: ShieldCheck, count: integracoes.length + integracoesSST.length },
                      { value: "termos_fcsign", label: "Termos Assinados", icon: FileSignature, count: termosFcsign.length },
                    ],
                  },
                  {
                    label: "Financeiro",
                    color: "emerald",
                    tabs: [
                      { value: "ponto", label: "Ponto", icon: Clock, count: pontoResumo.length },
                      { value: "folha", label: "Folha", icon: DollarSign, count: folhaPagamento.length },
                      { value: "he", label: emp?.tipoContrato === 'PJ' ? "Adicionais" : "Horas Extras", icon: Zap, count: horasExtras.length },
                      ...(emp?.tipoContrato === 'PJ' ? [{ value: "pj", label: "PJ", icon: FileSignature, count: (pjConformidade?.pendencias || 0) + pjContratos.length }] : []),
                      { value: "descontos_epi", label: "Descontos EPI", icon: Ban, count: (raioX as any)?.epiDiscountAlerts?.filter((a: any) => a.status === 'pendente').length || 0 },
                    ],
                  },
                  {
                    label: "Habilidades",
                    color: "purple",
                    tabs: [
                      { value: "habilidades", label: "Habilidades", icon: Wrench, count: empSkills.length },
                      { value: "assinatura", label: "Assinatura", icon: FileSignature, count: 0 },
                    ],
                  },
                  {
                    label: "Avaliação",
                    color: "amber",
                    tabs: [
                      { value: "avaliacoes", label: "Avaliações", icon: Star, count: avaliacoesList.length },
                      { value: "desempenho", label: "Desempenho", icon: Handshake, count: desempenho.obrasGeridas.length + desempenho.avaliacaoCliente.total },
                    ],
                  },
                  {
                    label: "Contratos",
                    color: "cyan",
                    tabs: [
                      { value: "contratos_clt", label: "Contratos CLT", icon: ScrollText, count: 0 },
                    ],
                  },
                  {
                    label: "Disciplinar / Saída",
                    color: "red",
                    tabs: [
                      { value: "atest", label: "Atestados", icon: ClipboardList, count: atestados.length },
                      { value: "adv", label: "Advertências", icon: ShieldAlert, count: advertencias.length },
                      { value: "processos", label: "Processos", icon: Scale, count: processos.length },
                      { value: "aviso", label: "Aviso Prévio", icon: AlertTriangle, count: avisosPrevios.length },
                      { value: "ferias", label: "Férias", icon: Palmtree, count: ferias.length },
                    ],
                  },
                  {
                    label: "Almoxarifado",
                    color: "orange",
                    tabs: [
                      { value: "emprestimos_alm", label: "Empréstimos", icon: Package, count: emprestimosAlmox.length },
                      { value: "desconto_folha_alm", label: "Desconto Folha", icon: PackageX, count: descontosAlmox.filter((d: any) => d.status === "pendente").length },
                      { value: "insumos_alm", label: "Insumos", icon: ShoppingCart, count: insumosAlmox.length },
                    ],
                  },
                  {
                    label: "Benefícios",
                    color: "teal",
                    tabs: [
                      { value: "seguro_vida", label: "Seguro de Vida", icon: Shield, count: coberturaSeguro ? 1 : 0 },
                      { value: "parceiros_lanc", label: "Parceiros / Convênios", icon: Handshake, count: ((raioX as any)?.parceirosLancamentos || []).length },
                    ],
                  },
                ];

                const activeColorMap: Record<string, string> = {
                  indigo: "bg-indigo-600 text-white shadow-sm",
                  blue: "bg-blue-600 text-white shadow-sm",
                  emerald: "bg-emerald-600 text-white shadow-sm",
                  red: "bg-red-600 text-white shadow-sm",
                  amber: "bg-amber-600 text-white shadow-sm",
                  cyan: "bg-cyan-600 text-white shadow-sm",
                  purple: "bg-purple-600 text-white shadow-sm",
                  orange: "bg-orange-600 text-white shadow-sm",
                  teal: "bg-teal-600 text-white shadow-sm",
                };
                const labelColorMap: Record<string, string> = {
                  indigo: "text-indigo-700 border-indigo-300",
                  blue: "text-blue-700 border-blue-300",
                  emerald: "text-emerald-700 border-emerald-300",
                  red: "text-red-700 border-red-300",
                  amber: "text-amber-700 border-amber-300",
                  cyan: "text-cyan-700 border-cyan-300",
                  purple: "text-purple-700 border-purple-300",
                  orange: "text-orange-700 border-orange-300",
                  teal: "text-teal-700 border-teal-300",
                };

                return (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {tabGroups.map((group) => (
                        <div key={group.label}>
                          <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 pb-1 border-b ${labelColorMap[group.color]}`}>
                            {group.label}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {group.tabs.map((tab) => {
                              const Icon = tab.icon;
                              const isActive = activeTab === tab.value;
                              return (
                                <button
                                  key={tab.value}
                                  onClick={() => setActiveTab(tab.value)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap ${
                                    isActive
                                      ? activeColorMap[group.color]
                                      : "bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-100"
                                  }`}
                                >
                                  <Icon className="h-3 w-3 shrink-0" />
                                  <span>{tab.label}</span>
                                  {tab.count > 0 && (
                                    <span className={`ml-0.5 px-1 py-0 rounded-full text-[9px] font-bold leading-tight ${
                                      isActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                                    }`}>{tab.count}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ============ TIMELINE ============ */}
              <TabsContent value="timeline" className="mt-4">
                {timeline.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum evento registrado</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-indigo-500" /> Timeline Cronológica — {timeline.length} eventos</h3>
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                      <div className="space-y-3">
                        {timeline.map((ev: any, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setTimelineEvt(ev)}
                            className="w-full flex items-start gap-4 ml-0 text-left group focus:outline-none"
                            title="Ver detalhes do registro"
                          >
                            <div className={`shrink-0 w-9 h-9 rounded-full ${TIMELINE_COLORS[ev.cor] || "bg-gray-400"} flex items-center justify-center z-10`}>
                              <ChevronRight className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-100 transition-all group-hover:border-indigo-300 group-hover:bg-indigo-50/40 group-hover:shadow-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-500">{formatDate(ev.data)}</span>
                                <Badge variant="outline" className="text-[10px]">{ev.tipo}</Badge>
                              </div>
                              <p className="text-sm text-gray-700 mt-1">{ev.descricao}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ ASOs ============ */}
              <TabsContent value="asos" className="mt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-muted-foreground">{asos.length} registro(s)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleExportSST} className="gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50">
                      <FileDown className="h-3.5 w-3.5" /> Exportar PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownloadZip} disabled={isDownloadingZip} className="gap-1.5 text-indigo-700 border-indigo-300 hover:bg-indigo-50">
                      <FileDown className="h-3.5 w-3.5" /> {isDownloadingZip ? "Baixando..." : "Baixar ZIP"}
                    </Button>
                  </div>
                </div>
                {asos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum ASO registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-blue-50 border-b">
                        <th className="p-3 text-left font-semibold text-blue-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Data Exame</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Validade</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Status</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Vencimento</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Resultado</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Médico</th>
                        <th className="p-3 text-left font-semibold text-blue-900">CRM</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Exames</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Arquivo</th>
                      </tr></thead>
                      <tbody>
                        {asos.map((a: any) => {
                          const temRestricoes = !!(a.restricoes && String(a.restricoes).trim() && !/^(nenhuma|sem restri|n[aã]o|n\/a|-)\.?$/i.test(String(a.restricoes).trim()));
                          const aptoBadge = (v: any) => {
                            const t = String(v || "").trim();
                            if (!t) return <span className="text-muted-foreground">—</span>;
                            const inapto = /inapto|inad/i.test(t);
                            const apto = /^apto/i.test(t);
                            return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${inapto ? "bg-red-100 text-red-700" : apto ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{t}</span>;
                          };
                          return (
                          <Fragment key={a.id}>
                          <tr className={`border-b hover:bg-muted/30 ${a.temIa ? "border-b-0" : "last:border-0"}`}>
                            <td className="p-3 font-medium">{a.tipo}</td>
                            <td className="p-3">{formatDate(a.dataExame)}</td>
                            <td className="p-3">{a.validadeDias} dias</td>
                            <td className="p-3"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                            <td className="p-3">{formatDate(a.dataVencimento)}</td>
                            <td className="p-3"><span className={a.resultado === "Apto" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{a.resultado}</span></td>
                            <td className="p-3">{a.medico || "-"}</td>
                            <td className="p-3">{a.crm || "-"}</td>
                            <td className="p-3 max-w-[300px]">{a.examesRealizados || "-"}</td>
                            <td className="p-3">{a.documentoUrl ? <a href={a.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 whitespace-nowrap"><FileText className="h-3.5 w-3.5" /> Ver ASO</a> : <span className="text-muted-foreground text-xs">—</span>}</td>
                          </tr>
                          {a.temIa && (() => {
                            const restricoesItens = parseRestricoesItens(a.restricoes);
                            const fatoresItens = parseFatoresRiscoCategorias(a.fatoresRisco);
                            return (
                            <tr className="border-b last:border-0 bg-slate-50/60">
                              <td colSpan={10} className="px-3 pb-3 pt-0">
                                <div className={`rounded-lg border ${temRestricoes ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-white"} p-3`}>
                                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                                    <Sparkles className="h-3.5 w-3.5 text-violet-500" /> FICHA DO ASO (leitura por IA · revisada)
                                    {a.iaConfianca != null && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">confiança {a.iaConfianca}%</span>}
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    {/* Aptidões — tabela campo/valor */}
                                    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-slate-100"><th colSpan={2} className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Aptidões</th></tr>
                                        </thead>
                                        <tbody>
                                          <tr className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-600">Apto altura (NR-35)</td><td className="px-3 py-1.5 text-right">{aptoBadge(a.aptoAltura)}</td></tr>
                                          <tr className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-600">Espaço confinado (NR-33)</td><td className="px-3 py-1.5 text-right">{aptoBadge(a.aptoEspacoConfinado)}</td></tr>
                                          <tr className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-600">Resultado geral</td><td className="px-3 py-1.5 text-right"><span className={a.resultado === "Apto" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{a.resultado || "—"}</span></td></tr>
                                          {a.iaConfianca != null && <tr className="border-t border-slate-100"><td className="px-3 py-1.5 text-slate-600">Confiança da leitura</td><td className="px-3 py-1.5 text-right font-medium text-violet-700">{a.iaConfianca}%</td></tr>}
                                        </tbody>
                                      </table>
                                    </div>
                                    {/* Restrições — tabela itemizada */}
                                    <div className={`overflow-hidden rounded-md border ${temRestricoes ? "border-red-300" : "border-slate-200"} bg-white`}>
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className={temRestricoes ? "bg-red-100" : "bg-slate-100"}>
                                            <th colSpan={2} className={`px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide ${temRestricoes ? "text-red-700" : "text-slate-500"}`}>
                                              <span className="inline-flex items-center gap-1.5">{temRestricoes && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />} Restrições{temRestricoes ? ` (${restricoesItens.length})` : ""}</span>
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {temRestricoes && restricoesItens.length > 0 ? (
                                            restricoesItens.map((r, i) => (
                                              <tr key={i} className="border-t border-red-100"><td className="w-7 px-3 py-1.5 align-top font-semibold text-red-700">{i + 1}</td><td className="px-3 py-1.5 font-medium text-red-800">{r}</td></tr>
                                            ))
                                          ) : (
                                            <tr className="border-t border-slate-100"><td colSpan={2} className="px-3 py-1.5 text-slate-500">Sem restrições registradas.</td></tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                  {/* Fatores de risco — tabela por categoria */}
                                  {fatoresItens.length > 0 && (
                                    <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="bg-slate-100">
                                            <th className="w-40 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Categoria de risco</th>
                                            <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fatores identificados</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {fatoresItens.map((f, i) => (
                                            <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5 align-top font-medium text-slate-700">{f.categoria}</td><td className="px-3 py-1.5 text-slate-600">{f.texto}</td></tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                            );
                          })()}
                          </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ TREINAMENTOS ============ */}
              <TabsContent value="trein" className="mt-4">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-muted-foreground">{treinamentos.length} registro(s)</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={handleExportSST} className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                      <FileDown className="h-3.5 w-3.5" /> Exportar PDF
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDownloadZip} disabled={isDownloadingZip} className="gap-1.5 text-indigo-700 border-indigo-300 hover:bg-indigo-50">
                      <FileDown className="h-3.5 w-3.5" /> {isDownloadingZip ? "Baixando..." : "Baixar ZIP"}
                    </Button>
                  </div>
                </div>
                {treinamentos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum treinamento registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-emerald-50 border-b">
                        <th className="p-3 text-left font-semibold text-emerald-900">Treinamento</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Norma</th>
                        <th className="p-3 text-center font-semibold text-emerald-900">Carga H.</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Realização</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Validade</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Status</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Instrutor</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Certificado</th>
                      </tr></thead>
                      <tbody>
                        {treinamentos.map((t: any) => (
                          <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{t.nome}</td>
                            <td className="p-3">{t.norma || "-"}</td>
                            <td className="p-3 text-center">{t.cargaHoraria || "-"}</td>
                            <td className="p-3">{formatDate(t.dataRealizacao)}</td>
                            <td className="p-3">{formatDate(t.dataValidade)}</td>
                            <td className="p-3">{t.dataValidade ? <StatusBadge status={t.statusCalculado || "VÁLIDO"} diasRestantes={t.diasRestantes || 999} /> : "-"}</td>
                            <td className="p-3">{t.instrutor || "-"}</td>
                            <td className="p-3">{t.certificadoUrl ? <a href={t.certificadoUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline flex items-center gap-1 whitespace-nowrap"><FileText className="h-3.5 w-3.5" /> Ver Cert.</a> : <span className="text-muted-foreground text-xs">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ ATESTADOS ============ */}
              <TabsContent value="atest" className="mt-4">
                {atestados.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum atestado registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-purple-50 border-b">
                        <th className="p-3 text-left font-semibold text-purple-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Data</th>
                        <th className="p-3 text-center font-semibold text-purple-900">Afastamento</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Retorno</th>
                        <th className="p-3 text-left font-semibold text-purple-900">CID</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Médico</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Arquivo</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Observações</th>
                      </tr></thead>
                      <tbody>
                        {atestados.map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{a.tipo}</td>
                            <td className="p-3">{formatDate(a.dataEmissao)}</td>
                            <td className="p-3 text-center">
                              {a.afastamentoTipo === "horas" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold whitespace-nowrap">
                                  <Clock className="h-3 w-3" /> {fmtHorasAfast(a.horasAfastamento)}
                                </span>
                              ) : (
                                <span className="font-semibold">{fmtAfastamentoAtestado(a)}</span>
                              )}
                            </td>
                            <td className="p-3">{formatDate(a.dataRetorno)}</td>
                            <td className="p-3">{a.cid || "-"}</td>
                            <td className="p-3">{a.medico || "-"}</td>
                            <td className="p-3">{a.documentoUrl ? (canPreviewFile(a.documentoUrl) ? <button onClick={() => setAtestPreviewDoc({ url: a.documentoUrl, name: a.documentoUrl.split("/").pop() || "arquivo", title: `Atestado - ${a.tipo}` })} className="text-blue-600 hover:underline flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Ver</button> : <a href={a.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Ver</a>) : <span className="text-muted-foreground text-xs">—</span>}</td>
                            <td className="p-3 max-w-[250px] truncate">{a.observacoes || a.descricao || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ ADVERTÊNCIAS ============ */}
              <TabsContent value="adv" className="mt-4">
                {advertencias.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma advertência registrada</div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl p-4 border shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-700">Progressão Disciplinar (CLT)</p>
                        <span className="text-xs text-muted-foreground">Total: {advertencias.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3].map(n => <div key={n} className={`flex-1 h-3 rounded-full ${advertencias.length >= n ? "bg-orange-500" : "bg-gray-200"}`} />)}
                        <div className={`flex-1 h-3 rounded-full ${advertencias.some((a: any) => a.tipoAdvertencia === "Suspensao") ? "bg-red-500" : "bg-gray-200"}`} />
                        <div className={`flex-1 h-3 rounded-full ${advertencias.some((a: any) => a.tipoAdvertencia === "JustaCausa") ? "bg-red-800" : "bg-gray-200"}`} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>1ª Adv.</span><span>2ª Adv.</span><span>3ª Adv.</span><span>Suspensão</span><span>Justa Causa</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-orange-50 border-b">
                          <th className="p-3 text-center font-semibold text-orange-900 w-16">Seq.</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Tipo</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Data</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Motivo</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Testemunhas</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Aplicado por</th>
                        </tr></thead>
                        <tbody>
                          {advertencias.map((a: any, idx: number) => (
                            <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.tipoAdvertencia === "Suspensao" ? "bg-red-50" : a.tipoAdvertencia === "JustaCausa" ? "bg-red-100" : ""}`}>
                              <td className="p-3 text-center"><span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "bg-red-200 text-red-800" : "bg-orange-200 text-orange-800"}`}>{a.sequencia || idx + 1}ª</span></td>
                              <td className="p-3"><Badge variant={a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "destructive" : "secondary"} className="text-xs">{a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia}</Badge></td>
                              <td className="p-3">{formatDate(a.dataOcorrencia)}</td>
                              <td className="p-3 max-w-[300px]">{a.motivo}</td>
                              <td className="p-3">{a.testemunhas || "-"}</td>
                              <td className="p-3">{a.aplicadoPor || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ PONTO ============ */}
              <TabsContent value="ponto" className="mt-4">
                <div className="space-y-4">
                  {/* Indicador de Assiduidade Geral */}
                  {assiduidade.mesesAvaliados > 0 && (
                    <div className={`rounded-xl border-2 p-4 ${
                      assiduidade.media >= 95 ? "bg-emerald-50 border-emerald-300" :
                      assiduidade.media >= 85 ? "bg-amber-50 border-amber-300" :
                      "bg-red-50 border-red-300"
                    }`}>
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <UserCheck className={`h-8 w-8 ${
                            assiduidade.media >= 95 ? "text-emerald-600" :
                            assiduidade.media >= 85 ? "text-amber-600" :
                            "text-red-600"
                          }`} />
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Assiduidade Média Geral</p>
                            <p className={`text-3xl font-bold ${
                              assiduidade.media >= 95 ? "text-emerald-700" :
                              assiduidade.media >= 85 ? "text-amber-700" :
                              "text-red-700"
                            }`}>{assiduidade.media}%</p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              {assiduidade.totalDiasTrabalhados} dia(s) trabalhado(s) de {assiduidade.totalDiasTrabalhados + assiduidade.totalFaltas} registrado(s)
                              {" • "}{assiduidade.totalFaltas} falta(s) em {assiduidade.mesesAvaliados} mês(es)
                            </p>
                          </div>
                        </div>
                        <div className="flex-1 min-w-[200px] max-w-md">
                          <div className="w-full bg-white rounded-full h-3 border border-gray-200 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${
                              assiduidade.media >= 95 ? "bg-emerald-500" :
                              assiduidade.media >= 85 ? "bg-amber-500" :
                              "bg-red-500"
                            }`} style={{ width: `${Math.max(0, Math.min(100, assiduidade.media))}%` }} />
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 text-right">
                            {assiduidade.media >= 95 ? "Excelente — frequência exemplar" :
                             assiduidade.media >= 85 ? "Atenção — algumas faltas no período" :
                             "Crítico — alto índice de faltas"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Resumo mensal */}
                  {pontoResumo.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <div className="p-3 bg-cyan-50 border-b"><h4 className="font-semibold text-cyan-900 text-sm">Resumo Mensal de Ponto</h4></div>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-gray-50">
                          <th className="p-3 text-left font-semibold">Competência</th>
                          <th className="p-3 text-center font-semibold">Dias Trab.</th>
                          <th className="p-3 text-center font-semibold">Faltas</th>
                          <th className="p-3 text-center font-semibold">Assiduidade</th>
                          <th className="p-3 text-center font-semibold">Ajustes Manuais</th>
                        </tr></thead>
                        <tbody>
                          {pontoResumo.map((p: any) => {
                            const perc = typeof p.assiduidadePerc === "number" ? p.assiduidadePerc : 100;
                            const corPerc = perc >= 95 ? "text-emerald-600" : perc >= 85 ? "text-amber-600" : "text-red-600";
                            return (
                              <tr key={p.mesReferencia} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-3 font-medium">{p.mesReferencia ? p.mesReferencia.split("-").reverse().join("/") : "—"}</td>
                                <td className="p-3 text-center">{p.diasTrabalhados}</td>
                                <td className={`p-3 text-center font-semibold ${(p.faltas || 0) > 0 ? "text-red-600" : "text-gray-400"}`}>{p.faltas || 0}</td>
                                <td className={`p-3 text-center font-bold ${corPerc}`}>{perc}%</td>
                                <td className="p-3 text-center">{p.ajustesManuais || 0}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Atrasos detalhados */}
                  {atrasosDetalhados.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <div className="p-3 bg-amber-50 border-b"><h4 className="font-semibold text-amber-900 text-sm">Atrasos Detalhados ({atrasosDetalhados.length})</h4></div>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-gray-50">
                          <th className="p-3 text-left font-semibold">Data</th>
                          <th className="p-3 text-left font-semibold">Entrada</th>
                          <th className="p-3 text-left font-semibold">Atraso</th>
                        </tr></thead>
                        <tbody>
                          {atrasosDetalhados.map((a: any, idx: number) => {
                            const atrasoDate = a.data ? new Date(a.data + 'T12:00:00') : null;
                            const mesParam = atrasoDate ? `${atrasoDate.getFullYear()}-${String(atrasoDate.getMonth() + 1).padStart(2, '0')}` : '';
                            return (
                              <tr key={idx} className="border-b last:border-0 hover:bg-amber-50/50 cursor-pointer transition-colors"
                                onClick={() => {
                                  if (employeeId && mesParam) {
                                    onClose();
                                    navigate(`/fechamento-ponto?funcionario=${employeeId}&mes=${mesParam}`);
                                  }
                                }}
                                title="Clique para abrir o cartão de ponto deste mês"
                              >
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <Eye className="h-3.5 w-3.5 text-amber-400" />
                                    <span className="text-blue-600 underline underline-offset-2">{formatDate(a.data)}</span>
                                  </div>
                                </td>
                                <td className="p-3 font-mono">{a.entrada1 || "-"}</td>
                                <td className="p-3 font-mono text-amber-600 font-semibold">{a.atraso}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Faltas */}
                  {faltasDetalhadas.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <div className="p-3 bg-red-50 border-b"><h4 className="font-semibold text-red-900 text-sm">Faltas Detalhadas ({faltasDetalhadas.length})</h4></div>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-gray-50">
                          <th className="p-3 text-left font-semibold">Data</th>
                          <th className="p-3 text-center font-semibold">Faltas</th>
                        </tr></thead>
                        <tbody>
                          {faltasDetalhadas.map((f: any, idx: number) => {
                            // Build URL to navigate to cartão de ponto for this date
                            const faltaDate = f.data ? new Date(f.data + 'T12:00:00') : null;
                            const mesParam = faltaDate ? `${faltaDate.getFullYear()}-${String(faltaDate.getMonth() + 1).padStart(2, '0')}` : '';
                            return (
                              <tr key={idx} className="border-b last:border-0 hover:bg-red-50/50 cursor-pointer transition-colors"
                                onClick={() => {
                                  if (employeeId && mesParam) {
                                    onClose();
                                    navigate(`/fechamento-ponto?funcionario=${employeeId}&mes=${mesParam}`);
                                  }
                                }}
                                title="Clique para abrir o cartão de ponto deste mês"
                              >
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <Eye className="h-3.5 w-3.5 text-red-400" />
                                    <span className="text-blue-600 underline underline-offset-2">{formatDate(f.data)}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-center font-semibold text-red-600">{f.faltas}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {pontoResumo.length === 0 && atrasosDetalhados.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">Nenhum registro de ponto encontrado</div>
                  )}
                </div>
              </TabsContent>

              {/* ============ FOLHA ============ */}
              <TabsContent value="folha" className="mt-4">
                {/* ===== Complemento Salarial (por fora) ===== */}
                {emp?.recebeComplemento === 1 && emp?.valorComplemento ? (() => {
                  const baseNum = Number(String(emp.salarioBase || "0").replace(/\./g,"").replace(",",".")) || 0;
                  const compNum = Number(String(emp.valorComplemento).replace(/\./g,"").replace(",",".")) || 0;
                  const totalNum = baseNum + compNum;
                  const folhaCount = folhaPagamento.length;
                  const totalAcumComp = compNum * folhaCount;
                  return (
                    <div className="mb-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-bold text-amber-900 flex items-center gap-2">
                          <Plus className="w-5 h-5 text-amber-600" /> Complemento Salarial (por fora)
                        </h3>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-semibold">Pago fora da folha CLT</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white border border-amber-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Salário Base CLT</p>
                          <p className="text-xl font-bold text-amber-900 mt-1 font-mono">{formatSalario(emp.salarioBase)}</p>
                        </div>
                        <div className="bg-white border border-amber-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Complemento Mensal</p>
                          <p className="text-xl font-bold text-orange-700 mt-1 font-mono">{formatSalario(emp.valorComplemento)}</p>
                        </div>
                        <div className="bg-white border-2 border-amber-400 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Total Mensal (Base + Compl.)</p>
                          <p className="text-xl font-bold text-green-700 mt-1 font-mono">{formatSalario(String(totalNum.toFixed(2)))}</p>
                        </div>
                        <div className="bg-white border border-amber-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Acumulado Compl. ({folhaCount} folhas)</p>
                          <p className="text-xl font-bold text-orange-700 mt-1 font-mono">{formatSalario(String(totalAcumComp.toFixed(2)))}</p>
                        </div>
                      </div>
                      {emp.descricaoComplemento && (
                        <p className="text-xs text-amber-800 mt-3"><strong>Observação:</strong> {emp.descricaoComplemento}</p>
                      )}
                      <p className="text-[11px] text-amber-700 mt-2 italic">Este valor é somado ao líquido da folha pelo financeiro e não consta nos holerites CLT abaixo.</p>
                    </div>
                  );
                })() : null}

                {folhaPagamento.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum registro de folha de pagamento</div>
                ) : (() => {
                  const compNum = (emp?.recebeComplemento === 1 && emp?.valorComplemento)
                    ? (Number(String(emp.valorComplemento).replace(/\./g,"").replace(",",".")) || 0)
                    : 0;
                  return (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-indigo-50 border-b">
                        <th className="p-3 text-left font-semibold text-indigo-900">Competência</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">Salário Base</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">H. Extras</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">Descontos</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">Líquido CLT</th>
                        {compNum > 0 && <th className="p-3 text-right font-semibold text-amber-800 bg-amber-50">Compl. (fora)</th>}
                        {compNum > 0 && <th className="p-3 text-right font-semibold text-green-800 bg-green-50">TOTAL Recebido</th>}
                        <th className="p-3 text-center font-semibold text-indigo-900">Status</th>
                      </tr></thead>
                      <tbody>
                        {folhaPagamento.map((f: any) => {
                          const liq = Number(String(f.salarioLiquido || "0").replace(/\./g,"").replace(",",".")) || 0;
                          const totalReceb = liq + compNum;
                          return (
                            <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{f.mesReferencia ? f.mesReferencia.split("-").reverse().join("/") : "—"}</td>
                              <td className="p-3 text-right font-mono">{formatSalario(f.salarioBase)}</td>
                              <td className="p-3 text-right font-mono text-green-600">{formatSalario(f.horasExtrasValor)}</td>
                              <td className="p-3 text-right font-mono text-red-600">{formatSalario(f.totalDescontos)}</td>
                              <td className="p-3 text-right font-mono font-bold text-lg">{formatSalario(f.salarioLiquido)}</td>
                              {compNum > 0 && <td className="p-3 text-right font-mono text-orange-700 bg-amber-50/40">{formatSalario(String(compNum.toFixed(2)))}</td>}
                              {compNum > 0 && <td className="p-3 text-right font-mono font-bold text-green-700 bg-green-50/40">{formatSalario(String(totalReceb.toFixed(2)))}</td>}
                              <td className="p-3 text-center"><Badge variant={f.status === "Pago" ? "default" : "secondary"}>{f.status}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  );
                })()}
              </TabsContent>

              {/* ============ HORAS EXTRAS / ADICIONAIS PJ ============ */}
              <TabsContent value="he" className="mt-4">
                {emp?.tipoContrato === 'PJ' ? (
                  /* ---- ADICIONAIS PJ ---- */
                  horasExtras.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum adicional registrado</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Total Adicionais</p>
                          <p className="text-2xl font-bold text-purple-600">{fmtNum(horasExtras.length)}</p>
                        </CardContent></Card>
                        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Horas Adicionais</p>
                          <p className="text-2xl font-bold text-blue-600">{totalHEHoras.toFixed(1)}h</p>
                        </CardContent></Card>
                        <Card className="border-l-4 border-l-green-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Valor Total Adicionais</p>
                          <p className="text-2xl font-bold text-green-600">{formatSalario(String(totalHEValor.toFixed(2)))}</p>
                        </CardContent></Card>
                      </div>
                      <div className="overflow-x-auto rounded-lg border bg-white">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-purple-50 border-b">
                            <th className="p-3 text-left font-semibold text-purple-900">Competência</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Tipo</th>
                            <th className="p-3 text-right font-semibold text-purple-900">Horas</th>
                            <th className="p-3 text-right font-semibold text-purple-900">Valor Total</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Descrição</th>
                          </tr></thead>
                          <tbody>
                            {horasExtras.map((h: any) => (
                              <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-3 font-medium">{h.mesReferencia ? h.mesReferencia.split("-").reverse().join("/") : "—"}</td>
                                <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">{h.descricao?.includes('Comissão') ? 'Comissão' : h.descricao?.includes('Bônus') ? 'Bônus' : 'Adicional'}</span></td>
                                <td className="p-3 text-right font-mono font-semibold text-purple-600">{h.quantidadeHoras}h</td>
                                <td className="p-3 text-right font-mono font-bold text-green-600">{formatSalario(h.valorTotal)}</td>
                                <td className="p-3 max-w-[200px] truncate">{h.descricao || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : (
                  /* ---- HORAS EXTRAS CLT ---- */
                  horasExtras.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhuma hora extra registrada</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Total Registros</p>
                          <p className="text-2xl font-bold text-orange-600">{fmtNum(horasExtras.length)}</p>
                        </CardContent></Card>
                        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Total Horas</p>
                          <p className="text-2xl font-bold text-blue-600">{totalHEHoras.toFixed(1)}h</p>
                        </CardContent></Card>
                        <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Custo Total</p>
                          <p className="text-2xl font-bold text-red-600">{formatSalario(String(totalHEValor.toFixed(2)))}</p>
                        </CardContent></Card>
                      </div>
                      <div className="overflow-x-auto rounded-lg border bg-white">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-orange-50 border-b">
                            <th className="p-3 text-left font-semibold text-orange-900">Competência</th>
                            <th className="p-3 text-right font-semibold text-orange-900">Horas</th>
                            <th className="p-3 text-right font-semibold text-orange-900">% Acréscimo</th>
                            <th className="p-3 text-right font-semibold text-orange-900">Valor/Hora</th>
                            <th className="p-3 text-right font-semibold text-orange-900">Valor Total</th>
                            <th className="p-3 text-left font-semibold text-orange-900">Descrição</th>
                          </tr></thead>
                          <tbody>
                            {horasExtras.map((h: any) => (
                              <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-3 font-medium">{h.mesReferencia ? h.mesReferencia.split("-").reverse().join("/") : "—"}</td>
                                <td className="p-3 text-right font-mono font-semibold text-orange-600">{h.quantidadeHoras}h</td>
                                <td className="p-3 text-right font-mono">{h.percentualAcrescimo || "50"}%</td>
                                <td className="p-3 text-right font-mono">{formatSalario(h.valorHoraBase)}</td>
                                <td className="p-3 text-right font-mono font-bold text-red-600">{formatSalario(h.valorTotal)}</td>
                                <td className="p-3 max-w-[200px] truncate">{h.descricao || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}
              </TabsContent>

              {/* ============ EPIs ============ */}
              <TabsContent value="epis" className="mt-4">
                {episEntregas.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma entrega de EPI registrada</div>
                ) : (
                  <div className="space-y-3">
                    {/* Alerta de descontos pendentes */}
                    {((raioX as any)?.epiDiscountAlerts || []).filter((a: any) => a.status === 'pendente').length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-1">
                          <AlertTriangle className="h-4 w-4" />
                          Descontos Pendentes de EPI
                        </div>
                        <p className="text-xs text-red-600">
                          Este colaborador possui {((raioX as any)?.epiDiscountAlerts || []).filter((a: any) => a.status === 'pendente').length} desconto(s) de EPI pendente(s) de validação pelo DP.
                          Valor total: {hideSalary ? SALARY_MASK : ((raioX as any)?.epiDiscountAlerts || []).filter((a: any) => a.status === 'pendente').reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    )}
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-teal-50 border-b">
                          <th className="p-3 text-left font-semibold text-teal-900">EPI</th>
                          <th className="p-3 text-left font-semibold text-teal-900">CA</th>
                          <th className="p-3 text-center font-semibold text-teal-900">Tam.</th>
                          <th className="p-3 text-center font-semibold text-teal-900">Qtd</th>
                          <th className="p-3 text-left font-semibold text-teal-900">Data Entrega</th>
                          <th className="p-3 text-left font-semibold text-teal-900">Data Devolução</th>
                          <th className="p-3 text-left font-semibold text-teal-900">Motivo</th>
                          <th className="p-3 text-center font-semibold text-teal-900">Ficha</th>
                        </tr></thead>
                        <tbody>
                          {episEntregas.map((e: any) => {
                            const isMauUso = e.motivo && (e.motivo.includes('Mau Uso') || e.motivo.includes('Perda') || e.motivo.includes('Furto') || e.motivo.includes('Extravio'));
                            const hasLink = !!e.fichaUrl;
                            return (
                              <tr
                                key={e.id}
                                className={`border-b last:border-0 hover:bg-muted/30 ${isMauUso ? 'bg-red-50/50' : ''} ${hasLink ? 'cursor-pointer hover:bg-teal-50/60' : ''}`}
                                onClick={() => { if (hasLink) window.open(e.fichaUrl, '_blank'); }}
                                title={hasLink ? 'Clique para ver a ficha de entrega assinada' : ''}
                              >
                                <td className="p-3 font-medium">
                                  <span className={hasLink ? 'text-teal-700' : ''}>{e.nomeEpi || "-"}</span>
                                </td>
                                <td className="p-3 font-mono">{e.ca || "-"}</td>
                                <td className="p-3 text-center text-xs">{e.tamanho || "-"}</td>
                                <td className="p-3 text-center">{e.quantidade || 1}</td>
                                <td className="p-3">{formatDate(e.dataEntrega)}</td>
                                <td className="p-3">{formatDate(e.dataDevolucao)}</td>
                                <td className="p-3">
                                  <span className={isMauUso ? 'text-red-600 font-semibold' : ''}>{e.motivo || "Entrega regular"}</span>
                                  {isMauUso && e.valorCobranca && <span className="ml-1 text-xs text-red-500">({hideSalary ? SALARY_MASK : parseFloat(e.valorCobranca).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</span>}
                                </td>
                                <td className="p-3 text-center">
                                  {hasLink ? (
                                    <a href={e.fichaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center justify-center gap-1" title="Ver ficha assinada" onClick={(ev) => ev.stopPropagation()}>
                                      <FileText className="h-4 w-4" /> Ver
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ DESCONTOS EPI ============ */}
              <TabsContent value="descontos_epi" className="mt-4">
                {(() => {
                  const alerts = (raioX as any)?.epiDiscountAlerts || [];
                  if (alerts.length === 0) return <div className="text-center py-12 text-muted-foreground">Nenhum desconto de EPI registrado</div>;
                  const pendentes = alerts.filter((a: any) => a.status === 'pendente');
                  const confirmados = alerts.filter((a: any) => a.status === 'confirmado');
                  const cancelados = alerts.filter((a: any) => a.status === 'cancelado');
                  const motivoLabel = (m: string) => m === 'mau_uso' ? 'Mau Uso / Dano' : m === 'perda' ? 'Perda' : m === 'furto' ? 'Furto / Extravio' : m;
                  return (
                    <div className="space-y-4">
                      {/* Resumo */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-amber-700">{fmtNum(pendentes.length)}</p>
                          <p className="text-xs text-amber-600 font-medium">Pendentes</p>
                          <p className="text-xs text-amber-500 mt-1">{hideSalary ? SALARY_MASK : pendentes.reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-green-700">{fmtNum(confirmados.length)}</p>
                          <p className="text-xs text-green-600 font-medium">Confirmados</p>
                          <p className="text-xs text-green-500 mt-1">{hideSalary ? SALARY_MASK : confirmados.reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-gray-500">{fmtNum(cancelados.length)}</p>
                          <p className="text-xs text-gray-500 font-medium">Cancelados</p>
                          <p className="text-xs text-gray-400 mt-1">{hideSalary ? SALARY_MASK : cancelados.reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                      </div>
                      {/* Tabela */}
                      <div className="overflow-x-auto rounded-lg border bg-white">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-red-50 border-b">
                            <th className="p-3 text-left font-semibold text-red-900">EPI</th>
                            <th className="p-3 text-left font-semibold text-red-900">Motivo</th>
                            <th className="p-3 text-right font-semibold text-red-900">Qtd</th>
                            <th className="p-3 text-right font-semibold text-red-900">Unit.</th>
                            <th className="p-3 text-right font-semibold text-red-900">Total</th>
                            <th className="p-3 text-left font-semibold text-red-900">Mês Ref.</th>
                            <th className="p-3 text-center font-semibold text-red-900">Status</th>
                            <th className="p-3 text-center font-semibold text-red-900">Ações</th>
                          </tr></thead>
                          <tbody>
                            {alerts.map((a: any) => (
                              <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.status === 'pendente' ? 'bg-amber-50/50' : a.status === 'cancelado' ? 'bg-gray-50/50 opacity-60' : ''}`}>
                                <td className="p-3 font-medium text-xs">{a.epiNome || "-"}{a.ca ? ` (CA: ${a.ca})` : ''}</td>
                                <td className="p-3 text-xs">{motivoLabel(a.motivoCobranca)}</td>
                                <td className="p-3 text-right font-mono text-xs">{a.quantidade}</td>
                                <td className="p-3 text-right font-mono text-xs">{hideSalary ? SALARY_MASK : parseFloat(a.valorUnitario || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                <td className={`p-3 text-right font-mono font-bold ${a.status === 'cancelado' ? 'text-gray-400 line-through' : 'text-red-600'}`}>{hideSalary ? SALARY_MASK : parseFloat(a.valorTotal || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                <td className="p-3 text-xs">{a.mesReferencia || "-"}</td>
                                <td className="p-3 text-center">
                                  <Badge variant={a.status === 'pendente' ? 'secondary' : a.status === 'confirmado' ? 'destructive' : 'outline'}
                                    className={`text-xs ${a.status === 'pendente' ? 'bg-amber-100 text-amber-800' : a.status === 'confirmado' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                                    {a.status === 'pendente' ? 'Pendente' : a.status === 'confirmado' ? 'Descontado' : 'Cancelado'}
                                  </Badge>
                                </td>
                                <td className="p-3 text-center">
                                  {a.status === 'pendente' ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => {
                                          if (confirm('Confirmar desconto de ' + (hideSalary ? SALARY_MASK : parseFloat(a.valorTotal || '0').toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })) + ' na folha do colaborador?')) {
                                            fetch('/api/trpc/epis.validateDiscount', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({ json: { id: a.id, acao: 'confirmado' } }),
                                            }).then(() => window.location.reload());
                                          }
                                        }}
                                        className="px-2 py-1 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                                        title="Confirmar desconto em folha"
                                      >
                                        Confirmar
                                      </button>
                                      <button
                                        onClick={() => {
                                          const justificativa = prompt('Justificativa para cancelar o desconto:');
                                          if (justificativa && justificativa.trim()) {
                                            fetch('/api/trpc/epis.validateDiscount', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({ json: { id: a.id, acao: 'cancelado', justificativa: justificativa.trim() } }),
                                            }).then(() => window.location.reload());
                                          } else if (justificativa !== null) {
                                            alert('Justificativa obrigatória para cancelar o desconto.');
                                          }
                                        }}
                                        className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                        title="Cancelar desconto"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {a.validadoPor ? `${a.validadoPor}` : '-'}
                                      {a.dataValidacao ? ` em ${formatDate(a.dataValidacao)}` : ''}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {cancelados.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-2">
                          {cancelados.map((c: any) => (
                            <div key={c.id} className="flex gap-2 py-1">
                              <span className="font-medium">Cancelado:</span>
                              <span>{c.epiNome}</span>
                              <span className="italic">— {c.justificativa || 'Sem justificativa'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>

              {/* ============ ACIDENTES ============ */}
              <TabsContent value="acidentes" className="mt-4">
                {acidentes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum acidente de trabalho registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-red-50 border-b">
                        <th className="p-3 text-left font-semibold text-red-900">Data</th>
                        <th className="p-3 text-left font-semibold text-red-900">Hora</th>
                        <th className="p-3 text-left font-semibold text-red-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-red-900">Gravidade</th>
                        <th className="p-3 text-left font-semibold text-red-900">Local</th>
                        <th className="p-3 text-left font-semibold text-red-900">Parte Corpo</th>
                        <th className="p-3 text-center font-semibold text-red-900">Dias Afast.</th>
                        <th className="p-3 text-left font-semibold text-red-900">CAT</th>
                        <th className="p-3 text-left font-semibold text-red-900">Descrição</th>
                      </tr></thead>
                      <tbody>
                        {acidentes.map((a: any) => (
                          <tr
                            key={a.id}
                            className="border-b last:border-0 hover:bg-red-50/60 cursor-pointer transition-colors"
                            onClick={() => setAcidenteDetalhe(a)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAcidenteDetalhe(a); } }}
                            title="Ver detalhes do acidente"
                          >
                            <td className="p-3 font-medium">{formatDate(a.dataAcidente)}</td>
                            <td className="p-3">{a.horaAcidente || "-"}</td>
                            <td className="p-3"><Badge variant="outline">{a.tipoAcidente?.replace(/_/g, " ")}</Badge></td>
                            <td className="p-3"><Badge variant={a.gravidade === "Grave" || a.gravidade === "Fatal" ? "destructive" : "secondary"}>{a.gravidade}</Badge></td>
                            <td className="p-3">{a.localAcidente || "-"}</td>
                            <td className="p-3">{a.parteCorpoAtingida || "-"}</td>
                            <td className="p-3 text-center font-semibold">{a.diasAfastamento || 0}</td>
                            <td className="p-3">{a.catNumero || "-"}</td>
                            <td className="p-3"><span className="inline-flex items-center gap-1.5 text-red-700"><span className="max-w-[180px] truncate">{a.descricao || "-"}</span><Eye className="h-3.5 w-3.5 shrink-0 opacity-60" /></span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ PROCESSOS TRABALHISTAS ============ */}
              <TabsContent value="processos" className="mt-4">
                {processos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum processo trabalhista vinculado</div>
                ) : (
                  <div className="space-y-4">
                    {processos.map((proc: any) => (
                      <Card key={proc.id} className="border-l-4 border-l-red-500">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span className="flex items-center gap-2"><Scale className="h-4 w-4 text-red-500" /> Processo nº {proc.numeroProcesso}</span>
                            <Badge variant={proc.status === "encerrado" ? "secondary" : "destructive"}>{proc.status?.replace(/_/g, " ")}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><strong className="text-muted-foreground">Vara:</strong> {proc.vara || "-"}</div>
                            <div><strong className="text-muted-foreground">Comarca:</strong> {proc.comarca || "-"}</div>
                            <div><strong className="text-muted-foreground">Tipo:</strong> {proc.tipoAcao?.replace(/_/g, " ")}</div>
                            <div><strong className="text-muted-foreground">Risco:</strong> <Badge variant={proc.risco === "alto" || proc.risco === "critico" ? "destructive" : "outline"}>{proc.risco}</Badge></div>
                            <div><strong className="text-muted-foreground">Valor Causa:</strong> {formatSalario(proc.valorCausa)}</div>
                            <div><strong className="text-muted-foreground">Valor Acordo:</strong> {formatSalario(proc.valorAcordo)}</div>
                            <div><strong className="text-muted-foreground">Distribuição:</strong> {formatDate(proc.dataDistribuicao)}</div>
                            <div><strong className="text-muted-foreground">Próx. Audiência:</strong> {formatDate(proc.dataAudiencia)}</div>
                          </div>
                          {proc.pedidos && Array.isArray(proc.pedidos) && proc.pedidos.length > 0 && (
                            <div className="text-sm"><strong className="text-muted-foreground">Pedidos:</strong> {proc.pedidos.join(", ")}</div>
                          )}
                          {proc.andamentos && proc.andamentos.length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="text-xs font-bold text-gray-600 mb-1">Andamentos ({proc.andamentos.length})</p>
                              {proc.andamentos.slice(0, 5).map((and: any) => (
                                <div key={and.id} className="flex items-start gap-2 text-xs py-1 border-b border-gray-100 last:border-0">
                                  <span className="text-muted-foreground shrink-0">{formatDate(and.data)}</span>
                                  <Badge variant="outline" className="text-[9px] shrink-0">{and.tipo}</Badge>
                                  <span className="text-gray-700">{and.descricao}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ============ HISTÓRICO FUNCIONAL ============ */}
              <TabsContent value="historico" className="mt-4">
                {historicoFuncional.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum registro de histórico funcional</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-green-50 border-b">
                        <th className="p-3 text-left font-semibold text-green-900">Data</th>
                        <th className="p-3 text-left font-semibold text-green-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-green-900">Valor Anterior</th>
                        <th className="p-3 text-left font-semibold text-green-900">Valor Novo</th>
                        <th className="p-3 text-left font-semibold text-green-900">Descrição</th>
                      </tr></thead>
                      <tbody>
                        {historicoFuncional.map((h: any) => {
                          const tipoLabel: Record<string, string> = { Admissao: "Admissão", Promocao: "Promoção", Transferencia: "Transferência", Mudanca_Funcao: "Mudança de Função", Mudanca_Setor: "Mudança de Setor", Mudanca_Salario: "Alteração Salarial", Afastamento: "Afastamento", Retorno: "Retorno", Ferias: "Férias", Desligamento: "Desligamento", Outros: "Outros" };
                          return (
                            <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{formatDate(h.dataEvento)}</td>
                              <td className="p-3"><Badge variant={h.tipo === "Promocao" || h.tipo === "Mudanca_Salario" ? "default" : h.tipo === "Desligamento" ? "destructive" : "secondary"}>{tipoLabel[h.tipo] || h.tipo}</Badge></td>
                              <td className="p-3 text-muted-foreground">{hideSalary && h.tipo === "Mudanca_Salario" ? SALARY_MASK : (h.valorAnterior || "-")}</td>
                              <td className="p-3 font-semibold">{hideSalary && h.tipo === "Mudanca_Salario" ? SALARY_MASK : (h.valorNovo || "-")}</td>
                              <td className="p-3 max-w-[300px]">{h.descricao || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ FUNÇÃO / ORDEM DE SERVIÇO ============ */}
              <TabsContent value="funcao" className="mt-4">
                {!funcaoDetalhes ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma descrição de função cadastrada</div>
                ) : (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-blue-500" />
                            {funcaoDetalhes.nome} {funcaoDetalhes.cbo ? <Badge variant="outline" className="ml-2">CBO: {funcaoDetalhes.cbo}</Badge> : null}
                          </CardTitle>
                          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => {
                            const companyName = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || 'Empresa';
                            const empName = emp?.nomeCompleto || 'Colaborador';
                            const empCargo = emp?.funcao || emp?.cargo || funcaoDetalhes.nome || '';
                            const empMatricula = emp?.codigoInterno || emp?.matricula || '';
                            const printW = window.open('', '_blank');
                            if (!printW) return;
                            printW.document.write(`<!DOCTYPE html><html><head><title>Ficha da Função - ${empName}</title>
                              <style>
                                @media print { @page { margin: 15mm; } }
                                body { font-family: Arial, sans-serif; font-size: 12px; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
                                .header { text-align: center; border-bottom: 3px solid #1B2A4A; padding-bottom: 15px; margin-bottom: 20px; }
                                .header h1 { color: #1B2A4A; font-size: 18px; margin: 0; }
                                .header p { color: #666; font-size: 11px; margin: 4px 0 0; }
                                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
                                .info-item { font-size: 11px; }
                                .info-item strong { color: #1B2A4A; }
                                .section { margin-bottom: 20px; }
                                .section h2 { font-size: 14px; color: #1B2A4A; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px; }
                                .section-content { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #1B2A4A; white-space: pre-line; line-height: 1.6; }
                                .section-os .section-content { border-left-color: #d97706; background: #fffbeb; }
                                .signature { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
                                .signature div { border-top: 1px solid #333; padding-top: 8px; font-size: 11px; }
                                .footer { text-align: center; font-size: 9px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
                              </style></head><body>
                              <div class="header">
                                <h1>${companyName}</h1>
                                <p>FICHA DA FUNÇÃO — DESCRIÇÃO DE ATIVIDADES E ORDEM DE SERVIÇO (NR-1)</p>
                              </div>
                              <div class="info-grid">
                                <div class="info-item"><strong>Colaborador:</strong> ${empName}</div>
                                <div class="info-item"><strong>eSocial:</strong> ${empMatricula || '-'}</div>
                                <div class="info-item"><strong>Função:</strong> ${funcaoDetalhes.nome}</div>
                                <div class="info-item"><strong>CBO:</strong> ${funcaoDetalhes.cbo || '-'}</div>
                                <div class="info-item"><strong>Setor:</strong> ${emp?.setor || '-'}</div>
                                <div class="info-item"><strong>Data:</strong> ${todayBrasilia()}</div>
                              </div>
                              <div class="section">
                                <h2>Descrição da Função e Atividades</h2>
                                <div class="section-content">${funcaoDetalhes.descricao || 'Sem descrição cadastrada'}</div>
                              </div>
                              ${funcaoDetalhes.ordemServico ? `<div class="section section-os">
                                <h2>Ordem de Serviço — NR-1</h2>
                                <div class="section-content">${funcaoDetalhes.ordemServico}</div>
                              </div>` : ''}
                              <div class="signature">
                                <div>${empName}<br/><small>Colaborador</small></div>
                                <div>Responsável RH<br/><small>${companyName}</small></div>
                              </div>
                              <div class="footer">Documento gerado em ${nowBrasilia()} — ${companyName}</div>
                            </body></html>`);
                            printW.document.close();
                            setTimeout(() => printW.print(), 300);
                          }}>
                            <Printer className="h-3.5 w-3.5" /> Imprimir Ficha
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-sm text-gray-700 mb-2">Descrição da Função</h4>
                            <div className="bg-gray-50 rounded-lg p-4 border text-sm whitespace-pre-line">{funcaoDetalhes.descricao || "Sem descrição cadastrada"}</div>
                          </div>
                          {funcaoDetalhes.ordemServico && (
                            <div>
                              <h4 className="font-semibold text-sm text-gray-700 mb-2">Ordem de Serviço — NR-1</h4>
                              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-sm whitespace-pre-line">{funcaoDetalhes.ordemServico}</div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>

              {/* ============ AVISO PRÉVIO ============ */}
              <TabsContent value="aviso" className="mt-4">
                {avisosPrevios.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum aviso prévio registrado</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Avisos Prévios — {avisosPrevios.length}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Início</th><th className="p-2 text-left">Fim</th><th className="p-2 text-center">Dias</th><th className="p-2 text-left">Redução</th><th className="p-2 text-right">Valor Estimado</th><th className="p-2 text-center">Status</th></tr></thead>
                        <tbody>
                          {avisosPrevios.map((a: any) => {
                            const tipoLabel: Record<string, string> = { empregador_trabalhado: 'Empregador (Trabalhado)', empregador_indenizado: 'Empregador (Indenizado)', empregado_trabalhado: 'Empregado (Trabalhado)', empregado_indenizado: 'Empregado (Indenizado)' };
                            return (
                              <tr key={a.id} className="border-b last:border-0">
                                <td className="p-2 font-medium">{tipoLabel[a.tipo] || a.tipo}</td>
                                <td className="p-2">{formatDate(a.dataInicio)}</td>
                                <td className="p-2">{formatDate(a.dataFim)}</td>
                                <td className="p-2 text-center font-bold">{a.diasAviso ?? 30}</td>
                                <td className="p-2">{a.reducaoJornada === '2h_dia' ? '2h/dia' : a.reducaoJornada === '7_dias_corridos' ? '7 dias corridos' : 'Nenhuma'}</td>
                                <td className="p-2 text-right font-bold">{a.valorEstimadoTotal ? formatMoeda(a.valorEstimadoTotal) : '-'}</td>
                                <td className="p-2 text-center"><Badge variant={a.status === 'concluido' ? 'default' : a.status === 'cancelado' ? 'destructive' : 'secondary'}>{a.status}</Badge></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ FÉRIAS ============ */}
              <TabsContent value="ferias" className="mt-4">
                {ferias.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum período de férias registrado</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Palmtree className="h-5 w-5 text-cyan-500" /> Férias — {ferias.length} período(s)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Per. Aquisitivo</th><th className="p-2 text-left">Início</th><th className="p-2 text-left">Fim</th><th className="p-2 text-center">Dias</th><th className="p-2 text-center">Abono</th><th className="p-2 text-right">Valor Total</th><th className="p-2 text-center">Status</th></tr></thead>
                        <tbody>
                          {ferias.map((f: any) => {
                            const hoje = new Date().toISOString().slice(0, 10);
                            const emCurso = !!f.dataInicio && !!f.dataFim && f.dataInicio <= hoje && f.dataFim >= hoje && f.status !== 'concluida' && f.status !== 'cancelada';
                            const statusLabel = emCurso ? 'EM FÉRIAS AGORA' : f.status;
                            const statusVariant: any = emCurso ? 'default' : (f.status === 'concluida' ? 'default' : f.status === 'vencida' ? 'destructive' : f.status === 'em_gozo' ? 'default' : 'secondary');
                            const statusClass = emCurso ? 'bg-cyan-600 hover:bg-cyan-700 text-white animate-pulse' : '';
                            return (
                              <tr key={f.id} className={`border-b last:border-0 ${emCurso ? 'bg-cyan-50/60' : ''}`}>
                                <td className="p-2 text-xs">{formatDate(f.periodoAquisitivoInicio)} a {formatDate(f.periodoAquisitivoFim)}</td>
                                <td className="p-2">{formatDate(f.dataInicio)}</td>
                                <td className="p-2">{formatDate(f.dataFim)}</td>
                                <td className="p-2 text-center font-bold">{f.diasGozo || 30}</td>
                                <td className="p-2 text-center">{f.abonoPecuniario ? <Badge>Sim</Badge> : 'Não'}</td>
                                <td className="p-2 text-right font-bold">{f.valorTotal ? formatMoeda(f.valorTotal) : '-'}</td>
                                <td className="p-2 text-center"><Badge variant={statusVariant} className={statusClass}>{statusLabel}</Badge></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ CIPA ============ */}
              <TabsContent value="cipa" className="mt-4">
                {cipa.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma participação em CIPA registrada</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-green-500" /> CIPA — {cipa.length} mandato(s)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Cargo</th><th className="p-2 text-left">Representação</th><th className="p-2 text-left">Mandato</th><th className="p-2 text-left">Estabilidade</th><th className="p-2 text-center">Status</th></tr></thead>
                        <tbody>
                          {cipa.map((c: any) => (
                            <tr key={c.id} className="border-b last:border-0">
                              <td className="p-2 font-medium">{(c.cargoCipa || '').replace(/_/g, ' ')}</td>
                              <td className="p-2">{c.representacao}</td>
                              <td className="p-2 text-xs">{formatDate(c.mandatoInicio)} a {formatDate(c.mandatoFim)}</td>
                              <td className="p-2 text-xs">{formatDate(c.inicioEstabilidade)} a {formatDate(c.fimEstabilidade)}</td>
                              <td className="p-2 text-center"><Badge variant={c.statusMembro === 'Ativo' ? 'default' : 'destructive'}>{c.statusMembro}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ DDS — Diálogos Diários (Rev. 1768) ============ */}
              <TabsContent value="dds" className="mt-4">
                {dds.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum DDS registrado para este funcionário</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-blue-600" /> DDS — {dds.length} sessão(ões)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="p-2 text-left">Data</th>
                            <th className="p-2 text-left">Tema</th>
                            <th className="p-2 text-left">Obra / Local</th>
                            <th className="p-2 text-left">Instrutor</th>
                            <th className="p-2 text-center">Presença</th>
                            <th className="p-2 text-center">Assinatura</th>
                            <th className="p-2 text-center">Sessão</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dds.map((d: any) => {
                            const presenteOk = Number(d.presente || 0) === 1;
                            const assinou = !!d.temAssinatura || d.assinaturaTipo === 'fcsign';
                            const tipoAss = d.assinaturaTipo === 'desenhada' ? 'Digital'
                                          : d.assinaturaTipo === 'fcsign' ? 'FCsign'
                                          : d.assinaturaTipo === 'manual' ? 'Manual' : '';
                            return (
                              <tr
                                key={d.sfId}
                                className="border-b last:border-0 align-top hover:bg-blue-50 cursor-pointer transition-colors"
                                onClick={() => setDdsDetalhe({ sessaoId: d.sessaoId, sfId: d.sfId })}
                                title="Clique para ver o roteiro completo e a assinatura"
                              >
                                <td className="p-2 whitespace-nowrap font-mono text-xs">
                                  {formatDate(d.data)}{d.hora ? <div className="text-[10px] text-muted-foreground">{d.hora}</div> : null}
                                </td>
                                <td className="p-2 font-medium">{d.tituloTema}</td>
                                <td className="p-2 text-xs">
                                  {d.obraNome || <span className="text-muted-foreground italic">—</span>}
                                  {d.local && <div className="text-[10px] text-muted-foreground">{d.local}</div>}
                                </td>
                                <td className="p-2 text-xs">{d.instrutor || <span className="text-muted-foreground italic">—</span>}</td>
                                <td className="p-2 text-center">
                                  {presenteOk
                                    ? <Badge variant="default" className="bg-emerald-100 text-emerald-700 border-emerald-300">Presente</Badge>
                                    : <Badge variant="destructive">Ausente</Badge>}
                                </td>
                                <td className="p-2 text-center">
                                  {assinou ? (
                                    <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                                      Assinada{tipoAss ? ` · ${tipoAss}` : ''}
                                    </Badge>
                                  ) : presenteOk ? (
                                    <span className="text-xs text-amber-600">Pendente</span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                  {d.assinadoEm && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {formatDate(String(d.assinadoEm).slice(0, 10))}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2 text-center">
                                  <Badge variant={d.status === 'finalizada' ? 'default' : d.status === 'cancelada' ? 'destructive' : 'secondary'}>
                                    {d.status}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      Inclui todas as sessões de DDS em que o funcionário foi adicionado à lista de presença, com o status atualizado de presença e assinatura digital.
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ TERMOS ASSINADOS (FCSign) — Rev. 2150 ============ */}
              <TabsContent value="termos_fcsign" className="mt-4">
                <div className="bg-white rounded-xl border p-6">
                  <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <FileSignature className="h-5 w-5 text-indigo-500" />
                      Termos & Documentos Assinados (FCSign) — {termosFcsign.length}
                    </h3>
                    {isAdminMaster && fcsignSessions.some((s: any) => s.tipo === "termo_responsabilidade" && s.status !== "cancelado") && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={zerandoTermos}
                        onClick={async () => {
                          // Rev. 2153 — restringe a tipo='termo_responsabilidade'
                          // de propósito: signatures.adminDelete em sessões de
                          // 'contrato_experiencia' dispara DELETE físico em
                          // employee_contracts (ver Rev. 2135). Aqui só queremos
                          // limpar termos de recebimento de teste — NUNCA tocar
                          // contratos. Outros tipos (contrato_experiencia, etc.)
                          // têm fluxo próprio de cancelamento.
                          const alvos = fcsignSessions.filter((s: any) => s.tipo === "termo_responsabilidade" && s.status !== "cancelado");
                          if (alvos.length === 0) {
                            toast.info("Não há Termos de Recebimento ativos pra zerar (todos já estão cancelados).");
                            return;
                          }
                          if (!confirm(`Zerar ${alvos.length} Termo(s) de Recebimento ativo(s) deste colaborador?\n\nIsto cancela cada sessão (soft-cancel) e remove os documentos do RAIO-X. As sessões ficam registradas no banco com status="cancelado" pra auditoria. Contratos de experiência e outros tipos FCSign NÃO são afetados. Ação restrita ao ADM Master.`)) return;
                          setZerandoTermos(true);
                          let ok = 0, fail = 0;
                          for (const s of alvos) {
                            try {
                              await adminDeleteSigMut.mutateAsync({ companyId: emp.companyId, id: s.id });
                              ok++;
                            } catch (e: any) {
                              fail++;
                              console.error(`[Rev.2153] Falha ao cancelar sessão ${s.id}:`, e?.message || e);
                            }
                          }
                          setZerandoTermos(false);
                          if (fail === 0) {
                            toast.success(`${ok} termo(s) zerados com sucesso.`);
                          } else {
                            toast.warning(`Concluído: ${ok} ok, ${fail} falha(s). Veja console.`);
                          }
                          await utils2.docs.raioX.invalidate();
                        }}
                        className="gap-1.5"
                        title="Cancela todos os termos FCSign deste colaborador (soft-delete)"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {zerandoTermos ? "Zerando..." : "Zerar Termos"}
                      </Button>
                    )}
                  </div>
                  {termosFcsign.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileSignature className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      Nenhum termo ou documento assinado por FCSign para este colaborador.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-indigo-50 border-b">
                            <th className="p-3 text-left font-semibold text-indigo-900">Documento</th>
                            <th className="p-3 text-left font-semibold text-indigo-900">Tipo</th>
                            <th className="p-3 text-left font-semibold text-indigo-900">Status</th>
                            <th className="p-3 text-left font-semibold text-indigo-900">Emitido em</th>
                            <th className="p-3 text-left font-semibold text-indigo-900">Concluído em</th>
                            <th className="p-3 text-left font-semibold text-indigo-900">Por</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {termosFcsign.map((s: any) => {
                            const pendente = (s.signers || []).find((sg: any) => !sg.signedAt);
                            const verUrl = s.status === "completo" && s.finalDocumentUrl
                              ? s.finalDocumentUrl
                              : (pendente && pendente.token ? `${window.location.origin}/assinar/${pendente.token}` : null);
                            const statusLabel: Record<string, { label: string; cls: string }> = {
                              completo:     { label: "Assinado",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                              em_andamento: { label: "Em coleta", cls: "bg-amber-100 text-amber-700 border-amber-200" },
                              pendente:     { label: "Pendente",  cls: "bg-slate-100 text-slate-700 border-slate-200" },
                            };
                            const stat = statusLabel[s.status] || { label: s.status, cls: "bg-slate-100 text-slate-700" };
                            const tipoLabel = s.tipo === "termo_responsabilidade" ? "Termo de Recebimento"
                              : s.tipo === "contrato_experiencia" ? "Contrato de Experiência"
                              : s.tipo;
                            return (
                              <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-3 font-medium text-indigo-700">{s.documentTitle}</td>
                                <td className="p-3 text-xs">{tipoLabel}</td>
                                <td className="p-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${stat.cls}`}>
                                    {stat.label}
                                  </span>
                                </td>
                                <td className="p-3 text-xs">{s.createdAt ? new Date(s.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                <td className="p-3 text-xs">{s.completedAt ? new Date(s.completedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                                <td className="p-3 text-xs">{s.createdByName || "—"}</td>
                                <td className="p-3 text-right">
                                  <div className="inline-flex gap-1">
                                    {verUrl ? (
                                      <a
                                        href={verUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-indigo-50 text-indigo-700"
                                        title="Visualizar documento"
                                      >
                                        <Eye className="h-3.5 w-3.5" /> Ver
                                      </a>
                                    ) : (
                                      <span className="text-xs text-muted-foreground px-2">—</span>
                                    )}
                                    {s.status === "completo" && s.finalDocumentUrl ? (
                                      <a
                                        href={s.finalDocumentUrl}
                                        download={`${s.documentTitle}.html`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-emerald-50 text-emerald-700"
                                        title="Baixar HTML assinado"
                                      >
                                        <FileText className="h-3.5 w-3.5" /> Baixar
                                      </a>
                                    ) : (
                                      <span className="text-xs text-muted-foreground px-2" title="Disponível após assinatura completa">—</span>
                                    )}
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
              </TabsContent>

              {/* ============ INTEGRAÇÕES ============ */}
              <TabsContent value="integracoes" className="mt-4">
                <div className="bg-white rounded-xl border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-indigo-500" />
                      Integrações de Pessoal — {integracoes.length} registro{integracoes.length !== 1 ? "s" : ""}
                    </h3>
                    <Button
                      size="sm"
                      onClick={() => setNovaIntegracaoForm({ tipo: "externa", clienteId: "", clienteNome: "", dataRealizacao: "", dataVencimento: "", evidencia: "", observacoes: "" })}
                      className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <Plus className="h-3.5 w-3.5" /> Registrar Integração
                    </Button>
                  </div>

                  {/* Form de nova integração */}
                  {novaIntegracaoForm && (
                    <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200 space-y-3">
                      <p className="text-sm font-semibold text-indigo-700">Nova Integração</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600">Tipo</label>
                          <div className="flex gap-2 mt-1">
                            {["externa", "interna"].map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setNovaIntegracaoForm((f: any) => ({ ...f, tipo: t }))}
                                className={`flex-1 py-1.5 rounded-md text-xs font-semibold border-2 transition-all ${novaIntegracaoForm.tipo === t ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 text-slate-600 hover:border-indigo-300"}`}
                              >
                                {t === "externa" ? "Cliente (PJ)" : "Reciclagem Interna"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">
                            {novaIntegracaoForm.tipo === "externa" ? "Nome do Cliente" : "Referência"}
                          </label>
                          <input
                            type="text"
                            value={novaIntegracaoForm.clienteNome}
                            onChange={e => setNovaIntegracaoForm((f: any) => ({ ...f, clienteNome: e.target.value }))}
                            className="mt-1 w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                            placeholder={novaIntegracaoForm.tipo === "externa" ? "Nome do cliente" : "Ex: Reciclagem Anual 2025"}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Data de Realização</label>
                          <input
                            type="date"
                            value={novaIntegracaoForm.dataRealizacao}
                            onChange={e => setNovaIntegracaoForm((f: any) => ({ ...f, dataRealizacao: e.target.value }))}
                            className="mt-1 w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Validade (data)</label>
                          <input
                            type="date"
                            value={novaIntegracaoForm.dataVencimento}
                            onChange={e => setNovaIntegracaoForm((f: any) => ({ ...f, dataVencimento: e.target.value }))}
                            className="mt-1 w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-600">Evidência / Documento</label>
                          <input
                            type="text"
                            value={novaIntegracaoForm.evidencia}
                            onChange={e => setNovaIntegracaoForm((f: any) => ({ ...f, evidencia: e.target.value }))}
                            className="mt-1 w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm"
                            placeholder="Número de protocolo, link, etc."
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs font-medium text-gray-600">Observações</label>
                          <textarea
                            value={novaIntegracaoForm.observacoes}
                            onChange={e => setNovaIntegracaoForm((f: any) => ({ ...f, observacoes: e.target.value }))}
                            rows={2}
                            className="mt-1 w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm resize-none"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setNovaIntegracaoForm(null)}>Cancelar</Button>
                        <Button
                          size="sm"
                          disabled={!novaIntegracaoForm.dataRealizacao || criarIntegracaoMut.isPending}
                          onClick={() => criarIntegracaoMut.mutate({
                            companyId: selectedCompany?.id || 0,
                            employeeId: employeeId!,
                            tipo:           novaIntegracaoForm.tipo,
                            clienteNome:    novaIntegracaoForm.clienteNome || undefined,
                            dataRealizacao: novaIntegracaoForm.dataRealizacao,
                            dataVencimento: novaIntegracaoForm.dataVencimento || undefined,
                            evidencia:      novaIntegracaoForm.evidencia || undefined,
                            observacoes:    novaIntegracaoForm.observacoes || undefined,
                          })}
                          className="bg-indigo-600 hover:bg-indigo-700 gap-1"
                        >
                          {criarIntegracaoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          Salvar
                        </Button>
                      </div>
                    </div>
                  )}

                  {integracoesQ.isLoading ? (
                    <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
                  ) : integracoes.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      Nenhuma integração registrada para este colaborador
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-xs">
                            <th className="p-2 text-left">Tipo</th>
                            <th className="p-2 text-left">Cliente / Referência</th>
                            <th className="p-2 text-left">Realização</th>
                            <th className="p-2 text-left">Validade</th>
                            <th className="p-2 text-center">Status</th>
                            <th className="p-2 text-left">Evidência</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(integracoes as any[]).map((i: any) => {
                            const statusColor = i.statusCalc === "ATIVA" ? "bg-emerald-100 text-emerald-700" : i.statusCalc === "A_VENCER" ? "bg-amber-100 text-amber-700" : i.statusCalc === "VENCIDA" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500";
                            const statusLabel = i.statusCalc === "ATIVA" ? "Ativa" : i.statusCalc === "A_VENCER" ? `Vence em ${i.diasRestantes}d` : i.statusCalc === "VENCIDA" ? "Vencida" : "Sem vencimento";
                            return (
                              <tr key={i.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="p-2">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${i.tipo === "interna" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                                    {i.tipo === "interna" ? "Interna" : "Externa"}
                                  </span>
                                </td>
                                <td className="p-2 font-medium">{i.clienteNome || "-"}</td>
                                <td className="p-2 text-xs">{i.dataRealizacao ? i.dataRealizacao.split("-").reverse().join("/") : "-"}</td>
                                <td className="p-2 text-xs">{i.dataVencimento ? i.dataVencimento.split("-").reverse().join("/") : "-"}</td>
                                <td className="p-2 text-center">
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{statusLabel}</span>
                                </td>
                                <td className="p-2 text-xs text-gray-500 max-w-[150px] truncate">{i.evidencia || "-"}</td>
                                <td className="p-2">
                                  <button
                                    onClick={() => { if (confirm("Remover este registro de integração?")) excluirIntegracaoMut.mutate({ id: i.id, companyId: selectedCompany?.id || 0 }); }}
                                    className="p-1 hover:bg-red-50 rounded text-red-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Rev. 2061 — gate adicional `emp` (de raioX?.funcionario) p/
                    evitar crash quando integracoesSSTQ resolve antes do raioX
                    e o usuário clica em Ver/PDF — params do gerador exigem
                    emp.nomeCompleto/cpf/funcao. */}
                {integracoesSST.length > 0 && emp && (
                  <div className="bg-white rounded-xl border p-6 mt-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                      <GraduationCap className="h-5 w-5 text-emerald-500" />
                      Integração de Segurança (SST) — {integracoesSST.length} registro{integracoesSST.length !== 1 ? "s" : ""}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-xs">
                            <th className="p-2 text-left">Status</th>
                            <th className="p-2 text-left">Obra</th>
                            <th className="p-2 text-left">Origem</th>
                            <th className="p-2 text-center">Nota</th>
                            <th className="p-2 text-left">Realização</th>
                            <th className="p-2 text-left">Validade</th>
                            <th className="p-2 text-left">Certificado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {integracoesSST.map((r: any) => {
                            const stColor = r.status === "aprovado" ? "bg-emerald-100 text-emerald-700" : r.status === "reprovado" ? "bg-red-100 text-red-700" : r.status === "pendente" ? "bg-yellow-100 text-yellow-700" : r.status === "vencido" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-700";
                            const stLabel = r.status === "aprovado" ? "Aprovado" : r.status === "reprovado" ? "Reprovado" : r.status === "pendente" ? "Pendente" : r.status === "em_andamento" ? "Em Andamento" : r.status === "vencido" ? "Vencido" : r.status;
                            const origemLabel = r.origem === "manual" ? "Manual" : r.origem === "smo" ? "SMO" : r.origem === "reciclagem" ? "Reciclagem" : r.origem === "advertencia" ? "Advertência" : r.origem;
                            return (
                              <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="p-2"><span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${stColor}`}>{stLabel}</span></td>
                                <td className="p-2 text-xs">{r.obraNome || "-"}</td>
                                <td className="p-2"><span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">{origemLabel}</span></td>
                                <td className="p-2 text-center font-bold">{r.nota ? `${r.nota}%` : "-"}</td>
                                <td className="p-2 text-xs">{r.dataRealizacao ? new Date(r.dataRealizacao).toLocaleDateString("pt-BR") : "-"}</td>
                                <td className="p-2 text-xs">{r.dataValidade ? new Date(r.dataValidade).toLocaleDateString("pt-BR") : "-"}</td>
                                <td className="p-2 text-xs">
                                  {/* Rev. 2061 — Aprovados: gera o certificado SST on-the-fly
                                      (mesmo motor da aba Aprovados / IntegracaoSST.tsx) com 2 botões:
                                      Visualizar (nova aba p/ imprimir) + Baixar (PDF). Antes, este
                                      slot só mostrava `certificadoUrl` (legado) — mas a Rev. 2049
                                      passou a gerar o PDF dinamicamente a partir dos dados do
                                      registro, então o link "-" aparecia mesmo p/ aprovados. */}
                                  {r.status === "aprovado" ? (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px] text-blue-700 border-blue-300 hover:bg-blue-50"
                                        title="Visualizar / imprimir certificado"
                                        onClick={async () => {
                                          const winRef = window.open("about:blank", "_blank");
                                          try {
                                            await generateCertificadoIntegracaoSstPdf({
                                              registroId: r.id,
                                              employeeNome: emp?.nomeCompleto ?? "",
                                              employeeCpf: emp?.cpf ?? "",
                                              employeeFuncao: emp?.funcao ?? null,
                                              obraNome: r.obraNome ?? null,
                                              configNome: r.configNome ?? null,
                                              dataRealizacao: r.dataRealizacao ?? null,
                                              dataValidade: r.dataValidade ?? null,
                                              nota: Number(r.nota || 0),
                                              notaMinima: Number(r.configNotaMinima ?? 70),
                                              acertos: null,
                                              totalPerguntas: null,
                                              tentativa: r.tentativas ?? null,
                                              assinaturaTstBase64: r.assinaturaTstBase64 ?? null,
                                              assinaturaTstNome: r.assinaturaTstNome ?? null,
                                              assinaturaTstAssinadaEm: r.assinaturaTstAssinadaEm ?? null,
                                              mode: "preview",
                                              winRef,
                                            });
                                          } catch (e: any) {
                                            try { winRef?.close(); } catch {}
                                            toast.error(e?.message || "Erro ao gerar certificado");
                                          }
                                        }}
                                      >
                                        <Eye className="h-3 w-3 mr-1" /> Ver
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px] text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                        title="Baixar certificado em PDF"
                                        onClick={async () => {
                                          try {
                                            await generateCertificadoIntegracaoSstPdf({
                                              registroId: r.id,
                                              employeeNome: emp?.nomeCompleto ?? "",
                                              employeeCpf: emp?.cpf ?? "",
                                              employeeFuncao: emp?.funcao ?? null,
                                              obraNome: r.obraNome ?? null,
                                              configNome: r.configNome ?? null,
                                              dataRealizacao: r.dataRealizacao ?? null,
                                              dataValidade: r.dataValidade ?? null,
                                              nota: Number(r.nota || 0),
                                              notaMinima: Number(r.configNotaMinima ?? 70),
                                              acertos: null,
                                              totalPerguntas: null,
                                              tentativa: r.tentativas ?? null,
                                              assinaturaTstBase64: r.assinaturaTstBase64 ?? null,
                                              assinaturaTstNome: r.assinaturaTstNome ?? null,
                                              assinaturaTstAssinadaEm: r.assinaturaTstAssinadaEm ?? null,
                                            });
                                          } catch (e: any) {
                                            toast.error(e?.message || "Erro ao gerar certificado");
                                          }
                                        }}
                                      >
                                        <FileDown className="h-3 w-3 mr-1" /> PDF
                                      </Button>
                                    </div>
                                  ) : r.certificadoUrl ? (
                                    <a href={r.certificadoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Ver</a>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ PJ ============ */}
              <TabsContent value="pj" className="mt-4">
                {pjContratos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum contrato PJ registrado</div>
                ) : (
                  <div className="space-y-4">
                    {/* Painel de Conformidade PJ */}
                    {pjConformidade && (
                      <div className={`rounded-xl border p-4 ${pjConformidade.pendencias > 0 ? 'bg-amber-50/60 border-amber-300' : 'bg-emerald-50/60 border-emerald-300'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className={`text-sm font-bold flex items-center gap-2 ${pjConformidade.pendencias > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                            <ShieldCheck className="h-4 w-4" />
                            Conformidade PJ — {pjConformidade.mesReferencia ? pjConformidade.mesReferencia.split("-").reverse().join("/") : "—"}
                            {pjConformidade.pendencias > 0 ? (
                              <Badge variant="destructive" className="ml-2">{pjConformidade.pendencias} pendência(s)</Badge>
                            ) : (
                              <Badge className="bg-emerald-600 hover:bg-emerald-700 ml-2">Tudo em dia</Badge>
                            )}
                          </h4>
                          <Button size="sm" variant="outline" className="text-purple-700 border-purple-300 hover:bg-purple-50" onClick={() => window.location.href = '/terceiros/pj/conformidade'}>
                            Gerenciar
                          </Button>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { tipo: 'das', label: 'DAS-MEI' },
                            { tipo: 'nf', label: 'NF do mês' },
                            { tipo: 'cnd', label: 'CND CNPJ' },
                            { tipo: 'seguro_vida', label: 'Seguro Vida' },
                            { tipo: 'status_cnpj', label: 'CNPJ Ativo' },
                          ].map(({ tipo, label }) => {
                            const it = pjConformidade.itens?.[tipo];
                            const status = it?.statusComputed || it?.status || 'pendente';
                            const colorMap: Record<string, string> = {
                              ok: 'bg-emerald-100 text-emerald-700 border-emerald-300',
                              pendente: 'bg-amber-100 text-amber-700 border-amber-300',
                              vencido: 'bg-red-100 text-red-700 border-red-300',
                              na: 'bg-gray-100 text-gray-500 border-gray-200',
                            };
                            return (
                              <div key={tipo} className={`rounded-md border px-2 py-2 text-center ${colorMap[status]}`}>
                                <div className="text-[10px] font-semibold uppercase tracking-wide">{label}</div>
                                <div className="text-xs font-bold mt-1 capitalize">{status === 'na' ? 'N/A' : status}</div>
                                {it?.dataVencimento && (
                                  <div className="text-[9px] mt-0.5 opacity-75">vence {String(it.dataVencimento).slice(0,10)}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="bg-white rounded-xl border p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FileSignature className="h-5 w-5 text-purple-500" /> Contratos PJ — {pjContratos.length}</h3>
                        <Button size="sm" variant="outline" className="gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50" onClick={() => {
                          const contrato = pjContratos[0];
                          if (!contrato) return;
                          window.location.href = `/contrato-pj/${contrato.id}`;
                        }}>

                          <Printer className="h-4 w-4" /> Gerar Contrato
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Nº Contrato</th><th className="p-2 text-left">Vigência</th><th className="p-2 text-right">Valor Mensal</th><th className="p-2 text-center">Adiant./Fech.</th><th className="p-2 text-center">Status</th></tr></thead>
                          <tbody>
                            {pjContratos.map((c: any) => (
                              <tr key={c.id} className="border-b last:border-0">
                                <td className="p-2 font-mono font-semibold">{c.numeroContrato || '-'}</td>
                                <td className="p-2 text-xs">{formatDate(c.dataInicio)} a {formatDate(c.dataFim)}</td>
                                <td className="p-2 text-right font-bold">{formatMoeda(c.valorMensal || '0')}</td>
                                <td className="p-2 text-center text-xs">{c.percentualAdiantamento || 40}% / {c.percentualFechamento || 60}%</td>
                                <td className="p-2 text-center"><Badge variant={c.status === 'ativo' ? 'default' : c.status === 'encerrado' ? 'destructive' : 'secondary'}>{c.status}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {pjPagamentos.length > 0 && (
                      <div className="bg-white rounded-xl border p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><DollarSign className="h-5 w-5 text-purple-500" /> Pagamentos PJ — {pjPagamentos.length}</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Mês Ref.</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-right">Valor</th><th className="p-2 text-left">Data Pgto</th><th className="p-2 text-center">Status</th></tr></thead>
                            <tbody>
                              {pjPagamentos.map((p: any) => (
                                <tr key={p.id} className="border-b last:border-0">
                                  <td className="p-2">{p.mesReferencia ? p.mesReferencia.split("-").reverse().join("/") : "—"}</td>
                                  <td className="p-2"><Badge variant={p.tipo === 'adiantamento' ? 'secondary' : p.tipo === 'bonificacao' ? 'default' : 'outline'}>{p.tipo}</Badge></td>
                                  <td className="p-2 text-right font-bold">{formatMoeda(p.valor || '0')}</td>
                                  <td className="p-2 text-xs">{formatDate(p.dataPagamento)}</td>
                                  <td className="p-2 text-center"><Badge variant={p.status === 'pago' ? 'default' : p.status === 'cancelado' ? 'destructive' : 'secondary'}>{p.status}</Badge></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
              {/* ============ AVALIAÇÕES DE DESEMPENHO ============ */}
              <TabsContent value="avaliacoes" className="mt-4">
                {avaliacoesList.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma avaliação de desempenho registrada</div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                          <Star className="h-5 w-5 text-amber-500" /> Avaliações de Desempenho — {avaliacoesList.length}
                        </h3>
                      </div>
                      {/* Resumo geral */}
                      {(() => {
                        const medias = avaliacoesList.map((a: any) => parseFloat(a.mediaGeral || '0'));
                        const mediaGeral = medias.length > 0 ? (medias.reduce((s: number, v: number) => s + v, 0) / medias.length) : 0;
                        const ultimaAv = avaliacoesList[0] as any;
                        return (
                          <div className="grid grid-cols-4 gap-3 mb-4">
                            <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
                              <div className="text-2xl font-bold text-amber-700">{mediaGeral.toFixed(1)}</div>
                              <div className="text-[10px] text-amber-600 font-medium">Média Geral</div>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                              <div className="text-2xl font-bold text-blue-700">{fmtNum(avaliacoesList.length)}</div>
                              <div className="text-[10px] text-blue-600 font-medium">Total Avaliações</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                              <div className="text-2xl font-bold text-green-700">{ultimaAv?.mediaGeral || '-'}</div>
                              <div className="text-[10px] text-green-600 font-medium">Última Nota</div>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-200">
                              <div className="text-xs font-bold text-purple-700 truncate">{ultimaAv?.recomendacao || '-'}</div>
                              <div className="text-[10px] text-purple-600 font-medium">Última Recomendação</div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Tabela de avaliações */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="p-2 text-left">Data</th>
                              <th className="p-2 text-left">Mês Ref.</th>
                              <th className="p-2 text-left">Avaliador</th>
                              <th className="p-2 text-center">P1</th>
                              <th className="p-2 text-center">P2</th>
                              <th className="p-2 text-center">P3</th>
                              <th className="p-2 text-center">Média</th>
                              <th className="p-2 text-center">Recomendação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {avaliacoesList.map((av: any) => {
                              const media = parseFloat(av.mediaGeral || '0');
                              const corMedia = media >= 4 ? 'text-green-700 bg-green-50' : media >= 3 ? 'text-blue-700 bg-blue-50' : media >= 2 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
                              const corRec = av.recomendacao?.includes('DEMISS') ? 'destructive' : av.recomendacao?.includes('ATEN') ? 'secondary' : av.recomendacao?.includes('TREIN') ? 'outline' : 'default';
                              return (
                                <tr key={av.id} className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="p-2 text-xs">{formatDate(av.createdAt?.split?.('T')?.[0] || av.createdAt)}</td>
                                  <td className="p-2 font-medium">{av.mesReferencia || '-'}</td>
                                  <td className="p-2 text-xs">{av.evaluatorName || '-'}</td>
                                  <td className="p-2 text-center font-bold">{av.mediaPilar1 || '-'}</td>
                                  <td className="p-2 text-center font-bold">{av.mediaPilar2 || '-'}</td>
                                  <td className="p-2 text-center font-bold">{av.mediaPilar3 || '-'}</td>
                                  <td className="p-2 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${corMedia}`}>{av.mediaGeral}</span></td>
                                  <td className="p-2 text-center"><Badge variant={corRec as any} className="text-[10px]">{av.recomendacao || '-'}</Badge></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {/* Detalhes da última avaliação */}
                    {(() => {
                      const ultima = avaliacoesList[0] as any;
                      if (!ultima) return null;
                      const pilares = [
                        { nome: "Postura e Disciplina", media: ultima.mediaPilar1, criterios: [
                          { label: "Comportamento", nota: ultima.comportamento },
                          { label: "Pontualidade", nota: ultima.pontualidade },
                          { label: "Assiduidade", nota: ultima.assiduidade },
                          { label: "Segurança/EPIs", nota: ultima.segurancaEpis },
                        ]},
                        { nome: "Desempenho Técnico", media: ultima.mediaPilar2, criterios: [
                          { label: "Qualidade", nota: ultima.qualidadeAcabamento },
                          { label: "Produtividade", nota: ultima.produtividadeRitmo },
                          { label: "Ferramentas", nota: ultima.cuidadoFerramentas },
                          { label: "Economia", nota: ultima.economiaMateriais },
                        ]},
                        { nome: "Atitude e Crescimento", media: ultima.mediaPilar3, criterios: [
                          { label: "Equipe", nota: ultima.trabalhoEquipe },
                          { label: "Iniciativa", nota: ultima.iniciativaProatividade },
                          { label: "Flexibilidade", nota: ultima.disponibilidadeFlexibilidade },
                          { label: "Organização", nota: ultima.organizacaoLimpeza },
                        ]},
                      ];
                      return (
                        <div className="bg-white rounded-xl border p-6">
                          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Eye className="h-5 w-5 text-amber-500" /> Detalhes da Última Avaliação ({ultima.mesReferencia ? ultima.mesReferencia.split("-").reverse().join("/") : "—"})
                          </h3>
                          <div className="grid grid-cols-3 gap-4">
                            {pilares.map((p) => (
                              <div key={p.nome} className="border rounded-lg p-3">
                                <div className="font-semibold text-sm mb-2 flex items-center justify-between">
                                  <span>{p.nome}</span>
                                  <span className="text-lg font-bold text-amber-600">{p.media}</span>
                                </div>
                                <div className="space-y-1">
                                  {p.criterios.map((c) => {
                                    const nota = parseInt(c.nota || '0');
                                    const cor = nota >= 4 ? 'bg-green-500' : nota >= 3 ? 'bg-blue-500' : nota >= 2 ? 'bg-amber-500' : 'bg-red-500';
                                    return (
                                      <div key={c.label} className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600">{c.label}</span>
                                        <div className="flex items-center gap-1">
                                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${cor}`} style={{ width: `${(nota / 5) * 100}%` }} />
                                          </div>
                                          <span className="font-bold w-4 text-right">{nota}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                          {ultima.observacoes && (
                            <div className="mt-3 bg-gray-50 rounded-lg p-3">
                              <span className="text-xs font-semibold text-gray-500">Observações:</span>
                              <p className="text-sm text-gray-700 mt-1">{ultima.observacoes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </TabsContent>

              {/* ============ DESEMPENHO / CLIENTE (Rev. 2853) ============ */}
              <TabsContent value="desempenho" className="mt-4">
                <div className="space-y-4">
                  {/* Resumo de indicadores */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border p-4 text-center">
                      <div className={`text-2xl font-bold ${desempenho.atrasos.total === 0 ? "text-emerald-700" : desempenho.atrasos.total >= 5 ? "text-red-700" : "text-amber-700"}`}>{fmtNum(desempenho.atrasos.total)}</div>
                      <div className="text-[11px] text-muted-foreground font-medium mt-0.5">Atrasos no Ponto</div>
                      {desempenho.atrasos.totalMinutos > 0 && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{Math.floor(desempenho.atrasos.totalMinutos / 60)}h{String(desempenho.atrasos.totalMinutos % 60).padStart(2, "0")} acumulados</div>
                      )}
                    </div>
                    <div className="bg-white rounded-xl border p-4 text-center">
                      <div className="text-2xl font-bold text-cyan-700">{fmtNum(desempenho.obrasGeridas.length)}</div>
                      <div className="text-[11px] text-muted-foreground font-medium mt-0.5">Obras Geridas</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{desempenho.isGestor ? "É gestor de obra" : "Não é gestor"}</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4 text-center">
                      <div className="text-2xl font-bold text-amber-700">{desempenho.avaliacaoCliente.mediaGeral != null ? desempenho.avaliacaoCliente.mediaGeral : "—"}</div>
                      <div className="text-[11px] text-muted-foreground font-medium mt-0.5">Aval. Cliente (0-10)</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{fmtNum(desempenho.avaliacaoCliente.total)} avaliações</div>
                    </div>
                    <div className="bg-white rounded-xl border p-4 text-center">
                      <div className="text-2xl font-bold text-purple-700">{desempenho.avaliacaoCliente.mediaGestor != null ? desempenho.avaliacaoCliente.mediaGestor : "—"}</div>
                      <div className="text-[11px] text-muted-foreground font-medium mt-0.5">Nota como Gestor</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">média do cliente</div>
                    </div>
                  </div>

                  {/* Obras geridas */}
                  {desempenho.obrasGeridas.length > 0 && (
                    <div className="bg-white rounded-xl border p-6">
                      <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                        <Building2 className="h-5 w-5 text-cyan-600" /> Obras que Gerencia — {desempenho.obrasGeridas.length}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="p-2 text-left">Código</th>
                              <th className="p-2 text-left">Obra</th>
                              <th className="p-2 text-left">Cliente</th>
                              <th className="p-2 text-left">Cidade</th>
                              <th className="p-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {desempenho.obrasGeridas.map((o: any) => (
                              <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="p-2 text-xs font-mono text-gray-500">{o.codigo || "—"}</td>
                                <td className="p-2 font-medium">{o.nome}</td>
                                <td className="p-2 text-xs">{o.cliente || "—"}</td>
                                <td className="p-2 text-xs">{o.cidade || "—"}</td>
                                <td className="p-2 text-center"><Badge variant="outline" className="text-[10px]">{o.status}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Avaliação do cliente */}
                  {desempenho.avaliacaoCliente.total === 0 ? (
                    <div className="bg-white rounded-xl border p-6 text-center py-10 text-muted-foreground">
                      <Handshake className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      Nenhuma avaliação do cliente registrada para as obras deste colaborador.
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border p-6">
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                          <Handshake className="h-5 w-5 text-amber-500" /> Avaliação do Cliente — {desempenho.avaliacaoCliente.total}
                        </h3>
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={gerarFichaAvaliacaoCliente}>
                          <Printer className="h-4 w-4" /> Gerar Ficha (PDF)
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                        {[
                          { label: "Geral", v: desempenho.avaliacaoCliente.mediaGeral },
                          { label: "Gestor", v: desempenho.avaliacaoCliente.mediaGestor },
                          { label: "Equipe", v: desempenho.avaliacaoCliente.mediaEquipe },
                          { label: "Prazo", v: desempenho.avaliacaoCliente.mediaPrazo },
                          { label: "Qualidade", v: desempenho.avaliacaoCliente.mediaQualidade },
                        ].map((m) => {
                          const cor = m.v == null ? "text-gray-400" : m.v >= 8 ? "text-emerald-700" : m.v >= 6 ? "text-amber-700" : "text-red-700";
                          return (
                            <div key={m.label} className="bg-gray-50 rounded-lg p-3 text-center border">
                              <div className={`text-xl font-bold ${cor}`}>{m.v != null ? m.v : "—"}</div>
                              <div className="text-[10px] text-gray-500 font-medium">{m.label}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="p-2 text-left">Data</th>
                              <th className="p-2 text-left">Obra</th>
                              <th className="p-2 text-center">Geral</th>
                              <th className="p-2 text-center">Gestor</th>
                              <th className="p-2 text-center">Equipe</th>
                              <th className="p-2 text-center">Prazo</th>
                              <th className="p-2 text-center">Qualidade</th>
                              <th className="p-2 text-left">Comentários</th>
                            </tr>
                          </thead>
                          <tbody>
                            {desempenho.avaliacaoCliente.historico.map((a: any) => {
                              const cor = (n: any) => n == null ? "text-gray-400" : Number(n) >= 8 ? "text-emerald-700 font-bold" : Number(n) >= 6 ? "text-amber-700 font-bold" : "text-red-700 font-bold";
                              const coments = [a.comentarioPositivo, a.comentarioMelhoria, a.comentarioGestor].filter(Boolean).join(" • ");
                              return (
                                <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50 align-top">
                                  <td className="p-2 text-xs whitespace-nowrap">{a.criadoEm ? formatDate(String(a.criadoEm).split(/[T ]/)[0]) : (a.anoPeriodo || "—")}</td>
                                  <td className="p-2 text-xs font-medium">{a.obraNome || "—"}</td>
                                  <td className={`p-2 text-center ${cor(a.notaGeral)}`}>{a.notaGeral ?? "—"}</td>
                                  <td className={`p-2 text-center ${cor(a.notaGestor)}`}>{a.notaGestor ?? "—"}</td>
                                  <td className={`p-2 text-center ${cor(a.notaEquipe)}`}>{a.notaEquipe ?? "—"}</td>
                                  <td className={`p-2 text-center ${cor(a.notaPrazo)}`}>{a.notaPrazo ?? "—"}</td>
                                  <td className={`p-2 text-center ${cor(a.notaQualidade)}`}>{a.notaQualidade ?? "—"}</td>
                                  <td className="p-2 text-xs text-gray-600 max-w-xs">{coments || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Rev. 3114 — TODOS OS PONTOS ANALISADOS (critérios granulares) */}
                      {(() => {
                        const hist = desempenho.avaliacaoCliente.historico as any[];
                        const comDetalhes = hist.filter((a) => extrairPontosAval(a.detalhes).length > 0);
                        if (comDetalhes.length === 0) return null;
                        // Consolidado: média por critério (bloco+label) entre todas as avaliações.
                        const acc = new Map<string, { key: string; bloco: string; label: string; soma: number; n: number }>();
                        for (const a of comDetalhes) {
                          for (const p of extrairPontosAval(a.detalhes)) {
                            const cur = acc.get(p.key) || { key: p.key, bloco: p.bloco, label: p.label, soma: 0, n: 0 };
                            cur.soma += p.nota; cur.n += 1; acc.set(p.key, cur);
                          }
                        }
                        const consolidado = Array.from(acc.values())
                          .map((c) => ({ ...c, media: Math.round((c.soma / c.n) * 10) / 10 }))
                          .sort((x, y) => y.media - x.media);
                        const fortes = consolidado.filter((c) => c.media >= 8).slice(0, 6);
                        const fracos = consolidado.filter((c) => c.media < 8).sort((x, y) => x.media - y.media).slice(0, 6);
                        const corBg = (n: number) => n >= 8 ? "bg-emerald-50 border-emerald-200" : n >= 6 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
                        const corTxt = (n: number) => n >= 8 ? "text-emerald-700" : n >= 6 ? "text-amber-700" : "text-red-700";
                        return (
                          <div className="mt-5 pt-5 border-t space-y-5">
                            <div className="flex items-center gap-2">
                              <ClipboardList className="h-4 w-4 text-blue-600" />
                              <h4 className="text-sm font-bold text-gray-800">Todos os pontos analisados</h4>
                              <span className="text-[11px] text-gray-400">({consolidado.length} critérios · {comDetalhes.length} de {hist.length} avaliações com detalhamento)</span>
                            </div>

                            {/* Visão UNIFICADA: pontos fortes x pontos a melhorar */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                                <div className="flex items-center gap-1.5 mb-2 text-emerald-700 font-semibold text-xs uppercase tracking-wide">
                                  <ThumbsUp className="h-3.5 w-3.5" /> Pontos fortes
                                </div>
                                {fortes.length === 0 ? (
                                  <div className="text-xs text-gray-400 py-1">Nenhum critério com média ≥ 8.</div>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {fortes.map((c) => (
                                      <li key={c.key} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="text-gray-700 truncate"><span className="text-gray-400">{c.bloco} · </span>{c.label}</span>
                                        <span className={`font-bold tabular-nums ${corTxt(c.media)}`}>{c.media}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="rounded-lg border border-red-200 bg-red-50/40 p-3">
                                <div className="flex items-center gap-1.5 mb-2 text-red-700 font-semibold text-xs uppercase tracking-wide">
                                  <ThumbsDown className="h-3.5 w-3.5" /> Pontos a melhorar
                                </div>
                                {fracos.length === 0 ? (
                                  <div className="text-xs text-gray-400 py-1">Nenhum ponto abaixo de 8 — desempenho excelente.</div>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {fracos.map((c) => (
                                      <li key={c.key} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="text-gray-700 truncate"><span className="text-gray-400">{c.bloco} · </span>{c.label}</span>
                                        <span className={`font-bold tabular-nums ${corTxt(c.media)}`}>{c.media}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>

                            {/* Visão INDIVIDUAL: detalhamento por avaliação, agrupado por bloco */}
                            <div className="space-y-3">
                              {comDetalhes.map((a) => {
                                const data = a.criadoEm ? formatDate(String(a.criadoEm).split(/[T ]/)[0]) : (a.anoPeriodo || "—");
                                return (
                                  <div key={a.id} className="rounded-lg border bg-gray-50/50 p-3">
                                    <div className="text-xs font-semibold text-gray-700 mb-2">
                                      {a.obraNome || "—"} <span className="text-gray-400 font-normal">· {data}</span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {BLOCOS_AVAL_RX.map((b) => {
                                        const dados = a.detalhes?.[b.key];
                                        if (!dados || typeof dados !== "object") return null;
                                        const itens = b.crit
                                          .map((c) => ({ label: c.label, nota: dados[c.key] }))
                                          .filter((it) => typeof it.nota === "number");
                                        if (itens.length === 0) return null;
                                        return (
                                          <div key={b.key} className="bg-white rounded-md border p-2.5">
                                            <div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                                              {b.titulo}{dados.nome ? <span className="font-normal normal-case text-gray-400"> · {dados.nome}</span> : null}
                                            </div>
                                            <div className="space-y-1">
                                              {itens.map((it, i) => (
                                                <div key={i} className={`flex items-center justify-between gap-2 rounded border px-2 py-1 ${corBg(Number(it.nota))}`}>
                                                  <span className="text-[11px] text-gray-700 truncate">{it.label}</span>
                                                  <span className={`text-xs font-bold tabular-nums ${corTxt(Number(it.nota))}`}>{it.nota}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ============ HABILIDADES ============ */}
              <TabsContent value="habilidades" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-purple-600" />
                      Habilidades e Competências ({empSkills.length})
                    </h3>
                  </div>
                  {empSkills.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Wrench className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhuma habilidade atribuída</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-purple-50 text-purple-800">
                            <th className="text-left px-3 py-2 font-semibold">Habilidade</th>
                            <th className="text-left px-3 py-2 font-semibold">Categoria</th>
                            <th className="text-center px-3 py-2 font-semibold">Nível</th>
                            <th className="text-left px-3 py-2 font-semibold">Experiência</th>
                            <th className="text-left px-3 py-2 font-semibold">Observação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empSkills.map((sk: any) => {
                            const nivelColors: Record<string, string> = {
                              Basico: "bg-blue-100 text-blue-800",
                              Intermediario: "bg-amber-100 text-amber-800",
                              Avancado: "bg-green-100 text-green-800",
                            };
                            const nivelLabels: Record<string, string> = {
                              Basico: "Básico",
                              Intermediario: "Intermediário",
                              Avancado: "Avançado",
                            };
                            return (
                              <tr key={sk.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium">{sk.skillNome}</td>
                                <td className="px-3 py-2 text-gray-600">{sk.skillCategoria || "-"}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${nivelColors[sk.nivel] || "bg-gray-100 text-gray-700"}`}>
                                    {nivelLabels[sk.nivel] || sk.nivel}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-600">{sk.tempoExperiencia || "-"}</td>
                                <td className="px-3 py-2 text-gray-500 text-xs">{sk.observacao || "-"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ============ ASSINATURA MEMORIAL ============ */}
              <TabsContent value="assinatura" className="mt-4">
                <AssinaturaMemorialTab employeeId={employeeId!} empNome={emp?.nomeCompleto || ""} />
              </TabsContent>

              {/* ============ CONTRATOS CLT ============ */}
              <TabsContent value="contratos_clt" className="mt-4">
                <ContratosTab employeeId={employeeId!} companyId={selectedCompany?.id || 0} empNome={emp?.nomeCompleto || ""} />
              </TabsContent>

              {/* ============ ALMOXARIFADO — EMPRÉSTIMOS ============ */}
              <TabsContent value="emprestimos_alm" className="mt-4">
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <Package className="w-5 h-5 text-orange-600" />
                    Empréstimos de Ferramentas/Equipamentos ({emprestimosAlmox.length})
                  </h3>
                  {emprestimosAlmox.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum empréstimo registrado</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-orange-50 text-orange-800">
                            <th className="text-left px-3 py-2 font-semibold">Item</th>
                            <th className="text-center px-3 py-2 font-semibold">Qtd</th>
                            <th className="text-left px-3 py-2 font-semibold">Obra</th>
                            <th className="text-center px-3 py-2 font-semibold">Data Emprést.</th>
                            <th className="text-center px-3 py-2 font-semibold">Devolução</th>
                            <th className="text-center px-3 py-2 font-semibold">Status</th>
                            <th className="text-center px-3 py-2 font-semibold">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...emprestimosAlmox].sort((a: any, b: any) => (b.dataEmprestimo || "").localeCompare(a.dataEmprestimo || "")).map((loan: any) => {
                            const statusColors: Record<string, string> = {
                              emprestado: "bg-blue-100 text-blue-800",
                              devolvido: "bg-green-100 text-green-800",
                              perdido: "bg-red-100 text-red-800",
                            };
                            return (
                              <tr key={loan.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium">{loan.itemNome}</td>
                                <td className="px-3 py-2 text-center">{loan.quantidade || 1}</td>
                                <td className="px-3 py-2 text-gray-600 text-xs">{loan.obraNome || "—"}</td>
                                <td className="px-3 py-2 text-center">{formatDate(loan.dataEmprestimo)}</td>
                                <td className="px-3 py-2 text-center">{formatDate(loan.dataDevolucao) || "-"}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[loan.status] || "bg-gray-100 text-gray-700"}`}>
                                    {loan.status === "emprestado" ? "Em posse" : loan.status === "devolvido" ? "Devolvido" : loan.status === "perdido" ? "Perdido" : loan.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {loan.status === "emprestado" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs text-red-600 border-red-300 hover:bg-red-50"
                                      onClick={() => {
                                        setDescontoModal({ loan });
                                        setDescontoValor("");
                                        setDescontoDescricao(`Item não devolvido: ${loan.itemNome}`);
                                        setDescontoMes(new Date().toISOString().slice(0, 7));
                                      }}
                                    >
                                      <PackageX className="w-3 h-3 mr-1" />
                                      Perdido
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ============ ALMOXARIFADO — DESCONTO FOLHA ============ */}
              <TabsContent value="desconto_folha_alm" className="mt-4">
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <PackageX className="w-5 h-5 text-red-600" />
                    Descontos em Folha — Itens Perdidos ({descontosAlmox.length})
                  </h3>
                  {descontosAlmox.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <PackageX className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum desconto registrado</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-red-50 text-red-800">
                            <th className="text-left px-3 py-2 font-semibold">Item</th>
                            <th className="text-center px-3 py-2 font-semibold">Qtd</th>
                            <th className="text-right px-3 py-2 font-semibold">Valor</th>
                            <th className="text-center px-3 py-2 font-semibold">Mês Desconto</th>
                            <th className="text-center px-3 py-2 font-semibold">Status</th>
                            <th className="text-left px-3 py-2 font-semibold">Aprovado/Rejeitado por</th>
                            <th className="text-center px-3 py-2 font-semibold">Ações RH</th>
                          </tr>
                        </thead>
                        <tbody>
                          {descontosAlmox.map((d: any) => {
                            const statusColors: Record<string, string> = {
                              pendente: "bg-amber-100 text-amber-800",
                              aprovado: "bg-green-100 text-green-800",
                              reprovado: "bg-red-100 text-red-800",
                            };
                            return (
                              <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium">{d.itemNome}</td>
                                <td className="px-3 py-2 text-center">{d.quantidade || 1}</td>
                                <td className="px-3 py-2 text-right font-semibold">{formatMoeda(parseFloat(d.valorDesconto || "0"))}</td>
                                <td className="px-3 py-2 text-center">{d.mesDesconto || "-"}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusColors[d.status] || "bg-gray-100 text-gray-700"}`}>
                                    {d.status === "pendente" ? "Pendente" : d.status === "aprovado" ? "Aprovado" : "Reprovado"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-600 text-xs">
                                  {d.aprovadoPor ? `${d.aprovadoPor}${d.aprovadoEm ? " em " + formatDate(d.aprovadoEm.split("T")[0]) : ""}` : "-"}
                                  {d.motivoReprovacao && <div className="text-red-600">{d.motivoReprovacao}</div>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {d.status === "pendente" && (
                                    <div className="flex gap-1 justify-center">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs text-green-700 border-green-300 hover:bg-green-50"
                                        onClick={() => aprovarDescontoMut.mutate({ id: d.id, mesDesconto: d.mesDesconto || undefined })}
                                        disabled={aprovarDescontoMut.isPending}
                                      >
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Aprovar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs text-red-700 border-red-300 hover:bg-red-50"
                                        onClick={() => { setReprovarModal({ id: d.id }); setReprovarMotivo(""); }}
                                      >
                                        <XCircle className="w-3 h-3 mr-1" />
                                        Reprovar
                                      </Button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="insumos_alm" className="mt-4">
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-amber-600" />
                    Insumos / Consumíveis Recebidos ({insumosAlmox.length})
                  </h3>
                  {insumosAlmox.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Nenhum insumo registrado para este funcionário</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-amber-50 text-amber-800">
                            <th className="text-left px-3 py-2 font-semibold">Item</th>
                            <th className="text-center px-3 py-2 font-semibold">Qtd</th>
                            <th className="text-left px-3 py-2 font-semibold">Obra</th>
                            <th className="text-left px-3 py-2 font-semibold">Motivo</th>
                            <th className="text-center px-3 py-2 font-semibold">Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {insumosAlmox.map((r: any) => (
                            <tr key={r.id} className="border-b border-gray-100 hover:bg-amber-50/30">
                              <td className="px-3 py-2 font-medium">{r.itemNome}</td>
                              <td className="px-3 py-2 text-center">{r.quantidade} {r.unidade || "un"}</td>
                              <td className="px-3 py-2 text-gray-600 text-xs">{r.obraNome || "-"}</td>
                              <td className="px-3 py-2 text-gray-600 text-xs">{r.motivo || "-"}</td>
                              <td className="px-3 py-2 text-center text-gray-500 text-xs">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("pt-BR") : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ============ SEGURO DE VIDA ============ */}
              <TabsContent value="seguro_vida" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-teal-600" />
                      Seguro de Vida
                    </h3>
                    {coberturaSeguro && (() => {
                      const sv = svStatusLabel(coberturaSeguro.status);
                      return (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${sv.cls}`}>
                          {sv.label}
                        </span>
                      );
                    })()}
                  </div>

                  {coberturaSeguroQ.isLoading ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>
                  ) : !coberturaSeguro ? (
                    <div className="text-center py-10 text-gray-400">
                      <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm font-medium">Nenhum registro de seguro de vida encontrado</p>
                      <p className="text-xs mt-1 text-gray-400">Este colaborador não possui cobertura cadastrada no sistema.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Dados Principais */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          { label: "Seguradora", value: coberturaSeguro.seguradora || "-" },
                          { label: "Item", value: coberturaSeguro.item_segurador || "-" },
                          { label: "Apólice VG", value: coberturaSeguro.apolice_vg || "-" },
                          { label: "Apólice APC", value: coberturaSeguro.apolice_apc || "-" },
                          { label: "Adesão", value: formatDate(coberturaSeguro.data_adesao) },
                          coberturaSeguro.data_vencimento_apolice
                            ? { label: "Venc. Apólice", value: formatDate(coberturaSeguro.data_vencimento_apolice) }
                            : null,
                          coberturaSeguro.data_cancelamento
                            ? { label: "Cancelamento", value: formatDate(coberturaSeguro.data_cancelamento) }
                            : null,
                          coberturaSeguro.motivo_cancelamento
                            ? { label: "Motivo Cancel.", value: coberturaSeguro.motivo_cancelamento }
                            : null,
                        ].filter(Boolean).map((item: any, idx: number) => (
                          <div key={idx} className="bg-teal-50 border border-teal-100 rounded-lg p-3">
                            <p className="text-[10px] font-bold text-teal-600 uppercase tracking-wide mb-0.5">{item.label}</p>
                            <p className="text-sm font-semibold text-gray-800">{item.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Coberturas */}
                      {(coberturaSeguro.morte_natural || coberturaSeguro.morte_acidental || coberturaSeguro.invalidez_acidente || coberturaSeguro.invalidez_doenca) && (
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-teal-50 px-4 py-2 border-b border-teal-100">
                            <p className="text-xs font-bold text-teal-800 uppercase tracking-wide">Coberturas — Capital Segurado</p>
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b">
                                <th className="text-left px-4 py-2 font-semibold text-gray-700">Cobertura</th>
                                <th className="text-right px-4 py-2 font-semibold text-gray-700">Capital Segurado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {coberturaSeguro.morte_natural && (
                                <tr className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-700">Morte Natural</td>
                                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{fmtCapitalSV(coberturaSeguro.morte_natural)}</td>
                                </tr>
                              )}
                              {coberturaSeguro.morte_acidental && (
                                <tr className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-700">Morte Acidental</td>
                                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{fmtCapitalSV(coberturaSeguro.morte_acidental)}</td>
                                </tr>
                              )}
                              {coberturaSeguro.invalidez_acidente && (
                                <tr className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-700">Invalidez por Acidente</td>
                                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{fmtCapitalSV(coberturaSeguro.invalidez_acidente)}</td>
                                </tr>
                              )}
                              {coberturaSeguro.invalidez_doenca && (
                                <tr className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-700">Invalidez por Doença</td>
                                  <td className="px-4 py-2 text-right font-semibold text-gray-900">{fmtCapitalSV(coberturaSeguro.invalidez_doenca)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Prêmios */}
                      {(coberturaSeguro.premio_vg || coberturaSeguro.premio_apc) && (
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                          <div className="bg-teal-50 px-4 py-2 border-b border-teal-100">
                            <p className="text-xs font-bold text-teal-800 uppercase tracking-wide">Prêmios</p>
                          </div>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b">
                                <th className="text-left px-4 py-2 font-semibold text-gray-700">Prêmio</th>
                                <th className="text-right px-4 py-2 font-semibold text-gray-700">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              {coberturaSeguro.premio_vg && (
                                <tr className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-700">Prêmio VG</td>
                                  <td className="px-4 py-2 text-right font-mono text-gray-800">{fmtPremioSV(coberturaSeguro.premio_vg)}</td>
                                </tr>
                              )}
                              {coberturaSeguro.premio_apc && (
                                <tr className="border-b last:border-0 hover:bg-gray-50">
                                  <td className="px-4 py-2 text-gray-700">Prêmio APC</td>
                                  <td className="px-4 py-2 text-right font-mono text-gray-800">{fmtPremioSV(coberturaSeguro.premio_apc)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Observações */}
                      {coberturaSeguro.observacoes && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <p className="text-xs font-bold text-gray-600 uppercase mb-1">Observações</p>
                          <p className="text-sm text-gray-700">{coberturaSeguro.observacoes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ============ PARCEIROS / CONVÊNIOS — Lançamentos do colaborador ============ */}
              <TabsContent value="parceiros_lanc" className="mt-4">
                {(() => {
                  const lancs = ((raioX as any)?.parceirosLancamentos || []) as any[];
                  const total = lancs.reduce((a, l) => a + Number(l.valor || 0), 0);
                  const aprov = lancs.filter(l => l.status === "aprovado");
                  const pend  = lancs.filter(l => l.status === "pendente");
                  const rej   = lancs.filter(l => l.status === "rejeitado");
                  const totAprov = aprov.reduce((a, l) => a + Number(l.valor || 0), 0);
                  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                  const tipoLbl: Record<string, string> = {
                    mercado: "Mercado", farmacia: "Farmácia", restaurante: "Restaurante",
                    posto: "Posto", oficina: "Oficina", outro: "Convênio",
                  };
                  const stCls: Record<string, string> = {
                    aprovado: "bg-green-100 text-green-800",
                    pendente: "bg-amber-100 text-amber-800",
                    rejeitado: "bg-red-100 text-red-800",
                  };
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                          <Handshake className="w-5 h-5 text-purple-600" />
                          Lançamentos em Parceiros / Convênios
                        </h3>
                        <span className="text-xs text-gray-500">{lancs.length} lançamento(s) — Total {fmtBRL(total)}</span>
                      </div>

                      {/* KPIs */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">Lançamentos</p>
                          <p className="text-2xl font-bold text-blue-900 mt-1">{lancs.length}</p>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-purple-700 tracking-wider">Valor Total</p>
                          <p className="text-2xl font-bold text-purple-900 mt-1">{fmtBRL(total)}</p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-green-700 tracking-wider">Aprovado</p>
                          <p className="text-2xl font-bold text-green-900 mt-1">{aprov.length}</p>
                          <p className="text-xs text-green-700">{fmtBRL(totAprov)}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-[10px] uppercase font-bold text-amber-700 tracking-wider">Pend / Rej</p>
                          <p className="text-2xl font-bold text-amber-900 mt-1">{pend.length} / {rej.length}</p>
                        </div>
                      </div>

                      {lancs.length === 0 ? (
                        <div className="text-center py-10 text-gray-400">
                          <Handshake className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm font-medium">Nenhum lançamento em parceiros conveniados</p>
                          <p className="text-xs mt-1">Este colaborador não utilizou nenhum convênio até o momento.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                              <tr>
                                <th className="text-left py-2 px-3">Data</th>
                                <th className="text-left py-2 px-3">Parceiro</th>
                                <th className="text-left py-2 px-3">Tipo</th>
                                <th className="text-left py-2 px-3">Itens / Descrição</th>
                                <th className="text-right py-2 px-3">Valor</th>
                                <th className="text-center py-2 px-3">Status</th>
                                <th className="text-center py-2 px-3">Comp. Desconto</th>
                                <th className="text-left py-2 px-3">Aprovado em</th>
                                <th className="text-center py-2 px-3">Comprov.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lancs.map((l: any) => (
                                <tr key={l.id} className="border-t hover:bg-gray-50">
                                  <td className="py-2 px-3 whitespace-nowrap">{String(l.dataCompra ?? "").slice(0,10).split("-").reverse().join("/")}</td>
                                  <td className="py-2 px-3 font-medium">{l.parceiroNomeExibicao}</td>
                                  <td className="py-2 px-3 text-xs text-gray-600">{tipoLbl[l.tipoConvenio] || l.tipoConvenio || "—"}</td>
                                  <td className="py-2 px-3 text-xs text-gray-600 max-w-[280px] truncate" title={l.descricaoItens || ""}>{l.descricaoItens || "—"}</td>
                                  <td className="py-2 px-3 text-right font-semibold tabular-nums">{fmtBRL(Number(l.valor || 0))}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${stCls[l.status] || "bg-gray-100 text-gray-700"}`}>
                                      {l.status === "aprovado" ? "Aprovado" : l.status === "rejeitado" ? "Rejeitado" : "Pendente"}
                                    </span>
                                    {l.status === "rejeitado" && l.motivoRejeicao && (
                                      <p className="text-[10px] text-red-600 mt-0.5 max-w-[140px] truncate" title={l.motivoRejeicao}>{l.motivoRejeicao}</p>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center text-xs text-gray-600">
                                    {l.competenciaDesconto ? l.competenciaDesconto.split("-").reverse().join("/") : "—"}
                                  </td>
                                  <td className="py-2 px-3 text-xs text-gray-600 whitespace-nowrap">
                                    {l.aprovadoEm ? String(l.aprovadoEm).slice(0,10).split("-").reverse().join("/") : "—"}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {l.comprovanteUrl ? (
                                      <a
                                        href={l.comprovanteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                                        title="Abrir comprovante"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" /> Ver
                                      </a>
                                    ) : (
                                      <span className="text-xs text-gray-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 bg-gray-50 font-semibold">
                                <td colSpan={4} className="py-2 px-3 text-right">TOTAL</td>
                                <td className="py-2 px-3 text-right text-purple-700">{fmtBRL(total)}</td>
                                <td colSpan={4}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </TabsContent>

            </Tabs>
          </div>
        )}
      </div>

      {/* ============ MODAL — DETALHE DO DDS (Rev. 1772 — layout redesenhado) ============ */}
      <Dialog open={!!ddsDetalhe} onOpenChange={(o) => !o && setDdsDetalhe(null)}>
        <DialogContent
          resizable={false}
          className="w-[96vw] max-w-[980px] max-h-[94vh] p-0 gap-0 overflow-hidden flex flex-col bg-white border-slate-200"
        >
          {/* Header com gradiente */}
          <div className="relative shrink-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 px-6 py-5 text-white">
            <button
              onClick={() => setDdsDetalhe(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-100/90">Diálogo Diário de Segurança</div>
                <h2 className="text-xl sm:text-2xl font-bold leading-tight mt-0.5 truncate">
                  {ddsDetalheQuery.data?.tituloTema || (ddsDetalheQuery.isLoading ? 'Carregando…' : 'DDS')}
                </h2>
                {ddsDetalheQuery.data && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-blue-50">
                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{formatDate(ddsDetalheQuery.data.data)}{ddsDetalheQuery.data.hora ? ` · ${ddsDetalheQuery.data.hora}` : ''}</div>
                    {ddsDetalheQuery.data.obraNome && <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" />{ddsDetalheQuery.data.obraNome}</div>}
                    {ddsDetalheQuery.data.instrutor && <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{ddsDetalheQuery.data.instrutor}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Body scrollável */}
          <div className="flex-1 overflow-y-auto bg-slate-50">
            {ddsDetalheQuery.isLoading && (
              <div className="py-16 text-center">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-600" />
                <div className="text-sm text-slate-500 mt-4">Carregando detalhes da sessão…</div>
              </div>
            )}
            {ddsDetalheQuery.isError && (
              <div className="py-12 px-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-3">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="text-red-700 font-semibold">Erro ao carregar a sessão</div>
                <div className="text-xs text-slate-500 mt-2">{(ddsDetalheQuery.error as any)?.message}</div>
              </div>
            )}
            {ddsDetalheQuery.data && (() => {
              const s: any = ddsDetalheQuery.data;
              const meu: any = (s.funcionarios || []).find((f: any) => f.id === ddsDetalhe?.sfId);
              const presenteOk = Number(meu?.presente || 0) === 1;
              const tipoAss = meu?.assinaturaTipo === 'desenhada' ? 'Digital'
                            : meu?.assinaturaTipo === 'fcsign' ? 'FCsign'
                            : meu?.assinaturaTipo === 'manual' ? 'Manual' : '';
              const presentes = (s.funcionarios || []).filter((f: any) => Number(f.presente) === 1).length;
              const total = (s.funcionarios || []).length;
              const pctPres = total > 0 ? Math.round((presentes / total) * 100) : 0;
              const statusColor = s.status === 'finalizada' ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                : s.status === 'cancelada' ? 'bg-red-100 text-red-700 border-red-300'
                                : 'bg-amber-100 text-amber-700 border-amber-300';
              return (
                <div className="px-6 py-5 space-y-5">
                  {/* Métricas rápidas */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</div>
                      <div className="mt-1.5"><Badge className={`${statusColor} font-semibold`}>{s.status}</Badge></div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Presença</div>
                      <div className="text-lg font-bold text-slate-800 mt-1">{presentes}<span className="text-slate-400 font-normal">/{total}</span> <span className="text-xs font-normal text-slate-500">({pctPres}%)</span></div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sua presença</div>
                      <div className="mt-1.5">{presenteOk
                        ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 font-semibold">Presente</Badge>
                        : <Badge variant="destructive">Ausente</Badge>}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assinatura</div>
                      <div className="mt-1.5">{meu?.temAssinatura || meu?.assinaturaTipo === 'fcsign'
                        ? <Badge className="bg-blue-100 text-blue-700 border-blue-300 font-semibold">{tipoAss || 'Assinada'}</Badge>
                        : <Badge className="bg-amber-100 text-amber-700 border-amber-300 font-semibold">Pendente</Badge>}</div>
                    </div>
                  </div>

                  {/* Roteiro */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200">
                      <FileText className="w-4 h-4 text-blue-700" />
                      <h4 className="text-sm font-bold text-blue-900">Roteiro do DDS</h4>
                    </div>
                    <div className="p-5 max-h-[42vh] overflow-y-auto">
                      {s.conteudoMd
                        ? <pre className="whitespace-pre-wrap font-sans text-[13.5px] leading-[1.65] text-slate-700">{s.conteudoMd}</pre>
                        : <div className="text-sm text-slate-400 italic text-center py-6">Sem roteiro registrado pra esta sessão.</div>}
                    </div>
                  </div>

                  {/* Participação + Assinatura — 2 colunas em desktop */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-200">
                      <UserCheck className="w-4 h-4 text-emerald-700" />
                      <h4 className="text-sm font-bold text-emerald-900">Participação de {meu?.nome || emp?.name}</h4>
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Coluna esquerda — dados */}
                      <div className="space-y-2.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">CPF</span>
                          <b className="text-slate-800 tabular-nums">{meu?.cpf ? formatCPF(meu.cpf) : '—'}</b>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">Função</span>
                          <b className="text-slate-800 text-right">{meu?.funcao || '—'}</b>
                        </div>
                        <div className="flex justify-between gap-3 items-center">
                          <span className="text-slate-500">Presença</span>
                          {presenteOk
                            ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Presente</Badge>
                            : <Badge variant="destructive">Ausente</Badge>}
                        </div>
                        <div className="flex justify-between gap-3 items-center">
                          <span className="text-slate-500">Tipo de assinatura</span>
                          {meu?.temAssinatura || meu?.assinaturaTipo === 'fcsign'
                            ? <Badge className="bg-blue-100 text-blue-700 border-blue-300">{tipoAss || 'Assinada'}</Badge>
                            : <Badge className="bg-amber-100 text-amber-700 border-amber-300">Pendente</Badge>}
                        </div>
                        {meu?.assinadoEm && (
                          <div className="flex justify-between gap-3 pt-2 border-t border-slate-100">
                            <span className="text-slate-500 text-xs">Assinado em</span>
                            <span className="text-xs text-slate-600 font-medium">{new Date(meu.assinadoEm).toLocaleString('pt-BR')}</span>
                          </div>
                        )}
                      </div>
                      {/* Coluna direita — imagem assinatura */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Assinatura digital</div>
                        <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 min-h-[140px] flex items-center justify-center p-3">
                          {ddsAssinaturaQuery.isLoading && <Loader2 className="h-6 w-6 animate-spin text-blue-500" />}
                          {!ddsAssinaturaQuery.isLoading && ddsAssinaturaQuery.data?.assinaturaImg && (
                            <img src={ddsAssinaturaQuery.data.assinaturaImg} alt="Assinatura" className="max-h-32 max-w-full object-contain" />
                          )}
                          {!ddsAssinaturaQuery.isLoading && !ddsAssinaturaQuery.data?.assinaturaImg && (
                            <div className="text-xs text-slate-400 italic text-center">Nenhuma assinatura<br/>digital registrada.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Observações (opcional) */}
                  {s.observacoes && (
                    <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <h4 className="text-sm font-bold text-amber-900">Observações</h4>
                      </div>
                      <div className="p-4 text-sm whitespace-pre-wrap text-slate-700 leading-relaxed">{s.observacoes}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Footer fixo */}
          <div className="shrink-0 px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-400 hidden sm:block">
              {ddsDetalheQuery.data && `Sessão #${ddsDetalheQuery.data.id}`}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" onClick={() => setDdsDetalhe(null)} className="border-slate-300">Fechar</Button>
              <Button
                onClick={gerarPdfDds}
                disabled={!ddsDetalheQuery.data || ddsAssinaturaQuery.isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                <FileDown className="h-4 w-4 mr-1.5" /> Gerar PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ MODAL — MARCAR COMO PERDIDO ============ */}
      {descontoModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-bold text-red-700 mb-4 flex items-center gap-2">
              <PackageX className="w-5 h-5" />
              Marcar Item como Perdido — Desconto em Folha
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Item: <strong>{descontoModal.loan.itemNome}</strong> | Qtd: {descontoModal.loan.quantidade || 1}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Valor do Desconto (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="0,00"
                  value={descontoValor}
                  onChange={(e) => setDescontoValor(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Descrição / Motivo</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  value={descontoDescricao}
                  onChange={(e) => setDescontoDescricao(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Mês de Aplicação do Desconto</label>
                <input
                  type="month"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  value={descontoMes}
                  onChange={(e) => setDescontoMes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setDescontoModal(null)}>Cancelar</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={!descontoValor || parseFloat(descontoValor) <= 0 || criarDescontoMut.isPending}
                onClick={() => criarDescontoMut.mutate({
                  companyId: descontoModal.loan.companyId,
                  employeeId: descontoModal.loan.funcionarioId,
                  employeeNome: descontoModal.loan.funcionarioNome || emp?.nomeCompleto || "",
                  loanId: descontoModal.loan.id,
                  itemNome: descontoModal.loan.itemNome,
                  quantidade: parseFloat(String(descontoModal.loan.quantidade || 1)),
                  valorDesconto: parseFloat(descontoValor),
                  descricao: descontoDescricao || undefined,
                  mesDesconto: descontoMes || undefined,
                })}
              >
                {criarDescontoMut.isPending ? "Salvando..." : "Confirmar Desconto"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL — REPROVAR DESCONTO ============ */}
      {reprovarModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-base font-bold text-red-700 mb-4 flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Reprovar Desconto em Folha
            </h3>
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Motivo da Reprovação (opcional)</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="Descreva o motivo..."
                value={reprovarMotivo}
                onChange={(e) => setReprovarMotivo(e.target.value)}
              />
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <Button variant="outline" onClick={() => setReprovarModal(null)}>Cancelar</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={reprovarDescontoMut.isPending}
                onClick={() => reprovarDescontoMut.mutate({ id: reprovarModal.id, motivoReprovacao: reprovarMotivo || undefined })}
              >
                {reprovarDescontoMut.isPending ? "Salvando..." : "Confirmar Reprovação"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewDialog
        open={!!atestPreviewDoc}
        onOpenChange={(open) => { if (!open) setAtestPreviewDoc(null); }}
        fileUrl={atestPreviewDoc?.url || null}
        fileName={atestPreviewDoc?.name || null}
        title={atestPreviewDoc?.title}
      />

      {/* Rev. 2544 — MODAL DE DETALHE DO EVENTO DA TIMELINE (rastreabilidade) — layout moderno, sem rolagem horizontal */}
      <Dialog open={!!timelineEvt} onOpenChange={(o) => { if (!o) setTimelineEvt(null); }}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[88vh] overflow-x-hidden overflow-y-auto p-0 gap-0 rounded-2xl">
          {timelineEvt && (() => {
            const PII_KEYS = /(cpf|rg|pis|ctps|nascimento|endereco|logradouro|bairro|cep|telefone|celular|email|conta|agencia|pix|salario|remuneracao|nomemae|nomepai|eleitor|cnh|passaporte|dependente|beneficiario|dadosbancarios|valoranterior|valornovo)/i;
            const SKIP_KEYS = /^(_|employeeId$|funcionarioId$|companyId$|deletedAt$|updatedBy$|createdBy$)/i;
            const friendlyKey = (k: string) => k
              .replace(/([A-Z])/g, " $1")
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())
              .replace(/\bId\b/g, "ID")
              .trim();
            // Formatação inteligente: data-only → DD/MM/AAAA; data+hora (timestamp) → DD/MM/AAAA HH:mm.
            const fmtDateSmart = (s: string): string => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDate(s);
              const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
              if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
              return s;
            };
            const fmtVal = (v: any): string => {
              if (v === null || v === undefined || v === "") return "—";
              if (typeof v === "boolean") return v ? "Sim" : "Não";
              if (typeof v === "number") return String(v);
              if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v) ? fmtDateSmart(v) : v;
              // Objetos/arrays aninhados podem conter PII (ex.: signatários FCSign com e-mail/CPF).
              // Sob hidePersonal, NÃO serializa o conteúdo cru.
              if (typeof v === "object" && hidePersonal) return "[oculto]";
              try { return JSON.stringify(v, null, 2); } catch { return String(v); }
            };
            const meta = (timelineEvt.meta && typeof timelineEvt.meta === "object") ? timelineEvt.meta : {};
            const entries = Object.entries(meta).filter(([k, v]) => {
              if (SKIP_KEYS.test(k)) return false;
              if (v === null || v === undefined || v === "") return false;
              if (typeof v === "function") return false;
              if (hidePersonal && PII_KEYS.test(k)) return false;
              return true;
            });
            const accent = TIMELINE_COLORS[timelineEvt?.cor] || "bg-gray-400";
            return (
              <>
                {/* Cabeçalho com faixa de cor do evento */}
                <DialogHeader className="space-y-0 p-5 pb-4 border-b bg-gradient-to-br from-gray-50 to-white">
                  <div className="flex items-start gap-3">
                    <span className={`shrink-0 w-10 h-10 rounded-xl ${accent} flex items-center justify-center shadow-sm`}>
                      <ChevronRight className="h-5 w-5 text-white" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-base font-bold text-gray-900 leading-tight break-words">
                        {timelineEvt?.tipo || "Detalhe do registro"}
                      </DialogTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs font-semibold text-gray-500">{fmtDateSmart(String(timelineEvt.data || ""))}</span>
                        {timelineEvt.refTipo && (
                          <Badge variant="outline" className="text-[10px] font-medium">
                            {timelineEvt.refTipo}{timelineEvt.refId != null ? ` #${timelineEvt.refId}` : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {timelineEvt.descricao && (
                    <p className="text-sm text-gray-600 leading-snug pt-3 break-words">{timelineEvt.descricao}</p>
                  )}
                </DialogHeader>

                {/* Corpo: tiles responsivos (sem rolagem horizontal) */}
                <div className="p-5 space-y-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Dados completos do registro</div>
                  {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem detalhes adicionais disponíveis para este registro.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {entries.map(([k, v]) => (
                        <div key={k} className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2 transition-colors hover:bg-gray-50">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 truncate">{friendlyKey(k)}</div>
                          <div className="text-sm font-medium text-gray-800 mt-0.5 break-words whitespace-pre-wrap">{fmtVal(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {hidePersonal && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Alguns dados pessoais sensíveis foram ocultados conforme suas permissões (LGPD).
                    </p>
                  )}
                </div>

                <DialogFooter className="px-5 py-3 border-t bg-gray-50/50">
                  <Button variant="outline" onClick={() => setTimelineEvt(null)}>Fechar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* LIGHTBOX DA FOTO DO COLABORADOR */}
      {fotoAmpliada && emp?.fotoUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-150"
          onClick={() => setFotoAmpliada(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada do colaborador"
        >
          <button
            type="button"
            ref={(el) => { if (el) el.focus(); }}
            onClick={(e) => { e.stopPropagation(); setFotoAmpliada(false); }}
            className="absolute top-4 right-4 text-white bg-white/15 hover:bg-white/30 rounded-full h-10 w-10 flex items-center justify-center text-xl font-bold shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Fechar"
            title="Fechar (ESC)"
          >
            ×
          </button>
          <div className="flex flex-col items-center gap-3 max-w-full max-h-full">
            <img
              src={emp.fotoUrl}
              alt={emp.nomeCompleto || "Foto do colaborador"}
              className="max-w-[92vw] max-h-[82vh] object-contain rounded-lg shadow-2xl bg-white"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="text-white text-sm sm:text-base text-center bg-black/40 px-3 py-1.5 rounded">
              {emp.nomeCompleto}{emp.cpf ? ` — CPF: ${formatCPFSafe(emp.cpf)}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* ============ DETALHE DO ACIDENTE (clique na linha) ============ */}
      <Dialog open={!!acidenteDetalhe} onOpenChange={(o) => { if (!o) setAcidenteDetalhe(null); }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {acidenteDetalhe && (() => {
            const a = acidenteDetalhe;
            const grave = a.gravidade === "Grave" || a.gravidade === "Fatal";
            const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
                <span className="text-sm text-foreground break-words">{value ?? "-"}</span>
              </div>
            );
            const Bloco = ({ label, value }: { label: string; value: React.ReactNode }) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{value || "-"}</p>
              </div>
            );
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-800">
                    <AlertTriangle className="h-5 w-5" />
                    Detalhes do Acidente de Trabalho
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{a.tipoAcidente?.replace(/_/g, " ") || "-"}</Badge>
                    <Badge variant={grave ? "destructive" : "secondary"}>{a.gravidade || "-"}</Badge>
                    {Number(a.diasAfastamento) > 0 && (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                        {a.diasAfastamento} dia(s) de afastamento
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 rounded-lg border bg-muted/20 p-4">
                    <Row label="Data" value={formatDate(a.dataAcidente)} />
                    <Row label="Hora" value={a.horaAcidente} />
                    <Row label="Dias Afast." value={a.diasAfastamento || 0} />
                    <Row label="Local" value={a.localAcidente} />
                    <Row label="Parte do Corpo" value={a.parteCorpoAtingida} />
                    <Row label="Agente Causador" value={a.agenteCausador} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-4">
                    <span className="col-span-full text-xs font-semibold uppercase tracking-wide text-red-900">CAT — Comunicação de Acidente</span>
                    <Row label="Houve CAT?" value={a.houveCAT ? "Sim" : "Não"} />
                    <Row label="Nº da CAT" value={a.catNumero} />
                    <Row label="Data da CAT" value={a.catData ? formatDate(a.catData) : "-"} />
                    {!a.houveCAT && a.motivoSemCAT && (
                      <div className="col-span-full"><Bloco label="Motivo sem CAT" value={a.motivoSemCAT} /></div>
                    )}
                  </div>

                  <Bloco label="Descrição do Acidente" value={a.descricao} />

                  {(a.acaoCorretiva || a.responsavelAcao || a.prazoAcaoCorretiva || a.statusAcaoCorretiva) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-4">
                      <span className="col-span-full text-xs font-semibold uppercase tracking-wide text-emerald-900">Ação Corretiva</span>
                      <Row label="Status" value={a.statusAcaoCorretiva} />
                      <Row label="Responsável" value={a.responsavelAcao} />
                      <Row label="Prazo" value={a.prazoAcaoCorretiva ? formatDate(a.prazoAcaoCorretiva) : "-"} />
                      <div className="col-span-full"><Bloco label="Descrição da Ação" value={a.acaoCorretiva} /></div>
                    </div>
                  )}

                  {a.testemunhas && <Bloco label="Testemunhas" value={a.testemunhas} />}

                  {a.documentoUrl && (
                    <div>
                      <a
                        href={a.documentoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline"
                      >
                        <FileText className="h-4 w-4" /> Abrir documento anexado
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAcidenteDetalhe(null)}>Fechar</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>,
    document.body
  );
}

// ============ COMPONENTE CONTRATOS TAB ============
function ContratosTab({ employeeId, companyId, empNome }: { employeeId: number; companyId: number; empNome: string }) {
  const [showGerador, setShowGerador] = useState(false);
  const [tipo, setTipo] = useState<"experiencia" | "indeterminado">("experiencia");
  const [prazoExp, setPrazoExp] = useState<"30+30" | "45+45">("45+45");
  const [previewHtml, setPreviewHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [dadosContrato, setDadosContrato] = useState<any>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [uploadTipo, setUploadTipo] = useState<"contrato" | "prorrogacao">("contrato");
  const [viewingHtml, setViewingHtml] = useState("");

  const { isAdminMaster } = usePermissions();
  const [editingContrato, setEditingContrato] = useState<any>(null);
  const [editContratoForm, setEditContratoForm] = useState({ prazoExperienciaDias: 0, prazoProrrogacaoDias: 0, funcao: "", observacoes: "" });

  const contratosQuery = trpc.contracts.listarContratos.useQuery({ employeeId });
  const contratos = contratosQuery.data || [];
  const gerarMutation = trpc.contracts.gerarContrato.useMutation();
  const salvarMutation = trpc.contracts.salvarContrato.useMutation();
  const uploadMutation = trpc.contracts.uploadAssinado.useMutation();
  const statusMutation = trpc.contracts.atualizarStatus.useMutation();
  const excluirMutation = trpc.contracts.excluirContrato.useMutation();
  const editarMutation = trpc.contracts.editarContrato.useMutation();
  const reverterMutation = trpc.contracts.reverterEfetivacao.useMutation();
  const utils = trpc.useUtils();

  const handleGerar = async () => {
    try {
      // O seletor "30+30" / "45+45" representa (dias de experiência) + (dias de prorrogação).
      // O backend espera dois números separados, não a string combinada.
      const [diasExpStr, diasProrrStr] = prazoExp.split("+");
      const diasExp = parseInt(diasExpStr, 10);
      const diasProrr = parseInt(diasProrrStr, 10);
      const result = await gerarMutation.mutateAsync({
        companyId,
        employeeId,
        tipo,
        prazoExperienciaDias: Number.isFinite(diasExp) ? diasExp : undefined,
        prazoProrrogacaoDias: Number.isFinite(diasProrr) ? diasProrr : undefined,
      });
      setPreviewHtml(result.conteudoHtml);
      setDadosContrato(result.dados);
    } catch (e: any) {
      alert("Erro ao gerar contrato: " + (e.message || "Erro desconhecido"));
    }
  };

  const handleSalvar = async () => {
    if (!dadosContrato || !previewHtml) return;
    setSaving(true);
    try {
      await salvarMutation.mutateAsync({
        companyId,
        employeeId,
        tipo: dadosContrato.tipo,
        dataInicio: dadosContrato.dataInicio,
        dataFim: dadosContrato.dataFim || undefined,
        prazoExperienciaDias: dadosContrato.prazoExperienciaDias || undefined,
        prazoProrrogacaoDias: dadosContrato.prazoProrrogacaoDias || undefined,
        salarioBase: dadosContrato.salarioBase || undefined,
        valorHora: dadosContrato.valorHora || undefined,
        funcao: dadosContrato.funcao || undefined,
        jornadaTrabalho: dadosContrato.jornadaTrabalho || undefined,
        localTrabalho: dadosContrato.localTrabalho || undefined,
        conteudoGerado: previewHtml,
      });
      utils.contracts.listarContratos.invalidate();
      setShowGerador(false);
      setPreviewHtml("");
      setDadosContrato(null);
    } catch (e: any) {
      alert("Erro ao salvar: " + (e.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  const handleImprimir = (html: string) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contrato - ${empNome}</title><style>@page{size:A4;margin:20mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const handleUpload = async (contratoId: number, isProrrogacao: boolean) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { alert("Arquivo muito grande (max 10MB)"); return; }
      setUploadingId(contratoId);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];
          await uploadMutation.mutateAsync({
            contratoId,
            fileBase64: base64,
            fileName: file.name,
            mimeType: file.type,
            tipoProrrogacao: isProrrogacao,
          });
          utils.contracts.listarContratos.invalidate();
          setUploadingId(null);
        };
        reader.readAsDataURL(file);
      } catch {
        setUploadingId(null);
        alert("Erro no upload");
      }
    };
    input.click();
  };

  const handleEfetivar = async (contrato: any) => {
    if (!confirm("Deseja efetivar este funcionário? Será gerado um contrato por tempo indeterminado.")) return;
    await statusMutation.mutateAsync({ id: contrato.id, status: "efetivado", dataEfetivacao: new Date().toISOString().split("T")[0] });
    // Gerar contrato indeterminado automaticamente
    const result = await gerarMutation.mutateAsync({ companyId, employeeId, tipo: "indeterminado" });
    await salvarMutation.mutateAsync({
      companyId, employeeId, tipo: "indeterminado",
      dataInicio: new Date().toISOString().split("T")[0],
      conteudoGerado: result.conteudoHtml,
      funcao: result.dados.funcao,
      jornadaTrabalho: result.dados.jornadaTrabalho,
      localTrabalho: result.dados.localTrabalho,
      salarioBase: result.dados.salarioBase,
      valorHora: result.dados.valorHora,
      contratoAnteriorId: contrato.id,
    });
    utils.contracts.listarContratos.invalidate();
  };

  const tipoLabel: Record<string, string> = {
    experiencia: "Experiência", indeterminado: "Indeterminado", prorrogacao: "Prorrogação",
  };
  const statusLabel: Record<string, string> = {
    vigente: "Vigente", prorrogado: "Prorrogado", efetivado: "Efetivado", encerrado: "Encerrado", rescindido: "Rescindido",
  };
  const statusColor: Record<string, string> = {
    vigente: "bg-green-100 text-green-800", prorrogado: "bg-blue-100 text-blue-800",
    efetivado: "bg-emerald-100 text-emerald-800", encerrado: "bg-gray-100 text-gray-800",
    rescindido: "bg-red-100 text-red-800",
  };

  // Visualizar contrato
  if (viewingHtml) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => setViewingHtml("")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <Button size="sm" onClick={() => handleImprimir(viewingHtml)}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
        </div>
        <div className="border rounded-lg bg-white p-6 shadow-sm" dangerouslySetInnerHTML={{ __html: viewingHtml }} />
      </div>
    );
  }

  // Gerador de contrato
  if (showGerador) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowGerador(false); setPreviewHtml(""); setDadosContrato(null); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <h3 className="text-lg font-bold text-slate-800">Gerar Novo Contrato</h3>
        </div>

        {!previewHtml ? (
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">Tipo de Contrato</label>
              <div className="flex gap-3">
                <button onClick={() => setTipo("experiencia")} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${tipo === "experiencia" ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  Experiência
                </button>
                <button onClick={() => setTipo("indeterminado")} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${tipo === "indeterminado" ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                  Indeterminado
                </button>
              </div>
            </div>

            {tipo === "experiencia" && (
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Prazo de Experiência</label>
                <div className="flex gap-3">
                  <button onClick={() => setPrazoExp("30+30")} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${prazoExp === "30+30" ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    30 + 30 dias
                  </button>
                  <button onClick={() => setPrazoExp("45+45")} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${prazoExp === "45+45" ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    45 + 45 dias
                  </button>
                </div>
              </div>
            )}

            <Button onClick={handleGerar} disabled={gerarMutation.isPending} className="bg-cyan-600 hover:bg-cyan-700">
              {gerarMutation.isPending ? "Gerando..." : "Gerar Contrato"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button onClick={handleSalvar} disabled={saving} className="bg-green-600 hover:bg-green-700">
                {saving ? "Salvando..." : "Salvar Contrato"}
              </Button>
              <Button variant="outline" onClick={() => handleImprimir(previewHtml)}>
                <Printer className="h-4 w-4 mr-1" /> Imprimir
              </Button>
              <Button variant="outline" onClick={() => { setPreviewHtml(""); setDadosContrato(null); }}>
                Refazer
              </Button>
            </div>
            <div className="border rounded-lg bg-white p-6 shadow-sm max-h-[600px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        )}
      </div>
    );
  }

  // Lista de contratos
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">Contratos CLT</h3>
        <Button onClick={() => setShowGerador(true)} className="bg-cyan-600 hover:bg-cyan-700">
          <ScrollText className="h-4 w-4 mr-1" /> Gerar Novo Contrato
        </Button>
      </div>

      <Dialog open={editingContrato !== null} onOpenChange={(open) => { if (!open) setEditingContrato(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editingContrato?.tipo === "experiencia" && (
              <>
                <div>
                  <Label>Prazo de Experiência (dias)</Label>
                  <Input type="number" className="mt-1" value={editContratoForm.prazoExperienciaDias}
                    onChange={e => setEditContratoForm({ ...editContratoForm, prazoExperienciaDias: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Prazo de Prorrogação (dias)</Label>
                  <Input type="number" className="mt-1" value={editContratoForm.prazoProrrogacaoDias}
                    onChange={e => setEditContratoForm({ ...editContratoForm, prazoProrrogacaoDias: parseInt(e.target.value) || 0 })} />
                </div>
              </>
            )}
            <div>
              <Label>Função</Label>
              <Input className="mt-1" value={editContratoForm.funcao}
                onChange={e => setEditContratoForm({ ...editContratoForm, funcao: e.target.value })} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input className="mt-1" value={editContratoForm.observacoes}
                onChange={e => setEditContratoForm({ ...editContratoForm, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContrato(null)}>Cancelar</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" disabled={editarMutation.isPending}
              onClick={async () => {
                if (!editingContrato) return;
                try {
                  await editarMutation.mutateAsync({
                    id: editingContrato.id, companyId,
                    ...(editingContrato.tipo === "experiencia" ? {
                      prazoExperienciaDias: editContratoForm.prazoExperienciaDias,
                      prazoProrrogacaoDias: editContratoForm.prazoProrrogacaoDias,
                    } : {}),
                    funcao: editContratoForm.funcao,
                    observacoes: editContratoForm.observacoes || null,
                  });
                  utils.contracts.listarContratos.invalidate();
                  setEditingContrato(null);
                  toast.success("Contrato atualizado");
                } catch (e: any) { alert("Erro: " + (e.message || "Erro")); }
              }}>
              {editarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pencil className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {contratos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ScrollText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum contrato CLT registrado</p>
          <p className="text-xs mt-1">Clique em "Gerar Novo Contrato" para criar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contratos.map((c: any) => (
            <div key={c.id} className="border rounded-lg bg-white p-4 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-800">{tipoLabel[c.tipo] || c.tipo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusColor[c.status] || "bg-gray-100 text-gray-800"}`}>
                      {statusLabel[c.status] || c.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <p>Início: {c.dataInicio ? new Date(c.dataInicio + "T12:00:00").toLocaleDateString("pt-BR") : "-"}
                      {c.dataFim && ` | Fim: ${new Date(c.dataFim + "T12:00:00").toLocaleDateString("pt-BR")}`}
                      {c.prazoExperienciaDias && ` | Prazo: ${c.prazoExperienciaDias} dias`}
                    </p>
                    {c.funcao && <p>Função: {c.funcao}</p>}
                    <p>Criado por: {c.criadoPor} em {new Date(c.createdAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setViewingHtml(c.conteudoGerado)} title="Visualizar">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleImprimir(c.conteudoGerado)} title="Imprimir">
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" title="Editar" className="text-amber-600 hover:bg-amber-50"
                    onClick={() => {
                      setEditingContrato(c);
                      setEditContratoForm({
                        prazoExperienciaDias: c.prazoExperienciaDias || 0,
                        prazoProrrogacaoDias: c.prazoProrrogacaoDias || 0,
                        funcao: c.funcao || "",
                        observacoes: c.observacoes || "",
                      });
                    }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" title="Excluir" className="text-red-600 hover:bg-red-50"
                    disabled={excluirMutation.isPending}
                    onClick={async () => {
                      if (!confirm(`Excluir este contrato de ${tipoLabel[c.tipo] || c.tipo}? Esta ação não pode ser desfeita.`)) return;
                      try {
                        await excluirMutation.mutateAsync({ id: c.id, companyId });
                        utils.contracts.listarContratos.invalidate();
                      } catch (e: any) { alert("Erro ao excluir: " + (e.message || "Erro")); }
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Ações do contrato */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
                {/* Upload contrato assinado */}
                {!c.contratoAssinadoUrl ? (
                  <Button variant="outline" size="sm" onClick={() => handleUpload(c.id, false)} disabled={uploadingId === c.id}>
                    <FileDown className="h-3.5 w-3.5 mr-1" />
                    {uploadingId === c.id ? "Enviando..." : "Upload Assinado"}
                  </Button>
                ) : (
                  <a href={c.contratoAssinadoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-md font-medium">
                    <Eye className="h-3 w-3" /> Contrato Assinado
                  </a>
                )}

                {/* Prorrogar (só experiência vigente) */}
                {c.tipo === "experiencia" && c.status === "vigente" && (
                  <Button variant="outline" size="sm" className="text-blue-700 border-blue-300 hover:bg-blue-50"
                    onClick={async () => {
                      if (!confirm("Deseja prorrogar o contrato de experiência?")) return;
                      await statusMutation.mutateAsync({ id: c.id, status: "prorrogado", dataProrrogacao: new Date().toISOString().split("T")[0] });
                      utils.contracts.listarContratos.invalidate();
                    }}>
                    Prorrogar
                  </Button>
                )}

                {/* Upload prorrogação assinada */}
                {c.status === "prorrogado" && !c.prorrogacaoAssinadaUrl && (
                  <Button variant="outline" size="sm" onClick={() => handleUpload(c.id, true)} disabled={uploadingId === c.id}>
                    <FileDown className="h-3.5 w-3.5 mr-1" />
                    {uploadingId === c.id ? "Enviando..." : "Upload Prorrogação"}
                  </Button>
                )}
                {c.prorrogacaoAssinadaUrl && (
                  <a href={c.prorrogacaoAssinadaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-md font-medium">
                    <Eye className="h-3 w-3" /> Prorrogação Assinada
                  </a>
                )}

                {/* Efetivar (experiência prorrogado ou vigente) */}
                {c.tipo === "experiencia" && (c.status === "vigente" || c.status === "prorrogado") && (
                  <Button variant="outline" size="sm" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    onClick={() => handleEfetivar(c)}>
                    Efetivar
                  </Button>
                )}

                {/* Reverter efetivação (somente admin_master) */}
                {c.status === "efetivado" && isAdminMaster && (
                  <Button variant="outline" size="sm" className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    disabled={reverterMutation.isPending}
                    onClick={async () => {
                      if (!confirm("Reverter a efetivação deste contrato? O status voltará ao anterior.")) return;
                      try {
                        await reverterMutation.mutateAsync({ id: c.id, companyId });
                        utils.contracts.listarContratos.invalidate();
                      } catch (e: any) { alert("Erro: " + (e.message || "Erro")); }
                    }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reverter
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssinaturaMemorialTab({ employeeId, empNome }: { employeeId: number; empNome: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_master" || user?.role === "admin";
  const memorialQ = trpc.heSolicitacoes.getAssinaturaMemorial.useQuery({ employeeId }, { enabled: !!employeeId });
  const limparMut = trpc.heSolicitacoes.limparAssinaturaMemorial.useMutation({
    onSuccess: () => {
      toast.success("Assinatura memorial limpa com sucesso! A próxima assinatura será registrada como oficial.");
      memorialQ.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [confirmLimpar, setConfirmLimpar] = useState(false);

  const memorial = memorialQ.data;
  const temAssinatura = !!memorial?.assinaturaMemorial;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-purple-600" />
            Assinatura Memorial (Oficial)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-gray-500 mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="font-medium text-purple-800 mb-1">Como funciona:</p>
            <ul className="list-disc list-inside space-y-1 text-purple-700">
              <li>A <strong>primeira assinatura</strong> do funcionário em qualquer HE é salva como memorial (oficial)</li>
              <li>Nas assinaturas seguintes, o sistema compara com a memorial e exige <strong>mínimo 90% de similaridade</strong></li>
              <li>Se divergir, o admin pode anexar foto/vídeo do funcionário concordando como prova alternativa</li>
              <li>Ideal para funcionários que não sabem ler/escrever ou têm dificuldade com assinatura</li>
            </ul>
          </div>

          {memorialQ.isLoading ? (
            <div className="flex justify-center py-8 text-gray-400">
              <Clock className="h-5 w-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : temAssinatura ? (
            <div className="space-y-4">
              <div className="bg-white border-2 border-purple-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                    Assinatura oficial cadastrada
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Registrada em: {memorial?.assinaturaMemorialAt
                      ? new Date(memorial.assinaturaMemorialAt).toLocaleString("pt-BR")
                      : "-"}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 flex justify-center">
                  <img
                    src={memorial!.assinaturaMemorial!}
                    alt={`Assinatura memorial de ${empNome}`}
                    className="max-h-32 object-contain"
                  />
                </div>
              </div>

              {isAdmin && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-3">
                  <p className="text-xs text-red-700 mb-2">
                    <strong>Ação do Administrador:</strong> Limpar a assinatura memorial fará com que a próxima assinatura
                    do funcionário seja registrada como nova memorial oficial.
                  </p>
                  {!confirmLimpar ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-700 border-red-300 hover:bg-red-100"
                      onClick={() => setConfirmLimpar(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Limpar Assinatura Memorial
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-800 font-medium">Tem certeza?</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={limparMut.isPending}
                        onClick={() => {
                          limparMut.mutate({ employeeId });
                          setConfirmLimpar(false);
                        }}
                      >
                        {limparMut.isPending ? "Limpando..." : "Sim, limpar"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setConfirmLimpar(false)}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <FileSignature className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma assinatura memorial cadastrada</p>
              <p className="text-xs mt-1">A primeira assinatura do funcionário em uma HE será automaticamente registrada como oficial.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
