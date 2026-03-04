import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Search, Package, AlertTriangle, ShieldCheck, Calendar,
  DollarSign, TrendingUp, Users, Warehouse, X, Filter
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

type DrillDownType = "totalEpis" | "estoqueTotal" | "estoqueBaixo" | "caVencido" | "totalEntregas" | "entregasMes" | "valorInventario" | null;

interface EpiDrillDownProps {
  type: DrillDownType;
  onClose: () => void;
}

const TITLES: Record<string, { title: string; subtitle: string; color: string; icon: any }> = {
  totalEpis: { title: "Todos os EPIs Cadastrados", subtitle: "Catálogo completo de equipamentos", color: "bg-gradient-to-r from-blue-600 to-blue-800", icon: Package },
  estoqueTotal: { title: "Estoque Total", subtitle: "Todas as unidades em estoque", color: "bg-gradient-to-r from-green-600 to-green-800", icon: Warehouse },
  estoqueBaixo: { title: "Estoque Baixo", subtitle: "EPIs com 5 ou menos unidades em estoque", color: "bg-gradient-to-r from-amber-600 to-amber-800", icon: AlertTriangle },
  caVencido: { title: "CA Vencido", subtitle: "EPIs com Certificado de Aprovação vencido", color: "bg-gradient-to-r from-red-600 to-red-800", icon: ShieldCheck },
  totalEntregas: { title: "Total de Entregas", subtitle: "Todas as entregas realizadas", color: "bg-gradient-to-r from-purple-600 to-purple-800", icon: TrendingUp },
  entregasMes: { title: "Entregas do Mês", subtitle: "Entregas realizadas nos últimos 30 dias", color: "bg-gradient-to-r from-cyan-600 to-cyan-800", icon: Calendar },
  valorInventario: { title: "Valor do Inventário", subtitle: "Valor total dos EPIs em estoque", color: "bg-gradient-to-r from-emerald-600 to-emerald-800", icon: DollarSign },
};

