import DashboardLayout from "@/components/DashboardLayout";
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Plus, Search, X, Truck, CheckCircle2, RotateCcw, ClipboardCheck, Eye, FileText, Upload, Sparkles, Trash2, Activity, Clock, AlertTriangle, DollarSign, Calendar, Hash, Building2, User as UserIcon, MapPin, Camera, StickyNote, ChevronDown, Tag, Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { FotosUploader, FotoItem, fmtMoney, fmtDate, Spinner } from "./_shared";

const STATUS_LABELS: Record<string, string> = {
  em_uso: "Em uso", devolvido: "Devolvido", atrasado: "Atrasado",
  em_renovacao: "Em renovação", localizacao_pendente: "Local pendente", em_manutencao: "Manutenção",
};
const STATUS_COLORS: Record<string, string> = {
  em_uso: "bg-blue-100 text-blue-700",
  devolvido: "bg-slate-200 text-slate-700",
  atrasado: "bg-red-100 text-red-700",
  em_renovacao: "bg-amber-100 text-amber-700",
  localizacao_pendente: "bg-orange-100 text-orange-700",
  em_manutencao: "bg-purple-100 text-purple-700",
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
  const companyId = Number(selectedCompany?.id) || 0;
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("em_uso");
  // Rev. 2334 — filtro por obra ("" = todas; "__null__" = sem obra; "<id>" = obra ERP)
  const [filtroObra, setFiltroObra] = useState<string>("");
  // Rev. 2337 — filtro por categoria ("" = todas; "__null__" = sem categoria; "<nome>" = nome exato)
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");

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
  const data = useMemo(() => {
    if (!filtroCategoria) return dataPorStatusEObra;
    if (filtroCategoria === "__null__") return dataPorStatusEObra.filter(l => !l.categoria);
    return dataPorStatusEObra.filter(l => String(l.categoria || "") === filtroCategoria);
  }, [dataPorStatusEObra, filtroCategoria]);

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
  const eventos = trpc.equipamentos.eventosListar.useQuery(
    { companyId, equipamentoLocadoId: modalEventos?.id || 0 },
    { enabled: !!modalEventos }
  );

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

  const criar = trpc.equipamentos.locadoCriar.useMutation({
    onSuccess: () => { utils.equipamentos.locadosListar.invalidate(); setModal(false); setForm({ ...EMPTY }); setFotos([]); toast.success("Equipamento locado cadastrado!"); },
    onError: (e) => toast.error(e.message),
  });
  const devolver = trpc.equipamentos.locadoDevolver.useMutation({
    onSuccess: () => { utils.equipamentos.locadosListar.invalidate(); setModalDev(null); setDevFotos([]); toast.success("Equipamento devolvido."); },
    onError: (e) => toast.error(e.message),
  });
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

  // Rev. 2321 — Polling em vez de single mutation (proxy Replit matava em 60s).
  // Fluxo: Start retorna {jobId} em ms → polling /Status cada 2.5s → done|error.
  const [parsePending, setParsePending] = useState(false);
  const [parseJobId, setParseJobId] = useState<string | null>(null);
  const parsearStart = trpc.equipamentos.parsearContratoLocacaoPdfStart.useMutation({
    onSuccess: ({ jobId }) => { setParseJobId(jobId); },
    onError: (e) => { setParsePending(false); setImportProgresso(0); toast.error(e.message); },
  });
  useEffect(() => {
    if (!parseJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await utils.equipamentos.parsearContratoLocacaoPdfStatus.fetch({ jobId: parseJobId });
        if (cancelled) return;
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
          setImportPreview(comMatch);
          const tot = res.result.totalContratos;
          toast.success(`IA detectou ${tot} contrato(s) · ${res.result.totalItens} item(ns).${autoMatched > 0 ? ` ${autoMatched}/${tot} auto-vinculados à obra.` : ""}`);
          setParsePending(false); setParseJobId(null);
        } else if (res.status === "error") {
          toast.error(res.error || "Falha ao processar o PDF.");
          setParsePending(false); setImportProgresso(0); setParseJobId(null);
        } else if (res.status === "expired") {
          toast.error("Job expirou. Tente novamente.");
          setParsePending(false); setImportProgresso(0); setParseJobId(null);
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
    setModalImport(true);
  }
  async function handlePdfPick(file: File) {
    if (file.size > 15 * 1024 * 1024) return toast.error("Arquivo > 15MB. Reduza ou divida o PDF.");
    const okMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!okMimes.includes(file.type)) return toast.error("Formato não suportado. Use PDF, JPG, PNG ou WEBP.");
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    setImportArquivo({ nome: file.name, mimeType: file.type, base64 });
    setImportPreview(null);
    setImportProgresso(0);
    setParsePending(true);
    parsearStart.mutate({ companyId, pdfBase64: base64, mimeType: file.type as any, nomeArquivo: file.name });
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
      setModal(true);
    } else if (action === "devolver") {
      setFiltroStatus("em_uso");
      toast.info("Selecione o equipamento que deseja devolver na lista abaixo.", { duration: 5000 });
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
    if (!form.descricao.trim()) return toast.error("Descrição é obrigatória.");
    if (!form.dataFimPrevista) return toast.error("Data fim prevista é obrigatória.");
    if (fotos.length === 0) return toast.error("Foto de recebimento é obrigatória.");
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
    });
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

  const stats = useMemo(() => {
    const s = { ativos: 0, vencendo: 0, atrasados: 0, valorMes: 0 };
    const hoje = Date.now();
    const limite30 = hoje + 30 * 86400 * 1000;
    for (const l of data as any[]) {
      if (l.status === "em_uso") {
        s.ativos++;
        s.valorMes += Number(l.valorMensal) || 0;
        const fim = new Date(l.dataFimPrevista).getTime();
        if (fim < hoje) s.atrasados++;
        else if (fim < limite30) s.vencendo++;
      }
    }
    return s;
  }, [data]);

  const STATUS_PILLS: { key: string; label: string; color: string }[] = [
    { key: "",             label: "Todos",       color: "from-slate-500 to-slate-700" },
    { key: "em_uso",       label: "Em uso",      color: "from-blue-500 to-blue-700" },
    { key: "em_renovacao", label: "Em renovação", color: "from-amber-500 to-amber-700" },
    { key: "atrasado",     label: "Atrasados",   color: "from-red-500 to-red-700" },
    { key: "devolvido",    label: "Devolvidos",  color: "from-slate-400 to-slate-600" },
  ];
  // Contadores cross-filter — sempre sobre o universo completo (dataAll),
  // pra que cada pill mostre quantos existem em cada status independente
  // do filtro selecionado.
  const contStatus = useMemo(() => {
    const c: Record<string, number> = { "": 0, em_uso: 0, em_renovacao: 0, atrasado: 0, devolvido: 0 };
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
  const totalSemCategoria = useMemo(() => (dataAll as any[]).filter(l => !l.categoria || String(l.categoria).trim() === "").length, [dataAll]);

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
              {/* Rev. 2337 — Categorizar com IA (só aparece se houver itens sem categoria). */}
              {totalSemCategoria > 0 && (
                <button onClick={() => setModalCategIA({ sobrescrever: false })}
                  disabled={categorizarMut.isPending}
                  className="inline-flex items-center gap-2 bg-violet-500/90 text-white hover:bg-violet-500 px-4 py-2.5 rounded-xl shadow-md font-semibold text-sm transition ring-1 ring-violet-300/60 disabled:opacity-60 disabled:cursor-wait"
                  title={`${totalSemCategoria} equipamento(s) sem categoria — a IA propõe categorias e classifica em lote`}>
                  {categorizarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                  Categorizar com IA
                  <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[10px] font-bold bg-white/25">{totalSemCategoria}</span>
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

        {/* KPI cards modernos · Rev. 2338 — responsivos: 1col(<sm) → 2col(sm) → 4col(md+) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <Kpi icon={Activity}      label="Ativos"         value={stats.ativos}             tint="blue"   sub="em locação"  />
          <Kpi icon={Clock}         label="Vencendo (30d)" value={stats.vencendo}           tint="amber"  sub="atenção"     />
          <Kpi icon={AlertTriangle} label="Atrasados"      value={stats.atrasados}          tint="red"    sub="renovar/devolver" />
          <Kpi icon={DollarSign}    label="Custo / mês"    value={fmtMoney(stats.valorMes)} tint="emerald" sub="comprometido" money />
        </div>

        {/* Rev. 2334 — Filtros: pills de status (linha 1) + busca + obra (linha 2)
            + chip de filtro ativo (linha 3) + seleção (linha 4). */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_PILLS.map(p => {
              const active = filtroStatus === p.key;
              return (
                <button key={p.key} onClick={() => setFiltroStatus(p.key)}
                  className={`group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                    active
                      ? `bg-gradient-to-r ${p.color} text-white shadow-md`
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}>
                  {p.label}
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
                    active ? "bg-white/25 text-white" : "bg-slate-200 text-slate-700"
                  }`}>{contStatus[p.key] ?? 0}</span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_minmax(220px,auto)_minmax(220px,auto)] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por descrição, fornecedor, patrimônio…"
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition" />
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <select
                value={filtroObra}
                onChange={e => setFiltroObra(e.target.value)}
                className={`w-full pl-10 pr-8 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/30 outline-none transition appearance-none bg-white font-medium ${
                  filtroObra ? "border-emerald-400 bg-emerald-50/40 text-emerald-900" : "border-slate-200 text-slate-700"
                }`}
                title="Filtrar equipamentos por obra ERP">
                <option value="">Todas as obras ({dataPorStatus.length})</option>
                {obrasComItens.map(o => (
                  <option key={o.key} value={o.key}>
                    {o.nome} · {o.count} unid.{o.valorMes > 0 ? ` · ${fmtMoney(o.valorMes)}/mês` : ""}
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
                <option value="">Todas as categorias ({dataPorStatusEObra.length})</option>
                {categoriasComItens.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.nome} · {c.count} unid.{c.valorMes > 0 ? ` · ${fmtMoney(c.valorMes)}/mês` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {/* Rev. 2334+2337 — chips de filtros ativos com botão limpar */}
          {(filtroObra || filtroCategoria || busca) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Filtros ativos:</span>
              {filtroObra && obraSelecionada && (
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full pl-3 pr-1.5 py-1 font-medium">
                  <Building2 className="h-3 w-3" />
                  <span className="max-w-[260px] truncate" title={obraSelecionada.nome}>{obraSelecionada.nome}</span>
                  <span className="text-emerald-600 font-bold">· {obraSelecionada.count}</span>
                  <button onClick={() => setFiltroObra("")} className="ml-1 bg-emerald-200/70 hover:bg-emerald-300 rounded-full p-0.5" title="Remover filtro de obra">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filtroCategoria && categoriaSelecionada && (
                <span className="inline-flex items-center gap-1.5 bg-violet-50 border border-violet-200 text-violet-800 rounded-full pl-3 pr-1.5 py-1 font-medium">
                  <Tag className="h-3 w-3" />
                  <span className="max-w-[200px] truncate" title={categoriaSelecionada.nome}>{categoriaSelecionada.nome}</span>
                  <span className="text-violet-600 font-bold">· {categoriaSelecionada.count}</span>
                  <button onClick={() => setFiltroCategoria("")} className="ml-1 bg-violet-200/70 hover:bg-violet-300 rounded-full p-0.5" title="Remover filtro de categoria">
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
              <button onClick={() => { setFiltroObra(""); setFiltroCategoria(""); setBusca(""); }} className="text-slate-500 hover:text-slate-700 underline ml-1">limpar tudo</button>
            </div>
          )}
          {/* Rev. 2323 — Selecionar todos visíveis (cabeçalho da lista). */}
          {(data as any[]).length > 0 && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 -mb-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none px-1 py-1">
                <input type="checkbox" checked={todosVisiveisSelecionados} onChange={toggleTodosVisiveis} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                Selecionar todos visíveis ({(data as any[]).length})
              </label>
              {selecionados.size > 0 && (
                <button onClick={() => setSelecionados(new Set())} className="text-xs text-slate-500 hover:text-slate-700 underline">limpar seleção ({selecionados.size})</button>
              )}
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
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {(data as any[]).map(l => {
              const fotos = (l.fotosRecebimentoJson as FotoItem[]) || [];
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
                    {fotos[0] ? (
                      <img src={fotos[0].url} className="w-16 h-16 object-cover rounded-lg ring-1 ring-slate-200 flex-shrink-0" alt="" />
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
              <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{selecionados.size}</span>
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
                <Trash2 className="h-4 w-4" /> Excluir {selecionados.size}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal receber locação — seções com ícones */}
      {modal && (
        <Modal title="Receber Locação na Obra" onClose={() => setModal(false)} onSave={salvar} loading={criar.isPending} saveLabel="Confirmar recebimento">
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
        </Modal>
      )}

      {/* Modal devolução */}
      {modalDev && (
        <Modal title={`Devolver: ${modalDev.descricao}`} onClose={() => setModalDev(null)} onSave={fazerDevolucao}
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
                  {fotosRec[0] ? (
                    <img src={fotosRec[0].url} className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl ring-2 ring-white/40 shadow-lg flex-shrink-0" alt="" />
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
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Fornecedor</div>
                    <div className="text-sm font-semibold text-slate-800">{l.fornecedorNome || <span className="italic text-slate-500 font-normal">Sem fornecedor cadastrado</span>}</div>
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
                      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5 mb-3"><Camera className="h-3.5 w-3.5" /> Fotos do recebimento ({fotosRec.length})</div>
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
                      {!eventos.isLoading && <span className="text-xs text-slate-400">{evs.length} evento{evs.length !== 1 ? "s" : ""}</span>}
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
                                {Array.isArray(e.fotosJson) && e.fotosJson.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {e.fotosJson.slice(0, 6).map((f: any, i: number) => (
                                      <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block">
                                        <img src={f.url} className="w-14 h-14 object-cover rounded ring-1 ring-slate-200 hover:ring-emerald-400 transition" alt="" />
                                      </a>
                                    ))}
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
              {!importArquivo && (
                <div
                  onClick={() => importFileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handlePdfPick(f); }}
                  className="border-2 border-dashed border-indigo-300 rounded-lg p-10 text-center cursor-pointer hover:bg-indigo-50/50 transition"
                >
                  <Upload className="h-10 w-10 text-indigo-400 mx-auto mb-3" />
                  <div className="text-slate-700 font-medium">Arraste o PDF da locadora aqui</div>
                  <div className="text-xs text-slate-500 mt-1">ou clique para selecionar · PDF/JPG/PNG até 15MB</div>
                  <div className="text-[11px] text-slate-400 mt-3">A IA (Gemini) detecta automaticamente o layout — Jalves, Mills, Locamerica etc.</div>
                  <input ref={importFileRef} type="file" accept=".pdf,image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfPick(f); }} />
                </div>
              )}

              {importArquivo && (
                <div className="flex items-center justify-between bg-slate-50 border rounded p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    <span className="font-medium">{importArquivo.nome}</span>
                    <span className="text-xs text-slate-500">({(importArquivo.base64.length * 0.75 / 1024).toFixed(0)} KB)</span>
                  </div>
                  {!parsearPdf.isPending && (
                    <button onClick={() => { setImportArquivo(null); setImportPreview(null); }} className="text-xs text-red-600 hover:underline">Trocar arquivo</button>
                  )}
                </div>
              )}

              {parsearPdf.isPending && (
                <div className="py-6 px-2 space-y-3">
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
                  <div className="text-[11px] text-slate-500 text-center">
                    {importDemorando
                      ? "📄 PDF extenso detectado — a IA ainda está processando. Aguarde mais alguns segundos…"
                      : "Tempo típico: 15–45s · não feche esta janela."}
                  </div>
                </div>
              )}

              {/* Rev. 2326 — banner de cruzamento automático */}
              {importPreview && importPreview.length > 0 && (() => {
                const total = importPreview.length;
                const auto = importPreview.filter((c: any) => c.obraMatchAuto).length;
                const manual = importPreview.filter((c: any) => c.obraId && !c.obraMatchAuto).length;
                const sem = total - auto - manual;
                return (
                  <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
                    <div className="font-semibold flex items-center gap-2">
                      🔗 Cruzamento automático com obras em andamento
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span><b className="text-emerald-700">{auto}</b> auto-vinculados pelo endereço/nome</span>
                      {manual > 0 && <span><b className="text-blue-700">{manual}</b> vinculados manualmente</span>}
                      {sem > 0 && <span className="text-amber-800"><b>{sem}</b> sem obra (escolha no select de cada contrato)</span>}
                    </div>
                  </div>
                );
              })()}
              {importPreview && importPreview.length > 0 && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm text-emerald-800">
                    ✅ IA detectou <b>{importPreview.length}</b> contrato(s) totalizando <b>{importPreview.reduce((a, c) => a + (c.itens?.length || 0), 0)}</b> item(ns).
                    Revise os dados abaixo (campos são editáveis) e confirme.
                  </div>

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
                            <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full">{linhas.length} obra(s)</span>
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
                                  <td className="px-3 py-2 text-center tabular-nums">{l.contratos}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{l.itens}</td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-indigo-700">R$ {fmt(l.total)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{pct.toFixed(1)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-indigo-300 bg-indigo-50 font-bold">
                              <td className="px-3 py-2 text-right text-slate-700">TOTAL</td>
                              <td className="px-3 py-2 text-center tabular-nums">{importPreview.length}</td>
                              <td className="px-3 py-2 text-center tabular-nums">{totalItens}</td>
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
                            <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full">{linhas.length} obra(s) · {totalUnid} unidade(s)</span>
                          </div>
                          {semObra && (
                            <span className="text-[11px] bg-amber-400/90 text-amber-950 font-semibold px-2 py-0.5 rounded-full">
                              ⚠ {semObra.unidades} unidade(s) sem obra
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
                                    <span className="text-slate-500">{g.contratos} contrato(s)</span>
                                    <span className="font-semibold text-emerald-700">{g.unidades} unid.</span>
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
                            <input type="number" step="0.01" value={c.valorTotal || ""} onChange={e => updateContratoField(ci, "valorTotal", parseFloat(e.target.value) || 0)} className="inp" />
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
                                <td className="px-2 py-1"><input type="number" step="0.01" value={it.subtotal || ""} onChange={e => updateItemField(ci, ii, "subtotal", parseFloat(e.target.value) || 0)} className="inp text-right" /></td>
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
                {importPreview ? `Total: ${importPreview.length} contrato(s) · ${importPreview.reduce((a, c) => a + (c.itens?.length || 0), 0)} unidade(s) a cadastrar` : "Cadastro inicial — fotos serão exigidas nos próximos recebimentos."}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalImport(false)} disabled={parsearPdf.isPending || !!importLoteProgresso} className="px-3 py-1.5 text-sm border rounded">Cancelar</button>
                <button onClick={confirmarImport} disabled={!importPreview || importPreview.length === 0 || !!importLoteProgresso}
                  className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 inline-flex items-center gap-1">
                  {importLoteProgresso ? `Cadastrando lote ${importLoteProgresso.lote}/${importLoteProgresso.totalLotes}…` : <><CheckCircle2 className="h-4 w-4" /> Confirmar e cadastrar</>}
                </button>
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
                  <p className="text-xs text-violet-50/90 mt-0.5">Classificação automática dos {totalSemCategoria} equipamento(s) sem categoria</p>
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
                    {resultadoCategIA.itensAtualizados} equipamento(s) classificados em {resultadoCategIA.categorias.length} categoria(s)
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
                  <div className="text-xs font-semibold text-amber-900 mb-1">⚠ {resultadoCategIA.descricoesNaoMapeadas.length} descrição(ões) não puderam ser classificadas:</div>
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
              <div className="text-[11px] text-slate-500">Analisadas: {resultadoCategIA.descricoesAnalisadas} descrição(ões) única(s).</div>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex justify-end">
              <button onClick={() => setResultadoCategIA(null)} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function Kpi({ icon: Icon, label, value, sub, tint, money }: { icon: LucideIcon; label: string; value: ReactNode; sub?: string; tint: "blue" | "amber" | "red" | "emerald"; money?: boolean }) {
  const palette: Record<string, { ring: string; iconBg: string; iconColor: string; value: string }> = {
    blue:    { ring: "ring-blue-100",    iconBg: "bg-blue-50",    iconColor: "text-blue-600",    value: "text-blue-900" },
    amber:   { ring: "ring-amber-100",   iconBg: "bg-amber-50",   iconColor: "text-amber-600",   value: "text-amber-900" },
    red:     { ring: "ring-red-100",     iconBg: "bg-red-50",     iconColor: "text-red-600",     value: "text-red-900" },
    emerald: { ring: "ring-emerald-100", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", value: "text-emerald-900" },
  };
  const p = palette[tint];
  // Rev. 2338 — tipografia fluida (clamp) p/ caber tanto em mobile quanto desktop
  // sem quebrar layout quando valor monetário cresce (ex: "R$ 15.815,50").
  const valueStyle = money
    ? { fontSize: "clamp(1rem, 2.6vw, 1.5rem)" }   // R$ ... — encolhe pra caber
    : { fontSize: "clamp(1.5rem, 3.2vw, 2rem)" };  // números puros — maior
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 ring-1 ${p.ring} hover:shadow-md transition min-w-0`}>
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
        {value}
      </div>
      <div className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{label}</div>
    </div>
  );
}
function Section({ icon: Icon, title, tint, children }: { icon: LucideIcon; title: string; tint: "emerald" | "blue" | "amber" | "slate" | "red"; children: ReactNode }) {
  const palette: Record<string, { bar: string; iconBg: string; iconColor: string; text: string }> = {
    emerald: { bar: "bg-emerald-500", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", text: "text-emerald-900" },
    blue:    { bar: "bg-blue-500",    iconBg: "bg-blue-50",    iconColor: "text-blue-600",    text: "text-blue-900" },
    amber:   { bar: "bg-amber-500",   iconBg: "bg-amber-50",   iconColor: "text-amber-600",   text: "text-amber-900" },
    slate:   { bar: "bg-slate-400",   iconBg: "bg-slate-100",  iconColor: "text-slate-600",   text: "text-slate-900" },
    red:     { bar: "bg-red-500",     iconBg: "bg-red-50",     iconColor: "text-red-600",     text: "text-red-900" },
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
