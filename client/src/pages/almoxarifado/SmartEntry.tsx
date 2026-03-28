import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera, FileText, Package, X, Loader2, CheckCircle2,
  AlertTriangle, XCircle, ArrowDownCircle, ChevronRight,
  ImagePlus, Mic, MicOff, RefreshCw,
} from "lucide-react";
import { inferirCategoria, CATEGORIA_KEYWORDS } from "./categoriaUtils";

type SmartEntryProps = {
  companyId: number;
  obraId?: number;
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
          const existing = itens.find(i =>
            i.nome.toLowerCase().includes(nfItem.descricao.toLowerCase().split(" ")[0]) ||
            nfItem.descricao.toLowerCase().includes(i.nome.toLowerCase().split(" ")[0])
          );

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
        const existing = itens.find(it =>
          it.nome.toLowerCase().includes(i.descricao.toLowerCase().split(" ")[0]) ||
          i.descricao.toLowerCase().includes(it.nome.toLowerCase().split(" ")[0])
        );
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col" style={{ background: "#ffffff", color: "#111827" }}>

        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ArrowDownCircle className="w-5 h-5 text-emerald-500" />
            {step === "success" ? "Recebimento Concluído" : "Receber Material"}
          </h2>
          <button onClick={onClose}><X className="w-6 h-6 text-gray-400" /></button>
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
              <p className="text-sm text-gray-500 text-center mb-2">Selecione a Ordem de Compra</p>
              {pendingOCs.isLoading ? (
                <div className="py-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" /></div>
              ) : !pendingOCs.data?.length ? (
                <div className="py-8 text-center text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma OC pendente</p>
                </div>
              ) : (
                pendingOCs.data.map(oc => (
                  <button
                    key={oc.id}
                    onClick={() => { handleOCSelect(oc.id); }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition ${
                      selectedOcId === oc.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-gray-900">{oc.numeroOc}</p>
                        <p className="text-sm text-gray-600">{oc.fornecedorNome}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        oc.status === "parcial" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {oc.status === "parcial" ? "PARCIAL" : oc.status}
                      </span>
                    </div>
                    {oc.status === "parcial" && oc.totalItens > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 text-xs text-amber-700">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{oc.itensEntregues} de {oc.totalItens} itens entregues — faltam {oc.itensPendentes}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-amber-500 h-1.5 rounded-full"
                            style={{ width: `${Math.round((oc.itensEntregues / oc.totalItens) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {oc.dataEntregaPrevista && (
                      <p className="text-xs text-gray-400 mt-1">Entrega prevista: {oc.dataEntregaPrevista}</p>
                    )}
                  </button>
                ))
              )}
              {selectedOcId && (
                <button
                  onClick={handleOCItemsLoaded}
                  disabled={ocItems.isLoading}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 rounded-2xl text-lg transition flex items-center justify-center gap-2"
                >
                  {ocItems.isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "VER ITENS DA OC"}
                </button>
              )}
              <button onClick={() => { setStep("mode"); setSelectedOcId(null); }} className="text-sm text-gray-400 underline block mx-auto">Voltar</button>
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
