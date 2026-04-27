import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Search, ChevronLeft, ChevronRight,
  FileText, AlertCircle, Clock, CheckCircle2,
  ReceiptText, ChevronDown, ChevronUp, Building2,
  RefreshCw
} from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("pt-BR");
}

function getMes(s: string | null | undefined): number | null {
  if (!s) return null;
  return new Date(s + (s.length === 10 ? "T00:00:00" : "")).getMonth() + 1;
}

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: any; order: number }> = {
  a_faturar:        { label: "A Faturar",      color: "text-amber-700",  bg: "bg-amber-100",  icon: Clock,         order: 1 },
  faturado:         { label: "Faturado",        color: "text-blue-700",   bg: "bg-blue-100",   icon: FileText,      order: 2 },
  a_receber:        { label: "A Receber",       color: "text-purple-700", bg: "bg-purple-100", icon: ReceiptText,   order: 3 },
  recebido_parcial: { label: "Parc. Recebido",  color: "text-teal-700",   bg: "bg-teal-100",   icon: CheckCircle2,  order: 4 },
  recebido_total:   { label: "Recebido",        color: "text-green-700",  bg: "bg-green-100",  icon: CheckCircle2,  order: 5 },
  cancelado:        { label: "Cancelado",       color: "text-gray-500",   bg: "bg-gray-100",   icon: AlertCircle,   order: 6 },
};

// ─── Formulários ──────────────────────────────────────────────────────────────

const FORM_EMPTY = {
  obraId: "", obraNome: "", clienteNome: "", clienteCnpj: "",
  valorContrato: "", valorMedicao: "", medicaoNumero: "",
  percentualMedicao: "", dataVencimento: "",
  retencaoISS: "0", retencaoINSS: "0", retencaoIR: "0", observacoes: "",
};

const UPDATE_EMPTY = {
  status: "", nfNumero: "", nfEmitidaEm: "",
  dataRecebimento: "", valorRecebido: "", formaPagamento: "",
};

// ─── Pipeline Card ────────────────────────────────────────────────────────────

