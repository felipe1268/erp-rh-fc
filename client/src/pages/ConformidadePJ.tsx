import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Clock, XCircle, Loader2, FileText,
  Receipt, Building2, Shield, Briefcase, ChevronLeft, ChevronRight, Calendar,
} from "lucide-react";
import { toast } from "sonner";

type TipoConformidade = "das" | "nf" | "cnd" | "seguro_vida" | "status_cnpj";

const TIPOS_META: Record<TipoConformidade, { label: string; icon: any; color: string; mensal: boolean; descricao: string }> = {
  das:         { label: "DAS-MEI",     icon: Receipt,    color: "blue",    mensal: true,  descricao: "Documento de Arrecadação do Simples Nacional (vence dia 20)" },
  nf:          { label: "NF do mês",   icon: FileText,   color: "indigo",  mensal: true,  descricao: "Nota Fiscal de prestação de serviço" },
  cnd:         { label: "CND CNPJ",    icon: Building2,  color: "purple",  mensal: false, descricao: "Certidão Negativa de Débitos do CNPJ" },
  seguro_vida: { label: "Seguro Vida", icon: Shield,     color: "emerald", mensal: false, descricao: "Seguro de Vida (Cláusula 5.1 do contrato)" },
  status_cnpj: { label: "CNPJ Ativo",  icon: Briefcase,  color: "amber",   mensal: false, descricao: "Status do CNPJ na Receita Federal" },
};

const ORDEM_TIPOS: TipoConformidade[] = ["das", "nf", "cnd", "seguro_vida", "status_cnpj"];

