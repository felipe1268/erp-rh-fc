import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { Plus, Search, X, Truck, CheckCircle2, RotateCcw, ClipboardCheck, Eye, FileText, Upload, Sparkles, Trash2, Activity, Clock, AlertTriangle, DollarSign, Calendar, Hash, Building2, User as UserIcon, MapPin, Camera, StickyNote, ChevronDown, Tag, Loader2, Layers, Boxes, ImagePlus, Library, Check, Globe, RefreshCw, ZoomIn, Undo2, Pencil, type LucideIcon } from "lucide-react";
import { ModalConfirmacaoAuditoria } from "@/components/almoxarifado/ModalConfirmacaoAuditoria";
import type { ReactNode } from "react";
import { FotosUploader, FotoItem, fmtMoney, fmtDate, Spinner } from "./_shared";
import { compressImageIfNeeded } from "@/lib/imageCompress";
import { SignaturePad } from "@/components/SignaturePad"; // Rev. 2453
import { useAuth } from "@/_core/hooks/useAuth"; // Rev. 2456

// Rev. 2346 — formata inteiros pt-BR (≥1000 ganha separador "." de milhar). Ex: 1220 → "1.220".
const fmtN = (n: number) => n.toLocaleString("pt-BR");

// Rev. 2459 — sanitiza URLs renderizadas em <img src> e <a href> na timeline.
// Aceita só: https?:, /uploads/, /api/, data:image/(png|jpeg|jpg|webp);base64,
// Bloqueia javascript:, file:, data:text/html, etc. Teto 3MB pra dataURL
// (assinatura típica ~30-150KB; tampa pra evitar travada de render).
function safeMediaUrl(u: any): boolean {
  if (!u || typeof u !== "string") return false;
  if (u.length < 8 || u.length > 3 * 1024 * 1024) return false;
  if (/^https?:\/\//i.test(u)) return true;
  if (u.startsWith("/uploads/") || u.startsWith("/api/")) return true;
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(u)) return true;
  return false;
}

const STATUS_LABELS: Record<string, string> = {
  em_uso: "Em uso", devolvido: "Devolvido", atrasado: "Atrasado",
  em_renovacao: "Em renovação", localizacao_pendente: "Local pendente", em_manutencao: "Manutenção",
  // Rev. 2411 — novos statuses pra rastreabilidade do ciclo de vida.
  aguardando_chegada: "Aguardando chegada",
  quebrado: "Quebrado",
  solicitado_substituicao: "Solicitada substituição",
};
const STATUS_COLORS: Record<string, string> = {
  em_uso: "bg-blue-100 text-blue-700",
  devolvido: "bg-slate-200 text-slate-700",
  atrasado: "bg-red-100 text-red-700",
  em_renovacao: "bg-amber-100 text-amber-700",
  localizacao_pendente: "bg-orange-100 text-orange-700",
  em_manutencao: "bg-purple-100 text-purple-700",
  // Rev. 2411
  aguardando_chegada: "bg-cyan-100 text-cyan-700",
  quebrado: "bg-rose-100 text-rose-700",
  solicitado_substituicao: "bg-fuchsia-100 text-fuchsia-700",
};

const EMPTY = {
  descricao: "", categoria: "", fornecedorNome: "",
  codigoPatrimonioFornecedor: "", codigoInternoErp: "", numeroSerie: "",
  dataInicio: new Date().toISOString().slice(0, 10),
  dataFimPrevista: "",
  valorDiario: "", valorMensal: "",
  funcionarioResponsavelNome: "",
  observacoes: "",
};

