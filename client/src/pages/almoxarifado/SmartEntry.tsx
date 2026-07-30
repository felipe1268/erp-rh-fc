import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera, FileText, Package, X, Loader2, CheckCircle2,
  AlertTriangle, XCircle, ArrowDownCircle, ChevronRight,
  ImagePlus, Mic, MicOff, RefreshCw,
  Search, CalendarClock, Truck, ClipboardList, Clock, Building2,
} from "lucide-react";
import { inferirCategoria, CATEGORIA_KEYWORDS } from "./categoriaUtils";
import { formatNumeroOcDisplay } from "@shared/numeroOc";

// Rev. 4005 — matching NF↔cadastro por SIMILARIDADE (tokens + Dice de bigramas), não mais
// substring da 1ª palavra (que confundia itens com nome parecido, ex.: "Cimento CP-II" vs
// "Cimento CP-V", ou dava falso-negativo quando a NF descreve o item em ordem diferente).
// Mesmo padrão de scoring já usado em financial.ts p/ conciliação de fornecedor/cliente.
const _STOP_TOKENS_MAT = new Set<string>([
  "DE", "DA", "DO", "DAS", "DOS", "PARA", "COM", "SEM", "EM", "NO", "NA", "E",
  "UN", "UND", "UNIDADE", "PC", "PCS", "PECA", "PECAS", "KG", "UNID",
]);
const _normNomeMat = (v: any): string =>
  String(v || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const _toksMat = (v: any): string[] =>
  _normNomeMat(v).split(" ").filter((t) => t.length >= 3 && !_STOP_TOKENS_MAT.has(t));
const _bigramsMat = (s: string): Set<string> => {
  const g = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
  return g;
};
const _diceMat = (a: string, b: string): number => {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  const ga = _bigramsMat(a), gb = _bigramsMat(b);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
};
/** Encontra o melhor cadastro correspondente à descrição da NF, pontuando por peso de tokens
 * (exato, prefixo com ≥4 chars, ou Dice≥0.82). Exige ≥60% do peso do nome do cadastro batendo
 * e pelo menos 1 token forte (≥4 chars) — evita "match" por uma única palavra genérica curta. */
function matchItemCadastro<T extends { id: number; nome: string }>(
  descricaoNf: string,
  itens: T[]
): T | undefined {
  const nfToks = _toksMat(descricaoNf);
  if (nfToks.length === 0) return undefined;
  let melhor: { item: T; score: number } | undefined;
  for (const it of itens) {
    const candToks = _toksMat(it.nome);
    if (candToks.length === 0) continue;
    let matchedWeight = 0, totalWeight = 0, temForte = false;
    for (const ct of candToks) {
      totalWeight += ct.length;
      let ok = nfToks.includes(ct);
      if (!ok) {
        for (const nt of nfToks) {
          if (ct.length >= 4 && nt.length >= 4 && (nt.startsWith(ct) || ct.startsWith(nt) || _diceMat(ct, nt) >= 0.82)) {
            ok = true;
            break;
          }
        }
      }
      if (ok) {
        matchedWeight += ct.length;
        if (ct.length >= 4) temForte = true;
      }
    }
    const ratio = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    if (temForte && ratio >= 0.6 && (!melhor || ratio > melhor.score)) {
      melhor = { item: it, score: ratio };
    }
  }
  return melhor?.item;
}

type SmartEntryProps = {
  companyId: number;
  // Rev. 4756 — null = Escritório Central (só OCs sem obra); undefined = todas
  obraId?: number | null;
  obraNome?: string;
  itens: { id: number; nome: string; unidade: string; categoria?: string; quantidadeAtual?: number }[];
  onClose: () => void;
  onSuccess: () => void;
};

type NFItem = {
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
};

type NFData = {
  numeroNf: string | null;
  fornecedorNome: string | null;
  fornecedorCnpj: string | null;
  dataEmissao: string | null;
  valorTotalNf: number;
  itens: NFItem[];
};

type EntryItem = {
  itemId?: number;
  itemNome: string;
  unidade: string;
  categoria?: string;
  quantidadeNf: number;
  quantidadeRecebida: number;
  valorUnitario?: number;
  ocItemId?: number;
  quantidadeOc?: number;
  itemNovo: boolean;
  recebido: boolean;
  motivoDivergencia?: string;
  fotoAvariaUrl?: string;
  status: "ok" | "parcial" | "nao_recebido" | "avariado" | "nao_pedido";
};

type EntryMode = "choose" | "foto_nf" | "ordem_compra" | "manual";
type Step = "mode" | "capture" | "analyzing" | "review" | "confirm" | "success";

export default function SmartEntry({ companyId, obraId, obraNome, itens, onClose, onSuccess }: SmartEntryProps) {
  const [mode, setMode] = useState<EntryMode>("choose");
  const [step, setStep] = useState<Step>("mode");
  const [nfData, setNfData] = useState<NFData | null>(null);
  const [entryItems, setEntryItems] = useState<EntryItem[]>([]);
  const [selectedOcId, setSelectedOcId] = useState<number | null>(null);
  const [selectedOcNumero, setSelectedOcNumero] = useState("");
  const [fornecedorNome, setFornecedorNome] = useState("");
  const [numeroNf, setNumeroNf] = useState("");
  const [fotoNfBase64, setFotoNfBase64] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const [manualItemId, setManualItemId] = useState(0);
  const [manualQtd, setManualQtd] = useState("");
  const [manualMotivo, setManualMotivo] = useState("");
  // Rev. 2081 — Busca para a lista de OCs pendentes (regras de ouro)
  const [ocSearch, setOcSearch] = useState("");
  // Rev. 2085 — filtro de status acionado por clique nos KPI cards superiores.
  const [ocFilter, setOcFilter] = useState<"all" | "pendentes" | "parciais" | "atrasadas">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const analyzeNF = trpc.warehouse.analyzeNFPhoto.useMutation();
  const matchNFtoOC = trpc.warehouse.matchNFtoOC.useMutation();
  const registerSmartEntry = trpc.warehouse.registerSmartEntry.useMutation();
  const pendingOCs = trpc.warehouse.listPendingOCs.useQuery(
    { companyId, obraId },
    { enabled: mode === "ordem_compra", staleTime: 0 }
  );
  const ocItems = trpc.warehouse.getOCItemsForReceiving.useQuery(
    { companyId, ordemCompraId: selectedOcId! },
    { enabled: !!selectedOcId, staleTime: 0 }
  );

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStep("analyzing");
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type || "image/jpeg";
      setFotoNfBase64(base64);

      try {
        const result = await analyzeNF.mutateAsync({ companyId, base64, mimeType });

        if (!result.success || !result.dados) {
          toast.error(result.erro || "Não foi possível ler a nota. Tente outra foto.");
          setStep("capture");
          setIsProcessing(false);
          return;
        }

        const dados = result.dados;
        setNfData(dados);
        setNumeroNf(dados.numeroNf || "");
        setFornecedorNome(dados.fornecedorNome || "");

        const items: EntryItem[] = dados.itens.map((nfItem: NFItem) => {
          const existing = matchItemCadastro(nfItem.descricao, itens);

          const catAuto = !existing?.categoria ? inferirCategoria(nfItem.descricao, Object.keys(CATEGORIA_KEYWORDS)) : "";

          return {
            itemId: existing?.id,
            itemNome: nfItem.descricao,
            unidade: nfItem.unidade,
            categoria: existing?.categoria || catAuto || undefined,
            quantidadeNf: nfItem.quantidade,
            quantidadeRecebida: nfItem.quantidade,
            valorUnitario: nfItem.valorUnitario,
            itemNovo: !existing,
            recebido: true,
            status: "ok" as const,
          };
        });

        setEntryItems(items);

        if (dados.fornecedorNome) {
          try {
            const matchResult = await matchNFtoOC.mutateAsync({
              companyId,
              obraId,
              fornecedorNome: dados.fornecedorNome,
              itensNf: dados.itens.map(i => ({
                descricao: i.descricao,
                quantidade: i.quantidade,
                unidade: i.unidade,
              })),
            });

            if (matchResult.match) {
              setSelectedOcId(matchResult.match.ocId);
              setSelectedOcNumero(matchResult.match.numeroOc);

              const updatedItems = items.map(item => {
                const matched = matchResult.match!.matchedItems.find(
                  (m: any) => m.nfDescricao === item.itemNome
                );
                if (matched) {
                  const pendente = matched.quantidadeOc - matched.quantidadeEntregue;
                  return {
                    ...item,
                    ocItemId: matched.ocItemId,
                    quantidadeOc: pendente,
                    status: item.quantidadeNf <= pendente ? "ok" as const : "parcial" as const,
                  };
                }
                return { ...item, status: "nao_pedido" as const };
              });
              setEntryItems(updatedItems);
            }
          } catch {}
        }

        setStep("review");
      } catch (err: any) {
        toast.error("Erro ao analisar foto: " + (err?.message || "Tente novamente"));
        setStep("capture");
      }
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  }, [companyId, obraId, itens, analyzeNF, matchNFtoOC]);

  const handleOCSelect = useCallback((ocId: number) => {
    setSelectedOcId(ocId);
    const oc = pendingOCs.data?.find(o => o.id === ocId);
    if (oc) {
      setSelectedOcNumero(oc.numeroOc);
      setFornecedorNome(oc.fornecedorNome || "");
    }
  }, [pendingOCs.data]);

  const handleOCItemsLoaded = useCallback(() => {
    if (!ocItems.data) return;
    const pending = ocItems.data.itens.filter(i => i.quantidadePendente > 0);
    if (pending.length === 0) {
      toast.error("Todos os itens desta OC já foram entregues. Nada a receber.");
      return;
    }
    const items: EntryItem[] = pending.map(i => {
        const existing = matchItemCadastro(i.descricao, itens);
        return {
          itemNome: i.descricao,
          unidade: i.unidade || "un",
          categoria: existing?.categoria || inferirCategoria(i.descricao, Object.keys(CATEGORIA_KEYWORDS)) || undefined,
          quantidadeNf: i.quantidadePendente,
          quantidadeRecebida: i.quantidadePendente,
          valorUnitario: i.precoUnitario,
          ocItemId: i.id,
          quantidadeOc: i.quantidadePendente,
          itemNovo: !existing,
          recebido: true,
          status: "ok" as const,
          itemId: existing?.id,
        };
      });
    setEntryItems(items);
    setStep("review");
  }, [ocItems.data, itens]);

  const toggleItemReceived = (idx: number) => {
    setEntryItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newRecebido = !item.recebido;
      return {
        ...item,
        recebido: newRecebido,
        quantidadeRecebida: newRecebido ? item.quantidadeNf : 0,
        status: newRecebido ? "ok" : "nao_recebido",
      };
    }));
  };

  const updateItemQty = (idx: number, qty: number) => {
    setEntryItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const maxQty = item.quantidadeOc && item.quantidadeOc > 0 ? item.quantidadeOc : item.quantidadeNf;
      const cappedQty = maxQty > 0 ? Math.min(qty, maxQty) : qty;
      const isPartial = cappedQty < item.quantidadeNf && cappedQty > 0;
      return {
        ...item,
        quantidadeRecebida: cappedQty,
        recebido: cappedQty > 0,
        status: cappedQty === 0 ? "nao_recebido" : isPartial ? "parcial" : "ok",
      };
    }));
  };

  const handleConfirmEntry = async () => {
    if (entryItems.length === 0) return;
    setIsProcessing(true);

    try {
      const result = await registerSmartEntry.mutateAsync({
        companyId,
        obraId,
        obraNome,
        ordemCompraId: selectedOcId || undefined,
        numeroOc: selectedOcNumero || undefined,
        numeroNf: numeroNf || undefined,
        fornecedorNome: fornecedorNome || undefined,
        metodoEntrada: mode === "choose" ? "manual" : mode,
        itens: entryItems.map(item => ({
          itemId: item.itemId,
          itemNome: item.itemNome,
          unidade: item.unidade,
          categoria: item.categoria,
          quantidadeNf: item.quantidadeNf,
          quantidadeRecebida: item.quantidadeRecebida,
          valorUnitario: item.valorUnitario,
          ocItemId: item.ocItemId,
          quantidadeOc: item.quantidadeOc,
          itemNovo: item.itemNovo,
          recebido: item.recebido,
          motivoDivergencia: item.motivoDivergencia,
          fotoAvariaUrl: item.fotoAvariaUrl,
        })),
      });

      setResultData(result);
      setStep("success");
      toast.success("Recebimento registrado!");
      queryClient.invalidateQueries({ queryKey: [["warehouse", "listPendingOCs"]] });
      queryClient.invalidateQueries({ queryKey: [["warehouse", "getOCItemsForReceiving"]] });
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "Tente novamente"));
    }
    setIsProcessing(false);
  };

  const handleManualEntry = async () => {
    if (!manualItemId || !manualQtd) return;
    const selectedItem = itens.find(i => i.id === manualItemId);
    if (!selectedItem) return;

    setEntryItems([{
      itemId: selectedItem.id,
      itemNome: selectedItem.nome,
      unidade: selectedItem.unidade,
      quantidadeNf: parseFloat(manualQtd),
      quantidadeRecebida: parseFloat(manualQtd),
      itemNovo: false,
      recebido: true,
      status: "ok",
    }]);
    setMode("manual");
    setStep("review");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok": return "bg-emerald-100 border-emerald-400 text-emerald-800";
      case "parcial": return "bg-amber-100 border-amber-400 text-amber-800";
      case "nao_recebido": return "bg-red-100 border-red-400 text-red-800";
      case "avariado": return "bg-orange-100 border-orange-400 text-orange-800";
      case "nao_pedido": return "bg-purple-100 border-purple-400 text-purple-800";
      default: return "bg-gray-100 border-gray-300 text-gray-700";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ok": return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
      case "parcial": return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case "nao_recebido": return <XCircle className="w-6 h-6 text-red-500" />;
      case "avariado": return <AlertTriangle className="w-6 h-6 text-orange-500" />;
      case "nao_pedido": return <Package className="w-6 h-6 text-purple-500" />;
      default: return <Package className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "ok": return "OK";
      case "parcial": return "PARCIAL";
      case "nao_recebido": return "NÃO CHEGOU";
      case "avariado": return "AVARIADO";
      case "nao_pedido": return "NÃO PEDIDO";
      default: return status;
    }
  };

  // Rev. 2081 — KPIs e filtragem de OCs (regras de ouro: header gradient + KPI cards)
  // IMPORTANTE: usa data LOCAL do navegador (não UTC). Em fuso BR (UTC-3),
  // toISOString() à noite vira o dia em UTC antes da meia-noite local e
  // marcaria OCs como "atrasadas" prematuramente. Por isso montamos
  // YYYY-MM-DD a partir de getFullYear/Month/Date (todos LOCAIS).
  function toLocalIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  const todayIso = toLocalIsoDate(new Date());
  const ocStats = useMemo(() => {
    const all = pendingOCs.data || [];
    let pendentes = 0, parciais = 0, atrasadas = 0;
    for (const o of all) {
      if ((o as any).status === "parcial") parciais++;
      else pendentes++;
      const dp = (o as any).dataEntregaPrevista;
      if (dp && String(dp).slice(0, 10) < todayIso) atrasadas++;
    }
    return { total: all.length, pendentes, parciais, atrasadas };
  }, [pendingOCs.data, todayIso]);
  const filteredOCs = useMemo(() => {
    const q = ocSearch.trim().toLowerCase();
    const all = pendingOCs.data || [];
    return all.filter((o: any) => {
      // filtro por status do KPI (Rev. 2085)
      if (ocFilter === "pendentes" && (o as any).status === "parcial") return false;
      if (ocFilter === "parciais" && (o as any).status !== "parcial") return false;
      if (ocFilter === "atrasadas") {
        const dp = (o as any).dataEntregaPrevista;
        if (!dp || String(dp).slice(0, 10) >= todayIso) return false;
      }
      // filtro por busca textual
      if (q && !(
        String(o.numeroOc || "").toLowerCase().includes(q) ||
        String(o.fornecedorNome || "").toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [pendingOCs.data, ocSearch, ocFilter, todayIso]);
  function diasAteEntrega(dataIso?: string | null): { dias: number; label: string; cor: string } | null {
    if (!dataIso) return null;
    const d = String(dataIso).slice(0, 10);
    const [y, m, dd] = d.split("-").map(Number);
    if (!y || !m || !dd) return null;
    // Comparação em data LOCAL — `dataEntregaPrevista` é date "civil"
    // (YYYY-MM-DD sem hora), então não há fuso pra aplicar.
    const alvo = new Date(y, m - 1, dd);
    const agora = new Date();
    const hojeLocal = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const diff = Math.round((alvo.getTime() - hojeLocal.getTime()) / 86400000);
    const dataBR = `${String(dd).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    if (diff < 0) return { dias: diff, label: `Atrasada há ${-diff} dia${-diff !== 1 ? "s" : ""} (${dataBR})`, cor: "text-red-600 bg-red-50 ring-red-200" };
    if (diff === 0) return { dias: 0, label: `Entrega HOJE (${dataBR})`, cor: "text-amber-700 bg-amber-50 ring-amber-200" };
    if (diff <= 3) return { dias: diff, label: `Em ${diff} dia${diff !== 1 ? "s" : ""} (${dataBR})`, cor: "text-amber-700 bg-amber-50 ring-amber-200" };
    return { dias: diff, label: `Em ${diff} dias (${dataBR})`, cor: "text-slate-600 bg-slate-50 ring-slate-200" };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col" style={{ background: "#ffffff", color: "#111827" }}>

        {/* Rev. 2081 — Header gradient emerald (regras de ouro) */}
        <div className="shrink-0 px-4 py-3.5 border-b bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_60%)] pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white/15 backdrop-blur-sm ring-4 ring-white/20 shrink-0">
                <ArrowDownCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold leading-tight truncate">
                  {step === "success" ? "Recebimento Concluído" : "Receber Material"}
                </h2>
                <p className="text-[11px] text-white/85 truncate">
                  {step === "mode" && "Escolha o método de entrada"}
                  {step === "capture" && mode === "ordem_compra" && "Confirme o material recebido por OC"}
                  {step === "capture" && mode === "foto_nf" && "Foto da NF — IA preenche tudo"}
                  {step === "capture" && mode === "manual" && "Entrada manual de item"}
                  {step === "analyzing" && "Analisando documento..."}
                  {(step === "review" || step === "confirm") && (obraNome || "Conferindo itens")}
                  {step === "success" && "Entrada registrada com sucesso"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="h-9 w-9 rounded-lg hover:bg-white/15 flex items-center justify-center transition shrink-0" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4">

          {step === "mode" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 text-center mb-4">Como deseja registrar a entrada?</p>

              <button
                onClick={() => { setMode("foto_nf"); setStep("capture"); }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition text-left"
              >
                <div className="w-14 h-14 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                  <Camera className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-emerald-800 text-base">Foto da Nota Fiscal</p>
                  <p className="text-sm text-emerald-600">Tire uma foto da NF e a IA preenche tudo</p>
                </div>
                <ChevronRight className="w-5 h-5 text-emerald-400" />
              </button>

              <button
                onClick={() => { setMode("ordem_compra"); setStep("capture"); }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition text-left"
              >
                <div className="w-14 h-14 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-blue-800 text-base">Via Ordem de Compra</p>
                  <p className="text-sm text-blue-600">Selecione a OC e confirme o que chegou</p>
                </div>
                <ChevronRight className="w-5 h-5 text-blue-400" />
              </button>

              <button
                onClick={() => { setMode("manual"); setStep("capture"); }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition text-left"
              >
                <div className="w-14 h-14 rounded-xl bg-gray-500 flex items-center justify-center shrink-0">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-800 text-base">Manual</p>
                  <p className="text-sm text-gray-600">Selecione item e digite quantidade</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          )}

          {step === "capture" && mode === "foto_nf" && (
            <div className="space-y-4 text-center">
              <div className="w-24 h-24 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Camera className="w-12 h-12 text-emerald-500" />
              </div>
              <p className="text-lg font-bold">Tire uma foto da Nota Fiscal</p>
              <p className="text-sm text-gray-500">Posicione a nota de forma que todos os itens fiquem legíveis</p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-5 rounded-2xl text-lg transition flex items-center justify-center gap-3"
              >
                <Camera className="w-6 h-6" />
                TIRAR FOTO
              </button>

              <button
                onClick={() => {
                  const inp = document.createElement("input");
                  inp.type = "file";
                  inp.accept = "image/*";
                  inp.onchange = (ev: any) => handlePhotoCapture(ev);
                  inp.click();
                }}
                className="w-full border-2 border-gray-300 text-gray-700 font-semibold py-4 rounded-2xl text-base transition"
              >
                Selecionar da Galeria
              </button>

              <button onClick={() => setStep("mode")} className="text-sm text-gray-400 underline">Voltar</button>
            </div>
          )}

          {step === "analyzing" && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mx-auto" />
              <p className="text-lg font-bold text-gray-800">Analisando a Nota Fiscal...</p>
              <p className="text-sm text-gray-500">A IA está lendo os itens da nota</p>
            </div>
          )}

          {step === "capture" && mode === "ordem_compra" && (
            <div className="space-y-3">
              {/* Rev. 2081/2085 — KPIs clicáveis (filtram a lista) */}
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { key: "all" as const,        label: "Total",     value: ocStats.total,     Icon: ClipboardList, tone: "bg-slate-50 text-slate-700 ring-slate-200",  activeTone: "bg-slate-700 text-white ring-slate-700" },
                  { key: "pendentes" as const,  label: "Pendentes", value: ocStats.pendentes, Icon: Truck,         tone: "bg-blue-50 text-blue-700 ring-blue-200",     activeTone: "bg-blue-600 text-white ring-blue-600" },
                  { key: "parciais" as const,   label: "Parciais",  value: ocStats.parciais,  Icon: AlertTriangle, tone: "bg-amber-50 text-amber-700 ring-amber-200",  activeTone: "bg-amber-500 text-white ring-amber-500" },
                  { key: "atrasadas" as const,  label: "Atrasadas", value: ocStats.atrasadas, Icon: Clock,         tone: `${ocStats.atrasadas > 0 ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`, activeTone: "bg-red-600 text-white ring-red-600" },
                ]).map((k) => {
                  const KI = k.Icon;
                  const isActive = ocFilter === k.key;
                  return (
                    <button
                      type="button"
                      key={k.label}
                      onClick={() => setOcFilter(isActive && k.key !== "all" ? "all" : k.key)}
                      className={`rounded-xl ring-1 px-2 py-2 flex flex-col items-center gap-0.5 shadow-sm transition active:scale-95 hover:brightness-105 ${isActive ? k.activeTone : k.tone}`}
                      title={isActive && k.key !== "all" ? "Clique para limpar filtro" : `Filtrar: ${k.label}`}
                    >
                      <KI className="h-4 w-4 opacity-80" />
                      <div className="text-lg font-bold leading-none">{k.value}</div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{k.label}</div>
                    </button>
                  );
                })}
              </div>

              {/* Busca */}
              {(pendingOCs.data?.length || 0) > 3 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    inputMode="search"
                    placeholder="Buscar por número ou fornecedor..."
                    value={ocSearch}
                    onChange={e => setOcSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                  />
                </div>
              )}

              {pendingOCs.isLoading ? (
                <div className="py-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500" /></div>
              ) : !pendingOCs.data?.length ? (
                <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold text-slate-500">Nenhuma OC pendente</p>
                  <p className="text-xs">Todas as ordens já foram recebidas{obraNome ? ` em ${obraNome}` : ""}.</p>
                </div>
              ) : filteredOCs.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <Search className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma OC corresponde a "{ocSearch}"</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[55vh] overflow-y-auto -mx-1 px-1">
                  {filteredOCs.map((oc: any) => {
                    const isSelected = selectedOcId === oc.id;
                    const entrega = diasAteEntrega(oc.dataEntregaPrevista);
                    const pct = oc.totalItens > 0 ? Math.round((oc.itensEntregues / oc.totalItens) * 100) : 0;
                    return (
                      <button
                        key={oc.id}
                        onClick={() => { handleOCSelect(oc.id); }}
                        className={`w-full text-left p-3.5 rounded-2xl border-2 transition shadow-sm ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-200"
                            : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-slate-900 text-base leading-tight">{formatNumeroOcDisplay(oc.numeroOc)}</p>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-600 min-w-0">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{oc.fornecedorNome || "Fornecedor não informado"}</span>
                            </div>
                            {/* Rev. 4754 — destino + origem da compra (quem pediu, quando, pra onde vai) */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${oc.obraId != null ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                                📍 {oc.obraId != null ? (oc.obraNome || `Obra #${oc.obraId}`) : "Escritório Central"}
                              </span>
                              {oc.numeroSc && (
                                <span className="text-[10px] font-medium text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2 py-0.5">
                                  {oc.numeroSc} · {oc.scSolicitante || "—"}{oc.scCriadoEm ? ` · ${String(oc.scCriadoEm).slice(8, 10)}/${String(oc.scCriadoEm).slice(5, 7)}` : ""}
                                </span>
                              )}
                              {!oc.numeroSc && oc.criadoPorNome && (
                                <span className="text-[10px] font-medium text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2 py-0.5">
                                  OC direta · {oc.criadoPorNome}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wide whitespace-nowrap ${
                            oc.status === "parcial"
                              ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                              : oc.status === "aprovada"
                              ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                              : "bg-blue-100 text-blue-800 ring-1 ring-blue-200"
                          }`}>
                            {oc.status === "parcial" ? "Parcial" : oc.status}
                          </span>
                        </div>

                        {oc.status === "parcial" && oc.totalItens > 0 && (
                          <div className="mt-2.5">
                            <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                              <span className="text-amber-800 font-semibold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {oc.itensEntregues} de {oc.totalItens} entregues
                              </span>
                              <span className="text-amber-700 font-bold">{pct}%</span>
                            </div>
                            <div className="w-full bg-amber-100 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )}

                        {entrega && (
                          <div className={`mt-2.5 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md ring-1 font-semibold ${entrega.cor}`}>
                            <CalendarClock className="w-3 h-3" />
                            {entrega.label}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedOcId && (
                <button
                  onClick={handleOCItemsLoaded}
                  disabled={ocItems.isLoading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold py-4 rounded-2xl text-base transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
                >
                  {ocItems.isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Carregando itens...</> : <><Package className="w-5 h-5" /> VER ITENS DA OC</>}
                </button>
              )}
              <button onClick={() => { setStep("mode"); setSelectedOcId(null); setOcSearch(""); }} className="text-sm text-slate-500 underline block mx-auto py-1">Voltar</button>
            </div>
          )}

          {step === "capture" && mode === "manual" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">Selecionar Item *</label>
                <select
                  className="w-full border-2 rounded-xl p-3 text-base"
                  value={manualItemId}
                  onChange={e => setManualItemId(Number(e.target.value))}
                >
                  <option value={0}>— escolha o item —</option>
                  {itens.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">Quantidade *</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="w-full border-2 rounded-xl p-4 text-2xl font-bold text-center"
                  placeholder="0"
                  value={manualQtd}
                  onChange={e => setManualQtd(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1">Nota Fiscal / Motivo</label>
                <input
                  type="text"
                  className="w-full border rounded-xl p-3 text-base"
                  placeholder="Ex: NF 12345"
                  value={manualMotivo}
                  onChange={e => setManualMotivo(e.target.value)}
                />
              </div>
              <button
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl text-lg disabled:opacity-50 transition"
                disabled={!manualItemId || !manualQtd}
                onClick={handleManualEntry}
              >
                AVANÇAR
              </button>
              <button onClick={() => setStep("mode")} className="text-sm text-gray-400 underline block mx-auto">Voltar</button>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              {/* Lista de peças para conferência — OC de locação (Rev. 4424) */}
              {(ocItems.data?.listaRecebimento?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-700 shrink-0" />
                    <p className="text-sm font-bold text-amber-800">
                      Lista de Peças — {ocItems.data!.listaRecebimento!.length} peça{ocItems.data!.listaRecebimento!.length !== 1 ? "s" : ""} para conferir
                    </p>
                  </div>
                  <p className="text-xs text-amber-700">Confira cada peça abaixo antes de confirmar o recebimento:</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto -mx-1 px-1">
                    {ocItems.data!.listaRecebimento!.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 bg-white rounded border border-amber-200 px-2 py-1.5">
                        <span className="text-[10px] text-amber-500 font-mono font-bold w-5 shrink-0 text-center">{idx + 1}</span>
                        <span className="flex-1 text-xs text-gray-800">{item.descricao}</span>
                        <span className="text-xs text-gray-500 shrink-0 tabular-nums font-medium">
                          {item.quantidade % 1 === 0 ? item.quantidade : Number(item.quantidade).toFixed(2)} {item.unidade}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {nfData && (
                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-700">NF: {numeroNf || "—"}</span>
                    <span className="text-gray-500">{nfData.dataEmissao || ""}</span>
                  </div>
                  <p className="text-sm text-gray-600">{fornecedorNome || "Fornecedor não identificado"}</p>
                  {selectedOcNumero && (
                    <p className="text-xs text-blue-600 font-semibold mt-1">OC vinculada: {selectedOcNumero}</p>
                  )}
                </div>
              )}

              {selectedOcNumero && !nfData && (
                <div className="bg-blue-50 rounded-xl p-3 mb-3">
                  <p className="font-semibold text-blue-800">OC: {selectedOcNumero}</p>
                  <p className="text-sm text-blue-600">{fornecedorNome}</p>
                </div>
              )}

              <p className="text-sm font-semibold text-gray-600">
                {entryItems.length} {entryItems.length === 1 ? "item" : "itens"} — toque para conferir
              </p>

              {entryItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border-2 p-3 transition ${getStatusColor(item.status)}`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleItemReceived(idx)}
                      className="mt-1 shrink-0"
                    >
                      {getStatusIcon(item.status)}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{item.itemNome}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          inputMode="decimal"
                          className="w-20 border rounded-lg px-2 py-1 text-center text-lg font-bold bg-white"
                          value={item.quantidadeRecebida}
                          onChange={e => updateItemQty(idx, Number(e.target.value) || 0)}
                        />
                        <span className="text-sm text-gray-600">
                          {item.unidade}
                          {item.quantidadeNf > 0 && item.quantidadeRecebida !== item.quantidadeNf && (
                            <span className="text-amber-600 font-semibold"> (NF: {item.quantidadeNf})</span>
                          )}
                          {item.quantidadeOc !== undefined && item.quantidadeOc > 0 && (
                            <span className="text-blue-600 font-semibold"> (pendente: {item.quantidadeOc})</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${getStatusColor(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                        {item.itemNovo && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-bold">NOVO</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div className="space-y-2 pt-2">
                <button
                  onClick={handleConfirmEntry}
                  disabled={isProcessing || entryItems.every(i => !i.recebido)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-5 rounded-2xl text-lg disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-6 h-6" />
                      CONFIRMAR RECEBIMENTO
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setStep(mode === "manual" ? "capture" : "mode"); setEntryItems([]); }}
                  className="w-full text-gray-400 text-sm underline"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}

          {step === "success" && resultData && (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto" />
              <p className="text-xl font-bold text-emerald-700">Material Recebido!</p>

              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Itens recebidos</span>
                  <span className="font-bold">{resultData.totalRecebido} de {resultData.totalItens}</span>
                </div>
                {resultData.itensNovosCriados > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Itens novos cadastrados</span>
                    <span className="font-bold text-violet-600">{resultData.itensNovosCriados}</span>
                  </div>
                )}
                {resultData.temDivergencia && (
                  <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs font-bold text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Divergências detectadas — Compras e Financeiro notificados
                    </p>
                    {resultData.divergencias?.map((d: string, i: number) => (
                      <p key={i} className="text-xs text-amber-600 mt-1">• {d}</p>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl text-lg"
                onClick={() => { onSuccess(); onClose(); }}
              >
                FECHAR
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
