import { useState, useRef, useEffect, useMemo } from "react";
import { useCompany } from "../../contexts/CompanyContext";
import { trpc } from "../../lib/trpc";
import DashboardLayout from "../../components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import {
  Gauge, Fuel, Route, TrendingUp, Clock, Car, Truck, AlertTriangle,
  MapPin, Calendar, ArrowUpDown, Eye, ChevronDown, ChevronUp, DollarSign,
  Loader2, RefreshCw, Navigation, Check, X,
} from "lucide-react";

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function formatDateTime(d: string) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function formatDuration(min: number) {
  if (!min) return "0min";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m > 0 ? m + "min" : ""}` : `${m}min`;
}
function formatNum(n: number, dec = 1) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ON: { bg: "bg-green-100", text: "text-green-700", label: "Ligado" },
  OFF: { bg: "bg-gray-100", text: "text-gray-600", label: "Desligado" },
  OUTDATED: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Desatualizado" },
  IDLE: { bg: "bg-blue-100", text: "text-blue-600", label: "Ocioso" },
};

export default function ControleKm() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id || 0;
  const [activeTab, setActiveTab] = useState("resumo");
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [showTrips, setShowTrips] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [routeDate, setRouteDate] = useState("");
  const [editMotoristaId, setEditMotoristaId] = useState<number | null>(null);
  const [editMotoristaVal, setEditMotoristaVal] = useState("");
  const [motoristaBusca, setMotoristaBusca] = useState("");
  const [editMotPadraoPlaca, setEditMotPadraoPlaca] = useState<string | null>(null);
  const [motPadraoBusca, setMotPadraoBusca] = useState("");
  const [motPadraoVal, setMotPadraoVal] = useState("");
  const [motPadraoInicio, setMotPadraoInicio] = useState("");
  const [catalogadoFilterDate, setCatalogadoFilterDate] = useState("");
  const [catalogadoFilterPlaca, setCatalogadoFilterPlaca] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
  const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10));

  const { data, isLoading, refetch } = trpc.frotas.getControleKm.useQuery(
    { companyId, startDate, endDate },
    { enabled: !!companyId, staleTime: 300000 }
  );

  const dailyKmQ = trpc.frotas.getDailyKm.useQuery(
    { companyId, startDate, endDate },
    { enabled: !!companyId, staleTime: 60000 }
  );

  const coletarMut = trpc.frotas.coletarKmDiario.useMutation({
    onSuccess: (res: any) => {
      if (res.erro) {
        console.warn("[FleetKm] Coleta automática erro:", res.erro);
      } else if (res.coletados > 0) {
        dailyKmQ.refetch();
        refetch();
      }
    },
  });

  const employeesQ = trpc.employees.list.useQuery(
    { companyId, excludeTerminated: true },
    { enabled: !!companyId, staleTime: 600000 }
  );
  const funcionariosAtivos = useMemo(() => {
    if (!employeesQ.data) return [];
    return (employeesQ.data as any[])
      .map((e: any) => e.nomeCompleto)
      .filter((n: string) => !!n)
      .sort((a: string, b: string) => a.localeCompare(b, "pt-BR"));
  }, [employeesQ.data]);

  const motoristaMut = trpc.frotas.atualizarMotorista.useMutation({
    onSuccess: () => {
      toast.success("Motorista atualizado!");
      dailyKmQ.refetch();
      setEditMotoristaId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const motPadraoMut = trpc.frotas.setMotoristaPadrao.useMutation({
    onSuccess: () => {
      toast.success("Motorista padrão definido!");
      refetch();
      dailyKmQ.refetch();
      setEditMotPadraoPlaca(null);
      setMotPadraoBusca("");
      setMotPadraoVal("");
      setMotPadraoInicio("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const coletaFeitaRef = useRef(false);
  useEffect(() => {
    if (companyId && !coletaFeitaRef.current) {
      coletaFeitaRef.current = true;
      coletarMut.mutate({ companyId });
    }
  }, [companyId]);

  const tripsQuery = trpc.frotas.getInfleetTrips.useQuery(
    {
      companyId,
      infleetVehicleId: selectedVehicle?.infleetId || "",
      placa: selectedVehicle?.placa || "",
      startDate,
      endDate,
    },
    { enabled: !!selectedVehicle?.infleetId && showTrips, staleTime: 300000 }
  );

  const positionsQuery = trpc.frotas.getInfleetVehiclePositions.useQuery(
    {
      infleetVehicleId: selectedVehicle?.infleetId || "",
      startDate: routeDate || startDate,
      endDate: routeDate || endDate,
    },
    { enabled: !!selectedVehicle?.infleetId && showRoute && !!routeDate, staleTime: 300000 }
  );

  const vehicles = data?.vehicles || [];
  const sortedVehicles = useMemo(() => {
    return [...vehicles].sort((a, b) => b.totalKm - a.totalKm);
  }, [vehicles]);

  const totals = useMemo(() => {
    const totalKm = vehicles.reduce((s: number, v: any) => s + v.totalKm, 0);
    const totalViagens = vehicles.reduce((s: number, v: any) => s + v.totalViagens, 0);
    const totalLitros = vehicles.reduce((s: number, v: any) => s + (v.totalLitros || 0), 0);
    const totalGasto = vehicles.reduce((s: number, v: any) => s + (v.totalGastoCombustivel || 0), 0);
    const consumoMedio = totalLitros > 0 ? totalKm / totalLitros : 0;
    const custoMedioKm = totalKm > 0 ? totalGasto / totalKm : 0;
    const veiculosAtivos = vehicles.filter((v: any) => v.totalKm > 0).length;
    return { totalKm, totalViagens, totalLitros, totalGasto, consumoMedio, custoMedioKm, veiculosAtivos };
  }, [vehicles]);

  useEffect(() => {
    if (!showRoute || !mapRef.current || !positionsQuery.data?.positions?.length) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled) return;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      const positions = positionsQuery.data.positions
        .filter((p: any) => p.latitude && p.longitude)
        .sort((a: any, b: any) => new Date(a.fixTime).getTime() - new Date(b.fixTime).getTime());
      if (!positions.length) return;

      const center: [number, number] = [positions[0].latitude, positions[0].longitude];
      const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, 12);
      mapInstanceRef.current = map;

      const streets = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      });
      const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "&copy; Esri, Maxar, Earthstar Geographics",
      });
      const hybridLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        attribution: "",
      });
      const satelliteHybrid = L.layerGroup([satellite, hybridLabels]);
      streets.addTo(map);
      L.control.layers({ "Mapa": streets, "Satélite": satelliteHybrid }, {}, { position: "topright" }).addTo(map);

      const latlngs = positions.map((p: any) => [p.latitude, p.longitude] as [number, number]);
      L.polyline(latlngs, { color: "#3b82f6", weight: 3, opacity: 0.8 }).addTo(map);

      const startIcon = L.divIcon({
        className: "",
        html: `<div style="background:#22c55e;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">A</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12],
      });
      const endIcon = L.divIcon({
        className: "",
        html: `<div style="background:#ef4444;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">B</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12],
      });

      const first = positions[0];
      const last = positions[positions.length - 1];
      L.marker([first.latitude, first.longitude], { icon: startIcon }).addTo(map)
        .bindPopup(`<b>Início</b><br/>${formatDateTime(first.fixTime)}<br/>${first.address || ""}`);
      L.marker([last.latitude, last.longitude], { icon: endIcon }).addTo(map)
        .bindPopup(`<b>Fim</b><br/>${formatDateTime(last.fixTime)}<br/>${last.address || ""}`);

      const highSpeedPoints = positions.filter((p: any) => p.speed > 80);
      highSpeedPoints.forEach((p: any) => {
        L.circleMarker([p.latitude, p.longitude], {
          radius: 4, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.8, weight: 1,
        }).addTo(map)
          .bindPopup(`<b>${Math.round(p.speed)} km/h</b><br/>${formatDateTime(p.fixTime)}<br/>${p.address || ""}`);
      });

      map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
      setTimeout(() => { map.invalidateSize(); map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] }); }, 300);
      setTimeout(() => { map.invalidateSize(); }, 600);
    })();
    return () => { cancelled = true; };
  }, [showRoute, positionsQuery.data]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const handleViewRoute = (v: any, day: string) => {
    setSelectedVehicle(v);
    setRouteDate(day);
    setShowRoute(true);
    setShowTrips(false);
  };

  const handleViewTrips = (v: any) => {
    setSelectedVehicle(v);
    setShowTrips(true);
    setShowRoute(false);
  };

  return (
    <DashboardLayout title="Controle de Km">
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Gauge className="h-6 w-6 text-cyan-600" />
              Controle de Km & Consumo
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Km percorrido por veículo × abastecimentos registrados
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36 h-9 text-sm" />
              <span className="text-gray-400">a</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36 h-9 text-sm" />
            </div>
            {coletarMut.isPending && (
              <span className="text-xs text-cyan-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Atualizando dados...
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
            <span className="ml-3 text-gray-500">Carregando dados da Infleet + abastecimentos...</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <Card className="bg-gradient-to-br from-cyan-50 to-white border-cyan-200">
                <CardContent className="p-4">
                  <div className="text-xs text-cyan-600 font-medium">Km Total</div>
                  <div className="text-xl font-bold text-cyan-700">{formatNum(totals.totalKm, 0)} km</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
                <CardContent className="p-4">
                  <div className="text-xs text-blue-600 font-medium">Viagens</div>
                  <div className="text-xl font-bold text-blue-700">{totals.totalViagens.toLocaleString("pt-BR")}</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-white border-green-200">
                <CardContent className="p-4">
                  <div className="text-xs text-green-600 font-medium">Veículos Ativos</div>
                  <div className="text-xl font-bold text-green-700">{totals.veiculosAtivos}/{vehicles.length}</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-200">
                <CardContent className="p-4">
                  <div className="text-xs text-amber-600 font-medium">Combustível</div>
                  <div className="text-xl font-bold text-amber-700">{formatNum(totals.totalLitros, 0)} L</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-red-50 to-white border-red-200">
                <CardContent className="p-4">
                  <div className="text-xs text-red-600 font-medium">Gasto Total</div>
                  <div className="text-xl font-bold text-red-700">R$ {formatNum(totals.totalGasto, 0)}</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200">
                <CardContent className="p-4">
                  <div className="text-xs text-purple-600 font-medium">Consumo Médio</div>
                  <div className="text-xl font-bold text-purple-700">{totals.consumoMedio > 0 ? formatNum(totals.consumoMedio) + " km/L" : "—"}</div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-rose-50 to-white border-rose-200">
                <CardContent className="p-4">
                  <div className="text-xs text-rose-600 font-medium">Custo/Km</div>
                  <div className="text-xl font-bold text-rose-700">{totals.custoMedioKm > 0 ? "R$ " + formatNum(totals.custoMedioKm, 2) : "—"}</div>
                </CardContent>
              </Card>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="resumo">Resumo por Veículo</TabsTrigger>
                <TabsTrigger value="diario">Visão Diária</TabsTrigger>
                <TabsTrigger value="cruzamento">Cruzamento Km × Combustível</TabsTrigger>
                <TabsTrigger value="catalogado" className="relative">
                  Histórico Catalogado
                  {(dailyKmQ.data?.length || 0) > 0 && (
                    <span className="ml-1 bg-cyan-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{dailyKmQ.data?.length}</span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="mt-4">
                <div className="space-y-3">
                  {sortedVehicles.map((v: any) => {
                    const statusInfo = STATUS_COLORS[v.status] || STATUS_COLORS.OFF;
                    const isSelected = selectedVehicle?.infleetId === v.infleetId;
                    return (
                      <Card key={v.infleetId} className={`${isSelected ? "ring-2 ring-cyan-500" : ""}`}>
                        <CardContent className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${v.tipo === 'TRUCK' ? 'bg-orange-100' : v.tipo === 'MOTORCYCLE' ? 'bg-purple-100' : 'bg-cyan-100'}`}>
                                {v.tipo === 'TRUCK' ? <Truck className="h-5 w-5 text-orange-600" /> : <Car className="h-5 w-5 text-cyan-600" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-900">{v.placa}</span>
                                  <Badge variant="outline" className={`text-xs ${statusInfo.bg} ${statusInfo.text}`}>
                                    {statusInfo.label}
                                  </Badge>
                                </div>
                                <div className="text-sm text-gray-500">{v.nome}</div>
                                {editMotPadraoPlaca === v.placa ? (
                                  <div className="flex flex-wrap items-center gap-1 mt-1">
                                    <div className="relative">
                                      <input
                                        className="border rounded px-1.5 py-0.5 text-xs w-48"
                                        value={motPadraoBusca}
                                        onChange={e => { setMotPadraoBusca(e.target.value); setMotPadraoVal(""); }}
                                        autoFocus
                                        placeholder="Buscar motorista..."
                                        onKeyDown={e => { if (e.key === "Escape") setEditMotPadraoPlaca(null); }}
                                      />
                                      {motPadraoBusca.length >= 2 && !motPadraoVal && (
                                        <div className="absolute z-50 top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto bg-white border rounded-lg shadow-lg">
                                          {funcionariosAtivos.filter((n: string) => n.toLowerCase().includes(motPadraoBusca.toLowerCase())).length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-gray-400">Nenhum encontrado</div>
                                          ) : funcionariosAtivos.filter((n: string) => n.toLowerCase().includes(motPadraoBusca.toLowerCase())).slice(0, 15).map((nome: string) => (
                                            <button key={nome} type="button" className="w-full text-left px-3 py-1.5 text-xs hover:bg-cyan-50 hover:text-cyan-700"
                                              onClick={() => { setMotPadraoVal(nome); setMotPadraoBusca(nome); }}
                                            >{nome}</button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <input type="date" className="border rounded px-1.5 py-0.5 text-xs w-32" value={motPadraoInicio} onChange={e => setMotPadraoInicio(e.target.value)} title="Data início" />
                                    <button type="button" disabled={!motPadraoVal || !motPadraoInicio || !v.vehicleId}
                                      onClick={() => motPadraoMut.mutate({ companyId, vehicleId: v.vehicleId, motoristaPadrao: motPadraoVal, motoristaPadraoInicio: motPadraoInicio })}
                                      className={`p-0.5 ${motPadraoVal && motPadraoInicio ? "text-emerald-600 hover:text-emerald-700" : "text-gray-300"}`}
                                    ><Check className="h-3.5 w-3.5" /></button>
                                    <button type="button" onClick={() => setEditMotPadraoPlaca(null)} className="text-gray-400 hover:text-gray-600 p-0.5"><X className="h-3.5 w-3.5" /></button>
                                  </div>
                                ) : (
                                  <button type="button" className="text-xs text-gray-400 hover:text-cyan-700 hover:underline cursor-pointer flex items-center gap-1"
                                    onClick={() => {
                                      setEditMotPadraoPlaca(v.placa);
                                      setMotPadraoBusca(v.motoristaPadrao || "");
                                      setMotPadraoVal(v.motoristaPadrao || "");
                                      setMotPadraoInicio(v.motoristaPadraoInicio || new Date().toISOString().slice(0, 10));
                                    }}
                                    title={v.motoristaPadrao ? `Motorista padrão desde ${formatDate(v.motoristaPadraoInicio)}` : "Definir motorista padrão"}
                                  >
                                    <Car className="h-3 w-3" />
                                    {v.motoristaPadrao ? `Motorista: ${v.motoristaPadrao}` : "Definir motorista padrão"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm">
                              <div className="text-center">
                                <div className="text-xs text-gray-400">Km Total</div>
                                <div className="font-bold text-gray-900">{formatNum(v.totalKm, 0)} km</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-400">Viagens</div>
                                <div className="font-bold text-gray-900">{v.totalViagens.toLocaleString("pt-BR")}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-400">Dias Ativos</div>
                                <div className="font-bold text-gray-900">{v.diasComViagem}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-400">Média/Dia</div>
                                <div className="font-bold text-cyan-600">{formatNum(v.mediaKmDia, 0)} km</div>
                              </div>
                              <div className="text-center border-l pl-4">
                                <div className="text-xs text-gray-400">Abastecido</div>
                                <div className="font-bold text-amber-600">{v.totalLitros > 0 ? formatNum(v.totalLitros, 0) + " L" : "—"}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-400">Consumo Real</div>
                                <div className={`font-bold ${v.consumoRealKmL ? (v.consumoRealKmL >= 8 ? "text-green-600" : v.consumoRealKmL >= 5 ? "text-amber-600" : "text-red-600") : "text-gray-400"}`}>
                                  {v.consumoRealKmL ? formatNum(v.consumoRealKmL) + " km/L" : "—"}
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-xs text-gray-400">R$/Km</div>
                                <div className="font-bold text-rose-600">{v.custoKm ? "R$ " + formatNum(v.custoKm, 2) : "—"}</div>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleViewTrips(v)}>
                                  <Route className="h-3.5 w-3.5 mr-1" /> Viagens
                                </Button>
                              </div>
                            </div>
                          </div>

                          {v.dailyData?.length > 0 && isSelected && showTrips && (
                            <div className="mt-3 pt-3 border-t">
                              <div className="text-sm font-medium text-gray-700 mb-2">Km por Dia</div>
                              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                                {v.dailyData.map((d: any) => (
                                  <div key={d.data} className="bg-gray-50 rounded-lg p-2 text-center cursor-pointer hover:bg-cyan-50 transition-colors"
                                    onClick={() => handleViewRoute(v, d.data)}>
                                    <div className="text-xs text-gray-500">{formatDate(d.data)}</div>
                                    <div className="font-bold text-sm">{formatNum(d.km, 0)} km</div>
                                    <div className="text-xs text-gray-400">{d.viagens} viagens • {formatDuration(d.tempoRodandoMin)}</div>
                                    {d.velMaxima > 80 && (
                                      <div className="text-xs text-amber-600 flex items-center justify-center gap-0.5 mt-0.5">
                                        <AlertTriangle className="h-3 w-3" /> {formatNum(d.velMaxima, 0)} km/h
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="diario" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Km Diário por Veículo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2 px-3 font-medium text-gray-500">Veículo</th>
                            {(() => {
                              const days: string[] = [];
                              const d = new Date(startDate);
                              const e = new Date(endDate);
                              while (d <= e) {
                                days.push(d.toISOString().slice(0, 10));
                                d.setDate(d.getDate() + 1);
                              }
                              const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
                              const feriadosFixos = ["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"];
                              const pascoa = (ano: number) => {
                                const a=ano%19, b=Math.floor(ano/100), c=ano%100;
                                const d2=Math.floor(b/4), e2=b%4, f=Math.floor((b+8)/25);
                                const g=Math.floor((b-f+1)/3), h=(19*a+b-d2-g+15)%30;
                                const i=Math.floor(c/4), k=c%4, l=(32+2*e2+2*i-h-k)%7;
                                const m=Math.floor((a+11*h+22*l)/451);
                                const mes=Math.floor((h+l-7*m+114)/31), dia=(h+l-7*m+114)%31+1;
                                return new Date(ano, mes-1, dia);
                              };
                              const getFeriadosMoveis = (ano: number) => {
                                const p = pascoa(ano);
                                const fmt = (dt: Date) => dt.toISOString().slice(0,10);
                                const add = (dt: Date, n: number) => { const r = new Date(dt); r.setDate(r.getDate()+n); return r; };
                                return [fmt(add(p,-47)), fmt(add(p,-2)), fmt(p), fmt(add(p,60))];
                              };
                              const anosNoPeriodo = new Set(days.map(d2 => parseInt(d2.slice(0,4))));
                              const feriadosSet = new Set<string>();
                              anosNoPeriodo.forEach(ano => {
                                feriadosFixos.forEach(f => feriadosSet.add(`${ano}-${f}`));
                                getFeriadosMoveis(ano).forEach(f => feriadosSet.add(f));
                              });

                              return days.slice(-14).map(day => {
                                const dt = new Date(day + "T12:00:00");
                                const dow = dt.getDay();
                                const diaSemana = DIAS_SEMANA[dow];
                                const isSab = dow === 6;
                                const isDom = dow === 0;
                                const isFeriado = feriadosSet.has(day);
                                const headerClass = isDom || isFeriado
                                  ? "py-2 px-2 text-center whitespace-nowrap text-xs bg-red-50"
                                  : isSab
                                    ? "py-2 px-2 text-center whitespace-nowrap text-xs bg-amber-50"
                                    : "py-2 px-2 text-center whitespace-nowrap text-xs";
                                const labelColor = isDom || isFeriado ? "text-red-600 font-bold" : isSab ? "text-amber-600 font-bold" : "text-gray-500 font-medium";
                                return (
                                  <th key={day} className={headerClass}>
                                    <div className={labelColor}>{diaSemana}</div>
                                    <div className={`${isDom || isFeriado ? "text-red-500" : isSab ? "text-amber-500" : "text-gray-400"} text-[10px]`}>
                                      {formatDate(day).slice(0, 5)}
                                    </div>
                                    {isFeriado && <div className="text-[8px] text-red-500 font-bold leading-tight">FERIADO</div>}
                                  </th>
                                );
                              });
                            })()}
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedVehicles.map((v: any) => {
                            const dayMap: Record<string, any> = {};
                            v.dailyData?.forEach((d: any) => { dayMap[d.data] = d; });
                            const days: string[] = [];
                            const d = new Date(startDate);
                            const e = new Date(endDate);
                            while (d <= e) {
                              days.push(d.toISOString().slice(0, 10));
                              d.setDate(d.getDate() + 1);
                            }
                            return (
                              <tr key={v.infleetId} className="border-b hover:bg-gray-50">
                                <td className="py-2 px-3 font-medium whitespace-nowrap">
                                  {v.placa}
                                  <span className="text-xs text-gray-400 ml-1">{v.tipo}</span>
                                </td>
                                {days.slice(-14).map(day => {
                                  const dd = dayMap[day];
                                  const dt2 = new Date(day + "T12:00:00");
                                  const dow2 = dt2.getDay();
                                  const cellBg = dow2 === 0 ? "bg-red-50" : dow2 === 6 ? "bg-amber-50" : "";
                                  return (
                                    <td key={day} className={`py-2 px-2 text-center ${cellBg}`}>
                                      {dd && dd.km > 0 ? (
                                        <span
                                          className={`text-xs font-medium cursor-pointer hover:underline ${dd.km > 200 ? "text-red-600" : dd.km > 100 ? "text-amber-600" : "text-gray-700"}`}
                                          onClick={() => handleViewRoute(v, day)}
                                        >
                                          {formatNum(dd.km, 0)}
                                        </span>
                                      ) : (
                                        <span className="text-gray-300">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="py-2 px-3 text-right font-bold">{formatNum(v.totalKm, 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="cruzamento" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Fuel className="h-4 w-4" /> Cruzamento: Km Real (GPS) × Abastecimentos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="py-2 px-3 font-medium text-gray-500">Veículo</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">Km GPS</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">Km Odômetro</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">Litros</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">R$ Gasto</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">Consumo Real</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">R$/Km</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-right">Abastec.</th>
                            <th className="py-2 px-3 font-medium text-gray-500 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedVehicles.map((v: any) => {
                            const abastCount = v.abastecimentos?.length || 0;
                            const consumoOk = v.consumoRealKmL && v.consumoRealKmL >= 5;
                            const kmOdoDiff = v.abastecimentos?.length > 0 ?
                              Math.max(...v.abastecimentos.map((a: any) => a.kmAtual)) - Math.min(...v.abastecimentos.map((a: any) => a.kmAnterior > 0 ? a.kmAnterior : a.kmAtual)) : 0;
                            const divergencia = v.totalKm > 0 && kmOdoDiff > 0 ? Math.abs(v.totalKm - kmOdoDiff) / v.totalKm * 100 : 0;
                            return (
                              <tr key={v.infleetId} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-3">
                                  <div className="font-medium">{v.placa}</div>
                                  <div className="text-xs text-gray-400">{v.nome}</div>
                                </td>
                                <td className="py-3 px-3 text-right font-medium">{formatNum(v.totalKm, 0)} km</td>
                                <td className="py-3 px-3 text-right">
                                  {kmOdoDiff > 0 ? (
                                    <div>
                                      <span className="font-medium">{formatNum(kmOdoDiff, 0)} km</span>
                                      {divergencia > 15 && (
                                        <div
                                          className="text-xs text-amber-600 flex items-center justify-end gap-0.5 cursor-help"
                                          title={`Divergência de ${formatNum(divergencia, 1)}% entre Km GPS (${formatNum(v.totalKm, 0)} km) e Km Odômetro (${formatNum(kmOdoDiff, 0)} km).\n\nIsso pode indicar:\n• Odômetro descalibrado ou com defeito\n• GPS sem sinal em parte do trajeto\n• Registro manual incorreto no abastecimento\n• Veículo rodou com GPS desligado`}
                                        >
                                          <AlertTriangle className="h-3 w-3" /> {formatNum(divergencia, 0)}% dif.
                                        </div>
                                      )}
                                    </div>
                                  ) : "—"}
                                </td>
                                <td className="py-3 px-3 text-right">{v.totalLitros > 0 ? formatNum(v.totalLitros, 0) + " L" : "—"}</td>
                                <td className="py-3 px-3 text-right">{v.totalGastoCombustivel > 0 ? "R$ " + formatNum(v.totalGastoCombustivel, 0) : "—"}</td>
                                <td className="py-3 px-3 text-right">
                                  {v.consumoRealKmL ? (
                                    <span className={`font-bold ${v.consumoRealKmL >= 8 ? "text-green-600" : v.consumoRealKmL >= 5 ? "text-amber-600" : "text-red-600"}`}>
                                      {formatNum(v.consumoRealKmL)} km/L
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {v.custoKm ? (
                                    <span className="font-medium text-rose-600">R$ {formatNum(v.custoKm, 2)}</span>
                                  ) : "—"}
                                </td>
                                <td className="py-3 px-3 text-right">{abastCount > 0 ? abastCount : "—"}</td>
                                <td className="py-3 px-3 text-center">
                                  {v.totalKm === 0 && abastCount === 0 ? (
                                    <Badge variant="outline" className="bg-gray-50 text-gray-400 text-xs">Inativo</Badge>
                                  ) : v.totalKm > 0 && abastCount === 0 ? (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-600 text-xs">Sem abast.</Badge>
                                  ) : consumoOk ? (
                                    <Badge variant="outline" className="bg-green-50 text-green-600 text-xs">Normal</Badge>
                                  ) : v.consumoRealKmL ? (
                                    <Badge variant="outline" className="bg-red-50 text-red-600 text-xs">Alto consumo</Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-gray-50 text-gray-400 text-xs">—</Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 font-bold">
                            <td className="py-3 px-3">TOTAL</td>
                            <td className="py-3 px-3 text-right">{formatNum(totals.totalKm, 0)} km</td>
                            <td className="py-3 px-3 text-right">—</td>
                            <td className="py-3 px-3 text-right">{formatNum(totals.totalLitros, 0)} L</td>
                            <td className="py-3 px-3 text-right">R$ {formatNum(totals.totalGasto, 0)}</td>
                            <td className="py-3 px-3 text-right font-bold text-cyan-600">
                              {totals.consumoMedio > 0 ? formatNum(totals.consumoMedio) + " km/L" : "—"}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-rose-600">
                              {totals.custoMedioKm > 0 ? "R$ " + formatNum(totals.custoMedioKm, 2) : "—"}
                            </td>
                            <td className="py-3 px-3 text-right">{vehicles.reduce((s: number, v: any) => s + (v.abastecimentos?.length || 0), 0).toLocaleString("pt-BR")}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {sortedVehicles.filter((v: any) => v.abastecimentos?.length > 0).map((v: any) => (
                    <Card key={v.infleetId}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Fuel className="h-4 w-4 text-amber-500" />
                            {v.placa} — Abastecimentos
                          </span>
                          <Badge variant="outline" className={`text-xs ${v.consumoRealKmL >= 8 ? "bg-green-50 text-green-600" : v.consumoRealKmL >= 5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                            {v.consumoRealKmL ? formatNum(v.consumoRealKmL) + " km/L" : "—"}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-gray-400">
                              <th className="py-1 px-2">Data</th>
                              <th className="py-1 px-2 text-right">Litros</th>
                              <th className="py-1 px-2 text-right">R$</th>
                              <th className="py-1 px-2 text-right">Km</th>
                              <th className="py-1 px-2 text-right">km/L</th>
                              <th className="py-1 px-2">Motorista</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.abastecimentos.map((a: any, i: number) => (
                              <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="py-1.5 px-2">{formatDate(a.data)}</td>
                                <td className="py-1.5 px-2 text-right">{formatNum(a.litros)}</td>
                                <td className="py-1.5 px-2 text-right">R$ {formatNum(a.valorTotal, 2)}</td>
                                <td className="py-1.5 px-2 text-right">{formatNum(a.kmAtual, 0)}</td>
                                <td className="py-1.5 px-2 text-right">
                                  <span className={`font-medium ${a.consumoKmL >= 8 ? "text-green-600" : a.consumoKmL >= 5 ? "text-amber-600" : "text-red-600"}`}>
                                    {a.consumoKmL > 0 ? formatNum(a.consumoKmL) : "—"}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-gray-500 truncate max-w-[120px]">{a.motorista || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="catalogado" className="mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Route className="h-4 w-4" /> Km Catalogado por Dia (Histórico Persistente)
                        </CardTitle>
                        <p className="text-xs text-gray-500 mt-1">Dados coletados automaticamente a cada 30 min e armazenados no banco de dados</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          <Input
                            type="date"
                            className="w-[150px] h-8 text-sm"
                            value={catalogadoFilterDate}
                            onChange={e => setCatalogadoFilterDate(e.target.value)}
                            placeholder="Filtrar dia"
                          />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5 text-gray-400" />
                          <Input
                            type="text"
                            className="w-[130px] h-8 text-sm"
                            value={catalogadoFilterPlaca}
                            onChange={e => setCatalogadoFilterPlaca(e.target.value.toUpperCase())}
                            placeholder="Placa"
                          />
                        </div>
                        {(catalogadoFilterDate || catalogadoFilterPlaca) && (
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-gray-500"
                            onClick={() => { setCatalogadoFilterDate(""); setCatalogadoFilterPlaca(""); }}>
                            <X className="h-3 w-3 mr-1" /> Limpar
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {dailyKmQ.isLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-cyan-500" />
                      </div>
                    ) : !(dailyKmQ.data?.length) ? (
                      <div className="text-center py-10 text-gray-400">
                        <Navigation className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>Nenhum dado catalogado ainda para este período.</p>
                        <p className="text-xs mt-1">Os dados são coletados automaticamente a cada 30 minutos.</p>
                      </div>
                    ) : (() => {
                      const dailyRecords = dailyKmQ.data || [];
                      const byDate: Record<string, any[]> = {};
                      dailyRecords.forEach((r: any) => {
                        const d = typeof r.data === 'string' ? r.data.slice(0, 10) : new Date(r.data).toISOString().slice(0, 10);
                        if (!byDate[d]) byDate[d] = [];
                        byDate[d].push(r);
                      });
                      const allDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
                      const dates = allDates.filter(d => {
                        if (catalogadoFilterDate && d !== catalogadoFilterDate) return false;
                        if (catalogadoFilterPlaca) {
                          const hasMatch = byDate[d].some((r: any) => (r.placa || "").toUpperCase().includes(catalogadoFilterPlaca));
                          if (!hasMatch) return false;
                        }
                        return true;
                      });
                      return (
                        <div className="space-y-4">
                          {dates.length === 0 && (
                            <div className="text-center py-8 text-gray-400">
                              <Navigation className="h-8 w-8 mx-auto mb-2 opacity-30" />
                              <p className="text-sm">Nenhum registro encontrado para os filtros selecionados</p>
                            </div>
                          )}
                          {dates.map(date => {
                            let recs = byDate[date];
                            if (catalogadoFilterPlaca) {
                              recs = recs.filter((r: any) => (r.placa || "").toUpperCase().includes(catalogadoFilterPlaca));
                            }
                            const totalKmDay = recs.reduce((s: number, r: any) => s + parseFloat(r.km_total || 0), 0);
                            const totalViagensDay = recs.reduce((s: number, r: any) => s + parseInt(r.viagens || 0), 0);
                            const veiculosAtivosDay = recs.filter((r: any) => parseFloat(r.km_total) > 0).length;
                            return (
                              <div key={date} className="border rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Calendar className="h-4 w-4 text-gray-400" />
                                    <span className="font-semibold">{formatDate(date)}</span>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="text-cyan-600 font-bold">{formatNum(totalKmDay, 1)} km</span>
                                    <span className="text-gray-500">{totalViagensDay.toLocaleString("pt-BR")} viagens</span>
                                    <span className="text-gray-500">{veiculosAtivosDay} veículos ativos</span>
                                  </div>
                                </div>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b text-left">
                                      <th className="py-2 px-3 font-medium text-gray-500">Placa</th>
                                      <th className="py-2 px-3 font-medium text-gray-500">Veículo</th>
                                      <th className="py-2 px-3 font-medium text-gray-500 text-center">Ligou</th>
                                      <th className="py-2 px-3 font-medium text-gray-500 text-center">Desligou</th>
                                      <th className="py-2 px-3 font-medium text-gray-500 text-right">Km Total</th>
                                      <th className="py-2 px-3 font-medium text-gray-500 text-right">Viagens</th>
                                      <th className="py-2 px-3 font-medium text-gray-500 text-right">Tempo Rodando</th>
                                      <th className="py-2 px-3 font-medium text-gray-500 text-right">Vel. Média</th>
                                      <th className="py-2 px-3 font-medium text-gray-500 text-right">Vel. Máx</th>
                                      <th className="py-2 px-3 font-medium text-gray-500">Motorista(s)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {recs.sort((a: any, b: any) => parseFloat(b.km_total) - parseFloat(a.km_total)).map((r: any) => (
                                      <tr key={r.id} className={`border-b last:border-0 hover:bg-gray-50 ${r.alerta_gps ? "bg-amber-50" : ""}`}>
                                        <td className="py-2 px-3 font-mono font-medium">
                                          {r.placa}
                                          {r.alerta_gps && (
                                            <div className="flex items-center gap-1 mt-1">
                                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                                              <span className="text-[10px] text-amber-700 font-normal">{r.alerta_gps}</span>
                                            </div>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-gray-600">{r.nome_veiculo || "—"}</td>
                                        <td className="py-2 px-3 text-center text-xs">
                                          {r.primeira_ligacao ? (
                                            <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                                              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                              {new Date(r.primeira_ligacao).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                                            </span>
                                          ) : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="py-2 px-3 text-center text-xs">
                                          {r.ultima_desligacao ? (
                                            <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                                              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                              {new Date(r.ultima_desligacao).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                                            </span>
                                          ) : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="py-2 px-3 text-right font-bold text-cyan-700">
                                          {r.infleet_vehicle_id ? (
                                            <button
                                              type="button"
                                              className="hover:underline hover:text-blue-600 cursor-pointer transition-colors inline-flex items-center gap-1"
                                              title="Clique para ver o trajeto no mapa"
                                              onClick={() => {
                                                setSelectedVehicle({ placa: r.placa, infleetId: r.infleet_vehicle_id, nomeVeiculo: r.nome_veiculo });
                                                setRouteDate(String(r.data).slice(0, 10));
                                                setShowRoute(true);
                                                setShowTrips(false);
                                                setTimeout(() => {
                                                  const routeCard = document.getElementById("route-map-card");
                                                  if (routeCard) routeCard.scrollIntoView({ behavior: "smooth", block: "start" });
                                                }, 200);
                                              }}
                                            >
                                              <MapPin className="h-3 w-3" />
                                              {formatNum(parseFloat(r.km_total), 1)} km
                                            </button>
                                          ) : (
                                            <span>{formatNum(parseFloat(r.km_total), 1)} km</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-right">{r.viagens}</td>
                                        <td className="py-2 px-3 text-right">{formatDuration(parseInt(r.tempo_rodando_min || 0))}</td>
                                        <td className="py-2 px-3 text-right">{formatNum(parseFloat(r.vel_media || 0))} km/h</td>
                                        <td className="py-2 px-3 text-right">
                                          <span className={parseFloat(r.vel_maxima) > 80 ? "text-red-600 font-bold" : ""}>
                                            {formatNum(parseFloat(r.vel_maxima || 0))} km/h
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-gray-500 text-xs">
                                          {editMotoristaId === r.id ? (
                                            <div className="relative flex items-center gap-1">
                                              <div className="relative">
                                                <input
                                                  className="border rounded px-1.5 py-0.5 text-xs w-48"
                                                  value={motoristaBusca}
                                                  onChange={e => { setMotoristaBusca(e.target.value); setEditMotoristaVal(""); }}
                                                  autoFocus
                                                  placeholder="Buscar funcionário..."
                                                  onKeyDown={e => {
                                                    if (e.key === "Escape") { setEditMotoristaId(null); setMotoristaBusca(""); }
                                                    if (e.key === "Enter" && editMotoristaVal) motoristaMut.mutate({ id: r.id, motorista: editMotoristaVal });
                                                  }}
                                                />
                                                {motoristaBusca.length >= 2 && !editMotoristaVal && (
                                                  <div className="absolute z-50 top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto bg-white border rounded-lg shadow-lg">
                                                    {funcionariosAtivos.filter((n: string) => n.toLowerCase().includes(motoristaBusca.toLowerCase())).length === 0 ? (
                                                      <div className="px-3 py-2 text-xs text-gray-400">Nenhum funcionário encontrado</div>
                                                    ) : (
                                                      funcionariosAtivos.filter((n: string) => n.toLowerCase().includes(motoristaBusca.toLowerCase())).slice(0, 15).map((nome: string) => (
                                                        <button
                                                          key={nome}
                                                          type="button"
                                                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-cyan-50 hover:text-cyan-700 transition-colors"
                                                          onClick={() => { setEditMotoristaVal(nome); setMotoristaBusca(nome); }}
                                                        >
                                                          {nome}
                                                        </button>
                                                      ))
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                              <button
                                                type="button"
                                                onClick={() => { if (editMotoristaVal) motoristaMut.mutate({ id: r.id, motorista: editMotoristaVal }); }}
                                                disabled={!editMotoristaVal}
                                                className={`p-0.5 ${editMotoristaVal ? "text-emerald-600 hover:text-emerald-700" : "text-gray-300"}`}
                                              ><Check className="h-3 w-3" /></button>
                                              <button type="button" onClick={() => { setEditMotoristaId(null); setMotoristaBusca(""); }} className="text-gray-400 hover:text-gray-600 p-0.5"><X className="h-3 w-3" /></button>
                                            </div>
                                          ) : (
                                            <button
                                              type="button"
                                              className="text-left hover:text-cyan-700 hover:underline cursor-pointer"
                                              title={r.motorista_padrao_usado ? "Motorista padrão (clique para alterar)" : "Clique para selecionar motorista"}
                                              onClick={() => { setEditMotoristaId(r.id); setEditMotoristaVal(r.motoristas || ""); setMotoristaBusca(r.motoristas || ""); }}
                                            >
                                              {r.motoristas || "—"}
                                              {r.motorista_padrao_usado && <span className="ml-1 text-[10px] text-cyan-500" title="Motorista padrão do veículo">(padrão)</span>}
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })}
                          <div className="bg-cyan-50 rounded-lg p-4 mt-2">
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <div className="text-2xl font-bold text-cyan-700">{formatNum(dailyRecords.reduce((s: number, r: any) => s + parseFloat(r.km_total || 0), 0), 0)} km</div>
                                <div className="text-xs text-gray-500">Total do período</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-cyan-700">{dailyRecords.reduce((s: number, r: any) => s + parseInt(r.viagens || 0), 0).toLocaleString("pt-BR")}</div>
                                <div className="text-xs text-gray-500">Total de viagens</div>
                              </div>
                              <div>
                                <div className="text-2xl font-bold text-cyan-700">{dates.length}</div>
                                <div className="text-xs text-gray-500">Dias com dados</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {showRoute && selectedVehicle && (
              <Card id="route-map-card" className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-blue-500" />
                      Percurso: {selectedVehicle.placa} {selectedVehicle.nomeVeiculo ? `(${selectedVehicle.nomeVeiculo})` : ""} — {formatDate(routeDate)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => { setShowRoute(false); setSelectedVehicle(null); }}>
                      Fechar
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {positionsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                      <span className="ml-2 text-gray-500">Carregando trajeto...</span>
                    </div>
                  ) : positionsQuery.data?.positions?.length ? (
                    <>
                      <div className="text-sm text-gray-500 mb-2">
                        {positionsQuery.data.positions.length} pontos GPS registrados
                      </div>
                      <div ref={mapRef} style={{ height: 450, width: "100%" }} className="rounded-lg border overflow-hidden" />
                    </>
                  ) : (
                    <div className="text-center py-10 text-gray-400">
                      Nenhum ponto GPS encontrado para este dia
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {showTrips && selectedVehicle && tripsQuery.data?.trips && (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Route className="h-4 w-4 text-cyan-500" />
                      Viagens: {selectedVehicle.placa} ({tripsQuery.data.trips.length} viagens)
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => { setShowTrips(false); }}>
                      Fechar
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-400 text-xs">
                        <th className="py-2 px-3">Início</th>
                        <th className="py-2 px-3">Fim</th>
                        <th className="py-2 px-3 text-right">Duração</th>
                        <th className="py-2 px-3 text-right">Km</th>
                        <th className="py-2 px-3 text-right">Vel. Média</th>
                        <th className="py-2 px-3 text-right">Vel. Máx.</th>
                        <th className="py-2 px-3">Motorista</th>
                        <th className="py-2 px-3 text-center">Rota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripsQuery.data.trips.map((t: any, i: number) => {
                        const durMin = (new Date(t.fim).getTime() - new Date(t.inicio).getTime()) / 60000;
                        const day = new Date(t.inicio).toISOString().slice(0, 10);
                        return (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3">{formatDateTime(t.inicio)}</td>
                            <td className="py-2 px-3">{formatDateTime(t.fim)}</td>
                            <td className="py-2 px-3 text-right">{formatDuration(durMin)}</td>
                            <td className="py-2 px-3 text-right font-medium">{formatNum(t.kmPercorrido)} km</td>
                            <td className="py-2 px-3 text-right">{formatNum(t.velMedia, 0)} km/h</td>
                            <td className="py-2 px-3 text-right">
                              <span className={t.velMaxima > 80 ? "text-amber-600 font-medium" : ""}>
                                {formatNum(t.velMaxima, 0)} km/h
                              </span>
                            </td>
                            <td className="py-2 px-3 text-gray-500">{t.motorista || "—"}</td>
                            <td className="py-2 px-3 text-center">
                              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleViewRoute(selectedVehicle, day)}>
                                <MapPin className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