export default function EquipamentosLocados() {
  const { selectedCompany } = useCompany();
  // Rev. 2456 — autofill nome do entregador com o user FC logado (admin/encarregado).
  const { user: meAuth } = useAuth();
  const companyId = Number(selectedCompany?.id) || 0;
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("em_uso");
  // Rev. 2334 — filtro por obra ("" = todas; "__null__" = sem obra; "<id>" = obra ERP)
  const [filtroObra, setFiltroObra] = useState<string>("");
  // Rev. 2408 — filtro por locadora/fornecedor (reaproveita o nome já gravado
  // em cada locado; lista de seleção é derivada dos próprios equipamentos da
  // empresa atual + opcionalmente do cadastro de fornecedores).
  const [filtroFornecedor, setFiltroFornecedor] = useState<string>("");
  // Rev. 2337 — filtro por categoria ("" = todas; "__null__" = sem categoria; "<nome>" = nome exato)
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");
  // Rev. 2361 — filtro por urgência de vencimento (só aplica sobre em_uso).
  // "" = sem filtro; "vencidos" = fim < hoje; "5d" = fim em [hoje, hoje+5d);
  // "30d" = fim em [hoje, hoje+30d). Setado ao clicar nos cards KPI.
  const [filtroVencimento, setFiltroVencimento] = useState<"" | "vencidos" | "5d" | "30d">("");
  // Rev. 2344 — agrupa cards por descrição+obra (default ON) para condensar
  // listas com muitas unidades idênticas (1218 cards → ~60 grupos).
  const [agruparPorDescObra, setAgruparPorDescObra] = useState<boolean>(true);
  const [modalGrupo, setModalGrupo] = useState<any>(null);

  const utils = trpc.useUtils();
  // Lista TUDO (sem filtro server-side de status) pra os contadores das
  // pills baterem cross-filter. Filtro de status aplicado client-side abaixo.
  const { data: dataAll = [], isLoading } = trpc.equipamentos.locadosListar.useQuery(
    { companyId, busca: busca || undefined },
    { enabled: !!companyId }
  );
  // Rev. 2334 — pipeline: status → obra. `dataPorStatus` é exposto pra
  // contadores de obra (cross-filter respeita o status corrente).
  const dataPorStatus = useMemo(
    () => (filtroStatus ? (dataAll as any[]).filter(l => l.status === filtroStatus) : (dataAll as any[])),
    [dataAll, filtroStatus]
  );
  // Rev. 2337 — pipeline: status → obra → categoria. `dataPorStatusEObra` é
  // exposto pro select de categoria (cross-filter respeita status+obra correntes).
  const dataPorStatusEObra = useMemo(() => {
    if (!filtroObra) return dataPorStatus;
    if (filtroObra === "__null__") return dataPorStatus.filter(l => !l.obraId);
    const oid = parseInt(filtroObra) || 0;
    return dataPorStatus.filter(l => Number(l.obraId) === oid);
  }, [dataPorStatus, filtroObra]);
  // Rev. 2361 — pipeline: status → obra → categoria → vencimento.
  // `dataPorCat` (pré-vencimento) é a fonte do `stats` para que os contadores
  // dos cards KPI continuem mostrando os totais ao clicar e filtrar por urgência
  // (caso contrário, clicar em "Atrasados" zeraria "Vencendo" e vice-versa).
  const dataPorCat = useMemo(() => {
    if (!filtroCategoria) return dataPorStatusEObra;
    if (filtroCategoria === "__null__") return dataPorStatusEObra.filter(l => !l.categoria);
    return dataPorStatusEObra.filter(l => String(l.categoria || "") === filtroCategoria);
  }, [dataPorStatusEObra, filtroCategoria]);
  // Rev. 2408 — pipeline: status → obra → categoria → fornecedor → vencimento.
  // Comparação por NOME normalizado (uppercase trimmed) pra ser resiliente a
  // diferenças de capitalização vindas do parser de PDF.
  const dataPorFornecedor = useMemo(() => {
    if (!filtroFornecedor) return dataPorCat;
    if (filtroFornecedor === "__null__") return dataPorCat.filter(l => !l.fornecedorNome);
    const alvo = filtroFornecedor.trim().toUpperCase();
    return dataPorCat.filter(l => String(l.fornecedorNome || "").trim().toUpperCase() === alvo);
  }, [dataPorCat, filtroFornecedor]);
  const data = useMemo(() => {
    if (!filtroVencimento) return dataPorFornecedor;
    const hoje = Date.now();
    const lim5  = hoje + 5  * 86400 * 1000;
    const lim30 = hoje + 30 * 86400 * 1000;
    return dataPorFornecedor.filter(l => {
      if (l.status !== "em_uso") return false;
      const fim = new Date(l.dataFimPrevista).getTime();
      if (!isFinite(fim)) return false;
      if (filtroVencimento === "vencidos") return fim < hoje;
      if (filtroVencimento === "5d")       return fim >= hoje && fim < lim5;
      if (filtroVencimento === "30d")      return fim >= hoje && fim < lim30;
      return true;
    });
  }, [dataPorFornecedor, filtroVencimento]);

  // Rev. 2344 — agrupamento por descrição+obra (key normalizada). Cada grupo
  // agrega: contagem, status mix, Σ valorMensal, foto representativa, lista
  // de unidades pra drill-down via modal. Não muda nada se grupo tem 1 só.
  type Grupo = {
    key: string;
    descricao: string;
    obraId: number | null;
    categoria: string | null;
    fornecedorNome: string | null;
    fotoUrl: string | null;
    fotoIA: boolean;
    valorMensalTotal: number;
    statusMix: Record<string, number>;
    statusPrincipal: string;
    unidades: any[];
  };
  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>();
    for (const l of data as any[]) {
      const oid = l.obraId ? Number(l.obraId) : null;
      const k = `${String(l.descricao || "").trim().toUpperCase()}__${oid ?? "na"}`;
      const g = map.get(k);
      if (g) {
        g.unidades.push(l);
        g.valorMensalTotal += Number(l.valorMensal || 0);
        g.statusMix[l.status] = (g.statusMix[l.status] || 0) + 1;
        if (!g.fotoUrl) {
          const fotos = (l.fotosRecebimentoJson as FotoItem[]) || [];
          const fp = fotos[0]?.url || (l.fotoUrl as string | null) || null;
          if (fp) { g.fotoUrl = fp; g.fotoIA = !fotos[0] && !!l.fotoUrl; }
        }
        if (!g.fornecedorNome && l.fornecedorNome) g.fornecedorNome = l.fornecedorNome;
        if (!g.categoria && l.categoria) g.categoria = String(l.categoria);
      } else {
        const fotos = (l.fotosRecebimentoJson as FotoItem[]) || [];
        const fp = fotos[0]?.url || (l.fotoUrl as string | null) || null;
        map.set(k, {
          key: k,
          descricao: l.descricao,
          obraId: oid,
          categoria: l.categoria ? String(l.categoria) : null,
          fornecedorNome: l.fornecedorNome || null,
          fotoUrl: fp,
          fotoIA: !fotos[0] && !!l.fotoUrl,
          valorMensalTotal: Number(l.valorMensal || 0),
          statusMix: { [l.status]: 1 },
          statusPrincipal: l.status,
          unidades: [l],
        });
      }
    }
    // Ordena por #unidades desc, depois por valor desc
    const arr = Array.from(map.values()).map(g => {
      // statusPrincipal = o status com mais ocorrências
      let max = 0; let principal = g.statusPrincipal;
      for (const [s, n] of Object.entries(g.statusMix)) { if (n > max) { max = n; principal = s; } }
      g.statusPrincipal = principal;
      return g;
    });
    arr.sort((a, b) => b.unidades.length - a.unidades.length || b.valorMensalTotal - a.valorMensalTotal);
    return arr;
  }, [data]);

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [fotos, setFotos] = useState<FotoItem[]>([]);

  const [modalDev, setModalDev] = useState<any>(null);
  const [devFotos, setDevFotos] = useState<FotoItem[]>([]);
  const [devData, setDevData] = useState(new Date().toISOString().slice(0, 10));
  const [devObs, setDevObs] = useState("");

  const [modalCheckin, setModalCheckin] = useState<any>(null);
  const [checkinObs, setCheckinObs] = useState("");

  const [modalEventos, setModalEventos] = useState<any>(null);
  // Rev. 2516 — editor inline de OBRA dentro do modal de GRUPO. Permite
  // vincular/trocar/desvincular a obra de todas as unidades do grupo de
  // uma vez (pedido user: "quando clicar na edição quer poder editar e
  // indicar a obra que ele ta cadastrada").
  const [editandoObraGrupo, setEditandoObraGrupo] = useState(false);
  const [novaObraGrupo, setNovaObraGrupo] = useState<string>(""); // "" | "__null__" | "<id>"
  // Rev. 2518 — renomear locadora (fornecedor) em lote. Pedido user:
  // "quero poder trocar o nome do fornecedor, quando tiver cadastro errado".
  const [renomearForn, setRenomearForn] = useState<null | { nomeAtual: string; count: number; valorMes: number; nomeNovo: string }>(null);
  const renomearFornMut = trpc.equipamentos.locadosRenomearFornecedor.useMutation({
    onSuccess: (r: any) => {
      // Mensagem usa a contagem REAL retornada pelo servidor (pode diferir
      // do preview do modal, pois o servidor escopa por obra autorizada).
      // Mostra almoxAtualizados quando > 0 pra transparência da sync.
      if (r.semMudanca) toast.success("Nome inalterado.");
      else if (r.atualizados === 0) toast("Nenhuma unidade renomeada (sem acesso ou sem match).");
      else toast.success(
        `Locadora renomeada em ${r.atualizados} unidade(s)` +
        (r.almoxAtualizados > 0 ? ` + ${r.almoxAtualizados} item(ns) no almox.` : "."),
      );
      utils.equipamentos.locadosListar.invalidate();
      if (renomearForn) setFiltroFornecedor(renomearForn.nomeNovo.trim().toUpperCase());
      setRenomearForn(null);
    },
    onError: (e) => toast.error(formatTrpcError(e)),
  });
  // Rev. 2553 — trocar o fornecedor (locadora) de UMA unidade, direto no
  // painel de detalhes. Pedido user: "não consigo trocar o fornecedor — o
  // martelete é da Minas Locc mas está marcado como nosso". Diferente do
  // rename em lote, atinge só o item aberto.
  const [editForn, setEditForn] = useState<null | { id: number; val: string }>(null);
  const atualizarLocadoMut = trpc.equipamentos.locadoAtualizar.useMutation({
    onSuccess: (_data, variables: any) => {
      utils.equipamentos.locadosListar.invalidate();
      const novo = variables.fornecedorNome ?? null;
      setModalEventos((prev: any) =>
        prev && prev.id === variables.id ? { ...prev, fornecedorNome: novo } : prev);
      setEditForn(null);
      toast.success("Fornecedor atualizado.");
    },
    onError: (e) => toast.error(formatTrpcError(e)),
  });
  const eventos = trpc.equipamentos.eventosListar.useQuery(
    { companyId, equipamentoLocadoId: modalEventos?.id || 0 },
    { enabled: !!modalEventos }
  );

  // Rev. 2460 — Desfazer devolução (senha + motivo, padrão auditoria almox).
  const [modalDesfazerDev, setModalDesfazerDev] = useState<any>(null); // recebe `l` (equipamento)
  const [desfazerErro, setDesfazerErro] = useState<string | null>(null);
  const meQ = trpc.auth.me.useQuery();
  const auditCfgQ = trpc.compras.getAuditoriaConfig.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const requerSenhaAud = !!(meQ.data as any)?.hasLocalPassword && (auditCfgQ.data?.exigeSenha ?? true);
  const requerJustAud = auditCfgQ.data?.exigeJustificativa ?? true;

  // Rev. 2323 — Obras ativas (pra mostrar nome no card + dropdown de vínculo em lote).
  const obrasAtivasQ = trpc.obras.listActive.useQuery({ companyId }, { enabled: !!companyId });
  const obrasMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of (obrasAtivasQ.data || []) as any[]) m.set(Number(o.id), String(o.nome || `Obra #${o.id}`));
    return m;
  }, [obrasAtivasQ.data]);

  // Rev. 2323 — Multi-seleção (vincular obra em lote + excluir em lote).
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [obraParaVincular, setObraParaVincular] = useState<string>("");
  const toggleSelecionado = (id: number) => {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const todosVisiveisSelecionados = useMemo(
    () => (data as any[]).length > 0 && (data as any[]).every(l => selecionados.has(l.id)),
    [data, selecionados]
  );
  const toggleTodosVisiveis = () => {
    setSelecionados(prev => {
      if (todosVisiveisSelecionados) {
        const n = new Set(prev);
        for (const l of data as any[]) n.delete(l.id);
        return n;
      }
      const n = new Set(prev);
      for (const l of data as any[]) n.add(l.id);
      return n;
    });
  };
  // Rev. 2325/2328 — chunking client-side.
  // - Rev. 2325 começou com CHUNK=500 (= limite do servidor) — mas 500 deletes
  //   em transação única no Neon + insert de eventos demora 30-60s e ATINGE o
  //   timeout de 60s do proxy do Replit (mesmo problema do PDF, Rev. 2321).
  //   No iPad o user via "Lote 1 de 3 · 0 de 1.218 processados" parado por
  //   quase 1 min → screenshot "Travou?".
  // - Rev. 2328: chunk reduzido pra 200 (paliativo de UX — só dava
  //   feedback, não atacava a raiz).
  // - Rev. 2329: server bulkificado (UPDATE/DELETE/INSERT WHERE IN
  //   + multi-values, 2 round-trips por chunk em vez de 2N). Com
  //   cada call rodando <2s, voltamos CHUNK pra 500 — 1218 itens
  //   viram 3 lotes de poucos segundos cada (antes 7 lotes de 15s).
  const CHUNK = 500;
  const vincularLote = trpc.equipamentos.locadosVincularObraLote.useMutation();
  const excluirLote  = trpc.equipamentos.locadosExcluirLote.useMutation();

  // Estados pra modais (substituem window.confirm + toast invisível no iPad)
  const [confirmExcluir, setConfirmExcluir] = useState<number | null>(null); // total a excluir
  const [loteProgresso, setLoteProgresso] = useState<{ acao: "vincular" | "excluir"; feitos: number; total: number; chunks: number; chunkAtual: number; loteIniciadoEm: number } | null>(null);
  // Rev. 2328 — tick por segundo pra mostrar tempo decorrido do lote atual
  // (sem isso a UI parece travada durante os ~15s que cada chunk leva no Neon).
  const [tickNow, setTickNow] = useState(Date.now());
  useEffect(() => {
    if (!loteProgresso) return;
    const id = setInterval(() => setTickNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [loteProgresso]);
  const [loteErro, setLoteErro] = useState<string | null>(null);

  // Rev. 2326 — Auto-match de "Local da obra" do PDF com obras ativas.
  // Normaliza ambos os lados (sem acento, lowercase, sem pontuação, tokens
  // de 4+ chars) e exige >=2 tokens significativos em comum. Score = qtd de
  // tokens da PDF presentes em (nome + endereco + cidade) da obra.
  const STOP_TOKENS = new Set(["rua","avenida","alameda","travessa","praca","estrada","rodovia","jardim","bairro","jd","av","rod","sao","santa","santo","dos","das","de","do","da","sp","obra","loteamento","numero","apto","apartamento","casa","quadra","lote","hotel"]);
  function normalize(s: string): string {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/n[º°]\s*\d+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function tokenize(s: string): string[] {
    return normalize(s).split(" ").filter(t => t.length >= 4 && !STOP_TOKENS.has(t));
  }
  function matchObra(localObra: string, obrasList: any[]): { obraId: number; score: number; tokensMatch: number; tokensTotal: number } | null {
    const tokens = tokenize(localObra);
    if (tokens.length === 0) return null;
    let best: { obraId: number; score: number; tokensMatch: number; tokensTotal: number } | null = null;
    for (const o of obrasList) {
      const alvo = normalize([o.nome, o.endereco, o.cidade].filter(Boolean).join(" "));
      if (!alvo) continue;
      const alvoTokens = new Set(alvo.split(" ").filter(Boolean));
      let match = 0;
      for (const t of tokens) if (alvoTokens.has(t)) match++;
      const score = match / tokens.length;
      if (match >= 2 && (!best || match > best.tokensMatch || (match === best.tokensMatch && score > best.score))) {
        best = { obraId: Number(o.id), score, tokensMatch: match, tokensTotal: tokens.length };
      }
    }
    return best;
  }

  function chunkIds(arr: number[], size: number): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
  function formatTrpcError(e: any): string {
    try {
      const parsed = JSON.parse(e.message);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 5).map((it: any) => `• ${(it.path || []).join('.')}: ${it.message}`).join('\n');
      }
    } catch {}
    return String(e?.message || "Erro desconhecido");
  }

  async function confirmarVincular() {
    if (selecionados.size === 0) return;
    const obraId = obraParaVincular === "__null__" ? null : (parseInt(obraParaVincular) || null);
    if (obraId === null && obraParaVincular !== "__null__") { setLoteErro("Selecione uma obra."); return; }
    const ids = Array.from(selecionados);
    const chunks = chunkIds(ids, CHUNK);
    setLoteProgresso({ acao: "vincular", feitos: 0, total: ids.length, chunks: chunks.length, chunkAtual: 0, loteIniciadoEm: Date.now() });
    let vinculados = 0;
    try {
      for (let i = 0; i < chunks.length; i++) {
        setLoteProgresso({ acao: "vincular", feitos: vinculados, total: ids.length, chunks: chunks.length, chunkAtual: i + 1, loteIniciadoEm: Date.now() });
        const res = await vincularLote.mutateAsync({ companyId, ids: chunks[i], obraId });
        vinculados += Number((res as any)?.vinculados || chunks[i].length);
      }
      setLoteProgresso(null);
      utils.equipamentos.locadosListar.invalidate();
      toast.success(`${vinculados} equipamento(s) vinculado(s).`);
      setSelecionados(new Set()); setObraParaVincular("");
    } catch (e: any) {
      setLoteProgresso(null);
      setLoteErro(`Falhou após vincular ${vinculados} de ${ids.length}.\n\n${formatTrpcError(e)}`);
      utils.equipamentos.locadosListar.invalidate();
    }
  }
  function confirmarExcluir() {
    if (selecionados.size === 0) return;
    setConfirmExcluir(selecionados.size); // abre modal bonito (em vez de window.confirm)
  }
  async function executarExcluir() {
    setConfirmExcluir(null);
    const ids = Array.from(selecionados);
    const chunks = chunkIds(ids, CHUNK);
    setLoteProgresso({ acao: "excluir", feitos: 0, total: ids.length, chunks: chunks.length, chunkAtual: 0, loteIniciadoEm: Date.now() });
    let excluidos = 0;
    try {
      for (let i = 0; i < chunks.length; i++) {
        setLoteProgresso({ acao: "excluir", feitos: excluidos, total: ids.length, chunks: chunks.length, chunkAtual: i + 1, loteIniciadoEm: Date.now() });
        const res = await excluirLote.mutateAsync({ companyId, ids: chunks[i] });
        excluidos += Number((res as any)?.excluidos || chunks[i].length);
      }
      setLoteProgresso(null);
      utils.equipamentos.locadosListar.invalidate();
      toast.success(`${excluidos} equipamento(s) excluído(s).`);
      setSelecionados(new Set());
    } catch (e: any) {
      setLoteProgresso(null);
      setLoteErro(`Falhou após excluir ${excluidos} de ${ids.length}.\n\n${formatTrpcError(e)}`);
      utils.equipamentos.locadosListar.invalidate();
    }
  }

  // Rev. 2374 — Fila de importação vinda do Almoxarifado (?importAlmox=1).
  // Mesmo padrão da Proprios.tsx: o usuário marcou N equipamentos no Almoxarifado,
  // clicou "É ALUGADO" e foi parar aqui. Pré-preenchemos descricao + foto de
  // recebimento (a foto do item do almoxarifado vira a 1ª foto obrigatória).
  // O user ainda precisa preencher fornecedor, datas e ajustar.
  const [importQueue, setImportQueue] = useState<Array<{ nome: string; fotoUrl: string; categoria: string }>>([]);
  const [importTotal, setImportTotal] = useState(0);
  function preencherFormDoItemAlmox(it: { nome: string; fotoUrl: string; categoria: string }) {
    setForm({
      ...EMPTY,
      descricao: it.nome,
      categoria: it.categoria || "",
    });
    setFotos(it.fotoUrl ? [{ url: it.fotoUrl, uploadedAt: new Date().toISOString() }] : []);
    setOcSelecionada(null);
    setModal(true);
  }

  const criar = trpc.equipamentos.locadoCriar.useMutation({
    onSuccess: (res) => {
      utils.equipamentos.locadosListar.invalidate();
      utils.equipamentos.ocsLocacaoPendentes.invalidate(); // Rev. 2371 — OC selecionada some da lista após recebimento
      // Rev. 2374 — fila de importação do Almoxarifado: avança pro próximo item.
      if (importQueue.length > 0) {
        const [next, ...rest] = importQueue;
        setImportQueue(rest);
        setOcSelecionada(null);
        resetRecAssinaturas(); // Rev. 2465
        setTimeout(() => preencherFormDoItemAlmox(next), 200);
        toast.success("Cadastrado! Próximo da fila…");
      } else {
        setModal(false); setForm({ ...EMPTY }); setFotos([]); setOcSelecionada(null);
        resetRecAssinaturas(); // Rev. 2465
        if (importTotal > 0) {
          toast.success(`${importTotal} equipamento${importTotal !== 1 ? "s" : ""} locado${importTotal !== 1 ? "s" : ""} importado${importTotal !== 1 ? "s" : ""} do Almoxarifado.`);
          setImportTotal(0);
        } else {
          toast.success("Equipamento locado cadastrado!");
        }
        // Rev. 2465 — comprovante PDF assinado (só quando o user passou pela
        // etapa 2 e capturou assinaturas). Abre modal de compartilhamento.
        if ((res as any)?.comprovante) {
          const c = (res as any).comprovante;
          const url = `${window.location.origin}/api/comprovante-recebimento/${c.eventoId}/${c.token}.pdf`;
          setModalShareComprovante({ url, qtd: 1, tipo: "recebimento" });
        }
      }
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2371 — OCs de locação aguardando recebimento (modal "Receber Locação na Obra").
  const ocsPendentesQ = trpc.equipamentos.ocsLocacaoPendentes.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const [ocSelecionada, setOcSelecionada] = useState<{ id: number; numeroOc: string } | null>(null);
  // Rev. 2372 — Picker visual de devolução (cards grandes com foto). Aberto
  // pelo botão "DEVOLVER LOCAÇÃO" do Almoxarifado (?action=devolver) ou pelo
  // botão hero da própria página. Operador clica no card → abre direto o
  // modalDev (fluxo de devolução já existente).
  const [pickerDevolver, setPickerDevolver] = useState(false);
  const [pickerDevolverBusca, setPickerDevolverBusca] = useState("");
  // Rev. 2449 — quando o picker é aberto via `?action=devolver` do botão
  // "DEVOLVER LOCAÇÃO" do Almoxarifado, o user espera VOLTAR pro Almox
  // ao concluir/fechar (não ficar parado em /equipamentos/locados que ele
  // nem sabe que existe). Esta flag é setada no useEffect do action=devolver
  // e consumida pelo helper `voltarParaAlmoxSeNecessario()` em todos os
  // pontos de fechamento (X do picker, Cancelar, devolução single ok,
  // devolução em lote ok, fechar modalDev sem salvar).
  const [returnToAlmoxAfterClose, setReturnToAlmoxAfterClose] = useState(false);
  // Rev. 2455 — guarda o obraId de origem (vem do `?obraId=X` do botão
  // DEVOLVER LOCAÇÃO do Almox) pra devolver pra MESMA obra no contexto
  // do Almoxarifado ao concluir, em vez de pular pro Central.
  const [returnToAlmoxObraId, setReturnToAlmoxObraId] = useState<number | null>(null);
  const [, navegar] = useLocation();
  // Rev. 2420 — multi-seleção dentro do picker. Set<id> dos equipamentos
  // marcados pra devolução em lote. Tap no card alterna; botão "DEVOLVER
  // ESTE" do footer do card preserva o fluxo "1 toque, modalDev direto".
  const [selecionadosLote, setSelecionadosLote] = useState<Set<number>>(new Set());
  const [modalDevLote, setModalDevLote] = useState<any[] | null>(null);
  const [devLoteData, setDevLoteData] = useState<string>(new Date().toISOString().slice(0, 10));
  const [devLoteFotos, setDevLoteFotos] = useState<FotoItem[]>([]);
  const [devLoteObs, setDevLoteObs] = useState<string>("");
  // Rev. 2453 — etapas do modal de devolução + assinaturas + nome.
  // Etapa 1: fotos/data/obs. Etapa 2: nomes + assinaturas (entregador + recebedor).
  const [devLoteEtapa, setDevLoteEtapa] = useState<1 | 2>(1);
  const [devLoteEntNome, setDevLoteEntNome] = useState<string>("");
  const [devLoteEntSig,  setDevLoteEntSig]  = useState<string | null>(null);
  const [devLoteRecNome, setDevLoteRecNome] = useState<string>("");
  const [devLoteRecSig,  setDevLoteRecSig]  = useState<string | null>(null);
  // Rev. 2453 — modal pós-sucesso para compartilhar/baixar/ver o comprovante PDF.
  // Rev. 2465 — `tipo` opcional pra reusar o modal no fluxo de RECEBIMENTO
  // (textos/cores condicionais). Default "devolucao" mantém retrocompat.
  const [modalShareComprovante, setModalShareComprovante] = useState<{ url: string; qtd: number; tipo?: "devolucao" | "recebimento" } | null>(null);
  // Rev. 2465 — Estado das etapas do modal de RECEBIMENTO. Espelha o
  // padrão da devolução (Rev. 2453): Etapa 1 = dados+fotos | Etapa 2 =
  // assinaturas (entregador locadora + recebedor FC). Sigs são opcionais
  // (skip etapa 2 não é permitido na UI normal mas backend aceita).
  const [recEtapa,    setRecEtapa]    = useState<1 | 2>(1);
  const [recEntNome,  setRecEntNome]  = useState<string>(""); // locadora
  const [recEntSig,   setRecEntSig]   = useState<string | null>(null);
  const [recRecNome,  setRecRecNome]  = useState<string>(""); // FC (operador)
  const [recRecSig,   setRecRecSig]   = useState<string | null>(null);
  function resetRecAssinaturas() {
    setRecEtapa(1);
    setRecEntNome(""); setRecEntSig(null);
    setRecRecNome(""); setRecRecSig(null);
  }
  const devolver = trpc.equipamentos.locadoDevolver.useMutation({
    onSuccess: () => {
      utils.equipamentos.locadosListar.invalidate();
      setModalDev(null); setDevFotos([]);
      toast.success("Equipamento devolvido.");
      voltarParaAlmoxSeNecessario(); // Rev. 2449
    },
    onError: (e) => toast.error(e.message),
  });
  const devolverLote = trpc.equipamentos.locadoDevolverEmLote.useMutation({
    onSuccess: (res) => {
      utils.equipamentos.locadosListar.invalidate();
      setModalDevLote(null);
      setDevLoteFotos([]);
      setDevLoteObs("");
      setDevLoteEtapa(1);
      setDevLoteEntNome(""); setDevLoteEntSig(null);
      setDevLoteRecNome(""); setDevLoteRecSig(null);
      setSelecionadosLote(new Set());
      setPickerDevolver(false);
      if (res.falhas.length === 0) {
        toast.success(`${res.ok.length} equipamento(s) devolvido(s).`);
      } else {
        toast.warning(`${res.ok.length} devolvido(s) · ${res.falhas.length} falha(s): ${res.falhas.slice(0, 3).map(f => `#${f.id} (${f.erro})`).join(", ")}${res.falhas.length > 3 ? "…" : ""}`);
      }
      // Rev. 2453 — se assinou, abre modal de compartilhamento ANTES de
      // voltar pro almoxarifado. Caso contrário, segue fluxo legado.
      if (res.comprovante) {
        const url = `${window.location.origin}/api/comprovante-devolucao/${res.comprovante.eventoId}/${res.comprovante.token}.pdf`;
        setModalShareComprovante({ url, qtd: res.ok.length });
      } else {
        voltarParaAlmoxSeNecessario(); // Rev. 2449
      }
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2460 — Mutation pra desfazer devolução.
  const desfazerDev = trpc.equipamentos.locadoDesfazerDevolucao.useMutation({
    onSuccess: () => {
      utils.equipamentos.locadosListar.invalidate();
      utils.equipamentos.eventosListar.invalidate();
      setModalDesfazerDev(null);
      setDesfazerErro(null);
      setModalEventos(null);
      toast.success("Devolução desfeita. Equipamento voltou para 'Em uso'.");
    },
    onError: (e) => setDesfazerErro(e.message),
  });

  // Rev. 2449 — helper compartilhado. Quando aberto via Almoxarifado
  // (?action=devolver), retorna pra /almoxarifado ao concluir/fechar.
  // Caso contrário, fica na própria página de Locados (fluxo legado).
  function voltarParaAlmoxSeNecessario() {
    if (returnToAlmoxAfterClose) {
      setReturnToAlmoxAfterClose(false);
      // Rev. 2455 — preserva o contexto da obra ao voltar pro Almox.
      // O Almox lê `?obra=X` (L1515-1524) e seta obraContexto =X.
      const dest = returnToAlmoxObraId
        ? `/almoxarifado?obra=${returnToAlmoxObraId}`
        : "/almoxarifado";
      setReturnToAlmoxObraId(null);
      navegar(dest);
    }
  }
  const checkIn = trpc.equipamentos.locadoCheckIn.useMutation({
    onSuccess: () => { utils.equipamentos.locadosListar.invalidate(); setModalCheckin(null); setCheckinObs(""); toast.success("Check-in registrado."); },
    onError: (e) => toast.error(e.message),
  });

  // Rev. 2308 — Importação em lote via PDF da locadora (Gemini Vision)
  const [modalImport, setModalImport] = useState(false);
  const [importArquivo, setImportArquivo] = useState<{ nome: string; mimeType: string; base64: string } | null>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [importProgresso, setImportProgresso] = useState(0); // Rev. 2310 — barra 0-100% animada
  const importFileRef = useRef<HTMLInputElement>(null);
  // Rev. 2407 — Multi-PDF: processa N arquivos da MESMA empresa em série,
  // acumulando contratos no mesmo preview. Refs pra escapar do closure
  // stale do useEffect de polling.
  const [importFilas, setImportFilas] = useState<Array<{ file: File }>>([]);
  const [importTotalFiles, setImportTotalFiles] = useState(0); // total da batch
  const [importFileIdx, setImportFileIdx] = useState(0); // 1-based índice atual
  const importFilasRef = useRef<Array<{ file: File }>>([]);
  useEffect(() => { importFilasRef.current = importFilas; }, [importFilas]);
  // Rev. 2358 — Fornecedor padrão do PDF: o cabeçalho do F051/R051 traz
  // o nome do LOCATÁRIO (ex: "6716-FC ENGENHARIA..."), não o da LOCADORA
  // (ex: JALVES). O parser muitas vezes confunde os 2. User indica aqui o
  // nome real do fornecedor do PDF inteiro → "Aplicar a todos" propaga.
  const [importFornecedorPadrao, setImportFornecedorPadrao] = useState("");
  const fornecedoresCadastradosQ = trpc.compras.listarFornecedores.useQuery(
    { companyId, ativo: true },
    { enabled: !!companyId }
  );

  // Rev. 2321 — Polling em vez de single mutation (proxy Replit matava em 60s).
  // Fluxo: Start retorna {jobId} em ms → polling /Status cada 2.5s → done|error.
  const [parsePending, setParsePending] = useState(false);
  const [parseJobId, setParseJobId] = useState<string | null>(null);
  // Rev. 2359 — diagnóstico do parse em tempo real (fase reportada pelo server
  // + nº de polls + timestamp do último). Combate a percepção de "travado em
  // 99%" — agora o user vê "Chamando IA · há 42s" em vez de barra estática.
  const [parseDiag, setParseDiag] = useState<{ phase: string; phaseElapsedMs: number; elapsedMs: number; pollCount: number; lastPollAt: number } | null>(null);
  const parsearStart = trpc.equipamentos.parsearContratoLocacaoPdfStart.useMutation({
    onSuccess: ({ jobId }) => { setParseJobId(jobId); },
    onError: (e) => {
      setParsePending(false); setImportProgresso(0); setParseDiag(null);
      toast.error(`${importArquivo?.nome || "PDF"}: ${e.message}`);
      // Rev. 2407 — Start falhou: não trava a fila, avança pro próximo.
      const fila = importFilasRef.current;
      if (fila.length > 0) {
        const next = fila[0];
        setImportFilas(fila.slice(1));
        setImportFileIdx(idx => idx + 1);
        setTimeout(() => { void processarArquivoPdf(next.file); }, 50);
      } else { setImportTotalFiles(0); setImportFileIdx(0); }
    },
  });
  useEffect(() => {
    if (!parseJobId) return;
    let cancelled = false;
    let polls = 0;
    const poll = async () => {
      try {
        const res = await utils.equipamentos.parsearContratoLocacaoPdfStatus.fetch({ jobId: parseJobId });
        if (cancelled) return;
        polls++;
        // Rev. 2359 — atualiza diag (server sempre devolve elapsedMs/phase agora).
        if ((res as any).elapsedMs != null) {
          setParseDiag({
            phase: (res as any).phase || "queued",
            phaseElapsedMs: (res as any).phaseElapsedMs || 0,
            elapsedMs: (res as any).elapsedMs || 0,
            pollCount: polls,
            lastPollAt: Date.now(),
          });
        }
        if (res.status === "done" && res.result) {
          setImportProgresso(100);
          // Rev. 2326 — auto-match com obras ativas pelo endereço/nome.
          const obrasList = (obrasAtivasQ.data || []) as any[];
          let autoMatched = 0;
          const comMatch = (res.result.contratos as any[]).map(c => {
            const m = matchObra(c.localObra || "", obrasList);
            if (m) { autoMatched++; return { ...c, obraId: m.obraId, obraMatchAuto: true, obraMatchScore: m.score }; }
            return { ...c, obraId: undefined, obraMatchAuto: false };
          });
          // Rev. 2407 — acumula no preview existente (multi-PDF da mesma empresa).
          setImportPreview(prev => prev ? [...prev, ...comMatch] : comMatch);
          const tot = res.result.totalContratos;
          toast.success(`IA detectou ${tot} contrato(s) · ${res.result.totalItens} item(ns).${autoMatched > 0 ? ` ${autoMatched}/${tot} auto-vinculados à obra.` : ""}`);
          setParsePending(false); setParseJobId(null); setParseDiag(null);
          // Rev. 2407 — avança pro próximo PDF da fila (multi-upload).
          const fila = importFilasRef.current;
          if (fila.length > 0) {
            const next = fila[0];
            setImportFilas(fila.slice(1));
            setImportFileIdx(idx => idx + 1);
            setTimeout(() => { void processarArquivoPdf(next.file); }, 50);
          } else {
            setImportTotalFiles(0);
            setImportFileIdx(0);
          }
        } else if (res.status === "error") {
          toast.error(`${importArquivo?.nome || "PDF"}: ${res.error || "Falha ao processar o PDF."}`);
          setParsePending(false); setImportProgresso(0); setParseJobId(null); setParseDiag(null);
          // Rev. 2407 — não trava a fila: pula pro próximo PDF.
          const fila = importFilasRef.current;
          if (fila.length > 0) {
            const next = fila[0];
            setImportFilas(fila.slice(1));
            setImportFileIdx(idx => idx + 1);
            setTimeout(() => { void processarArquivoPdf(next.file); }, 50);
          } else { setImportTotalFiles(0); setImportFileIdx(0); }
        } else if (res.status === "expired") {
          toast.error("Job expirou. Tente novamente.");
          setParsePending(false); setImportProgresso(0); setParseJobId(null); setParseDiag(null);
          const fila = importFilasRef.current;
          if (fila.length > 0) {
            const next = fila[0];
            setImportFilas(fila.slice(1));
            setImportFileIdx(idx => idx + 1);
            setTimeout(() => { void processarArquivoPdf(next.file); }, 50);
          } else { setImportTotalFiles(0); setImportFileIdx(0); }
        } else {
          setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 5000); // retry transient network
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [parseJobId]);
  // Shim pra preservar o resto do arquivo que lê parsearPdf.isPending.
  const parsearPdf = { isPending: parsePending };
  const importarLote = trpc.equipamentos.importarContratosLocacaoLote.useMutation({
    onError: (e) => toast.error(e.message),
  });
  // Rev. 2333 — progresso de import em lote (chunks de 10 contratos)
  const [importLoteProgresso, setImportLoteProgresso] = useState<{ lote: number; totalLotes: number; contratosFeitos: number; itensFeitos: number; total: number; totalItens: number } | null>(null);

  function abrirImportar() {
    setImportArquivo(null);
    setImportPreview(null);
    setImportFornecedorPadrao(""); // Rev. 2358
    // Rev. 2407 — limpa fila multi-PDF
    setImportFilas([]);
    setImportTotalFiles(0);
    setImportFileIdx(0);
    setModalImport(true);
  }
  // Rev. 2358 — Aplica o fornecedor padrão a TODOS os contratos do preview.
  function aplicarFornecedorPadraoATodos() {
    const nome = importFornecedorPadrao.trim();
    if (!nome) { toast.error("Digite o nome do fornecedor primeiro."); return; }
    setImportPreview(prev => prev ? prev.map(c => ({ ...c, fornecedorNome: nome })) : prev);
    toast.success(`Fornecedor "${nome}" aplicado a todos os contratos.`);
  }
  // Rev. 2407 — processa 1 arquivo (chamado pelo loop multi-PDF e pelo single).
  // NÃO mexe em importPreview (o poll done já acumula).
  async function processarArquivoPdf(file: File) {
    if (file.size > 15 * 1024 * 1024) { toast.error(`${file.name}: > 15MB. Pule esse.`); return; }
    const okMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!okMimes.includes(file.type)) { toast.error(`${file.name}: formato não suportado.`); return; }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    setImportArquivo({ nome: file.name, mimeType: file.type, base64 });
    setImportProgresso(0);
    setParsePending(true);
    parsearStart.mutate({ companyId, pdfBase64: base64, mimeType: file.type as any, nomeArquivo: file.name });
  }
  // Rev. 2407 — entrypoint multi-PDF. Aceita 1..N arquivos da mesma empresa.
  // `append=true` (vindo do botão "+ Adicionar PDFs"): NÃO zera preview e
  // estende a fila atual em vez de criar uma nova batch. `append=false`
  // (drop/select inicial): novo batch, zera preview.
  async function handlePdfPickMultiple(files: File[], opts?: { append?: boolean }) {
    if (!files.length) return;
    const append = !!opts?.append;
    const okMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const validos = files.filter(f => {
      if (f.size > 15 * 1024 * 1024) { toast.error(`${f.name}: > 15MB, ignorado.`); return false; }
      if (!okMimes.includes(f.type)) { toast.error(`${f.name}: formato não suportado, ignorado.`); return false; }
      return true;
    });
    if (!validos.length) return;

    if (append) {
      // Append: empilha na fila e atualiza total. Se um parse já está rodando
      // OU se ainda há PDFs na fila, NÃO dispara aqui — o poll done/error
      // continuará processando automaticamente. Se nada está rodando, dispara
      // o 1º novo arquivo.
      const filaAtual = importFilasRef.current;
      const novosNaFila = [...filaAtual, ...validos.map(f => ({ file: f }))];
      setImportTotalFiles(t => t + validos.length);
      if (parsePending || filaAtual.length > 0) {
        setImportFilas(novosNaFila);
        toast.info(`+${validos.length} PDF${validos.length !== 1 ? "s" : ""} na fila.`);
      } else {
        // Nada rodando: pega o 1º novo e enfileira o resto.
        setImportFilas(novosNaFila.slice(1));
        setImportFileIdx(idx => idx + 1);
        await processarArquivoPdf(novosNaFila[0].file);
      }
      return;
    }

    // Novo batch
    setImportPreview(null);
    setImportTotalFiles(validos.length);
    setImportFileIdx(1);
    setImportFilas(validos.slice(1).map(f => ({ file: f })));
    if (validos.length > 1) toast.info(`${validos.length} PDFs na fila — processando 1 de cada vez.`);
    await processarArquivoPdf(validos[0]);
  }
  // Shim retrocompatível (Rev. 2374 e drop-zone single ainda chamam).
  async function handlePdfPick(file: File) {
    return handlePdfPickMultiple([file]);
  }

  // Rev. 2311 — auto-abrir modal quando vier do Almoxarifado com ?action=receber|devolver.
  // Lê window.location.search 1× e remove o param pra não reabrir em navegações internas.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) return;
    if (action === "receber") {
      setForm({ ...EMPTY });
      setFotos([]);
      setOcSelecionada(null); // Rev. 2371
      setModal(true);
    } else if (action === "devolver") {
      // Rev. 2372 — em vez de só filtrar+toast (operador de 4ª série não
      // entendia que tinha que rolar a tabela e achar o botão "Devolver"
      // na linha), abre direto o picker visual com cards grandes.
      // Rev. 2449 — marca pra VOLTAR pro Almox ao fechar/concluir.
      setFiltroStatus("em_uso");
      setPickerDevolver(true);
      setReturnToAlmoxAfterClose(true);
      // Rev. 2452 — respeita o almoxarifado/obra de origem: se veio com
      // `&obraId=X` do botão DEVOLVER LOCAÇÃO do Almox, pré-filtra o picker
      // por essa obra pra evitar devolver equipamento da obra errada.
      const obraIdParam = params.get("obraId");
      if (obraIdParam && /^\d+$/.test(obraIdParam)) {
        setFiltroObra(obraIdParam);
        setReturnToAlmoxObraId(Number(obraIdParam)); // Rev. 2455
      }
    } else if (action === "importar") {
      // Rev. 2313 — vem do botão "IMPORTAR PDF (IA)" do Almoxarifado.
      setImportArquivo(null);
      setImportPreview(null);
      setModalImport(true);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("action");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Rev. 2374 — Fila de importação do Almoxarifado (?importAlmox=1). O usuário
  // marcou N equipamentos no Almoxarifado, clicou "É ALUGADO" e foi parar aqui.
  // Pré-preenchemos descricao + categoria + foto de recebimento do 1º item e
  // avançamos pra cada save (criar.onSuccess).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!companyId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("importAlmox") !== "1") return;
    try {
      const raw = sessionStorage.getItem("fc:importAlmoxEquip:queue");
      const tipo = sessionStorage.getItem("fc:importAlmoxEquip:tipo");
      if (!raw || tipo !== "alugado") return;
      const payload = JSON.parse(raw) as { companyId: number; itens: Array<{ nome: string; fotoUrl: string; categoria: string }> };
      const arr = payload?.itens;
      // Rev. 2374 — rejeita se a empresa atual ≠ empresa de origem (anti-contaminação).
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
      preencherFormDoItemAlmox(arr[0]);
      toast.info(`${arr.length} equipamento${arr.length !== 1 ? "s" : ""} pra cadastrar como ALUGADO. Preencha fornecedor + datas e salve cada um.`);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Rev. 2310/2318 — anima barra durante o parse (Gemini não retorna progresso real).
  // FASE 1 (0→95%): ease-out em ~35s (curva quadrática inversa).
  // FASE 2 (95→99%): creep lentíssimo (+1% a cada ~15s) pra evitar sensação de travado em PDFs grandes.
  // onSuccess força 100%; onError reseta pra 0.
  useEffect(() => {
    if (!parsearPdf.isPending) return;
    setImportProgresso(0);
    const inicio = Date.now();
    const duracaoEstimada = 35_000;
    const id = setInterval(() => {
      const decorrido = Date.now() - inicio;
      let pct: number;
      if (decorrido < duracaoEstimada) {
        const t = decorrido / duracaoEstimada;
        pct = Math.round(95 * (1 - Math.pow(1 - t, 2)));
      } else {
        // Creep 95→99 ao longo dos próximos 60s; trava em 99 (100 só no onSuccess).
        const extra = decorrido - duracaoEstimada;
        pct = Math.min(99, 95 + Math.floor(extra / 15_000));
      }
      setImportProgresso(pct);
    }, 250);
    return () => clearInterval(id);
  }, [parsearPdf.isPending]);

  // Rev. 2318 — após 30s mostra dica "PDF extenso, aguarde…" embaixo da barra.
  const [importDemorando, setImportDemorando] = useState(false);
  useEffect(() => {
    if (!parsearPdf.isPending) { setImportDemorando(false); return; }
    const t = setTimeout(() => setImportDemorando(true), 30_000);
    return () => clearTimeout(t);
  }, [parsearPdf.isPending]);
  // Rev. 2322 — diagnóstico granular: separa motivos de rejeição (sem nº/datas/itens/data inválida)
  // e mostra um diálogo claro em vez de toast genérico (iOS Safari escondia o erro).
  // Também normaliza datas DD/MM/AAAA→ISO defensivamente (server já faz no parse, mas se user
  // tiver editado o campo no preview ou voltado ao estado raw, garante regex /^\d{4}-\d{2}-\d{2}$/).
  const [importErroDetalhe, setImportErroDetalhe] = useState<string | null>(null);
  const toIsoDate = (s: any): string => {
    if (!s) return "";
    const str = String(s).trim();
    const m1 = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
    const m2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    return "";
  };
  function confirmarImport() {
    if (!importPreview || importPreview.length === 0) return;
    if (!companyId) { setImportErroDetalhe("Empresa não selecionada. Selecione uma empresa antes de cadastrar."); return; }
    // Rev. 2353 — bloqueio: não permite importar com contrato sem obra
    // vinculada (regra do user: "Não pode ter equipamento sem obra vinculada").
    // Cruzamento automático (Rev. 2326) já sugere; o que sobrar precisa de
    // seleção manual no select "Obra ERP" de cada cartão antes de prosseguir.
    const semObra = importPreview.filter((c: any) => !c.obraId);
    if (semObra.length > 0) {
      const nums = semObra.slice(0, 8).map((c: any) => c.numeroContrato || "(sem nº)").join(", ");
      const extra = semObra.length > 8 ? ` (+${semObra.length - 8} outros)` : "";
      setImportErroDetalhe(
        `${semObra.length} contrato(s) sem obra vinculada.\n\n` +
        `Não é possível cadastrar equipamento sem obra. Use o select "Obra ERP" em cada cartão pra escolher a obra correta antes de confirmar.\n\n` +
        `Contratos pendentes: ${nums}${extra}.`
      );
      return;
    }
    // Rev. 2413 — bloqueio: fornecedor (locadora) obrigatório.
    // Sem isso o ERP cadastra item órfão de locadora e quebra a rastreabilidade
    // (filtro por fornecedor da Rev. 2408, agregados financeiros etc).
    const semForn = importPreview.filter((c: any) => !c.fornecedorNome || !String(c.fornecedorNome).trim());
    if (semForn.length > 0) {
      const nums = semForn.slice(0, 8).map((c: any) => c.numeroContrato || "(sem nº)").join(", ");
      const extra = semForn.length > 8 ? ` (+${semForn.length - 8} outros)` : "";
      setImportErroDetalhe(
        `${semForn.length} contrato(s) sem fornecedor (locadora) indicado.\n\n` +
        `Preencha o campo "Fornecedor (locadora) deste PDF" no topo e clique em "Aplicar a todos" antes de cadastrar. Sem isso o ERP cria itens órfãos de locadora e a rastreabilidade fica quebrada.\n\n` +
        `Contratos pendentes: ${nums}${extra}.`
      );
      return;
    }
    let semNumero = 0, semData = 0, semItens = 0, dataInvalida = 0;
    const limpos = importPreview
      .map(c => {
        const ini = toIsoDate(c.periodoInicio);
        const fim = toIsoDate(c.periodoFim);
        const itens = (c.itens || []).map((it: any) => ({
          patrimonio: it.patrimonio ? String(it.patrimonio).slice(0, 100) : undefined,
          descricao: String(it.descricao || "").slice(0, 255).trim(),
          quantidade: Math.max(1, parseInt(String(it.quantidade)) || 1),
          subtotal: Number(it.subtotal) > 0 ? Number(it.subtotal) : undefined,
          // Rev. 2337 — categoria inferida pela IA durante o parse
          categoria: it.categoria ? String(it.categoria).slice(0, 100).trim() : undefined,
        })).filter((it: any) => it.descricao);
        if (!c.numeroContrato || !String(c.numeroContrato).trim()) { semNumero++; return null; }
        if (!c.periodoInicio || !c.periodoFim) { semData++; return null; }
        if (!ini || !fim) { dataInvalida++; return null; }
        if (itens.length === 0) { semItens++; return null; }
        return {
          numeroContrato: String(c.numeroContrato).trim().slice(0, 50),
          fornecedorNome: c.fornecedorNome ? String(c.fornecedorNome).slice(0, 255) : undefined,
          obraId: c.obraId ? Number(c.obraId) : undefined, // Rev. 2326 — auto-match ou seleção manual
          localObra: c.localObra ? String(c.localObra) : undefined,
          periodoInicio: ini,
          periodoFim: fim,
          valorTotal: Number(c.valorTotal) > 0 ? Number(c.valorTotal) : undefined,
          atendenteResponsavel: c.atendenteResponsavel ? String(c.atendenteResponsavel).slice(0, 255) : undefined,
          itens,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    if (limpos.length === 0) {
      const motivos: string[] = [];
      if (semNumero) motivos.push(`${semNumero} sem nº de contrato`);
      if (semData) motivos.push(`${semData} sem datas`);
      if (dataInvalida) motivos.push(`${dataInvalida} com data em formato inválido`);
      if (semItens) motivos.push(`${semItens} sem itens`);
      setImportErroDetalhe(`Nenhum contrato válido para cadastrar.\n\nMotivos: ${motivos.join(", ") || "desconhecido"}.\n\nEdite os campos faltantes no preview e tente de novo.`);
      return;
    }
    // Rev. 2333 — chunking de 10 contratos por chamada (1218 unidades → ~5 lotes
    // de ≤300 unid, cada call <3s no Neon após bulk insert). Evita "Load failed"
    // do iOS Safari (timeout 60s do proxy) que estourava ao mandar tudo de uma vez.
    const totalItens = limpos.reduce((a, c) => a + c.itens.reduce((s, it) => s + (it.quantidade || 1), 0), 0);
    console.log("[importarLote] enviando", { contratos: limpos.length, itens: totalItens, descartados: { semNumero, semData, dataInvalida, semItens } });
    const CHUNK = 10;
    const totalLotes = Math.ceil(limpos.length / CHUNK);
    setImportLoteProgresso({ lote: 0, totalLotes, contratosFeitos: 0, itensFeitos: 0, total: limpos.length, totalItens });
    (async () => {
      let contratosFeitos = 0;
      let itensFeitos = 0;
      try {
        for (let i = 0; i < limpos.length; i += CHUNK) {
          const slice = limpos.slice(i, i + CHUNK);
          const loteNum = Math.floor(i / CHUNK) + 1;
          setImportLoteProgresso(p => p ? { ...p, lote: loteNum } : p);
          const res = await importarLote.mutateAsync({ companyId, nomeArquivo: importArquivo?.nome, contratos: slice });
          contratosFeitos += res.contratosImportados;
          itensFeitos += res.itensImportados;
          setImportLoteProgresso(p => p ? { ...p, contratosFeitos, itensFeitos } : p);
        }
        utils.equipamentos.locadosListar.invalidate();
        toast.success(`${contratosFeitos} contrato(s) e ${itensFeitos} item(ns) cadastrados.`);
        setModalImport(false); setImportArquivo(null); setImportPreview(null);
        setImportLoteProgresso(null);
      } catch (err: any) {
        console.error("[importarLote] erro", err);
        let msg = err?.message || "Erro desconhecido.";
        try {
          const parsed = JSON.parse(msg);
          if (Array.isArray(parsed)) {
            msg = parsed.slice(0, 5).map((e: any) => `• ${e.path?.join(".") || "?"}: ${e.message}`).join("\n");
          }
        } catch { /* msg é string simples */ }
        setImportErroDetalhe(`Erro ao cadastrar (após ${contratosFeitos}/${limpos.length} contratos):\n\n${msg}`);
        setImportLoteProgresso(null);
        if (contratosFeitos > 0) utils.equipamentos.locadosListar.invalidate();
      }
    })();
  }
  function removerContratoPreview(idx: number) {
    setImportPreview(prev => prev ? prev.filter((_, i) => i !== idx) : prev);
  }
  function removerItemPreview(ci: number, ii: number) {
    setImportPreview(prev => prev ? prev.map((c, i) => i === ci ? { ...c, itens: c.itens.filter((_: any, j: number) => j !== ii) } : c) : prev);
  }
  function updateContratoField(ci: number, field: string, value: any) {
    setImportPreview(prev => prev ? prev.map((c, i) => i === ci ? { ...c, [field]: value } : c) : prev);
  }
  function updateItemField(ci: number, ii: number, field: string, value: any) {
    setImportPreview(prev => prev ? prev.map((c, i) => i === ci ? {
      ...c, itens: c.itens.map((it: any, j: number) => j === ii ? { ...it, [field]: value } : it)
    } : c) : prev);
  }

  function salvar() {
    // Rev. 2465 — Etapa 1 valida dados+fotos e avança pra etapa 2 (assinaturas).
    // Importação em lote (importQueue) pula a etapa 2 — fluxo legado preservado.
    const noFluxoImport = importQueue.length > 0 || importTotal > 0;
    if (!form.descricao.trim()) return toast.error("Descrição é obrigatória.");
    if (!form.dataFimPrevista) return toast.error("Data fim prevista é obrigatória.");
    if (fotos.length === 0) return toast.error("Foto de recebimento é obrigatória.");
    if (!noFluxoImport && recEtapa === 1) {
      // Autofill o recebedor FC com o user logado ao entrar na etapa 2.
      if (!recRecNome.trim()) setRecRecNome((meAuth as any)?.name || "");
      setRecEtapa(2);
      return;
    }
    // Rev. 2465 — Etapa 2 (ou fluxo legado): valida sigs quando aplicável.
    if (!noFluxoImport) {
      if (!recEntNome.trim()) return toast.error("Nome do entregador (locadora) é obrigatório.");
      if (!recEntSig)         return toast.error("Assinatura do entregador é obrigatória.");
      if (!recRecNome.trim()) return toast.error("Nome do recebedor (FC) é obrigatório.");
      if (!recRecSig)         return toast.error("Assinatura do recebedor é obrigatória.");
    }
    criar.mutate({
      companyId,
      descricao: form.descricao,
      categoria: form.categoria || undefined,
      fornecedorNome: form.fornecedorNome || undefined,
      codigoPatrimonioFornecedor: form.codigoPatrimonioFornecedor || undefined,
      codigoInternoErp: form.codigoInternoErp || undefined,
      numeroSerie: form.numeroSerie || undefined,
      dataInicio: form.dataInicio,
      dataFimPrevista: form.dataFimPrevista,
      valorDiario: parseFloat(form.valorDiario.replace(",", ".")) || undefined,
      valorMensal: parseFloat(form.valorMensal.replace(",", ".")) || undefined,
      funcionarioResponsavelNome: form.funcionarioResponsavelNome || undefined,
      observacoes: form.observacoes || undefined,
      fotosRecebimento: fotos,
      ordemCompraId: ocSelecionada?.id, // Rev. 2371 — vincula OC quando o user clicou em "Receber esta OC"
      // Rev. 2465 — assinaturas só quando não é fluxo de importação em lote.
      ...(!noFluxoImport && recEntSig && recRecSig ? {
        assinaturaEntregadorNome: recEntNome.trim(),
        assinaturaEntregadorUrl:  recEntSig,
        assinaturaRecebedorNome:  recRecNome.trim(),
        assinaturaRecebedorUrl:   recRecSig,
      } : {}),
    });
  }
  // Rev. 2371 — Pré-preenche o form a partir de uma OC de locação pendente.
  // Usa o 1º item da OC como descrição (locações normalmente têm 1 item;
  // se forem múltiplos, o user edita depois). Datas vêm da locação da OC.
  function receberDaOC(oc: any) {
    const it = (oc.itens || [])[0];
    const valorMes = oc.locacaoDuracaoDias && Number(oc.total) > 0 && Number(oc.locacaoDuracaoDias) > 0
      ? (Number(oc.total) / Number(oc.locacaoDuracaoDias)) * 30
      : null;
    setForm({
      ...EMPTY,
      descricao: it?.descricao || "",
      categoria: "",
      fornecedorNome: oc.fornecedorNome || "",
      codigoPatrimonioFornecedor: "",
      codigoInternoErp: "",
      numeroSerie: "",
      dataInicio: oc.locacaoDataInicio || oc.dataEntregaPrevista || new Date().toISOString().slice(0, 10),
      dataFimPrevista: oc.locacaoDataFim || "",
      valorDiario: it?.precoUnitario ? String(it.precoUnitario).replace(".", ",") : "",
      valorMensal: valorMes ? valorMes.toFixed(2).replace(".", ",") : "",
      funcionarioResponsavelNome: "",
      observacoes: `Recebimento referente à OC ${oc.numeroOc}`,
    });
    setOcSelecionada({ id: oc.id, numeroOc: oc.numeroOc });
  }
  function fazerDevolucao() {
    if (devFotos.length === 0) return toast.error("Foto de devolução é obrigatória.");
    devolver.mutate({
      companyId, id: modalDev.id, dataFimReal: devData,
      fotosDevolucao: devFotos, observacao: devObs || undefined,
    });
  }
  function fazerCheckIn() {
    checkIn.mutate({ companyId, id: modalCheckin.id, observacao: checkinObs || undefined });
  }
  // Rev. 2420 — fecha o picker e LIMPA a seleção (evita state leak entre
  // aberturas; achado do code review). Usado em todos os caminhos de
  // fechamento (X, overlay, Cancelar, escolha single).
  function fecharPickerDevolver() {
    setPickerDevolver(false);
    setSelecionadosLote(new Set());
    setPickerDevolverBusca("");
    voltarParaAlmoxSeNecessario(); // Rev. 2449
  }
  // Rev. 2420/2453 — dispara devolução em lote dos ids em `modalDevLote`.
  // Etapa 1 valida fotos/data e avança pra etapa 2 (assinaturas).
  // Etapa 2 valida nomes+assinaturas e dispara a mutation.
  function avancarOuDevolverLote() {
    if (!modalDevLote || modalDevLote.length === 0) return;
    if (devLoteEtapa === 1) {
      if (devLoteFotos.length === 0) return toast.error("Foto de devolução é obrigatória.");
      if (!devLoteData) return toast.error("Data é obrigatória.");
      setDevLoteEtapa(2);
      return;
    }
    if (!devLoteEntNome.trim()) return toast.error("Nome do entregador é obrigatório.");
    if (!devLoteEntSig)         return toast.error("Assinatura do entregador é obrigatória.");
    if (!devLoteRecNome.trim()) return toast.error("Nome do recebedor é obrigatório.");
    if (!devLoteRecSig)         return toast.error("Assinatura do recebedor é obrigatória.");
    devolverLote.mutate({
      companyId,
      ids: modalDevLote.map((l: any) => Number(l.id)),
      dataFimReal: devLoteData,
      fotosDevolucao: devLoteFotos,
      observacao: devLoteObs || undefined,
      assinaturaEntregadorNome: devLoteEntNome.trim(),
      assinaturaEntregadorUrl:  devLoteEntSig,
      assinaturaRecebedorNome:  devLoteRecNome.trim(),
      assinaturaRecebedorUrl:   devLoteRecSig,
    });
  }

  // Rev. 2361 — stats lê de `dataPorCat` (pré-vencimento) pra que os contadores
  // dos cards continuem corretos mesmo quando o filtro de urgência já está ativo
  // (clicar em "Atrasados" não deve zerar "Vencendo 5d" e vice-versa). Adicionado
  // `vencendo5` (fim em [hoje, hoje+5d)) pro novo card "Vencendo (5d)".
  const stats = useMemo(() => {
    const s = { ativos: 0, vencendo5: 0, vencendo: 0, atrasados: 0, valorMes: 0 };
    const hoje = Date.now();
    const limite5  = hoje + 5  * 86400 * 1000;
    const limite30 = hoje + 30 * 86400 * 1000;
    for (const l of dataPorCat as any[]) {
      if (l.status === "em_uso") {
        s.ativos++;
        s.valorMes += Number(l.valorMensal) || 0;
        const fim = new Date(l.dataFimPrevista).getTime();
        if (!isFinite(fim)) continue;
        if (fim < hoje) s.atrasados++;
        else if (fim < limite5) s.vencendo5++;
        if (fim >= hoje && fim < limite30) s.vencendo++;
      }
    }
    return s;
  }, [dataPorCat]);

  const STATUS_PILLS: { key: string; label: string; color: string }[] = [
    { key: "",                       label: "Todos",         color: "from-slate-500 to-slate-700" },
    { key: "em_uso",                 label: "Em uso",        color: "from-blue-500 to-blue-700" },
    { key: "aguardando_chegada",     label: "Aguardando",    color: "from-cyan-500 to-cyan-700" },
    { key: "em_renovacao",           label: "Em renovação",  color: "from-amber-500 to-amber-700" },
    { key: "atrasado",               label: "Atrasados",     color: "from-red-500 to-red-700" },
    { key: "quebrado",               label: "Quebrados",     color: "from-rose-500 to-rose-700" },
    { key: "solicitado_substituicao", label: "Subst. solic.", color: "from-fuchsia-500 to-fuchsia-700" },
    { key: "devolvido",              label: "Devolvidos",    color: "from-slate-400 to-slate-600" },
  ];
  // Contadores cross-filter — sempre sobre o universo completo (dataAll),
  // pra que cada pill mostre quantos existem em cada status independente
  // do filtro selecionado.
  const contStatus = useMemo(() => {
    const c: Record<string, number> = {
      "": 0, em_uso: 0, em_renovacao: 0, atrasado: 0, devolvido: 0,
      aguardando_chegada: 0, quebrado: 0, solicitado_substituicao: 0,
    };
    for (const l of dataAll as any[]) { c[""]++; if (c[l.status] != null) c[l.status]++; }
    return c;
  }, [dataAll]);

  // Rev. 2334 — obras com equipamentos no status corrente (pra alimentar select).
  // Cross-filter: muda o status, lista de obras se reduz proporcionalmente.
  // Cada item leva o nome resolvido via obrasMap + contagem de unidades.
  const obrasComItens = useMemo(() => {
    const acc = new Map<string, { key: string; obraId: number | null; nome: string; count: number; valorMes: number }>();
    for (const l of dataPorStatus) {
      const oid = l.obraId ? Number(l.obraId) : null;
      const k = String(oid ?? "__null__");
      const nome = oid ? (obrasMap.get(oid) || `Obra #${oid}`) : "— Sem obra vinculada —";
      const g = acc.get(k) || { key: k, obraId: oid, nome, count: 0, valorMes: 0 };
      g.count++;
      g.valorMes += Number(l.valorMensal) || 0;
      acc.set(k, g);
    }
    return Array.from(acc.values()).sort((a, b) => {
      if (a.obraId === null && b.obraId !== null) return 1;
      if (b.obraId === null && a.obraId !== null) return -1;
      return b.count - a.count;
    });
  }, [dataPorStatus, obrasMap]);
  const obraSelecionada = useMemo(() => obrasComItens.find(o => o.key === filtroObra) || null, [obrasComItens, filtroObra]);

  // Rev. 2337 — categorias com equipamentos no status+obra correntes (alimenta select).
  const categoriasComItens = useMemo(() => {
    const acc = new Map<string, { key: string; nome: string; count: number; valorMes: number }>();
    for (const l of dataPorStatusEObra) {
      const cat = String(l.categoria || "").trim();
      const k = cat || "__null__";
      const nome = cat || "— Sem categoria —";
      const g = acc.get(k) || { key: k, nome, count: 0, valorMes: 0 };
      g.count++;
      g.valorMes += Number(l.valorMensal) || 0;
      acc.set(k, g);
    }
    return Array.from(acc.values()).sort((a, b) => {
      if (a.key === "__null__" && b.key !== "__null__") return 1;
      if (b.key === "__null__" && a.key !== "__null__") return -1;
      return b.count - a.count;
    });
  }, [dataPorStatusEObra]);
  const categoriaSelecionada = useMemo(() => categoriasComItens.find(c => c.key === filtroCategoria) || null, [categoriasComItens, filtroCategoria]);
  // Rev. 2408 — lista de locadoras (fornecedores) em uso nos equipamentos
  // da empresa atual. Agrupa por NOME normalizado (uppercase trimmed) pra
  // colapsar variações "Jalves" / "JALVES" / "jalves locações" → 1 entrada.
  // Mantém o nome com a capitalização mais comum pra exibição.
  const fornecedoresComItens = useMemo(() => {
    const acc = new Map<string, { key: string; nome: string; count: number; valorMes: number }>();
    for (const l of dataPorCat) {
      const raw = String(l.fornecedorNome || "").trim();
      const k = raw ? raw.toUpperCase() : "__null__";
      const nome = raw || "— Sem locadora —";
      const g = acc.get(k) || { key: k, nome, count: 0, valorMes: 0 };
      g.count++;
      g.valorMes += Number(l.valorMensal) || 0;
      acc.set(k, g);
    }
    return Array.from(acc.values()).sort((a, b) => {
      if (a.key === "__null__" && b.key !== "__null__") return 1;
      if (b.key === "__null__" && a.key !== "__null__") return -1;
      return b.count - a.count;
    });
  }, [dataPorCat]);
  const fornecedorSelecionado = useMemo(() => fornecedoresComItens.find(f => f.key === filtroFornecedor) || null, [fornecedoresComItens, filtroFornecedor]);
  const totalSemCategoria = useMemo(() => (dataAll as any[]).filter(l => !l.categoria || String(l.categoria).trim() === "").length, [dataAll]);
  // Rev. 2340 — quantos itens NÃO têm foto (nem recebimento, nem IA)
  const totalSemFoto = useMemo(() => (dataAll as any[]).filter(l => {
    const fr = (l.fotosRecebimentoJson as any[]) || [];
    return fr.length === 0 && !l.fotoUrl;
  }).length, [dataAll]);
  // Rev. 2342 — quantos itens TÊM foto da IA (foto_url preenchido) — pra botão Limpar
  const totalComFotoIA = useMemo(() => (dataAll as any[]).filter(l => !!l.fotoUrl).length, [dataAll]);

  // Rev. 2365 — Análise IA "Comprar vs Alugar" foi MIGRADA pra Dashboard
  // Almoxarifado (aba "Equip. Locados") — botão+modal removidos daqui.
  // Endpoint `locadosAnalisarCompraVsAluguel` segue intocado no servidor.

  // Rev. 2337 — Categorização em lote via IA.
  const [modalCategIA, setModalCategIA] = useState<null | { sobrescrever: boolean }>(null);
  const [resultadoCategIA, setResultadoCategIA] = useState<null | { categorias: string[]; itensAtualizados: number; descricoesAnalisadas: number; descricoesNaoMapeadas: string[]; haMaisLotes?: boolean }>(null);
  const categorizarMut = trpc.equipamentos.locadosCategorizarComIA.useMutation({
    onSuccess: (res: any) => {
      setResultadoCategIA(res);
      setModalCategIA(null);
      utils.equipamentos.locadosListar.invalidate();
      toast.success(`IA categorizou ${res.itensAtualizados} equipamento(s) em ${res.categorias.length} categoria(s).`);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Falha ao categorizar com IA.");
      setModalCategIA(null);
    },
  });

  // Rev. 2340 — Busca de fotos ilustrativas em lote via Google Custom Search.
  const [modalFotosIA, setModalFotosIA] = useState<null | { sobrescrever: boolean }>(null);
  const [resultadoFotosIA, setResultadoFotosIA] = useState<null | { descricoesAnalisadas: number; fotosEncontradas: number; itensAtualizados: number; descricoesSemFoto: string[]; haMaisLotes?: boolean; cotaEsgotada?: boolean; fotosPhaseA?: number; fotosPhaseB?: number; fotosPhaseC?: number; lotesProcessados?: number }>(null);
  const fotosAcumRef = useRef<{ lotes: number; analisadas: number; encontradas: number; itensAtualizados: number; semFoto: string[]; phaseA: number; phaseB: number; phaseC: number } | null>(null);
  // Rev. 2340.1 — Progresso estimado por tempo decorrido (server roda
  // sequencial sem stream; ~1.2s por descrição CSE). Capamos em 95% até a
  // mutation retornar para evitar "100% que não termina".
  const [fotoInicio, setFotoInicio] = useState<number | null>(null);
  const [fotoTickNow, setFotoTickNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (fotoInicio == null) return;
    const id = setInterval(() => setFotoTickNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [fotoInicio]);
  // Rev. 2342 — Limpar todas as fotos da IA (reset). Útil quando a busca anterior aplicou imagens erradas.
  const [modalLimparFotos, setModalLimparFotos] = useState(false);
  const limparFotosMut = trpc.equipamentos.locadosLimparFotosIA.useMutation({
    onSuccess: (res: any) => {
      setModalLimparFotos(false);
      utils.equipamentos.locadosListar.invalidate();
      toast.success(`${res.itensLimpos} foto(s) da IA removida(s). As fotos do recebimento físico foram preservadas.`);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Falha ao limpar fotos da IA.");
      setModalLimparFotos(false);
    },
  });
  // Rev. 2355 — Biblioteca CURADA de fotos por descrição canônica.
  // Substitui definitivamente a "busca por IA" (revs 2340-2350) que tinha
  // baixa acurácia por limitação dos provedores gratuitos. User sobe 1 foto
  // por descrição; ERP propaga pra todas as unidades dessa descrição.
  const [modalBiblioteca, setModalBiblioteca] = useState(false);
  const [bibliotecaBuscaQ, setBibliotecaBuscaQ] = useState("");
  const bibliotecaQuery = trpc.equipamentos.fotosCanonicasListar.useQuery(
    { companyId: companyId! },
    { enabled: modalBiblioteca && !!companyId }
  );
  const [uploadingDescNorm, setUploadingDescNorm] = useState<string | null>(null);
  const fotoCanonUpsertMut = trpc.equipamentos.fotosCanonicasUpsert.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Foto aplicada a ${fmtN(res.unidadesAtualizadas)} unidade(s).`);
      bibliotecaQuery.refetch();
      utils.equipamentos.locadosListar.invalidate();
      setUploadingDescNorm(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Falha ao salvar a foto.");
      setUploadingDescNorm(null);
    },
  });
  // Rev. 2368 — Lightbox: clicar em foto amplia em fullscreen. Usado em
  // todos os thumbnails da página (Biblioteca, grupos, unidades).
  const [lightbox, setLightbox] = useState<{ url: string; titulo: string } | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // Rev. 2369 — Modal "Rebuscar foto com termo customizado". O DDG vai
  // procurar pelo TEXTO QUE O USER DIGITAR, não pela descrição cripto do
  // ERP ("ESMER INDL41/2" 220V" → "esmerilhadeira angular 4 polegadas").
  // tipo='locado' usa endpoint que UPDATE direto na tabela (todas unidades);
  // tipo='biblioteca' grava na canônica + propaga.
  const [modalRebuscar, setModalRebuscar] = useState<
    | { tipo: "locado"; descricao: string; fotoAtual: string | null }
    | { tipo: "biblioteca"; descricao: string; fotoAtual: string | null }
    | null
  >(null);
  const [rebuscarTermo, setRebuscarTermo] = useState("");
  const [rebuscarPreview, setRebuscarPreview] = useState<string | null>(null);
  const [rebuscarLoading, setRebuscarLoading] = useState<"buscando" | "aplicando" | null>(null);
  const [rebuscarErro, setRebuscarErro] = useState<string | null>(null);
  function abrirModalRebuscar(
    tipo: "locado" | "biblioteca",
    descricao: string,
    fotoAtual: string | null,
  ) {
    setRebuscarTermo(descricao);
    setRebuscarPreview(null);
    setRebuscarErro(null);
    setRebuscarLoading(null);
    setModalRebuscar({ tipo, descricao, fotoAtual } as any);
  }
  async function rebuscarFoto() {
    if (!companyId || !modalRebuscar) return;
    const termo = rebuscarTermo.trim();
    if (!termo) { setRebuscarErro("Digite um termo de busca."); return; }
    setRebuscarLoading("buscando");
    setRebuscarErro(null);
    setRebuscarPreview(null);
    try {
      if (modalRebuscar.tipo === "locado") {
        const r: any = await buscarFotoWebMut.mutateAsync({
          companyId,
          descricao: modalRebuscar.descricao,
          queryOverride: termo,
          dryRun: true,
          sobrescrever: true,
        });
        if (r?.ok && r.fotoUrl) setRebuscarPreview(r.fotoUrl);
        else setRebuscarErro(r?.motivo || "Nenhuma foto encontrada.");
      } else {
        const r: any = await fotoCanonBuscarWebMut.mutateAsync({
          companyId,
          descricaoOriginal: modalRebuscar.descricao,
          queryOverride: termo,
          dryRun: true,
        });
        if (r?.ok && r.fotoUrl) setRebuscarPreview(r.fotoUrl);
        else setRebuscarErro("Nenhuma foto encontrada.");
      }
    } catch (e: any) {
      setRebuscarErro(e?.message || "Falha na busca.");
    } finally {
      setRebuscarLoading(null);
    }
  }
  async function aplicarRebuscaFoto() {
    if (!companyId || !modalRebuscar || !rebuscarPreview) return;
    const termo = rebuscarTermo.trim();
    setRebuscarLoading("aplicando");
    setRebuscarErro(null);
    try {
      if (modalRebuscar.tipo === "locado") {
        const r: any = await buscarFotoWebMut.mutateAsync({
          companyId,
          descricao: modalRebuscar.descricao,
          queryOverride: termo,
          sobrescrever: true,
        });
        if (r?.ok) {
          utils.equipamentos.locadosListar.invalidate();
          toast.success(`Foto aplicada em ${fmtN(r.itensAtualizados)} unidade(s).`);
          setModalRebuscar(null);
        } else {
          setRebuscarErro(r?.motivo || "Falha ao aplicar.");
        }
      } else {
        const r: any = await fotoCanonBuscarWebMut.mutateAsync({
          companyId,
          descricaoOriginal: modalRebuscar.descricao,
          queryOverride: termo,
        });
        if (r?.ok) {
          // onSuccess do fotoCanonBuscarWebMut já dá toast e refetch.
          setModalRebuscar(null);
        }
      }
    } catch (e: any) {
      setRebuscarErro(e?.message || "Falha ao aplicar.");
    } finally {
      setRebuscarLoading(null);
    }
  }

  // Rev. 2367 — busca foto na web E salva na Biblioteca (1 clique por linha).
  const [buscandoWebBibliotecaDescNorm, setBuscandoWebBibliotecaDescNorm] = useState<Set<string>>(new Set());
  const fotoCanonBuscarWebMut = trpc.equipamentos.fotosCanonicasBuscarWebUpsert.useMutation({
    onSuccess: (res: any, vars: any) => {
      const descNorm = (vars?.descricaoOriginal || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
      setBuscandoWebBibliotecaDescNorm(prev => { const n = new Set(prev); n.delete(descNorm); return n; });
      // Rev. 2369 — dryRun: preview-only, sem toast nem refetch.
      if (res?.dryRun) return;
      toast.success(`Foto da web aplicada à biblioteca + ${fmtN(res.unidadesAtualizadas)} unidade(s).`);
      bibliotecaQuery.refetch();
      utils.equipamentos.locadosListar.invalidate();
    },
    onError: (err: any, vars: any) => {
      const descNorm = (vars?.descricaoOriginal || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
      setBuscandoWebBibliotecaDescNorm(prev => { const n = new Set(prev); n.delete(descNorm); return n; });
      toast.error(err?.message || "Falha na busca web.");
    },
  });
  function buscarWebParaBiblioteca(descricaoOriginal: string) {
    if (!companyId) return;
    const descNorm = descricaoOriginal.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
    setBuscandoWebBibliotecaDescNorm(prev => new Set(prev).add(descNorm));
    fotoCanonBuscarWebMut.mutate({ companyId, descricaoOriginal });
  }

  const fotoCanonRemoverMut = trpc.equipamentos.fotosCanonicasRemover.useMutation({
    onSuccess: (res: any) => {
      toast.success(`Foto canônica removida. ${fmtN(res.unidadesLimpas)} unidade(s) ficaram sem foto.`);
      bibliotecaQuery.refetch();
      utils.equipamentos.locadosListar.invalidate();
    },
    onError: (err: any) => toast.error(err?.message || "Falha ao remover."),
  });
  async function handleBibliotecaUpload(descricaoOriginal: string, file: File) {
    if (!companyId) return;
    const descNorm = descricaoOriginal.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
    setUploadingDescNorm(descNorm);
    try {
      const compressed = await compressImageIfNeeded(file);
      await fotoCanonUpsertMut.mutateAsync({
        companyId,
        descricaoOriginal,
        fotoBase64: compressed.base64,
        fotoMime: compressed.contentType,
      });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao processar a imagem.");
      setUploadingDescNorm(null);
    }
  }

  const buscarFotosMut = trpc.equipamentos.locadosBuscarFotosComIA.useMutation({
    onSuccess: (res: any) => {
      const acc = fotosAcumRef.current ?? { lotes: 0, analisadas: 0, encontradas: 0, itensAtualizados: 0, semFoto: [] as string[], phaseA: 0, phaseB: 0, phaseC: 0 };
      acc.lotes += 1;
      acc.analisadas += res.descricoesAnalisadas ?? 0;
      acc.encontradas += res.fotosEncontradas ?? 0;
      acc.itensAtualizados += res.itensAtualizados ?? 0;
      acc.phaseA += res.fotosPhaseA ?? 0;
      acc.phaseB += res.fotosPhaseB ?? 0;
      acc.phaseC += res.fotosPhaseC ?? 0;
      if (Array.isArray(res.descricoesSemFoto)) acc.semFoto.push(...res.descricoesSemFoto);
      fotosAcumRef.current = acc;
      utils.equipamentos.locadosListar.invalidate();

      // Rev. 2348 — auto-loop: se o servidor sinaliza haMaisLotes, dispara
      // o próximo batch automaticamente. Rev. 2349 — segue mesmo com cota
      // Google esgotada (server continua via OpenVerse/Wikimedia).
      if (res.haMaisLotes) {
        setFotoInicio(Date.now());
        setFotoTickNow(Date.now());
        // microtask: evita stack do react-query e dá frame pra atualizar UI
        setTimeout(() => buscarFotosMut.mutate({ companyId, sobrescrever: false }), 250);
        return;
      }

      // Fim do loop — consolida e mostra resultado acumulado.
      setResultadoFotosIA({
        descricoesAnalisadas: acc.analisadas,
        fotosEncontradas: acc.encontradas,
        itensAtualizados: acc.itensAtualizados,
        descricoesSemFoto: acc.semFoto.slice(0, 50),
        haMaisLotes: false,
        cotaEsgotada: res.cotaEsgotada,
        fotosPhaseA: acc.phaseA,
        fotosPhaseB: acc.phaseB,
        fotosPhaseC: acc.phaseC,
        lotesProcessados: acc.lotes,
      });
      setModalFotosIA(null);
      setFotoInicio(null);
      fotosAcumRef.current = null;
      toast.success(`IA processou ${acc.lotes} lote(s) — ${acc.itensAtualizados} equipamento(s) atualizado(s).`);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Falha ao buscar fotos com IA.");
      setModalFotosIA(null);
      setFotoInicio(null);
      fotosAcumRef.current = null;
    },
  });
  // Estimativa: a procedure processa até 60 descrições únicas por call. Cada
  // chamada CSE leva ~1.0-1.5s (rede + parse). Estimamos 1.2s/descrição.
  const MAX_DESC_FOTOS = 60;
  const SEG_POR_DESC = 1.2;
  const fotoDescricoesEstimadas = Math.min(totalSemFoto, MAX_DESC_FOTOS);
  const fotoSegundosEstimados = Math.max(8, Math.round(fotoDescricoesEstimadas * SEG_POR_DESC));
  const fotoSegundosDecorridos = fotoInicio ? Math.floor((fotoTickNow - fotoInicio) / 1000) : 0;
  const fotoPct = fotoInicio
    ? Math.min(95, Math.round((fotoSegundosDecorridos / fotoSegundosEstimados) * 100))
    : 0;

  // ── Rev. 2366 — Busca de foto "como usuário normal faria" ──────────────
  // 1 descrição por chamada → DuckDuckGo Images → 1º hit → UPDATE em lote
  // nas unidades dessa descrição. Sem LLM, sem cascade, sem blocklist.
  // Usada por DOIS gatilhos:
  //   (a) Botão hero "Buscar fotos da web" → loop client-side por TODAS
  //       as descrições sem foto (com progresso visível no canto).
  //   (b) Botão por card no thumbnail → 1 descrição, sobrescreve a atual.
  const [buscandoDescricoes, setBuscandoDescricoes] = useState<Set<string>>(new Set());
  const [batchWeb, setBatchWeb] = useState<null | { atual: number; total: number; descricaoAtual: string; ok: number; falhas: number; itensAtualizados: number; cancelar: boolean }>(null);
  const batchWebRef = useRef<{ cancelar: boolean }>({ cancelar: false });
  const buscarFotoWebMut = trpc.equipamentos.locadosBuscarFotoWebPorDescricao.useMutation();

  async function buscarFotoUma(descricao: string, sobrescrever: boolean) {
    if (!companyId) return;
    setBuscandoDescricoes(prev => { const n = new Set(prev); n.add(descricao); return n; });
    try {
      const r: any = await buscarFotoWebMut.mutateAsync({ companyId, descricao, sobrescrever });
      if (r?.ok) {
        utils.equipamentos.locadosListar.invalidate();
        toast.success(`Foto aplicada em ${fmtN(r.itensAtualizados)} unidade(s) — "${descricao.slice(0, 40)}"`);
      } else {
        toast.error(r?.motivo || "Não encontrada na web.", { duration: 4000 });
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao buscar foto.");
    } finally {
      setBuscandoDescricoes(prev => { const n = new Set(prev); n.delete(descricao); return n; });
    }
  }

  async function popularFotosWebTodas(sobrescrever: boolean) {
    if (!companyId) return;
    // Coleta descrições distintas SEM foto (mesmo critério dos grupos).
    const setDesc = new Set<string>();
    for (const l of dataAll as any[]) {
      const fotosRec = ((l.fotosRecebimentoJson as FotoItem[]) || []);
      const semFoto = fotosRec.length === 0 && (sobrescrever || !l.fotoUrl);
      if (semFoto && l.descricao) setDesc.add(String(l.descricao).trim());
    }
    const descs = Array.from(setDesc).filter(Boolean);
    if (descs.length === 0) { toast.info("Nenhuma descrição sem foto."); return; }
    batchWebRef.current.cancelar = false;
    setBatchWeb({ atual: 0, total: descs.length, descricaoAtual: descs[0], ok: 0, falhas: 0, itensAtualizados: 0, cancelar: false });
    let ok = 0, falhas = 0, itensAtualizados = 0;
    for (let i = 0; i < descs.length; i++) {
      if (batchWebRef.current.cancelar) break;
      const d = descs[i];
      setBatchWeb(p => p ? { ...p, atual: i + 1, descricaoAtual: d } : p);
      try {
        const r: any = await buscarFotoWebMut.mutateAsync({ companyId, descricao: d, sobrescrever });
        if (r?.ok) { ok += 1; itensAtualizados += Number(r.itensAtualizados || 0); }
        else { falhas += 1; }
      } catch { falhas += 1; }
      setBatchWeb(p => p ? { ...p, ok, falhas, itensAtualizados } : p);
      // Pequena pausa pra não martelar o DDG (rate-limit defensivo).
      await new Promise(res => setTimeout(res, 250));
    }
    utils.equipamentos.locadosListar.invalidate();
    const cancelado = batchWebRef.current.cancelar;
    setBatchWeb(null);
    if (cancelado) {
      toast.info(`Interrompido — ${fmtN(ok)} foto(s) aplicada(s) em ${fmtN(itensAtualizados)} unidade(s).`);
    } else {
      toast.success(`Concluído — ${fmtN(ok)} foto(s) em ${fmtN(itensAtualizados)} unidade(s)${falhas > 0 ? ` · ${fmtN(falhas)} sem resultado` : ""}.`);
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Hero header com gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white shadow-lg">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.2) 0%, transparent 50%)" }} />
          <div className="relative px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 ring-1 ring-white/30">
                <Truck className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Equipamentos Locados</h1>
                <p className="text-sm text-emerald-50/90 mt-0.5">Rastreio de equipamentos em locação — recebimento, check-in semanal, devolução.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Rev. 2365 — Botão "Comprar vs Alugar (IA)" REMOVIDO daqui.
                  A análise agora vive em /dashboards/almoxarifado-equipamentos
                  (aba "Equip. Locados") junto com os demais KPIs estratégicos. */}
              {/* Rev. 2337 — Categorizar com IA (só aparece se houver itens sem categoria). */}
              {totalSemCategoria > 0 && (
                <button onClick={() => setModalCategIA({ sobrescrever: false })}
                  disabled={categorizarMut.isPending}
                  className="inline-flex items-center gap-2 bg-violet-500/90 text-white hover:bg-violet-500 px-4 py-2.5 rounded-xl shadow-md font-semibold text-sm transition ring-1 ring-violet-300/60 disabled:opacity-60 disabled:cursor-wait"
                  title={`${totalSemCategoria} equipamento(s) sem categoria — a IA propõe categorias e classifica em lote`}>
                  {categorizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                  Categorizar com IA
                  <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-white/25">{fmtN(totalSemCategoria)}</span>
                </button>
              )}
              {/* Rev. 2342 — Limpar fotos da IA (reset). Só aparece se houver fotos da IA aplicadas. */}
              {totalComFotoIA > 0 && (
                <button onClick={() => setModalLimparFotos(true)}
                  disabled={limparFotosMut.isPending}
                  className="inline-flex items-center gap-2 bg-red-500/90 text-white hover:bg-red-500 px-4 py-2.5 rounded-xl shadow-md font-semibold text-sm transition ring-1 ring-red-300/60 disabled:opacity-60 disabled:cursor-wait"
                  title={`${totalComFotoIA} equipamento(s) com foto da IA — remover todas (mantém fotos do recebimento físico)`}>
                  {limparFotosMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Limpar fotos IA
                  <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-white/25">{fmtN(totalComFotoIA)}</span>
                </button>
              )}
              {/* Rev. 2355 — Biblioteca curada de fotos por descrição canônica.
                  Substitui a busca por IA (revs 2340-2350) como caminho principal.
                  Sempre visível: é o único modo determinístico de garantir foto certa. */}
              <button onClick={() => setModalBiblioteca(true)}
                className="inline-flex items-center gap-2 bg-indigo-500/90 text-white hover:bg-indigo-500 px-4 py-2.5 rounded-xl shadow-md font-semibold text-sm transition ring-1 ring-indigo-300/60"
                title="Suba 1 foto por descrição de equipamento (PAINEL NR18, DIAGONA 1,50m, etc) e o ERP aplica em todas as unidades dessa descrição automaticamente.">
                <Library className="h-4 w-4" />
                Biblioteca de fotos
              </button>
              {/* Rev. 2366 — "Buscar fotos da web" (DuckDuckGo Images) — substitui
                  "Tentar IA" antigo. Loop client-side: pra cada descrição sem
                  foto chama o endpoint 1×, pega o 1º resultado do DDG, aplica
                  em todas as unidades. Mesmo modelo de quem abre Google
                  Imagens, digita o nome e copia a 1ª foto. */}
              {totalSemFoto > 0 && (
                <button onClick={() => popularFotosWebTodas(false)}
                  disabled={!!batchWeb}
                  className="inline-flex items-center gap-2 bg-white text-sky-700 hover:bg-sky-50 px-4 py-2.5 rounded-xl shadow-md font-semibold text-sm transition ring-1 ring-sky-200 disabled:opacity-60 disabled:cursor-wait"
                  title={`${totalSemFoto} equipamento(s) sem foto — busca cada descrição na web e aplica o 1º resultado, igual um usuário faria no Google Imagens.`}>
                  {batchWeb ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  Buscar fotos da web
                  <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">{fmtN(totalSemFoto)}</span>
                </button>
              )}
              {/* Rev. 2372 — Botão hero DEVOLVER: abre picker visual de
                  equipamentos em uso (cards grandes com foto). Mesmo fluxo
                  do botão "DEVOLVER LOCAÇÃO" do Almoxarifado, agora também
                  acessível direto da própria página. */}
              {stats.ativos > 0 && (
                <button onClick={() => { setPickerDevolverBusca(""); setPickerDevolver(true); }}
                  className="inline-flex items-center gap-2 bg-white text-orange-700 hover:bg-orange-50 px-5 py-2.5 rounded-xl shadow-md font-semibold text-sm transition ring-1 ring-orange-200"
                  title="Devolver um equipamento locado — escolha visualmente pela foto">
                  <RotateCcw className="h-4 w-4" /> Devolver locação
                  <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">{fmtN(stats.ativos)}</span>
                </button>
              )}
              {/* Rev. 2315 — Removido botão "Receber locação"; fluxo principal é Importar PDF (IA). */}
              <button onClick={abrirImportar}
                className="inline-flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-2.5 rounded-xl shadow-md font-semibold text-sm transition"
                title="Importar PDF de relatório da locadora (Jalves, Mills, etc.) — a IA detecta o layout e cadastra em lote">
                <Sparkles className="h-4 w-4" /> Importar PDF (IA)
              </button>
            </div>
          </div>
        </div>

        {/* KPI cards modernos · Rev. 2338/2361 — clicáveis (aplicam filtro de
            urgência/status); responsivos: 2col(<sm) → 3col(sm) → 5col(md+) pra
            comportar o novo card "Vencendo (5d)". */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
          <Kpi icon={Activity}      label="Ativos"         value={stats.ativos}             tint="blue"   sub="em locação"
            active={filtroStatus === "em_uso" && !filtroVencimento}
            onClick={() => {
              // Rev. 2361 — toggle real: 2º clique no card ativo volta pra "Todos"
              // (consistente com o destoggle dos cards de urgência).
              if (filtroStatus === "em_uso" && !filtroVencimento) { setFiltroStatus(""); }
              else { setFiltroStatus("em_uso"); setFiltroVencimento(""); }
            }}
            title="Mostrar todos os equipamentos em locação (clique novamente para limpar)" />
          <Kpi icon={AlertTriangle} label="Vencendo (5d)"  value={stats.vencendo5}          tint="red"    sub="urgente"
            active={filtroVencimento === "5d"}
            onClick={() => { setFiltroStatus("em_uso"); setFiltroVencimento(filtroVencimento === "5d" ? "" : "5d"); }}
            title="Filtrar contratos que vencem nos próximos 5 dias" />
          <Kpi icon={Clock}         label="Vencendo (30d)" value={stats.vencendo}           tint="amber"  sub="atenção"
            active={filtroVencimento === "30d"}
            onClick={() => { setFiltroStatus("em_uso"); setFiltroVencimento(filtroVencimento === "30d" ? "" : "30d"); }}
            title="Filtrar contratos que vencem nos próximos 30 dias" />
          <Kpi icon={AlertTriangle} label="Atrasados"      value={stats.atrasados}          tint="red"    sub="renovar/devolver"
            active={filtroVencimento === "vencidos"}
            onClick={() => { setFiltroStatus("em_uso"); setFiltroVencimento(filtroVencimento === "vencidos" ? "" : "vencidos"); }}
            title="Filtrar contratos já vencidos (atrasados)" />
          <Kpi icon={DollarSign}    label="Custo / mês"    value={fmtMoney(stats.valorMes)} tint="emerald" sub="comprometido" money />
        </div>

        {/* Rev. 2334 — Filtros: pills de status (linha 1) + busca + obra (linha 2)
            + chip de filtro ativo (linha 3) + seleção (linha 4). */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_PILLS.map(p => {
              const active = filtroStatus === p.key;
              return (
                <button key={p.key} onClick={() => { setFiltroStatus(p.key); if (p.key !== "em_uso") setFiltroVencimento(""); }}
                  className={`group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                    active
                      ? `bg-gradient-to-r ${p.color} text-white shadow-md`
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}>
                  {p.label}
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
                    active ? "bg-white/25 text-white" : "bg-slate-200 text-slate-700"
                  }`}>{fmtN(contStatus[p.key] ?? 0)}</span>
                </button>
              );
            })}
          </div>
          {/* Rev. 2370 — busca em linha própria full-width (antes dividia row com selects e colapsava no iPad). */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por descrição, fornecedor ou patrimônio…"
              className={`w-full pl-10 ${busca ? "pr-10" : "pr-3"} py-2.5 border-2 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/30 outline-none transition ${
                busca ? "border-emerald-400 bg-emerald-50/40" : "border-slate-200 focus:border-emerald-500"
              }`}
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                title="Limpar busca"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <select
                value={filtroObra}
                onChange={e => setFiltroObra(e.target.value)}
                className={`w-full pl-10 pr-8 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/30 outline-none transition appearance-none bg-white font-medium ${
                  filtroObra ? "border-emerald-400 bg-emerald-50/40 text-emerald-900" : "border-slate-200 text-slate-700"
                }`}
                title="Filtrar equipamentos por obra ERP">
                <option value="">Todas as obras ({fmtN(dataPorStatus.length)})</option>
                {obrasComItens.map(o => (
                  <option key={o.key} value={o.key}>
                    {o.nome} · {fmtN(o.count)} unid.{o.valorMes > 0 ? ` · ${fmtMoney(o.valorMes)}/mês` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            {/* Rev. 2337 — filtro por categoria */}
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <select
                value={filtroCategoria}
                onChange={e => setFiltroCategoria(e.target.value)}
                className={`w-full pl-10 pr-8 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-violet-500/30 outline-none transition appearance-none bg-white font-medium ${
                  filtroCategoria ? "border-violet-400 bg-violet-50/40 text-violet-900" : "border-slate-200 text-slate-700"
                }`}
                title="Filtrar por categoria de equipamento">
                <option value="">Todas as categorias ({fmtN(dataPorStatusEObra.length)})</option>
                {categoriasComItens.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.nome} · {fmtN(c.count)} unid.{c.valorMes > 0 ? ` · ${fmtMoney(c.valorMes)}/mês` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
            {/* Rev. 2408 — filtro por locadora (fornecedor) */}
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <select
                value={filtroFornecedor}
                onChange={e => setFiltroFornecedor(e.target.value)}
                className={`w-full pl-10 pr-8 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500/30 outline-none transition appearance-none bg-white font-medium ${
                  filtroFornecedor ? "border-amber-400 bg-amber-50/40 text-amber-900" : "border-slate-200 text-slate-700"
                }`}
                title="Filtrar por empresa de locação (fornecedor)">
                <option value="">Todas as locadoras ({fmtN(dataPorCat.length)})</option>
                {fornecedoresComItens.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.nome} · {fmtN(f.count)} unid.{f.valorMes > 0 ? ` · ${fmtMoney(f.valorMes)}/mês` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {/* Rev. 2334+2337+2361 — chips de filtros ativos com botão limpar */}
          {(filtroObra || filtroCategoria || filtroFornecedor || busca || filtroVencimento) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Filtros ativos:</span>
              {filtroVencimento && (
                <span className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 font-medium border ${
                  filtroVencimento === "vencidos" ? "bg-red-50 border-red-200 text-red-800"
                    : filtroVencimento === "5d"   ? "bg-red-50 border-red-200 text-red-800"
                                                  : "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                  {filtroVencimento === "vencidos" ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  <span>
                    {filtroVencimento === "vencidos" ? "Atrasados"
                      : filtroVencimento === "5d"   ? "Vencendo em 5 dias"
                                                    : "Vencendo em 30 dias"}
                  </span>
                  <span className="font-bold">· {fmtN((data as any[]).length)}</span>
                  <button onClick={() => setFiltroVencimento("")} className="ml-1 bg-white/60 hover:bg-white/90 rounded-full p-0.5" title="Remover filtro de urgência">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filtroObra && obraSelecionada && (
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full pl-3 pr-1.5 py-1 font-medium">
                  <Building2 className="h-3 w-3" />
                  <span className="max-w-[260px] truncate" title={obraSelecionada.nome}>{obraSelecionada.nome}</span>
                  <span className="text-emerald-600 font-bold">· {fmtN(obraSelecionada.count)}</span>
                  <button onClick={() => setFiltroObra("")} className="ml-1 bg-emerald-200/70 hover:bg-emerald-300 rounded-full p-0.5" title="Remover filtro de obra">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filtroCategoria && categoriaSelecionada && (
                <span className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-200 text-violet-800 rounded-full pl-3 pr-1.5 py-1 font-medium">
                  <Tag className="h-3 w-3" />
                  <span className="max-w-[200px] truncate" title={categoriaSelecionada.nome}>{categoriaSelecionada.nome}</span>
                  <span className="text-violet-600 font-bold">· {fmtN(categoriaSelecionada.count)}</span>
                  <button onClick={() => setFiltroCategoria("")} className="ml-1 bg-violet-200/70 hover:bg-violet-300 rounded-full p-0.5" title="Remover filtro de categoria">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {/* Rev. 2408 — chip de locadora */}
              {filtroFornecedor && fornecedorSelecionado && (
                <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-full pl-3 pr-1.5 py-1 font-medium">
                  <Truck className="h-3 w-3" />
                  <span className="max-w-[200px] truncate" title={fornecedorSelecionado.nome}>{fornecedorSelecionado.nome}</span>
                  <span className="text-amber-600 font-bold">· {fmtN(fornecedorSelecionado.count)}</span>
                  {/* Rev. 2518 — pílula "Renomear" pra corrigir o nome do
                      fornecedor em lote (sobrescreve em todas as N unidades).
                      Só aparece se a locadora não for "__null__" (sem locadora). */}
                  {fornecedorSelecionado.key !== "__null__" && (
                    <button
                      onClick={() => setRenomearForn({
                        nomeAtual: fornecedorSelecionado.nome,
                        count: fornecedorSelecionado.count,
                        valorMes: fornecedorSelecionado.valorMes,
                        nomeNovo: fornecedorSelecionado.nome,
                      })}
                      className="ml-1 bg-amber-200/70 hover:bg-amber-300 rounded-full p-0.5"
                      title="Renomear locadora em todas as unidades"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  <button onClick={() => setFiltroFornecedor("")} className="ml-1 bg-amber-200/70 hover:bg-amber-300 rounded-full p-0.5" title="Remover filtro de locadora">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {busca && (
                <span className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-full pl-3 pr-1.5 py-1 font-medium">
                  <Search className="h-3 w-3" />
                  <span className="max-w-[180px] truncate">"{busca}"</span>
                  <button onClick={() => setBusca("")} className="ml-1 bg-slate-200 hover:bg-slate-300 rounded-full p-0.5" title="Limpar busca">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button onClick={() => { setFiltroObra(""); setFiltroCategoria(""); setFiltroFornecedor(""); setBusca(""); setFiltroVencimento(""); }} className="text-slate-500 hover:text-slate-700 underline ml-1">limpar tudo</button>
            </div>
          )}
          {/* Rev. 2323 — Selecionar todos visíveis (cabeçalho da lista). */}
          {(data as any[]).length > 0 && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 -mb-1 flex-wrap">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none px-1 py-1">
                <input type="checkbox" checked={todosVisiveisSelecionados} onChange={toggleTodosVisiveis} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                Selecionar todos visíveis ({fmtN((data as any[]).length)})
              </label>
              {selecionados.size > 0 && (
                <button onClick={() => setSelecionados(new Set())} className="text-xs text-slate-500 hover:text-slate-700 underline">limpar seleção ({fmtN(selecionados.size)})</button>
              )}
              {/* Rev. 2344 — toggle de agrupamento por descrição+obra */}
              <div className="ml-auto inline-flex items-center gap-1 bg-slate-100 rounded-full p-0.5 ring-1 ring-slate-200">
                <button
                  type="button"
                  onClick={() => setAgruparPorDescObra(true)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition inline-flex items-center gap-1.5 ${agruparPorDescObra ? "bg-white shadow-sm text-emerald-700 ring-1 ring-emerald-200" : "text-slate-600 hover:text-slate-800"}`}
                  title="Agrupa itens com a mesma descrição na mesma obra"
                >
                  <Layers className="h-3.5 w-3.5" /> Agrupar <span className={`font-bold ${agruparPorDescObra ? "text-emerald-600" : "opacity-70"}`}>({fmtN(grupos.length)})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAgruparPorDescObra(false)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition inline-flex items-center gap-1.5 ${!agruparPorDescObra ? "bg-white shadow-sm text-slate-700 ring-1 ring-slate-300" : "text-slate-600 hover:text-slate-800"}`}
                  title="Mostra todas as unidades individualmente"
                >
                  Individual <span className="font-bold opacity-70">({fmtN((data as any[]).length)})</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lista em cards modernos */}
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 flex justify-center"><Spinner /></div>
        ) : data.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
            <Truck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <div className="text-slate-700 font-semibold">Nenhum equipamento locado encontrado</div>
            <div className="text-sm text-slate-500 mt-1">Use <b>Importar PDF (IA)</b> para cadastrar contratos em lote a partir do relatório da locadora.</div>
          </div>
        ) : agruparPorDescObra ? (
          // Rev. 2344 — Render em GRUPOS (descrição+obra). Cada grupo mostra
          // contagem, status mix, Σ R$/mês. Click abre modal com unidades.
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {grupos.map(g => {
              const accent = g.statusPrincipal === "atrasado" ? "from-red-500 to-red-600"
                : g.statusPrincipal === "em_renovacao" ? "from-amber-500 to-amber-600"
                : g.statusPrincipal === "em_uso" ? "from-emerald-500 to-teal-600"
                : "from-slate-400 to-slate-500";
              const obraNome = g.obraId ? obrasMap.get(g.obraId) : null;
              const statusEntries = Object.entries(g.statusMix).sort((a, b) => b[1] - a[1]);
              const algumSelecionado = g.unidades.some(u => selecionados.has(u.id));
              const todosSelecionados = g.unidades.every(u => selecionados.has(u.id));
              return (
                <div
                  key={g.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setModalGrupo(g)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModalGrupo(g); } }}
                  className={`group bg-white border rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-300 transition overflow-hidden flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 ${algumSelecionado ? (todosSelecionados ? "border-emerald-500 ring-2 ring-emerald-200" : "border-emerald-300 ring-1 ring-emerald-100") : "border-slate-200"}`}
                  title={`${g.unidades.length} unidade(s) — clique para ver detalhes`}
                >
                  <div className={`h-1 bg-gradient-to-r ${accent}`} />
                  <div className="p-4 flex gap-3">
                    <input
                      type="checkbox"
                      checked={todosSelecionados}
                      ref={el => { if (el) el.indeterminate = algumSelecionado && !todosSelecionados; }}
                      onChange={() => {
                        const novo = new Set(selecionados);
                        if (todosSelecionados) g.unidades.forEach(u => novo.delete(u.id));
                        else g.unidades.forEach(u => novo.add(u.id));
                        setSelecionados(novo);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer flex-shrink-0"
                      title={todosSelecionados ? "Desmarcar todas as unidades do grupo" : "Marcar todas as unidades do grupo"}
                    />
                    {/* Rev. 2368 — Thumbnail: click NA foto AMPLIA (lightbox).
                        O botão "Trocar foto" virou badge no canto inferior
                        esquerdo pra não engolir o click inteiro. */}
                    {g.fotoUrl ? (
                      <div className="relative flex-shrink-0 group/foto">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLightbox({ url: g.fotoUrl!, titulo: g.descricao }); }}
                          className="block w-16 h-16 rounded-lg ring-1 ring-slate-200 overflow-hidden cursor-zoom-in relative"
                          title="Clique para ampliar a foto"
                          aria-label="Ampliar foto">
                          <img src={g.fotoUrl} className="w-full h-full object-cover" alt={g.descricao} loading="lazy" />
                          <div className="absolute inset-0 bg-black/0 group-hover/foto:bg-black/35 transition flex items-center justify-center opacity-0 group-hover/foto:opacity-100">
                            <ZoomIn className="h-4 w-4 text-white drop-shadow" />
                          </div>
                        </button>
                        {g.fotoIA && (
                          <span title="Imagem ilustrativa encontrada na web" className="absolute -top-1 -right-1 bg-pink-500 text-white rounded-full p-0.5 ring-2 ring-white shadow pointer-events-none">
                            <Sparkles className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {/* Rev. 2369 — Badge agora abre modal "Rebuscar com
                            outro termo" (descrição cripto do ERP costuma dar
                            foto errada; user edita o termo de busca). */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); abrirModalRebuscar("locado", g.descricao, g.fotoUrl); }}
                          disabled={buscandoDescricoes.has(g.descricao) || !!batchWeb}
                          className="absolute -bottom-1 -left-1 h-6 w-6 rounded-full bg-white ring-2 ring-white shadow-md text-sky-700 hover:bg-sky-50 flex items-center justify-center disabled:opacity-60 disabled:cursor-wait"
                          title="Trocar foto: digite um termo de busca melhor (ex.: 'esmerilhadeira angular 4 polegadas')"
                          aria-label="Trocar foto com outro termo de busca">
                          {buscandoDescricoes.has(g.descricao)
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <RefreshCw className="h-3 w-3" />}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); buscarFotoUma(g.descricao, false); }}
                        disabled={buscandoDescricoes.has(g.descricao) || !!batchWeb}
                        className="relative w-16 h-16 rounded-lg bg-slate-100 hover:bg-sky-50 ring-1 ring-slate-200 hover:ring-sky-300 flex items-center justify-center flex-shrink-0 transition disabled:cursor-wait group/foto"
                        title={`Buscar foto na web para "${g.descricao}"`}
                        aria-label="Buscar foto na web">
                        {buscandoDescricoes.has(g.descricao) ? (
                          <Loader2 className="h-5 w-5 text-sky-600 animate-spin" />
                        ) : (
                          <>
                            <Camera className="h-5 w-5 text-slate-400 group-hover/foto:text-sky-500 transition" />
                            <span className="absolute -bottom-1 -right-1 bg-sky-500 text-white rounded-full p-0.5 ring-2 ring-white shadow opacity-0 group-hover/foto:opacity-100 transition">
                              <Globe className="h-2.5 w-2.5" />
                            </span>
                          </>
                        )}
                      </button>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-900 truncate" title={g.descricao}>{g.descricao}</h3>
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" title={`${g.unidades.length} unidade(s) neste grupo`}>
                          <Boxes className="h-3 w-3" /> {fmtN(g.unidades.length)}<span className="font-normal opacity-80">un.</span>
                        </span>
                      </div>
                      <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {statusEntries.map(([s, n]) => (
                          <span key={s} className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[s] || "bg-slate-100"}`}>
                            {fmtN(n as number)} {STATUS_LABELS[s] || s}
                          </span>
                        ))}
                        {g.categoria && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFiltroCategoria(g.categoria!); }}
                            className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition"
                            title={`Filtrar por categoria "${g.categoria}"`}>
                            <Tag className="h-2.5 w-2.5" /> {g.categoria}
                          </button>
                        )}
                      </div>
                      {g.fornecedorNome && (
                        <div className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 truncate">
                          <Building2 className="h-3 w-3 text-slate-400" /> {g.fornecedorNome}
                        </div>
                      )}
                      <div className={`text-xs mt-1 flex items-center gap-1.5 truncate ${obraNome ? "text-emerald-700" : "text-amber-700"}`} title={obraNome || "Sem obra vinculada"}>
                        <MapPin className="h-3 w-3" />
                        {obraNome ? <span className="truncate font-medium">{obraNome}</span> : <span className="italic">Sem obra vinculada</span>}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="text-slate-600 flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                      <span title="Soma do valor mensal de todas as unidades do grupo">total mensal</span>
                    </div>
                    <div className="font-bold text-emerald-700">{fmtMoney(g.valorMensalTotal)}<span className="text-[10px] text-slate-500 font-normal">/mês</span></div>
                  </div>
                  <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-end gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setModalGrupo(g); }} className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md text-xs inline-flex items-center gap-1 font-medium transition" title={`Ver as ${g.unidades.length} unidades`}>
                      <Eye className="h-3.5 w-3.5" /> Ver {fmtN(g.unidades.length)} unidade(s)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {(data as any[]).map(l => {
              const fotos = (l.fotosRecebimentoJson as FotoItem[]) || [];
              // Rev. 2340 — fallback: se não houver fotos do recebimento, usa a foto buscada pela IA (fotoUrl).
              const fotoPrincipal = fotos[0]?.url || (l.fotoUrl as string | null) || null;
              const fotoIA = !fotos[0] && !!l.fotoUrl;
              const accent = l.status === "atrasado" ? "from-red-500 to-red-600"
                : l.status === "em_renovacao" ? "from-amber-500 to-amber-600"
                : l.status === "em_uso" ? "from-emerald-500 to-teal-600"
                : "from-slate-400 to-slate-500";
              const sel = selecionados.has(l.id);
              const obraNome = l.obraId ? obrasMap.get(Number(l.obraId)) : null;
              return (
                <div
                  key={l.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setModalEventos(l)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setModalEventos(l); } }}
                  className={`group bg-white border rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-emerald-300 transition overflow-hidden flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 ${sel ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200"}`}
                  title="Clique para abrir os detalhes completos"
                >
                  <div className={`h-1 bg-gradient-to-r ${accent}`} />
                  <div className="p-4 flex gap-3">
                    {/* Rev. 2323 — checkbox de multi-seleção (não propaga click) */}
                    <input type="checkbox" checked={sel} onChange={() => toggleSelecionado(l.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer flex-shrink-0" />
                    {fotoPrincipal ? (
                      <div className="relative flex-shrink-0 group/uphoto">
                        {/* Rev. 2368 — click NA foto amplia (lightbox), sem propagar click do card. */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setLightbox({ url: fotoPrincipal, titulo: l.descricao }); }}
                          className="block w-16 h-16 rounded-lg ring-1 ring-slate-200 overflow-hidden cursor-zoom-in relative"
                          title="Clique para ampliar a foto"
                          aria-label="Ampliar foto">
                          <img src={fotoPrincipal} className="w-full h-full object-cover" alt={l.descricao} loading="lazy" />
                          <div className="absolute inset-0 bg-black/0 group-hover/uphoto:bg-black/35 transition flex items-center justify-center opacity-0 group-hover/uphoto:opacity-100">
                            <ZoomIn className="h-4 w-4 text-white drop-shadow" />
                          </div>
                        </button>
                        {fotoIA && (
                          <span title="Imagem ilustrativa encontrada por IA" className="absolute -top-1 -right-1 bg-pink-500 text-white rounded-full p-0.5 ring-2 ring-white shadow pointer-events-none">
                            <Sparkles className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0">
                        <Camera className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-900 truncate" title={l.descricao}>{l.descricao}</h3>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${STATUS_COLORS[l.status] || "bg-slate-100"}`}>
                          {STATUS_LABELS[l.status] || l.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <Hash className="h-3 w-3" /> {l.codigoPatrimonioFornecedor || "s/ patr."}
                        {l.categoria ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFiltroCategoria(String(l.categoria)); }}
                            className="ml-1 inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition"
                            title={`Filtrar por categoria "${l.categoria}"`}>
                            <Tag className="h-2.5 w-2.5" /> {l.categoria}
                          </button>
                        ) : (
                          <span className="ml-1 inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full text-[10px] font-medium" title="Use o botão 'Categorizar com IA' no topo">
                            <Tag className="h-2.5 w-2.5" /> sem categoria
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 truncate">
                        <Building2 className="h-3 w-3 text-slate-400" /> {l.fornecedorNome || "Sem fornecedor"}
                      </div>
                      {/* Rev. 2323 — Linha da obra vinculada (ou aviso quando sem) */}
                      <div className={`text-xs mt-1 flex items-center gap-1.5 truncate ${obraNome ? "text-emerald-700" : "text-amber-700"}`} title={obraNome || "Sem obra vinculada"}>
                        <MapPin className="h-3 w-3" />
                        {obraNome ? <span className="truncate font-medium">{obraNome}</span> : <span className="italic">Sem obra vinculada</span>}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="text-slate-600 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      {fmtDate(l.dataInicio)} → <b className="text-slate-800">{fmtDate(l.dataFimPrevista)}</b>
                    </div>
                    <div className="font-bold text-emerald-700">{fmtMoney(l.valorMensal)}<span className="text-[10px] text-slate-500 font-normal">/mês</span></div>
                  </div>
                  <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-end gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setModalEventos(l); }} className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md text-xs inline-flex items-center gap-1 font-medium transition" title="Detalhes completos">
                      <Eye className="h-3.5 w-3.5" /> Detalhes
                    </button>
                    {l.status === "em_uso" && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setModalCheckin(l); setCheckinObs(""); }} className="text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md text-xs inline-flex items-center gap-1 font-medium transition" title="Check-in semanal">
                          <ClipboardCheck className="h-3.5 w-3.5" /> Check-in
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setModalDev(l); setDevFotos([]); setDevObs(""); setDevData(new Date().toISOString().slice(0, 10)); }}
                          className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md text-xs inline-flex items-center gap-1 font-medium transition" title="Devolver">
                          <RotateCcw className="h-3.5 w-3.5" /> Devolver
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rev. 2344 — Modal drill-down do GRUPO (descrição+obra). Lista as
          unidades individuais com ações idênticas ao card individual. */}
      {modalGrupo && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setEditandoObraGrupo(false); setModalGrupo(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-4 flex items-start justify-between gap-3 flex-shrink-0">
              <div className="flex items-start gap-3 min-w-0">
                {modalGrupo.fotoUrl ? (
                  <img src={modalGrupo.fotoUrl} className="w-14 h-14 rounded-lg object-cover ring-2 ring-white/40 flex-shrink-0" alt="" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-white/15 ring-2 ring-white/40 flex items-center justify-center flex-shrink-0">
                    <Boxes className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider opacity-80 font-bold">Grupo · {fmtN(modalGrupo.unidades.length)} unidade(s)</div>
                  <h2 className="text-lg font-bold truncate" title={modalGrupo.descricao}>{modalGrupo.descricao}</h2>
                  {/* Rev. 2516 — Linha OBRA com editor inline. Click no
                      lápis abre <select> + Salvar/Cancelar. Salva via
                      vincularLote pra TODAS as unidades do grupo. */}
                  <div className="text-xs opacity-90 mt-0.5">
                    {!editandoObraGrupo ? (
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          {modalGrupo.obraId ? (obrasMap.get(modalGrupo.obraId) || `Obra #${modalGrupo.obraId}`) : "Sem obra vinculada"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setNovaObraGrupo(modalGrupo.obraId ? String(modalGrupo.obraId) : "__null__");
                            setEditandoObraGrupo(true);
                          }}
                          className="ml-1 inline-flex items-center gap-1 bg-white/15 hover:bg-white/30 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full transition"
                          title="Editar obra do grupo"
                        >
                          <Pencil className="h-3 w-3" /> Editar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <select
                          value={novaObraGrupo}
                          onChange={e => setNovaObraGrupo(e.target.value)}
                          disabled={vincularLote.isPending}
                          className="text-slate-800 text-xs px-2 py-1 rounded-md border border-white/40 bg-white min-w-[200px] max-w-[300px] focus:outline-none focus:ring-2 focus:ring-white/60"
                        >
                          <option value="">— Selecione —</option>
                          <option value="__null__">— Sem obra vinculada —</option>
                          {((obrasAtivasQ.data || []) as any[]).map((o: any) => (
                            <option key={o.id} value={String(o.id)}>{o.nome}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!novaObraGrupo) { toast.error("Selecione uma obra (ou Sem obra)."); return; }
                            const obraId = novaObraGrupo === "__null__" ? null : (parseInt(novaObraGrupo) || null);
                            if (obraId === null && novaObraGrupo !== "__null__") { toast.error("Obra inválida."); return; }
                            const ids = modalGrupo.unidades.map((u: any) => Number(u.id));
                            try {
                              await vincularLote.mutateAsync({ companyId, ids, obraId });
                              await utils.equipamentos.locadosListar.invalidate();
                              toast.success(obraId === null
                                ? `${ids.length} unidade(s) desvinculada(s) da obra.`
                                : `${ids.length} unidade(s) vinculada(s) à obra "${obrasMap.get(obraId) || obraId}".`);
                              setEditandoObraGrupo(false);
                              setModalGrupo(null); // fecha pra recarregar a lista (key do grupo muda com obra)
                            } catch (e: any) {
                              toast.error(formatTrpcError(e));
                            }
                          }}
                          disabled={vincularLote.isPending || !novaObraGrupo}
                          className="inline-flex items-center gap-1 bg-white text-emerald-700 text-[11px] font-bold px-2.5 py-1 rounded-md hover:bg-emerald-50 disabled:opacity-50 transition"
                        >
                          {vincularLote.isPending ? "Salvando…" : "Salvar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditandoObraGrupo(false); setNovaObraGrupo(""); }}
                          disabled={vincularLote.isPending}
                          className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white text-[11px] font-medium px-2.5 py-1 rounded-md disabled:opacity-50 transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => { setEditandoObraGrupo(false); setModalGrupo(null); }} className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/15 transition flex-shrink-0" title="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-6 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0">
              <div className="bg-white rounded-lg p-2 ring-1 ring-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Unidades</div>
                <div className="text-lg font-bold text-slate-900">{fmtN(modalGrupo.unidades.length)}</div>
              </div>
              <div className="bg-white rounded-lg p-2 ring-1 ring-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total mensal</div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">{fmtMoney(modalGrupo.valorMensalTotal)}</div>
              </div>
              <div className="bg-white rounded-lg p-2 ring-1 ring-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Em uso</div>
                <div className="text-lg font-bold text-emerald-700">{fmtN(modalGrupo.statusMix["em_uso"] || 0)}</div>
              </div>
              <div className="bg-white rounded-lg p-2 ring-1 ring-slate-200">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Atrasadas</div>
                <div className={`text-lg font-bold ${(modalGrupo.statusMix["atrasado"] || 0) > 0 ? "text-red-600" : "text-slate-400"}`}>{fmtN(modalGrupo.statusMix["atrasado"] || 0)}</div>
              </div>
            </div>
            {/* Lista de unidades */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0 z-10 backdrop-blur-sm">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="px-4 py-2 font-semibold">Patrimônio</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold">Fornecedor</th>
                    <th className="px-4 py-2 font-semibold">Início → Fim</th>
                    <th className="px-4 py-2 font-semibold text-right">R$/mês</th>
                    <th className="px-4 py-2 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {modalGrupo.unidades.map((u: any, i: number) => (
                    <tr key={u.id} className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-emerald-50/40 transition`}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">{u.codigoPatrimonioFornecedor || <span className="italic text-slate-400">s/ patr.</span>}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${STATUS_COLORS[u.status] || "bg-slate-100"}`}>
                          {STATUS_LABELS[u.status] || u.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600 truncate max-w-[180px]" title={u.fornecedorNome || ""}>{u.fornecedorNome || "—"}</td>
                      <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{fmtDate(u.dataInicio)} → <b className="text-slate-800">{fmtDate(u.dataFimPrevista)}</b></td>
                      <td className="px-4 py-2 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{fmtMoney(u.valorMensal)}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => { setModalGrupo(null); setModalEventos(u); }} className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md text-[11px] inline-flex items-center gap-1 font-medium transition" title="Detalhes completos">
                            <Eye className="h-3 w-3" /> Detalhes
                          </button>
                          {u.status === "em_uso" && (
                            <>
                              <button onClick={() => { setModalGrupo(null); setModalCheckin(u); setCheckinObs(""); }} className="text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md text-[11px] inline-flex items-center gap-1 font-medium transition" title="Check-in semanal">
                                <ClipboardCheck className="h-3 w-3" />
                              </button>
                              <button onClick={() => { setModalGrupo(null); setModalDev(u); setDevFotos([]); setDevObs(""); setDevData(new Date().toISOString().slice(0, 10)); }} className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-md text-[11px] inline-flex items-center gap-1 font-medium transition" title="Devolver">
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 flex-shrink-0">
              <div>{fmtN(modalGrupo.unidades.length)} unidade(s) · {fmtMoney(modalGrupo.valorMensalTotal)}/mês total</div>
              <button onClick={() => setModalGrupo(null)} className="px-3 py-1.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium transition">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2518 — Modal de renomear LOCADORA (bulk update do fornecedorNome
          em todas as unidades cujo nome bate, case-insensitive). */}
      {renomearForn && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => !renomearFornMut.isPending && setRenomearForn(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-50 border-b-2 border-amber-200 px-5 py-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Truck className="h-5 w-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-amber-900">Renomear locadora</h3>
                <p className="text-xs text-amber-700">Corrige o nome do fornecedor em todas as unidades.</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Nome atual:</span>
                  <span className="font-semibold text-slate-800 truncate" title={renomearForn.nomeAtual}>{renomearForn.nomeAtual}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Unidades afetadas:</span>
                  <span className="font-bold text-amber-700">{fmtN(renomearForn.count)} unid.{renomearForn.valorMes > 0 ? ` · ${fmtMoney(renomearForn.valorMes)}/mês` : ""}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Novo nome do fornecedor</label>
                <input
                  type="text"
                  autoFocus
                  value={renomearForn.nomeNovo}
                  maxLength={255}
                  onChange={e => setRenomearForn(s => s ? { ...s, nomeNovo: e.target.value } : s)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && renomearForn.nomeNovo.trim() && !renomearFornMut.isPending) {
                      renomearFornMut.mutate({ companyId, nomeAtual: renomearForn.nomeAtual, nomeNovo: renomearForn.nomeNovo.trim() });
                    }
                  }}
                  placeholder="Ex: JALVES LOCAÇÕES LTDA"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500/30 outline-none"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-[11px] text-amber-900 leading-snug">
                <strong>ℹ Atenção:</strong> o novo nome substitui o atual em todas as unidades dessa locadora <strong>dentro do seu escopo de obras autorizadas</strong> (qualquer variação de maiúscula/minúscula). O preview de <strong>{fmtN(renomearForn.count)} unid.</strong> reflete os filtros atuais — a contagem final virá no aviso de sucesso. O almoxarifado é sincronizado automaticamente. Histórico de eventos preservado.
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setRenomearForn(null)}
                disabled={renomearFornMut.isPending}
                className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => renomearForn && renomearFornMut.mutate({ companyId, nomeAtual: renomearForn.nomeAtual, nomeNovo: renomearForn.nomeNovo.trim() })}
                disabled={renomearFornMut.isPending || !renomearForn.nomeNovo.trim() || renomearForn.nomeNovo.trim().toUpperCase() === renomearForn.nomeAtual.trim().toUpperCase()}
                className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {renomearFornMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Renomeando…</> : <><Pencil className="h-4 w-4" /> Renomear</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2325 — Modal de confirmação de exclusão em lote (bonito, substitui window.confirm) */}
      {confirmExcluir !== null && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmExcluir(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-red-50 border-b-2 border-red-200 px-5 py-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-red-900">Confirmar exclusão em lote</h3>
                <p className="text-xs text-red-700">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-700">
                Você está prestes a excluir <span className="font-bold text-red-700">{confirmExcluir.toLocaleString('pt-BR')} equipamento(s) locado(s)</span>.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-900">
                <strong>⚠ Atenção:</strong> Todo o histórico de eventos (recebimento, check-ins, devoluções) também será removido permanentemente do banco.
              </div>
              {confirmExcluir > CHUNK && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-900">
                  ℹ Como são mais de {CHUNK} itens, a exclusão será dividida em <strong>{Math.ceil(confirmExcluir / CHUNK)} etapas</strong> de até {CHUNK} de cada vez (limite do servidor).
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button onClick={() => setConfirmExcluir(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-white">Cancelar</button>
              <button onClick={executarExcluir} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Sim, excluir {confirmExcluir}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2325/2328 — Modal de progresso em lote.
          - chunks de 200 (Rev. 2328) p/ caber nos 60s do proxy Replit.
          - mostra spinner + tempo decorrido do lote atual pra UX não parecer travada
            (cada chunk leva ~10-20s no Neon, durante esse tempo a barra fica parada). */}
      {loteProgresso && (() => {
        const elapsedSec = Math.max(0, Math.floor((tickNow - loteProgresso.loteIniciadoEm) / 1000));
        const lentidao = elapsedSec >= 25;
        const previstoFeitos = loteProgresso.feitos + Math.min(loteProgresso.total - loteProgresso.feitos, CHUNK);
        return (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                {loteProgresso.acao === "vincular" ? <MapPin className="h-5 w-5 text-blue-600" /> : <Trash2 className="h-5 w-5 text-red-600" />}
                {loteProgresso.acao === "vincular" ? "Vinculando obras…" : "Excluindo equipamentos…"}
              </h3>
            </div>
            <div className="px-5 py-5 space-y-3">
              <div className="text-sm text-slate-700 flex items-center gap-2">
                <span className={`inline-block h-3 w-3 rounded-full border-2 border-transparent ${loteProgresso.acao === "vincular" ? "border-t-blue-600 border-r-blue-600" : "border-t-red-600 border-r-red-600"} animate-spin`} />
                <span>
                  Lote <strong>{loteProgresso.chunkAtual}</strong> de <strong>{loteProgresso.chunks}</strong> · {loteProgresso.feitos.toLocaleString('pt-BR')} de {loteProgresso.total.toLocaleString('pt-BR')} processados
                </span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${loteProgresso.acao === "vincular" ? "bg-blue-500" : "bg-red-500"} transition-all duration-300`}
                  style={{ width: `${Math.max(5, Math.min(100, (previstoFeitos / Math.max(1, loteProgresso.total)) * 100))}%` }}
                />
              </div>
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2.5">
                <div className="flex items-center justify-between">
                  <span>Lote atual em andamento…</span>
                  <span className="font-mono text-slate-700">{elapsedSec}s</span>
                </div>
                {lentidao && (
                  <div className="mt-1.5 text-amber-700">
                    O banco está demorando mais que o normal — aguarde, pode levar até 60s por lote.
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Processando em lotes de {CHUNK} itens (servidor aceita até 500, mas reduzimos pra evitar timeout). Não feche essa janela.
              </p>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Rev. 2325 — Modal de erro em lote (persistente, substitui toast invisível) */}
      {loteErro && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setLoteErro(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-red-50 border-b-2 border-red-200 px-5 py-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="font-bold text-red-900">Erro na operação em lote</h3>
            </div>
            <div className="px-5 py-4">
              <pre className="text-xs text-slate-800 whitespace-pre-wrap font-mono bg-slate-50 border border-slate-200 rounded p-3 max-h-60 overflow-auto">{loteErro}</pre>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button onClick={() => setLoteErro(null)} className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-900 text-white rounded-md font-semibold">Entendi</button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2323 — Action bar flutuante (sticky bottom) quando há seleção */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-emerald-500 shadow-2xl">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{fmtN(selecionados.size)}</span>
              selecionado(s)
            </div>
            <div className="flex-1 flex flex-wrap items-center gap-2 min-w-[260px]">
              <select value={obraParaVincular} onChange={e => setObraParaVincular(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none min-w-[200px]">
                <option value="">— escolher obra —</option>
                {((obrasAtivasQ.data || []) as any[]).map(o => (
                  <option key={o.id} value={String(o.id)}>{o.nome}</option>
                ))}
                <option value="__null__">⊘ Desvincular obra</option>
              </select>
              <button onClick={confirmarVincular}
                disabled={!obraParaVincular || vincularLote.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md inline-flex items-center gap-1 font-medium">
                <MapPin className="h-4 w-4" /> {vincularLote.isPending ? "Vinculando…" : "Vincular"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelecionados(new Set())} className="px-3 py-1.5 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={confirmarExcluir} disabled={!!loteProgresso}
                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md inline-flex items-center gap-1 font-medium">
                <Trash2 className="h-4 w-4" /> Excluir {fmtN(selecionados.size)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal receber locação — seções com ícones.
          Rev. 2465 — 2 etapas (dados+fotos → assinaturas + comprovante PDF)
          espelhando o fluxo da devolução. Etapa 2 só ativa no fluxo manual
          (importação em lote do PDF pula direto pra cadastro). */}
      {modal && (() => {
        const noFluxoImport = importQueue.length > 0 || importTotal > 0;
        const titulo = noFluxoImport
          ? `Cadastrar Equipamento Alugado (${importTotal - importQueue.length} de ${importTotal})`
          : `Receber Locação na Obra · Etapa ${recEtapa}/2`;
        const saveLbl = noFluxoImport
          ? (importQueue.length > 0 ? "Salvar e próximo" : "Confirmar recebimento")
          : (recEtapa === 1 ? "Avançar para assinaturas →" : "Confirmar recebimento");
        return (
        <Modal title={titulo} onClose={() => { setModal(false); setOcSelecionada(null); resetRecAssinaturas(); }} onSave={salvar} loading={criar.isPending} saveLabel={saveLbl}>
          {!noFluxoImport && (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <div className={`flex-1 h-1.5 rounded-full ${recEtapa >= 1 ? "bg-emerald-500" : "bg-slate-200"}`} />
              <div className={`flex-1 h-1.5 rounded-full ${recEtapa >= 2 ? "bg-emerald-500" : "bg-slate-200"}`} />
            </div>
          )}
          {/* ───── ETAPA 1 (dados+fotos) ou modo importação em lote ───── */}
          {(noFluxoImport || recEtapa === 1) && (<>
          {/* Rev. 2374 — Banner da fila de importação do Almoxarifado */}
          {importTotal > 0 && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-lg px-3 py-2 flex items-center gap-3 -mt-1 mb-2">
              <Truck className="h-5 w-5 text-orange-700 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-orange-900">
                  Importando do Almoxarifado · {importTotal - importQueue.length} de {importTotal}
                </p>
                <p className="text-[11px] text-orange-700/90 leading-tight">
                  Preencha fornecedor, datas e ajuste a foto. Restam {importQueue.length} equipamento{importQueue.length !== 1 ? "s" : ""} na fila.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setImportQueue([]); setImportTotal(0); toast.info("Importação cancelada."); }}
                className="text-xs text-orange-700 hover:text-orange-900 font-medium underline"
              >
                Parar fila
              </button>
            </div>
          )}
          {/* Rev. 2371 — OCs de locação pendentes de recebimento. Almoxarife clica
              numa OC pra pré-preencher o form (descrição, fornecedor, datas, valor)
              e vincular o equipamento à OC via ordemCompraId. */}
          {(() => {
            const ocs = (ocsPendentesQ.data || []) as any[];
            if (ocsPendentesQ.isLoading) {
              return (
                <Section icon={FileText} title="Ordens de Compra pendentes de recebimento" tint="violet">
                  <div className="text-xs text-slate-500 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Buscando OCs de locação aprovadas…</div>
                </Section>
              );
            }
            if (ocs.length === 0 && !ocSelecionada) return null; // sem OCs e sem seleção → esconde seção, fluxo manual normal
            return (
              <Section icon={FileText} title={`Ordens de Compra pendentes${ocs.length ? ` (${ocs.length})` : ""}`} tint="violet">
                {ocSelecionada ? (
                  <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50/60 p-3 flex items-start gap-3">
                    <div className="rounded-full bg-emerald-500 text-white p-1.5 flex-shrink-0"><Check className="h-3.5 w-3.5" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-emerald-900">Recebendo OC <span className="font-mono">{formatNumeroOcDisplay(ocSelecionada.numeroOc)}</span></div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">Os campos abaixo foram pré-preenchidos a partir da OC. Confira, anexe a(s) foto(s) e confirme.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setOcSelecionada(null); setForm({ ...EMPTY }); }}
                      className="text-xs text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap"
                      title="Limpar OC selecionada e voltar ao modo manual">
                      Trocar OC
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-500 mb-2">Clique numa OC pra preencher automaticamente os dados do equipamento abaixo.</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {ocs.map((oc: any) => {
                        const it0 = (oc.itens || [])[0];
                        const qtdItens = (oc.itens || []).length;
                        return (
                          <button
                            key={oc.id}
                            type="button"
                            onClick={() => receberDaOC(oc)}
                            className="w-full text-left rounded-lg border border-violet-200 hover:border-violet-400 hover:bg-violet-50/60 bg-white p-3 transition group">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[10px] font-bold uppercase tracking-wider">
                                  <FileText className="h-2.5 w-2.5" /> OC {formatNumeroOcDisplay(oc.numeroOc)}
                                </span>
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                  {oc.status}
                                </span>
                              </div>
                              {oc.total != null && (
                                <span className="text-xs font-bold text-emerald-700 whitespace-nowrap">{fmtMoney(Number(oc.total))}</span>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-slate-800 truncate">
                              {it0?.descricao || "(sem descrição de item)"}
                              {qtdItens > 1 && <span className="text-[11px] font-normal text-slate-500"> +{qtdItens - 1} item(s)</span>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                              {oc.fornecedorNome && (
                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {oc.fornecedorNome}</span>
                              )}
                              {(oc.locacaoDataInicio || oc.locacaoDataFim) && (
                                <span className="inline-flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> {oc.locacaoDataInicio ? fmtDate(oc.locacaoDataInicio) : "—"} → {oc.locacaoDataFim ? fmtDate(oc.locacaoDataFim) : "—"}
                                </span>
                              )}
                              {oc.locacaoDuracaoDias && (
                                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {oc.locacaoDuracaoDias}d</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </Section>
            );
          })()}

          <Section icon={Truck} title="Equipamento" tint="emerald">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Descrição *"><input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className="inp" placeholder="Ex: Betoneira 400L" /></Field>
              <Field label="Categoria"><input value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} className="inp" placeholder="Ex: Equipamento de concretagem" /></Field>
              <Field label="Patrim. do fornecedor"><input value={form.codigoPatrimonioFornecedor} onChange={e => setForm(p => ({ ...p, codigoPatrimonioFornecedor: e.target.value }))} className="inp" /></Field>
              <Field label="N° de série"><input value={form.numeroSerie} onChange={e => setForm(p => ({ ...p, numeroSerie: e.target.value }))} className="inp" /></Field>
              <Field label="Código interno ERP"><input value={form.codigoInternoErp} onChange={e => setForm(p => ({ ...p, codigoInternoErp: e.target.value }))} className="inp" /></Field>
            </div>
          </Section>

          <Section icon={Building2} title="Fornecedor (locadora)" tint="blue">
            <Field label="Nome do fornecedor"><input value={form.fornecedorNome} onChange={e => setForm(p => ({ ...p, fornecedorNome: e.target.value }))} className="inp" placeholder="Ex: Jalves Locações" /></Field>
          </Section>

          <Section icon={Calendar} title="Período & Valores" tint="amber">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Data início *"><input type="date" value={form.dataInicio} onChange={e => setForm(p => ({ ...p, dataInicio: e.target.value }))} className="inp" /></Field>
              <Field label="Data fim prevista *"><input type="date" value={form.dataFimPrevista} onChange={e => setForm(p => ({ ...p, dataFimPrevista: e.target.value }))} className="inp" /></Field>
              <Field label="Valor diário (R$)"><input value={form.valorDiario} onChange={e => setForm(p => ({ ...p, valorDiario: e.target.value }))} placeholder="0,00" className="inp" /></Field>
              <Field label="Valor mensal (R$)"><input value={form.valorMensal} onChange={e => setForm(p => ({ ...p, valorMensal: e.target.value }))} placeholder="0,00" className="inp" /></Field>
            </div>
          </Section>

          <Section icon={UserIcon} title="Responsabilidade & Observações" tint="slate">
            <Field label="Funcionário responsável">
              <input value={form.funcionarioResponsavelNome} onChange={e => setForm(p => ({ ...p, funcionarioResponsavelNome: e.target.value }))} className="inp" />
            </Field>
            <Field label="Observações">
              <textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} className="inp" placeholder="Estado de conservação, acessórios recebidos, etc." />
            </Field>
          </Section>

          <Section icon={Camera} title="Fotos do recebimento *" tint="red">
            <p className="text-xs text-slate-500 mb-2">Foto obrigatória — comprovação visual do estado do equipamento ao chegar na obra.</p>
            <FotosUploader fotos={fotos} onChange={setFotos} label="" required />
          </Section>
          </>)}

          {/* ───── ETAPA 2 (assinaturas + comprovante PDF) — Rev. 2465 ───── */}
          {!noFluxoImport && recEtapa === 2 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">
                  Colete a assinatura de quem entregou (locadora) e de quem recebeu (FC). Será gerado um comprovante PDF compartilhável via WhatsApp.
                </p>
                <button type="button" onClick={() => setRecEtapa(1)} className="text-xs text-slate-500 hover:text-slate-700 underline whitespace-nowrap ml-2">← Voltar</button>
              </div>
              {ocSelecionada && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 mb-3 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                  <p className="text-[11px] text-emerald-800">
                    Esta locação está vinculada à OC <span className="font-mono font-bold">{formatNumeroOcDisplay(ocSelecionada.numeroOc)}</span> — o número aparecerá no comprovante PDF.
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 mb-3">
                <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide mb-2">Entregador (Locadora)</p>
                <Field label="Nome do responsável da locadora*">
                  <input type="text" value={recEntNome} onChange={e => setRecEntNome(e.target.value)} className="inp" placeholder="Quem está entregando o equipamento na obra" />
                </Field>
                <SignaturePad value={recEntSig} onChange={setRecEntSig} label="Assinatura*" />
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2">Recebedor (FC Engenharia)</p>
                <Field label="Nome completo*">
                  <input type="text" value={recRecNome} onChange={e => setRecRecNome(e.target.value)} className="inp" placeholder="Quem está conferindo e recebendo pela FC" />
                </Field>
                <SignaturePad value={recRecSig} onChange={setRecRecSig} label="Assinatura*" />
              </div>
            </>
          )}
        </Modal>
        );
      })()}

      {/* Rev. 2372 — PICKER VISUAL DE DEVOLUÇÃO. Aberto pelo botão
          "DEVOLVER LOCAÇÃO" do Almoxarifado (?action=devolver) ou pelo botão
          hero da própria página. Mostra cards GRANDES com foto + descrição
          enorme + obra + fornecedor de cada equipamento "em_uso", ordenados
          por urgência (atrasado > vencendo > normal). Operador clica num
          card → fecha o picker e abre direto o modalDev (fluxo existente).
          Foco: 2 cliques (escolher + confirmar). Pensado para operador com
          baixa familiaridade — botão único enorme por card, sem busca
          obrigatória, sem rolagem horizontal, sem filtros adicionais. */}
      {pickerDevolver && (() => {
        // Rev. 2420 — picker com MULTI-SELEÇÃO. Tap no card alterna seleção;
        // botão "DEVOLVER ESTE" do card preserva atalho single (1-toque).
        // Sticky bar inferior surge quando há ≥1 selecionado, com CTA grande
        // "Devolver N selecionados" → abre `modalDevLote` (1 data, 1 foto,
        // 1 obs comuns). Lista vem do `locadosListar` que já filtra por
        // obras permitidas (Rev. 2420 backend) — encarregado de obra A não
        // vê mais equipamento de obra B aqui.
        // Rev. 2452 — Picker respeita `filtroObra` quando setado (vem do
        // botão DEVOLVER LOCAÇÃO do Almoxarifado com `?obraId=X`). Antes,
        // user no contexto da obra Y via os 1.314 itens de TODAS as obras
        // e podia devolver da obra errada por engano.
        const emUsoTodas = (dataAll as any[]).filter(l => l.status === "em_uso");
        const obraIdLock = filtroObra && /^\d+$/.test(filtroObra) ? Number(filtroObra) : null;
        const emUso = obraIdLock !== null
          ? emUsoTodas.filter(l => Number(l.obraId) === obraIdLock)
          : emUsoTodas;
        const nomeObraLock = obraIdLock !== null ? (obrasMap.get(obraIdLock) || `Obra #${obraIdLock}`) : null;
        const hoje = Date.now();
        const busca = pickerDevolverBusca.trim().toLowerCase();
        const filtrados = busca
          ? emUso.filter(l =>
              String(l.descricao || "").toLowerCase().includes(busca) ||
              String(l.fornecedorNome || "").toLowerCase().includes(busca) ||
              String(l.codigoPatrimonioFornecedor || "").toLowerCase().includes(busca) ||
              String(obrasMap.get(Number(l.obraId)) || "").toLowerCase().includes(busca)
            )
          : emUso;
        const ordenados = [...filtrados].sort((a, b) => {
          const fa = new Date(a.dataFimPrevista || 0).getTime() || Infinity;
          const fb = new Date(b.dataFimPrevista || 0).getTime() || Infinity;
          return fa - fb;
        });
        function escolherSingle(l: any) {
          // Rev. 2454 — DEVOLVER ESTE agora também passa pelo modal de
          // lote (com 1 item só) pra ganhar assinaturas + comprovante PDF.
          // Bug anterior: fecharPickerDevolver() navegava pro Almox antes
          // do modalDev abrir (quando aberto via ?action=devolver) — a tela
          // simplesmente "fechava". Solução: fecha SÓ o picker (sem navegar)
          // e abre o modal de lote com [l].
          setPickerDevolver(false);
          setSelecionadosLote(new Set());
          setPickerDevolverBusca("");
          setDevLoteFotos([]);
          setDevLoteObs("");
          setDevLoteEtapa(1);
          // Rev. 2456 — autofill entregador com user logado (operador FC).
          setDevLoteEntNome((meAuth as any)?.name || ""); setDevLoteEntSig(null);
          setDevLoteRecNome(""); setDevLoteRecSig(null);
          setDevLoteData(new Date().toISOString().slice(0, 10));
          setModalDevLote([l]);
        }
        function toggleSelecionado(id: number) {
          setSelecionadosLote(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        }
        const idsVisiveis = ordenados.map(l => Number(l.id));
        const todosVisiveisSelecionados = idsVisiveis.length > 0 && idsVisiveis.every(id => selecionadosLote.has(id));
        function toggleSelecionarTodosVisiveis() {
          setSelecionadosLote(prev => {
            const next = new Set(prev);
            if (todosVisiveisSelecionados) {
              for (const id of idsVisiveis) next.delete(id);
            } else {
              for (const id of idsVisiveis) next.add(id);
            }
            return next;
          });
        }
        function abrirModalDevLote() {
          const selecionados = (dataAll as any[]).filter(l => selecionadosLote.has(Number(l.id)) && l.status === "em_uso");
          if (selecionados.length === 0) return;
          setModalDevLote(selecionados);
          setDevLoteFotos([]);
          setDevLoteObs("");
          setDevLoteData(new Date().toISOString().slice(0, 10));
          // Rev. 2456 — autofill entregador com user logado (operador FC).
          setDevLoteEntNome((meAuth as any)?.name || "");
          setDevLoteEntSig(null);
          setDevLoteRecNome(""); setDevLoteRecSig(null);
          setDevLoteEtapa(1);
        }
        const qtdSel = selecionadosLote.size;
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-stretch justify-center p-0 sm:p-4" onClick={() => fecharPickerDevolver()}>
            <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-5xl max-h-full sm:max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header laranja grande pra ficar óbvio */}
              <div className="px-5 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-white/20 rounded-xl p-2.5 flex-shrink-0"><RotateCcw className="h-6 w-6" /></div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-lg sm:text-xl leading-tight truncate">Qual equipamento vai devolver?</h2>
                    <p className="text-[12px] sm:text-sm text-orange-50 leading-tight">Toque pra selecionar vários (ou use <b>DEVOLVER ESTE</b> pra 1 só).</p>
                  </div>
                </div>
                <button onClick={() => fecharPickerDevolver()} className="bg-white/20 hover:bg-white/30 rounded-full p-2 flex-shrink-0" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Busca + selecionar todos */}
              <div className="px-4 sm:px-5 pt-3 pb-2 bg-orange-50/40 border-b border-orange-100 space-y-2">
                {/* Rev. 2452 — Banner verde quando o picker veio com obra
                    travada do Almoxarifado (?obraId=X). Deixa explícito
                    pro user qual obra está sendo mostrada e dá um CTA pra
                    ver todas (ex.: equipamento veio devolvido por engano
                    pra outra obra e ele precisa achar). */}
                {nomeObraLock && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50 border-2 border-emerald-300">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 text-emerald-700 flex-shrink-0" />
                      <span className="text-[12px] sm:text-sm text-emerald-900 leading-tight min-w-0">
                        Mostrando apenas equipamentos da obra <b className="break-words">{nomeObraLock}</b>
                        <span className="text-emerald-700"> · {emUso.length} item{emUso.length !== 1 ? "ns" : ""}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => setFiltroObra("")}
                      className="text-[11px] sm:text-xs font-bold text-emerald-800 hover:text-emerald-900 underline underline-offset-2 flex-shrink-0"
                      title="Mostrar equipamentos de TODAS as obras permitidas"
                    >
                      Ver todas
                    </button>
                  </div>
                )}
                {emUso.length > 6 && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-orange-500" />
                    <input
                      autoFocus={false}
                      value={pickerDevolverBusca}
                      onChange={e => setPickerDevolverBusca(e.target.value)}
                      placeholder="Buscar por nome, obra ou fornecedor…"
                      className="w-full pl-11 pr-10 py-3 text-base border-2 border-orange-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-200 rounded-xl outline-none"
                    />
                    {pickerDevolverBusca && (
                      <button onClick={() => setPickerDevolverBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-200 hover:bg-slate-300 rounded-full p-1.5" aria-label="Limpar busca">
                        <X className="h-3.5 w-3.5 text-slate-700" />
                      </button>
                    )}
                  </div>
                )}
                {ordenados.length > 0 && (
                  <div className="flex items-center justify-between gap-2 text-[12px] sm:text-sm">
                    <button
                      onClick={toggleSelecionarTodosVisiveis}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-orange-300 bg-white hover:bg-orange-50 text-orange-800 font-semibold transition">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 ${todosVisiveisSelecionados ? "bg-orange-500 border-orange-500 text-white" : "border-orange-400 bg-white"}`}>
                        {todosVisiveisSelecionados && <Check className="h-3.5 w-3.5" />}
                      </span>
                      {todosVisiveisSelecionados ? "Desmarcar todos visíveis" : `Selecionar todos visíveis (${idsVisiveis.length})`}
                    </button>
                    {qtdSel > 0 && (
                      <button
                        onClick={() => setSelecionadosLote(new Set())}
                        className="text-slate-600 hover:text-slate-900 underline underline-offset-2">
                        Limpar seleção ({qtdSel})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Lista de cards GRANDES */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5">
                {ordenados.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 mb-4">
                      <Boxes className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="text-slate-700 font-semibold text-lg">
                      {busca ? "Nenhum equipamento encontrado" : "Nenhum equipamento em locação"}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {busca ? "Tente outro nome ou apague a busca." : "Não há nada pra devolver agora."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {ordenados.map((l: any) => {
                      const fotos = (l.fotosRecebimentoJson as FotoItem[]) || [];
                      const fotoUrl = fotos[0]?.url || l.fotoUrl || null;
                      const obraNome = l.obraId ? obrasMap.get(Number(l.obraId)) : null;
                      const fim = l.dataFimPrevista ? new Date(l.dataFimPrevista).getTime() : null;
                      const ini = l.dataInicio ? new Date(l.dataInicio).getTime() : null;
                      const diasUso = ini ? Math.max(0, Math.floor((hoje - ini) / 86400000)) : null;
                      const atrasado = fim != null && fim < hoje;
                      const vencendo5 = fim != null && fim >= hoje && fim < hoje + 5 * 86400000;
                      const badgeTint = atrasado
                        ? "bg-red-600 text-white"
                        : vencendo5
                        ? "bg-amber-500 text-white"
                        : "bg-emerald-100 text-emerald-800";
                      const badgeText = atrasado
                        ? "ATRASADO"
                        : vencendo5
                        ? "VENCE EM BREVE"
                        : "EM USO";
                      const isSel = selecionadosLote.has(Number(l.id));
                      return (
                        <div
                          key={l.id}
                          onClick={() => toggleSelecionado(Number(l.id))}
                          className={`group relative text-left bg-white border-2 hover:shadow-lg rounded-2xl overflow-hidden transition active:scale-[0.98] cursor-pointer ${isSel ? "border-orange-500 ring-4 ring-orange-200 shadow-md" : "border-slate-200 hover:border-orange-400"}`}>
                          {/* Checkbox grande no canto */}
                          <div className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-xl border-2 flex items-center justify-center shadow ${isSel ? "bg-orange-500 border-orange-500 text-white" : "bg-white/90 border-slate-300 text-transparent"}`}>
                            <Check className="h-5 w-5" />
                          </div>
                          <div className="flex gap-3 p-3">
                            {/* Foto grande quadrada */}
                            <div className="w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center">
                              {fotoUrl ? (
                                <img src={fotoUrl} alt={l.descricao} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <Camera className="h-10 w-10 text-slate-300" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pr-10">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${badgeTint} mb-1`}>{badgeText}</span>
                              <div className="font-bold text-base sm:text-lg text-slate-900 leading-tight line-clamp-2">
                                {l.descricao || "(sem descrição)"}
                              </div>
                              {/* Rev. 2449 — Obra com destaque ALTO (chip
                                  verde sólido). Operador precisa ENXERGAR
                                  a obra antes de confirmar baixa pra não
                                  devolver equipamento de obra errada.
                                  "Sem obra" vira chip amber pra contraste. */}
                              {obraNome ? (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-[13px] sm:text-sm shadow-sm">
                                  <MapPin className="h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">{obraNome}</span>
                                </div>
                              ) : (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-900 font-bold text-[13px]">
                                  <MapPin className="h-4 w-4 flex-shrink-0" /> Sem obra cadastrada
                                </div>
                              )}
                              {l.fornecedorNome && (
                                <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-600 truncate">
                                  <Building2 className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{l.fornecedorNome}</span>
                                </div>
                              )}
                              {(l.codigoPatrimonioFornecedor || l.numeroSerie) && (
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 truncate font-mono">
                                  <Hash className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{l.codigoPatrimonioFornecedor || l.numeroSerie}</span>
                                </div>
                              )}
                              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                                {diasUso != null && (
                                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {diasUso}d na obra</span>
                                )}
                                {fim != null && (
                                  <span className={`inline-flex items-center gap-1 ${atrasado ? "text-red-700 font-semibold" : ""}`}>
                                    <Calendar className="h-3 w-3" /> fim: {fmtDate(l.dataFimPrevista)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Footer "DEVOLVER ESTE" — atalho 1-toque (single), não conta a seleção */}
                          <button
                            onClick={(e) => { e.stopPropagation(); escolherSingle(l); }}
                            className="w-full px-4 py-2.5 bg-orange-50 hover:bg-orange-100 border-t border-orange-100 flex items-center justify-between transition">
                            <span className="text-orange-800 font-bold text-sm tracking-wide">DEVOLVER ESTE</span>
                            <div className="bg-orange-500 hover:bg-orange-600 text-white rounded-full p-1.5 transition">
                              <RotateCcw className="h-4 w-4" />
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer: sticky bar de lote quando há seleção, senão contador + cancelar */}
              {qtdSel > 0 ? (
                <div className="px-4 sm:px-5 py-3 border-t bg-orange-50 flex items-center justify-between gap-3 shadow-[0_-4px_12px_rgba(249,115,22,0.12)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-orange-500 text-white font-bold text-sm flex-shrink-0">{fmtN(qtdSel)}</span>
                    <p className="text-sm text-orange-900 font-semibold truncate">
                      {qtdSel === 1 ? "1 equipamento selecionado" : `${fmtN(qtdSel)} equipamentos selecionados`}
                    </p>
                  </div>
                  <button
                    onClick={abrirModalDevLote}
                    className="px-5 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl font-bold text-sm sm:text-base shadow-lg inline-flex items-center gap-2 flex-shrink-0">
                    <RotateCcw className="h-5 w-5" />
                    <span className="hidden sm:inline">Devolver selecionados</span>
                    <span className="sm:hidden">Devolver {fmtN(qtdSel)}</span>
                  </button>
                </div>
              ) : (
                <div className="px-4 sm:px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-3">
                  <p className="text-xs sm:text-sm text-slate-600">
                    {ordenados.length === emUso.length
                      ? <><b>{fmtN(emUso.length)}</b> equipamento(s) em locação</>
                      : <><b>{fmtN(ordenados.length)}</b> de {fmtN(emUso.length)} mostrado(s)</>}
                  </p>
                  <button onClick={() => fecharPickerDevolver()} className="px-4 py-2 text-sm border-2 border-slate-300 hover:bg-slate-100 rounded-lg font-semibold text-slate-700">
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Rev. 2420 — Modal de devolução em LOTE. 1 data + 1 set de fotos +
          1 observação comuns aplicados a todos os ids em `modalDevLote`. */}
      {modalDevLote && modalDevLote.length > 0 && (
        <Modal
          title={`Devolver ${modalDevLote.length} equipamento(s) · Etapa ${devLoteEtapa}/2`}
          onClose={() => { setModalDevLote(null); setDevLoteEtapa(1); }}
          onSave={avancarOuDevolverLote}
          saveLabel={devLoteEtapa === 1 ? "Avançar para assinaturas →" : `Confirmar devolução (${modalDevLote.length})`}
          loading={devolverLote.isPending}>
          {/* Stepper */}
          <div className="flex items-center gap-2 mb-3 text-xs">
            <div className={`flex-1 h-1.5 rounded-full ${devLoteEtapa >= 1 ? "bg-orange-500" : "bg-slate-200"}`} />
            <div className={`flex-1 h-1.5 rounded-full ${devLoteEtapa >= 2 ? "bg-orange-500" : "bg-slate-200"}`} />
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3 max-h-40 overflow-y-auto">
            <p className="text-xs font-bold text-orange-800 mb-1.5 uppercase tracking-wide">Selecionados:</p>
            <ul className="text-[13px] text-slate-700 space-y-0.5">
              {modalDevLote.slice(0, 12).map((l: any) => (
                <li key={l.id} className="truncate">
                  • <b>{l.descricao || "(sem descrição)"}</b>
                  {l.codigoPatrimonioFornecedor && <span className="text-slate-500 font-mono"> #{l.codigoPatrimonioFornecedor}</span>}
                  {l.obraId && obrasMap.get(Number(l.obraId)) && <span className="text-emerald-700"> · {obrasMap.get(Number(l.obraId))}</span>}
                </li>
              ))}
              {modalDevLote.length > 12 && <li className="text-slate-500 italic">+ {modalDevLote.length - 12} outro(s)…</li>}
            </ul>
          </div>

          {devLoteEtapa === 1 && (
            <>
              <Field label="Data devolução*">
                <input type="date" value={devLoteData} onChange={e => setDevLoteData(e.target.value)} className="inp" />
              </Field>
              <Field label="Observação (aplicada a todos)">
                <textarea value={devLoteObs} onChange={e => setDevLoteObs(e.target.value)} rows={2} className="inp" />
              </Field>
              <FotosUploader fotos={devLoteFotos} onChange={setDevLoteFotos} label="Fotos de devolução (aplicadas a todos)" required />
            </>
          )}

          {devLoteEtapa === 2 && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-600">
                  Colete a assinatura de quem entregou (FC) e de quem recebeu (locadora). Será gerado um comprovante PDF compartilhável via WhatsApp.
                </p>
                <button type="button" onClick={() => setDevLoteEtapa(1)} className="text-xs text-slate-500 hover:text-slate-700 underline whitespace-nowrap ml-2">← Voltar</button>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-3">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-2">Entregador (FC Engenharia)</p>
                <Field label="Nome completo*">
                  <input type="text" value={devLoteEntNome} onChange={e => setDevLoteEntNome(e.target.value)} className="inp" placeholder="Quem está entregando o equipamento" />
                </Field>
                <SignaturePad value={devLoteEntSig} onChange={setDevLoteEntSig} label="Assinatura*" />
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide mb-2">Recebedor (Locadora)</p>
                <Field label="Nome do responsável da locadora*">
                  <input type="text" value={devLoteRecNome} onChange={e => setDevLoteRecNome(e.target.value)} className="inp" placeholder="Quem está recebendo pela locadora" />
                </Field>
                <SignaturePad value={devLoteRecSig} onChange={setDevLoteRecSig} label="Assinatura*" />
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Rev. 2453 — Modal pós-sucesso: compartilhar/baixar/ver comprovante PDF.
          Rev. 2465 — Textos condicionais por `tipo` (devolução vs recebimento). */}
      {modalShareComprovante && (() => {
        const ehRecebimento = modalShareComprovante.tipo === "recebimento";
        const tituloModal = ehRecebimento ? "Comprovante de recebimento gerado" : "Comprovante de devolução gerado";
        const linhaSucesso = ehRecebimento
          ? `${modalShareComprovante.qtd} equipamento(s) recebido(s) com sucesso.`
          : `${modalShareComprovante.qtd} equipamento(s) devolvido(s) com sucesso.`;
        const ctaText = ehRecebimento
          ? "Compartilhe o comprovante assinado com a locadora (rastreio do que foi entregue):"
          : "Compartilhe o comprovante assinado com a locadora:";
        const tituloShare = ehRecebimento ? "Comprovante de recebimento" : "Comprovante de devolução";
        const textoShare = ehRecebimento
          ? `Comprovante de recebimento de equipamentos · FC Engenharia\n${modalShareComprovante.url}`
          : `Comprovante de devolução de equipamentos · FC Engenharia\n${modalShareComprovante.url}`;
        // No recebimento NÃO existe fluxo "volta pro Almox" — só fecha o modal.
        const fechar = () => {
          setModalShareComprovante(null);
          if (!ehRecebimento) voltarParaAlmoxSeNecessario();
        };
        return (
        <Modal
          title={tituloModal}
          onClose={fechar}
          saveLabel="Fechar"
          onSave={fechar}
        >
          <div className="text-center py-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 mb-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {linhaSucesso}
            </p>
            <p className="text-xs text-slate-500 mt-1">{ctaText}</p>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={async () => {
                const url = modalShareComprovante.url;
                const txt = textoShare;
                // Tenta Web Share API (mobile); senão abre WhatsApp Web.
                if ((navigator as any).share) {
                  try {
                    await (navigator as any).share({ title: tituloShare, text: txt, url });
                    return;
                  } catch { /* user cancelou — segue p/ wa.me */ }
                }
                window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 text-sm"
            >
              📱 Compartilhar via WhatsApp
            </button>
            <a
              href={modalShareComprovante.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm border border-slate-300"
            >
              <Eye className="w-4 h-4" /> Visualizar PDF
            </a>
            <a
              href={modalShareComprovante.url}
              download
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm border border-slate-300"
            >
              <FileText className="w-4 h-4" /> Baixar PDF
            </a>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(modalShareComprovante.url);
                toast.success("Link copiado!");
              }}
              className="w-full text-slate-500 hover:text-slate-700 text-xs underline py-1"
            >
              Copiar link
            </button>
          </div>
        </Modal>
        );
      })()}

      {/* Modal devolução */}
      {modalDev && (
        <Modal title={`Devolver: ${modalDev.descricao}`} onClose={() => { setModalDev(null); voltarParaAlmoxSeNecessario(); /* Rev. 2449 */ }} onSave={fazerDevolucao}
          saveLabel="Confirmar devolução" loading={devolver.isPending}>
          <Field label="Data devolução*">
            <input type="date" value={devData} onChange={e => setDevData(e.target.value)} className="inp" />
          </Field>
          <Field label="Observação">
            <textarea value={devObs} onChange={e => setDevObs(e.target.value)} rows={2} className="inp" />
          </Field>
          <FotosUploader fotos={devFotos} onChange={setDevFotos} label="Fotos de devolução" required />
        </Modal>
      )}

      {/* Modal check-in */}
      {/* Rev. 2460 — Modal de auditoria pra desfazer devolução. */}
      <ModalConfirmacaoAuditoria
        aberto={!!modalDesfazerDev}
        titulo="Desfazer devolução"
        subtitulo={modalDesfazerDev ? `${modalDesfazerDev.descricao} (#${modalDesfazerDev.id})` : undefined}
        descricao={
          <div className="space-y-2">
            <p>Esta ação <b>reverte a devolução</b>: o equipamento volta para o status <b>“Em uso”</b>, a data fim real e as fotos de devolução serão apagadas.</p>
            <p className="text-xs text-slate-500">A reversão é registrada na timeline (evento <b>“Devolução desfeita”</b>) e no log de auditoria do almoxarifado. O item <u>não</u> retorna automaticamente ao estoque central — se precisar, refaça a saída manualmente.</p>
          </div>
        }
        textoBotaoConfirmar="Desfazer devolução"
        requerSenha={requerSenhaAud}
        requerJustificativa={requerJustAud}
        carregando={desfazerDev.isPending}
        erroExterno={desfazerErro}
        onCancelar={() => { setModalDesfazerDev(null); setDesfazerErro(null); }}
        onConfirmar={({ senha, justificativa }) => {
          if (!modalDesfazerDev) return;
          setDesfazerErro(null);
          desfazerDev.mutate({
            companyId,
            id: modalDesfazerDev.id,
            senha,
            motivo: justificativa,
          });
        }}
      />

      {modalCheckin && (
        <Modal title={`Check-in: ${modalCheckin.descricao}`} onClose={() => setModalCheckin(null)} onSave={fazerCheckIn}
          saveLabel="Confirmar presença" loading={checkIn.isPending}>
          <p className="text-sm text-slate-600">
            Confirma que o equipamento <b>está fisicamente na obra</b> nesta semana?
          </p>
          <Field label="Observação (opcional)">
            <textarea value={checkinObs} onChange={e => setCheckinObs(e.target.value)} rows={2} className="inp" />
          </Field>
        </Modal>
      )}

      {/* Rev. 2339 — Painel de DETALHES COMPLETOS do equipamento locado.
          Substitui o antigo modal "Histórico" — agora o card inteiro é clicável
          e abre um drawer full-height com TUDO relacionado ao item:
          foto grande + KPIs (dias, valor acumulado, restante) + dados do
          contrato/obra/fornecedor/responsável + galeria + timeline de eventos
          + ações (check-in, devolver) no rodapé sticky. */}
      {modalEventos && (() => {
        const l = modalEventos;
        const fotosRec = (l.fotosRecebimentoJson as FotoItem[]) || [];
        const ini = l.dataInicio ? new Date(l.dataInicio) : null;
        const fim = l.dataFimPrevista ? new Date(l.dataFimPrevista) : null;
        const hoje = new Date();
        const dia = 86400000;
        const diasUso = ini ? Math.max(0, Math.floor((hoje.getTime() - ini.getTime()) / dia)) : 0;
        const diasRestantes = fim ? Math.floor((fim.getTime() - hoje.getTime()) / dia) : null;
        const valorMes = Number(l.valorMensal) || 0;
        const valorDia = Number(l.valorDiario) || (valorMes ? valorMes / 30 : 0);
        const valorAcumulado = valorDia * diasUso;
        const obraNome = l.obraId ? obrasMap.get(Number(l.obraId)) : null;
        const evs = (eventos.data || []) as any[];
        const TIPO_META: Record<string, { label: string; color: string; bg: string; ring: string; icon: LucideIcon }> = {
          RECEBIMENTO:           { label: "Recebimento",            color: "text-emerald-700", bg: "bg-emerald-100", ring: "ring-emerald-200", icon: Truck },
          CHECK_IN_OBRA:         { label: "Check-in semanal",       color: "text-blue-700",    bg: "bg-blue-100",    ring: "ring-blue-200",    icon: ClipboardCheck },
          DEVOLUCAO_FORNECEDOR:  { label: "Devolução ao fornecedor", color: "text-slate-700",  bg: "bg-slate-200",   ring: "ring-slate-300",   icon: RotateCcw },
          REVERSAO_DEVOLUCAO:    { label: "Devolução desfeita",      color: "text-orange-700", bg: "bg-orange-100",  ring: "ring-orange-200",  icon: Undo2 },
          RENOVACAO:             { label: "Renovação de contrato",  color: "text-amber-700",   bg: "bg-amber-100",   ring: "ring-amber-200",   icon: Calendar },
          MANUTENCAO:            { label: "Manutenção",              color: "text-purple-700", bg: "bg-purple-100",  ring: "ring-purple-200",  icon: Activity },
          VINCULO_OBRA:          { label: "Vinculação à obra",       color: "text-indigo-700", bg: "bg-indigo-100",  ring: "ring-indigo-200",  icon: MapPin },
        };
        const meta = (t: string) => TIPO_META[t] || { label: t, color: "text-slate-700", bg: "bg-slate-100", ring: "ring-slate-200", icon: FileText };
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4" onClick={() => setModalEventos(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Header gradient */}
              <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 text-white px-5 py-4 sm:px-6 sm:py-5">
                <button onClick={() => setModalEventos(null)} className="absolute top-3 right-3 h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition" title="Fechar">
                  <X className="h-5 w-5" />
                </button>
                <div className="flex items-start gap-4 pr-10">
                  {fotosRec[0] || l.fotoUrl ? (
                    <div className="relative flex-shrink-0 group/hphoto">
                      {/* Rev. 2368 — click amplia (lightbox). */}
                      <button
                        type="button"
                        onClick={() => setLightbox({ url: fotosRec[0]?.url || (l.fotoUrl as string), titulo: l.descricao })}
                        className="block w-20 h-20 sm:w-24 sm:h-24 rounded-xl ring-2 ring-white/40 shadow-lg overflow-hidden cursor-zoom-in relative"
                        title="Clique para ampliar a foto"
                        aria-label="Ampliar foto">
                        <img src={fotosRec[0]?.url || (l.fotoUrl as string)} className="w-full h-full object-cover" alt={l.descricao} />
                        <div className="absolute inset-0 bg-black/0 group-hover/hphoto:bg-black/35 transition flex items-center justify-center opacity-0 group-hover/hphoto:opacity-100">
                          <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                        </div>
                      </button>
                      {!fotosRec[0] && l.fotoUrl && (
                        <span title="Imagem ilustrativa encontrada por IA" className="absolute -top-1.5 -right-1.5 bg-pink-500 text-white rounded-full p-1 ring-2 ring-white shadow pointer-events-none">
                          <Sparkles className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-white/15 ring-2 ring-white/30 flex items-center justify-center flex-shrink-0">
                      <Camera className="h-8 w-8 text-white/70" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/20 ring-1 ring-white/30`}>
                        {STATUS_LABELS[l.status] || l.status}
                      </span>
                      {l.categoria && (
                        <span className="inline-flex items-center gap-1 bg-white/15 ring-1 ring-white/25 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                          <Tag className="h-2.5 w-2.5" /> {l.categoria}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold leading-tight truncate" title={l.descricao}>{l.descricao}</h2>
                    <div className="text-xs sm:text-sm text-white/85 mt-1 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Hash className="h-3.5 w-3.5" /> {l.codigoPatrimonioFornecedor || "s/ patrimônio"}</span>
                      {l.numeroSerie && <span className="inline-flex items-center gap-1">N°S {l.numeroSerie}</span>}
                      {l.codigoInternoErp && <span className="inline-flex items-center gap-1">ERP {l.codigoInternoErp}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Conteúdo scrollável */}
              <div className="flex-1 overflow-y-auto bg-slate-50/40">
                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 p-3 sm:p-5 pb-2">
                  <div className="bg-white rounded-xl ring-1 ring-slate-200 p-3 shadow-sm min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Dias em uso</div>
                    <div className="mt-1 font-bold text-slate-900 tabular-nums" style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)" }}>{diasUso}</div>
                    <div className="text-[11px] text-slate-500">desde {fmtDate(l.dataInicio)}</div>
                  </div>
                  <div className={`bg-white rounded-xl ring-1 p-3 shadow-sm min-w-0 ${diasRestantes !== null && diasRestantes < 0 ? "ring-red-200" : diasRestantes !== null && diasRestantes < 30 ? "ring-amber-200" : "ring-slate-200"}`}>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{diasRestantes !== null && diasRestantes < 0 ? "Atrasado há" : "Restam"}</div>
                    <div className={`mt-1 font-bold tabular-nums ${diasRestantes !== null && diasRestantes < 0 ? "text-red-700" : diasRestantes !== null && diasRestantes < 30 ? "text-amber-700" : "text-slate-900"}`} style={{ fontSize: "clamp(1.25rem, 3vw, 1.75rem)" }}>
                      {diasRestantes === null ? "—" : `${Math.abs(diasRestantes)}d`}
                    </div>
                    <div className="text-[11px] text-slate-500">prev. {fmtDate(l.dataFimPrevista)}</div>
                  </div>
                  <div className="bg-white rounded-xl ring-1 ring-slate-200 p-3 shadow-sm min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Custo / mês</div>
                    <div className="mt-1 font-bold text-emerald-700 truncate tabular-nums" style={{ fontSize: "clamp(1rem, 2.6vw, 1.5rem)" }} title={fmtMoney(valorMes)}>{fmtMoney(valorMes)}</div>
                    <div className="text-[11px] text-slate-500 truncate">{valorDia ? `${fmtMoney(valorDia)}/dia` : "—"}</div>
                  </div>
                  <div className="bg-white rounded-xl ring-1 ring-emerald-200 p-3 shadow-sm min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Acumulado est.</div>
                    <div className="mt-1 font-bold text-emerald-800 truncate tabular-nums" style={{ fontSize: "clamp(1rem, 2.6vw, 1.5rem)" }} title={fmtMoney(valorAcumulado)}>{fmtMoney(valorAcumulado)}</div>
                    <div className="text-[11px] text-slate-500 truncate">{diasUso}d × diária</div>
                  </div>
                </div>

                {/* Grids de info: obra/fornecedor + datas/responsável + observações */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 sm:px-5 pb-3">
                  <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4 space-y-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Obra & local</div>
                    <div className={`text-sm font-semibold ${obraNome ? "text-emerald-800" : "text-amber-700 italic"}`}>{obraNome || "Sem obra vinculada"}</div>
                    {l.localObra && <div className="text-xs text-slate-600">{l.localObra}</div>}
                    <hr className="border-slate-100" />
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Fornecedor</span>
                      {editForn?.id !== l.id && (
                        <button
                          onClick={() => setEditForn({ id: l.id, val: l.fornecedorNome || "" })}
                          className="normal-case inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700"
                          title="Corrigir o fornecedor (locadora) deste item">
                          <Pencil className="h-3 w-3" /> Trocar
                        </button>
                      )}
                    </div>
                    {editForn?.id === l.id ? (
                      <div className="space-y-2">
                        <input
                          list="forn-edit-datalist"
                          value={editForn.val}
                          onChange={e => setEditForn(prev => prev ? { ...prev, val: e.target.value } : prev)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                          placeholder="Nome da locadora (ex: Minas Locc)"
                          autoFocus
                        />
                        <datalist id="forn-edit-datalist">
                          {fornecedoresComItens.filter(f => f.key !== "__null__").map(f => (
                            <option key={f.key} value={f.nome} />
                          ))}
                        </datalist>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => atualizarLocadoMut.mutate({ companyId, id: l.id, fornecedorNome: editForn.val.trim() || null })}
                            disabled={atualizarLocadoMut.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                            {atualizarLocadoMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar
                          </button>
                          <button
                            onClick={() => setEditForn(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm font-semibold text-slate-800">{l.fornecedorNome || <span className="italic text-slate-500 font-normal">Sem fornecedor cadastrado</span>}</div>
                    )}
                    {l.numeroContrato && <div className="text-xs text-slate-600">Contrato: <span className="font-mono font-medium">{l.numeroContrato}</span></div>}
                  </div>
                  <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4 space-y-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Período</div>
                    <div className="text-sm text-slate-800">
                      <span className="font-semibold">{fmtDate(l.dataInicio)}</span>
                      <span className="text-slate-400 mx-2">→</span>
                      <span className="font-semibold">{fmtDate(l.dataFimPrevista)}</span>
                    </div>
                    {l.dataDevolucao && <div className="text-xs text-emerald-700">Devolvido em <b>{fmtDate(l.dataDevolucao)}</b></div>}
                    <hr className="border-slate-100" />
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> Responsável na obra</div>
                    <div className="text-sm font-semibold text-slate-800">{l.funcionarioResponsavelNome || <span className="italic text-slate-500 font-normal">Não informado</span>}</div>
                  </div>
                </div>

                {/* Observações */}
                {l.observacoes && (
                  <div className="px-3 sm:px-5 pb-3">
                    <div className="bg-amber-50 ring-1 ring-amber-200 rounded-xl p-4">
                      <div className="text-[11px] uppercase tracking-wider text-amber-800 font-bold flex items-center gap-1.5 mb-1"><StickyNote className="h-3.5 w-3.5" /> Observações</div>
                      <div className="text-sm text-amber-900 whitespace-pre-wrap">{l.observacoes}</div>
                    </div>
                  </div>
                )}

                {/* Galeria de fotos do recebimento */}
                {fotosRec.length > 0 && (
                  <div className="px-3 sm:px-5 pb-3">
                    <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5 mb-3"><Camera className="h-3.5 w-3.5" /> Fotos do recebimento ({fmtN(fotosRec.length)})</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                        {fotosRec.map((f, i) => (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-emerald-400 hover:shadow-md transition">
                            <img src={f.url} className="w-full h-full object-cover" alt={`Foto ${i + 1}`} />
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Timeline de eventos */}
                <div className="px-3 sm:px-5 pb-5">
                  <div className="bg-white rounded-xl ring-1 ring-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Linha do tempo</div>
                      {!eventos.isLoading && <span className="text-xs text-slate-400">{fmtN(evs.length)} evento{evs.length !== 1 ? "s" : ""}</span>}
                    </div>
                    {eventos.isLoading ? <div className="py-6 flex justify-center"><Spinner /></div> :
                      evs.length === 0 ? <div className="text-sm text-slate-500 italic py-6 text-center">Nenhum evento registrado.</div> :
                      <ol className="relative border-l-2 border-slate-200 ml-3 space-y-3">
                        {evs.map((e: any) => {
                          const m = meta(e.tipo);
                          const Icon = m.icon;
                          return (
                            <li key={e.id} className="ml-5 relative">
                              <span className={`absolute -left-[34px] top-0 h-7 w-7 rounded-full ${m.bg} ring-4 ring-white flex items-center justify-center shadow-sm`}>
                                <Icon className={`h-3.5 w-3.5 ${m.color}`} />
                              </span>
                              <div className={`rounded-lg ring-1 ${m.ring} bg-white p-3`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className={`text-xs font-bold uppercase tracking-wider ${m.color}`}>{m.label}</span>
                                  <span className="text-[11px] text-slate-500 tabular-nums">{new Date(e.dataEvento).toLocaleString("pt-BR")}</span>
                                </div>
                                {e.observacao && <div className="text-sm text-slate-700 mt-1.5 whitespace-pre-wrap">{e.observacao}</div>}
                                {e.usuarioNome && <div className="text-[11px] text-slate-500 mt-1 inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {e.usuarioNome}</div>}
                                {/* Rev. 2459 — filtra fotos sem URL real (evita "quadrado preto" de dataURL vazio/quebrado).
                                    Sanitização: só permite https?:, /uploads/, /api/ e data:image/(png|jpeg|webp). Teto 2MB pra dataURL. */}
                                {Array.isArray(e.fotosJson) && e.fotosJson.filter((f: any) => safeMediaUrl(f?.url)).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {e.fotosJson
                                      .filter((f: any) => safeMediaUrl(f?.url))
                                      .slice(0, 6)
                                      .map((f: any, i: number) => (
                                        <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block">
                                          <img
                                            src={f.url}
                                            className="w-14 h-14 object-cover rounded ring-1 ring-slate-200 hover:ring-emerald-400 transition bg-slate-100"
                                            alt=""
                                            onError={(ev) => { (ev.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                                          />
                                        </a>
                                      ))}
                                  </div>
                                )}
                                {/* Rev. 2459 — DEVOLUCAO_FORNECEDOR: mostra recibo assinado (entregador FC + recebedor locadora) + botão pra gerar/compartilhar PDF via WhatsApp. */}
                                {e.tipo === "DEVOLUCAO_FORNECEDOR" && (e.assinaturaEntregadorUrl || e.assinaturaRecebedorUrl || e.pdfComprovanteToken) && (
                                  <div className="mt-3 border-t border-slate-100 pt-3">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                                      <FileText className="h-3 w-3" /> Recibo de devolução
                                    </div>
                                    {(e.assinaturaEntregadorUrl || e.assinaturaRecebedorUrl) && (
                                      <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                                          <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1">Entregador (FC)</div>
                                          {safeMediaUrl(e.assinaturaEntregadorUrl) ? (
                                            <img src={e.assinaturaEntregadorUrl} className="w-full h-12 object-contain bg-white rounded ring-1 ring-slate-200" alt="Assinatura entregador" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                          ) : (
                                            <div className="h-12 flex items-center justify-center text-[10px] text-slate-400 italic bg-white rounded ring-1 ring-slate-200">sem assinatura</div>
                                          )}
                                          <div className="text-[11px] font-semibold text-slate-700 truncate mt-1" title={e.assinaturaEntregadorNome || "—"}>
                                            {e.assinaturaEntregadorNome || "—"}
                                          </div>
                                        </div>
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                                          <div className="text-[9px] text-emerald-700 uppercase tracking-wider font-bold mb-1">Recebedor (Locadora)</div>
                                          {safeMediaUrl(e.assinaturaRecebedorUrl) ? (
                                            <img src={e.assinaturaRecebedorUrl} className="w-full h-12 object-contain bg-white rounded ring-1 ring-emerald-200" alt="Assinatura recebedor" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                          ) : (
                                            <div className="h-12 flex items-center justify-center text-[10px] text-slate-400 italic bg-white rounded ring-1 ring-emerald-200">sem assinatura</div>
                                          )}
                                          <div className="text-[11px] font-semibold text-emerald-800 truncate mt-1" title={e.assinaturaRecebedorNome || "—"}>
                                            {e.assinaturaRecebedorNome || "—"}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {e.pdfComprovanteToken && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const url = `${window.location.origin}/api/comprovante-devolucao/${e.id}/${e.pdfComprovanteToken}.pdf`;
                                          setModalShareComprovante({ url, qtd: 1 });
                                        }}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-md inline-flex items-center justify-center gap-1.5 transition shadow-sm"
                                      >
                                        <FileText className="h-3.5 w-3.5" /> Gerar / compartilhar PDF
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ol>}
                  </div>
                </div>
              </div>

              {/* Footer sticky com ações */}
              <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center justify-end gap-2 flex-wrap">
                {l.status === "em_uso" && (
                  <>
                    <button
                      onClick={() => { setModalCheckin(l); setCheckinObs(""); setModalEventos(null); }}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold inline-flex items-center gap-2 transition"
                    >
                      <ClipboardCheck className="h-4 w-4" /> Check-in semanal
                    </button>
                    <button
                      onClick={() => { setModalDev(l); setDevFotos([]); setDevObs(""); setDevData(new Date().toISOString().slice(0, 10)); setModalEventos(null); }}
                      className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold inline-flex items-center gap-2 transition"
                    >
                      <RotateCcw className="h-4 w-4" /> Devolver
                    </button>
                  </>
                )}
                {/* Rev. 2460 — Desfazer devolução (volta status pra em_uso, pede senha+motivo, log de auditoria). */}
                {l.status === "devolvido" && (
                  <button
                    onClick={() => { setDesfazerErro(null); setModalDesfazerDev(l); }}
                    className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-md font-semibold inline-flex items-center gap-2 transition"
                    title="Reverte a devolução. Exige senha do usuário e motivo (auditado)."
                  >
                    <Undo2 className="h-4 w-4" /> Desfazer devolução
                  </button>
                )}
                <button onClick={() => setModalEventos(null)} className="px-4 py-2 text-sm border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-md font-medium">Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Rev. 2322 — Diálogo de erro detalhado da importação (substitui toast que sumia no iOS). */}
      {importErroDetalhe && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setImportErroDetalhe(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b bg-red-50 flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" />
              <h3 className="font-semibold text-red-800">Não foi possível cadastrar</h3>
            </div>
            <div className="p-5 text-sm text-slate-700 whitespace-pre-wrap">{importErroDetalhe}</div>
            <div className="px-5 py-3 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setImportErroDetalhe(null)} className="px-4 py-1.5 text-sm bg-slate-700 hover:bg-slate-800 text-white rounded">Entendi</button>
            </div>
          </div>
        </div>
      )}
      {/* Rev. 2308 — Modal Importar PDF da locadora (IA detecta layout) */}
      {modalImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!parsearPdf.isPending && !importarLote.isPending) setModalImport(false); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <h2 className="font-semibold text-slate-800">Importar contratos de locação (PDF · IA)</h2>
              </div>
              <button onClick={() => setModalImport(false)} disabled={parsearPdf.isPending || importarLote.isPending}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Rev. 2407 — input file SEMPRE montado pra o botão "+ Adicionar
                  PDFs" funcionar (antes ficava só dentro do drop zone). */}
              <input
                ref={importFileRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const fs = Array.from(e.target.files || []);
                  if (fs.length) {
                    // append=true se já existe arquivo/preview em curso
                    const isAppend = !!importArquivo || !!importPreview;
                    handlePdfPickMultiple(fs, { append: isAppend });
                  }
                  e.target.value = "";
                }}
              />
              {!importArquivo && (
                <div
                  onClick={() => importFileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) handlePdfPickMultiple(fs); }}
                  className="border-2 border-dashed border-indigo-300 rounded-lg p-10 text-center cursor-pointer hover:bg-indigo-50/50 transition"
                >
                  <Upload className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
                  <div className="text-slate-700 font-medium">Arraste 1 ou vários PDFs da locadora aqui</div>
                  <div className="text-xs text-slate-500 mt-1">ou clique para selecionar · PDF/JPG/PNG até 15MB cada</div>
                  <div className="text-[11px] text-slate-400 mt-3">A IA (Gemini) detecta o layout — Jalves, Mills, Locamerica etc. Multi-PDF: todos devem ser da MESMA empresa atualmente selecionada.</div>
                </div>
              )}

              {importArquivo && (
                <div className="flex items-center justify-between bg-slate-50 border rounded p-3 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
                    {importTotalFiles > 1 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded shrink-0">
                        {importFileIdx}/{importTotalFiles}
                      </span>
                    )}
                    <span className="font-medium truncate">{importArquivo.nome}</span>
                    <span className="text-xs text-slate-500 shrink-0">({(importArquivo.base64.length * 0.75 / 1024).toFixed(0)} KB)</span>
                  </div>
                  {!parsearPdf.isPending && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => importFileRef.current?.click()}
                        className="text-xs text-indigo-600 hover:underline"
                        title="Adicionar mais PDFs ao preview atual"
                      >
                        + Adicionar PDFs
                      </button>
                      <button onClick={() => { setImportArquivo(null); setImportPreview(null); setImportFilas([]); setImportTotalFiles(0); setImportFileIdx(0); }} className="text-xs text-red-600 hover:underline">Limpar tudo</button>
                    </div>
                  )}
                </div>
              )}
              {/* Rev. 2407 — Fila de PDFs pendentes (multi-upload) */}
              {importFilas.length > 0 && (
                <div className="bg-indigo-50/60 border border-indigo-200 rounded p-2.5 text-xs">
                  <div className="font-semibold text-indigo-900 mb-1.5">
                    Fila: {importFilas.length} PDF{importFilas.length !== 1 ? "s" : ""} aguardando
                  </div>
                  <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                    {importFilas.map((q, i) => (
                      <li key={i} className="flex items-center gap-2 text-indigo-800/80">
                        <span className="w-5 text-right tabular-nums">{importFileIdx + 1 + i}.</span>
                        <FileText className="h-3 w-3" />
                        <span className="truncate flex-1">{q.file.name}</span>
                        <span className="text-[10px] text-slate-500">{(q.file.size / 1024).toFixed(0)} KB</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {parsearPdf.isPending && (() => {
                // Rev. 2359 — Painel de diagnóstico em tempo real.
                // O server agora reporta a fase atual (queued/calling_ai/
                // parsing_json/repairing_json/normalizing_dates/finalizing) e
                // quanto tempo está nela. Combatemos a percepção de "travado
                // em 99%" mostrando timer mm:ss, fase legível, e contador de
                // checagens. Após 90s aparece dica + botão "Cancelar".
                const fmtClock = (ms: number) => {
                  const s = Math.floor(ms / 1000);
                  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
                };
                const phaseLabel: Record<string, { label: string; icon: string }> = {
                  queued:            { label: "Enviando PDF pra IA…",                icon: "📤" },
                  calling_ai:        { label: "Chamando Gemini Vision (IA do Google)", icon: "🤖" },
                  parsing_json:      { label: "Decodificando resposta da IA",          icon: "🔍" },
                  repairing_json:    { label: "Reparando JSON truncado",               icon: "🔧" },
                  normalizing_dates: { label: "Normalizando datas e itens",            icon: "📅" },
                  finalizing:        { label: "Finalizando",                           icon: "✅" },
                };
                const d = parseDiag;
                const ph = d?.phase || "queued";
                const phInfo = phaseLabel[ph] || phaseLabel.queued;
                const elapsed = d?.elapsedMs || 0;
                const phaseElapsed = d?.phaseElapsedMs || 0;
                const desdeUltimoPoll = d ? Date.now() - d.lastPollAt : 0;
                const veryLong = elapsed > 90_000;
                return (
                  <div className="py-5 px-2 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-indigo-700 font-medium">
                        <Sparkles className="h-4 w-4 animate-pulse" />
                        <span>IA analisando layout do documento…</span>
                      </div>
                      <span className="text-indigo-900 font-bold tabular-nums">{importProgresso}%</span>
                    </div>
                    <div className="h-3 bg-indigo-100 rounded-full overflow-hidden ring-1 ring-indigo-200">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-all duration-300 ease-out"
                        style={{ width: `${importProgresso}%` }}
                      />
                    </div>

                    {/* Rev. 2359 — Card de diagnóstico ao vivo */}
                    <div className="rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50/40 px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{phInfo.icon}</span>
                          <span className="font-semibold text-indigo-900 truncate">{phInfo.label}</span>
                        </div>
                        <span className="text-[11px] text-indigo-700 tabular-nums whitespace-nowrap">
                          há {fmtClock(phaseElapsed)} nesta etapa
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-indigo-800/90">
                        <div className="bg-white/70 rounded px-2 py-1 ring-1 ring-indigo-100">
                          <div className="uppercase text-[9px] tracking-wider text-indigo-500/80 font-semibold">Tempo total</div>
                          <div className="font-bold tabular-nums">{fmtClock(elapsed)}</div>
                        </div>
                        <div className="bg-white/70 rounded px-2 py-1 ring-1 ring-indigo-100">
                          <div className="uppercase text-[9px] tracking-wider text-indigo-500/80 font-semibold">Checagens</div>
                          <div className="font-bold tabular-nums">{d?.pollCount ?? 0}</div>
                        </div>
                        <div className="bg-white/70 rounded px-2 py-1 ring-1 ring-indigo-100">
                          <div className="uppercase text-[9px] tracking-wider text-indigo-500/80 font-semibold">Próxima em</div>
                          <div className="font-bold tabular-nums">~{Math.max(0, Math.ceil((2500 - desdeUltimoPoll) / 1000))}s</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium pt-0.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span>Conexão ativa — processamento NÃO travado.</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 text-center">
                      {veryLong
                        ? "🕐 PDF grande — pode levar até 2 minutos. Se preferir, cancele e divida o arquivo em partes menores."
                        : importDemorando
                          ? "📄 PDF extenso detectado — a IA ainda está processando. Aguarde mais alguns segundos…"
                          : "Tempo típico: 15–45s · não feche esta janela."}
                    </div>

                    {veryLong && (
                      <div className="flex justify-center">
                        <button
                          onClick={() => {
                            setParsePending(false);
                            setImportProgresso(0);
                            setParseJobId(null);
                            setParseDiag(null);
                            setImportArquivo(null);
                            toast.info("Parse cancelado. Tente um PDF menor ou divida em partes.");
                          }}
                          className="text-xs px-3 py-1.5 rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 font-medium transition"
                        >
                          Cancelar parse e trocar arquivo
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Rev. 2326 + 2353 — banner de cruzamento automático
                  (vermelho/bloqueante quando há contratos sem obra). */}
              {importPreview && importPreview.length > 0 && (() => {
                // Rev. 2353 — fonte ÚNICA de "sem obra" é `!c.obraId` (mesma
                // condição usada pelo guard do confirmarImport e pelo botão).
                // Evita estado stale: se user limpa o select de um contrato
                // auto-matched, `obraMatchAuto` continua true mas `obraId` vira
                // undefined; antes o banner ficava verde enquanto o botão
                // bloqueava — inconsistente.
                const total = importPreview.length;
                const sem = importPreview.filter((c: any) => !c.obraId).length;
                const auto = importPreview.filter((c: any) => c.obraId && c.obraMatchAuto).length;
                const manual = importPreview.filter((c: any) => c.obraId && !c.obraMatchAuto).length;
                const bloqueia = sem > 0;
                return (
                  <div className={`mb-3 rounded-lg border px-4 py-3 text-xs ${bloqueia ? "border-red-300 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                    <div className="font-semibold flex items-center gap-2">
                      {bloqueia ? "⛔ Há contratos SEM obra vinculada — corrija antes de importar" : "🔗 Cruzamento automático com obras em andamento"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span><b className="text-emerald-700">{fmtN(auto)}</b> auto-vinculados pelo endereço/nome</span>
                      {manual > 0 && <span><b className="text-blue-700">{fmtN(manual)}</b> vinculados manualmente</span>}
                      {sem > 0 && <span className="text-red-800"><b>{fmtN(sem)}</b> SEM OBRA — selecione no campo "Obra ERP" de cada cartão</span>}
                    </div>
                    {bloqueia && (
                      <div className="mt-2 text-[11px] text-red-700">
                        ℹ Regra: não é permitido cadastrar equipamento locado sem obra vinculada (impede agrupamento e atribui custo errado).
                      </div>
                    )}
                  </div>
                );
              })()}
              {importPreview && importPreview.length > 0 && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-emerald-800">
                    ✅ IA detectou <b>{fmtN(importPreview.length)}</b> contrato(s) totalizando <b>{fmtN(importPreview.reduce((a, c) => a + (c.itens?.length || 0), 0))}</b> item(ns).
                    Revise os dados abaixo (campos são editáveis) e confirme.
                  </div>

                  {/* Rev. 2358 — Fornecedor padrão deste PDF.
                      O cabeçalho do F051/R051 (JALVES) traz o nome do
                      LOCATÁRIO ("6716-FC ENGENHARIA..."), não o da
                      LOCADORA — o parser muitas vezes preenche errado.
                      Aqui o user indica o fornecedor real do PDF inteiro
                      e propaga pra todos os contratos com 1 clique. */}
                  {(() => {
                    const opts = fornecedoresCadastradosQ.data || [];
                    const nomesDistintos = Array.from(new Set(importPreview.map((c: any) => (c.fornecedorNome || "").trim()).filter(Boolean)));
                    const todosIguais = nomesDistintos.length === 1;
                    const algumPreenchido = nomesDistintos.length > 0;
                    return (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                        <div className="flex items-start gap-2 text-amber-900">
                          <Building2 className="h-4 w-4 mt-0.5 shrink-0" />
                          <div className="text-xs leading-snug">
                            <div className="font-semibold text-sm">Fornecedor (locadora) deste PDF</div>
                            <div className="text-amber-800/90">
                              O cabeçalho do PDF costuma trazer o nome da empresa <b>locatária</b> (FC Engenharia). Indique aqui a <b>locadora</b> real (ex: JALVES) e clique em "Aplicar a todos".
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-stretch">
                          <input
                            list="fornecedores-cadastrados-import"
                            value={importFornecedorPadrao}
                            onChange={e => setImportFornecedorPadrao(e.target.value)}
                            placeholder="Ex: JALVES LOCAÇÕES"
                            className="inp flex-1 min-w-[220px] bg-white"
                          />
                          <datalist id="fornecedores-cadastrados-import">
                            {opts.map((f: any) => (
                              <option key={f.id} value={f.razaoSocial || f.nomeFantasia || ""}>{f.nomeFantasia && f.razaoSocial && f.nomeFantasia !== f.razaoSocial ? f.nomeFantasia : ""}</option>
                            ))}
                          </datalist>
                          <button
                            type="button"
                            onClick={aplicarFornecedorPadraoATodos}
                            disabled={!importFornecedorPadrao.trim()}
                            className="px-3 py-2 rounded-md bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold whitespace-nowrap shadow-sm transition"
                            title="Aplica este nome em TODOS os contratos abaixo"
                          >
                            Aplicar a todos
                          </button>
                        </div>
                        <div className="text-[11px] text-amber-800/80">
                          {!algumPreenchido ? (
                            <>⚠ Nenhum contrato tem fornecedor preenchido — recomendado aplicar antes de cadastrar.</>
                          ) : todosIguais ? (
                            <>✅ Todos os contratos estão com fornecedor <b>"{nomesDistintos[0]}"</b>.</>
                          ) : (
                            <>⚠ Há <b>{nomesDistintos.length}</b> fornecedores diferentes detectados: <span className="font-mono">{nomesDistintos.slice(0, 3).join(" · ")}{nomesDistintos.length > 3 ? ` +${nomesDistintos.length - 3}` : ""}</span>. Use o campo acima pra padronizar (ou edite cartão a cartão abaixo).</>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Rev. 2314 — Resumo agregado por OBRA (chave = localObra normalizado). */}
                  {(() => {
                    const norm = (s: string) => (s || "Não identificada")
                      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                      .toUpperCase().replace(/\s+/g, " ").trim();
                    const grupos = new Map<string, { obra: string; contratos: number; itens: number; total: number; numeros: string[] }>();
                    for (const c of importPreview) {
                      const k = norm(c.localObra || "");
                      const g = grupos.get(k) || { obra: c.localObra || "— Não identificada —", contratos: 0, itens: 0, total: 0, numeros: [] };
                      g.contratos++;
                      g.itens += (c.itens || []).reduce((a: number, it: any) => a + (Number(it.quantidade) || 0), 0);
                      g.total += Number(c.valorTotal) || 0;
                      if (c.numeroContrato) g.numeros.push(String(c.numeroContrato));
                      grupos.set(k, g);
                    }
                    const linhas = Array.from(grupos.values()).sort((a, b) => b.total - a.total);
                    const totalGeral = linhas.reduce((a, l) => a + l.total, 0);
                    const totalItens = linhas.reduce((a, l) => a + l.itens, 0);
                    const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (
                      <div className="border border-indigo-200 rounded-lg overflow-hidden bg-white">
                        <div className="px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            <span className="font-semibold text-sm">Custo por obra</span>
                            <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full">{fmtN(linhas.length)} obra(s)</span>
                          </div>
                          <div className="text-xs">
                            Total geral: <b className="text-base tabular-nums">R$ {fmt(totalGeral)}</b>
                          </div>
                        </div>
                        <table className="w-full text-sm">
                          <thead className="bg-indigo-50 text-[11px] uppercase text-slate-600">
                            <tr>
                              <th className="px-3 py-2 text-left">Obra (endereço extraído do PDF)</th>
                              <th className="px-3 py-2 text-center w-20">Contratos</th>
                              <th className="px-3 py-2 text-center w-20">Itens</th>
                              <th className="px-3 py-2 text-right w-32">Custo / mês</th>
                              <th className="px-3 py-2 text-right w-16">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linhas.map((l, i) => {
                              const pct = totalGeral > 0 ? (l.total / totalGeral) * 100 : 0;
                              return (
                                <tr key={i} className="border-t hover:bg-slate-50">
                                  <td className="px-3 py-2">
                                    <div className="text-slate-800 leading-tight">{l.obra}</div>
                                    {l.numeros.length > 0 && (
                                      <div className="text-[10px] text-slate-400 mt-0.5">Contratos: {l.numeros.slice(0, 6).join(", ")}{l.numeros.length > 6 ? ` +${l.numeros.length - 6}` : ""}</div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center tabular-nums">{fmtN(l.contratos)}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{fmtN(l.itens)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700">R$ {fmt(l.total)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct.toFixed(1)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-indigo-300 bg-indigo-50 font-bold">
                              <td className="px-3 py-2 text-right text-slate-700">TOTAL</td>
                              <td className="px-3 py-2 text-center tabular-nums">{fmtN(importPreview.length)}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{fmtN(totalItens)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-indigo-800">R$ {fmt(totalGeral)}</td>
                              <td className="px-3 py-2 text-right text-slate-400">100%</td>
                            </tr>
                          </tfoot>
                        </table>
                        <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-800">
                          💡 Agrupamento automático por endereço (normalizado). Contratos sem obra identificada aparecem como "— Não identificada —".
                        </div>
                      </div>
                    );
                  })()}

                  {/* Rev. 2333 — Equipamentos por OBRA ERP (validação pré-import) */}
                  {(() => {
                    type ObraGrp = { obraId: number | null; obraNome: string; contratos: number; unidades: number; itens: Map<string, number> };
                    const grupos = new Map<string, ObraGrp>();
                    for (const c of importPreview) {
                      const oid = c.obraId ? Number(c.obraId) : null;
                      const nome = oid ? (obrasMap.get(oid) || `Obra #${oid}`) : "— Sem obra vinculada —";
                      const k = String(oid ?? "null");
                      const g = grupos.get(k) || { obraId: oid, obraNome: nome, contratos: 0, unidades: 0, itens: new Map<string, number>() };
                      g.contratos++;
                      for (const it of (c.itens || [])) {
                        const qty = Math.max(1, parseInt(String(it.quantidade)) || 1);
                        const desc = String(it.descricao || "—").trim();
                        g.unidades += qty;
                        g.itens.set(desc, (g.itens.get(desc) || 0) + qty);
                      }
                      grupos.set(k, g);
                    }
                    const linhas = Array.from(grupos.values()).sort((a, b) => {
                      if (a.obraId === null && b.obraId !== null) return 1;
                      if (b.obraId === null && a.obraId !== null) return -1;
                      return b.unidades - a.unidades;
                    });
                    const totalUnid = linhas.reduce((s, l) => s + l.unidades, 0);
                    const semObra = linhas.find(l => l.obraId === null);
                    return (
                      <div className="border border-emerald-200 rounded-lg overflow-hidden bg-white">
                        <div className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            <span className="font-semibold text-sm">Equipamentos por Obra (validação)</span>
                            <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full">{fmtN(linhas.length)} obra(s) · {fmtN(totalUnid)} unidade(s)</span>
                          </div>
                          {semObra && (
                            <span className="text-[11px] bg-amber-400/90 text-amber-950 font-semibold px-2 py-0.5 rounded-full">
                              ⚠ {fmtN(semObra.unidades)} unidade(s) sem obra
                            </span>
                          )}
                        </div>
                        <div className="divide-y divide-emerald-100">
                          {linhas.map((g, i) => {
                            const itens = Array.from(g.itens.entries()).sort((a, b) => b[1] - a[1]);
                            return (
                              <details key={i} className="group" {...(g.obraId === null ? { open: true } : {})}>
                                <summary className={`px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-emerald-50/60 ${g.obraId === null ? "bg-amber-50/50" : ""}`}>
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="text-emerald-600 group-open:rotate-90 transition-transform inline-block text-xs">▶</span>
                                    <span className={`font-medium text-sm truncate ${g.obraId === null ? "text-amber-700" : "text-slate-800"}`}>{g.obraNome}</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs tabular-nums flex-shrink-0">
                                    <span className="text-slate-500">{fmtN(g.contratos)} contrato(s)</span>
                                    <span className="font-semibold text-emerald-700">{fmtN(g.unidades)} unid.</span>
                                  </div>
                                </summary>
                                <div className="px-3 pb-3 pt-1 bg-slate-50/40">
                                  <table className="w-full text-xs">
                                    <thead className="text-[10px] text-slate-500 uppercase">
                                      <tr><th className="text-left py-1">Equipamento</th><th className="text-right py-1 w-20">Qtde</th></tr>
                                    </thead>
                                    <tbody>
                                      {itens.map(([desc, qtd], j) => (
                                        <tr key={j} className="border-t border-slate-200/60">
                                          <td className="py-1 text-slate-700">{desc}</td>
                                          <td className="py-1 text-right tabular-nums font-semibold">{qtd}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                        <div className="px-3 py-1.5 bg-emerald-50 border-t border-emerald-200 text-[11px] text-emerald-800">
                          ✅ Confira os equipamentos que cada obra vai receber. Clique pra expandir/colapsar. {semObra ? "Use o select de Obra ERP abaixo pra vincular as unidades sem obra antes de cadastrar." : "Todas as unidades estão vinculadas a uma obra."}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                    {importPreview.map((c, ci) => (
                      <div key={ci} className="border rounded-lg overflow-hidden">
                        <div className="bg-indigo-50 px-3 py-2 grid grid-cols-12 gap-2 items-center text-xs">
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Contrato</label>
                            <input value={c.numeroContrato || ""} onChange={e => updateContratoField(ci, "numeroContrato", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-3">
                            <label className="text-[10px] text-slate-500 uppercase block">Fornecedor</label>
                            <input value={c.fornecedorNome || ""} onChange={e => updateContratoField(ci, "fornecedorNome", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Início</label>
                            <input type="date" value={c.periodoInicio || ""} onChange={e => updateContratoField(ci, "periodoInicio", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Fim</label>
                            <input type="date" value={c.periodoFim || ""} onChange={e => updateContratoField(ci, "periodoFim", e.target.value)} className="inp" />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-slate-500 uppercase block">Valor total</label>
                            {/* Rev. 2354 — input em formato BRL (R$ X.XXX,XX).
                                Padrão centavos: cada digito vira a casa mais à direita,
                                divide por 100. Permite digitar "164100" → R$ 1.641,00. */}
                            <input
                              type="text"
                              inputMode="numeric"
                              value={c.valorTotal != null && c.valorTotal !== "" ? `R$ ${Number(c.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
                              onChange={e => {
                                const raw = e.target.value.replace(/\D/g, "");
                                const num = raw ? parseInt(raw, 10) / 100 : 0;
                                updateContratoField(ci, "valorTotal", num);
                              }}
                              className="inp text-right tabular-nums"
                            />
                          </div>
                          <div className="col-span-1 text-right">
                            <button onClick={() => removerContratoPreview(ci)} className="text-red-600 hover:bg-red-50 p-1 rounded" title="Remover contrato">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {/* Rev. 2326 — endereço + select de obra (auto-vinculado via cruzamento) */}
                          <div className="col-span-12 flex flex-wrap items-center gap-2 pt-1 border-t border-indigo-100 mt-1">
                            {c.localObra && (
                              <div className="text-[11px] text-slate-600 flex-1 min-w-[200px]">📍 <span className="text-slate-500">PDF:</span> {c.localObra}</div>
                            )}
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-slate-500 uppercase font-semibold">Obra ERP:</label>
                              <select
                                value={c.obraId ? String(c.obraId) : ""}
                                onChange={e => updateContratoField(ci, "obraId", e.target.value ? parseInt(e.target.value) : undefined)}
                                className={`text-xs border rounded px-2 py-1 min-w-[220px] ${c.obraMatchAuto ? "border-emerald-400 bg-emerald-50" : c.obraId ? "border-blue-400 bg-blue-50" : "border-amber-400 bg-amber-50"}`}
                              >
                                <option value="">— Sem vínculo —</option>
                                {((obrasAtivasQ.data || []) as any[]).map((o: any) => (
                                  <option key={o.id} value={String(o.id)}>{o.nome}{o.cidade ? ` · ${o.cidade}` : ""}</option>
                                ))}
                              </select>
                              {c.obraMatchAuto && (
                                <span className="text-[9px] uppercase font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded" title={`Match automático · ${Math.round((c.obraMatchScore || 0) * 100)}% de tokens em comum`}>✓ auto</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr className="text-left text-[10px] text-slate-500 uppercase">
                              <th className="px-2 py-1 w-24">Patrim.</th>
                              <th className="px-2 py-1">Descrição</th>
                              <th className="px-2 py-1 w-16 text-right">Qtde</th>
                              <th className="px-2 py-1 w-24 text-right">Subtotal</th>
                              <th className="px-2 py-1 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(c.itens || []).map((it: any, ii: number) => (
                              <tr key={ii} className="border-t">
                                <td className="px-2 py-1"><input value={it.patrimonio || ""} onChange={e => updateItemField(ci, ii, "patrimonio", e.target.value)} className="inp" /></td>
                                <td className="px-2 py-1"><input value={it.descricao || ""} onChange={e => updateItemField(ci, ii, "descricao", e.target.value)} className="inp" /></td>
                                <td className="px-2 py-1"><input type="number" min={1} value={it.quantidade || 1} onChange={e => updateItemField(ci, ii, "quantidade", parseInt(e.target.value) || 1)} className="inp text-right" /></td>
                                <td className="px-2 py-1">
                                  {/* Rev. 2354 — subtotal em formato BRL (R$ X.XXX,XX). */}
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={it.subtotal != null && it.subtotal !== "" ? `R$ ${Number(it.subtotal).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
                                    onChange={e => {
                                      const raw = e.target.value.replace(/\D/g, "");
                                      const num = raw ? parseInt(raw, 10) / 100 : 0;
                                      updateItemField(ci, ii, "subtotal", num);
                                    }}
                                    className="inp text-right tabular-nums"
                                  />
                                </td>
                                <td className="px-2 py-1 text-right">
                                  <button onClick={() => removerItemPreview(ci, ii)} className="text-red-500 hover:bg-red-50 p-0.5 rounded" title="Remover item">
                                    <X className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                {importPreview ? `Total: ${fmtN(importPreview.length)} contrato(s) · ${fmtN(importPreview.reduce((a, c) => a + (c.itens?.length || 0), 0))} unidade(s) a cadastrar` : "Cadastro inicial — fotos serão exigidas nos próximos recebimentos."}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalImport(false)} disabled={parsearPdf.isPending || !!importLoteProgresso} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
                {(() => {
                  // Rev. 2353 — desabilita "Confirmar" enquanto houver contrato
                  // sem obra (regra do user: nada de equipamento sem obra).
                  // Rev. 2413 — idem para fornecedor (locadora). Sem isso o ERP
                  // cria itens órfãos de locadora e quebra a rastreabilidade.
                  const semObra = importPreview ? importPreview.filter((c: any) => !c.obraId).length : 0;
                  const semForn = importPreview ? importPreview.filter((c: any) => !c.fornecedorNome || !String(c.fornecedorNome).trim()).length : 0;
                  const bloqueado = !importPreview || importPreview.length === 0 || !!importLoteProgresso || semObra > 0 || semForn > 0;
                  const motivo = semObra > 0
                    ? `${semObra} contrato(s) sem obra vinculada — selecione no campo "Obra ERP" de cada cartão`
                    : semForn > 0
                      ? `${semForn} contrato(s) sem fornecedor — preencha "Fornecedor (locadora) deste PDF" e clique em "Aplicar a todos"`
                      : undefined;
                  return (
                    <button
                      onClick={confirmarImport}
                      disabled={bloqueado}
                      title={motivo}
                      className={`px-4 py-1.5 text-sm rounded disabled:opacity-50 inline-flex items-center gap-1 ${(semObra > 0 || semForn > 0) ? "bg-red-500 hover:bg-red-600 text-white cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}
                    >
                      {importLoteProgresso
                        ? `Cadastrando lote ${importLoteProgresso.lote}/${importLoteProgresso.totalLotes}…`
                        : semObra > 0
                          ? <>⛔ {fmtN(semObra)} sem obra — vincule antes</>
                          : semForn > 0
                            ? <>⛔ {fmtN(semForn)} sem fornecedor — indique antes</>
                            : <><CheckCircle2 className="h-4 w-4" /> Confirmar e cadastrar</>}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`.inp{width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:4px;font-size:14px}`}</style>

      {/* Rev. 2337 — Modal de confirmação "Categorizar com IA" */}
      {modalCategIA && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !categorizarMut.isPending && setModalCategIA(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white p-5">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2.5 ring-1 ring-white/30">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Categorizar com IA</h3>
                  <p className="text-xs text-violet-50/90 mt-0.5">Classificação automática dos {fmtN(totalSemCategoria)} equipamento(s) sem categoria</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700">
              <p>A IA vai ler as <b>descrições únicas</b> do seu acervo e propor de 5 a 10 categorias (andaime, elétrico, ferramenta, EPI, etc.). Depois aplica a cada equipamento em uma única operação.</p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <b>Como funciona:</b> roda em ~10–30s · só toca itens sem categoria (o que você já categorizou na mão é preservado) · você pode rodar de novo a qualquer momento.
              </div>
              {categorizarMut.isPending && (
                <div className="flex items-center gap-2 text-violet-700 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> IA analisando descrições e propondo categorias…
                </div>
              )}
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setModalCategIA(null)} disabled={categorizarMut.isPending}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-60">Cancelar</button>
              <button onClick={() => categorizarMut.mutate({ companyId, sobrescrever: false })} disabled={categorizarMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg shadow-md transition disabled:opacity-60 disabled:cursor-wait">
                {categorizarMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Categorizando…</> : <><Sparkles className="h-4 w-4" /> Categorizar agora</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2337 — Modal de resultado da categorização */}
      {resultadoCategIA && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setResultadoCategIA(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white p-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2.5 ring-1 ring-white/30">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Categorização concluída</h3>
                  <p className="text-xs text-emerald-50/90 mt-0.5">
                    {fmtN(resultadoCategIA.itensAtualizados)} equipamento(s) classificados em {fmtN(resultadoCategIA.categorias.length)} categoria(s)
                  </p>
                </div>
              </div>
              <button onClick={() => setResultadoCategIA(null)} className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Categorias propostas pela IA</div>
                <div className="flex flex-wrap gap-2">
                  {resultadoCategIA.categorias.map(c => (
                    <button key={c} onClick={() => { setFiltroCategoria(c); setResultadoCategIA(null); }}
                      className="inline-flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-800 px-3 py-1.5 rounded-full text-xs font-semibold transition">
                      <Tag className="h-3 w-3" /> {c}
                    </button>
                  ))}
                </div>
              </div>
              {resultadoCategIA.descricoesNaoMapeadas.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-amber-900 mb-1">⚠ {fmtN(resultadoCategIA.descricoesNaoMapeadas.length)} descrição(ões) não puderam ser classificadas:</div>
                  <ul className="text-xs text-amber-800 space-y-0.5 mt-1 max-h-32 overflow-y-auto">
                    {resultadoCategIA.descricoesNaoMapeadas.map((d, i) => <li key={i}>• {d}</li>)}
                  </ul>
                  <div className="text-[11px] text-amber-700 mt-2">Rode novamente ou edite manualmente — o botão "Categorizar com IA" continua disponível enquanto houver itens sem categoria.</div>
                </div>
              )}
              {resultadoCategIA.haMaisLotes && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  <b>Há mais lotes pra processar.</b> Acervo grande (&gt;800 descrições únicas) — clique de novo em "Categorizar com IA" pra processar o próximo lote.
                </div>
              )}
              <div className="text-[11px] text-slate-500">Analisadas: {fmtN(resultadoCategIA.descricoesAnalisadas)} descrição(ões) única(s).</div>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end">
              <button onClick={() => setResultadoCategIA(null)} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2355 — Modal "Biblioteca de fotos" — solução DEFINITIVA pra fotos
          de equipamentos. User sobe 1 foto por descrição canônica; ERP propaga
          pra todas as unidades dessa descrição + aplica em imports futuros. */}
      {modalBiblioteca && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalBiblioteca(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg"><Library className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-lg font-bold">Biblioteca de fotos</h3>
                  <p className="text-xs text-indigo-100 opacity-90">1 foto por descrição → aplica em TODAS as unidades (atuais + importações futuras).</p>
                </div>
              </div>
              <button onClick={() => setModalBiblioteca(false)} className="text-white/80 hover:text-white p-1"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-3 bg-indigo-50/70 border-b border-indigo-100 text-xs text-indigo-900 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {bibliotecaQuery.data
                  ? <>📚 <b>{fmtN(bibliotecaQuery.data.totalGrupos)}</b> descrição(ões) cadastrada(s) · <b>{fmtN(bibliotecaQuery.data.totalComCanonica)}</b> com foto na biblioteca</>
                  : "Carregando descrições…"}
              </span>
            </div>
            <div className="px-6 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input value={bibliotecaBuscaQ} onChange={(e) => setBibliotecaBuscaQ(e.target.value)} placeholder="Filtrar descrição…"
                  className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {bibliotecaQuery.isLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-500"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando…</div>
              ) : bibliotecaQuery.data && bibliotecaQuery.data.grupos.length === 0 ? (
                <div className="text-center py-12 text-slate-500">Nenhuma descrição cadastrada ainda. Cadastre equipamentos primeiro.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(bibliotecaQuery.data?.grupos ?? [])
                    .filter(g => {
                      if (!bibliotecaBuscaQ.trim()) return true;
                      const q = bibliotecaBuscaQ.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                      return g.descricaoNormalizada.includes(q);
                    })
                    .map(g => {
                      const descOriginal = g.descricoesOriginais[0] || g.descricaoNormalizada;
                      const uploading = uploadingDescNorm === g.descricaoNormalizada && fotoCanonUpsertMut.isPending;
                      const buscandoWeb = buscandoWebBibliotecaDescNorm.has(g.descricaoNormalizada);
                      const fotoUrl = g.canonica?.fotoUrl || null;
                      return (
                        <div key={g.descricaoNormalizada} className={`border rounded-xl p-3 flex gap-3 transition ${fotoUrl ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                          {/* Rev. 2368 — COM foto: thumb vira botão que abre
                              lightbox (zoom). SEM foto: vira label de upload
                              (comportamento original). */}
                          {fotoUrl ? (
                            <button
                              type="button"
                              onClick={() => setLightbox({ url: fotoUrl, titulo: descOriginal })}
                              disabled={buscandoWeb}
                              title="Clique para ampliar a foto"
                              className={`relative w-20 h-20 rounded-lg flex-shrink-0 overflow-hidden ring-1 ring-slate-200 group/zoom cursor-zoom-in ${buscandoWeb ? "opacity-60 cursor-wait" : ""}`}>
                              <img src={fotoUrl} className="w-full h-full object-cover" alt={descOriginal} />
                              <div className="absolute inset-0 bg-black/0 group-hover/zoom:bg-black/40 transition flex items-center justify-center opacity-0 group-hover/zoom:opacity-100">
                                <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                              </div>
                              {buscandoWeb && (
                                <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                                  <Loader2 className="h-5 w-5 animate-spin text-sky-600" />
                                </div>
                              )}
                            </button>
                          ) : (
                            <label className={`relative w-20 h-20 rounded-lg flex-shrink-0 cursor-pointer overflow-hidden ring-1 ring-slate-200 ${uploading || buscandoWeb ? "opacity-60" : ""}`}>
                              <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-400">
                                <ImagePlus className="h-5 w-5" />
                                <span className="text-[9px] mt-0.5">Subir</span>
                              </div>
                              {(uploading || buscandoWeb) && (
                                <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                                  <Loader2 className={`h-5 w-5 animate-spin ${buscandoWeb ? "text-sky-600" : "text-indigo-600"}`} />
                                </div>
                              )}
                              <input type="file" accept="image/*" className="hidden"
                                disabled={uploading || buscandoWeb}
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (f) await handleBibliotecaUpload(descOriginal, f);
                                  e.target.value = "";
                                }} />
                            </label>
                          )}
                          <div className="flex-1 min-w-0 flex flex-col">
                            <div className="font-semibold text-sm text-slate-900 truncate" title={descOriginal}>{descOriginal}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1"><Boxes className="h-3 w-3" /> {fmtN(g.unidades)} un.</span>
                              <span className={`inline-flex items-center gap-1 ${g.comFoto === g.unidades && g.comFoto > 0 ? "text-emerald-700" : g.comFoto > 0 ? "text-amber-700" : "text-slate-500"}`}>
                                <Camera className="h-3 w-3" /> {fmtN(g.comFoto)}/{fmtN(g.unidades)} c/ foto
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-auto pt-2 flex-wrap">
                              {fotoUrl ? (
                                <>
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold"><Check className="h-3 w-3" /> Na biblioteca</span>
                                  {/* Rev. 2369 — abre modal "Rebuscar com outro termo". */}
                                  <button onClick={() => abrirModalRebuscar("biblioteca", descOriginal, fotoUrl)}
                                    disabled={buscandoWeb || uploading}
                                    title="Trocar foto: digite um termo de busca melhor pra encontrar a foto certa"
                                    className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:text-sky-800 hover:underline disabled:opacity-50">
                                    {buscandoWeb ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />} Trocar pela web
                                  </button>
                                  <button onClick={() => g.canonica && companyId && fotoCanonRemoverMut.mutate({ companyId, id: g.canonica.id })}
                                    disabled={fotoCanonRemoverMut.isPending || buscandoWeb}
                                    className="ml-auto text-[11px] text-red-600 hover:text-red-700 hover:underline disabled:opacity-50">
                                    Remover
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => buscarWebParaBiblioteca(descOriginal)}
                                    disabled={buscandoWeb || uploading}
                                    title="Buscar a 1ª foto da web no DuckDuckGo e salvar na biblioteca"
                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 font-semibold disabled:opacity-50">
                                    {buscandoWeb ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                                    {buscandoWeb ? "Buscando..." : "Buscar na web"}
                                  </button>
                                  <span className="text-[11px] text-slate-400 italic">ou clique no quadro p/ subir</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-indigo-500" /> Imagens são comprimidas (máx 1920px, JPEG q=0.82) antes do upload.</div>
              <button onClick={() => setModalBiblioteca(false)} className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-medium">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2368 — Lightbox de foto (fullscreen, ESC ou click fora fecha) */}
      {/* Rev. 2369 — Modal "Rebuscar foto com outro termo".
          O DDG vai procurar pelo TEXTO QUE O USER DIGITAR (não pela
          descrição cripto do ERP). Preview antes de aplicar. */}
      {modalRebuscar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] flex items-center justify-center p-4"
          onClick={() => { if (!rebuscarLoading) setModalRebuscar(null); }}
          role="dialog" aria-modal="true" aria-label="Buscar foto com outro termo">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-gradient-to-r from-sky-600 to-cyan-600 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Globe className="h-5 w-5 flex-shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-bold text-base truncate">Buscar foto com outro termo</h3>
                  <p className="text-xs text-sky-50/90 truncate">{modalRebuscar.descricao}</p>
                </div>
              </div>
              <button onClick={() => setModalRebuscar(null)} disabled={!!rebuscarLoading}
                className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition disabled:opacity-50"
                title="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Termo de busca (o que vai pro DuckDuckGo Images)
                </label>
                <div className="flex gap-2">
                  <input type="text" value={rebuscarTermo}
                    onChange={(e) => setRebuscarTermo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !rebuscarLoading) rebuscarFoto(); }}
                    placeholder="ex.: esmerilhadeira angular 4 polegadas 220v"
                    disabled={!!rebuscarLoading}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 disabled:bg-slate-50" />
                  <button onClick={rebuscarFoto} disabled={!!rebuscarLoading || !rebuscarTermo.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-wait">
                    {rebuscarLoading === "buscando"
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</>
                      : <><Search className="h-4 w-4" /> Buscar</>}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Dica: descrições cripto (ex.: "ESMER INDL41/2" 220V") confundem a busca. Escreva como você procuraria no Google.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Foto atual</div>
                  <div className="aspect-square rounded-lg ring-1 ring-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                    {modalRebuscar.fotoAtual
                      ? <img src={modalRebuscar.fotoAtual} alt="Foto atual" className="w-full h-full object-contain" />
                      : <div className="text-slate-400 text-xs flex flex-col items-center gap-1"><Camera className="h-8 w-8" /> Sem foto</div>}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-sky-700 uppercase tracking-wide mb-1.5">Candidata da web</div>
                  <div className="aspect-square rounded-lg ring-2 ring-sky-300 bg-sky-50 flex items-center justify-center overflow-hidden">
                    {rebuscarLoading === "buscando"
                      ? <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                      : rebuscarPreview
                      ? <img src={rebuscarPreview} alt="Candidata" className="w-full h-full object-contain" />
                      : <div className="text-slate-400 text-xs text-center px-2">Clique em <strong>Buscar</strong> pra ver a foto candidata</div>}
                  </div>
                </div>
              </div>
              {rebuscarErro && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{rebuscarErro}</span>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <button onClick={() => setModalRebuscar(null)} disabled={!!rebuscarLoading}
                className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-200 transition disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={aplicarRebuscaFoto}
                disabled={!rebuscarPreview || !!rebuscarLoading}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50 disabled:cursor-wait shadow">
                {rebuscarLoading === "aplicando"
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Aplicando...</>
                  : <><Check className="h-4 w-4" /> Aplicar esta foto</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ampliada: ${lightbox.titulo}`}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition"
            title="Fechar (ESC)"
            aria-label="Fechar foto ampliada">
            <X className="h-5 w-5" />
          </button>
          <div className="absolute top-4 left-4 right-16 text-white/95 text-sm font-semibold truncate" title={lightbox.titulo}>
            {lightbox.titulo}
          </div>
          <img
            src={lightbox.url}
            alt={lightbox.titulo}
            className="max-w-[95vw] max-h-[88vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs select-none pointer-events-none">
            Clique fora ou pressione <kbd className="px-1.5 py-0.5 bg-white/15 rounded text-[10px] font-semibold">ESC</kbd> para fechar
          </div>
        </div>
      )}

      {/* Rev. 2342 — Modal de confirmação "Limpar fotos da IA" */}
      {modalLimparFotos && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !limparFotosMut.isPending && setModalLimparFotos(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-red-600 to-rose-600 text-white p-5">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2.5 ring-1 ring-white/30">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Limpar fotos da IA</h3>
                  <p className="text-xs text-red-50/90 mt-0.5">Remover as {fmtN(totalComFotoIA)} foto(s) ilustrativa(s) aplicadas pela IA</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700">
              <p>Esta ação zera o campo <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">foto_url</code> de todos os {fmtN(totalComFotoIA)} equipamento(s) desta empresa que tinham foto aplicada pela IA.</p>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
                <b>Seguro:</b> as fotos do <b>recebimento físico</b> (tiradas na obra durante o check-in) NÃO são afetadas — apenas as ilustrativas buscadas pela IA.
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                Depois de limpar, use "Buscar fotos com IA" novamente — a nova versão valida cada candidato pelo Gemini antes de aplicar.
              </div>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setModalLimparFotos(false)} disabled={limparFotosMut.isPending}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-60">Cancelar</button>
              <button
                onClick={() => limparFotosMut.mutate({ companyId })}
                disabled={limparFotosMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md transition disabled:opacity-60 disabled:cursor-wait">
                {limparFotosMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Limpando…</> : <><Trash2 className="h-4 w-4" /> Sim, limpar todas</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2340 — Modal de confirmação "Buscar fotos com IA" */}
      {modalFotosIA && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !buscarFotosMut.isPending && setModalFotosIA(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-pink-600 to-rose-600 text-white p-5">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2.5 ring-1 ring-white/30">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Buscar fotos com IA</h3>
                  <p className="text-xs text-pink-50/90 mt-0.5"><b>Cobertura 100% garantida</b> para os {fmtN(totalSemFoto)} equipamento(s) sem foto</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700">
              <p>A IA agrupa por <b>descrição única</b> (ex: "SAPATAS AJUSTÁVEIS" aparece 1.218 vezes mas é 1 busca só), busca em <b>português</b> no Google + OpenVerse + Wikimedia e aplica <b>validação rigorosa</b> em todo candidato antes de salvar.</p>
              <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-xs text-pink-900 space-y-1">
                <div><b>Fase A — Foto validada:</b> Gemini só aprova candidatos cujo título bate com o equipamento. <b>Em dúvida, rejeita.</b></div>
                <div><b>Fase C — Placeholder por categoria:</b> pros que não passarem na validação — card colorido com a categoria. Garante 100% sem foto errada.</div>
                <div className="text-pink-700 italic">Filosofia: melhor placeholder honesto que foto errada.</div>
                <div><b>Idempotente:</b> só toca itens sem foto (não substitui fotos do recebimento físico).</div>
                <div><b>Reset:</b> se quiser começar do zero, use o botão vermelho "Limpar fotos IA" no header.</div>
              </div>
              {buscarFotosMut.isPending && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-pink-700 font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando imagens…
                    </span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {fotoSegundosDecorridos}s / ~{fotoSegundosEstimados}s · <b className="text-pink-700">{fotoPct}%</b>
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-pink-100 rounded-full overflow-hidden ring-1 ring-pink-200">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-500 ease-out"
                      style={{ width: `${fotoPct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Processando lote <b className="text-pink-700">{(fotosAcumRef.current?.lotes ?? 0) + 1}</b>
                    {fotosAcumRef.current && fotosAcumRef.current.lotes > 0 && (
                      <> · acumulado: <b>{fmtN(fotosAcumRef.current.itensAtualizados)}</b> equip. atualizado(s), <b>{fmtN(fotosAcumRef.current.encontradas)}</b> foto(s) encontrada(s)</>
                    )}
                    {!fotosAcumRef.current?.lotes && <> — ~{fotoDescricoesEstimadas} descrição(ões) por lote, vou rodar em cascata até processar todos.</>}
                    {fotoSegundosDecorridos > fotoSegundosEstimados + 10 && (
                      <span className="text-amber-700"> · Os provedores estão respondendo mais devagar que o esperado — aguarde.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
              <button onClick={() => setModalFotosIA(null)} disabled={buscarFotosMut.isPending}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition disabled:opacity-60">Cancelar</button>
              <button
                onClick={() => {
                  fotosAcumRef.current = null;
                  setFotoInicio(Date.now());
                  setFotoTickNow(Date.now());
                  buscarFotosMut.mutate({ companyId, sobrescrever: false });
                }}
                disabled={buscarFotosMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg shadow-md transition disabled:opacity-60 disabled:cursor-wait">
                {buscarFotosMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</> : <><Camera className="h-4 w-4" /> Buscar agora</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rev. 2340 — Modal de resultado da busca de fotos */}
      {resultadoFotosIA && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setResultadoFotosIA(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white p-5 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-xl p-2.5 ring-1 ring-white/30">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Fotos aplicadas pela IA</h3>
                  <p className="text-xs text-emerald-50/90 mt-0.5">
                    {fmtN(resultadoFotosIA.fotosEncontradas)} de {fmtN(resultadoFotosIA.descricoesAnalisadas)} descrição(ões) — {fmtN(resultadoFotosIA.itensAtualizados)} equipamento(s) atualizado(s)
                  </p>
                </div>
              </div>
              <button onClick={() => setResultadoFotosIA(null)} className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg p-1.5"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              {(resultadoFotosIA.fotosPhaseA !== undefined || resultadoFotosIA.fotosPhaseC !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-emerald-700 tabular-nums">{fmtN(resultadoFotosIA.fotosPhaseA ?? 0)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-emerald-900 font-semibold mt-1">Fase A · Foto validada</div>
                  </div>
                  <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-slate-700 tabular-nums">{fmtN(resultadoFotosIA.fotosPhaseC ?? 0)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-900 font-semibold mt-1">Fase C · Placeholder</div>
                  </div>
                </div>
              )}
              {resultadoFotosIA.cotaEsgotada && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
                  <b>⚠ Cota do Google esgotada hoje.</b> Plano gratuito = 100 buscas/dia. OpenVerse + Wikimedia + placeholder cobriram o restante; amanhã rode de novo pra tentar buscar mais fotos reais.
                </div>
              )}
              {resultadoFotosIA.haMaisLotes && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                  Ainda há mais descrições sem foto. Clique em <b>Buscar fotos com IA</b> de novo para processar o próximo lote.
                </div>
              )}
              <div className="text-sm text-slate-700">Cobertura 100% deste lote garantida. 🎉</div>
              {(resultadoFotosIA.fotosPhaseC ?? 0) > 0 && (
                <div className="text-[11px] text-slate-500">Placeholders são cards coloridos com o nome da categoria — clique em "Limpar fotos IA" e rode novamente quando quiser tentar fotos reais.</div>
              )}
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end">
              <button onClick={() => setResultadoFotosIA(null)} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition">Fechar</button>
            </div>
          </div>
        </div>
      )}
      {/* Rev. 2366 — Widget de progresso flutuante (canto inferior direito)
          enquanto roda a busca em lote de fotos da web. Mostra X/Total +
          descrição atual + contadores de sucesso/falha + botão "Parar". */}
      {batchWeb && (
        <div role="status" aria-live="polite"
             className="fixed bottom-4 right-4 z-[80] w-[min(92vw,420px)] bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-sky-600 to-cyan-600 text-white px-4 py-2.5 flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <div className="text-sm font-semibold flex-1">Buscando fotos na web</div>
            <Loader2 className="h-4 w-4 animate-spin opacity-80" />
          </div>
          <div className="p-4 space-y-2">
            <div className="flex items-baseline justify-between text-xs text-slate-600">
              <span>Processando <b className="text-slate-900">{fmtN(batchWeb.atual)}</b> de <b>{fmtN(batchWeb.total)}</b></span>
              <span className="tabular-nums">{Math.round((batchWeb.atual / Math.max(1, batchWeb.total)) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-300"
                   style={{ width: `${Math.round((batchWeb.atual / Math.max(1, batchWeb.total)) * 100)}%` }} />
            </div>
            <div className="text-xs text-slate-700 truncate" title={batchWeb.descricaoAtual}>
              <span className="text-slate-500">Agora: </span>
              <span className="font-medium">{batchWeb.descricaoAtual}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="text-center bg-emerald-50 rounded-lg px-2 py-1.5">
                <div className="text-[10px] text-emerald-700 uppercase tracking-wider font-bold">Encontradas</div>
                <div className="text-sm font-bold text-emerald-800 tabular-nums">{fmtN(batchWeb.ok)}</div>
              </div>
              <div className="text-center bg-slate-50 rounded-lg px-2 py-1.5">
                <div className="text-[10px] text-slate-600 uppercase tracking-wider font-bold">Sem foto</div>
                <div className="text-sm font-bold text-slate-700 tabular-nums">{fmtN(batchWeb.falhas)}</div>
              </div>
              <div className="text-center bg-sky-50 rounded-lg px-2 py-1.5">
                <div className="text-[10px] text-sky-700 uppercase tracking-wider font-bold">Aplicadas</div>
                <div className="text-sm font-bold text-sky-800 tabular-nums">{fmtN(batchWeb.itensAtualizados)}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { batchWebRef.current.cancelar = true; }}
              className="w-full mt-1 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 py-1.5 rounded-md transition inline-flex items-center justify-center gap-1.5"
              title="Interromper após a descrição atual">
              <X className="h-3.5 w-3.5" /> Parar busca
            </button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Kpi({ icon: Icon, label, value, sub, tint, money, onClick, active, title }: { icon: LucideIcon; label: string; value: ReactNode; sub?: string; tint: "blue" | "amber" | "red" | "emerald"; money?: boolean; onClick?: () => void; active?: boolean; title?: string }) {
  const palette: Record<string, { ring: string; ringActive: string; iconBg: string; iconColor: string; value: string; bgActive: string }> = {
    blue:    { ring: "ring-blue-100",    ringActive: "ring-2 ring-blue-500",       iconBg: "bg-blue-50",    iconColor: "text-blue-600",    value: "text-blue-900",    bgActive: "bg-blue-50/60"    },
    amber:   { ring: "ring-amber-100",   ringActive: "ring-2 ring-amber-500",      iconBg: "bg-amber-50",   iconColor: "text-amber-600",   value: "text-amber-900",   bgActive: "bg-amber-50/60"   },
    red:     { ring: "ring-red-100",     ringActive: "ring-2 ring-red-500",        iconBg: "bg-red-50",     iconColor: "text-red-600",     value: "text-red-900",     bgActive: "bg-red-50/60"     },
    emerald: { ring: "ring-emerald-100", ringActive: "ring-2 ring-emerald-500",    iconBg: "bg-emerald-50", iconColor: "text-emerald-600", value: "text-emerald-900", bgActive: "bg-emerald-50/60" },
  };
  const p = palette[tint];
  // Rev. 2338 — tipografia fluida (clamp) p/ caber tanto em mobile quanto desktop
  // sem quebrar layout quando valor monetário cresce (ex: "R$ 15.815,50").
  // Rev. 2361 — com 5 cards o clamp ficou um pouco mais agressivo no mínimo.
  const valueStyle = money
    ? { fontSize: "clamp(0.95rem, 2.2vw, 1.4rem)" } // R$ ... — encolhe pra caber em 5col
    : { fontSize: "clamp(1.25rem, 2.8vw, 1.85rem)" };
  // Rev. 2361 — quando há onClick vira <button> com hover/ring de seleção + ARIA pressed.
  const baseCls = `border rounded-xl shadow-sm p-3 sm:p-4 ring-1 transition min-w-0 w-full text-left ${
    active ? `${p.ringActive} ${p.bgActive} border-transparent shadow-md` : `bg-white border-slate-200 ${p.ring}`
  } ${onClick ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]" : ""}`;
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className={`${p.iconBg} ${p.iconColor} rounded-lg p-1.5 sm:p-2 shrink-0`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        {sub && <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-slate-400 font-semibold text-right truncate">{sub}</span>}
      </div>
      <div
        className={`mt-2 sm:mt-3 font-bold ${p.value} truncate tabular-nums`}
        style={valueStyle}
        title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
      >
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
      <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{label}</div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={!!active} title={title} className={baseCls}>
        {content}
      </button>
    );
  }
  return <div className={baseCls} title={title}>{content}</div>;
}
function Section({ icon: Icon, title, tint, children }: { icon: LucideIcon; title: string; tint: "emerald" | "blue" | "amber" | "slate" | "red" | "violet"; children: ReactNode }) {
  const palette: Record<string, { bar: string; iconBg: string; iconColor: string; text: string }> = {
    emerald: { bar: "bg-emerald-500", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", text: "text-emerald-900" },
    blue:    { bar: "bg-blue-500",    iconBg: "bg-blue-50",    iconColor: "text-blue-600",    text: "text-blue-900" },
    amber:   { bar: "bg-amber-500",   iconBg: "bg-amber-50",   iconColor: "text-amber-600",   text: "text-amber-900" },
    slate:   { bar: "bg-slate-400",   iconBg: "bg-slate-100",  iconColor: "text-slate-600",   text: "text-slate-900" },
    red:     { bar: "bg-red-500",     iconBg: "bg-red-50",     iconColor: "text-red-600",     text: "text-red-900" },
    violet:  { bar: "bg-violet-500",  iconBg: "bg-violet-50",  iconColor: "text-violet-600",  text: "text-violet-900" },
  };
  const p = palette[tint];
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <div className={`${p.iconBg} ${p.iconColor} rounded-md p-1.5`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className={`text-sm font-semibold ${p.text}`}>{title}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1 text-slate-700">{label}</label>
      {children}
    </div>
  );
}
function Modal({ title, onClose, onSave, children, saveLabel = "Salvar", loading }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
          <button onClick={onSave} disabled={loading} className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 inline-flex items-center gap-1">
            {loading ? "Salvando…" : <><CheckCircle2 className="h-4 w-4" /> {saveLabel}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
