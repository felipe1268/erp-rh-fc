/**
 * Rev. 2747 — Aba "Templates de Documentos" em Configurações (Central ISO + IA).
 *
 * A aba é a FONTE OFICIAL dos documentos institucionais FC. Layout (Rev. 2749):
 *  [topo]     Seletor horizontal dos 7 tipos (busca + filtro de status + cards)
 *  [principal] Ficha ISO (código/status/elaborado/aprovado/datas) + editor LARGO
 *  [lateral]  Placeholders pesquisáveis + histórico de revisões (coluna estreita)
 *
 * Editor ocupa ~75% da largura e usa tipografia confortável (readable) p/ leitura.
 *
 * Controle ISO: código FC-XX-NNN, status (rascunho→vigente→obsoleto), elaborado/
 * aprovado por, data de vigência e próxima revisão. IA: gerar do zero (instruções)
 * e ler PDF→sugerir modelo. Cada Salvar cria uma nova Rev.; restaurável.
 */

import { useState, useRef, useMemo, useEffect } from "react";
import DOMPurify from "dompurify";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  FileSignature, ShieldCheck, Megaphone, AlertTriangle, BellRing,
  UserX, Hammer, Save, History, RotateCcw, Eye, FileText, Search, Info, Loader2,
  XCircle, Sparkles, Upload, BadgeCheck, FilePlus2, Undo2, Printer, Trash2, Handshake,
} from "lucide-react";
import RichTextEditor, { type RichTextEditorHandle } from "@/components/RichTextEditor";
import {
  DOCUMENT_TEMPLATES_META,
  CATEGORIAS_DOCS,
  renderTemplate,
  getDocMetaOrFallback,
  isCustomTipo,
  type DocumentTemplateTipo,
  type DocumentTemplateMeta,
  type PlaceholderDef,
} from "@shared/documentTemplates";
import { buildFcDocument } from "@/lib/fcDocumentTemplate";
import XlsxTemplateTab from "./XlsxTemplateTab";
import DocxTemplateTab from "./DocxTemplateTab";
import ExtratoTemplateTab from "./ExtratoTemplateTab";
import { FileSpreadsheet, Landmark } from "lucide-react";

const ICON_MAP: Record<string, any> = {
  FileSignature, ShieldCheck, Megaphone, AlertTriangle, BellRing, UserX, Hammer, Handshake,
};

// XSS hardening do corpo antes de injetar no documento institucional.
const SANITIZE_OPTS = {
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "link", "meta", "base"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit", "formaction"],
  ALLOW_DATA_ATTR: false,
} as const;

/**
 * Rev. 2753 — Progresso 0–100% das gerações por IA.
 *
 * A chamada da IA é uma mutation tRPC (não-streaming), então não há progresso
 * REAL token-a-token; animamos uma estimativa que avança em direção a 95% ao
 * longo de ~55s (curva ease-out: rápido no início, desacelerando) — alinhada ao
 * teto de 1 min do servidor. Quando a mutation termina (sucesso OU erro) o
 * `active` vira false: cravamos 100% por um instante e zeramos. Assim o usuário
 * vê a "evolução" e sabe que nunca passa de ~1 min.
 */
function useIaProgress(active: boolean): number {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!active) {
      let resetId: ReturnType<typeof setTimeout> | undefined;
      setPct((p) => {
        if (p <= 0) return 0;
        resetId = setTimeout(() => setPct(0), 700);
        return 100;
      });
      return () => { if (resetId) clearTimeout(resetId); };
    }
    setPct(6);
    const start = Date.now();
    const TARGET = 95;
    const DURATION = 55_000;
    const id = setInterval(() => {
      const frac = Math.min(1, (Date.now() - start) / DURATION);
      const val = Math.round(6 + (TARGET - 6) * (1 - Math.pow(1 - frac, 2)));
      setPct(val);
    }, 350);
    return () => clearInterval(id);
  }, [active]);
  return pct;
}

/** Barra de progresso da IA: aparece enquanto a geração roda e some depois. */
function IaProgressBar({ active, label }: { active: boolean; label: string }) {
  const pct = useIaProgress(active);
  if (!active && pct === 0) return null;
  return (
    <div className="space-y-1 p-2.5 border border-violet-200 bg-violet-50/60 rounded-lg">
      <div className="flex items-center justify-between text-[11px] text-violet-700">
        <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {label}</span>
        <span className="tabular-nums font-semibold">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}

/**
 * Rev. 2752 — Monta o HTML COMPLETO de um documento da Central exatamente como
 * os geradores dos 7 docs fixos produzem: cabeçalho FC (logo + razão social +
 * CNPJ + endereço), faixa azul com o título, linha Nº/Data, bloco ASSUNTO,
 * corpo, assinaturas (2 partes + testemunhas), rodapé e @page A4 (margens
 * 25mm/15mm) — via `buildFcDocument`. O corpo é renderizado com os dados de
 * EXEMPLO dos placeholders e sanitizado (DOMPurify) antes de ser injetado.
 *
 * Usado tanto na pré-visualização (iframe srcDoc, isolado do CSS do app) quanto
 * na impressão (window.open), garantindo que o que se vê = o que se imprime,
 * 100% fiel ao modelo institucional. Empresa vem dos exemplos dos placeholders
 * (já são os dados reais da FC); logo sempre com fallback ${origin}/logo-fc.jpg.
 */
function buildFcPreviewHtml(bodyHtml: string, meta: DocumentTemplateMeta, geradoPor: string): string {
  if (!bodyHtml) return "";
  const dados: Record<string, string> = {};
  meta.placeholders.forEach(p => { dados[p.chave] = p.exemplo; });
  const corpo = DOMPurify.sanitize(renderTemplate(bodyHtml, dados), SANITIZE_OPTS);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const hoje = new Date();
  const dataBr = hoje.toLocaleDateString("pt-BR");
  const razao = dados.empresaRazaoSocial || "FC ENGENHARIA E CONSTRUCAO LTDA";
  return buildFcDocument({
    empresa: {
      razaoSocial: razao,
      cnpj: dados.empresaCnpj || "",
      endereco: dados.empresaEndereco || "",
      logoUrl: `${origin}/logo-fc.jpg`,
    },
    titulo: meta.titulo,
    numero: `001/${hoje.getFullYear()}`,
    dataEmissao: dataBr,
    assunto: { valor: meta.titulo },
    corpoHtml: corpo,
    assinaturas: {
      localData: `Guaratinguetá - SP, ${dataBr}`,
      partes: [
        { nome: razao, subtitulo: dados.empresaCnpj ? `CNPJ: ${dados.empresaCnpj}` : undefined },
        { nome: dados.empNome || "Colaborador(a)", subtitulo: dados.empCpf ? `CPF: ${dados.empCpf}` : undefined },
      ],
      testemunhas: true,
    },
    geradoPor,
    pageTitle: meta.titulo,
    logoSrc: `${origin}/logo-fc.jpg`,
  });
}

function formatDataHora(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function formatData(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("pt-BR");
  } catch { return iso || "—"; }
}

// Selo de status ISO (cores + rótulo).
function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "xs" }) {
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  const map: Record<string, { cls: string; label: string }> = {
    vigente: { cls: "bg-green-100 text-green-700 border border-green-200", label: "Vigente" },
    rascunho: { cls: "bg-amber-100 text-amber-700 border border-amber-200", label: "Rascunho" },
    obsoleto: { cls: "bg-gray-200 text-gray-600 border border-gray-300", label: "Obsoleto" },
    ausente: { cls: "bg-red-50 text-red-600 border border-red-200", label: "Não criado" },
  };
  const it = map[status] ?? map.ausente;
  return <span className={`inline-flex items-center rounded font-semibold ${pad} ${it.cls}`}>{it.label}</span>;
}

