// Rev. 1633 — CFO Suite (FASE 2)
// Three-Way Match com bloqueio · Reconciliação OFX/CNAB com IA ·
// Dynamic Discounting · DRE Dual (Gerencial × Fiscal) · Alertas Push
import { useState, useMemo, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Shield, Upload, Sparkles, Wallet, Scale, Bell, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, Lock, Unlock, FileText, TrendingUp, ArrowRight, Info,
} from "lucide-react";
import { toast } from "sonner";
import { parseAsUTC } from "@/lib/dateUtils";

function BRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v || 0);
}
function fmtPct(v: number, d = 1) { return `${(v ?? 0).toFixed(d)}%`; }
function fmtDateBR(s: string | null | undefined) {
  if (!s) return "—";
  return s.includes("-") ? s.split("T")[0].split("-").reverse().join("/") : s;
}

export default function FinanceiroCFOSuite() {
  const { companyId } = useCompany();
  const [tab, setTab] = useState("3wm");
  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-600" /> CFO Suite — FASE 2
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Controles avançados: 3-Way Match · Reconciliação IA · Dynamic Discounting · DRE Dual · Alertas
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
            <TabsTrigger value="3wm"><Shield className="w-4 h-4 mr-1" />3-Way Match</TabsTrigger>
            <TabsTrigger value="reconcile"><Upload className="w-4 h-4 mr-1" />Reconciliação IA</TabsTrigger>
            <TabsTrigger value="dd"><Wallet className="w-4 h-4 mr-1" />Dynamic Disc.</TabsTrigger>
            <TabsTrigger value="dre"><Scale className="w-4 h-4 mr-1" />DRE Dual</TabsTrigger>
            <TabsTrigger value="alerts"><Bell className="w-4 h-4 mr-1" />Alertas</TabsTrigger>
          </TabsList>

          <TabsContent value="3wm" className="mt-4"><ThreeWayPanel companyId={companyId} /></TabsContent>
          <TabsContent value="reconcile" className="mt-4"><ReconcilePanel companyId={companyId} /></TabsContent>
          <TabsContent value="dd" className="mt-4"><DynamicDiscPanel companyId={companyId} /></TabsContent>
          <TabsContent value="dre" className="mt-4"><DREDualPanel companyId={companyId} /></TabsContent>
          <TabsContent value="alerts" className="mt-4"><AlertsPanel companyId={companyId} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1. THREE-WAY MATCH
// ════════════════════════════════════════════════════════════════════════════
function ThreeWayPanel({ companyId }: { companyId: number }) {
  const { data, isLoading, refetch, isFetching } = (trpc as any).financial.getThreeWayMatch.useQuery(
    { companyId }, { enabled: !!companyId }
  );
  const block = (trpc as any).financial.blockPaymentByThreeWay.useMutation();
  const release = (trpc as any).financial.releasePaymentByThreeWay.useMutation();
  const [filter, setFilter] = useState<"todos" | "bloqueados">("todos");

  const items = data?.items ?? [];
  const resumo = data?.resumo ?? { total: 0, ok: 0, bloqueados: 0, parciais: 0, valorBloqueado: 0 };
  const filtered = filter === "bloqueados" ? items.filter((i: any) => i.status !== "OK") : items;

  const handleBlock = async (i: any) => {
    if (!i.financialEntryId) { toast.error("Sem lançamento financeiro vinculado"); return; }
    try {
      await block.mutateAsync({ companyId, financialEntryId: i.financialEntryId, motivo: i.bloqueios.join("; ") });
      toast.success("Pagamento bloqueado");
      refetch();
    } catch (e: any) { toast.error(e?.message); }
  };
  const handleRelease = async (i: any) => {
    if (!i.financialEntryId) return;
    try {
      await release.mutateAsync({ companyId, financialEntryId: i.financialEntryId });
      toast.success("Pagamento liberado");
      refetch();
    } catch (e: any) { toast.error(e?.message); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Total verificado" valor={resumo.total} cor="slate" />
        <KPI label="Match OK" valor={resumo.ok} cor="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
        <KPI label="Parciais" valor={resumo.parciais} cor="amber" icon={<AlertTriangle className="w-4 h-4" />} />
        <KPI label="Bloqueados" valor={resumo.bloqueados} cor="red" icon={<Lock className="w-4 h-4" />} />
        <KPI label="Valor bloqueado" valor={BRL(resumo.valorBloqueado)} cor="red" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Conferência PO × Recebimento × NF</CardTitle>
          <div className="flex gap-2">
            <Button variant={filter === "todos" ? "default" : "outline"} size="sm" onClick={() => setFilter("todos")}>Todos</Button>
            <Button variant={filter === "bloqueados" ? "default" : "outline"} size="sm" onClick={() => setFilter("bloqueados")}>Só bloqueados</Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="text-sm text-slate-500 p-4">Carregando…</div>
            : filtered.length === 0 ? <EmptyState text="Nenhum título com Ordem de Compra vinculada para conferência." />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-slate-500 border-b">
                      <tr><th className="text-left p-2">Status</th><th className="text-left p-2">Fornecedor</th><th className="text-left p-2">Obra</th><th className="text-left p-2">PO</th>
                        <th className="text-right p-2">Valor PO</th><th className="text-right p-2">Valor AP</th><th className="text-right p-2">Δ%</th>
                        <th className="text-center p-2">Receb.</th><th className="text-center p-2">NF</th><th className="text-center p-2">Vencto</th><th className="text-center p-2">Ação</th></tr>
                    </thead>
                    <tbody>
                      {filtered.map((i: any) => (
                        <tr key={i.apId} className="border-b hover:bg-slate-50">
                          <td className="p-2"><StatusBadge status={i.status} /></td>
                          <td className="p-2 font-medium">{i.supplierNome}</td>
                          <td className="p-2 text-slate-600">{i.obraNome ?? "—"}</td>
                          <td className="p-2 text-slate-600">{i.ordemNumero ?? "—"}</td>
                          <td className="p-2 text-right tabular-nums">{BRL(i.valorPO)}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{BRL(i.valorAP)}</td>
                          <td className={`p-2 text-right tabular-nums ${Math.abs(i.diferencaPct) > 2 ? "text-red-600 font-bold" : "text-slate-500"}`}>
                            {i.valorPO > 0 ? `${i.diferencaPct >= 0 ? "+" : ""}${i.diferencaPct.toFixed(1)}%` : "—"}
                          </td>
                          <td className="p-2 text-center">{i.recebido ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" /> : <XCircle className="w-4 h-4 text-red-500 mx-auto" />}</td>
                          <td className="p-2 text-center text-xs">{i.nfNumero ?? "—"}</td>
                          <td className="p-2 text-center text-xs">{fmtDateBR(i.dataVencimento)}</td>
                          <td className="p-2 text-center">
                            {i.status !== "OK" && i.financialEntryId ? (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBlock(i)}>
                                <Lock className="w-3 h-3 mr-1" />Bloquear
                              </Button>
                            ) : i.financialEntryId ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleRelease(i)}>
                                <Unlock className="w-3 h-3 mr-1" />Liberar
                              </Button>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2. RECONCILIAÇÃO OFX/CNAB com IA
// ════════════════════════════════════════════════════════════════════════════
function ReconcilePanel({ companyId }: { companyId: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [conteudo, setConteudo] = useState("");
  const [formato, setFormato] = useState<"ofx" | "cnab">("ofx");
  const [contaBancariaId, setContaBancariaId] = useState<number>(0);
  const [useAI, setUseAI] = useState(true);
  const [resultado, setResultado] = useState<any>(null);
  const [matchesEscolhidos, setMatchesEscolhidos] = useState<Record<string, number>>({});

  const contas = (trpc as any).financial.getBankAccounts.useQuery({ companyId }, { enabled: !!companyId });
  const reconcile = (trpc as any).financial.reconcileBankFile.useMutation();
  const apply = (trpc as any).financial.applyReconciliationMatches.useMutation();

  const handleFile = async (f: File | null) => {
    if (!f) return;
    const text = await f.text();
    setConteudo(text);
    const isOfx = /^<\?OFX|<OFX>|<STMTTRN>/i.test(text.slice(0, 500)) || f.name.toLowerCase().endsWith(".ofx");
    setFormato(isOfx ? "ofx" : "cnab");
  };

  const analisar = async () => {
    if (!conteudo) { toast.error("Carregue um arquivo OFX ou CNAB"); return; }
    try {
      const r = await reconcile.mutateAsync({ companyId, contaBancariaId: contaBancariaId || null, formato, conteudo, useAI });
      setResultado(r);
      const inicial: Record<string, number> = {};
      for (const s of r.sugestoes) if (s.melhorEntryId) inicial[s.ofxLine.fitId] = s.melhorEntryId;
      setMatchesEscolhidos(inicial);
      toast.success(`${r.totalLinhas} movimentações analisadas`);
    } catch (e: any) { toast.error(e?.message); }
  };

  const aplicar = async () => {
    if (!contaBancariaId) { toast.error("Selecione a conta bancária"); return; }
    const matches = (resultado?.sugestoes ?? [])
      .filter((s: any) => matchesEscolhidos[s.ofxLine.fitId])
      .map((s: any) => ({ ofxLine: s.ofxLine, entryId: matchesEscolhidos[s.ofxLine.fitId] }));
    if (!matches.length) { toast.error("Nenhum match selecionado"); return; }
    try {
      const r = await apply.mutateAsync({ companyId, contaBancariaId, matches });
      toast.success(`${r.aplicados} lançamentos conciliados`);
      setResultado(null); setConteudo(""); setMatchesEscolhidos({});
    } catch (e: any) { toast.error(e?.message); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Importar extrato OFX ou CNAB</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Conta bancária</Label>
              <select className="w-full border rounded-md p-2 text-sm" value={contaBancariaId} onChange={(e) => setContaBancariaId(Number(e.target.value))}>
                <option value={0}>Selecione…</option>
                {(contas?.data ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.banco} · Ag {c.agencia} · CC {c.conta}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Formato</Label>
              <select className="w-full border rounded-md p-2 text-sm" value={formato} onChange={(e) => setFormato(e.target.value as any)}>
                <option value="ofx">OFX (Open Financial Exchange)</option>
                <option value="cnab">CNAB 240/400</option>
              </select>
            </div>
            <div>
              <Label>Arquivo</Label>
              <Input type="file" ref={fileRef} accept=".ofx,.txt,.ret,.cnab" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
              <Sparkles className="w-3 h-3 text-purple-500" /> Refinar matches ambíguos com IA
            </label>
            <Button onClick={analisar} disabled={!conteudo || reconcile.isPending}>
              {reconcile.isPending ? "Analisando…" : "Analisar movimentações"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Sugestões de conciliação ({resultado.sugestoes.length})</CardTitle>
            <Button onClick={aplicar} disabled={apply.isPending}>
              {apply.isPending ? "Aplicando…" : "Aplicar selecionados"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500 border-b">
                  <tr><th className="text-left p-2">Data</th><th className="text-left p-2">Descrição OFX</th><th className="text-right p-2">Valor</th>
                    <th className="text-left p-2">Conf.</th><th className="text-left p-2">Match sugerido</th></tr>
                </thead>
                <tbody>
                  {resultado.sugestoes.map((s: any) => (
                    <tr key={s.ofxLine.fitId} className="border-b align-top">
                      <td className="p-2 text-xs">{fmtDateBR(s.ofxLine.data)}</td>
                      <td className="p-2 max-w-[260px] truncate">{s.ofxLine.descricao}</td>
                      <td className={`p-2 text-right tabular-nums ${s.ofxLine.valor < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {BRL(s.ofxLine.valor)}
                      </td>
                      <td className="p-2"><ConfBadge c={s.confianca} /></td>
                      <td className="p-2">
                        {s.candidatos.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">Nenhum candidato</span>
                        ) : (
                          <select
                            className="w-full border rounded p-1 text-xs"
                            value={matchesEscolhidos[s.ofxLine.fitId] ?? 0}
                            onChange={(e) => setMatchesEscolhidos({ ...matchesEscolhidos, [s.ofxLine.fitId]: Number(e.target.value) })}
                          >
                            <option value={0}>— ignorar —</option>
                            {s.candidatos.map((c: any) => (
                              <option key={c.entryId} value={c.entryId}>
                                {`#${c.entryId} · ${BRL(c.valor)} · ${fmtDateBR(c.data)} · ${c.descricao.slice(0, 40)} (${c.score})`}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3. DYNAMIC DISCOUNTING
// ════════════════════════════════════════════════════════════════════════════
function DynamicDiscPanel({ companyId }: { companyId: number }) {
  const [taxa, setTaxa] = useState(18);
  const [janela, setJanela] = useState(60);
  const { data, isLoading, refetch, isFetching } = (trpc as any).financial.getDynamicDiscountOffers.useQuery(
    { companyId, taxaWaccAA: taxa, janelaDias: janela }, { enabled: !!companyId }
  );
  const offers = data?.offers ?? [];
  const resumo = data?.resumo ?? { totalValor: 0, totalDesconto: 0, mediaDescontoPct: 0 };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Parâmetros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Taxa WACC alvo (% a.a.)</Label>
            <Input type="number" value={taxa} onChange={(e) => setTaxa(Number(e.target.value))} step={0.5} />
          </div>
          <div>
            <Label>Janela de antecipação (dias)</Label>
            <Input type="number" value={janela} onChange={(e) => setJanela(Number(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => refetch()} disabled={isFetching} className="w-full">
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Recalcular
            </Button>
          </div>
          <div className="flex items-center justify-end text-xs text-slate-500 px-3">
            <Info className="w-3 h-3 mr-1" />
            Calculamos o desconto = valor × taxa diária × dias de antecipação
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPI label="Valor potencial antecipável" valor={BRL(resumo.totalValor)} cor="indigo" icon={<Wallet className="w-4 h-4" />} />
        <KPI label="Economia total estimada" valor={BRL(resumo.totalDesconto)} cor="emerald" icon={<TrendingUp className="w-4 h-4" />} />
        <KPI label="Desconto médio" valor={fmtPct(resumo.mediaDescontoPct, 2)} cor="purple" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Ofertas ({offers.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <div className="text-sm text-slate-500 p-4">Carregando…</div>
            : offers.length === 0 ? <EmptyState text={`Nenhuma despesa elegível nos próximos ${janela} dias (mín R$ 1.000 e ≥ 7 dias).`} />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-slate-500 border-b">
                      <tr><th className="text-left p-2">Fornecedor / Descrição</th><th className="text-center p-2">Vencto</th>
                        <th className="text-right p-2">Dias</th><th className="text-right p-2">Valor</th>
                        <th className="text-right p-2">Desconto</th><th className="text-right p-2">%</th>
                        <th className="text-right p-2">Valor antecipado</th></tr>
                    </thead>
                    <tbody>
                      {offers.map((o: any) => (
                        <tr key={o.entryId} className="border-b hover:bg-slate-50">
                          <td className="p-2 max-w-[280px] truncate">{o.fornecedor}</td>
                          <td className="p-2 text-center text-xs">{fmtDateBR(o.dataVencimento)}</td>
                          <td className="p-2 text-right tabular-nums">{o.diasAntecipacao}</td>
                          <td className="p-2 text-right tabular-nums">{BRL(o.valor)}</td>
                          <td className="p-2 text-right tabular-nums text-emerald-600 font-medium">-{BRL(o.desconto)}</td>
                          <td className="p-2 text-right tabular-nums text-emerald-600 text-xs">{fmtPct(o.descontoPct, 2)}</td>
                          <td className="p-2 text-right tabular-nums font-bold">{BRL(o.valorAntecipado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 4. DRE DUAL
// ════════════════════════════════════════════════════════════════════════════
function DREDualPanel({ companyId }: { companyId: number }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const { data, isLoading, refetch, isFetching } = (trpc as any).financial.getDREDual.useQuery(
    { companyId, ano }, { enabled: !!companyId }
  );
  const linhas = data?.linhas ?? [];
  const resumo = data?.resumo ?? {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Comparativo Gerencial × Fiscal — {ano}</CardTitle>
          <div className="flex items-center gap-2">
            <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} className="w-24 h-8" />
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <KPI label="Receita Gerencial" valor={BRL(resumo.receitaGerencial ?? 0)} cor="indigo" />
            <KPI label="Receita Fiscal" valor={BRL(resumo.receitaFiscal ?? 0)} cor="slate" />
            <KPI label="EBITDA Gerencial" valor={BRL(resumo.ebitdaGerencial ?? 0)} cor="emerald" sub={`Margem ${fmtPct(resumo.margemEbitdaG ?? 0)}`} />
            <KPI label="EBITDA Fiscal" valor={BRL(resumo.ebitdaFiscal ?? 0)} cor="amber" sub={`Margem ${fmtPct(resumo.margemEbitdaF ?? 0)}`} />
          </div>

          {isLoading ? <div className="text-sm text-slate-500 p-4">Carregando…</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-slate-500 border-b">
                    <tr><th className="text-left p-2">Linha</th>
                      <th className="text-right p-2">Gerencial</th>
                      <th className="text-right p-2">Fiscal</th>
                      <th className="text-right p-2">Diferença</th></tr>
                  </thead>
                  <tbody>
                    {linhas.map((l: any, idx: number) => {
                      const isTotal = l.conta.startsWith("=");
                      return (
                        <tr key={idx} className={`border-b ${isTotal ? "bg-slate-50 font-bold" : ""}`}>
                          <td className="p-2">{l.conta}</td>
                          <td className={`p-2 text-right tabular-nums ${l.gerencial < 0 ? "text-red-600" : "text-slate-900"}`}>{BRL(l.gerencial)}</td>
                          <td className={`p-2 text-right tabular-nums ${l.fiscal < 0 ? "text-red-600" : "text-slate-900"}`}>{BRL(l.fiscal)}</td>
                          <td className={`p-2 text-right tabular-nums text-xs ${Math.abs(l.diferenca) > 1 ? "text-amber-700 font-medium" : "text-slate-400"}`}>
                            {BRL(l.diferenca)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="text-[11px] text-slate-500 mt-3 flex items-start gap-2">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    <b>Gerencial</b>: contempla previsto + realizado (visão de gestão, IFRS 15 percentual de conclusão).
                    <b className="ml-2">Fiscal</b>: apenas valores realizados (regime de caixa simplificado para conferência de obrigações).
                  </span>
                </div>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5. ALERTAS
// ════════════════════════════════════════════════════════════════════════════
function AlertsPanel({ companyId }: { companyId: number }) {
  const [apenasNaoLidas, setApenas] = useState(true);
  const { data, refetch, isFetching } = (trpc as any).financial.getFinancialAlerts.useQuery(
    { companyId, apenasNaoLidas }, { enabled: !!companyId }
  );
  const regen = (trpc as any).financial.regenerateFinancialAlerts.useMutation();
  const markRead = (trpc as any).financial.markAlertRead.useMutation();
  const alerts = data ?? [];

  const handleRegen = async () => {
    try {
      const r = await regen.mutateAsync({ companyId });
      toast.success(`${r.inseridos} verificações executadas`);
      refetch();
    } catch (e: any) { toast.error(e?.message); }
  };
  const handleRead = async (id: number) => {
    try {
      await markRead.mutateAsync({ companyId, alertId: id });
      refetch();
    } catch (e: any) { toast.error(e?.message); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Centro de Alertas Financeiros</CardTitle>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={apenasNaoLidas} onChange={(e) => setApenas(e.target.checked)} />
              Apenas não lidas
            </label>
            <Button variant="outline" size="sm" onClick={handleRegen} disabled={regen.isPending}>
              <Sparkles className="w-4 h-4 mr-1" />
              {regen.isPending ? "Verificando…" : "Verificar agora"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? <EmptyState text="Nenhum alerta — clique em 'Verificar agora' para escanear o financeiro." />
            : (
              <div className="space-y-2">
                {alerts.map((a: any) => (
                  <div key={a.id} className={`border rounded-md p-3 flex items-start gap-3 ${a.lida ? "opacity-60" : ""} ${
                    a.severidade === "critico" ? "border-red-200 bg-red-50" :
                    a.severidade === "atencao" ? "border-amber-200 bg-amber-50" : "border-slate-200"
                  }`}>
                    <div className={`mt-0.5 ${
                      a.severidade === "critico" ? "text-red-600" :
                      a.severidade === "atencao" ? "text-amber-600" : "text-slate-500"
                    }`}>
                      {a.severidade === "critico" ? <AlertTriangle className="w-5 h-5" /> :
                        a.severidade === "atencao" ? <Bell className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{a.titulo}</span>
                        <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{a.mensagem}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{parseAsUTC(a.criado_em).toLocaleString("pt-BR")}</p>
                    </div>
                    {!a.lida && (
                      <Button size="sm" variant="ghost" onClick={() => handleRead(a.id)}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers visuais
// ════════════════════════════════════════════════════════════════════════════
function KPI({ label, valor, cor, icon, sub }: { label: string; valor: any; cor: string; icon?: any; sub?: string }) {
  const cores: any = {
    slate: "border-slate-200 text-slate-700",
    emerald: "border-emerald-200 text-emerald-700 bg-emerald-50/40",
    amber: "border-amber-200 text-amber-700 bg-amber-50/40",
    red: "border-red-200 text-red-700 bg-red-50/40",
    indigo: "border-indigo-200 text-indigo-700 bg-indigo-50/40",
    purple: "border-purple-200 text-purple-700 bg-purple-50/40",
  };
  return (
    <div className={`border rounded-lg p-3 ${cores[cor] ?? cores.slate}`}>
      <div className="flex items-center justify-between text-[11px] uppercase font-semibold tracking-wide opacity-80">
        <span>{label}</span>{icon}
      </div>
      <div className="text-lg font-bold tabular-nums mt-1">{valor}</div>
      {sub && <div className="text-[10px] opacity-70">{sub}</div>}
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: any = {
    OK: { c: "bg-emerald-100 text-emerald-700", l: "Match OK" },
    PARCIAL: { c: "bg-amber-100 text-amber-700", l: "Parcial" },
    BLOQ_VALOR: { c: "bg-red-100 text-red-700", l: "Bloq. valor" },
    BLOQ_RECEBIMENTO: { c: "bg-red-100 text-red-700", l: "Sem receb." },
    BLOQ_NF: { c: "bg-red-100 text-red-700", l: "Sem NF" },
  };
  const x = map[status] ?? { c: "bg-slate-100 text-slate-700", l: status };
  return <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${x.c}`}>{x.l}</span>;
}
function ConfBadge({ c }: { c: string }) {
  const map: any = {
    alta: { cor: "bg-emerald-100 text-emerald-700", l: "Alta" },
    media: { cor: "bg-blue-100 text-blue-700", l: "Média" },
    baixa: { cor: "bg-amber-100 text-amber-700", l: "Baixa" },
    nenhuma: { cor: "bg-slate-100 text-slate-500", l: "—" },
  };
  const x = map[c] ?? map.nenhuma;
  return <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${x.cor}`}>{x.l}</span>;
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12 text-sm text-slate-500">
      <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
      {text}
    </div>
  );
}
