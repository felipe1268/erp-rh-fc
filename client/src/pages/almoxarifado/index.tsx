import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Search, Plus, Pencil, Package, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, Loader2, History, X, BarChart2, Boxes,
  LayoutGrid, List, Camera, Trash2, ImageOff, Barcode,
  Wrench, ClipboardCheck, User, CheckCircle2, XCircle, ChevronRight, ChevronLeft, ChevronDown,
  Building2, HardHat, Sparkles, ScanLine, ShoppingCart, ArrowLeftRight, Truck,
  CheckSquare, Square, Globe, Check, Tag, Layers, CalendarPlus, RefreshCw,
} from "lucide-react";
import SmartEntry from "./SmartEntry";
import { formatDateTime } from "@/lib/dateUtils";
import AlertasAlmoxarifado from "./AlertasAlmoxarifado";
import { inferirCategoria, CATEGORIA_KEYWORDS } from "./categoriaUtils";
import { ModalConfirmacaoAuditoria } from "@/components/almoxarifado/ModalConfirmacaoAuditoria";
import { ModalVincularEquipamento } from "@/components/almoxarifado/ModalVincularEquipamento";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";


const EMPTY_ITEM = {
  nome: "", unidade: "un", categoria: "", codigoInterno: "",
  quantidadeAtual: "", quantidadeMinima: "", observacoes: "", especificacao: "", fotoUrl: "",
  valorUnitario: "",
  origem: "proprio" as "proprio" | "alugado",
  fornecedorLocacao: "", dataInicioLocacao: "", dataVencimentoLocacao: "",
  valorLocacaoMensal: "", diasAlertaLocacao: "7", observacoesLocacao: "",
};
const parseNum = (v: string) => parseFloat(String(v).replace(",", ".")) || 0;
// Normaliza data pra <input type="date">: aceita yyyy-MM-dd, converte dd/MM/yyyy, descarta resto.
function normalizarDataInput(s: any): string {
  if (!s || typeof s !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  return "";
}
const EMPTY_MOV = {
  tipo: "entrada" as "entrada" | "saida" | "ajuste",
  quantidade: 0, obraId: 0, motivo: "", observacoes: "",
};

function n(v: any) { return parseFloat(v ?? "0") || 0; }
// Rev. 4012 — exibição de quantidade em pt-BR: remove zeros decimais espúrios
// (numeric(14,3) do banco chega como "37.0000") e aplica separador de milhar
// ("1.000" em vez de "1000"). Usar SÓ em pontos de EXIBIÇÃO, nunca em inputs/estado editável.
const qtdFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
function fmtQtd(v: any) { return qtdFmt.format(n(v)); }
function norm(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-\/\[\]]/g, "").toLowerCase().trim(); }

/**
 * Rev. 2441 — Combobox de categoria com filtro on-type.
 * - Digita pra filtrar a lista (busca por substring sem acento).
 * - Clique no item seleciona; Enter no input aceita o 1º match.
 * - `allowFree=true` (default) permite digitar categoria nova; quando false
 *   (modais em lote), só aceita item da lista.
 */
