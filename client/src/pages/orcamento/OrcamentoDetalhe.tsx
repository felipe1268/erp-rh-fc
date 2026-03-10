import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  ChevronDown, ChevronRight, DollarSign, TrendingDown, Target,
  ArrowLeft, Settings, Loader2, Package, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ──────────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────────
interface OrcItem {
  id: number; eapCodigo: string; nivel: number; tipo: string;
  descricao: string; unidade: string; quantidade: string;
  vendaTotal: string; custoTotal: string; metaTotal: string;
  custoTotalMat: string; custoTotalMdo: string; ordem: number;
}

type Versao = "venda" | "custo" | "meta";

const VERSAO_CONFIG: Record<Versao, {
  label: string; icon: typeof DollarSign;
  color: string; field: keyof OrcItem;
}> = {
  venda: { label: "Venda", icon: DollarSign,  color: "text-emerald-400", field: "vendaTotal" },
  custo: { label: "Custo", icon: TrendingDown, color: "text-amber-400",  field: "custoTotal" },
  meta:  { label: "Meta",  icon: Target,       color: "text-purple-400", field: "metaTotal"  },
};

const NIVEL_STYLE: Record<number, string> = {
  1: "font-bold text-white",
  2: "font-semibold text-zinc-200",
  3: "text-zinc-300",
  4: "text-zinc-400 text-xs",
};

const NIVEL_INDENT: Record<number, string> = {
  1: "pl-0", 2: "pl-4", 3: "pl-8", 4: "pl-12",
};

