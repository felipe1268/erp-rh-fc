import React, { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import BdiView from "./BdiView";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronDown, ChevronRight, DollarSign, TrendingDown, TrendingUp, Target,
  ArrowLeft, Loader2, Package, CheckCircle2, AlertCircle, Save,
  UploadCloud, RefreshCw, FileSpreadsheet, X, Printer, BookOpen, Wrench, Percent, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(v: string | null | undefined) {
  return parseFloat(v || "0");
}
/** Arredonda para 2 casas decimais (evita drift de ponto flutuante) */
function r2(v: number) {
  return Math.round(v * 100) / 100;
}

interface OrcItem {
  id: number;
  eapCodigo: string;
  nivel: number;
  tipo: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  custoUnitMat: string;
  custoUnitMdo: string;
  custoUnitTotal: string;
  vendaUnitTotal: string;
  custoTotalMat: string;
  custoTotalMdo: string;
  custoTotal: string;
  vendaTotal: string;
  metaTotal: string;
  abcServico: string;
  ordem: number;
}

type Versao = "custo" | "venda" | "meta";

const VERSAO_CONFIG: Record<Versao, {
  label: string; icon: typeof DollarSign;
  activeClass: string; valueClass: string; thClass: string;
}> = {
  custo: { label: "Custo", icon: TrendingDown, activeClass: "border-amber-500 bg-amber-50",   valueClass: "text-amber-700",  thClass: "bg-amber-800"  },
  venda: { label: "Venda", icon: DollarSign,   activeClass: "border-green-500 bg-green-50",   valueClass: "text-green-700",  thClass: "bg-green-800"  },
  meta:  { label: "Meta",  icon: Target,       activeClass: "border-purple-500 bg-purple-50", valueClass: "text-purple-700", thClass: "bg-purple-800" },
};

const NIVEL_BG: Record<number, string> = {
  1: "bg-slate-100 font-bold",
  2: "bg-slate-50  font-semibold",
  3: "bg-white     font-medium",
  4: "bg-white",
};

export default function OrcamentoDetalhe() {
  const [, params] = useRoute("/orcamento/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { company } = useCompany();
  const id = parseInt(params?.id ?? "0");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activePage, setActivePage] = useState<"orcamento" | "bdi">("orcamento");
  const [activeTab, setActiveTab]   = useState<string>("eap");
  const [versao, setVersao]         = useState<Versao>("custo");
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const [localMetaPerc, setLocalMetaPerc] = useState(20);
  const [metaInput, setMetaInput]   = useState("20");
  const [metaValInput, setMetaValInput] = useState(""); // input R$ — vazio = usa valor calculado
  const [savingMeta, setSavingMeta] = useState(false);
  const [localMetaVal, setLocalMetaVal] = useState<number | null>(null); // R$ exato digitado
  const [editingMeta, setEditingMeta] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedComps, setExpandedComps] = useState<Set<string>>(new Set());
  const [editingNegociado, setEditingNegociado] = useState(false);
  const [negociadoInput, setNegociadoInput]     = useState("");

  const { data, isLoading, refetch } = trpc.orcamento.getById.useQuery(
    { id },
    { enabled: id > 0 }
  );

  const updateMetaMutation = trpc.orcamento.updateMeta.useMutation({
    onSuccess: () => {
      toast.success("Meta atualizada!");
      setSavingMeta(false);
      setEditingMeta(false);
      refetch();
    },
    onError: e => { toast.error(e.message || "Erro ao salvar meta"); setSavingMeta(false); },
  });

  const setValorNegociadoMut = trpc.orcamento.setValorNegociado.useMutation({
    onSuccess: () => { toast.success("Valor negociado salvo!"); refetch(); setEditingNegociado(false); },
    onError: e => toast.error(e.message || "Erro ao salvar"),
  });

  // Re-upload (atualizar planilha)
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadAnalise, setReuploadAnalise] = useState<{ itens: number; arquivo: string } | null>(null);
  const [reuploadLoading, setReuploadLoading] = useState(false);

  const reimportarMutation = trpc.orcamento.reimportar.useMutation({
    onSuccess: (res) => {
      const compMsg = res.composicoesCount ? ` ${res.composicoesCount} composições (CPUs) carregadas.` : '';
      toast.success(`Orçamento atualizado! ${res.itemCount} itens reimportados.${compMsg}`);
      setReuploadOpen(false);
      setReuploadFile(null);
      setReuploadAnalise(null);
      refetch();
    },
    onError: e => {
      toast.error(e.message || "Erro ao atualizar orçamento");
      setReuploadLoading(false);
    },
  });

  const handleReuploadFile = async (file: File) => {
    setReuploadFile(file);
    setReuploadAnalise(null);
    setReuploadLoading(true);
    try {
      const xlsxMod = await import("xlsx");
      const XLSX = xlsxMod.default ?? xlsxMod;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const orcTab = wb.SheetNames.find((n: string) =>
        n.toLowerCase().replace(/[^a-z]/g, "").startsWith("or") ||
        n.toLowerCase().includes("orcamento") ||
        n.toLowerCase().includes("orçamento")
      );
      if (!orcTab) {
        toast.error('Aba "Orçamento" não encontrada na planilha.');
        setReuploadLoading(false);
        return;
      }
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[orcTab], { header: 1, defval: "" }) as any[][];
      const itensCount = rows.filter((r: any[]) => {
        const col = String(r[9] || r[10] || "").trim();
        return col.match(/^\d+\.\d+/) || col.match(/^\d+$/);
      }).length;
      setReuploadAnalise({ itens: itensCount, arquivo: file.name });
    } catch {
      toast.error("Erro ao ler planilha.");
    }
    setReuploadLoading(false);
  };

  const confirmarReupload = async () => {
    if (!reuploadFile) return;
    setReuploadLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = (e.target?.result as string).split(",")[1];
      reimportarMutation.mutate({
        orcamentoId: id,
        companyId:   Number(orc?.companyId ?? 0),
        fileBase64:  b64,
        fileName:    reuploadFile.name,
        userName:    (user as any)?.username || (user as any)?.name || "sistema",
      });
    };
    reader.readAsDataURL(reuploadFile);
  };

  // ── Biblioteca: enviar composições/insumos do orçamento ao catálogo central ──
  const [bibOpen, setBibOpen]       = useState(false);
  const [bibLoaded, setBibLoaded]   = useState(false);   // dispara query só ao abrir

  const bibCompanyId = Number((user as any)?.companyId ?? 0);

  const previewQuery = trpc.orcamento.previewBiblioteca.useQuery(
    { orcamentoId: id, companyId: bibCompanyId },
    { enabled: bibLoaded && id > 0 && bibCompanyId > 0, staleTime: 0 }
  );

  const composicoesQuery = trpc.orcamento.getComposicoesCatalogo.useQuery(
    { orcamentoId: id, companyId: bibCompanyId },
    { enabled: activeTab === "composicoes" && id > 0 && bibCompanyId > 0, staleTime: 30_000 }
  );
  const composicoesCatalogo = (composicoesQuery.data ?? []) as any[];

  const enviarMutation = trpc.orcamento.enviarParaBiblioteca.useMutation({
    onSuccess: res => {
      toast.success(`Biblioteca atualizada! ${res.composicoes} composições e ${res.insumos} insumos enviados.`);
      setBibOpen(false);
      setBibLoaded(false);
    },
    onError: e => toast.error(e.message || "Erro ao enviar para biblioteca"),
  });

  const [bdiUploadOpen, setBdiUploadOpen] = useState(false);
  const [bdiUploadFile, setBdiUploadFile] = useState<File | null>(null);
  const bdiFileRef = useRef<HTMLInputElement>(null);

  const updateBdiMutation = trpc.orcamento.updateBdiLinha.useMutation({
    onError: e => toast.error(e.message || "Erro ao salvar linha BDI"),
  });

  const aplicarBdiMutation = trpc.orcamento.aplicarBdi.useMutation({
    onSuccess: (res) => {
      toast.success(`BDI ${(res.bdiPercentual * 100).toFixed(2)}% aplicado ao orçamento!`);
      refetch();
    },
    onError: e => toast.error(e.message || "Erro ao aplicar BDI"),
  });

  const importarBdiMutation = trpc.orcamento.importarBdi.useMutation({
    onSuccess: (res) => {
      toast.success(`BDI importado! ${res.linhasCount} linhas em ${res.abasImportadas.length} aba(s).`);
      setBdiUploadOpen(false);
      setBdiUploadFile(null);
      refetch();
    },
    onError: e => toast.error(e.message || "Erro ao importar BDI"),
  });

  const confirmarUploadBdi = async () => {
    if (!bdiUploadFile) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = (e.target?.result as string).split(",")[1];
      importarBdiMutation.mutate({
        orcamentoId: id,
        companyId:   Number(orc?.companyId ?? 0),
        fileBase64:  b64,
        fileName:    bdiUploadFile.name,
      });
    };
    reader.readAsDataURL(bdiUploadFile);
  };

  useEffect(() => {
    if (data) {
      const pct = parseFloat((data as any).metaPercentual || "0") * 100;
      setLocalMetaPerc(pct);
      setMetaInput(r2(pct).toFixed(2));
      // Restaura o R$ exato salvo no banco — evita desvio por recálculo via %
      const savedMeta = parseFloat((data as any).totalMeta || "0");
      if (savedMeta > 0) {
        setLocalMetaVal(savedMeta);
        setMetaValInput(savedMeta.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } else {
        setLocalMetaVal(null);
        setMetaValInput("");
      }
    }
  }, [data]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center py-24 gap-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Orçamento não encontrado.</p>
          <Button variant="outline" onClick={() => navigate("/orcamento/lista")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à lista
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const orc     = data as any;
  const itens: OrcItem[] = orc.itens   ?? [];
  const insumos: any[]   = orc.insumos ?? [];

  const bdiPct  = n(orc.bdiPercentual)  * 100;
  const metaPct = n(orc.metaPercentual) * 100;
  // Margem de lucro do BDI (Taxa de Comercialização / LC)
  // margemLucroBdi vem do servidor como soma dos percentuais da aba "Taxa de Comercialização"
  const margemLucroPct = n(orc.margemLucroBdi) > 0
    ? n(orc.margemLucroBdi)                                       // dados reais do BDI
    : (n(orc.totalVenda) > 0 && n(orc.totalCusto) > 0             // fallback: derivado do BDI global
        ? (n(orc.totalVenda) - n(orc.totalCusto)) / n(orc.totalVenda)
        : 0);

  // ── Mapa de grupos (item tem filhos) ──
  // Constrói de baixo pra cima: cada item com "." no código marca seu pai como grupo.
  // Isso é O(n) e funciona independente de ordenação — muito mais robusto que "próximo item".
  const childMap: Record<string, boolean> = {};
  itens.forEach(item => {
    const dot = item.eapCodigo.lastIndexOf(".");
    if (dot > 0) {
      const parentCode = item.eapCodigo.slice(0, dot);
      childMap[parentCode] = true;
    }
  });

  // ── Totais agregados para grupos com valores zerados no banco ──
  // Cada parcela é arredondada a 2 casas antes de acumular (evita drift de float).
  const groupTotals: Record<string, { mat: number; mdo: number; custo: number; venda: number }> = {};
  itens.forEach(item => {
    if (!childMap[item.eapCodigo]) return;          // só grupos
    if (n(item.custoTotal) > 0) return;             // já tem valor no banco
    const prefix = item.eapCodigo + ".";
    let mat = 0, mdo = 0, custo = 0, venda = 0;
    itens.forEach(child => {
      if (!child.eapCodigo.startsWith(prefix)) return;
      if (childMap[child.eapCodigo]) return;        // ignora sub-grupos intermediários
      mat   += n(child.custoTotalMat);
      mdo   += n(child.custoTotalMdo);
      custo += n(child.custoTotal);
      venda += n(child.vendaTotal);
    });
    groupTotals[item.eapCodigo] = { mat, mdo, custo, venda };
  });

  // ── Totais: soma apenas itens FOLHA (sem filhos) — são eles que têm os valores reais da planilha ──
  // Grupos intermediários têm valores calculados/agregados que podem divergir; folhas são a fonte de verdade.
  const leafItems = itens.filter((i: OrcItem) => !childMap[i.eapCodigo]);
  // Totais autoritativos: importados diretamente da planilha (soma dos itens nível 1 lidos do Excel).
  // São mais precisos que o cálculo bottom-up das folhas, que pode acumular divergência por arredondamento.
  // Fallback para o cálculo das folhas só se o campo não existir no banco.
  const calcMat   = r2(leafItems.reduce((s, i) => r2(s) + r2(n(i.custoTotalMat)), 0));
  const calcMdo   = r2(leafItems.reduce((s, i) => r2(s) + r2(n(i.custoTotalMdo)), 0));
  const calcCusto = r2(leafItems.reduce((s, i) => r2(s) + r2(n(i.custoTotal)),    0));
  const calcVenda = r2(leafItems.reduce((s, i) => r2(s) + r2(n(i.vendaTotal)),    0));

  // Preferir valor armazenado (importado do Excel) — só cair no calc se estiver zerado/ausente
  const totalCusto     = r2(n(orc.totalCusto) || calcCusto);
  const totalVenda     = r2(n(orc.totalVenda) || calcVenda);
  const valorNegociado = r2(n((orc as any).valorNegociado));   // 0 = não definido
  const totalMat       = r2(n((orc as any).totalMateriais) || calcMat);
  const totalMdo   = r2(n((orc as any).totalMdo) || calcMdo);
  // totalMeta sempre derivado do estado local (localMetaVal ou localMetaPerc) para evitar divergência com o banco
  const totalMeta  = localMetaVal !== null
    ? r2(localMetaVal)
    : r2(totalCusto * (1 - localMetaPerc / 100));

  const visibleItems = itens.filter(item => {
    if (item.nivel === 1) return true;
    const idx = itens.indexOf(item);
    for (let lvl = item.nivel - 1; lvl >= 1; lvl--) {
      for (let j = idx - 1; j >= 0; j--) {
        if (itens[j].nivel === lvl) {
          if (collapsed.has(itens[j].eapCodigo)) return false;
          break;
        }
      }
    }
    return true;
  });

  const toggleCollapse = (eap: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(eap) ? next.delete(eap) : next.add(eap);
      return next;
    });
  };

  const cfg = VERSAO_CONFIG[versao];

  return (
    <DashboardLayout>
      <div className="p-4">

        {/* ── Navegação rápida de abas no topo ── */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => { setActivePage("orcamento"); setActiveTab("eap"); }}
            className={`px-5 py-2 text-sm font-bold rounded-md transition-all ${
              activePage === "orcamento"
                ? "bg-orange-500 text-white shadow"
                : "bg-muted text-muted-foreground hover:bg-orange-100 hover:text-orange-700"
            }`}
          >
            ORÇAMENTO
          </button>
          <button
            onClick={() => setActivePage("bdi")}
            className={`px-5 py-2 text-sm font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activePage === "bdi"
                ? "bg-blue-600 text-white shadow"
                : "bg-muted text-muted-foreground hover:bg-blue-100 hover:text-blue-700"
            }`}
          >
            <Percent className="h-3.5 w-3.5" />
            BDI
            {bdiPct > 0 && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                activePage === "bdi" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
              }`}>
                {bdiPct.toFixed(2)}%
              </span>
            )}
          </button>
        </div>

        {/* ── Cabeçalho ── */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground"
              onClick={() => navigate("/orcamento/lista")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Lista
            </Button>
            <h1 className="text-xl font-bold tracking-tight">{orc.codigo}</h1>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              {orc.revisao && <span className="text-blue-600 font-mono font-medium">{orc.revisao}</span>}
              {orc.cliente && <span>Cliente: {orc.cliente}</span>}
              {orc.local   && <span>Local: {orc.local}</span>}
              {bdiPct > 0  && <span className="text-amber-600 font-medium">BDI {bdiPct.toFixed(2)}%</span>}
              <span className="text-purple-600 font-medium">Meta −{metaPct.toFixed(0)}% do custo</span>
            </div>
          </div>
          {/* Botões de ação */}
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" className="gap-2"
              onClick={() => window.open(`/orcamento/${id}/print`, "_blank")}>
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-2"
              onClick={() => { setReuploadOpen(true); setReuploadFile(null); setReuploadAnalise(null); }}>
              <RefreshCw className="h-4 w-4" /> Atualizar Planilha
            </Button>
            <Button size="sm" variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => { setBibOpen(true); setBibLoaded(true); }}
              title="Envia os preços e composições deste orçamento para atualizar a base central do sistema">
              <BookOpen className="h-4 w-4" /> Atualizar Base
            </Button>
          </div>
        </div>

        {/* ── Cards de versão: Meta | Custo | Venda ── */}
        <div className="grid grid-cols-3 gap-3 mb-5">

          {/* CARD META (esquerda) */}
          <div className={`rounded-xl border-2 transition-all ${
            versao === "meta" ? "border-purple-500 bg-purple-50" : "border-border bg-card"
          }`}>
            {/* Cabeçalho clicável — muda versão */}
            <button className="w-full text-left p-4 pb-2" onClick={() => setVersao("meta")}>
              <div className="flex items-center gap-2 mb-1">
                <Target className={`h-4 w-4 ${versao === "meta" ? "text-purple-600" : "text-muted-foreground"}`} />
                <span className="text-xs text-muted-foreground font-medium uppercase">Meta</span>
                {versao === "meta" && <CheckCircle2 className="h-3 w-3 ml-auto text-purple-600" />}
              </div>
              <p className={`text-base font-bold ${versao === "meta" ? "text-purple-700" : "text-foreground"}`}>
                {formatBRL(localMetaVal !== null ? localMetaVal : r2(totalCusto * (1 - localMetaPerc / 100)))}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">−{localMetaPerc.toFixed(2)}% do custo</p>
            </button>

            {/* Área de valores — modo leitura ou edição */}
            <div className="px-3 pb-3">
              {!editingMeta ? (
                /* ── MODO LEITURA: mostra valores + botão Editar ── */
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs text-muted-foreground w-4">%</span>
                    <span className="font-semibold text-purple-700 text-right">{localMetaPerc.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-xs text-muted-foreground w-4">R$</span>
                    <span className="font-semibold text-purple-700 text-right">
                      {(localMetaVal !== null
                        ? localMetaVal
                        : r2(totalCusto * (1 - localMetaPerc / 100))
                      ).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button size="sm" variant="ghost"
                      className="h-6 px-2 text-purple-600 hover:text-purple-800 text-xs gap-1"
                      onClick={e => { e.stopPropagation(); setEditingMeta(true); }}
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── MODO EDIÇÃO: campos + botões Salvar / Cancelar ── */
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground w-4 shrink-0">%</span>
                    <Input
                      type="number" min={0} max={99} step={0.01}
                      value={metaInput}
                      autoFocus
                      onChange={e => {
                        const str = e.target.value;
                        setMetaInput(str);
                        setMetaValInput("");
                        setLocalMetaVal(null);
                        const v = parseFloat(str);
                        if (!isNaN(v) && v >= 0 && v < 100) setLocalMetaPerc(v);
                      }}
                      className="h-7 text-sm text-right font-semibold text-purple-700"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground w-4 shrink-0">R$</span>
                    <Input
                      type="text"
                      value={metaValInput !== ""
                        ? metaValInput
                        : r2(totalCusto * (1 - localMetaPerc / 100))
                            .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      onChange={e => {
                        const str = e.target.value;
                        setMetaValInput(str);
                        const val = parseFloat(str.replace(/\./g, "").replace(",", "."));
                        if (!isNaN(val) && val > 0 && totalCusto > 0) {
                          setLocalMetaVal(val);
                          const pct = (1 - val / totalCusto) * 100;
                          if (pct >= 0 && pct < 100) {
                            setLocalMetaPerc(pct);
                            setMetaInput(r2(pct).toFixed(2));
                          }
                        }
                      }}
                      onBlur={e => {
                        const val = parseFloat(e.target.value.replace(/\./g, "").replace(",", "."));
                        if (!isNaN(val) && val > 0) {
                          setLocalMetaVal(val);
                          setMetaValInput(val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                        } else {
                          setMetaValInput("");
                          setLocalMetaVal(null);
                        }
                      }}
                      className="h-7 text-sm text-right font-semibold text-purple-700"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-0.5">
                    <Button size="sm" variant="ghost"
                      className="h-6 px-2 text-muted-foreground hover:text-foreground text-xs"
                      onClick={() => setEditingMeta(false)}
                      disabled={updateMetaMutation.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button size="sm" variant="ghost"
                      className="h-6 px-2 text-purple-600 hover:text-purple-800 text-xs gap-1"
                      disabled={savingMeta || updateMetaMutation.isPending}
                      onClick={() => {
                        setSavingMeta(true);
                        updateMetaMutation.mutate({
                          id,
                          metaPercentual: localMetaPerc / 100,
                          ...(localMetaVal !== null ? { totalMetaExato: localMetaVal } : {}),
                        });
                      }}
                    >
                      {updateMetaMutation.isPending
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Save className="h-3 w-3" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CARD CUSTO (meio) */}
          <button onClick={() => setVersao("custo")}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              versao === "custo" ? "border-amber-500 bg-amber-50" : "border-border bg-card hover:bg-muted/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className={`h-4 w-4 ${versao === "custo" ? "text-amber-600" : "text-muted-foreground"}`} />
              <span className="text-xs text-muted-foreground font-medium uppercase">Custo</span>
              {versao === "custo" && <CheckCircle2 className="h-3 w-3 ml-auto text-amber-600" />}
            </div>
            <p className={`text-base font-bold ${versao === "custo" ? "text-amber-700" : "text-foreground"}`}>
              {formatBRL(totalCusto)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Custo direto</p>
          </button>

          {/* CARD VENDA (direita) */}
          <div className={`text-left p-4 rounded-xl border-2 transition-all ${
            versao === "venda" ? "border-green-500 bg-green-50" : "border-border bg-card"
          }`}>
            {/* cabeçalho do card */}
            <div className="flex items-center gap-2 mb-1">
              <button className="flex items-center gap-2 flex-1" onClick={() => setVersao("venda")}>
                <DollarSign className={`h-4 w-4 ${versao === "venda" ? "text-green-600" : "text-muted-foreground"}`} />
                <span className="text-xs text-muted-foreground font-medium uppercase">Venda</span>
                {valorNegociado > 0 && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-300 rounded px-1.5 py-0.5 font-semibold">Negociado</span>
                )}
              </button>
              {!editingNegociado && (
                <button className="p-0.5 rounded hover:bg-green-100 transition-colors"
                  title={valorNegociado > 0 ? "Editar valor negociado" : "Definir valor negociado"}
                  onClick={e => { e.stopPropagation(); setNegociadoInput(valorNegociado > 0 ? valorNegociado.toFixed(2).replace(".", ",") : ""); setEditingNegociado(true); }}>
                  <Pencil className="h-3 w-3 text-green-500" />
                </button>
              )}
              {versao === "venda" && !editingNegociado && <CheckCircle2 className="h-3 w-3 text-green-600" />}
            </div>

            {/* valor exibido */}
            {!editingNegociado ? (
              <button className="w-full text-left" onClick={() => setVersao("venda")}>
                <p className={`text-base font-bold ${versao === "venda" ? "text-green-700" : "text-foreground"}`}>
                  {formatBRL(valorNegociado > 0 ? valorNegociado : totalVenda)}
                </p>
                {valorNegociado > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground mt-0.5 line-through">{formatBRL(totalVenda)}</p>
                    <p className="text-xs text-amber-600 font-medium">
                      Ajuste: {formatBRL(valorNegociado - totalVenda)}
                    </p>
                  </>
                ) : (
                  bdiPct > 0
                    ? <p className="text-xs text-muted-foreground mt-0.5">BDI {bdiPct.toFixed(2)}%</p>
                    : <p className="text-xs text-muted-foreground mt-0.5">BDI não importado</p>
                )}
              </button>
            ) : (
              /* formulário de edição inline */
              <div className="mt-1 space-y-1.5" onClick={e => e.stopPropagation()}>
                <p className="text-[10px] text-muted-foreground">Calculado: {formatBRL(totalVenda)}</p>
                <input
                  autoFocus
                  className="w-full h-7 text-sm font-mono border border-green-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                  placeholder="Ex: 9500000,00"
                  value={negociadoInput}
                  onChange={e => setNegociadoInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      const v = parseFloat(negociadoInput.replace(/\./g,"").replace(",","."));
                      if (!isNaN(v) && v > 0) setValorNegociadoMut.mutate({ id, valorNegociado: v });
                    }
                    if (e.key === "Escape") setEditingNegociado(false);
                  }}
                />
                <div className="flex gap-1">
                  <button
                    className="flex-1 h-6 text-[10px] font-semibold bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    disabled={setValorNegociadoMut.isPending}
                    onClick={() => {
                      const v = parseFloat(negociadoInput.replace(/\./g,"").replace(",","."));
                      if (!isNaN(v) && v > 0) setValorNegociadoMut.mutate({ id, valorNegociado: v });
                    }}>
                    Salvar
                  </button>
                  {valorNegociado > 0 && (
                    <button
                      className="flex-1 h-6 text-[10px] font-semibold border border-red-300 text-red-600 rounded hover:bg-red-50"
                      onClick={() => setValorNegociadoMut.mutate({ id, valorNegociado: null })}>
                      Limpar
                    </button>
                  )}
                  <button
                    className="px-2 h-6 text-[10px] border rounded text-muted-foreground hover:bg-muted"
                    onClick={() => setEditingNegociado(false)}>
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ── Banner Margem de Lucro ──────────────────────────────────── */}
        {activePage === "orcamento" && margemLucroPct > 0 && (() => {
          const vendaRef = valorNegociado > 0 ? valorNegociado : totalVenda;

          // Lucro esperado pelo BDI (TC) aplicado sobre o preço de venda
          const lucroR_custo = totalVenda  * margemLucroPct;
          const lucroR_venda = vendaRef    * margemLucroPct;
          // Na visão META: ganho total = diferença entre venda e custo real (meta de compras)
          const lucroR_meta  = totalMeta > 0 ? totalVenda - totalMeta : lucroR_custo;

          const lucroR =
            versao === "venda" ? lucroR_venda
            : versao === "meta"  ? lucroR_meta
            : lucroR_custo;

          // % efetiva varia por versão
          const pctEfetiva =
            versao === "venda" ? (vendaRef  > 0 ? (vendaRef  - totalCusto) / vendaRef  : 0)
            : versao === "meta"  ? (totalVenda > 0 ? (totalVenda - (totalMeta || totalCusto)) / totalVenda : 0)
            : margemLucroPct;

          const labelDescricao =
            versao === "venda" && valorNegociado > 0 ? "Lucro sobre valor negociado"
            : versao === "meta"  ? "Lucro potencial (venda − meta de compras)"
            : n(orc.margemLucroBdi) > 0 ? "Taxa de Comercialização (LC) do BDI"
            : "Margem BDI (venda − custo)";

          const cor =
            versao === "venda" ? "border-green-200 bg-green-50/60 text-green-800"
            : versao === "meta"  ? "border-purple-200 bg-purple-50/60 text-purple-800"
            : "border-amber-200 bg-amber-50/60 text-amber-800";

          const corValor =
            versao === "venda" ? "text-green-700"
            : versao === "meta"  ? "text-purple-700"
            : "text-amber-700";

          return (
            <div className={`mt-4 rounded-xl border px-4 py-3 flex items-center justify-between flex-wrap gap-3 ${cor}`}>
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className={`h-4 w-4 shrink-0 ${corValor}`} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide">Margem de Lucro</p>
                  <p className="text-[10px] text-muted-foreground">{labelDescricao}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 flex-wrap">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">% Esperada</p>
                  <p className={`text-base font-bold ${corValor}`}>
                    {(margemLucroPct * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">% Efetiva ({versao === "venda" ? "negociada" : versao === "meta" ? "meta" : "custo"})</p>
                  <p className={`text-base font-bold ${pctEfetiva >= margemLucroPct - 0.001 ? corValor : "text-red-600"}`}>
                    {(pctEfetiva * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Valor em R$</p>
                  <p className={`text-lg font-bold ${corValor}`}>{formatBRL(lucroR)}</p>
                </div>
                {versao !== "custo" && Math.abs(lucroR - lucroR_custo) > 1 && (
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">vs. BDI original</p>
                    <p className={`text-sm font-semibold ${lucroR > lucroR_custo ? "text-green-600" : "text-red-500"}`}>
                      {lucroR > lucroR_custo ? "+" : ""}{formatBRL(lucroR - lucroR_custo)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {activePage === "orcamento" && <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="eap">EAP</TabsTrigger>
            <TabsTrigger value="insumos">
              Insumos {insumos.length > 0 && `(${insumos.length})`}
            </TabsTrigger>
            <TabsTrigger value="composicoes">
              Composições {composicoesCatalogo.length > 0 ? `(${composicoesCatalogo.length})` : leafItems.length > 0 ? `(${leafItems.length})` : ""}
            </TabsTrigger>
            {insumos.length > 0 && <TabsTrigger value="abc">Curva ABC Insumos</TabsTrigger>}
            {insumos.length > 0 && <TabsTrigger value="abc-cat">Curva ABC por Categoria</TabsTrigger>}
          </TabsList>

          {/* ═══ ABA EAP ═══════════════════════════════════════════════ */}
          <TabsContent value="eap" className="mt-3">
            {/* Barra de controle de níveis */}
            {(() => {
              const maxLvl = itens.filter(i => childMap[i.eapCodigo]).reduce((m, i) => Math.max(m, i.nivel), 1);
              const expandToLevel = (lvl: number) =>
                setCollapsed(new Set(itens.filter(i => childMap[i.eapCodigo] && i.nivel >= lvl).map(i => i.eapCodigo)));
              return (
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <p className="text-xs text-muted-foreground">
                    {itens.length} itens · exibindo{" "}
                    <span className={`${cfg.valueClass} font-semibold`}>{cfg.label}</span>
                  </p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] text-muted-foreground mr-1">Nível:</span>
                    {Array.from({ length: maxLvl }, (_, i) => i + 1).map(lvl => (
                      <Button key={lvl} size="sm" variant="outline"
                        className="text-[11px] h-6 w-7 px-0 font-mono"
                        onClick={() => expandToLevel(lvl)}>
                        {lvl}
                      </Button>
                    ))}
                    <div className="w-px h-4 bg-border mx-1" />
                    <Button size="sm" variant="ghost" className="text-[11px] h-6 px-2 text-muted-foreground"
                      onClick={() => setCollapsed(new Set(itens.filter(i => childMap[i.eapCodigo]).map(i => i.eapCodigo)))}>
                      Recolher
                    </Button>
                    <Button size="sm" variant="ghost" className="text-[11px] h-6 px-2 text-muted-foreground"
                      onClick={() => setCollapsed(new Set())}>
                      Expandir
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* ── Barra de totais acima da tabela ── */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="rounded-lg border bg-blue-50 border-blue-200 px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Total Material</p>
                  <p className="text-sm font-bold text-blue-700 tabular-nums mt-0.5">{formatBRL(totalMat)}</p>
                </div>
                <div className="text-[10px] text-blue-400 font-medium">
                  {totalCusto > 0 ? `${((totalMat / totalCusto) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
              <div className="rounded-lg border bg-orange-50 border-orange-200 px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500">Total Mão de Obra</p>
                  <p className="text-sm font-bold text-orange-700 tabular-nums mt-0.5">{formatBRL(totalMdo)}</p>
                </div>
                <div className="text-[10px] text-orange-400 font-medium">
                  {totalCusto > 0 ? `${((totalMdo / totalCusto) * 100).toFixed(1)}%` : "—"}
                </div>
              </div>
              <div className={`rounded-lg border px-4 py-2.5 flex items-center justify-between ${
                versao === "venda" ? "bg-emerald-50 border-emerald-200" :
                versao === "meta"  ? "bg-purple-50 border-purple-200" :
                                    "bg-slate-50 border-slate-200"
              }`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${
                    versao === "venda" ? "text-emerald-600" :
                    versao === "meta"  ? "text-purple-600" : "text-slate-500"
                  }`}>Total {cfg.label}</p>
                  <p className={`text-sm font-bold tabular-nums mt-0.5 ${
                    versao === "venda" ? "text-emerald-700" :
                    versao === "meta"  ? "text-purple-700" : "text-slate-700"
                  }`}>{formatBRL(
                    versao === "venda" ? (valorNegociado > 0 ? valorNegociado : totalVenda) :
                    versao === "meta"  ? totalMeta  : totalCusto
                  )}</p>
                  {versao === "venda" && valorNegociado > 0 && (
                    <p className="text-[10px] text-amber-600 font-medium mt-0.5 line-through tabular-nums">{formatBRL(totalVenda)}</p>
                  )}
                </div>
                {versao === "venda" && totalCusto > 0 && (
                  <div className="text-right">
                    <div className="text-[10px] text-emerald-500 font-medium">BDI {bdiPct.toFixed(1)}%</div>
                    {valorNegociado > 0 && (
                      <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                        Negociado
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs min-w-[960px]">
                  <thead>
                    <tr className="bg-slate-700 text-white text-[11px] sticky top-0 z-20">
                      <th className="text-left px-2 py-2 w-[84px] sticky left-0 bg-slate-700">Item</th>
                      <th className="text-left px-2 py-2 min-w-[220px]">Descrição</th>
                      <th className="text-center px-1 py-2 w-[42px]">Un</th>
                      <th className="text-right px-2 py-2 w-[68px]">Qtd</th>
                      <th className="text-right px-2 py-2 w-[84px] text-blue-200">
                        P.Unit.<br/>Mat
                      </th>
                      <th className="text-right px-2 py-2 w-[84px] text-orange-200">
                        P.Unit.<br/>MO
                      </th>
                      <th className="text-right px-2 py-2 w-[84px] text-blue-200">
                        P.Total<br/>Mat
                      </th>
                      <th className="text-right px-2 py-2 w-[84px] text-orange-200">
                        P.Total<br/>MO
                      </th>
                      <th className={`text-right px-2 py-2 w-[92px] font-bold ${cfg.thClass}`}>
                        {cfg.label}
                      </th>
                      <th className="text-right px-2 py-2 w-[48px]">ABC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map(item => {
                      const isGroup = !!childMap[item.eapCodigo];
                      const isLeaf  = !isGroup;
                      const indent  = Math.max(0, item.nivel - 1) * 16;
                      const rowBg   = NIVEL_BG[item.nivel] ?? "bg-white";
                      const qty     = n(item.quantidade);
                      const puMat   = n(item.custoUnitMat);
                      const puMdo   = n(item.custoUnitMdo);

                      // Para grupos: usar totais calculados (soma filhos) ou armazenados
                      const agg    = groupTotals[item.eapCodigo];
                      const ptMat  = agg?.mat   ?? n(item.custoTotalMat);
                      const ptMdo  = agg?.mdo   ?? n(item.custoTotalMdo);
                      const ptCusto = agg?.custo ?? n(item.custoTotal);
                      const ptVenda = agg?.venda ?? n(item.vendaTotal);

                      const totalVal = versao === "venda"
                        ? ptVenda
                        : versao === "meta"
                          ? ptCusto * (1 - localMetaPerc / 100)
                          : ptCusto;

                      return (
                        <tr key={item.id}
                          className={`${rowBg} border-b border-slate-200 hover:brightness-95 transition-all ${isGroup ? "cursor-pointer" : ""}`}
                          onClick={() => isGroup && toggleCollapse(item.eapCodigo)}
                        >
                          {/* Item com recuo e chevron */}
                          <td className={`px-2 py-1.5 sticky left-0 z-10 ${rowBg} border-r border-slate-200`}>
                            <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
                              {isGroup
                                ? (collapsed.has(item.eapCodigo)
                                  ? <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                                  : <ChevronDown  className="h-3 w-3 text-slate-400 shrink-0" />)
                                : <span className="w-3 shrink-0" />
                              }
                              <span className="font-mono text-[10px] text-slate-500 whitespace-nowrap">
                                {item.eapCodigo}
                              </span>
                            </div>
                          </td>

                          {/* Descrição */}
                          <td className="px-2 py-1.5">
                            <span className={item.nivel <= 2 ? "uppercase tracking-wide text-[11px] font-semibold" : "text-[11px]"}>
                              {item.descricao}
                            </span>
                          </td>

                          {/* Unidade */}
                          <td className="px-1 py-1.5 text-center text-muted-foreground text-[10px]">
                            {isLeaf ? item.unidade : ""}
                          </td>

                          {/* Quantidade */}
                          <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums text-[10px]">
                            {isLeaf && qty > 0
                              ? qty.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : ""}
                          </td>

                          {/* Preço Unit. Material */}
                          <td className="px-2 py-1.5 text-right text-blue-600 tabular-nums text-[10px]">
                            {isLeaf && puMat > 0 ? formatBRL(puMat) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Preço Unit. MO */}
                          <td className="px-2 py-1.5 text-right text-orange-500 tabular-nums text-[10px]">
                            {isLeaf && puMdo > 0 ? formatBRL(puMdo) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Preço Total Material */}
                          <td className="px-2 py-1.5 text-right text-blue-600 font-medium tabular-nums text-[10px]">
                            {ptMat > 0 ? formatBRL(ptMat) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Preço Total MO */}
                          <td className="px-2 py-1.5 text-right text-orange-500 font-medium tabular-nums text-[10px]">
                            {ptMdo > 0 ? formatBRL(ptMdo) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Custo / Venda / Meta */}
                          <td className={`px-2 py-1.5 text-right font-semibold tabular-nums text-[10px] ${cfg.valueClass}`}>
                            {totalVal > 0 ? formatBRL(totalVal) : <span className="text-slate-300 font-normal">—</span>}
                          </td>

                          {/* ABC Serv */}
                          <td className="px-2 py-1.5 text-right text-muted-foreground font-mono text-[10px]">
                            {item.abcServico || ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* ═══ ABA INSUMOS ═══════════════════════════════════════════ */}
          <TabsContent value="insumos" className="mt-3">
            {insumos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm">Nenhum insumo extraído.</p>
                <p className="text-xs mt-1">Adicione a aba "Insumos" à planilha para gerar a curva ABC.</p>
              </div>
            ) : (
              <Card>
                <CardContent className="py-3 px-0 overflow-x-auto">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead>
                      <tr className="border-b bg-muted/50 text-muted-foreground">
                        <th className="text-left pl-4 py-2 w-8">ABC</th>
                        <th className="text-left px-3 py-2">Código</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-left px-3 py-2">Tipo</th>
                        <th className="text-right px-3 py-2">Qtd</th>
                        <th className="text-right px-3 py-2">Custo Total</th>
                        <th className="text-right pr-4 py-2">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insumos.map((ins: any) => (
                        <tr key={ins.id} className="border-b hover:bg-muted/30">
                          <td className="pl-4 py-1.5">
                            <span className={`inline-block w-5 h-5 rounded text-center font-bold leading-5 text-white text-xs
                              ${ins.curvaAbc === "A" ? "bg-green-600" : ins.curvaAbc === "B" ? "bg-amber-500" : "bg-zinc-400"}`}>
                              {ins.curvaAbc}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono">{ins.codigo}</td>
                          <td className="px-3 py-1.5 max-w-xs truncate">{ins.descricao}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{ins.tipo}</td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                            {n(ins.quantidadeTotal).toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-amber-600 font-medium tabular-nums">
                            {formatBRL(n(ins.custoTotal))}
                          </td>
                          <td className="pr-4 py-1.5 text-right text-muted-foreground tabular-nums">
                            {(n(ins.percentualTotal) * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ ABA COMPOSIÇÕES ════════════════════════════════════════ */}
          <TabsContent value="composicoes" className="mt-3">
            {composicoesQuery.isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin opacity-40" />
                <p className="text-sm">Carregando composições...</p>
              </div>
            ) : composicoesCatalogo.length === 0 && leafItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm font-medium">Nenhuma composição encontrada.</p>
              </div>
            ) : composicoesCatalogo.length === 0 ? (
              /* ── Fallback: itens-folha da EAP ordenados por custo desc ── */
              (() => {
                const sorted = [...leafItems].sort((a, b) => n(b.custoTotal) - n(a.custoTotal));
                return (
                  <Card>
                    <div className="flex items-center justify-between px-4 py-1.5 bg-slate-100 border-b border-slate-200">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Composições / Serviços — {sorted.length} itens
                      </span>
                      <span className="text-xs text-muted-foreground">Ordenado por Custo Total ↓</span>
                    </div>
                    <CardContent className="py-0 px-0 overflow-x-auto">
                      <table className="w-full text-xs min-w-[860px]">
                        <thead>
                          <tr className="bg-slate-700 text-white uppercase sticky top-0 z-10">
                            <th className="text-left pl-2 py-1.5 w-28 border-r border-slate-600">EAP</th>
                            <th className="text-left px-3 py-1.5 border-r border-slate-600">Descrição</th>
                            <th className="text-center px-2 py-1.5 border-r border-slate-600 w-12">Un</th>
                            <th className="text-right px-2 py-1.5 border-r border-slate-600 w-20">Qtd</th>
                            <th className="text-right px-2 py-1.5 border-r border-slate-600 w-28 text-blue-200">Mat Total</th>
                            <th className="text-right px-2 py-1.5 border-r border-slate-600 w-28 text-orange-200">MO Total</th>
                            <th className="text-right px-2 py-1.5 border-r border-slate-600 w-28">Custo Total</th>
                            <th className="text-right pr-3 py-1.5 w-14">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((item, idx) => {
                            const pct = totalCusto > 0 ? (n(item.custoTotal) / totalCusto) * 100 : 0;
                            return (
                              <tr key={item.id ?? idx} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                                <td className="pl-2 py-1 font-mono text-slate-400 border-r border-slate-100 whitespace-nowrap">{item.eapCodigo}</td>
                                <td className="px-3 py-1 text-slate-700 border-r border-slate-100 max-w-xs">
                                  <span className="line-clamp-2">{item.descricao}</span>
                                  {item.servicoCodigo && <span className="block text-[10px] text-blue-400 font-mono">{item.servicoCodigo}</span>}
                                </td>
                                <td className="px-2 py-1 text-center text-slate-500 border-r border-slate-100">{item.unidade}</td>
                                <td className="px-2 py-1 text-right font-mono text-slate-600 border-r border-slate-100 whitespace-nowrap">{n(item.quantidade).toFixed(2)}</td>
                                <td className="px-2 py-1 text-right font-mono text-blue-700 border-r border-slate-100 whitespace-nowrap">{formatBRL(n(item.custoTotalMat))}</td>
                                <td className="px-2 py-1 text-right font-mono text-orange-600 border-r border-slate-100 whitespace-nowrap">{formatBRL(n(item.custoTotalMdo))}</td>
                                <td className="px-2 py-1 text-right font-mono font-semibold text-amber-700 border-r border-slate-100 whitespace-nowrap">{formatBRL(n(item.custoTotal))}</td>
                                <td className="pr-3 py-1 text-right text-slate-500 whitespace-nowrap">{pct.toFixed(2)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                );
              })()
            ) : (
              <Card>
                <CardContent className="py-0 px-0 overflow-x-auto">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead>
                      <tr className="border-b bg-muted/50 text-muted-foreground">
                        <th className="text-left pl-2 py-2 w-6"></th>
                        <th className="text-left pl-2 py-2 w-28">EAP / CPU</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-left px-3 py-2 w-12">Un</th>
                        <th className="text-right px-3 py-2 w-20">Qtd</th>
                        <th className="text-right px-3 py-2 w-28 text-blue-700">Mat Total</th>
                        <th className="text-right px-3 py-2 w-28 text-purple-700">MO Total</th>
                        <th className="text-right px-3 py-2 w-28 text-amber-600">Custo Total</th>
                        <th className="text-right pr-4 py-2 w-14">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {composicoesCatalogo.map((comp: any) => {
                        const pct = totalCusto > 0 ? (n(comp.custoTotal) / totalCusto) * 100 : 0;
                        const isExpanded = expandedComps.has(comp.eapCodigo ?? '');
                        const hasInsumos = (comp.insumos ?? []).length > 0;
                        return (
                          <React.Fragment key={comp.eapCodigo ?? comp.servicoCodigo}>
                            {/* Linha da composição */}
                            <tr
                              className={`border-b ${hasInsumos ? 'cursor-pointer hover:bg-muted/30' : 'hover:bg-muted/20'} ${isExpanded ? 'bg-blue-50/40' : ''}`}
                              onClick={() => {
                                if (!hasInsumos) return;
                                setExpandedComps(prev => {
                                  const s = new Set(prev);
                                  s.has(comp.eapCodigo) ? s.delete(comp.eapCodigo) : s.add(comp.eapCodigo);
                                  return s;
                                });
                              }}
                            >
                              <td className="pl-2 py-1.5 text-center text-muted-foreground w-6">
                                {hasInsumos ? (isExpanded ? "▾" : "▸") : ""}
                              </td>
                              <td className="pl-2 py-1.5 font-mono text-muted-foreground">
                                <div>{comp.eapCodigo}</div>
                                {comp.servicoCodigo && (
                                  <div className="text-[10px] text-blue-500">{comp.servicoCodigo}</div>
                                )}
                              </td>
                              <td className="px-3 py-1.5 font-medium max-w-xs">
                                <span className="line-clamp-2">{comp.descricao}</span>
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{comp.unidade}</td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                                {n(comp.quantidade).toFixed(2)}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">
                                {formatBRL(n(comp.custoTotalMat))}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-purple-700">
                                {formatBRL(n(comp.custoTotalMdo))}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold text-amber-600 tabular-nums">
                                {formatBRL(n(comp.custoTotal))}
                              </td>
                              <td className="pr-4 py-1.5 text-right text-muted-foreground tabular-nums">
                                {pct.toFixed(2)}%
                              </td>
                            </tr>
                            {/* Linhas dos insumos — expandíveis */}
                            {isExpanded && (comp.insumos ?? []).map((ins: any, idx: number) => (
                              <tr key={idx} className="bg-slate-50 border-b border-dashed hover:bg-slate-100/80">
                                <td className="pl-2 py-1"></td>
                                <td className="pl-4 py-1 font-mono text-[10px] text-slate-400">{ins.insumoCodigo}</td>
                                <td className="px-3 py-1 text-slate-600 max-w-xs">
                                  <span className="line-clamp-2">{ins.insumoDescricao}</span>
                                </td>
                                <td className="px-3 py-1 text-slate-400 text-[10px]">{ins.unidade}</td>
                                <td className="px-3 py-1 text-right tabular-nums text-slate-500">
                                  {n(ins.quantidade).toFixed(4)}
                                </td>
                                <td className="px-3 py-1 text-right tabular-nums text-blue-600/70">
                                  {n(ins.custoTotalMat) > 0 ? formatBRL(n(ins.custoTotalMat)) : "—"}
                                </td>
                                <td className="px-3 py-1 text-right tabular-nums text-purple-600/70">
                                  {n(ins.custoTotalMdo) > 0 ? formatBRL(n(ins.custoTotalMdo)) : "—"}
                                </td>
                                <td className="px-3 py-1 text-right tabular-nums text-slate-500">
                                  {formatBRL(n(ins.custoTotal))}
                                </td>
                                <td className="pr-4 py-1 text-right text-[10px] text-slate-400">
                                  PU: {formatBRL(n(ins.precoUnitario))}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ ABA CURVA ABC ═════════════════════════════════════════ */}
          {insumos.length > 0 && (() => {
            // Factor para converter custoTotal → versão selecionada
            const abcVendaRef = valorNegociado > 0 ? valorNegociado : totalVenda;
            const abcFactor =
              versao === "venda" ? (totalCusto > 0 ? abcVendaRef / totalCusto : 1)
              : versao === "meta" ? (1 - localMetaPerc / 100)
              : 1;
            const abcColLabel =
              versao === "venda" ? "Venda Total"
              : versao === "meta"  ? "Meta Total"
              : "Custo Total";
            const abcValColor =
              versao === "venda" ? "text-green-700"
              : versao === "meta"  ? "text-purple-700"
              : "text-amber-600";
            return (
              <TabsContent value="abc" className="mt-3">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {(["A", "B", "C"] as const).map(cls => {
                    const ct = insumos.filter((i: any) => i.curvaAbc === cls);
                    const cv = ct.reduce((s: number, i: any) => s + n(i.custoTotal) * abcFactor, 0);
                    const colors = {
                      A: "bg-green-100 border-green-400 text-green-800",
                      B: "bg-amber-100 border-amber-400 text-amber-800",
                      C: "bg-zinc-100 border-zinc-400 text-zinc-700",
                    };
                    return (
                      <div key={cls} className={`rounded-xl border-2 p-4 ${colors[cls]}`}>
                        <div className="text-2xl font-bold">{cls}</div>
                        <div className="text-sm font-medium mt-1">{ct.length} insumos</div>
                        <div className="text-base font-bold mt-1">{formatBRL(cv)}</div>
                      </div>
                    );
                  })}
                </div>
                <Card>
                  <CardContent className="py-3 px-0 overflow-x-auto">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="border-b bg-muted/50 text-muted-foreground">
                          <th className="text-left pl-4 py-2 w-8">Cl</th>
                          <th className="text-left px-3 py-2">Descrição</th>
                          <th className="text-left px-3 py-2 w-16">Un</th>
                          <th className="text-right px-3 py-2 w-24">Qtd Total</th>
                          <th className={`text-right px-3 py-2 w-28 ${abcValColor}`}>{abcColLabel}</th>
                          <th className="text-right pr-4 py-2 w-14">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...insumos].sort((a: any, b: any) => n(b.custoTotal) - n(a.custoTotal)).map((ins: any) => (
                          <tr key={ins.id} className="border-b hover:bg-muted/30">
                            <td className="pl-4 py-1.5">
                              <span className={`inline-block w-5 h-5 rounded text-center font-bold leading-5 text-white text-xs
                                ${ins.curvaAbc === "A" ? "bg-green-600" : ins.curvaAbc === "B" ? "bg-amber-500" : "bg-zinc-400"}`}>
                                {ins.curvaAbc}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 max-w-xs truncate">{ins.descricao}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{ins.unidade}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                              {n(ins.quantidadeTotal).toFixed(2)}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${abcValColor}`}>
                              {formatBRL(n(ins.custoTotal) * abcFactor)}
                            </td>
                            <td className="pr-4 py-1.5 text-right text-muted-foreground tabular-nums">
                              {(n(ins.percentualTotal) * 100).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })()}

          {/* ═══ ABA CURVA ABC POR CATEGORIA ════════════════════════════ */}
          {insumos.length > 0 && (() => {
            const abcVendaRef2 = valorNegociado > 0 ? valorNegociado : totalVenda;
            const abcFactor2 =
              versao === "venda" ? (totalCusto > 0 ? abcVendaRef2 / totalCusto : 1)
              : versao === "meta" ? (1 - localMetaPerc / 100)
              : 1;
            const abcColLabel2 =
              versao === "venda" ? "Venda Total"
              : versao === "meta"  ? "Meta Total"
              : "Custo Total";
            const abcValColor2 =
              versao === "venda" ? "text-green-700"
              : versao === "meta"  ? "text-purple-700"
              : "text-amber-600";
            const totalGeral = insumos.reduce((s: number, i: any) => s + n(i.custoTotal), 0);
            const porCategoria: Record<string, { tipo: string; custo: number; qtd: number }> = {};
            for (const ins of insumos) {
              const cat = ins.tipo || "Sem categoria";
              if (!porCategoria[cat]) porCategoria[cat] = { tipo: cat, custo: 0, qtd: 0 };
              porCategoria[cat].custo += n(ins.custoTotal);
              porCategoria[cat].qtd += 1;
            }
            const categorias = Object.values(porCategoria).sort((a, b) => b.custo - a.custo);
            let acumulado = 0;
            const catComAbc = categorias.map(c => {
              acumulado += c.custo;
              const pct = totalGeral > 0 ? acumulado / totalGeral : 0;
              const cls = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
              return { ...c, pct: totalGeral > 0 ? c.custo / totalGeral : 0, cls };
            });
            return (
              <TabsContent value="abc-cat" className="mt-3">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {(["A", "B", "C"] as const).map(cls => {
                    const group = catComAbc.filter(c => c.cls === cls);
                    const total = group.reduce((s, c) => s + c.custo * abcFactor2, 0);
                    const colors = {
                      A: "bg-green-100 border-green-400 text-green-800",
                      B: "bg-amber-100 border-amber-400 text-amber-800",
                      C: "bg-zinc-100 border-zinc-400 text-zinc-700",
                    };
                    return (
                      <div key={cls} className={`rounded-xl border-2 p-4 ${colors[cls]}`}>
                        <div className="text-2xl font-bold">{cls}</div>
                        <div className="text-sm font-medium mt-1">{group.length} categorias</div>
                        <div className="text-base font-bold mt-1">{formatBRL(total)}</div>
                      </div>
                    );
                  })}
                </div>
                <Card>
                  <CardContent className="py-3 px-0 overflow-x-auto">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="border-b bg-muted/50 text-muted-foreground">
                          <th className="text-left pl-4 py-2 w-8">Cl</th>
                          <th className="text-left px-3 py-2">Categoria / Insumo</th>
                          <th className="text-right px-3 py-2 w-16">Qtd</th>
                          <th className={`text-right px-3 py-2 w-32 ${abcValColor2}`}>{abcColLabel2}</th>
                          <th className="text-right pr-4 py-2 w-16">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catComAbc.map(c => {
                          const isOpen = expandedCats.has(c.tipo);
                          const insDosCat = [...insumos]
                            .filter((i: any) => (i.tipo || "Sem categoria") === c.tipo)
                            .sort((a: any, b: any) => n(b.custoTotal) - n(a.custoTotal));
                          return (
                            <React.Fragment key={c.tipo}>
                              <tr
                                className="border-b hover:bg-muted/40 cursor-pointer select-none"
                                onClick={() => setExpandedCats(prev => {
                                  const next = new Set(prev);
                                  isOpen ? next.delete(c.tipo) : next.add(c.tipo);
                                  return next;
                                })}
                              >
                                <td className="pl-4 py-2">
                                  <span className={`inline-block w-5 h-5 rounded text-center font-bold leading-5 text-white text-xs
                                    ${c.cls === "A" ? "bg-green-600" : c.cls === "B" ? "bg-amber-500" : "bg-zinc-400"}`}>
                                    {c.cls}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-semibold">
                                  <div className="flex items-center gap-1">
                                    {isOpen
                                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                    {c.tipo}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{c.qtd}</td>
                                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${abcValColor2}`}>
                                  {formatBRL(c.custo * abcFactor2)}
                                </td>
                                <td className="pr-4 py-2 text-right text-muted-foreground tabular-nums">
                                  {(c.pct * 100).toFixed(2)}%
                                </td>
                              </tr>
                              {isOpen && insDosCat.map((ins: any) => {
                                const insPct = totalGeral > 0 ? (n(ins.custoTotal) / totalGeral) * 100 : 0;
                                return (
                                  <tr key={ins.id} className="border-b bg-muted/20 hover:bg-muted/40">
                                    <td className="pl-4 py-1.5">
                                      <span className={`inline-block w-4 h-4 rounded text-center font-bold leading-4 text-white text-[10px]
                                        ${ins.curvaAbc === "A" ? "bg-green-500" : ins.curvaAbc === "B" ? "bg-amber-400" : "bg-zinc-300"}`}>
                                        {ins.curvaAbc}
                                      </span>
                                    </td>
                                    <td className="pl-8 pr-3 py-1.5 text-muted-foreground max-w-xs truncate">{ins.descricao}</td>
                                    <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                                      {n(ins.quantidadeTotal).toFixed(2)} {ins.unidade}
                                    </td>
                                    <td className={`px-3 py-1.5 text-right tabular-nums ${abcValColor2}`}>
                                      {formatBRL(n(ins.custoTotal) * abcFactor2)}
                                    </td>
                                    <td className="pr-4 py-1.5 text-right text-muted-foreground tabular-nums">
                                      {insPct.toFixed(2)}%
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })()}
        </Tabs>}

        {/* ════════════════════════════════════════════════════════════
            ABA BDI — sub-abas por planilha importada
        ════════════════════════════════════════════════════════════ */}
        {activePage === "bdi" && (
          <BdiView
            orcamentoId={id}
            bdiPct={n(orc.bdiPercentual)}
            aplicarBdiMutation={aplicarBdiMutation}
            onImportarBdi={() => setBdiUploadOpen(true)}
          />
        )}

      </div>

      {/* ── Dialog Upload BDI ── */}
      <Dialog open={bdiUploadOpen} onOpenChange={open => { if (!importarBdiMutation.isPending) { setBdiUploadOpen(open); if (!open) setBdiUploadFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-blue-600" />
              Importar Planilha BDI
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione a planilha BDI (.xlsx / .xlsm). Todas as abas serão importadas:
              <strong className="text-slate-700"> BDI, Indiretos, F.D., Adm Central, Despesas Financeiras, Tributos Fiscais, Taxa de Comercialização</strong>.
            </p>
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                bdiUploadFile ? "border-blue-400 bg-blue-50" : "border-border hover:border-blue-400 hover:bg-blue-50/30"
              }`}
              onClick={() => bdiFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) setBdiUploadFile(f);
              }}
            >
              <input
                ref={bdiFileRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,.xlsb"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setBdiUploadFile(f); }}
              />
              {bdiUploadFile ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                  <p className="text-sm font-semibold text-blue-700">{bdiUploadFile.name}</p>
                  <Button size="sm" variant="ghost" className="text-xs text-muted-foreground"
                    onClick={e => { e.stopPropagation(); setBdiUploadFile(null); }}>
                    <X className="h-3 w-3 mr-1" /> Trocar arquivo
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Clique ou arraste a planilha aqui</p>
                  <p className="text-xs text-muted-foreground">.xlsx, .xls ou .xlsm</p>
                </div>
              )}
            </div>
            {importarBdiMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Importando planilha BDI...
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBdiUploadOpen(false)} disabled={importarBdiMutation.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={!bdiUploadFile || importarBdiMutation.isPending}
              onClick={confirmarUploadBdi}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {importarBdiMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</>
                : <><UploadCloud className="h-4 w-4" /> Confirmar Import</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog re-upload de planilha ── */}
      <Dialog open={reuploadOpen} onOpenChange={open => { if (!reimportarMutation.isPending) setReuploadOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600" />
              Atualizar Planilha do Orçamento
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-4">
            <p className="text-sm text-muted-foreground">
              Faça upload de uma nova versão da planilha. Os itens da EAP e insumos existentes serão
              <strong className="text-red-600"> substituídos</strong>. Os metadados do orçamento
              (código, cliente, BDI%) serão preservados.
            </p>

            {/* Zona de upload */}
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                reuploadFile ? "border-green-400 bg-green-50" : "border-border hover:border-primary hover:bg-muted/30"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) handleReuploadFile(f);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,.xlsb,.xltx,.xltm"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleReuploadFile(f); }}
              />
              {reuploadLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Analisando planilha...</p>
                </div>
              ) : reuploadFile && reuploadAnalise ? (
                <div className="flex flex-col items-center gap-2">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <p className="text-sm font-semibold text-green-700">{reuploadAnalise.arquivo}</p>
                  <p className="text-xs text-muted-foreground">
                    ~{reuploadAnalise.itens} linhas detectadas na aba Orçamento
                  </p>
                  <Button size="sm" variant="ghost" className="text-xs text-muted-foreground mt-1"
                    onClick={e => { e.stopPropagation(); setReuploadFile(null); setReuploadAnalise(null); }}>
                    <X className="h-3 w-3 mr-1" /> Trocar arquivo
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Clique ou arraste a planilha aqui</p>
                  <p className="text-xs text-muted-foreground">.xlsx, .xls ou .xlsm com aba "Orçamento"</p>
                </div>
              )}
            </div>

            {/* Aviso */}
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Esta ação <strong>substitui todos os itens</strong> do orçamento. O BDI e insumos da nova planilha
                serão usados se disponíveis; caso contrário, o BDI atual ({bdiPct.toFixed(2)}%) é mantido.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReuploadOpen(false)}
              disabled={reimportarMutation.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={!reuploadFile || !reuploadAnalise || reimportarMutation.isPending}
              onClick={confirmarReupload}
              className="gap-2"
            >
              {reimportarMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Atualizando...</>
                : <><RefreshCw className="h-4 w-4" /> Confirmar Atualização</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Enviar para Biblioteca ── */}
      <Dialog open={bibOpen} onOpenChange={open => { if (!enviarMutation.isPending) { setBibOpen(open); if (!open) setBibLoaded(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-600" />
              Atualizar Base do Sistema
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Os preços e composições deste orçamento serão enviados para a base central da empresa.
              Itens novos serão cadastrados e os existentes terão seus preços médios recalculados.
              Os valores dentro deste orçamento permanecem isolados — a base só é atualizada ao confirmar.
            </p>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {previewQuery.isLoading && (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Analisando itens do orçamento...
              </div>
            )}

            {previewQuery.isError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 shrink-0" /> {previewQuery.error.message}
              </div>
            )}

            {previewQuery.data && (() => {
              const { composicoes, insumos } = previewQuery.data as any;
              const novas   = (composicoes || []).filter((c: any) => c.status === "novo");
              const atualizadas = (composicoes || []).filter((c: any) => c.status === "atualizado");
              const similares   = (composicoes || []).filter((c: any) => c.status === "similar");
              const insNovos    = (insumos || []).filter((i: any) => i.status === "novo");
              const insAtualizados = (insumos || []).filter((i: any) => i.status === "atualizado");
              return (
                <div className="space-y-4">
                  {/* Resumo */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-green-50 border border-green-200 p-2">
                      <p className="text-lg font-bold text-green-700">{novas.length + insNovos.length}</p>
                      <p className="text-xs text-green-600">Novos</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-2">
                      <p className="text-lg font-bold text-blue-700">{atualizadas.length + insAtualizados.length}</p>
                      <p className="text-xs text-blue-600">Atualizados</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                      <p className="text-lg font-bold text-amber-700">{similares.length}</p>
                      <p className="text-xs text-amber-600">Similares (não enviados)</p>
                    </div>
                  </div>

                  {/* Composições */}
                  {(composicoes || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                        Composições ({(composicoes || []).length})
                      </p>
                      <div className="divide-y rounded-lg border text-sm overflow-hidden">
                        {(composicoes as any[]).map((c: any, i: number) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/40">
                            <span className="truncate max-w-[380px]">{c.codigo} — {c.descricao}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                              c.status === "novo"        ? "bg-green-100 text-green-700" :
                              c.status === "atualizado"  ? "bg-blue-100 text-blue-700"  :
                              "bg-amber-100 text-amber-700"
                            }`}>{c.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Insumos */}
                  {(insumos || []).filter((i: any) => i.status !== "similar").length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                        Insumos ({(insumos as any[]).filter((i: any) => i.status !== "similar").length})
                      </p>
                      <div className="divide-y rounded-lg border text-sm overflow-hidden">
                        {(insumos as any[]).filter((i: any) => i.status !== "similar").map((ins: any, i: number) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/40">
                            <span className="truncate max-w-[380px]">{ins.codigo} — {ins.descricao}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                              ins.status === "novo" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                            }`}>{ins.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(composicoes || []).length === 0 && (insumos || []).length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      Nenhum item novo ou atualizado para enviar.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setBibOpen(false); setBibLoaded(false); }}
              disabled={enviarMutation.isPending}>
              Cancelar
            </Button>
            <Button
              disabled={
                previewQuery.isLoading ||
                !previewQuery.data ||
                enviarMutation.isPending ||
                ((previewQuery.data as any)?.composicoes?.filter((c: any) => c.status !== "similar").length === 0 &&
                 (previewQuery.data as any)?.insumos?.filter((i: any) => i.status !== "similar").length === 0)
              }
              onClick={() => enviarMutation.mutate({ orcamentoId: id, companyId: bibCompanyId })}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {enviarMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                : <><BookOpen className="h-4 w-4" /> Confirmar Envio</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
