import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Car, Plus, MapPin, CheckCircle2, XCircle, PlayCircle, FlagTriangleRight,
  Camera, Gauge, Receipt, Banknote, Trash2, FileText, AlertCircle, Loader2,
  Clock, TrendingUp, Navigation, Route, Fuel, TriangleAlert, LocateFixed, Search,
} from "lucide-react";
import { compressImageIfNeeded } from "@/lib/imageCompress";

const MOTIVOS = [
  { value: "obra", label: "Obra em andamento" },
  { value: "orcamento", label: "Orçamento / Visita Técnica" },
  { value: "prospeccao", label: "Prospecção de Cliente" },
  { value: "manutencao", label: "Manutenção do Veículo" },
  { value: "outro", label: "Outro" },
];

const TIPOS_DESPESA = [
  { value: "alimentacao", label: "Alimentação" },
  { value: "combustivel_externo", label: "Combustível Externo" },
  { value: "estacionamento", label: "Estacionamento" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "outro", label: "Outro" },
];

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  pendente:     { label: "Ag. Autorização", color: "bg-amber-100 text-amber-800 border-amber-200",   dot: "bg-amber-500" },
  autorizada:   { label: "Autorizada",      color: "bg-blue-100 text-blue-800 border-blue-200",     dot: "bg-blue-500" },
  em_andamento: { label: "Em Andamento",    color: "bg-emerald-100 text-emerald-800 border-emerald-200", dot: "bg-emerald-500" },
  concluida:    { label: "Concluída",       color: "bg-gray-100 text-gray-700 border-gray-200",     dot: "bg-gray-400" },
  cancelada:    { label: "Cancelada",       color: "bg-red-100 text-red-700 border-red-200",         dot: "bg-red-400" },
  rejeitada:    { label: "Rejeitada",       color: "bg-red-200 text-red-900 border-red-300",         dot: "bg-red-600" },
};

const REEMB_MAP: Record<string, { label: string; color: string }> = {
  pendente:         { label: "Pendente",      color: "bg-amber-100 text-amber-800" },
  aprovado:         { label: "Aprovado",      color: "bg-blue-100 text-blue-800" },
  pago:             { label: "Pago",          color: "bg-green-100 text-green-800" },
  rejeitado:        { label: "Rejeitado",     color: "bg-red-100 text-red-800" },
  nao_reembolsavel: { label: "Própria conta", color: "bg-gray-100 text-gray-600" },
};

// ─── Vehicle type colors ──────────────────────────────────────────────────────
const TIPO_COLORS: Record<string, string> = {
  "Carro":       "from-sky-500 to-sky-700",
  "Caminhonete": "from-indigo-500 to-indigo-700",
  "Caminhão":    "from-slate-500 to-slate-700",
  "Moto":        "from-orange-500 to-orange-700",
  "Van":         "from-purple-500 to-purple-700",
  "Ônibus":      "from-teal-500 to-teal-700",
  "default":     "from-gray-500 to-gray-700",
};

function getGradient(tipo: string) {
  return TIPO_COLORS[tipo] || TIPO_COLORS["default"];
}

