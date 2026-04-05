import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Upload, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export default function Rastreamento() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const [filterVehicle, setFilterVehicle] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const vehicles = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const tracking = trpc.frotas.listTracking.useQuery(
    {
      companyId: cId,
      vehicleId: filterVehicle !== "all" ? parseInt(filterVehicle) : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    { enabled: cId > 0 },
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

  useEffect(() => {
    if (!mapRef.current) return;
    const points = tracking.data || [];

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

      const center: [number, number] = points.length > 0
        ? [parseFloat(points[0].latitude), parseFloat(points[0].longitude)]
        : [-15.7801, -47.9292];

      const map = L.map(mapRef.current!, { zoomControl: true }).setView(center, points.length > 0 ? 13 : 4);
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
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [tracking.data]);

  return (
    <DashboardLayout>
      <div className="p-2 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-blue-600" /> Rastreamento
          </h1>
          <div className="flex gap-2">
            <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={handleCsv} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importMut.isPending}>
              <Upload className="h-4 w-4 mr-1" /> {importMut.isPending ? "Importando..." : "Importar CSV"}
            </Button>
            <Button variant="outline" onClick={() => tracking.refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(vehicles.data || []).map((v: any) => (
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
        </div>

        <div className="text-xs text-muted-foreground">
          CSV: vehicleId, latitude, longitude, data_hora (ISO), velocidade, endereco
        </div>

        <Card>
          <CardContent className="p-0">
            <div ref={mapRef} className="w-full h-[500px] rounded-lg" style={{ minHeight: 400 }} />
          </CardContent>
        </Card>

        {tracking.data && tracking.data.length > 0 && (
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