function CategoriaCombobox({
  value, onChange, opcoes, disabled, placeholder, allowFree = true, autoFocus = false,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  opcoes: string[];
  disabled?: boolean;
  placeholder?: string;
  allowFree?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string>(value || "");
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setQuery(value || ""); }, [value]);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!allowFree && query !== value) setQuery(value || "");
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, allowFree, query, value]);
  const filtradas = useMemo(() => {
    const q = norm(query);
    if (!q) return opcoes;
    return opcoes.filter(o => norm(o).includes(q));
  }, [opcoes, query]);
  const exata = useMemo(() => opcoes.find(o => norm(o) === norm(query)), [opcoes, query]);
  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "Digite para buscar…"}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (allowFree) onChange(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const pick = exata ?? filtradas[0];
            if (pick) { onChange(pick); setQuery(pick); setOpen(false); }
            else if (allowFree) { onChange(query); setOpen(false); }
          } else if (e.key === "Escape") { setOpen(false); }
        }}
        className="w-full h-11 px-3 pr-9 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none disabled:bg-gray-50"
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
        aria-label="Abrir lista"
      >
        <ChevronRight className={`h-4 w-4 transition ${open ? "rotate-90" : "rotate-90"}`} style={{ transform: open ? "rotate(270deg)" : "rotate(90deg)" }} />
      </button>
      {open && filtradas.length > 0 && (
        <div className="absolute z-[200] mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {filtradas.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setQuery(o); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 ${o === value ? "bg-emerald-50 font-semibold text-emerald-700" : "text-gray-700"}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {open && filtradas.length === 0 && (
        <div className="absolute z-[200] mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-xs text-gray-500">
          {allowFree
            ? <>Nenhuma encontrada — pressione <kbd className="px-1 bg-gray-100 rounded text-[10px] font-mono">Enter</kbd> para usar "<span className="font-medium text-gray-700">{query}</span>" como categoria nova.</>
            : <>Nenhuma categoria encontrada.</>}
        </div>
      )}
    </div>
  );
}

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
  const companyId = typeof selectedCompany?.id === 'number' ? selectedCompany.id : parseInt(String(selectedCompany?.id)) || 0;
  const [location, setLocation] = useLocation();

  // Rev. 2377 — Busca de foto na web (DDG Images) pros itens do Almoxarifado
  // que ainda não têm foto. Mesma UX da Rev. 2366 (Equipamentos Locados):
  //   (a) botão hero "Buscar fotos da web" → loop por TODOS os nomes sem foto
  //   (b) botão por card no placeholder "Adicionar foto" → 1 nome de cada vez
  const [buscandoFotoNomes, setBuscandoFotoNomes] = useState<Set<string>>(new Set());
  const [batchFotoWeb, setBatchFotoWeb] = useState<null | { atual: number; total: number; nomeAtual: string; ok: number; falhas: number; itensAtualizados: number }>(null);
  const batchFotoWebRef = useRef<{ cancelar: boolean }>({ cancelar: false });
  const buscarFotoWebMut = trpc.compras.buscarFotoWebPorNome.useMutation();
  // Rev. 2378/2379 — Modais customizados de confirmação (substituem window.confirm
  // que no Safari iPad mostrava a URL feia do Replit como título de 3 linhas).
  const [confirmBuscaFotos, setConfirmBuscaFotos] = useState<null | { nomes: string[] }>(null);
  const [confirmIAPrecos, setConfirmIAPrecos] = useState<null | { escopo: "empresa" | "obra"; qtd: number }>(null);
  // Rev. 2388 — Modal de auditoria (senha + justificativa) p/ ações sensíveis:
  // excluir item, excluir unidade e alterar quantidade manualmente. Cada caller
  // configura: título, subtítulo, descrição e a função `executar` que recebe
  // {senha, justificativa} e dispara a mutation correspondente. `carregando`
  // sinaliza pra travar UI durante o submit.
  const [modalAuditoria, setModalAuditoria] = useState<null | {
    tipo: "excluir_item" | "excluir_unidade" | "alterar_qtd";
    titulo: string;
    subtitulo?: string;
    descricao: React.ReactNode;
    textoBotao: string;
    executar: (p: { senha?: string; justificativa: string }) => void;
    carregando?: boolean;
    /** Rev. 4536 — progresso 0-100 do lote (mostrado no botão do modal) */
    progresso?: number | null;
    erro?: string | null;
  }>(null);
  // Rev. 2388 — Auditoria: log + tela de validação por admin.
  const [modalAuditoriaList, setModalAuditoriaList] = useState(false);
  // Rev. 2426 — Deep-link `/almoxarifado?auditoria=1` (banner global no
  // DashboardLayout) abre o modal de validação automaticamente.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("auditoria") === "1") {
      setModalAuditoriaList(true);
      sp.delete("auditoria");
      const newSearch = sp.toString();
      window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
    }
  }, []);
  const [auditoriaFiltroStatus, setAuditoriaFiltroStatus] = useState<"pendente" | "validado" | "rejeitado" | "todos">("pendente");
  const me = trpc.auth.me.useQuery();
  // Rev. 2400 — Toggle global por empresa (senha + justificativa).
  const auditCfgQ = trpc.compras.getAuditoriaConfig.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const cfgExigeSenha = auditCfgQ.data?.exigeSenha ?? true;
  const cfgExigeJustificativa = auditCfgQ.data?.exigeJustificativa ?? true;
  const requerSenha = !!(me.data as any)?.hasLocalPassword && cfgExigeSenha;
  const requerJustificativa = cfgExigeJustificativa;
  const meRole: string = (me.data as any)?.role ?? "";
  const isAdmin = meRole === "admin" || meRole === "admin_master";
  const pendenciasCount = trpc.compras.auditoriaPendenciasCount.useQuery(
    { companyId },
    { enabled: !!companyId && isAdmin, refetchInterval: 30000 }
  );
  const auditoriaQuery = trpc.compras.auditoriaListar.useQuery(
    { companyId, status: auditoriaFiltroStatus, limite: 200 },
    { enabled: !!companyId && modalAuditoriaList }
  );
  const validarAuditoriaMut = trpc.compras.auditoriaValidar.useMutation({
    onSuccess: () => { auditoriaQuery.refetch(); pendenciasCount.refetch(); toast.success("Registro validado."); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2381 — Modal de rebusca de foto com termo customizado (user ajuda a IA)
  const [rebuscarFoto, setRebuscarFoto] = useState<null | { nome: string; termo: string; previewUrl: string | null; buscando: boolean; aplicando: boolean; erro: string | null }>(null);
  // Rev. 2382 — Multi-seleção de itens (alterar categoria em lote / unificar duplicatas)
  // Rev. 4535 — seleção múltipla sempre ativa (checkbox nos cards); sem modo dedicado.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  // Rev. 2393 — Drag-to-select (lasso/rubber-band) na grade de cards. Ativa só em
  // Rev. 4535: só com MOUSE (desktop). Origem = snapshot das seleções no início pro drag ser ADITIVO.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dragSel, setDragSel] = useState<null | {
    startX: number; startY: number; curX: number; curY: number; origin: Set<number>;
  }>(null);
  // Rev. 2393 — Refs pra que o `executar` async do ModalConfirmacaoAuditoria
  // sempre leia o estado MAIS NOVO de selecionados/lista no retry (closure
  // capturaria o snapshot antigo).
  const selecionadosRef = useRef<Set<number>>(new Set());
  const listaRef = useRef<any[]>([]);
  const [modalAltCateg, setModalAltCateg] = useState<null | { categoria: string; aplicando: boolean }>(null);
  const [modalUnificar, setModalUnificar] = useState<null | { carregando: boolean; aplicando: boolean; grupos: any[]; totalInativ: number; erro: string | null }>(null);
  // Rev. 2390 — Transferência em lote: N itens selecionados → 1 destino comum.
  // Cada linha tem qtd editável (default = estoque atual). destinoTipo/Id fica
  // num único select. aplicando=true bloqueia UI durante o submit; resultado
  // (sucessos/falhas) é exibido inline pra user antes de fechar.
  const [modalTransfLote, setModalTransfLote] = useState<null | {
    itens: Array<{ id: number; nome: string; unidade: string; estoque: number; qtd: string }>;
    destinoTipo: "central" | "obra";
    destinoObraId: number;
    motivo: string;
    aplicando: boolean;
    resultado: null | { sucessos: number; falhas: Array<{ itemNome?: string; motivo: string }> };
  }>(null);

  const [busca, setBusca] = useState("");
  const [filtroCateg, setFiltroCateg] = useState("todas");
  const [apenasAbaixo, setApenasAbaixo] = useState(false);
  // Rev. 2406 — filtro por vínculo com Controle de Equipamentos.
  // todos | proprio | locado | vinculado (qualquer) | nenhum (sem vínculo)
  const [filtroEquip, setFiltroEquip] = useState<"todos" | "proprio" | "locado" | "vinculado" | "nenhum">("todos");
  // Rev. 4565 — filtro por status de estoque ao clicar nos cards de KPI.
  const [filtroEstoque, setFiltroEstoque] = useState<"todos" | "ok" | "baixo" | "critico">("todos");
  const matchEstoque = (qtd: number, min: number, f: "todos" | "ok" | "baixo" | "critico") => {
    if (f === "todos") return true;
    if (f === "ok") return min === 0 || qtd >= min;
    if (f === "baixo") return min > 0 && qtd < min && qtd >= min * 0.5;
    return min > 0 && qtd < min * 0.5; // critico
  };
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [obraContexto, setObraContexto] = useState<number | null | "todos">("todos");
  const [fotoExpandida, setFotoExpandida] = useState<{ url: string; nome: string } | null>(null);

  // Rev. 4340 — Transferências de equipamentos próprios aguardando aceite nesta obra.
  const equipTransfPendentesQ = trpc.equipamentos.listTransferenciasPendentesParaObra.useQuery(
    { companyId, obraId: typeof obraContexto === "number" ? obraContexto : 0 },
    { enabled: !!companyId && typeof obraContexto === "number", refetchInterval: 60_000 }
  );
  const equipTransfPendentes = equipTransfPendentesQ.data || [];
  const qtdEquipTransfPendente = equipTransfPendentes.length;

  const [modalEquipAceite, setModalEquipAceite] = useState<null | { list: any[] }>(null);
  const [aceiteObs, setAceiteObs] = useState("");
  const aceitarTransf = trpc.equipamentos.aceitarTransferenciaObra.useMutation({
    onSuccess: () => {
      utils.equipamentos.listTransferenciasPendentesParaObra.invalidate();
      utils.equipamentos.propriosListar.invalidate();
      toast.success("Equipamento recebido com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });
  const rejeitarTransf = trpc.equipamentos.rejeitarTransferenciaObra.useMutation({
    onSuccess: () => {
      utils.equipamentos.listTransferenciasPendentesParaObra.invalidate();
      toast.success("Transferência rejeitada.");
    },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 2375/2384 — alerta visual de OCs de locação aguardando recebimento.
  // Filtra pela obra do contexto quando o user está vendo uma obra específica;
  // no consolidado ("todos"), o backend já restringe às obras permitidas pro user.
  const obraIdFiltro = typeof obraContexto === "number" ? obraContexto : undefined;
  // Rev. 4756 — recebimento de material respeita o LOCAL: contexto Central (null)
  // só vê OCs sem obra de destino; "todos" vê tudo; obra específica vê a dela.
  const obraIdMaterial = obraContexto === "todos" ? undefined : obraContexto;
  const ocsLocacaoPendentesQ = trpc.equipamentos.ocsLocacaoPendentes.useQuery(
    { companyId, obraId: obraIdFiltro },
    { enabled: !!companyId, refetchInterval: 60_000, refetchOnWindowFocus: true }
  );
  const qtdLocacaoPendente = (ocsLocacaoPendentesQ.data || []).length;

  // Rev. 2376/2384 — alerta visual de OCs de MATERIAL pendentes de recebimento
  // (botão ENTRADA / modal "Receber Material" do SmartEntry). Mesma query
  // que SmartEntry usa (warehouse.listPendingOCs) com filtro por obra contexto.
  const ocsMaterialPendentesQ = trpc.warehouse.listPendingOCs.useQuery(
    { companyId, obraId: obraIdMaterial },
    { enabled: !!companyId, refetchInterval: 60_000, refetchOnWindowFocus: true }
  );
  const qtdMaterialPendente = (ocsMaterialPendentesQ.data || []).length;

  // Rev. 2374 — Modo "Classificar como Próprio / Alugado": múltipla seleção
  // de cards do consolidado pra empurrar em lote pros módulos /equipamentos/proprios
  // ou /equipamentos/locados (cadastro pré-preenchido com nome+foto+categoria
  // via sessionStorage). Pedido user (IMG_1175): "preciso indicar se o
  // equipamento é alugado ou próprio... fazendo múltipla seleção e já ir
  // pros campos de equipamento próprio ou locado". Chave do Map = nome
  // normalizado (consolidado não tem id único, agrega N almoxarifados).
  const [modoClassificarEquip, setModoClassificarEquip] = useState(false);
  // Rev. 4522 — Tela "Itens Zerados": mostra itens com qty=0 escondidos da view principal.
  const [tabZerados, setTabZerados] = useState(false);
  const [selecClassif, setSelecClassif] = useState<Map<string, { nome: string; fotoUrl: string; categoria: string }>>(new Map());
  // Rev. 2442 — guarda o último índice clicado pra dar suporte a Shift+click
  // (range select estilo Finder/Explorer). Reset quando entra/sai do modo.
  const lastSelClassifIdxRef = useRef<number | null>(null);
  function toggleSelClassif(item: any, idx?: number, shift?: boolean, visibleList?: any[]) {
    const k = String(item?.nome || "").toLowerCase().trim();
    if (!k) return;
    // Rev. 2442 — Shift+click: seleciona TODOS os itens entre lastIdx..idx
    // do `visibleList` (não toggla; sempre marca).
    if (shift && typeof idx === "number" && typeof lastSelClassifIdxRef.current === "number" && visibleList && visibleList.length) {
      const a = Math.min(lastSelClassifIdxRef.current, idx);
      const b = Math.max(lastSelClassifIdxRef.current, idx);
      setSelecClassif(prev => {
        const m = new Map(prev);
        for (let i = a; i <= b; i++) {
          const it = visibleList[i];
          const kk = String(it?.nome || "").toLowerCase().trim();
          if (kk && !m.has(kk)) m.set(kk, { nome: it.nome, fotoUrl: it.fotoUrl || "", categoria: it.categoria || "" });
        }
        return m;
      });
      lastSelClassifIdxRef.current = idx;
      return;
    }
    if (typeof idx === "number") lastSelClassifIdxRef.current = idx;
    setSelecClassif(prev => {
      const m = new Map(prev);
      if (m.has(k)) m.delete(k);
      else m.set(k, { nome: item.nome, fotoUrl: item.fotoUrl || "", categoria: item.categoria || "" });
      return m;
    });
  }
  // Rev. 2442 — marca/desmarca em massa baseado na lista atualmente visível.
  function marcarTodosClassif(visibleList: any[]) {
    setSelecClassif(prev => {
      const m = new Map(prev);
      for (const it of visibleList) {
        const k = String(it?.nome || "").toLowerCase().trim();
        if (k && !m.has(k)) m.set(k, { nome: it.nome, fotoUrl: it.fotoUrl || "", categoria: it.categoria || "" });
      }
      return m;
    });
  }
  function limparSelClassif() { setSelecClassif(new Map()); lastSelClassifIdxRef.current = null; }
  function sairModoClassif() {
    setModoClassificarEquip(false);
    setSelecClassif(new Map());
    lastSelClassifIdxRef.current = null;
  }
  function classificarComo(tipo: "proprio" | "alugado") {
    const arr = Array.from(selecClassif.values());
    if (arr.length === 0) { toast.error("Selecione ao menos 1 equipamento."); return; }
    const companyId = selectedCompany?.id;
    if (!companyId) { toast.error("Empresa não selecionada."); return; }
    try {
      // Rev. 2374 — payload inclui companyId pra evitar contaminação se o user
      // trocar de empresa antes da página de destino consumir a fila.
      sessionStorage.setItem("fc:importAlmoxEquip:queue", JSON.stringify({ companyId, itens: arr }));
      sessionStorage.setItem("fc:importAlmoxEquip:tipo", tipo);
    } catch {}
    sairModoClassif();
    setLocation(tipo === "proprio" ? "/equipamentos/proprios?importAlmox=1" : "/equipamentos/locados?importAlmox=1");
  }

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
      identificarPorFoto.mutate({ companyId, obraId: typeof obraContexto === "number" ? obraContexto : obraContexto === null ? null : undefined, base64, mimeType: file.type });
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
  // Para o DESTINO de transferência: sempre mostra TODAS as obras ativas da empresa,
  // independente das restrições de acesso do operador ao seu próprio almoxarifado.
  const { data: obrasParaTransferir = [] } = trpc.obras.listForAlmoxarifado.useQuery(
    { companyId, forTransfer: true }, { enabled: !!companyId }
  );

  // Rev. 4539 — VISIBILIDADE GLOBAL: obrasAtivas agora traz TODAS as obras da
  // empresa com o flag `podeEditar` por obra. Auto-seleciona quando o usuário
  // só pode operar em UMA obra (comportamento antigo preservado).
  const obrasEditaveis = (obrasAtivas as any[]).filter(o => o.podeEditar !== false);
  useEffect(() => {
    // Rev. 4551 — default agora é "todos" (Consolidado); o auto-select de
    // usuário restrito a UMA obra continua valendo a partir do estado inicial.
    if (obrasEditaveis.length === 1 && obrasEditaveis.length !== obrasAtivas.length && obraContexto === "todos") {
      setObraContexto(obrasEditaveis[0].id);
    }
  }, [obrasAtivas]);

  // Rev. 4539 — modo somente-leitura: obra selecionada onde o usuário NÃO pode
  // operar (vê tudo, mexe só no seu). Backend continua com os guards de escrita.
  const obraContextoInfo = typeof obraContexto === "number"
    ? (obrasAtivas as any[]).find(o => o.id === obraContexto)
    : null;
  const somenteLeitura = !!obraContextoInfo && obraContextoInfo.podeEditar === false;

  const { data: itens = [], refetch, isLoading } = trpc.compras.listarItens.useQuery(
    { companyId, obraId: typeof obraContexto === "number" ? obraContexto : obraContexto === null ? null : undefined },
    { enabled: !!companyId && obraContexto !== "todos" }
  );
  // Lista de todos os itens da empresa (usada pelo modal de empréstimo de ferramentas
  // quando o usuário está no view Consolidado — onde `itens` fica vazio)
  const { data: itensTodos = [] } = trpc.compras.listarItens.useQuery(
    { companyId },
    { enabled: !!companyId && obraContexto === "todos" }
  );
  const { data: consolidado, isLoading: loadingConsolidado } = trpc.compras.listarItensConsolidado.useQuery(
    { companyId, busca: busca || undefined },
    { enabled: !!companyId && obraContexto === "todos" }
  );
  // Rev. 4522 — Query dedicada para "Itens Zerados" (qty=0, inclui ativo=false de obras).
  // Ativa apenas quando a aba estiver aberta (lazy) e na view de almox único (não consolidado).
  const { data: itensZeradosRaw = [], isLoading: loadingZerados } = trpc.compras.listarItens.useQuery(
    { companyId, obraId: typeof obraContexto === "number" ? obraContexto : obraContexto === null ? null : undefined, somenteZerados: true },
    { enabled: !!companyId && tabZerados && obraContexto !== "todos" }
  );
  // Rev. 2451 — Hoist da lista consolidada filtrada pra escopo do componente.
  // Antes (Rev. 2406+) ela vivia DENTRO do IIFE da visão consolidada (L1727),
  // mas a barra inferior "modoClassificarEquip" (L4441+) referencia `consListFinal`
  // FORA do IIFE → ReferenceError "Can't find variable: consListFinal" quando
  // a barra ficava montada após sair do escopo. Centraliza aqui via useMemo.
  const consListFinal = useMemo(() => {
    const consItens = consolidado?.itens ?? [];
    const consBusca = busca.toLowerCase();
    const consFiltered = consBusca
      ? consItens.filter((i: any) => i.nome.toLowerCase().includes(consBusca) || i.categoria?.toLowerCase().includes(consBusca) || i.codigoInterno?.toLowerCase().includes(consBusca))
      : consItens;
    const consFinal = filtroCateg === "__sem__"
      ? consFiltered.filter((i: any) => !i.categoria || String(i.categoria).trim() === "")
      : (filtroCateg !== "todas" ? consFiltered.filter((i: any) => i.categoria === filtroCateg) : consFiltered);
    const consAfterMin = apenasAbaixo ? consFinal.filter((i: any) => i.quantidadeMinima > 0 && i.quantidadeTotal < i.quantidadeMinima) : consFinal;
    // Rev. 4565 — filtro por status de estoque (clique nos cards de KPI).
    const consAfterEstoque = filtroEstoque === "todos"
      ? consAfterMin
      : consAfterMin.filter((i: any) => matchEstoque(Number(i.quantidadeTotal) || 0, Number(i.quantidadeMinima) || 0, filtroEstoque));
    return filtroEquip === "todos" ? consAfterEstoque : consAfterEstoque.filter((i: any) => {
      const t = i.equipamentoVinculadoTipo;
      if (filtroEquip === "nenhum") return !t;
      if (filtroEquip === "vinculado") return !!t;
      return t === filtroEquip;
    });
  }, [consolidado, busca, filtroCateg, apenasAbaixo, filtroEquip, filtroEstoque]);
  const [sugerindoPreco, setSugerindoPreco] = useState(false);
  const sugerirPrecoMut = trpc.compras.sugerirPrecoIA.useMutation({
    onSuccess: (d: any) => {
      setFormItem(p => ({ ...p, valorUnitario: String(d.precoSugerido).replace(".", ",") }));
      toast.success(`💡 IA sugeriu R$ ${d.precoSugerido.toFixed(2)} — ${d.justificativa}`);
      setSugerindoPreco(false);
    },
    onError: (e) => { toast.error(e.message); setSugerindoPreco(false); },
  });
  const utils = trpc.useUtils();
  const [preenchendoIA, setPreenchendoIA] = useState(false);
  // Rev. 4567 — progresso 0→100% no botão (fase IA é não-determinística: intervalo simulado até ~95%, salta pra 100% no fim)
  const [iaPct, setIaPct] = useState(0);
  const iaPctTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const iaPctResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iniciarProgressoIA = (qtdItens: number) => {
    if (iaPctTimer.current) clearInterval(iaPctTimer.current);
    setIaPct(0);
    // estimativa: ~120ms por item (lotes no servidor), mínimo 12s
    const duracaoMs = Math.max(12000, qtdItens * 120);
    const passoMs = 400;
    const incremento = (95 * passoMs) / duracaoMs;
    iaPctTimer.current = setInterval(() => {
      setIaPct(p => Math.min(95, p + incremento));
    }, passoMs);
  };
  const finalizarProgressoIA = (ok: boolean) => {
    if (iaPctTimer.current) { clearInterval(iaPctTimer.current); iaPctTimer.current = null; }
    if (ok) {
      setIaPct(100);
      if (iaPctResetTimer.current) clearTimeout(iaPctResetTimer.current);
      iaPctResetTimer.current = setTimeout(() => { setPreenchendoIA(false); setIaPct(0); iaPctResetTimer.current = null; }, 800);
    } else {
      setPreenchendoIA(false);
      setIaPct(0);
    }
  };
  useEffect(() => () => {
    if (iaPctTimer.current) { clearInterval(iaPctTimer.current); iaPctTimer.current = null; }
    if (iaPctResetTimer.current) { clearTimeout(iaPctResetTimer.current); iaPctResetTimer.current = null; }
  }, []);
  const preencherIAMut = trpc.compras.preencherPrecosFaltantesIA.useMutation({
    onSuccess: (d: any) => {
      finalizarProgressoIA(true);
      toast.success(`✨ ${d.mensagem}`, { duration: 8000 });
      utils.compras.listarItens.invalidate();
      utils.compras.listarItensConsolidado.invalidate();
    },
    onError: (e) => {
      finalizarProgressoIA(false);
      toast.error(`Falha ao preencher preços: ${e.message}`);
    },
  });
  const dispararPreencherIA = (escopo: "empresa" | "obra") => {
    if (!companyId) return;
    const itensSemPreco = escopo === "empresa"
      ? (consolidado?.itens || []).filter((i: any) => !i.valorUnitario || parseFloat(i.valorUnitario) === 0).length
      : itens.filter((i: any) => !i.valorUnitario || parseFloat(i.valorUnitario) === 0).length;
    if (itensSemPreco === 0) {
      toast.info("Não há itens sem preço para preencher.");
      return;
    }
    setConfirmIAPrecos({ escopo, qtd: itensSemPreco });
  };
  const executarPreencherIA = () => {
    if (!companyId || !confirmIAPrecos) return;
    const escopo = confirmIAPrecos.escopo;
    const qtdParaPreencher = confirmIAPrecos.qtd;
    setConfirmIAPrecos(null);
    setPreenchendoIA(true);
    iniciarProgressoIA(qtdParaPreencher);
    preencherIAMut.mutate({
      companyId,
      ...(escopo === "obra" && typeof obraContexto === "number" ? { obraId: obraContexto } : escopo === "obra" && obraContexto === null ? { obraId: null } : {}),
    });
  };
  // Rev. 2381 — Rebusca com termo customizado: dryRun pra preview, depois apply.
  async function rebuscarPreview() {
    if (!companyId || !rebuscarFoto) return;
    const termo = rebuscarFoto.termo.trim();
    if (!termo) return;
    setRebuscarFoto(s => s ? { ...s, buscando: true, erro: null, previewUrl: null } : s);
    try {
      const r: any = await buscarFotoWebMut.mutateAsync({
        companyId,
        nome: rebuscarFoto.nome,
        queryOverride: termo,
        dryRun: true,
      });
      if (r?.ok && r?.fotoUrl) {
        setRebuscarFoto(s => s ? { ...s, buscando: false, previewUrl: r.fotoUrl, erro: null } : s);
      } else {
        setRebuscarFoto(s => s ? { ...s, buscando: false, previewUrl: null, erro: r?.motivo || "Nada encontrado." } : s);
      }
    } catch (e: any) {
      setRebuscarFoto(s => s ? { ...s, buscando: false, previewUrl: null, erro: e?.message || "Falha na busca." } : s);
    }
  }
  async function aplicarRebusca() {
    if (!companyId || !rebuscarFoto || !rebuscarFoto.previewUrl) return;
    setRebuscarFoto(s => s ? { ...s, aplicando: true } : s);
    try {
      const r: any = await buscarFotoWebMut.mutateAsync({
        companyId,
        nome: rebuscarFoto.nome,
        queryOverride: rebuscarFoto.termo.trim(),
        sobrescrever: true,
      });
      if (r?.ok && Number(r.itensAtualizados || 0) > 0) {
        toast.success(`Foto aplicada em ${r.itensAtualizados} item(ns).`);
        utils.compras.listarItens.invalidate();
        utils.compras.listarItensConsolidado.invalidate();
        setRebuscarFoto(null);
      } else {
        toast.warning(r?.motivo || "Nenhum item foi atualizado.");
        setRebuscarFoto(s => s ? { ...s, aplicando: false } : s);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao aplicar foto.");
      setRebuscarFoto(s => s ? { ...s, aplicando: false } : s);
    }
  }
  // Rev. 2382 — Mutations multi-seleção
  const altCategLoteMut = trpc.compras.atualizarCategoriaEmLote.useMutation();
  const unificarLoteMut = trpc.compras.unificarItensEmLote.useMutation();
  // Rev. 2383 — Categoria em lote POR NOME (consolidado)
  const altCategPorNomeMut = trpc.compras.atualizarCategoriaPorNomeEmLote.useMutation();

  // Rev. 2386 — IA sugere categorias para itens sem categoria.
  // Backend retorna sugestões (nome → categoriaSugerida + confianca);
  // frontend mostra modal pra revisar, editar e aplicar em lote via
  // atualizarCategoriaPorNomeEmLote agrupado por categoria.
  type SugestaoCateg = { nome: string; unidade: string | null; qtdItens: number; ids: number[]; categoriaSugerida: string | null; confianca: "alta" | "media" | "baixa" };
  const [modalSugestoesCateg, setModalSugestoesCateg] = useState<null | {
    sugestoes: SugestaoCateg[];
    categoriasDisponiveis: string[];
    escolhas: Record<string, string>; // nomeLower → categoria escolhida (vazio = não aplicar)
    aplicando: boolean;
    progresso?: { atual: number; total: number };
  }>(null);
  const sugerirCategsIAMut = trpc.compras.sugerirCategoriasIA.useMutation({
    onSuccess: (d: any) => {
      const sugestoes: SugestaoCateg[] = d?.sugestoes ?? [];
      if (sugestoes.length === 0) {
        toast.info(d?.mensagem || "Nenhum item sem categoria encontrado.");
        return;
      }
      const escolhas: Record<string, string> = {};
      for (const s of sugestoes) {
        escolhas[s.nome.toLowerCase().trim()] = s.categoriaSugerida || "";
      }
      setModalSugestoesCateg({
        sugestoes,
        categoriasDisponiveis: d?.categoriasDisponiveis ?? [],
        escolhas,
        aplicando: false,
      });
      toast.success(`✨ ${d?.mensagem || `IA analisou ${sugestoes.length} itens`}`, { duration: 6000 });
    },
    onError: (e) => toast.error(`Falha na IA: ${e.message}`),
  });
  function dispararSugerirCategsIA() {
    if (!companyId) return;
    sugerirCategsIAMut.mutate({
      companyId,
      ...(typeof obraContexto === "number" ? { obraId: obraContexto } : {}),
    });
  }
  async function aplicarSugestoesCategs() {
    if (!companyId || !modalSugestoesCateg) return;
    // Rev. 2386 — Agrupa por categoria escolhida e aplica via
    // atualizarCategoriaEmLote (escopo por IDs explícitos, NUNCA por
    // nome), garantindo que só os itens analisados pela IA — que
    // estavam sem categoria — sejam alterados. Evita sobrescrever
    // itens corretos em outras obras com nome igual.
    const porCategoria = new Map<string, number[]>();
    for (const s of modalSugestoesCateg.sugestoes) {
      const cat = (modalSugestoesCateg.escolhas[s.nome.toLowerCase().trim()] || "").trim();
      if (!cat) continue;
      const arr = porCategoria.get(cat) || [];
      for (const id of s.ids) arr.push(id);
      porCategoria.set(cat, arr);
    }
    if (porCategoria.size === 0) {
      toast.warning("Nenhuma sugestão selecionada para aplicar.");
      return;
    }
    const grupos = Array.from(porCategoria.entries());
    setModalSugestoesCateg(s => s ? { ...s, aplicando: true, progresso: { atual: 0, total: grupos.length } } : s);
    let totalItens = 0, falhas = 0;
    for (const [idx, [cat, ids]] of grupos.entries()) {
      try {
        const r: any = await altCategLoteMut.mutateAsync({ companyId, ids, categoria: cat });
        totalItens += Number(r?.itensAtualizados || 0);
      } catch (e) {
        falhas += ids.length;
      }
      setModalSugestoesCateg(s => s ? { ...s, progresso: { atual: idx + 1, total: grupos.length } } : s);
    }
    utils.compras.listarItens.invalidate();
    utils.compras.listarItensConsolidado.invalidate();
    if (totalItens > 0) toast.success(`✅ ${totalItens} item(ns) categorizado(s) em ${grupos.length} categoria(s).${falhas > 0 ? ` ${falhas} falharam.` : ""}`, { duration: 8000 });
    else toast.warning("Nenhum item foi atualizado.");
    setModalSugestoesCateg(null);
  }
  // Rev. 2383 — Modal "Alterar categoria" disparado a partir do modo
  // seleção do CONSOLIDADO (Rev. 2374). Usa selecClassif (Map por nome)
  // e chama atualizarCategoriaPorNomeEmLote.
  const [modalAltCategConsol, setModalAltCategConsol] = useState<{ categoria: string; aplicando: boolean } | null>(null);
  async function aplicarAlterarCategoriaConsol() {
    if (!companyId || !modalAltCategConsol || !modalAltCategConsol.categoria.trim() || selecClassif.size === 0) return;
    setModalAltCategConsol(s => s ? { ...s, aplicando: true } : s);
    try {
      const nomes = Array.from(selecClassif.values()).map(v => v.nome);
      const r: any = await altCategPorNomeMut.mutateAsync({
        companyId, nomes, categoria: modalAltCategConsol.categoria.trim(),
      });
      if (r?.ok) {
        toast.success(`Categoria aplicada em ${r.itensAtualizados} item(ns).`);
        utils.compras.listarItens.invalidate();
        utils.compras.listarItensConsolidado.invalidate();
        setModalAltCategConsol(null);
        sairModoClassif();
      } else {
        toast.warning(r?.motivo || "Nenhum item atualizado.");
        setModalAltCategConsol(s => s ? { ...s, aplicando: false } : s);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao alterar categoria.");
      setModalAltCategConsol(s => s ? { ...s, aplicando: false } : s);
    }
  }
  function sairModoSelecao() { setSelecionados(new Set()); setDragSel(null); }
  // Rev. 2393 — Excluir em lote os itens selecionados. Reusa o ModalConfirmacaoAuditoria
  // (senha + justificativa) e itera a mutation `compras.excluirItem` (mesma do single).
  // Soft-delete preserva histórico de movimentações. Para no 1º erro de senha/autorização.
  function handleExcluirSelecionados() {
    if (!companyId || selecionados.size === 0) { toast.warning("Selecione ao menos 1 item."); return; }
    const itensSelInicial = (lista as any[]).filter(i => selecionados.has(i.id));
    if (itensSelInicial.length === 0) { toast.error("Itens selecionados não estão visíveis na lista atual."); return; }
    const nomes = itensSelInicial.map(i => i.nome).slice(0, 3).join(", ");
    const sufixo = itensSelInicial.length > 3 ? ` e mais ${itensSelInicial.length - 3}` : "";
    setModalAuditoria({
      tipo: "excluir_item",
      titulo: `Remover ${itensSelInicial.length} item(ns) do almoxarifado?`,
      subtitulo: `${nomes}${sufixo}`,
      descricao: (
        <p>Esta ação <strong>desativa {itensSelInicial.length === 1 ? "o item" : "os itens"}</strong> selecionado(s) no almoxarifado. O histórico de movimentações é preservado.</p>
      ),
      textoBotao: "Remover todos",
      executar: async ({ senha, justificativa }) => {
        setModalAuditoria((p) => p ? { ...p, carregando: true, erro: null } : p);
        // Recalcula pendentes a CADA chamada (retry pós-erro-de-senha precisa
        // ler o Set atualizado, não o snapshot do 1º clique).
        const selAtual = selecionadosRef.current;
        const listAtual = listaRef.current;
        const itensSel = (listAtual as any[]).filter(i => selAtual.has(i.id));
        if (itensSel.length === 0) {
          setModalAuditoria(null);
          sairModoSelecao();
          toast.info("Nenhum item pendente.");
          return;
        }
        let firstError: any = null;
        let okCount = 0;
        const idsRemovidos = new Set<number>();
        // Rev. 4536 — progresso real por unidade processada (0→100% no botão)
        const totalUnidades = itensSel.reduce((acc, it) => {
          const subs = (it as any)._subItems as any[] | undefined;
          return acc + (subs && subs.length > 1 ? subs.length : 1);
        }, 0);
        let processadas = 0;
        setModalAuditoria((p) => p ? { ...p, progresso: 0 } : p);
        for (const it of itensSel) {
          const subs = (it as any)._subItems as any[] | undefined;
          const ids = subs && subs.length > 1 ? subs.map((s: any) => s.id) : [it.id];
          let cardOk = true;
          for (const id of ids) {
            try {
              await excluirMutSilent.mutateAsync({ id, senha, justificativa });
              okCount++;
            } catch (e: any) {
              cardOk = false;
              if (!firstError) firstError = e;
              if (e?.data?.code === "UNAUTHORIZED" || e?.data?.code === "BAD_REQUEST") break;
            } finally {
              processadas++;
              const pct = Math.round((processadas / totalUnidades) * 100);
              setModalAuditoria((p) => p ? { ...p, progresso: pct } : p);
            }
          }
          if (cardOk) idsRemovidos.add(it.id);
          if (firstError && (firstError?.data?.code === "UNAUTHORIZED" || firstError?.data?.code === "BAD_REQUEST")) break;
        }
        // 1 refetch agregado (substitui o per-item da mutation single)
        if (okCount > 0) refetch();
        const isAuthErr = firstError && (firstError?.data?.code === "UNAUTHORIZED" || firstError?.data?.code === "BAD_REQUEST");
        if (isAuthErr) {
          // Mantém modal aberto pra retry. Tira da seleção os já removidos pra
          // que a próxima tentativa SÓ reprocesse o restante. Erro inline.
          if (idsRemovidos.size > 0) {
            setSelecionados(prev => {
              const n = new Set(prev);
              idsRemovidos.forEach(id => n.delete(id));
              return n;
            });
          }
          const prefix = okCount > 0 ? `${okCount} já removido(s). ` : "";
          setModalAuditoria((p) => p ? { ...p, carregando: false, progresso: null, erro: prefix + (firstError.message || "Falha ao remover.") } : p);
          return;
        }
        // Rev. 4536 — segura o 100% visível por um instante antes de fechar (regra de ouro)
        await new Promise((r) => setTimeout(r, 800));
        setModalAuditoria(null);
        sairModoSelecao();
        if (firstError) {
          toast.warning(`${okCount} removido(s); houve falhas. ${firstError.message || ""}`);
        } else {
          toast.success(`${okCount} item(ns) removido(s). Pendência de auditoria registrada.`);
        }
      },
    });
  }
  function toggleSelecionado(id: number) {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  async function aplicarAlterarCategoria() {
    if (!companyId || !modalAltCateg || !modalAltCateg.categoria.trim() || selecionados.size === 0) return;
    setModalAltCateg(s => s ? { ...s, aplicando: true } : s);
    try {
      const r = await altCategLoteMut.mutateAsync({
        companyId, ids: Array.from(selecionados), categoria: modalAltCateg.categoria.trim(),
      });
      toast.success(`Categoria atualizada em ${r.itensAtualizados} item(ns).`);
      utils.compras.listarItens.invalidate();
      utils.compras.listarItensConsolidado.invalidate();
      setModalAltCateg(null);
      sairModoSelecao();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar categoria.");
      setModalAltCateg(s => s ? { ...s, aplicando: false } : s);
    }
  }
  async function abrirUnificarPreview() {
    if (!companyId || selecionados.size < 2) {
      toast.warning("Selecione pelo menos 2 itens pra unificar.");
      return;
    }
    setModalUnificar({ carregando: true, aplicando: false, grupos: [], totalInativ: 0, erro: null });
    try {
      const r: any = await unificarLoteMut.mutateAsync({
        companyId, ids: Array.from(selecionados), dryRun: true,
      });
      if (r?.ok) {
        setModalUnificar({ carregando: false, aplicando: false, grupos: r.grupos || [], totalInativ: r.totalItensInativados || 0, erro: null });
      } else {
        setModalUnificar({ carregando: false, aplicando: false, grupos: [], totalInativ: 0, erro: r?.motivo || "Nada a unificar." });
      }
    } catch (e: any) {
      setModalUnificar({ carregando: false, aplicando: false, grupos: [], totalInativ: 0, erro: e?.message || "Falha." });
    }
  }
  // Rev. 2390 — Abre o modal de transferência em lote com os itens selecionados.
  // `lista` traz os cards visíveis (filtrados pela view atual: 1 obra OU central).
  // Default da qtd = estoque atual (transfere tudo). User pode editar por linha.
  const createTransferenciaLoteMut = trpc.warehouse.createTransferenciaLote.useMutation();
  function abrirTransfLote() {
    if (!companyId || selecionados.size === 0) {
      toast.warning("Selecione ao menos 1 item.");
      return;
    }
    const itensSel = (lista as any[]).filter(i => selecionados.has(i.id));
    if (itensSel.length === 0) {
      toast.error("Itens selecionados não estão visíveis na lista atual.");
      return;
    }
    setModalTransfLote({
      itens: itensSel.map(i => {
        const estoque = parseFloat(String(i.quantidadeAtual ?? i.quantidadeTotal ?? "0")) || 0;
        return {
          id: i.id,
          nome: i.nome,
          unidade: i.unidade || "un",
          estoque,
          qtd: String(estoque),
        };
      }),
      destinoTipo: "central",
      destinoObraId: 0,
      motivo: "",
      aplicando: false,
      resultado: null,
    });
  }
  async function aplicarTransfLote() {
    if (!companyId || !modalTransfLote) return;
    const m = modalTransfLote;
    if (m.destinoTipo === "obra" && !m.destinoObraId) {
      toast.warning("Selecione a obra de destino.");
      return;
    }
    const linhas = m.itens
      .map(it => ({ itemIdOrigem: it.id, quantidade: parseFloat(it.qtd) || 0, nome: it.nome, estoque: it.estoque }))
      .filter(l => l.quantidade > 0);
    if (linhas.length === 0) {
      toast.warning("Defina ao menos 1 item com quantidade > 0.");
      return;
    }
    const excedeu = linhas.find(l => l.quantidade > l.estoque + 1e-9);
    if (excedeu) {
      toast.error(`Qtd de "${excedeu.nome}" maior que o estoque (${excedeu.estoque}).`);
      return;
    }
    setModalTransfLote(s => s ? { ...s, aplicando: true } : s);
    try {
      const destinoObraSel = m.destinoTipo === "obra"
        ? (obrasParaTransferir as any[]).find((o: any) => o.id === m.destinoObraId)
        : null;
      const r = await createTransferenciaLoteMut.mutateAsync({
        companyId,
        itens: linhas.map(l => ({ itemIdOrigem: l.itemIdOrigem, quantidade: l.quantidade })),
        destinoTipo: m.destinoTipo,
        destinoObraId: m.destinoTipo === "obra" ? m.destinoObraId : undefined,
        destinoObraNome: destinoObraSel ? (destinoObraSel.codigo ? `${destinoObraSel.codigo} – ${destinoObraSel.nome}` : destinoObraSel.nome) : undefined,
        motivo: m.motivo || undefined,
      });
      utils.compras.listarItens.invalidate();
      utils.compras.listarItensConsolidado.invalidate();
      if (r.falhas.length === 0) {
        toast.success(`${r.sucessos.length} item(ns) transferido(s).`);
        setModalTransfLote(null);
        sairModoSelecao();
      } else {
        toast.warning(`${r.sucessos.length} OK · ${r.falhas.length} falha(s).`);
        setModalTransfLote(s => s ? { ...s, aplicando: false, resultado: { sucessos: r.sucessos.length, falhas: r.falhas } } : s);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao transferir.");
      setModalTransfLote(s => s ? { ...s, aplicando: false } : s);
    }
  }
  async function confirmarUnificar() {
    if (!companyId || !modalUnificar || modalUnificar.grupos.length === 0) return;
    setModalUnificar(s => s ? { ...s, aplicando: true } : s);
    try {
      const r: any = await unificarLoteMut.mutateAsync({
        companyId, ids: Array.from(selecionados),
      });
      if (r?.ok) {
        toast.success(`Unificação concluída: ${r.totalItensInativados} item(ns) consolidado(s) em ${r.grupos?.length || 0} grupo(s).`);
        utils.compras.listarItens.invalidate();
        utils.compras.listarItensConsolidado.invalidate();
        setModalUnificar(null);
        sairModoSelecao();
      } else {
        toast.error(r?.motivo || "Falha na unificação.");
        setModalUnificar(s => s ? { ...s, aplicando: false } : s);
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha na unificação.");
      setModalUnificar(s => s ? { ...s, aplicando: false } : s);
    }
  }
  // Rev. 2377 — Buscar 1 foto na web (1 nome). Usado pelo botão por card.
  async function buscarFotoWebUm(nome: string, sobrescrever: boolean) {
    if (!companyId || !nome) return;
    setBuscandoFotoNomes(prev => { const n = new Set(prev); n.add(nome); return n; });
    try {
      const r: any = await buscarFotoWebMut.mutateAsync({ companyId, nome, sobrescrever });
      if (r?.ok && Number(r.itensAtualizados || 0) > 0) {
        utils.compras.listarItens.invalidate();
        utils.compras.listarItensConsolidado.invalidate();
        toast.success(`Foto aplicada em ${r.itensAtualizados} item(ns) — "${nome.slice(0, 40)}"`);
      } else if (r?.ok) {
        toast.warning(`Foto encontrada mas nenhum item foi atualizado (nome não bateu no banco).`, { duration: 4000 });
      } else {
        toast.error(r?.motivo || "Não encontrada na web.", { duration: 4000 });
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao buscar foto.");
    } finally {
      setBuscandoFotoNomes(prev => { const n = new Set(prev); n.delete(nome); return n; });
    }
  }

  // Rev. 2377 — Buscar fotos na web em LOTE pra todos os itens sem foto
  // visíveis na lista atual (respeita filtros de obra/categoria/busca).
  async function buscarFotosWebTodas() {
    if (!companyId) return;
    // Coleta NOMES distintos sem foto da lista filtrada (`lista` já existe).
    const setNomes = new Set<string>();
    for (const it of (lista as any[])) {
      if (!it?.fotoUrl && it?.nome) setNomes.add(String(it.nome).trim());
    }
    const nomes = Array.from(setNomes).filter(Boolean);
    if (nomes.length === 0) { toast.info("Todos os itens visíveis já têm foto."); return; }
    setConfirmBuscaFotos({ nomes });
  }

  async function executarBuscaFotosWebTodas(nomes: string[]) {
    if (!companyId) return;
    setConfirmBuscaFotos(null);
    batchFotoWebRef.current.cancelar = false;
    setBatchFotoWeb({ atual: 0, total: nomes.length, nomeAtual: nomes[0], ok: 0, falhas: 0, itensAtualizados: 0 });
    let okN = 0, falhas = 0, itensAtualizados = 0;
    for (let i = 0; i < nomes.length; i++) {
      if (batchFotoWebRef.current.cancelar) break;
      const nome = nomes[i];
      setBatchFotoWeb(p => p ? { ...p, atual: i + 1, nomeAtual: nome } : p);
      try {
        const r: any = await buscarFotoWebMut.mutateAsync({ companyId, nome, sobrescrever: false });
        const upd = Number(r?.itensAtualizados || 0);
        if (r?.ok && upd > 0) { okN += 1; itensAtualizados += upd; }
        else { falhas += 1; }
      } catch { falhas += 1; }
      setBatchFotoWeb(p => p ? { ...p, ok: okN, falhas, itensAtualizados } : p);
      await new Promise(res => setTimeout(res, 250));
    }
    utils.compras.listarItens.invalidate();
    utils.compras.listarItensConsolidado.invalidate();
    const cancelado = batchFotoWebRef.current.cancelar;
    setBatchFotoWeb(null);
    if (cancelado) {
      toast.info(`Interrompido — ${okN} foto(s) aplicada(s) em ${itensAtualizados} item(ns).`);
    } else {
      toast.success(`Concluído — ${okN} foto(s) em ${itensAtualizados} item(ns)${falhas > 0 ? ` · ${falhas} sem resultado` : ""}.`);
    }
  }

  const [buscandoBarcode, setBuscandoBarcode] = useState(false);
  const buscarBarcodeMut = trpc.compras.buscarPorCodigoBarras.useMutation({
    onSuccess: (d: any) => {
      setBuscandoBarcode(false);
      if (d.found) {
        setFormItem(p => ({
          ...p,
          nome: d.nome || p.nome,
          unidade: d.unidade || p.unidade,
          categoria: d.categoria || p.categoria,
          valorUnitario: d.valorUnitario ? String(d.valorUnitario).replace(".", ",") : p.valorUnitario,
          fotoUrl: d.fotoUrl || p.fotoUrl,
        }));
        if (d.source === "local") {
          toast.success(`Item encontrado no almoxarifado: ${d.nome}`);
        } else {
          toast.success(`IA identificou: ${d.nome}${d.confianca ? ` (confiança ${d.confianca})` : ""}`);
        }
      } else {
        toast.info("Código não identificado — preencha os dados manualmente");
      }
    },
    onError: () => {
      setBuscandoBarcode(false);
      toast.info("Não foi possível identificar o código — preencha manualmente");
    },
  });
  const { data: categorias = [] } = trpc.compras.listarCategoriasAlmoxarifado.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const { data: unidades = [], refetch: refetchUnidades } = trpc.compras.listarUnidades.useQuery(
    { companyId }, { enabled: !!companyId }
  );

  const normNomeItem = (nome: string) =>
    nome.replace(/^\[[\d.]+\]\s*/, "").replace(/\s*\[[\d.]+\]\s*$/, "").trim().toLowerCase().replace(/\s+/g, " ");

  // Rev. 2393 — keep refs em sync pro async closure do executar (retry).
  useEffect(() => { selecionadosRef.current = selecionados; }, [selecionados]);
  const lista = useMemo(() => {
    let r = itens;
    // Rev. 4522 — itens zerados somem da view principal e vão para a aba "Itens Zerados".
    r = r.filter(i => n(i.quantidadeAtual) > 0);
    if (busca) {
      const b = busca.toLowerCase();
      r = r.filter(i => i.nome.toLowerCase().includes(b) || i.codigoInterno?.toLowerCase().includes(b) || i.categoria?.toLowerCase().includes(b));
    }
    if (filtroCateg === "__sem__") r = r.filter(i => !i.categoria || String(i.categoria).trim() === "");
    else if (filtroCateg !== "todas") r = r.filter(i => i.categoria === filtroCateg);
    if (apenasAbaixo) r = r.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima));
    // Rev. 4565 — filtro por status de estoque (clique nos cards de KPI).
    if (filtroEstoque !== "todos") r = r.filter(i => matchEstoque(n(i.quantidadeAtual), n(i.quantidadeMinima), filtroEstoque));
    // Rev. 2406 — filtro por vínculo Equipamento Próprio/Locado.
    if (filtroEquip !== "todos") {
      r = r.filter((i: any) => {
        const t = i.equipamentoVinculadoTipo;
        if (filtroEquip === "nenhum") return !t;
        if (filtroEquip === "vinculado") return !!t;
        return t === filtroEquip;
      });
    }

    const groups = new Map<string, any[]>();
    for (const item of r) {
      const key = normNomeItem(item.nome) + "|" + (item.unidade || "un");
      const arr = groups.get(key) || [];
      arr.push(item);
      groups.set(key, arr);
    }

    const merged: any[] = [];
    const stripCode = (s: string) => s.replace(/^\[[\d.]+\]\s*/, "").replace(/\s*\[[\d.]+\]\s*$/, "").trim();
    for (const [, arr] of groups) {
      if (arr.length === 1) {
        merged.push({ ...arr[0], nome: stripCode(arr[0].nome) });
      } else {
        const first = arr[0];
        const qtdTotal = arr.reduce((s: number, i: any) => s + n(i.quantidadeAtual), 0);
        const minTotal = arr.reduce((s: number, i: any) => s + n(i.quantidadeMinima), 0);
        const valUnit = arr.find((i: any) => n(i.valorUnitario) > 0);
        const foto = arr.find((i: any) => i.fotoUrl);
        merged.push({
          ...first,
          id: first.id,
          quantidadeAtual: String(qtdTotal),
          quantidadeMinima: String(minTotal),
          valorUnitario: valUnit ? valUnit.valorUnitario : first.valorUnitario,
          fotoUrl: foto ? foto.fotoUrl : first.fotoUrl,
          _subItems: arr,
          nome: stripCode(first.nome),
          codigoInterno: arr.map((i: any) => i.codigoInterno).filter(Boolean).join(", ") || first.codigoInterno,
        });
      }
    }
    return merged;
  }, [itens, busca, filtroCateg, apenasAbaixo, filtroEquip, filtroEstoque]);
  // Rev. 2393 — keep listaRef em sync pro async closure do executar (retry).
  useEffect(() => { listaRef.current = lista as any[]; }, [lista]);

  const totalCriticos = useMemo(() =>
    itens.filter(i => n(i.quantidadeMinima) > 0 && n(i.quantidadeAtual) < n(i.quantidadeMinima)).length,
    [itens]
  );
  // Rev. 4522 — Contagem de itens zerados visíveis no almox atual (para badge no botão).
  // Usa `itens` (ativo=true, sem filtro qty) pra derivar os centrais zerados.
  // Itens de obra zerados (ativo=false) só aparecem quando a aba zerados é aberta.
  const qtdZeradosMain = useMemo(() =>
    itens.filter(i => n(i.quantidadeAtual) <= 0).length,
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
    onSuccess: () => { refetchUnidades(); setModalAuditoria(null); toast.success("Unidade removida. Pendência de auditoria registrada."); },
    onError: (e) => { setModalAuditoria((p) => p ? { ...p, carregando: false, erro: e.message } : p); toast.error(e.message); },
  });

  // ── Modal Item ──────────────────────────────────────────────────
  const [modalItem, setModalItem] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoSubItems, setEditandoSubItems] = useState<any[] | null>(null);
  const [editandoMeta, setEditandoMeta] = useState<{
    criadoPorNome?: string | null; criadoEm?: string | null;
    atualizadoPorNome?: string | null; atualizadoEm?: string | null;
  } | null>(null);
  const [formItem, setFormItem] = useState({ ...EMPTY_ITEM });
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [analisandoFotoIA, setAnalisandoFotoIA] = useState(false);
  const [camposPreenchidosIA, setCamposPreenchidosIA] = useState(false);
  const [categoriaManualment, setCategoriaManualment] = useState(false);
  const [categoriaAutoSugerida, setCategoriaAutoSugerida] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // ── Importar Itens via IA (Rev. 4420) ─────────────────────────
  const [importIAOpen, setImportIAOpen] = useState(false);
  const [importIAStep, setImportIAStep] = useState<"upload"|"processing"|"review">("upload");
  const [importIAItens, setImportIAItens] = useState<Array<{nome:string;unidade:string;categoria:string;quantidade:number}>>([]);
  const [importIADragOver, setImportIADragOver] = useState(false);
  const [importIACriando, setImportIACriando] = useState(false);
  const [importIAProgress, setImportIAProgress] = useState(0);
  const [importIASelected, setImportIASelected] = useState<Set<number>>(new Set());
  const importIAFileRef = useRef<HTMLInputElement>(null);

  function abrirNovo() { setFormItem({ ...EMPTY_ITEM }); setEditandoId(null); setEditandoSubItems(null); setEditandoMeta(null); setCamposPreenchidosIA(false); setCategoriaManualment(false); setCategoriaAutoSugerida(false); setModalItem(true); }
  function resolveRealItem(i: any) {
    return i._subItems && i._subItems.length > 1 ? i._subItems[0] : i;
  }

  // Rev. 4539 — "ver tudo, mexer só no seu": item de obra sem permissão de
  // escrita é somente leitura (o backend também bloqueia; aqui é UX).
  function podeEditarItemObra(i: any): boolean {
    const real = resolveRealItem(i);
    if (real?.obraId == null) return true; // Central segue regra da empresa
    return obrasEditaveis.some((o: any) => o.id === real.obraId);
  }

  function abrirEditar(i: any) {
    const real = resolveRealItem(i);
    if (!podeEditarItemObra(i)) {
      toast.info("👁 Somente leitura — este item pertence a uma obra em que você não pode operar. Solicite uma transferência ao responsável.");
      return;
    }
    const subs = i._subItems && i._subItems.length > 1 ? i._subItems : null;
    setEditandoSubItems(subs);
    setFormItem({
      nome: real.nome, unidade: real.unidade, categoria: real.categoria ?? "", codigoInterno: real.codigoInterno ?? "",
      quantidadeAtual: n(real.quantidadeAtual) ? String(n(real.quantidadeAtual)) : "",
      quantidadeMinima: n(real.quantidadeMinima) ? String(n(real.quantidadeMinima)) : "",
      observacoes: real.observacoes ?? "", especificacao: real.especificacao ?? "", fotoUrl: real.fotoUrl ?? "",
      valorUnitario: n(real.valorUnitario) ? String(n(real.valorUnitario)).replace(".", ",") : "",
      origem: (real.origem === "alugado" ? "alugado" : "proprio") as "proprio" | "alugado",
      fornecedorLocacao: real.fornecedorLocacao ?? "",
      dataInicioLocacao: normalizarDataInput(real.dataInicioLocacao),
      dataVencimentoLocacao: normalizarDataInput(real.dataVencimentoLocacao),
      valorLocacaoMensal: n(real.valorLocacaoMensal) ? String(n(real.valorLocacaoMensal)).replace(".", ",") : "",
      diasAlertaLocacao: String(real.diasAlertaLocacao ?? 7),
      observacoesLocacao: real.observacoesLocacao ?? "",
    });
    setEditandoId(real.id);
    setEditandoMeta({
      criadoPorNome: real.criadoPorNome ?? null,
      criadoEm: real.criadoEm ?? null,
      atualizadoPorNome: real.atualizadoPorNome ?? null,
      atualizadoEm: real.atualizadoEm ?? null,
    });
    setCamposPreenchidosIA(false);
    setCategoriaManualment(!!real.categoria);
    setCategoriaAutoSugerida(false);
    setModalItem(true);
  }

  function fmtDataHora(s?: string | null) {
    if (!s) return "";
    try {
      const d = new Date(s);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
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

  const { data: itensLocadosVencendoAll = [] } = trpc.compras.getItensLocadosVencendo.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  // Rev. 4903 — locações a vencer também seguem a obra selecionada; consolida
  // tudo só quando o contexto é "todas as obras".
  const itensLocadosVencendo = (itensLocadosVencendoAll as any[]).filter((i: any) =>
    obraContexto === "todos" ? true : obraContexto === null ? i.obraId == null : Number(i.obraId) === Number(obraContexto));

  // Rev. 4554 — o auto-open do alerta de locações saiu daqui: agora é GLOBAL
  // (abre no login em qualquer tela) via <AlertaLocacoesVencendo /> no
  // DashboardLayout. O chip manual + modal desta tela continuam funcionando.

  const [modalDevolverLocacao, setModalDevolverLocacao] = useState(false);
  const [itemDevolverLocacao, setItemDevolverLocacao] = useState<any>(null);
  const [obsDevolucaoLocacao, setObsDevolucaoLocacao] = useState("");
  // Rev. 2567 — modal aberto ao clicar no alerta "N locações a vencer".
  const [modalLocacoesVencendo, setModalLocacoesVencendo] = useState(false);
  // Rev. 4345 — seleção múltipla de locados para devolução em lote.
  const [selecionadosLocacao, setSelecionadosLocacao] = useState<Set<number>>(new Set());
  const [modalDevolverLocacaoLote, setModalDevolverLocacaoLote] = useState(false);
  const [obsDevolucaoLocacaoLote, setObsDevolucaoLocacaoLote] = useState("");
  const [devolverLocacaoLoteProgress, setDevolverLocacaoLoteProgress] = useState(0);
  const [isDevolvendoLote, setIsDevolvendoLote] = useState(false);
  // Rev. 4559 — renovar locação: fluxo REAL (gera nova OC no Compras → Contas a Pagar).
  const [modalRenovarLocacao, setModalRenovarLocacao] = useState<{ item: any } | null>(null);
  const [novaDataVencLocacao, setNovaDataVencLocacao] = useState("");
  const [novoValorOcLocacao, setNovoValorOcLocacao] = useState("");
  // Resolve o id do equipamento locado (tabela equipamentos_locados) a partir
  // do item do catálogo OU do item vindo de getItensLocadosVencendo.
  const resolveLocadoId = (item: any): number | null => {
    if (item?.equipamentoLocadoId != null) return Number(item.equipamentoLocadoId);
    if (item?.equipamentoVinculadoTipo === "locado" && item?.equipamentoVinculadoId != null) return Number(item.equipamentoVinculadoId);
    return null;
  };
  const abrirRenovarLocacao = (item: any) => {
    setModalRenovarLocacao({ item });
    try {
      const base = item?.dataVencimentoLocacao || new Date().toISOString().slice(0, 10);
      const d = new Date(base + "T00:00:00");
      d.setDate(d.getDate() + 30);
      setNovaDataVencLocacao(d.toISOString().slice(0, 10));
    } catch { setNovaDataVencLocacao(""); }
    setNovoValorOcLocacao(item?.valorLocacaoMensal != null && Number(item.valorLocacaoMensal) > 0 ? maskValorBRL(String(Math.round(Number(item.valorLocacaoMensal) * 100))) : "");
  };
  // Máscara de moeda pt-BR: digitação por centavos → "1.234,56".
  const maskValorBRL = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const num = parseInt(digits, 10) / 100;
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  };
  const parseValorBRL = (raw: string): number => {
    const clean = raw.replace(/[R$\s.]/g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  };
  const renovarLocadoMut = trpc.equipamentos.locadoRenovar.useMutation({
    onSuccess: (data: any) => {
      refetch();
      utils.compras.getItensLocadosVencendo.invalidate();
      setModalRenovarLocacao(null);
      toast.success(`${data.numeroCiclo}ª renovação registrada — OC ${data.numeroOc} gerada no Compras e enviada ao Contas a Pagar.`);
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao renovar a locação."),
  });

  const criarMut = trpc.compras.criarItem.useMutation({
    onSuccess: () => { refetch(); utils.warehouse.getDashboard.invalidate(); setModalItem(false); toast.success("Item criado!"); },
    onError: (e) => toast.error("Erro ao criar item: " + e.message),
  });
  const extrairItensAlmoxIAMut = trpc.warehouse.extrairItensAlmoxIA.useMutation({
    onSuccess: (res) => {
      setImportIAItens(res.itens);
      setImportIASelected(new Set(res.itens.map((_:any, i:number) => i)));
      setImportIAStep("review");
    },
    onError: (e) => { toast.error(e.message); setImportIAStep("upload"); },
  });
  async function handleImportIAFile(file: File) {
    if (!file) return;
    const valid = ["application/pdf","image/jpeg","image/jpg","image/png"];
    if (!valid.includes(file.type)) { toast.error("Formato inválido. Use PDF, JPG ou PNG."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Arquivo muito grande. Máximo 10 MB."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = (e.target?.result as string)?.split(",")[1] ?? "";
      setImportIAStep("processing");
      extrairItensAlmoxIAMut.mutate({ companyId, fileBase64: b64, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }
  async function criarItensIA() {
    const selecionados = importIAItens.filter((_,i) => importIASelected.has(i));
    if (selecionados.length === 0) { toast.error("Selecione ao menos um item."); return; }
    setImportIACriando(true);
    setImportIAProgress(0);
    let ok = 0;
    for (let i = 0; i < selecionados.length; i++) {
      const it = selecionados[i];
      try {
        await new Promise<void>((res, rej) => {
          criarMut.mutate(
            { companyId, nome: it.nome, unidade: it.unidade, categoria: it.categoria, quantidadeAtual: it.quantidade, quantidadeMinima: 0 },
            { onSuccess: () => { ok++; res(); }, onError: (e) => rej(e) }
          );
        });
      } catch { /* pula item com erro */ }
      setImportIAProgress(Math.round(((i + 1) / selecionados.length) * 100));
    }
    setImportIACriando(false);
    setImportIAProgress(0);
    toast.success(`${ok} ite${ok === 1 ? "m criado" : "ns criados"} no catálogo!`);
    refetch();
    utils.warehouse.getDashboard.invalidate();
    setImportIAOpen(false);
    setImportIAItens([]);
    setImportIAStep("upload");
  }
  const atualizarMut = trpc.compras.atualizarItem.useMutation({
    onSuccess: () => { refetch(); utils.warehouse.getDashboard.invalidate(); setModalItem(false); toast.success("Item atualizado!"); },
    onError: (e: any) => {
      console.error("[atualizarItem onError]", e, "data:", e?.data, "shape:", e?.shape, "cause:", e?.cause);
      try {
        (window as any).__reportClientError?.("trpc.atualizarItem", e, {
          code: e?.data?.code || e?.shape?.data?.code,
          httpStatus: e?.data?.httpStatus || e?.shape?.data?.httpStatus,
          causeMessage: e?.cause?.message,
          causeName: e?.cause?.name,
          causeStack: e?.cause?.stack,
          shape: e?.shape,
        });
      } catch {}
      const code = e?.data?.code || e?.shape?.data?.code || "";
      const httpStatus = e?.data?.httpStatus || e?.shape?.data?.httpStatus || "";
      const causeMsg = e?.cause?.message ? ` | cause: ${e.cause.message}` : "";
      toast.error(`Erro ao atualizar item: ${e.message}${code ? ` [${code}${httpStatus ? " " + httpStatus : ""}]` : ""}${causeMsg}`, { duration: 12000 });
    },
  });
  const excluirMut = trpc.compras.excluirItem.useMutation({
    onSuccess: () => { refetch(); toast.success("Item removido. Pendência de auditoria registrada."); },
    onError: (e) => { setModalAuditoria((p) => p ? { ...p, carregando: false, erro: e.message } : p); toast.error(e.message); },
  });
  // Rev. 2393 — Mutation SEM callbacks pro fluxo em lote: o handler agrega toast
  // único + 1 refetch final, evitando cascata de toasts/refetches por item.
  const excluirMutSilent = trpc.compras.excluirItem.useMutation();

  function handleExcluirItem(item: any) {
    const subs = item._subItems as any[] | undefined;
    const ids = subs && subs.length > 1 ? subs.map((s: any) => s.id) : [item.id];
    setModalAuditoria({
      tipo: "excluir_item",
      titulo: "Remover item do almoxarifado?",
      subtitulo: `"${item.nome}"${ids.length > 1 ? ` · ${ids.length} registros` : ""}`,
      descricao: (
        <p>Esta ação <strong>desativa o item</strong> no almoxarifado. O histórico de movimentações é preservado.</p>
      ),
      textoBotao: "Remover",
      executar: async ({ senha, justificativa }) => {
        setModalAuditoria((p) => p ? { ...p, carregando: true } : p);
        let firstError: any = null;
        let okCount = 0;
        for (const id of ids) {
          try {
            await excluirMut.mutateAsync({ id, senha, justificativa });
            okCount++;
          } catch (e: any) {
            if (!firstError) firstError = e;
            // Senha incorreta no 1º item → para tudo, mantém modal aberto pra retry.
            if (e?.data?.code === "UNAUTHORIZED" || e?.data?.code === "BAD_REQUEST") break;
          }
        }
        if (firstError && okCount === 0) {
          setModalAuditoria((p) => p ? { ...p, carregando: false } : p);
          return;
        }
        setModalAuditoria(null);
      },
    });
  }
  const devolverLocacaoMut = trpc.compras.devolverLocacaoItem.useMutation({
    onSuccess: () => { refetch(); setModalDevolverLocacao(false); setItemDevolverLocacao(null); setObsDevolucaoLocacao(""); toast.success("Equipamento devolvido ao fornecedor. Item desativado."); },
  });
  // Rev. 4345 — mutation silenciosa para uso no loop de lote.
  const devolverLocacaoMutSilent = trpc.compras.devolverLocacaoItem.useMutation();

  async function confirmarDevolverLocacaoLote() {
    const ids = Array.from(selecionadosLocacao);
    if (ids.length === 0) return;
    setIsDevolvendoLote(true);
    setDevolverLocacaoLoteProgress(0);
    let ok = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await devolverLocacaoMutSilent.mutateAsync({ id: ids[i], observacao: obsDevolucaoLocacaoLote });
        ok++;
      } catch {}
      setDevolverLocacaoLoteProgress(Math.round(((i + 1) / ids.length) * 100));
    }
    setTimeout(() => setDevolverLocacaoLoteProgress(0), 800);
    setIsDevolvendoLote(false);
    setModalDevolverLocacaoLote(false);
    setObsDevolucaoLocacaoLote("");
    setSelecionadosLocacao(new Set());
    refetch();
    utils.warehouse.getDashboard.invalidate();
    toast.success(`${ok} equipamento${ok !== 1 ? "s" : ""} devolvido${ok !== 1 ? "s" : ""} ao fornecedor.`);
  }

  function abrirDevolverLocacao(item: any) { setItemDevolverLocacao(item); setObsDevolucaoLocacao(""); setModalDevolverLocacao(true); }

  function salvarItem() {
    if (!formItem.nome.trim()) { toast.error("Nome é obrigatório."); return; }
    const pQtdAtual = parseNum(formItem.quantidadeAtual);
    const pQtdMin = parseNum(formItem.quantidadeMinima);
    const pValUnit = parseNum(formItem.valorUnitario);
    const pValLoc = parseNum(formItem.valorLocacaoMensal);
    const pDiasAlerta = parseInt(formItem.diasAlertaLocacao) || 7;
    const locacaoPayload = formItem.origem === "alugado" ? {
      origem: "alugado" as const,
      fornecedorLocacao: formItem.fornecedorLocacao || undefined,
      dataInicioLocacao: formItem.dataInicioLocacao || undefined,
      dataVencimentoLocacao: formItem.dataVencimentoLocacao || undefined,
      valorLocacaoMensal: pValLoc || undefined,
      diasAlertaLocacao: pDiasAlerta,
      observacoesLocacao: formItem.observacoesLocacao || undefined,
    } : { origem: "proprio" as const, fornecedorLocacao: null, dataInicioLocacao: null, dataVencimentoLocacao: null, valorLocacaoMensal: null, diasAlertaLocacao: null, observacoesLocacao: null };
    const obraParaCriar = typeof obraContexto === "number" ? obraContexto : null;
    if (editandoId) {
      const payload: any = {
        id: editandoId, nome: formItem.nome, unidade: formItem.unidade,
        categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined,
        quantidadeMinima: pQtdMin, observacoes: formItem.observacoes || undefined,
        especificacao: formItem.especificacao || null,
        fotoUrl: formItem.fotoUrl || null, quantidadeAtual: pQtdAtual,
        valorUnitario: pValUnit || null,
        ...locacaoPayload,
      };
      // Rev. 2388 — Se a quantidade está mudando manualmente, abre modal de auditoria
      // antes de chamar o atualizarMut. O backend valida tolerância 1e-3.
      const itemOriginal: any = itens.find((it: any) => it.id === editandoId);
      const qtdOriginal = Number(itemOriginal?.quantidadeAtual ?? 0);
      const qtdMudou = itemOriginal && Math.abs(pQtdAtual - qtdOriginal) > 1e-3;
      if (qtdMudou) {
        setModalAuditoria({
          tipo: "alterar_qtd",
          titulo: "Alterar quantidade manualmente?",
          subtitulo: `"${itemOriginal.nome}" · ${qtdOriginal} → ${pQtdAtual} ${formItem.unidade}`,
          descricao: (
            <p>Ajustes manuais de estoque ficam <strong>fora do fluxo normal</strong> (entrada/saída). Use apenas pra corrigir erros de cadastro ou contagem física.</p>
          ),
          textoBotao: "Confirmar alteração",
          executar: async ({ senha, justificativa }) => {
            setModalAuditoria((p) => p ? { ...p, carregando: true } : p);
            try {
              await atualizarMut.mutateAsync({ ...payload, auditoria: { senha, justificativa } });
              setModalAuditoria(null);
            } catch {
              setModalAuditoria((p) => p ? { ...p, carregando: false } : p);
            }
          },
        });
        return;
      }
      console.log("[salvarItem→atualizar] payload:", payload);
      try {
        atualizarMut.mutate(payload);
      } catch (e: any) {
        console.error("[salvarItem→atualizar] sync throw:", e, "stack:", e?.stack);
        toast.error("Erro ao atualizar item: " + (e?.message ?? e));
      }
    } else {
      criarMut.mutate({
        companyId, obraId: obraParaCriar, nome: formItem.nome, unidade: formItem.unidade,
        categoria: formItem.categoria || undefined, codigoInterno: formItem.codigoInterno || undefined,
        quantidadeAtual: pQtdAtual, quantidadeMinima: pQtdMin,
        observacoes: formItem.observacoes || undefined, especificacao: formItem.especificacao || undefined,
        fotoUrl: formItem.fotoUrl || undefined,
        valorUnitario: pValUnit || null,
        ...locacaoPayload,
      } as any);
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
    const real = resolveRealItem(i);
    setMovItem(real);
    setFormMov({ tipo, quantidade: 0, obraId: typeof obraContexto === "number" ? obraContexto : 0, motivo: "", observacoes: "" });
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
  const [modalVincEquip, setModalVincEquip] = useState<{ id: number; nome: string; categoria?: string | null; fotoUrl?: string | null; valorUnitario?: string | number | null; obraId?: number | null } | null>(null);
  const [histItem, setHistItem] = useState<any>(null);
  const { data: movimentos = [], isLoading: loadHist } = trpc.compras.listarMovimentos.useQuery(
    { companyId, itemId: histItem?.id ?? 0 },
    { enabled: !!histItem && modalHist }
  );

  // ── AÇÕES RÁPIDAS MOBILE ─────────────────────────────────────────

  // Modal Entrada Rápida (legacy)
  const [modalEntrada, setModalEntrada] = useState(false);
  const [entradaItemId, setEntradaItemId] = useState<number>(0);
  const [entradaQtd, setEntradaQtd] = useState("");
  const [entradaMotivo, setEntradaMotivo] = useState("");
  const [entradaOk, setEntradaOk] = useState<boolean | null>(null);
  const registerEntry = trpc.warehouse.registerEntry.useMutation({
    onSuccess: (d) => { refetch(); setEntradaOk(true); },
    onError: (e) => { toast.error(e.message); setEntradaOk(false); },
  });

  // Modal Smart Entry (Recebimento Inteligente)
  const [modalSmartEntry, setModalSmartEntry] = useState(false);

  // Modal Saída Rápida
  const [modalSaida, setModalSaida] = useState(false);
  const [saidaItemId, setSaidaItemId] = useState<number>(0);
  const [saidaQtd, setSaidaQtd] = useState("");
  const [saidaObraId, setSaidaObraId] = useState<number>(0);
  const [saidaOk, setSaidaOk] = useState<boolean | null>(null);
  const registerExit = trpc.warehouse.registerExit.useMutation({
    onSuccess: () => { refetch(); utils.warehouse.getDashboard.invalidate(); setSaidaOk(true); },
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
  // Múltiplas ferramentas no mesmo empréstimo
  const [empItens, setEmpItens] = useState<Array<{ itemId: number; qtd: string }>>([]);
  const [empSubmitting, setEmpSubmitting] = useState(false);
  const [empOk, setEmpOk] = useState<null | { nome: string; total?: number }>(null);
  const [empErr, setEmpErr] = useState<string | null>(null);
  // Tipo: mão de obra direta vs terceiros
  const [empTipo, setEmpTipo] = useState<"mao_obra" | "terceiro">("mao_obra");
  const [empTerceiroNome, setEmpTerceiroNome] = useState("");
  const [empTerceiroEmpresa, setEmpTerceiroEmpresa] = useState("");
  const [empObservacoes, setEmpObservacoes] = useState("");
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

  // Modal Insumo/Consumível
  const [modalInsumo, setModalInsumo] = useState(false);
  const [insTipo, setInsTipo] = useState<"mao_obra" | "terceiro">("mao_obra");
  const [insTerceiroNome, setInsTerceiroNome] = useState("");
  const [insTerceiroEmpresa, setInsTerceiroEmpresa] = useState("");
  const [insCodigo, setInsCodigo] = useState("");
  const [insSearch, setInsSearch] = useState("");
  const [insSelecionado, setInsSelecionado] = useState<any>(null);
  const [insShowSug, setInsShowSug] = useState(false);
  const [insItemId, setInsItemId] = useState<number>(0);
  const [insItemSearch, setInsItemSearch] = useState("");
  const [insItemFocused, setInsItemFocused] = useState(false);
  const [insQtd, setInsQtd] = useState("1");
  const [insObraId, setInsObraId] = useState<number>(0);
  const [insMotivo, setInsMotivo] = useState("");
  const [insOk, setInsOk] = useState<null | { nome: string; item: string }>(null);
  const [insErr, setInsErr] = useState<string | null>(null);
  // Rev. 4801 — saída p/ terceiro SEMPRE pergunta de quem é o custo (poka-yoke).
  const [insCustoDe, setInsCustoDe] = useState<"" | "nosso" | "terceiro">("");
  const [insContratoId, setInsContratoId] = useState<number>(0);
  const [insDescTipo, setInsDescTipo] = useState<"epi" | "ferramental" | "insumo" | "outro">("insumo");
  const { data: contratosTerceiro = [] } = trpc.terceiroContratos.listarContratos.useQuery(
    { companyId },
    { enabled: modalInsumo && insTipo === "terceiro" && insCustoDe === "terceiro" },
  );
  const { data: insSugestoes = [] } = trpc.warehouse.searchFuncionarios.useQuery(
    { companyId, q: insSearch },
    { enabled: insSearch.length >= 2 && !insSelecionado }
  );
  const registerInsumo = trpc.warehouse.registerInsumo.useMutation({
    onSuccess: (d: any) => { refetch(); setInsOk({ nome: d.funcionarioNome, item: d.itemNome }); setInsErr(null); },
    onError: (e: any) => { setInsErr(e.message); setInsOk(null); },
  });
  function resetInsumo() {
    setInsTipo("mao_obra"); setInsTerceiroNome(""); setInsTerceiroEmpresa("");
    setInsCodigo(""); setInsSearch(""); setInsSelecionado(null); setInsShowSug(false);
    setInsItemId(0); setInsItemSearch(""); setInsItemFocused(false); setInsQtd("1");
    setInsObraId(typeof obraContexto === "number" ? obraContexto : 0);
    setInsMotivo(""); setInsOk(null); setInsErr(null);
    setInsCustoDe(""); setInsContratoId(0); setInsDescTipo("insumo");
  }
  function selecionarFuncionarioIns(f: any) { setInsSelecionado(f); setInsCodigo(f.codigoInterno); setInsSearch(f.nomeCompleto); setInsShowSug(false); }

  // Modal Transferência entre Almoxarifados
  const [modalTransf, setModalTransf] = useState(false);
  const [transfOrigemTipo, setTransfOrigemTipo] = useState<"central" | "obra">("central");
  const [transfOrigemObraId, setTransfOrigemObraId] = useState<number>(0);
  const [transfItemId, setTransfItemId] = useState<number>(0);
  const [transfQtd, setTransfQtd] = useState("1");
  const [transfDestinoTipo, setTransfDestinoTipo] = useState<"central" | "obra">("obra");
  const [transfDestinoObraId, setTransfDestinoObraId] = useState<number>(0);
  const [transfMotivo, setTransfMotivo] = useState("");
  const [transfBusca, setTransfBusca] = useState("");
  const [transfDropOpen, setTransfDropOpen] = useState(false);
  const [transfOk, setTransfOk] = useState<null | { item: string; origem: string; destino: string }>(null);
  const [transfErr, setTransfErr] = useState<string | null>(null);

  // Busca itens do almoxarifado de origem para seleção
  const { data: itensOrigem = [] } = trpc.compras.listarItens.useQuery(
    { companyId, obraId: transfOrigemTipo === "central" ? null : transfOrigemObraId > 0 ? transfOrigemObraId : null },
    { enabled: modalTransf && (transfOrigemTipo === "central" || transfOrigemObraId > 0) }
  );

  const createTransferencia = trpc.warehouse.createTransferencia.useMutation({
    onSuccess: (d: any) => {
      refetch();
      const origemLabel = transfOrigemTipo === "central" ? "Central" : (obrasAtivas as any[]).find((o: any) => o.id === transfOrigemObraId)?.nome ?? "Obra";
      const destinoLabel = transfDestinoTipo === "central" ? "Central" : (obrasParaTransferir as any[]).find((o: any) => o.id === transfDestinoObraId)?.nome ?? "Obra";
      setTransfOk({ item: d.itemNome, origem: origemLabel, destino: destinoLabel });
      setTransfErr(null);
    },
    onError: (e: any) => { setTransfErr(e.message); setTransfOk(null); },
  });

  function resetTransf() {
    setTransfItemId(0); setTransfQtd("1"); setTransfMotivo(""); setTransfOk(null); setTransfErr(null); setTransfBusca(""); setTransfDropOpen(false);
  }

  // Modal Fechar Dia (devolução) — Rev. 4005: antes só trazia empréstimos de HOJE
  // (listTodayLoans), então pendências de dias anteriores desapareciam da tela de
  // fechamento. Agora usa listOpenLoans (todos os abertos, sem filtro de data) +
  // filtro de obra opcional no próprio modal.
  const [modalFecharDia, setModalFecharDia] = useState(false);
  const [fecharDiaObraFiltro, setFecharDiaObraFiltro] = useState<number | "todas">("todas");
  // Rev. 4773 — sempre carregado (não só com o modal aberto) p/ o alerta piscante
  // de pendências no botão DEVOLUÇÃO.
  const { data: emprestimosAbertos = [], refetch: refetchLoans } = trpc.warehouse.listOpenLoans.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // Rev. 4772 — dia de Brasília
  // Rev. 4903 — pendências (banner + badge DEVOLUÇÃO) seguem a OBRA selecionada;
  // só consolidam tudo quando o contexto é "todas as obras". Central (null) mostra
  // só empréstimos sem obra.
  const emprestimosPendentes = (emprestimosAbertos as any[]).filter((l) =>
    obraContexto === "todos" ? true : obraContexto === null ? l.obraId == null : Number(l.obraId) === Number(obraContexto));
  const emprestimosHoje = (emprestimosAbertos as any[])
    .filter((l) => fecharDiaObraFiltro === "todas" || Number(l.obraId) === Number(fecharDiaObraFiltro))
    .sort((a, b) => String(a.dataEmprestimo).localeCompare(String(b.dataEmprestimo)));
  const returnLoan = trpc.warehouse.returnLoanById.useMutation({
    onSuccess: () => { refetchLoans(); refetchLoansAbertos(); refetch(); utils.warehouse.getDashboard.invalidate(); toast.success("Ferramenta devolvida!"); },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 4011 — Assinatura opcional na devolução de ferramenta ("se possível", conforme
  // pedido do usuário — nem toda obra tem tablet disponível, então NÃO é bloqueante).
  const [modalAssinaturaDevolucao, setModalAssinaturaDevolucao] = useState<{ tipo: "individual" | "grupo"; loan?: any; grupo?: { itens: any[] } } | null>(null);
  const [assinaturaDevolucaoDataUrl, setAssinaturaDevolucaoDataUrl] = useState<string | null>(null);
  async function confirmarDevolucaoComAssinatura() {
    const ctx = modalAssinaturaDevolucao;
    if (!ctx) return;
    const assinaturaUrl = assinaturaDevolucaoDataUrl || undefined;
    if (ctx.tipo === "individual" && ctx.loan) {
      returnLoan.mutate({ loanId: ctx.loan.id, assinaturaUrl } as any);
    } else if (ctx.tipo === "grupo" && ctx.grupo) {
      for (const it of ctx.grupo.itens) {
        try { await returnLoan.mutateAsync({ loanId: it.id, assinaturaUrl } as any); } catch { /* segue */ }
      }
    }
    setModalAssinaturaDevolucao(null);
    setAssinaturaDevolucaoDataUrl(null);
  }

  // ── Modal Registros ─────────────────────────────────────────────
  const [modalRegistros, setModalRegistros] = useState(false);
  const [abaRegistros, setAbaRegistros] = useState<"entradas" | "saidas" | "emprestados" | "insumos" | "transferencias" | "cadastros">("entradas");
  const [filtroData, setFiltroData] = useState<string>(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  const { data: movEntradas = [], isLoading: loadingEntradas } = trpc.warehouse.listMovements.useQuery(
    { companyId, tipo: "entrada", limit: 300, data: filtroData },
    { enabled: !!companyId && modalRegistros && abaRegistros === "entradas" }
  );
  const { data: movSaidas = [], isLoading: loadingSaidas } = trpc.warehouse.listMovements.useQuery(
    { companyId, tipo: "saida", limit: 300, data: filtroData },
    { enabled: !!companyId && modalRegistros && abaRegistros === "saidas" }
  );
  const { data: loansAbertos = [], isLoading: loadingLoans, refetch: refetchLoansAbertos } = trpc.warehouse.listOpenLoans.useQuery(
    { companyId, data: filtroData },
    { enabled: !!companyId && modalRegistros && abaRegistros === "emprestados" }
  );
  const { data: insumosRegistros = [], isLoading: loadingInsumos } = trpc.warehouse.listInsumos.useQuery(
    { companyId, limit: 300, data: filtroData },
    { enabled: !!companyId && modalRegistros && abaRegistros === "insumos" }
  );
  const { data: transferenciasRegistros = [], isLoading: loadingTransferencias } = trpc.warehouse.listTransferencias.useQuery(
    { companyId, limit: 300, data: filtroData },
    { enabled: !!companyId && modalRegistros && abaRegistros === "transferencias" }
  );

  function resetEntrada() { setEntradaItemId(0); setEntradaQtd(""); setEntradaMotivo(""); setEntradaOk(null); }
  function resetSaida() { setSaidaItemId(0); setSaidaQtd(""); setSaidaObraId(typeof obraContexto === "number" ? obraContexto : 0); setSaidaOk(null); }
  function resetEmprestimo() { setEmpCodigo(""); setEmpSearch(""); setEmpSelecionado(null); setEmpShowSug(false); setEmpItemId(0); setEmpQtd("1"); setEmpItens([]); setEmpSubmitting(false); setEmpOk(null); setEmpErr(null); setEmpTipo("mao_obra"); setEmpTerceiroNome(""); setEmpTerceiroEmpresa(""); setEmpObservacoes(""); }

  // ── Abrir modal via URL param (?modal=X) e/ou setar obra (?obra=ID) ────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modal = params.get("modal");
    const obraParam = params.get("obra");
    if (!modal && !obraParam) return;
    // Remove os params da URL sem recarregar
    setLocation("/almoxarifado", { replace: true });
    // Rev. 2391 — Deep-link da tela de Obras: foca o almoxarifado da obra X.
    if (obraParam) {
      const obraId = Number(obraParam);
      if (Number.isFinite(obraId) && obraId > 0) setObraContexto(obraId);
    }
    if (modal === "entrada")      { setModalSmartEntry(true); }
    if (modal === "ferramentas")  { resetEmprestimo(); setModalEmprestimo(true); }
    if (modal === "insumo")       { resetInsumo(); setModalInsumo(true); }
    if (modal === "transferir")   { resetTransf(); setModalTransf(true); }
    if (modal === "fechardia")    { setModalFecharDia(true); }
    if (modal === "cadastros")    { setAbaRegistros("cadastros"); setModalRegistros(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);
  function selecionarFuncionario(f: any) { setEmpSelecionado(f); setEmpCodigo(f.codigoInterno); setEmpSearch(f.nomeCompleto); setEmpShowSug(false); }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header — Rev. 4559: 2 linhas (título + ações | alertas), com wrap responsivo */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
          <div className="max-w-7xl mx-auto space-y-3">
            {/* Linha 1: título à esquerda, ações principais à direita */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Boxes className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span className="break-words">
                    {obraContexto === null
                      ? "Almoxarifado Central"
                      : `Almoxarifado — ${obrasAtivas.find(o => o.id === obraContexto)?.nome ?? "Obra"}`}
                  </span>
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">{itens.length.toLocaleString("pt-BR")} ite{itens.length !== 1 ? "ns" : "m"} cadastrado{itens.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => setViewMode("cards")} className={`px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition ${viewMode === "cards" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                    <LayoutGrid className="h-3.5 w-3.5" /> Cards
                  </button>
                  <button onClick={() => setViewMode("table")} className={`px-3 py-2 flex items-center gap-1.5 text-xs font-medium transition ${viewMode === "table" ? "bg-emerald-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                    <List className="h-3.5 w-3.5" /> Tabela
                  </button>
                </div>
                {/* Rev. 2388 — Botão Auditoria com badge de pendências (só admin) */}
                {isAdmin && (
                  <button
                    onClick={() => setModalAuditoriaList(true)}
                    className="relative flex items-center gap-1.5 bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium px-3 py-2 rounded-lg transition"
                    title="Auditoria do almoxarifado"
                  >
                    <ShieldCheck className="h-4 w-4" /> Auditoria
                    {pendenciasCount.data && pendenciasCount.data.count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center">
                        {pendenciasCount.data.count}
                      </span>
                    )}
                  </button>
                )}
                {/* Rev. 4539 — obra somente-leitura: esconde ações de escrita */}
                {!somenteLeitura && (<>
                <button onClick={() => { setImportIAOpen(true); setImportIAStep("upload"); setImportIAItens([]); setImportIASelected(new Set()); }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
                  <Sparkles className="h-4 w-4" /> Importar (IA)
                </button>
                <button onClick={abrirNovo} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
                  <Plus className="h-4 w-4" /> Novo Item
                </button>
                </>)}
              </div>
            </div>
            {/* Linha 2: chips de alerta */}
            <div className="flex flex-wrap items-center gap-2">
              <AlertasAlmoxarifado companyId={companyId} />
                {itensLocadosVencendo.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setModalLocacoesVencendo(true)}
                    className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-full px-3.5 py-1.5 transition hover:bg-amber-100 hover:border-amber-400 cursor-pointer"
                    title="Ver detalhes das locações a vencer"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">{itensLocadosVencendo.length} {itensLocadosVencendo.length > 1 ? "locações" : "locação"} a vencer</span>
                  </button>
                )}
                {totalCriticos > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-full px-3.5 py-1.5">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-xs font-semibold text-red-700 whitespace-nowrap">{totalCriticos} abaixo do mínimo</span>
                  </div>
                )}
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
              value={obraContexto === "todos" ? "todos" : (obraContexto ?? "central")}
              onChange={e => {
                const v = e.target.value;
                setObraContexto(v === "central" ? null : v === "todos" ? "todos" : Number(v));
              }}
              className="flex-1 h-9 text-sm font-medium border border-gray-200 rounded-lg px-3 bg-white text-gray-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
            >
              <option value="todos">📊 Todos os Almoxarifados (Consolidado)</option>
              <option value="central">🏢 Almoxarifado Central</option>
              {obrasAtivas.length > 0 && (
                <optgroup label="── Por Obra ──">
                  {obrasAtivas.map((obra: any) => (
                    <option key={obra.id} value={obra.id}>
                      🏗️ {obra.codigo ? `${obra.codigo} – ${obra.nome}` : obra.nome}{obra.podeEditar === false ? " — 👁 Somente leitura" : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {/* Rev. 4539 — banner de somente-leitura */}
          {somenteLeitura && (
            <div className="max-w-7xl mx-auto mt-2 flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-lg px-3 py-2">
              <span className="shrink-0">👁</span>
              <span>
                <b>Somente leitura</b> — você pode consultar o estoque e o giro desta obra, mas não pode operar aqui.
                Precisa de material? Peça uma <b>transferência</b> ao gestor do almoxarifado desta obra.
              </span>
            </div>
          )}
        </div>

        {/* ── AÇÕES RÁPIDAS MOBILE ──────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Rev. 4774 — bannerão piscante "puxão de orelha" de devolução pendente */}
          {!somenteLeitura && emprestimosPendentes.length > 0 && (
            <button
              onClick={() => { setFecharDiaObraFiltro(typeof obraContexto === "number" ? obraContexto : "todas"); setModalFecharDia(true); }}
              className="w-full mb-4 bg-red-600 hover:bg-red-700 active:scale-[0.99] text-white rounded-2xl px-4 py-5 shadow-lg border-4 border-red-300 animate-pulse text-left transition"
            >
              <span className="flex items-center gap-4">
                <AlertTriangle className="w-12 h-12 flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-2xl font-extrabold leading-tight">
                    🚨 ATENÇÃO, ALMOXARIFE! {emprestimosPendentes.length} ferramenta{emprestimosPendentes.length !== 1 ? "s" : ""} NÃO devolvida{emprestimosPendentes.length !== 1 ? "s" : ""}{typeof obraContexto === "number" ? " nesta obra" : ""}!
                  </span>
                  <span className="block text-base font-semibold mt-1 opacity-95">
                    Ferramenta não dorme na obra: cobre a devolução de TUDO antes de fechar o dia. Toque aqui para ver quem está devendo.
                  </span>
                </span>
              </span>
            </button>
          )}
          {/* Rev. 4539 — obra somente-leitura: esconde os botões de operação */}
          {!somenteLeitura && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {/* ENTRADA */}
            {/* Rev. 2376 — badge piscante com quantidade de OCs de material pendentes de recebimento */}
            <button
              onClick={() => setModalSmartEntry(true)}
              className={`relative flex flex-col items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition ${qtdMaterialPendente > 0 ? "ring-4 ring-amber-300 ring-offset-2 animate-pulse" : ""}`}
              title={qtdMaterialPendente > 0 ? `${qtdMaterialPendente} OC${qtdMaterialPendente !== 1 ? "s" : ""} de material pra receber — toque pra dar entrada` : "Dar entrada de material"}
            >
              {qtdMaterialPendente > 0 && (
                <>
                  <span className="absolute -top-2 -right-2 z-10 min-w-[28px] h-7 px-2 inline-flex items-center justify-center bg-red-600 text-white text-sm font-extrabold rounded-full border-2 border-white shadow-lg animate-bounce">
                    {qtdMaterialPendente}
                  </span>
                  <span className="absolute inset-0 rounded-2xl bg-amber-400/30 animate-ping pointer-events-none" />
                </>
              )}
              <ArrowUpCircle className="w-8 h-8 relative z-[1]" />
              <span className="relative z-[1] text-center leading-tight">
                ENTRADA
                <span className="block text-[11px] font-semibold opacity-90">DE MATERIAL</span>
                {qtdMaterialPendente > 0 && (
                  <span className="block text-[10px] font-semibold mt-0.5 bg-white/25 rounded px-1 py-0.5">
                    {qtdMaterialPendente} pra receber
                  </span>
                )}
              </span>
            </button>
            {/* SAÍDA */}
            <button
              onClick={() => { resetInsumo(); setModalInsumo(true); }}
              className="flex flex-col items-center justify-center gap-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition"
            >
              <ArrowDownCircle className="w-8 h-8" />
              <span className="text-center leading-tight">
                SAÍDA
                <span className="block text-[11px] font-semibold opacity-90">DE MATERIAL</span>
              </span>
            </button>
            {/* Rev. 4566 — ENTREGA DE FERRAMENTA (ex-"Ferramentas") */}
            <button
              onClick={() => { resetEmprestimo(); setModalEmprestimo(true); }}
              className="flex flex-col items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition"
            >
              <Wrench className="w-8 h-8" />
              <span className="text-center leading-tight">
                ENTREGA
                <span className="block text-[11px] font-semibold opacity-90">DE FERRAMENTA</span>
              </span>
            </button>
            {/* Rev. 4566 — DEVOLUÇÃO DE FERRAMENTA (ex-"Fechar Dia"), ao lado da Entrega */}
            <button
              onClick={() => { setFecharDiaObraFiltro(typeof obraContexto === "number" ? obraContexto : "todas"); setModalFecharDia(true); }}
              className={`relative flex flex-col items-center justify-center gap-2 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition ${
                emprestimosPendentes.length > 0
                  ? "bg-red-600 hover:bg-red-700 animate-pulse"
                  : "bg-gray-700 hover:bg-gray-800"
              }`}
            >
              {/* Rev. 4773 — alerta piscante: ferramentas em aberto p/ devolver até o fim do dia */}
              {emprestimosPendentes.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-white text-red-600 border-2 border-red-600 text-xs font-extrabold rounded-full min-w-[26px] h-[26px] px-1 flex items-center justify-center shadow">
                  {emprestimosPendentes.length}
                </span>
              )}
              <ClipboardCheck className="w-8 h-8" />
              <span className="text-center leading-tight">
                DEVOLUÇÃO
                <span className="block text-[11px] font-semibold opacity-90">DE FERRAMENTA</span>
              </span>
            </button>
            {/* Rev. 4566 — TRANSFERIR (movido pra direita, depois do par de ferramentas) */}
            <button
              onClick={() => {
                resetTransf();
                const ctx = obraContexto;
                if (ctx === null) { setTransfOrigemTipo("central"); setTransfOrigemObraId(0); }
                else if (typeof ctx === "number") { setTransfOrigemTipo("obra"); setTransfOrigemObraId(ctx); }
                else { setTransfOrigemTipo("central"); setTransfOrigemObraId(0); }
                setModalTransf(true);
              }}
              className="flex flex-col items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-base shadow-md transition"
            >
              <ArrowLeftRight className="w-8 h-8" />
              <span className="text-center leading-tight">
                TRANSFERIR
                <span className="block text-[11px] font-semibold opacity-90">MATERIAL E EQUIPAMENTO</span>
              </span>
            </button>
            {/* Rev. 2317 — IMPORTAR PDF removido daqui (continua disponível no hero da tela Equipamentos Locados). */}
            {/* Rev. 2316 — RECEBER LOCAÇÃO (cadastro pontual de equipamento locado) */}
            {/* Rev. 2375 — badge piscante com quantidade de OCs de locação pendentes de recebimento */}
            <button
              onClick={() => setLocation("/equipamentos/locados?action=receber")}
              className={`relative flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-sm shadow-md transition text-center leading-tight ${qtdLocacaoPendente > 0 ? "ring-4 ring-amber-300 ring-offset-2 animate-pulse" : ""}`}
              title={qtdLocacaoPendente > 0 ? `${qtdLocacaoPendente} equipamento${qtdLocacaoPendente !== 1 ? "s" : ""} pra chegar — toque pra receber` : "Receber equipamento locado"}
            >
              {qtdLocacaoPendente > 0 && (
                <>
                  <span className="absolute -top-2 -right-2 z-10 min-w-[28px] h-7 px-2 inline-flex items-center justify-center bg-red-600 text-white text-sm font-extrabold rounded-full border-2 border-white shadow-lg animate-bounce">
                    {qtdLocacaoPendente}
                  </span>
                  <span className="absolute inset-0 rounded-2xl bg-amber-400/30 animate-ping pointer-events-none" />
                </>
              )}
              <Truck className="w-8 h-8 relative z-[1]" />
              <span className="relative z-[1]">
                RECEBER<br />LOCAÇÃO
                {qtdLocacaoPendente > 0 && (
                  <span className="block text-[10px] font-semibold mt-0.5 bg-white/25 rounded px-1 py-0.5">
                    {qtdLocacaoPendente} pra chegar
                  </span>
                )}
              </span>
            </button>
            {/* Rev. 4340 — ACEITAR FERRAMENTAS (equipamentos próprios em trânsito para esta obra) */}
            {typeof obraContexto === "number" && (
              <button
                onClick={() => setModalEquipAceite({ list: equipTransfPendentes })}
                className={`relative flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-sm shadow-md transition text-center leading-tight ${qtdEquipTransfPendente > 0 ? "ring-4 ring-amber-300 ring-offset-2 animate-pulse" : ""}`}
                title={qtdEquipTransfPendente > 0 ? `${qtdEquipTransfPendente} ferramenta(s) própria(s) aguardando aceite` : "Aceitar ferramentas próprias transferidas"}
              >
                {qtdEquipTransfPendente > 0 && (
                  <>
                    <span className="absolute -top-2 -right-2 z-10 min-w-[28px] h-7 px-2 inline-flex items-center justify-center bg-red-600 text-white text-sm font-extrabold rounded-full border-2 border-white shadow-lg animate-bounce">
                      {qtdEquipTransfPendente}
                    </span>
                    <span className="absolute inset-0 rounded-2xl bg-amber-400/30 animate-ping pointer-events-none" />
                  </>
                )}
                <ArrowLeftRight className="w-7 h-7 relative z-[1]" />
                <span className="relative z-[1]">
                  ACEITAR<br />FERRAM.
                  {qtdEquipTransfPendente > 0 && (
                    <span className="block text-[10px] font-semibold mt-0.5 bg-white/25 rounded px-1 py-0.5">
                      {qtdEquipTransfPendente} aguardando
                    </span>
                  )}
                </span>
              </button>
            )}
            {/* Rev. 2316 — DEVOLVER/ENTREGAR LOCAÇÃO (baixa de saída do equipamento locado) */}
            {/* Rev. 2452 — passa o contexto atual do almoxarifado pro picker:
                - Almoxarifado Central NÃO recebe locações (locados são por obra) →
                  bloqueia com toast e não navega.
                - Obra específica → passa `obraId` pra pré-filtrar o picker
                  e evitar devolver equipamento da obra errada (1.314 itens
                  rolando juntos confunde o operador).
                - "Todos" → picker sem filtro (comportamento atual). */}
            <button
              onClick={() => {
                if (obraContexto === "central") {
                  toast.warning("Almoxarifado Central não recebe locações. Selecione uma obra pra devolver equipamento alugado.");
                  return;
                }
                const qs = typeof obraContexto === "number"
                  ? `?action=devolver&obraId=${obraContexto}`
                  : `?action=devolver`;
                setLocation(`/equipamentos/locados${qs}`);
              }}
              className="flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 active:scale-95 text-white rounded-2xl p-4 min-h-[80px] font-bold text-sm shadow-md transition text-center leading-tight"
            >
              <ArrowUpCircle className="w-8 h-8" />
              DEVOLVER<br />LOCAÇÃO
            </button>
          </div>
          )}

          {/* ── VER REGISTROS (linha secundária) ────────────────── */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[
              { label: "Entradas",      aba: "entradas"      as const, icon: "↓",  color: "text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100" },
              { label: "Ferram. Aberto", aba: "emprestados"   as const, icon: "🔧", color: "text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100" },
              { label: "Insumos",       aba: "insumos"       as const, icon: "🛒", color: "text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100" },
              { label: "Transferênc.", aba: "transferencias" as const, icon: "↔",  color: "text-purple-700 border-purple-300 bg-purple-50 hover:bg-purple-100" },
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

        {/* ════════════ VISÃO CONSOLIDADA ════════════ */}
        {obraContexto === "todos" && (() => {
          // Rev. 2451 — `consListFinal` agora é useMemo no escopo do componente
          // (ver L443+), pra ser reutilizado pela barra inferior modoClassificarEquip.
          const consItens = consolidado?.itens ?? [];

          const consTotalItens = consItens.length;
          const consEstoqueOk = consItens.filter((i: any) => i.quantidadeMinima === 0 || i.quantidadeTotal >= i.quantidadeMinima).length;
          const consEstoqueBaixo = consItens.filter((i: any) => { const a = i.quantidadeTotal, m = i.quantidadeMinima; return m > 0 && a < m && a >= m * 0.5; }).length;
          const consEstoqueCritico = consItens.filter((i: any) => { const m = i.quantidadeMinima; return m > 0 && i.quantidadeTotal < m * 0.5; }).length;
          const consCategs = [...new Set(consItens.map((i: any) => i.categoria).filter(Boolean))].sort();

          // ── Valor Total por Almoxarifado (todas as categorias) ──
          // FIX: detecta formato. Strings vindas do Drizzle (numeric) chegam em formato US ("106.33").
          // Só trata como pt-BR ("1.500,00") quando a string contém vírgula.
          const parseValor = (v: any): number => {
            if (v === null || v === undefined || v === "") return 0;
            if (typeof v === "number") return isFinite(v) ? v : 0;
            const raw = String(v).trim();
            const s = raw.includes(",")
              ? raw.replace(/\./g, "").replace(",", ".") // pt-BR
              : raw;                                       // US / numérico puro
            const n2 = parseFloat(s);
            return isNaN(n2) ? 0 : n2;
          };
          // Rev. 2418 — Valor Total respeita filtros visíveis E exclui equipamentos
          // LOCADOS por padrão (são contratados, não estoque-material da empresa).
          // Regra: usa a lista JÁ FILTRADA (consListFinal) como fonte; se o usuário
          // não filtrou explicitamente por "locado"/"vinculado", remove locados do total.
          const incluirLocadosNoTotal = filtroEquip === "locado" || filtroEquip === "vinculado";
          const itensParaTotal = incluirLocadosNoTotal
            ? consListFinal
            : consListFinal.filter((i: any) => i.equipamentoVinculadoTipo !== "locado");
          // Inicializa Central + todas as obras ativas (para sempre listar, mesmo com zero)
          const valorMap = new Map<string, { nome: string; valor: number; itens: number }>();
          valorMap.set("central", { nome: "Almoxarifado Central", valor: 0, itens: 0 });
          for (const o of (obrasAtivas as any[])) {
            valorMap.set(`obra:${o.id}`, { nome: o.nome || `Obra #${o.id}`, valor: 0, itens: 0 });
          }
          for (const item of itensParaTotal) {
            const vu = parseValor(item.valorUnitario);
            if (!vu) continue;
            for (const a of (item.almoxarifados ?? [])) {
              const key = a.tipo === "central" ? "central" : `obra:${a.obraId}`;
              const nome = a.tipo === "central"
                ? "Almoxarifado Central"
                : ((obrasAtivas as any[]).find((o: any) => o.id === a.obraId)?.nome || `Obra #${a.obraId}`);
              const cur = valorMap.get(key) || { nome, valor: 0, itens: 0 };
              cur.valor += vu * (Number(a.quantidade) || 0);
              cur.itens += 1;
              valorMap.set(key, cur);
            }
          }
          const valorPorAlmox = Array.from(valorMap.values()).sort((a, b) => b.valor - a.valor);
          const valorTotal = valorPorAlmox.reduce((s, e) => s + e.valor, 0);
          // Flags p/ rótulos auxiliares no banner.
          const totalReflectsFilter =
            !!busca.trim() || filtroCateg !== "todas" || apenasAbaixo || filtroEquip !== "todos" || filtroEstoque !== "todos";
          const qtdLocadosExcluidos = incluirLocadosNoTotal
            ? 0
            : consListFinal.filter((i: any) => i.equipamentoVinculadoTipo === "locado").length;
          const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          return (
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total de Itens", v: consTotalItens, icon: Package, color: "text-blue-600", bg: "bg-blue-50", f: "todos" as const, ring: "ring-blue-400" },
                { label: "Estoque OK", v: consEstoqueOk, icon: BarChart2, color: "text-emerald-600", bg: "bg-emerald-50", f: "ok" as const, ring: "ring-emerald-400" },
                { label: "Estoque Baixo", v: consEstoqueBaixo, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", f: "baixo" as const, ring: "ring-yellow-400" },
                { label: "Estoque Crítico", v: consEstoqueCritico, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", f: "critico" as const, ring: "ring-red-400" },
              ].map((k, i) => {
                const ativo = filtroEstoque === k.f && k.f !== "todos";
                return (
                <button
                  key={i}
                  onClick={() => setFiltroEstoque(prev => (k.f === "todos" || prev === k.f) ? "todos" : k.f)}
                  className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 text-left transition active:scale-[0.98] cursor-pointer hover:shadow-md ${ativo ? `border-transparent ring-2 ${k.ring}` : "border-gray-100"}`}
                  title={k.f === "todos" ? "Mostrar todos os itens" : `Filtrar itens: ${k.label}`}
                >
                  <div className={`${k.bg} p-2 rounded-lg`}>
                    <k.icon className={`h-5 w-5 ${k.color}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase tracking-wide">{k.label}</p>
                    <p className={`text-2xl font-bold ${k.color}`}>{k.v.toLocaleString("pt-BR")}</p>
                    {ativo && <p className={`text-[10px] font-semibold ${k.color}`}>Filtrando · toque p/ limpar</p>}
                  </div>
                </button>
                );
              })}
            </div>

            {consolidado && (
              <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 rounded-2xl px-6 py-4 flex items-center justify-between text-white shadow-md">
                <div>
                  <p className="text-sm font-medium opacity-80">
                    Valor Total do Estoque (empresa)
                    {totalReflectsFilter && <span className="ml-2 text-[10px] uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-full">filtrado</span>}
                  </p>
                  <p className="text-3xl font-black mt-1">R$ {fmtBRL(valorTotal)}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {itensParaTotal.length.toLocaleString("pt-BR")} ite{itensParaTotal.length !== 1 ? "ns" : "m"} considerado{itensParaTotal.length !== 1 ? "s" : ""} · {itensParaTotal.filter((i: any) => i.valorUnitario).length.toLocaleString("pt-BR")} com preço cadastrado
                    {qtdLocadosExcluidos > 0 && <> · <span className="font-semibold">{qtdLocadosExcluidos} locado{qtdLocadosExcluidos !== 1 ? "s" : ""} excluído{qtdLocadosExcluidos !== 1 ? "s" : ""}</span></>}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {consolidado.itens.filter((i: any) => !i.valorUnitario || parseFloat(i.valorUnitario) === 0).length > 0 && (
                    <button
                      onClick={() => dispararPreencherIA("empresa")}
                      disabled={preenchendoIA}
                      title="Estimar preço médio de mercado dos itens sem valor cadastrado usando IA"
                      className="relative overflow-hidden inline-flex items-center gap-2 bg-white/95 hover:bg-white text-purple-700 font-semibold px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                    >
                      {preenchendoIA && (
                        <span className="absolute inset-y-0 left-0 bg-purple-200/60 transition-all duration-300 pointer-events-none" style={{ width: `${iaPct}%` }} />
                      )}
                      {preenchendoIA ? (
                        <span className="relative z-[1] inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Preenchendo… {Math.round(iaPct)}%</span>
                      ) : (
                        <>🤖 Preencher {consolidado.itens.filter((i: any) => !i.valorUnitario || parseFloat(i.valorUnitario) === 0).length} preços com IA</>
                      )}
                    </button>
                  )}
                  <BarChart2 className="h-12 w-12 opacity-30" />
                </div>
              </div>
            )}

            {/* Rev. 1609 — Card "Valor por Almoxarifado":
                Só renderiza quando consolidado já carregou E há ao menos 1 almoxarifado com valor > 0.
                Anteriormente o card aparecia sempre (valorMap é pré-populado com todas as obras em zero),
                exibindo um mar de "R$ 0,00 · 0 itens" durante loading, em empresa sem itens precificados
                ou se a query falhasse silenciosamente — o que parecia bug. */}
            {loadingConsolidado ? (
              <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm px-6 py-8 flex items-center justify-center gap-3 text-emerald-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">Calculando valor do estoque por almoxarifado…</span>
              </div>
            ) : valorTotal > 0 && valorPorAlmox.some(e => e.valor > 0) ? (
              <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-700 to-teal-500 px-6 py-4 flex items-center justify-between text-white">
                  <div>
                    <p className="text-sm font-medium opacity-90 flex items-center gap-2">
                      <BarChart2 className="h-4 w-4" /> Valor Total do Estoque por Almoxarifado
                    </p>
                    <p className="text-xs opacity-80 mt-0.5">Soma de todos os itens com preço cadastrado, separada por almoxarifado</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide opacity-80">Total geral</p>
                    <p className="text-2xl font-black">R$ {fmtBRL(valorTotal)}</p>
                  </div>
                </div>
                <div className="divide-y divide-emerald-100">
                  {/* Rev. 2419 — user pediu TODAS as obras ativas visíveis aqui,
                      mesmo as com valor zero. valorMap já inclui Central + todas
                      as obras ativas (L1636-1640); só removemos o filtro de zero. */}
                  {valorPorAlmox.map((e, idx) => {
                    const pct = valorTotal > 0 ? (e.valor / valorTotal) * 100 : 0;
                    const zerado = e.valor <= 0;
                    return (
                      <div key={idx} className={`px-6 py-3 flex items-center gap-4 ${zerado ? "opacity-60" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${zerado ? "text-gray-500" : "text-gray-800"}`}>{e.nome}</p>
                          <div className="mt-1.5 h-1.5 bg-emerald-50 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-600 to-teal-400" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="text-right">
                          {zerado ? (
                            <p className="text-base font-medium text-gray-400">R$ 0,00</p>
                          ) : (
                            <p className="text-base font-bold text-emerald-700">R$ {fmtBRL(e.valor)}</p>
                          )}
                          <p className="text-[11px] text-gray-400">{pct.toFixed(1)}% · {Number(e.itens).toLocaleString("pt-BR")} ite{e.itens !== 1 ? "ns" : "m"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : consolidado ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 px-6 py-8 text-center">
                <BarChart2 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-600">Nenhum almoxarifado com valor calculável ainda</p>
                <p className="text-xs text-gray-400 mt-1">
                  Cadastre <strong>preço unitário</strong> e <strong>quantidade em estoque</strong> nos itens para ver a distribuição por almoxarifado.
                  {consolidado.itens.filter((i: any) => !i.valorUnitario || parseFloat(i.valorUnitario) === 0).length > 0 && (
                    <> Você pode usar o botão <strong>"Preencher preços com IA"</strong> acima para estimar valores faltantes.</>
                  )}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Buscar item em todos os almoxarifados..." value={busca} onChange={e => setBusca(e.target.value)}
                  className="w-full pl-9 pr-4 h-9 rounded-lg text-sm border border-gray-200 bg-white text-gray-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200" />
              </div>
              <select
                value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)}
                className="h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-700 outline-none focus:border-emerald-400"
              >
                <option value="todas">Todas categorias</option>
                <option value="__sem__">⚠️ Sem categoria</option>
                {consCategs.map((c: any) => <option key={c} value={c}>{c}</option>)}
              </select>
              {/* Rev. 2406 — filtro por vínculo com Controle de Equipamentos. */}
              <select
                value={filtroEquip} onChange={e => setFiltroEquip(e.target.value as any)}
                className="h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-700 outline-none focus:border-indigo-400"
                title="Filtra itens vinculados ao Controle de Equipamentos"
              >
                <option value="todos">Todos vínculos</option>
                <option value="vinculado">🔧 Qualquer equipamento</option>
                <option value="proprio">🔧 Apenas Próprios</option>
                <option value="locado">🔧 Apenas Locados</option>
                <option value="nenhum">Sem vínculo</option>
              </select>
              {/* Rev. 2386 — IA sugere categorias quando filtro "Sem categoria" ativo */}
              {filtroCateg === "__sem__" && (
                <button
                  onClick={dispararSugerirCategsIA}
                  disabled={sugerirCategsIAMut.isPending}
                  title="A IA analisa cada item sem categoria e sugere a melhor opção dentre as categorias cadastradas"
                  className="h-9 px-3 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {sugerirCategsIAMut.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> IA analisando…</>
                    : <><Sparkles className="h-3.5 w-3.5" /> Sugerir categorias com IA</>}
                </button>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={apenasAbaixo} onChange={e => setApenasAbaixo(e.target.checked)} className="rounded border-gray-300" />
                Apenas abaixo do mínimo
              </label>
              <span className="text-xs text-gray-400">{consListFinal.length} resultado{consListFinal.length !== 1 ? "s" : ""}</span>
              {/* Rev. 2374/2383 — botão "Selecionar" no view consolidado:
                  permite Alterar categoria em lote sempre, e quando o filtro
                  é Equipamentos/Ferramentas/Escoramento também oferece
                  PRÓPRIO/ALUGADO. (Antes só aparecia nessas 3 categorias.) */}
              {viewMode === "cards" && (
                <button
                  onClick={() => modoClassificarEquip ? sairModoClassif() : setModoClassificarEquip(true)}
                  className={`h-9 px-3 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 transition ml-auto ${modoClassificarEquip ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700" : "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50"}`}
                  title="Selecionar itens para alterar categoria ou classificar como PRÓPRIO/ALUGADO"
                >
                  <CheckSquare className="h-4 w-4" />
                  {modoClassificarEquip ? `Cancelar seleção (${selecClassif.size})` : "Selecionar"}
                </button>
              )}
              <div className={`flex border border-gray-200 rounded-lg overflow-hidden ${modoClassificarEquip || viewMode !== "cards" ? "ml-auto" : ""}`}>
                <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${viewMode === "cards" ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:bg-gray-50"}`}>
                  <LayoutGrid className="h-3.5 w-3.5" /> Cards
                </button>
                <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 border-l border-gray-200 ${viewMode === "table" ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:bg-gray-50"}`}>
                  <List className="h-3.5 w-3.5" /> Tabela
                </button>
              </div>
            </div>

            {loadingConsolidado ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
            ) : consListFinal.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
                <Boxes className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Nenhum item encontrado</p>
              </div>
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {consListFinal.map((item: any, idx: number) => {
                  const abaixo = item.quantidadeMinima > 0 && item.quantidadeTotal < item.quantidadeMinima;
                  // Rev. 2374 — modo seleção: card inteiro vira clicável p/ marcar.
                  const selKey = String(item.nome || "").toLowerCase().trim();
                  const isSel = modoClassificarEquip && selecClassif.has(selKey);
                  return (
                    <div
                      key={idx}
                      onClick={modoClassificarEquip ? (e) => toggleSelClassif(item, idx, e.shiftKey, consListFinal as any[]) : () => abrirEditar(item)}
                      className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col transition hover:shadow-md cursor-pointer ${
                        isSel ? "border-blue-500 ring-2 ring-blue-300" :
                        abaixo ? "border-red-200" : "border-gray-100"
                      }`}
                      title={modoClassificarEquip ? undefined : "Clique para ver detalhes / editar"}
                    >
                      <div
                        className={`relative bg-gray-50 flex items-center justify-center ${!modoClassificarEquip && item.fotoUrl ? "group" : ""}`}
                        style={{ height: 140 }}
                        onClick={modoClassificarEquip ? undefined : (e) => { if (item.fotoUrl) { e.stopPropagation(); setFotoExpandida({ url: item.fotoUrl, nome: item.nome }); } }}
                      >
                        {item.fotoUrl ? (
                          <>
                            <img src={item.fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                            {!modoClassificarEquip && (
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                                <Search className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition drop-shadow-md" />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-gray-300">
                            <Camera className="h-8 w-8" />
                            <span className="text-[10px]">Sem foto</span>
                          </div>
                        )}
                        {abaixo && !modoClassificarEquip && (
                          <div className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</div>
                        )}
                        {/* Rev. 2374 — checkbox overlay em modo seleção */}
                        {modoClassificarEquip && (
                          <div className={`absolute top-2 left-2 w-8 h-8 rounded-md flex items-center justify-center font-bold shadow-md transition ${isSel ? "bg-blue-600 text-white" : "bg-white/95 text-gray-300 border-2 border-gray-300"}`}>
                            {isSel ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                          </div>
                        )}
                      </div>
                      <div className="p-3 flex flex-col gap-1.5 flex-1">
                        <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{item.nome}</p>
                        {(item as any).especificacao && <p className="text-[11px] text-gray-500 italic line-clamp-1">{(item as any).especificacao}</p>}
                        {item.categoria && <p className="text-[11px] text-gray-400">{item.categoria}</p>}
                        {item.codigoInterno && <p className="text-[11px] font-mono text-gray-400">{item.codigoInterno}</p>}
                        <div className="mt-auto pt-1">
                          <p className={`text-lg font-bold ${abaixo ? "text-red-600" : "text-gray-900"}`}>
                            {item.quantidadeTotal % 1 === 0 ? item.quantidadeTotal : item.quantidadeTotal.toFixed(2)}
                            <span className="text-xs font-normal text-gray-400 ml-1">{item.unidade}</span>
                          </p>
                          <StatusBadge atual={item.quantidadeTotal} minimo={item.quantidadeMinima} />
                          {item.valorUnitario && parseFloat(item.valorUnitario) > 0 && (
                            <p className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1 flex-wrap">
                              R$ {parseFloat(item.valorUnitario).toFixed(2)}/{item.unidade}
                              {(item as any).precoPreenchidoIa && (
                                <span title="Preço estimado pela IA — revisar antes de usar para cotação" className="inline-flex items-center gap-0.5 bg-purple-100 text-purple-700 px-1 rounded text-[9px] font-bold">🤖 IA</span>
                              )}
                            </p>
                          )}
                        </div>
                        {/* Rev. 2440 — Badges limitados a 3 (cards) — restante
                            como "+N locais" abrindo modal de detalhes. Tooltip
                            consolidado lista TODOS os locais. */}
                        <div className="text-[10px] text-gray-400 border-t border-gray-50 pt-1 mt-1">
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              const locais = (item.almoxarifados as any[]).map((a: any) => {
                                const nomeObra = a.tipo === "central"
                                  ? "Central"
                                  : ((obrasAtivas as any[]).find((o: any) => o.id === a.obraId)?.nome || `Obra #${a.obraId}`);
                                const qtdTxt = a.quantidade % 1 === 0 ? a.quantidade : a.quantidade.toFixed(2);
                                return { nomeObra, qtdTxt, tipo: a.tipo };
                              });
                              const visiveis = locais.slice(0, 3);
                              const restante = locais.length - visiveis.length;
                              const tooltipFull = locais.map(l => `${l.nomeObra}: ${l.qtdTxt} ${item.unidade ?? ""}`).join("\n");
                              return (
                                <>
                                  {visiveis.map((l, ai) => (
                                    <span
                                      key={ai}
                                      title={`${l.nomeObra}: ${l.qtdTxt} ${item.unidade ?? ""}`}
                                      className={`font-medium px-1.5 py-0.5 rounded-full max-w-[140px] truncate inline-block ${l.tipo === "central" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}
                                    >
                                      {l.nomeObra}: {l.qtdTxt}
                                    </span>
                                  ))}
                                  {restante > 0 && (
                                    <span
                                      title={tooltipFull}
                                      className="font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    >
                                      +{restante} {restante === 1 ? "local" : "locais"}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 w-12"></th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">ITEM</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">QTD TOTAL</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">STATUS</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">LOCAIS</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">PREÇO UNIT.</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">VALOR TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consListFinal.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-12 text-gray-400">Nenhum item no estoque</td></tr>
                      ) : consListFinal.map((item: any, idx: number) => (
                        <tr
                          key={idx}
                          onClick={() => abrirEditar(item)}
                          className={`border-b border-gray-50 hover:bg-emerald-50/40 cursor-pointer ${item.quantidadeMinima > 0 && item.quantidadeTotal < item.quantidadeMinima ? "bg-red-50/20" : ""}`}
                          title="Clique para ver detalhes / editar"
                        >
                          <td className="px-3 py-2">
                            <div
                              className={`w-10 h-10 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center ${item.fotoUrl ? "cursor-pointer hover:ring-2 hover:ring-emerald-300 transition" : ""}`}
                              onClick={(e) => { if (item.fotoUrl) { e.stopPropagation(); setFotoExpandida({ url: item.fotoUrl, nome: item.nome }); } }}
                            >
                              {item.fotoUrl
                                ? <img src={item.fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                                : <ImageOff className="h-4 w-4 text-gray-300" />
                              }
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{item.nome}</p>
                            {(item as any).especificacao && <p className="text-[11px] text-gray-500 italic">{(item as any).especificacao}</p>}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{item.unidade}</span>
                              {item.categoria && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{item.categoria}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="font-bold text-gray-900">{item.quantidadeTotal % 1 === 0 ? item.quantidadeTotal : item.quantidadeTotal.toFixed(2)}</span>
                            <span className="text-xs text-gray-400 ml-1">{item.unidade}</span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <StatusBadge atual={item.quantidadeTotal} minimo={item.quantidadeMinima} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            {/* Rev. 2440 — Tabela também limitada a 4 badges + "+N". */}
                            <div className="flex flex-wrap gap-1 justify-center">
                              {(() => {
                                const locais = (item.almoxarifados as any[]).map((a: any) => {
                                  const nomeObra = a.tipo === "central"
                                    ? "Central"
                                    : ((obrasAtivas as any[]).find((o: any) => o.id === a.obraId)?.nome || `Obra #${a.obraId}`);
                                  const qtdTxt = a.quantidade % 1 === 0 ? a.quantidade : a.quantidade.toFixed(2);
                                  return { nomeObra, qtdTxt, tipo: a.tipo };
                                });
                                const visiveis = locais.slice(0, 4);
                                const restante = locais.length - visiveis.length;
                                const tooltipFull = locais.map(l => `${l.nomeObra}: ${l.qtdTxt} ${item.unidade ?? ""}`).join("\n");
                                return (
                                  <>
                                    {visiveis.map((l, ai) => (
                                      <span
                                        key={ai}
                                        title={`${l.nomeObra}: ${l.qtdTxt} ${item.unidade ?? ""}`}
                                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full max-w-[180px] truncate inline-block ${l.tipo === "central" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}
                                      >
                                        {l.nomeObra}: {l.qtdTxt}
                                      </span>
                                    ))}
                                    {restante > 0 && (
                                      <span title={tooltipFull} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                        +{restante}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.valorUnitario
                              ? <span className="font-medium text-gray-900">R$ {parseFloat(item.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                              : <span className="text-gray-300 text-xs">sem preço</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.valorTotalEstoque > 0
                              ? <span className="font-bold text-emerald-700">R$ {item.valorTotalEstoque.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {valorTotal > 0 && (
                      <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                        <tr>
                          <td colSpan={6} className="px-4 py-3 font-bold text-emerald-800 text-sm">
                            TOTAL GERAL DO ESTOQUE
                            {totalReflectsFilter && <span className="ml-2 text-[10px] uppercase tracking-wide bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full">filtrado</span>}
                            {qtdLocadosExcluidos > 0 && <span className="ml-2 text-[10px] font-normal text-emerald-700/80">({qtdLocadosExcluidos} locado{qtdLocadosExcluidos !== 1 ? "s" : ""} excluído{qtdLocadosExcluidos !== 1 ? "s" : ""})</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-emerald-700">R$ {fmtBRL(valorTotal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {obraContexto !== "todos" && (() => {
          // FIX 100x: numeric do Drizzle vem em formato US ("106.33"). Só tratar como
          // pt-BR ("1.500,00") quando a string explicitamente tem vírgula decimal.
          const parseValorI = (v: any): number => {
            if (v === null || v === undefined || v === "") return 0;
            if (typeof v === "number") return isFinite(v) ? v : 0;
            const raw = String(v).trim();
            const s = raw.includes(",")
              ? raw.replace(/\./g, "").replace(",", ".")
              : raw;
            const n2 = parseFloat(s);
            return isNaN(n2) ? 0 : n2;
          };
          // Rev. 2418 — Total respeita filtros visíveis E exclui equipamentos LOCADOS
          // por padrão (são contratados, não estoque-material da empresa). Quando o
          // user filtra explicitamente "Apenas Locados" ou "Qualquer equipamento",
          // o total volta a incluí-los pra refletir o filtro.
          const incluirLocadosNoTotalI = filtroEquip === "locado" || filtroEquip === "vinculado";
          const itensParaTotalObra = incluirLocadosNoTotalI
            ? lista
            : lista.filter((i: any) => (i as any).equipamentoVinculadoTipo !== "locado");
          const valorTotalObra = itensParaTotalObra.reduce((s, i: any) => s + n(i.quantidadeAtual) * parseValorI(i.valorUnitario), 0);
          const totalReflectsFilterObra =
            !!busca.trim() || filtroCateg !== "todas" || apenasAbaixo || filtroEquip !== "todos" || filtroEstoque !== "todos";
          const qtdLocadosExcluidosObra = incluirLocadosNoTotalI
            ? 0
            : lista.filter((i: any) => (i as any).equipamentoVinculadoTipo === "locado").length;
          const fmtBRLi = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return (
        <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total de Itens", v: itens.length, icon: Package, color: "text-blue-600", bg: "bg-blue-50", f: "todos" as const, ring: "ring-blue-400" },
              { label: "Estoque OK", v: itens.filter(i => n(i.quantidadeMinima) === 0 || n(i.quantidadeAtual) >= n(i.quantidadeMinima)).length, icon: BarChart2, color: "text-emerald-600", bg: "bg-emerald-50", f: "ok" as const, ring: "ring-emerald-400" },
              { label: "Estoque Baixo", v: itens.filter(i => { const a = n(i.quantidadeAtual), m = n(i.quantidadeMinima); return m > 0 && a < m && a >= m * 0.5; }).length, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", f: "baixo" as const, ring: "ring-yellow-400" },
              { label: "Estoque Crítico", v: itens.filter(i => { const m = n(i.quantidadeMinima); return m > 0 && n(i.quantidadeAtual) < m * 0.5; }).length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", f: "critico" as const, ring: "ring-red-400" },
            ].map((k, i) => {
              const ativo = filtroEstoque === k.f && k.f !== "todos";
              return (
              <button
                key={i}
                onClick={() => setFiltroEstoque(prev => (k.f === "todos" || prev === k.f) ? "todos" : k.f)}
                className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 text-left transition active:scale-[0.98] cursor-pointer hover:shadow-md ${ativo ? `border-transparent ring-2 ${k.ring}` : "border-gray-100"}`}
                title={k.f === "todos" ? "Mostrar todos os itens" : `Filtrar itens: ${k.label}`}
              >
                <div className={`${k.bg} p-2 rounded-lg`}>
                  <k.icon className={`h-5 w-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">{k.label}</p>
                  <p className={`text-2xl font-bold ${k.color}`}>{k.v.toLocaleString("pt-BR")}</p>
                  {ativo && <p className={`text-[10px] font-semibold ${k.color}`}>Filtrando · toque p/ limpar</p>}
                </div>
              </button>
              );
            })}
          </div>

          {/* Banner de Valor Total do Estoque deste almoxarifado */}
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-500 rounded-2xl px-6 py-4 flex items-center justify-between text-white shadow-md">
            <div>
              <p className="text-sm font-medium opacity-80">
                Valor Total do Estoque (este almoxarifado)
                {totalReflectsFilterObra && <span className="ml-2 text-[10px] uppercase tracking-wide bg-white/20 px-2 py-0.5 rounded-full">filtrado</span>}
              </p>
              <p className="text-3xl font-black mt-1">R$ {fmtBRLi(valorTotalObra)}</p>
              <p className="text-xs opacity-70 mt-1">
                {itensParaTotalObra.length.toLocaleString("pt-BR")} ite{itensParaTotalObra.length !== 1 ? "ns" : "m"} considerado{itensParaTotalObra.length !== 1 ? "s" : ""} · {itensParaTotalObra.filter((i: any) => parseValorI(i.valorUnitario) > 0).length.toLocaleString("pt-BR")} com preço cadastrado
                {qtdLocadosExcluidosObra > 0 && <> · <span className="font-semibold">{qtdLocadosExcluidosObra} locado{qtdLocadosExcluidosObra !== 1 ? "s" : ""} excluído{qtdLocadosExcluidosObra !== 1 ? "s" : ""}</span></>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {itens.filter((i: any) => !i.valorUnitario || parseFloat(i.valorUnitario) === 0).length > 0 && (
                <button
                  onClick={() => dispararPreencherIA("obra")}
                  disabled={preenchendoIA}
                  title="Estimar preço médio de mercado dos itens sem valor cadastrado deste almoxarifado usando IA"
                  className="relative overflow-hidden inline-flex items-center gap-2 bg-white/95 hover:bg-white text-purple-700 font-semibold px-3 py-2 rounded-xl shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {preenchendoIA && (
                    <span className="absolute inset-y-0 left-0 bg-purple-200/60 transition-all duration-300 pointer-events-none" style={{ width: `${iaPct}%` }} />
                  )}
                  {preenchendoIA ? (
                    <span className="relative z-[1] inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Preenchendo… {Math.round(iaPct)}%</span>
                  ) : (
                    <>🤖 Preencher {itens.filter((i: any) => !i.valorUnitario || parseFloat(i.valorUnitario) === 0).length} preços com IA</>
                  )}
                </button>
              )}
              <BarChart2 className="h-12 w-12 opacity-30" />
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                className="w-full h-9 pl-9 pr-3 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                placeholder="Buscar por nome, código de barras ou categoria..."
                value={busca} onChange={e => setBusca(e.target.value)}
                autoComplete="off"
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
            {/* Rev. 2377 — Buscar fotos na web (DDG) pros itens SEM foto da lista atual */}
            <button
              onClick={buscarFotosWebTodas}
              disabled={!!batchFotoWeb}
              className="h-9 px-3 flex items-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition shadow-sm"
              title="Buscar fotos na internet (DuckDuckGo) pros itens sem foto"
            >
              {batchFotoWeb ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
              <span className="hidden sm:inline">{batchFotoWeb ? "Buscando..." : "Fotos da web"}</span>
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
              <option value="__sem__">⚠️ Sem categoria</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {/* Rev. 2406 — filtro por vínculo com Controle de Equipamentos. */}
            <select
              value={filtroEquip} onChange={e => setFiltroEquip(e.target.value as any)}
              className="h-9 text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-700 outline-none focus:border-indigo-400"
              title="Filtra itens vinculados ao Controle de Equipamentos"
            >
              <option value="todos">Todos vínculos</option>
              <option value="vinculado">🔧 Qualquer equipamento</option>
              <option value="proprio">🔧 Apenas Próprios</option>
              <option value="locado">🔧 Apenas Locados</option>
              <option value="nenhum">Sem vínculo</option>
            </select>
            {/* Rev. 2386 — IA sugere categorias quando filtro "Sem categoria" ativo */}
            {filtroCateg === "__sem__" && (
              <button
                onClick={dispararSugerirCategsIA}
                disabled={sugerirCategsIAMut.isPending}
                title="A IA analisa cada item sem categoria e sugere a melhor opção dentre as categorias cadastradas"
                className="h-9 px-3 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sugerirCategsIAMut.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> IA analisando…</>
                  : <><Sparkles className="h-3.5 w-3.5" /> Sugerir categorias com IA</>}
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={apenasAbaixo} onChange={e => setApenasAbaixo(e.target.checked)} className="rounded border-gray-300" />
              Apenas abaixo do mínimo
            </label>
            {/* Rev. 4535 — Seleção sempre ativa via checkbox nos cards; botão vira "Selecionar todos" */}
            <button
              onClick={() => {
                const todos = new Set((lista as any[]).map((i: any) => i.id));
                if (selecionados.size === todos.size && todos.size > 0) {
                  sairModoSelecao();
                } else {
                  setSelecionados(todos);
                }
              }}
              className={`h-9 px-3 flex items-center gap-2 text-sm font-medium rounded-lg transition shadow-sm ${selecionados.size > 0 ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200"}`}
              title="Selecionar/desmarcar todos os itens visíveis"
            >
              {selecionados.size === lista.length && lista.length > 0 ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
              <span className="hidden sm:inline">{selecionados.size === lista.length && lista.length > 0 ? "Desmarcar todos" : "Selecionar todos"}</span>
              {selecionados.size > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20">{selecionados.size}</span>
              )}
            </button>
            {/* Rev. 4522 — Botão "Itens Zerados": toggle pra ver itens com qty=0 */}
            {(qtdZeradosMain > 0 || tabZerados) && (
              <button
                onClick={() => setTabZerados(t => !t)}
                className={`h-9 px-3 flex items-center gap-2 text-sm font-medium rounded-lg transition shadow-sm ${tabZerados ? "bg-slate-700 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-400"}`}
                title="Ver itens com quantidade zerada (fora do estoque ativo)"
              >
                <Package className="w-4 h-4" />
                <span>Itens zerados</span>
                {qtdZeradosMain > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tabZerados ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {qtdZeradosMain}+
                  </span>
                )}
              </button>
            )}
            <span className="text-xs text-gray-400">
              {tabZerados ? `${itensZeradosRaw.length} zerado${itensZeradosRaw.length !== 1 ? "s" : ""}` : `${lista.length} resultado${lista.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* ── Aba Itens Zerados (Rev. 4522) ── */}
          {tabZerados && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Itens com estoque zerado</h3>
                  <span className="text-xs text-slate-400 ml-auto">Estes itens estão fora da contagem e valor total do estoque</span>
                </div>
                {loadingZerados ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                ) : itensZeradosRaw.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">Nenhum item zerado neste almoxarifado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-slate-200">
                          <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Item</th>
                          <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Categoria</th>
                          <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qtd</th>
                          <th className="pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(itensZeradosRaw as any[]).map((item: any) => (
                          <tr key={item.id} className="hover:bg-white transition-colors">
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                {item.fotoUrl
                                  ? <img src={item.fotoUrl} alt={item.nome} className="h-8 w-8 rounded-lg object-cover flex-shrink-0 border border-slate-200" />
                                  : <div className="h-8 w-8 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0"><Package className="h-4 w-4 text-slate-400" /></div>
                                }
                                <div>
                                  <p className="font-medium text-slate-800 leading-tight">{item.nome}</p>
                                  <p className="text-xs text-slate-400">{item.codigoInterno}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 pr-4 text-slate-500 hidden sm:table-cell">{item.categoria || <span className="text-slate-300">—</span>}</td>
                            <td className="py-2.5 pr-4">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                                0 {item.unidade}
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              {podeEditarItemObra(item) ? (<>
                                <button
                                  onClick={() => {
                                    setModalMov({ ...EMPTY_MOV, tipo: "entrada" });
                                    setItemSelecionado(item);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition mr-1"
                                  title="Dar entrada neste item para restaurar ao estoque"
                                >
                                  <ArrowDownCircle className="h-3.5 w-3.5" />
                                  Entrada
                                </button>
                                <button
                                  onClick={() => abrirEditar(item)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                                  title="Editar este item"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </>) : (
                                <span className="text-xs text-slate-400" title="Obra somente leitura">👁</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Content (itens com estoque) */}
          {!tabZerados && isLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
          ) : !tabZerados && lista.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-200 p-16 text-center">
              <Boxes className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum item no almoxarifado</p>
              <p className="text-sm text-gray-400 mt-1">Clique em "Novo Item" para cadastrar</p>
            </div>
          ) : !tabZerados && viewMode === "cards" ? (
            /* ── CARD VIEW ── */
            /* Rev. 2393 — wrapper relativo pra abrigar o retângulo de seleção (lasso).
               Rev. 4535: lasso só com mouse; no touch o dedo sempre scrolla e a
               seleção é feita pelos checkboxes sempre visíveis nos cards. */
            <div
              ref={gridRef}
              className="relative grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
              style={{ userSelect: dragSel ? "none" : "auto" }}
              onPointerDown={(e) => {
                // Rev. 4535 — lasso só com mouse (desktop); no touch o scroll manda.
                if (e.pointerType !== "mouse") return;
                const el = e.target as HTMLElement;
                // Inicia drag SÓ no espaço vazio entre cards (tap em card mantém toggle).
                if (el.closest("[data-card-id]") || el.closest("button") || el.closest("a") || el.closest("input")) return;
                if (!gridRef.current) return;
                try { gridRef.current.setPointerCapture(e.pointerId); } catch {}
                setDragSel({
                  startX: e.clientX, startY: e.clientY,
                  curX: e.clientX, curY: e.clientY,
                  origin: new Set(selecionados),
                });
              }}
              onPointerMove={(e) => {
                if (!dragSel || !gridRef.current) return;
                e.preventDefault();
                const curX = e.clientX, curY = e.clientY;
                const x1 = Math.min(dragSel.startX, curX);
                const y1 = Math.min(dragSel.startY, curY);
                const x2 = Math.max(dragSel.startX, curX);
                const y2 = Math.max(dragSel.startY, curY);
                const next = new Set(dragSel.origin);
                gridRef.current.querySelectorAll<HTMLElement>("[data-card-id]").forEach(card => {
                  const r = card.getBoundingClientRect();
                  if (!(r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2)) {
                    const idAttr = card.dataset.cardId;
                    if (idAttr) next.add(Number(idAttr));
                  }
                });
                setDragSel(prev => prev ? { ...prev, curX, curY } : prev);
                setSelecionados(next);
              }}
              onPointerUp={(e) => {
                if (!dragSel) return;
                try { gridRef.current?.releasePointerCapture(e.pointerId); } catch {}
                setDragSel(null);
              }}
              onPointerCancel={() => setDragSel(null)}
            >
              {/* Overlay do retângulo de seleção (lasso) */}
              {dragSel && gridRef.current && (() => {
                const gridRect = gridRef.current.getBoundingClientRect();
                const x1 = Math.min(dragSel.startX, dragSel.curX) - gridRect.left;
                const y1 = Math.min(dragSel.startY, dragSel.curY) - gridRect.top;
                const w = Math.abs(dragSel.curX - dragSel.startX);
                const h = Math.abs(dragSel.curY - dragSel.startY);
                return (
                  <div
                    className="pointer-events-none absolute z-20 border-2 border-indigo-500 bg-indigo-400/15 rounded-sm"
                    style={{ left: x1, top: y1, width: w, height: h }}
                  />
                );
              })()}
              {lista.map(item => {
                const atual = n(item.quantidadeAtual);
                const minimo = n(item.quantidadeMinima);
                const abaixo = minimo > 0 && atual < minimo;
                const isSel = selecionados.has(item.id);
                return (
                  <div
                    key={item.id}
                    data-card-id={item.id}
                    className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col transition hover:shadow-md ${selecionadosLocacao.has(item.id) ? "border-amber-500 ring-2 ring-amber-300" : isSel ? "border-indigo-500 ring-2 ring-indigo-300" : abaixo ? "border-red-200" : "border-gray-100"}`}
                  >
                    {/* Foto */}
                    <div
                      className="relative bg-gray-50 flex items-center justify-center cursor-pointer group"
                      style={{ height: 140 }}
                      onClick={(e) => {
                        if ((item as any).fotoUrl) {
                          setFotoExpandida({ url: (item as any).fotoUrl, nome: item.nome });
                        } else {
                          abrirEditar(item);
                        }
                      }}
                    >
                      {/* Rev. 4535 — Checkbox SEMPRE visível no canto sup. esquerdo (seleção natural) */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelecionado(item.id); }}
                        className={`absolute top-1.5 left-1.5 z-10 w-7 h-7 rounded-md flex items-center justify-center shadow-md transition ${isSel ? "bg-indigo-600" : "bg-white/95 border-2 border-gray-300 hover:border-indigo-400"}`}
                        title={isSel ? "Desmarcar" : "Selecionar"}
                      >
                        {isSel && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                      </button>
                      {(item as any).fotoUrl ? (
                        <>
                          <img src={(item as any).fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                            <Search className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition drop-shadow-md" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-gray-300 group-hover:text-emerald-400 transition">
                          <Camera className="h-8 w-8" />
                          <span className="text-[10px]">Adicionar foto</span>
                        </div>
                      )}
                      {/* Rev. 2377 — Botão "Buscar foto na web" no canto inferior pros itens sem foto */}
                      {!(item as any).fotoUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); buscarFotoWebUm(item.nome, false); }}
                          disabled={buscandoFotoNomes.has(item.nome)}
                          className="absolute bottom-1.5 left-1.5 right-1.5 h-7 flex items-center justify-center gap-1 bg-sky-500/95 hover:bg-sky-600 disabled:bg-sky-400 text-white text-[11px] font-medium rounded-md shadow-md transition"
                          title="Buscar foto na internet (DuckDuckGo)"
                        >
                          {buscandoFotoNomes.has(item.nome)
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <><Globe className="w-3.5 h-3.5" /> Buscar na web</>}
                        </button>
                      )}
                      {/* Rev. 2381 — Botão "Trocar foto" pros itens COM foto (ajudar IA a acertar) */}
                      {(item as any).fotoUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setRebuscarFoto({ nome: item.nome, termo: item.nome, previewUrl: null, buscando: false, aplicando: false, erro: null }); }}
                          className="absolute bottom-1.5 right-1.5 h-7 px-2 flex items-center gap-1 bg-white/90 hover:bg-white text-violet-700 text-[11px] font-semibold rounded-md shadow-md transition border border-violet-200"
                          title="Trocar foto com outro termo de busca"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Trocar
                        </button>
                      )}
                      {abaixo && (
                        <div className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">!</div>
                      )}
                      {/* Rev. 4535 — badge deslocado p/ direita do checkbox (top-left é do checkbox) */}
                      {(item as any).origem === "alugado" && (
                        <div className="absolute top-1.5 left-10 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">LOCADO</div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{item.nome}</p>
                        {(item as any).especificacao && <p className="text-[11px] text-gray-500 italic line-clamp-1">{(item as any).especificacao}</p>}
                        {item.categoria && <p className="text-[11px] text-gray-400 mt-0.5">{item.categoria}</p>}
                        {item.codigoInterno && <p className="text-[11px] font-mono text-gray-400">{item.codigoInterno}</p>}
                        {(item as any).criadoPorNome && (
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={`Cadastrado por ${(item as any).criadoPorNome}${(item as any).criadoEm ? " em " + fmtDataHora((item as any).criadoEm) : ""}`}>
                            <span className="text-gray-300">por</span> {(item as any).criadoPorNome}
                          </p>
                        )}
                      </div>
                      <div className="mt-auto">
                        <p className={`text-lg font-bold ${abaixo ? "text-red-600" : "text-gray-900"}`}>
                          {atual % 1 === 0 ? atual.toFixed(0) : atual.toFixed(2)}
                          <span className="text-xs font-normal text-gray-400 ml-1">{item.unidade}</span>
                        </p>
                        <StatusBadge atual={atual} minimo={minimo} />
                        {(item as any).valorUnitario && parseFloat((item as any).valorUnitario) > 0 && (
                          <p className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1 flex-wrap">
                            R$ {parseFloat((item as any).valorUnitario).toFixed(2)}/un · Total: R$ {(atual * parseFloat((item as any).valorUnitario)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            {(item as any).precoPreenchidoIa && (
                              <span title="Preço estimado pela IA — revisar antes de usar para cotação" className="inline-flex items-center gap-0.5 bg-purple-100 text-purple-700 px-1 rounded text-[9px] font-bold">🤖 IA</span>
                            )}
                          </p>
                        )}
                      </div>
                      {(item as any).origem === "alugado" && (item as any).dataVencimentoLocacao && (() => {
                        const dias = Math.ceil((new Date((item as any).dataVencimentoLocacao).getTime() - Date.now()) / 86400000);
                        return (
                          <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full text-center ${dias <= 0 ? "bg-red-100 text-red-700" : dias <= 7 ? "bg-orange-100 text-orange-700" : "bg-amber-50 text-amber-700"}`}>
                            {dias <= 0 ? "⚠ VENCIDO" : `Vence em ${dias}d`} — {(item as any).fornecedorLocacao || "Fornecedor"}
                          </div>
                        );
                      })()}
                      {(item as any).equipamentoVinculadoTipo && (
                        <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                          (item as any).equipamentoVinculadoTipo === "proprio"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-amber-100 text-amber-700"
                        }`} title={`Vinculado a Equipamento ${(item as any).equipamentoVinculadoTipo === "proprio" ? "Próprio" : "Locado"} #${(item as any).equipamentoVinculadoId}`}>
                          <ShieldCheck className="h-3 w-3" />
                          Equipamento {(item as any).equipamentoVinculadoTipo === "proprio" ? "Próprio" : "Locado"} #{(item as any).equipamentoVinculadoId}
                        </div>
                      )}
                      {/* Actions — Rev. 4539: escondidas em obra somente-leitura */}
                      {!somenteLeitura && podeEditarItemObra(item) && (
                      <div className="flex gap-1 pt-1 border-t border-gray-50">
                        <button onClick={() => abrirMovimento(item, "entrada")} title="Entrada" className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 rounded transition">
                          <ArrowDownCircle className="h-3.5 w-3.5" />In
                        </button>
                        <button onClick={() => abrirMovimento(item, "saida")} title="Saída" className="flex-1 flex items-center justify-center gap-1 py-1 text-[11px] text-orange-700 hover:bg-orange-50 rounded transition">
                          <ArrowUpCircle className="h-3.5 w-3.5" />Out
                        </button>
                        <button onClick={() => abrirEditar(item)} title="Editar item" className="px-1.5 py-1 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {!(item as any).equipamentoVinculadoTipo && (
                          <button
                            onClick={() => setModalVincEquip({
                              id: item.id,
                              nome: item.nome,
                              categoria: item.categoria,
                              fotoUrl: (item as any).fotoUrl,
                              valorUnitario: (item as any).valorUnitario,
                              obraId: item.obraId,
                            })}
                            title="Marcar como equipamento (Próprio ou Locado)"
                            className="px-1.5 py-1 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {(item as any).origem === "alugado" && (
                          <>
                            {/* Rev. 4345 — checkbox seleção lote devolução */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelecionadosLocacao(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; }); }}
                              title={selecionadosLocacao.has(item.id) ? "Desmarcar" : "Selecionar para devolução em lote"}
                              className={`px-1.5 py-1 rounded transition ${selecionadosLocacao.has(item.id) ? "text-amber-700 bg-amber-100" : "text-gray-300 hover:text-amber-500 hover:bg-amber-50"}`}
                            >
                              {selecionadosLocacao.has(item.id) ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => abrirRenovarLocacao(item)}
                              title="Renovar locação (gera nova OC no Compras)"
                              className="px-1.5 py-1 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => abrirDevolverLocacao(item)} title="Devolver ao fornecedor" className="px-1.5 py-1 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded transition">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        <button onClick={() => { setHistItem(resolveRealItem(item)); setModalHist(true); }} title="Histórico" className="px-1.5 py-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded transition">
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleExcluirItem(item)} title="Remover" className="px-1.5 py-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !tabZerados ? (
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
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Unit.</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Total</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.flatMap(item => {
                    const atual = n(item.quantidadeAtual);
                    const minimo = n(item.quantidadeMinima);
                    const abaixo = minimo > 0 && atual < minimo;
                    const rows = [];
                    rows.push(
                      <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50/70 ${abaixo ? "bg-red-50/20" : ""}`}>
                        <td className="px-3 py-2">
                          <div
                            className={`w-10 h-10 rounded-lg overflow-hidden border border-gray-100 bg-gray-50 flex items-center justify-center relative ${(item as any).fotoUrl ? "cursor-pointer hover:ring-2 hover:ring-emerald-300 transition" : ""}`}
                            onClick={() => { if ((item as any).fotoUrl) setFotoExpandida({ url: (item as any).fotoUrl, nome: item.nome }); }}
                          >
                            {(item as any).fotoUrl
                              ? <img src={(item as any).fotoUrl} alt={item.nome} className="w-full h-full object-cover" />
                              : <ImageOff className="h-4 w-4 text-gray-300" />
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-800">{item.nome}</p>
                            {(item as any).especificacao && <p className="text-[11px] text-gray-500 italic">{(item as any).especificacao}</p>}
                            <p className="text-xs text-gray-400">{item.unidade}</p>
                          </div>
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
                        <td className="px-3 py-3 text-right text-sm">
                          {(item as any).valorUnitario && parseFloat((item as any).valorUnitario) > 0
                            ? <span className="font-medium text-gray-700">R$ {parseFloat((item as any).valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-sm">
                          {(item as any).valorUnitario && parseFloat((item as any).valorUnitario) > 0
                            ? <span className="font-bold text-emerald-700">R$ {(atual * parseFloat((item as any).valorUnitario)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <StatusBadge atual={atual} minimo={minimo} />
                        </td>
                        <td className="px-4 py-3">
                            {/* Rev. 4539 — obra somente-leitura: só Histórico */}
                            <div className="flex items-center justify-center gap-1">
                              {!somenteLeitura && podeEditarItemObra(item) && (<>
                              <button onClick={() => abrirMovimento(item, "entrada")} className="flex items-center gap-1 h-7 px-2 text-xs text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-50 transition">
                                <ArrowDownCircle className="h-3.5 w-3.5" />Entrada
                              </button>
                              <button onClick={() => abrirMovimento(item, "saida")} className="flex items-center gap-1 h-7 px-2 text-xs text-orange-700 border border-orange-200 rounded hover:bg-orange-50 transition">
                                <ArrowUpCircle className="h-3.5 w-3.5" />Saída
                              </button>
                              </>)}
                              <button onClick={() => { setHistItem(resolveRealItem(item)); setModalHist(true); }} className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition" title="Histórico">
                                <History className="h-3.5 w-3.5" />
                              </button>
                              {!somenteLeitura && podeEditarItemObra(item) && (<>
                              <button onClick={() => abrirEditar(item)} className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition" title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleExcluirItem(item)} className="h-7 w-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition" title="Remover">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              </>)}
                            </div>
                        </td>
                      </tr>
                    );
                    return rows;
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        );
        })()}

      </div>

      {/* ── Modal Novo/Editar Item ──────────────────────────────────── */}
      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalItem(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-4xl mx-4 max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">{editandoId ? "Editar Item" : "Novo Item de Estoque"}</h2>
              <button onClick={() => setModalItem(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                {/* ── Coluna Esquerda ── */}
                <div className="space-y-4">
                  {/* Foto */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Foto do Produto</label>
                    <div className="flex items-start gap-4">
                      <div
                        className="relative w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-400 transition group shrink-0"
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
                            <Camera className="h-7 w-7" />
                            <span className="text-[10px] text-center leading-tight">Adicionar<br/>foto</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {editandoId === null ? (
                          <p className="text-xs text-gray-500">
                            Tire ou envie uma foto — a <span className="font-medium text-violet-600">IA preencherá os campos automaticamente</span>.
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500">Foto para identificar o produto visualmente.</p>
                        )}
                        {analisandoFotoIA && (
                          <div className="flex items-center gap-1.5 text-xs text-violet-600 font-medium">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando com IA…
                          </div>
                        )}
                        {camposPreenchidosIA && !analisandoFotoIA && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                            <Sparkles className="h-3.5 w-3.5" /> Campos preenchidos pela IA
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
                        <p className="text-[11px] text-gray-400">JPG, PNG ou WEBP • Comprimido automaticamente</p>
                      </div>
                    </div>
                    <input ref={fotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
                  </div>

                  {/* Código + Nome */}
                  <div className="grid grid-cols-[140px_1fr] gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700">Código / Barras</label>
                      <div className="relative mt-1">
                        <input
                          className={`w-full h-9 pl-3 pr-8 text-sm rounded-lg border bg-white text-gray-900 placeholder-gray-400 outline-none focus:ring-1 font-mono ${buscandoBarcode ? "border-violet-400 focus:border-violet-400 focus:ring-violet-200" : "border-gray-200 focus:border-emerald-400 focus:ring-emerald-200"}`}
                          placeholder="Digite ou escaneie o código"
                          value={formItem.codigoInterno}
                          onChange={e => setFormItem(p => ({ ...p, codigoInterno: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const code = formItem.codigoInterno.trim();
                              if (code && code.length >= 3 && !buscandoBarcode) {
                                setBuscandoBarcode(true);
                                buscarBarcodeMut.mutate({ companyId, codigo: code });
                              }
                            }
                          }}
                          onBlur={() => {
                            const code = formItem.codigoInterno.trim();
                            if (code && code.length >= 3 && !editandoId && !formItem.nome.trim() && !buscandoBarcode) {
                              setBuscandoBarcode(true);
                              buscarBarcodeMut.mutate({ companyId, codigo: code });
                            }
                          }}
                          autoComplete="off"
                          autoFocus
                        />
                        {buscandoBarcode
                          ? <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-violet-500 animate-spin" />
                          : <Barcode className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 pointer-events-none" />
                        }
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {buscandoBarcode ? "Buscando produto..." : "Digite e pressione Enter — a IA identifica automaticamente"}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">Nome do Item *</label>
                      <input
                        className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                        placeholder="Ex: Cimento CP-II 50kg"
                        value={formItem.nome} onChange={e => {
                          const nome = e.target.value;
                          if (!categoriaManualment) {
                            const catList = (categorias as string[]).length > 0 ? categorias as string[] : Object.keys(CATEGORIA_KEYWORDS);
                            const sugestao = inferirCategoria(nome, catList);
                            if (sugestao) {
                              setFormItem(p => ({ ...p, nome, categoria: sugestao }));
                              setCategoriaAutoSugerida(true);
                            } else {
                              setFormItem(p => ({ ...p, nome, categoria: categoriaAutoSugerida ? "" : p.categoria }));
                              setCategoriaAutoSugerida(false);
                            }
                          } else {
                            setFormItem(p => ({ ...p, nome }));
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Unidade + Categoria */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-700">Unidade</label>
                        <button type="button" onClick={() => setModalUnidades(true)} className="text-xs text-emerald-600 hover:text-emerald-700 underline">
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
                      <div className="flex items-center gap-1.5 mb-1">
                        <label className="text-xs font-medium text-gray-700">Categoria</label>
                        {categoriaAutoSugerida && formItem.categoria && !categoriaManualment && (
                          <span className="text-[10px] text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Sparkles className="h-2.5 w-2.5" /> Auto
                          </span>
                        )}
                      </div>
                      {/* Rev. 2441 — Combobox filtrável (digite pra achar / criar nova). */}
                      <CategoriaCombobox
                        value={formItem.categoria}
                        onChange={(v) => { setFormItem(p => ({ ...p, categoria: v })); setCategoriaManualment(true); setCategoriaAutoSugerida(false); }}
                        opcoes={categorias as string[]}
                        placeholder="Digite ou escolha uma categoria…"
                        allowFree
                      />
                    </div>
                  </div>

                  {/* Qtd mínima + Estoque lado a lado */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700">Qtd. Mínima (alerta)</label>
                      <input
                        type="text" inputMode="decimal"
                        className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                        value={formItem.quantidadeMinima}
                        placeholder="0"
                        onChange={e => setFormItem(p => ({ ...p, quantidadeMinima: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700">
                        {editandoId ? "Corrigir Estoque Atual" : "Qtd. Inicial"}
                      </label>
                      {editandoId && (
                        <p className="text-[11px] text-amber-600 mt-0.5 leading-tight">⚠ Correção de inventário</p>
                      )}
                      <input
                        type="text" inputMode="decimal"
                        className={`mt-1 w-full h-9 px-3 text-sm rounded-lg border bg-white text-gray-900 outline-none transition ${editandoId ? "border-amber-300 focus:border-amber-500" : "border-gray-200 focus:border-emerald-400"}`}
                        value={formItem.quantidadeAtual}
                        placeholder="0"
                        onChange={e => setFormItem(p => ({ ...p, quantidadeAtual: e.target.value }))}
                      />
                      {editandoId && editandoSubItems && editandoSubItems.length > 1 && (
                        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                          <p className="text-[11px] font-semibold text-blue-700 mb-1.5">
                            ℹ️ Este item aparece em {editandoSubItems.length} registros distintos — o card exibe a SOMA de todos.
                          </p>
                          <p className="text-[10px] text-blue-600 mb-1.5 leading-snug">
                            Você está editando apenas <strong>{formItem.codigoInterno || "este registro"}</strong>. Os demais permanecem inalterados.
                          </p>
                          <div className="space-y-0.5">
                            {editandoSubItems.map((s: any, idx: number) => {
                              const isEste = s.id === editandoId;
                              return (
                                <div key={s.id} className={`flex items-center justify-between text-[10px] rounded px-1.5 py-0.5 ${isEste ? "bg-blue-200 font-semibold text-blue-900" : "text-blue-700"}`}>
                                  <span className="truncate max-w-[60%]">{s.codigoInterno || `Registro ${idx + 1}`}</span>
                                  <span className="font-mono ml-1 shrink-0">{n(s.quantidadeAtual)} {s.unidade}</span>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between text-[10px] border-t border-blue-300 mt-1 pt-1 font-semibold text-blue-800">
                              <span>Total (exibido no card)</span>
                              <span className="font-mono">{editandoSubItems.reduce((acc: number, s: any) => acc + n(s.quantidadeAtual), 0)} {editandoSubItems[0]?.unidade}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rev. 4011 — Especificação técnica, separada do nome (ex: bitola, cor, voltagem). */}
                  <div>
                    <label className="text-xs font-medium text-gray-700">Especificação</label>
                    <input
                      className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                      placeholder="Ex: M8 x 40mm, aço inox / 220V / azul"
                      value={formItem.especificacao}
                      onChange={e => setFormItem(p => ({ ...p, especificacao: e.target.value }))}
                    />
                  </div>

                  {/* Observações */}
                  <div>
                    <label className="text-xs font-medium text-gray-700">Observações</label>
                    <textarea
                      className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-emerald-400 resize-none"
                      rows={2} value={formItem.observacoes}
                      onChange={e => setFormItem(p => ({ ...p, observacoes: e.target.value }))}
                    />
                  </div>
                </div>

                {/* ── Coluna Direita ── */}
                <div className="space-y-4">
                  {/* Valor Unitário + IA */}
                  <div>
                    <label className="text-xs font-medium text-gray-700">Valor Unitário (R$)</label>
                    <div className="mt-1 flex gap-2">
                      <input type="text" inputMode="decimal" placeholder="0,00"
                        className="flex-1 h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                        value={formItem.valorUnitario}
                        onChange={e => setFormItem(p => ({ ...p, valorUnitario: e.target.value }))} />
                      <button type="button"
                        disabled={sugerindoPreco || !formItem.nome.trim()}
                        title={formItem.fotoUrl ? "IA sugere preço com base na foto e nome" : "IA sugere preço com base no nome do item"}
                        onClick={() => {
                          setSugerindoPreco(true);
                          sugerirPrecoMut.mutate({ nome: formItem.nome, unidade: formItem.unidade || undefined, categoria: formItem.categoria || undefined, fotoUrl: formItem.fotoUrl || undefined });
                        }}
                        className="flex items-center gap-1 px-3 h-9 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold disabled:opacity-50 transition whitespace-nowrap"
                      >
                        {sugerindoPreco ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {sugerindoPreco ? "..." : "IA"}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">O botão IA estima o preço de mercado automaticamente.</p>
                  </div>

                  {/* Origem (Próprio / Alugado) — só para Equipamentos e Escoramento */}
                  {(formItem.categoria === "Equipamentos" || formItem.categoria === "Escoramento") && <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700 mb-2 block">Origem do Equipamento</label>
                      <div className="flex gap-2">
                        <button type="button"
                          onClick={() => setFormItem(p => ({ ...p, origem: "proprio" }))}
                          className={`flex-1 h-9 text-sm rounded-lg border font-medium transition ${formItem.origem === "proprio" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                          Proprio
                        </button>
                        <button type="button"
                          onClick={() => setFormItem(p => ({ ...p, origem: "alugado" }))}
                          className={`flex-1 h-9 text-sm rounded-lg border font-medium transition ${formItem.origem === "alugado" ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                          Alugado / Locado
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
                            <label className="text-xs font-medium text-gray-700">Início Locação</label>
                            <input type="date"
                              className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-amber-400"
                              value={formItem.dataInicioLocacao}
                              onChange={e => setFormItem(p => ({ ...p, dataInicioLocacao: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-amber-700 font-semibold">Vencimento</label>
                            <input type="date"
                              className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-amber-300 bg-amber-50 text-gray-900 outline-none focus:border-amber-500"
                              value={formItem.dataVencimentoLocacao}
                              onChange={e => setFormItem(p => ({ ...p, dataVencimentoLocacao: e.target.value }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-700">Valor Mensal (R$)</label>
                            <input type="text" inputMode="decimal" placeholder="0,00"
                              className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-amber-400"
                              value={formItem.valorLocacaoMensal}
                              onChange={e => setFormItem(p => ({ ...p, valorLocacaoMensal: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-amber-700">Alerta (dias antes)</label>
                            <input type="text" inputMode="numeric" placeholder="7"
                              className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-amber-200 bg-amber-50 text-gray-900 outline-none focus:border-amber-500"
                              value={formItem.diasAlertaLocacao === "7" && !formItem.dataVencimentoLocacao ? "" : formItem.diasAlertaLocacao}
                              onChange={e => setFormItem(p => ({ ...p, diasAlertaLocacao: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-700">Obs. da Locação</label>
                          <textarea rows={2} placeholder="Nº do contrato, condições, etc."
                            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400 resize-none"
                            value={formItem.observacoesLocacao}
                            onChange={e => setFormItem(p => ({ ...p, observacoesLocacao: e.target.value }))} />
                        </div>
                      </div>
                    )}
                  </div>}
                </div>
              </div>
            </div>
            {editandoId && editandoMeta && (editandoMeta.criadoPorNome || editandoMeta.atualizadoPorNome) && (
              <div className="px-5 py-2 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 shrink-0">
                {editandoMeta.criadoPorNome && (
                  <span>
                    <span className="text-gray-400">Cadastrado por</span>{" "}
                    <span className="font-medium text-gray-700">{editandoMeta.criadoPorNome}</span>
                    {editandoMeta.criadoEm && <span className="text-gray-400"> em {fmtDataHora(editandoMeta.criadoEm)}</span>}
                  </span>
                )}
                {editandoMeta.atualizadoPorNome && (
                  <span>
                    <span className="text-gray-400">Última edição por</span>{" "}
                    <span className="font-medium text-gray-700">{editandoMeta.atualizadoPorNome}</span>
                    {editandoMeta.atualizadoEm && <span className="text-gray-400"> em {fmtDataHora(editandoMeta.atualizadoEm)}</span>}
                  </span>
                )}
              </div>
            )}
            <div className="flex gap-3 px-5 py-3 border-t border-gray-100 shrink-0">
              <button onClick={() => setModalItem(false)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Cancelar</button>
              <button onClick={salvarItem} disabled={criarMut.isPending || atualizarMut.isPending} className="flex-1 h-9 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2">
                {(criarMut.isPending || atualizarMut.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {editandoId ? "Salvar Alterações" : "Criar Item"}
              </button>
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
                  <p className="text-xs text-gray-500">Saldo atual: <strong>{fmtQtd(movItem.quantidadeAtual)}</strong> {movItem.unidade}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700">Quantidade ({movItem.unidade}) *</label>
                <input
                  type="number" min={1} step={1}
                  className="mt-1 w-full h-10 px-3 text-lg font-semibold rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-emerald-400"
                  value={formMov.quantidade || ""}
                  onChange={e => setFormMov(p => ({ ...p, quantidade: Math.round(parseFloat(e.target.value)) || 0 }))}
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
                          {fmtQtd(m.quantidade)}
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
                    disabled={!entradaItemId || !(parseFloat(entradaQtd) > 0) || registerEntry.isPending}
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

      {/* ══ MODAL RECEBIMENTO INTELIGENTE ═══════════════════════════════ */}
      {modalSmartEntry && (
        <SmartEntry
          companyId={companyId}
          obraId={obraIdMaterial}
          obraNome={typeof obraContexto === "number" ? (obrasAtivas.find((o: any) => o.id === obraContexto) as any)?.nome : obraContexto === null ? "Escritório Central" : undefined}
          itens={itens.map((i: any) => ({ id: i.id, nome: i.nome, unidade: i.unidade, categoria: i.categoria, quantidadeAtual: parseFloat(String(i.quantidadeAtual) || "0") }))}
          onClose={() => setModalSmartEntry(false)}
          onSuccess={() => { refetch(); utils.warehouse.getDashboard.invalidate(); }}
        />
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
                      {itens.map(i => <option key={i.id} value={i.id}>{i.nome} — Estoque: {fmtQtd(i.quantidadeAtual)} {i.unidade}</option>)}
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
                    disabled={!saidaItemId || !(parseFloat(saidaQtd) > 0) || !saidaObraId || registerExit.isPending}
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
        <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ color: "#111827" }}>
          {empOk ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
              <p className="text-xl font-bold text-emerald-700">Empréstimo registrado!</p>
              <p className="text-gray-600">{empOk.nome}</p>
              <button className="w-full max-w-sm bg-emerald-500 text-white font-bold py-4 rounded-xl text-lg" onClick={() => { setModalEmprestimo(false); resetEmprestimo(); }}>Fechar</button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-4 border-b shrink-0">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Wrench className="w-5 h-5 text-blue-500" /> 🔧 Ferramentas — Empréstimo</h2>
                <button onClick={() => setModalEmprestimo(false)}><X className="w-6 h-6 text-gray-400" /></button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                  {/* Toggle Mão de Obra / Terceiros */}
                  <div className="flex rounded-xl overflow-hidden border-2 border-gray-200">
                    <button
                      type="button"
                      onClick={() => { setEmpTipo("mao_obra"); setEmpTerceiroNome(""); setEmpTerceiroEmpresa(""); }}
                      className={`flex-1 py-2.5 text-sm font-semibold transition ${empTipo === "mao_obra" ? "bg-blue-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      👷 Mão de Obra Direta
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEmpTipo("terceiro"); setEmpSelecionado(null); setEmpSearch(""); setEmpCodigo(""); }}
                      className={`flex-1 py-2.5 text-sm font-semibold transition ${empTipo === "terceiro" ? "bg-orange-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      🏢 Terceiros
                    </button>
                  </div>

                  {empTipo === "mao_obra" ? (
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
                  ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Nome do responsável *</label>
                      <input
                        type="text"
                        className="w-full border-2 rounded-xl p-3 text-base"
                        placeholder="Nome completo da pessoa..."
                        value={empTerceiroNome}
                        onChange={e => setEmpTerceiroNome(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Empresa (opcional)</label>
                      <input
                        type="text"
                        className="w-full border-2 rounded-xl p-3 text-base"
                        placeholder="Nome da empresa ou prestadora..."
                        value={empTerceiroEmpresa}
                        onChange={e => setEmpTerceiroEmpresa(e.target.value)}
                      />
                    </div>
                  </div>
                  )}
                  {(() => {
                    const fonteItens = obraContexto === "todos" ? itensTodos : itens;
                    const ferramentasList = (fonteItens as any[]).filter((i: any) => {
                      const cat = String(i.categoria || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      return cat.includes("ferramenta") || cat.includes("equipamento");
                    });
                    const jaEscolhidos = new Set(empItens.map(x => x.itemId));
                    const podeAdicionar = empItemId > 0 && Number(empQtd) > 0 && !jaEscolhidos.has(empItemId);
                    function adicionar() {
                      if (!podeAdicionar) return;
                      setEmpItens(prev => [...prev, { itemId: empItemId, qtd: empQtd }]);
                      setEmpItemId(0); setEmpQtd("1");
                    }
                    return (
                      <>
                        {/* Lista de ferramentas já adicionadas */}
                        {empItens.length > 0 && (
                          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 space-y-2">
                            <p className="text-xs font-semibold text-blue-800">Ferramentas neste empréstimo ({empItens.length}):</p>
                            {empItens.map((it, idx) => {
                              const info = itens.find((i: any) => i.id === it.itemId);
                              return (
                                <div key={idx} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-blue-200">
                                  <Wrench className="w-4 h-4 text-blue-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{info?.nome || `#${it.itemId}`}</p>
                                    <p className="text-[11px] text-gray-500">Qtd: <b>{it.qtd}</b> · Estoque: {info ? fmtQtd(info.quantidadeAtual) : "—"}</p>
                                  </div>
                                  <button type="button" onClick={() => setEmpItens(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 transition" title="Remover">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {/* Linha para adicionar nova ferramenta */}
                        <div>
                          <label className="text-sm font-semibold text-gray-700 block mb-1">{empItens.length === 0 ? "Selecionar Ferramenta *" : "Adicionar outra ferramenta"}</label>
                          <div className="flex gap-2">
                            <select className="flex-1 min-w-0 border-2 rounded-xl p-3 text-sm" value={empItemId} onChange={e => setEmpItemId(Number(e.target.value))}>
                              <option value={0}>— escolha a ferramenta —</option>
                              {ferramentasList.filter((i: any) => !jaEscolhidos.has(i.id)).map((i: any) => <option key={i.id} value={i.id}>{i.nome} — Estoque: {fmtQtd(i.quantidadeAtual)}</option>)}
                            </select>
                            <input type="number" inputMode="numeric" className="w-20 border-2 rounded-xl p-3 text-base font-bold text-center" value={empQtd} onChange={e => setEmpQtd(e.target.value)} placeholder="Qtd" />
                            <button type="button" onClick={adicionar} disabled={!podeAdicionar} className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold px-3 rounded-xl disabled:opacity-40 transition" title="Adicionar à lista">+</button>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">Mostrando apenas Ferramentas e Equipamentos ({ferramentasList.length} de {itens.length}). Use o <b>+</b> para adicionar mais de uma ferramenta para o mesmo funcionário.</p>
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-gray-700 block mb-1">Observação (opcional)</label>
                          <input
                            type="text"
                            className="w-full border rounded-xl p-3 text-sm"
                            placeholder="Ex: motivo do empréstimo, condição do equipamento..."
                            value={empObservacoes}
                            onChange={e => setEmpObservacoes(e.target.value)}
                          />
                        </div>
                        {empErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{empErr}</p>}
                        <button
                          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition"
                          disabled={(empTipo === "mao_obra" ? !empSelecionado : !empTerceiroNome.trim()) || (empItens.length === 0 && !podeAdicionar) || empSubmitting}
                          onClick={async () => {
                            // Junta o item "em digitação" + a lista
                            const lista = [...empItens];
                            if (empItemId > 0 && Number(empQtd) > 0 && !jaEscolhidos.has(empItemId)) {
                              lista.push({ itemId: empItemId, qtd: empQtd });
                            }
                            if (lista.length === 0) return;
                            setEmpSubmitting(true); setEmpErr(null);
                            const codFunc = empSelecionado?.codigoInterno || empCodigo;
                            const obraIdParam = typeof obraContexto === "number" ? obraContexto : undefined;
                            let okCount = 0; let lastNome = "";
                            try {
                              for (const it of lista) {
                                const params = empTipo === "terceiro"
                                  ? { companyId, itemId: it.itemId, quantidade: parseFloat(it.qtd), obraId: obraIdParam, terceiroNome: empTerceiroNome.trim(), terceiroEmpresa: empTerceiroEmpresa.trim() || undefined, observacoes: empObservacoes.trim() || undefined }
                                  : { companyId, itemId: it.itemId, quantidade: parseFloat(it.qtd), funcionarioCodigo: codFunc, obraId: obraIdParam, observacoes: empObservacoes.trim() || undefined };
                                const r = await registerLoan.mutateAsync(params);
                                lastNome = r.funcionarioNome || lastNome;
                                okCount++;
                              }
                              setEmpOk({ nome: lastNome, total: okCount });
                            } catch (e: any) {
                              setEmpErr(`Falha após ${okCount} de ${lista.length} ferramentas: ${e?.message || 'erro desconhecido'}`);
                            } finally {
                              setEmpSubmitting(false);
                            }
                          }}
                        >
                          {empSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : `🔧 CONFIRMAR EMPRÉSTIMO${(empItens.length + (empItemId > 0 && Number(empQtd) > 0 && !jaEscolhidos.has(empItemId) ? 1 : 0)) > 1 ? ` (${empItens.length + (empItemId > 0 && Number(empQtd) > 0 && !jaEscolhidos.has(empItemId) ? 1 : 0)} itens)` : ""}`}
                        </button>
                      </>
                    );
                  })()}
                </div>
            </>
          )}
        </div>
      )}

      {/* ══ MODAL INSUMO ════════════════════════════════════════════ */}
      {modalInsumo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: "#ffffff", color: "#111827" }}>
            {insOk ? (
              <>
                <div className="p-8 text-center space-y-3">
                  <CheckCircle2 className="w-16 h-16 text-amber-500 mx-auto" />
                  <p className="text-xl font-bold text-amber-700">Insumo registrado!</p>
                  <p className="text-gray-600 text-sm">{insOk.item} entregue para <strong>{insOk.nome}</strong></p>
                </div>
                <div className="p-4 flex gap-3">
                  <button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl text-base" onClick={() => { resetInsumo(); }}>Registrar outro</button>
                  <button className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl text-base" onClick={() => { setModalInsumo(false); resetInsumo(); }}>Fechar</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 border-b">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-amber-500" /> Dar Insumo / Consumível</h2>
                  <button onClick={() => setModalInsumo(false)}><X className="w-6 h-6 text-gray-400" /></button>
                </div>
                <div className="p-4 space-y-4">
                  {/* Toggle Mão de Obra / Terceiros — Rev. 4005 */}
                  <div className="flex rounded-xl overflow-hidden border-2 border-gray-200">
                    <button
                      type="button"
                      onClick={() => { setInsTipo("mao_obra"); setInsTerceiroNome(""); setInsTerceiroEmpresa(""); }}
                      className={`flex-1 py-2.5 text-sm font-semibold transition ${insTipo === "mao_obra" ? "bg-amber-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      👷 Mão de Obra Direta
                    </button>
                    <button
                      type="button"
                      onClick={() => { setInsTipo("terceiro"); setInsSelecionado(null); setInsSearch(""); setInsCodigo(""); }}
                      className={`flex-1 py-2.5 text-sm font-semibold transition ${insTipo === "terceiro" ? "bg-orange-500 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      🏢 Terceiros
                    </button>
                  </div>
                  {/* Funcionário */}
                  {insTipo === "mao_obra" ? (
                  <div className="relative">
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Funcionário *</label>
                    <input
                      type="text"
                      className="w-full border-2 rounded-xl p-3 text-base"
                      placeholder="Digite o código (JFC199) ou nome do funcionário..."
                      value={insSearch}
                      autoComplete="off"
                      onChange={e => { setInsSearch(e.target.value); setInsSelecionado(null); setInsCodigo(""); setInsShowSug(true); }}
                      onFocus={() => setInsShowSug(true)}
                      onBlur={() => setTimeout(() => setInsShowSug(false), 180)}
                    />
                    {insShowSug && insSugestoes.length > 0 && !insSelecionado && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {(insSugestoes as any[]).map((f: any) => (
                          <button key={f.id} type="button" className="w-full flex items-center gap-3 px-3 py-2 hover:bg-amber-50 text-left transition" onMouseDown={() => selecionarFuncionarioIns(f)}>
                            {f.fotoUrl ? <img src={f.fotoUrl} alt={f.nomeCompleto} className="w-9 h-9 rounded-full object-cover border border-gray-200 flex-shrink-0" /> : <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><User className="w-5 h-5 text-amber-500" /></div>}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{f.nomeCompleto}</p>
                              <p className="text-xs text-gray-500">{f.codigoInterno}{f.cargo ? ` — ${f.cargo}` : f.funcao ? ` — ${f.funcao}` : ""}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {insSelecionado && (
                      <div className="mt-3 bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex flex-col items-center gap-2 relative">
                        <button type="button" onClick={() => { setInsSelecionado(null); setInsSearch(""); setInsCodigo(""); }} className="absolute top-2 right-2 text-gray-400 hover:text-red-500 transition"><X className="w-4 h-4" /></button>
                        {insSelecionado.fotoUrl ? <img src={insSelecionado.fotoUrl} alt={insSelecionado.nomeCompleto} className="w-20 h-20 rounded-full object-cover border-4 border-amber-400 shadow-md" /> : <div className="w-20 h-20 rounded-full bg-amber-100 border-4 border-amber-300 flex items-center justify-center shadow-md"><User className="w-10 h-10 text-amber-400" /></div>}
                        <p className="font-bold text-amber-800 text-center text-base leading-tight">{insSelecionado.nomeCompleto}</p>
                        <p className="text-sm text-amber-600 text-center">{insSelecionado.codigoInterno}{insSelecionado.cargo ? ` — ${insSelecionado.cargo}` : insSelecionado.funcao ? ` — ${insSelecionado.funcao}` : ""}</p>
                      </div>
                    )}
                    {insSearch.length >= 2 && !insSelecionado && insSugestoes.length === 0 && <p className="text-xs text-red-500 mt-1">Nenhum funcionário encontrado</p>}
                  </div>
                  ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Nome do responsável *</label>
                      <input
                        type="text"
                        className="w-full border-2 rounded-xl p-3 text-base"
                        placeholder="Nome completo da pessoa..."
                        value={insTerceiroNome}
                        onChange={e => setInsTerceiroNome(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Empresa (opcional)</label>
                      <input
                        type="text"
                        className="w-full border-2 rounded-xl p-3 text-base"
                        placeholder="Nome da empresa ou prestadora..."
                        value={insTerceiroEmpresa}
                        onChange={e => setInsTerceiroEmpresa(e.target.value)}
                      />
                    </div>
                    {/* Rev. 4801 — poka-yoke: TODA saída p/ terceiro pergunta de quem é o custo */}
                    <div className="rounded-xl border-2 border-amber-200 bg-amber-50/60 p-3 space-y-2">
                      <label className="text-sm font-semibold text-gray-700 block">De quem é o custo? *</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setInsCustoDe("nosso"); setInsContratoId(0); }}
                          className={`py-3 rounded-xl border-2 text-sm font-bold transition ${insCustoDe === "nosso" ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-gray-200 text-gray-600"}`}>
                          Custo NOSSO
                        </button>
                        <button type="button" onClick={() => setInsCustoDe("terceiro")}
                          className={`py-3 rounded-xl border-2 text-sm font-bold transition ${insCustoDe === "terceiro" ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-gray-200 text-gray-600"}`}>
                          DO TERCEIRO (descontar)
                        </button>
                      </div>
                      {insCustoDe === "terceiro" && (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Contrato do terceiro *</label>
                            <select className="w-full border-2 rounded-xl p-3 text-base" value={insContratoId} onChange={e => setInsContratoId(Number(e.target.value))}>
                              <option value={0}>— selecione o contrato —</option>
                              {(contratosTerceiro as any[]).filter((c: any) => !String(c.status || "").startsWith("cancelad")).map((c: any) => (
                                <option key={c.id} value={c.id}>{c.numero || `#${c.id}`} — {c.empresaNome || c.empresa?.razaoSocial || c.descricao || ""}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Tipo do desconto</label>
                            <select className="w-full border-2 rounded-xl p-3 text-base" value={insDescTipo} onChange={e => setInsDescTipo(e.target.value as any)}>
                              <option value="insumo">Insumo</option>
                              <option value="epi">EPI</option>
                              <option value="ferramental">Ferramental</option>
                              <option value="outro">Outro</option>
                            </select>
                          </div>
                          <p className="text-xs text-amber-700">O valor (preço do item no almoxarifado × quantidade) entra como débito do contrato e é descontado na próxima medição.</p>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                  {/* Item */}
                  <div className="relative">
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Selecionar Item *</label>
                    {isLoading && (
                      <div className="mb-2">
                        <div className="flex items-center gap-2 text-xs text-amber-600 mb-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Carregando itens...</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-amber-500 h-1.5 rounded-full animate-pulse" style={{ width: "60%" }} />
                        </div>
                      </div>
                    )}
                    {insItemId ? (
                      <div className="w-full border-2 border-amber-300 bg-amber-50 rounded-xl p-3 text-base flex items-center justify-between">
                        <span className="truncate">{(() => { const it = itens.find((i: any) => i.id === insItemId); return it ? `${it.nome} — Estoque: ${fmtQtd(it.quantidadeAtual)} ${it.unidade || "un"}` : ""; })()}</span>
                        <button type="button" onClick={() => { setInsItemId(0); setInsItemSearch(""); }} className="ml-2 text-gray-400 hover:text-red-500 flex-shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="w-full border-2 rounded-xl p-3 text-base"
                        placeholder="Digite para filtrar..."
                        value={insItemSearch}
                        autoComplete="off"
                        onChange={e => { setInsItemSearch(e.target.value); setInsItemFocused(true); }}
                        onFocus={() => setInsItemFocused(true)}
                        onBlur={() => setTimeout(() => setInsItemFocused(false), 180)}
                      />
                    )}
                    {insItemFocused && !insItemId && (() => {
                      const q = norm(insItemSearch);
                      const filtered = itens.filter((i: any) => !q || norm(`${i.nome} ${i.unidade || ""}`).includes(q));
                      return filtered.length > 0 ? (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                          {filtered.slice(0, 50).map((i: any) => (
                            <button key={i.id} type="button" className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm transition truncate" onMouseDown={() => { setInsItemId(i.id); setInsItemSearch(i.nome); setInsItemFocused(false); }}>
                              {i.nome} — Estoque: {fmtQtd(i.quantidadeAtual)} {i.unidade || "un"}
                            </button>
                          ))}
                        </div>
                      ) : insItemSearch.length >= 2 ? (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
                          <p className="text-xs text-red-500">Nenhum item encontrado</p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  {/* Quantidade */}
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Quantidade</label>
                    <input type="number" inputMode="numeric" min="1" step="1" className="w-full border-2 rounded-xl p-4 text-xl font-bold text-center" value={insQtd} onChange={e => setInsQtd(String(Math.round(parseFloat(e.target.value) || 1)))} />
                  </div>
                  {/* Obra */}
                  {typeof obraContexto === "number" ? (
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Obra de destino</label>
                      <div className="w-full border-2 border-gray-200 rounded-xl p-3 text-base bg-gray-50 text-gray-700 flex items-center gap-2">
                        <HardHat className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        {(() => { const o = (obrasAtivas as any[]).find((o: any) => o.id === obraContexto); return o ? (o.codigo ? `${o.codigo} – ${o.nome}` : o.nome) : "Obra atual"; })()}
                        <span className="ml-auto text-xs text-gray-400">automático</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Obra de destino *</label>
                      <select className="w-full border-2 rounded-xl p-3 text-base" value={insObraId} onChange={e => setInsObraId(Number(e.target.value))}>
                        <option value={0}>— selecione a obra —</option>
                        {(obrasAtivas as any[]).map((o: any) => <option key={o.id} value={o.id}>{o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</option>)}
                      </select>
                    </div>
                  )}
                  {/* Motivo */}
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Motivo / Observação</label>
                    <input type="text" className="w-full border-2 rounded-xl p-3 text-base" placeholder="Ex: Disco de corte para produção..." value={insMotivo} onChange={e => setInsMotivo(e.target.value)} />
                  </div>
                  {insErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{insErr}</p>}
                  <button
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition"
                    disabled={(insTipo === "mao_obra" ? !insSelecionado : (!insTerceiroNome.trim() || !insCustoDe || (insCustoDe === "terceiro" && !insContratoId))) || !insItemId || !insQtd || (typeof obraContexto !== "number" && !insObraId) || registerInsumo.isPending}
                    onClick={() => {
                      const efectiveObraId = typeof obraContexto === "number" ? obraContexto : insObraId;
                      const obraSel = (obrasAtivas as any[]).find((o: any) => o.id === efectiveObraId);
                      registerInsumo.mutate({
                        companyId, itemId: insItemId,
                        quantidade: parseFloat(insQtd),
                        ...(insTipo === "terceiro"
                          ? {
                              terceiroNome: insTerceiroNome.trim(), terceiroEmpresa: insTerceiroEmpresa.trim() || undefined,
                              custoDe: insCustoDe || undefined,
                              ...(insCustoDe === "terceiro" ? { terceiroContratoId: insContratoId, descontoTipo: insDescTipo } : {}),
                            }
                          : { funcionarioCodigo: insSelecionado?.codigoInterno || insCodigo }),
                        obraId: efectiveObraId || undefined,
                        obraNome: obraSel ? (obraSel.codigo ? `${obraSel.codigo} – ${obraSel.nome}` : obraSel.nome) : undefined,
                        motivo: insMotivo || undefined,
                      });
                    }}
                  >
                    {registerInsumo.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "🛒 CONFIRMAR INSUMO"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL TRANSFERÊNCIA ══════════════════════════════════════ */}
      {modalTransf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full h-full overflow-y-auto" style={{ background: "#ffffff", color: "#111827" }}>
            {transfOk ? (
              <>
                <div className="p-8 text-center space-y-3">
                  <CheckCircle2 className="w-16 h-16 text-purple-500 mx-auto" />
                  <p className="text-xl font-bold text-purple-700">Transferência realizada!</p>
                  <p className="text-gray-600 text-sm">
                    <strong>{transfOk.item}</strong><br/>
                    <span className="text-purple-600">{transfOk.origem}</span> → <span className="text-purple-600">{transfOk.destino}</span>
                  </p>
                </div>
                <div className="p-4 flex gap-3">
                  <button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl text-base" onClick={() => { resetTransf(); }}>Nova transferência</button>
                  <button className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-xl text-base" onClick={() => { setModalTransf(false); resetTransf(); }}>Fechar</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 border-b">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-purple-500" /> Transferir entre Almoxarifados</h2>
                  <button onClick={() => setModalTransf(false)}><X className="w-6 h-6 text-gray-400" /></button>
                </div>
                <div className="p-4 space-y-4">
                  {/* ORIGEM */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">Almoxarifado de Origem</p>
                    <select className="w-full border-2 border-purple-200 rounded-xl p-3 text-base bg-white"
                      value={transfOrigemTipo === "central" ? "central" : String(transfOrigemObraId)}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === "central") { setTransfOrigemTipo("central"); setTransfOrigemObraId(0); }
                        else { setTransfOrigemTipo("obra"); setTransfOrigemObraId(Number(v)); }
                        setTransfItemId(0); setTransfBusca(""); setTransfDropOpen(false);
                      }}
                    >
                      <option value="central">🏢 Almoxarifado Central</option>
                      {(obrasAtivas as any[]).map((o: any) => <option key={o.id} value={o.id}>🏗️ {o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</option>)}
                    </select>
                    <div className="relative">
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Item a transferir *</label>
                      <input
                        type="text"
                        className="w-full border-2 rounded-xl p-3 text-base"
                        placeholder="Digite código ou nome para buscar..."
                        value={transfItemId ? (itensOrigem as any[]).find((i: any) => i.id === transfItemId)?.nome || "" : transfBusca ?? ""}
                        onChange={e => { setTransfBusca(e.target.value); setTransfItemId(0); setTransfDropOpen(true); }}
                        onFocus={() => setTransfDropOpen(true)}
                        onBlur={() => setTimeout(() => setTransfDropOpen(false), 200)}
                      />
                      {transfItemId > 0 && (
                        <button type="button" className="absolute right-3 top-9 text-gray-400 hover:text-gray-600" onClick={() => { setTransfItemId(0); setTransfBusca(""); }}>
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {transfDropOpen && !transfItemId && (
                        <div className="absolute z-50 w-full mt-1 bg-white border-2 border-purple-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                          {(itensOrigem as any[])
                            .filter((i: any) => {
                              if (!transfBusca) return true;
                              const q = transfBusca.toLowerCase();
                              return (i.nome || "").toLowerCase().includes(q)
                                || (i.codigoInterno || "").toLowerCase().includes(q)
                                || (i.codigoBarras || "").toLowerCase().includes(q);
                            })
                            .map((i: any) => (
                              <button
                                key={i.id}
                                type="button"
                                className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm border-b last:border-b-0 flex items-center gap-2"
                                onClick={() => { setTransfItemId(i.id); setTransfBusca(""); setTransfDropOpen(false); }}
                              >
                                {/* Rev. 4568 — foto do produto no dropdown de transferência */}
                                {i.fotoUrl ? (
                                  <img src={i.fotoUrl} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} className="w-9 h-9 rounded-lg object-cover border border-gray-200 flex-shrink-0 bg-white" />
                                ) : (
                                  <span className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 text-gray-300">
                                    <Package className="w-4 h-4" />
                                  </span>
                                )}
                                <span className="truncate flex-1 min-w-0">
                                  {i.codigoInterno ? <span className="text-purple-600 font-mono mr-1">{i.codigoInterno}</span> : null}
                                  {i.nome}
                                </span>
                                <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">Estoque: {fmtQtd(i.quantidadeAtual)} {i.unidade || "un"}</span>
                              </button>
                            ))}
                          {(itensOrigem as any[]).filter((i: any) => {
                            if (!transfBusca) return true;
                            const q = transfBusca.toLowerCase();
                            return (i.nome || "").toLowerCase().includes(q) || (i.codigoInterno || "").toLowerCase().includes(q) || (i.codigoBarras || "").toLowerCase().includes(q);
                          }).length === 0 && (
                            <div className="px-3 py-3 text-sm text-gray-400 text-center">Nenhum item encontrado</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700 block mb-1">Quantidade</label>
                      <input type="number" inputMode="numeric" min="1" step="1" className="w-full border-2 rounded-xl p-4 text-xl font-bold text-center" value={transfQtd} onChange={e => setTransfQtd(String(Math.round(parseFloat(e.target.value) || 1)))} />
                    </div>
                  </div>

                  {/* DESTINO */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-3">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Almoxarifado de Destino</p>
                    <select className="w-full border-2 border-indigo-200 rounded-xl p-3 text-base bg-white"
                      value={transfDestinoTipo === "central" ? "central" : String(transfDestinoObraId)}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === "central") { setTransfDestinoTipo("central"); setTransfDestinoObraId(0); }
                        else { setTransfDestinoTipo("obra"); setTransfDestinoObraId(Number(v)); }
                      }}
                    >
                      <option value="central">🏢 Almoxarifado Central</option>
                      {(obrasParaTransferir as any[]).map((o: any) => <option key={o.id} value={o.id}>🏗️ {o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</option>)}
                    </select>
                    {/* Aviso se origem = destino */}
                    {transfOrigemTipo === transfDestinoTipo && (transfOrigemTipo === "central" || transfOrigemObraId === transfDestinoObraId) && (
                      <p className="text-xs text-red-500 font-medium">⚠️ Origem e destino não podem ser iguais</p>
                    )}
                  </div>

                  {/* MOTIVO */}
                  <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1">Motivo / Observação</label>
                    <input type="text" className="w-full border-2 rounded-xl p-3 text-base" placeholder="Ex: Material excedente, obra encerrada..." value={transfMotivo} onChange={e => setTransfMotivo(e.target.value)} />
                  </div>

                  {transfErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{transfErr}</p>}

                  <button
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition"
                    disabled={
                      !transfItemId || !transfQtd || parseFloat(transfQtd) <= 0 ||
                      (transfDestinoTipo === "obra" && !transfDestinoObraId) ||
                      (transfOrigemTipo === "central" && transfDestinoTipo === "central") ||
                      (transfOrigemTipo === "obra" && transfDestinoTipo === "obra" && transfOrigemObraId === transfDestinoObraId) ||
                      createTransferencia.isPending
                    }
                    onClick={() => {
                      const origemObraSel = (obrasAtivas as any[]).find((o: any) => o.id === transfOrigemObraId);
                      const destinoObraSel = (obrasAtivas as any[]).find((o: any) => o.id === transfDestinoObraId);
                      createTransferencia.mutate({
                        companyId,
                        itemIdOrigem: transfItemId,
                        quantidade: parseFloat(transfQtd),
                        origemTipo: transfOrigemTipo,
                        origemObraId: transfOrigemTipo === "obra" ? transfOrigemObraId : undefined,
                        origemObraNome: origemObraSel ? (origemObraSel.codigo ? `${origemObraSel.codigo} – ${origemObraSel.nome}` : origemObraSel.nome) : undefined,
                        destinoTipo: transfDestinoTipo,
                        destinoObraId: transfDestinoTipo === "obra" ? transfDestinoObraId : undefined,
                        destinoObraNome: destinoObraSel ? (destinoObraSel.codigo ? `${destinoObraSel.codigo} – ${destinoObraSel.nome}` : destinoObraSel.nome) : undefined,
                        motivo: transfMotivo || undefined,
                      });
                    }}
                  >
                    {createTransferencia.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "↔ CONFIRMAR TRANSFERÊNCIA"}
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
          <div className="flex items-center justify-between p-4 border-b gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => setModalFecharDia(false)} className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="w-6 h-6 text-gray-500" /></button>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 truncate"><ClipboardCheck className="w-5 h-5 text-gray-700 flex-shrink-0" /> Fechar Dia — Pendências de Devolução</h2>
            </div>
            <button onClick={() => setModalFecharDia(false)}><X className="w-7 h-7 text-gray-400" /></button>
          </div>
          <div className="p-4 border-b bg-gray-50">
            <label className="text-xs font-semibold text-gray-500 uppercase">Filtrar por obra</label>
            <select
              className="mt-1 w-full h-10 border border-gray-200 rounded-lg px-3 text-sm bg-white"
              value={String(fecharDiaObraFiltro)}
              onChange={(e) => setFecharDiaObraFiltro(e.target.value === "todas" ? "todas" : Number(e.target.value))}
            >
              <option value="todas">Todas as obras</option>
              {/* Rev. 4541 — só obras que o usuário pode OPERAR (devolução = escrita) */}
              {obrasEditaveis.map((o: any) => (
                <option key={o.id} value={o.id}>{o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {emprestimosHoje.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-3" />
                <p className="text-lg font-semibold text-gray-700">Nenhuma pendência!</p>
                <p className="text-sm text-gray-500 mt-1">Todos os empréstimos em aberto foram devolvidos.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">{emprestimosHoje.length} item(s) pendente(s) de devolução (todos os dias em aberto)</p>
                {emprestimosHoje.map(loan => {
                  const atrasado = loan.dataEmprestimo && loan.dataEmprestimo !== hojeStr;
                  return (
                    <div key={loan.id} className="bg-white border-2 rounded-xl p-4 space-y-2" style={{ borderColor: atrasado ? "#f97316" : "#fca5a5" }}>
                      <div className="flex items-start justify-between gap-2">
                        {/* Rev. 4552 — foto do funcionário (clique = ampliar) p/ facilitar a localização */}
                        {(loan as any).funcionarioFotoUrl ? (
                          <img
                            src={`${(loan as any).funcionarioFotoUrl}${String((loan as any).funcionarioFotoUrl).includes("?") ? "&" : "?"}w=128`}
                            alt={loan.funcionarioNome || "Funcionário"}
                            className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 flex-shrink-0 cursor-pointer hover:opacity-80 transition"
                            onClick={() => setFotoExpandida({ url: (loan as any).funcionarioFotoUrl, nome: loan.funcionarioNome || "Funcionário" })}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-100 border-2 border-gray-200 flex items-center justify-center flex-shrink-0">
                            <User className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-base uppercase">{loan.itemNome}</p>
                          <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" /> {loan.funcionarioNome}
                          </p>
                          {loan.obraNome && (
                            <p className="text-xs text-gray-500 mt-0.5">📍 {loan.obraNome}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            {loan.dataEmprestimo
                              ? new Date(loan.dataEmprestimo + "T00:00:00").toLocaleDateString("pt-BR")
                              : ""}{loan.horaEmprestimo ? ` às ${loan.horaEmprestimo}` : ""} — Qtd: {fmtQtd(loan.quantidade)}
                          </p>
                        </div>
                        {atrasado ? (
                          <span className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-1 rounded-full flex-shrink-0 animate-pulse">⚠️ Dia anterior</span>
                        ) : (
                          <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-full flex-shrink-0 animate-pulse">⏳ Pendente</span>
                        )}
                      </div>
                      <button
                        onClick={() => returnLoan.mutate({ loanId: loan.id })}
                        disabled={returnLoan.isPending}
                        className="w-full text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 font-semibold transition disabled:opacity-60"
                      >
                        Devolver
                      </button>
                    </div>
                  );
                })}
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
                      onClick={() => companyId && setModalAuditoria({
                        tipo: "excluir_unidade",
                        titulo: "Excluir unidade?",
                        subtitulo: `"${u.sigla}"`,
                        descricao: (
                          <p>Itens existentes que usam esta unidade <strong>não são alterados</strong> — só a unidade some da lista de cadastro.</p>
                        ),
                        textoBotao: "Excluir",
                        executar: async ({ senha, justificativa }) => {
                          setModalAuditoria((p) => p ? { ...p, carregando: true } : p);
                          try { await excluirUnidadeMut.mutateAsync({ id: u.id, companyId, senha, justificativa }); }
                          catch {}
                        },
                      })}
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
            <div className="flex items-center gap-2">
              <button onClick={() => setModalRegistros(false)} className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h2 className="text-base font-bold text-gray-900">Registros do Almoxarifado</h2>
            </div>
            <button onClick={() => setModalRegistros(false)} className="text-gray-400 hover:text-gray-600 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Abas */}
          <div className="flex border-b bg-white overflow-x-auto">
            {([
              { key: "entradas",    label: "↓ Entradas",    cls: "text-emerald-700 border-emerald-500" },
              { key: "emprestados", label: "🔧 Ferramentas em Aberto", cls: "text-blue-700 border-blue-500" },
              { key: "insumos",        label: "🛒 Insumos",        cls: "text-amber-700 border-amber-500" },
              { key: "transferencias", label: "↔ Transferências", cls: "text-purple-700 border-purple-500" },
              { key: "cadastros",      label: "📦 Cadastros",      cls: "text-gray-700 border-gray-500" },
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
          {/* ── FILTRO DE DATA ───────────────────────────────────── */}
          {abaRegistros !== "cadastros" && (
            <div className="flex items-center justify-between bg-gray-50 border-b px-4 py-2 gap-2">
              <button
                onClick={() => {
                  const d = new Date(filtroData + "T12:00:00");
                  d.setDate(d.getDate() - 1);
                  setFiltroData(d.toISOString().split("T")[0]);
                }}
                className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 transition text-gray-600 font-bold text-lg"
              >‹</button>
              <div className="flex flex-col items-center flex-1">
                <input
                  type="date"
                  value={filtroData}
                  max={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
                  onChange={e => setFiltroData(e.target.value)}
                  className="text-sm font-semibold text-gray-800 bg-transparent border-none outline-none text-center cursor-pointer"
                />
                {filtroData === new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) ? (
                  <span className="text-xs text-emerald-600 font-bold">HOJE</span>
                ) : filtroData === new Date(new Date(hojeStr + "T12:00:00Z").getTime() - 86400000).toISOString().slice(0, 10) ? (
                  <span className="text-xs text-blue-500 font-semibold">ONTEM</span>
                ) : (
                  <span className="text-xs text-gray-400">
                    {new Date(filtroData + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" }).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  const d = new Date(filtroData + "T12:00:00");
                  const hoje = new Date();
                  hoje.setHours(0,0,0,0);
                  if (d < hoje) {
                    d.setDate(d.getDate() + 1);
                    setFiltroData(d.toISOString().split("T")[0]);
                  }
                }}
                className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 transition text-gray-600 font-bold text-lg disabled:opacity-30"
                disabled={filtroData === new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
              >›</button>
            </div>
          )}

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
                        +{fmtQtd(m.quantidade)} {m.unidade ?? "un"}
                        {m.motivo ? ` · ${m.motivo}` : ""}
                        {m.usuarioNome ? ` · ${m.usuarioNome}` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400">{m.criadoEm ? formatDateTime(m.criadoEm) : "—"}</p>
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
                        -{fmtQtd(m.quantidade)} {m.unidade ?? "un"}
                        {m.obraNome ? ` · ${m.obraNome}` : ""}
                        {m.usuarioNome ? ` · ${m.usuarioNome}` : ""}
                      </p>
                      <p className="text-[11px] text-gray-400">{m.criadoEm ? formatDateTime(m.criadoEm) : "—"}</p>
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
              (() => {
                // Agrupa empréstimos por funcionário (chave: codigo || nome).
                // Rev. 4005 — listOpenLoans com `data` traz devolvido+pendente do dia
                // (sem filtro de status); aqui só interessam os PENDENTES pra decidir
                // se ainda cabe "Devolver Todas" — senão o botão ficava aparecendo
                // mesmo com tudo já devolvido.
                const grupos = new Map<string, { nome: string; codigo: string; fotoUrl: string | null; itens: any[]; totalDia: number }>();
                for (const l of loansAbertos as any[]) {
                  const key = String(l.funcionarioCodigo || l.funcionarioNome || "—");
                  if (!grupos.has(key)) grupos.set(key, { nome: l.funcionarioNome || "—", codigo: l.funcionarioCodigo || "", fotoUrl: l.funcionarioFotoUrl || null, itens: [], totalDia: 0 });
                  const g = grupos.get(key)!;
                  g.totalDia++;
                  if (l.status === "emprestado") g.itens.push(l);
                }
                const gruposArr = Array.from(grupos.values()).filter((g) => g.itens.length > 0).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
                function devolverGrupo(g: { itens: any[] }) {
                  setAssinaturaDevolucaoDataUrl(null);
                  setModalAssinaturaDevolucao({ tipo: "grupo", grupo: g });
                }
                return (
                  <div className="space-y-3">
                    {gruposArr.map((g) => (
                      <div key={g.codigo + g.nome} className="border-2 border-blue-200 rounded-xl overflow-hidden">
                        <div className="bg-blue-100 px-4 py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Rev. 4552 — foto do funcionário (clique = ampliar) */}
                            {g.fotoUrl ? (
                              <img
                                src={`${g.fotoUrl}${g.fotoUrl.includes("?") ? "&" : "?"}w=128`}
                                alt={g.nome}
                                className="w-9 h-9 rounded-full object-cover border-2 border-blue-300 shrink-0 cursor-pointer hover:opacity-80 transition"
                                onClick={() => setFotoExpandida({ url: g.fotoUrl!, nome: g.nome })}
                              />
                            ) : (
                              <User className="w-4 h-4 text-blue-700 shrink-0" />
                            )}
                            <p className="font-bold text-blue-900 text-sm truncate">
                              {g.nome}{g.codigo ? <span className="text-blue-700 font-normal"> ({g.codigo})</span> : null}
                            </p>
                            <span className="text-[11px] font-semibold text-blue-700 bg-white px-2 py-0.5 rounded-full shrink-0">{g.itens.length} item(ns)</span>
                          </div>
                          {g.itens.length > 1 && (
                            <button
                              onClick={() => devolverGrupo(g)}
                              disabled={returnLoan.isPending}
                              className="shrink-0 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 font-semibold transition disabled:opacity-60"
                              title="Devolver todas as ferramentas deste funcionário"
                            >
                              Devolver Todas
                            </button>
                          )}
                        </div>
                        <div className="divide-y divide-blue-100">
                          {g.itens.map((l: any) => {
                            // Rev. 4772 — data BR + alerta de não devolvido (empréstimo de dia anterior ainda aberto)
                            const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
                            const dataEmpIso = String(l.dataEmprestimo || "").slice(0, 10);
                            const dataEmpBR = dataEmpIso ? dataEmpIso.split("-").reverse().join("/") : "";
                            const atrasado = l.status === "emprestado" && !!dataEmpIso && dataEmpIso < hojeSP;
                            const diasAtraso = atrasado ? Math.round((new Date(hojeSP + "T12:00:00Z").getTime() - new Date(dataEmpIso + "T12:00:00Z").getTime()) / 86400000) : 0;
                            return (
                            <div key={l.id} className={`px-4 py-2 flex items-center gap-3 ${atrasado ? "bg-red-50 border-l-4 border-red-500" : "bg-blue-50"}`}>
                              {atrasado
                                ? <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                : <Wrench className="w-4 h-4 text-blue-500 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate uppercase">{l.itemNome}</p>
                                <p className="text-[11px] text-gray-500">{fmtQtd(l.quantidade)} un · Emprestado em {dataEmpBR}{l.horaEmprestimo ? ` às ${l.horaEmprestimo}` : ""}</p>
                                {l.obraNome && <p className="text-[11px] text-blue-700">🏗️ {l.obraNome}</p>}
                                {atrasado && (
                                  <p className="text-[11px] font-bold text-red-600">
                                    ⚠️ Não devolvido — {diasAtraso === 1 ? "1 dia" : `${diasAtraso} dias`} em aberto
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => { setAssinaturaDevolucaoDataUrl(null); setModalAssinaturaDevolucao({ tipo: "individual", loan: l }); }}
                                disabled={returnLoan.isPending}
                                className="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 font-semibold transition disabled:opacity-60"
                              >
                                Devolver
                              </button>
                            </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}

            {/* INSUMOS */}
            {abaRegistros === "insumos" && (
              loadingInsumos ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div> :
              (insumosRegistros as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <ShoppingCart className="w-12 h-12 text-amber-300" />
                  <p className="text-gray-500 font-medium">Nenhuma saída de insumo registrada</p>
                </div>
              ) :
              <div className="space-y-2">
                {(insumosRegistros as any[]).map((r: any) => (
                  <div key={r.id} className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <ShoppingCart className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{r.item_nome}</p>
                      <p className="text-xs text-gray-600">
                        {fmtQtd(r.quantidade)} {r.unidade || "un"} · <span className="font-medium">{r.funcionario_nome}</span>
                        {r.funcionario_codigo ? ` (${r.funcionario_codigo})` : ""}
                      </p>
                      {r.obra_nome && <p className="text-[11px] text-amber-700">🏗️ {r.obra_nome}</p>}
                      {r.motivo && <p className="text-[11px] text-gray-400 italic">{r.motivo}</p>}
                      <p className="text-[11px] text-gray-400">{r.created_at ? formatDateTime(r.created_at) : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TRANSFERÊNCIAS */}
            {abaRegistros === "transferencias" && (
              loadingTransferencias ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div> :
              (transferenciasRegistros as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <ArrowLeftRight className="w-12 h-12 text-purple-300" />
                  <p className="text-gray-500 font-medium">Nenhuma transferência registrada</p>
                </div>
              ) :
              <div className="space-y-2">
                {(transferenciasRegistros as any[]).map((t: any) => {
                  const origemLabel = t.origem_tipo === "central" ? "🏢 Central" : `🏗️ ${t.origem_obra_nome || "Obra"}`;
                  const destinoLabel = t.destino_tipo === "central" ? "🏢 Central" : `🏗️ ${t.destino_obra_nome || "Obra"}`;
                  return (
                    <div key={t.id} className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ArrowLeftRight className="w-4 h-4 text-purple-500 shrink-0" />
                        <p className="font-semibold text-gray-900 text-sm truncate">{t.item_nome}</p>
                        <span className="ml-auto text-sm font-bold text-purple-700 shrink-0">{fmtQtd(t.quantidade)} {t.unidade || "un"}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <span className="px-2 py-0.5 bg-purple-100 rounded-full font-medium">{origemLabel}</span>
                        <span className="text-purple-400">→</span>
                        <span className="px-2 py-0.5 bg-purple-100 rounded-full font-medium">{destinoLabel}</span>
                      </div>
                      {t.motivo && <p className="text-[11px] text-gray-400 italic mt-1">{t.motivo}</p>}
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[11px] text-gray-400">{t.created_at ? formatDateTime(t.created_at) : ""}</p>
                        {t.almoxarife_nome && <p className="text-[11px] text-purple-600 font-medium">Enviado por {t.almoxarife_nome}</p>}
                      </div>
                    </div>
                  );
                })}
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
                      <p className="text-sm font-bold text-gray-900">{fmtQtd(item.quantidadeAtual)}</p>
                      <p className="text-[11px] text-gray-400">{item.unidade}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Modal Locações a Vencer (Rev. 2567 → redesign FULL SCREEN Rev. 4559) ── */}
      {modalLocacoesVencendo && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm">
          <div className="absolute inset-0 bg-slate-50 flex flex-col overflow-hidden">
            {/* Header full-width moderno */}
            <div className="relative flex-shrink-0 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900 text-white overflow-hidden">
              <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
              <div className="relative max-w-6xl mx-auto w-full px-4 sm:px-6 pt-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/20 ring-1 ring-amber-400/40 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="h-5 w-5 text-amber-300" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg sm:text-xl font-bold tracking-tight break-words">Locações a Vencer</h2>
                      <p className="text-xs text-slate-300 break-words">Renove ou devolva os equipamentos locados com vencimento próximo.</p>
                    </div>
                  </div>
                  <button onClick={() => setModalLocacoesVencendo(false)} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition flex-shrink-0">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {(() => {
                  const venc = itensLocadosVencendo.filter((i: any) => i.diasParaVencimento <= 0).length;
                  return (
                    <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3 max-w-md">
                      <div className="rounded-xl bg-white/10 ring-1 ring-white/10 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-slate-300 font-semibold">Total</p>
                        <p className="text-xl font-bold leading-tight">{itensLocadosVencendo.length}</p>
                      </div>
                      <div className="rounded-xl bg-red-500/15 ring-1 ring-red-400/30 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-red-300 font-semibold">Vencidas</p>
                        <p className="text-xl font-bold leading-tight text-red-200">{venc}</p>
                      </div>
                      <div className="rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">A vencer</p>
                        <p className="text-xl font-bold leading-tight text-amber-200">{itensLocadosVencendo.length - venc}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Grid de cards */}
            <div className="flex-1 overflow-y-auto">
              {itensLocadosVencendo.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">Nenhuma locação a vencer.</p>
              ) : (
                <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">
                  {itensLocadosVencendo.map((i: any) => {
                    const vencido = i.diasParaVencimento <= 0;
                    const renov = Number(i.renovacoesCount) || 0;
                    return (
                      <div key={i.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                        <div className={`h-1.5 w-full ${vencido ? "bg-red-500" : "bg-amber-400"}`} />
                        <div className="p-4 flex items-start gap-3">
                          {i.fotoLocado ? (
                            <img src={i.fotoLocado} className="w-16 h-16 rounded-xl object-cover ring-1 ring-slate-200 flex-shrink-0 pointer-events-none select-none" alt="" loading="lazy" draggable={false} />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                              <Camera className="h-5 w-5 text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900 break-words leading-snug">{i.nome}</p>
                            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${vencido ? "bg-red-100 text-red-700 ring-1 ring-red-200" : "bg-amber-100 text-amber-800 ring-1 ring-amber-200"}`}>
                                {vencido
                                  ? `Vencido${i.diasParaVencimento < 0 ? ` há ${Math.abs(i.diasParaVencimento)}d` : " hoje"}`
                                  : `Vence em ${i.diasParaVencimento}d`}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${renov > 0 ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}>
                                <RefreshCw className="h-2.5 w-2.5" />
                                {renov > 0 ? `${renov}ª Renovação` : "1ª Locação"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="px-4 pb-3 space-y-1 text-xs text-slate-600">
                          {i.obraNome && <p className="break-words"><span className="text-slate-400 font-medium">Obra:</span> {i.obraNome}</p>}
                          {i.fornecedorLocacao && <p className="break-words"><span className="text-slate-400 font-medium">Fornecedor:</span> {i.fornecedorLocacao}</p>}
                          <div className="flex items-center justify-between pt-1">
                            {i.dataVencimentoLocacao ? (
                              <span>Venc.: <b className="text-slate-800">{new Date(i.dataVencimentoLocacao + "T00:00:00").toLocaleDateString("pt-BR")}</b></span>
                            ) : <span />}
                            {i.valorLocacaoMensal != null && (
                              <span className="font-bold text-slate-900">R$ {Number(i.valorLocacaoMensal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="text-[10px] font-medium text-slate-500">/mês</span></span>
                            )}
                          </div>
                        </div>
                        <div className="px-4 pb-4 mt-auto grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => { setModalLocacoesVencendo(false); abrirRenovarLocacao(i); }}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-sm"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" /> Renovar
                          </button>
                          <button
                            type="button"
                            onClick={() => { setModalLocacoesVencendo(false); abrirDevolverLocacao(i); }}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 text-xs font-semibold transition"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Devolver
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer fixo */}
            <div className="flex-shrink-0 bg-white/90 backdrop-blur border-t border-slate-200">
              <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-3 flex gap-3">
                <button onClick={() => setModalLocacoesVencendo(false)} className="flex-1 sm:flex-none sm:px-8 h-11 text-sm border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 font-medium transition">Fechar</button>
                <button
                  onClick={() => { setModalLocacoesVencendo(false); setLocation("/equipamentos/locados"); }}
                  className="flex-1 h-11 text-sm rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold transition shadow-sm"
                >
                  Ver Equipamentos Locados
                </button>
              </div>
            </div>
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
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <p className="text-sm font-semibold text-amber-800">{itemDevolverLocacao.nome}</p>
                {itemDevolverLocacao.fornecedorLocacao && (
                  <p className="text-xs text-amber-600">Fornecedor: {itemDevolverLocacao.fornecedorLocacao}</p>
                )}
                {itemDevolverLocacao.dataVencimentoLocacao && (() => {
                  const dias = Math.ceil((new Date(itemDevolverLocacao.dataVencimentoLocacao + "T00:00:00").getTime() - Date.now()) / 86400000);
                  return (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-amber-600">Vencimento: {new Date(itemDevolverLocacao.dataVencimentoLocacao + "T00:00:00").toLocaleDateString("pt-BR")}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dias <= 0 ? "bg-red-600 text-white" : dias <= 7 ? "bg-orange-500 text-white" : "bg-amber-200 text-amber-800"}`}>
                        {dias <= 0 ? `⚠ VENCIDO há ${Math.abs(dias)}d` : `Vence em ${dias}d`}
                      </span>
                    </div>
                  );
                })()}
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

      {/* Rev. 4011 — Modal de assinatura opcional na devolução de ferramenta emprestada. */}
      {modalAssinaturaDevolucao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setModalAssinaturaDevolucao(null)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-500" /> Confirmar Devolução
              </h2>
              <button onClick={() => setModalAssinaturaDevolucao(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                {modalAssinaturaDevolucao.tipo === "grupo"
                  ? `${modalAssinaturaDevolucao.grupo?.itens.length ?? 0} ferramenta(s) serão marcadas como devolvidas.`
                  : `Ferramenta "${modalAssinaturaDevolucao.loan?.itemNome}" será marcada como devolvida.`}
              </p>
              <SignaturePad
                label="Assinatura de quem devolveu (opcional)"
                value={assinaturaDevolucaoDataUrl}
                onChange={setAssinaturaDevolucaoDataUrl}
                height={140}
              />
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalAssinaturaDevolucao(null)} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition">Cancelar</button>
                <button
                  onClick={confirmarDevolucaoComAssinatura}
                  disabled={returnLoan.isPending}
                  className="flex-1 h-9 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {returnLoan.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fotoExpandida && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setFotoExpandida(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setFotoExpandida(null)}
              className="absolute -top-3 -right-3 z-10 bg-white text-gray-700 hover:bg-gray-100 rounded-full p-1.5 shadow-lg transition"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={fotoExpandida.url}
              alt={fotoExpandida.nome}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            <p className="text-center text-white text-sm mt-3 font-medium drop-shadow">{fotoExpandida.nome}</p>
          </div>
        </div>
      )}

      {/* Rev. 2374/2383 — Barra sticky de ações do modo seleção CONSOLIDADO.
          "Alterar categoria" sempre disponível; PRÓPRIO/ALUGADO só quando o
          filtro for Equipamentos/Ferramentas/Escoramento. */}
      {modoClassificarEquip && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t-4 border-indigo-500 shadow-[0_-8px_24px_rgba(0,0,0,0.15)]">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-bold text-indigo-900">
                {selecClassif.size} item{selecClassif.size !== 1 ? "ns" : ""} selecionado{selecClassif.size !== 1 ? "s" : ""}
              </p>
              <p className="text-[11px] text-gray-500 leading-tight">
                {selecClassif.size === 0
                  ? "Toque pra escolher · Shift+clique pra marcar um intervalo."
                  : "Escolha a ação abaixo."}
              </p>
            </div>
            {/* Rev. 2442 — atalhos de seleção: marca todos os itens visíveis
                (respeita filtro de categoria/busca) ou limpa a seleção. */}
            <button
              onClick={() => marcarTodosClassif(consListFinal as any[])}
              disabled={consListFinal.length === 0}
              className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-2.5 rounded-lg font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="Marcar todos os itens visíveis (respeita filtros)"
            >
              <CheckSquare className="h-3.5 w-3.5" /> Marcar todos ({consListFinal.length})
            </button>
            {selecClassif.size > 0 && (
              <button
                onClick={limparSelClassif}
                className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 px-3 py-2.5 rounded-lg font-semibold text-xs transition"
                title="Limpar seleção"
              >
                <Square className="h-3.5 w-3.5" /> Limpar
              </button>
            )}
            <button
              onClick={() => {
                if (selecClassif.size === 0) { toast.warning("Selecione ao menos 1 item."); return; }
                setModalAltCategConsol({ categoria: "", aplicando: false });
              }}
              disabled={selecClassif.size === 0}
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <Tag className="h-4 w-4" /> Alterar categoria
            </button>
            {(filtroCateg === "Equipamentos" || filtroCateg === "Ferramentas" || filtroCateg === "Escoramento") && (
              <>
                <button
                  onClick={() => classificarComo("proprio")}
                  disabled={selecClassif.size === 0}
                  className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <HardHat className="h-4 w-4" /> É PRÓPRIO da FC
                </button>
                <button
                  onClick={() => classificarComo("alugado")}
                  disabled={selecClassif.size === 0}
                  className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-xl font-bold text-sm shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Truck className="h-4 w-4" /> É ALUGADO
                </button>
              </>
            )}
            <button
              onClick={sairModoClassif}
              className="px-3 py-3 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Rev. 2383 — Modal "Alterar categoria" disparado pelo modo seleção CONSOLIDADO */}
      {modalAltCategConsol && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
          onClick={() => !modalAltCategConsol.aplicando && setModalAltCategConsol(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pt-6 pb-5 text-white text-center">
              <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3"><Tag className="w-8 h-8" /></div>
              <h3 className="text-xl font-bold">Alterar categoria em lote</h3>
              <p className="text-emerald-50 text-xs mt-1">{selecClassif.size} nome(s) · aplicado em todos os almoxarifados</p>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nova categoria</label>
                {/* Rev. 2441 — Combobox filtrável (só categorias existentes). */}
                <CategoriaCombobox
                  value={modalAltCategConsol.categoria}
                  onChange={(v) => setModalAltCategConsol(s => s ? { ...s, categoria: v } : s)}
                  opcoes={categorias as string[]}
                  disabled={modalAltCategConsol.aplicando}
                  placeholder="Digite pra filtrar…"
                  allowFree={false}
                  autoFocus
                />
                <p className="text-[11px] text-gray-500 mt-1.5">A categoria será aplicada a todos os itens com esses nomes, em qualquer obra/almoxarifado.</p>
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200">
              <button onClick={() => setModalAltCategConsol(null)} disabled={modalAltCategConsol.aplicando} className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition disabled:opacity-50">Cancelar</button>
              <button onClick={aplicarAlterarCategoriaConsol} disabled={!modalAltCategConsol.categoria || modalAltCategConsol.aplicando} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 rounded-lg transition shadow-sm flex items-center justify-center gap-2">
                {modalAltCategConsol.aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Rev. 2382 — Sticky bar de ações da multi-seleção */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] bg-white shadow-2xl rounded-2xl border border-indigo-200 px-4 py-3 flex items-center gap-3 max-w-[95vw]">
          <div className="flex items-center gap-2 pr-3 border-r border-gray-200">
            <button
              onClick={() => {
                const todosIds = (lista as any[]).map((i: any) => i.id);
                if (selecionados.size === todosIds.length) {
                  setSelecionados(new Set());
                } else {
                  setSelecionados(new Set(todosIds));
                }
              }}
              className="w-9 h-9 rounded-full bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm transition"
              title={selecionados.size === lista.length ? "Desmarcar todos" : "Selecionar todos"}
            >
              {selecionados.size}
            </button>
            <span className="text-xs text-gray-600 hidden sm:inline">
              {selecionados.size === lista.length
                ? <span className="text-indigo-600 font-semibold cursor-pointer" onClick={() => setSelecionados(new Set())}>todos — limpar</span>
                : <span className="cursor-pointer" onClick={() => setSelecionados(new Set((lista as any[]).map((i: any) => i.id)))}>selecionado{selecionados.size !== 1 ? "s" : ""} · <span className="text-indigo-600 font-semibold">todos</span></span>
              }
            </span>
          </div>
          <button
            onClick={() => {
              if (selecionados.size === 0) { toast.warning("Selecione ao menos 1 item."); return; }
              setModalAltCateg({ categoria: "", aplicando: false });
            }}
            className="h-10 px-3 sm:px-4 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition shadow-sm"
          >
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline">Alterar categoria</span>
            <span className="sm:hidden">Categoria</span>
          </button>
          <button
            onClick={abrirUnificarPreview}
            className="h-10 px-3 sm:px-4 flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold rounded-lg transition shadow-sm"
          >
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Unificar duplicatas</span>
            <span className="sm:hidden">Unificar</span>
          </button>
          {/* Rev. 2390 — Transferir em lote */}
          <button
            onClick={abrirTransfLote}
            className="h-10 px-3 sm:px-4 flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition shadow-sm"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span className="hidden sm:inline">Transferir</span>
            <span className="sm:hidden">Transf.</span>
          </button>
          {/* Rev. 2393 — Excluir em lote (soft-delete, auditado) */}
          <button
            onClick={handleExcluirSelecionados}
            className="h-10 px-3 sm:px-4 flex items-center gap-2 bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-sm font-semibold rounded-lg transition shadow-sm"
            title="Remover os itens selecionados (auditado)"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Excluir</span>
          </button>
          <button
            onClick={sairModoSelecao}
            className="h-10 px-3 flex items-center gap-1 text-gray-600 hover:bg-gray-100 text-sm rounded-lg transition"
          >
            <X className="w-4 h-4" /> <span className="hidden sm:inline">Cancelar</span>
          </button>
        </div>
      )}

      {/* Rev. 2382 — Modal "Alterar categoria em lote" */}
      {modalAltCateg && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
          onClick={() => !modalAltCateg.aplicando && setModalAltCateg(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pt-6 pb-5 text-white text-center">
              <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3"><Tag className="w-8 h-8" /></div>
              <h3 className="text-xl font-bold">Alterar categoria em lote</h3>
              <p className="text-emerald-50 text-xs mt-1">{selecionados.size} item(ns) selecionado(s)</p>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Nova categoria</label>
                {/* Rev. 2441 — Combobox filtrável (só categorias existentes). */}
                <CategoriaCombobox
                  value={modalAltCateg.categoria}
                  onChange={(v) => setModalAltCateg(s => s ? { ...s, categoria: v } : s)}
                  opcoes={categorias as string[]}
                  disabled={modalAltCateg.aplicando}
                  placeholder="Digite pra filtrar…"
                  allowFree={false}
                  autoFocus
                />
                <p className="text-[11px] text-gray-500 mt-1.5">A categoria selecionada será aplicada a todos os itens marcados.</p>
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200">
              <button onClick={() => setModalAltCateg(null)} disabled={modalAltCateg.aplicando} className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition disabled:opacity-50">Cancelar</button>
              <button onClick={aplicarAlterarCategoria} disabled={!modalAltCateg.categoria || modalAltCateg.aplicando} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 rounded-lg transition shadow-sm flex items-center justify-center gap-2">
                {modalAltCateg.aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2382 — Modal "Unificar duplicatas" com preview */}
      {modalUnificar && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
          onClick={() => !modalUnificar.aplicando && !modalUnificar.carregando && setModalUnificar(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 px-6 pt-6 pb-5 text-white text-center flex-shrink-0">
              <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3"><Layers className="w-8 h-8" /></div>
              <h3 className="text-xl font-bold">Unificar itens duplicados</h3>
              <p className="text-violet-50 text-xs mt-1">Mesma obra · mesmo nome · mesma unidade · soma quantidades</p>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm text-gray-700 overflow-y-auto flex-1">
              {modalUnificar.carregando && (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-2" />
                  <p className="text-xs">Analisando duplicatas...</p>
                </div>
              )}
              {!modalUnificar.carregando && modalUnificar.erro && (
                <div className="flex flex-col items-center justify-center py-8 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 text-center">
                  <AlertTriangle className="w-8 h-8 mb-2" />
                  <p className="text-sm font-medium">{modalUnificar.erro}</p>
                  <p className="text-[11px] text-gray-500 mt-1">Itens só são considerados duplicatas se tiverem o mesmo nome (sem prefixo/sufixo de código), mesma obra e mesma unidade.</p>
                </div>
              )}
              {!modalUnificar.carregando && !modalUnificar.erro && modalUnificar.grupos.length > 0 && (
                <>
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-xs text-violet-900">
                    <div className="font-semibold mb-1">{modalUnificar.grupos.length} grupo(s) de duplicatas · {modalUnificar.totalInativ} item(ns) serão consolidados</div>
                    <div className="text-violet-700">Em cada grupo, o item com MAIOR quantidade fica como principal e os outros são marcados como inativos (histórico preservado). As quantidades são somadas.</div>
                  </div>
                  {modalUnificar.grupos.map((g: any, i: number) => (
                    <div key={i} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{g.canonicalNome}</p>
                          <p className="text-[11px] text-gray-500">Unidade: {g.unidade}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-gray-400 uppercase">Quantidade final</p>
                          <p className="text-lg font-bold text-violet-600">{fmtQtd(g.qtdDepois)} <span className="text-xs text-gray-400">{g.unidade}</span></p>
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-600 bg-gray-50 rounded p-2 space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-emerald-700 font-medium">✓ Mantém #{g.canonicalId}</span>
                          <span className="text-gray-500">{g.qtdAntes} {g.unidade}</span>
                        </div>
                        {g.inativadosNomes.map((it: any) => (
                          <div key={it.id} className="flex justify-between text-gray-500">
                            <span>+ Inativa #{it.id}</span>
                            <span>{it.qtd} {g.unidade}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200 flex-shrink-0">
              <button onClick={() => setModalUnificar(null)} disabled={modalUnificar.aplicando} className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition disabled:opacity-50">Cancelar</button>
              <button onClick={confirmarUnificar} disabled={modalUnificar.grupos.length === 0 || modalUnificar.aplicando || modalUnificar.carregando} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 disabled:bg-gray-300 rounded-lg transition shadow-sm flex items-center justify-center gap-2">
                {modalUnificar.aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                Confirmar unificação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2390 — Modal "Transferir em lote" */}
      {modalTransfLote && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
          onClick={() => !modalTransfLote.aplicando && setModalTransfLote(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-purple-600 to-indigo-600 px-6 pt-6 pb-5 text-white text-center flex-shrink-0">
              <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3"><ArrowLeftRight className="w-8 h-8" /></div>
              <h3 className="text-xl font-bold">Transferir em lote</h3>
              <p className="text-purple-50 text-xs mt-1">{modalTransfLote.itens.length} item(ns) selecionado(s) · 1 destino comum</p>
            </div>
            <div className="px-5 py-4 space-y-4 text-sm text-gray-700 overflow-y-auto flex-1">
              {/* DESTINO */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">Almoxarifado de destino</p>
                <select
                  className="w-full border-2 border-indigo-200 rounded-lg p-2.5 text-sm bg-white"
                  disabled={modalTransfLote.aplicando}
                  value={modalTransfLote.destinoTipo === "central" ? "central" : String(modalTransfLote.destinoObraId)}
                  onChange={e => {
                    const v = e.target.value;
                    setModalTransfLote(s => s ? (
                      v === "central"
                        ? { ...s, destinoTipo: "central", destinoObraId: 0, resultado: null }
                        : { ...s, destinoTipo: "obra", destinoObraId: Number(v), resultado: null }
                    ) : s);
                  }}
                >
                  <option value="central">🏢 Almoxarifado Central</option>
                  {(obrasParaTransferir as any[]).map((o: any) => (
                    <option key={o.id} value={o.id}>🏗️ {o.codigo ? `${o.codigo} – ${o.nome}` : o.nome}</option>
                  ))}
                </select>
                <p className="text-[11px] text-indigo-700/70">Itens que já estão neste destino serão pulados (você vê a lista no fim).</p>
              </div>

              {/* MOTIVO */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1 uppercase tracking-wide">Motivo / Observação</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none"
                  placeholder="Ex: Material excedente, transferência entre obras..."
                  disabled={modalTransfLote.aplicando}
                  value={modalTransfLote.motivo}
                  onChange={e => setModalTransfLote(s => s ? { ...s, motivo: e.target.value } : s)}
                />
              </div>

              {/* LISTA DE ITENS */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between border-b">
                  <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Itens · qtd a transferir</p>
                  <button
                    type="button"
                    onClick={() => setModalTransfLote(s => s ? { ...s, itens: s.itens.map(it => ({ ...it, qtd: String(it.estoque) })) } : s)}
                    disabled={modalTransfLote.aplicando}
                    className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold disabled:opacity-50"
                  >
                    Preencher tudo
                  </button>
                </div>
                <div className="divide-y divide-gray-100 max-h-[40vh] overflow-y-auto">
                  {modalTransfLote.itens.map((it, idx) => (
                    <div key={it.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{it.nome}</p>
                        <p className="text-[11px] text-gray-500">Estoque: {it.estoque} {it.unidade}</p>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={it.estoque}
                        step="0.01"
                        value={it.qtd}
                        disabled={modalTransfLote.aplicando}
                        onChange={e => setModalTransfLote(s => {
                          if (!s) return s;
                          const itens = [...s.itens];
                          itens[idx] = { ...itens[idx], qtd: e.target.value };
                          return { ...s, itens };
                        })}
                        className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none"
                      />
                      <span className="text-[11px] text-gray-500 w-8">{it.unidade}</span>
                      <button
                        type="button"
                        onClick={() => setModalTransfLote(s => s ? { ...s, itens: s.itens.filter((_, i) => i !== idx) } : s)}
                        disabled={modalTransfLote.aplicando || modalTransfLote.itens.length <= 1}
                        className="text-gray-300 hover:text-red-500 disabled:opacity-30"
                        title="Remover do lote"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* RESULTADO (após tentativa com falhas parciais) */}
              {modalTransfLote.resultado && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                  <p className="font-semibold text-amber-900 mb-1">
                    ✓ {modalTransfLote.resultado.sucessos} transferida(s) · ⚠️ {modalTransfLote.resultado.falhas.length} falha(s)
                  </p>
                  <ul className="space-y-0.5 text-amber-800">
                    {modalTransfLote.resultado.falhas.map((f, i) => (
                      <li key={i}>• <strong>{f.itemNome || "?"}</strong>: {f.motivo}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => setModalTransfLote(null)}
                disabled={modalTransfLote.aplicando}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition disabled:opacity-50"
              >
                {modalTransfLote.resultado ? "Fechar" : "Cancelar"}
              </button>
              <button
                onClick={aplicarTransfLote}
                disabled={modalTransfLote.aplicando || modalTransfLote.itens.length === 0}
                className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 rounded-lg transition shadow-sm flex items-center justify-center gap-2"
              >
                {modalTransfLote.aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
                ↔ Transferir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2381 — Modal de rebusca de foto com termo customizado (user ajuda a IA) */}
      {rebuscarFoto && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
          onClick={() => !rebuscarFoto.buscando && !rebuscarFoto.aplicando && setRebuscarFoto(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 px-6 pt-6 pb-5 text-white text-center">
              <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold leading-tight">Ajudar a IA a encontrar a foto certa</h3>
              <p className="text-violet-50 text-xs mt-1 truncate">{rebuscarFoto.nome}</p>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Termo de busca (edite pra ser mais específico)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rebuscarFoto.termo}
                    onChange={(e) => setRebuscarFoto(s => s ? { ...s, termo: e.target.value, previewUrl: null, erro: null } : s)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !rebuscarFoto.buscando) rebuscarPreview(); }}
                    placeholder='Ex: "parafuso sextavado M8 inox"'
                    disabled={rebuscarFoto.buscando || rebuscarFoto.aplicando}
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none disabled:bg-gray-50"
                  />
                  <button
                    onClick={rebuscarPreview}
                    disabled={!rebuscarFoto.termo.trim() || rebuscarFoto.buscando || rebuscarFoto.aplicando}
                    className="px-4 py-2.5 bg-violet-500 hover:bg-violet-600 disabled:bg-gray-300 text-white text-sm font-semibold rounded-lg transition flex items-center gap-2"
                  >
                    {rebuscarFoto.buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">Dica: inclua marca, dimensão ou material pra refinar.</p>
              </div>
              {/* Preview */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden" style={{ minHeight: 180 }}>
                {rebuscarFoto.buscando && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500 mb-2" />
                    <p className="text-xs">Procurando na web...</p>
                  </div>
                )}
                {!rebuscarFoto.buscando && rebuscarFoto.previewUrl && (
                  <div className="flex flex-col">
                    <img src={rebuscarFoto.previewUrl} alt="Preview" className="w-full h-56 object-contain bg-white" />
                    <div className="px-3 py-2 bg-emerald-50 border-t border-emerald-200 text-xs text-emerald-700 flex items-center gap-1">
                      <span>✓</span> Foto encontrada — confira e clique em "Usar esta foto" pra aplicar.
                    </div>
                  </div>
                )}
                {!rebuscarFoto.buscando && !rebuscarFoto.previewUrl && rebuscarFoto.erro && (
                  <div className="flex flex-col items-center justify-center py-10 text-red-600 px-4 text-center">
                    <span className="text-2xl mb-1">✕</span>
                    <p className="text-sm font-medium">{rebuscarFoto.erro}</p>
                    <p className="text-[11px] text-gray-500 mt-1">Tente um termo diferente.</p>
                  </div>
                )}
                {!rebuscarFoto.buscando && !rebuscarFoto.previewUrl && !rebuscarFoto.erro && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <Globe className="w-8 h-8 mb-2" />
                    <p className="text-xs">Digite um termo e clique em Buscar pra ver o preview.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200">
              <button
                onClick={() => setRebuscarFoto(null)}
                disabled={rebuscarFoto.aplicando}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition disabled:opacity-50"
              >Cancelar</button>
              <button
                onClick={aplicarRebusca}
                disabled={!rebuscarFoto.previewUrl || rebuscarFoto.aplicando || rebuscarFoto.buscando}
                className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 disabled:bg-gray-300 rounded-lg transition shadow-sm flex items-center justify-center gap-2"
              >
                {rebuscarFoto.aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Usar esta foto
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Rev. 2379 — Modal customizado de confirmação pra preencher preços com IA */}
      {confirmIAPrecos && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setConfirmIAPrecos(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 px-6 pt-6 pb-5 text-white text-center">
              <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold leading-tight">Preencher preços com IA</h3>
              <p className="text-violet-50 text-sm mt-1">
                {confirmIAPrecos.qtd} {confirmIAPrecos.qtd === 1 ? "item" : "itens"} sem valor · 1-3 min
              </p>
            </div>
            <div className="px-6 py-5 text-sm text-gray-700 space-y-3">
              <p className="leading-relaxed">
                A IA vai estimar o <strong>preço médio de mercado</strong> dos itens que
                ainda não têm valor cadastrado.
              </p>
              <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 text-[13px] text-gray-700 space-y-1.5">
                <div className="flex items-start gap-2"><span className="text-emerald-600 font-bold">✓</span><span>Preços marcados com tag <strong>🤖 IA</strong> pra revisão</span></div>
                <div className="flex items-start gap-2"><span className="text-emerald-600 font-bold">✓</span><span>Só preenche onde está <strong>vazio</strong></span></div>
                <div className="flex items-start gap-2"><span className="text-emerald-600 font-bold">✓</span><span>Não altera preços já cadastrados</span></div>
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200">
              <button
                onClick={() => setConfirmIAPrecos(null)}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition"
              >Cancelar</button>
              <button
                onClick={executarPreencherIA}
                className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition shadow-sm flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Preencher
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Rev. 2378 — Modal customizado de confirmação pra busca em lote de fotos */}
      {confirmBuscaFotos && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setConfirmBuscaFotos(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-sky-500 to-blue-600 px-6 pt-6 pb-5 text-white text-center">
              <div className="mx-auto bg-white/20 rounded-full p-3 w-fit mb-3">
                <Globe className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold leading-tight">Buscar fotos na internet</h3>
              <p className="text-sky-50 text-sm mt-1">
                {confirmBuscaFotos.nomes.length} {confirmBuscaFotos.nomes.length === 1 ? "item" : "itens"} sem foto · ~{Math.ceil(confirmBuscaFotos.nomes.length * 1.5 / 60)} min
              </p>
            </div>
            <div className="px-6 py-5 text-sm text-gray-700 space-y-3">
              <p className="leading-relaxed">
                Vou pesquisar no <strong>Google/DuckDuckGo</strong> e aplicar automaticamente
                a primeira foto que combinar com o nome do produto.
              </p>
              <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 text-[13px] text-gray-700 space-y-1.5">
                <div className="flex items-start gap-2"><span className="text-emerald-600 font-bold">✓</span><span>Só preenche itens <strong>sem</strong> foto</span></div>
                <div className="flex items-start gap-2"><span className="text-emerald-600 font-bold">✓</span><span>Não substitui fotos já cadastradas</span></div>
                <div className="flex items-start gap-2"><span className="text-emerald-600 font-bold">✓</span><span>Pode interromper quando quiser</span></div>
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 flex items-center gap-2 border-t border-gray-200">
              <button
                onClick={() => setConfirmBuscaFotos(null)}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition"
              >Cancelar</button>
              <button
                onClick={() => executarBuscaFotosWebTodas(confirmBuscaFotos.nomes)}
                className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition shadow-sm flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4" /> Buscar agora
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Rev. 2388 — Modal viewer da auditoria do almoxarifado (admin valida/rejeita) */}
      {modalAuditoriaList && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setModalAuditoriaList(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-6 h-6" />
                <div>
                  <h3 className="text-lg font-bold leading-tight">Auditoria do Almoxarifado</h3>
                  <p className="text-amber-50 text-xs">Validar ou rejeitar exclusões e alterações manuais de quantidade.</p>
                </div>
              </div>
              <button onClick={() => setModalAuditoriaList(false)} className="text-white/80 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-2 text-xs">
              {(["pendente", "validado", "rejeitado", "todos"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setAuditoriaFiltroStatus(s)}
                  className={`px-3 py-1.5 rounded-full font-medium transition ${
                    auditoriaFiltroStatus === s
                      ? "bg-amber-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s === "pendente" ? "Pendentes" : s === "validado" ? "Validados" : s === "rejeitado" ? "Rejeitados" : "Todos"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {auditoriaQuery.isLoading ? (
                <div className="text-center py-8 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
              ) : !auditoriaQuery.data || auditoriaQuery.data.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Nenhum registro nesta categoria.</p>
              ) : (
                <div className="space-y-3">
                  {auditoriaQuery.data.map((r: any) => {
                    const acaoLabel: Record<string, string> = {
                      excluir_item: "Exclusão de item",
                      excluir_unidade: "Exclusão de unidade",
                      alterar_quantidade: "Alteração manual de quantidade",
                    };
                    const isPend = r.statusValidacao === "pendente";
                    return (
                      <div key={r.id} className="border border-gray-200 rounded-lg p-3 hover:border-amber-300 transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                r.statusValidacao === "pendente" ? "bg-amber-100 text-amber-800" :
                                r.statusValidacao === "validado" ? "bg-emerald-100 text-emerald-800" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {r.statusValidacao.toUpperCase()}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">{acaoLabel[r.acao] ?? r.acao}</span>
                              <span className="text-xs text-gray-500">·</span>
                              <span className="text-xs text-gray-600 truncate">{r.entidadeNome}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Por <strong>{r.userNome || `User #${r.userId}`}</strong> em {new Date(r.createdAt).toLocaleString("pt-BR")}
                              {r.ip && <> · IP {r.ip}</>}
                            </p>
                            <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded px-2 py-1.5 italic">"{r.justificativa}"</p>
                            {r.acao === "alterar_quantidade" && r.dadosAntes && r.dadosDepois && (
                              <p className="text-xs text-gray-600 mt-1">
                                Quantidade: <strong>{fmtQtd(r.dadosAntes.quantidadeAtual)}</strong> → <strong>{fmtQtd(r.dadosDepois.quantidadeAtual)}</strong>
                              </p>
                            )}
                            {r.statusValidacao !== "pendente" && (
                              <p className="text-[11px] text-gray-400 mt-1">
                                {r.statusValidacao === "validado" ? "Validado" : "Rejeitado"} por {r.validadoPorNome || `#${r.validadoPorId}`}
                                {r.validadoEm && <> em {new Date(r.validadoEm).toLocaleString("pt-BR")}</>}
                                {r.observacaoValidacao && <> — "{r.observacaoValidacao}"</>}
                              </p>
                            )}
                          </div>
                          {isPend && isAdmin && (
                            <div className="flex flex-col gap-1.5">
                              <button
                                onClick={() => validarAuditoriaMut.mutate({ id: r.id, aprovar: true })}
                                disabled={validarAuditoriaMut.isPending}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Aprovar
                              </button>
                              <button
                                onClick={() => {
                                  const obs = prompt("Motivo da rejeição (opcional):") ?? undefined;
                                  validarAuditoriaMut.mutate({ id: r.id, aprovar: false, observacao: obs || undefined });
                                }}
                                disabled={validarAuditoriaMut.isPending}
                                className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition flex items-center gap-1"
                              >
                                <X className="w-3 h-3" /> Rejeitar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2388 — Modal único de auditoria (excluir item / unidade / alterar qtd) */}
      <ModalConfirmacaoAuditoria
        aberto={!!modalAuditoria}
        titulo={modalAuditoria?.titulo ?? ""}
        subtitulo={modalAuditoria?.subtitulo}
        descricao={modalAuditoria?.descricao ?? null}
        textoBotaoConfirmar={modalAuditoria?.textoBotao ?? "Confirmar"}
        requerSenha={requerSenha}
        requerJustificativa={requerJustificativa}
        carregando={!!modalAuditoria?.carregando}
        progresso={modalAuditoria?.progresso ?? null}
        erroExterno={modalAuditoria?.erro ?? null}
        onCancelar={() => setModalAuditoria(null)}
        onConfirmar={(p) => { setModalAuditoria(prev => prev ? { ...prev, erro: null } : prev); modalAuditoria?.executar(p); }}
      />

      {/* Rev. 2386 — Modal: sugestões de categoria por IA */}
      {modalSugestoesCateg && (() => {
        const m = modalSugestoesCateg;
        const totalSelec = m.sugestoes.filter(s => (m.escolhas[s.nome.toLowerCase().trim()] || "").trim()).length;
        const totalItens = m.sugestoes
          .filter(s => (m.escolhas[s.nome.toLowerCase().trim()] || "").trim())
          .reduce((acc, s) => acc + s.qtdItens, 0);
        return (
          <div
            className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4"
            onClick={() => !m.aplicando && setModalSugestoesCateg(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-br from-violet-600 to-purple-600 px-6 pt-6 pb-5 text-white">
                <div className="flex items-start gap-3">
                  <div className="bg-white/20 rounded-full p-2.5 shrink-0">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold leading-tight">Sugestões de categoria por IA</h3>
                    <p className="text-violet-50 text-sm mt-1">
                      Revise as sugestões e desmarque (Categoria → "—") os itens que não quer alterar. Você também pode trocar a categoria manualmente.
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-3 bg-violet-50 border-b border-violet-100 text-xs text-violet-900 flex items-center justify-between gap-4">
                <span>
                  <strong>{m.sugestoes.length}</strong> nome(s) analisado(s) ·
                  <strong className="text-emerald-700"> {totalSelec}</strong> com categoria escolhida ·
                  <strong className="text-violet-700"> {totalItens}</strong> item(ns) totais a atualizar
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const escolhas: Record<string, string> = {};
                      for (const s of m.sugestoes) escolhas[s.nome.toLowerCase().trim()] = s.categoriaSugerida || "";
                      setModalSugestoesCateg(s => s ? { ...s, escolhas } : s);
                    }}
                    disabled={m.aplicando}
                    className="text-[11px] font-medium px-2 py-1 rounded bg-white border border-violet-200 hover:bg-violet-50 disabled:opacity-50"
                  >Restaurar sugestões da IA</button>
                  <button
                    onClick={() => {
                      const escolhas: Record<string, string> = {};
                      for (const s of m.sugestoes) escolhas[s.nome.toLowerCase().trim()] = "";
                      setModalSugestoesCateg(s => s ? { ...s, escolhas } : s);
                    }}
                    disabled={m.aplicando}
                    className="text-[11px] font-medium px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >Limpar tudo</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-2 font-semibold">Item</th>
                      <th className="text-left py-2 font-semibold w-20">Qtd</th>
                      <th className="text-left py-2 font-semibold w-24">Confiança</th>
                      <th className="text-left py-2 font-semibold w-64">Categoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {m.sugestoes.map((s, idx) => {
                      const key = s.nome.toLowerCase().trim();
                      const escolha = m.escolhas[key] ?? "";
                      const corConf = s.confianca === "alta" ? "bg-emerald-100 text-emerald-700"
                        : s.confianca === "media" ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-500";
                      const lbl = s.confianca === "alta" ? "Alta" : s.confianca === "media" ? "Média" : "Baixa";
                      return (
                        <tr key={idx} className="hover:bg-violet-50/30">
                          <td className="py-2 pr-3">
                            <div className="font-medium text-gray-800 break-words">{s.nome}</div>
                            {s.unidade && <div className="text-[11px] text-gray-400">un: {s.unidade}</div>}
                          </td>
                          <td className="py-2 pr-3 text-gray-600 tabular-nums">{s.qtdItens}</td>
                          <td className="py-2 pr-3">
                            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${corConf}`}>{lbl}</span>
                          </td>
                          <td className="py-2">
                            <select
                              value={escolha}
                              onChange={(e) => setModalSugestoesCateg(prev => prev ? { ...prev, escolhas: { ...prev.escolhas, [key]: e.target.value } } : prev)}
                              disabled={m.aplicando}
                              className={`w-full h-8 text-xs border rounded px-2 outline-none ${escolha ? "border-violet-300 bg-violet-50 text-violet-900 font-medium" : "border-gray-200 bg-white text-gray-500"}`}
                            >
                              <option value="">— Não alterar —</option>
                              {m.categoriasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex items-center gap-2">
                {m.aplicando && m.progresso && (
                  <span className="text-xs text-violet-700 font-medium mr-auto">
                    Aplicando… {m.progresso.atual}/{m.progresso.total} categoria(s)
                  </span>
                )}
                <button
                  onClick={() => setModalSugestoesCateg(null)}
                  disabled={m.aplicando}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg transition disabled:opacity-60"
                >Cancelar</button>
                <button
                  onClick={aplicarSugestoesCategs}
                  disabled={m.aplicando || totalSelec === 0}
                  className="px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-lg transition shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {m.aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Aplicar {totalSelec > 0 ? `(${totalItens} item${totalItens !== 1 ? "ns" : ""})` : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rev. 2380 — Widget de progresso 0-100% destacado */}
      {batchFotoWeb && (() => {
        const pct = Math.min(100, Math.round((batchFotoWeb.atual / Math.max(1, batchFotoWeb.total)) * 100));
        const restantes = Math.max(0, batchFotoWeb.total - batchFotoWeb.atual);
        const etaSeg = Math.ceil(restantes * 1.5);
        const etaTxt = etaSeg >= 60 ? `~${Math.ceil(etaSeg / 60)} min restantes` : `~${etaSeg}s restantes`;
        return (
          <div className="fixed bottom-4 right-4 z-[100] bg-white rounded-2xl shadow-2xl border border-sky-200 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden">
            <div className="bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-3 flex items-center gap-2 text-white">
              <Globe className="w-5 h-5 animate-pulse" />
              <span className="font-semibold text-sm">Buscando fotos na web</span>
              <button
                onClick={() => { batchFotoWebRef.current.cancelar = true; }}
                className="ml-auto text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md font-medium transition"
              >Parar</button>
            </div>
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-end justify-between mb-2">
                <div className="text-3xl font-bold text-sky-600 leading-none tabular-nums">{pct}<span className="text-xl text-sky-400">%</span></div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-700 tabular-nums">{batchFotoWeb.atual} / {batchFotoWeb.total}</div>
                  <div className="text-[11px] text-gray-500">{etaTxt}</div>
                </div>
              </div>
              <div className="relative w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-sky-400 to-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-600 mb-2 truncate">
                <span className="text-gray-400">Atual: </span><span className="italic">{batchFotoWeb.nomeAtual || "—"}</span>
              </p>
              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-gray-100">
                <span className="flex items-center gap-1 text-emerald-600 font-medium"><span>✓</span> {batchFotoWeb.ok}</span>
                <span className="flex items-center gap-1 text-sky-600 font-medium">📷 {batchFotoWeb.itensAtualizados}</span>
                <span className="flex items-center gap-1 text-red-500 font-medium"><span>✕</span> {batchFotoWeb.falhas}</span>
              </div>
            </div>
          </div>
        );
      })()}
      <ModalVincularEquipamento
        aberto={!!modalVincEquip}
        item={modalVincEquip}
        onFechar={() => setModalVincEquip(null)}
        onSucesso={() => { utils.compras.listarItens.invalidate(); }}
      />

      {/* ── Rev. 4340 — Modal Aceite de Transferência de Equipamentos Próprios ── */}
      {modalEquipAceite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/60" onClick={() => setModalEquipAceite(null)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div
              className="flex items-center justify-between px-5 py-4 rounded-t-xl text-white shrink-0"
              style={{ background: "linear-gradient(135deg,#1B2A4A 0%,#2E4373 100%)" }}
            >
              <h2 className="text-base font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Equipamentos Próprios em Trânsito
              </h2>
              <button onClick={() => setModalEquipAceite(null)} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {modalEquipAceite.list.length === 0 ? (
                <p className="text-sm text-center text-gray-400 py-8">Nenhuma transferência pendente para esta obra.</p>
              ) : (
                modalEquipAceite.list.map((t: any) => (
                  <div key={t.id} className="border border-violet-200 rounded-xl overflow-hidden">
                    <div className="bg-violet-50 px-4 py-3 flex items-start gap-3">
                      {t.fotosJson && (() => {
                        try { const fs = JSON.parse(t.fotosJson); return fs[0]?.url ? <img src={fs[0].url} className="h-12 w-12 rounded-lg object-cover shrink-0 border border-violet-200" alt="" /> : null; } catch { return null; }
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{t.equipamentoDescricao}</p>
                        <p className="text-[11px] font-mono text-slate-500">{t.equipamentoPatrimonio}</p>
                        <p className="text-xs text-violet-700 mt-0.5">De: <strong>{t.origemObraNome || "—"}</strong></p>
                        {t.motivo && <p className="text-xs text-slate-500 mt-0.5 italic">"{t.motivo}"</p>}
                        <p className="text-[10px] text-slate-400 mt-0.5">Enviado por {t.remetenteNome}</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 bg-white space-y-2">
                      <textarea
                        placeholder="Observações do aceite (opcional)..."
                        rows={1}
                        onChange={(e) => setAceiteObs(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:ring-2 focus:ring-violet-400 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={rejeitarTransf.isPending}
                          onClick={() => rejeitarTransf.mutate({ companyId, transferenciaId: t.id })}
                          className="flex-1 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 transition disabled:opacity-50"
                        >
                          Rejeitar
                        </button>
                        <button
                          disabled={aceitarTransf.isPending}
                          onClick={() => aceitarTransf.mutate({ companyId, transferenciaId: t.id, obsAceite: aceiteObs || undefined })}
                          className="flex-2 flex-grow py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {aceitarTransf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Confirmar Recebimento
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-5 pb-4 shrink-0">
              <button
                onClick={() => setModalEquipAceite(null)}
                className="w-full py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Rev. 4345 — Sticky bar devolução em lote de locados ───────── */}
      {selecionadosLocacao.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-6 py-3 bg-amber-900 text-white shadow-2xl">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-5 w-5 text-amber-300" />
            <span className="text-sm font-semibold">{selecionadosLocacao.size} locado{selecionadosLocacao.size !== 1 ? "s" : ""} selecionado{selecionadosLocacao.size !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelecionadosLocacao(new Set())} className="px-3 py-1.5 text-xs font-medium text-amber-200 hover:text-white border border-amber-700 rounded-lg transition">Limpar</button>
            <button onClick={() => setModalDevolverLocacaoLote(true)} className="px-4 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 rounded-lg transition flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Devolver {selecionadosLocacao.size}
            </button>
          </div>
        </div>
      )}

      {/* ── Rev. 4345 — Modal devolução em lote de locados ─────────────── */}
      {modalDevolverLocacaoLote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => !isDevolvendoLote && setModalDevolverLocacaoLote(false)} />
          <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-amber-500" /> Devolver {selecionadosLocacao.size} Equipamento{selecionadosLocacao.size !== 1 ? "s" : ""}
              </h2>
              {!isDevolvendoLote && <button onClick={() => setModalDevolverLocacaoLote(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Os {selecionadosLocacao.size} equipamento{selecionadosLocacao.size !== 1 ? "s" : ""} selecionado{selecionadosLocacao.size !== 1 ? "s" : ""} serão marcados como devolvidos ao fornecedor e <strong>desativados</strong> do almoxarifado.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-700">Observação (opcional)</label>
                <textarea rows={2} placeholder="Ex: Devolvidos ao término do contrato"
                  className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 outline-none focus:border-amber-400 resize-none"
                  value={obsDevolucaoLocacaoLote}
                  onChange={e => setObsDevolucaoLocacaoLote(e.target.value)}
                  disabled={isDevolvendoLote} />
              </div>
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalDevolverLocacaoLote(false)} disabled={isDevolvendoLote} className="flex-1 h-9 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition disabled:opacity-50">Cancelar</button>
                <button
                  onClick={confirmarDevolverLocacaoLote}
                  disabled={isDevolvendoLote}
                  className="relative flex-1 h-9 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition disabled:opacity-60 overflow-hidden flex items-center justify-center gap-2"
                >
                  <span className="absolute inset-0 left-0 bg-white/15 transition-all" style={{ width: `${devolverLocacaoLoteProgress}%` }} />
                  {isDevolvendoLote ? `Devolvendo… ${devolverLocacaoLoteProgress}%` : `Confirmar Devolução`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Rev. 4559 — Modal Renovar Locação (fluxo REAL: nova OC no Compras → Contas a Pagar) ── */}
      {modalRenovarLocacao && (() => {
        const it = modalRenovarLocacao.item;
        const locadoId = resolveLocadoId(it);
        const renov = Number(it.renovacoesCount) || 0;
        const fotoUrl = it.fotoLocado || it.fotoUrl || null;
        return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setModalRenovarLocacao(null)} />
          <div className="relative bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <RefreshCw className="h-5 w-5 flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight">Renovar Locação</h2>
                  <p className="text-[11px] text-indigo-100">{renov + 1}ª renovação deste equipamento</p>
                </div>
              </div>
              <button onClick={() => setModalRenovarLocacao(null)} className="text-indigo-100 hover:text-white flex-shrink-0"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Item */}
              <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                {fotoUrl ? (
                  <img src={fotoUrl} className="w-14 h-14 rounded-lg object-cover ring-1 ring-slate-200 flex-shrink-0 pointer-events-none select-none" alt="" draggable={false} />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                    <Camera className="h-5 w-5 text-slate-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 break-words leading-snug">{it.nome}</p>
                  {it.fornecedorLocacao && <p className="text-xs text-slate-500 break-words mt-0.5">Fornecedor: {it.fornecedorLocacao}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${renov > 0 ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"}`}>
                      <RefreshCw className="h-2.5 w-2.5" /> {renov > 0 ? `${renov}ª Renovação` : "1ª Locação"}
                    </span>
                    {it.dataVencimentoLocacao && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Venc. atual: {new Date(it.dataVencimentoLocacao + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {locadoId != null ? (<>
              {/* O que a renovação faz (passo a passo) */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-indigo-900 uppercase tracking-wide">O que acontece ao confirmar</p>
                {[
                  ["1", "Nova OC de locação é criada no Compras (já aprovada), encadeada à locação atual."],
                  ["2", "A parcela da OC entra no Contas a Pagar do Financeiro com o valor informado."],
                  ["3", "O vencimento da locação é atualizado e o ciclo passa a ser a " + (renov + 1) + "ª renovação."],
                ].map(([n, t]) => (
                  <div key={n} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                    <p className="text-[11px] text-indigo-900 break-words">{t}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="text-xs font-semibold text-gray-700">Novo vencimento</label>
                  <input
                    type="date"
                    value={novaDataVencLocacao}
                    onChange={e => setNovaDataVencLocacao(e.target.value)}
                    className="mt-1 w-full min-w-0 max-w-full appearance-none px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="min-w-0">
                  <label className="text-xs font-semibold text-gray-700">Valor da nova OC</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium pointer-events-none">R$</span>
                    <input
                      type="text" inputMode="numeric"
                      value={novoValorOcLocacao}
                      onChange={e => setNovoValorOcLocacao(maskValorBRL(e.target.value))}
                      placeholder="0,00"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-900 outline-none focus:border-indigo-400 text-right"
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-1 border-t border-gray-100">
                <button onClick={() => setModalRenovarLocacao(null)} disabled={renovarLocadoMut.isPending} className="flex-1 h-10 text-sm border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50 font-medium transition disabled:opacity-50">Cancelar</button>
                <button
                  onClick={() => {
                    const v = parseValorBRL(novoValorOcLocacao);
                    if (!novaDataVencLocacao) { toast.error("Selecione a nova data de vencimento."); return; }
                    if (!v || v <= 0) { toast.error("Informe o valor da nova OC."); return; }
                    renovarLocadoMut.mutate({ companyId, id: locadoId, novaDataFim: novaDataVencLocacao, valorOc: v });
                  }}
                  disabled={renovarLocadoMut.isPending}
                  className="flex-1 h-10 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {renovarLocadoMut.isPending ? (<><Loader2 className="h-4 w-4 animate-spin" /> Renovando…</>) : (<><RefreshCw className="h-4 w-4" /> Confirmar Renovação</>)}
                </button>
              </div>
              </>) : (
              /* Item sem vínculo com Equipamentos Locados: não dá pra gerar OC — orienta o usuário */
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
                <p className="text-sm text-amber-900 break-words">
                  Este item ainda <b>não está vinculado</b> ao módulo Equipamentos Locados, então não é possível gerar a nova OC de locação automaticamente.
                </p>
                <p className="text-xs text-amber-800 break-words">
                  Cadastre-o em <b>Equipamentos → Locados</b> (ou recadastre a locação pelo botão "Receber Locação") para usar o fluxo completo de renovação com Compras e Financeiro.
                </p>
                <button onClick={() => setModalRenovarLocacao(null)} className="w-full h-10 text-sm border border-amber-300 rounded-lg bg-white text-amber-800 hover:bg-amber-100 font-semibold transition">Entendi</button>
              </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Dialog Importar Itens via IA (Rev. 4420) ────────────── */}
      {importIAOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b bg-gradient-to-r from-blue-700 to-blue-500 rounded-t-2xl">
              <Sparkles className="h-5 w-5 text-white" />
              <div>
                <h2 className="text-base font-semibold text-white">Importar Itens para o Catálogo (IA)</h2>
                <p className="text-xs text-blue-100">Envie uma lista de materiais, planilha ou orçamento — a IA extrai os itens para cadastrar</p>
              </div>
              <button onClick={() => setImportIAOpen(false)} className="ml-auto text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Step: upload */}
              {importIAStep === "upload" && (
                <div>
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${importIADragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-blue-300 hover:bg-gray-50"}`}
                    onDragOver={(e) => { e.preventDefault(); setImportIADragOver(true); }}
                    onDragLeave={() => setImportIADragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setImportIADragOver(false); const f = e.dataTransfer.files[0]; if (f) handleImportIAFile(f); }}
                    onClick={() => importIAFileRef.current?.click()}
                  >
                    <Sparkles className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                    <p className="font-medium text-gray-700 mb-1">Arraste ou clique para selecionar</p>
                    <p className="text-xs text-gray-500">PDF, JPG ou PNG · máx. 10 MB</p>
                  </div>
                  <input ref={importIAFileRef} type="file" accept="application/pdf,image/jpeg,image/jpg,image/png" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportIAFile(f); }} />
                  <p className="text-xs text-gray-400 mt-3 text-center">Funciona com listas de materiais, planilhas fotografadas, orçamentos PDF e catálogos.</p>
                </div>
              )}

              {/* Step: processing */}
              {importIAStep === "processing" && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
                  <p className="font-medium text-gray-700">Analisando documento com IA…</p>
                  <p className="text-sm text-gray-400">Isso pode levar alguns segundos</p>
                </div>
              )}

              {/* Step: review */}
              {importIAStep === "review" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700">{importIAItens.length} iten(s) extraído(s) — selecione os que deseja cadastrar:</p>
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setImportIASelected(
                      importIASelected.size === importIAItens.length ? new Set() : new Set(importIAItens.map((_,i) => i))
                    )}>
                      {importIASelected.size === importIAItens.length ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                  </div>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="w-8 px-3 py-2" />
                          <th className="text-left px-3 py-2 font-semibold text-gray-600">Nome do Item</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-600">Un</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-600">Categoria</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-600">Qtd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importIAItens.map((it, i) => (
                          <tr key={i} className={`border-b border-gray-100 last:border-0 transition ${importIASelected.has(i) ? "" : "opacity-40"}`}>
                            <td className="px-3 py-2 text-center">
                              <input type="checkbox" className="cursor-pointer" checked={importIASelected.has(i)}
                                onChange={() => setImportIASelected(prev => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i); else next.add(i);
                                  return next;
                                })} />
                            </td>
                            <td className="px-3 py-2">
                              <input className="w-full border-0 bg-transparent text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1"
                                value={it.nome}
                                onChange={(e) => setImportIAItens(p => p.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input className="w-14 text-center border-0 bg-transparent text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1"
                                value={it.unidade}
                                onChange={(e) => setImportIAItens(p => p.map((x, j) => j === i ? { ...x, unidade: e.target.value } : x))} />
                            </td>
                            <td className="px-3 py-2">
                              <input className="w-full border-0 bg-transparent text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1"
                                value={it.categoria}
                                onChange={(e) => setImportIAItens(p => p.map((x, j) => j === i ? { ...x, categoria: e.target.value } : x))} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input type="number" min={0} className="w-16 text-center border-0 bg-transparent text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1"
                                value={it.quantidade}
                                onChange={(e) => setImportIAItens(p => p.map((x, j) => j === i ? { ...x, quantidade: parseInt(e.target.value) || 0 } : x))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ Edite os campos diretamente na tabela antes de criar. Itens já cadastrados com o mesmo nome serão criados como duplicatas.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
              <button onClick={() => setImportIAOpen(false)} className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-2">
                Cancelar
              </button>
              {importIAStep === "review" && (
                <button
                  onClick={criarItensIA}
                  disabled={importIACriando || importIASelected.size === 0}
                  className="relative overflow-hidden flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition"
                >
                  {importIACriando && (
                    <span className="absolute inset-0 bg-white/15" style={{ width: `${importIAProgress}%` }} />
                  )}
                  {importIACriando
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando… {importIAProgress}%</>
                    : <><CheckCircle2 className="h-4 w-4" /> Criar {importIASelected.size} Ite{importIASelected.size === 1 ? "m" : "ns"} no Catálogo</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
