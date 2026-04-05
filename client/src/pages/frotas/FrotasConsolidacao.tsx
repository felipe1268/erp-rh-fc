import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  FileCheck2, ChevronLeft, ChevronRight, Fuel, Wrench, AlertTriangle,
  Receipt, FileText, Shield, DollarSign, Send, Undo2, MapPin, Star,
  TrendingDown, TrendingUp, BarChart3, Clock, Loader2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

function fmt(v: any) {
  return parseFloat(v || "0").toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type CostItem = {
  key: string;
  label: string;
  icon: any;
  color: string;
  bg: string;
  border: string;
};

const COST_ITEMS: CostItem[] = [
  { key: "custoCombustivel", label: "Combustível", icon: Fuel, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { key: "custoManutencao", label: "Manutenção", icon: Wrench, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  { key: "custoIpva", label: "IPVA", icon: Receipt, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  { key: "custoMultas", label: "Multas", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  { key: "custoLicenciamento", label: "Licenciamento", icon: FileText, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  { key: "custoSeguro", label: "Seguros", icon: Shield, color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
];

export default function FrotasConsolidacao() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [obs, setObs] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const consolidation = trpc.frotas.getConsolidationData.useQuery(
    { companyId: cId, mes, ano },
    { enabled: cId > 0 }
  );
  const history = trpc.frotas.listConsolidations.useQuery(
    { companyId: cId, ano },
    { enabled: cId > 0 }
  );
  const priceComparison = trpc.frotas.compareGasPrices.useQuery(
    { companyId: cId },
    { enabled: cId > 0 }
  );

  const consolidateMut = trpc.frotas.consolidateMonth.useMutation({
    onSuccess: (r) => {
      toast.success(`Consolidado! Lançamento financeiro #${r.financialEntryId} criado — R$ ${r.custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
      consolidation.refetch();
      history.refetch();
      setConfirmOpen(false);
      setObs("");
    },
    onError: (e) => toast.error(e.message),
  });

  const desconsolidateMut = trpc.frotas.desconsolidateMonth.useMutation({
    onSuccess: () => {
      toast.success("Consolidação revertida com sucesso.");
      consolidation.refetch();
      history.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const d = consolidation.data;
  const existing = d?.existing;

  const statusColor = (s: string) => {
    if (s === "enviado_financeiro") return "bg-blue-100 text-blue-800";
    if (s === "pago") return "bg-green-100 text-green-800";
    if (s === "consolidado") return "bg-amber-100 text-amber-800";
    return "bg-gray-100 text-gray-800";
  };
  const statusLabel = (s: string) => {
    if (s === "enviado_financeiro") return "Enviado ao Financeiro";
    if (s === "pago") return "Pago";
    if (s === "consolidado") return "Consolidado";
    return s;
  };

  const consolidatedMonths = useMemo(() => {
    const set = new Set<number>();
    (history.data || []).forEach((h: any) => set.add(h.mes));
    return set;
  }, [history.data]);

  const pc = priceComparison.data;

  return (
    <DashboardLayout module="frotas">
      <div className="space-y-6 pb-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <FileCheck2 className="w-7 h-7 text-cyan-600" />
              Consolidação de Custos — Frotas
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Consolide combustível, manutenção, IPVA, multas, licenciamento e seguros para envio ao financeiro
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setAno(a => a - 1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="text-lg font-semibold min-w-[60px] text-center">{ano}</span>
          <Button variant="ghost" size="icon" onClick={() => setAno(a => a + 1)} disabled={ano >= now.getFullYear()}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <div className="flex gap-1 ml-4">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const isConsolidated = consolidatedMonths.has(m);
              const isActive = m === mes;
              return (
                <button
                  key={m}
                  onClick={() => setMes(m)}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium transition-all relative
                    ${isActive
                      ? "bg-cyan-600 text-white shadow-md"
                      : isConsolidated
                        ? "bg-green-100 text-green-800 hover:bg-green-200 border border-green-300"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }
                  `}
                >
                  {MESES[m]}
                  {isConsolidated && !isActive && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 bg-green-500 rounded-full" /> Consolidado
          <span className="w-2 h-2 bg-gray-300 rounded-full ml-3" /> Pendente
        </div>

        {consolidation.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : d ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {COST_ITEMS.map((item) => {
                const valor = (d as any)[item.key] || 0;
                const pct = d.custoTotal > 0 ? ((valor / d.custoTotal) * 100).toFixed(1) : "0.0";
                return (
                  <Card key={item.key} className={`${item.bg} border ${item.border}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <item.icon className={`w-5 h-5 ${item.color}`} />
                        <span className="text-xs font-medium text-gray-600">{item.label}</span>
                      </div>
                      <div className={`text-lg font-bold ${item.color}`}>{fmt(valor)}</div>
                      <div className="text-xs text-gray-500 mt-1">{pct}% do total</div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="bg-gradient-to-r from-gray-900 to-gray-800 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-300">Custo Total — {MESES_FULL[mes]} {ano}</div>
                    <div className="text-3xl font-bold mt-1">{fmt(d.custoTotal)}</div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      <span>{d.qtdAbastecimentos} abastecimentos</span>
                      <span>{d.qtdManutencoes} manutenções</span>
                      <span>{d.qtdMultas} multas</span>
                      <span>{d.litrosTotal?.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} litros</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {existing ? (
                      <>
                        <Badge className={statusColor(existing.status)}>
                          {statusLabel(existing.status)}
                        </Badge>
                        {existing.financial_entry_id && (
                          <span className="text-xs text-gray-400">Lançamento #{existing.financial_entry_id}</span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-400 border-red-400/30 hover:bg-red-500/10"
                          onClick={() => desconsolidateMut.mutate({ companyId: cId, mes, ano })}
                          disabled={desconsolidateMut.isPending}
                        >
                          <Undo2 className="w-4 h-4 mr-1" />
                          Reverter
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="lg"
                        className="bg-cyan-600 hover:bg-cyan-700 text-white"
                        onClick={() => setConfirmOpen(true)}
                        disabled={d.custoTotal === 0}
                      >
                        <Send className="w-5 h-5 mr-2" />
                        Consolidar e Enviar ao Financeiro
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {confirmOpen && (
              <Card className="border-cyan-300 bg-cyan-50">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-800 mb-3">Confirmar Consolidação — {MESES_FULL[mes]}/{ano}</h3>
                  <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                    {COST_ITEMS.map((item) => {
                      const valor = (d as any)[item.key] || 0;
                      return valor > 0 ? (
                        <div key={item.key} className="flex justify-between bg-white rounded px-3 py-2">
                          <span className="text-gray-600">{item.label}</span>
                          <span className="font-semibold">{fmt(valor)}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                  <div className="text-right font-bold text-lg mb-4">
                    Total: {fmt(d.custoTotal)}
                  </div>
                  <Textarea
                    placeholder="Observações (opcional)"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    className="mb-4 bg-white"
                  />
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
                    <Button
                      className="bg-cyan-600 hover:bg-cyan-700 text-white"
                      onClick={() => consolidateMut.mutate({
                        companyId: cId, mes, ano, observacoes: obs, enviarFinanceiro: true,
                      })}
                      disabled={consolidateMut.isPending}
                    >
                      {consolidateMut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck2 className="w-4 h-4 mr-2" />}
                      Confirmar Consolidação
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {d.postos && d.postos.length > 0 && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Fuel className="w-5 h-5 text-blue-600" />
                    Postos Utilizados no Mês
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-3 py-2">Posto</th>
                          <th className="text-right px-3 py-2">Preço Médio/L</th>
                          <th className="text-right px-3 py-2">Litros</th>
                          <th className="text-right px-3 py-2">Total Gasto</th>
                          <th className="text-right px-3 py-2">Abastecimentos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {d.postos.map((p: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium">{p.posto}</td>
                            <td className="px-3 py-2 text-right">{fmt(p.preco_medio)}</td>
                            <td className="px-3 py-2 text-right">{parseFloat(p.litros || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                            <td className="px-3 py-2 text-right font-semibold">{fmt(p.total)}</td>
                            <td className="px-3 py-2 text-right">{p.qtd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Comparativo de Preços — Seus Postos (Últimos 6 meses)
              </h3>
              {priceComparison.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
              ) : pc?.historico && pc.historico.length > 0 ? (
                <div className="space-y-3">
                  {pc.historico.map((h: any, i: number) => {
                    const media = pc.mediaGeral?.find((m: any) => m.tipo_combustivel === h.tipo_combustivel);
                    const diff = media ? (parseFloat(h.preco_medio) - parseFloat(media.preco_medio_geral)) : 0;
                    const isAbove = diff > 0.05;
                    const isBelow = diff < -0.05;
                    return (
                      <div key={i} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-800">{h.posto}</span>
                            <Badge className="ml-2 text-xs" variant="outline">{h.tipo_combustivel}</Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-lg font-bold">{fmt(h.preco_medio)}<span className="text-xs text-gray-400">/L</span></div>
                              <div className="text-xs text-gray-500">{parseInt(h.qtd)} abast. · {fmt(h.total_gasto)} total</div>
                            </div>
                            {isAbove && <TrendingUp className="w-5 h-5 text-red-500" />}
                            {isBelow && <TrendingDown className="w-5 h-5 text-green-500" />}
                          </div>
                        </div>
                        {media && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <span className="text-gray-500">Média geral: {fmt(media.preco_medio_geral)}/L</span>
                            <span className={`font-medium ${isAbove ? "text-red-600" : isBelow ? "text-green-600" : "text-gray-600"}`}>
                              ({diff > 0 ? "+" : ""}{diff.toFixed(4)})
                            </span>
                            {isAbove && <span className="text-red-500 text-xs">⚠ Acima da média — renegociar</span>}
                            {isBelow && <span className="text-green-500 text-xs">✓ Abaixo da média</span>}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-gray-400">
                          Faixa: {fmt(h.menor_preco)}/L — {fmt(h.maior_preco)}/L · Último: {new Date(h.ultimo_abastecimento).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">Sem dados de abastecimento nos últimos 6 meses</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                Postos Próximos à Região (Umuarama-PR)
              </h3>
              {priceComparison.isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
              ) : pc?.postosProximos && pc.postosProximos.length > 0 ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {pc.postosProximos.map((p: any, i: number) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">{p.nome}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{p.endereco}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.rating > 0 && (
                            <div className="flex items-center gap-1">
                              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                              <span className="text-sm font-medium">{p.rating}</span>
                              <span className="text-xs text-gray-400">({p.totalRatings})</span>
                            </div>
                          )}
                          {p.aberto !== null && (
                            <Badge className={p.aberto ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                              {p.aberto ? "Aberto" : "Fechado"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-400 py-8">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  Nenhum posto encontrado na região
                </div>
              )}
              {pc?.postosProximos && pc.postosProximos.length > 0 && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="text-sm text-amber-800 font-medium mb-1">💡 Dica de Negociação</div>
                  <div className="text-xs text-amber-700">
                    Compare os preços dos postos encontrados com os preços que você está pagando atualmente.
                    Postos com avaliação alta e boa localização são bons candidatos para renegociação.
                    Leve o comparativo de preços para o posto atual e negocie com base na concorrência.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {pc?.mediaGeral && pc.mediaGeral.length > 0 && (
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-cyan-600" />
                Média de Preços por Tipo de Combustível (Últimos 3 meses)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {pc.mediaGeral.map((m: any, i: number) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-sm text-gray-500 mb-1">{m.tipo_combustivel}</div>
                    <div className="text-2xl font-bold text-gray-800">{fmt(m.preco_medio_geral)}<span className="text-sm text-gray-400">/L</span></div>
                    <div className="text-xs text-gray-400 mt-2">
                      Min: {fmt(m.menor_preco_geral)} · Max: {fmt(m.maior_preco_geral)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-600" />
              Histórico de Consolidações — {ano}
            </h3>
            {history.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : (history.data || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-3 py-2">Mês</th>
                      <th className="text-right px-3 py-2">Combustível</th>
                      <th className="text-right px-3 py-2">Manutenção</th>
                      <th className="text-right px-3 py-2">IPVA</th>
                      <th className="text-right px-3 py-2">Multas</th>
                      <th className="text-right px-3 py-2">Licenc.</th>
                      <th className="text-right px-3 py-2">Seguros</th>
                      <th className="text-right px-3 py-2 font-bold">Total</th>
                      <th className="text-center px-3 py-2">Status</th>
                      <th className="text-center px-3 py-2">Lanç. #</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(history.data as any[]).map((h: any) => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{MESES_FULL[h.mes]}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{fmt(h.custo_combustivel)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{fmt(h.custo_manutencao)}</td>
                        <td className="px-3 py-2 text-right text-amber-600">{fmt(h.custo_ipva)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{fmt(h.custo_multas)}</td>
                        <td className="px-3 py-2 text-right text-purple-600">{fmt(h.custo_licenciamento)}</td>
                        <td className="px-3 py-2 text-right text-cyan-600">{fmt(h.custo_seguro)}</td>
                        <td className="px-3 py-2 text-right font-bold">{fmt(h.custo_total)}</td>
                        <td className="px-3 py-2 text-center">
                          <Badge className={statusColor(h.status)}>{statusLabel(h.status)}</Badge>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-500">{h.financial_entry_id || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">Nenhuma consolidação registrada em {ano}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
