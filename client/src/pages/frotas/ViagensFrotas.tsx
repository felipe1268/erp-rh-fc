import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Clock, TrendingUp, Navigation
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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pendente:     { label: "Ag. Autorização", color: "bg-amber-100 text-amber-800 border-amber-200" },
  autorizada:   { label: "Autorizada",      color: "bg-blue-100 text-blue-800 border-blue-200" },
  em_andamento: { label: "Em Andamento",    color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  concluida:    { label: "Concluída",       color: "bg-gray-100 text-gray-700 border-gray-200" },
  cancelada:    { label: "Cancelada",       color: "bg-red-100 text-red-700 border-red-200" },
  rejeitada:    { label: "Rejeitada",       color: "bg-red-200 text-red-900 border-red-300" },
};

const REEMB_MAP: Record<string, { label: string; color: string }> = {
  pendente:         { label: "Pendente",  color: "bg-amber-100 text-amber-800" },
  aprovado:         { label: "Aprovado",  color: "bg-blue-100 text-blue-800" },
  pago:             { label: "Pago",      color: "bg-green-100 text-green-800" },
  rejeitado:        { label: "Rejeitado", color: "bg-red-100 text-red-800" },
  nao_reembolsavel: { label: "Própria conta", color: "bg-gray-100 text-gray-600" },
};

