import { useState, useEffect, useRef } from "react";
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
  UploadCloud, RefreshCw, FileSpreadsheet, X,
} from "lucide-react";
import { toast } from "sonner";
import { useCompany } from "@/contexts/CompanyContext";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function n(v: string | null | undefined) {
  return parseFloat(v || "0");
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

  const [versao, setVersao]         = useState<Versao>("custo");
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const [localMetaPerc, setLocalMetaPerc] = useState(20);
  const [metaInput, setMetaInput]   = useState("20");
  const [savingMeta, setSavingMeta] = useState(false);

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
        companyId:   (company as any)?.id ?? 0,
        fileBase64:  b64,
        fileName:    reuploadFile.name,
        userName:    (user as any)?.username || (user as any)?.name || "sistema",
      });
    };
    reader.readAsDataURL(reuploadFile);
  };

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

  const totalVenda = n(orc.totalVenda);
  const totalCusto = n(orc.totalCusto);
  const totalMeta  = n(orc.totalMeta);

  const childMap: Record<string, boolean> = {};
  itens.forEach((item, idx) => {
    if (idx + 1 < itens.length && itens[idx + 1].nivel > item.nivel) {
      childMap[item.eapCodigo] = true;
    }
  });

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
          {/* Botão atualizar planilha */}
          <Button size="sm" variant="outline" className="gap-2 shrink-0"
            onClick={() => { setReuploadOpen(true); setReuploadFile(null); setReuploadAnalise(null); }}>
            <RefreshCw className="h-4 w-4" /> Atualizar Planilha
          </Button>
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
            {/* Campo inline de percentual */}
            <div className="px-3 pb-3 flex items-center gap-2">
              <Input
                type="number" min={1} max={99}
                value={metaInput}
                onChange={e => {
                  setMetaInput(e.target.value);
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 1 && v <= 99) setLocalMetaPerc(v);
                }}
                className="h-7 text-sm w-20 text-right font-semibold text-purple-700"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 ml-auto text-purple-600 hover:text-purple-800"
                disabled={savingMeta || updateMetaMutation.isPending}
                onClick={() => {
                  setSavingMeta(true);
                  updateMetaMutation.mutate({ id, metaPercentual: localMetaPerc / 100 });
                }}
              >
                {savingMeta
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Save className="h-3 w-3" />}
              </Button>
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

        <Tabs defaultValue="eap">
          <TabsList>
            <TabsTrigger value="eap">EAP</TabsTrigger>
            <TabsTrigger value="insumos">
              Insumos {insumos.length > 0 && `(${insumos.length})`}
            </TabsTrigger>
            <TabsTrigger value="bdi">BDI</TabsTrigger>
            {insumos.length > 0 && <TabsTrigger value="abc">Curva ABC</TabsTrigger>}
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

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs min-w-[1100px]">
                  <thead>
                    <tr className="bg-slate-700 text-white text-[11px] sticky top-0 z-20">
                      <th className="text-left px-3 py-2 w-36 sticky left-0 bg-slate-700">Item</th>
                      <th className="text-left px-3 py-2 min-w-[200px]">Descrição</th>
                      <th className="text-center px-2 py-2 w-16">Unidade</th>
                      <th className="text-right px-3 py-2 w-24">Quantidade</th>
                      <th className="text-right px-3 py-2 w-28 text-blue-200">
                        Preço Unit.<br/>Material
                      </th>
                      <th className="text-right px-3 py-2 w-28 text-orange-200">
                        Preço Unit.<br/>MO
                      </th>
                      <th className="text-right px-3 py-2 w-28 text-blue-200">
                        Preço Total<br/>Material
                      </th>
                      <th className="text-right px-3 py-2 w-28 text-orange-200">
                        Preço total<br/>MO
                      </th>
                      <th className={`text-right px-3 py-2 w-32 font-bold ${cfg.thClass}`}>
                        {cfg.label}
                      </th>
                      <th className="text-right px-2 py-2 w-16">ABC Serv</th>
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
                      const ptMat   = n(item.custoTotalMat);
                      const ptMdo   = n(item.custoTotalMdo);

                      const totalVal = versao === "venda"
                        ? n(item.vendaTotal)
                        : versao === "meta"
                          ? n(item.custoTotal) * (1 - localMetaPerc / 100)
                          : n(item.custoTotal);

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
                          <td className="px-3 py-1.5">
                            <span className={item.nivel <= 2 ? "uppercase tracking-wide text-[11px] font-semibold" : "text-[11px]"}>
                              {item.descricao}
                            </span>
                          </td>

                          {/* Unidade */}
                          <td className="px-2 py-1.5 text-center text-muted-foreground">
                            {isLeaf ? item.unidade : ""}
                          </td>

                          {/* Quantidade */}
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                            {isLeaf && qty > 0
                              ? qty.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : ""}
                          </td>

                          {/* Preço Unit. Material */}
                          <td className="px-3 py-1.5 text-right text-blue-600 tabular-nums">
                            {isLeaf && puMat > 0 ? formatBRL(puMat) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Preço Unit. MO */}
                          <td className="px-3 py-1.5 text-right text-orange-500 tabular-nums">
                            {isLeaf && puMdo > 0 ? formatBRL(puMdo) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Preço Total Material */}
                          <td className="px-3 py-1.5 text-right text-blue-600 font-medium tabular-nums">
                            {ptMat > 0 ? formatBRL(ptMat) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Preço Total MO */}
                          <td className="px-3 py-1.5 text-right text-orange-500 font-medium tabular-nums">
                            {ptMdo > 0 ? formatBRL(ptMdo) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Custo / Venda / Meta */}
                          <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${cfg.valueClass}`}>
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

          {/* ═══ ABA BDI ═══════════════════════════════════════════════ */}
          <TabsContent value="bdi" className="mt-3 space-y-4">
            {!orc.bdiLinhas?.length ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <p>Nenhum dado de BDI importado.</p>
                <p className="text-xs mt-1">Use a aba Importar para carregar a planilha de BDI.</p>
              </div>
            ) : (() => {
              // Agrupar por aba
              const grupos: Record<string, any[]> = {};
              for (const b of orc.bdiLinhas) {
                const aba = b.nomeAba || "BDI";
                if (!grupos[aba]) grupos[aba] = [];
                grupos[aba].push(b);
              }

              return (
                <>
                  {/* ── Card de controle do BDI total ── */}
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-xs text-muted-foreground uppercase font-medium mb-1">BDI Total (B-02)</p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" step="0.01" min={0} max={200}
                          value={(localBdiPct * 100).toFixed(4)}
                          onChange={e => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v)) setLocalBdiPct(v / 100);
                          }}
                          className="h-9 w-36 text-right font-bold text-amber-700 text-base border-amber-300"
                        />
                        <span className="text-lg font-bold text-amber-700">%</span>
                        <p className="text-xs text-muted-foreground ml-2">
                          Venda = Custo × {(1 + localBdiPct).toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <p className="text-xs text-muted-foreground">
                        Total Venda estimado:{" "}
                        <strong className="text-green-700">{formatBRL(totalCusto * (1 + localBdiPct))}</strong>
                      </p>
                      <Button
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                        disabled={aplicarBdiMutation.isPending}
                        onClick={() => aplicarBdiMutation.mutate({ orcamentoId: id, bdiPercentual: localBdiPct })}
                      >
                        {aplicarBdiMutation.isPending
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Save className="h-4 w-4" />}
                        Aplicar BDI ao Orçamento
                      </Button>
                    </div>
                  </div>

                  {/* ── Tabelas por aba ── */}
                  {Object.entries(grupos).map(([aba, linhas]) => (
                    <Card key={aba} className="overflow-hidden">
                      <div className="px-4 py-2 bg-slate-700 text-white text-xs font-semibold uppercase tracking-wider">
                        {aba}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[500px]">
                          <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground">
                              <th className="text-left pl-4 py-2 w-24">Código</th>
                              <th className="text-left px-3 py-2">Descrição</th>
                              <th className="text-right px-3 py-2 w-40">Percentual (%)</th>
                              <th className="text-right pr-4 py-2 w-28">Valor Abs.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linhas.map((b: any) => {
                              const editKey      = b.id;
                              const rawPct       = n(b.percentual);
                              const displayVal   = bdiEdits[editKey] ?? (rawPct * 100).toFixed(4);
                              const isB02        = /^b-?02$/i.test(b.codigo || "");

                              return (
                                <tr key={b.id}
                                  className={`border-b hover:bg-muted/20 transition-colors ${isB02 ? "bg-amber-50 font-bold" : ""}`}>
                                  <td className={`pl-4 py-1.5 font-mono ${isB02 ? "text-amber-700" : "text-muted-foreground"}`}>
                                    {b.codigo}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span className={isB02 ? "text-amber-800" : ""}>{b.descricao}</span>
                                  </td>
                                  <td className="px-3 py-1.5 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Input
                                        type="number" step="0.0001"
                                        value={displayVal}
                                        onChange={e => setBdiEdits(prev => ({ ...prev, [editKey]: e.target.value }))}
                                        onBlur={e => {
                                          const v = parseFloat(e.target.value);
                                          if (!isNaN(v)) {
                                            const dec = v / 100;
                                            updateBdiMutation.mutate({ id: b.id, percentual: dec });
                                            if (isB02) setLocalBdiPct(dec);
                                          }
                                        }}
                                        className={`h-6 w-28 text-right text-xs ${isB02 ? "border-amber-400 font-bold text-amber-700" : ""}`}
                                      />
                                      <span className="text-muted-foreground text-[10px]">%</span>
                                    </div>
                                  </td>
                                  <td className="pr-4 py-1.5 text-right text-muted-foreground tabular-nums">
                                    {n(b.valorAbsoluto) !== 0 ? formatBRL(n(b.valorAbsoluto)) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  ))}
                </>
              );
            })()}
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
                      {insumos.map((ins: any) => (
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
                accept=".xlsx,.xls"
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
                  <p className="text-xs text-muted-foreground">.xlsx ou .xls com aba "Orçamento"</p>
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

    </DashboardLayout>
  );
}
