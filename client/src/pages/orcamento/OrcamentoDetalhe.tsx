import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  ChevronDown, ChevronRight, DollarSign, TrendingDown, Target,
  ArrowLeft, Settings, Loader2, Package, CheckCircle2, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import OrcamentistaWidget from "./OrcamentistaWidget";

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
  const id = parseInt(params?.id ?? "0");

  const [versao, setVersao]           = useState<Versao>("custo");
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set());
  const [metaDialog, setMetaDialog]   = useState(false);
  const [novaMetaPerc, setNovaMetaPerc] = useState(20);

  const { data, isLoading, refetch } = trpc.orcamento.getById.useQuery(
    { id },
    { enabled: id > 0 }
  );

  const updateMetaMutation = trpc.orcamento.updateMeta.useMutation({
    onSuccess: () => {
      toast.success("Meta atualizada com sucesso!");
      setMetaDialog(false);
      refetch();
    },
    onError: e => toast.error(e.message || "Erro ao atualizar meta"),
  });

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

  const isAdminMaster = (user as any)?.role === "admin_master";
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
          {isAdminMaster && (
            <Button size="sm" variant="outline" className="gap-2 shrink-0"
              onClick={() => { setNovaMetaPerc(metaPct); setMetaDialog(true); }}>
              <Settings className="h-4 w-4" /> Ajustar Meta
            </Button>
          )}
        </div>

        {/* ── Cards de versão ── */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {(["custo", "venda", "meta"] as Versao[]).map(v => {
            const c = VERSAO_CONFIG[v];
            const totais: Record<Versao, number> = { custo: totalCusto, venda: totalVenda, meta: totalMeta };
            return (
              <button key={v} onClick={() => setVersao(v)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${
                  versao === v ? c.activeClass : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <c.icon className={`h-4 w-4 ${versao === v ? c.valueClass : "text-muted-foreground"}`} />
                  <span className="text-xs text-muted-foreground font-medium uppercase">{c.label}</span>
                  {versao === v && <CheckCircle2 className={`h-3 w-3 ml-auto ${c.valueClass}`} />}
                </div>
                <p className={`text-base font-bold ${versao === v ? c.valueClass : "text-foreground"}`}>
                  {formatBRL(totais[v])}
                </p>
                {v === "meta"  && <p className="text-xs text-muted-foreground mt-0.5">−{metaPct.toFixed(0)}% do custo</p>}
                {v === "venda" && bdiPct > 0 && <p className="text-xs text-muted-foreground mt-0.5">BDI {bdiPct.toFixed(2)}%</p>}
              </button>
            );
          })}
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">
                {itens.length} itens · exibindo{" "}
                <span className={`${cfg.valueClass} font-semibold`}>{cfg.label}</span>
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground"
                  onClick={() => setCollapsed(new Set(itens.filter(i => childMap[i.eapCodigo]).map(i => i.eapCodigo)))}>
                  Recolher tudo
                </Button>
                <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground"
                  onClick={() => setCollapsed(new Set())}>
                  Expandir tudo
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs min-w-[960px]">
                  <thead>
                    <tr className="bg-slate-700 text-white text-[11px] sticky top-0 z-20">
                      <th className="text-left px-3 py-2 w-36 sticky left-0 bg-slate-700">Item</th>
                      <th className="text-left px-3 py-2 min-w-[200px]">Descrição</th>
                      <th className="text-center px-2 py-2 w-12">Un</th>
                      <th className="text-right px-3 py-2 w-24">Quantidade</th>
                      <th className="text-right px-3 py-2 w-28 text-blue-200">Pu. Material</th>
                      <th className="text-right px-3 py-2 w-28 text-orange-200">Pu. MO</th>
                      <th className="text-right px-3 py-2 w-28 text-blue-200">Pt. Material</th>
                      <th className="text-right px-3 py-2 w-28 text-orange-200">Pt. MO</th>
                      <th className={`text-right px-3 py-2 w-32 font-bold ${cfg.thClass}`}>
                        {cfg.label}
                      </th>
                      <th className="text-right px-2 py-2 w-14">ABC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map(item => {
                      const isGroup  = !!childMap[item.eapCodigo];
                      const isLeaf   = !isGroup;
                      const indent   = Math.max(0, item.nivel - 1) * 14;
                      const rowBg    = NIVEL_BG[item.nivel] ?? "bg-white";

                      const puMat  = n(item.custoUnitMat);
                      const puMdo  = n(item.custoUnitMdo);
                      const ptMat  = n(item.custoTotalMat);
                      const ptMdo  = n(item.custoTotalMdo);
                      const qty    = n(item.quantidade);

                      const totalVal = versao === "venda"
                        ? n(item.vendaTotal)
                        : versao === "meta"
                          ? n(item.metaTotal)
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
                            <span className={item.nivel <= 2 ? "uppercase tracking-wide text-[11px]" : "text-[11px]"}>
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

                          {/* Pu. Material */}
                          <td className="px-3 py-1.5 text-right text-blue-600 tabular-nums">
                            {isLeaf && puMat > 0 ? formatBRL(puMat) : ""}
                          </td>

                          {/* Pu. MO */}
                          <td className="px-3 py-1.5 text-right text-orange-500 tabular-nums">
                            {isLeaf && puMdo > 0 ? formatBRL(puMdo) : ""}
                          </td>

                          {/* Pt. Material */}
                          <td className="px-3 py-1.5 text-right text-blue-600 font-medium tabular-nums">
                            {ptMat > 0 ? formatBRL(ptMat) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Pt. MO */}
                          <td className="px-3 py-1.5 text-right text-orange-500 font-medium tabular-nums">
                            {ptMdo > 0 ? formatBRL(ptMdo) : <span className="text-slate-300">—</span>}
                          </td>

                          {/* Total da versão selecionada */}
                          <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${cfg.valueClass}`}>
                            {formatBRL(totalVal)}
                          </td>

                          {/* ABC % */}
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
                Nenhuma linha de BDI extraída.
              </div>
            ) : (() => {
              const grupos: Record<string, any[]> = {};
              for (const b of orc.bdiLinhas) {
                const aba = b.nomeAba || "BDI";
                if (!grupos[aba]) grupos[aba] = [];
                grupos[aba].push(b);
              }
              return Object.entries(grupos).map(([aba, linhas]) => (
                <Card key={aba}>
                  <CardHeader className="pb-2 pt-3">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      {aba}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 px-0 overflow-x-auto">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="border-b bg-muted/30 text-muted-foreground">
                          <th className="text-left pl-4 py-1.5 w-20">Código</th>
                          <th className="text-left px-3 py-1.5">Descrição</th>
                          <th className="text-right px-3 py-1.5 w-28">Valor (%)</th>
                          <th className="text-right px-3 py-1.5 w-28">Encargos</th>
                          <th className="text-right pr-4 py-1.5 w-28">BDI (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((b: any, i: number) => (
                          <tr key={i} className="border-b hover:bg-muted/20">
                            <td className="pl-4 py-1 font-mono text-muted-foreground">{b.codigo}</td>
                            <td className="px-3 py-1 max-w-xs truncate">{b.descricao}</td>
                            <td className="px-3 py-1 text-right tabular-nums">
                              {n(b.valorPercentual) > 0 ? `${(n(b.valorPercentual) * 100).toFixed(4)}%` : "—"}
                            </td>
                            <td className="px-3 py-1 text-right text-muted-foreground tabular-nums">
                              {n(b.encargos) > 0 ? `${(n(b.encargos) * 100).toFixed(4)}%` : "—"}
                            </td>
                            <td className={`pr-4 py-1 text-right font-semibold tabular-nums ${n(b.bdiPercentual) > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                              {n(b.bdiPercentual) > 0 ? `${(n(b.bdiPercentual) * 100).toFixed(2)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ));
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

        {/* ── Dialog ajustar meta ── */}
        <Dialog open={metaDialog} onOpenChange={setMetaDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajustar Percentual de Meta</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Meta calculada como: <strong>Custo × (1 − Meta%)</strong>.
                Atual: <strong>{metaPct.toFixed(0)}%</strong>.
              </p>
              <div className="flex items-center gap-4">
                <Slider min={0} max={50} step={1}
                  value={[novaMetaPerc]}
                  onValueChange={([v]) => setNovaMetaPerc(v)}
                  className="flex-1"
                />
                <span className="text-lg font-bold w-16 text-right">{novaMetaPerc}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Nova meta: {formatBRL(totalCusto * (1 - novaMetaPerc / 100))}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMetaDialog(false)}>Cancelar</Button>
              <Button
                onClick={() => updateMetaMutation.mutate({ id, metaPercentual: novaMetaPerc / 100 })}
                disabled={updateMetaMutation.isPending}
              >
                {updateMetaMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Meta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>

      {/* ── Widget IA ── */}
      <OrcamentistaWidget
        orcamentoId={id}
        orcamentoContext={{
          codigo:            orc.codigo,
          descricao:         orc.descricao,
          cliente:           orc.cliente,
          local:             orc.local,
          revisao:           orc.revisao,
          status:            orc.status,
          bdiPercentual:     n(orc.bdiPercentual),
          metaPercentual:    n(orc.metaPercentual),
          totalVenda,
          totalCusto,
          totalMeta,
          totalMateriais:    n(orc.totalMateriais),
          totalMdo:          n(orc.totalMdo),
          totalEquipamentos: n(orc.totalEquipamentos),
          itemCount:         itens.length,
          topItens: itens
            .filter(i => !childMap[i.eapCodigo])
            .sort((a, b) => n(b.custoTotal) - n(a.custoTotal))
            .slice(0, 20)
            .map(i => ({
              eapCodigo:       i.eapCodigo,
              descricao:       i.descricao,
              unidade:         i.unidade,
              quantidade:      n(i.quantidade),
              custoTotal:      n(i.custoTotal),
              vendaTotal:      n(i.vendaTotal),
              custoTotalMat:   n(i.custoTotalMat),
              custoTotalMdo:   n(i.custoTotalMdo),
              percentualCusto: totalCusto > 0 ? n(i.custoTotal) / totalCusto * 100 : 0,
            })),
          topInsumos: insumos.slice(0, 30).map(i => ({
            descricao:            i.descricao,
            tipo:                 i.tipo,
            unidade:              i.unidade,
            custoTotal:           n(i.custoTotal),
            quantidadeTotal:      n(i.quantidadeTotal),
            precoUnitComEncargos: n(i.precoUnitComEncargos),
            curvaAbc:             i.curvaAbc,
            percentualTotal:      n(i.percentualTotal),
          })),
        }}
      />

    </DashboardLayout>
  );
}
