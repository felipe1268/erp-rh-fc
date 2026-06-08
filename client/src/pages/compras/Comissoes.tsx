import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { TrendingDown, Loader2, DollarSign, Award, BarChart3, ShoppingCart, AlertTriangle, Building2, Filter } from "lucide-react";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  em_aberto:        { label: "Em Aberto",  cls: "bg-gray-100 text-gray-600" },
  aprovada_diretor: { label: "Aprovada",   cls: "bg-green-100 text-green-700" },
  paga:             { label: "Paga",       cls: "bg-blue-100 text-blue-700" },
};

const OC_STATUS: Record<string, { label: string; cls: string }> = {
  pendente:   { label: "Pendente",   cls: "bg-gray-100 text-gray-600" },
  aprovada:   { label: "Aprovada",   cls: "bg-blue-100 text-blue-700" },
  entregue:   { label: "Entregue",   cls: "bg-green-100 text-green-700" },
  cancelada:  { label: "Cancelada",  cls: "bg-red-100 text-red-700" },
  recebido:   { label: "Recebido",   cls: "bg-green-100 text-green-700" },
};

export default function ComprasComissoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;
  const [obraFiltro, setObraFiltro] = useState<string>("todas");

  const { data: configData } = trpc.purchase.getConfigCompras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: comissoesData, isLoading: loadingComissoes } = trpc.purchase.listarComissoes.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: ocsData, isLoading: loadingOCs } = trpc.purchase.analiseComissoesOCs.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: obras } = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });

  const comissoes = comissoesData ?? [];
  const ocsAll = ocsData ?? [];
  const pctConfig = Number(configData?.config?.comissaoPercentual ?? 10);

  const obraMap = Object.fromEntries((obras ?? []).map((o: any) => [String(o.id), o.nome]));

  const obrasComOC = [...new Set(ocsAll.map((oc: any) => String(oc.obraId)))].sort((a, b) => {
    const nA = obraMap[a] || a;
    const nB = obraMap[b] || b;
    return nA.localeCompare(nB);
  });

  const ocs = obraFiltro === "todas" ? ocsAll : ocsAll.filter((oc: any) => String(oc.obraId) === obraFiltro);
  const comissoesFiltradas = obraFiltro === "todas" ? comissoes : comissoes.filter((c: any) => String(c.obraId) === obraFiltro);

  const totalCompradoOCs = ocs.reduce((s: number, oc: any) => s + (oc.valorComprado || 0), 0);
  const ocsSemlMeta = ocs.filter((oc: any) => !oc.temMeta);

  const obraSaldoMap: Record<string, { totalMeta: number; totalComprado: number; saldo: number }> = {};
  for (const oc of ocsAll) {
    if (!oc.temMeta) continue;
    const key = String(oc.obraId);
    if (!obraSaldoMap[key]) obraSaldoMap[key] = { totalMeta: 0, totalComprado: 0, saldo: 0 };
    obraSaldoMap[key].totalMeta += oc.valorMeta || 0;
    obraSaldoMap[key].totalComprado += oc.valorComprado || 0;
  }
  for (const key of Object.keys(obraSaldoMap)) {
    const o = obraSaldoMap[key];
    o.saldo = o.totalMeta - o.totalComprado;
  }

  const obrasFiltradasKeys = obraFiltro === "todas" ? Object.keys(obraSaldoMap) : [obraFiltro];
  const economiaObras = obrasFiltradasKeys.reduce((s, key) => s + Math.max(0, obraSaldoMap[key]?.saldo ?? 0), 0);
  const comissaoPotencial = economiaObras * (pctConfig / 100);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const isLoading = loadingComissoes || loadingOCs;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Award className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analise de Comissoes</h1>
              <p className="text-sm text-gray-500">
                Percentual configurado: <span className="font-bold text-yellow-700">{pctConfig}%</span> sobre a economia negociada
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              className="h-9 px-3 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-300 min-w-[200px]"
              value={obraFiltro}
              onChange={e => setObraFiltro(e.target.value)}
            >
              <option value="todas">Todas as Obras</option>
              {obrasComOC.map(obraId => (
                <option key={obraId} value={obraId}>
                  {obraMap[obraId] || `Obra ${obraId}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {obraFiltro !== "todas" && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
            <Building2 className="h-4 w-4 text-yellow-600 shrink-0" />
            <span className="text-yellow-800">
              Filtrando por: <span className="font-bold">{obraMap[obraFiltro] || `Obra ${obraFiltro}`}</span>
            </span>
            <button
              className="ml-auto text-xs text-yellow-700 hover:text-yellow-900 underline"
              onClick={() => setObraFiltro("todas")}
            >
              Limpar filtro
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="group relative">
            <Card className="border-green-200 bg-green-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="h-7 w-7 text-green-600 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-green-700">{fmt(totalCompradoOCs)}</p>
                    <p className="text-xs text-green-600">Total Comprado ({ocs.length} OCs)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">Total Comprado</div>
              <div>Soma do valor total de todas as Ordens de Compra (OCs) emitidas{obraFiltro !== "todas" ? " para esta obra" : ""}. Inclui apenas OCs com status ativo (exclui canceladas).</div>
            </div>
          </div>
          <div className="group relative">
            <Card className="border-emerald-200 bg-emerald-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <TrendingDown className="h-7 w-7 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-emerald-700">{fmt(economiaObras)}</p>
                    <p className="text-xs text-emerald-600">Saldo Positivo (por Obra)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">Saldo Positivo por Obra</div>
              <div>Calculado por obra: Meta Total da Obra - Total Comprado na Obra. Se uma OC economizou mas outra estourou, o estouro reduz o saldo. Somente obras com saldo positivo geram comissao. Economias isoladas por OC nao contam se a obra estourar no total.</div>
            </div>
          </div>
          <div className="group relative">
            <Card className="border-yellow-200 bg-yellow-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-7 w-7 text-yellow-600 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-yellow-700">{fmt(comissaoPotencial)}</p>
                    <p className="text-xs text-yellow-600">Comissao Potencial ({pctConfig}%)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">Comissao Potencial</div>
              <div>Percentual ({pctConfig}%) aplicado sobre a economia identificada. Representa o valor que pode ser pago como bonificacao ao comprador pela negociacao abaixo do preco meta do orcamento.</div>
            </div>
          </div>
          <div className="group relative">
            <Card className="border-orange-200 bg-orange-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-7 w-7 text-orange-500 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-orange-700">{ocsSemlMeta.length}</p>
                    <p className="text-xs text-orange-600">OCs sem Preco Meta</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">OCs sem Preco Meta</div>
              <div>Ordens de Compra cujos itens nao possuem preco meta do orcamento vinculado. Sem preco meta, nao e possivel calcular economia nem comissao. Ideal: zero — todas as OCs devem ter referencia de preco meta.</div>
            </div>
          </div>
        </div>

        {obrasComOC.length > 1 && obraFiltro === "todas" && (
          <Card className="border-yellow-100">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-yellow-600" />
                Ranking por Obra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {obrasComOC.map(obraId => {
                  const ocsObra = ocsAll.filter((oc: any) => String(oc.obraId) === obraId);
                  const infoObra = obraSaldoMap[obraId];
                  const saldoObra = infoObra?.saldo ?? 0;
                  const comObra = Math.max(0, saldoObra) * (pctConfig / 100);
                  const semMetaObra = ocsObra.filter((oc: any) => !oc.temMeta).length;
                  return (
                    <div
                      key={obraId}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-100 hover:border-yellow-300 hover:bg-yellow-50/50 cursor-pointer transition-colors"
                      onClick={() => setObraFiltro(obraId)}
                    >
                      <Building2 className="h-5 w-5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{obraMap[obraId] || `Obra ${obraId}`}</div>
                        <div className="text-[10px] text-gray-400">{ocsObra.length} OC(s){semMetaObra > 0 ? ` · ${semMetaObra} sem meta` : ""}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-gray-600">Meta: <span className="font-semibold">{fmt(infoObra?.totalMeta ?? 0)}</span></div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-gray-600">Comprado: <span className="font-semibold">{fmt(infoObra?.totalComprado ?? 0)}</span></div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs ${saldoObra >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          Saldo: <span className="font-semibold">{fmt(saldoObra)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-yellow-700">Comissao: <span className="font-bold">{fmt(comObra)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5" />
              Ordens de Compra — Analise de Economia
              {obraFiltro !== "todas" && (
                <span className="text-xs font-normal text-gray-500 ml-2">({obraMap[obraFiltro] || `Obra ${obraFiltro}`})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : ocs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Nenhuma ordem de compra encontrada{obraFiltro !== "todas" ? " para esta obra" : ""}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OC</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-right">Valor Meta</TableHead>
                    <TableHead className="text-right">Valor Comprado</TableHead>
                    <TableHead className="text-right">Dif. Item</TableHead>
                    <TableHead className="text-right">Saldo Obra</TableHead>
                    <TableHead className="text-right">Comissao ({pctConfig}%)</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ocs.map((oc: any) => {
                    const st = OC_STATUS[oc.status] || { label: oc.status, cls: "bg-gray-100 text-gray-600" };
                    const obraKey = String(oc.obraId);
                    const saldoObra = obraSaldoMap[obraKey]?.saldo ?? 0;
                    const obraPositiva = saldoObra > 0;
                    return (
                      <TableRow key={oc.id}>
                        <TableCell className="font-mono text-xs font-medium">{formatNumeroOcDisplay(oc.numeroOc)}</TableCell>
                        <TableCell>{oc.fornecedorNome || "—"}</TableCell>
                        <TableCell>{obraMap[obraKey] || "Obra " + oc.obraId}</TableCell>
                        <TableCell className="text-right">
                          {oc.temMeta ? (
                            <span className="font-medium">{fmt(oc.valorMeta)}</span>
                          ) : (
                            <span className="text-orange-500 text-xs">Sem meta</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{fmt(oc.valorComprado)}</TableCell>
                        <TableCell className="text-right">
                          {oc.temMeta ? (
                            <span className={`font-medium ${oc.economia > 0 ? "text-green-700" : oc.economia < 0 ? "text-red-600" : "text-gray-500"}`}>
                              {fmt(oc.economia)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {oc.temMeta ? (
                            <span className={`text-xs font-medium ${saldoObra > 0 ? "text-emerald-600" : saldoObra < 0 ? "text-red-600" : "text-gray-500"}`}>
                              {fmt(saldoObra)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!oc.temMeta ? (
                            <span className="text-gray-400">—</span>
                          ) : !obraPositiva ? (
                            <span className="text-red-400 text-xs">Obra c/ deficit</span>
                          ) : (
                            <span className="text-yellow-600 text-xs">Ver saldo obra</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={st.cls}>{st.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {comissoesFiltradas.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-5 w-5" />
                Comissoes Formalizadas
                {obraFiltro !== "todas" && (
                  <span className="text-xs font-normal text-gray-500 ml-2">({obraMap[obraFiltro] || `Obra ${obraFiltro}`})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-right">Meta</TableHead>
                    <TableHead className="text-right">Comprado</TableHead>
                    <TableHead className="text-right">Economia</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-right">Comissao</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoesFiltradas.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.compradorNome || "—"}</TableCell>
                      <TableCell>{c.obraNome || obraMap[String(c.obraId)] || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.valorMetaTotal || 0))}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.valorCompradoTotal || 0))}</TableCell>
                      <TableCell className="text-right font-medium text-green-700">{fmt(Number(c.economiaTotal || 0))}</TableCell>
                      <TableCell className="text-center">{Number(c.percentualParticipacao || 0).toFixed(0)}%</TableCell>
                      <TableCell className="text-right font-bold text-yellow-700">{fmt(Number(c.valorComissao || 0))}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).cls}>
                          {(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700">
            <span className="font-bold">Como funciona:</span> A comissao e calculada sobre o <span className="font-bold">saldo global da obra</span> (Meta Total - Total Comprado). Se um item economizou mas a obra estourou no geral, a comissao e reduzida ou zerada. Somente obras com saldo positivo geram comissao. O percentual de {pctConfig}% e configuravel em Configuracoes Gerais, secao Compras. OCs "Sem meta" nao entram no calculo ate que o preco meta seja definido.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