export default function EpiDrillDown({ type, onClose }: EpiDrillDownProps) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId, 10) : 0;
  const [search, setSearch] = useState("");

  const episQ = trpc.epis.list.useQuery({ companyId }, { enabled: !!companyId });
  const deliveriesQ = trpc.epis.listDeliveries.useQuery({ companyId }, { enabled: !!companyId });

  const episList = episQ.data ?? [];
  const deliveriesList = deliveriesQ.data ?? [];
  const hoje = new Date().toISOString().split("T")[0];
  const ha30dias = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  }, []);

  if (!type) return null;
  const config = TITLES[type];
  const Icon = config.icon;

  // Filter data based on drill-down type
  const filteredData = useMemo(() => {
    const s = search.toLowerCase();

    switch (type) {
      case "totalEpis":
      case "estoqueTotal":
        return episList.filter((e: any) =>
          !s || (e.nome || "").toLowerCase().includes(s) || (e.ca || "").toLowerCase().includes(s)
        );
      case "estoqueBaixo":
        return episList
          .filter((e: any) => (e.quantidadeEstoque || 0) <= 5)
          .filter((e: any) => !s || (e.nome || "").toLowerCase().includes(s));
      case "caVencido":
        return episList
          .filter((e: any) => e.validadeCa && e.validadeCa < hoje)
          .filter((e: any) => !s || (e.nome || "").toLowerCase().includes(s));
      case "totalEntregas":
        return deliveriesList.filter((d: any) =>
          !s || (d.nomeEpi || "").toLowerCase().includes(s) || (d.nomeFunc || "").toLowerCase().includes(s)
        );
      case "entregasMes":
        return deliveriesList
          .filter((d: any) => d.dataEntrega >= ha30dias)
          .filter((d: any) => !s || (d.nomeEpi || "").toLowerCase().includes(s) || (d.nomeFunc || "").toLowerCase().includes(s));
      case "valorInventario":
        return episList
          .filter((e: any) => (e.quantidadeEstoque || 0) > 0)
          .sort((a: any, b: any) => {
            const va = (parseFloat(String(a.valorProduto || 0)) * (a.quantidadeEstoque || 0));
            const vb = (parseFloat(String(b.valorProduto || 0)) * (b.quantidadeEstoque || 0));
            return vb - va;
          })
          .filter((e: any) => !s || (e.nome || "").toLowerCase().includes(s));
      default:
        return [];
    }
  }, [type, episList, deliveriesList, search, hoje, ha30dias]);

  const isDeliveryView = type === "totalEntregas" || type === "entregasMes";

  const formatCurrency = (val: any) => {
    if (!val) return "—";
    return parseFloat(String(val)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ width: "100vw", height: "100vh" }}>
      {/* HEADER */}
      <div className={`shrink-0 ${config.color} text-white px-3 sm:px-6 py-3 flex items-center justify-between shadow-lg`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 h-9 w-9 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="bg-white/20 p-1.5 sm:p-2 rounded-lg shrink-0">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">{config.title}</h1>
            <p className="text-xs sm:text-sm text-white/80 hidden sm:block">{config.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className="bg-white/20 text-white border-0 text-xs sm:text-sm">
            {filteredData.length} {filteredData.length === 1 ? "item" : "itens"}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20 hidden sm:flex gap-1.5 border border-white/30">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="shrink-0 bg-white border-b px-3 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isDeliveryView ? "Buscar por EPI ou funcionário..." : "Buscar por nome ou CA..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        <div className="max-w-7xl mx-auto p-3 sm:p-6">
          {filteredData.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Icon className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Nenhum item encontrado.</p>
              </CardContent>
            </Card>
          ) : isDeliveryView ? (
            /* DELIVERY TABLE */
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
              {/* Mobile cards */}
              <div className="sm:hidden divide-y">
                {filteredData.map((d: any) => (
                  <div key={d.id} className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{d.nomeEpi}</span>
                      <Badge variant="outline" className="text-[10px]">x{d.quantidade || 1}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{d.nomeFunc || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {d.dataEntrega ? new Date(d.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </span>
                      <span className="font-medium">{formatCurrency(d.valorCobrado)}</span>
                    </div>
                    {d.motivo && <Badge variant="secondary" className="text-[10px]">{d.motivo}</Badge>}
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <table className="hidden sm:table w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">EPI</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Funcionário</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Qtd</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Data</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredData.map((d: any) => (
                    <tr key={d.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{d.nomeEpi}</td>
                      <td className="p-3">{d.nomeFunc || "—"}</td>
                      <td className="p-3 text-center">{d.quantidade || 1}</td>
                      <td className="p-3 text-center">
                        {d.dataEntrega ? new Date(d.dataEntrega + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="p-3 text-right">{formatCurrency(d.valorCobrado)}</td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className="text-xs">{d.motivo || d.motivoTroca || "Entrega regular"}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* EPI TABLE */
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
              {/* Mobile cards */}
              <div className="sm:hidden divide-y">
                {filteredData.map((epi: any) => {
                  const caVencido = epi.validadeCa && epi.validadeCa < hoje;
                  const estoqueBaixo = (epi.quantidadeEstoque || 0) <= 5;
                  const valorTotal = (parseFloat(String(epi.valorProduto || 0)) * (epi.quantidadeEstoque || 0));
                  return (
                    <div key={epi.id} className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{epi.nome}</span>
                        <Badge variant={estoqueBaixo ? "destructive" : "secondary"} className="text-[10px]">
                          Est: {epi.quantidadeEstoque ?? 0}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {epi.ca && (
                          <Badge variant={caVencido ? "destructive" : "outline"} className="text-[10px]">
                            CA {epi.ca}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{epi.categoria || "EPI"}</Badge>
                        {epi.tamanho && <Badge variant="outline" className="text-[10px]">{epi.tamanho}</Badge>}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{epi.fabricante || "—"}</span>
                        {type === "valorInventario" && (
                          <span className="font-medium text-emerald-700">{formatCurrency(valorTotal)}</span>
                        )}
                        {type === "caVencido" && epi.validadeCa && (
                          <span className="text-red-600 font-medium">
                            Vencido: {new Date(epi.validadeCa + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <table className="hidden sm:table w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">EPI</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">CA</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Categoria</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Tamanho</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Fabricante</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Estoque</th>
                    {type === "caVencido" && (
                      <th className="text-center p-3 font-medium text-muted-foreground">Validade CA</th>
                    )}
                    {type === "valorInventario" && (
                      <>
                        <th className="text-right p-3 font-medium text-muted-foreground">Valor Unit.</th>
                        <th className="text-right p-3 font-medium text-muted-foreground">Valor Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredData.map((epi: any) => {
                    const caVencido = epi.validadeCa && epi.validadeCa < hoje;
                    const estoqueBaixo = (epi.quantidadeEstoque || 0) <= 5;
                    const valorTotal = (parseFloat(String(epi.valorProduto || 0)) * (epi.quantidadeEstoque || 0));
                    return (
                      <tr key={epi.id} className="hover:bg-muted/30">
                        <td className="p-3 font-medium">{epi.nome}</td>
                        <td className="p-3 text-center">
                          {epi.ca ? (
                            <Badge variant={caVencido ? "destructive" : "outline"} className="text-xs">
                              {epi.ca}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className="text-xs">{epi.categoria || "EPI"}</Badge>
                        </td>
                        <td className="p-3 text-center">{epi.tamanho || "—"}</td>
                        <td className="p-3">{epi.fabricante || "—"}</td>
                        <td className="p-3 text-center">
                          <Badge variant={estoqueBaixo ? "destructive" : "secondary"} className="text-xs">
                            {epi.quantidadeEstoque ?? 0}
                          </Badge>
                        </td>
                        {type === "caVencido" && (
                          <td className="p-3 text-center">
                            <Badge variant="destructive" className="text-xs">
                              {epi.validadeCa ? new Date(epi.validadeCa + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                            </Badge>
                          </td>
                        )}
                        {type === "valorInventario" && (
                          <>
                            <td className="p-3 text-right">{formatCurrency(epi.valorProduto)}</td>
                            <td className="p-3 text-right font-medium text-emerald-700">{formatCurrency(valorTotal)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {type === "valorInventario" && (
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={6} className="p-3 text-right font-bold">Total:</td>
                      <td className="p-3 text-right"></td>
                      <td className="p-3 text-right font-bold text-emerald-700">
                        {formatCurrency(filteredData.reduce((s: number, e: any) =>
                          s + (parseFloat(String(e.valorProduto || 0)) * (e.quantidadeEstoque || 0)), 0
                        ))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type { DrillDownType };