function fmtDate(d: any) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtCurrency(v: any) {
  const n = parseFloat(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtKm(v: any) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR") + " km";
}

// ─── Upload Helper ─────────────────────────────────────────────────────────────
async function fileToBase64(file: File): Promise<{ base64: string; contentType: string }> {
  const compressed = await compressImageIfNeeded(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve({ base64, contentType: compressed.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}

// ─── Photo Upload Button ───────────────────────────────────────────────────────
function PhotoButton({
  label, url, onUpload, disabled
}: { label: string; url: string | null; onUpload: (u: string) => void; disabled?: boolean }) {
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
      <input ref={ref} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handleFile} />
      <Button type="button" variant="outline" size="sm" disabled={disabled || uploading}
        className="w-full gap-2" onClick={() => ref.current?.click()}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {url ? "Trocar Foto" : label}
      </Button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer"
          className="block text-xs text-blue-600 underline truncate">
          Ver foto atual
        </a>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
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
    { companyId: cId }, { enabled: cId > 0 }
  );
  const { data: pending = [] } = trpc.frotas.getPendingReimbursements.useQuery(
    { companyId: cId }, { enabled: cId > 0 && isAdmin }
  );

  const createTrip = trpc.frotas.createTrip.useMutation({
    onSuccess: () => { refetchTrips(); setShowNew(false); }
  });
  const updateStatus = trpc.frotas.updateTripStatus.useMutation({
    onSuccess: () => { refetchTrips(); refetchDetail(); setActionDlg(null); }
  });
  const getOdometer = trpc.frotas.getVehicleOdometerInfleet.useMutation();
  const addExpense = trpc.frotas.addTripExpense.useMutation({
    onSuccess: () => { refetchDetail(); setShowExpense(false); }
  });
  const delExpense = trpc.frotas.deleteTripExpense.useMutation({
    onSuccess: () => { refetchDetail(); }
  });
  const updateReimb = trpc.frotas.updateTripExpenseReimbursement.useMutation({
    onSuccess: () => { refetchDetail(); refetchTrips(); setShowReimbDlg(null); }
  });

  const totals = {
    all: trips.length,
    pendente: trips.filter((t: any) => t.status === "pendente").length,
    em_andamento: trips.filter((t: any) => t.status === "em_andamento").length,
    concluida: trips.filter((t: any) => t.status === "concluida").length,
  };

  const openTrip = (id: number) => { setSelectedTripId(id); setSheetTab("viagem"); };

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
          { label: "Total de Viagens", value: totals.all, icon: Car, color: "text-slate-600" },
          { label: "Ag. Autorização", value: totals.pendente, icon: Clock, color: "text-amber-600" },
          { label: "Em Andamento", value: totals.em_andamento, icon: TrendingUp, color: "text-emerald-600" },
          { label: "Concluídas", value: totals.concluida, icon: CheckCircle2, color: "text-gray-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <Icon className={`h-8 w-8 ${color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "todos", label: "Todas" },
          { key: "pendente", label: "Ag. Autorização" },
          { key: "autorizada", label: "Autorizadas" },
          { key: "em_andamento", label: "Em Andamento" },
          { key: "concluida", label: "Concluídas" },
          { key: "rejeitada", label: "Rejeitadas" },
        ].map(({ key, label }) => (
          <Button key={key} variant={statusFilter === key ? "default" : "outline"} size="sm"
            onClick={() => setStatusFilter(key)}>
            {label}
          </Button>
        ))}
        {isAdmin && pending.length > 0 && (
          <Button variant={statusFilter === "_reembolsos" ? "default" : "outline"} size="sm"
            className="gap-1 ml-auto" onClick={() => setStatusFilter("_reembolsos")}>
            <Banknote className="h-4 w-4" /> Reembolsos Pendentes
            <Badge className="ml-1 h-5 bg-amber-500">{pending.length}</Badge>
          </Button>
        )}
      </div>

      {/* Reimbursements Panel */}
      {statusFilter === "_reembolsos" && (
        <Card>
          <CardHeader><CardTitle className="text-base flex gap-2"><Banknote className="h-5 w-5" /> Despesas Aguardando Reembolso</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {pending.map((e: any) => (
                <div key={e.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{e.motorista_nome} — {e.placa || "s/ placa"}</p>
                    <p className="text-xs text-muted-foreground">{e.origem} → {e.destino} · {fmtDate(e.data_saida)}</p>
                    <p className="text-xs mt-1 capitalize">{TIPOS_DESPESA.find(t => t.value === e.tipo)?.label || e.tipo} · {fmtDate(e.data)}</p>
                    {e.descricao && <p className="text-xs text-muted-foreground break-words">{e.descricao}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-lg">{fmtCurrency(e.valor)}</p>
                    <Badge className={`text-xs ${REEMB_MAP[e.status_reembolso]?.color || ""}`}>
                      {REEMB_MAP[e.status_reembolso]?.label}
                    </Badge>
                    <div className="flex gap-2 mt-2">
                      {e.comprovante_url && (
                        <a href={e.comprovante_url} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="gap-1"><FileText className="h-3 w-3" /> Comprovante</Button>
                        </a>
                      )}
                      <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setShowReimbDlg({ expenseId: e.id, current: e })}>
                        <Banknote className="h-3 w-3" /> Reembolsar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trips Table */}
      {statusFilter !== "_reembolsos" && (
        <Card>
          <CardContent className="p-0">
            {trips.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Car className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma viagem encontrada</p>
                <Button className="mt-4 gap-2" variant="outline" onClick={() => setShowNew(true)}>
                  <Plus className="h-4 w-4" /> Registrar Primeira Viagem
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {trips.map((t: any) => (
                  <div key={t.id} className="p-4 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => openTrip(t.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{t.motorista_nome}</span>
                          {t.placa && <Badge variant="outline" className="text-xs font-mono">{t.placa}</Badge>}
                          <Badge className={`text-xs border ${STATUS_MAP[t.status]?.color || ""}`}>
                            {STATUS_MAP[t.status]?.label || t.status}
                          </Badge>
                          {parseInt(t.despesas_pendentes) > 0 && (
                            <Badge className="text-xs bg-amber-100 text-amber-800">
                              {t.despesas_pendentes} despesa(s) pendente(s)
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{t.origem}</span>
                          <span>→</span>
                          <span className="truncate font-medium text-foreground">{t.destino}</span>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span>{MOTIVOS.find(m => m.value === t.motivo)?.label || t.motivo}</span>
                          {t.obra_nome && <span className="font-medium text-foreground">📋 {t.obra_nome}</span>}
                          <span>Saída: {fmtDate(t.data_saida) || fmtDate(t.criado_em)}</span>
                          {t.km_inicial && <span>KM inicial: {fmtKm(t.km_inicial)}</span>}
                          {t.km_final && <span>KM final: {fmtKm(t.km_final)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {parseFloat(t.total_despesas) > 0 && (
                          <p className="text-sm font-bold text-amber-700">{fmtCurrency(t.total_despesas)}</p>
                        )}
                        {t.km_inicial && t.km_final && (
                          <p className="text-xs text-muted-foreground">
                            {fmtKm(parseFloat(t.km_final) - parseFloat(t.km_inicial))} percorridos
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Nova Viagem Dialog ────────────────────────────────────────── */}
      <NovaViagemDialog
        open={showNew} onClose={() => setShowNew(false)}
        cId={cId} vehicles={vehicles as any[]}
        onSubmit={(data) => createTrip.mutateAsync({ ...data, companyId: cId, criadoPor: userName })}
        loading={createTrip.isPending}
      />

      {/* ─── Trip Detail Sheet ─────────────────────────────────────────── */}
      <Sheet open={!!selectedTripId} onOpenChange={(o) => { if (!o) setSelectedTripId(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {tripDetail && (
            <TripDetailSheet
              trip={tripDetail}
              isAdmin={isAdmin}
              userName={userName}
              cId={cId}
              sheetTab={sheetTab}
              setSheetTab={setSheetTab}
              onAction={(action) => setActionDlg({ action })}
              onAddExpense={() => setShowExpense(true)}
              onDeleteExpense={(id) => {
                if (window.confirm("Excluir esta despesa?")) {
                  delExpense.mutate({ companyId: cId, expenseId: id });
                }
              }}
              onReimburse={(expenseId, current) => setShowReimbDlg({ expenseId, current })}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Action Dialog (Autorizar / Rejeitar / Iniciar / Finalizar) ── */}
      {actionDlg && tripDetail && (
        <ActionDialog
          action={actionDlg.action}
          trip={tripDetail}
          cId={cId}
          userName={userName}
          onClose={() => setActionDlg(null)}
          onGetOdometer={() => getOdometer.mutateAsync({ companyId: cId, placa: tripDetail.placa || tripDetail.v_placa || "" })}
          odometerLoading={getOdometer.isPending}
          onConfirm={(data) => updateStatus.mutateAsync({ companyId: cId, tripId: tripDetail.id, ...data as any })}
          loading={updateStatus.isPending}
        />
      )}

      {/* ─── Add Expense Dialog ────────────────────────────────────────── */}
      {showExpense && selectedTripId && (
        <ExpenseDialog
          cId={cId}
          tripId={selectedTripId}
          userName={userName}
          onClose={() => setShowExpense(false)}
          onSubmit={(data) => addExpense.mutateAsync({ ...data, companyId: cId, tripId: selectedTripId, criadoPor: userName })}
          loading={addExpense.isPending}
        />
      )}

      {/* ─── Reimbursement Dialog ─────────────────────────────────────── */}
      {showReimbDlg && (
        <ReimbursementDialog
          expenseId={showReimbDlg.expenseId}
          current={showReimbDlg.current}
          cId={cId}
          userName={userName}
          onClose={() => setShowReimbDlg(null)}
          onSubmit={(data) => updateReimb.mutateAsync({ ...data, companyId: cId, expenseId: showReimbDlg.expenseId })}
          loading={updateReimb.isPending}
        />
      )}
    </div>
  );
}

// ─── Trip Detail Sheet Content ────────────────────────────────────────────────
function TripDetailSheet({ trip, isAdmin, userName, cId, sheetTab, setSheetTab, onAction, onAddExpense, onDeleteExpense, onReimburse }: any) {
  const status = trip.status;
  const expenses: any[] = trip.expenses || [];
  const totalDespesas = expenses.reduce((s: number, e: any) => s + parseFloat(e.valor || 0), 0);
  const kmPercorridos = trip.km_inicial && trip.km_final
    ? parseFloat(trip.km_final) - parseFloat(trip.km_inicial) : null;

  return (
    <>
      <SheetHeader className="px-5 pt-5 pb-3 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <SheetTitle className="text-base">{trip.motorista_nome}</SheetTitle>
          {trip.placa && <Badge variant="outline" className="font-mono">{trip.placa}</Badge>}
          <Badge className={`border ${STATUS_MAP[status]?.color || ""}`}>{STATUS_MAP[status]?.label || status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {trip.origem} → {trip.destino}
        </p>
      </SheetHeader>

      {/* Action Buttons */}
      <div className="px-5 py-3 flex flex-wrap gap-2 border-b bg-muted/30">
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
          <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => onAction("cancelar")}>
            <XCircle className="h-4 w-4" /> Cancelar
          </Button>
        )}
      </div>

      <Tabs value={sheetTab} onValueChange={setSheetTab} className="flex-1">
        <TabsList className="w-full rounded-none border-b h-10 px-5">
          <TabsTrigger value="viagem" className="text-sm">Viagem</TabsTrigger>
          <TabsTrigger value="despesas" className="text-sm flex gap-1">
            Despesas {expenses.length > 0 && <Badge className="h-4 text-[10px] px-1">{expenses.length}</Badge>}
          </TabsTrigger>
          {isAdmin && <TabsTrigger value="reembolso" className="text-sm">Reembolso</TabsTrigger>}
        </TabsList>

        {/* Tab: Viagem */}
        <TabsContent value="viagem" className="p-5 space-y-4 m-0">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Motivo" value={MOTIVOS.find(m => m.value === trip.motivo)?.label || trip.motivo} />
            {trip.obra_nome && <InfoRow label="Obra / Projeto" value={trip.obra_nome} />}
            {trip.motivo_descricao && <InfoRow label="Descrição" value={trip.motivo_descricao} />}
            <InfoRow label="Saída" value={fmtDate(trip.data_saida) || "Não iniciada"} />
            <InfoRow label="Chegada" value={fmtDate(trip.data_retorno) || "—"} />
            {trip.autorizado_por && <InfoRow label="Autorizado por" value={trip.autorizado_por} />}
            {trip.observacoes_gestor && <InfoRow label="Observação do Gestor" value={trip.observacoes_gestor} />}
          </div>

          <Separator />
          <h3 className="font-semibold text-sm flex items-center gap-2"><Gauge className="h-4 w-4" /> Quilometragem</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* KM Inicial */}
            <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground uppercase">KM Inicial</p>
              <p className="text-xl font-bold">{fmtKm(trip.km_inicial)}</p>
              {trip.foto_km_inicial_url ? (
                <a href={trip.foto_km_inicial_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 underline">
                  <Camera className="h-3 w-3" /> Ver foto
                </a>
              ) : <p className="text-xs text-muted-foreground">Sem foto</p>}
            </div>
            {/* KM Final */}
            <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground uppercase">KM Final</p>
              <p className="text-xl font-bold">{fmtKm(trip.km_final)}</p>
              {trip.foto_km_final_url ? (
                <a href={trip.foto_km_final_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 underline">
                  <Camera className="h-3 w-3" /> Ver foto
                </a>
              ) : <p className="text-xs text-muted-foreground">Sem foto</p>}
            </div>
          </div>
          {kmPercorridos != null && (
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-100 text-center">
              <p className="text-xs text-sky-700">Total percorrido</p>
              <p className="text-2xl font-bold text-sky-800">{fmtKm(kmPercorridos)}</p>
            </div>
          )}
        </TabsContent>

        {/* Tab: Despesas */}
        <TabsContent value="despesas" className="p-5 space-y-3 m-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Despesas da Viagem</h3>
            <Button size="sm" className="gap-1" onClick={onAddExpense}>
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
                <div key={e.id} className="p-3 rounded-lg border flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{TIPOS_DESPESA.find(t => t.value === e.tipo)?.label || e.tipo}</span>
                      <Badge className={`text-xs ${REEMB_MAP[e.status_reembolso]?.color || ""}`}>
                        {REEMB_MAP[e.status_reembolso]?.label}
                      </Badge>
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
                    <p className="font-bold">{fmtCurrency(e.valor)}</p>
                    <div className="flex gap-1 justify-end">
                      {e.status_reembolso === "pendente" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => onReimburse(e.id, e)}>
                          <Banknote className="h-3 w-3" /> Dados
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 text-red-500 hover:text-red-700"
                        onClick={() => onDeleteExpense(e.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {expenses.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 flex justify-between items-center">
              <span className="text-sm font-medium text-amber-800">Total despesas</span>
              <span className="text-lg font-bold text-amber-900">{fmtCurrency(totalDespesas)}</span>
            </div>
          )}
        </TabsContent>

        {/* Tab: Reembolso (admin only) */}
        {isAdmin && (
          <TabsContent value="reembolso" className="p-5 space-y-3 m-0">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Banknote className="h-4 w-4" /> Reembolso das Despesas</h3>
            {expenses.filter((e: any) => e.status_reembolso !== "nao_reembolsavel").length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma despesa elegível para reembolso.</p>
            ) : (
              expenses.filter((e: any) => e.status_reembolso !== "nao_reembolsavel").map((e: any) => (
                <div key={e.id} className="p-3 rounded-lg border space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">{TIPOS_DESPESA.find(t => t.value === e.tipo)?.label || e.tipo}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(e.data)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{fmtCurrency(e.valor)}</p>
                      <Badge className={`text-xs ${REEMB_MAP[e.status_reembolso]?.color || ""}`}>
                        {REEMB_MAP[e.status_reembolso]?.label}
                      </Badge>
                    </div>
                  </div>
                  {(e.forma_pagamento || e.pix_chave) && (
                    <div className="text-xs bg-muted rounded p-2 space-y-0.5">
                      {e.nome_favorecido && <p><strong>Favorecido:</strong> {e.nome_favorecido}</p>}
                      {e.forma_pagamento === "pix" && e.pix_chave && (
                        <p><strong>PIX ({e.pix_chave_tipo}):</strong> {e.pix_chave}</p>
                      )}
                      {e.forma_pagamento === "ted" && (
                        <p><strong>TED:</strong> Banco {e.ted_banco} | Ag {e.ted_agencia} | Conta {e.ted_conta} ({e.ted_tipo_conta})</p>
                      )}
                    </div>
                  )}
                  {e.status_reembolso === "pendente" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => onReimburse(e.id, e)}>
                        <Banknote className="h-3 w-3" /> Informe os dados
                      </Button>
                    </div>
                  )}
                  {e.status_reembolso === "aprovado" && (
                    <Button size="sm" className="gap-1 text-xs h-7 bg-green-600 hover:bg-green-700 w-full"
                      onClick={() => onReimburse(e.id, { ...e, statusReembolso: "pago" })}>
                      <CheckCircle2 className="h-3 w-3" /> Marcar como Pago
                    </Button>
                  )}
                  {e.observacoes_financeiro && (
                    <p className="text-xs text-muted-foreground italic">{e.observacoes_financeiro}</p>
                  )}
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

// ─── Nova Viagem Dialog ────────────────────────────────────────────────────────
function NovaViagemDialog({ open, onClose, cId, vehicles, onSubmit, loading }: any) {
  const [form, setForm] = useState({
    vehicleId: "", motoristaNome: "", origem: "", destino: "",
    motivo: "obra", motivoDescricao: "", obraNome: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const selectedVehicle = vehicles.find((v: any) => String(v.id) === form.vehicleId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.motoristaNome || !form.origem || !form.destino) return;
    await onSubmit({
      vehicleId: form.vehicleId ? parseInt(form.vehicleId) : null,
      placa: selectedVehicle?.placa || null,
      motoristaNome: form.motoristaNome,
      origem: form.origem,
      destino: form.destino,
      motivo: form.motivo as any,
      motivoDescricao: form.motivoDescricao || null,
      obraNome: form.motivo === "obra" ? form.obraNome || null : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex gap-2"><Navigation className="h-5 w-5" /> Nova Viagem</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Veículo</Label>
              <Select value={form.vehicleId} onValueChange={(v) => set("vehicleId", v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.placa} — {v.marca} {v.modelo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Motorista *</Label>
              <Input placeholder="Nome completo" value={form.motoristaNome}
                onChange={e => set("motoristaNome", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Local de Saída *</Label>
              <Input placeholder="Ex: Guará / Brasília" value={form.origem}
                onChange={e => set("origem", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Destino *</Label>
              <Input placeholder="Cidade / endereço" value={form.destino}
                onChange={e => set("destino", e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Motivo da Viagem *</Label>
            <Select value={form.motivo} onValueChange={(v) => set("motivo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIVOS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.motivo === "obra" && (
            <div className="space-y-1">
              <Label>Nome da Obra / Projeto</Label>
              <Input placeholder="Ex: Edifício Tal - Bl. A" value={form.obraNome}
                onChange={e => set("obraNome", e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea placeholder="Detalhes adicionais sobre a viagem..." rows={2}
              value={form.motivoDescricao} onChange={e => set("motivoDescricao", e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar Viagem
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Action Dialog ─────────────────────────────────────────────────────────────
function ActionDialog({ action, trip, cId, userName, onClose, onGetOdometer, odometerLoading, onConfirm, loading }: any) {
  const [km, setKm] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const { selectedCompanyId } = useCompany();

  const needsKm = action === "iniciar" || action === "finalizar";
  const needsPhoto = needsKm;
  const photoLabel = action === "iniciar" ? "Foto do Hodômetro (Saída)" : "Foto do Hodômetro (Chegada)";

  const TITLES: Record<string, string> = {
    autorizar: "Autorizar Viagem", rejeitar: "Rejeitar Viagem",
    iniciar: "Iniciar Viagem", finalizar: "Finalizar Viagem", cancelar: "Cancelar Viagem"
  };

  const handleConfirm = async () => {
    if (needsKm && !km) return alert("Informe a quilometragem atual.");
    if (needsPhoto && !photoUrl) return alert("A foto do hodômetro é obrigatória.");
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
    if (!placa) return alert("Veículo sem placa cadastrada para buscar no GPS.");
    const res = await onGetOdometer();
    if (res?.km) { setKm(String(res.km)); }
    else { alert(res?.erro || "Não foi possível obter KM do GPS."); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{TITLES[action] || action}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {action === "autorizar" && (
            <div className="space-y-1">
              <Label>Observações (opcional)</Label>
              <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Instruções para o motorista..." />
            </div>
          )}
          {action === "rejeitar" && (
            <div className="space-y-1">
              <Label>Motivo da rejeição</Label>
              <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Informe o motivo..." required />
            </div>
          )}
          {needsKm && (
            <>
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  KM Atual do Hodômetro *
                </Label>
                <div className="flex gap-2">
                  <Input type="number" placeholder="Ex: 125400" value={km}
                    onChange={e => setKm(e.target.value)} className="flex-1" />
                  <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0"
                    onClick={fetchGPS} disabled={odometerLoading}>
                    {odometerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                    GPS
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Clique em GPS para buscar automaticamente do rastreador</p>
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  <Camera className="h-4 w-4" /> {photoLabel} *
                </Label>
                <PhotoButton label="Tirar Foto do Hodômetro" url={photoUrl}
                  onUpload={setPhotoUrl} />
                {!photoUrl && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Foto obrigatória para registrar a quilometragem
                  </p>
                )}
              </div>
            </>
          )}
          {action === "cancelar" && (
            <p className="text-sm text-muted-foreground">Confirma o cancelamento desta viagem?</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={loading}
            className={`gap-2 ${action === "rejeitar" || action === "cancelar" ? "bg-red-600 hover:bg-red-700" : action === "autorizar" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
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
        <DialogHeader><DialogTitle className="flex gap-2"><Receipt className="h-5 w-5" /> Adicionar Despesa</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo de Despesa *</Label>
            <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_DESPESA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00" value={form.valor}
                onChange={e => set("valor", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Data *</Label>
              <Input type="date" value={form.data} onChange={e => set("data", e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input placeholder="Detalhe da despesa..." value={form.descricao}
              onChange={e => set("descricao", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Comprovante (foto ou PDF)</Label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf"
              className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" size="sm" className="w-full gap-2"
              onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {comprovanteUrl ? "Trocar Comprovante" : "Anexar Comprovante"}
            </Button>
            {comprovanteUrl && (
              <a href={comprovanteUrl} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 underline">Ver comprovante anexado</a>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
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
  const [status, setStatus] = useState(current?.status_reembolso || "pendente");

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
        <DialogHeader><DialogTitle className="flex gap-2"><Banknote className="h-5 w-5" /> Dados para Reembolso</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium">{TIPOS_DESPESA.find(t => t.value === current?.tipo)?.label || current?.tipo}</p>
            <p className="text-muted-foreground">{fmtDate(current?.data)} · <strong>{fmtCurrency(current?.valor)}</strong></p>
          </div>
          <div className="space-y-1">
            <Label>Nome do Favorecido</Label>
            <Input placeholder="Nome completo do beneficiário" value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Forma de Pagamento</Label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="ted">TED / Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {forma === "pix" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo de Chave</Label>
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
              <div className="space-y-1">
                <Label>Chave PIX</Label>
                <Input placeholder="Informe a chave" value={pixChave} onChange={e => setPixChave(e.target.value)} />
              </div>
            </div>
          )}
          {forma === "ted" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Banco</Label>
                  <Input placeholder="Ex: 001 Banco do Brasil" value={tedBanco} onChange={e => setTedBanco(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Agência</Label>
                  <Input placeholder="0000" value={tedAg} onChange={e => setTedAg(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Conta</Label>
                  <Input placeholder="00000-0" value={tedConta} onChange={e => setTedConta(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
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
          <div className="space-y-1">
            <Label>Status do Reembolso</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="aprovado">Aprovado (aguardando pagamento)</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
                <SelectItem value="nao_reembolsavel">Não reembolsável</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Observações do Financeiro</Label>
            <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} placeholder="Notas internas..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
