import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import FullScreenDialog from "@/components/FullScreenDialog";
import { PersonPhoto } from "@/components/PersonPhoto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Receipt, Plus, Search, CheckCircle, XCircle, Clock, Upload, FileText, Eye, Store, ChevronLeft, ChevronRight, Calendar, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// Rev. 4710 — regra de ouro: dinheiro em formato BR (1.234,56) em toda tela
const moedaBRMask = (raw: string): string => {
  const d = String(raw || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!d) return "";
  const cents = d.padStart(3, "0");
  return `${Number(cents.slice(0, -2)).toLocaleString("pt-BR")},${cents.slice(-2)}`;
};
const moedaBRFromDb = (v: any): string => {
  const n = parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtBRL = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v || "0") : Number(v || 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Detecta a competência (mês/ano) cujo ciclo 16→15 cai sobre `dataFim`
function competenciaDoFim(dataFim: string): { ano: number; mes: number } {
  const [y, m] = dataFim.split("-").map(Number);
  return { ano: y, mes: m };
}

// Aplica o ciclo 16→15 do mês/ano selecionado:
//   competência Mai/2026 → 16/04/2026 a 15/05/2026
function ciclo16a15(ano: number, mes: number): { inicio: string; fim: string } {
  const fim = new Date(ano, mes - 1, 15);
  const inicio = new Date(ano, mes - 2, 16);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { inicio: fmt(inicio), fim: fmt(fim) };
}

// Calcula a competência do desconto a partir da data da compra.
// Regra (mesma do servidor em `parceiros.lancamentos.create`):
//   dia <= 15 → competência = mês da compra
//   dia >= 16 → competência = mês seguinte
function calcCompetenciaDesconto(dataCompra?: string | null): string | null {
  if (!dataCompra) return null;
  const m = dataCompra.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Valida data civil real (rejeita 2026-02-31 etc.)
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  if (d >= 16) {
    mo += 1;
    if (mo > 12) { mo = 1; y += 1; }
  }
  return `${String(mo).padStart(2, "0")}/${y}`;
}

// Período padrão estilo folha: dia 16 do mês anterior até dia 15 do mês atual
function periodoPadrao() {
  const hoje = new Date();
  const dia = hoje.getDate();
  // Se hoje <= 15, o ciclo vigente é do dia 16 do penúltimo mês ao dia 15 do mês atual.
  // Se hoje >= 16, o ciclo vigente é do dia 16 do mês atual ao dia 15 do próximo mês.
  let inicio: Date, fim: Date;
  if (dia <= 15) {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 16);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 15);
  } else {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 16);
    fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 15);
  }
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { inicio: fmt(inicio), fim: fmt(fim) };
}

