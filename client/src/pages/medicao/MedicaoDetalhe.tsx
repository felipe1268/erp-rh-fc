import React, { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, Plus, Loader2, FileText, ChevronRight, ChevronDown, CheckCircle2,
  Clock, Send, AlertCircle, DollarSign, Percent, Settings,
  Edit, Trash2, Eye, TrendingUp, Package, Search, ListTree, Hammer, HardHat, Receipt,
  Ruler, Image as ImageIcon,
} from "lucide-react";

const n = (v: unknown) => parseFloat(String(v || "0")) || 0;
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number) {
  return v.toFixed(2) + "%";
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho:  { label: "Rascunho",  color: "bg-gray-100 text-gray-600",    icon: <Edit className="h-3 w-3" /> },
  enviado:   { label: "Enviado",   color: "bg-blue-100 text-blue-700",    icon: <Send className="h-3 w-3" /> },
  aprovado:  { label: "Aprovado",  color: "bg-amber-100 text-amber-700",  icon: <CheckCircle2 className="h-3 w-3" /> },
  finalizado:{ label: "Finalizado",color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.rascunho;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

const PROXIMOS_STATUS: Record<string, { label: string; status: string } | null> = {
  rascunho:  { label: "Marcar como Enviado", status: "enviado" },
  enviado:   { label: "Marcar como Aprovado", status: "aprovado" },
  aprovado:  { label: "Finalizar Medição", status: "finalizado" },
  finalizado: null,
};

export default function MedicaoDetalhe() {
  const params = useParams<{ id: string }>();
  const contratoId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId ? parseInt(selectedCompanyId) : 0;

  const [abaAtiva, setAbaAtiva] = useState("planilha");
  const [modalBoletim, setModalBoletim] = useState(false);
  const [boletimSelecionado, setBoletimSelecionado] = useState<any | null>(null);
  const [modalFd, setModalFd] = useState(false);
  const [modalItens, setModalItens] = useState(false);
  const [editandoContrato, setEditandoContrato] = useState(false);
  const [modalEditBoletim, setModalEditBoletim] = useState(false);
  const [expandedFdBoletimId, setExpandedFdBoletimId] = useState<number | null>(null);
  const [boletimEditando, setBoletimEditando] = useState<any | null>(null);
  const [formEditBoletim, setFormEditBoletim] = useState({ periodoReferencia: "", dataInicio: "", dataFim: "", observacoes: "" });

  const [formBoletim, setFormBoletim] = useState({ periodoReferencia: "", dataInicio: "", dataFim: "", observacoes: "" });
  const [formFd, setFormFd] = useState({ descricao: "", valor: "", dataRegistro: "", origem: "manual", observacoes: "" });
  const [formContrato, setFormContrato] = useState<any>({});
  const [modalVincularFd, setModalVincularFd] = useState(false);

  const utils = trpc.useUtils();

  const { data: contrato, isLoading: loadingContrato } = trpc.medicao.getContrato.useQuery(
    { id: contratoId },
    { enabled: contratoId > 0 }
  );
  const { data: boletins = [], isLoading: loadingBoletins } = trpc.medicao.listarBoletins.useQuery(
    { contratoId },
    { enabled: contratoId > 0 }
  );
  const { data: fdRegistros = [] } = trpc.medicao.listarFdRegistros.useQuery(
    { contratoId },
    { enabled: contratoId > 0 }
  );
  const { data: boletimDetalhe } = trpc.medicao.getBoletim.useQuery(
    { id: boletimSelecionado?.id ?? 0 },
    { enabled: !!boletimSelecionado?.id }
  );
  // Rev. 4026 — OCs de Faturamento Direto (FD) do Painel de Compras, para
  // importar o valor direto num item do boletim (mesma obra do contrato).
  const { data: ocsFdDisponiveis = [], isLoading: loadingOcsFd } = trpc.medicao.listarOcsFdDisponiveis.useQuery(
    { companyId, obraId: contrato?.obraId ?? 0 },
    { enabled: modalVincularFd && !!contrato?.obraId && companyId > 0 }
  );
  const { data: dadosAvancos } = trpc.medicao.getAvancosParaMedicao.useQuery(
    { projetoId: contrato?.projetoId ?? 0, contratoId, boletimId: boletimSelecionado?.id },
    { enabled: !!contrato?.projetoId && contratoId > 0 }
  );
  // Rev. 4025 — `atividades` (cronograma) precisa vir da MESMA revisão usada
  // por `getAvancosParaMedicao` (revisão aprovada), senão os pesos/EAP
  // consultados podem divergir da revisão de onde o avanço físico foi lido.
  // (Itens do Orçamento continuam usados só na aba "Planilha de Medição",
  // via `getPlanilhaMedicao` — não mais na importação do Boletim.)
  const { data: atividades = [] } = trpc.medicao.getAtividadesProjeto.useQuery(
    { projetoId: contrato?.projetoId ?? 0, revisaoId: dadosAvancos?.revisaoId ?? undefined },
    { enabled: !!contrato?.projetoId && dadosAvancos !== undefined }
  );
  const { data: planilhaData, isLoading: loadingPlanilha } = trpc.medicao.getPlanilhaMedicao.useQuery(
    { contratoId, orcamentoId: contrato?.orcamentoId ?? 0, companyId },
    { enabled: contratoId > 0 && !!contrato?.orcamentoId && companyId > 0 }
  );
  const [filtroPlanilha, setFiltroPlanilha] = useState("");
  const [collapsedEap, setCollapsedEap] = useState<Set<string>>(new Set());

  // Rev. 2893 — Levantamento de Campo (medição sobre PDF)
  const { data: campos = [], isLoading: loadingCampos } = trpc.medicao.listarCampos.useQuery(
    { companyId, contratoId },
    { enabled: contratoId > 0 && companyId > 0 }
  );
  const criarCampoMutation = trpc.medicao.criarCampo.useMutation({
    onSuccess: (row: any) => {
      utils.medicao.listarCampos.invalidate({ companyId, contratoId });
      if (row?.id) setLocation(`/medicao/${contratoId}/levantamento/${row.id}`);
    },
  });
  const excluirCampoMutation = trpc.medicao.excluirCampo.useMutation({
    onSuccess: () => utils.medicao.listarCampos.invalidate({ companyId, contratoId }),
  });

  const ultimoBoletimDataFim = useMemo(() => {
    const sorted = [...(boletins as any[])].sort((a: any, b: any) => (b.numero ?? 0) - (a.numero ?? 0));
    return sorted[0]?.dataFim || null;
  }, [boletins]);

  const sugerirDataInicio = () => {
    if (ultimoBoletimDataFim) {
      const d = new Date(ultimoBoletimDataFim + "T12:00:00");
      d.setDate(d.getDate() + 1);
      return d.toISOString().split("T")[0];
    }
    return "";
  };

  const criarBoletimMutation = trpc.medicao.criarBoletim.useMutation({
    onSuccess: (novo) => {
      utils.medicao.listarBoletins.invalidate({ contratoId });
      utils.medicao.getAvancosParaMedicao.invalidate();
      setModalBoletim(false);
      setFormBoletim({ periodoReferencia: "", dataInicio: "", dataFim: "", observacoes: "" });
      setBoletimSelecionado(novo);
      setModalItens(true);
      setAutoImportar(true);
    },
  });

  const avancarStatusMutation = trpc.medicao.avancarStatusBoletim.useMutation({
    onSuccess: () => utils.medicao.listarBoletins.invalidate({ contratoId }),
  });

  const criarFdMutation = trpc.medicao.criarFdRegistro.useMutation({
    onSuccess: () => {
      utils.medicao.listarFdRegistros.invalidate({ contratoId });
      setModalFd(false);
      setFormFd({ descricao: "", valor: "", dataRegistro: "", origem: "manual", observacoes: "" });
    },
  });

  const excluirFdMutation = trpc.medicao.excluirFdRegistro.useMutation({
    onSuccess: () => utils.medicao.listarFdRegistros.invalidate({ contratoId }),
  });

  const editarBoletimMutation = trpc.medicao.editarBoletim.useMutation({
    onSuccess: () => {
      utils.medicao.listarBoletins.invalidate({ contratoId });
      setModalEditBoletim(false);
      setBoletimEditando(null);
    },
  });

  const excluirBoletimMutation = trpc.medicao.excluirBoletim.useMutation({
    onSuccess: () => utils.medicao.listarBoletins.invalidate({ contratoId }),
  });

  const atualizarContratoMutation = trpc.medicao.atualizarContrato.useMutation({
    onSuccess: () => {
      utils.medicao.getContrato.invalidate({ id: contratoId });
      setEditandoContrato(false);
    },
  });

  const salvarItensMutation = trpc.medicao.salvarItensBoletim.useMutation({
    onSuccess: () => {
      utils.medicao.listarBoletins.invalidate({ contratoId });
      utils.medicao.getBoletim.invalidate({ id: boletimSelecionado?.id });
      setModalItens(false);
    },
  });

  const recalcularMutation = trpc.medicao.recalcularDeducoes.useMutation({
    onSuccess: () => {
      utils.medicao.listarBoletins.invalidate({ contratoId });
      utils.medicao.getBoletim.invalidate({ id: boletimSelecionado?.id });
    },
  });

  const [itensEdicao, setItensEdicao] = useState<any[]>([]);
  const [autoImportar, setAutoImportar] = useState(false);

  React.useEffect(() => {
    if (autoImportar && atividades.length > 0 && dadosAvancos) {
      popularItensDoOrcamento();
      setAutoImportar(false);
    }
  }, [autoImportar, atividades, dadosAvancos]);

  function abrirItens(boletim: any) {
    setBoletimSelecionado(boletim);
    setModalItens(true);
  }

  // Rev. 4025 — MEDIÇÃO PASSA A VIR DIRETO DO CRONOGRAMA (avanço físico real),
  // não mais tentando casar item-a-item com o Orçamento por EAP. Causa-raiz do
  // "Nenhum item lançado" / "medição não vem do avanço": o EAP do Orçamento e
  // o EAP do Cronograma (MSP) podem ter numerações/granularidades totalmente
  // diferentes entre si (ex.: orçamento começando em "05.x", cronograma em
  // "01.x", ou cronograma com atividades mais genéricas repetidas por frente)
  // — o casamento por código simplesmente não encontrava par nenhum e o
  // avanço real (visível em "Avanço Semanal"/"Cronograma") nunca chegava na
  // planilha da medição. Cada atividade-folha do cronograma já carrega seu
  // próprio `pesoFinanceiro` (% de participação no valor total do contrato —
  // mesma lógica já usada em "Crono. Financeiro"), então o valor contratual
  // do item = pesoFinanceiro% × valor do contrato de medição, e o % do
  // período vem exatamente do último avanço físico acumulado lançado em
  // "Avanço Semanal" para aquela atividade. Isso garante que toda atividade
  // com avanço registrado apareça aqui automaticamente, na data certa.
  // IMPORTANTE: NÃO filtrar por `eapCodigo` truthy aqui — em cronogramas
  // reais (ex.: VITRA/projeto 44) a maioria das atividades-folha tem
  // eap_codigo vazio (só a seção "Serviços Preliminares" tinha código
  // preenchido; o resto, importado do MSP, veio sem EAP). Exigir EAP
  // preenchido excluiria quase todas as atividades reais do projeto.
  function popularItensDoOrcamento() {
    const leafAtividades = (atividades as any[]).filter((a: any) => !a.isGrupo);
    if (!leafAtividades.length) return;
    const cronograma = dadosAvancos?.avancosCronograma ?? {};
    const jaMedido = dadosAvancos?.acumuladoMedido ?? {};
    const valorContratoTotal = n(contrato?.valorTotalContrato);

    const novos: any[] = [];
    for (const a of leafAtividades) {
      const eap = a.eapCodigo || "";
      const pesoPct = n(a.pesoFinanceiro);
      if (pesoPct <= 0) continue;
      const valContr = (valorContratoTotal * pesoPct) / 100;
      // Rev. 4025 — chave por atividadeId (id real, sempre presente), não por
      // eapCodigo (vazio na maioria das atividades-folha em muitos projetos).
      const avancoCrono = cronograma[a.id] ?? 0;
      const pctAnt = jaMedido[a.id] ?? 0;
      const pctPeriodo = Math.max(0, Math.min(avancoCrono - pctAnt, 100 - pctAnt));

      if (pctPeriodo <= 0 && pctAnt <= 0) continue;

      const pctAcum = Math.min(pctAnt + pctPeriodo, 100);
      const valPeriodo = (valContr * pctPeriodo) / 100;

      novos.push({
        atividadeId: a.id ?? null,
        eapCodigo: eap,
        descricao: a.nome,
        valorContratual: valContr.toFixed(2),
        percentualAcumuladoAnterior: pctAnt.toFixed(4),
        percentualPeriodo: pctPeriodo.toFixed(4),
        percentualAcumuladoAtual: pctAcum.toFixed(4),
        valorPeriodo: valPeriodo.toFixed(2),
        tipoAvanco: "fisico",
        isFd: false,
      });
    }
    setItensEdicao(novos);
  }

  function calcularItem(item: any, field: string, value: string) {
    const updated = { ...item, [field]: value };
    const pctAnt = n(updated.percentualAcumuladoAnterior);
    const pctPer = n(updated.percentualPeriodo);
    const pctAtu = Math.min(pctAnt + pctPer, 100);
    const valContr = n(updated.valorContratual);
    const valPer = (valContr * pctPer) / 100;
    return { ...updated, percentualAcumuladoAtual: pctAtu.toFixed(4), valorPeriodo: valPer.toFixed(2) };
  }

  const totalBruto = useMemo(() =>
    itensEdicao.filter(i => !i.isFd).reduce((acc, i) => acc + n(i.valorPeriodo), 0), [itensEdicao]);
  const totalFdEdicao = useMemo(() =>
    itensEdicao.filter(i => i.isFd).reduce((acc, i) => acc + n(i.valorPeriodo), 0), [itensEdicao]);

  const totalMedido = (boletins as any[]).reduce((acc: number, b: any) =>
    b.status === "finalizado" ? acc + n(b.valorLiquido) : acc, 0);
  const saldoRestante = n(contrato?.valorTotalContrato) - totalMedido;
  const sinalQuitado = (boletins as any[]).reduce((acc: number, b: any) =>
    acc + n(b.descontoSinal), 0);
  const sinalRestante = Math.max(0, n(contrato?.valorSinalRecebido) - sinalQuitado);

  if (loadingContrato) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  if (!contrato) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-gray-400">Contrato não encontrado.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/medicao")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />Voltar
          </Button>
          <div className="h-4 w-px bg-gray-200" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{contrato.nomeProjeto}</h1>
            <p className="text-sm text-gray-500">{contrato.cliente || "—"} {contrato.local ? `· ${contrato.local}` : ""}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setFormContrato({ ...contrato }); setEditandoContrato(true); }} className="gap-1.5">
            <Settings className="h-4 w-4" />Configurações
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Valor do Contrato", value: brl(n(contrato.valorTotalContrato)), icon: DollarSign, color: "text-blue-600" },
            { label: "Total Medido", value: brl(totalMedido), icon: TrendingUp, color: "text-emerald-600" },
            { label: "Saldo Restante", value: brl(saldoRestante), icon: FileText, color: saldoRestante < 0 ? "text-red-600" : "text-gray-700" },
            { label: "Sinal a Descontar", value: brl(sinalRestante), icon: Percent, color: "text-amber-600" },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <card.icon className={`h-4 w-4 ${card.color}`} />
                <span className="text-xs text-gray-500">{card.label}</span>
              </div>
              <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <TabsList>
            <TabsTrigger value="planilha" className="gap-1.5"><ListTree className="h-3.5 w-3.5" />Planilha de Medição</TabsTrigger>
            <TabsTrigger value="boletins">Boletins de Medição</TabsTrigger>
            <TabsTrigger value="fd">Faturamento Direto (FD)</TabsTrigger>
            <TabsTrigger value="levantamento" className="gap-1.5"><Ruler className="h-3.5 w-3.5" />Levantamento de Campo</TabsTrigger>
          </TabsList>

          <TabsContent value="planilha" className="mt-4">
            {loadingPlanilha ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : planilhaData ? (() => {
              const allItens = planilhaData.itens as any[];
              const medMap = planilhaData.medidoMap as Record<string, { pctAcumulado: number; totalMedido: number }>;
              const normEap = (e: string) => e.split(".").map(s => String(parseInt(s, 10))).join(".");

              const childMap: Record<string, boolean> = {};
              allItens.forEach(item => {
                const dot = (item.eapCodigo || "").lastIndexOf(".");
                if (dot > 0) childMap[item.eapCodigo.slice(0, dot)] = true;
              });

              const vcContrato = (planilhaData as any).valorContrato || 0;
              const totalVendaOrc = (planilhaData as any).totalVendaOrc || 0;
              const somaFolhasVenda = allItens.filter((i: any) => !childMap[i.eapCodigo]).reduce((s: number, i: any) => s + n(i.vendaTotal), 0);
              const fatorContrato = somaFolhasVenda > 0 && vcContrato > 0 ? vcContrato / somaFolhasVenda : 1;
              const isMdoContrato = contrato?.tipoContrato === 'mdo';

              const groupTotals: Record<string, { mat: number; mdo: number; venda: number }> = {};
              allItens.forEach(item => {
                if (!childMap[item.eapCodigo]) return;
                const prefix = item.eapCodigo + ".";
                let mat = 0, mdo = 0, venda = 0;
                allItens.forEach(child => {
                  if (!child.eapCodigo.startsWith(prefix)) return;
                  if (childMap[child.eapCodigo]) return;
                  mat += n(child.custoTotalMat) * fatorContrato;
                  mdo += n(child.custoTotalMdo) * fatorContrato;
                  venda += n(child.vendaTotal) * fatorContrato;
                });
                groupTotals[item.eapCodigo] = { mat, mdo, venda };
              });

              const toggleCollapse = (eap: string) => {
                setCollapsedEap(prev => {
                  const next = new Set(prev);
                  next.has(eap) ? next.delete(eap) : next.add(eap);
                  return next;
                });
              };

              const filtro = filtroPlanilha.toLowerCase();
              const matchingCodes = filtro
                ? new Set(
                    allItens
                      .filter((i: any) =>
                        (i.eapCodigo || "").toLowerCase().includes(filtro) ||
                        (i.descricao || "").toLowerCase().includes(filtro)
                      )
                      .flatMap((match: any) => {
                        const ancestors: string[] = [match.eapCodigo];
                        const parts = match.eapCodigo.split(".");
                        for (let k = parts.length - 1; k >= 1; k--) ancestors.push(parts.slice(0, k).join("."));
                        return ancestors;
                      })
                  )
                : null;

              const visibleItems = allItens.filter((item: any, _idx: number) => {
                if (matchingCodes) return matchingCodes.has(item.eapCodigo);
                if (item.nivel === 1) return true;
                const idx = allItens.indexOf(item);
                for (let lvl = item.nivel - 1; lvl >= 1; lvl--) {
                  for (let j = idx - 1; j >= 0; j--) {
                    if (allItens[j].nivel === lvl) {
                      if (collapsedEap.has(allItens[j].eapCodigo)) return false;
                      break;
                    }
                  }
                }
                return true;
              });

              const leafItens = allItens.filter((i: any) => !childMap[i.eapCodigo]);
              let totalContratual = 0, totalMedidoGlobal = 0, totalSaldo = 0, totalMat = 0, totalMdo = 0;
              for (const i of leafItens) {
                const v = n(i.vendaTotal) * fatorContrato;
                const eap = i.eapCodigo || "";
                const med = medMap[eap] || medMap[normEap(eap)];
                const tm = med?.totalMedido ?? 0;
                totalContratual += v;
                totalMedidoGlobal += tm;
                totalSaldo += (v - tm);
                totalMat += n(i.custoTotalMat) * fatorContrato;
                totalMdo += n(i.custoTotalMdo) * fatorContrato;
              }

              const excedeu = totalMedidoGlobal > vcContrato && vcContrato > 0;

              const NIVEL_BG: Record<number, string> = { 1: "bg-slate-200", 2: "bg-slate-100", 3: "bg-slate-50" };

              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 max-w-xs min-w-[200px]">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                      <Input placeholder="Filtrar por Item ou descrição..." className="pl-9" value={filtroPlanilha} onChange={e => setFiltroPlanilha(e.target.value)} />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setCollapsedEap(new Set(Object.keys(childMap)))} className="text-xs">
                      Recolher tudo
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCollapsedEap(new Set())} className="text-xs">
                      Expandir tudo
                    </Button>
                    <div className="flex gap-3 text-xs ml-auto flex-wrap">
                      <span className="text-gray-500">Contratual: <strong className="text-gray-900">{brl(totalContratual)}</strong></span>
                      <span className="text-orange-600"><Hammer className="h-3 w-3 inline mr-0.5" />Mat: <strong>{brl(totalMat)}</strong></span>
                      <span className="text-indigo-600"><HardHat className="h-3 w-3 inline mr-0.5" />MO: <strong>{brl(totalMdo)}</strong></span>
                      <span className="text-emerald-600">Medido: <strong>{brl(totalMedidoGlobal)}</strong></span>
                      <span className="text-amber-600">Saldo: <strong>{brl(totalSaldo)}</strong></span>
                      <span className="text-blue-600">Progresso: <strong>{totalContratual > 0 ? ((totalMedidoGlobal / totalContratual) * 100).toFixed(2) : "0.00"}%</strong></span>
                    </div>
                  </div>
                  {isMdoContrato && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800 flex items-center gap-2">
                      <HardHat className="h-4 w-4 flex-shrink-0" />
                      <span><strong>Contrato de Fornecimento de MDO</strong> — O BDI foi aplicado somente sobre Mão de Obra. Material é referencial para Compras{contrato?.percentualGerenciamentoMaterial && parseFloat(contrato.percentualGerenciamentoMaterial) > 0 ? ` (Taxa de gerenciamento: ${contrato.percentualGerenciamentoMaterial}%)` : ''}. O valor contratual (Valor de Venda) já reflete essa regra.</span>
                    </div>
                  )}
                  {excedeu && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>Total medido ({brl(totalMedidoGlobal)}) <strong>excede</strong> o valor do contrato ({brl(vcContrato)}). Verifique os itens.</span>
                    </div>
                  )}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="overflow-y-auto max-h-[65vh]">
                      <table className="w-full text-xs table-fixed border-collapse">
                        <thead>
                          <tr className="bg-gray-50 sticky top-0 z-10 border-b text-left">
                            <th className="w-[7%] px-2 py-1.5 font-semibold text-gray-600">Item</th>
                            <th className="px-2 py-1.5 font-semibold text-gray-600">Descrição</th>
                            <th className="w-[3.5%] px-1 py-1.5 font-semibold text-gray-600 text-center">Und</th>
                            <th className="w-[5%] px-1 py-1.5 font-semibold text-gray-600 text-right">Qtd</th>
                            <th className="w-[8%] px-1 py-1.5 font-semibold text-gray-600 text-right">V. Unit.</th>
                            <th className="w-[10%] px-1 py-1.5 font-semibold text-gray-600 text-right">V. Contratual</th>
                            <th className="w-[9%] px-1 py-1.5 font-semibold text-orange-700 text-right">Material</th>
                            <th className="w-[9%] px-1 py-1.5 font-semibold text-indigo-700 text-right">M. Obra</th>
                            <th className="w-[5%] px-1 py-1.5 font-semibold text-gray-600 text-right">% Med.</th>
                            <th className="w-[10%] px-1 py-1.5 font-semibold text-gray-600 text-right">V. Medido</th>
                            <th className="w-[9%] px-1 py-1.5 font-semibold text-gray-600 text-right">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleItems.map((i: any) => {
                            const eap = i.eapCodigo || "";
                            const isGroup = !!childMap[eap];
                            const isCollapsed = collapsedEap.has(eap);
                            const gt = groupTotals[eap];
                            const vContr = isGroup ? (gt?.venda || n(i.vendaTotal) * fatorContrato) : n(i.vendaTotal) * fatorContrato;
                            const matVal = isGroup ? (gt?.mat || 0) : n(i.custoTotalMat) * fatorContrato;
                            const mdoVal = isGroup ? (gt?.mdo || 0) : n(i.custoTotalMdo) * fatorContrato;
                            const med = medMap[eap] || medMap[normEap(eap)];
                            const pctMed = med?.pctAcumulado ?? 0;
                            const vMed = med?.totalMedido ?? 0;
                            const saldo = vContr - vMed;
                            const nivelBg = NIVEL_BG[i.nivel] || "";
                            return (
                              <tr
                                key={i.id}
                                className={`border-b border-gray-100 ${isGroup ? `${nivelBg} font-semibold cursor-pointer hover:bg-slate-200/60` : pctMed >= 100 ? "bg-emerald-50/50 hover:bg-emerald-50" : "hover:bg-gray-50"}`}
                                onClick={() => isGroup && toggleCollapse(eap)}
                              >
                                <td className={`px-2 py-1 font-mono whitespace-nowrap ${isGroup ? "font-bold text-slate-700" : ""}`}>
                                  {isGroup && (
                                    isCollapsed
                                      ? <ChevronRight className="h-3 w-3 inline mr-0.5 text-slate-400" />
                                      : <ChevronDown className="h-3 w-3 inline mr-0.5 text-slate-400" />
                                  )}
                                  {eap}
                                </td>
                                <td
                                  className={`px-2 py-1 truncate ${isGroup ? "font-bold" : ""} ${i.nivel <= 2 && isGroup ? "uppercase" : ""}`}
                                  style={{ paddingLeft: `${Math.max(0, (i.nivel - 1)) * 12 + 8}px` }}
                                  title={i.descricao}
                                >
                                  {i.descricao}
                                </td>
                                <td className="px-1 py-1 text-center text-gray-500">{isGroup ? "" : (i.unidade || "—")}</td>
                                <td className="px-1 py-1 text-right">{isGroup ? "" : n(i.quantidade).toLocaleString("pt-BR")}</td>
                                <td className="px-1 py-1 text-right">{isGroup ? "" : brl(n(i.vendaUnitTotal) * fatorContrato)}</td>
                                <td className="px-1 py-1 text-right font-medium">{brl(vContr)}</td>
                                <td className="px-1 py-1 text-right text-orange-700">{matVal > 0 ? brl(matVal) : <span className="text-gray-300">—</span>}</td>
                                <td className="px-1 py-1 text-right text-indigo-700">{mdoVal > 0 ? brl(mdoVal) : <span className="text-gray-300">—</span>}</td>
                                <td className="px-1 py-1 text-right">
                                  {isGroup ? "" : (
                                    <span className={pctMed >= 100 ? "text-emerald-600 font-bold" : pctMed > 0 ? "text-blue-600 font-medium" : "text-gray-400"}>
                                      {pct(pctMed)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-1 py-1 text-right font-medium text-emerald-700">{vMed > 0 ? brl(vMed) : isGroup ? "" : <span className="text-gray-300">—</span>}</td>
                                <td className="px-1 py-1 text-right">
                                  {isGroup ? "" : (
                                    <span className={saldo < 0 ? "text-red-600 font-bold" : saldo === vContr ? "text-gray-400" : "text-amber-600"}>
                                      {brl(saldo)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="text-center py-12 text-gray-400">
                <ListTree className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Nenhum orçamento vinculado</p>
                <p className="text-sm mt-1">Vincule um orçamento ao projeto para visualizar a planilha</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="boletins" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button onClick={() => {
                const ini = sugerirDataInicio();
                const hoje = new Date().toISOString().split("T")[0];
                setFormBoletim({ periodoReferencia: "", dataInicio: ini, dataFim: hoje, observacoes: "" });
                setModalBoletim(true);
              }} className="gap-2" size="sm">
                <Plus className="h-4 w-4" />Novo Boletim
              </Button>
            </div>

            {loadingBoletins ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : (boletins as any[]).length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Nenhum boletim emitido</p>
                <p className="text-sm mt-1">Crie o primeiro boletim de medição para este contrato</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-12">Nº</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor Bruto</TableHead>
                      <TableHead className="text-right">Desc. Sinal</TableHead>
                      <TableHead className="text-right">Retenção</TableHead>
                      <TableHead className="text-right">Glosa</TableHead>
                      <TableHead className="text-right">FD</TableHead>
                      <TableHead className="text-right">Valor Líquido</TableHead>
                      <TableHead className="w-36"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(boletins as any[]).map((b: any, bIdx: number) => {
                      const prox = PROXIMOS_STATUS[b.status];
                      const sortedAll = [...(boletins as any[])].sort((a: any, b: any) => (a.numero ?? 0) - (b.numero ?? 0));
                      const posInSorted = sortedAll.findIndex((x: any) => x.id === b.id);
                      const prevBoletim = posInSorted > 0 ? sortedAll[posInSorted - 1] : null;
                      const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
                      return (
                        <React.Fragment key={b.id}>
                        <TableRow className="hover:bg-gray-50 cursor-pointer" onClick={() => abrirItens(b)}>
                          <TableCell className="font-mono text-sm font-semibold">{String(b.numero).padStart(2, "0")}</TableCell>
                          <TableCell className="text-sm">
                            {b.dataInicio ? (
                              <span className="flex items-center gap-1">
                                {prevBoletim?.dataFim && (
                                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" title={`Medição anterior até ${fmtDate(prevBoletim.dataFim)}`} />
                                )}
                                {fmtDate(b.dataInicio)}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{fmtDate(b.dataFim)}</TableCell>
                          <TableCell><StatusBadge status={b.status} /></TableCell>
                          <TableCell className="text-right text-sm">{brl(n(b.valorBruto))}</TableCell>
                          <TableCell className="text-right text-sm text-red-600">-{brl(n(b.descontoSinal))}</TableCell>
                          <TableCell className="text-right text-sm text-amber-600">-{brl(n(b.descontoRetencao))}</TableCell>
                          <TableCell className="text-right text-sm text-red-600">-{brl(n(b.glosa))}</TableCell>
                          <TableCell className="text-right text-sm text-violet-600" onClick={e => { if (n(b.deducaoFd) > 0) { e.stopPropagation(); setExpandedFdBoletimId(expandedFdBoletimId === b.id ? null : b.id); } }}>
                            <span className={`${n(b.deducaoFd) > 0 ? "cursor-pointer hover:underline" : ""}`}>
                              -{brl(n(b.deducaoFd))}
                              {n(b.deducaoFd) > 0 && <ChevronRight className={`inline h-3 w-3 ml-0.5 transition-transform ${expandedFdBoletimId === b.id ? "rotate-90" : ""}`} />}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold text-emerald-700">{brl(n(b.valorLiquido))}</TableCell>
                          <TableCell onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => {
                                setBoletimEditando(b);
                                setFormEditBoletim({ periodoReferencia: b.periodoReferencia || "", dataInicio: b.dataInicio || "", dataFim: b.dataFim || "", observacoes: b.observacoes || "" });
                                setModalEditBoletim(true);
                              }} title="Editar boletim">
                                <Edit className="h-3.5 w-3.5 text-slate-500" />
                              </Button>
                              {prox && (
                                <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700"
                                  onClick={() => avancarStatusMutation.mutate({ id: b.id, status: prox.status as any })}>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600"
                                onClick={() => { if (confirm(`Excluir o Boletim ${String(b.numero).padStart(2, "0")} (${b.periodoReferencia})? Todos os itens serão removidos.`)) excluirBoletimMutation.mutate({ id: b.id, companyId }); }}
                                title="Excluir boletim">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedFdBoletimId === b.id && n(b.deducaoFd) > 0 && (() => {
                          const fdForBoletim = (fdRegistros as any[]).filter((f: any) => f.boletimDescontoId === b.id || (f.status === "descontado" && f.boletimDescontoId === b.id));
                          const fdPendentes = (fdRegistros as any[]).filter((f: any) => f.status === "pendente");
                          const allFd = fdForBoletim.length > 0 ? fdForBoletim : fdPendentes;
                          return (
                            <TableRow className="bg-violet-50/50">
                              <TableCell colSpan={10} className="py-3">
                                <div className="ml-8 space-y-2">
                                  <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                                    <Receipt className="h-3.5 w-3.5" /> Detalhamento do Faturamento Direto
                                  </p>
                                  <div className="bg-white border border-violet-200 rounded-lg overflow-hidden">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="border-violet-100">
                                          <TableHead className="text-[10px] text-violet-500">Descrição</TableHead>
                                          <TableHead className="text-[10px] text-violet-500">Origem</TableHead>
                                          <TableHead className="text-[10px] text-violet-500">OC</TableHead>
                                          <TableHead className="text-[10px] text-violet-500 text-right">Valor</TableHead>
                                          <TableHead className="text-[10px] text-violet-500">Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {allFd.length > 0 ? (
                                          allFd.map((fd: any) => (
                                            <TableRow key={fd.id} className="border-violet-50">
                                              <TableCell className="text-xs text-gray-900">{fd.descricao}</TableCell>
                                              <TableCell className="text-xs text-gray-500">{fd.origem === "bdi" ? "BDI" : fd.origem === "manual" ? "Manual" : fd.origem}</TableCell>
                                              <TableCell className="text-xs font-mono text-gray-500">{fd.compraId ? `OC #${fd.compraId}` : "—"}</TableCell>
                                              <TableCell className="text-xs text-right font-semibold text-violet-700">{brl(n(fd.valor))}</TableCell>
                                              <TableCell className="text-xs">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${fd.status === "descontado" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"}`}>
                                                  {fd.status === "descontado" ? "Descontado" : "Pendente"}
                                                </span>
                                              </TableCell>
                                            </TableRow>
                                          ))
                                        ) : (
                                          <TableRow>
                                            <TableCell colSpan={5} className="text-xs text-center text-gray-400 py-3">
                                              Dedução FD calculada automaticamente ({brl(n(b.deducaoFd))})
                                            </TableCell>
                                          </TableRow>
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })()}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="fd" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  Registros de itens pagos diretamente pelo cliente que serão deduzidos nas medições.
                  {n(contrato.valorMinimoFd) > 0 && (
                    <span className="ml-2 text-amber-600 font-medium">Valor mínimo FD: {brl(n(contrato.valorMinimoFd))}</span>
                  )}
                </p>
              </div>
              <Button size="sm" onClick={() => setModalFd(true)} className="gap-2">
                <Plus className="h-4 w-4" />Registrar FD
              </Button>
            </div>

            {(fdRegistros as any[]).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Nenhum registro de FD</p>
                <p className="text-sm mt-1">Registre aqui os itens que o cliente pagará diretamente</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Descrição</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(fdRegistros as any[]).map((fd: any) => (
                      <TableRow key={fd.id}>
                        <TableCell className="font-medium">{fd.descricao}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${fd.origem === "bdi" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"}`}>
                            {fd.origem === "bdi" ? "BDI" : "Manual"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{fd.dataRegistro}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${fd.status === "descontado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {fd.status === "descontado" ? "Descontado" : "Pendente"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{brl(n(fd.valor))}</TableCell>
                        <TableCell>
                          {fd.status === "pendente" && (
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600"
                              onClick={() => { if (confirm("Excluir este registro?")) excluirFdMutation.mutate({ id: fd.id }); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-3 border-t bg-gray-50 text-right text-sm">
                  <span className="text-gray-500 mr-3">Total FD Pendente:</span>
                  <span className="font-bold text-violet-700">
                    {brl((fdRegistros as any[]).filter((f: any) => f.status === "pendente").reduce((acc: number, f: any) => acc + n(f.valor), 0))}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="levantamento" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  Levantamento de campo sobre PDF: marque áreas, volumes, perímetros e contagens
                  diretamente na planta (tablet) e gere a planilha de medição em R$.
                </p>
              </div>
              <Button
                size="sm"
                className="gap-2"
                disabled={criarCampoMutation.isPending}
                onClick={() => criarCampoMutation.mutate({ companyId, contratoId })}
              >
                {criarCampoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Nova Medição
              </Button>
            </div>

            {loadingCampos ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : (campos as any[]).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Ruler className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">Nenhum levantamento de campo</p>
                <p className="text-sm mt-1">Clique em "Nova Medição" para enviar a planta e começar a medir</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Nº</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Plantas</TableHead>
                    <TableHead className="text-center">Contornos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(campos as any[]).map((c: any) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setLocation(`/medicao/${contratoId}/levantamento/${c.id}`)}>
                      <TableCell className="font-mono">{String(c.numero).padStart(3, "0")}</TableCell>
                      <TableCell className="font-medium">{c.titulo || `Levantamento ${c.numero}`}</TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-center"><span className="inline-flex items-center gap-1 text-gray-600"><FileText className="h-3.5 w-3.5" />{c.qtdPdfs ?? 0}</span></TableCell>
                      <TableCell className="text-center"><span className="inline-flex items-center gap-1 text-gray-600"><Ruler className="h-3.5 w-3.5" />{c.qtdContornos ?? 0}</span></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setLocation(`/medicao/${contratoId}/levantamento/${c.id}`)} title="Abrir">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-8 px-2 text-red-600"
                            onClick={() => { if (confirm(`Excluir o levantamento ${String(c.numero).padStart(3, "0")}?`)) excluirCampoMutation.mutate({ id: c.id, companyId }); }}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={modalBoletim} onOpenChange={setModalBoletim}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Boletim de Medição</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {ultimoBoletimDataFim && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-emerald-800">Última medição até: <strong>{new Date(ultimoBoletimDataFim + "T12:00:00").toLocaleDateString("pt-BR")}</strong></span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início *</Label>
                <Input
                  type="date"
                  value={formBoletim.dataInicio}
                  onChange={e => setFormBoletim(f => ({ ...f, dataInicio: e.target.value }))}
                />
                {formBoletim.dataInicio && ultimoBoletimDataFim && (
                  <p className="text-[10px] text-emerald-600 mt-0.5">Dia seguinte à medição anterior</p>
                )}
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input
                  type="date"
                  value={formBoletim.dataFim}
                  onChange={e => setFormBoletim(f => ({ ...f, dataFim: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações desta medição..."
                value={formBoletim.observacoes}
                onChange={e => setFormBoletim(f => ({ ...f, observacoes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalBoletim(false)}>Cancelar</Button>
              <Button
                disabled={!formBoletim.dataInicio || !formBoletim.dataFim || criarBoletimMutation.isPending}
                onClick={() => {
                  const periodo = formBoletim.dataInicio ? formBoletim.dataInicio.substring(0, 7) : "";
                  criarBoletimMutation.mutate({
                    companyId,
                    contratoId,
                    periodoReferencia: periodo,
                    dataInicio: formBoletim.dataInicio || null,
                    dataFim: formBoletim.dataFim || null,
                    observacoes: formBoletim.observacoes || null,
                  });
                }}
              >
                {criarBoletimMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Criar e Lançar Itens
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalEditBoletim} onOpenChange={open => { setModalEditBoletim(open); if (!open) setBoletimEditando(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Editar Boletim {boletimEditando ? String(boletimEditando.numero).padStart(2, "0") : ""}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início *</Label>
                <Input
                  type="date"
                  value={formEditBoletim.dataInicio}
                  onChange={e => setFormEditBoletim(f => ({ ...f, dataInicio: e.target.value }))}
                />
              </div>
              <div>
                <Label>Data Fim *</Label>
                <Input
                  type="date"
                  value={formEditBoletim.dataFim}
                  onChange={e => setFormEditBoletim(f => ({ ...f, dataFim: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações desta medição..."
                value={formEditBoletim.observacoes}
                onChange={e => setFormEditBoletim(f => ({ ...f, observacoes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalEditBoletim(false)}>Cancelar</Button>
              <Button
                disabled={!formEditBoletim.dataInicio || !formEditBoletim.dataFim || editarBoletimMutation.isPending}
                onClick={() => {
                  if (!boletimEditando) return;
                  const periodo = formEditBoletim.dataInicio ? formEditBoletim.dataInicio.substring(0, 7) : boletimEditando.periodoReferencia;
                  editarBoletimMutation.mutate({
                    id: boletimEditando.id,
                    companyId,
                    periodoReferencia: periodo,
                    dataInicio: formEditBoletim.dataInicio || null,
                    dataFim: formEditBoletim.dataFim || null,
                    observacoes: formEditBoletim.observacoes || null,
                  });
                }}
              >
                {editarBoletimMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalFd} onOpenChange={setModalFd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar Faturamento Direto</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Descrição do Item *</Label>
              <Input
                placeholder="Ex: Elevadores — fornecimento direto"
                value={formFd.descricao}
                onChange={e => setFormFd(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor (R$) *</Label>
                <Input
                  placeholder="0,00"
                  value={formFd.valor}
                  onChange={e => setFormFd(f => ({ ...f, valor: e.target.value }))}
                />
                {n(formFd.valor) > 0 && n(contrato.valorMinimoFd) > 0 && n(formFd.valor) < n(contrato.valorMinimoFd) && (
                  <p className="text-xs text-red-500 mt-1">Abaixo do mínimo FD ({brl(n(contrato.valorMinimoFd))})</p>
                )}
              </div>
              <div>
                <Label>Data de Registro *</Label>
                <Input
                  type="date"
                  value={formFd.dataRegistro}
                  onChange={e => setFormFd(f => ({ ...f, dataRegistro: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Origem</Label>
              <Select value={formFd.origem} onValueChange={v => setFormFd(f => ({ ...f, origem: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="bdi">BDI do Orçamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Input
                placeholder="Observações..."
                value={formFd.observacoes}
                onChange={e => setFormFd(f => ({ ...f, observacoes: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalFd(false)}>Cancelar</Button>
              <Button
                disabled={!formFd.descricao || !formFd.valor || !formFd.dataRegistro || criarFdMutation.isPending}
                onClick={() => criarFdMutation.mutate({
                  companyId,
                  contratoId,
                  descricao: formFd.descricao,
                  valor: formFd.valor,
                  dataRegistro: formFd.dataRegistro,
                  origem: formFd.origem as "bdi" | "manual",
                  observacoes: formFd.observacoes || null,
                })}
              >
                {criarFdMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Registrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modalItens} onOpenChange={open => { setModalItens(open); if (!open) setItensEdicao([]); }}>
        <DialogContent resizable={false} className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />
              Itens do Boletim {boletimSelecionado ? String(boletimSelecionado.numero).padStart(2, "0") : ""}
              <span className="text-gray-400 font-normal">— {boletimSelecionado?.periodoReferencia}</span>
              {boletimSelecionado?.status && <StatusBadge status={boletimSelecionado.status} />}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Cards de resumo — sempre visíveis, no topo, para leitura rápida */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-1">Bruto (não-FD)</p>
                <p className="text-lg font-bold text-gray-900">
                  {brl(itensEdicao.length > 0 ? totalBruto : n(boletimSelecionado?.valorBruto))}
                </p>
              </div>
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-violet-500 font-medium mb-1">Dedução FD</p>
                <p className="text-lg font-bold text-violet-700">
                  -{brl(itensEdicao.length > 0 ? totalFdEdicao : n(boletimSelecionado?.deducaoFd))}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-emerald-600 font-medium mb-1">Líquido</p>
                <p className="text-lg font-bold text-emerald-700">
                  {brl(itensEdicao.length > 0 ? (totalBruto - totalFdEdicao) : n(boletimSelecionado?.valorLiquido))}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <TrendingUp className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                O avanço físico (<strong>% Período</strong>) vem direto do Cronograma (Planejamento → Avanço Semanal) — cada
                linha representa uma atividade-folha. Linhas roxas marcadas <strong>FD</strong> são deduzidas do bruto
                (faturamento direto, ex.: material comprado pelo cliente/OC de terceiro).
              </span>
            </div>

            {itensEdicao.length === 0 && boletimDetalhe && (
              <div>
                {(boletimDetalhe.itens?.length ?? 0) === 0 ? (
                  <div className="text-center py-10 rounded-xl border border-dashed border-gray-300 bg-gray-50/50">
                    <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 mb-3">Nenhum item lançado ainda.</p>
                    <Button variant="outline" size="sm" onClick={() => { popularItensDoOrcamento(); }}>
                      <TrendingUp className="h-3.5 w-3.5 mr-1" />
                      Importar do Cronograma (avanço físico)
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50 text-xs">
                          <TableHead className="w-20">Item</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-28">Origem</TableHead>
                          <TableHead className="text-right w-28">Valor Contratual</TableHead>
                          <TableHead className="text-right w-24">% Ant.</TableHead>
                          <TableHead className="text-right w-24">% Período</TableHead>
                          <TableHead className="text-right w-24">% Acum.</TableHead>
                          <TableHead className="text-right w-28">Valor Período</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {boletimDetalhe.itens.map((item: any, i: number) => (
                          <TableRow key={item.id} className={item.isFd ? "bg-violet-50 hover:bg-violet-100" : i % 2 === 1 ? "bg-gray-50/60" : ""}>
                            <TableCell className="font-mono text-xs">{item.eapCodigo || "—"}</TableCell>
                            <TableCell className="text-sm">{item.descricao}</TableCell>
                            <TableCell className="text-xs">
                              {item.isFd ? (
                                <span className="inline-flex items-center gap-1 text-violet-700 font-medium"><Package className="h-3 w-3" />FD Compras</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-blue-600"><TrendingUp className="h-3 w-3" />Cronograma</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm">{brl(n(item.valorContratual))}</TableCell>
                            <TableCell className="text-right text-sm">{pct(n(item.percentualAcumuladoAnterior))}</TableCell>
                            <TableCell className="text-right text-sm font-medium text-blue-700">{pct(n(item.percentualPeriodo))}</TableCell>
                            <TableCell className="text-right text-sm">{pct(n(item.percentualAcumuladoAtual))}</TableCell>
                            <TableCell className="text-right text-sm font-semibold">{brl(n(item.valorPeriodo))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {(boletimDetalhe.itens?.length ?? 0) > 0 && boletimSelecionado?.status === "rascunho" && (
                  <div className="flex justify-end mt-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      const mapped = boletimDetalhe.itens.map((i: any) => ({ ...i }));
                      setItensEdicao(mapped);
                    }}>
                      <Edit className="h-3.5 w-3.5 mr-1" />Editar Itens
                    </Button>
                  </div>
                )}
              </div>
            )}

            {itensEdicao.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-gray-600">{itensEdicao.length} itens — edite os percentuais do período</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setModalVincularFd(true)} className="text-violet-700 border-violet-200 hover:bg-violet-50">
                      <Package className="h-3.5 w-3.5 mr-1" />Vincular FD de Compras
                    </Button>
                    <Button variant="outline" size="sm" onClick={popularItensDoOrcamento}>
                      <TrendingUp className="h-3.5 w-3.5 mr-1" />Reimportar com Avanço Físico
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm max-h-[50vh]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 text-xs sticky top-0 z-10">
                        <TableHead className="w-20">Item</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Origem</TableHead>
                        <TableHead className="text-right w-28">V. Contratual</TableHead>
                        <TableHead className="text-center w-24">% Ant.</TableHead>
                        <TableHead className="text-center w-28">% Período *</TableHead>
                        <TableHead className="text-center w-24">% Acum.</TableHead>
                        <TableHead className="text-right w-28">V. Período</TableHead>
                        <TableHead className="text-center w-16">FD</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensEdicao.map((item, idx) => (
                        <TableRow key={idx} className={item.isFd ? "bg-violet-50 hover:bg-violet-100" : idx % 2 === 1 ? "bg-gray-50/60" : ""}>
                          <TableCell className="font-mono text-xs">{item.eapCodigo || "—"}</TableCell>
                          <TableCell className="text-xs truncate max-w-[200px]" title={item.descricao}>{item.descricao}</TableCell>
                          <TableCell className="text-xs">
                            {item.isFd ? (
                              <span className="inline-flex items-center gap-1 text-violet-700 font-medium"><Package className="h-3 w-3" />FD</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-blue-600"><TrendingUp className="h-3 w-3" />Cronog.</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs">{brl(n(item.valorContratual))}</TableCell>
                          <TableCell className="text-center text-xs">{pct(n(item.percentualAcumuladoAnterior))}</TableCell>
                          <TableCell>
                            <Input
                              className="h-7 text-xs text-center"
                              value={item.percentualPeriodo}
                              onChange={e => {
                                const updated = calcularItem(item, "percentualPeriodo", e.target.value);
                                setItensEdicao(prev => prev.map((it, i) => i === idx ? updated : it));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-center text-xs font-medium">{pct(n(item.percentualAcumuladoAtual))}</TableCell>
                          <TableCell className="text-right text-xs font-semibold">{brl(n(item.valorPeriodo))}</TableCell>
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={item.isFd}
                              onChange={e => setItensEdicao(prev => prev.map((it, i) => i === idx ? { ...it, isFd: e.target.checked } : it))}
                              className="h-3.5 w-3.5 accent-violet-600"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <button
                              type="button"
                              title="Remover item"
                              onClick={() => setItensEdicao(prev => prev.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center border-t pt-3">
                  <div className="text-sm space-x-4">
                    <span className="text-gray-500">Bruto (não-FD): <strong>{brl(totalBruto)}</strong></span>
                    <span className="text-violet-600">FD: <strong>-{brl(totalFdEdicao)}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setItensEdicao([])}>Cancelar</Button>
                    <Button
                      onClick={() => {
                        if (!boletimSelecionado) return;
                        salvarItensMutation.mutate({
                          boletimId: boletimSelecionado.id,
                          itens: itensEdicao.map(i => ({
                            atividadeId: i.atividadeId ?? null,
                            eapCodigo: i.eapCodigo ?? null,
                            descricao: i.descricao,
                            valorContratual: String(i.valorContratual),
                            percentualAcumuladoAnterior: String(i.percentualAcumuladoAnterior),
                            percentualPeriodo: String(i.percentualPeriodo),
                            percentualAcumuladoAtual: String(i.percentualAcumuladoAtual),
                            valorPeriodo: String(i.valorPeriodo),
                            tipoAvanco: i.tipoAvanco ?? "fisico",
                            isFd: i.isFd ?? false,
                          })),
                        });
                        recalcularMutation.mutate({ boletimId: boletimSelecionado.id });
                      }}
                      disabled={salvarItensMutation.isPending}
                    >
                      {salvarItensMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Salvar e Calcular Deduções
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rev. 4026 — Vincular OC de Faturamento Direto (Compras) direto num item do boletim */}
      <Dialog open={modalVincularFd} onOpenChange={setModalVincularFd}>
        <DialogContent resizable={false} className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-violet-600" />
              Vincular FD de Compras
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Ordens de Compra com Faturamento Direto (fd_cliente/fd_terceiro/fd_fc) lançadas para a obra deste contrato.
              Selecionar adiciona um item FD no boletim com o valor da OC.
            </p>
            {loadingOcsFd ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : ocsFdDisponiveis.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                Nenhuma OC de Faturamento Direto encontrada para esta obra.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {ocsFdDisponiveis.map((oc: any) => (
                  <div key={oc.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        OC {oc.numeroOc} {oc.fornecedorNome ? `· ${oc.fornecedorNome}` : ""}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{oc.descricao || "Sem descrição"}</p>
                      {oc.jaVinculada && <span className="text-[10px] text-amber-600 font-medium">Já vinculada a uma medição</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-semibold text-violet-700">{brl(n(oc.valorEfetivo))}</span>
                      <Button
                        size="sm"
                        disabled={criarFdMutation.isPending}
                        onClick={() => {
                          const descricao = `FD - OC ${oc.numeroOc}${oc.fornecedorNome ? " - " + oc.fornecedorNome : ""}`;
                          criarFdMutation.mutate({
                            companyId,
                            contratoId,
                            descricao,
                            valor: String(n(oc.valorEfetivo).toFixed(2)),
                            dataRegistro: new Date().toISOString().split("T")[0],
                            origem: "compra",
                            compraId: oc.id,
                          });
                          setItensEdicao(prev => [...prev, {
                            atividadeId: null,
                            eapCodigo: null,
                            descricao,
                            valorContratual: n(oc.valorEfetivo).toFixed(2),
                            percentualAcumuladoAnterior: "0.0000",
                            percentualPeriodo: "100.0000",
                            percentualAcumuladoAtual: "100.0000",
                            valorPeriodo: n(oc.valorEfetivo).toFixed(2),
                            tipoAvanco: "fd_compra",
                            isFd: true,
                          }]);
                          setModalVincularFd(false);
                        }}
                      >
                        Selecionar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editandoContrato} onOpenChange={setEditandoContrato}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Configurações do Contrato</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Critério de Medição</Label>
                <Select value={formContrato.criterio} onValueChange={v => setFormContrato((f: any) => ({ ...f, criterio: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avanco_fisico">Avanço Físico</SelectItem>
                    <SelectItem value="parcela_fixa">Parcela Fixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formContrato.status} onValueChange={v => setFormContrato((f: any) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="encerrado">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor Total do Contrato (R$)</Label>
                <Input value={formContrato.valorTotalContrato ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, valorTotalContrato: e.target.value }))} />
              </div>
              <div>
                <Label>Valor Sinal Recebido (R$)</Label>
                <Input value={formContrato.valorSinalRecebido ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, valorSinalRecebido: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>% Desconto de Sinal</Label>
                <Input value={formContrato.percentualSinal ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, percentualSinal: e.target.value }))} />
              </div>
              <div>
                <Label>% Retenção de Garantia</Label>
                <Input value={formContrato.percentualRetencao ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, percentualRetencao: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Valor Mínimo FD (R$)</Label>
              <Input value={formContrato.valorMinimoFd ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, valorMinimoFd: e.target.value }))} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={formContrato.observacoes ?? ""} onChange={e => setFormContrato((f: any) => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditandoContrato(false)}>Cancelar</Button>
              <Button
                disabled={atualizarContratoMutation.isPending}
                onClick={() => atualizarContratoMutation.mutate({ id: contratoId, ...formContrato })}
              >
                {atualizarContratoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
