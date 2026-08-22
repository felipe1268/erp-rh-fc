// ============================================================================
// TELEFONES CORPORATIVOS (Rev. 5150)
// Abas: Contrato | Linhas | Utilização
// Paleta: navy/sky/cinzas; sem verde; âmbar só para alertas.
// ============================================================================
import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Phone, Upload, Sparkles, Plus, Pencil, Trash2, AlertTriangle,
  FileText, CheckCircle2, ChevronDown, BarChart3, Wifi, Database,
  HardDrive, CreditCard, Loader2, ExternalLink, User, Calendar,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtComp = (s: string) => {
  const [y, m] = s.split("-");
  return `${m}/${y}`;
};

const hojeComp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const dataBR = (s?: string | null) => {
  if (!s) return "-";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const numFmt = (v: any, suffix = "") => {
  const n = Number(String(v ?? "0").replace(",", "."));
  if (!Number.isFinite(n) || n === 0) return "-";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + suffix;
};

function InfoCard({ label, value, icon: Icon, className = "" }: { label: string; value?: string | null; icon?: any; className?: string }) {
  if (!value) return null;
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
        {value}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TelefonesPage() {
  const { user } = useAuth();
  const { companyId, companyIds } = useCompany();
  const companyIdNum = Number(companyId);
  const utils = trpc.useUtils();

  const isAdmin = user?.role === "admin_master" || user?.role === "admin";

  const planoQ = trpc.telefonesCorporativos.plano.get.useQuery(
    { companyId: companyIdNum },
    { enabled: companyIdNum > 0 }
  );
  const plano = planoQ.data;

  const refetchAll = () => {
    utils.telefonesCorporativos.plano.get.invalidate();
    utils.telefonesCorporativos.linhas.list.invalidate();
    utils.telefonesCorporativos.uso.list.invalidate();
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-sky-100 p-2.5 rounded-xl">
            <Phone className="h-6 w-6 text-sky-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Telefones Corporativos</h1>
            <p className="text-sm text-slate-500">Gestão do plano, linhas e consumo mensal</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="contrato">
          <TabsList className="bg-slate-100">
            <TabsTrigger value="contrato" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <FileText className="h-4 w-4 mr-1.5" /> Contrato
            </TabsTrigger>
            <TabsTrigger value="linhas" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Phone className="h-4 w-4 mr-1.5" /> Linhas
            </TabsTrigger>
            <TabsTrigger value="utilizacao" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <BarChart3 className="h-4 w-4 mr-1.5" /> Utilização
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contrato" className="mt-4">
            <ContratoTab plano={plano} companyId={companyIdNum} isAdmin={isAdmin} onSaved={refetchAll} />
          </TabsContent>
          <TabsContent value="linhas" className="mt-4">
            <LinhasTab companyId={companyIdNum} isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="utilizacao" className="mt-4">
            <UtilizacaoTab companyId={companyIdNum} isAdmin={isAdmin} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA CONTRATO
// ══════════════════════════════════════════════════════════════════════════════

function ContratoTab({ plano, companyId, isAdmin, onSaved }: { plano: any; companyId: number; isAdmin: boolean; onSaved: () => void }) {
  const [uploadLoading, setUploadLoading] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = trpc.telefonesCorporativos.plano.uploadContrato.useMutation();
  const laMut = trpc.telefonesCorporativos.plano.lerComIA.useMutation();
  const upsertMut = trpc.telefonesCorporativos.plano.upsert.useMutation();
  const utils = trpc.useUtils();

  const clausulas: any[] = useMemo(() => {
    try { return JSON.parse(plano?.clausulasJson || "[]"); } catch { return []; }
  }, [plano?.clausulasJson]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("pdf")) { toast.error("Somente arquivos PDF são aceitos."); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 20 MB)."); return; }
    setUploadLoading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      await uploadMut.mutateAsync({ companyId, planoId: plano?.id, fileName: file.name, mimeType: file.type, base64 });
      toast.success("Contrato enviado com sucesso.");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar contrato.");
    } finally {
      setUploadLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleLerComIA = async () => {
    if (!plano?.id) { toast.error("Faça upload do contrato primeiro."); return; }
    setIaLoading(true);
    try {
      await laMut.mutateAsync({ companyId, planoId: plano.id });
      await utils.telefonesCorporativos.plano.get.invalidate();
      toast.success("IA extraiu os dados do contrato.");
    } catch (err: any) {
      toast.error(err?.message || "Erro na leitura pelo IA.");
    } finally {
      setIaLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload + IA */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-center">
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
          <Button
            variant="outline"
            className="border-sky-300 text-sky-700 hover:bg-sky-50"
            onClick={() => fileRef.current?.click()}
            disabled={uploadLoading}
          >
            {uploadLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {plano?.contratoKey ? "Trocar contrato" : "Anexar contrato (PDF)"}
          </Button>

          {plano?.contratoKey && (
            <>
              <Button
                variant="outline"
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                onClick={handleLerComIA}
                disabled={iaLoading}
              >
                {iaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {plano?.iaExtraiu ? "Reler com IA" : "Ler com IA"}
              </Button>
              {/* Endpoint autenticado — nunca expõe path/chave interna do arquivo */}
              <a
                href={`/api/download/telefones-contrato?companyId=${companyId}&planoId=${plano.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-700 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {plano.contratoNome || "Ver contrato"}
              </a>
            </>
          )}

          {plano && (
            <Button variant="ghost" size="sm" className="ml-auto text-slate-500" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar dados
            </Button>
          )}
        </div>
      )}

      {/* Sem plano */}
      {!plano && (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <Phone className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhum contrato cadastrado</p>
          <p className="text-slate-400 text-sm mt-1">Faça upload do PDF do contrato com a operadora</p>
        </div>
      )}

      {/* Dados extraídos */}
      {plano && (
        <div className="space-y-4">
          {/* Cards principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard icon={Phone} label="Operadora" value={plano.operadora || "—"} color="sky" />
            <MetricCard icon={CreditCard} label="Valor mensal" value={plano.valorMensal || "—"} color="indigo" />
            <MetricCard icon={Wifi} label="Franquia dados" value={plano.franquiaDadosGb || "—"} color="sky" />
            <MetricCard icon={Calendar} label="Vencimento" value={plano.diaVencimento ? `Dia ${plano.diaVencimento}` : "—"} color="slate" />
          </div>

          {/* Detalhes */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">Dados do Plano</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
              <InfoCard label="Nome do plano"    value={plano.nomePlano} />
              <InfoCard label="CNPJ da operadora" value={plano.cnpjOperadora} />
              <InfoCard label="Telefone operadora" value={plano.telefoneOperadora} />
              <InfoCard label="Início contrato"  value={dataBR(plano.dataInicio)} />
              <InfoCard label="Fim contrato"     value={dataBR(plano.dataFim)} />
              <InfoCard label="Fidelidade"       value={plano.fidelidadeMeses ? `${plano.fidelidadeMeses} meses` : undefined} />
              <InfoCard label="Multa rescisória" value={plano.multaRescisoria} />
            </div>
            {plano.observacoes && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <InfoCard label="Observações" value={plano.observacoes} />
              </div>
            )}
          </div>

          {/* Cláusulas */}
          {clausulas.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">
                <Sparkles className="h-3.5 w-3.5 inline mr-1.5 text-indigo-500" />
                Cláusulas extraídas pela IA
              </h3>
              <div className="space-y-3">
                {clausulas.map((c: any, i: number) => (
                  <div key={i} className="border-l-2 border-sky-200 pl-3">
                    <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">{c.titulo}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{c.texto}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog editar plano */}
      {editOpen && (
        <EditPlanoDialog
          plano={plano}
          companyId={companyId}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); onSaved(); }}
        />
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    sky:    "bg-sky-50 border-sky-200 text-sky-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    slate:  "bg-slate-50 border-slate-200 text-slate-700",
  };
  const cls = colors[color] || colors.slate;
  return (
    <div className={`border rounded-xl p-3.5 ${cls}`}>
      <Icon className="h-5 w-5 mb-1.5 opacity-70" />
      <p className="text-xs font-medium opacity-60 uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold mt-0.5 leading-tight">{value}</p>
    </div>
  );
}

function EditPlanoDialog({ plano, companyId, onClose, onSaved }: { plano: any; companyId: number; onClose: () => void; onSaved: () => void }) {
  const upsertMut = trpc.telefonesCorporativos.plano.upsert.useMutation();
  const [form, setForm] = useState({
    operadora:         plano?.operadora || "",
    nomePlano:         plano?.nomePlano || "",
    cnpjOperadora:     plano?.cnpjOperadora || "",
    telefoneOperadora: plano?.telefoneOperadora || "",
    valorMensal:       plano?.valorMensal || "",
    diaVencimento:     plano?.diaVencimento?.toString() || "",
    dataInicio:        plano?.dataInicio || "",
    dataFim:           plano?.dataFim || "",
    multaRescisoria:   plano?.multaRescisoria || "",
    fidelidadeMeses:   plano?.fidelidadeMeses?.toString() || "",
    franquiaDadosGb:   plano?.franquiaDadosGb || "",
    observacoes:       plano?.observacoes || "",
  });
  const sf = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertMut.mutateAsync({
        companyId,
        id: plano?.id,
        operadora:         form.operadora || undefined,
        nomePlano:         form.nomePlano || undefined,
        cnpjOperadora:     form.cnpjOperadora || undefined,
        telefoneOperadora: form.telefoneOperadora || undefined,
        valorMensal:       form.valorMensal || undefined,
        diaVencimento:     form.diaVencimento ? Number(form.diaVencimento) : undefined,
        dataInicio:        form.dataInicio || undefined,
        dataFim:           form.dataFim || undefined,
        multaRescisoria:   form.multaRescisoria || undefined,
        fidelidadeMeses:   form.fidelidadeMeses ? Number(form.fidelidadeMeses) : undefined,
        franquiaDadosGb:   form.franquiaDadosGb || undefined,
        observacoes:       form.observacoes || undefined,
      });
      toast.success("Plano salvo.");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Phone className="h-4 w-4 text-sky-600" /> Dados do Plano / Contrato</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div><Label>Operadora</Label><Input value={form.operadora} onChange={e => sf("operadora", e.target.value)} placeholder="Vivo, Claro, TIM…" /></div>
          <div><Label>Nome do plano</Label><Input value={form.nomePlano} onChange={e => sf("nomePlano", e.target.value)} /></div>
          <div><Label>CNPJ da operadora</Label><Input value={form.cnpjOperadora} onChange={e => sf("cnpjOperadora", e.target.value)} placeholder="00.000.000/0001-00" /></div>
          <div><Label>Telefone da operadora</Label><Input value={form.telefoneOperadora} onChange={e => sf("telefoneOperadora", e.target.value)} /></div>
          <div><Label>Valor mensal (R$)</Label><Input value={form.valorMensal} onChange={e => sf("valorMensal", e.target.value)} placeholder="R$ 0,00" /></div>
          <div><Label>Dia de vencimento</Label><Input type="number" min={1} max={31} value={form.diaVencimento} onChange={e => sf("diaVencimento", e.target.value)} /></div>
          <div><Label>Início do contrato</Label><Input type="date" value={form.dataInicio} onChange={e => sf("dataInicio", e.target.value)} /></div>
          <div><Label>Fim do contrato</Label><Input type="date" value={form.dataFim} onChange={e => sf("dataFim", e.target.value)} /></div>
          <div><Label>Multa rescisória</Label><Input value={form.multaRescisoria} onChange={e => sf("multaRescisoria", e.target.value)} /></div>
          <div><Label>Fidelidade (meses)</Label><Input type="number" min={0} value={form.fidelidadeMeses} onChange={e => sf("fidelidadeMeses", e.target.value)} /></div>
          <div><Label>Franquia de dados</Label><Input value={form.franquiaDadosGb} onChange={e => sf("franquiaDadosGb", e.target.value)} placeholder="ex: 10 GB" /></div>
          <div className="col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={e => sf("observacoes", e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button className="bg-sky-700 hover:bg-sky-800 text-white" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA LINHAS
// ══════════════════════════════════════════════════════════════════════════════

function LinhasTab({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const utils = trpc.useUtils();

  const linhasQ = trpc.telefonesCorporativos.linhas.list.useQuery(
    { companyId },
    { enabled: companyId > 0 }
  );
  const linhas: any[] = linhasQ.data || [];

  const deleteMut = trpc.telefonesCorporativos.linhas.delete.useMutation({
    onSuccess: () => { toast.success("Linha excluída."); utils.telefonesCorporativos.linhas.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const STATUS_BADGE: Record<string, string> = {
    ativa:      "bg-sky-100 text-sky-700 border-sky-200",
    inativa:    "bg-slate-100 text-slate-500 border-slate-200",
    suspensa:   "bg-amber-100 text-amber-700 border-amber-200",
    cancelada:  "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button className="bg-sky-700 hover:bg-sky-800 text-white" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova linha
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <Phone className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma linha cadastrada</p>
          <p className="text-slate-400 text-sm mt-1">Cadastre as linhas corporativas e vincule a colaboradores</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Número</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Colaborador</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">Operadora / Plano</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">IMEI</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">Aquisição</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Status</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l: any, idx: number) => (
                  <tr key={l.id} className={`border-t border-slate-50 hover:bg-slate-50/60 transition-colors ${idx % 2 === 1 ? "bg-slate-50/30" : ""}`}>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800">{l.numero}</td>
                    <td className="px-4 py-3">
                      {l.employeeNome ? (
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          {l.employeeNome}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Não vinculada</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                      {[l.operadora, l.nomePlanoLinha].filter(Boolean).join(" – ") || "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500 text-xs hidden lg:table-cell">{l.imei || "-"}</td>
                    <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{dataBR(l.dataAquisicao)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_BADGE[l.status] || STATUS_BADGE.ativa}`}>
                        {l.status?.charAt(0).toUpperCase() + l.status?.slice(1)}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-sky-600" onClick={() => { setEditing(l); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => { if (confirm(`Excluir linha ${l.numero}?`)) deleteMut.mutate({ id: l.id, companyId }); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dialogOpen && (
        <LinhaDialog
          linha={editing}
          companyId={companyId}
          onClose={() => setDialogOpen(false)}
          onSaved={() => { setDialogOpen(false); utils.telefonesCorporativos.linhas.list.invalidate(); }}
        />
      )}
    </div>
  );
}

function LinhaDialog({ linha, companyId, onClose, onSaved }: { linha: any; companyId: number; onClose: () => void; onSaved: () => void }) {
  const createMut = trpc.telefonesCorporativos.linhas.create.useMutation();
  const updateMut = trpc.telefonesCorporativos.linhas.update.useMutation();
  const empQ = trpc.telefonesCorporativos.employeesAtivos.useQuery({ companyId }, { enabled: companyId > 0 });
  const employees: any[] = empQ.data || [];

  const [form, setForm] = useState({
    numero:         linha?.numero || "",
    operadora:      linha?.operadora || "",
    nomePlanoLinha: linha?.nomePlanoLinha || "",
    employeeId:     linha?.employeeId?.toString() || "",
    imei:           linha?.imei || "",
    dataAquisicao:  linha?.dataAquisicao || "",
    status:         linha?.status || "ativa",
    observacoes:    linha?.observacoes || "",
  });
  const sf = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [empOpen, setEmpOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState("");

  const empSelecionado = employees.find((e: any) => e.id.toString() === form.employeeId);
  const empFiltrados = employees.filter((e: any) =>
    !empSearch || e.nomeCompleto.toLowerCase().includes(empSearch.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.numero.trim()) { toast.error("Número da linha é obrigatório."); return; }
    setSaving(true);
    try {
      const empId = form.employeeId ? Number(form.employeeId) : undefined;
      if (linha) {
        await updateMut.mutateAsync({ id: linha.id, companyId, numero: form.numero, operadora: form.operadora, nomePlanoLinha: form.nomePlanoLinha, employeeId: empId ?? null, imei: form.imei, dataAquisicao: form.dataAquisicao, status: form.status, observacoes: form.observacoes });
      } else {
        await createMut.mutateAsync({ companyId, numero: form.numero, operadora: form.operadora, nomePlanoLinha: form.nomePlanoLinha, employeeId: empId, imei: form.imei, dataAquisicao: form.dataAquisicao, status: form.status, observacoes: form.observacoes });
      }
      toast.success(linha ? "Linha atualizada." : "Linha cadastrada.");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-sky-600" />
            {linha ? "Editar linha" : "Nova linha corporativa"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label>Número da linha *</Label>
            <Input value={form.numero} onChange={e => sf("numero", e.target.value)} placeholder="(11) 9 0000-0000" />
          </div>
          <div>
            <Label>Operadora</Label>
            <Input value={form.operadora} onChange={e => sf("operadora", e.target.value)} placeholder="Vivo, Claro…" />
          </div>
          <div>
            <Label>Plano da linha</Label>
            <Input value={form.nomePlanoLinha} onChange={e => sf("nomePlanoLinha", e.target.value)} placeholder="Controle, Pós, Total…" />
          </div>

          {/* Combobox colaborador */}
          <div className="col-span-2">
            <Label>Colaborador vinculado</Label>
            <Popover open={empOpen} onOpenChange={setEmpOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal text-left">
                  {empSelecionado ? empSelecionado.nomeCompleto : <span className="text-slate-400">Selecionar colaborador…</span>}
                  <ChevronDown className="h-4 w-4 text-slate-400 ml-2 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[340px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar colaborador…" value={empSearch} onValueChange={setEmpSearch} />
                  <CommandList className="max-h-56 overflow-y-auto">
                    <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => { sf("employeeId", ""); setEmpOpen(false); }} className="text-slate-400 italic">
                        — Sem vínculo —
                      </CommandItem>
                      {empFiltrados.map((e: any) => (
                        <CommandItem key={e.id} onSelect={() => { sf("employeeId", e.id.toString()); setEmpOpen(false); }}>
                          <User className="h-3.5 w-3.5 mr-2 text-slate-400 flex-shrink-0" />
                          <span className="font-medium">{e.nomeCompleto}</span>
                          {e.funcao && <span className="text-slate-400 text-xs ml-1.5">{e.funcao}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>IMEI</Label>
            <Input value={form.imei} onChange={e => sf("imei", e.target.value)} placeholder="000000000000000" />
          </div>
          <div>
            <Label>Data de aquisição</Label>
            <Input type="date" value={form.dataAquisicao} onChange={e => sf("dataAquisicao", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => sf("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativa">Ativa</SelectItem>
                <SelectItem value="inativa">Inativa</SelectItem>
                <SelectItem value="suspensa">Suspensa</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={e => sf("observacoes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button className="bg-sky-700 hover:bg-sky-800 text-white" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ABA UTILIZAÇÃO
// ══════════════════════════════════════════════════════════════════════════════

function ImportResultAlert({
  result,
  onClose,
}: {
  result: { importados: number; naoEncontrados: string[] };
  onClose: () => void;
}) {
  const hasWarnings = result.naoEncontrados.length > 0;
  return (
    <div
      className={`rounded-xl border px-4 py-3 flex gap-3 items-start ${
        hasWarnings
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-sky-50 border-sky-200 text-sky-800"
      }`}
    >
      {hasWarnings ? (
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 mt-0.5 text-sky-500 flex-shrink-0" />
      )}
      <div className="flex-1 text-sm">
        <p className="font-semibold">
          {result.importados} linha(s) importada(s) com sucesso.
        </p>
        {hasWarnings && (
          <p className="mt-1 text-xs">
            <span className="font-medium">{result.naoEncontrados.length} número(s) não encontrado(s)</span>{" "}
            nesta empresa — verifique se estão cadastrados na aba Linhas:{" "}
            <span className="font-mono">{result.naoEncontrados.join(", ")}</span>
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        className="text-current opacity-50 hover:opacity-100 transition-opacity text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

function UtilizacaoTab({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  const [competencia, setCompetencia] = useState(hojeComp());
  const [dialogLinha, setDialogLinha] = useState<any>(null);
  const [importResult, setImportResult] = useState<{ importados: number; naoEncontrados: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const importarMut = trpc.telefonesCorporativos.uso.importarPlanilha.useMutation();

  const usoQ = trpc.telefonesCorporativos.uso.list.useQuery(
    { companyId, competencia },
    { enabled: companyId > 0 }
  );
  const { linhas = [], uso = [] } = usoQ.data || {};

  // Mapear uso por linhaId
  const usoMap = useMemo(() => {
    const m: Record<number, any> = {};
    uso.forEach((u: any) => { m[u.linhaId] = u; });
    return m;
  }, [uso]);

  // Totais
  const totais = useMemo(() => {
    let creditoUsado = 0, creditoTotal = 0, dadosMb = 0;
    uso.forEach((u: any) => {
      creditoUsado += Number(String(u.creditoUsado || "0").replace(",", ".")) || 0;
      creditoTotal += Number(String(u.creditoTotal || "0").replace(",", ".")) || 0;
      dadosMb      += Number(String(u.dadosMb || "0").replace(",", ".")) || 0;
    });
    return { creditoUsado, creditoTotal, dadosMb };
  }, [uso]);

  const prevCompetencia = () => {
    const [y, m] = competencia.split("-").map(Number);
    const pm = m - 1 < 1 ? 12 : m - 1;
    const py = m - 1 < 1 ? y - 1 : y;
    setCompetencia(`${py}-${String(pm).padStart(2, "0")}`);
  };
  const nextCompetencia = () => {
    const [y, m] = competencia.split("-").map(Number);
    const nm = m + 1 > 12 ? 1 : m + 1;
    const ny = m + 1 > 12 ? y + 1 : y;
    setCompetencia(`${ny}-${String(nm).padStart(2, "0")}`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-selected
    setImporting(true);
    try {
      // Parse client-side with SheetJS (already bundled)
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rows.length === 0) { toast.error("A planilha está vazia."); return; }

      // Convert to base64 for transport
      const uint8 = new Uint8Array(buf);
      let binary = "";
      uint8.forEach(b => { binary += String.fromCharCode(b); });
      const base64 = btoa(binary);

      const result = await importarMut.mutateAsync({ companyId, competencia, base64, fileName: file.name });
      utils.telefonesCorporativos.uso.list.invalidate();
      setImportResult(result);
      if (result.naoEncontrados.length === 0) {
        toast.success(`${result.importados} linha(s) importada(s) com sucesso.`);
      } else {
        toast.warning(`${result.importados} importada(s), ${result.naoEncontrados.length} não encontrada(s).`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao importar a planilha.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Navegação de competência + botão importar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="icon" onClick={prevCompetencia}>&lt;</Button>
        <span className="font-semibold text-slate-700 min-w-[90px] text-center">{fmtComp(competencia)}</span>
        <Button variant="outline" size="icon" onClick={nextCompetencia}>&gt;</Button>
        <span className="text-xs text-slate-400 ml-2">competência</span>
        {isAdmin && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              variant="outline"
              size="sm"
              className="ml-auto border-sky-200 text-sky-700 hover:bg-sky-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importando…</>
                : <><FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Importar planilha</>
              }
            </Button>
          </>
        )}
      </div>

      {/* Resultado da última importação */}
      {importResult && (
        <ImportResultAlert result={importResult} onClose={() => setImportResult(null)} />
      )}

      {/* Painel de totais */}
      {linhas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5">
            <CreditCard className="h-4 w-4 text-sky-600 mb-1" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">Crédito usado</p>
            <p className="text-lg font-bold text-sky-800">
              {totais.creditoTotal > 0
                ? `${totais.creditoUsado.toFixed(0)} / ${totais.creditoTotal.toFixed(0)}`
                : totais.creditoUsado > 0 ? totais.creditoUsado.toFixed(0) : "—"}
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <Wifi className="h-4 w-4 text-slate-500 mb-1" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dados consumidos</p>
            <p className="text-lg font-bold text-slate-700">
              {totais.dadosMb > 1024
                ? `${(totais.dadosMb / 1024).toFixed(1)} GB`
                : totais.dadosMb > 0 ? `${totais.dadosMb.toFixed(0)} MB` : "—"}
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5">
            <Phone className="h-4 w-4 text-indigo-600 mb-1" />
            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Linhas com lançamento</p>
            <p className="text-lg font-bold text-indigo-800">{uso.length} / {linhas.length}</p>
          </div>
        </div>
      )}

      {/* Tabela */}
      {linhas.length === 0 ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <BarChart3 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma linha cadastrada</p>
          <p className="text-slate-400 text-sm mt-1">Cadastre as linhas na aba "Linhas" primeiro</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Linha</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">Colaborador</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                    <CreditCard className="h-3.5 w-3.5 inline mr-1 text-sky-500" />Crédito
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">
                    <Wifi className="h-3.5 w-3.5 inline mr-1 text-slate-400" />Dados
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden lg:table-cell">
                    <HardDrive className="h-3.5 w-3.5 inline mr-1 text-slate-400" />Armazenamento
                  </th>
                  {isAdmin && <th className="px-4 py-3 text-center font-semibold text-slate-600 text-xs uppercase tracking-wide">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l: any, idx: number) => {
                  const u = usoMap[l.id];
                  return (
                    <tr key={l.id} className={`border-t border-slate-50 hover:bg-slate-50/60 ${idx % 2 === 1 ? "bg-slate-50/30" : ""}`}>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-800">{l.numero}</td>
                      <td className="px-4 py-3 text-slate-600">{l.employeeNome || <span className="text-slate-400 italic">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        {u ? (
                          <span className={u.creditoTotal && Number(u.creditoUsado) / Number(u.creditoTotal) > 0.9 ? "text-amber-600 font-semibold" : "text-slate-700"}>
                            {u.creditoUsado || "—"}
                            {u.creditoTotal && <span className="text-slate-400 text-xs"> / {u.creditoTotal}</span>}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell text-slate-600">
                        {u ? (
                          <span>
                            {u.dadosMb ? (Number(u.dadosMb) >= 1024 ? `${(Number(u.dadosMb)/1024).toFixed(1)} GB` : `${u.dadosMb} MB`) : "—"}
                            {u.dadosTotalMb && <span className="text-slate-400 text-xs"> / {Number(u.dadosTotalMb) >= 1024 ? `${(Number(u.dadosTotalMb)/1024).toFixed(1)} GB` : `${u.dadosTotalMb} MB`}</span>}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-slate-600">
                        {u ? (
                          u.armazenamentoMb
                            ? (Number(u.armazenamentoMb) >= 1024 ? `${(Number(u.armazenamentoMb)/1024).toFixed(1)} GB` : `${u.armazenamentoMb} MB`)
                            : "—"
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-sky-200 text-sky-700 hover:bg-sky-50"
                            onClick={() => setDialogLinha({ linha: l, uso: u })}
                          >
                            {u ? <><Pencil className="h-3 w-3 mr-1" /> Atualizar</> : <><Plus className="h-3 w-3 mr-1" /> Registrar</>}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dialogLinha && (
        <UsoDialog
          linha={dialogLinha.linha}
          uso={dialogLinha.uso}
          competencia={competencia}
          companyId={companyId}
          onClose={() => setDialogLinha(null)}
          onSaved={() => { setDialogLinha(null); utils.telefonesCorporativos.uso.list.invalidate(); }}
        />
      )}
    </div>
  );
}

function UsoDialog({ linha, uso, competencia, companyId, onClose, onSaved }: {
  linha: any; uso: any; competencia: string; companyId: number; onClose: () => void; onSaved: () => void;
}) {
  const lancarMut = trpc.telefonesCorporativos.uso.lancar.useMutation();
  const [form, setForm] = useState({
    creditoUsado:         uso?.creditoUsado || "",
    creditoTotal:         uso?.creditoTotal || "",
    dadosMb:              uso?.dadosMb || "",
    dadosTotalMb:         uso?.dadosTotalMb || "",
    armazenamentoMb:      uso?.armazenamentoMb || "",
    armazenamentoTotalMb: uso?.armazenamentoTotalMb || "",
    observacoes:          uso?.observacoes || "",
  });
  const sf = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await lancarMut.mutateAsync({
        companyId,
        linhaId: linha.id,
        competencia,
        creditoUsado:         form.creditoUsado || undefined,
        creditoTotal:         form.creditoTotal || undefined,
        dadosMb:              form.dadosMb || undefined,
        dadosTotalMb:         form.dadosTotalMb || undefined,
        armazenamentoMb:      form.armazenamentoMb || undefined,
        armazenamentoTotalMb: form.armazenamentoTotalMb || undefined,
        observacoes:          form.observacoes || undefined,
      });
      toast.success("Consumo registrado.");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-600" />
            Consumo — {linha.numero}
          </DialogTitle>
          <p className="text-sm text-slate-500 mt-0.5">{fmtComp(competencia)} · {linha.employeeNome || "Sem colaborador"}</p>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-sky-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide mb-2 flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />Crédito</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Usado</Label><Input value={form.creditoUsado} onChange={e => sf("creditoUsado", e.target.value)} placeholder="ex: 45,00" /></div>
              <div><Label className="text-xs">Total / franquia</Label><Input value={form.creditoTotal} onChange={e => sf("creditoTotal", e.target.value)} placeholder="ex: 80,00" /></div>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />Dados (MB)</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Consumido (MB)</Label><Input type="number" min={0} value={form.dadosMb} onChange={e => sf("dadosMb", e.target.value)} placeholder="ex: 4096" /></div>
              <div><Label className="text-xs">Total franquia (MB)</Label><Input type="number" min={0} value={form.dadosTotalMb} onChange={e => sf("dadosTotalMb", e.target.value)} placeholder="ex: 10240" /></div>
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1"><HardDrive className="h-3.5 w-3.5" />Armazenamento (MB)</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Usado (MB)</Label><Input type="number" min={0} value={form.armazenamentoMb} onChange={e => sf("armazenamentoMb", e.target.value)} placeholder="ex: 12288" /></div>
              <div><Label className="text-xs">Total (MB)</Label><Input type="number" min={0} value={form.armazenamentoTotalMb} onChange={e => sf("armazenamentoTotalMb", e.target.value)} placeholder="ex: 65536" /></div>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={e => sf("observacoes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button className="bg-sky-700 hover:bg-sky-800 text-white" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