function formatBR(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

export default function LancamentosParceiros() {
  const { user } = useAuth();
  const { selectedCompanyId: selCompId } = useCompany();
  const companyId = selCompId ? parseInt(selCompId) : undefined;
  const padrao = periodoPadrao();
  const [dataInicio, setDataInicio] = useState(padrao.inicio);
  const [dataFim, setDataFim] = useState(padrao.fim);
  const [filterParceiro, setFilterParceiro] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [busca, setBusca] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({});
  const [arquivoNovo, setArquivoNovo] = useState<File | null>(null);
  const [editLanc, setEditLanc] = useState<any | null>(null);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);

  const { data: lancamentos = [], refetch } = trpc.parceiros.lancamentos.list.useQuery(
    { companyId: companyId ?? 0, dataInicio, dataFim, parceiroId: filterParceiro !== "all" ? parseInt(filterParceiro) : undefined },
    { enabled: !!companyId }
  );

  // Query auxiliar: TODOS os lançamentos do ano selecionado (para colorir meses com dados)
  const compSel = competenciaDoFim(dataFim);
  const anoIni = `${compSel.ano - 1}-12-16`;   // ciclo Jan/anoSel começa em 16/12/(ano-1)
  const anoFim = `${compSel.ano}-12-15`;       // ciclo Dez/anoSel termina em 15/12/(ano)
  const { data: lancamentosAno = [] } = trpc.parceiros.lancamentos.list.useQuery(
    { companyId: companyId ?? 0, dataInicio: anoIni, dataFim: anoFim },
    { enabled: !!companyId }
  );
  const resumoPorMes = useMemo(() => {
    // Mapa mes (1..12) → { qtd, total, statuses }
    const mapa = new Map<number, { qtd: number; total: number; pend: number; aprov: number; rej: number }>();
    for (const l of lancamentosAno as any[]) {
      const iso = String(l.dataCompra || "").slice(0, 10);
      if (!iso) continue;
      const [yS, mS, dS] = iso.split("-");
      let y = Number(yS); let m = Number(mS); const d = Number(dS);
      // Ciclo 16→15: dia ≥ 16 vira competência do mês seguinte
      if (d >= 16) { m += 1; if (m > 12) { m = 1; y += 1; } }
      if (y !== compSel.ano) continue;
      const cur = mapa.get(m) || { qtd: 0, total: 0, pend: 0, aprov: 0, rej: 0 };
      cur.qtd += 1;
      cur.total += parseFloat(l.valor || "0");
      if (l.status === "pendente") cur.pend += 1;
      else if (l.status === "aprovado") cur.aprov += 1;
      else if (l.status === "rejeitado") cur.rej += 1;
      mapa.set(m, cur);
    }
    return mapa;
  }, [lancamentosAno, compSel.ano]);
  const { data: parceiros = [] } = trpc.parceiros.cadastro.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const { data: colaboradores = [] } = trpc.employees.list.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId }
  );
  const parceirosPorId = useMemo(
    () => new Map((parceiros as any[]).map((parceiro: any) => [Number(parceiro.id), parceiro])),
    [parceiros]
  );
  const colaboradoresPorId = useMemo(
    () => new Map((colaboradores as any[]).map((colaborador: any) => [Number(colaborador.id), colaborador])),
    [colaboradores]
  );
  const getParceiroNome = (id: number) => {
    const p: any = parceirosPorId.get(Number(id));
    return p ? p.nomeFantasia || p.razaoSocial : "—";
  };
  const getColaboradorNome = (id: number) => {
    const c: any = colaboradoresPorId.get(Number(id));
    return c ? c.nomeCompleto || c.nome : "—";
  };
  const createMut = trpc.parceiros.lancamentos.create.useMutation({
    onError: (e) => toast.error(`Erro ao registrar: ${e.message}`),
  });
  const editMut = trpc.parceiros.lancamentos.editarLancamento.useMutation({
    onSuccess: () => { refetch(); setEditLanc(null); toast.success("Lançamento atualizado!"); },
    onError: (e) => toast.error(`Erro ao editar: ${e.message}`),
  });
  const delMut = trpc.parceiros.lancamentos.excluirLancamento.useMutation({
    onSuccess: () => { refetch(); setConfirmDel(null); setEditLanc(null); toast.success("Lançamento excluído!"); },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });
  const aprovarMut = trpc.parceiros.lancamentos.aprovar.useMutation({
    onSuccess: () => { refetch(); toast.success("Lançamento atualizado!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
  const uploadMut = trpc.parceiros.lancamentos.uploadComprovante.useMutation({
    onSuccess: () => { refetch(); toast.success("Comprovante enviado!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const filtered = useMemo(() => {
    let list = lancamentos;
    if (filterStatus !== "all") list = list.filter((l: any) => l.status === filterStatus);
    const q = busca.trim().toLowerCase();
    if (q) {
      list = list.filter((l: any) => {
        const nomeColab = (getColaboradorNome(l.employeeId) || "").toLowerCase();
        const nomeParc = (getParceiroNome(l.parceiroConveniadoId) || "").toLowerCase();
        const desc = (l.descricaoItens || "").toLowerCase();
        return nomeColab.includes(q) || nomeParc.includes(q) || desc.includes(q);
      });
    }
    return list;
  }, [lancamentos, filterStatus, busca, colaboradores, parceiros]);

  const totalAprovado = useMemo(() => {
    return lancamentos.filter((l: any) => l.status === "aprovado").reduce((acc: number, l: any) => acc + parseFloat(l.valor || "0"), 0);
  }, [lancamentos]);

  const totalPendente = useMemo(() => {
    return lancamentos.filter((l: any) => l.status === "pendente").reduce((acc: number, l: any) => acc + parseFloat(l.valor || "0"), 0);
  }, [lancamentos]);

  const openNew = () => {
    setForm({ companyId: companyId ?? 0, dataCompra: new Date().toISOString().split("T")[0] });
    setArquivoNovo(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.parceiroConveniadoId || !form.employeeId || !form.valor) {
      toast.error("Parceiro, Colaborador e Valor são obrigatórios");
      return;
    }
    if (!arquivoNovo) {
      toast.error("Comprovante é OBRIGATÓRIO para garantir a veracidade do desconto.");
      return;
    }
    try {
      const res = await createMut.mutateAsync(form);
      // Upload do comprovante (obrigatório)
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          await uploadMut.mutateAsync({
            lancamentoId: res.id,
            fileName: arquivoNovo.name,
            fileBase64: base64,
            contentType: arquivoNovo.type,
          });
          refetch();
          setShowForm(false);
          setArquivoNovo(null);
          toast.success("Lançamento + comprovante registrados!");
        } catch (e: any) {
          toast.error(`Lançamento criado, mas falhou o envio do comprovante: ${e?.message || e}`);
        }
      };
      reader.readAsDataURL(arquivoNovo);
    } catch (e) {
      // create error já notificado via onError
    }
  };

  const handleSaveEdit = () => {
    if (!editLanc) return;
    editMut.mutate({
      id: editLanc.id,
      employeeId: editLanc.employeeId,
      dataCompra: editLanc.dataCompra,
      descricaoItens: editLanc.descricaoItens || "",
      valor: String(editLanc.valor),
    });
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
              <p className="text-sm text-muted-foreground">{lancamentos.length} lançamento(s) — período {formatBR(dataInicio)} a {formatBR(dataFim)}</p>
            </div>
          </div>
          <Button onClick={openNew} className="bg-purple-500 hover:bg-purple-600">
            <Plus className="h-4 w-4 mr-1" /> Novo Lançamento
          </Button>
        </div>

        {/* Seletor de Competência (Ano + Meses) */}
        {(() => {
          const comp = competenciaDoFim(dataFim);
          const hoje = new Date();
          const isMesAtual = (m: number) => comp.ano === hoje.getFullYear() && m === hoje.getMonth() + 1;
          const isSelecionado = (m: number) => m === comp.mes;
          return (
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { const p = ciclo16a15(comp.ano - 1, comp.mes); setDataInicio(p.inicio); setDataFim(p.fim); }}
                    className="p-1 rounded hover:bg-muted"
                    title="Ano anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-bold text-base flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-purple-500" />
                    {comp.ano}
                  </span>
                  <button
                    type="button"
                    onClick={() => { const p = ciclo16a15(comp.ano + 1, comp.mes); setDataInicio(p.inicio); setDataFim(p.fim); }}
                    className="p-1 rounded hover:bg-muted"
                    title="Próximo ano"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">
                  Competência: ciclo 16/{String(((comp.mes - 2 + 12) % 12) + 1).padStart(2, "0")} a 15/{String(comp.mes).padStart(2, "0")}/{comp.ano}
                </span>
              </div>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {MESES_ABREV.map((nome, i) => {
                  const m = i + 1;
                  const sel = isSelecionado(m);
                  const atual = isMesAtual(m);
                  const info = resumoPorMes.get(m);
                  const temDados = !!info && info.qtd > 0;
                  // Cor do mês com base no mix de status
                  let corClasse = "bg-card text-foreground border-border hover:bg-muted";
                  if (sel) {
                    corClasse = "bg-purple-500 text-white border-purple-600 ring-2 ring-purple-300";
                  } else if (temDados) {
                    if (info!.rej > 0) {
                      corClasse = "bg-red-50 text-red-700 border-red-300 hover:bg-red-100";
                    } else if (info!.pend > 0) {
                      corClasse = "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100";
                    } else {
                      corClasse = "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100";
                    }
                  } else if (atual) {
                    corClasse = "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100";
                  }
                  const tooltip = temDados
                    ? `${nome}/${comp.ano}: ${info!.qtd} lanç. — ${fmtBRL(info!.total)} ` +
                      `(✓${info!.aprov} ⏳${info!.pend} ✗${info!.rej})`
                    : `Competência ${nome}/${comp.ano} (sem lançamentos)`;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { const p = ciclo16a15(comp.ano, m); setDataInicio(p.inicio); setDataFim(p.fim); }}
                      className={`relative px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${corClasse}`}
                      title={tooltip}
                    >
                      {nome}
                      {temDados && !sel && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-purple-600 text-white text-[10px] font-bold flex items-center justify-center shadow">
                          {info!.qtd}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Legenda */}
              <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300"></span>Todos aprovados</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 border border-amber-300"></span>Tem pendente</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 border border-red-300"></span>Tem rejeitado</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500"></span>Selecionado</span>
              </div>
            </div>
          );
        })()}

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-40" />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { const p = periodoPadrao(); setDataInicio(p.inicio); setDataFim(p.fim); }}
          >
            Período atual (16 a 15)
          </Button>
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
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome do colaborador, parceiro ou item..."
                className="pl-8"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                  title="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card rounded-lg border p-3 text-center">
            <span className="text-lg font-bold text-foreground">{lancamentos.length}</span>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
            <span className="text-lg font-bold text-amber-600">{fmtBRL(totalPendente)}</span>
            <p className="text-xs text-amber-700">Pendentes</p>
          </div>
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
            <span className="text-lg font-bold text-emerald-600">{fmtBRL(totalAprovado)}</span>
            <p className="text-xs text-emerald-700">Aprovados</p>
          </div>
          <div className="bg-purple-50 rounded-lg border border-purple-200 p-3 text-center">
            <span className="text-lg font-bold text-purple-600">{fmtBRL(totalAprovado + totalPendente)}</span>
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
            filtered.map((l: any) => {
              const colaborador: any = colaboradoresPorId.get(Number(l.employeeId));
              const colaboradorNome = getColaboradorNome(l.employeeId);
              return (
                <div
                  key={l.id}
                  className="bg-card rounded-xl border p-4 hover:border-purple-300 hover:shadow-sm cursor-pointer transition"
                  onClick={() => setEditLanc({ ...l, valor: moedaBRFromDb(l.valor) })}
                  title="Clique para editar / excluir este lançamento"
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0 w-full sm:w-auto">
                      <PersonPhoto
                        src={colaborador?.fotoUrl ?? colaborador?.foto_url ?? null}
                        alt={colaboradorNome}
                        size="md"
                        clickable={false}
                        showZoomHint={false}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground">{colaboradorNome}</h3>
                          {statusBadge(l.status)}
                          {!l.comprovanteUrl && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200">
                              <AlertTriangle className="h-3 w-3" /> Sem comprovante
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Store className="h-3 w-3" />{getParceiroNome(l.parceiroConveniadoId)}</span>
                          <span>Data: {l.dataCompra ? new Date(l.dataCompra).toLocaleDateString("pt-BR") : "—"}</span>
                          <span className="font-semibold text-foreground">{fmtBRL(l.valor)}</span>
                        </div>
                        {l.descricaoItens && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{l.descricaoItens}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      {l.comprovanteUrl && (
                        <a href={l.comprovanteUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline"><FileText className="h-3.5 w-3.5 mr-1" /> Ver</Button>
                        </a>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleUpload(l.id)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Comprovante
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditLanc({ ...l, valor: moedaBRFromDb(l.valor) })}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDel(l)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                      </Button>
                      {l.status === "pendente" && (
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
              );
            })
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
                    {parceiros.filter((p: any) => p.status === "ativo").map((p: any) => (
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
                    {colaboradores.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.nomeCompleto || c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data da Compra</Label>
                <Input type="date" value={form.dataCompra || ""} onChange={(e) => setForm({ ...form, dataCompra: e.target.value })} />
                {(() => {
                  const comp = calcCompetenciaDesconto(form.dataCompra);
                  if (!comp) return null;
                  return (
                    <p className="text-xs text-muted-foreground mt-1" data-testid="text-competencia-desconto">
                      Competência do desconto: <span className="font-medium text-foreground">{comp}</span>
                    </p>
                  );
                })()}
              </div>
              <div><Label>Valor (R$) *</Label><Input inputMode="numeric" value={form.valor || ""} onChange={(e) => setForm({ ...form, valor: moedaBRMask(e.target.value) })} placeholder="0,00" /></div>
            </div>
            <div><Label>Descrição dos Itens</Label><Textarea value={form.descricaoItens || ""} onChange={(e) => setForm({ ...form, descricaoItens: e.target.value })} rows={3} placeholder="Descreva os itens comprados..." /></div>
            <div><Label>Observações</Label><Textarea value={form.observacoes || ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} /></div>

            {/* Comprovante OBRIGATÓRIO */}
            <div className="border-2 border-dashed border-red-300 bg-red-50/50 rounded-lg p-4 space-y-2">
              <Label className="flex items-center gap-1 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Comprovante de compra * (OBRIGATÓRIO — garante a veracidade do desconto em folha)
              </Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setArquivoNovo(e.target.files?.[0] || null)}
              />
              {arquivoNovo ? (
                <p className="text-xs text-emerald-700 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> {arquivoNovo.name} ({(arquivoNovo.size / 1024).toFixed(1)} KB)
                </p>
              ) : (
                <p className="text-xs text-red-600">Selecione um arquivo (PDF, JPG, PNG ou WEBP).</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => { setShowForm(false); setArquivoNovo(null); }}>Cancelar</Button>
              <Button
                onClick={handleSave}
                className="bg-purple-500 hover:bg-purple-600"
                disabled={createMut.isPending || uploadMut.isPending || !arquivoNovo}
              >
                {createMut.isPending || uploadMut.isPending ? "Salvando..." : "Registrar Lançamento"}
              </Button>
            </div>
          </div>
        </FullScreenDialog>
      )}

      {/* ===== Editar Lançamento ===== */}
      <Dialog open={!!editLanc} onOpenChange={(o) => !o && setEditLanc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-purple-500" /> Editar Lançamento
            </DialogTitle>
            <DialogDescription>
              {editLanc && `${getColaboradorNome(editLanc.employeeId)} — ${getParceiroNome(editLanc.parceiroConveniadoId)}`}
            </DialogDescription>
          </DialogHeader>
          {editLanc && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Colaborador</Label>
                  <Select
                    value={editLanc.employeeId ? String(editLanc.employeeId) : ""}
                    onValueChange={(v) => setEditLanc({ ...editLanc, employeeId: parseInt(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {colaboradores.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.nomeCompleto || c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data da Compra</Label>
                  <Input
                    type="date"
                    value={editLanc.dataCompra ? String(editLanc.dataCompra).slice(0, 10) : ""}
                    onChange={(e) => setEditLanc({ ...editLanc, dataCompra: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    inputMode="numeric"
                    value={editLanc.valor || ""}
                    onChange={(e) => setEditLanc({ ...editLanc, valor: moedaBRMask(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Atual: {fmtBRL(editLanc.valor)}</p>
                </div>
              </div>
              <div>
                <Label>Descrição dos Itens</Label>
                <Textarea
                  rows={3}
                  value={editLanc.descricaoItens || ""}
                  onChange={(e) => setEditLanc({ ...editLanc, descricaoItens: e.target.value })}
                />
              </div>
              {editLanc.comprovanteUrl ? (
                <div className="text-xs">
                  <a href={editLanc.comprovanteUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Ver comprovante atual
                  </a>
                  <Button size="sm" variant="outline" className="ml-2" onClick={() => handleUpload(editLanc.id)}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Substituir comprovante
                  </Button>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 flex items-center justify-between">
                  <span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Este lançamento está sem comprovante.</span>
                  <Button size="sm" variant="outline" onClick={() => handleUpload(editLanc.id)}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Anexar agora
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => setConfirmDel(editLanc)}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditLanc(null)}>Cancelar</Button>
              <Button onClick={handleSaveEdit} disabled={editMut.isPending} className="bg-purple-500 hover:bg-purple-600">
                {editMut.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmar exclusão ===== */}
      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" /> Excluir lançamento?
            </DialogTitle>
            <DialogDescription>
              {confirmDel && (
                <>Esta ação é irreversível. O lançamento de <strong>{getColaboradorNome(confirmDel.employeeId)}</strong> no valor de <strong>{fmtBRL(confirmDel.valor)}</strong> será removido permanentemente.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDel(null)}>Cancelar</Button>
            <Button
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={delMut.isPending}
              onClick={() => confirmDel && delMut.mutate({ id: confirmDel.id })}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {delMut.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