function PipelineCard({
  status, total, count, active, onClick
}: {
  status: string; total: number; count: number; active: boolean; onClick: () => void;
}) {
  const cfg = STATUS_CFG[status];
  const Icon = cfg?.icon ?? Clock;
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl p-4 text-left transition-all border-2
        ${active
          ? `${cfg?.bg ?? "bg-gray-100"} border-current ${cfg?.color ?? ""} shadow-md`
          : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
        }`}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-4 h-4 ${active ? cfg?.color : "text-gray-400"}`} />
        {count > 0 && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full
            ${active ? `${cfg?.bg} ${cfg?.color}` : "bg-gray-100 text-gray-500"}`}>
            {count}
          </span>
        )}
      </div>
      <p className={`text-xs font-medium mb-1 ${active ? cfg?.color : "text-gray-500"}`}>
        {cfg?.label ?? status}
      </p>
      <p className={`text-base font-bold ${active ? cfg?.color : "text-gray-700"}`}>
        {fmtBRL(total)}
      </p>
    </button>
  );
}

// ─── Linha da tabela ──────────────────────────────────────────────────────────

function ReceitaRow({ r, hojeStr, onUpdate }: { r: any; hojeStr: string; onUpdate: (r: any) => void }) {
  const vencida = r.dataVencimento && r.dataVencimento < hojeStr
    && !["recebido_total", "cancelado"].includes(r.status);
  const cfg = STATUS_CFG[r.status] ?? { label: r.status, color: "text-gray-600", bg: "bg-gray-100", icon: Clock, order: 99 };
  const Icon = cfg.icon;
  const semValor = !Number(r.valorMedicao);

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 transition-colors
      ${vencida ? "bg-red-50/40" : ""}`}>

      {/* Obra */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-tight">{r.obraNome ?? "—"}</p>
            {r.clienteNome && (
              <p className="text-xs text-gray-400 leading-tight mt-0.5">{r.clienteNome}</p>
            )}
          </div>
        </div>
      </td>

      {/* Medição */}
      <td className="px-3 py-3 text-center">
        <span className="text-xs text-gray-500">
          {r.medicaoNumero ? `#${r.medicaoNumero}` : "—"}
        </span>
      </td>

      {/* Valor */}
      <td className="px-3 py-3 text-right">
        {semValor ? (
          <span className="text-xs text-gray-300 italic">Sem valor</span>
        ) : (
          <span className="text-sm font-bold text-green-700">{fmtBRL(Number(r.valorMedicao))}</span>
        )}
      </td>

      {/* NF */}
      <td className="px-3 py-3 text-center">
        {r.nfNumero ? (
          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">{r.nfNumero}</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Vencimento */}
      <td className="px-3 py-3 text-center">
        {r.dataVencimento ? (
          <div>
            <span className={`text-xs font-medium ${vencida ? "text-red-600" : "text-gray-600"}`}>
              {fmtData(r.dataVencimento)}
            </span>
            {vencida && (
              <p className="text-[10px] text-red-500 font-semibold">Em atraso</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Recebido */}
      <td className="px-3 py-3 text-right">
        {r.valorRecebido ? (
          <span className="text-xs font-semibold text-green-700">{fmtBRL(Number(r.valorRecebido))}</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </span>
      </td>

      {/* Ação */}
      <td className="px-3 py-3">
        {!["cancelado", "recebido_total"].includes(r.status) && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3 border-gray-200 hover:border-blue-400 hover:text-blue-600"
            onClick={() => onUpdate(r)}
          >
            Avançar
          </Button>
        )}
      </td>
    </tr>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FinanceiroContasAReceber() {
  const { companyId } = useCompany();
  const { toast } = useToast();

  const hoje = new Date();
  const hojeStr = hoje.toISOString().split("T")[0];

  const [ano, setAno]           = useState(hoje.getFullYear());
  const [mesSel, setMesSel]     = useState(hoje.getMonth() + 1);
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [showNew, setShowNew]   = useState(false);
  const [showUpdate, setShowUpdate] = useState<any | null>(null);
  const [showAnual, setShowAnual]   = useState(false);
  const [form, setForm]         = useState(FORM_EMPTY);
  const [updateForm, setUpdateForm] = useState(UPDATE_EMPTY);

  const { data: allReceitas, isLoading, refetch } = (trpc as any).financial.getRevenueByYear.useQuery(
    { companyId, ano },
    { enabled: !!companyId }
  );

  const { data: obras } = (trpc as any).obras.getObras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createMut = (trpc as any).financial.createRevenue.useMutation({
    onSuccess: () => { toast({ title: "Medição registrada!" }); setShowNew(false); setForm(FORM_EMPTY); refetch(); },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const updateMut = (trpc as any).financial.updateRevenueStatus.useMutation({
    onSuccess: () => { toast({ title: "Status atualizado!" }); setShowUpdate(null); refetch(); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Dados do mês selecionado
  const mesData = useMemo(() => {
    if (!allReceitas) return [];
    return allReceitas.filter((r: any) => {
      const m = getMes(r.dataVencimento ?? r.createdAt);
      return m === mesSel && r.status !== "cancelado";
    });
  }, [allReceitas, mesSel]);

  // Pipeline: totais por status
  const pipeline = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const r of mesData) {
      if (!map[r.status]) map[r.status] = { total: 0, count: 0 };
      map[r.status].total += Number(r.valorMedicao ?? 0);
      map[r.status].count += 1;
    }
    return map;
  }, [mesData]);

  // Filtro + busca + ordem de urgência
  const filtered = useMemo(() => {
    let list = mesData;
    if (pipelineFilter) list = list.filter((r: any) => r.status === pipelineFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r: any) =>
        (r.obraNome ?? "").toLowerCase().includes(q) ||
        (r.clienteNome ?? "").toLowerCase().includes(q)
      );
    }
    // Ordena: vencidas → por data → sem data
    return [...list].sort((a, b) => {
      const aVenc = a.dataVencimento && a.dataVencimento < hojeStr && !["recebido_total"].includes(a.status);
      const bVenc = b.dataVencimento && b.dataVencimento < hojeStr && !["recebido_total"].includes(b.status);
      if (aVenc && !bVenc) return -1;
      if (!aVenc && bVenc) return 1;
      const aDate = a.dataVencimento ?? "9999";
      const bDate = b.dataVencimento ?? "9999";
      return aDate.localeCompare(bDate);
    });
  }, [mesData, pipelineFilter, search, hojeStr]);

  // KPIs do mês
  const totalMes       = mesData.reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);
  const totalRecebido  = mesData.reduce((s: number, r: any) => s + Number(r.valorRecebido ?? 0), 0);
  const totalVencidas  = mesData.filter((r: any) =>
    r.dataVencimento && r.dataVencimento < hojeStr && !["recebido_total"].includes(r.status)
  ).reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);

  // Meses com dados para o mini navegador
  const mesesComDados = useMemo(() => {
    const s = new Set<number>();
    for (const r of allReceitas ?? []) {
      const m = getMes(r.dataVencimento ?? r.createdAt);
      if (m) s.add(m);
    }
    return s;
  }, [allReceitas]);

  function handleSave() {
    if (!form.valorMedicao) { toast({ title: "Informe o valor da medição", variant: "destructive" }); return; }
    createMut.mutate({
      companyId,
      obraId: parseInt(form.obraId) || 0,
      obraNome: form.obraNome || undefined,
      clienteNome: form.clienteNome || undefined,
      clienteCnpj: form.clienteCnpj || undefined,
      valorContrato: parseFloat(form.valorContrato) || undefined,
      valorMedicao: parseFloat(form.valorMedicao),
      medicaoNumero: parseInt(form.medicaoNumero) || undefined,
      percentualMedicao: parseFloat(form.percentualMedicao) || undefined,
      dataVencimento: form.dataVencimento || undefined,
      retencaoISS: parseFloat(form.retencaoISS) || 0,
      retencaoINSS: parseFloat(form.retencaoINSS) || 0,
      retencaoIR: parseFloat(form.retencaoIR) || 0,
      observacoes: form.observacoes || undefined,
    });
  }

  function handleUpdate() {
    updateMut.mutate({
      id: showUpdate.id,
      companyId,
      status: updateForm.status || showUpdate.status,
      nfNumero: updateForm.nfNumero || undefined,
      nfEmitidaEm: updateForm.nfEmitidaEm || undefined,
      dataRecebimento: updateForm.dataRecebimento || undefined,
      valorRecebido: parseFloat(updateForm.valorRecebido) || undefined,
      formaPagamento: updateForm.formaPagamento || undefined,
    });
  }

  // Próximo status sugerido
  const STATUS_NEXT: Record<string, string> = {
    a_faturar: "faturado", faturado: "a_receber",
    a_receber: "recebido_total", recebido_parcial: "recebido_total",
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        {/* ── Cabeçalho ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contas a Receber</h1>
            <p className="text-sm text-gray-400 mt-0.5">Medições, faturamento e recebimentos das obras</p>
          </div>
          <Button
            onClick={() => setShowNew(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />Nova Medição
          </Button>
        </div>

        {/* ── Navegação Mês ── */}
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3">
          <button onClick={() => { if (mesSel === 1) { setAno(a => a - 1); setMesSel(12); } else setMesSel(m => m - 1); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 flex gap-1 overflow-x-auto pb-0.5">
            {MESES_ABREV.map((m, i) => {
              const num = i + 1;
              const temDados = mesesComDados.has(num);
              const isAtual = num === mesSel;
              return (
                <button
                  key={m}
                  onClick={() => setMesSel(num)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all min-w-[44px]
                    ${isAtual
                      ? "bg-blue-600 text-white shadow-sm"
                      : temDados
                      ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "text-gray-400 hover:bg-gray-100"
                    }`}
                >
                  {m}
                  <span className={`w-1.5 h-1.5 rounded-full
                    ${isAtual ? "bg-white" : temDados ? "bg-blue-400" : "bg-gray-200"}`} />
                </button>
              );
            })}
          </div>

          <button onClick={() => { if (mesSel === 12) { setAno(a => a + 1); setMesSel(1); } else setMesSel(m => m + 1); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Ano */}
          <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3 ml-1">
            <button onClick={() => setAno(a => a - 1)} className="text-gray-400 hover:text-gray-700">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm font-bold text-gray-700 min-w-[3.5rem] text-center">{ano}</span>
            <button onClick={() => setAno(a => a + 1)} className="text-gray-400 hover:text-gray-700">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button onClick={() => refetch()}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* ── KPIs do mês ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 font-medium">Total {MESES[mesSel-1]}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{fmtBRL(totalMes)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{mesData.length} medição(ões)</p>
          </div>
          <div className={`border rounded-xl p-4 ${totalVencidas > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
            <p className={`text-xs font-medium ${totalVencidas > 0 ? "text-red-600" : "text-gray-500"}`}>
              {totalVencidas > 0 ? "⚠ Vencidas" : "Vencidas"}
            </p>
            <p className={`text-2xl font-bold mt-1 ${totalVencidas > 0 ? "text-red-700" : "text-gray-400"}`}>
              {fmtBRL(totalVencidas)}
            </p>
            <p className={`text-xs mt-0.5 ${totalVencidas > 0 ? "text-red-500" : "text-gray-400"}`}>
              {mesData.filter((r: any) => r.dataVencimento && r.dataVencimento < hojeStr && r.status !== "recebido_total").length} em atraso
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs text-green-700 font-medium">Recebido</p>
            <p className="text-2xl font-bold text-green-700 mt-1">{fmtBRL(totalRecebido)}</p>
            <p className="text-xs text-green-600 mt-0.5">
              {mesData.filter((r: any) => r.status === "recebido_total").length} finalizado(s)
            </p>
          </div>
        </div>

        {/* ── Pipeline de Status (filtros visuais) ── */}
        <div>
          <p className="text-xs text-gray-500 font-medium mb-2 px-0.5">Filtrar por status:</p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setPipelineFilter(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${!pipelineFilter
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
            >
              Todos ({mesData.length})
            </button>
            {Object.entries(STATUS_CFG).filter(([k]) => k !== "cancelado").map(([key, cfg]) => {
              const d = pipeline[key];
              if (!d?.count) return null;
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => setPipelineFilter(pipelineFilter === key ? null : key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                    ${pipelineFilter === key
                      ? `${cfg.bg} ${cfg.color} border-current shadow-sm`
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label} ({d.count}) · {fmtBRL(d.total)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Busca ── */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9 bg-white border-gray-200"
            placeholder="Buscar obra ou cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* ── Tabela ── */}
        <Card className="border border-gray-200 shadow-none overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {MESES[mesSel-1]} {ano}
              {pipelineFilter && (
                <span className={`ml-2 text-xs font-medium ${STATUS_CFG[pipelineFilter]?.color}`}>
                  · {STATUS_CFG[pipelineFilter]?.label}
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-400">{filtered.length} registro(s)</span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-7 h-7 text-gray-300 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Carregando...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <ReceiptText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium text-sm">Nenhuma medição em {MESES[mesSel-1]} {ano}</p>
              <p className="text-gray-400 text-xs mt-1">
                {pipelineFilter ? "Tente remover o filtro de status." : 'Clique em "+ Nova Medição" para registrar.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Obra / Cliente</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Med.</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Valor</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">NF</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">Vencimento</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">Recebido</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Status</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => (
                    <ReceitaRow
                      key={r.id}
                      r={r}
                      hojeStr={hojeStr}
                      onUpdate={row => {
                        setShowUpdate(row);
                        setUpdateForm({
                          ...UPDATE_EMPTY,
                          status: STATUS_NEXT[row.status] ?? row.status,
                          nfNumero: row.nfNumero ?? "",
                          nfEmitidaEm: row.nfEmitidaEm ?? "",
                        });
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Resumo Anual (colapsável) ── */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAnual(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-semibold text-gray-700">Resumo Anual {ano}</span>
            {showAnual ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showAnual && (
            <div className="overflow-x-auto border-t border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Mês</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Total Medições</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Recebido</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">A Receber</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MESES_ABREV.map((m, i) => {
                    const num = i + 1;
                    const entries = (allReceitas ?? []).filter((r: any) =>
                      getMes(r.dataVencimento ?? r.createdAt) === num && r.status !== "cancelado"
                    );
                    const totalM = entries.reduce((s: number, r: any) => s + Number(r.valorMedicao ?? 0), 0);
                    const recebidoM = entries.reduce((s: number, r: any) => s + Number(r.valorRecebido ?? 0), 0);
                    const ativo = totalM > 0 || entries.length > 0;
                    return (
                      <tr
                        key={m}
                        className={`hover:bg-blue-50/40 cursor-pointer transition-colors
                          ${mesSel === num ? "bg-blue-50" : ""}`}
                        onClick={() => setMesSel(num)}
                      >
                        <td className="px-4 py-2.5">
                          <span className={`text-sm font-medium ${mesSel === num ? "text-blue-700" : "text-gray-700"}`}>
                            {m}/{ano}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-sm font-semibold ${ativo ? "text-gray-800" : "text-gray-300"}`}>
                            {fmtBRL(totalM)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-sm ${recebidoM > 0 ? "text-green-700 font-semibold" : "text-gray-300"}`}>
                            {fmtBRL(recebidoM)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-sm ${totalM - recebidoM > 0 ? "text-orange-600 font-semibold" : "text-gray-300"}`}>
                            {fmtBRL(totalM - recebidoM)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {ativo ? (
                            <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                              {entries.length} registro(s)
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">Sem dados</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Modal: Nova Medição ── */}
      <Dialog open={showNew} onOpenChange={v => { setShowNew(v); if (!v) setForm(FORM_EMPTY); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="w-5 h-5 text-blue-600" />
              Nova Medição
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Obra *</Label>
                <Select value={form.obraId} onValueChange={v => {
                  const o = obras?.find((ob: any) => String(ob.id) === v);
                  setForm(f => ({ ...f, obraId: v, obraNome: o?.nome ?? "" }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(obras ?? []).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nº da Medição</Label>
                <Input type="number" value={form.medicaoNumero} onChange={e => setForm(f => ({ ...f, medicaoNumero: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cliente</Label>
                <Input value={form.clienteNome} onChange={e => setForm(f => ({ ...f, clienteNome: e.target.value }))} />
              </div>
              <div>
                <Label>Data de Vencimento</Label>
                <Input type="date" value={form.dataVencimento} onChange={e => setForm(f => ({ ...f, dataVencimento: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor da Medição (R$) *</Label>
                <Input type="number" step="0.01" value={form.valorMedicao} onChange={e => setForm(f => ({ ...f, valorMedicao: e.target.value }))} />
              </div>
              <div>
                <Label>% Medição</Label>
                <Input type="number" step="0.01" value={form.percentualMedicao} onChange={e => setForm(f => ({ ...f, percentualMedicao: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">Retenções Tributárias</Label>
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">ISS (R$)</Label><Input type="number" step="0.01" value={form.retencaoISS} onChange={e => setForm(f => ({ ...f, retencaoISS: e.target.value }))} /></div>
                <div><Label className="text-xs">INSS (R$)</Label><Input type="number" step="0.01" value={form.retencaoINSS} onChange={e => setForm(f => ({ ...f, retencaoINSS: e.target.value }))} /></div>
                <div><Label className="text-xs">IR (R$)</Label><Input type="number" step="0.01" value={form.retencaoIR} onChange={e => setForm(f => ({ ...f, retencaoIR: e.target.value }))} /></div>
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {createMut.isPending ? "Salvando..." : "Salvar Medição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Avançar Status ── */}
      <Dialog open={!!showUpdate} onOpenChange={v => { if (!v) setShowUpdate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Avançar Status da Medição</DialogTitle>
          </DialogHeader>
          {showUpdate && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 flex items-start gap-3">
                <Building2 className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-gray-800">{showUpdate.obraNome ?? "—"}</p>
                  {showUpdate.clienteNome && <p className="text-xs text-gray-500">{showUpdate.clienteNome}</p>}
                  <p className="text-xl font-bold text-blue-700 mt-1">{fmtBRL(Number(showUpdate.valorMedicao ?? 0))}</p>
                  <p className="text-xs text-gray-400">Status atual: {STATUS_CFG[showUpdate.status]?.label ?? showUpdate.status}</p>
                </div>
              </div>

              <div>
                <Label>Novo Status</Label>
                <Select value={updateForm.status} onValueChange={v => setUpdateForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CFG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {["faturado","a_receber"].includes(updateForm.status) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nº da NF</Label>
                    <Input value={updateForm.nfNumero} onChange={e => setUpdateForm(f => ({ ...f, nfNumero: e.target.value }))} placeholder="Ex: 1234" />
                  </div>
                  <div>
                    <Label>Data Emissão NF</Label>
                    <Input type="date" value={updateForm.nfEmitidaEm} onChange={e => setUpdateForm(f => ({ ...f, nfEmitidaEm: e.target.value }))} />
                  </div>
                </div>
              )}

              {["recebido_total","recebido_parcial"].includes(updateForm.status) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Valor Recebido (R$)</Label>
                    <Input type="number" step="0.01" value={updateForm.valorRecebido}
                      onChange={e => setUpdateForm(f => ({ ...f, valorRecebido: e.target.value }))}
                      placeholder={String(showUpdate.valorMedicao ?? "")} />
                  </div>
                  <div>
                    <Label>Data do Recebimento</Label>
                    <Input type="date" value={updateForm.dataRecebimento} onChange={e => setUpdateForm(f => ({ ...f, dataRecebimento: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdate(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={updateMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {updateMut.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