// ──────────────────────────────────────────────────────────────
// EAP ROW
// ──────────────────────────────────────────────────────────────
function EapRow({ item, versao, expanded, onToggle, hasChildren }: {
  item: OrcItem; versao: Versao; expanded: boolean; onToggle: () => void; hasChildren: boolean;
}) {
  const cfg = VERSAO_CONFIG[versao];
  const valor = parseFloat(item[cfg.field] as string || "0");
  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-zinc-800/50 cursor-pointer
        ${item.nivel === 1 ? "bg-zinc-800/40 border border-zinc-700/50 mb-1" : ""}
        ${NIVEL_INDENT[item.nivel] ?? "pl-0"}
      `}
      onClick={onToggle}
    >
      {hasChildren
        ? (expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />)
        : <span className="w-3.5 shrink-0" />
      }
      <span className="text-xs text-zinc-500 font-mono shrink-0 w-24 truncate">{item.eapCodigo}</span>
      <span className={`flex-1 text-xs truncate ${NIVEL_STYLE[item.nivel] ?? "text-zinc-400"}`}>
        {item.descricao}
      </span>
      {item.unidade && item.nivel >= 3 && (
        <span className="text-xs text-zinc-600 shrink-0 hidden sm:inline">{item.quantidade} {item.unidade}</span>
      )}
      <span className={`text-xs font-semibold shrink-0 ${cfg.color}`}>
        {formatBRL(valor)}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ──────────────────────────────────────────────────────────────
export default function OrcamentoDetalhe() {
  const [, params] = useRoute("/orcamento/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const id = parseInt(params?.id ?? "0");

  const [versao, setVersao] = useState<Versao>("venda");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [metaDialog, setMetaDialog] = useState(false);
  const [novaMetaPerc, setNovaMetaPerc] = useState(20);

  const { data, isLoading, refetch } = trpc.orcamento.getById.useQuery(
    { id },
    { enabled: id > 0 }
  );

  const updateMetaMutation = trpc.orcamento.updateMeta.useMutation({
    onSuccess: () => {
      toast({ title: "Meta atualizada com sucesso!" });
      setMetaDialog(false);
      refetch();
    },
    onError: e => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center py-24 gap-3">
          <AlertCircle className="h-10 w-10 text-zinc-600" />
          <p className="text-zinc-500">Orçamento não encontrado.</p>
          <Button variant="outline" onClick={() => navigate("/orcamento/lista")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar à lista
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const orc    = data as any;
  const itens: OrcItem[] = orc.itens ?? [];
  const insumos: any[]   = orc.insumos ?? [];

  const bdiPct  = parseFloat(orc.bdiPercentual  || "0") * 100;
  const metaPct = parseFloat(orc.metaPercentual || "0") * 100;

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

  const abcCount = { A: 0, B: 0, C: 0 };
  const abcValue = { A: 0, B: 0, C: 0 };
  insumos.forEach((ins: any) => {
    const c = ins.curvaAbc as "A" | "B" | "C";
    if (!c) return;
    abcCount[c]++;
    abcValue[c] += parseFloat(ins.custoTotal || "0");
  });

  const isAdminMaster = (user as any)?.role === "admin_master";

  return (
    <DashboardLayout>
      <div className="p-4">

        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 text-zinc-400 -ml-2"
              onClick={() => navigate("/orcamento/lista")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Lista
            </Button>
            <h1 className="text-xl font-bold text-white">{orc.codigo}</h1>
            <div className="flex gap-3 mt-1 text-xs text-zinc-500 flex-wrap">
              {orc.revisao && <span className="text-cyan-400 font-mono">{orc.revisao}</span>}
              {orc.cliente && <span>Cliente: {orc.cliente}</span>}
              {orc.local   && <span>Local: {orc.local}</span>}
              {bdiPct > 0  && <span className="text-amber-400">BDI {bdiPct.toFixed(2)}%</span>}
              <span className="text-purple-400">Meta −{metaPct.toFixed(0)}% do custo</span>
            </div>
          </div>
          {isAdminMaster && (
            <Button size="sm" variant="outline" className="gap-2 border-zinc-700 shrink-0"
              onClick={() => { setNovaMetaPerc(metaPct); setMetaDialog(true); }}>
              <Settings className="h-4 w-4" /> Ajustar Meta
            </Button>
          )}
        </div>

        {/* Totalizadores */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {(["venda", "custo", "meta"] as Versao[]).map(v => {
            const cfg = VERSAO_CONFIG[v];
            const totais: Record<Versao, number> = {
              venda: parseFloat(orc.totalVenda || "0"),
              custo: parseFloat(orc.totalCusto || "0"),
              meta:  parseFloat(orc.totalMeta  || "0"),
            };
            return (
              <button
                key={v}
                onClick={() => setVersao(v)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  versao === v
                    ? "border-zinc-500 bg-zinc-800"
                    : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
                  <span className="text-xs text-zinc-400 font-medium uppercase">{cfg.label}</span>
                  {versao === v && <CheckCircle2 className="h-3 w-3 text-zinc-400 ml-auto" />}
                </div>
                <p className={`text-base font-bold ${cfg.color}`}>{formatBRL(totais[v])}</p>
                {v === "meta"  && <p className="text-xs text-zinc-600 mt-0.5">−{metaPct.toFixed(0)}% do custo</p>}
                {v === "venda" && bdiPct > 0 && <p className="text-xs text-zinc-600 mt-0.5">BDI {bdiPct.toFixed(2)}%</p>}
              </button>
            );
          })}
        </div>

        {/* Abas */}
        <Tabs defaultValue="eap">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="eap" className="data-[state=active]:bg-zinc-700">EAP</TabsTrigger>
            <TabsTrigger value="insumos" className="data-[state=active]:bg-zinc-700">
              Insumos {insumos.length > 0 && `(${insumos.length})`}
            </TabsTrigger>
            <TabsTrigger value="bdi" className="data-[state=active]:bg-zinc-700">BDI</TabsTrigger>
            {insumos.length > 0 && (
              <TabsTrigger value="abc" className="data-[state=active]:bg-zinc-700">Curva ABC</TabsTrigger>
            )}
          </TabsList>

          {/* EAP */}
          <TabsContent value="eap" className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-zinc-500">
                {itens.length} itens · versão{" "}
                <span className={VERSAO_CONFIG[versao].color}>{VERSAO_CONFIG[versao].label}</span>
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="text-xs text-zinc-500 h-7"
                  onClick={() => setCollapsed(new Set(itens.filter(i => childMap[i.eapCodigo]).map(i => i.eapCodigo)))}>
                  Recolher
                </Button>
                <Button size="sm" variant="ghost" className="text-xs text-zinc-500 h-7"
                  onClick={() => setCollapsed(new Set())}>
                  Expandir
                </Button>
              </div>
            </div>
            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardContent className="py-3 px-2">
                <div className="space-y-0.5">
                  {visibleItems.map(item => (
                    <EapRow
                      key={item.id}
                      item={item}
                      versao={versao}
                      expanded={!collapsed.has(item.eapCodigo)}
                      onToggle={() => toggleCollapse(item.eapCodigo)}
                      hasChildren={!!childMap[item.eapCodigo]}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insumos */}
          <TabsContent value="insumos" className="mt-4">
            {insumos.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <Package className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
                <p className="text-sm">Nenhum insumo extraído.</p>
                <p className="text-xs mt-1">Adicione a aba "Insumos" à planilha para gerar a curva ABC.</p>
              </div>
            ) : (
              <Card className="border-zinc-800 bg-zinc-900/40">
                <CardContent className="py-3 px-0 overflow-x-auto">
                  <table className="w-full text-xs min-w-[600px]">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500">
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
                        <tr key={ins.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="pl-4 py-1.5">
                            <span className={`inline-block w-5 h-5 rounded text-center font-bold leading-5 text-white text-xs
                              ${ins.curvaAbc === "A" ? "bg-emerald-600" : ins.curvaAbc === "B" ? "bg-amber-600" : "bg-zinc-600"}`}>
                              {ins.curvaAbc}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-zinc-400 font-mono">{ins.codigo}</td>
                          <td className="px-3 py-1.5 text-zinc-200 max-w-xs truncate">{ins.descricao}</td>
                          <td className="px-3 py-1.5 text-zinc-500">{ins.tipo}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-400">
                            {parseFloat(ins.quantidadeTotal || "0").toFixed(2)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-amber-300 font-medium">
                            {formatBRL(parseFloat(ins.custoTotal || "0"))}
                          </td>
                          <td className="pr-4 py-1.5 text-right text-zinc-500">
                            {(parseFloat(ins.percentualTotal || "0") * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* BDI */}
          <TabsContent value="bdi" className="mt-4">
            {!orc.bdiLinhas?.length ? (
              <div className="text-center py-12 text-zinc-500 text-sm">Nenhuma linha de BDI extraída.</div>
            ) : (
              <Card className="border-zinc-800 bg-zinc-900/40">
                <CardContent className="py-3 px-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500">
                        <th className="text-left pl-4 py-2">Código</th>
                        <th className="text-left px-3 py-2">Descrição</th>
                        <th className="text-right px-3 py-2">%</th>
                        <th className="text-right pr-4 py-2">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orc.bdiLinhas.map((b: any) => (
                        <tr key={b.id}
                          className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${b.codigo === "B-02" ? "font-semibold text-amber-300" : ""}`}>
                          <td className="pl-4 py-2 font-mono text-zinc-400">{b.codigo}</td>
                          <td className="px-3 py-2 text-zinc-200">{b.descricao}</td>
                          <td className="px-3 py-2 text-right text-zinc-300">
                            {(parseFloat(b.percentual || "0") * 100).toFixed(4)}%
                          </td>
                          <td className="pr-4 py-2 text-right text-amber-300">
                            {parseFloat(b.valorAbsoluto || "0") > 0
                              ? formatBRL(parseFloat(b.valorAbsoluto))
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Curva ABC */}
          {insumos.length > 0 && (
            <TabsContent value="abc" className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {(["A", "B", "C"] as const).map(c => (
                  <Card key={c} className="border-zinc-800 bg-zinc-900/60">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white
                          ${c === "A" ? "bg-emerald-600" : c === "B" ? "bg-amber-600" : "bg-zinc-600"}`}>
                          {c}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">{formatBRL(abcValue[c])}</p>
                          <p className="text-xs text-zinc-500">{abcCount[c]} insumos</p>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-zinc-600">
                        {c === "A" ? "Representa ~80% do custo total"
                         : c === "B" ? "Representa ~15% do custo total"
                         : "Representa ~5% do custo total"}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-lg overflow-hidden h-6">
                {(["A", "B", "C"] as const).map(c => {
                  const total = abcValue.A + abcValue.B + abcValue.C;
                  const pct = total > 0 ? (abcValue[c] / total) * 100 : 0;
                  return (
                    <div
                      key={c}
                      className={`h-full flex items-center justify-center text-xs font-bold text-white
                        ${c === "A" ? "bg-emerald-600" : c === "B" ? "bg-amber-600" : "bg-zinc-600"}`}
                      style={{ width: `${pct}%`, minWidth: pct > 0 ? "24px" : "0" }}
                    >
                      {pct > 5 ? `${pct.toFixed(0)}%` : ""}
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Dialog Meta */}
        <Dialog open={metaDialog} onOpenChange={setMetaDialog}>
          <DialogContent className="bg-zinc-900 border-zinc-700 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-400" />
                Ajustar Percentual de Meta
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Slider min={1} max={50} step={1} value={[novaMetaPerc]}
                    onValueChange={([v]) => setNovaMetaPerc(v)} />
                </div>
                <Input
                  type="number" min={1} max={50}
                  value={novaMetaPerc}
                  onChange={e => setNovaMetaPerc(Math.min(50, Math.max(1, Number(e.target.value))))}
                  className="w-20 text-center bg-zinc-800 border-zinc-700 text-white font-bold"
                />
                <span className="text-zinc-400 text-sm shrink-0">%</span>
              </div>
              <p className="text-xs text-zinc-500">
                Meta = Custo × (1 − {novaMetaPerc}%). Todos os itens serão recalculados.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-zinc-700" onClick={() => setMetaDialog(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                disabled={updateMetaMutation.isPending}
                onClick={() => updateMetaMutation.mutate({
                  id,
                  metaPercentual: novaMetaPerc / 100,
                  userName: (user as any)?.name || (user as any)?.email || "admin",
                  userId: (user as any)?.id ?? 0,
                })}
              >
                {updateMetaMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Salvando...</>
                  : "Salvar Meta"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
