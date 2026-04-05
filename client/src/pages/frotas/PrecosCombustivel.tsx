import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Fuel, TrendingUp, TrendingDown, MapPin, Search, DollarSign,
  BarChart3, ArrowUpRight, ArrowDownRight, Minus, RefreshCw, Info,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

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
const SEARCH_RADIUS = 15000;

interface NearbyStation {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  placeId: string;
  distance?: number;
}

export default function PrecosCombustivel() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId || 0;
  const [ano, setAno] = useState(new Date().getFullYear());
  const [stations, setStations] = useState<NearbyStation[]>([]);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  const { data: prices } = trpc.frotas.getFuelPrices.useQuery(
    { companyId, ano },
    { enabled: companyId > 0 }
  );

  const { data: mapsKeyData } = trpc.frotas.getGoogleMapsKey.useQuery();

  useEffect(() => {
    if (!mapsKeyData?.key) return;
    if ((window as any).google?.maps) {
      setScriptLoaded(true);
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      existing.addEventListener('load', () => setScriptLoaded(true));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKeyData.key}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => setMapError("Erro ao carregar Google Maps");
    document.head.appendChild(script);
  }, [mapsKeyData?.key]);

  const searchStations = useCallback(() => {
    if (!scriptLoaded || !mapRef.current) return;
    setLoadingMap(true);
    setMapError(null);

    const google = (window as any).google;
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: BASE_LAT, lng: BASE_LNG },
      zoom: 13,
      styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
    });
    mapInstanceRef.current = map;

    new google.maps.Marker({
      position: { lat: BASE_LAT, lng: BASE_LNG },
      map,
      title: "FC Engenharia - Base",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: "#1e40af",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 3,
      },
      label: { text: "FC", color: "#fff", fontSize: "9px", fontWeight: "bold" },
    });

    const service = new google.maps.places.PlacesService(map);
    service.nearbySearch(
      {
        location: { lat: BASE_LAT, lng: BASE_LNG },
        radius: SEARCH_RADIUS,
        type: "gas_station",
      },
      (results: any[], status: string) => {
        setLoadingMap(false);
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
          setMapError("Nenhum posto encontrado na região");
          return;
        }

        const found: NearbyStation[] = results.map((place: any) => {
          const dist = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(BASE_LAT, BASE_LNG),
            place.geometry.location
          );
          return {
            name: place.name,
            address: place.vicinity || "",
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            rating: place.rating,
            placeId: place.place_id,
            distance: Math.round(dist),
          };
        }).sort((a: NearbyStation, b: NearbyStation) => (a.distance || 0) - (b.distance || 0));

        setStations(found);

        found.forEach((s) => {
          const marker = new google.maps.Marker({
            position: { lat: s.lat, lng: s.lng },
            map,
            title: s.name,
            icon: {
              url: "https://maps.google.com/mapfiles/ms/icons/gas.png",
              scaledSize: new google.maps.Size(32, 32),
            },
          });
          const infoWindow = new google.maps.InfoWindow({
            content: `<div style="font-family:sans-serif;font-size:13px;min-width:180px">
              <strong>${s.name}</strong><br/>
              <span style="color:#666">${s.address}</span><br/>
              <span style="color:#1e40af;font-weight:bold">${((s.distance || 0) / 1000).toFixed(1)} km da base</span>
              ${s.rating ? `<br/>⭐ ${s.rating}/5` : ''}
            </div>`,
          });
          marker.addListener("click", () => infoWindow.open(map, marker));
        });
      }
    );
  }, [scriptLoaded]);

  useEffect(() => {
    if (scriptLoaded && mapRef.current) {
      searchStations();
    }
  }, [scriptLoaded, searchStations]);

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
    <DashboardLayout title="Preços de Combustível">
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

        {postos.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Preço por Posto
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
              <Button variant="outline" size="sm" onClick={searchStations} disabled={loadingMap || !scriptLoaded}>
                <RefreshCw className={`h-4 w-4 mr-1 ${loadingMap ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Postos de combustível num raio de {SEARCH_RADIUS / 1000}km da base da FC Engenharia
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div
                ref={mapRef}
                className="rounded-lg border bg-muted/30 min-h-[400px]"
                style={{ height: 400 }}
              />
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {stations.length > 0 ? `${stations.length} postos encontrados` : loadingMap ? "Buscando postos..." : "Clique em Atualizar"}
                </div>
                {mapError && <p className="text-sm text-red-500">{mapError}</p>}
                {stations.map((s, i) => (
                  <div
                    key={s.placeId}
                    className="p-3 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => {
                      if (mapInstanceRef.current) {
                        mapInstanceRef.current.panTo({ lat: s.lat, lng: s.lng });
                        mapInstanceRef.current.setZoom(16);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                          <span className="font-medium text-sm">{s.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.address}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {((s.distance || 0) / 1000).toFixed(1)} km
                        </Badge>
                        {s.rating && (
                          <p className="text-xs text-amber-500 mt-1">⭐ {s.rating}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  <strong>Dica:</strong> Para comparar preços, ligue diretamente para os postos listados ou consulte o app da ANP
                  (Preço da Hora) para ver os preços atualizados na sua região. Seus preços atuais estão nos cards acima — compare
                  com os valores do mercado para negociar melhores condições.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