type Secao = "iso" | "planilha" | "word" | "extrato";

const SECOES: { id: Secao; label: string; icon: any }[] = [
  { id: "iso",      label: "Documentos ISO",     icon: FileText },
  { id: "planilha", label: "Template de Planilha", icon: FileSpreadsheet },
  { id: "word",     label: "Template de Word",    icon: FileText },
  { id: "extrato",  label: "Templates de Extrato", icon: Landmark },
];

// ─── Converte o modelo texto-plano do Contrato PJ em HTML para o editor ───────
// Cláusulas → <h3>, sub-itens numerados → indentados, valores/datas/contas → <strong>.
function plainTextModelToHtml(text: string): string {
  const FINANCIAL_RE = /(\[VALOR_MENSAL\]|\[VALOR_EXTENSO\]|\[VALOR_ADIANTAMENTO\]|\[VALOR_FECHAMENTO\]|\[DIA_ADIANTAMENTO\]|\[DIA_FECHAMENTO\]|\[PERCENTUAL_ADIANTAMENTO\]|\[PERCENTUAL_FECHAMENTO\]|\[DADOS_BANCARIOS_CONTRATADA\])/g;

  function wrapFinancial(s: string) { return s.replace(FINANCIAL_RE, "<strong>$1</strong>"); }
  function wrapPartes(s: string) { return s.replace(/\b(CONTRATANTE|CONTRATADA)\b/g, "<strong>$1</strong>"); }
  function proc(s: string) { return wrapFinancial(wrapPartes(s)); }

  const lines = text.split("\n");
  const out: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) { out.push("<p><br></p>"); continue; }
    if (/^_{4,}/.test(line)) continue; // linhas de assinatura — pula

    // Cabeçalho do documento em maiúsculas (título central)
    if (line === line.toUpperCase() && line.length > 20 && !/^\d/.test(line) && !/^\[/.test(line)) {
      out.push(`<h2 style="text-align:center">${proc(line)}</h2>`);
      continue;
    }

    // CLÁUSULA N: título
    if (/^CL[ÁA]USULA\s/i.test(line)) {
      out.push(`<h3>${proc(line)}</h3>`);
      continue;
    }

    // 1.1 ou 1.1.1 sub-itens numerados
    if (/^\d+\.\d/.test(line)) {
      out.push(`<p style="margin-left:24px">${proc(line)}</p>`);
      continue;
    }

    // a), b), c) ... itens alfabéticos
    if (/^[a-z]\)\s/.test(line)) {
      out.push(`<p style="margin-left:48px">${proc(line)}</p>`);
      continue;
    }

    // (I), (II) ... itens romanos
    if (/^\([IVX]+\)\s/.test(line)) {
      out.push(`<p style="margin-left:24px">${proc(line)}</p>`);
      continue;
    }

    // Parágrafo Único
    if (/^Par[áa]grafo\s[ÚU]nico/i.test(line)) {
      out.push(`<p style="margin-left:24px"><em><strong>Parágrafo Único</strong>${proc(line.replace(/^Par[áa]grafo\s[ÚU]nico\.?/i, ""))}</em></p>`);
      continue;
    }

    // CONSIDERANDO QUE / RESOLVEM
    if (/^(CONSIDERANDO|RESOLVEM)\b/i.test(line)) {
      out.push(`<p><strong>${proc(line)}</strong></p>`);
      continue;
    }

    // Identificação das partes (CONTRATANTE: / CONTRATADA:)
    if (/^CONTRATANTE:|^CONTRATADA:/i.test(line)) {
      out.push(`<p><strong>${proc(line)}</strong></p>`);
      continue;
    }

    // Parágrafo normal
    out.push(`<p>${proc(line)}</p>`);
  }

  return out.join("");
}
// ─────────────────────────────────────────────────────────────────────────────