const STATUS_BADGE: Record<string, { label: string; className: string; icon: any }> = {
  pendente: { label: "Pendente", className: "bg-amber-100 text-amber-700 border-amber-300", icon: Clock },
  ok:       { label: "OK",       className: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: CheckCircle2 },
  vencido:  { label: "Vencido",  className: "bg-red-100 text-red-700 border-red-300", icon: AlertTriangle },
  na:       { label: "N/A",      className: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
};

function statusEfetivo(item: any): string {
  return item?.statusComputed || item?.status || "pendente";
}

function mesAnterior(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function mesPosterior(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function labelMes(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[m-1]}/${y}`;
}

export default function ConformidadePJ() {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? Number(selectedCompanyId) || 0 : 0;
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const [mesRef, setMesRef] = useState(mesAtual);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ employeeId: number; nome: string; tipo: TipoConformidade; item: any } | null>(null);
  const [form, setForm] = useState({
    status: "pendente" as string,
    dataVencimento: "",
    dataEnvio: "",
    valor: "",
    documentoUrl: "",
    observacoes: "",
  });

  const { data, isLoading, refetch } = trpc.pjConformidade.listar.useQuery(
    { companyId, mesReferencia: mesRef },
    { enabled: companyId > 0 }
  );

  const upsertMut = trpc.pjConformidade.upsert.useMutation({
    onSuccess: () => { toast.success("Conformidade atualizada!"); setDialogOpen(false); refetch(); },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const totais = useMemo(() => {
    const fs = data?.funcionarios || [];
    let pendentes = 0, vencidos = 0, ok = 0, total = 0;
    for (const f of fs) {
      for (const t of ORDEM_TIPOS) {
        const s = statusEfetivo(f.itens[t]);
        if (s === "pendente") pendentes++;
        else if (s === "vencido") vencidos++;
        else if (s === "ok") ok++;
        total++;
      }
    }
    return { pendentes, vencidos, ok, total, pjs: fs.length };
  }, [data]);

  function abrirEdicao(emp: any, tipo: TipoConformidade) {
    const item = emp.itens[tipo] || {};
    setEditing({ employeeId: emp.id, nome: emp.nomeCompleto, tipo, item });
    setForm({
      status: item.status || "pendente",
      dataVencimento: item.dataVencimento ? String(item.dataVencimento).slice(0,10) : "",
      dataEnvio: item.dataEnvio ? String(item.dataEnvio).slice(0,10) : "",
      valor: item.valor ? String(item.valor) : "",
      documentoUrl: item.documentoUrl || "",
      observacoes: item.observacoes || "",
    });
    setDialogOpen(true);
  }

  function salvar() {
    if (!editing) return;
    upsertMut.mutate({
      companyId,
      employeeId: editing.employeeId,
      tipo: editing.tipo,
      competencia: TIPOS_META[editing.tipo].mensal ? mesRef : null,
      status: form.status as any,
      dataVencimento: form.dataVencimento || null,
      dataEnvio: form.dataEnvio || null,
      valor: form.valor || null,
      documentoUrl: form.documentoUrl || null,
      observacoes: form.observacoes || null,
    });
  }

  if (companyId === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-20 text-muted-foreground">
          Selecione uma empresa para ver a conformidade dos PJs.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-purple-600" /> Conformidade PJ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhamento mensal das obrigações dos prestadores PJ: DAS, NF, CND, Seguro de Vida e status do CNPJ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMesRef(mesAnterior(mesRef))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="px-3 py-1.5 rounded-md border bg-white text-sm font-semibold flex items-center gap-2 min-w-[110px] justify-center">
            <Calendar className="h-4 w-4 text-purple-500" /> {labelMes(mesRef)}
          </div>
          <Button variant="outline" size="sm" onClick={() => setMesRef(mesPosterior(mesRef))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {mesRef !== mesAtual && (
            <Button variant="ghost" size="sm" onClick={() => setMesRef(mesAtual)}>Hoje</Button>
          )}
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">PJs ativos</div>
          <div className="text-2xl font-bold mt-1">{totais.pjs}</div>
        </CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50/40"><CardContent className="p-4">
          <div className="text-xs text-emerald-700 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> OK</div>
          <div className="text-2xl font-bold mt-1 text-emerald-700">{totais.ok}</div>
        </CardContent></Card>
        <Card className="border-amber-200 bg-amber-50/40"><CardContent className="p-4">
          <div className="text-xs text-amber-700 uppercase tracking-wider flex items-center gap-1"><Clock className="h-3 w-3" /> Pendentes</div>
          <div className="text-2xl font-bold mt-1 text-amber-700">{totais.pendentes}</div>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50/40"><CardContent className="p-4">
          <div className="text-xs text-red-700 uppercase tracking-wider flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Vencidos</div>
          <div className="text-2xl font-bold mt-1 text-red-700">{totais.vencidos}</div>
        </CardContent></Card>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Carregando...</div>
      ) : !data || data.funcionarios.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground bg-white rounded-xl border">
          <Briefcase className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          Nenhum funcionário PJ ativo nesta empresa.
          <div className="text-xs mt-2">Cadastre PJs em "Contratos PJ" no menu Terceiros &gt; PJ.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-left font-semibold text-gray-700 sticky left-0 bg-gray-50 z-10">Funcionário PJ</th>
                <th className="p-3 text-center font-semibold text-gray-700">CPF</th>
                {ORDEM_TIPOS.map(t => {
                  const meta = TIPOS_META[t];
                  const Icon = meta.icon;
                  return (
                    <th key={t} className="p-3 text-center font-semibold text-gray-700">
                      <div className="flex flex-col items-center gap-0.5">
                        <Icon className={`h-4 w-4 text-${meta.color}-500`} />
                        <span className="text-xs">{meta.label}</span>
                        {meta.mensal && <span className="text-[9px] text-gray-400">({labelMes(mesRef)})</span>}
                      </div>
                    </th>
                  );
                })}
                <th className="p-3 text-center font-semibold text-gray-700">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {data.funcionarios.map((emp: any) => (
                <tr key={emp.id} className="border-b last:border-0 hover:bg-gray-50/50">
                  <td className="p-3 font-medium text-gray-900 sticky left-0 bg-white z-10">
                    <a href={`/relatorios/raio-x?employeeId=${emp.id}`} className="hover:underline hover:text-purple-700">
                      {emp.nomeCompleto}
                    </a>
                    <div className="text-xs text-muted-foreground">{emp.funcao || '-'}</div>
                  </td>
                  <td className="p-3 text-center font-mono text-xs">{emp.cpf || '-'}</td>
                  {ORDEM_TIPOS.map(tipo => {
                    const item = emp.itens[tipo];
                    const status = statusEfetivo(item);
                    const cfg = STATUS_BADGE[status] || STATUS_BADGE.pendente;
                    const Icon = cfg.icon;
                    return (
                      <td key={tipo} className="p-2 text-center">
                        <button
                          onClick={() => abrirEdicao(emp, tipo)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold transition-all hover:scale-105 ${cfg.className}`}
                          title={item?.dataVencimento ? `Vence: ${String(item.dataVencimento).slice(0,10)}` : (item?.dataEnvio ? `Enviado: ${String(item.dataEnvio).slice(0,10)}` : 'Clique para editar')}
                        >
                          <Icon className="h-3 w-3" /> {cfg.label}
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-3 text-center">
                    {emp.pendencias > 0 ? (
                      <Badge variant="destructive">{emp.pendencias}</Badge>
                    ) : (
                      <Badge className="bg-emerald-600 hover:bg-emerald-700">0</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog de edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editing && (() => { const Icon = TIPOS_META[editing.tipo].icon; return <Icon className="h-5 w-5 text-purple-500" />; })()}
              {editing ? TIPOS_META[editing.tipo].label : ''}
            </DialogTitle>
            <DialogDescription>
              {editing?.nome}
              {editing && TIPOS_META[editing.tipo].mensal && <span className="block text-xs mt-1">Competência: <strong>{labelMes(mesRef)}</strong></span>}
              <span className="block text-xs mt-1 text-gray-500">{editing && TIPOS_META[editing.tipo].descricao}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="na">N/A (não se aplica)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editing && !TIPOS_META[editing.tipo].mensal && (
              <div>
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Data de Envio / Emissão</Label>
              <Input type="date" value={form.dataEnvio} onChange={e => setForm(f => ({ ...f, dataEnvio: e.target.value }))} />
            </div>
            {editing && (editing.tipo === 'das' || editing.tipo === 'nf') && (
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
              </div>
            )}
            <div>
              <Label>Link do Documento</Label>
              <Input value={form.documentoUrl} onChange={e => setForm(f => ({ ...f, documentoUrl: e.target.value }))} placeholder="https://..." />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={upsertMut.isPending}>
              {upsertMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