function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtCurrency(v: any) {
  return (parseFloat(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtKm(v: any) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR") + " km";
}

async function fileToBase64(file: File): Promise<{ base64: string; contentType: string }> {
  const compressed = await compressImageIfNeeded(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ base64: result.split(",")[1], contentType: compressed.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}

// ─── Photo Upload Button ───────────────────────────────────────────────────────
function PhotoButton({ label, url, onUpload, disabled }: { label: string; url: string | null; onUpload: (u: string) => void; disabled?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const { selectedCompanyId } = useCompany();
  const cId = parseInt(selectedCompanyId || "0");
  const uploadMut = trpc.frotas.uploadTripPhoto.useMutation();
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { base64, contentType } = await fileToBase64(file);
      const res = await uploadMut.mutateAsync({ companyId: cId, base64, contentType });
      onUpload(res.url);
    } catch (err: any) {
      alert("Erro ao enviar foto: " + (err.message || String(err)));
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-1">
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <Button type="button" variant="outline" size="sm" disabled={disabled || uploading}
        className="w-full gap-2" onClick={() => ref.current?.click()}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {url ? "Trocar Foto" : label}
      </Button>
      {url && <a href={url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 underline truncate">Ver foto atual</a>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ViagensFrotas() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const cId = parseInt(selectedCompanyId || "0");
  const isAdmin = (user as any)?.role === "admin" || (user as any)?.role === "admin_master";
  const userName = (user as any)?.name || (user as any)?.email || "Sistema";

  const [statusFilter, setStatusFilter] = useState("todos");
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [sheetTab, setSheetTab] = useState("viagem");
  const [showNew, setShowNew] = useState(false);
  const [actionDlg, setActionDlg] = useState<null | { action: string }>(null);
  const [showExpense, setShowExpense] = useState(false);
  const [showReimbDlg, setShowReimbDlg] = useState<null | { expenseId: number; current: any }>(null);

  const { data: trips = [], refetch: refetchTrips } = trpc.frotas.getTrips.useQuery(
    { companyId: cId, status: statusFilter === "todos" ? undefined : statusFilter },
    { enabled: cId > 0 }
  );
  const { data: tripDetail, refetch: refetchDetail } = trpc.frotas.getTripById.useQuery(
    { companyId: cId, tripId: selectedTripId! },
    { enabled: !!selectedTripId && cId > 0 }
  );
  const { data: vehicles = [] } = trpc.frotas.listVehicles.useQuery(
    { companyId: cId, status: "Ativo" },
    { enabled: cId > 0 }
  );
  const { data: pending = [] } = trpc.frotas.getPendingReimbursements.useQuery(
    { companyId: cId }, { enabled: cId > 0 && isAdmin }
  );

  const createTrip = trpc.frotas.createTrip.useMutation({ onSuccess: () => { refetchTrips(); setShowNew(false); } });
  const updateStatus = trpc.frotas.updateTripStatus.useMutation({ onSuccess: () => { refetchTrips(); refetchDetail(); setActionDlg(null); } });
  const getOdometer = trpc.frotas.getVehicleOdometerInfleet.useMutation();
  const addExpense = trpc.frotas.addTripExpense.useMutation({ onSuccess: () => { refetchDetail(); setShowExpense(false); } });
  const delExpense = trpc.frotas.deleteTripExpense.useMutation({ onSuccess: () => { refetchDetail(); } });
  const updateReimb = trpc.frotas.updateTripExpenseReimbursement.useMutation({ onSuccess: () => { refetchDetail(); refetchTrips(); setShowReimbDlg(null); } });

  const totals = {
    all: trips.length,
    pendente: trips.filter((t: any) => t.status === "pendente").length,
    em_andamento: trips.filter((t: any) => t.status === "em_andamento").length,
    concluida: trips.filter((t: any) => t.status === "concluida").length,
  };

  const FILTERS = [
    { key: "todos", label: "Todas" },
    { key: "pendente", label: "Ag. Autorização" },
    { key: "autorizada", label: "Autorizadas" },
    { key: "em_andamento", label: "Em Andamento" },
    { key: "concluida", label: "Concluídas" },
    { key: "rejeitada", label: "Rejeitadas" },
  ];

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Navigation className="h-6 w-6 text-sky-600" /> Controle de Viagens
          </h1>
          <p className="text-sm text-muted-foreground">Registro, autorização e reembolso de viagens da frota</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-2 bg-sky-600 hover:bg-sky-700">
          <Plus className="h-4 w-4" /> Nova Viagem
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total de Viagens", value: totals.all, icon: Car, bg: "bg-slate-50", icon_color: "text-slate-500" },
          { label: "Ag. Autorização", value: totals.pendente, icon: Clock, bg: "bg-amber-50", icon_color: "text-amber-500" },
          { label: "Em Andamento", value: totals.em_andamento, icon: TrendingUp, bg: "bg-emerald-50", icon_color: "text-emerald-500" },
          { label: "Concluídas", value: totals.concluida, icon: CheckCircle2, bg: "bg-gray-50", icon_color: "text-gray-400" },
        ].map(({ label, value, icon: Icon, bg, icon_color }) => (
          <Card key={label} className={`${bg} border-0 shadow-sm`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center bg-white shadow-sm`}>
                <Icon className={`h-5 w-5 ${icon_color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 items-center">
        {FILTERS.map(({ key, label }) => (
          <Button key={key} variant={statusFilter === key ? "default" : "outline"} size="sm"
            className={statusFilter === key ? "bg-sky-600 hover:bg-sky-700" : ""}
            onClick={() => setStatusFilter(key)}>
            {label}
          </Button>
        ))}
        {isAdmin && pending.length > 0 && (
          <Button variant={statusFilter === "_reembolsos" ? "default" : "outline"} size="sm"
            className={`gap-1 ml-auto ${statusFilter === "_reembolsos" ? "bg-amber-600 hover:bg-amber-700" : ""}`}
            onClick={() => setStatusFilter("_reembolsos")}>
            <Banknote className="h-4 w-4" /> Reembolsos
            <Badge className="ml-1 h-5 bg-red-500 text-white px-1.5">{pending.length}</Badge>
          </Button>
        )}
      </div>

      {/* Reimbursements Panel */}
      {statusFilter === "_reembolsos" && (
        <Card className="overflow-hidden">
          <div className="bg-amber-600 px-5 py-3 text-white font-semibold flex items-center gap-2">
            <Banknote className="h-5 w-5" /> Despesas Aguardando Reembolso
          </div>
          <div className="divide-y">
            {pending.map((e: any) => (
              <div key={e.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{e.motorista_nome} {e.placa && <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded ml-1">{e.placa}</span>}</p>
                  <p className="text-xs text-muted-foreground">{e.origem} → {e.destino} · {fmtDate(e.data_saida)}</p>
                  <p className="text-xs mt-1 capitalize">{TIPOS_DESPESA.find(t => t.value === e.tipo)?.label || e.tipo} · {fmtDate(e.data)}</p>
                  {e.descricao && <p className="text-xs text-muted-foreground break-words">{e.descricao}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-lg">{fmtCurrency(e.valor)}</p>
                  <Badge className={`text-xs ${REEMB_MAP[e.status_reembolso]?.color || ""}`}>{REEMB_MAP[e.status_reembolso]?.label}</Badge>
                  <div className="flex gap-2 mt-2">
                    {e.comprovante_url && (
                      <a href={e.comprovante_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="gap-1 h-7"><FileText className="h-3 w-3" /></Button>
                      </a>
                    )}
                    <Button size="sm" className="gap-1 h-7 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setShowReimbDlg({ expenseId: e.id, current: e })}>
                      <Banknote className="h-3 w-3" /> Pagar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Trips Table */}
      {statusFilter !== "_reembolsos" && (
        <Card>
          <CardContent className="p-0">
            {trips.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Car className="h-8 w-8 opacity-40" />
                </div>
                <p className="font-medium">Nenhuma viagem encontrada</p>
                <p className="text-sm mt-1">Registre a primeira viagem da frota</p>
                <Button className="mt-4 gap-2 bg-sky-600 hover:bg-sky-700" onClick={() => setShowNew(true)}>
                  <Plus className="h-4 w-4" /> Nova Viagem
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {trips.map((t: any) => {
                  const s = STATUS_MAP[t.status] || STATUS_MAP["cancelada"];
                  const kmPercorridos = t.km_inicial && t.km_final
                    ? parseFloat(t.km_final) - parseFloat(t.km_inicial) : null;
                  return (
                    <div key={t.id} className="p-4 hover:bg-sky-50/50 cursor-pointer transition-colors group"
                      onClick={() => { setSelectedTripId(t.id); setSheetTab("viagem"); }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{t.motorista_nome}</span>
                            {t.placa && (
                              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded border font-bold tracking-wider">{t.placa}</span>
                            )}
                            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${s.color}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                              {s.label}
                            </span>
                            {parseInt(t.despesas_pendentes) > 0 && (
                              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                                {t.despesas_pendentes} despesa(s) pend.
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-sm">
                            <MapPin className="h-3 w-3 text-emerald-500 shrink-0" />
                            <span className="text-muted-foreground truncate">{t.origem}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium truncate">{t.destino}</span>
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>{MOTIVOS.find(m => m.value === t.motivo)?.label || t.motivo}</span>
                            {t.obra_nome && <span className="text-sky-700 font-medium">📋 {t.obra_nome}</span>}
                            <span>{fmtDate(t.data_saida) || fmtDate(t.criado_em)}</span>
                            {t.km_inicial && <span className="flex items-center gap-0.5"><Gauge className="h-3 w-3" /> {fmtKm(t.km_inicial)}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {parseFloat(t.total_despesas) > 0 && (
                            <p className="text-sm font-bold text-amber-700">{fmtCurrency(t.total_despesas)}</p>
                          )}
                          {kmPercorridos != null && (
                            <p className="text-xs text-muted-foreground">{fmtKm(kmPercorridos)} perc.</p>
                          )}
                          <p className="text-xs text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity mt-1">Ver detalhes →</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Nova Viagem Dialog ─── */}
      <NovaViagemDialog
        open={showNew} onClose={() => setShowNew(false)}
        cId={cId} vehicles={vehicles as any[]}
        onSubmit={(data) => createTrip.mutateAsync({ ...data, companyId: cId, criadoPor: userName })}
        loading={createTrip.isPending}
      />

      {/* ─── Trip Detail Sheet ─── */}
      <Sheet open={!!selectedTripId} onOpenChange={(o) => { if (!o) setSelectedTripId(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {tripDetail && (
            <TripDetailSheet
              trip={tripDetail} isAdmin={isAdmin} userName={userName} cId={cId}
              sheetTab={sheetTab} setSheetTab={setSheetTab}
              onAction={(action) => setActionDlg({ action })}
              onAddExpense={() => setShowExpense(true)}
              onDeleteExpense={(id) => {
                if (window.confirm("Excluir esta despesa?")) delExpense.mutate({ companyId: cId, expenseId: id });
              }}
              onReimburse={(expenseId, current) => setShowReimbDlg({ expenseId, current })}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Action Dialog ─── */}
      {actionDlg && tripDetail && (
        <ActionDialog
          action={actionDlg.action} trip={tripDetail} cId={cId} userName={userName}
          onClose={() => setActionDlg(null)}
          onGetOdometer={() => getOdometer.mutateAsync({ companyId: cId, placa: tripDetail.placa || tripDetail.v_placa || "" })}
          odometerLoading={getOdometer.isPending}
          onConfirm={(data) => updateStatus.mutateAsync({ companyId: cId, tripId: tripDetail.id, ...data as any })}
          loading={updateStatus.isPending}
        />
      )}

      {/* ─── Add Expense Dialog ─── */}
      {showExpense && selectedTripId && (
        <ExpenseDialog cId={cId} tripId={selectedTripId} userName={userName}
          onClose={() => setShowExpense(false)}
          onSubmit={(data) => addExpense.mutateAsync({ ...data, companyId: cId, tripId: selectedTripId, criadoPor: userName })}
          loading={addExpense.isPending}
        />
      )}

      {/* ─── Reimbursement Dialog ─── */}
      {showReimbDlg && (
        <ReimbursementDialog
          expenseId={showReimbDlg.expenseId} current={showReimbDlg.current}
          cId={cId} userName={userName}
          onClose={() => setShowReimbDlg(null)}
          onSubmit={(data) => updateReimb.mutateAsync({ ...data, companyId: cId, expenseId: showReimbDlg.expenseId })}
          loading={updateReimb.isPending}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NOVA VIAGEM DIALOG — vehicle picker as a list Sheet
// ─────────────────────────────────────────────────────────────────────────────

function VehicleThumb({ vehicle, size = 48 }: { vehicle: any; size?: number }) {
  const gradient = getGradient(vehicle.tipoVeiculo || "");
  return (
    <div
      className={`rounded-lg overflow-hidden flex items-center justify-center shrink-0 bg-gradient-to-br ${gradient}`}
      style={{ width: size, height: size }}>
      {vehicle.fotoUrl || vehicle.foto_url ? (
        <img src={vehicle.fotoUrl || vehicle.foto_url} alt={vehicle.placa}
          className="w-full h-full object-cover" />
      ) : (
        <Car className="text-white/80" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </div>
  );
}

function VehiclePickerSheet({ open, onClose, vehicles, selectedId, onSelect }: {
  open: boolean; onClose: () => void; vehicles: any[];
  selectedId: number | null; onSelect: (v: any) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = vehicles.filter((v: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (v.placa || "").toLowerCase().includes(q)
      || (v.modelo || "").toLowerCase().includes(q)
      || (v.marca || "").toLowerCase().includes(q)
      || (v.motorista_padrao || "").toLowerCase().includes(q);
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0 rounded-t-2xl">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-sky-700">
            <Car className="h-5 w-5" /> Selecionar Veículo
          </SheetTitle>
          <Input
            placeholder="Buscar por placa, modelo ou motorista..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="mt-2"
            autoFocus
          />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum veículo ativo encontrado
            </div>
          )}
          {filtered.map((v: any) => {
            const isSelected = v.id === selectedId;
            return (
              <button key={v.id} type="button"
                onClick={() => { onSelect(v); onClose(); }}
                className={`w-full flex items-center gap-4 p-4 text-left transition-colors ${
                  isSelected ? "bg-sky-50" : "hover:bg-gray-50 active:bg-gray-100"
                }`}>
                <VehicleThumb vehicle={v} size={56} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-bold tracking-widest text-gray-900">
                      {v.placa || "Sem placa"}
                    </span>
                    {v.tipoVeiculo && (
                      <Badge variant="outline" className="text-xs font-normal">{v.tipoVeiculo}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5">
                    {[v.marca, v.modelo, v.anoFabricacao].filter(Boolean).join(" ")}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {(v.motorista_nome || v.motorista_padrao) && (
                      <span>👤 {v.motorista_nome || v.motorista_padrao}</span>
                    )}
                    {parseFloat(v.km_atual || "0") > 0 && (
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {Number(v.km_atual).toLocaleString("pt-BR")} km
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && <CheckCircle2 className="h-5 w-5 text-sky-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RoutePreview({ cId, origin, destination }: { cId: number; origin: string; destination: string }) {
  const [debouncedOrigin, setDebouncedOrigin] = useState(origin);
  const [debouncedDest, setDebouncedDest] = useState(destination);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedOrigin(origin), 900);
    return () => clearTimeout(t);
  }, [origin]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedDest(destination), 900);
    return () => clearTimeout(t);
  }, [destination]);

  const enabled = debouncedOrigin.length >= 4 && debouncedDest.length >= 4;

  const { data: route, isFetching, error } = trpc.frotas.getRouteInfo.useQuery(
    { companyId: cId, origin: debouncedOrigin, destination: debouncedDest },
    { enabled, staleTime: 60_000, retry: false }
  );

  const mapSrc = enabled
    ? `https://maps.google.com/maps?saddr=${encodeURIComponent(debouncedOrigin)}&daddr=${encodeURIComponent(debouncedDest)}&output=embed&hl=pt-BR`
    : null;

  if (!enabled) return null;

  return (
    <div className="rounded-xl border overflow-hidden bg-white shadow-sm">
      {/* Map iframe */}
      <div className="relative h-40 bg-gray-100">
        {mapSrc && (
          <iframe
            src={mapSrc}
            className="w-full h-full border-0"
            loading="lazy"
            title="Mapa do trajeto"
          />
        )}
        {isFetching && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
              Calculando rota...
            </div>
          </div>
        )}
      </div>

      {/* Route info cards */}
      {route?.ok && (
        <div className="grid grid-cols-4 divide-x border-t bg-gradient-to-r from-sky-50 to-indigo-50">
          <div className="p-2 text-center">
            <Route className="h-4 w-4 text-sky-600 mx-auto mb-0.5" />
            <p className="text-xs text-muted-foreground">Distância</p>
            <p className="font-bold text-sm text-sky-800">{route.distanceText}</p>
          </div>
          <div className="p-2 text-center">
            <Clock className="h-4 w-4 text-indigo-600 mx-auto mb-0.5" />
            <p className="text-xs text-muted-foreground">Tempo</p>
            <p className="font-bold text-sm text-indigo-800">{route.durationText}</p>
          </div>
          <div className="p-2 text-center">
            <TriangleAlert className="h-4 w-4 text-amber-600 mx-auto mb-0.5" />
            <p className="text-xs text-muted-foreground">Pedágio est.</p>
            <p className="font-bold text-sm text-amber-800">
              {route.tollEstimate > 0 ? fmtCurrency(route.tollEstimate) : "Sem pedágio"}
            </p>
          </div>
          <div className="p-2 text-center">
            <Fuel className="h-4 w-4 text-emerald-600 mx-auto mb-0.5" />
            <p className="text-xs text-muted-foreground">Comb. est.</p>
            <p className="font-bold text-sm text-emerald-800">{fmtCurrency(route.fuelEstimate)}</p>
          </div>
        </div>
      )}

      {route && !route.ok && (
        <div className="p-3 text-xs text-amber-700 bg-amber-50 flex items-center gap-2 border-t">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {route.erro || "Não foi possível calcular a rota. Insira endereços mais específicos."}
        </div>
      )}

      {route?.ok && (
        <div className="px-3 py-1.5 bg-gray-50 border-t text-[10px] text-muted-foreground">
          Via {route.summary} · Estimativas baseadas em consumo médio e tarifa média de pedágios BR
        </div>
      )}
    </div>
  );
}

// ─── Address Autocomplete ─────────────────────────────────────────────────────
function AddressAutocomplete({
  value, onChange, placeholder, label, cId, showGps = false,
}: {
  value: string; onChange: (v: string) => void;
  placeholder: string; label: string; cId: number; showGps?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  // Debounce the search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debouncedQuery.length >= 2;

  const { data: suggestions = [], isFetching } = trpc.frotas.getPlaceAutocomplete.useQuery(
    { companyId: cId, input: debouncedQuery },
    { enabled, staleTime: 30_000, retry: false }
  );

  // Use reverseGeocode as a lazy query via utils
  const utils = trpc.useUtils();

  const handleGps = async () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError("GPS não disponível neste navegador.");
      return;
    }
    setGpsLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 12000,
        })
      );
      const result = await utils.frotas.reverseGeocode.fetch({
        companyId: cId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
      if (result?.address) {
        setQuery(result.address);
        onChange(result.address);
      } else {
        setGpsError("Endereço não identificado — tente digitar manualmente.");
      }
    } catch (e: any) {
      if (e?.code === 1)
        setGpsError("Permissão negada. Ative a localização nas configurações do dispositivo.");
      else if (e?.code === 3)
        setGpsError("Tempo esgotado. Verifique o sinal de GPS e tente novamente.");
      else
        setGpsError("Erro ao obter localização. Digite o endereço manualmente.");
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSelect = (description: string) => {
    setQuery(description);
    onChange(description);
    setDropOpen(false);
    setGpsError(null);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              onChange(e.target.value);
              setDropOpen(true);
              setGpsError(null);
            }}
            onFocus={() => { if (query.length >= 2) setDropOpen(true); }}
            placeholder={placeholder}
            className="h-11 text-base pl-9 pr-2"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-sky-500 pointer-events-none" />
          )}
        </div>
        {showGps && (
          <Button type="button" variant="outline" size="icon"
            className="h-11 w-11 shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            title="Usar minha localização atual (GPS)"
            onClick={handleGps} disabled={gpsLoading}>
            {gpsLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <LocateFixed className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Erro GPS inline */}
      {gpsError && (
        <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 shrink-0" />{gpsError}
        </p>
      )}

      {/* Dropdown de sugestões */}
      {dropOpen && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white rounded-xl border shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((s: any) => (
            <button key={s.place_id} type="button"
              onMouseDown={(e) => e.preventDefault()} // evita onBlur antes do click
              onClick={() => handleSelect(s.description)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-sky-50 active:bg-sky-100 transition-colors border-b last:border-b-0">
              <MapPin className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                {s.structured_formatting ? (
                  <>
                    <p className="text-sm font-medium text-gray-900 leading-tight">
                      {s.structured_formatting.main_text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
                      {s.structured_formatting.secondary_text}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-800 leading-tight">{s.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NovaViagemDialog({ open, onClose, cId, vehicles, onSubmit, loading }: any) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [motoristaNome, setMotoristaNome] = useState("");
  const [kmAtual, setKmAtual] = useState("");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("obra");
  const [motivoDescricao, setMotivoDescricao] = useState("");
  const [obraNome, setObraNome] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedVehicleId(null);
      setMotoristaNome("");
      setKmAtual("");
      setOrigem("");
      setDestino("");
      setMotivo("obra");
      setMotivoDescricao("");
      setObraNome("");
    }
  }, [open]);

  const selectedVehicle = vehicles.find((v: any) => v.id === selectedVehicleId);

  const handleSelectVehicle = (v: any) => {
    setSelectedVehicleId(v.id);
    if (v.km_atual && parseFloat(v.km_atual) > 0) {
      setKmAtual(String(Math.round(parseFloat(v.km_atual))));
    }
    const driver = v.motorista_nome || v.motorista_padrao || "";
    if (driver) setMotoristaNome(driver);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motoristaNome || !origem || !destino) return;
    await onSubmit({
      vehicleId: selectedVehicleId,
      placa: selectedVehicle?.placa || null,
      motoristaNome,
      origem,
      destino,
      motivo: motivo as any,
      motivoDescricao: motivoDescricao || null,
      obraNome: motivo === "obra" ? obraNome || null : null,
    });
  };

  const showMap = origem.length >= 4 && destino.length >= 4;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="w-full max-w-lg max-h-[92vh] flex flex-col p-0 gap-0">
          {/* Header fixo */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex gap-2 text-sky-700 text-lg">
              <Navigation className="h-5 w-5 mt-0.5" /> Nova Viagem
            </DialogTitle>
          </DialogHeader>

          {/* Corpo rolável */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <form id="nova-viagem-form" onSubmit={handleSubmit} className="space-y-5">

              {/* ── 1. Veículo ── */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Car className="h-4 w-4 text-sky-600" /> Veículo
                </Label>

                {selectedVehicle ? (
                  /* Veículo selecionado — mostra linha completa + botão trocar */
                  <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-sky-400 bg-sky-50">
                    <VehicleThumb vehicle={selectedVehicle} size={52} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-base font-bold tracking-widest text-gray-900">
                        {selectedVehicle.placa}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {[selectedVehicle.marca, selectedVehicle.modelo, selectedVehicle.anoFabricacao].filter(Boolean).join(" ")}
                      </p>
                      {parseFloat(selectedVehicle.km_atual || "0") > 0 && (
                        <p className="text-xs text-sky-600 mt-0.5 flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          {Number(selectedVehicle.km_atual).toLocaleString("pt-BR")} km registrados
                        </p>
                      )}
                    </div>
                    <Button type="button" variant="outline" size="sm"
                      className="shrink-0 text-sky-700 border-sky-300"
                      onClick={() => setShowPicker(true)}>
                      Trocar
                    </Button>
                  </div>
                ) : (
                  /* Nenhum selecionado — botão para abrir lista */
                  <button type="button" onClick={() => setShowPicker(true)}
                    className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-sky-400 hover:bg-sky-50 transition-colors text-left">
                    <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Car className="h-6 w-6 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-700">Selecionar veículo</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {vehicles.length} veículo{vehicles.length !== 1 ? "s" : ""} ativo{vehicles.length !== 1 ? "s" : ""} disponível{vehicles.length !== 1 ? "is" : ""}
                      </p>
                    </div>
                    <span className="ml-auto text-sky-600 text-sm font-medium">Ver lista →</span>
                  </button>
                )}
              </div>

              <Separator />

              {/* ── 2. Motorista ── */}
              <div className="space-y-1">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  Motorista *
                  {motoristaNome && selectedVehicle &&
                    motoristaNome === (selectedVehicle.motorista_nome || selectedVehicle.motorista_padrao) && (
                    <Badge className="text-[10px] font-normal bg-green-100 text-green-700 border-green-200">
                      preenchido automaticamente
                    </Badge>
                  )}
                </Label>
                <Input placeholder="Nome completo do motorista" value={motoristaNome}
                  onChange={e => setMotoristaNome(e.target.value)} required className="h-11 text-base" />
              </div>

              {/* ── 3. KM Atual ── */}
              <div className="space-y-1">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-sky-600" /> KM Atual do Veículo
                  {kmAtual && selectedVehicle && (
                    <Badge className="text-[10px] font-normal bg-sky-100 text-sky-700 border-sky-200">
                      preenchido automaticamente
                    </Badge>
                  )}
                </Label>
                <Input type="number" placeholder="Ex: 125.400" value={kmAtual}
                  onChange={e => setKmAtual(e.target.value)} className="h-11 text-base font-mono" />
                <p className="text-xs text-muted-foreground">
                  Informação do último KM registrado — edite se necessário
                </p>
              </div>

              <Separator />

              {/* ── 4. Trajeto ── */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600" /> Trajeto
                </Label>

                <AddressAutocomplete
                  cId={cId} value={origem} onChange={setOrigem}
                  label="Local de Saída *"
                  placeholder="Digite cidade, rua ou CEP..."
                  showGps
                />

                <AddressAutocomplete
                  cId={cId} value={destino} onChange={setDestino}
                  label="Destino *"
                  placeholder="Digite cidade, rua ou CEP..."
                />

                {/* Mapa e info de rota */}
                {showMap ? (
                  <RoutePreview cId={cId} origin={origem} destination={destino} />
                ) : (
                  <div className="flex items-center gap-2 py-3 px-4 rounded-xl border border-dashed text-sm text-muted-foreground">
                    <Route className="h-4 w-4 opacity-40 shrink-0" />
                    Preencha origem e destino para ver o trajeto no mapa
                  </div>
                )}
              </div>

              <Separator />

              {/* ── 5. Motivo ── */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Motivo da Viagem *</Label>
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {motivo === "obra" && (
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Nome da Obra / Projeto</Label>
                    <Input placeholder="Ex: Edifício Solar - Bl. A" value={obraNome}
                      onChange={e => setObraNome(e.target.value)} className="h-11 text-base" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Observações</Label>
                  <Textarea placeholder="Detalhes adicionais sobre a viagem..." rows={3}
                    value={motivoDescricao} onChange={e => setMotivoDescricao(e.target.value)} />
                </div>
              </div>

            </form>
          </div>

          {/* Footer fixo */}
          <div className="px-5 py-4 border-t bg-gray-50 flex gap-3 shrink-0">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-11">
              Cancelar
            </Button>
            <Button type="submit" form="nova-viagem-form" disabled={loading}
              className="flex-2 h-11 gap-2 bg-sky-600 hover:bg-sky-700 text-base font-semibold px-8">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              {loading ? "Criando..." : "Criar Viagem"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Picker de veículo como Sheet bottom */}
      <VehiclePickerSheet
        open={showPicker}
        onClose={() => setShowPicker(false)}
        vehicles={vehicles}
        selectedId={selectedVehicleId}
        onSelect={handleSelectVehicle}
      />
    </>
  );
}

// ─── Trip Detail Sheet ─────────────────────────────────────────────────────────
function TripDetailSheet({ trip, isAdmin, userName, cId, sheetTab, setSheetTab, onAction, onAddExpense, onDeleteExpense, onReimburse }: any) {
  const status = trip.status;
  const expenses: any[] = trip.expenses || [];
  const totalDespesas = expenses.reduce((s: number, e: any) => s + parseFloat(e.valor || 0), 0);
  const kmPercorridos = trip.km_inicial && trip.km_final
    ? parseFloat(trip.km_final) - parseFloat(trip.km_inicial) : null;
  const s = STATUS_MAP[status] || STATUS_MAP["cancelada"];

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-3 border-b bg-gradient-to-r from-sky-50 to-white">
        <div className="flex items-center gap-2 flex-wrap">
          <SheetTitle className="text-base">{trip.motorista_nome}</SheetTitle>
          {trip.placa && <span className="font-mono text-sm font-bold bg-gray-800 text-white px-2 py-0.5 rounded tracking-widest">{trip.placa}</span>}
          <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${s.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3 text-emerald-500" /> {trip.origem}
          <span className="mx-1">→</span>
          <span className="font-medium text-foreground">{trip.destino}</span>
        </p>
        {trip.v_marca && <p className="text-xs text-muted-foreground">{trip.v_marca} {trip.v_modelo}</p>}
      </SheetHeader>

      {/* Action Buttons */}
      <div className="px-5 py-3 flex flex-wrap gap-2 border-b bg-muted/20">
        {status === "pendente" && isAdmin && (
          <>
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => onAction("autorizar")}>
              <CheckCircle2 className="h-4 w-4" /> Autorizar
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={() => onAction("rejeitar")}>
              <XCircle className="h-4 w-4" /> Rejeitar
            </Button>
          </>
        )}
        {status === "autorizada" && (
          <Button size="sm" className="gap-1 bg-sky-600 hover:bg-sky-700" onClick={() => onAction("iniciar")}>
            <PlayCircle className="h-4 w-4" /> Iniciar Viagem
          </Button>
        )}
        {status === "em_andamento" && (
          <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => onAction("finalizar")}>
            <FlagTriangleRight className="h-4 w-4" /> Finalizar Viagem
          </Button>
        )}
        {(status === "pendente" || status === "autorizada") && (
          <Button size="sm" variant="outline" className="gap-1 text-red-600 border-red-200" onClick={() => onAction("cancelar")}>
            <XCircle className="h-4 w-4" /> Cancelar
          </Button>
        )}
      </div>

      <Tabs value={sheetTab} onValueChange={setSheetTab}>
        <TabsList className="w-full rounded-none border-b h-10 px-5 bg-white">
          <TabsTrigger value="viagem">Viagem</TabsTrigger>
          <TabsTrigger value="despesas" className="flex gap-1">
            Despesas {expenses.length > 0 && <Badge className="h-4 text-[10px] px-1">{expenses.length}</Badge>}
          </TabsTrigger>
          {isAdmin && <TabsTrigger value="reembolso">Reembolso</TabsTrigger>}
        </TabsList>

        {/* Tab: Viagem */}
        <TabsContent value="viagem" className="p-5 space-y-4 m-0">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Motivo" value={MOTIVOS.find(m => m.value === trip.motivo)?.label || trip.motivo} />
            {trip.obra_nome && <InfoRow label="Obra / Projeto" value={trip.obra_nome} />}
            {trip.motivo_descricao && <InfoRow label="Descrição" value={trip.motivo_descricao} />}
            <InfoRow label="Saída" value={trip.data_saida ? new Date(trip.data_saida).toLocaleString("pt-BR") : "Não iniciada"} />
            <InfoRow label="Chegada" value={trip.data_retorno ? new Date(trip.data_retorno).toLocaleString("pt-BR") : "—"} />
            {trip.autorizado_por && <InfoRow label="Autorizado por" value={trip.autorizado_por} />}
            {trip.observacoes_gestor && <InfoRow label="Observação do Gestor" value={trip.observacoes_gestor} />}
          </div>
          <Separator />
          <h3 className="font-semibold text-sm flex items-center gap-2"><Gauge className="h-4 w-4 text-sky-600" /> Quilometragem</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 p-3 rounded-xl border bg-sky-50/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">KM Inicial</p>
              <p className="text-2xl font-bold text-sky-800">{fmtKm(trip.km_inicial)}</p>
              {trip.foto_km_inicial_url
                ? <a href={trip.foto_km_inicial_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 underline"><Camera className="h-3 w-3" /> Ver foto</a>
                : <p className="text-xs text-muted-foreground">Sem foto</p>}
            </div>
            <div className="space-y-2 p-3 rounded-xl border bg-indigo-50/50">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">KM Final</p>
              <p className="text-2xl font-bold text-indigo-800">{fmtKm(trip.km_final)}</p>
              {trip.foto_km_final_url
                ? <a href={trip.foto_km_final_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 underline"><Camera className="h-3 w-3" /> Ver foto</a>
                : <p className="text-xs text-muted-foreground">Sem foto</p>}
            </div>
          </div>
          {kmPercorridos != null && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-center">
              <p className="text-xs opacity-80">Total percorrido nesta viagem</p>
              <p className="text-3xl font-bold">{fmtKm(kmPercorridos)}</p>
            </div>
          )}
        </TabsContent>

        {/* Tab: Despesas */}
        <TabsContent value="despesas" className="p-5 space-y-3 m-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Despesas da Viagem</h3>
            <Button size="sm" className="gap-1 bg-sky-600 hover:bg-sky-700" onClick={onAddExpense}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          {expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma despesa registrada</p>
            </div>
          ) : (
            <div className="space-y-2">
              {expenses.map((e: any) => (
                <div key={e.id} className="p-3 rounded-xl border flex items-start justify-between gap-3 hover:bg-muted/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{TIPOS_DESPESA.find(t => t.value === e.tipo)?.label || e.tipo}</span>
                      <Badge className={`text-xs ${REEMB_MAP[e.status_reembolso]?.color || ""}`}>{REEMB_MAP[e.status_reembolso]?.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(e.data)}{e.descricao ? ` — ${e.descricao}` : ""}</p>
                    {e.comprovante_url && (
                      <a href={e.comprovante_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 underline mt-1">
                        <FileText className="h-3 w-3" /> Comprovante
                      </a>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="font-bold text-base">{fmtCurrency(e.valor)}</p>
                    <div className="flex gap-1 justify-end">
                      {e.status_reembolso === "pendente" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onReimburse(e.id, e)}>
                          <Banknote className="h-3 w-3" /> Dados
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-red-500 hover:text-red-700" onClick={() => onDeleteExpense(e.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {expenses.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex justify-between items-center">
              <span className="text-sm font-medium text-amber-800">Total despesas</span>
              <span className="text-xl font-bold text-amber-900">{fmtCurrency(totalDespesas)}</span>
            </div>
          )}
        </TabsContent>

        {/* Tab: Reembolso */}
        {isAdmin && (
          <TabsContent value="reembolso" className="p-5 space-y-3 m-0">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Banknote className="h-4 w-4 text-emerald-600" /> Reembolso das Despesas</h3>
            {expenses.filter((e: any) => e.status_reembolso !== "nao_reembolsavel").length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa elegível para reembolso.</p>
            ) : (
              expenses.filter((e: any) => e.status_reembolso !== "nao_reembolsavel").map((e: any) => (
                <div key={e.id} className="p-3 rounded-xl border space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{TIPOS_DESPESA.find(t => t.value === e.tipo)?.label || e.tipo}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(e.data)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{fmtCurrency(e.valor)}</p>
                      <Badge className={`text-xs ${REEMB_MAP[e.status_reembolso]?.color || ""}`}>{REEMB_MAP[e.status_reembolso]?.label}</Badge>
                    </div>
                  </div>
                  {(e.forma_pagamento || e.pix_chave) && (
                    <div className="text-xs bg-muted rounded-lg p-2 space-y-0.5">
                      {e.nome_favorecido && <p><strong>Favorecido:</strong> {e.nome_favorecido}</p>}
                      {e.forma_pagamento === "pix" && e.pix_chave && <p><strong>PIX ({e.pix_chave_tipo}):</strong> {e.pix_chave}</p>}
                      {e.forma_pagamento === "ted" && <p><strong>TED:</strong> Banco {e.ted_banco} | Ag {e.ted_agencia} | Conta {e.ted_conta} ({e.ted_tipo_conta})</p>}
                    </div>
                  )}
                  {e.status_reembolso === "pendente" && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => onReimburse(e.id, e)}>
                      <Banknote className="h-3 w-3" /> Informe os dados de pagamento
                    </Button>
                  )}
                  {e.status_reembolso === "aprovado" && (
                    <Button size="sm" className="gap-1 text-xs h-7 bg-green-600 hover:bg-green-700 w-full"
                      onClick={() => onReimburse(e.id, { ...e, pre_status: "pago" })}>
                      <CheckCircle2 className="h-3 w-3" /> Marcar como Pago
                    </Button>
                  )}
                  {e.observacoes_financeiro && <p className="text-xs text-muted-foreground italic">{e.observacoes_financeiro}</p>}
                </div>
              ))
            )}
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

// ─── Action Dialog ─────────────────────────────────────────────────────────────
function ActionDialog({ action, trip, cId, userName, onClose, onGetOdometer, odometerLoading, onConfirm, loading }: any) {
  const [km, setKm] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [obs, setObs] = useState("");

  const needsKm = action === "iniciar" || action === "finalizar";
  const TITLES: Record<string, string> = {
    autorizar: "Autorizar Viagem", rejeitar: "Rejeitar Viagem",
    iniciar: "Iniciar Viagem", finalizar: "Finalizar Viagem", cancelar: "Cancelar Viagem"
  };
  const COLORS: Record<string, string> = {
    autorizar: "bg-emerald-600 hover:bg-emerald-700",
    iniciar: "bg-sky-600 hover:bg-sky-700",
    finalizar: "bg-indigo-600 hover:bg-indigo-700",
    rejeitar: "bg-red-600 hover:bg-red-700",
    cancelar: "bg-red-600 hover:bg-red-700",
  };

  const handleConfirm = async () => {
    if (needsKm && !km) return alert("Informe a quilometragem atual do hodômetro.");
    if (needsKm && !photoUrl) return alert("A foto do hodômetro é obrigatória.");
    await onConfirm({
      action,
      kmInicial: action === "iniciar" ? parseFloat(km) : null,
      kmFinal: action === "finalizar" ? parseFloat(km) : null,
      fotoKmInicialUrl: action === "iniciar" ? photoUrl : null,
      fotoKmFinalUrl: action === "finalizar" ? photoUrl : null,
      observacoesGestor: obs || null,
      autorizadoPor: userName,
    });
  };

  const fetchGPS = async () => {
    const placa = trip.placa || trip.v_placa || "";
    if (!placa) return alert("Veículo sem placa cadastrada.");
    const res = await onGetOdometer();
    if (res?.km) setKm(String(res.km));
    else alert(res?.erro || "Não foi possível obter KM do GPS.");
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {action === "iniciar" && <PlayCircle className="h-5 w-5 text-sky-600" />}
            {action === "finalizar" && <FlagTriangleRight className="h-5 w-5 text-indigo-600" />}
            {action === "autorizar" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            {(action === "rejeitar" || action === "cancelar") && <XCircle className="h-5 w-5 text-red-600" />}
            {TITLES[action] || action}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {(action === "autorizar") && (
            <div className="space-y-1">
              <Label>Observações (opcional)</Label>
              <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Instruções para o motorista..." />
            </div>
          )}
          {action === "rejeitar" && (
            <div className="space-y-1">
              <Label>Motivo da rejeição</Label>
              <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Informe o motivo..." />
            </div>
          )}
          {needsKm && (
            <>
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-sky-600" />
                  KM do Hodômetro *
                </Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Ex: 125400" value={km}
                    onChange={e => setKm(e.target.value)} className="flex-1 font-mono text-lg" />
                  <Button type="button" variant="outline" className="gap-1 shrink-0 text-sky-700 border-sky-200"
                    onClick={fetchGPS} disabled={odometerLoading}>
                    {odometerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                    GPS
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">"GPS" busca KM atual do rastreador Infleet</p>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  {action === "iniciar" ? "Foto do Hodômetro — Saída *" : "Foto do Hodômetro — Chegada *"}
                </Label>
                <PhotoButton label="Tirar Foto do Hodômetro" url={photoUrl} onUpload={setPhotoUrl} />
                {!photoUrl && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Foto obrigatória para registrar o KM
                  </p>
                )}
              </div>
            </>
          )}
          {action === "cancelar" && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              Confirma o cancelamento desta viagem? Esta ação não pode ser desfeita.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Voltar</Button>
          <Button onClick={handleConfirm} disabled={loading} className={`gap-2 ${COLORS[action] || ""}`}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Expense Dialog ────────────────────────────────────────────────────────
function ExpenseDialog({ cId, tripId, userName, onClose, onSubmit, loading }: any) {
  const [form, setForm] = useState({ tipo: "alimentacao", valor: "", descricao: "", data: new Date().toISOString().slice(0, 10) });
  const [comprovanteUrl, setComprovanteUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadReceipt = trpc.frotas.uploadTripExpenseReceipt.useMutation();
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const isPdf = file.type === "application/pdf";
      let base64: string; let contentType: string;
      if (isPdf) {
        const buf = await file.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        contentType = "application/pdf";
      } else {
        const r = await fileToBase64(file);
        base64 = r.base64; contentType = r.contentType;
      }
      const res = await uploadReceipt.mutateAsync({ companyId: cId, base64, contentType, fileName: file.name });
      setComprovanteUrl(res.url);
    } catch (err: any) {
      alert("Erro ao enviar comprovante: " + (err.message || String(err)));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.valor || !form.data) return;
    await onSubmit({ tipo: form.tipo, valor: parseFloat(form.valor), descricao: form.descricao || null, data: form.data, comprovanteUrl });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="flex gap-2"><Receipt className="h-5 w-5 text-amber-600" /> Adicionar Despesa</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_DESPESA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00" value={form.valor} onChange={e => set("valor", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Data *</Label>
              <Input type="date" value={form.data} onChange={e => set("data", e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input placeholder="Detalhe..." value={form.descricao} onChange={e => set("descricao", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Comprovante</Label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" size="sm" className="w-full gap-2"
              onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {comprovanteUrl ? "Trocar Comprovante" : "Anexar Foto ou PDF"}
            </Button>
            {comprovanteUrl && <a href={comprovanteUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">Ver comprovante anexado</a>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reimbursement Dialog ──────────────────────────────────────────────────────
function ReimbursementDialog({ expenseId, current, cId, userName, onClose, onSubmit, loading }: any) {
  const [forma, setForma] = useState(current?.forma_pagamento || "pix");
  const [pixTipo, setPixTipo] = useState(current?.pix_chave_tipo || "cpf");
  const [pixChave, setPixChave] = useState(current?.pix_chave || "");
  const [tedBanco, setTedBanco] = useState(current?.ted_banco || "");
  const [tedAg, setTedAg] = useState(current?.ted_agencia || "");
  const [tedConta, setTedConta] = useState(current?.ted_conta || "");
  const [tedTipo, setTedTipo] = useState(current?.ted_tipo_conta || "corrente");
  const [nome, setNome] = useState(current?.nome_favorecido || "");
  const [obs, setObs] = useState(current?.observacoes_financeiro || "");
  const [status, setStatus] = useState(current?.pre_status || current?.status_reembolso || "pendente");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      formaPagamento: forma,
      pixChaveTipo: forma === "pix" ? pixTipo : null,
      pixChave: forma === "pix" ? pixChave : null,
      tedBanco: forma === "ted" ? tedBanco : null,
      tedAgencia: forma === "ted" ? tedAg : null,
      tedConta: forma === "ted" ? tedConta : null,
      tedTipoConta: forma === "ted" ? tedTipo : null,
      nomeFavorecido: nome || null,
      statusReembolso: status,
      aprovadoPor: userName,
      observacoesFinanceiro: obs || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex gap-2"><Banknote className="h-5 w-5 text-emerald-600" /> Dados para Reembolso</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium">{TIPOS_DESPESA.find(t => t.value === current?.tipo)?.label || current?.tipo}</p>
            <p className="text-muted-foreground">{fmtDate(current?.data)} · <strong className="text-foreground">{fmtCurrency(current?.valor)}</strong></p>
          </div>
          <div className="space-y-1"><Label>Nome do Favorecido</Label>
            <Input placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="space-y-1"><Label>Forma de Pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="ted">TED / Transferência Bancária</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {forma === "pix" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Tipo de Chave</Label>
                <Select value={pixTipo} onValueChange={setPixTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="celular">Celular</SelectItem>
                    <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Chave PIX</Label>
                <Input placeholder="Informe a chave" value={pixChave} onChange={e => setPixChave(e.target.value)} />
              </div>
            </div>
          )}
          {forma === "ted" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Banco</Label><Input placeholder="Ex: 001 BB" value={tedBanco} onChange={e => setTedBanco(e.target.value)} /></div>
                <div className="space-y-1"><Label>Agência</Label><Input placeholder="0000" value={tedAg} onChange={e => setTedAg(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>Conta</Label><Input placeholder="00000-0" value={tedConta} onChange={e => setTedConta(e.target.value)} /></div>
                <div className="space-y-1"><Label>Tipo</Label>
                  <Select value={tedTipo} onValueChange={setTedTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corrente">Corrente</SelectItem>
                      <SelectItem value="poupanca">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1"><Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado (ag. pagamento)</SelectItem>
                <SelectItem value="pago">Pago ✓</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
                <SelectItem value="nao_reembolsavel">Não reembolsável</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Observações</Label>
            <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Notas internas..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
