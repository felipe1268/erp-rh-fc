import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatCPF, formatMoeda } from "@/lib/formatters";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  User, Stethoscope, GraduationCap, ClipboardList, ShieldAlert,
  Clock, DollarSign, HardHat, Calendar, MapPin, Phone, Building2, Briefcase, CreditCard,
  Printer, FileDown, X, AlertTriangle, FileText, ArrowLeft, Gift, Timer,
  History, Zap, Scale, Car, TrendingUp, ChevronRight, Activity
} from "lucide-react";
import { useEffect, useState } from "react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function parseBRNumber(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val).trim();
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  const dotParts = s.split(".");
  if (dotParts.length === 2 && dotParts[1].length === 3) return parseFloat(s.replace(/\./g, ""));
  return parseFloat(s) || 0;
}

function formatSalario(val: string | null | undefined): string {
  if (!val) return "-";
  const num = parseBRNumber(val);
  if (isNaN(num) || num === 0) return "-";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcTempoEmpresa(dataAdmissao: string | null | undefined): string {
  if (!dataAdmissao) return "-";
  const admissao = new Date(dataAdmissao + "T00:00:00");
  const hoje = new Date();
  let anos = hoje.getFullYear() - admissao.getFullYear();
  let meses = hoje.getMonth() - admissao.getMonth();
  if (hoje.getDate() < admissao.getDate()) meses--;
  if (meses < 0) { anos--; meses += 12; }
  if (anos > 0 && meses > 0) return `${anos} ano${anos > 1 ? "s" : ""} e ${meses} ${meses > 1 ? "meses" : "mês"}`;
  if (anos > 0) return `${anos} ano${anos > 1 ? "s" : ""}`;
  if (meses > 0) return `${meses} ${meses > 1 ? "meses" : "mês"}`;
  return "Menos de 1 mês";
}

function calcDiasAniversario(dataNascimento: string | null | undefined): { aniversario: string; diasFaltando: number; texto: string } {
  if (!dataNascimento) return { aniversario: "-", diasFaltando: -1, texto: "-" };
  const nasc = new Date(dataNascimento.split("T")[0] + "T00:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const anivStr = `${String(nasc.getDate()).padStart(2, "0")}/${String(nasc.getMonth() + 1).padStart(2, "0")}`;
  let proxAniv = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
  if (proxAniv < hoje) proxAniv = new Date(hoje.getFullYear() + 1, nasc.getMonth(), nasc.getDate());
  const diff = Math.ceil((proxAniv.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return { aniversario: anivStr, diasFaltando: 0, texto: "🎂 HOJE!" };
  let meses = proxAniv.getMonth() - hoje.getMonth() + (proxAniv.getFullYear() - hoje.getFullYear()) * 12;
  const tempDate = new Date(hoje.getFullYear(), hoje.getMonth() + meses, hoje.getDate());
  let dias = Math.ceil((proxAniv.getTime() - tempDate.getTime()) / (1000 * 60 * 60 * 24));
  if (dias < 0) { meses--; const tempDate2 = new Date(hoje.getFullYear(), hoje.getMonth() + meses, hoje.getDate()); dias = Math.ceil((proxAniv.getTime() - tempDate2.getTime()) / (1000 * 60 * 60 * 24)); }
  let textoFalta = "";
  if (meses > 0 && dias > 0) textoFalta = `em ${meses} ${meses > 1 ? "meses" : "mês"} e ${dias} dia${dias > 1 ? "s" : ""}`;
  else if (meses > 0) textoFalta = `em ${meses} ${meses > 1 ? "meses" : "mês"}`;
  else textoFalta = `em ${dias} dia${dias > 1 ? "s" : ""}`;
  return { aniversario: anivStr, diasFaltando: diff, texto: textoFalta };
}

function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "VENCIDO") return <Badge variant="destructive" className="text-xs">VENCIDO</Badge>;
  if (status?.includes("DIAS PARA VENCER")) {
    const cor = diasRestantes <= 7 ? "bg-red-100 text-red-800" : diasRestantes <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{status}</span>;
  }
  return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">VÁLIDO</Badge>;
}

const TIMELINE_COLORS: Record<string, string> = {
  green: "bg-green-500", red: "bg-red-500", blue: "bg-blue-500", orange: "bg-orange-500",
  purple: "bg-purple-500", amber: "bg-amber-500", teal: "bg-teal-500", cyan: "bg-cyan-500",
  emerald: "bg-emerald-500", indigo: "bg-indigo-500", gray: "bg-gray-400",
};

interface RaioXProps {
  employeeId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function RaioXFuncionario({ employeeId, open, onClose }: RaioXProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("timeline");
  const { data: raioX, isLoading } = trpc.docs.raioX.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId && open }
  );

  useEffect(() => {
    if (open) { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !employeeId) return null;

  const emp = raioX?.funcionario;
  const funcaoDetalhes = raioX?.funcaoDetalhes;
  const asos = raioX?.asos || [];
  const treinamentos = raioX?.treinamentos || [];
  const atestados = raioX?.atestados || [];
  const advertencias = raioX?.advertencias || [];
  const pontoResumo = raioX?.ponto || [];
  const atrasosDetalhados = raioX?.atrasosDetalhados || [];
  const faltasDetalhadas = raioX?.faltasDetalhadas || [];
  const folhaPagamento = raioX?.folhaPagamento || [];
  const episEntregas = raioX?.epis || [];
  const horasExtras = raioX?.horasExtras || [];
  const historicoFuncional = raioX?.historicoFuncional || [];
  const acidentes = raioX?.acidentes || [];
  const processos = raioX?.processos || [];
  const timeline = raioX?.timeline || [];
  const valeAlimentacao = raioX?.valeAlimentacao || [];
  const adiantamentos = raioX?.adiantamentos || [];
  const rateioObras = raioX?.rateioObras || [];

  const asosVencidos = asos.filter((a: any) => a.status === "VENCIDO").length;
  const asosAVencer = asos.filter((a: any) => a.status?.includes("DIAS PARA VENCER")).length;
  const userName = user?.name || user?.username || "Usuário";
  const dataEmissao = new Date().toLocaleString("pt-BR");

  // Total HE
  const totalHEHoras = horasExtras.reduce((s: number, h: any) => s + parseFloat(h.quantidadeHoras || "0"), 0);
  const totalHEValor = horasExtras.reduce((s: number, h: any) => s + parseFloat(h.valorTotal || "0"), 0);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Raio-X - ${emp?.nomeCompleto || ""}</title>
    <style>@page{size:A4 portrait;margin:15mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;line-height:1.4}.header{background:#1e40af;color:white;padding:20px 24px;border-radius:8px;margin-bottom:16px}.header h1{font-size:20px}.section{margin-bottom:14px;page-break-inside:avoid}.section-title{font-size:13px;font-weight:700;color:#1e40af;border-bottom:2px solid #3b82f6;padding-bottom:4px;margin-bottom:8px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#f0f4ff;color:#1e40af;font-weight:600;text-align:left;padding:6px 8px;border:1px solid #dbeafe}td{padding:5px 8px;border:1px solid #e5e7eb}tr:nth-child(even){background:#f9fafb}.footer{position:fixed;bottom:0;left:0;right:0;padding:8px 15mm;border-top:2px solid #1e40af;font-size:9px;display:flex;justify-content:space-between;background:white}.lgpd{color:#dc2626;font-weight:600;font-size:8px}</style></head><body>`);
    printWindow.document.write(`<div class="header"><h1>RAIO-X DO FUNCIONÁRIO</h1><p>${emp?.nomeCompleto} — CPF: ${formatCPF(emp?.cpf || "")}</p></div>`);
    printWindow.document.write(`<div class="footer"><span>ERP RH & DP — FC Engenharia</span><span>Gerado por: ${userName} em ${dataEmissao}</span><span class="lgpd">Dados protegidos pela LGPD (Lei 13.709/2018)</span></div></body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  // ===================== FULL SCREEN OVERLAY =====================
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ width: "100vw", height: "100vh" }}>
      {/* HEADER */}
      <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 h-9 w-9 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="bg-white/20 p-2 rounded-lg"><User className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">RAIO-X DO FUNCIONÁRIO</h1>
            {emp && <p className="text-sm text-white/80">{emp.nomeCompleto} — CPF: {formatCPF(emp.cpf)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
            <FileDown className="h-4 w-4" /> Gerar PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20 gap-1.5 border border-white/30">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground text-lg">Carregando dados do funcionário...</div>
        ) : !emp ? (
          <div className="text-center py-20 text-muted-foreground text-lg">Funcionário não encontrado</div>
        ) : (
          <div className="p-6 max-w-[1600px] mx-auto space-y-5">
            {/* DADOS PESSOAIS */}
            <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 rounded-xl p-6 border border-blue-200 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-3xl font-bold text-blue-900">{emp.nomeCompleto}</h2>
                    <Badge className={`text-sm px-3 py-1 ${emp.status === "Ativo" ? "bg-green-100 text-green-800" : emp.status === "Desligado" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {emp.status}
                    </Badge>
                    {(emp as any).codigoInterno && (
                      <Badge variant="outline" className="text-sm px-3 py-1 border-blue-300 text-blue-700 font-mono">{(emp as any).codigoInterno}</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-8 gap-y-3">
                    {(() => {
                      const anivInfo = calcDiasAniversario(emp.dataNascimento);
                      const tempoEmp = calcTempoEmpresa(emp.dataAdmissao);
                      return [
                        { icon: CreditCard, label: "CPF", value: formatCPF(emp.cpf) },
                        emp.rg ? { icon: CreditCard, label: "RG", value: emp.rg } : null,
                        emp.funcao ? { icon: Briefcase, label: "Função", value: emp.funcao } : null,
                        funcaoDetalhes?.cbo ? { icon: FileText, label: "CBO", value: funcaoDetalhes.cbo } : null,
                        emp.setor ? { icon: Building2, label: "Setor", value: emp.setor } : null,
                        emp.telefone ? { icon: Phone, label: "Telefone", value: emp.telefone } : null,
                        emp.dataAdmissao ? { icon: Calendar, label: "Admissão", value: formatDate(emp.dataAdmissao) } : null,
                        emp.dataAdmissao ? { icon: Timer, label: "Tempo de Empresa", value: tempoEmp } : null,
                        emp.salarioBase ? { icon: DollarSign, label: "Salário", value: formatSalario(emp.salarioBase) } : null,
                        emp.valorHora ? { icon: Clock, label: "Valor/Hora", value: formatSalario(emp.valorHora) } : null,
                        emp.dataNascimento ? { icon: Gift, label: "Aniversário", value: `${anivInfo.aniversario} (${anivInfo.texto})` } : null,
                      ].filter(Boolean);
                    })().map((item: any, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm text-blue-700">
                        <item.icon className="h-4 w-4 shrink-0 text-blue-500" />
                        <span><strong>{item.label}:</strong> {item.value}</span>
                      </div>
                    ))}
                  </div>
                  {emp.logradouro && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 mt-3">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{emp.logradouro}{emp.bairro ? `, ${emp.bairro}` : ""}{emp.cidade ? ` - ${emp.cidade}` : ""}{emp.estado ? `/${emp.estado}` : ""}</span>
                    </div>
                  )}
                  {emp.dataDemissao && <p className="text-sm text-red-600 mt-2 font-medium">Desligado em: {formatDate(emp.dataDemissao)}</p>}
                </div>
              </div>

              {/* DESCRIÇÃO DA FUNÇÃO */}
              {funcaoDetalhes?.descricao && (
                <div className="mt-4 bg-white/70 rounded-lg p-4 border border-blue-100">
                  <p className="text-xs font-bold text-blue-800 uppercase mb-1">Descrição da Função — {funcaoDetalhes.nome} {funcaoDetalhes.cbo ? `(CBO: ${funcaoDetalhes.cbo})` : ""}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{funcaoDetalhes.descricao}</p>
                </div>
              )}

              {/* CARDS DE MÉTRICAS */}
              <div className="grid grid-cols-4 lg:grid-cols-10 gap-2 mt-5">
                {[
                  { label: "ASOs", value: asos.length, tab: "asos", bg: "bg-blue-50 border-blue-200", textColor: "text-blue-700", iconColor: "text-blue-400", icon: Stethoscope },
                  { label: "Vencidos", value: asosVencidos, tab: "asos", bg: "bg-rose-50 border-rose-200", textColor: "text-rose-700", iconColor: "text-rose-400", icon: Stethoscope },
                  { label: "A Vencer", value: asosAVencer, tab: "asos", bg: "bg-amber-50 border-amber-200", textColor: "text-amber-700", iconColor: "text-amber-400", icon: Stethoscope },
                  { label: "Treinamentos", value: treinamentos.length, tab: "trein", bg: "bg-emerald-50 border-emerald-200", textColor: "text-emerald-700", iconColor: "text-emerald-400", icon: GraduationCap },
                  { label: "Atestados", value: atestados.length, tab: "atest", bg: "bg-violet-50 border-violet-200", textColor: "text-violet-700", iconColor: "text-violet-400", icon: ClipboardList },
                  { label: "Advertências", value: advertencias.length, tab: "adv", bg: advertencias.length >= 3 ? "bg-red-50 border-red-300" : "bg-orange-50 border-orange-200", textColor: advertencias.length >= 3 ? "text-red-700" : "text-orange-700", iconColor: advertencias.length >= 3 ? "text-red-400" : "text-orange-400", icon: ShieldAlert },
                  { label: "Ponto", value: pontoResumo.length, tab: "ponto", bg: "bg-sky-50 border-sky-200", textColor: "text-sky-700", iconColor: "text-sky-400", icon: Clock },
                  { label: "EPIs", value: episEntregas.length, tab: "epis", bg: "bg-teal-50 border-teal-200", textColor: "text-teal-700", iconColor: "text-teal-400", icon: HardHat },
                  { label: "Horas Extras", value: horasExtras.length, tab: "he", bg: "bg-amber-50 border-amber-200", textColor: "text-amber-700", iconColor: "text-amber-400", icon: Zap },
                  { label: "Histórico", value: timeline.length, tab: "timeline", bg: "bg-indigo-50 border-indigo-200", textColor: "text-indigo-700", iconColor: "text-indigo-400", icon: History },
                ].map(c => {
                  const Icon = c.icon;
                  return (
                    <button key={c.label} onClick={() => setActiveTab(c.tab)} className={`${c.bg} border rounded-xl p-2.5 text-center hover:shadow-md transition-all hover:scale-105 cursor-pointer`}>
                      <Icon className={`h-4 w-4 mx-auto mb-0.5 ${c.iconColor}`} />
                      <p className={`text-xl font-bold ${c.textColor}`}>{c.value}</p>
                      <p className={`text-[10px] font-semibold ${c.textColor} opacity-70`}>{c.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ALERTAS */}
            {advertencias.length >= 3 && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-800 text-base">ALERTA CLT — Advertências Progressivas</p>
                  <p className="text-sm text-red-700 mt-1">
                    Este colaborador possui <strong>{advertencias.length} advertências</strong>.
                    {advertencias.length >= 4 ? " Recomenda-se análise para possível Justa Causa (Art. 482 CLT)." : " Próximo passo: Suspensão (Art. 474 CLT, máx. 30 dias)."}
                  </p>
                </div>
              </div>
            )}
            {acidentes.length > 0 && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800 text-base">Histórico de Acidentes ({acidentes.length})</p>
                  <p className="text-sm text-amber-700 mt-1">Este colaborador possui {acidentes.length} acidente(s) de trabalho registrado(s).</p>
                </div>
              </div>
            )}

            {/* ABAS */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1.5 rounded-lg">
                {[
                  { value: "timeline", label: "Timeline", icon: History, count: timeline.length, activeClass: "bg-indigo-100 text-indigo-800" },
                  { value: "asos", label: "ASOs", icon: Stethoscope, count: asos.length, activeClass: "bg-blue-100 text-blue-800" },
                  { value: "trein", label: "Treinamentos", icon: GraduationCap, count: treinamentos.length, activeClass: "bg-emerald-100 text-emerald-800" },
                  { value: "atest", label: "Atestados", icon: ClipboardList, count: atestados.length, activeClass: "bg-purple-100 text-purple-800" },
                  { value: "adv", label: "Advertências", icon: ShieldAlert, count: advertencias.length, activeClass: "bg-orange-100 text-orange-800" },
                  { value: "ponto", label: "Ponto", icon: Clock, count: pontoResumo.length, activeClass: "bg-cyan-100 text-cyan-800" },
                  { value: "folha", label: "Folha", icon: DollarSign, count: folhaPagamento.length, activeClass: "bg-indigo-100 text-indigo-800" },
                  { value: "he", label: "Horas Extras", icon: Zap, count: horasExtras.length, activeClass: "bg-orange-100 text-orange-800" },
                  { value: "epis", label: "EPIs", icon: HardHat, count: episEntregas.length, activeClass: "bg-teal-100 text-teal-800" },
                  { value: "acidentes", label: "Acidentes", icon: AlertTriangle, count: acidentes.length, activeClass: "bg-red-100 text-red-800" },
                  { value: "processos", label: "Processos", icon: Scale, count: processos.length, activeClass: "bg-red-100 text-red-800" },
                  { value: "historico", label: "Hist. Funcional", icon: TrendingUp, count: historicoFuncional.length, activeClass: "bg-green-100 text-green-800" },
                  { value: "funcao", label: "Função/OS", icon: FileText, count: funcaoDetalhes ? 1 : 0, activeClass: "bg-blue-100 text-blue-800" },
                ].map(tab => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.value} value={tab.value} className={`gap-1 text-xs font-medium data-[state=active]:${tab.activeClass} flex-1 min-w-[90px]`}>
                      <Icon className="h-3.5 w-3.5" /> {tab.label} ({tab.count})
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {/* ============ TIMELINE ============ */}
              <TabsContent value="timeline" className="mt-4">
                {timeline.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum evento registrado</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-indigo-500" /> Timeline Cronológica — {timeline.length} eventos</h3>
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                      <div className="space-y-3">
                        {timeline.map((ev: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-4 ml-0">
                            <div className={`shrink-0 w-9 h-9 rounded-full ${TIMELINE_COLORS[ev.cor] || "bg-gray-400"} flex items-center justify-center z-10`}>
                              <ChevronRight className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-100">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-500">{formatDate(ev.data)}</span>
                                <Badge variant="outline" className="text-[10px]">{ev.tipo}</Badge>
                              </div>
                              <p className="text-sm text-gray-700 mt-1">{ev.descricao}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ ASOs ============ */}
              <TabsContent value="asos" className="mt-4">
                {asos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum ASO registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-blue-50 border-b">
                        <th className="p-3 text-left font-semibold text-blue-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Data Exame</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Validade</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Status</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Vencimento</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Resultado</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Médico</th>
                        <th className="p-3 text-left font-semibold text-blue-900">CRM</th>
                        <th className="p-3 text-left font-semibold text-blue-900">Exames</th>
                      </tr></thead>
                      <tbody>
                        {asos.map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{a.tipo}</td>
                            <td className="p-3">{formatDate(a.dataExame)}</td>
                            <td className="p-3">{a.validadeDias} dias</td>
                            <td className="p-3"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                            <td className="p-3">{formatDate(a.dataVencimento)}</td>
                            <td className="p-3"><span className={a.resultado === "Apto" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{a.resultado}</span></td>
                            <td className="p-3">{a.medico || "-"}</td>
                            <td className="p-3">{a.crm || "-"}</td>
                            <td className="p-3 max-w-[300px]">{a.examesRealizados || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ TREINAMENTOS ============ */}
              <TabsContent value="trein" className="mt-4">
                {treinamentos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum treinamento registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-emerald-50 border-b">
                        <th className="p-3 text-left font-semibold text-emerald-900">Treinamento</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Norma</th>
                        <th className="p-3 text-center font-semibold text-emerald-900">Carga H.</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Realização</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Validade</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Status</th>
                        <th className="p-3 text-left font-semibold text-emerald-900">Instrutor</th>
                      </tr></thead>
                      <tbody>
                        {treinamentos.map((t: any) => (
                          <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{t.nome}</td>
                            <td className="p-3">{t.norma || "-"}</td>
                            <td className="p-3 text-center">{t.cargaHoraria || "-"}</td>
                            <td className="p-3">{formatDate(t.dataRealizacao)}</td>
                            <td className="p-3">{formatDate(t.dataValidade)}</td>
                            <td className="p-3">{t.dataValidade ? <StatusBadge status={t.statusCalculado || "VÁLIDO"} diasRestantes={t.diasRestantes || 999} /> : "-"}</td>
                            <td className="p-3">{t.instrutor || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ ATESTADOS ============ */}
              <TabsContent value="atest" className="mt-4">
                {atestados.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum atestado registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-purple-50 border-b">
                        <th className="p-3 text-left font-semibold text-purple-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Data</th>
                        <th className="p-3 text-center font-semibold text-purple-900">Dias Afastamento</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Retorno</th>
                        <th className="p-3 text-left font-semibold text-purple-900">CID</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Médico</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Arquivo</th>
                        <th className="p-3 text-left font-semibold text-purple-900">Observações</th>
                      </tr></thead>
                      <tbody>
                        {atestados.map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{a.tipo}</td>
                            <td className="p-3">{formatDate(a.dataEmissao)}</td>
                            <td className="p-3 text-center font-semibold">{a.diasAfastamento || 0}</td>
                            <td className="p-3">{formatDate(a.dataRetorno)}</td>
                            <td className="p-3">{a.cid || "-"}</td>
                            <td className="p-3">{a.medico || "-"}</td>
                            <td className="p-3">{a.documentoUrl ? <a href={a.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Ver</a> : <span className="text-muted-foreground text-xs">—</span>}</td>
                            <td className="p-3 max-w-[250px] truncate">{a.observacoes || a.descricao || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ ADVERTÊNCIAS ============ */}
              <TabsContent value="adv" className="mt-4">
                {advertencias.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma advertência registrada</div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl p-4 border shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-700">Progressão Disciplinar (CLT)</p>
                        <span className="text-xs text-muted-foreground">Total: {advertencias.length}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3].map(n => <div key={n} className={`flex-1 h-3 rounded-full ${advertencias.length >= n ? "bg-orange-500" : "bg-gray-200"}`} />)}
                        <div className={`flex-1 h-3 rounded-full ${advertencias.some((a: any) => a.tipoAdvertencia === "Suspensao") ? "bg-red-500" : "bg-gray-200"}`} />
                        <div className={`flex-1 h-3 rounded-full ${advertencias.some((a: any) => a.tipoAdvertencia === "JustaCausa") ? "bg-red-800" : "bg-gray-200"}`} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>1ª Adv.</span><span>2ª Adv.</span><span>3ª Adv.</span><span>Suspensão</span><span>Justa Causa</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-orange-50 border-b">
                          <th className="p-3 text-center font-semibold text-orange-900 w-16">Seq.</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Tipo</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Data</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Motivo</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Testemunhas</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Aplicado por</th>
                        </tr></thead>
                        <tbody>
                          {advertencias.map((a: any, idx: number) => (
                            <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.tipoAdvertencia === "Suspensao" ? "bg-red-50" : a.tipoAdvertencia === "JustaCausa" ? "bg-red-100" : ""}`}>
                              <td className="p-3 text-center"><span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "bg-red-200 text-red-800" : "bg-orange-200 text-orange-800"}`}>{a.sequencia || idx + 1}ª</span></td>
                              <td className="p-3"><Badge variant={a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "destructive" : "secondary"} className="text-xs">{a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia}</Badge></td>
                              <td className="p-3">{formatDate(a.dataOcorrencia)}</td>
                              <td className="p-3 max-w-[300px]">{a.motivo}</td>
                              <td className="p-3">{a.testemunhas || "-"}</td>
                              <td className="p-3">{a.aplicadoPor || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ PONTO ============ */}
              <TabsContent value="ponto" className="mt-4">
                <div className="space-y-4">
                  {/* Resumo mensal */}
                  {pontoResumo.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <div className="p-3 bg-cyan-50 border-b"><h4 className="font-semibold text-cyan-900 text-sm">Resumo Mensal de Ponto</h4></div>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-gray-50">
                          <th className="p-3 text-left font-semibold">Competência</th>
                          <th className="p-3 text-center font-semibold">Dias Trab.</th>
                          <th className="p-3 text-center font-semibold">Ajustes Manuais</th>
                        </tr></thead>
                        <tbody>
                          {pontoResumo.map((p: any) => (
                            <tr key={p.mesReferencia} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{p.mesReferencia}</td>
                              <td className="p-3 text-center">{p.diasTrabalhados}</td>
                              <td className="p-3 text-center">{p.ajustesManuais || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Atrasos detalhados */}
                  {atrasosDetalhados.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <div className="p-3 bg-amber-50 border-b"><h4 className="font-semibold text-amber-900 text-sm">Atrasos Detalhados ({atrasosDetalhados.length})</h4></div>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-gray-50">
                          <th className="p-3 text-left font-semibold">Data</th>
                          <th className="p-3 text-left font-semibold">Entrada</th>
                          <th className="p-3 text-left font-semibold">Atraso</th>
                        </tr></thead>
                        <tbody>
                          {atrasosDetalhados.map((a: any, idx: number) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3">{formatDate(a.data)}</td>
                              <td className="p-3 font-mono">{a.entrada1 || "-"}</td>
                              <td className="p-3 font-mono text-amber-600 font-semibold">{a.atraso}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Faltas */}
                  {faltasDetalhadas.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <div className="p-3 bg-red-50 border-b"><h4 className="font-semibold text-red-900 text-sm">Faltas Detalhadas ({faltasDetalhadas.length})</h4></div>
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-gray-50">
                          <th className="p-3 text-left font-semibold">Data</th>
                          <th className="p-3 text-center font-semibold">Faltas</th>
                        </tr></thead>
                        <tbody>
                          {faltasDetalhadas.map((f: any, idx: number) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3">{formatDate(f.data)}</td>
                              <td className="p-3 text-center font-semibold text-red-600">{f.faltas}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {pontoResumo.length === 0 && atrasosDetalhados.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">Nenhum registro de ponto encontrado</div>
                  )}
                </div>
              </TabsContent>

              {/* ============ FOLHA ============ */}
              <TabsContent value="folha" className="mt-4">
                {folhaPagamento.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum registro de folha de pagamento</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-indigo-50 border-b">
                        <th className="p-3 text-left font-semibold text-indigo-900">Competência</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">Salário Base</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">H. Extras</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">Descontos</th>
                        <th className="p-3 text-right font-semibold text-indigo-900">Líquido</th>
                        <th className="p-3 text-center font-semibold text-indigo-900">Status</th>
                      </tr></thead>
                      <tbody>
                        {folhaPagamento.map((f: any) => (
                          <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{f.mesReferencia}</td>
                            <td className="p-3 text-right font-mono">{formatSalario(f.salarioBase)}</td>
                            <td className="p-3 text-right font-mono text-green-600">{formatSalario(f.horasExtrasValor)}</td>
                            <td className="p-3 text-right font-mono text-red-600">{formatSalario(f.totalDescontos)}</td>
                            <td className="p-3 text-right font-mono font-bold text-lg">{formatSalario(f.salarioLiquido)}</td>
                            <td className="p-3 text-center"><Badge variant={f.status === "Pago" ? "default" : "secondary"}>{f.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ HORAS EXTRAS ============ */}
              <TabsContent value="he" className="mt-4">
                {horasExtras.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma hora extra registrada</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Total Registros</p>
                        <p className="text-2xl font-bold text-orange-600">{horasExtras.length}</p>
                      </CardContent></Card>
                      <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Total Horas</p>
                        <p className="text-2xl font-bold text-blue-600">{totalHEHoras.toFixed(1)}h</p>
                      </CardContent></Card>
                      <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
                        <p className="text-xs text-muted-foreground">Custo Total</p>
                        <p className="text-2xl font-bold text-red-600">{formatSalario(String(totalHEValor.toFixed(2)))}</p>
                      </CardContent></Card>
                    </div>
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-orange-50 border-b">
                          <th className="p-3 text-left font-semibold text-orange-900">Competência</th>
                          <th className="p-3 text-right font-semibold text-orange-900">Horas</th>
                          <th className="p-3 text-right font-semibold text-orange-900">% Acréscimo</th>
                          <th className="p-3 text-right font-semibold text-orange-900">Valor/Hora</th>
                          <th className="p-3 text-right font-semibold text-orange-900">Valor Total</th>
                          <th className="p-3 text-left font-semibold text-orange-900">Descrição</th>
                        </tr></thead>
                        <tbody>
                          {horasExtras.map((h: any) => (
                            <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{h.mesReferencia}</td>
                              <td className="p-3 text-right font-mono font-semibold text-orange-600">{h.quantidadeHoras}h</td>
                              <td className="p-3 text-right font-mono">{h.percentualAcrescimo || "50"}%</td>
                              <td className="p-3 text-right font-mono">{formatSalario(h.valorHoraBase)}</td>
                              <td className="p-3 text-right font-mono font-bold text-red-600">{formatSalario(h.valorTotal)}</td>
                              <td className="p-3 max-w-[200px] truncate">{h.descricao || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ EPIs ============ */}
              <TabsContent value="epis" className="mt-4">
                {episEntregas.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma entrega de EPI registrada</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-teal-50 border-b">
                        <th className="p-3 text-left font-semibold text-teal-900">EPI</th>
                        <th className="p-3 text-left font-semibold text-teal-900">CA</th>
                        <th className="p-3 text-center font-semibold text-teal-900">Qtd</th>
                        <th className="p-3 text-left font-semibold text-teal-900">Data Entrega</th>
                        <th className="p-3 text-left font-semibold text-teal-900">Data Devolução</th>
                        <th className="p-3 text-left font-semibold text-teal-900">Motivo</th>
                      </tr></thead>
                      <tbody>
                        {episEntregas.map((e: any) => (
                          <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{e.nomeEpi || "-"}</td>
                            <td className="p-3 font-mono">{e.ca || "-"}</td>
                            <td className="p-3 text-center">{e.quantidade || 1}</td>
                            <td className="p-3">{formatDate(e.dataEntrega)}</td>
                            <td className="p-3">{formatDate(e.dataDevolucao)}</td>
                            <td className="p-3">{e.motivo || "Entrega regular"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ ACIDENTES ============ */}
              <TabsContent value="acidentes" className="mt-4">
                {acidentes.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum acidente de trabalho registrado</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-red-50 border-b">
                        <th className="p-3 text-left font-semibold text-red-900">Data</th>
                        <th className="p-3 text-left font-semibold text-red-900">Hora</th>
                        <th className="p-3 text-left font-semibold text-red-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-red-900">Gravidade</th>
                        <th className="p-3 text-left font-semibold text-red-900">Local</th>
                        <th className="p-3 text-left font-semibold text-red-900">Parte Corpo</th>
                        <th className="p-3 text-center font-semibold text-red-900">Dias Afast.</th>
                        <th className="p-3 text-left font-semibold text-red-900">CAT</th>
                        <th className="p-3 text-left font-semibold text-red-900">Descrição</th>
                      </tr></thead>
                      <tbody>
                        {acidentes.map((a: any) => (
                          <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-3 font-medium">{formatDate(a.dataAcidente)}</td>
                            <td className="p-3">{a.horaAcidente || "-"}</td>
                            <td className="p-3"><Badge variant="outline">{a.tipoAcidente?.replace(/_/g, " ")}</Badge></td>
                            <td className="p-3"><Badge variant={a.gravidade === "Grave" || a.gravidade === "Fatal" ? "destructive" : "secondary"}>{a.gravidade}</Badge></td>
                            <td className="p-3">{a.localAcidente || "-"}</td>
                            <td className="p-3">{a.parteCorpoAtingida || "-"}</td>
                            <td className="p-3 text-center font-semibold">{a.diasAfastamento || 0}</td>
                            <td className="p-3">{a.catNumero || "-"}</td>
                            <td className="p-3 max-w-[200px] truncate">{a.descricao || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ PROCESSOS TRABALHISTAS ============ */}
              <TabsContent value="processos" className="mt-4">
                {processos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum processo trabalhista vinculado</div>
                ) : (
                  <div className="space-y-4">
                    {processos.map((proc: any) => (
                      <Card key={proc.id} className="border-l-4 border-l-red-500">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span className="flex items-center gap-2"><Scale className="h-4 w-4 text-red-500" /> Processo nº {proc.numeroProcesso}</span>
                            <Badge variant={proc.status === "encerrado" ? "secondary" : "destructive"}>{proc.status?.replace(/_/g, " ")}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div><strong className="text-muted-foreground">Vara:</strong> {proc.vara || "-"}</div>
                            <div><strong className="text-muted-foreground">Comarca:</strong> {proc.comarca || "-"}</div>
                            <div><strong className="text-muted-foreground">Tipo:</strong> {proc.tipoAcao?.replace(/_/g, " ")}</div>
                            <div><strong className="text-muted-foreground">Risco:</strong> <Badge variant={proc.risco === "alto" || proc.risco === "critico" ? "destructive" : "outline"}>{proc.risco}</Badge></div>
                            <div><strong className="text-muted-foreground">Valor Causa:</strong> {formatSalario(proc.valorCausa)}</div>
                            <div><strong className="text-muted-foreground">Valor Acordo:</strong> {formatSalario(proc.valorAcordo)}</div>
                            <div><strong className="text-muted-foreground">Distribuição:</strong> {formatDate(proc.dataDistribuicao)}</div>
                            <div><strong className="text-muted-foreground">Próx. Audiência:</strong> {formatDate(proc.dataAudiencia)}</div>
                          </div>
                          {proc.pedidos && Array.isArray(proc.pedidos) && proc.pedidos.length > 0 && (
                            <div className="text-sm"><strong className="text-muted-foreground">Pedidos:</strong> {proc.pedidos.join(", ")}</div>
                          )}
                          {proc.andamentos && proc.andamentos.length > 0 && (
                            <div className="mt-2 border-t pt-2">
                              <p className="text-xs font-bold text-gray-600 mb-1">Andamentos ({proc.andamentos.length})</p>
                              {proc.andamentos.slice(0, 5).map((and: any) => (
                                <div key={and.id} className="flex items-start gap-2 text-xs py-1 border-b border-gray-100 last:border-0">
                                  <span className="text-muted-foreground shrink-0">{formatDate(and.data)}</span>
                                  <Badge variant="outline" className="text-[9px] shrink-0">{and.tipo}</Badge>
                                  <span className="text-gray-700">{and.descricao}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ============ HISTÓRICO FUNCIONAL ============ */}
              <TabsContent value="historico" className="mt-4">
                {historicoFuncional.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum registro de histórico funcional</div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-white">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-green-50 border-b">
                        <th className="p-3 text-left font-semibold text-green-900">Data</th>
                        <th className="p-3 text-left font-semibold text-green-900">Tipo</th>
                        <th className="p-3 text-left font-semibold text-green-900">Valor Anterior</th>
                        <th className="p-3 text-left font-semibold text-green-900">Valor Novo</th>
                        <th className="p-3 text-left font-semibold text-green-900">Descrição</th>
                      </tr></thead>
                      <tbody>
                        {historicoFuncional.map((h: any) => {
                          const tipoLabel: Record<string, string> = { Admissao: "Admissão", Promocao: "Promoção", Transferencia: "Transferência", Mudanca_Funcao: "Mudança de Função", Mudanca_Setor: "Mudança de Setor", Mudanca_Salario: "Alteração Salarial", Afastamento: "Afastamento", Retorno: "Retorno", Ferias: "Férias", Desligamento: "Desligamento", Outros: "Outros" };
                          return (
                            <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{formatDate(h.dataEvento)}</td>
                              <td className="p-3"><Badge variant={h.tipo === "Promocao" || h.tipo === "Mudanca_Salario" ? "default" : h.tipo === "Desligamento" ? "destructive" : "secondary"}>{tipoLabel[h.tipo] || h.tipo}</Badge></td>
                              <td className="p-3 text-muted-foreground">{h.valorAnterior || "-"}</td>
                              <td className="p-3 font-semibold">{h.valorNovo || "-"}</td>
                              <td className="p-3 max-w-[300px]">{h.descricao || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ============ FUNÇÃO / ORDEM DE SERVIÇO ============ */}
              <TabsContent value="funcao" className="mt-4">
                {!funcaoDetalhes ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma descrição de função cadastrada</div>
                ) : (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Briefcase className="h-5 w-5 text-blue-500" />
                          {funcaoDetalhes.nome} {funcaoDetalhes.cbo ? <Badge variant="outline" className="ml-2">CBO: {funcaoDetalhes.cbo}</Badge> : null}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-semibold text-sm text-gray-700 mb-2">Descrição da Função</h4>
                            <div className="bg-gray-50 rounded-lg p-4 border text-sm whitespace-pre-line">{funcaoDetalhes.descricao || "Sem descrição cadastrada"}</div>
                          </div>
                          {funcaoDetalhes.ordemServico && (
                            <div>
                              <h4 className="font-semibold text-sm text-gray-700 mb-2">Ordem de Serviço — NR-1</h4>
                              <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 text-sm whitespace-pre-line">{funcaoDetalhes.ordemServico}</div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
