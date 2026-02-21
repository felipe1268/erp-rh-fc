import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { formatCPF } from "@/lib/formatters";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  User, Stethoscope, GraduationCap, ClipboardList, ShieldAlert,
  Clock, DollarSign, HardHat, Calendar, MapPin, Phone, Building2, Briefcase, CreditCard,
  Printer, FileDown, X, AlertTriangle, ExternalLink, FileText
} from "lucide-react";

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function StatusBadge({ status, diasRestantes }: { status: string; diasRestantes: number }) {
  if (status === "VENCIDO") return <Badge variant="destructive" className="text-xs">VENCIDO</Badge>;
  if (status?.includes("DIAS PARA VENCER")) {
    const cor = diasRestantes <= 7 ? "bg-red-100 text-red-800" : diasRestantes <= 30 ? "bg-yellow-100 text-yellow-800" : "bg-orange-100 text-orange-800";
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{status}</span>;
  }
  return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">VÁLIDO</Badge>;
}

interface RaioXProps {
  employeeId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function RaioXFuncionario({ employeeId, open, onClose }: RaioXProps) {
  const { user } = useAuth();
  const { data: raioX, isLoading } = trpc.docs.raioX.useQuery(
    { employeeId: employeeId! },
    { enabled: !!employeeId && open }
  );

  if (!open || !employeeId) return null;

  const emp = raioX?.funcionario;
  const asos = raioX?.asos || [];
  const treinamentos = raioX?.treinamentos || [];
  const atestados = raioX?.atestados || [];
  const advertencias = raioX?.advertencias || [];
  const pontoResumo = raioX?.ponto || [];
  const folhaPagamento = raioX?.folhaPagamento || [];
  const epis = raioX?.epis || [];

  const asosVencidos = asos.filter((a: any) => a.status === "VENCIDO").length;
  const asosAVencer = asos.filter((a: any) => a.status?.includes("DIAS PARA VENCER")).length;
  const userName = user?.name || user?.username || "Usuário";
  const dataEmissao = new Date().toLocaleString("pt-BR");

  // Gerar HTML para impressão/PDF
  const gerarHTMLCompleto = () => {
    const lgpdFooter = `<div class="footer"><span>ERP RH & DP — FC Engenharia</span><span>Documento gerado por: <strong>${userName}</strong> em ${dataEmissao}</span><span class="lgpd">Este documento contém dados pessoais protegidos pela LGPD (Lei 13.709/2018). Uso restrito e confidencial.</span></div>`;
    
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Raio-X - ${emp?.nomeCompleto || ""}</title>
    <style>
      @page { size: A4 portrait; margin: 15mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.4; }
      .header { background: linear-gradient(135deg, #1e40af, #4338ca); color: white; padding: 20px 24px; border-radius: 8px; margin-bottom: 16px; }
      .header h1 { font-size: 20px; margin-bottom: 4px; }
      .header .subtitle { font-size: 12px; opacity: 0.85; }
      .section { margin-bottom: 14px; page-break-inside: avoid; }
      .section-title { font-size: 13px; font-weight: 700; color: #1e40af; border-bottom: 2px solid #3b82f6; padding-bottom: 4px; margin-bottom: 8px; }
      .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; }
      .info-item { font-size: 10.5px; }
      .info-item strong { color: #374151; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { background: #f0f4ff; color: #1e40af; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #dbeafe; }
      td { padding: 5px 8px; border: 1px solid #e5e7eb; }
      tr:nth-child(even) { background: #f9fafb; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; }
      .badge-green { background: #dcfce7; color: #166534; }
      .badge-red { background: #fee2e2; color: #991b1b; }
      .badge-yellow { background: #fef9c3; color: #854d0e; }
      .badge-orange { background: #ffedd5; color: #9a3412; }
      .badge-blue { background: #dbeafe; color: #1e40af; }
      .alerta-box { background: #fef2f2; border: 2px solid #fca5a5; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; }
      .alerta-box strong { color: #991b1b; }
      .alerta-box p { color: #7f1d1d; font-size: 11px; }
      .stats-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; margin-top: 12px; }
      .stat-card { text-align: center; padding: 8px 4px; border-radius: 8px; border: 1px solid #e5e7eb; }
      .stat-card .value { font-size: 18px; font-weight: 700; }
      .stat-card .label { font-size: 9px; color: #6b7280; }
      .footer { position: fixed; bottom: 0; left: 0; right: 0; padding: 8px 15mm; border-top: 2px solid #1e40af; font-size: 9px; display: flex; justify-content: space-between; background: white; }
      .footer .lgpd { color: #dc2626; font-weight: 600; font-size: 8px; }
      @media print { .no-print { display: none !important; } }
    </style></head><body>`;

    // Header
    html += `<div class="header"><h1>RAIO-X DO FUNCIONÁRIO</h1><div class="subtitle">${emp?.nomeCompleto} — CPF: ${formatCPF(emp?.cpf || "")}</div></div>`;

    // Dados Pessoais
    html += `<div class="section"><div class="section-title">Dados Pessoais e Profissionais</div><div class="info-grid">`;
    const campos = [
      { label: "Nome Completo", value: emp?.nomeCompleto },
      { label: "CPF", value: formatCPF(emp?.cpf || "") },
      { label: "RG", value: emp?.rg },
      { label: "Status", value: emp?.status },
      { label: "Função", value: emp?.funcao },
      { label: "Setor", value: emp?.setor },
      { label: "Admissão", value: formatDate(emp?.dataAdmissao) },
      { label: "Telefone", value: emp?.telefone },
      { label: "Salário Base", value: emp?.salarioBase ? `R$ ${Number(emp.salarioBase).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-" },
      { label: "Valor/Hora", value: emp?.valorHora ? `R$ ${Number(emp.valorHora).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-" },
      { label: "Endereço", value: emp?.logradouro ? `${emp.logradouro}${emp.bairro ? `, ${emp.bairro}` : ""}${emp.cidade ? ` - ${emp.cidade}` : ""}` : "-" },
      { label: "Demissão", value: emp?.dataDemissao ? formatDate(emp.dataDemissao) : "-" },
    ];
    campos.forEach(c => { html += `<div class="info-item"><strong>${c.label}:</strong> ${c.value || "-"}</div>`; });
    html += `</div></div>`;

    // Alertas
    if (advertencias.length >= 3) {
      html += `<div class="alerta-box"><strong>⚠ ALERTA CLT — Advertências Progressivas</strong><p>Este colaborador possui ${advertencias.length} advertências. ${advertencias.length >= 4 ? "Recomenda-se análise para possível Justa Causa (Art. 482 CLT)." : "Próximo passo: Suspensão (Art. 474 CLT, máx. 30 dias)."}</p></div>`;
    }

    // ASOs
    if (asos.length > 0) {
      html += `<div class="section"><div class="section-title">ASOs (${asos.length})</div><table><thead><tr><th>Tipo</th><th>Data Exame</th><th>Validade</th><th>Status</th><th>Vencimento</th><th>Resultado</th><th>Médico</th></tr></thead><tbody>`;
      asos.forEach((a: any) => {
        const statusClass = a.status === "VENCIDO" ? "badge-red" : a.status === "VÁLIDO" ? "badge-green" : "badge-yellow";
        html += `<tr><td>${a.tipo}</td><td>${formatDate(a.dataExame)}</td><td>${a.validadeDias} dias</td><td><span class="badge ${statusClass}">${a.status}</span></td><td>${formatDate(a.dataVencimento)}</td><td>${a.resultado || "-"}</td><td>${a.medico || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // Treinamentos
    if (treinamentos.length > 0) {
      html += `<div class="section"><div class="section-title">Treinamentos (${treinamentos.length})</div><table><thead><tr><th>Treinamento</th><th>Norma</th><th>Carga H.</th><th>Realização</th><th>Validade</th><th>Status</th><th>Instrutor</th></tr></thead><tbody>`;
      treinamentos.forEach((t: any) => {
        html += `<tr><td>${t.nome}</td><td>${t.norma || "-"}</td><td>${t.cargaHoraria || "-"}</td><td>${formatDate(t.dataRealizacao)}</td><td>${formatDate(t.dataValidade)}</td><td>${t.statusCalculado || "-"}</td><td>${t.instrutor || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // Atestados
    if (atestados.length > 0) {
      html += `<div class="section"><div class="section-title">Atestados (${atestados.length})</div><table><thead><tr><th>Tipo</th><th>Data</th><th>Dias Afastamento</th><th>Retorno</th><th>CID</th><th>Médico</th></tr></thead><tbody>`;
      atestados.forEach((a: any) => {
        html += `<tr><td>${a.tipo}</td><td>${formatDate(a.dataEmissao)}</td><td style="text-align:center">${a.diasAfastamento || 0}</td><td>${formatDate(a.dataRetorno)}</td><td>${a.cid || "-"}</td><td>${a.medico || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // Advertências
    if (advertencias.length > 0) {
      html += `<div class="section"><div class="section-title">Advertências (${advertencias.length})</div><table><thead><tr><th>Seq.</th><th>Tipo</th><th>Data</th><th>Motivo</th><th>Testemunhas</th><th>Aplicado por</th></tr></thead><tbody>`;
      advertencias.forEach((a: any, idx: number) => {
        const tipo = a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
        html += `<tr><td style="text-align:center">${a.sequencia || idx + 1}ª</td><td><span class="badge ${a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "badge-red" : "badge-orange"}">${tipo}</span></td><td>${formatDate(a.dataOcorrencia)}</td><td>${a.motivo}</td><td>${a.testemunhas || "-"}</td><td>${a.aplicadoPor || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // Ponto
    if (pontoResumo.length > 0) {
      html += `<div class="section"><div class="section-title">Resumo de Ponto (${pontoResumo.length} meses)</div><table><thead><tr><th>Competência</th><th>Dias Trab.</th><th>Horas Trab.</th><th>Horas Extras</th><th>Atrasos</th><th>Faltas</th></tr></thead><tbody>`;
      pontoResumo.forEach((p: any) => {
        html += `<tr><td>${p.mesReferencia}</td><td style="text-align:center">${p.diasTrabalhados}</td><td style="text-align:center">${p.horasTrabalhadas}</td><td style="text-align:center;color:#16a34a;font-weight:600">${p.horasExtras || "0:00"}</td><td style="text-align:center">${p.atrasos || "0:00"}</td><td style="text-align:center">${p.faltas || 0}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // EPIs
    if (epis.length > 0) {
      html += `<div class="section"><div class="section-title">EPIs (${epis.length})</div><table><thead><tr><th>EPI</th><th>CA</th><th>Qtd</th><th>Data Entrega</th><th>Data Devolução</th><th>Status</th></tr></thead><tbody>`;
      epis.forEach((e: any) => {
        html += `<tr><td>${e.nomeEpi || "-"}</td><td>${e.ca || "-"}</td><td style="text-align:center">${e.quantidade || 1}</td><td>${formatDate(e.dataEntrega)}</td><td>${formatDate(e.dataDevolucao)}</td><td>${e.status || "Entregue"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    html += lgpdFooter;
    html += `</body></html>`;
    return html;
  };

  const handlePrint = () => {
    const htmlContent = gerarHTMLCompleto();
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handlePDF = () => {
    const htmlContent = gerarHTMLCompleto();
    const pdfWindow = window.open("", "_blank");
    if (pdfWindow) {
      pdfWindow.document.write(htmlContent);
      pdfWindow.document.close();
      setTimeout(() => {
        pdfWindow.print();
      }, 500);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh] overflow-hidden flex flex-col p-0">
        {/* HEADER FIXO */}
        <DialogHeader className="px-6 pt-4 pb-3 border-b bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-t-lg shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 text-xl text-white">
              <div className="bg-white/20 p-2 rounded-lg">
                <User className="h-6 w-6" />
              </div>
              Raio-X do Funcionário
            </DialogTitle>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1.5">
                      <Printer className="h-4 w-4" /> Imprimir
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Imprimir Raio-X completo</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handlePDF} className="text-white hover:bg-white/20 gap-1.5">
                      <FileDown className="h-4 w-4" /> Gerar PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Gerar PDF do Raio-X</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </DialogHeader>

        {/* CONTEÚDO SCROLLÁVEL */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground text-lg">Carregando dados do funcionário...</div>
          ) : !emp ? (
            <div className="text-center py-20 text-muted-foreground text-lg">Funcionário não encontrado</div>
          ) : (
            <div className="p-6 space-y-5">
              {/* DADOS PESSOAIS - CARD PRINCIPAL */}
              <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 rounded-xl p-5 border border-blue-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h2 className="text-2xl font-bold text-blue-900">{emp.nomeCompleto}</h2>
                      <Badge className={`text-sm px-3 py-1 ${emp.status === "Ativo" ? "bg-green-100 text-green-800" : emp.status === "Desligado" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                        {emp.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-2">
                      {[
                        { icon: CreditCard, label: "CPF", value: formatCPF(emp.cpf) },
                        emp.rg ? { icon: CreditCard, label: "RG", value: emp.rg } : null,
                        emp.funcao ? { icon: Briefcase, label: "Função", value: emp.funcao } : null,
                        emp.setor ? { icon: Building2, label: "Setor", value: emp.setor } : null,
                        emp.telefone ? { icon: Phone, label: "Telefone", value: emp.telefone } : null,
                        emp.dataAdmissao ? { icon: Calendar, label: "Admissão", value: formatDate(emp.dataAdmissao) } : null,
                        emp.salarioBase ? { icon: DollarSign, label: "Salário", value: `R$ ${Number(emp.salarioBase).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` } : null,
                        emp.valorHora ? { icon: Clock, label: "Valor/Hora", value: `R$ ${Number(emp.valorHora).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` } : null,
                      ].filter(Boolean).map((item: any, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-blue-700">
                          <item.icon className="h-4 w-4 shrink-0 text-blue-500" />
                          <span><strong>{item.label}:</strong> {item.value}</span>
                        </div>
                      ))}
                    </div>
                    {emp.logradouro && (
                      <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span>{emp.logradouro}{emp.bairro ? `, ${emp.bairro}` : ""}{emp.cidade ? ` - ${emp.cidade}` : ""}{emp.estado ? `/${emp.estado}` : ""}</span>
                      </div>
                    )}
                    {emp.dataDemissao && <p className="text-sm text-red-600 mt-2 font-medium">Desligado em: {formatDate(emp.dataDemissao)}</p>}
                  </div>
                </div>

                {/* RESUMO RÁPIDO - CARDS */}
                <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-4">
                  {[
                    { label: "ASOs", value: asos.length, bgColor: "bg-blue-100", textColor: "text-blue-700", iconColor: "text-blue-500", icon: Stethoscope },
                    { label: "Vencidos", value: asosVencidos, bgColor: "bg-red-100", textColor: "text-red-700", iconColor: "text-red-500", icon: Stethoscope },
                    { label: "A Vencer", value: asosAVencer, bgColor: "bg-amber-100", textColor: "text-amber-700", iconColor: "text-amber-500", icon: Stethoscope },
                    { label: "Treinamentos", value: treinamentos.length, bgColor: "bg-emerald-100", textColor: "text-emerald-700", iconColor: "text-emerald-500", icon: GraduationCap },
                    { label: "Atestados", value: atestados.length, bgColor: "bg-purple-100", textColor: "text-purple-700", iconColor: "text-purple-500", icon: ClipboardList },
                    { label: "Advertências", value: advertencias.length, bgColor: advertencias.length >= 3 ? "bg-red-200" : "bg-orange-100", textColor: advertencias.length >= 3 ? "text-red-800" : "text-orange-700", iconColor: advertencias.length >= 3 ? "text-red-600" : "text-orange-500", icon: ShieldAlert },
                    { label: "Meses Ponto", value: pontoResumo.length, bgColor: "bg-cyan-100", textColor: "text-cyan-700", iconColor: "text-cyan-500", icon: Clock },
                    { label: "EPIs", value: epis.length, bgColor: "bg-teal-100", textColor: "text-teal-700", iconColor: "text-teal-500", icon: HardHat },
                  ].map(c => (
                    <div key={c.label} className={`${c.bgColor} rounded-xl p-3 text-center border border-white/50 transition-transform hover:scale-105`}>
                      <c.icon className={`h-5 w-5 mx-auto mb-1 ${c.iconColor}`} />
                      <p className={`text-2xl font-bold ${c.textColor}`}>{c.value}</p>
                      <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ALERTAS */}
              {advertencias.length >= 3 && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 animate-pulse-subtle">
                  <AlertTriangle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-800 text-base">ALERTA CLT — Advertências Progressivas</p>
                    <p className="text-sm text-red-700 mt-1">
                      Este colaborador possui <strong>{advertencias.length} advertências</strong>.
                      {advertencias.length >= 4 ? " Recomenda-se análise para possível Justa Causa (Art. 482 CLT)." : " Próximo passo recomendado: Suspensão (Art. 474 CLT, máximo 30 dias)."}
                    </p>
                  </div>
                </div>
              )}
              {asosVencidos > 0 && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
                  <Stethoscope className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-800 text-base">Alerta — ASOs Vencidos</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Este colaborador possui <strong>{asosVencidos} ASO(s) vencido(s)</strong>. É necessário agendar novo exame ocupacional.
                    </p>
                  </div>
                </div>
              )}

              {/* ABAS COM DETALHES */}
              <Tabs defaultValue="asos" className="w-full">
                <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1 rounded-lg">
                  <TabsTrigger value="asos" className="gap-1.5 text-sm font-medium data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800 flex-1 min-w-[120px]">
                    <Stethoscope className="h-4 w-4" /> ASOs ({asos.length})
                  </TabsTrigger>
                  <TabsTrigger value="trein" className="gap-1.5 text-sm font-medium data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-800 flex-1 min-w-[120px]">
                    <GraduationCap className="h-4 w-4" /> Treinamentos ({treinamentos.length})
                  </TabsTrigger>
                  <TabsTrigger value="atest" className="gap-1.5 text-sm font-medium data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800 flex-1 min-w-[120px]">
                    <ClipboardList className="h-4 w-4" /> Atestados ({atestados.length})
                  </TabsTrigger>
                  <TabsTrigger value="adv" className="gap-1.5 text-sm font-medium data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800 flex-1 min-w-[120px]">
                    <ShieldAlert className="h-4 w-4" /> Advertências ({advertencias.length})
                  </TabsTrigger>
                  <TabsTrigger value="ponto" className="gap-1.5 text-sm font-medium data-[state=active]:bg-cyan-100 data-[state=active]:text-cyan-800 flex-1 min-w-[120px]">
                    <Clock className="h-4 w-4" /> Ponto ({pontoResumo.length})
                  </TabsTrigger>
                  <TabsTrigger value="folha" className="gap-1.5 text-sm font-medium data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-800 flex-1 min-w-[120px]">
                    <DollarSign className="h-4 w-4" /> Folha ({folhaPagamento.length})
                  </TabsTrigger>
                  <TabsTrigger value="epis" className="gap-1.5 text-sm font-medium data-[state=active]:bg-teal-100 data-[state=active]:text-teal-800 flex-1 min-w-[120px]">
                    <HardHat className="h-4 w-4" /> EPIs ({epis.length})
                  </TabsTrigger>
                </TabsList>

                {/* ASOs */}
                <TabsContent value="asos" className="mt-4">
                  {asos.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum ASO registrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-blue-50 border-b">
                            <th className="p-3 text-left font-semibold text-blue-900">Tipo</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Data Exame</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Validade</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Status</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Vencimento</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Resultado</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Médico</th>
                            <th className="p-3 text-left font-semibold text-blue-900">CRM</th>
                            <th className="p-3 text-left font-semibold text-blue-900">Exames Realizados</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asos.map((a: any) => (
                            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{a.tipo}</td>
                              <td className="p-3">{formatDate(a.dataExame)}</td>
                              <td className="p-3">{a.validadeDias} dias</td>
                              <td className="p-3"><StatusBadge status={a.status} diasRestantes={a.diasRestantes} /></td>
                              <td className="p-3">{formatDate(a.dataVencimento)}</td>
                              <td className="p-3">
                                <span className={a.resultado === "Apto" ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                                  {a.resultado}
                                </span>
                              </td>
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

                {/* TREINAMENTOS */}
                <TabsContent value="trein" className="mt-4">
                  {treinamentos.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum treinamento registrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-emerald-50 border-b">
                            <th className="p-3 text-left font-semibold text-emerald-900">Treinamento</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Norma</th>
                            <th className="p-3 text-center font-semibold text-emerald-900">Carga H.</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Realização</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Validade</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Status</th>
                            <th className="p-3 text-left font-semibold text-emerald-900">Instrutor</th>
                          </tr>
                        </thead>
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

                {/* ATESTADOS */}
                <TabsContent value="atest" className="mt-4">
                  {atestados.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum atestado registrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-purple-50 border-b">
                            <th className="p-3 text-left font-semibold text-purple-900">Tipo</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Data</th>
                            <th className="p-3 text-center font-semibold text-purple-900">Dias Afastamento</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Retorno</th>
                            <th className="p-3 text-left font-semibold text-purple-900">CID</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Médico</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Arquivo</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Observações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {atestados.map((a: any) => (
                            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{a.tipo}</td>
                              <td className="p-3">{formatDate(a.dataEmissao)}</td>
                              <td className="p-3 text-center font-semibold">{a.diasAfastamento || 0}</td>
                              <td className="p-3">{formatDate(a.dataRetorno)}</td>
                              <td className="p-3">{a.cid || "-"}</td>
                              <td className="p-3">{a.medico || "-"}</td>
                              <td className="p-3">
                                {a.documentoUrl ? (
                                  <a href={a.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                    <FileText className="h-3.5 w-3.5" /> Ver arquivo
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-xs">Sem arquivo</span>
                                )}
                              </td>
                              <td className="p-3 max-w-[250px] truncate">{a.observacoes || a.descricao || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* ADVERTÊNCIAS */}
                <TabsContent value="adv" className="mt-4">
                  {advertencias.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhuma advertência registrada</div>
                  ) : (
                    <div className="space-y-4">
                      {/* Barra de progresso CLT */}
                      <div className="bg-gray-50 rounded-xl p-4 border">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-gray-700">Progressão Disciplinar (CLT)</p>
                          <span className="text-xs text-muted-foreground">Total: {advertencias.length} registro(s)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3].map(n => (
                            <div key={n} className={`flex-1 h-3 rounded-full transition-all ${advertencias.length >= n ? "bg-orange-500" : "bg-gray-200"}`} />
                          ))}
                          <div className={`flex-1 h-3 rounded-full transition-all ${advertencias.some((a: any) => a.tipoAdvertencia === "Suspensao") ? "bg-red-500" : "bg-gray-200"}`} />
                          <div className={`flex-1 h-3 rounded-full transition-all ${advertencias.some((a: any) => a.tipoAdvertencia === "JustaCausa") ? "bg-red-800" : "bg-gray-200"}`} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>1ª Adv.</span><span>2ª Adv.</span><span>3ª Adv.</span><span>Suspensão</span><span>Justa Causa</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-orange-50 border-b">
                              <th className="p-3 text-center font-semibold text-orange-900 w-16">Seq.</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Tipo</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Data</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Motivo</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Origem</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Testemunhas</th>
                              <th className="p-3 text-left font-semibold text-orange-900">Aplicado por</th>
                              <th className="p-3 text-center font-semibold text-orange-900">Documento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {advertencias.map((a: any, idx: number) => (
                              <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.tipoAdvertencia === "Suspensao" ? "bg-red-50" : a.tipoAdvertencia === "JustaCausa" ? "bg-red-100" : ""}`}>
                                <td className="p-3 text-center">
                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "bg-red-200 text-red-800" : "bg-orange-200 text-orange-800"}`}>
                                    {a.sequencia || idx + 1}ª
                                  </span>
                                </td>
                                <td className="p-3">
                                  <Badge variant={a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "destructive" : a.tipoAdvertencia === "Escrita" ? "secondary" : "outline"} className="text-xs">
                                    {a.tipoAdvertencia === "Suspensao" ? "Suspensão" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia}
                                  </Badge>
                                  {a.diasSuspensao && <span className="text-xs text-red-600 ml-1">({a.diasSuspensao} dias)</span>}
                                </td>
                                <td className="p-3">{formatDate(a.dataOcorrencia)}</td>
                                <td className="p-3 max-w-[300px]">{a.motivo}</td>
                                <td className="p-3 text-xs text-muted-foreground">{a.origemModulo === "fechamento_ponto" ? "Fechamento Ponto" : a.origemModulo || "Manual"}</td>
                                <td className="p-3">{a.testemunhas || "-"}</td>
                                <td className="p-3 text-muted-foreground">{a.aplicadoPor || "-"}</td>
                                <td className="p-3 text-center">
                                  {a.documentoUrl ? (
                                    <a href={a.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                      <FileText className="h-4 w-4 inline" />
                                    </a>
                                  ) : "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* PONTO */}
                <TabsContent value="ponto" className="mt-4">
                  {pontoResumo.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum registro de ponto encontrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-cyan-50 border-b">
                            <th className="p-3 text-left font-semibold text-cyan-900">Competência</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Dias Trab.</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Horas Trab.</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Horas Extras</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Atrasos</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Faltas</th>
                            <th className="p-3 text-center font-semibold text-cyan-900">Ajustes Manuais</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pontoResumo.map((p: any) => (
                            <tr key={p.mesReferencia} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{p.mesReferencia}</td>
                              <td className="p-3 text-center">{p.diasTrabalhados}</td>
                              <td className="p-3 text-center font-mono">{p.horasTrabalhadas}</td>
                              <td className="p-3 text-center font-mono text-green-600 font-semibold">{p.horasExtras || "0:00"}</td>
                              <td className="p-3 text-center font-mono text-amber-600">{p.atrasos || "0:00"}</td>
                              <td className="p-3 text-center">{p.faltas || 0}</td>
                              <td className="p-3 text-center">{p.ajustesManuais || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* FOLHA */}
                <TabsContent value="folha" className="mt-4">
                  {folhaPagamento.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum registro de folha de pagamento encontrado</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-indigo-50 border-b">
                            <th className="p-3 text-left font-semibold text-indigo-900">Competência</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">Salário Base</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">H. Extras</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">Descontos</th>
                            <th className="p-3 text-right font-semibold text-indigo-900">Líquido</th>
                            <th className="p-3 text-center font-semibold text-indigo-900">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {folhaPagamento.map((f: any) => (
                            <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{f.mesReferencia}</td>
                              <td className="p-3 text-right font-mono">R$ {Number(f.salarioBase || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right font-mono text-green-600">R$ {Number(f.horasExtrasValor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right font-mono text-red-600">R$ {Number(f.totalDescontos || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right font-mono font-bold text-lg">R$ {Number(f.salarioLiquido || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-center">
                                <Badge variant={f.status === "Pago" ? "default" : "secondary"}>{f.status}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* EPIs */}
                <TabsContent value="epis" className="mt-4">
                  {epis.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhuma entrega de EPI registrada</div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-teal-50 border-b">
                            <th className="p-3 text-left font-semibold text-teal-900">EPI</th>
                            <th className="p-3 text-left font-semibold text-teal-900">CA</th>
                            <th className="p-3 text-center font-semibold text-teal-900">Qtd</th>
                            <th className="p-3 text-left font-semibold text-teal-900">Data Entrega</th>
                            <th className="p-3 text-left font-semibold text-teal-900">Data Devolução</th>
                            <th className="p-3 text-center font-semibold text-teal-900">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {epis.map((e: any) => (
                            <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="p-3 font-medium">{e.nomeEpi || "-"}</td>
                              <td className="p-3">{e.ca || "-"}</td>
                              <td className="p-3 text-center">{e.quantidade || 1}</td>
                              <td className="p-3">{formatDate(e.dataEntrega)}</td>
                              <td className="p-3">{formatDate(e.dataDevolucao)}</td>
                              <td className="p-3 text-center">
                                <Badge variant={e.status === "Entregue" ? "default" : "secondary"}>{e.status || "Entregue"}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
