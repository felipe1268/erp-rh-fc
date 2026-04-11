import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Upload, RefreshCw, Car, Truck, Bike, Loader2, Wifi, WifiOff, Navigation } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ON: { bg: 'bg-green-100', text: 'text-green-700', label: 'Ligado' },
  OFF: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Desligado' },
  OUTDATED: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Desatualizado' },
  IDLE: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Parado' },
};

const TIPO_ICONS: Record<string, typeof Car> = {
  CAR: Car,
  TRUCK: Truck,
  MOTORCYCLE: Bike,
  EQUIPMENT: Truck,
};

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default function Rastreamento() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const infleet = trpc.frotas.getInfleetPositions.useQuery(
    { companyId: cId },
    { enabled: cId > 0, refetchInterval: 60000 },
  );

  const localVehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const tracking = trpc.frotas.listTracking.useQuery(
    {
      companyId: cId,
      vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    { enabled: cId > 0 && activeTab === 'history' },
  );
  const importMut = trpc.frotas.importTrackingCsv.useMutation({
    onSuccess: (data) => { tracking.refetch(); toast.success(`${data.imported} pontos importados`); },
    onError: (err) => toast.error(err.message),
  });

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      importMut.mutate({ companyId: cId, csvContent: ev.target?.result as string, criadoPor: user?.name || "" });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const infleetVehicles = (infleet.data as any)?.vehicles || [];
  const filteredInfleet = filterVehicle === 'all'
    ? infleetVehicles
    : infleetVehicles.filter((v: any) => v.id === filterVehicle);

  useEffect(() => {
    if (!mapRef.current) return;

    const loadLeaflet = async () => {
      if (typeof window === "undefined") return;

      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const L = await import("leaflet");

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current = [];

      if (activeTab === 'live') {
        const withPos = filteredInfleet.filter((v: any) => v.latitude && v.longitude);
        const center: [number, number] = withPos.length > 0
          ? [withPos[0].latitude, withPos[0].longitude]
          : [-22.83, -45.23];

        const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, withPos.length > 0 ? 10 : 6);
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        withPos.forEach((v: any) => {
          const isOn = v.status === 'ON';
          const color = isOn ? '#22c55e' : v.status === 'OUTDATED' ? '#eab308' : '#6b7280';
          const statusInfo = STATUS_COLORS[v.status] || STATUS_COLORS.OFF;

          const vehicleSvgs: Record<string, string> = {
            TRUCK: `<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`,
            MOTORCYCLE: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M19.44 9.03L15.41 5H11v2h3.59l2 2H5c-2.8 0-5 2.2-5 5s2.2 5 5 5c2.46 0 4.45-1.69 4.9-4h1.65l2.77-2.77c-.21.54-.32 1.14-.32 1.77 0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.65-1.97-4.77-4.56-4.97zM7.82 15C7.4 16.15 6.28 17 5 17c-1.63 0-3-1.37-3-3s1.37-3 3-3c1.28 0 2.4.85 2.82 2H5v2h2.82zM19 17c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>`,
            EQUIPMENT: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`,
            CAR: `<svg viewBox="0 0 24 24" width="14" height="14" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
          };
          const vehicleSvg = vehicleSvgs[v.tipo] || vehicleSvgs.CAR;

          const markerIcon = L.divIcon({
            className: '',
            html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateX(-50%)">
              <div style="background:${color};border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white">
                ${vehicleSvg}
              </div>
              <div style="background:white;border:1px solid ${color};border-radius:4px;padding:1px 5px;font-size:10px;font-weight:bold;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15);color:#333;margin-top:2px">${v.placa}</div>
            </div>`,
            iconSize: [28, 50],
            iconAnchor: [14, 28],
            popupAnchor: [0, -30],
          });

          const marker = L.marker([v.latitude, v.longitude], { icon: markerIcon }).addTo(map);

          marker.bindPopup(
            `<div style="font-size:12px;min-width:200px">
              <strong style="font-size:14px">${v.placa}</strong>
              <span style="background:${color};color:white;border-radius:3px;padding:1px 6px;font-size:10px;margin-left:6px">${statusInfo.label}</span><br/>
              <span style="color:#666">${v.nome || (v.marca || '') + ' ' + (v.modelo || '')}</span><br/>
              <hr style="margin:4px 0;border-color:#eee"/>
              ${v.motorista ? `<b>Motorista:</b> ${v.motorista}<br/>` : ''}
              <b>Velocidade:</b> ${v.velocidade || 0} km/h<br/>
              <b>Ignição:</b> ${v.ignicao ? '🟢 Ligada' : '⚫ Desligada'}<br/>
              <b>KM:</b> ${v.km ? v.km.toLocaleString('pt-BR') : '—'}<br/>
              <b>Endereço:</b> ${v.endereco || '—'}<br/>
              <b>Atualizado:</b> ${formatDateTime(v.dataHora)}<br/>
              <span style="color:#999;font-size:10px">${timeAgo(v.dataHora)}</span>
            </div>`,
          );

          marker.on('click', () => setSelectedVehicle(v));
          markersRef.current.push(marker);
        });

        if (withPos.length > 0) {
          const bounds = L.latLngBounds(withPos.map((v: any) => [v.latitude, v.longitude]));
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
      } else {
        const points = tracking.data || [];
        const center: [number, number] = points.length > 0
          ? [parseFloat(points[0].latitude), parseFloat(points[0].longitude)]
          : [-22.83, -45.23];

        const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, points.length > 0 ? 13 : 6);
        mapInstanceRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        if (points.length === 0) return;

        const vehicleGroups: Record<string, any[]> = {};
        points.forEach((p: any) => {
          const key = p.vehicle_id || "unknown";
          if (!vehicleGroups[key]) vehicleGroups[key] = [];
          vehicleGroups[key].push(p);
        });

        const colors = ["#0ea5e9", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];
        let colorIdx = 0;

        Object.entries(vehicleGroups).forEach(([vId, pts]) => {
          const color = colors[colorIdx % colors.length];
          colorIdx++;
          const latLngs = pts.map((p: any) => [parseFloat(p.latitude), parseFloat(p.longitude)] as [number, number]);
          if (latLngs.length > 1) {
            L.polyline(latLngs, { color, weight: 3, opacity: 0.7 }).addTo(map);
          }
          pts.forEach((p: any, i: number) => {
            const isFirst = i === 0;
            const isLast = i === pts.length - 1;
            if (isFirst || isLast || i % Math.max(1, Math.floor(pts.length / 20)) === 0) {
              const marker = L.circleMarker(
                [parseFloat(p.latitude), parseFloat(p.longitude)],
                { radius: isFirst || isLast ? 8 : 4, color, fillColor: color, fillOpacity: 0.8, weight: 2 },
              ).addTo(map);
              marker.bindPopup(
                `<div style="font-size:12px"><strong>${p.placa || "Veículo " + vId}</strong><br/>` +
                `${p.data_hora ? new Date(p.data_hora).toLocaleString("pt-BR") : ""}<br/>` +
                `Vel: ${p.velocidade || "—"} km/h<br/>` +
                `${p.endereco || ""}</div>`,
              );
            }
          });
        });

        const allLatLngs = points.map((p: any) => [parseFloat(p.latitude), parseFloat(p.longitude)] as [number, number]);
        if (allLatLngs.length > 0) {
          map.fitBounds(L.latLngBounds(allLatLngs), { padding: [30, 30] });
        }
      }
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab === 'live' ? filteredInfleet : tracking.data, activeTab]);

  const onCount = infleetVehicles.filter((v: any) => v.status === 'ON').length;
  const offCount = infleetVehicles.filter((v: any) => v.status === 'OFF').length;
  const outdatedCount = infleetVehicles.filter((v: any) => v.status === 'OUTDATED').length;

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-blue-600" /> Rastreamento
          </h1>
          <div className="flex gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === 'live' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setActiveTab('live')}>
                <Wifi className="h-3.5 w-3.5 inline mr-1" /> Tempo Real
              </button>
              <button
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setActiveTab('history')}>
                <Navigation className="h-3.5 w-3.5 inline mr-1" /> Histórico
              </button>
            </div>
            {activeTab === 'live' && (
              <Button variant="outline" size="sm" onClick={() => infleet.refetch()} disabled={infleet.isFetching}>
                <RefreshCw className={`h-4 w-4 mr-1 ${infleet.isFetching ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            )}
            {activeTab === 'history' && (
              <>
                <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleCsv} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importMut.isPending}>
                  <Upload className="h-4 w-4 mr-1" /> Importar CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => tracking.refetch()}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                </Button>
              </>
            )}
          </div>
        </div>

        {activeTab === 'live' && infleetVehicles.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span>
              <span className="font-medium">{onCount}</span> <span className="text-gray-500">Ligados</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"></span>
              <span className="font-medium">{offCount}</span> <span className="text-gray-500">Desligados</span>
            </div>
            {outdatedCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span>
                <span className="font-medium">{outdatedCount}</span> <span className="text-gray-500">Desatualizados</span>
              </div>
            )}
            <span className="text-xs text-gray-400 ml-2">Atualização automática a cada 60s</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center relative" style={{ zIndex: 900 }}>
          {activeTab === 'live' ? (
            <Select value={filterVehicle} onValueChange={(v) => { setFilterVehicle(v); setSelectedVehicle(null); }}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os veículos ({infleetVehicles.length})</SelectItem>
                {infleetVehicles.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.placa} — {v.nome || v.modelo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(localVehicles.data || []).map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.placa || v.modelo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Label className="text-xs">De:</Label>
                <Input type="date" className="w-[150px]" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs">Até:</Label>
                <Input type="date" className="w-[150px]" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </>
          )}
        </div>

        {activeTab === 'history' && (
          <div className="text-xs text-muted-foreground">
            CSV: vehicleId, latitude, longitude, data_hora (ISO), velocidade, endereco
          </div>
        )}

        {infleet.isLoading && activeTab === 'live' && (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando posições da Infleet...
          </div>
        )}

        {(infleet.data as any)?.error && activeTab === 'live' && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            Erro ao conectar com Infleet: {(infleet.data as any).error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-3">
            <Card>
              <CardContent className="p-0">
                <div ref={mapRef} className="w-full h-[520px] rounded-lg" style={{ minHeight: 400 }} />
              </CardContent>
            </Card>
          </div>

          {activeTab === 'live' && (
            <div className="lg:col-span-1">
              <Card className="h-[520px] flex flex-col">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm">Veículos ({infleetVehicles.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-y-auto">
                  {infleetVehicles.map((v: any) => {
                    const st = STATUS_COLORS[v.status] || STATUS_COLORS.OFF;
                    const Icon = TIPO_ICONS[v.tipo] || Car;
                    const isSelected = selectedVehicle?.id === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`px-3 py-2 border-b cursor-pointer hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                        onClick={() => {
                          setSelectedVehicle(v);
                          if (mapInstanceRef.current && v.latitude && v.longitude) {
                            mapInstanceRef.current.setView([v.latitude, v.longitude], 15, { animate: true });
                            markersRef.current.forEach(m => {
                              const ll = m.getLatLng();
                              if (Math.abs(ll.lat - v.latitude) < 0.0001 && Math.abs(ll.lng - v.longitude) < 0.0001) {
                                m.openPopup();
                              }
                            });
                          }
                        }}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-bold truncate">{v.placa}</span>
                              <Badge variant="outline" className={`text-[10px] px-1 py-0 ${st.bg} ${st.text} border-0`}>
                                {st.label}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-gray-500 truncate">{v.nome || `${v.marca} ${v.modelo}`}</p>
                            {v.motorista && <p className="text-[10px] text-gray-400 truncate">👤 {v.motorista}</p>}
                            {v.endereco && <p className="text-[10px] text-gray-400 truncate">📍 {v.endereco}</p>}
                            <div className="flex items-center gap-2 mt-0.5">
                              {v.velocidade != null && <span className="text-[10px] text-gray-400">{v.velocidade} km/h</span>}
                              <span className="text-[10px] text-gray-300">{timeAgo(v.dataHora)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {infleetVehicles.length === 0 && !infleet.isLoading && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Nenhum veículo encontrado
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {activeTab === 'history' && tracking.data && tracking.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{tracking.data.length} pontos registrados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Veículo</th>
                      <th className="text-left p-2">Data/Hora</th>
                      <th className="text-right p-2">Lat</th>
                      <th className="text-right p-2">Lng</th>
                      <th className="text-right p-2">Vel (km/h)</th>
                      <th className="text-left p-2">Endereço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracking.data.slice(0, 100).map((p: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono">{p.placa || p.vehicle_id}</td>
                        <td className="p-2">{p.data_hora ? new Date(p.data_hora).toLocaleString("pt-BR") : "—"}</td>
                        <td className="p-2 text-right">{parseFloat(p.latitude).toFixed(6)}</td>
                        <td className="p-2 text-right">{parseFloat(p.longitude).toFixed(6)}</td>
                        <td className="p-2 text-right">{p.velocidade || "—"}</td>
                        <td className="p-2 max-w-[200px] truncate">{p.endereco || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
