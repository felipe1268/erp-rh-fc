import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Fuel, MapPin, DollarSign, BarChart3, RefreshCw, Info, Navigation,
  Plus, Trash2, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  AlertTriangle, CheckCircle2, Trophy, Award,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const MESES_BR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const FUEL_COLORS: Record<string, string> = {
  "Gasolina": "#3b82f6",
  "Diesel S10": "#f59e0b",
  "Etanol": "#10b981",
  "Diesel": "#ef4444",
  "GNV": "#8b5cf6",
};

const BASE_LAT = -22.8117;
const BASE_LNG = -45.1928;

interface NearbyStation {
  id: number;
  name: string;
  lat: number;
  lng: number;
  brand?: string;
  distance: number;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function PrecosCombustivel() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId || 0;
  const [ano, setAno] = useState(new Date().getFullYear());
  const [stations, setStations] = useState<NearbyStation[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [showAddPrice, setShowAddPrice] = useState(false);
  const [newTipo, setNewTipo] = useState("Gasolina");
  const [newPreco, setNewPreco] = useState("");
  const [newPosto, setNewPosto] = useState("");
  const [newCidade, setNewCidade] = useState("Guaratinguetá");

  const { data: prices } = trpc.frotas.getFuelPrices.useQuery(
    { companyId, ano },
    { enabled: companyId > 0 }
  );

  const { data: market, refetch: refetchMarket } = trpc.frotas.getMarketPrices.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );

  const saveMutation = trpc.frotas.saveMarketPrice.useMutation({
    onSuccess: () => { refetchMarket(); setShowAddPrice(false); setNewPreco(""); setNewPosto(""); },
  });
  const deleteMutation = trpc.frotas.deleteMarketPrice.useMutation({
    onSuccess: () => refetchMarket(),
  });

  const comparison = useMemo(() => {
    if (!prices?.byType || !market?.avgByType) return [];
    return prices.byType.map((ft: any) => {
      const mkt = market.avgByType.find((m: any) => m.tipo_combustivel === ft.tipo_combustivel);
      const best = market.bestByType?.find((b: any) => b.tipo_combustivel === ft.tipo_combustivel);
      const seuPreco = parseFloat(ft.preco_medio);
      const mktPreco = mkt ? parseFloat(mkt.preco_medio) : null;
      const diff = mktPreco ? seuPreco - mktPreco : null;
      const pct = mktPreco && mktPreco > 0 ? ((seuPreco - mktPreco) / mktPreco) * 100 : null;
      return {
        tipo: ft.tipo_combustivel,
        seuPreco,
        mktPreco,
        diff,
        pct,
        status: diff === null ? 'sem_dados' : diff > 0.05 ? 'acima' : diff < -0.05 ? 'abaixo' : 'ok',
        melhorPosto: best?.posto || null,
        melhorPreco: best ? parseFloat(best.preco) : null,
        melhorCidade: best?.cidade || null,
      };
    });
  }, [prices?.byType, market?.avgByType, market?.bestByType]);

