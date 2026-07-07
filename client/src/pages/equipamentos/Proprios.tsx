import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, X, HardHat, Camera, ChevronDown, ChevronUp,
  Sparkles, Trash2, Boxes, Wrench, CheckCircle2, Layers, Hash,
  Building2, User as UserIcon, Loader2, ListChecks, Database, DollarSign,
} from "lucide-react";
import { FotosUploader, FotoItem, compressImage, fmtMoney, fmtDate, Spinner } from "./_shared";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

// Rev. 2561 — sanitiza mensagem de erro pro toast. Se vier o dump cru do
// Drizzle ("Failed query… params:" com base64 das fotos) ou algo gigantesco,
// mostra uma mensagem genérica em vez do PAREDÃO ilegível. O server já traduz
// os erros conhecidos; isso é defesa em profundidade.
function errMsg(e: { message?: string } | unknown): string {
  const raw = (e as any)?.message ? String((e as any).message) : "";
  if (!raw) return "Não foi possível salvar. Tente novamente.";
  if (/Failed query|data:image\/|;base64,/i.test(raw) || raw.length > 300) {
    return "Não foi possível salvar o equipamento. Verifique os dados e tente novamente.";
  }
  return raw;
}

// Rev. 2512 — type-safety do enum de status (espelha server zod).
type StatusEquip = "disponivel" | "em_obra" | "manutencao" | "baixado";
const STATUS_SET = new Set<StatusEquip>(["disponivel", "em_obra", "manutencao", "baixado"]);
function toStatus(v: unknown): StatusEquip {
  return typeof v === "string" && (STATUS_SET as Set<string>).has(v) ? (v as StatusEquip) : "disponivel";
}

// Rev. 2513 — Normaliza texto pra MAIÚSCULA (espelha `upperBR` do server).
// Usado nos onChange dos inputs pra mostrar imediatamente o valor que será
// gravado. Não trima durante digitação (pra permitir espaço entre palavras).
function up(v: string): string {
  return v.toLocaleUpperCase("pt-BR");
}

const EMPTY_FORM = {
  codigoPatrimonio: "", descricao: "", categoria: "", numeroSerie: "",
  marca: "", modelo: "", dataAquisicao: "", valorAquisicao: "",
  vidaUtilMeses: "", observacoes: "",
  // Rev. 3314 — quantidade pra cadastro em LOTE de itens idênticos (só no NOVO).
  quantidade: "1",
  // Rev. 2512 — status editável no modal
  status: "disponivel" as StatusEquip,
  // Rev. 2514 — obra atual (só usada quando status="em_obra"; senão NULL).
  localizacaoAtualObraId: null as number | null,
};

// Rev. 2364 — chips de categoria de toque rápido (servente toca em vez de digitar).
// Casa com as categorias de vida útil do CAPEX (server/routers/equipamentos.ts:90-96).
const CATEGORIAS_QUICK = [
  "Andaime", "Betoneira", "Compressor", "Gerador",
  "Compactador", "Serra", "Furadeira", "Ferramenta elétrica",
];

// Rev. 2512 — categorias custom persistem em localStorage por company.
const CAT_CUSTOM_KEY = (cid: number) => `fc:proprios:cat-custom:${cid}`;
function loadCatCustom(cid: number): string[] {
  try { return JSON.parse(localStorage.getItem(CAT_CUSTOM_KEY(cid)) || "[]"); }
  catch { return []; }
}
function saveCatCustom(cid: number, list: string[]) {
  try { localStorage.setItem(CAT_CUSTOM_KEY(cid), JSON.stringify(list)); } catch {}
}

const STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível", em_obra: "Em obra", manutencao: "Manutenção", baixado: "Baixado",
};
const STATUS_COLORS: Record<string, string> = {
  disponivel: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  em_obra:    "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  manutencao: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  baixado:    "bg-slate-200 text-slate-700 ring-1 ring-slate-300",
};
// Rev. 2512 — opções pro seletor de status dentro do modal (edição).
const STATUS_OPTIONS: ReadonlyArray<{ v: StatusEquip; l: string; border: string; bg: string; text: string; activeBg: string }> = [
  { v: "disponivel", l: "Disponível", border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-700", activeBg: "bg-emerald-600" },
  { v: "em_obra",    l: "Em obra",    border: "border-blue-300",    bg: "bg-blue-50",    text: "text-blue-700",    activeBg: "bg-blue-600" },
  { v: "manutencao", l: "Manutenção", border: "border-amber-300",   bg: "bg-amber-50",   text: "text-amber-700",   activeBg: "bg-amber-600" },
  { v: "baixado",    l: "Baixado",    border: "border-slate-400",   bg: "bg-slate-50",   text: "text-slate-700",   activeBg: "bg-slate-600" },
];

export default function EquipamentosProprios() {
  const { selectedCompany } = useCompany();
  const companyId = Number(selectedCompany?.id) || 0;
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroObra, setFiltroObra] = useState<string>("");

  const utils = trpc.useUtils();
  const { data = [], isLoading } = trpc.equipamentos.propriosListar.useQuery(
    { companyId, busca: busca || undefined, status: (filtroStatus as any) || undefined },
    { enabled: !!companyId }
  );
  // Rev. 2364 — segunda query SEM filtros pra contagem total real (auto-ID).
  const { data: totalList = [], isFetched: totalFetched } =
    trpc.equipamentos.propriosListar.useQuery(
      { companyId },
      { enabled: !!companyId, staleTime: 30_000 }
    );

  const [modal, setModal] = useState(false);
  const [confirmPrecos, setConfirmPrecos] = useState<{ semValor: number } | null>(null);
  // Rev. 3026 — progresso fase a fase do "Gerar preços com IA". A geração roda
  // em lotes (loop client-driven) e esta UI mostra a evolução 0→100%.
  const [precoRun, setPrecoRun] = useState<{
    fase: "levantando" | "estimando" | "gravando" | "concluido" | "erro";
    total: number;          // denominador (combinações a precificar)
    processados: number;    // combinações já processadas
    itens: number;          // equipamentos efetivamente atualizados
    lote: number;           // nº do lote atual
    sobrescrever: boolean;
    erro?: string;
    aviso?: string;         // concluiu, mas parte ficou sem estimar (estagnação)
  } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  // Rev. 2515 — lightbox: foto clicada amplia em overlay full-screen.
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  function openLightbox(urls: string[], index = 0) {
    if (!urls.length) return;
    setLightbox({ urls, index });
  }
  // Navegação por teclado no lightbox (← → / Esc)
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowRight") setLightbox(p => p ? { ...p, index: (p.index + 1) % p.urls.length } : p);
      else if (e.key === "ArrowLeft")  setLightbox(p => p ? { ...p, index: (p.index - 1 + p.urls.length) % p.urls.length } : p);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);
  // Rev. 2514 — meta de auditoria do registro em edição (read-only no modal).
  const [editingMeta, setEditingMeta] = useState<{ criadoPorNome: string | null; createdAt: string | null }>({
    criadoPorNome: null, createdAt: null,
  });
  // Rev. 2555 — obras pro picker. Usa `listForAlmoxarifado` (não `list`):
  //  (1) respeita a PERMISSÃO do usuário (allowed_obra_ids + alocação em
  //      obra_funcionarios), e
  //  (2) o server já devolve SÓ obras EM ANDAMENTO (status='Em_Andamento').
  // O filtro client antigo por "encerrada"/"arquivada" era inócuo (esses
  // valores nem existem no enum real Planejamento/Em_Andamento/Paralisada/…).
  const { data: obrasData = [] } = trpc.obras.listForAlmoxarifado.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const obrasAtivas = obrasData as any[];
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  // Rev. 2512 — categorias custom (localStorage por company) + UI de "+ Nova"
  const [catCustom, setCatCustom] = useState<string[]>([]);
  const [novaCatOpen, setNovaCatOpen] = useState(false);
  const [novaCatTxt, setNovaCatTxt] = useState("");
  // Rev. 2512 — guarda companyId=0: limpa estado e evita escrever em key fc:proprios:cat-custom:0.
  useEffect(() => {
    if (companyId > 0) setCatCustom(loadCatCustom(companyId));
    else setCatCustom([]);
  }, [companyId]);
  // Categorias derivadas dos próprios equipamentos já cadastrados
  const catFromItems = useMemo(() => {
    const s = new Set<string>();
    for (const p of (totalList || []) as any[]) {
      const c = String(p.categoria || "").trim();
      if (c) s.add(c);
    }
    return Array.from(s);
  }, [totalList]);
  // União ordenada: defaults + custom + derivadas (case-insensitive uniq)
  const categoriasAll = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of [...CATEGORIAS_QUICK, ...catCustom, ...catFromItems]) {
      const k = c.trim().toLowerCase();
      if (k && !map.has(k)) map.set(k, c.trim());
    }
    return Array.from(map.values());
  }, [catCustom, catFromItems]);
  function adicionarCategoria() {
    if (companyId <= 0) { toast.error("Selecione uma empresa antes."); return; }
    const v = novaCatTxt.trim();
    if (!v) return;
    if (categoriasAll.some(c => c.toLowerCase() === v.toLowerCase())) {
      toast.info("Essa categoria já existe.");
      setForm(p => ({ ...p, categoria: v }));
      setNovaCatOpen(false); setNovaCatTxt("");
      return;
    }
    const next = [...catCustom, v];
    setCatCustom(next);
    saveCatCustom(companyId, next);
    setForm(p => ({ ...p, categoria: v }));
    setNovaCatOpen(false); setNovaCatTxt("");
    toast.success(`Categoria "${v}" criada.`);
  }
  function removerCategoriaCustom(cat: string) {
    if (companyId <= 0) return;
    const next = catCustom.filter(c => c.toLowerCase() !== cat.toLowerCase());
    setCatCustom(next);
    saveCatCustom(companyId, next);
    if (form.categoria.toLowerCase() === cat.toLowerCase()) {
      setForm(p => ({ ...p, categoria: "" }));
    }
  }

  // Rev. 2513 — Preview do próximo patrimônio. O VALOR REAL é gerado pelo
  // servidor (com retry em UNIQUE violation) — aqui só pra mostrar ao usuário
  // qual será o código antes de salvar.
  function gerarPatrimonioAuto() {
    let maxN = 0;
    for (const p of (totalList || []) as any[]) {
      const m = /^EQP-(\d+)$/i.exec(String(p.codigoPatrimonio || ""));
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    }
    const proximo = maxN + 1;
    return `EQP-${String(proximo).padStart(4, "0")}`;
  }

  function abrirNovo() {
    setForm({ ...EMPTY_FORM }); setFotos([]); setEditingId(null);
    setMostrarDetalhes(false); setModal(true);
  }

  // Rev. 2374 — Fila de importação vinda do Almoxarifado.
  const [importQueue, setImportQueue] = useState<Array<{ nome: string; fotoUrl: string; categoria: string }>>([]);
  const [importTotal, setImportTotal] = useState(0);
  function preencherFormDoItem(it: { nome: string; fotoUrl: string; categoria: string }) {
    setForm({
      ...EMPTY_FORM,
      // Rev. 2513 — normaliza textos vindos do Almoxarifado pra MAIÚSCULA.
      descricao: up(it.nome || ""),
      categoria: up(it.categoria || ""),
      codigoPatrimonio: gerarPatrimonioAuto(),
    });
    setFotos(it.fotoUrl ? [{ url: it.fotoUrl, uploadedAt: new Date().toISOString() }] : []);
    setEditingId(null);
    setMostrarDetalhes(false);
    setModal(true);
  }
  useEffect(() => {
    if (!companyId) return;
    if (!totalFetched) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("importAlmox") !== "1") return;
    try {
      const raw = sessionStorage.getItem("fc:importAlmoxEquip:queue");
      const tipo = sessionStorage.getItem("fc:importAlmoxEquip:tipo");
      if (!raw || tipo !== "proprio") return;
      const payload = JSON.parse(raw) as { companyId: number; itens: Array<{ nome: string; fotoUrl: string; categoria: string }> };
      const arr = payload?.itens;
      if (!payload || payload.companyId !== companyId) {
        sessionStorage.removeItem("fc:importAlmoxEquip:queue");
        sessionStorage.removeItem("fc:importAlmoxEquip:tipo");
        url.searchParams.delete("importAlmox");
        window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
        toast.error("A fila de importação era de outra empresa. Foi descartada.");
        return;
      }
      if (!Array.isArray(arr) || arr.length === 0) return;
      sessionStorage.removeItem("fc:importAlmoxEquip:queue");
      sessionStorage.removeItem("fc:importAlmoxEquip:tipo");
      url.searchParams.delete("importAlmox");
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
      setImportTotal(arr.length);
      setImportQueue(arr.slice(1));
      preencherFormDoItem(arr[0]);
      toast.info(`${arr.length} equipamento${arr.length !== 1 ? "s" : ""} pra cadastrar como PRÓPRIO. Revise e salve cada um.`);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, totalFetched]);

  async function handleFotoTop(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const news: FotoItem[] = [];
    for (const f of files) {
      try {
        const url = await compressImage(f);
        news.push({ url, uploadedAt: new Date().toISOString() });
      } catch {}
    }
    setFotos(prev => [...prev, ...news].slice(0, 6));
    e.target.value = "";
  }
  function abrirEdit(p: any) {
    // Rev. 2513 — uppercase defensivo pra registros legados (pré-2513).
    setForm({
      codigoPatrimonio: p.codigoPatrimonio,
      descricao: up(p.descricao || ""),
      categoria: up(p.categoria || ""),
      numeroSerie: up(p.numeroSerie || ""),
      marca: up(p.marca || ""),
      modelo: up(p.modelo || ""),
      dataAquisicao: (p.dataAquisicao || "").slice(0, 10),
      valorAquisicao: p.valorAquisicao ? String(Number(p.valorAquisicao)).replace(".", ",") : "",
      vidaUtilMeses: p.vidaUtilMeses ? String(p.vidaUtilMeses) : "",
      observacoes: up(p.observacoes || ""),
      status: toStatus(p.status), // Rev. 2512 — type-safe (sem `any`)
      // Rev. 2514 — obra atual (number|null pro <select>).
      localizacaoAtualObraId: p.localizacaoAtualObraId ?? null,
    });
    setFotos((p.fotosJson as FotoItem[]) || []);
    setEditingId(p.id);
    setEditingMeta({
      criadoPorNome: p.criadoPorNome ?? null,
      createdAt: p.createdAt ?? null,
    });
    setMostrarDetalhes(false); // Rev. 2512 — começa colapsado pra caber sem scroll
    setModal(true);
  }

  const criar = trpc.equipamentos.proprioCriar.useMutation({
    onSuccess: (res: any) => {
      utils.equipamentos.propriosListar.invalidate();
      // Rev. 2364 — segunda query (auto-ID) também precisa refrescar pra o
      // próximo patrimônio sugerido já contar o(s) item(ns) recém-criado(s).
      utils.equipamentos.propriosListar.invalidate({ companyId });
      if (importQueue.length > 0) {
        const [next, ...rest] = importQueue;
        setImportQueue(rest);
        setTimeout(() => preencherFormDoItem(next), 250);
        toast.success("Cadastrado! Próximo da fila…");
      } else {
        setModal(false);
        if (importTotal > 0) {
          toast.success(`${importTotal} equipamento${importTotal !== 1 ? "s" : ""} próprio${importTotal !== 1 ? "s" : ""} importado${importTotal !== 1 ? "s" : ""} do Almoxarifado.`);
          setImportTotal(0);
        } else {
          // Rev. 3314 — cadastro em LOTE: avisa quantos foram criados.
          const n = Number(res?.quantidadeCriada) || 1;
          if (n > 1) {
            const primeiro = res?.codigos?.[0];
            const ultimo = res?.codigos?.[res.codigos.length - 1];
            toast.success(`${n} equipamentos cadastrados${primeiro && ultimo ? ` (${primeiro} a ${ultimo})` : ""}!`);
          } else {
            toast.success("Equipamento cadastrado!");
          }
        }
      }
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const atualizar = trpc.equipamentos.proprioAtualizar.useMutation({
    onSuccess: () => { utils.equipamentos.propriosListar.invalidate(); setModal(false); toast.success("Atualizado."); },
    onError: (e) => toast.error(errMsg(e)),
  });
  // Rev. 2511 — soft delete (server marca ativo=false, listagem filtra).
  const excluir = trpc.equipamentos.proprioExcluir.useMutation({
    onSuccess: () => { utils.equipamentos.propriosListar.invalidate(); setModal(false); toast.success("Equipamento excluído."); },
    onError: (e) => toast.error(errMsg(e)),
  });

  // Rev. 3015 — "Gerar preços com IA": estima o valor de aquisição de TODOS os
  // equipamentos sem valor (ou de todos, com sobrescrever) numa tacada só.
  const gerarPrecos = trpc.equipamentos.propriosGerarPrecosComIA.useMutation();
  const rodandoPrecos = !!precoRun && (precoRun.fase === "levantando" || precoRun.fase === "estimando" || precoRun.fase === "gravando");
  const handleGerarPrecos = () => {
    if (companyId <= 0) { toast.error("Selecione uma empresa antes."); return; }
    if (rodandoPrecos) return;
    // Usa a lista TOTAL (sem filtros de busca/status) — usar `data` filtrada
    // poderia mandar sobrescrever=true só porque a fatia visível está toda
    // precificada, reestimando o parque inteiro sem querer.
    const semValor = (totalList as any[]).filter(p => !p.valorAquisicao || Number(p.valorAquisicao) === 0).length;
    setConfirmPrecos({ semValor });
  };

  // Rev. 3026 — driver do loop POR LOTE. Chama a mutation em sequência, atualiza
  // a barra de progresso entre os lotes e invalida a lista no fim. Guard de
  // iterações p/ não rodar infinito caso a IA não consiga precificar algum combo.
  async function rodarGerarPrecos(sobrescrever: boolean) {
    const LOTE = 30;
    setPrecoRun({ fase: "levantando", total: 0, processados: 0, itens: 0, lote: 0, sobrescrever });
    let total = 0;
    let processados = 0;
    let itens = 0;
    let offset = 0;
    let nLote = 0;
    let estagnou = false;
    const MAX_ITER = 500;
    try {
      while (nLote < MAX_ITER) {
        nLote++;
        setPrecoRun(prev => prev ? { ...prev, fase: "estimando", lote: nLote } : prev);
        const r = await gerarPrecos.mutateAsync({ companyId, sobrescrever, offset, loteMax: LOTE });
        if (total === 0) total = r.totalCombos;
        processados += r.combosAnalisados;
        itens += r.itensAtualizados;
        offset = r.proximoOffset;
        setPrecoRun(prev => prev ? { ...prev, fase: "gravando", total, processados, itens } : prev);
        if (!r.haMaisLotes || r.combosAnalisados === 0) break;
        // Guard de ESTAGNAÇÃO (modo "só sem valor"): aqui o offset fica em 0, então
        // o conjunto só encolhe quando a IA precifica. Se um lote CHEIO gravou ZERO
        // e ainda "há mais lotes", a próxima iteração re-busca os MESMOS combos do
        // topo → loop até MAX_ITER + 100% falso. Encerra cedo com aviso.
        if (!sobrescrever && r.itensAtualizados === 0) { estagnou = true; break; }
      }
      const aviso = estagnou
        ? "A IA não conseguiu estimar parte dos equipamentos. Os demais foram processados; tente novamente para os restantes."
        : undefined;
      setPrecoRun({ fase: "concluido", total: total || processados, processados, itens, lote: nLote, sobrescrever, aviso });
      utils.equipamentos.propriosListar.invalidate();
      if (itens === 0) {
        toast.info(total === 0
          ? "Todos os equipamentos já têm valor. Nada a estimar."
          : "A IA não conseguiu estimar valores desta vez. Tente novamente.");
      } else if (estagnou) {
        toast.warning(`${itens} equipamento${itens !== 1 ? "s" : ""} estimado${itens !== 1 ? "s" : ""}, mas parte ficou sem valor. Tente novamente.`);
      } else {
        toast.success(`${itens} equipamento${itens !== 1 ? "s" : ""} com valor estimado pela IA.`);
      }
    } catch (e) {
      setPrecoRun(prev => prev ? { ...prev, fase: "erro", erro: errMsg(e) } : { fase: "erro", total, processados, itens, lote: nLote, sobrescrever, erro: errMsg(e) });
      utils.equipamentos.propriosListar.invalidate();
      toast.error(errMsg(e));
    }
  }
  function confirmarExcluir() {
    if (!editingId) return;
    const ok = window.confirm(
      `Excluir "${form.descricao}" (${form.codigoPatrimonio})?\n\nO equipamento sairá da lista. O histórico fica preservado.`
    );
    if (!ok) return;
    excluir.mutate({ companyId, id: editingId });
  }

  function salvar() {
    if (!form.descricao.trim()) return toast.error("Diga o que é o equipamento (descrição).");
    // Rev. 2513 — patrimônio agora é SEMPRE gerado pelo servidor (auto-gen
    // + retry em UNIQUE violation). Cliente nem manda mais o campo.
    const valor = parseFloat(form.valorAquisicao.replace(",", ".")) || undefined;
    const vida = parseInt(form.vidaUtilMeses) || undefined;
    if (editingId) {
      // Rev. 2514 — coerência status×obra: quando NÃO está "em_obra", força
      // localização=almoxarifado e obraId=null (evita órfãos visuais).
      const emObra = form.status === "em_obra";
      if (emObra && !form.localizacaoAtualObraId) {
        return toast.error("Selecione a obra onde o equipamento está.");
      }
      atualizar.mutate({
        companyId, id: editingId,
        descricao: form.descricao,
        categoria: form.categoria || null,
        marca: form.marca || null,
        modelo: form.modelo || null,
        valorAquisicao: valor ?? null,
        vidaUtilMeses: vida ?? null,
        observacoes: form.observacoes || null,
        status: form.status, // Rev. 2512 — status editável
        localizacaoAtualTipo: emObra ? "obra" : "almoxarifado",
        localizacaoAtualObraId: emObra ? form.localizacaoAtualObraId : null,
        fotos: fotos.length > 0 ? fotos : undefined,
      });
    } else {
      // Rev. 2552 — status/obra já no cadastro. Mesma coerência da edição:
      // se "em_obra" exige obra selecionada.
      const emObra = form.status === "em_obra";
      if (emObra && !form.localizacaoAtualObraId) {
        return toast.error("Selecione a obra onde o equipamento está.");
      }
      // Rev. 3314 — quantidade pra cadastro em LOTE (1..100). Cada item ganha
      // seu próprio patrimônio sequencial no servidor.
      const qtd = Math.min(Math.max(parseInt(form.quantidade) || 1, 1), 100);
      criar.mutate({
        companyId,
        // codigoPatrimonio omitido propositalmente — servidor gera (Rev. 2513).
        descricao: form.descricao,
        categoria: form.categoria || undefined,
        numeroSerie: form.numeroSerie || undefined,
        marca: form.marca || undefined,
        modelo: form.modelo || undefined,
        dataAquisicao: form.dataAquisicao || undefined,
        valorAquisicao: valor,
        vidaUtilMeses: vida,
        fotos: fotos.length > 0 ? fotos : undefined,
        observacoes: form.observacoes || undefined,
        status: form.status,
        localizacaoAtualObraId: emObra ? form.localizacaoAtualObraId : null,
        quantidade: qtd,
      });
    }
  }

  const stats = useMemo(() => {
    const s = { total: data.length, em_obra: 0, disponivel: 0, manutencao: 0 };
    for (const p of data as any[]) {
      if (p.status === "em_obra") s.em_obra++;
      else if (p.status === "disponivel") s.disponivel++;
      else if (p.status === "manutencao") s.manutencao++;
    }
    return s;
  }, [data]);

  // Rev. 3033 — valor total do inventário (parque inteiro, SEM filtros de busca/status):
  // soma de `valorAquisicao` sobre a lista total. Exibido em destaque no topo.
  const valorTotalInventario = useMemo(() => {
    let soma = 0;
    for (const p of (totalList || []) as any[]) soma += Number(p.valorAquisicao) || 0;
    return soma;
  }, [totalList]);

  // Obras únicas presentes nos equipamentos carregados (para o select de filtro).
  const obrasUnicas = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of data as any[]) {
      if (p.obraNome && p.localizacaoAtualObraId != null) {
        map.set(String(p.localizacaoAtualObraId), p.obraNome);
      }
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [data]);

  // Lista exibida após aplicar o filtro de obra (client-side).
  const dataFiltrada = useMemo(() => {
    if (!filtroObra) return data as any[];
    return (data as any[]).filter(p => String(p.localizacaoAtualObraId) === filtroObra);
  }, [data, filtroObra]);

  // Valor total dos equipamentos visíveis (respeita filtro de obra).
  const valorFiltrado = useMemo(() => {
    const lista = filtroObra ? dataFiltrada : (totalList as any[]);
    return lista.reduce((s, p) => s + (Number(p.valorAquisicao) || 0), 0);
  }, [filtroObra, dataFiltrada, totalList]);

  return (
    <DashboardLayout>
      {/* Rev. 2510 — Header com identidade FC (faixa azul #1B2A4A, regra de ouro) */}
      <div
        className="text-white shadow-lg"
        style={{
          background: "linear-gradient(135deg, #1B2A4A 0%, #2E4373 100%)",
          printColorAdjust: "exact" as any,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20 shrink-0">
              <HardHat className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-white text-base sm:text-lg font-bold uppercase tracking-[0.2em] truncate">
                Equipamentos Próprios
              </h1>
              <p className="text-white/70 text-xs mt-0.5 truncate">
                Parque permanente da FC · controle unitário com foto, patrimônio e CAPEX
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleGerarPrecos}
              disabled={rodandoPrecos}
              title="Estimar com IA o valor de aquisição dos equipamentos sem valor"
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white ring-1 ring-white/30 active:scale-[0.98] px-4 py-2.5 rounded-lg font-semibold shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {rodandoPrecos
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <Sparkles className="h-5 w-5" />}
              <span className="hidden sm:inline">{rodandoPrecos ? "Gerando preços…" : "Gerar preços"}</span>
              <span className="sm:hidden">{rodandoPrecos ? "…" : "Preços"}</span>
            </button>
            <button
              onClick={abrirNovo}
              className="inline-flex items-center gap-2 bg-white text-[#1B2A4A] hover:bg-blue-50 active:scale-[0.98] px-4 py-2.5 rounded-lg font-semibold shadow-md transition"
            >
              <Plus className="h-5 w-5" /> <span className="hidden sm:inline">Cadastrar</span><span className="sm:hidden">Novo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal estilizado de confirmação da estimativa por IA (substitui o confirm() nativo) */}
      <AlertDialog open={!!confirmPrecos} onOpenChange={(o) => { if (!o) setConfirmPrecos(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md">
                <Sparkles className="h-5 w-5" />
              </div>
              <AlertDialogTitle className="text-lg leading-tight">
                Estimar valores com IA
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="pt-1 text-sm text-slate-600 space-y-3">
                {confirmPrecos && confirmPrecos.semValor > 0 ? (
                  <>
                    <p>
                      A IA vai estimar o valor de aquisição de{" "}
                      <span className="font-semibold text-slate-900">
                        {confirmPrecos.semValor} equipamento{confirmPrecos.semValor !== 1 ? "s" : ""}
                      </span>{" "}
                      que ainda estão <span className="font-semibold text-slate-900">sem valor</span>.
                    </p>
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700 ring-1 ring-emerald-100">
                      Os equipamentos que já têm valor <span className="font-semibold">não são alterados</span>.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      Todos os equipamentos já têm valor. Deseja{" "}
                      <span className="font-semibold text-slate-900">reestimar o valor de todos</span> com a IA?
                    </p>
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700 ring-1 ring-amber-100">
                      Atenção: isto <span className="font-semibold">sobrescreve os valores atuais</span>.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={rodandoPrecos}
              onClick={() => {
                const sobrescrever = (confirmPrecos?.semValor ?? 0) === 0;
                setConfirmPrecos(null);
                void rodarGerarPrecos(sobrescrever);
              }}
              className="bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {confirmPrecos && confirmPrecos.semValor > 0 ? "Estimar valores" : "Reestimar todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rev. 3026 — Modal de PROGRESSO fase a fase do "Gerar preços com IA" */}
      <Dialog
        open={!!precoRun}
        onOpenChange={(o) => { if (!o && !rodandoPrecos) setPrecoRun(null); }}
      >
        <DialogContent
          className="max-w-md"
          onPointerDownOutside={(e) => { if (rodandoPrecos) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (rodandoPrecos) e.preventDefault(); }}
          showCloseButton={!rodandoPrecos}
        >
          {precoRun && (() => {
            const pct = precoRun.total > 0
              ? Math.min(100, Math.round((precoRun.processados / precoRun.total) * 100))
              : (precoRun.fase === "concluido" ? 100 : 0);
            const fases = [
              { id: "levantando", label: "Levantando equipamentos sem preço", icon: ListChecks },
              { id: "estimando",  label: "Estimando valores com IA",          icon: Sparkles },
              { id: "gravando",   label: "Gravando valores no sistema",        icon: Database },
            ] as const;
            const ordem: Record<string, number> = { levantando: 0, estimando: 1, gravando: 2, concluido: 3, erro: 1 };
            const atual = ordem[precoRun.fase] ?? 0;
            const erro = precoRun.fase === "erro";
            const done = precoRun.fase === "concluido";
            return (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md ${
                    erro ? "bg-gradient-to-br from-rose-500 to-red-600"
                    : done ? "bg-gradient-to-br from-emerald-500 to-green-600"
                    : "bg-gradient-to-br from-violet-500 to-indigo-600"
                  }`}>
                    {erro ? <X className="h-5 w-5" />
                      : done ? <CheckCircle2 className="h-5 w-5" />
                      : <Loader2 className="h-5 w-5 animate-spin" />}
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-lg font-bold leading-tight text-slate-900">
                      {erro ? "Não foi possível concluir"
                        : done ? "Estimativa concluída"
                        : "Estimando valores com IA"}
                    </DialogTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {precoRun.sobrescrever ? "Reestimando todos os equipamentos" : "Apenas equipamentos sem valor"}
                    </p>
                  </div>
                </div>

                {/* Barra de progresso 0→100% */}
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Progresso</span>
                    <span className={`text-2xl font-extrabold tabular-nums ${erro ? "text-rose-600" : done ? "text-emerald-600" : "text-indigo-600"}`}>
                      {pct}%
                    </span>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {precoRun.total > 0
                        ? `${Math.min(precoRun.processados, precoRun.total)} de ${precoRun.total} combinações`
                        : "Preparando…"}
                    </span>
                    {precoRun.lote > 0 && !done && !erro && <span>Lote {precoRun.lote}</span>}
                  </div>
                </div>

                {/* Lista de fases */}
                <ol className="space-y-2">
                  {fases.map((f) => {
                    const idx = ordem[f.id];
                    const isDone = atual > idx || done;
                    const isActive = !erro && !done && atual === idx;
                    const Icon = f.icon;
                    return (
                      <li key={f.id} className="flex items-center gap-3">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          isDone ? "bg-emerald-100 text-emerald-600"
                          : isActive ? "bg-indigo-100 text-indigo-600"
                          : "bg-slate-100 text-slate-400"
                        }`}>
                          {isDone ? <CheckCircle2 className="h-4 w-4" />
                            : isActive ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Icon className="h-4 w-4" />}
                        </span>
                        <span className={`text-sm ${isActive ? "font-semibold text-slate-900" : isDone ? "text-slate-600" : "text-slate-400"}`}>
                          {f.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>

                {/* Rodapé: contagem viva / erro / botão fechar */}
                <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-100">
                  {erro ? (
                    <p className="text-rose-700">{precoRun.erro || "Falha na estimativa."}</p>
                  ) : (
                    <p className="text-slate-600">
                      <span className="font-bold text-slate-900 tabular-nums">{precoRun.itens}</span>{" "}
                      equipamento{precoRun.itens !== 1 ? "s" : ""} com valor {done ? "estimado" : "sendo estimado"} pela IA.
                    </p>
                  )}
                </div>

                {done && precoRun.aviso && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
                    {precoRun.aviso}
                  </div>
                )}

                {(done || erro) && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setPrecoRun(null)}
                      className="inline-flex items-center gap-2 bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md transition active:scale-[0.98]"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Fechar
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
        {/* KPIs com ícones coloridos */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <KpiCard icon={<Layers className="h-4 w-4" />}        label="Total"        value={stats.total}      color="slate"   />
          <KpiCard icon={<HardHat className="h-4 w-4" />}       label="Em obra"      value={stats.em_obra}    color="blue"    />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />}  label="Disponíveis"  value={stats.disponivel} color="emerald" />
          <KpiCard icon={<Wrench className="h-4 w-4" />}        label="Manutenção"   value={stats.manutencao} color="amber"   />
          <KpiCard icon={<DollarSign className="h-4 w-4" />}    label={filtroObra ? "Valor (obra)" : "Valor total"}  moneyText={fmtMoney(valorFiltrado)} color="indigo" />
        </div>

        {/* Filtros sticky no topo da lista */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por descrição, patrimônio ou nº de série…"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none rounded-lg text-sm transition"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { v: "",           l: "Todos",        c: "border-slate-300 text-slate-700" },
                { v: "disponivel", l: "Disponíveis",  c: "border-emerald-300 text-emerald-700" },
                { v: "em_obra",    l: "Em obra",      c: "border-blue-300 text-blue-700" },
                { v: "manutencao", l: "Manutenção",   c: "border-amber-300 text-amber-700" },
                { v: "baixado",    l: "Baixados",     c: "border-slate-400 text-slate-600" },
              ].map(opt => {
                const active = filtroStatus === opt.v;
                return (
                  <button
                    key={opt.v || "all"}
                    onClick={() => setFiltroStatus(opt.v)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition whitespace-nowrap ${
                      active
                        ? "bg-[#1B2A4A] text-white border-[#1B2A4A] shadow"
                        : `bg-white hover:bg-slate-50 ${opt.c}`
                    }`}
                  >
                    {opt.l}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Filtro por obra */}
          {obrasUnicas.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
              <select
                value={filtroObra}
                onChange={e => setFiltroObra(e.target.value)}
                className="flex-1 sm:max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none bg-white"
              >
                <option value="">Todas as obras</option>
                {obrasUnicas.map(o => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </select>
              {filtroObra && (
                <button
                  onClick={() => setFiltroObra("")}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                  title="Limpar filtro de obra"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Grid de cards visuais (foto grande à esquerda, dados à direita) */}
        {isLoading ? (
          <div className="p-12 bg-white border border-slate-200 rounded-xl shadow-sm flex justify-center">
            <Spinner />
          </div>
        ) : dataFiltrada.length === 0 ? (
          <div className="p-12 bg-white border border-slate-200 rounded-xl shadow-sm text-center">
            <HardHat className="h-16 w-16 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">Nenhum equipamento cadastrado</p>
            <p className="text-xs text-slate-500 mb-4">
              {busca || filtroStatus || filtroObra ? "Tente limpar os filtros." : "Toque em \"Cadastrar\" pra começar."}
            </p>
            {!busca && !filtroStatus && !filtroObra && (
              <button
                onClick={abrirNovo}
                className="inline-flex items-center gap-2 bg-[#1B2A4A] hover:bg-[#2E4373] text-white px-4 py-2 rounded-lg text-sm font-semibold"
              >
                <Plus className="h-4 w-4" /> Cadastrar primeiro equipamento
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {dataFiltrada.map(p => {
              const pFotos = (p.fotosJson as FotoItem[]) || [];
              const foto = pFotos[0];
              return (
                <div
                  key={p.id}
                  className="group bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-xl overflow-hidden shadow-sm transition cursor-pointer flex"
                  onClick={() => abrirEdit(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") abrirEdit(p); }}
                >
                  {/* Rev. 2515 — Foto clicável: amplia em lightbox em vez
                      de abrir edição. stopPropagation impede que o click
                      borbulhe pro card. Aria-label pra acessibilidade. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (pFotos.length > 0) openLightbox(pFotos.map(f => f.url), 0);
                    }}
                    disabled={pFotos.length === 0}
                    aria-label={pFotos.length > 0 ? `Ampliar foto de ${p.descricao}` : "Sem foto"}
                    className="w-28 sm:w-32 shrink-0 bg-gradient-to-br from-slate-100 to-slate-200 relative group/foto disabled:cursor-default"
                  >
                    {foto ? (
                      <>
                        <img src={foto.url} alt={p.descricao} className="w-full h-full object-cover transition group-hover/foto:opacity-90" />
                        {/* hint visual ao passar o mouse */}
                        <span className="absolute inset-0 bg-black/0 group-hover/foto:bg-black/20 transition flex items-center justify-center opacity-0 group-hover/foto:opacity-100">
                          <span className="bg-white/95 text-slate-800 text-[10px] font-semibold px-2 py-1 rounded-full shadow">Ampliar</span>
                        </span>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <HardHat className="h-10 w-10" />
                      </div>
                    )}
                    {pFotos.length > 1 && (
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        +{pFotos.length - 1}
                      </span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0 p-3 flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        <Hash className="h-3 w-3" /> {p.codigoPatrimonio}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); abrirEdit(p); }}
                        aria-label="Editar"
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <h3 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 uppercase">{p.descricao}</h3>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[p.status] || "bg-slate-100 ring-1 ring-slate-200"}`}>
                        {STATUS_LABELS[p.status] || p.status}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate uppercase">
                        {p.categoria || "—"}
                      </span>
                    </div>
                    {/* Rev. 2514 — LOCALIZAÇÃO: badge azul "OBRA: <nome>" quando
                        em_obra; senão chip cinza "ALMOX." pra ficar rastreável
                        sem precisar abrir o modal. */}
                    <div className="flex items-center gap-1.5">
                      {p.status === "em_obra" && p.obraNome ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-800 ring-1 ring-blue-200 truncate max-w-full">
                          <Building2 className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate uppercase">OBRA: {p.obraNome}</span>
                        </span>
                      ) : p.status === "em_obra" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                          <Building2 className="h-2.5 w-2.5" /> OBRA NÃO DEFINIDA
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                          <Boxes className="h-2.5 w-2.5" /> ALMOX.
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-auto pt-1.5 border-t border-slate-100">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 truncate uppercase">
                        <UserIcon className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{p.criadoPorNome || "—"}</span>
                      </span>
                      {(p.valorAquisicao || p.dataAquisicao) && (
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {p.valorAquisicao ? fmtMoney(p.valorAquisicao) : ""}
                          {p.valorAquisicao && p.dataAquisicao ? " · " : ""}
                          {fmtDate(p.dataAquisicao) || ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal — Rev. 2510 com faixa azul FC no topo (regra de ouro) */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="prop-modal-title"
        >
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92dvh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div
              className="px-5 py-4 text-white flex items-center justify-between sticky top-0 z-10"
              style={{
                background: "linear-gradient(135deg, #1B2A4A 0%, #2E4373 100%)",
                printColorAdjust: "exact" as any,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20 shrink-0">
                  <HardHat className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="prop-modal-title" className="text-white text-sm font-bold uppercase tracking-[0.2em] truncate">
                    {editingId ? "Editar Equipamento" : "Novo Equipamento"}
                  </h2>
                  <p className="text-white/70 text-[10px] mt-0.5 truncate">
                    {editingId ? `Patrimônio ${form.codigoPatrimonio}` : "Parque próprio FC"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModal(false)}
                aria-label="Fechar"
                className="p-1.5 rounded-lg hover:bg-white/10 transition shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {importTotal > 0 && (
              <div className="bg-emerald-50 border-b-2 border-emerald-300 px-5 py-3 flex items-center gap-3">
                <Boxes className="h-5 w-5 text-emerald-700 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-900">
                    Importando do Almoxarifado · {importTotal - importQueue.length} de {importTotal}
                  </p>
                  <p className="text-[11px] text-emerald-700/90 leading-tight">
                    Revise os dados e salve. Restam {importQueue.length} equipamento{importQueue.length !== 1 ? "s" : ""} na fila.
                  </p>
                </div>
                <button
                  onClick={() => { setImportQueue([]); setImportTotal(0); toast.info("Importação cancelada."); }}
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-medium underline"
                >
                  Parar fila
                </button>
              </div>
            )}

            <div className="p-4 space-y-3 flex-1 overflow-y-auto min-h-0">
              {/* 1) FOTO */}
              {!editingId && (
                <div>
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleFotoTop}
                    className="hidden"
                  />
                  {fotos.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded-2xl py-8 flex flex-col items-center justify-center gap-2 text-blue-700 active:scale-[0.98] transition"
                    >
                      <Camera className="h-12 w-12" />
                      <span className="text-base font-semibold">Bater foto do equipamento</span>
                      <span className="text-xs text-slate-500">Toque pra abrir a câmera</span>
                    </button>
                  ) : (
                    <div>
                      <div className="grid grid-cols-3 gap-2">
                        {fotos.map((f, i) => (
                          <div key={i} className="relative group">
                            <img src={f.url} alt={`foto-${i}`} className="w-full h-24 object-cover rounded-lg border" />
                            <button
                              type="button"
                              onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))}
                              aria-label="Remover foto"
                              className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        {fotos.length < 6 && (
                          <button
                            type="button"
                            onClick={() => fotoInputRef.current?.click()}
                            className="h-24 border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600"
                            aria-label="Adicionar mais fotos"
                          >
                            <Camera className="h-7 w-7" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5 text-center">{fotos.length} foto(s) · máx 6</p>
                    </div>
                  )}
                </div>
              )}

              {/* Rev. 2512 — Layout 2 colunas em sm+, denso pra caber sem scroll */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* DESCRIÇÃO — col-span-2 */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    O que é? <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={form.descricao}
                    onChange={e => setForm(p => ({ ...p, descricao: up(e.target.value) }))}
                    placeholder="EX: FURADEIRA BOSCH GSB 550, ANDAIME TUBULAR 1,5M…"
                    autoFocus
                    style={{ textTransform: "uppercase" }}
                    className="w-full px-3 py-2 border-2 border-slate-200 focus:border-blue-500 focus:outline-none rounded-lg text-sm"
                  />
                </div>

                {/* PATRIMÔNIO — Rev. 2513: SEMPRE auto-gerado pelo servidor.
                   Em criação mostra preview do próximo número (placeholder).
                   Em edição mostra o código real (read-only). */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    Patrimônio <span className="font-normal text-slate-500">({editingId ? "imutável" : "auto"})</span>
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 border-2 border-slate-200 bg-slate-50 rounded-lg">
                    <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-mono text-sm font-semibold text-slate-700 truncate">
                      {editingId ? form.codigoPatrimonio : (totalFetched ? gerarPatrimonioAuto() : "EQP-…")}
                    </span>
                    {!editingId && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700">
                        <Sparkles className="h-3 w-3" /> AUTO
                      </span>
                    )}
                  </div>
                </div>

                {/* QUANTIDADE — Rev. 3314: cadastro em LOTE de itens idênticos.
                    Só no NOVO (na edição cada patrimônio é 1 item imutável). */}
                {!editingId && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      Quantidade <span className="font-normal text-slate-500">(itens iguais)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Diminuir quantidade"
                        onClick={() => setForm(p => ({ ...p, quantidade: String(Math.max(1, (parseInt(p.quantidade) || 1) - 1)) }))}
                        className="h-10 w-10 shrink-0 rounded-lg border-2 border-slate-200 bg-white text-lg font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        value={form.quantidade}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === "") return setForm(p => ({ ...p, quantidade: "" }));
                          const n = Math.min(100, Math.max(1, parseInt(v) || 1));
                          setForm(p => ({ ...p, quantidade: String(n) }));
                        }}
                        onBlur={() => setForm(p => ({ ...p, quantidade: String(Math.min(100, Math.max(1, parseInt(p.quantidade) || 1))) }))}
                        className="w-full text-center px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Aumentar quantidade"
                        onClick={() => setForm(p => ({ ...p, quantidade: String(Math.min(100, (parseInt(p.quantidade) || 1) + 1)) }))}
                        className="h-10 w-10 shrink-0 rounded-lg border-2 border-slate-200 bg-white text-lg font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                      >
                        +
                      </button>
                    </div>
                    {(parseInt(form.quantidade) || 1) > 1 && (
                      <p className="mt-1 text-[11px] text-blue-700">
                        Serão criados {parseInt(form.quantidade)} equipamentos idênticos, cada um com seu próprio patrimônio sequencial.
                      </p>
                    )}
                  </div>
                )}

                {/* STATUS — Rev. 2512 (edição) / Rev. 2552 (também no cadastro) */}
                <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">Status</label>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_OPTIONS.map(opt => {
                        const active = form.status === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => setForm(p => ({
                              ...p,
                              status: opt.v,
                              // Rev. 2554 — coerência visual: status ≠ "em_obra"
                              // limpa a obra (não seria gravada de qualquer forma).
                              localizacaoAtualObraId: opt.v === "em_obra" ? p.localizacaoAtualObraId : null,
                            }))}
                            className={`px-2.5 py-2 rounded-lg text-xs font-semibold border-2 transition ${
                              active
                                ? `${opt.activeBg} text-white border-transparent shadow`
                                : `bg-white ${opt.text} ${opt.border} hover:bg-slate-50`
                            }`}
                          >
                            {opt.l}
                          </button>
                        );
                      })}
                    </div>
                    {/* Rev. 2514 — Obra picker aparece quando status="em_obra".
                        Rev. 2554 — no CADASTRO (novo item) aparece SEMPRE.
                        Rev. 2564 — agora aparece SEMPRE também na EDIÇÃO, pra o
                        usuário poder indicar a obra direto sem ter que clicar em
                        "Em obra" antes; escolher uma obra marca o status "Em obra"
                        automaticamente. */}
                    {(
                      <div className="mt-2">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1 inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-blue-700" /> Obra atual{" "}
                          {form.status === "em_obra"
                            ? <span className="text-red-500">*</span>
                            : <span className="font-normal text-slate-400">(opcional)</span>}
                        </label>
                        <select
                          value={form.localizacaoAtualObraId ?? ""}
                          onChange={e => {
                            const obraId = e.target.value ? Number(e.target.value) : null;
                            setForm(p => ({
                              ...p,
                              localizacaoAtualObraId: obraId,
                              // Rev. 2554 — escolher obra ⇒ "em_obra"; limpar ⇒
                              // volta a "disponivel" (almoxarifado).
                              status: obraId
                                ? "em_obra"
                                : (p.status === "em_obra" ? "disponivel" : p.status),
                            }));
                          }}
                          className="w-full px-2 py-2 border-2 border-blue-200 focus:border-blue-500 focus:outline-none rounded-lg text-sm bg-blue-50/30"
                        >
                          <option value="">— Almoxarifado (sem obra) —</option>
                          {obrasAtivas.map((o: any) => (
                            <option key={o.id} value={o.id}>{o.nome}</option>
                          ))}
                        </select>
                        {form.status !== "em_obra" && (
                          <p className="mt-1 text-[10.5px] text-slate-500">
                            Selecione a obra se o equipamento já vai pra obra. Sem obra, fica no almoxarifado.
                          </p>
                        )}
                      </div>
                    )}
                    {/* Rev. 2514 — Auditoria read-only: quem cadastrou + quando (só edição). */}
                    {editingId && (editingMeta.criadoPorNome || editingMeta.createdAt) && (
                      <p className="mt-2 text-[10.5px] text-slate-500 inline-flex items-center gap-1 uppercase tracking-wide">
                        <UserIcon className="h-3 w-3" />
                        Cadastrado por <strong className="text-slate-700">{editingMeta.criadoPorNome || "—"}</strong>
                        {editingMeta.createdAt && <> em <strong className="text-slate-700">{fmtDate(editingMeta.createdAt)}</strong></>}
                      </p>
                    )}
                  </div>

                {/* CATEGORIA — col-span-2 */}
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-800">Categoria</label>
                    {!novaCatOpen && (
                      <button
                        type="button"
                        onClick={() => { setNovaCatOpen(true); setNovaCatTxt(""); }}
                        className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Nova categoria
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {categoriasAll.map(cat => {
                      const active = form.categoria.toLowerCase() === cat.toLowerCase();
                      const isCustom = catCustom.some(c => c.toLowerCase() === cat.toLowerCase());
                      return (
                        <span
                          key={cat}
                          className={`inline-flex items-center rounded-full text-xs font-medium border-2 transition overflow-hidden ${
                            active
                              ? "bg-[#1B2A4A] text-white border-[#1B2A4A] shadow"
                              : "bg-white text-slate-700 border-slate-200 hover:border-blue-400"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setForm(p => ({ ...p, categoria: active ? "" : cat }))}
                            className="px-2.5 py-1.5"
                          >
                            {cat}
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Remover a categoria "${cat}" da lista?\n\nOs equipamentos já marcados com ela continuam com o texto.`)) {
                                  removerCategoriaCustom(cat);
                                }
                              }}
                              aria-label={`Remover ${cat}`}
                              className={`pr-1.5 pl-0.5 py-1.5 ${active ? "text-white/70 hover:text-white" : "text-slate-400 hover:text-red-600"}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  {novaCatOpen && (
                    <div className="mt-2 flex gap-1.5">
                      <input
                        autoFocus
                        value={novaCatTxt}
                        onChange={e => setNovaCatTxt(up(e.target.value))}
                        style={{ textTransform: "uppercase" }}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); adicionarCategoria(); }
                          if (e.key === "Escape") { setNovaCatOpen(false); setNovaCatTxt(""); }
                        }}
                        placeholder="Ex: Caminhão betoneira, Mini-escavadeira…"
                        maxLength={100}
                        className="flex-1 px-3 py-2 border-2 border-blue-300 focus:border-blue-500 focus:outline-none rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={adicionarCategoria}
                        className="px-3 py-2 bg-[#1B2A4A] hover:bg-[#2E4373] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Criar
                      </button>
                      <button
                        type="button"
                        onClick={() => { setNovaCatOpen(false); setNovaCatTxt(""); }}
                        className="px-3 py-2 border rounded-lg text-xs hover:bg-slate-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 5) MAIS DETALHES — Rev. 2512: 2 colunas internas pra adensar */}
              <div className="border-t pt-2">
                <button
                  type="button"
                  onClick={() => setMostrarDetalhes(v => !v)}
                  aria-expanded={mostrarDetalhes}
                  className="w-full flex items-center justify-between py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  <span>Mais detalhes (opcional)</span>
                  {mostrarDetalhes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {mostrarDetalhes && (
                  <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Field label="N° Série">
                      <input value={form.numeroSerie} disabled={!!editingId}
                        onChange={e => setForm(p => ({ ...p, numeroSerie: up(e.target.value) }))}
                        style={{ textTransform: "uppercase" }}
                        className="w-full px-2 py-1.5 border rounded text-sm disabled:bg-slate-100" />
                    </Field>
                    <Field label="Marca">
                      <input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: up(e.target.value) }))}
                        style={{ textTransform: "uppercase" }}
                        className="w-full px-2 py-1.5 border rounded text-sm" />
                    </Field>
                    <Field label="Modelo">
                      <input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: up(e.target.value) }))}
                        style={{ textTransform: "uppercase" }}
                        className="w-full px-2 py-1.5 border rounded text-sm col-span-2" />
                    </Field>
                    <Field label="Data Aquisição">
                      <input type="date" value={form.dataAquisicao} disabled={!!editingId}
                        onChange={e => setForm(p => ({ ...p, dataAquisicao: e.target.value }))}
                        className="w-full px-2 py-1.5 border rounded text-sm disabled:bg-slate-100" />
                    </Field>
                    <Field label="Valor (R$)">
                      <input value={form.valorAquisicao} onChange={e => setForm(p => ({ ...p, valorAquisicao: e.target.value }))}
                        placeholder="0,00" className="w-full px-2 py-1.5 border rounded text-sm" />
                    </Field>
                    <Field label="Vida útil (meses)">
                      <input value={form.vidaUtilMeses} onChange={e => setForm(p => ({ ...p, vidaUtilMeses: e.target.value }))}
                        placeholder="ex: 84" className="w-full px-2 py-1.5 border rounded text-sm" />
                    </Field>
                    <div className="col-span-2 sm:col-span-4">
                      <Field label="Observações">
                        <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: up(e.target.value) }))}
                          rows={2} style={{ textTransform: "uppercase" }}
                          className="w-full px-2 py-1.5 border rounded text-sm" />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              {/* Rev. 2515 — FOTOS sempre visíveis (criar + editar). Antes
                  estavam escondidas dentro de "Mais detalhes" e só apareciam
                  em modo edição — user (iPad) precisava ver/adicionar fotos
                  sem precisar abrir o accordeon. Cada thumb é clicável pra
                  ampliar via lightbox. */}
              <div className="border-t pt-3">
                <FotosUploader fotos={fotos} onChange={setFotos} label="Fotos do equipamento" />
                {fotos.length > 0 && (
                  <p className="mt-1.5 text-[10.5px] text-slate-500 inline-flex items-center gap-1">
                    <Camera className="h-3 w-3" /> Toque numa foto pra ampliar.
                  </p>
                )}
                {fotos.length > 0 && (
                  <div className="mt-2 grid grid-cols-6 gap-1.5">
                    {fotos.map((f, i) => (
                      <button
                        key={`thumb-${i}`}
                        type="button"
                        onClick={() => openLightbox(fotos.map(x => x.url), i)}
                        className="relative aspect-square overflow-hidden rounded border border-slate-200 hover:border-blue-500 transition"
                        aria-label={`Ampliar foto ${i + 1}`}
                      >
                        <img src={f.url} alt={`foto-${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-2 sticky bottom-0">
              {/* Rev. 2511 — Excluir só aparece em modo edição (esquerda) */}
              {editingId ? (
                <button
                  onClick={confirmarExcluir}
                  disabled={excluir.isPending || atualizar.isPending || criar.isPending}
                  className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 border-2 border-red-200 hover:border-red-400 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  {excluir.isPending ? "Excluindo…" : "Excluir"}
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={() => setModal(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-100">Cancelar</button>
                <button onClick={salvar} disabled={criar.isPending || atualizar.isPending || excluir.isPending}
                  className="px-6 py-2.5 text-base font-semibold bg-[#1B2A4A] hover:bg-[#2E4373] text-white rounded-lg shadow disabled:opacity-50 inline-flex items-center gap-2">
                  {(criar.isPending || atualizar.isPending) && <Spinner />}
                  {criar.isPending || atualizar.isPending ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2515 — LIGHTBOX: foto ampliada quase tela cheia (96vw/96vh).
          Click no backdrop fecha; setas navegam quando há +1 foto; respeita
          EXIF (`imageOrientation: from-image`) seguindo padrão do PersonPhoto
          (Rev. 2507). z-index 60 fica acima do modal de edição (z-50). */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-2"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            aria-label="Fechar"
            className="absolute top-3 right-3 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="h-6 w-6" />
          </button>
          {lightbox.urls.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox(p => p ? { ...p, index: (p.index - 1 + p.urls.length) % p.urls.length } : p); }}
                aria-label="Foto anterior"
                className="absolute left-3 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl font-bold"
              >‹</button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox(p => p ? { ...p, index: (p.index + 1) % p.urls.length } : p); }}
                aria-label="Próxima foto"
                className="absolute right-3 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl font-bold"
              >›</button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/15 text-white text-xs px-3 py-1 rounded-full font-medium">
                {lightbox.index + 1} / {lightbox.urls.length}
              </span>
            </>
          )}
          <img
            src={lightbox.urls[lightbox.index]}
            alt="Foto ampliada"
            onClick={(e) => e.stopPropagation()}
            style={{ imageOrientation: "from-image", maxWidth: "96vw", maxHeight: "96vh" }}
            className="object-contain rounded shadow-2xl"
          />
        </div>
      )}
    </DashboardLayout>
  );
}

const KPI_COLOR: Record<string, { bg: string; ring: string; text: string; icon: string }> = {
  slate:   { bg: "bg-slate-50",   ring: "ring-slate-200",   text: "text-slate-800",   icon: "bg-slate-500"   },
  blue:    { bg: "bg-blue-50",    ring: "ring-blue-200",    text: "text-blue-700",    icon: "bg-blue-500"    },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700", icon: "bg-emerald-500" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-700",   icon: "bg-amber-500"   },
  indigo:  { bg: "bg-indigo-50",  ring: "ring-indigo-200",  text: "text-indigo-700",  icon: "bg-indigo-500"  },
};
function KpiCard({ icon, label, value, moneyText, color }: { icon: React.ReactNode; label: string; value?: number; moneyText?: string; color: keyof typeof KPI_COLOR }) {
  const c = KPI_COLOR[color];
  // Rev. 3033 — `moneyText` (valor BRL) ganha só DESTAQUE DE COR, sem aumentar a
  // fonte como os contadores numéricos (text-3xl). Mantém leitura compacta.
  return (
    <div className={`relative overflow-hidden rounded-xl ring-1 ${c.ring} ${c.bg} p-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`h-6 w-6 rounded-md ${c.icon} text-white flex items-center justify-center shadow-sm`}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 truncate">{label}</p>
      </div>
      {moneyText !== undefined ? (
        <p className={`text-lg sm:text-xl font-extrabold tabular-nums ${c.text} truncate`} title={moneyText}>{moneyText}</p>
      ) : (
        <p className={`text-3xl font-extrabold tabular-nums ${c.text}`}>{value}</p>
      )}
    </div>
  );
}

function Field({ label, children, disabled }: { label: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div>
      <label className={`block text-xs font-medium mb-1 ${disabled ? "text-slate-400" : "text-slate-700"}`}>{label}</label>
      {children}
    </div>
  );
}