export default function TemplatesDocsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "admin_master";
  const { selectedCompanyId } = useCompany();

  const [secaoAtiva, setSecaoAtiva] = useState<Secao>("iso");

  // string (não DocumentTemplateTipo): aceita também os tipos custom (custom_<slug>).
  const [tipoSelecionado, setTipoSelecionado] = useState<string>("contrato_experiencia");
  const [conteudoEditado, setConteudoEditado] = useState("");
  const [comentario, setComentario] = useState("");
  const [versaoVisualizada, setVersaoVisualizada] = useState<number | undefined>(undefined);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [buscaPlaceholder, setBuscaPlaceholder] = useState("");
  // Busca/filtro da lista de documentos (coluna esquerda)
  const [buscaDoc, setBuscaDoc] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>("todos");
  // Sugestões de melhoria devolvidas pela IA ao ler um PDF
  const [iaSugestoes, setIaSugestoes] = useState<string[]>([]);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── Ficha ISO (estado local, sincronizado com a linha do servidor) ──
  const [codigo, setCodigo] = useState("");
  const [dataVigencia, setDataVigencia] = useState("");
  const [proximaRevisao, setProximaRevisao] = useState("");
  const [elaboradoPorNome, setElaboradoPorNome] = useState("");

  // ── IA ──
  const [iaPainel, setIaPainel] = useState(false);
  const [iaInstrucoes, setIaInstrucoes] = useState("");

  // ── Novo Documento (Rev. 2751) — modal de criação via IA ──
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoTab, setNovoTab] = useState<"assunto" | "pdf">("assunto");
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoInstrucoes, setNovoInstrucoes] = useState("");
  const [novoConteudo, setNovoConteudo] = useState("");
  const [novoSugestoes, setNovoSugestoes] = useState<string[]>([]);
  const novoPdfRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const listAllQuery = trpc.systemDocumentTemplates.listAll.useQuery();
  const iaStatusQuery = trpc.systemDocumentTemplates.iaStatus.useQuery();
  const getQuery = trpc.systemDocumentTemplates.get.useQuery(
    { tipo: tipoSelecionado, versao: versaoVisualizada },
    { enabled: !!tipoSelecionado }
  );
  // Modelo padrão PJ (fallback com placeholders [PLACEHOLDER]) — só buscado quando contrato_pj está selecionado
  const modeloPjQuery = trpc.pj.modeloContrato.useQuery(
    { companyId: Number(selectedCompanyId) || 0 },
    { enabled: tipoSelecionado === "contrato_pj" && Number(selectedCompanyId) > 0 }
  );
  const versionsQuery = trpc.systemDocumentTemplates.listVersions.useQuery(
    { tipo: tipoSelecionado },
    { enabled: !!tipoSelecionado && mostrarHistorico }
  );

  const selRow = useMemo(
    () => (listAllQuery.data ?? []).find((r: any) => r.tipo === tipoSelecionado) as any,
    [listAllQuery.data, tipoSelecionado]
  );

  // meta resolvida: tipo fixo → catálogo; tipo custom → meta sintética
  // (placeholders comuns) usando o título da linha do servidor.
  const meta = useMemo(
    () => getDocMetaOrFallback(tipoSelecionado, selRow?.titulo),
    [tipoSelecionado, selRow]
  );
  const statusAtual: string = selRow?.status ?? "ausente";

  // Lista de documentos (coluna esquerda) com busca por título/código + filtro
  // por status ISO. Mantém DOCUMENT_TEMPLATES_META como base quando a query
  // ainda não carregou, garantindo os 7 tipos visíveis.
  const docsLista = useMemo(() => {
    const base: any[] = (listAllQuery.data ?? DOCUMENT_TEMPLATES_META) as any[];
    const q = buscaDoc.trim().toLowerCase();
    return base.filter((row: any) => {
      const st = row.status ?? "ausente";
      if (filtroStatus !== "todos" && st !== filtroStatus) return false;
      if (categoriaSelecionada !== "todos") {
        const cat = (row as any).categoria ?? "rh";
        if (cat !== categoriaSelecionada) return false;
      }
      if (!q) return true;
      const cod = (row.codigo ?? "").toString().toLowerCase();
      return row.titulo.toLowerCase().includes(q) || cod.includes(q);
    });
  }, [listAllQuery.data, buscaDoc, filtroStatus, categoriaSelecionada]);

  const STATUS_FILTROS: { value: string; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "vigente", label: "Vigente" },
    { value: "rascunho", label: "Rascunho" },
    { value: "obsoleto", label: "Obsoleto" },
    { value: "ausente", label: "Não criado" },
  ];

  // ── Único useEffect de conteúdo — sem race condition ────────────────────────
  // Aguarda ambas as queries (get + modeloPj) antes de setar o editor, para que
  // o modelo padrão nunca seja sobrescrito por um resultado vazio intermediário.
  useEffect(() => {
    // Aguarda a query principal terminar; para contrato_pj aguarda o modelo também
    if (getQuery.isLoading) return;
    if (tipoSelecionado === "contrato_pj" && modeloPjQuery.isLoading) return;

    const saved = getQuery.data?.conteudoHtml || "";
    if (saved) {
      // Conteúdo salvo: usa diretamente (ou converte se legado texto-plano)
      setConteudoEditado(saved.includes("<") ? saved : plainTextModelToHtml(saved));
    } else if (tipoSelecionado === "contrato_pj") {
      // Sem conteúdo salvo → pré-popula com o modelo padrão do servidor
      const modelo = modeloPjQuery.data?.modelo || "";
      setConteudoEditado(modelo ? plainTextModelToHtml(modelo) : "");
    } else {
      setConteudoEditado("");
    }
  }, [tipoSelecionado, getQuery.isLoading, getQuery.data, modeloPjQuery.isLoading, modeloPjQuery.data]);
  // ────────────────────────────────────────────────────────────────────────────

  // Quando muda o tipo, reseta versão/comentário/IA e todos os campos da ficha
  useEffect(() => {
    setVersaoVisualizada(undefined);
    setComentario("");
    setIaPainel(false);
    setIaInstrucoes("");
    setMostrarPreview(false);
    setIaSugestoes([]);
    setConteudoEditado("");
    setElaboradoPorNome("");
    setDataVigencia("");
    setProximaRevisao("");
    setCodigo("");
  }, [tipoSelecionado]);

  // Quando o selRow carrega (template existente) → sincroniza ficha ISO
  useEffect(() => {
    if (!selRow) return;
    setCodigo(selRow.codigo || "");
    setDataVigencia(selRow.dataVigencia || "");
    setProximaRevisao(selRow.proximaRevisao || "");
    setElaboradoPorNome(selRow.elaboradoPorNome || "");
  }, [selRow]);

  const invalidarTudo = () => {
    utils.systemDocumentTemplates.listAll.invalidate();
    utils.systemDocumentTemplates.get.invalidate({ tipo: tipoSelecionado });
    utils.systemDocumentTemplates.listVersions.invalidate({ tipo: tipoSelecionado });
  };

  const saveMut = trpc.systemDocumentTemplates.save.useMutation({
    onSuccess: (res) => {
      if ((res as any).semMudanca) {
        toast.success("Ficha ISO atualizada.");
      } else {
        toast.success(`Template salvo como Rev. ${res.versao}.`);
        setComentario("");
        setVersaoVisualizada(undefined);
      }
      invalidarTudo();
    },
    onError: (e) => toast.error(e.message || "Falha ao salvar template."),
  });

  const restoreMut = trpc.systemDocumentTemplates.restoreVersion.useMutation({
    onSuccess: (res) => {
      toast.success(`Versão restaurada como Rev. ${res.novaVersao}.`);
      setVersaoVisualizada(undefined);
      invalidarTudo();
    },
    onError: (e) => toast.error(e.message || "Falha ao restaurar versão."),
  });

  const aprovarMut = trpc.systemDocumentTemplates.aprovar.useMutation({
    onSuccess: () => { toast.success("Documento aprovado — agora está VIGENTE."); invalidarTudo(); },
    onError: (e) => toast.error(e.message || "Falha ao aprovar."),
  });
  const obsoletoMut = trpc.systemDocumentTemplates.marcarObsoleto.useMutation({
    onSuccess: () => { toast.success("Documento marcado como OBSOLETO."); invalidarTudo(); },
    onError: (e) => toast.error(e.message || "Falha ao marcar obsoleto."),
  });
  const rascunhoMut = trpc.systemDocumentTemplates.voltarParaRascunho.useMutation({
    onSuccess: () => { toast.success("Documento voltou para RASCUNHO."); invalidarTudo(); },
    onError: (e) => toast.error(e.message || "Falha ao reabrir."),
  });
  // Rev. 2754 — exclusão (soft-delete). Custom some de vez; fixo volta a "ausente".
  const excluirMut = trpc.systemDocumentTemplates.excluir.useMutation({
    onSuccess: (res) => {
      toast.success(res.isCustom
        ? "Documento excluído."
        : "Documento excluído. Ele pode ser recriado em \"Inicializar padrões\".");
      setTipoSelecionado(DOCUMENT_TEMPLATES_META[0].tipo);
      invalidarTudo();
    },
    onError: (e) => toast.error(e.message || "Falha ao excluir."),
  });
  const seedMut = trpc.systemDocumentTemplates.seedDefaults.useMutation({
    onSuccess: (res) => {
      toast.success(res.total > 0 ? `${res.total} documento(s) institucional(is) criado(s) como Vigente.` : "Todos os documentos já existem — nada a criar.");
      invalidarTudo();
    },
    onError: (e) => toast.error(e.message || "Falha ao inicializar padrões."),
  });

  const iaGerarMut = trpc.systemDocumentTemplates.iaGerarDoZero.useMutation({
    onSuccess: (res) => {
      setConteudoEditado(res.conteudoHtml);
      setMostrarPreview(false);
      setIaPainel(false);
      setIaSugestoes([]);
      toast.success("Rascunho gerado pela IA. Revise e salve a nova revisão.");
    },
    onError: (e) => toast.error(e.message || "Falha ao gerar com IA."),
  });
  const iaPdfMut = trpc.systemDocumentTemplates.iaLerPdfSugerir.useMutation({
    onSuccess: (res) => {
      setConteudoEditado(res.conteudoHtml);
      setMostrarPreview(false);
      setIaSugestoes((res as any).sugestoes ?? []);
      const nSug = ((res as any).sugestoes ?? []).length;
      toast.success(nSug > 0
        ? `Modelo extraído do PDF com ${nSug} sugestão(ões) de melhoria. Revise e salve.`
        : "Modelo extraído do PDF. Revise os placeholders e salve.");
    },
    onError: (e) => toast.error(e.message || "Falha ao ler o PDF."),
  });

  // ── Novo Documento (Rev. 2751): mutations dedicadas (populam o MODAL, não o editor) ──
  const novoGerarMut = trpc.systemDocumentTemplates.iaGerarDoZero.useMutation({
    onSuccess: (res) => { setNovoConteudo(res.conteudoHtml); setNovoSugestoes([]); toast.success("Texto gerado pela IA. Revise e crie o documento."); },
    onError: (e) => toast.error(e.message || "Falha ao gerar com IA."),
  });
  const novoPdfMut = trpc.systemDocumentTemplates.iaLerPdfSugerir.useMutation({
    onSuccess: (res) => {
      setNovoConteudo(res.conteudoHtml);
      setNovoSugestoes((res as any).sugestoes ?? []);
      toast.success("Modelo extraído do PDF. Revise e crie o documento.");
    },
    onError: (e) => toast.error(e.message || "Falha ao ler o PDF."),
  });
  const criarNovoMut = trpc.systemDocumentTemplates.criarNovo.useMutation({
    onSuccess: (res) => {
      toast.success(`Documento criado (${res.codigo}). Revise e aprove para deixar Vigente.`);
      setNovoOpen(false);
      setTipoSelecionado(res.tipo);
      setNovoTitulo(""); setNovoCodigo(""); setNovoInstrucoes(""); setNovoConteudo(""); setNovoSugestoes([]);
      utils.systemDocumentTemplates.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message || "Falha ao criar documento."),
  });

  // Rev. 2752 — Preview = documento institucional COMPLETO (cabeçalho/logo/faixa/
  // margens/assinaturas), idêntico à impressão. Renderizado em <iframe srcDoc>.
  const previewHtml = useMemo(
    () => buildFcPreviewHtml(conteudoEditado, meta, user?.name || "Sistema"),
    [conteudoEditado, meta, user]
  );

  // Placeholders agrupados + filtrados pela busca
  const placeholdersPorGrupo = useMemo(() => {
    const q = buscaPlaceholder.trim().toLowerCase();
    const map = new Map<string, PlaceholderDef[]>();
    meta.placeholders
      .filter(p => !q || p.rotulo.toLowerCase().includes(q) || p.chave.toLowerCase().includes(q))
      .forEach(p => {
        const arr = map.get(p.grupo) ?? [];
        arr.push(p);
        map.set(p.grupo, arr);
      });
    return Array.from(map.entries());
  }, [meta, buscaPlaceholder]);

  const insertPlaceholder = (chave: string) => {
    editorRef.current?.insertText(`{{${chave}}}`);
  };

  // ── Valores auto-computados para a ficha ISO ────────────────────────────────
  // Pré-preenchidos automaticamente; o usuário pode sobrescrever se quiser.
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);
  const effectiveElaboradoPor = elaboradoPorNome || user?.name || (user as any)?.username || "";
  const effectiveDataVigencia = dataVigencia || todayIso;
  const effectiveProximaRevisao = useMemo(() => {
    if (proximaRevisao) return proximaRevisao;
    const base = dataVigencia || todayIso;
    const d = new Date(base + "T00:00:00");
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  }, [proximaRevisao, dataVigencia, todayIso]);
  // ────────────────────────────────────────────────────────────────────────────

  const isoPayload = () => ({
    codigo: codigo || undefined,
    dataVigencia: effectiveDataVigencia || null,
    proximaRevisao: effectiveProximaRevisao || null,
    elaboradoPorNome: effectiveElaboradoPor || null,
  });

  // Lê o conteúdo do editor: editorRef é a fonte de verdade (o state pode
  // estar desatualizado por race-condition entre useEffects e re-renders).
  const getEditorContent = () =>
    editorRef.current?.getHTML() || conteudoEditado || "";

  const isEditorEmpty = (html: string) =>
    !html || html === "<p></p>" || html === "<p><br></p>" || html.trim() === "";

  const handleSalvar = () => {
    const html = getEditorContent();
    if (isEditorEmpty(html)) {
      toast.error("Conteúdo não pode ser vazio.");
      return;
    }
    saveMut.mutate({ tipo: tipoSelecionado, conteudoHtml: html, comentario: comentario || undefined, ...isoPayload() });
  };

  const handleRestaurar = (versao: number) => {
    if (!confirm(`Restaurar Rev. ${versao} como versão atual? Isso vai criar uma nova revisão (Rev. ${(getQuery.data?.template?.versaoAtual ?? 0) + 1}) idêntica à Rev. ${versao}.`)) return;
    restoreMut.mutate({ tipo: tipoSelecionado, versao });
  };

  const handleAprovar = () => {
    if (!confirm(`Aprovar "${meta.titulo}" e torná-lo VIGENTE? Os módulos passarão a consumir este texto.`)) return;
    const doAprovar = () => aprovarMut.mutate({ tipo: tipoSelecionado, dataVigencia: effectiveDataVigencia || null, proximaRevisao: effectiveProximaRevisao || null });
    const html = getEditorContent();
    if (isEditorEmpty(html)) {
      toast.error("Adicione conteúdo ao template antes de aprovar.");
      return;
    }
    // Sempre salva o conteúdo do editor antes de aprovar (mesmo que o template já exista)
    saveMut.mutate(
      { tipo: tipoSelecionado, conteudoHtml: html, comentario: comentario || undefined, ...isoPayload() },
      { onSuccess: doAprovar },
    );
  };

  const handlePdfSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { toast.error("Selecione um arquivo PDF."); e.target.value = ""; return; }
    if (file.size > 6 * 1024 * 1024) { toast.error("PDF muito grande (máx. 6MB)."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const b64 = dataUrl.includes(",") ? dataUrl.split(",").pop()! : dataUrl;
      iaPdfMut.mutate({ tipo: tipoSelecionado, pdfBase64: b64 });
    };
    reader.onerror = () => toast.error("Não consegui ler o arquivo.");
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Novo Documento (Rev. 2751) ──
  const abrirNovo = () => {
    setNovoTab(iaSt?.lerPdf ? "pdf" : "assunto");
    setNovoTitulo(""); setNovoCodigo(""); setNovoInstrucoes(""); setNovoConteudo(""); setNovoSugestoes([]);
    setNovoOpen(true);
  };

  const handleNovoGerar = () => {
    if (novoInstrucoes.trim().length < 5) { toast.error("Descreva o que o documento deve conter."); return; }
    novoGerarMut.mutate({ tituloDoc: novoTitulo || undefined, instrucoes: novoInstrucoes });
  };

  const handleNovoPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { toast.error("Selecione um arquivo PDF."); e.target.value = ""; return; }
    if (file.size > 6 * 1024 * 1024) { toast.error("PDF muito grande (máx. 6MB)."); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const b64 = dataUrl.includes(",") ? dataUrl.split(",").pop()! : dataUrl;
      novoPdfMut.mutate({ tituloDoc: novoTitulo || undefined, pdfBase64: b64 });
    };
    reader.onerror = () => toast.error("Não consegui ler o arquivo.");
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Rev. 2752 — Abre o documento institucional COMPLETO numa janela isolada e
  // dispara a impressão (réplica exata do que será impresso/lido).
  const handleImprimir = () => {
    const html = buildFcPreviewHtml(conteudoEditado, meta, user?.name || "Sistema");
    if (!html) { toast.error("Sem conteúdo para imprimir."); return; }
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita pop-ups para imprimir o documento."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.addEventListener("load", () => setTimeout(() => { try { w.print(); } catch { /* usuário imprime manualmente */ } }, 350));
  };

  const handleCriarNovo = () => {
    if (novoTitulo.trim().length < 3) { toast.error("Informe um título (mín. 3 caracteres)."); return; }
    if (!novoConteudo || novoConteudo.replace(/<[^>]*>/g, "").trim().length < 5) {
      toast.error("Gere ou escreva o conteúdo do documento antes de criar.");
      return;
    }
    criarNovoMut.mutate({ titulo: novoTitulo.trim(), codigo: novoCodigo || undefined, conteudoHtml: novoConteudo });
  };

  // Rev. 2752 — Preview do modal "Novo Documento" = documento institucional
  // COMPLETO (mesmo wrapper da impressão), renderizado em <iframe srcDoc>.
  const novoPreviewHtml = useMemo(
    () => buildFcPreviewHtml(novoConteudo, getDocMetaOrFallback("", novoTitulo), user?.name || "Sistema"),
    [novoConteudo, novoTitulo, user]
  );

  const visualizandoVersaoAntiga = versaoVisualizada != null && getQuery.data?.template?.versaoAtual && versaoVisualizada !== getQuery.data.template.versaoAtual;
  const iaSt = iaStatusQuery.data;
  const algumPendente = saveMut.isPending || aprovarMut.isPending || obsoletoMut.isPending || rascunhoMut.isPending;

  if (!isAdmin) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-amber-800">
        <AlertTriangle className="w-6 h-6 mb-2" />
        Apenas administradores podem gerenciar templates de documentos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Seletor de seção ─────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap border-b pb-3">
        {SECOES.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSecaoAtiva(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                secaoAtiva === s.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ── Seção: Documentos ISO ────────────────────────────────────── */}
      {secaoAtiva === "iso" && (<>
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-start gap-3">
          <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-800">Central de Documentos Institucionais (ISO)</h2>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={abrirNovo}
                >
                  <FilePlus2 className="w-4 h-4 mr-1" /> Novo Documento
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => { if (confirm("Criar os documentos institucionais que ainda não existem, já como Rev. 1 Vigente?")) seedMut.mutate({ ativarVigente: true }); }}
                  disabled={seedMut.isPending}
                >
                  {seedMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FilePlus2 className="w-4 h-4 mr-1" />}
                  Inicializar padrões
                </Button>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Fonte oficial dos documentos FC. Edite o texto, controle a revisão (código, vigência, aprovação) e aprove para deixar <strong>Vigente</strong> — os módulos passam a consumir o documento aprovado.
              Use placeholders como <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{`{{empNome}}`}</code> para campos dinâmicos.
            </p>
          </div>
        </div>
      </div>

      {/* SELETOR HORIZONTAL NO TOPO — substitui a antiga coluna lateral de documentos */}
      <div className="bg-white border rounded-lg p-3">
        {/* Abas de categoria */}
        <div className="flex gap-1 flex-wrap mb-3 pb-2.5 border-b border-gray-100">
          <button
            onClick={() => setCategoriaSelecionada("todos")}
            className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${categoriaSelecionada === "todos" ? "bg-slate-700 text-white border-slate-700" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
          >
            Todos
          </button>
          {CATEGORIAS_DOCS.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoriaSelecionada(cat.id)}
              className={`text-[11px] px-2.5 py-1 rounded border font-medium transition-colors ${categoriaSelecionada === cat.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <div className="text-xs font-semibold text-gray-600 uppercase mr-1">Documentos</div>
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={buscaDoc}
              onChange={e => setBuscaDoc(e.target.value)}
              placeholder="Buscar por nome ou código..."
              className="h-8 text-sm pl-7"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTROS.map(f => (
              <button
                key={f.value}
                onClick={() => setFiltroStatus(f.value)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${filtroStatus === f.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {docsLista.length === 0 ? (
          <div className="px-1 py-3 text-xs text-gray-400 italic">Nenhum documento encontrado.</div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {docsLista.map((row: any) => {
              const Icon = ICON_MAP[row.icone] || FileText;
              const isAtivo = row.tipo === tipoSelecionado;
              const versaoAtual = (row as any).versaoAtual ?? 0;
              const st = (row as any).status ?? "ausente";
              return (
                <button
                  key={row.tipo}
                  onClick={() => setTipoSelecionado(row.tipo as DocumentTemplateTipo)}
                  className={`text-left rounded-lg border px-3 py-2 flex items-center gap-2.5 transition-colors min-w-[190px] flex-1 sm:flex-none ${isAtivo ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500" : "bg-white border-gray-200 hover:bg-gray-50"}`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isAtivo ? "text-blue-700" : "text-gray-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isAtivo ? "text-blue-900" : "text-gray-800"}`}>{row.titulo}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusBadge status={st} size="xs" />
                      <span className="text-[10px] text-gray-400">{st === "ausente" ? "—" : `Rev. ${versaoAtual}`}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* PRINCIPAL — Ficha ISO + Editor (largo) */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {/* Ficha ISO */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-800">{meta.titulo}</h3>
                <StatusBadge status={statusAtual} />
              </div>
              <div className="flex items-center gap-2">
                {statusAtual !== "vigente" && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleAprovar}
                    disabled={aprovarMut.isPending || saveMut.isPending || (!conteudoEditado || conteudoEditado === "<p></p>")}
                    title={!conteudoEditado || conteudoEditado === "<p></p>" ? "Adicione conteúdo para aprovar" : "Salvar e aprovar como vigente"}
                  >
                    {(aprovarMut.isPending || saveMut.isPending) ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-1" />}
                    Aprovar (Vigente)
                  </Button>
                )}
                {statusAtual === "vigente" && (
                  <Button size="sm" variant="outline" onClick={() => rascunhoMut.mutate({ tipo: tipoSelecionado })} disabled={rascunhoMut.isPending}>
                    <Undo2 className="w-4 h-4 mr-1" /> Reabrir
                  </Button>
                )}
                {statusAtual !== "obsoleto" && selRow?.existe && (
                  <Button size="sm" variant="outline" className="text-gray-600" onClick={() => { if (confirm("Marcar como obsoleto? Os módulos deixarão de consumir este documento.")) obsoletoMut.mutate({ tipo: tipoSelecionado }); }} disabled={obsoletoMut.isPending}>
                    <XCircle className="w-4 h-4 mr-1" /> Obsoleto
                  </Button>
                )}
                {selRow?.existe && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      const ehCustom = isCustomTipo(tipoSelecionado);
                      const msg = ehCustom
                        ? `Excluir o documento "${meta.titulo}"? Ele sairá da Central e não poderá mais ser recuperado por aqui.`
                        : `Excluir o documento "${meta.titulo}"? Os módulos deixarão de consumi-lo. Por ser um documento institucional fixo, você pode recriá-lo depois em "Inicializar padrões".`;
                      if (confirm(msg)) excluirMut.mutate({ tipo: tipoSelecionado });
                    }}
                    disabled={excluirMut.isPending}
                  >
                    {excluirMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                    Excluir
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div className="min-w-0">
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Código ISO</label>
                <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="FC-RH-001" className="h-8 text-sm font-mono w-full" />
              </div>
              <div className="min-w-0">
                <label className="text-[11px] font-medium text-gray-500 block mb-1">
                  Elaborado por
                  <span className="ml-1 text-[10px] text-blue-500 font-normal">● auto</span>
                </label>
                <Input
                  value={effectiveElaboradoPor}
                  onChange={e => setElaboradoPorNome(e.target.value)}
                  placeholder="Nome"
                  className="h-8 text-sm w-full bg-blue-50/40"
                />
              </div>
              <div className="min-w-0">
                <label className="text-[11px] font-medium text-gray-500 block mb-1">
                  Data de vigência
                  <span className="ml-1 text-[10px] text-blue-500 font-normal">● auto</span>
                </label>
                <Input type="date" value={effectiveDataVigencia} onChange={e => setDataVigencia(e.target.value)} className="h-8 text-sm w-full bg-blue-50/40" />
              </div>
              <div className="min-w-0">
                <label className="text-[11px] font-medium text-gray-500 block mb-1">
                  Próxima revisão
                  <span className="ml-1 text-[10px] text-blue-500 font-normal">● auto</span>
                </label>
                <Input type="date" value={effectiveProximaRevisao} onChange={e => setProximaRevisao(e.target.value)} className="h-8 text-sm w-full bg-blue-50/40" />
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-x-4 gap-y-0.5">
              <span>Aprovado por: <strong>{selRow?.aprovadoPorNome || "—"}</strong></span>
              <span>Aprovado em: <strong>{formatDataHora(selRow?.aprovadoEm)}</strong></span>
              <span>Vigência: <strong>{formatData(selRow?.dataVigencia)}</strong></span>
              <span>Próx. revisão: <strong>{formatData(selRow?.proximaRevisao)}</strong></span>
            </div>
          </div>

          {/* Editor */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setMostrarHistorico(v => !v)}>
                  <History className="w-4 h-4 mr-1" /> Histórico
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMostrarPreview(v => !v)}>
                  <Eye className="w-4 h-4 mr-1" /> {mostrarPreview ? "Editor" : "Preview"}
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={handleImprimir}
                  disabled={!conteudoEditado || conteudoEditado === "<p></p>"}
                  title="Abrir o documento institucional completo (cabeçalho, logo, faixa, margens) para impressão"
                >
                  <Printer className="w-4 h-4 mr-1" /> Imprimir
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  className="border-violet-300 text-violet-700 hover:bg-violet-50"
                  onClick={() => setIaPainel(v => !v)}
                  disabled={!iaSt?.gerarDoZero}
                  title={iaSt?.gerarDoZero ? "Gerar um rascunho do documento com IA" : "Nenhuma IA configurada"}
                >
                  <Sparkles className="w-4 h-4 mr-1" /> Gerar com IA
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="border-violet-300 text-violet-700 hover:bg-violet-50"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={!iaSt?.lerPdf || iaPdfMut.isPending}
                  title={iaSt?.lerPdf ? "Enviar um PDF para a IA extrair o modelo" : "Leitura de PDF exige IA Anthropic"}
                >
                  {iaPdfMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Ler PDF
                </Button>
                <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfSelecionado} />
              </div>
            </div>

            {iaPainel && (
              <div className="mb-3 p-3 border border-violet-200 bg-violet-50/60 rounded-lg">
                <label className="text-xs font-semibold text-violet-800 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Descreva o documento para a IA gerar</label>
                <Textarea
                  value={iaInstrucoes}
                  onChange={e => setIaInstrucoes(e.target.value)}
                  placeholder="Ex: Carta de apresentação para abertura de conta salário, formal, citando os dados do colaborador e da empresa..."
                  className="mt-1 text-sm"
                  rows={3}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-violet-700">A IA usa os placeholders catalogados deste tipo. Revise antes de salvar.</span>
                  <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => iaGerarMut.mutate({ tipo: tipoSelecionado, instrucoes: iaInstrucoes })} disabled={iaGerarMut.isPending || iaInstrucoes.trim().length < 5}>
                    {iaGerarMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Gerar rascunho
                  </Button>
                </div>
              </div>
            )}

            <div className="mb-3">
              <IaProgressBar
                active={iaGerarMut.isPending || iaPdfMut.isPending}
                label={iaPdfMut.isPending ? "Lendo o PDF com IA… (até ~1 min)" : "Gerando o rascunho com IA… (até ~1 min)"}
              />
            </div>

            {iaSugestoes.length > 0 && (
              <div className="mb-3 p-3 border border-violet-200 bg-violet-50/60 rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-violet-800 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Sugestões de melhoria da IA ({iaSugestoes.length})
                  </span>
                  <button
                    onClick={() => setIaSugestoes([])}
                    className="text-[11px] text-violet-700 hover:underline flex items-center gap-0.5"
                    title="Dispensar sugestões"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Dispensar
                  </button>
                </div>
                <p className="text-[11px] text-violet-700 mb-2">
                  Revise as sugestões abaixo. O modelo extraído já está no editor — ajuste o que achar pertinente antes de salvar.
                </p>
                <ul className="space-y-1.5">
                  {iaSugestoes.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-700 bg-white border border-violet-100 rounded px-2 py-1.5">
                      <Info className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                      <span className="flex-1">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {visualizandoVersaoAntiga && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Visualizando <strong>Rev. {versaoVisualizada}</strong> (somente leitura). Atual é Rev. {getQuery.data?.template?.versaoAtual}.
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => setVersaoVisualizada(undefined)}>Voltar à atual</Button>
                  <Button size="sm" onClick={() => handleRestaurar(versaoVisualizada!)} disabled={restoreMut.isPending}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restaurar esta
                  </Button>
                </div>
              </div>
            )}

            {getQuery.isLoading ? (
              <div className="h-96 flex items-center justify-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
              </div>
            ) : mostrarPreview ? (
              <div className="border rounded-lg bg-gray-100 p-3">
                <iframe
                  title="Pré-visualização do documento institucional"
                  srcDoc={previewHtml || "<p style='color:#9ca3af;font-family:sans-serif;padding:24px'>Sem conteúdo.</p>"}
                  sandbox="allow-same-origin"
                  className="w-full h-[760px] bg-white rounded shadow-sm border-0"
                />
              </div>
            ) : (
              <RichTextEditor
                ref={editorRef}
                value={conteudoEditado}
                onChange={setConteudoEditado}
                readOnly={!!visualizandoVersaoAntiga || statusAtual === "vigente"}
                minHeight={560}
                readable
              />
            )}

            {/* Aviso de bloqueio quando vigente */}
            {statusAtual === "vigente" && !visualizandoVersaoAntiga && !mostrarPreview && (
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                <span>
                  <strong>Documento Vigente — somente leitura.</strong> Para editar, clique em <strong>Reabrir</strong> (status volta para Rascunho), faça os ajustes, salve como nova revisão e aprove novamente.
                </span>
              </div>
            )}

            {!visualizandoVersaoAntiga && !mostrarPreview && statusAtual !== "vigente" && (
              <div className="mt-3 space-y-2">
                <label className="text-xs font-medium text-gray-700">Comentário desta revisão (opcional)</label>
                <Input
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ex: Ajuste da cláusula 3ª conforme parecer jurídico"
                  maxLength={500}
                />
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    {getQuery.data?.template ? (
                      <>Rev. atual: <strong>{getQuery.data.template.versaoAtual}</strong> · Atualizado em {formatDataHora(getQuery.data.template.updatedAt)} por {getQuery.data.template.atualizadoPorNome || "—"}</>
                    ) : (
                      <span className="italic">Template ainda não foi criado — ao salvar, será criada a Rev. 1.</span>
                    )}
                  </div>
                  <Button onClick={handleSalvar} disabled={algumPendente}>
                    {saveMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    Salvar Nova Revisão
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA LATERAL — Placeholders + Histórico (estreita) */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> Placeholders disponíveis
            </div>
            <div className="p-2">
              <Input
                value={buscaPlaceholder}
                onChange={e => setBuscaPlaceholder(e.target.value)}
                placeholder="Buscar campo..."
                className="h-8 text-sm mb-2"
              />
              <div className="max-h-[440px] overflow-y-auto">
                {placeholdersPorGrupo.length === 0 ? (
                  <div className="text-xs text-gray-400 italic px-1 py-2">Nenhum campo encontrado.</div>
                ) : placeholdersPorGrupo.map(([grupo, items]) => (
                  <div key={grupo} className="mb-3">
                    <div className="text-[10px] font-bold text-gray-500 uppercase mb-1 px-1">{grupo}</div>
                    <div className="space-y-1">
                      {items.map(ph => (
                        <button
                          key={ph.chave}
                          onClick={() => insertPlaceholder(ph.chave)}
                          title={`Inserir {{${ph.chave}}} no cursor — Ex: ${ph.exemplo}`}
                          disabled={!!visualizandoVersaoAntiga || mostrarPreview}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
                        >
                          <div className="text-xs font-medium text-gray-800 group-hover:text-blue-700 truncate">{ph.rotulo}</div>
                          <div className="text-[10px] text-gray-500 font-mono truncate">{`{{${ph.chave}}}`}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {mostrarHistorico && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase flex items-center gap-1">
                <History className="w-3.5 h-3.5" /> Histórico de revisões
              </div>
              <div className="max-h-[360px] overflow-y-auto divide-y">
                {versionsQuery.isLoading ? (
                  <div className="p-3 text-xs text-gray-400">Carregando...</div>
                ) : (versionsQuery.data ?? []).length === 0 ? (
                  <div className="p-3 text-xs text-gray-400 italic">Sem versões salvas.</div>
                ) : (
                  (versionsQuery.data ?? []).map((v: any) => (
                    <button
                      key={v.id}
                      onClick={() => setVersaoVisualizada(v.versao)}
                      className={`w-full text-left p-2.5 hover:bg-gray-50 transition-colors ${versaoVisualizada === v.versao ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-800">Rev. {v.versao}</span>
                        {v.ehAtual && <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">ATUAL</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{formatDataHora(v.createdAt)} · {v.criadoPorNome || "—"}</div>
                      {v.comentario && <div className="text-[11px] text-gray-600 mt-1 italic line-clamp-2">{v.comentario}</div>}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: Novo Documento (Rev. 2751) — criar doc custom via IA ── */}
      {novoOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget && !criarNovoMut.isPending) setNovoOpen(false); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <FilePlus2 className="w-5 h-5 text-blue-600" /> Novo Documento Institucional
              </h3>
              <button onClick={() => { if (!criarNovoMut.isPending) setNovoOpen(false); }} className="text-gray-400 hover:text-gray-600"><XCircle className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-medium text-gray-600">Título do documento *</label>
                  <Input value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} placeholder="Ex: Carta de Apresentação para Conta Salário" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-600">Código ISO (opcional)</label>
                  <Input value={novoCodigo} onChange={e => setNovoCodigo(e.target.value)} placeholder="auto (FC-DOC-NNN)" className="h-9 text-sm font-mono" />
                </div>
              </div>

              {/* Abas de fluxo */}
              <div className="flex gap-1 border-b">
                <button
                  onClick={() => setNovoTab("pdf")}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${novoTab === "pdf" ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  <Upload className="w-4 h-4 inline mr-1" /> Subir modelo (PDF)
                </button>
                <button
                  onClick={() => setNovoTab("assunto")}
                  className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${novoTab === "assunto" ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  <Sparkles className="w-4 h-4 inline mr-1" /> Gerar do assunto
                </button>
              </div>

              {novoTab === "pdf" ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">Envie um PDF modelo. A IA lê o documento, reproduz o texto como corpo HTML e troca os dados específicos por placeholders.</p>
                  <Button
                    variant="outline" size="sm"
                    className="border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={() => novoPdfRef.current?.click()}
                    disabled={!iaSt?.lerPdf || novoPdfMut.isPending}
                    title={iaSt?.lerPdf ? "Selecionar PDF" : "Leitura de PDF exige IA Anthropic"}
                  >
                    {novoPdfMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Selecionar PDF (máx. 6MB)
                  </Button>
                  {!iaSt?.lerPdf && <span className="text-[11px] text-amber-600 ml-2">Leitura de PDF exige IA Anthropic configurada.</span>}
                  <input ref={novoPdfRef} type="file" accept="application/pdf" className="hidden" onChange={handleNovoPdf} />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-violet-800 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Descreva o documento para a IA gerar</label>
                  <Textarea
                    value={novoInstrucoes}
                    onChange={e => setNovoInstrucoes(e.target.value)}
                    placeholder="Ex: Carta formal de apresentação para abertura de conta salário, citando os dados do colaborador e da empresa..."
                    className="text-sm"
                    rows={3}
                  />
                  <Button
                    size="sm" className="bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={handleNovoGerar}
                    disabled={!iaSt?.gerarDoZero || novoGerarMut.isPending || novoInstrucoes.trim().length < 5}
                    title={iaSt?.gerarDoZero ? "Gerar texto com IA" : "Nenhuma IA configurada"}
                  >
                    {novoGerarMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Gerar texto
                  </Button>
                  {!iaSt?.gerarDoZero && <span className="text-[11px] text-amber-600 ml-2">Nenhuma IA configurada.</span>}
                </div>
              )}

              <IaProgressBar
                active={novoGerarMut.isPending || novoPdfMut.isPending}
                label={novoPdfMut.isPending ? "Lendo o PDF com IA… (até ~1 min)" : "Gerando o texto com IA… (até ~1 min)"}
              />

              {novoSugestoes.length > 0 && (
                <div className="p-3 border border-violet-200 bg-violet-50/60 rounded-lg">
                  <span className="text-xs font-semibold text-violet-800 flex items-center gap-1 mb-1.5"><Sparkles className="w-3.5 h-3.5" /> Sugestões da IA ({novoSugestoes.length})</span>
                  <ul className="space-y-1.5">
                    {novoSugestoes.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700 bg-white border border-violet-100 rounded px-2 py-1.5">
                        <Info className="w-3.5 h-3.5 text-violet-500 flex-shrink-0 mt-0.5" /><span className="flex-1">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {novoConteudo && (
                <div>
                  <div className="text-[11px] font-medium text-gray-600 mb-1 flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Pré-visualização fiel à impressão (cabeçalho, logo, faixa e margens · placeholders com dados de exemplo)</div>
                  <div className="border rounded-lg bg-gray-100 p-2">
                    <iframe
                      title="Pré-visualização do novo documento"
                      srcDoc={novoPreviewHtml}
                      sandbox="allow-same-origin"
                      className="w-full h-[46vh] bg-white rounded shadow-sm border-0"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Após criar, o documento abre no editor para você ajustar e aprovar (ficará como Rascunho).</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
              <Button variant="outline" size="sm" onClick={() => setNovoOpen(false)} disabled={criarNovoMut.isPending}>Cancelar</Button>
              <Button
                size="sm" className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleCriarNovo}
                disabled={criarNovoMut.isPending || novoTitulo.trim().length < 3 || !novoConteudo}
              >
                {criarNovoMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FilePlus2 className="w-4 h-4 mr-1" />} Criar documento
              </Button>
            </div>
          </div>
        </div>
      )}
      </>)}

      {/* ── Seção: Template de Planilha ──────────────────────────────── */}
      {secaoAtiva === "planilha" && (
        <XlsxTemplateTab userName={user?.name || user?.username || ""} />
      )}

      {/* ── Seção: Template de Word ──────────────────────────────────── */}
      {secaoAtiva === "word" && (
        <DocxTemplateTab userName={user?.name || user?.username || ""} />
      )}

      {/* ── Seção: Templates de Extrato ──────────────────────────────── */}
      {secaoAtiva === "extrato" && (
        <ExtratoTemplateTab />
      )}
    </div>
  );
}