  const initMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current).setView([BASE_LAT, BASE_LNG], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const baseIcon = L.divIcon({
      html: '<div style="background:#1e40af;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)">FC</div>',
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([BASE_LAT, BASE_LNG], { icon: baseIcon })
      .addTo(map)
      .bindPopup("<strong>FC Engenharia — Base</strong><br/>Guaratinguetá, SP");

    mapInstanceRef.current = map;
  }, []);

  const searchStations = useCallback(async () => {
    setLoadingMap(true);
    setMapError(null);

    try {
      const query = `[out:json][timeout:15];node["amenity"="fuel"](around:15000,${BASE_LAT},${BASE_LNG});out body;`;
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Erro na API Overpass");
      const data = await res.json();

      const found: NearbyStation[] = data.elements
        .filter((e: any) => e.lat && e.lon)
        .map((e: any) => ({
          id: e.id,
          name: e.tags?.name || e.tags?.brand || "Posto sem nome",
          lat: e.lat,
          lng: e.lon,
          brand: e.tags?.brand || e.tags?.operator || "",
          distance: Math.round(haversine(BASE_LAT, BASE_LNG, e.lat, e.lon)),
        }))
        .sort((a: NearbyStation, b: NearbyStation) => a.distance - b.distance);

      setStations(found);

      if (mapInstanceRef.current) {
        const map = mapInstanceRef.current;
        map.eachLayer((layer) => {
          if (layer instanceof L.Marker && !(layer.getPopup()?.getContent()?.toString().includes("FC Engenharia"))) {
            map.removeLayer(layer);
          }
        });

        const fuelIcon = L.divIcon({
          html: '<div style="background:#ef4444;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.3)">⛽</div>',
          className: '',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        found.forEach((s) => {
          L.marker([s.lat, s.lng], { icon: fuelIcon })
            .addTo(map)
            .bindPopup(`<div style="font-family:sans-serif;font-size:13px;min-width:180px">
              <strong>${s.name}</strong>
              ${s.brand ? `<br/><span style="color:#666">${s.brand}</span>` : ''}
              <br/><span style="color:#1e40af;font-weight:bold">${(s.distance / 1000).toFixed(1)} km da base</span>
            </div>`);
        });
      }
    } catch (err: any) {
      setMapError(err.message || "Erro ao buscar postos");
    } finally {
      setLoadingMap(false);
    }
  }, []);

  useEffect(() => {
    initMap();
    searchStations();
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const chartData = useMemo(() => {
    if (!prices?.byMonth) return [];
    const months = new Map<string, any>();
    prices.byMonth.forEach((row: any) => {
      if (!months.has(row.mes)) {
        const [y, m] = row.mes.split("-");
        months.set(row.mes, { mes: `${MESES_BR[parseInt(m) - 1]}/${y}` });
      }
      const entry = months.get(row.mes);
      entry[row.tipo_combustivel] = parseFloat(row.preco_medio);
    });
    return Array.from(months.values());
  }, [prices?.byMonth]);

  const fuelTypes = useMemo(() => {
    if (!prices?.byType) return [];
    return prices.byType.map((t: any) => ({
      tipo: t.tipo_combustivel,
      qtd: t.qtd,
      precoMedio: parseFloat(t.preco_medio),
      precoMin: parseFloat(t.preco_min),
      precoMax: parseFloat(t.preco_max),
      totalGasto: parseFloat(t.total_gasto),
      totalLitros: parseFloat(t.total_litros),
    }));
  }, [prices?.byType]);

  const postos = useMemo(() => {
    if (!prices?.byPosto) return [];
    const map = new Map<string, any>();
    prices.byPosto.forEach((row: any) => {
      const key = row.posto;
      if (!map.has(key)) {
        map.set(key, { posto: key, combustiveis: [], totalLitros: 0, totalValor: 0 });
      }
      const entry = map.get(key);
      entry.combustiveis.push({
        tipo: row.tipo_combustivel,
        preco: parseFloat(row.preco_medio),
        litros: parseFloat(row.litros),
        valor: parseFloat(row.valor),
        qtd: row.qtd,
      });
      entry.totalLitros += parseFloat(row.litros);
      entry.totalValor += parseFloat(row.valor);
    });
    return Array.from(map.values());
  }, [prices?.byPosto]);

  return (
    <DashboardLayout title="Preços Combustível">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Fuel className="h-5 w-5 text-blue-600" />
              Análise de Preços de Combustível — {ano}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Comparação de preços pagos vs mercado regional (Guaratinguetá / Aparecida)
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAno(ano - 1)}>
              ← {ano - 1}
            </Button>
            <Badge variant="secondary" className="text-sm px-3 py-1">{ano}</Badge>
            <Button variant="outline" size="sm" onClick={() => setAno(ano + 1)}>
              {ano + 1} →
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {fuelTypes.map((ft) => (
            <Card key={ft.tipo} className="border-l-4" style={{ borderLeftColor: FUEL_COLORS[ft.tipo] || "#94a3b8" }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Fuel className="h-4 w-4" style={{ color: FUEL_COLORS[ft.tipo] || "#94a3b8" }} />
                    <span className="font-bold text-sm">{ft.tipo}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{ft.qtd} abast.</Badge>
                </div>
                <div className="text-2xl font-bold" style={{ color: FUEL_COLORS[ft.tipo] || "#94a3b8" }}>
                  R$ {ft.precoMedio.toFixed(4)}<span className="text-sm font-normal text-muted-foreground">/litro</span>
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>Min: R$ {ft.precoMin.toFixed(4)}</span>
                  <span>Max: R$ {ft.precoMax.toFixed(4)}</span>
                </div>
                <div className="mt-2 pt-2 border-t text-xs flex justify-between">
                  <span>{ft.totalLitros.toLocaleString("pt-BR")} litros</span>
                  <span className="font-medium">{fmt(ft.totalGasto)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                Preços de Mercado — Atualização Diária
              </CardTitle>
              <Button size="sm" onClick={() => setShowAddPrice(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                Registrar Preço
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Compare seus preços de abastecimento com os preços pesquisados na região
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {comparison.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {comparison.map((c) => {
                  const color = FUEL_COLORS[c.tipo] || "#94a3b8";
                  return (
                    <div key={c.tipo} className="p-4 rounded-xl border bg-gradient-to-br from-background to-muted/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Fuel className="h-4 w-4" style={{ color }} />
                        <span className="font-bold text-sm">{c.tipo}</span>
                        {c.status === 'acima' && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-auto">
                            <ArrowUpRight className="h-3 w-3 mr-0.5" /> Acima
                          </Badge>
                        )}
                        {c.status === 'abaixo' && (
                          <Badge className="text-[10px] px-1.5 py-0 ml-auto bg-emerald-600">
                            <ArrowDownRight className="h-3 w-3 mr-0.5" /> Abaixo
                          </Badge>
                        )}
                        {c.status === 'ok' && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" /> Na faixa
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Seu Preço</p>
                          <p className="text-lg font-bold" style={{ color }}>
                            R$ {c.seuPreco.toFixed(4)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mercado</p>
                          <p className="text-lg font-bold text-foreground">
                            {c.mktPreco ? `R$ ${c.mktPreco.toFixed(4)}` : '—'}
                          </p>
                        </div>
                      </div>
                      {c.diff !== null && (
                        <div className={`mt-3 pt-2 border-t flex items-center gap-2 text-xs ${
                          c.diff > 0 ? 'text-red-600' : c.diff < 0 ? 'text-emerald-600' : 'text-muted-foreground'
                        }`}>
                          {c.diff > 0 ? <TrendingUp className="h-3 w-3" /> : c.diff < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                          <span className="font-semibold">
                            {c.diff > 0 ? '+' : ''}{c.diff.toFixed(4)} ({c.pct!.toFixed(1)}%)
                          </span>
                          <span className="text-muted-foreground">
                            {c.diff > 0 ? 'pagando a mais' : c.diff < 0 ? 'pagando a menos' : 'preço igual'}
                          </span>
                        </div>
                      )}
                      {c.melhorPosto && c.melhorPreco !== null && (
                        <div className="mt-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800">
                          <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider font-semibold mb-1">
                            <Trophy className="h-3 w-3" />
                            Melhor Preço
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300 truncate flex-1 mr-2">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              {c.melhorPosto}
                              {c.melhorCidade && <span className="text-emerald-600 dark:text-emerald-500"> • {c.melhorCidade}</span>}
                            </div>
                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                              R$ {c.melhorPreco.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {market?.latest && market.latest.length > 0 && (
              <div className="overflow-auto">
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Preços Pesquisados por Posto
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                      <th className="py-2 px-3 text-left font-semibold">Posto</th>
                      <th className="py-2 px-2 text-left font-semibold">Combustível</th>
                      <th className="py-2 px-2 text-right font-semibold">R$/Litro</th>
                      <th className="py-2 px-2 text-left font-semibold">Cidade</th>
                      <th className="py-2 px-2 text-left font-semibold">Fonte</th>
                      <th className="py-2 px-2 text-right font-semibold">Data</th>
                      <th className="py-2 px-2 text-center font-semibold w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.latest.map((row: any) => {
                      const isBest = market.bestByType?.some(
                        (b: any) => b.tipo_combustivel === row.tipo_combustivel &&
                          b.posto === row.posto &&
                          parseFloat(b.preco) === parseFloat(row.preco)
                      );
                      return (
                        <tr key={row.id} className={`border-b hover:bg-muted/30 ${isBest ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''}`}>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              {isBest ? <Trophy className="h-3 w-3 text-amber-500" /> : <MapPin className="h-3 w-3 text-emerald-500" />}
                              <span className={isBest ? 'font-semibold' : ''}>{row.posto}</span>
                              {isBest && (
                                <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700">
                                  Melhor Preço
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" style={{ borderColor: FUEL_COLORS[row.tipo_combustivel] || "#94a3b8", color: FUEL_COLORS[row.tipo_combustivel] || "#94a3b8" }}>
                              {row.tipo_combustivel}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-right font-bold" style={{ color: FUEL_COLORS[row.tipo_combustivel] || "#94a3b8" }}>
                            R$ {parseFloat(row.preco).toFixed(4)}
                          </td>
                          <td className="py-2 px-2 text-sm">{row.cidade}</td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">{row.fonte}</td>
                          <td className="py-2 px-2 text-right text-xs">
                            {new Date(row.data).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                              onClick={() => deleteMutation.mutate({ id: row.id, companyId })}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {(!market?.latest || market.latest.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                <p className="font-medium">Nenhum preço de mercado registrado</p>
                <p className="text-xs mt-1">Clique em "Registrar Preço" para adicionar os preços praticados pelos postos da região</p>
              </div>
            )}

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-xs text-emerald-800 dark:text-emerald-300">
                  <strong>Como usar:</strong> Pesquise os preços nos postos da região (app ANP "Preço da Hora", ligação ou visita)
                  e registre aqui para comparar automaticamente com seus abastecimentos. Atualize diariamente para ter
                  a melhor referência de negociação.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showAddPrice} onOpenChange={setShowAddPrice}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-600" />
                Registrar Preço de Mercado
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Combustível</label>
                <Select value={newTipo} onValueChange={setNewTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gasolina">Gasolina</SelectItem>
                    <SelectItem value="Diesel S10">Diesel S10</SelectItem>
                    <SelectItem value="Etanol">Etanol</SelectItem>
                    <SelectItem value="Diesel">Diesel Comum</SelectItem>
                    <SelectItem value="GNV">GNV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Preço por Litro (R$)</label>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="Ex: 6.2900"
                  value={newPreco}
                  onChange={(e) => setNewPreco(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Posto</label>
                <Input
                  placeholder="Ex: Posto Shell Centro"
                  value={newPosto}
                  onChange={(e) => setNewPosto(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cidade</label>
                <Select value={newCidade} onValueChange={setNewCidade}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Guaratinguetá">Guaratinguetá</SelectItem>
                    <SelectItem value="Aparecida">Aparecida</SelectItem>
                    <SelectItem value="Lorena">Lorena</SelectItem>
                    <SelectItem value="Canas">Canas</SelectItem>
                    <SelectItem value="Potim">Potim</SelectItem>
                    <SelectItem value="Roseira">Roseira</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!newPreco || parseFloat(newPreco) <= 0 || saveMutation.isPending}
                onClick={() => {
                  saveMutation.mutate({
                    companyId,
                    tipo_combustivel: newTipo,
                    preco: parseFloat(newPreco),
                    posto: newPosto || undefined,
                    cidade: newCidade || undefined,
                    fonte: 'Manual',
                  });
                }}
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar Preço'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {postos.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Preço por Posto — Seus Abastecimentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="py-2 px-3 text-left font-semibold">Posto</th>
                      <th className="py-2 px-2 text-right font-semibold">Combustível</th>
                      <th className="py-2 px-2 text-right font-semibold">R$/Litro</th>
                      <th className="py-2 px-2 text-right font-semibold">Litros</th>
                      <th className="py-2 px-2 text-right font-semibold">Total Gasto</th>
                      <th className="py-2 px-2 text-right font-semibold">Abast.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postos.map((p) =>
                      p.combustiveis.map((c: any, idx: number) => (
                        <tr key={`${p.posto}-${c.tipo}`} className="border-b hover:bg-muted/30">
                          {idx === 0 && (
                            <td className="py-2 px-3 font-medium" rowSpan={p.combustiveis.length}>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-blue-500" />
                                {p.posto}
                              </div>
                            </td>
                          )}
                          <td className="py-2 px-2 text-right">
                            <Badge variant="outline" style={{ borderColor: FUEL_COLORS[c.tipo] || "#94a3b8", color: FUEL_COLORS[c.tipo] || "#94a3b8" }}>
                              {c.tipo}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-right font-bold" style={{ color: FUEL_COLORS[c.tipo] || "#94a3b8" }}>
                            R$ {c.preco.toFixed(4)}
                          </td>
                          <td className="py-2 px-2 text-right">{c.litros.toLocaleString("pt-BR")}</td>
                          <td className="py-2 px-2 text-right">{fmt(c.valor)}</td>
                          <td className="py-2 px-2 text-right">{c.qtd}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {chartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                Evolução do Preço/Litro — {ano}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `R$ ${v.toFixed(2)}`}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => [`R$ ${v.toFixed(4)}`, name]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend />
                  {fuelTypes.map((ft) => (
                    <Line
                      key={ft.tipo}
                      type="monotone"
                      dataKey={ft.tipo}
                      stroke={FUEL_COLORS[ft.tipo] || "#94a3b8"}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-600" />
                Postos Próximos — Guaratinguetá / Aparecida
              </CardTitle>
              <Button variant="outline" size="sm" onClick={searchStations} disabled={loadingMap}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingMap ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Postos de combustível num raio de 15km da base da FC Engenharia (dados OpenStreetMap)
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div
                ref={mapRef}
                className="rounded-lg border min-h-[400px] z-0"
                style={{ height: 400 }}
              />
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {stations.length > 0 ? `${stations.length} postos encontrados` : loadingMap ? "Buscando postos..." : "Carregando..."}
                </div>
                {mapError && <p className="text-sm text-red-500">{mapError}</p>}
                {stations.map((s, i) => (
                  <div
                    key={s.id}
                    className="p-3 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => {
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.setView([s.lat, s.lng], 16);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                          <span className="font-medium text-sm">{s.name}</span>
                        </div>
                        {s.brand && s.brand !== s.name && (
                          <p className="text-xs text-muted-foreground mt-0.5 ml-7">{s.brand}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        <Navigation className="h-3 w-3 mr-1" />
                        {(s.distance / 1000).toFixed(1)} km
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>Dica:</strong> Consulte o app da ANP (Preço da Hora) ou o site precodoscombustiveis.com.br
                  para ver os preços atualizados na sua região. Compare com os valores dos seus abastecimentos acima
                  para negociar melhores condições com outros postos da lista.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
