import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { removeAccents } from "@/lib/searchUtils";
import {
  ShieldCheck, ShieldAlert, Shield, AlertTriangle, CheckCircle2, XCircle,
  Clock, Plus, Search, Upload, Users, DollarSign, FileText, ChevronDown,
  ChevronUp, RefreshCw, Pencil, Printer, Download, Eye, Ban, X, Loader2,
  ArrowRightLeft, Info,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, { label: string; color: string; Icon: any }> = {
  ativo:                  { label: "Ativo",               color: "bg-green-100 text-green-800",  Icon: CheckCircle2 },
  pendente_inclusao:      { label: "Pendente Inclusão",   color: "bg-blue-100 text-blue-800",    Icon: Clock },
  pendente_cancelamento:  { label: "Pend. Cancelamento",  color: "bg-orange-100 text-orange-800",Icon: AlertTriangle },
  cancelado:              { label: "Cancelado",            color: "bg-slate-100 text-slate-600",  Icon: Ban },
};

const RESULT_STATUS: Record<string, { label: string; color: string; bg: string; Icon: any; desc: string }> = {
  ok:              { label: "OK",               color: "text-green-700",  bg: "bg-green-50 border-green-200",  Icon: CheckCircle2, desc: "Ativo no HR e na lista do corretor" },
  sem_seguro:      { label: "Sem Seguro",       color: "text-red-700",    bg: "bg-red-50 border-red-200",      Icon: ShieldAlert,  desc: "Ativo no HR mas ausente na lista do corretor" },
  pagar_indevido:  { label: "Pagar Indevido",   color: "text-orange-700", bg: "bg-orange-50 border-orange-200",Icon: AlertTriangle,desc: "Na lista do corretor mas não encontrado como ativo no HR" },
  novo:            { label: "Recém-admitido",   color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",    Icon: Clock,        desc: "Admitido há menos de 45 dias — pode estar em carência de inclusão" },
  na_lista_sem_cadastro: { label: "Sem cadastro HR", color: "text-slate-600", bg: "bg-slate-50 border-slate-200", Icon: Info, desc: "Aparece na lista do corretor mas sem funcionário cadastrado" },
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [ano, mes, dia] = d.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-slate-100 text-slate-700", Icon: Shield };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.color}`}>
      <s.Icon className="h-3 w-3" />{s.label}
    </span>
  );
}

// ─── MODAL: Importar Relatório do Corretor ─────────────────────────────────────
function ImportModal({ open, onClose, companyId, companyIds, onSuccess }: {
  open: boolean; onClose: () => void;
  companyId: number; companyIds: number[];
  onSuccess: () => void;
}) {
  const [competencia, setCompetencia] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [nomes, setNomes] = useState("");
  const [apoliceVG, setApoliceVG] = useState("117.398-5");
  const [apoliceAPC, setApoliceAPC] = useState("121.268-3");
  const [resultado, setResultado] = useState<any>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const importar = trpc.seguroVida.importarRelatorio.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      onSuccess();
      toast.success(`Cruzamento concluído: ${data.totalOk} OK, ${data.totalSemSeguro} sem seguro, ${data.totalPagarIndevido} indevido`);
    },
    onError: (e) => toast.error(e.message),
  });

  const linhasFiltradas = useMemo(() => {
    if (!resultado?.resultado) return [];
    if (filtroStatus === "todos") return resultado.resultado;
    return resultado.resultado.filter((r: any) => r.status === filtroStatus);
  }, [resultado, filtroStatus]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setResultado(null); }}}>
      <DialogContent className="flex flex-col p-0 gap-0 w-[900px] max-w-[95vw] max-h-[90vh]">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
            Importar Relatório do Corretor — Cruzamento Automático
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {!resultado ? (
            <>
              <p className="text-sm text-muted-foreground">
                Cole abaixo o texto extraído do PDF do corretor. O sistema vai cruzar automaticamente os nomes com os funcionários CLT ativos.
              </p>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Competência</label>
                  <Input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Apólice VG</label>
                  <Input value={apoliceVG} onChange={e => setApoliceVG(e.target.value)} placeholder="117.398-5" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">Apólice APC</label>
                  <Input value={apoliceAPC} onChange={e => setApoliceAPC(e.target.value)} placeholder="121.268-3" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">
                  Lista de Segurados (copie e cole o conteúdo do PDF)
                </label>
                <Textarea
                  value={nomes}
                  onChange={e => setNomes(e.target.value)}
                  placeholder={"00000000784       ACACIO LESCURA DE CAMARGO\n00000000971       ADRIANO PAZ FERREIRA\n..."}
                  className="font-mono text-xs min-h-[200px]"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Cole o conteúdo do PDF — o sistema extrai automaticamente o número de item e o nome completo de cada linha.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Cards de resumo */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Na lista do corretor", val: resultado.totalSeguradosCorretora, color: "text-slate-700" },
                  { label: "✅ OK (presentes em ambos)", val: resultado.totalOk, color: "text-green-700" },
                  { label: "🔴 Sem Seguro (urgente!)", val: resultado.totalSemSeguro, color: "text-red-700" },
                  { label: "🟡 Pagamento indevido", val: resultado.totalPagarIndevido, color: "text-orange-700" },
                ].map((c, i) => (
                  <div key={i} className="p-3 bg-slate-50 border rounded-lg text-center">
                    <p className={`text-2xl font-bold ${c.color}`}>{c.val}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{c.label}</p>
                  </div>
                ))}
              </div>

              {(resultado.totalSemSeguro > 0 || resultado.totalPagarIndevido > 0) && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    {resultado.totalSemSeguro > 0 && <><strong>{resultado.totalSemSeguro} funcionário(s) SEM SEGURO</strong> — contate o corretor imediatamente para inclusão. </>}
                    {resultado.totalPagarIndevido > 0 && <><strong>{resultado.totalPagarIndevido} segurado(s) com pagamento INDEVIDO</strong> — verifique se foram demitidos e solicite exclusão.</>}
                  </span>
                </div>
              )}

              {/* Filtro */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Mostrar:</span>
                {["todos", "sem_seguro", "pagar_indevido", "ok", "novo"].map(s => (
                  <button key={s} onClick={() => setFiltroStatus(s)}
                    className={cn("text-xs px-3 py-1 rounded-full border font-medium transition-colors",
                      filtroStatus === s ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 hover:bg-slate-50")}>
                    {s === "todos" ? `Todos (${resultado.resultado.length})` : `${RESULT_STATUS[s]?.label} (${resultado.resultado.filter((r: any) => r.status === s).length})`}
                  </button>
                ))}
              </div>

              {/* Tabela de resultado */}
              <div className="border rounded-lg overflow-auto max-h-[350px]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Nome no HR</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Nome na Lista</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {linhasFiltradas.map((r: any, i: number) => {
                      const st = RESULT_STATUS[r.status] ?? RESULT_STATUS.ok;
                      return (
                        <tr key={i} className={cn("transition-colors", r.status === "sem_seguro" ? "bg-red-50" : r.status === "pagar_indevido" ? "bg-orange-50" : r.status === "novo" ? "bg-blue-50" : "")}>
                          <td className="px-3 py-2">
                            <span className={cn("flex items-center gap-1 font-semibold", st.color)}>
                              <st.Icon className="h-3 w-3" />{st.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium">{r.nomeHR ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-500">{r.nome}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{r.item || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-slate-50 shrink-0">
          {!resultado ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => importar.mutate({ companyId, companyIds, competencia, nomesBrutos: nomes, apoliceVG, apoliceAPC })}
                disabled={importar.isPending || !nomes.trim() || !competencia}>
                {importar.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</> : <><ArrowRightLeft className="h-4 w-4 mr-2" />Cruzar com Funcionários</>}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => { setResultado(null); setNomes(""); }}>
              <RefreshCw className="h-4 w-4 mr-2" />Nova Importação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MODAL: Seed inicial com a lista do corretor ───────────────────────────────
function SeedModal({ open, onClose, companyId, companyIds, onSuccess }: {
  open: boolean; onClose: () => void;
  companyId: number; companyIds: number[];
  onSuccess: () => void;
}) {
  const [nomes, setNomes] = useState("");
  const [apoliceVG, setApoliceVG] = useState("117.398-5");
  const [apoliceAPC, setApoliceAPC] = useState("121.268-3");
  const [dataAdesao, setDataAdesao] = useState("2026-04-01");

  const seed = trpc.seguroVida.seedFromRelatorio.useMutation({
    onSuccess: (d) => {
      toast.success(`${d.inseridos} de ${d.total} segurados importados como coberturas ativas!`);
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="w-[600px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            Carga Inicial — Lista do Corretor
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Faça a carga inicial colando a lista do corretor. Todos os nomes serão cadastrados como coberturas ativas. Use apenas uma vez para popular o sistema.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block">Data de Adesão</label>
              <Input type="date" value={dataAdesao} onChange={e => setDataAdesao(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Apólice VG</label>
              <Input value={apoliceVG} onChange={e => setApoliceVG(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">Apólice APC</label>
              <Input value={apoliceAPC} onChange={e => setApoliceAPC(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block">Lista de Segurados (cole o PDF)</label>
            <Textarea value={nomes} onChange={e => setNomes(e.target.value)} className="font-mono text-xs min-h-[180px]"
              placeholder={"00000000784       ACACIO LESCURA DE CAMARGO\n00000000971       ADRIANO PAZ FERREIRA\n..."} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => seed.mutate({ companyId, companyIds, nomesBrutos: nomes, apoliceVG, apoliceAPC, dataAdesao })}
            disabled={seed.isPending || !nomes.trim()}>
            {seed.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</> : <><Upload className="h-4 w-4 mr-2" />Importar como Ativos</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SeguroVida() {
  const { selectedCompanyId, isConstrutoras, getCompanyIdsForQuery } = useCompany();
  const companyId = Number(selectedCompanyId) || 0;
  const companyIds = getCompanyIdsForQuery();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin_master";

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showImport, setShowImport] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [tabAtiva, setTabAtiva] = useState<"cobertura" | "historico">("cobertura");
  const [detailImport, setDetailImport] = useState<any>(null);

  const utils = trpc.useUtils();

  const resumoQ = trpc.seguroVida.getResumo.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const coberturasQ = trpc.seguroVida.listarCoberturas.useQuery(
    { companyId, companyIds },
    { enabled: companyId > 0 || companyIds.length > 0 }
  );

  const importacoesQ = trpc.seguroVida.listarImportacoes.useQuery(
    { companyId, companyIds },
    { enabled: (companyId > 0 || companyIds.length > 0) && tabAtiva === "historico" }
  );

  const cancelar = trpc.seguroVida.cancelarCobertura.useMutation({
    onSuccess: () => { toast.success("Cobertura cancelada"); utils.seguroVida.listarCoberturas.invalidate(); utils.seguroVida.getResumo.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const resumo = resumoQ.data;
  const coberturas = coberturasQ.data ?? [];

  const filtradas = useMemo(() => {
    let lista = coberturas;
    if (filtroStatus !== "todos") lista = lista.filter((c: any) => c.status === filtroStatus);
    if (busca.trim()) {
      const b = removeAccents(busca.toLowerCase());
      lista = lista.filter((c: any) =>
        removeAccents((c.nome_completo ?? "").toLowerCase()).includes(b) ||
        (c.cargo ?? "").toLowerCase().includes(b) ||
        (c.item_segurador ?? "").includes(b)
      );
    }
    return lista;
  }, [coberturas, filtroStatus, busca]);

  const invalidate = () => {
    utils.seguroVida.listarCoberturas.invalidate();
    utils.seguroVida.getResumo.invalidate();
    utils.seguroVida.listarImportacoes.invalidate();
  };

  // ── Impressão ──
  const handlePrint = () => {
    const linhas = filtradas.map((c: any) => {
      const s = STATUS_LABELS[c.status]?.label ?? c.status;
      return `<tr><td>${c.nome_completo ?? "—"}</td><td>${c.cargo ?? "—"}</td><td>${s}</td><td>${c.item_segurador ?? "—"}</td><td>${fmtDate(c.data_adesao)}</td><td>${c.apolice_vg ?? "—"}</td></tr>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Seguro de Vida</title><style>body{font-family:Arial,sans-serif;font-size:11px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:4px 6px;}th{background:#eee;font-weight:bold;}h2{margin-bottom:4px;}</style></head><body>
      <h2>Seguro de Vida — Relação de Segurados</h2>
      <p>Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")} | Total: ${filtradas.length} registros</p>
      <table><thead><tr><th>Nome</th><th>Cargo</th><th>Status</th><th>Item</th><th>Adesão</th><th>Apólice VG</th></tr></thead><tbody>${linhas}</tbody></table>
      </body></html>`);
    w.document.close();
    w.print();
  };

  // ── Cards ──
  const cards = [
    { label: "Segurados Ativos",       val: resumo?.totalSeguradosAtivos ?? 0,      icon: ShieldCheck,  color: "text-green-700",  bg: "bg-green-50 border-green-200" },
    { label: "Pend. Inclusão",         val: resumo?.totalPendenteInclusao ?? 0,     icon: Clock,        color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
    { label: "Pend. Cancelamento",     val: resumo?.totalPendenteCancelamento ?? 0, icon: AlertTriangle,color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
    { label: "CLT sem Cobertura ⚠️",  val: resumo?.totalSemSeguro ?? 0,            icon: ShieldAlert,  color: "text-red-700",    bg: "bg-red-50 border-red-200" },
  ];

  return (
    <DashboardLayout title="Seguro de Vida">
      <div className="space-y-5">

        {/* Aviso importante */}
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <strong>Trabalhar sem Seguro de Vida é estritamente proibido.</strong> Todo funcionário CLT deve ter cobertura ativa desde o primeiro dia de trabalho.
            Pela convenção coletiva, é obrigação da FC Engenharia manter o seguro vigente para todos os colaboradores.
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.label} className={cn("p-4 rounded-lg border flex flex-col gap-1", c.bg)}>
              <div className="flex items-center gap-2">
                <c.icon className={cn("h-5 w-5", c.color)} />
                <span className="text-xs font-semibold text-slate-500">{c.label}</span>
              </div>
              <p className={cn("text-3xl font-bold", c.color)}>{c.val}</p>
            </div>
          ))}
        </div>

        {/* Informação da última importação */}
        {resumo?.ultimaImportacao && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 border rounded-lg text-sm text-slate-700">
            <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
            <span>
              Última validação: <strong>{resumo.ultimaImportacao.competencia}</strong> em {fmtDate(resumo.ultimaImportacao.data_importacao?.split("T")[0])} —
              {resumo.ultimaImportacao.total_segurados} segurados na lista do corretor,
              {resumo.ultimaImportacao.total_sem_seguro > 0
                ? <span className="text-red-700 font-bold"> {resumo.ultimaImportacao.total_sem_seguro} sem seguro!</span>
                : " ✅ sem divergências"
              }
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b flex gap-0">
          {(["cobertura", "historico"] as const).map(t => (
            <button key={t} onClick={() => setTabAtiva(t)}
              className={cn("px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tabAtiva === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t === "cobertura" ? `Coberturas Ativas` : "Histórico de Importações"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-1">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowSeed(true)}>
                <Upload className="h-4 w-4 mr-1.5" />Carga Inicial
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" />Imprimir
            </Button>
            <Button size="sm" onClick={() => setShowImport(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <ArrowRightLeft className="h-4 w-4 mr-1.5" />Importar Relatório do Corretor
            </Button>
          </div>
        </div>

        {tabAtiva === "cobertura" && (
          <>
            {/* Filtros */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-64" placeholder="Buscar por nome, cargo ou item..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status ({coberturas.length})</SelectItem>
                  <SelectItem value="ativo">✅ Ativos</SelectItem>
                  <SelectItem value="pendente_inclusao">🔵 Pendente Inclusão</SelectItem>
                  <SelectItem value="pendente_cancelamento">🟡 Pendente Cancelamento</SelectItem>
                  <SelectItem value="cancelado">⚫ Cancelados</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{filtradas.length} de {coberturas.length} registros</span>
            </div>

            {/* Tabela */}
            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Nome</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Cargo</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Status</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Item Segurador</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Apólice VG</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Data Adesão</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600 text-xs">Data Cancel.</th>
                    <th className="px-3 py-2.5 text-xs"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {coberturasQ.isLoading ? (
                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">Carregando...</td></tr>
                  ) : filtradas.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                      {coberturas.length === 0
                        ? "Nenhuma cobertura cadastrada. Use o botão 'Carga Inicial' para importar a lista do corretor."
                        : "Nenhum resultado para os filtros aplicados."}
                    </td></tr>
                  ) : filtradas.map((c: any) => (
                    <tr key={c.id} className={cn("hover:bg-slate-50 transition-colors",
                      c.status === "pendente_cancelamento" ? "bg-orange-50/50" : c.status === "pendente_inclusao" ? "bg-blue-50/50" : "")}>
                      <td className="px-3 py-2.5 font-medium">{c.nome_completo}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{c.cargo || "—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{c.item_segurador || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{c.apolice_vg || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.data_adesao)}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.data_cancelamento)}</td>
                      <td className="px-3 py-2.5">
                        {isAdmin && c.status !== "cancelado" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => { if (confirm(`Cancelar cobertura de ${c.nome_completo}?`)) cancelar.mutate({ companyId, coberturaId: c.id }); }}>
                            <Ban className="h-3.5 w-3.5 mr-1" />Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tabAtiva === "historico" && (
          <div className="space-y-3">
            {importacoesQ.isLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">Carregando histórico...</div>
            ) : (importacoesQ.data ?? []).length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                Nenhuma importação realizada ainda. Use o botão "Importar Relatório do Corretor" para iniciar.
              </div>
            ) : (importacoesQ.data ?? []).map((imp: any) => (
              <div key={imp.id} className="border rounded-lg p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => setDetailImport(detailImport?.id === imp.id ? null : imp)}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-indigo-500" />
                    <div>
                      <p className="font-semibold text-sm">Competência {imp.competencia}</p>
                      <p className="text-xs text-muted-foreground">
                        Importado em {fmtDate(imp.data_importacao?.split("T")[0])} por {imp.importado_por || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-0.5 bg-slate-100 rounded font-mono">{imp.total_segurados} na lista</span>
                    <span className={cn("px-2 py-0.5 rounded font-semibold", imp.total_sem_seguro > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                      {imp.total_sem_seguro > 0 ? `${imp.total_sem_seguro} sem seguro` : "✅ Sem divergências"}
                    </span>
                    {imp.total_pagar_indevido > 0 && (
                      <span className="px-2 py-0.5 rounded font-semibold bg-orange-100 text-orange-700">{imp.total_pagar_indevido} indevido</span>
                    )}
                    {detailImport?.id === imp.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                </div>

                {detailImport?.id === imp.id && imp.json_resultado && (
                  <div className="mt-4 border rounded overflow-auto max-h-[300px]">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Nome HR</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Nome Corretor</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Item</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(typeof imp.json_resultado === "string" ? JSON.parse(imp.json_resultado) : imp.json_resultado)
                          .filter((r: any) => r.status !== "ok")
                          .map((r: any, i: number) => {
                            const st = RESULT_STATUS[r.status] ?? RESULT_STATUS.ok;
                            return (
                              <tr key={i} className={cn(r.status === "sem_seguro" ? "bg-red-50" : r.status === "pagar_indevido" ? "bg-orange-50" : "")}>
                                <td className="px-3 py-1.5"><span className={cn("font-semibold", st.color)}>{st.label}</span></td>
                                <td className="px-3 py-1.5">{r.nomeHR ?? "—"}</td>
                                <td className="px-3 py-1.5 text-slate-500">{r.nome}</td>
                                <td className="px-3 py-1.5 font-mono text-slate-400">{r.item || "—"}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modais */}
      <ImportModal open={showImport} onClose={() => setShowImport(false)} companyId={companyId} companyIds={companyIds} onSuccess={invalidate} />
      {isAdmin && <SeedModal open={showSeed} onClose={() => setShowSeed(false)} companyId={companyId} companyIds={companyIds} onSuccess={invalidate} />}
    </DashboardLayout>
  );
}
