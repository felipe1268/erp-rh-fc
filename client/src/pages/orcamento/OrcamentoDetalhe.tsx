import React, { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ChevronDown, ChevronRight, DollarSign, TrendingDown, Target,
  ArrowLeft, Loader2, Package, CheckCircle2, AlertCircle, Save,
  UploadCloud, RefreshCw, FileSpreadsheet, X, Printer, BookOpen, Wrench,
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

  const [activeTab, setActiveTab]   = useState<string>("eap");
  const [versao, setVersao]         = useState<Versao>("custo");
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const [localMetaPerc, setLocalMetaPerc] = useState(20);
  const [metaInput, setMetaInput]   = useState("20");
  const [metaValInput, setMetaValInput] = useState(""); // input R$ — vazio = usa valor calculado
  const [savingMeta, setSavingMeta] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = trpc.orcamento.getById.useQuery(
    { id },
    { enabled: id > 0 }
  );

  const updateMetaMutation = trpc.orcamento.updateMeta.useMutation({
    onSuccess: () => {
      toast.success("Meta atualizada!");
      setSavingMeta(false);
      refetch();
    },
    onError: e => { toast.error(e.message || "Erro ao salvar meta"); setSavingMeta(false); },
  });

  // Re-upload (atualizar planilha)
  const [reuploadOpen, setReuploadOpen] = useState(false);
  const [reuploadFile, setReuploadFile] = useState<File | null>(null);
  const [reuploadAnalise, setReuploadAnalise] = useState<{ itens: number; arquivo: string } | null>(null);
  const [reuploadLoading, setReuploadLoading] = useState(false);

  const reimportarMutation = trpc.orcamento.reimportar.useMutation({
    onSuccess: (res) => {
      toast.success(`Orçamento atualizado! ${res.itemCount} itens reimportados.`);
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

  const enviarMutation = trpc.orcamento.enviarParaBiblioteca.useMutation({
    onSuccess: res => {
      toast.success(`Biblioteca atualizada! ${res.composicoes} composições e ${res.insumos} insumos enviados.`);
      setBibOpen(false);
      setBibLoaded(false);
    },
    onError: e => toast.error(e.message || "Erro ao enviar para biblioteca"),
  });

  // BDI edição local
  const [bdiEdits, setBdiEdits]       = useState<Record<number, string>>({});
  const [localBdiPct, setLocalBdiPct] = useState(0);   // decimal: 0.2456

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

  useEffect(() => {
    if (data) {
      const pct = Math.round(parseFloat((data as any).metaPercentual || "0") * 100);
      setLocalMetaPerc(pct);
      setMetaInput(String(pct));
      setLocalBdiPct(parseFloat((data as any).bdiPercentual || "0"));
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
      mat   = r2(mat   + r2(n(child.custoTotalMat)));
      mdo   = r2(mdo   + r2(n(child.custoTotalMdo)));
      custo = r2(custo + r2(n(child.custoTotal)));
      venda = r2(venda + r2(n(child.vendaTotal)));
    });
    groupTotals[item.eapCodigo] = { mat, mdo, custo, venda };
  });

  // ── Totais: soma apenas itens FOLHA (sem filhos) — são eles que têm os valores reais da planilha ──
  // Grupos intermediários têm valores calculados/agregados que podem divergir; folhas são a fonte de verdade.
  const leafItems = itens.filter((i: OrcItem) => !childMap[i.eapCodigo]);
  const calcMat   = r2(leafItems.reduce((s, i) => r2(s + r2(n(i.custoTotalMat))), 0));
  const calcMdo   = r2(leafItems.reduce((s, i) => r2(s + r2(n(i.custoTotalMdo))), 0));
  const calcCusto = r2(leafItems.reduce((s, i) => r2(s + r2(n(i.custoTotal))),    0));
  const calcVenda = r2(leafItems.reduce((s, i) => r2(s + r2(n(i.vendaTotal))),    0));

  const totalCusto = r2(calcCusto || n(orc.totalCusto));
  const totalVenda = r2(calcVenda || n(orc.totalVenda));
  const totalMeta  = r2(n(orc.totalMeta) || r2(totalCusto * (1 - metaPct / 100)));
  const totalMat   = calcMat;
  const totalMdo   = calcMdo;

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
            onClick={() => setActiveTab("eap")}
            className={`px-5 py-2 text-sm font-bold rounded-md transition-all ${
              activeTab === "eap"
                ? "bg-orange-500 text-white shadow"
                : "bg-muted text-muted-foreground hover:bg-orange-100 hover:text-orange-700"
            }`}
          >
            ORÇAMENTO
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
              onClick={() => { setBibOpen(true); setBibLoaded(true); }}>
              <BookOpen className="h-4 w-4" /> Biblioteca
            </Button>
          </div>
        </div>

        {/* ── Cards de versão: Meta | Custo | Venda ── */}
        <div className="grid grid-cols-3 gap-3 mb-5">

          {/* CARD META (esquerda) */}
          <div className={`rounded-xl border-2 transition-all ${
            versao === "meta" ? "border-purple-500 bg-purple-50" : "border-border bg-card"
          }`}>
            <button className="w-full text-left p-4 pb-2" onClick={() => setVersao("meta")}>
              <div className="flex items-center gap-2 mb-1">
                <Target className={`h-4 w-4 ${versao === "meta" ? "text-purple-600" : "text-muted-foreground"}`} />
                <span className="text-xs text-muted-foreground font-medium uppercase">Meta</span>
                {versao === "meta" && <CheckCircle2 className="h-3 w-3 ml-auto text-purple-600" />}
              </div>
              <p className={`text-base font-bold ${versao === "meta" ? "text-purple-700" : "text-foreground"}`}>
                {formatBRL(totalCusto * (1 - localMetaPerc / 100))}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">−{localMetaPerc}% do custo</p>
            </button>
            {/* Campos bidireccionais: % ↔ R$ */}
            <div className="px-3 pb-3 space-y-1.5">
              {/* Linha %  */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-4 shrink-0">%</span>
                <Input
                  type="number" min={0} max={99} step={0.01}
                  value={metaInput}
                  onChange={e => {
                    const str = e.target.value;
                    setMetaInput(str);
                    setMetaValInput(""); // limpa R$ para mostrar valor calculado
                    const v = parseFloat(str);
                    if (!isNaN(v) && v >= 0 && v < 100) setLocalMetaPerc(v);
                  }}
                  className="h-7 text-sm text-right font-semibold text-purple-700"
                />
              </div>
              {/* Linha R$ */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground w-4 shrink-0">R$</span>
                <Input
                  type="number" min={0} step={0.01}
                  value={metaValInput !== "" ? metaValInput : r2(totalCusto * (1 - localMetaPerc / 100))}
                  onChange={e => {
                    const str = e.target.value;
                    setMetaValInput(str);
                    const val = parseFloat(str);
                    if (!isNaN(val) && val > 0 && totalCusto > 0) {
                      const pct = r2((1 - val / totalCusto) * 100);
                      if (pct >= 0 && pct < 100) {
                        setLocalMetaPerc(pct);
                        setMetaInput(String(pct));
                      }
                    }
                  }}
                  className="h-7 text-sm text-right font-semibold text-purple-700"
                />
              </div>
              {/* Salvar */}
              <div className="flex justify-end pt-0.5">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-purple-600 hover:text-purple-800 text-xs gap-1"
                  disabled={savingMeta || updateMetaMutation.isPending}
                  onClick={() => {
                    setSavingMeta(true);
                    updateMetaMutation.mutate({ id, metaPercentual: localMetaPerc / 100 });
                  }}
                >
                  {savingMeta
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Save className="h-3 w-3" />}
                  Salvar
                </Button>
              </div>
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
          <button onClick={() => setVersao("venda")}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              versao === "venda" ? "border-green-500 bg-green-50" : "border-border bg-card hover:bg-muted/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className={`h-4 w-4 ${versao === "venda" ? "text-green-600" : "text-muted-foreground"}`} />
              <span className="text-xs text-muted-foreground font-medium uppercase">Venda</span>
              {versao === "venda" && <CheckCircle2 className="h-3 w-3 ml-auto text-green-600" />}
            </div>
            <p className={`text-base font-bold ${versao === "venda" ? "text-green-700" : "text-foreground"}`}>
              {formatBRL(totalVenda)}
            </p>
            {bdiPct > 0
              ? <p className="text-xs text-muted-foreground mt-0.5">BDI {bdiPct.toFixed(2)}%</p>
              : <p className="text-xs text-muted-foreground mt-0.5">BDI não importado</p>}
          </button>

        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="eap">EAP</TabsTrigger>
            <TabsTrigger value="insumos">
              Insumos {insumos.length > 0 && `(${insumos.length})`}
            </TabsTrigger>
            <TabsTrigger value="composicoes">
              Composições {leafItems.length > 0 && `(${leafItems.length})`}
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
                    versao === "venda" ? totalVenda :
                    versao === "meta"  ? totalMeta  : totalCusto
                  )}</p>
                </div>
                {versao === "venda" && totalCusto > 0 && (
                  <div className="text-[10px] text-emerald-500 font-medium">
                    BDI {bdiPct.toFixed(1)}%
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
            {leafItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Wrench className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm">Nenhuma composição encontrada.</p>
              </div>
            ) : (
              <Card>
                <CardContent className="py-3 px-0 overflow-x-auto">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead>
                      <tr className="border-b bg-muted/50 text-muted-foreground">
                        <th className="text-left pl-4 py-2 w-28">Código EAP</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-left px-3 py-2 w-12">Un</th>
                        <th className="text-right px-3 py-2 w-20">Qtd</th>
                        <th className="text-right px-3 py-2 w-28">Mat</th>
                        <th className="text-right px-3 py-2 w-28">MO</th>
                        <th className="text-right px-3 py-2 w-28">Custo Total</th>
                        <th className="text-right pr-4 py-2 w-14">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...leafItems].sort((a, b) => n(b.custoTotal) - n(a.custoTotal)).map(item => {
                        const pct = totalCusto > 0 ? (n(item.custoTotal) / totalCusto) * 100 : 0;
                        return (
                          <tr key={item.id} className="border-b hover:bg-muted/30">
                            <td className="pl-4 py-1.5 font-mono text-muted-foreground">{item.eapCodigo}</td>
                            <td className="px-3 py-1.5 max-w-xs truncate">{item.descricao}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{item.unidade}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                              {n(item.quantidade).toFixed(2)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">
                              {formatBRL(n(item.custoTotalMat))}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-purple-700">
                              {formatBRL(n(item.custoTotalMdo))}
                            </td>
                            <td className="px-3 py-1.5 text-right font-medium text-amber-600 tabular-nums">
                              {formatBRL(n(item.custoTotal))}
                            </td>
                            <td className="pr-4 py-1.5 text-right text-muted-foreground tabular-nums">
                              {pct.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ═══ ABA CURVA ABC ═════════════════════════════════════════ */}
          {insumos.length > 0 && (
            <TabsContent value="abc" className="mt-3">
              <div className="grid grid-cols-3 gap-3 mb-4">
                {(["A", "B", "C"] as const).map(cls => {
                  const ct = insumos.filter((i: any) => i.curvaAbc === cls);
                  const cv = ct.reduce((s: number, i: any) => s + n(i.custoTotal), 0);
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
                        <th className="text-right px-3 py-2 w-28">Custo Total</th>
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
                          <td className="px-3 py-1.5 text-right font-medium text-amber-600 tabular-nums">
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
            </TabsContent>
          )}

          {/* ═══ ABA CURVA ABC POR CATEGORIA ════════════════════════════ */}
          {insumos.length > 0 && (() => {
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
                    const total = group.reduce((s, c) => s + c.custo, 0);
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
                          <th className="text-right px-3 py-2 w-32">Custo Total</th>
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
                                <td className="px-3 py-2 text-right font-semibold text-amber-600 tabular-nums">
                                  {formatBRL(c.custo)}
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
                                    <td className="px-3 py-1.5 text-right text-amber-600 tabular-nums">
                                      {formatBRL(n(ins.custoTotal))}
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
        </Tabs>

      </div>

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
              Enviar para Biblioteca
            </DialogTitle>
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
