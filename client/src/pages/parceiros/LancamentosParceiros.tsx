import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Receipt, Plus, Search, CheckCircle, XCircle, Clock, Upload, FileText, Eye, Store } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function LancamentosParceiros() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const now = new Date();
  const [ano, setAno] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [filterParceiro, setFilterParceiro] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;

  const { data: lancamentos = [], refetch } = trpc.parceiros.lancamentos.list.useQuery(
    { companyId: companyId ?? 0, competencia, parceiroId: filterParceiro !== "all" ? parseInt(filterParceiro) : undefined },
    { enabled: !!companyId }
  );
  const { data: parceiros = [] } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const { data: colaboradores = [] } = trpc.employees.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const createMut = trpc.parceiros.lancamentos.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); toast.success("Lançamento registrado!"); } });
  const aprovarMut = trpc.parceiros.lancamentos.aprovar.useMutation({ onSuccess: () => { refetch(); toast.success("Lançamento atualizado!"); } });
  const uploadMut = trpc.parceiros.lancamentos.uploadComprovante.useMutation({ onSuccess: () => { refetch(); toast.success("Comprovante enviado!"); } });

  const filtered = useMemo(() => {
    let list = lancamentos;
    if (filterStatus !== "all") list = list.filter((l: any) => l.statusLancamento === filterStatus);
    return list;
  }, [lancamentos, filterStatus]);

  const totalAprovado = useMemo(() => {
    return lancamentos.filter((l: any) => l.statusLancamento === "aprovado").reduce((acc: number, l: any) => acc + parseFloat(l.valor || "0"), 0);
  }, [lancamentos]);

  const totalPendente = useMemo(() => {
    return lancamentos.filter((l: any) => l.statusLancamento === "pendente").reduce((acc: number, l: any) => acc + parseFloat(l.valor || "0"), 0);
  }, [lancamentos]);

  const openNew = () => {
    setForm({ companyId: companyId ?? 0, dataCompra: new Date().toISOString().split("T")[0] });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.parceiroConveniadoId || !form.employeeId || !form.valor) { toast.error("Parceiro, Colaborador e Valor são obrigatórios"); return; }
    createMut.mutate(form);
  };

  const handleUpload = (lancamentoId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMut.mutate({ lancamentoId, fileName: file.name, fileBase64: base64, contentType: file.type });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const getParceiroNome = (id: number) => {
    const p = parceiros.find((p: any) => p.id === id);
    return p ? (p as any).nomeFantasia || (p as any).razaoSocial : "—";
  };

  const getColaboradorNome = (id: number) => {
    const c = colaboradores.find((c: any) => c.id === id);
    return c ? (c as any).nome : "—";
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      pendente: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock, label: "Pendente" },
      aprovado: { bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle, label: "Aprovado" },
      rejeitado: { bg: "bg-red-100", text: "text-red-700", icon: XCircle, label: "Rejeitado" },
    };
    const s = map[status] || map.pendente;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        <s.icon className="h-3 w-3" />{s.label}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Lançamentos</h1>
              <p className="text-sm text-muted-foreground">{lancamentos.length} lançamento(s) em {MESES[mes - 1]}/{ano}</p>
            </div>
          </div>
          <Button onClick={openNew} className="bg-purple-500 hover:bg-purple-600">
            <Plus className="h-4 w-4 mr-1" /> Novo Lançamento
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={String(mes)} onValueChange={(v) => setMes(parseInt(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{[2024, 2025, 2026, 2027].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterParceiro} onValueChange={setFilterParceiro}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Parceiro" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Parceiros</SelectItem>
              {parceiros.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.nomeFantasia || p.razaoSocial}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovado">Aprovados</SelectItem>
              <SelectItem value="rejeitado">Rejeitados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-lg border p-3 text-center">
            <span className="text-lg font-bold text-foreground">{lancamentos.length}</span>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
            <span className="text-lg font-bold text-amber-600">R$ {totalPendente.toFixed(2)}</span>
            <p className="text-xs text-amber-700">Pendentes</p>
          </div>
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
            <span className="text-lg font-bold text-emerald-600">R$ {totalAprovado.toFixed(2)}</span>
            <p className="text-xs text-emerald-700">Aprovados</p>
          </div>
          <div className="bg-purple-50 rounded-lg border border-purple-200 p-3 text-center">
            <span className="text-lg font-bold text-purple-600">R$ {(totalAprovado + totalPendente).toFixed(2)}</span>
            <p className="text-xs text-purple-700">Total Geral</p>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum lançamento encontrado</p>
            </div>
          ) : (
            filtered.map((l: any) => (
              <div key={l.id} className="bg-card rounded-xl border p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{getColaboradorNome(l.employeeId)}</h3>
                      {statusBadge(l.statusLancamento)}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Store className="h-3 w-3" />{getParceiroNome(l.parceiroConveniadoId)}</span>
                      <span>Data: {l.dataCompra ? new Date(l.dataCompra).toLocaleDateString("pt-BR") : "—"}</span>
                      <span className="font-semibold text-foreground">R$ {parseFloat(l.valor || "0").toFixed(2)}</span>
                    </div>
                    {l.descricaoItens && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{l.descricaoItens}</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {l.comprovanteUrl && (
                      <a href={l.comprovanteUrl} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline"><FileText className="h-3.5 w-3.5 mr-1" /> Ver</Button>
                      </a>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleUpload(l.id)}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> Comprovante
                    </Button>
                    {l.statusLancamento === "pendente" && (
                      <>
                        <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => aprovarMut.mutate({ id: l.id, aprovado: true })}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => {
                          const motivo = prompt("Motivo da rejeição:");
                          if (motivo) aprovarMut.mutate({ id: l.id, aprovado: false, motivoRejeicao: motivo });
                        }}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeitar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* New Entry Dialog */}
      {showForm && (
        <FullScreenDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          title="Novo Lançamento"
          headerColor="bg-purple-500"
        >
          <div className="max-w-2xl mx-auto p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Parceiro *</Label>
                <Select value={form.parceiroConveniadoId ? String(form.parceiroConveniadoId) : ""} onValueChange={(v) => setForm({ ...form, parceiroConveniadoId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {parceiros.filter((p: any) => p.statusParceiro === "ativo").map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.nomeFantasia || p.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Colaborador *</Label>
                <Select value={form.employeeId ? String(form.employeeId) : ""} onValueChange={(v) => setForm({ ...form, employeeId: parseInt(v) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {colaboradores.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data da Compra</Label><Input type="date" value={form.dataCompra || ""} onChange={(e) => setForm({ ...form, dataCompra: e.target.value })} /></div>
              <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.valor || ""} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0.00" /></div>
            </div>
            <div><Label>Descrição dos Itens</Label><Textarea value={form.descricaoItens || ""} onChange={(e) => setForm({ ...form, descricaoItens: e.target.value })} rows={3} placeholder="Descreva os itens comprados..." /></div>
            <div><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-purple-500 hover:bg-purple-600" disabled={createMut.isPending}>
                {createMut.isPending ? "Salvando..." : "Registrar Lançamento"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      )}
    </DashboardLayout>
  );
}
