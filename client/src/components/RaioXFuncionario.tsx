import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { formatCPF, formatMoeda } from "@/lib/formatters";
import { nowBrasilia, todayBrasilia } from "@/lib/dateUtils";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCompany } from "@/contexts/CompanyContext";
import {
  User, Stethoscope, GraduationCap, ClipboardList, ShieldAlert,
  Clock, DollarSign, HardHat, Calendar, MapPin, Phone, Building2, Briefcase, CreditCard,
  Printer, FileDown, X, AlertTriangle, FileText, ArrowLeft, Gift, Timer,
  History, Zap, Scale, Car, TrendingUp, ChevronRight, Activity,
  Palmtree, Shield, FileSignature, Ban
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
  const { selectedCompany } = useCompany();
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
  const avisosPrevios = (raioX as any)?.avisosPrevios || [];
  const ferias = (raioX as any)?.ferias || [];
  const cipa = (raioX as any)?.cipa || [];
  const pjContratos = (raioX as any)?.pjContratos || [];
  const pjPagamentos = (raioX as any)?.pjPagamentos || [];

  const asosVencidos = asos.filter((a: any) => a.status === "VENCIDO").length;
  const asosAVencer = asos.filter((a: any) => a.status?.includes("DIAS PARA VENCER")).length;
  const userName = user?.name || user?.username || "Usuário";
  const dataEmissao = nowBrasilia();

  // Total HE
  const totalHEHoras = horasExtras.reduce((s: number, h: any) => s + parseFloat(h.quantidadeHoras || "0"), 0);
  const totalHEValor = horasExtras.reduce((s: number, h: any) => s + parseFloat(h.valorTotal || "0"), 0);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const logoUrl = selectedCompany?.logoUrl || "https://files.manuscdn.com/user_upload_by_module/session_file/310419663028720190/supdCjdqVnpMeKVZ.png";
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "FC Engenharia";
    const cnpjEmpresa = selectedCompany?.cnpj || "";

    const css = `@page{size:A4 portrait;margin:12mm 15mm 20mm 15mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.4;padding-bottom:40px}.logo-bar{background:#1B2A4A;padding:14px 20px;display:flex;align-items:center;gap:16px;margin-bottom:16px;border-radius:6px}.logo-bar img{height:50px;object-fit:contain}.logo-bar .title{color:white;flex:1}.logo-bar .title h1{font-size:16px;font-weight:bold;letter-spacing:1.5px;margin-bottom:2px}.logo-bar .title p{font-size:10px;opacity:0.85}.logo-bar .info-right{color:white;text-align:right;font-size:9px;opacity:0.9}.logo-bar .info-right p{margin-bottom:2px}.emp-name-bar{background:#f0f4f8;border-left:4px solid #1B2A4A;padding:10px 16px;margin-bottom:14px;border-radius:0 4px 4px 0;display:flex;justify-content:space-between;align-items:center}.emp-name-bar h2{font-size:15px;font-weight:700;color:#1B2A4A}.emp-name-bar .status-badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:600}.section{margin-bottom:10px;page-break-inside:avoid}.section-title{font-size:12px;font-weight:700;color:#1B2A4A;border-bottom:2px solid #2d4a7a;padding-bottom:3px;margin-bottom:6px;display:flex;align-items:center;gap:6px}.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px;margin-bottom:8px}.info-item{font-size:10px}.info-item strong{color:#374151}table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px}th{background:#e8edf4;color:#1B2A4A;font-weight:600;text-align:left;padding:4px 6px;border:1px solid #d1d9e6}td{padding:4px 6px;border:1px solid #e5e7eb}tr:nth-child(even){background:#f9fafb}.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:8px;font-weight:600}.badge-green{background:#dcfce7;color:#166534}.badge-red{background:#fef2f2;color:#991b1b}.badge-yellow{background:#fefce8;color:#854d0e}.badge-blue{background:#e8edf4;color:#1B2A4A}.badge-orange{background:#fff7ed;color:#9a3412}.alert-box{background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:8px 10px;margin-bottom:8px;font-size:9px;color:#991b1b}.footer{position:fixed;bottom:0;left:0;right:0;padding:6px 15mm;border-top:2px solid #1B2A4A;font-size:8px;display:flex;justify-content:space-between;background:white}.lgpd{color:#dc2626;font-weight:600}`;

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Raio-X - ${emp?.nomeCompleto || ""}</title><style>${css}</style></head><body>`;

    // HEADER COM LOGO
    const statusColor = emp?.status === 'Ativo' ? 'background:#dcfce7;color:#166534' : emp?.status === 'Desligado' ? 'background:#fef2f2;color:#991b1b' : emp?.status === 'Ferias' ? 'background:#dbeafe;color:#1e40af' : emp?.status === 'Afastado' ? 'background:#fefce8;color:#854d0e' : 'background:#f3f4f6;color:#374151';
    html += `<div class="logo-bar"><img src="${logoUrl}" alt="Logo" /><div class="title"><h1>RAIO-X DO FUNCION\u00C1RIO</h1><p>${nomeEmpresa.toUpperCase()}${cnpjEmpresa ? ' — CNPJ: ' + cnpjEmpresa : ''}</p></div><div class="info-right"><p>CPF: ${formatCPF(emp?.cpf || "")}</p><p>Status: ${emp?.status || "-"}</p>${(emp as any)?.codigoInterno ? `<p>C\u00F3d: ${(emp as any).codigoInterno}</p>` : ''}<p>${dataEmissao}</p></div></div>`;
    html += `<div class="emp-name-bar">${emp?.fotoUrl ? `<img src="${emp.fotoUrl}" alt="Foto" style="width:60px;height:60px;object-fit:cover;object-position:top;border-radius:50%;border:3px solid #1B2A4A;box-shadow:0 2px 8px rgba(0,0,0,0.15);margin-right:12px;" />` : ''}<h2>${emp?.nomeCompleto || "-"}</h2><span class="status-badge" style="${statusColor}">${emp?.status || "-"}</span></div>`;

    // DADOS PESSOAIS
    html += `<div class="section"><div class="section-title">\u{1F464} Dados Pessoais</div><div class="info-grid">`;
    const campos = [
      ["Fun\u00E7\u00E3o", emp?.funcao || emp?.cargo || "-"],
      ["Setor", emp?.setor || "-"],
      ["Admiss\u00E3o", formatDate(emp?.dataAdmissao)],
      ["Tempo de Empresa", calcTempoEmpresa(emp?.dataAdmissao)],
      ["Sal\u00E1rio Base", formatSalario(emp?.salarioBase)],
      ["Valor/Hora", formatSalario(emp?.valorHora)],
      ["Nascimento", formatDate(emp?.dataNascimento)],
      ["Sexo", emp?.sexo === "M" ? "Masculino" : emp?.sexo === "F" ? "Feminino" : emp?.sexo || "-"],
      ["Estado Civil", emp?.estadoCivil?.replace(/_/g, " ") || "-"],
      ["RG", emp?.rg || "-"],
      ["CTPS", emp?.ctps || "-"],
      ["PIS", emp?.pis || "-"],
      ["Telefone", emp?.telefone || emp?.celular || "-"],
      ["E-mail", emp?.email || "-"],
      ["Contrato", emp?.tipoContrato || "-"],
      ["Banco", emp?.bancoNome || emp?.banco || "-"],
      ["Ag\u00EAncia/Conta", `${emp?.agencia || "-"} / ${emp?.conta || "-"}`],
    ];
    campos.forEach(([label, value]) => { html += `<div class="info-item"><strong>${label}:</strong> ${value}</div>`; });
    html += `</div>`;
    // JORNADA DE TRABALHO - tabela visual ou texto
    if (emp?.jornadaTrabalho && emp.jornadaTrabalho !== '-') {
      const jt = emp.jornadaTrabalho;
      const isJson = typeof jt === 'string' && jt.trim().startsWith('{');
      if (isJson) {
        try {
          const jornada = JSON.parse(jt);
const diasMap: Record<string, string> = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
           const diasOrdem = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
           html += `<div style="margin-top:8px"><strong>Jornada de Trabalho:</strong></div>`;
           html += `<table style="width:100%;margin-top:4px;font-size:11px;border-collapse:collapse"><thead><tr style="background:#e0e7ff">`;
           diasOrdem.forEach(d => { if (jornada[d]) html += `<th style="padding:3px 6px;border:1px solid #c7d2fe;text-align:center">${diasMap[d]}</th>`; });
          html += `</tr></thead><tbody><tr>`;
          diasOrdem.forEach(d => { if (jornada[d]) { const j = jornada[d]; html += `<td style="padding:3px 6px;border:1px solid #c7d2fe;text-align:center">${j.entrada || '-'} - ${j.saida || '-'}</td>`; } });
          html += `</tr></tbody></table>`;
        } catch { html += `<div class="info-item"><strong>Jornada:</strong> ${jt}</div>`; }
      } else {
        html += `<div class="info-item" style="margin-top:4px"><strong>Jornada:</strong> ${jt}</div>`;
      }
    }
    if (emp?.logradouro) html += `<div class="info-item" style="margin-top:2px"><strong>Endere\u00E7o:</strong> ${emp.logradouro}${emp.numero ? `, ${emp.numero}` : ""}${emp.complemento ? ` - ${emp.complemento}` : ""}${emp.bairro ? `, ${emp.bairro}` : ""}${emp.cidade ? ` - ${emp.cidade}` : ""}${emp.estado ? `/${emp.estado}` : ""}${emp.cep ? ` - CEP: ${emp.cep}` : ""}</div>`;
    if (emp?.dataDemissao) html += `<div class="info-item" style="color:#dc2626;margin-top:4px"><strong>Desligado em:</strong> ${formatDate(emp.dataDemissao)}</div>`;
    html += `</div>`;

    // ALERTAS
    if (advertencias.length >= 3) html += `<div class="alert-box"><strong>\u26A0 ALERTA CLT:</strong> ${advertencias.length} advert\u00EAncias registradas. ${advertencias.length >= 4 ? "Recomenda-se an\u00E1lise para poss\u00EDvel Justa Causa (Art. 482 CLT)." : "Pr\u00F3ximo passo: Suspens\u00E3o (Art. 474 CLT)."}</div>`;
    if (acidentes.length > 0) html += `<div class="alert-box" style="background:#fffbeb;border-color:#fde68a;color:#92400e"><strong>\u26A0 Hist\u00F3rico de Acidentes:</strong> ${acidentes.length} acidente(s) de trabalho registrado(s).</div>`;

    // ASOs
    if (asos.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1FA7A} ASOs (${asos.length})</div><table><thead><tr><th>Tipo</th><th>Data Exame</th><th>Validade</th><th>Status</th><th>Vencimento</th><th>Resultado</th><th>M\u00E9dico</th><th>CRM</th></tr></thead><tbody>`;
      asos.forEach((a: any) => {
        const badgeCls = a.status === "VENCIDO" ? "badge-red" : a.status?.includes("DIAS") ? "badge-yellow" : "badge-green";
        html += `<tr><td>${a.tipo}</td><td>${formatDate(a.dataExame)}</td><td>${a.validadeDias || 365} dias</td><td><span class="badge ${badgeCls}">${a.status || "V\u00C1LIDO"}</span></td><td>${formatDate(a.dataVencimento)}</td><td style="color:${a.resultado === "Apto" ? "#166534" : "#991b1b"};font-weight:600">${a.resultado}</td><td>${a.medico || "-"}</td><td>${a.crm || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // TREINAMENTOS
    if (treinamentos.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F393} Treinamentos (${treinamentos.length})</div><table><thead><tr><th>Treinamento</th><th>Norma</th><th>Carga H.</th><th>Realiza\u00E7\u00E3o</th><th>Validade</th><th>Status</th><th>Instrutor</th></tr></thead><tbody>`;
      treinamentos.forEach((t: any) => {
        const badgeCls = t.statusCalculado === "VENCIDO" ? "badge-red" : t.statusCalculado?.includes("DIAS") ? "badge-yellow" : "badge-green";
        html += `<tr><td>${t.nome}</td><td>${t.norma || "-"}</td><td>${t.cargaHoraria || "-"}</td><td>${formatDate(t.dataRealizacao)}</td><td>${formatDate(t.dataValidade)}</td><td><span class="badge ${badgeCls}">${t.statusCalculado || "V\u00C1LIDO"}</span></td><td>${t.instrutor || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ATESTADOS
    if (atestados.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4CB} Atestados (${atestados.length})</div><table><thead><tr><th>Tipo</th><th>Data</th><th>Dias Afast.</th><th>Retorno</th><th>CID</th><th>M\u00E9dico</th><th>Observa\u00E7\u00F5es</th></tr></thead><tbody>`;
      atestados.forEach((a: any) => {
        html += `<tr><td>${a.tipo}</td><td>${formatDate(a.dataEmissao)}</td><td style="text-align:center;font-weight:600">${a.diasAfastamento || 0}</td><td>${formatDate(a.dataRetorno)}</td><td>${a.cid || "-"}</td><td>${a.medico || "-"}</td><td>${a.observacoes || a.descricao || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ADVERT\u00CANCIAS
    if (advertencias.length > 0) {
      html += `<div class="section"><div class="section-title">\u26A0\uFE0F Advert\u00EAncias (${advertencias.length})</div><table><thead><tr><th>Seq.</th><th>Tipo</th><th>Data</th><th>Motivo</th><th>Testemunhas</th><th>Aplicado por</th></tr></thead><tbody>`;
      advertencias.forEach((a: any, idx: number) => {
        const tipo = a.tipoAdvertencia === "Suspensao" ? "Suspens\u00E3o" : a.tipoAdvertencia === "JustaCausa" ? "Justa Causa" : a.tipoAdvertencia;
        html += `<tr><td style="text-align:center;font-weight:700">${a.sequencia || idx + 1}\u00AA</td><td><span class="badge ${a.tipoAdvertencia === "Suspensao" || a.tipoAdvertencia === "JustaCausa" ? "badge-red" : "badge-orange"}">${tipo}</span></td><td>${formatDate(a.dataOcorrencia)}</td><td>${a.motivo || "-"}</td><td>${a.testemunhas || "-"}</td><td>${a.aplicadoPor || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // HORAS EXTRAS
    if (horasExtras.length > 0) {
      html += `<div class="section"><div class="section-title">\u26A1 Horas Extras (${horasExtras.length}) \u2014 Total: ${totalHEHoras.toFixed(1)}h | Custo: ${formatSalario(String(totalHEValor.toFixed(2)))}</div><table><thead><tr><th>Compet\u00EAncia</th><th>Horas</th><th>% Acr\u00E9scimo</th><th>Valor/Hora</th><th>Valor Total</th><th>Descri\u00E7\u00E3o</th></tr></thead><tbody>`;
      horasExtras.forEach((h: any) => {
        html += `<tr><td>${h.mesReferencia}</td><td style="text-align:right;font-weight:600">${h.quantidadeHoras}h</td><td style="text-align:right">${h.percentualAcrescimo || "50"}%</td><td style="text-align:right">${formatSalario(h.valorHoraBase)}</td><td style="text-align:right;font-weight:700;color:#dc2626">${formatSalario(h.valorTotal)}</td><td>${h.descricao || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // EPIs
    if (episEntregas.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F9E4} EPIs Entregues (${episEntregas.length})</div><table><thead><tr><th>EPI</th><th>CA</th><th>Qtd</th><th>Data Entrega</th><th>Data Devolu\u00E7\u00E3o</th><th>Motivo</th></tr></thead><tbody>`;
      episEntregas.forEach((e: any) => {
        html += `<tr><td>${e.nomeEpi || "-"}</td><td>${e.ca || "-"}</td><td style="text-align:center">${e.quantidade || 1}</td><td>${formatDate(e.dataEntrega)}</td><td>${formatDate(e.dataDevolucao)}</td><td>${e.motivo || "Entrega regular"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ACIDENTES
    if (acidentes.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F6A8} Acidentes de Trabalho (${acidentes.length})</div><table><thead><tr><th>Data</th><th>Hora</th><th>Tipo</th><th>Gravidade</th><th>Local</th><th>Parte Corpo</th><th>Dias Afast.</th><th>CAT</th></tr></thead><tbody>`;
      acidentes.forEach((a: any) => {
        html += `<tr><td>${formatDate(a.dataAcidente)}</td><td>${a.horaAcidente || "-"}</td><td>${a.tipoAcidente?.replace(/_/g, " ")}</td><td><span class="badge ${a.gravidade === "Grave" || a.gravidade === "Fatal" ? "badge-red" : "badge-yellow"}">${a.gravidade}</span></td><td>${a.localAcidente || "-"}</td><td>${a.parteCorpoAtingida || "-"}</td><td style="text-align:center;font-weight:600">${a.diasAfastamento || 0}</td><td>${a.catNumero || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // PROCESSOS TRABALHISTAS
    if (processos.length > 0) {
      html += `<div class="section"><div class="section-title">\u2696\uFE0F Processos Trabalhistas (${processos.length})</div><table><thead><tr><th>N\u00FAmero</th><th>Vara</th><th>Comarca</th><th>Tipo A\u00E7\u00E3o</th><th>Risco</th><th>Valor Causa</th><th>Valor Acordo</th><th>Status</th></tr></thead><tbody>`;
      processos.forEach((p: any) => {
        html += `<tr><td>${p.numeroProcesso}</td><td>${p.vara || "-"}</td><td>${p.comarca || "-"}</td><td>${p.tipoAcao?.replace(/_/g, " ") || "-"}</td><td><span class="badge ${p.risco === "alto" || p.risco === "critico" ? "badge-red" : "badge-yellow"}">${p.risco}</span></td><td>${formatSalario(p.valorCausa)}</td><td>${formatSalario(p.valorAcordo)}</td><td>${p.status?.replace(/_/g, " ")}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // HIST\u00D3RICO FUNCIONAL
    if (historicoFuncional.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4C8} Hist\u00F3rico Funcional (${historicoFuncional.length})</div><table><thead><tr><th>Data</th><th>Tipo</th><th>Valor Anterior</th><th>Valor Novo</th><th>Descri\u00E7\u00E3o</th></tr></thead><tbody>`;
      const tipoLabel: Record<string, string> = { Admissao: "Admiss\u00E3o", Promocao: "Promo\u00E7\u00E3o", Transferencia: "Transfer\u00EAncia", Mudanca_Funcao: "Mudan\u00E7a de Fun\u00E7\u00E3o", Mudanca_Setor: "Mudan\u00E7a de Setor", Mudanca_Salario: "Altera\u00E7\u00E3o Salarial", Afastamento: "Afastamento", Retorno: "Retorno", Ferias: "F\u00E9rias", Desligamento: "Desligamento", Outros: "Outros" };
      historicoFuncional.forEach((h: any) => {
        html += `<tr><td>${formatDate(h.dataEvento)}</td><td><span class="badge badge-blue">${tipoLabel[h.tipo] || h.tipo}</span></td><td>${h.valorAnterior || "-"}</td><td style="font-weight:600">${h.valorNovo || "-"}</td><td>${h.descricao || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // PONTO
    if (pontoResumo.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F552} Resumo de Ponto (${pontoResumo.length} meses)</div><table><thead><tr><th>Compet\u00EAncia</th><th>Dias Trab.</th><th>Ajustes Manuais</th></tr></thead><tbody>`;
      pontoResumo.forEach((p: any) => {
        html += `<tr><td>${p.mesReferencia}</td><td style="text-align:center">${p.diasTrabalhados}</td><td style="text-align:center">${p.ajustesManuais || 0}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // FOLHA
    if (folhaPagamento.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4B0} Folha de Pagamento (${folhaPagamento.length})</div><table><thead><tr><th>Compet\u00EAncia</th><th>Sal\u00E1rio Base</th><th>H. Extras</th><th>Descontos</th><th>L\u00EDquido</th><th>Status</th></tr></thead><tbody>`;
      folhaPagamento.forEach((f: any) => {
        html += `<tr><td>${f.mesReferencia}</td><td style="text-align:right">${formatSalario(f.salarioBase)}</td><td style="text-align:right;color:#166534">${formatSalario(f.horasExtrasValor)}</td><td style="text-align:right;color:#dc2626">${formatSalario(f.totalDescontos)}</td><td style="text-align:right;font-weight:700;font-size:11px">${formatSalario(f.salarioLiquido)}</td><td>${f.status}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // AVISO PRÉVIO
    if (avisosPrevios.length > 0) {
      html += `<div class="section"><div class="section-title">\u26A0\uFE0F Aviso Prévio (${avisosPrevios.length})</div><table><thead><tr><th>Tipo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Redução</th><th>Status</th></tr></thead><tbody>`;
      avisosPrevios.forEach((a: any) => {
        const tipoLabel: Record<string, string> = { empregador_trabalhado: 'Empregador (Trabalhado)', empregador_indenizado: 'Empregador (Indenizado)', empregado_trabalhado: 'Empregado (Trabalhado)', empregado_indenizado: 'Empregado (Indenizado)' };
        html += `<tr><td>${tipoLabel[a.tipo] || a.tipo}</td><td>${formatDate(a.dataInicio)}</td><td>${formatDate(a.dataFim)}</td><td>${a.diasAviso || 30}</td><td>${a.reducaoJornada === '2h_dia' ? '2h/dia' : a.reducaoJornada === '7_dias_corridos' ? '7 dias corridos' : 'Nenhuma'}</td><td><span class="badge ${a.status === 'concluido' ? 'badge-green' : a.status === 'cancelado' ? 'badge-red' : 'badge-yellow'}">${a.status}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // FÉRIAS
    if (ferias.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F3D6} Férias (${ferias.length})</div><table><thead><tr><th>Per. Aquisitivo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Abono</th><th>Valor Total</th><th>Status</th></tr></thead><tbody>`;
      ferias.forEach((f: any) => {
        html += `<tr><td>${formatDate(f.periodoAquisitivoInicio)} a ${formatDate(f.periodoAquisitivoFim)}</td><td>${formatDate(f.dataInicio)}</td><td>${formatDate(f.dataFim)}</td><td>${f.diasGozo || 30}</td><td>${f.abonoPecuniario ? 'Sim' : 'Não'}</td><td>${f.valorTotal ? formatSalario(f.valorTotal) : '-'}</td><td><span class="badge ${f.status === 'concluida' ? 'badge-green' : f.status === 'vencida' ? 'badge-red' : f.status === 'em_gozo' ? 'badge-blue' : 'badge-yellow'}">${f.status}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // CIPA
    if (cipa.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F6E1} CIPA (${cipa.length})</div><table><thead><tr><th>Cargo</th><th>Representação</th><th>Mandato</th><th>Estabilidade</th><th>Status</th></tr></thead><tbody>`;
      cipa.forEach((c: any) => {
        html += `<tr><td>${(c.cargoCipa || '').replace(/_/g, ' ')}</td><td>${c.representacao}</td><td>${formatDate(c.mandatoInicio)} a ${formatDate(c.mandatoFim)}</td><td>${formatDate(c.inicioEstabilidade)} a ${formatDate(c.fimEstabilidade)}</td><td><span class="badge ${c.statusMembro === 'Ativo' ? 'badge-green' : 'badge-red'}">${c.statusMembro}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // PJ CONTRATOS
    if (pjContratos.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4DD} Contratos PJ (${pjContratos.length})</div><table><thead><tr><th>Nº Contrato</th><th>Vigência</th><th>Valor Mensal</th><th>Adiant./Fech.</th><th>Status</th></tr></thead><tbody>`;
      pjContratos.forEach((c: any) => {
        html += `<tr><td>${c.numeroContrato || '-'}</td><td>${formatDate(c.dataInicio)} a ${formatDate(c.dataFim)}</td><td>${formatSalario(c.valorMensal || '0')}</td><td>${c.percentualAdiantamento || 40}% / ${c.percentualFechamento || 60}%</td><td><span class="badge ${c.status === 'ativo' ? 'badge-green' : c.status === 'encerrado' ? 'badge-red' : 'badge-yellow'}">${c.status}</span></td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // TIMELINE
    if (timeline.length > 0) {
      html += `<div class="section"><div class="section-title">\u{1F4C5} Timeline (${timeline.length} eventos)</div><table><thead><tr><th>Data</th><th>Tipo</th><th>Descri\u00E7\u00E3o</th></tr></thead><tbody>`;
      timeline.forEach((ev: any) => {
        html += `<tr><td>${formatDate(ev.data)}</td><td><span class="badge badge-blue">${ev.tipo}</span></td><td>${ev.descricao}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // FOOTER
    html += `<div class="footer"><span>ERP RH & DP \u2014 ${nomeEmpresa}</span><span>Gerado por: ${userName} em ${dataEmissao}</span><span class="lgpd">Dados protegidos pela LGPD (Lei 13.709/2018)</span></div></body></html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 600);
  };

  // ===================== FULL SCREEN OVERLAY =====================
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" style={{ width: "100vw", height: "100vh" }}>
      {/* HEADER */}
      <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-3 sm:px-6 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between shadow-lg gap-1 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 h-8 w-8 sm:h-9 sm:w-9 shrink-0">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shrink-0 border-2 border-white/40">
            {emp?.fotoUrl ? (
              <img src={emp.fotoUrl} alt="" className="w-full h-full object-cover object-top" />
            ) : (
              <User className="h-4 w-4 sm:h-6 sm:w-6" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-xl font-bold tracking-tight">RAIO-X DO FUNCIONÁRIO</h1>
            {emp && <p className="text-xs sm:text-sm text-white/80 truncate">{emp.nomeCompleto} — CPF: {formatCPF(emp.cpf)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 ml-auto sm:ml-0">
          <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1 sm:gap-1.5 border border-white/30 text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-9">
            <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Imprimir</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handlePrint} className="text-white hover:bg-white/20 gap-1 sm:gap-1.5 border border-white/30 text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-9">
            <FileDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Gerar PDF</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/20 gap-1 sm:gap-1.5 border border-white/30 text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-9">
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">Voltar</span>
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
          <div className="p-3 sm:p-6 max-w-[1600px] mx-auto space-y-3 sm:space-y-5">
            {/* DADOS PESSOAIS */}
            <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 rounded-xl p-3 sm:p-6 border border-blue-200 shadow-sm">
              <div className="flex items-start gap-3 sm:gap-4">
                {/* FOTO DO COLABORADOR */}
                <div className="shrink-0">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full overflow-hidden border-4 border-blue-300 shadow-md bg-blue-100 flex items-center justify-center">
                    {emp.fotoUrl ? (
                      <img src={emp.fotoUrl} alt="Foto" className="w-full h-full object-cover object-top" />
                    ) : (
                      <span className="text-xl sm:text-3xl font-bold text-blue-400">{emp.nomeCompleto?.charAt(0)}{emp.nomeCompleto?.split(' ').pop()?.charAt(0)}</span>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                    <h2 className="text-lg sm:text-3xl font-bold text-blue-900">{emp.nomeCompleto}</h2>
                    <Badge className={`text-sm px-3 py-1 ${emp.status === "Ativo" ? "bg-green-100 text-green-800" : emp.status === "Desligado" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {emp.status}
                    </Badge>
                    {(emp as any).codigoInterno && (
                      <Badge variant="outline" className="text-sm px-3 py-1 border-blue-300 text-blue-700 font-mono">{(emp as any).codigoInterno}</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-x-4 sm:gap-x-8 gap-y-2 sm:gap-y-3">
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
                  {/* JORNADA DE TRABALHO - tabela visual ou texto */}
                  {emp.jornadaTrabalho && emp.jornadaTrabalho !== '-' && (() => {
                    const jt = emp.jornadaTrabalho;
                    const isJson = typeof jt === 'string' && jt.trim().startsWith('{');
                    if (isJson) {
                      try {
                        const jornada = JSON.parse(jt);
                        const diasMap: Record<string, string> = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
                        const diasOrdem = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
                        const diasAtivos = diasOrdem.filter(d => jornada[d]);
                        if (diasAtivos.length === 0) return null;
                        return (
                          <div className="mt-3 bg-white/60 rounded-lg border border-blue-100 p-3">
                            <p className="text-xs font-bold text-blue-800 uppercase mb-2">Jornada de Trabalho</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="bg-blue-100/80">
                                    {diasAtivos.map(d => (
                                      <th key={d} className="px-3 py-1.5 text-center font-bold text-blue-800 border border-blue-200">{diasMap[d]}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    {diasAtivos.map(d => {
                                      const j = jornada[d];
                                      return (
                                        <td key={d} className="px-2 py-1.5 text-center border border-blue-200 text-gray-700">
                                          <span className="font-semibold">{j.entrada || '-'}</span>
                                          <span className="text-gray-400 mx-0.5">–</span>
                                          <span className="font-semibold">{j.saida || '-'}</span>
                                          {j.intervalo && <div className="text-[10px] text-gray-400">Int: {j.intervalo}</div>}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      } catch { return null; }
                    } else {
                      // Texto simples: "07:00 às 17:00"
                      return (
                        <div className="mt-3 flex items-center gap-2 text-sm text-blue-700">
                          <Clock className="h-4 w-4 shrink-0 text-blue-500" />
                          <span><strong>Jornada:</strong> {jt}</span>
                        </div>
                      );
                    }
                  })()}
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
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-10 gap-1.5 sm:gap-2 mt-3 sm:mt-5">
                {[
                  { label: "ASOs", value: asos.length, tab: "asos", bg: "bg-blue-50 border-blue-200", textColor: "text-blue-700", iconColor: "text-blue-400", icon: Stethoscope },
                  { label: "Vencidos", value: asosVencidos, tab: "asos", bg: "bg-rose-50 border-rose-200", textColor: "text-rose-700", iconColor: "text-rose-400", icon: Stethoscope },
                  { label: "A Vencer", value: asosAVencer, tab: "asos", bg: "bg-amber-50 border-amber-200", textColor: "text-amber-700", iconColor: "text-amber-400", icon: Stethoscope },
                  { label: "Treinamentos", value: treinamentos.length, tab: "trein", bg: "bg-emerald-50 border-emerald-200", textColor: "text-emerald-700", iconColor: "text-emerald-400", icon: GraduationCap },
                  { label: "Atestados", value: atestados.length, tab: "atest", bg: "bg-violet-50 border-violet-200", textColor: "text-violet-700", iconColor: "text-violet-400", icon: ClipboardList },
                  { label: "Advertências", value: advertencias.length, tab: "adv", bg: advertencias.length >= 3 ? "bg-red-50 border-red-300" : "bg-orange-50 border-orange-200", textColor: advertencias.length >= 3 ? "text-red-700" : "text-orange-700", iconColor: advertencias.length >= 3 ? "text-red-400" : "text-orange-400", icon: ShieldAlert },
                  { label: "Ponto", value: pontoResumo.length, tab: "ponto", bg: "bg-sky-50 border-sky-200", textColor: "text-sky-700", iconColor: "text-sky-400", icon: Clock },
                  { label: "EPIs", value: episEntregas.length, tab: "epis", bg: "bg-teal-50 border-teal-200", textColor: "text-teal-700", iconColor: "text-teal-400", icon: HardHat },
                  ...(emp?.tipoContrato === 'PJ'
                    ? [{ label: "Adicionais", value: horasExtras.length, tab: "he", bg: "bg-purple-50 border-purple-200", textColor: "text-purple-700", iconColor: "text-purple-400", icon: Zap }]
                    : [{ label: "Horas Extras", value: horasExtras.length, tab: "he", bg: "bg-amber-50 border-amber-200", textColor: "text-amber-700", iconColor: "text-amber-400", icon: Zap }]),
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

            {/* BANNER LISTA NEGRA */}
            {(emp.listaNegra === 1 || emp.status === 'Lista_Negra') && (
              <div className="bg-red-900 border-2 border-red-600 rounded-xl p-5 flex items-start gap-4 shadow-lg">
                <div className="h-12 w-12 rounded-full bg-red-700 flex items-center justify-center shrink-0">
                  <Ban className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white text-lg tracking-wide">LISTA NEGRA — RECONTRATAÇÃO PROIBIDA</p>
                  <p className="text-sm text-red-200 mt-1">
                    Este colaborador está na <strong className="text-white">Lista Negra</strong> da empresa e <strong className="text-white">NÃO pode ser recontratado</strong>.
                  </p>
                  {(emp as any).motivoListaNegra && (
                    <p className="text-sm text-red-300 mt-2"><strong className="text-red-100">Motivo:</strong> {(emp as any).motivoListaNegra}</p>
                  )}
                  {(emp as any).dataListaNegra && (
                    <p className="text-xs text-red-400 mt-1">Incluído em: {formatDate((emp as any).dataListaNegra)} {(emp as any).listaNegraPor ? `por ${(emp as any).listaNegraPor}` : ''}</p>
                  )}
                </div>
              </div>
            )}

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

            {/* ABAS - Agrupadas por Categoria */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {(() => {
                const tabGroups = [
                  {
                    label: "Geral",
                    color: "indigo",
                    tabs: [
                      { value: "timeline", label: "Timeline", icon: History, count: timeline.length },
                      { value: "historico", label: "Hist. Funcional", icon: TrendingUp, count: historicoFuncional.length },
                      { value: "funcao", label: "Função/OS", icon: FileText, count: funcaoDetalhes ? 1 : 0 },
                    ],
                  },
                  {
                    label: "SST",
                    color: "blue",
                    tabs: [
                      { value: "asos", label: "ASOs", icon: Stethoscope, count: asos.length },
                      { value: "trein", label: "Treinamentos", icon: GraduationCap, count: treinamentos.length },
                      { value: "epis", label: "EPIs", icon: HardHat, count: episEntregas.length },
                      { value: "acidentes", label: "Acidentes", icon: AlertTriangle, count: acidentes.length },
                      { value: "cipa", label: "CIPA", icon: Shield, count: cipa.length },
                    ],
                  },
                  {
                    label: "Financeiro",
                    color: "emerald",
                    tabs: [
                      { value: "ponto", label: "Ponto", icon: Clock, count: pontoResumo.length },
                      { value: "folha", label: "Folha", icon: DollarSign, count: folhaPagamento.length },
                      { value: "he", label: emp?.tipoContrato === 'PJ' ? "Adicionais" : "Horas Extras", icon: Zap, count: horasExtras.length },
                      ...(emp?.tipoContrato === 'PJ' ? [{ value: "pj", label: "PJ", icon: FileSignature, count: pjContratos.length }] : []),
                      { value: "descontos_epi", label: "Descontos EPI", icon: Ban, count: (raioX as any)?.epiDiscountAlerts?.filter((a: any) => a.status === 'pendente').length || 0 },
                    ],
                  },
                  {
                    label: "Disciplinar / Saída",
                    color: "red",
                    tabs: [
                      { value: "atest", label: "Atestados", icon: ClipboardList, count: atestados.length },
                      { value: "adv", label: "Advertências", icon: ShieldAlert, count: advertencias.length },
                      { value: "processos", label: "Processos", icon: Scale, count: processos.length },
                      { value: "aviso", label: "Aviso Prévio", icon: AlertTriangle, count: avisosPrevios.length },
                      { value: "ferias", label: "Férias", icon: Palmtree, count: ferias.length },
                    ],
                  },
                ];

                const activeColorMap: Record<string, string> = {
                  indigo: "bg-indigo-600 text-white shadow-sm",
                  blue: "bg-blue-600 text-white shadow-sm",
                  emerald: "bg-emerald-600 text-white shadow-sm",
                  red: "bg-red-600 text-white shadow-sm",
                };
                const labelColorMap: Record<string, string> = {
                  indigo: "text-indigo-700 border-indigo-300",
                  blue: "text-blue-700 border-blue-300",
                  emerald: "text-emerald-700 border-emerald-300",
                  red: "text-red-700 border-red-300",
                };

                return (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {tabGroups.map((group) => (
                        <div key={group.label}>
                          <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 pb-1 border-b ${labelColorMap[group.color]}`}>
                            {group.label}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {group.tabs.map((tab) => {
                              const Icon = tab.icon;
                              const isActive = activeTab === tab.value;
                              return (
                                <button
                                  key={tab.value}
                                  onClick={() => setActiveTab(tab.value)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap ${
                                    isActive
                                      ? activeColorMap[group.color]
                                      : "bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-100"
                                  }`}
                                >
                                  <Icon className="h-3 w-3 shrink-0" />
                                  <span>{tab.label}</span>
                                  {tab.count > 0 && (
                                    <span className={`ml-0.5 px-1 py-0 rounded-full text-[9px] font-bold leading-tight ${
                                      isActive ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
                                    }`}>{tab.count}</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

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

              {/* ============ HORAS EXTRAS / ADICIONAIS PJ ============ */}
              <TabsContent value="he" className="mt-4">
                {emp?.tipoContrato === 'PJ' ? (
                  /* ---- ADICIONAIS PJ ---- */
                  horasExtras.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">Nenhum adicional registrado</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Total Adicionais</p>
                          <p className="text-2xl font-bold text-purple-600">{horasExtras.length}</p>
                        </CardContent></Card>
                        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Horas Adicionais</p>
                          <p className="text-2xl font-bold text-blue-600">{totalHEHoras.toFixed(1)}h</p>
                        </CardContent></Card>
                        <Card className="border-l-4 border-l-green-500"><CardContent className="p-4">
                          <p className="text-xs text-muted-foreground">Valor Total Adicionais</p>
                          <p className="text-2xl font-bold text-green-600">{formatSalario(String(totalHEValor.toFixed(2)))}</p>
                        </CardContent></Card>
                      </div>
                      <div className="overflow-x-auto rounded-lg border bg-white">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-purple-50 border-b">
                            <th className="p-3 text-left font-semibold text-purple-900">Competência</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Tipo</th>
                            <th className="p-3 text-right font-semibold text-purple-900">Horas</th>
                            <th className="p-3 text-right font-semibold text-purple-900">Valor Total</th>
                            <th className="p-3 text-left font-semibold text-purple-900">Descrição</th>
                          </tr></thead>
                          <tbody>
                            {horasExtras.map((h: any) => (
                              <tr key={h.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-3 font-medium">{h.mesReferencia}</td>
                                <td className="p-3"><span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">{h.descricao?.includes('Comissão') ? 'Comissão' : h.descricao?.includes('Bônus') ? 'Bônus' : 'Adicional'}</span></td>
                                <td className="p-3 text-right font-mono font-semibold text-purple-600">{h.quantidadeHoras}h</td>
                                <td className="p-3 text-right font-mono font-bold text-green-600">{formatSalario(h.valorTotal)}</td>
                                <td className="p-3 max-w-[200px] truncate">{h.descricao || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : (
                  /* ---- HORAS EXTRAS CLT ---- */
                  horasExtras.length === 0 ? (
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
                  )
                )}
              </TabsContent>

              {/* ============ EPIs ============ */}
              <TabsContent value="epis" className="mt-4">
                {episEntregas.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma entrega de EPI registrada</div>
                ) : (
                  <div className="space-y-3">
                    {/* Alerta de descontos pendentes */}
                    {((raioX as any)?.epiDiscountAlerts || []).filter((a: any) => a.status === 'pendente').length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-1">
                          <AlertTriangle className="h-4 w-4" />
                          Descontos Pendentes de EPI
                        </div>
                        <p className="text-xs text-red-600">
                          Este colaborador possui {((raioX as any)?.epiDiscountAlerts || []).filter((a: any) => a.status === 'pendente').length} desconto(s) de EPI pendente(s) de validação pelo DP.
                          Valor total: R$ {((raioX as any)?.epiDiscountAlerts || []).filter((a: any) => a.status === 'pendente').reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toFixed(2)}
                        </p>
                      </div>
                    )}
                    <div className="overflow-x-auto rounded-lg border bg-white">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-teal-50 border-b">
                          <th className="p-3 text-left font-semibold text-teal-900">EPI</th>
                          <th className="p-3 text-left font-semibold text-teal-900">CA</th>
                          <th className="p-3 text-center font-semibold text-teal-900">Tam.</th>
                          <th className="p-3 text-center font-semibold text-teal-900">Qtd</th>
                          <th className="p-3 text-left font-semibold text-teal-900">Data Entrega</th>
                          <th className="p-3 text-left font-semibold text-teal-900">Data Devolução</th>
                          <th className="p-3 text-left font-semibold text-teal-900">Motivo</th>
                          <th className="p-3 text-center font-semibold text-teal-900">Ficha</th>
                        </tr></thead>
                        <tbody>
                          {episEntregas.map((e: any) => {
                            const isMauUso = e.motivo && (e.motivo.includes('Mau Uso') || e.motivo.includes('Perda') || e.motivo.includes('Furto') || e.motivo.includes('Extravio'));
                            const hasLink = !!e.fichaUrl;
                            return (
                              <tr
                                key={e.id}
                                className={`border-b last:border-0 hover:bg-muted/30 ${isMauUso ? 'bg-red-50/50' : ''} ${hasLink ? 'cursor-pointer hover:bg-teal-50/60' : ''}`}
                                onClick={() => { if (hasLink) window.open(e.fichaUrl, '_blank'); }}
                                title={hasLink ? 'Clique para ver a ficha de entrega assinada' : ''}
                              >
                                <td className="p-3 font-medium">
                                  <span className={hasLink ? 'text-teal-700' : ''}>{e.nomeEpi || "-"}</span>
                                </td>
                                <td className="p-3 font-mono">{e.ca || "-"}</td>
                                <td className="p-3 text-center text-xs">{e.tamanho || "-"}</td>
                                <td className="p-3 text-center">{e.quantidade || 1}</td>
                                <td className="p-3">{formatDate(e.dataEntrega)}</td>
                                <td className="p-3">{formatDate(e.dataDevolucao)}</td>
                                <td className="p-3">
                                  <span className={isMauUso ? 'text-red-600 font-semibold' : ''}>{e.motivo || "Entrega regular"}</span>
                                  {isMauUso && e.valorCobranca && <span className="ml-1 text-xs text-red-500">(R$ {parseFloat(e.valorCobranca).toFixed(2)})</span>}
                                </td>
                                <td className="p-3 text-center">
                                  {hasLink ? (
                                    <a href={e.fichaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center justify-center gap-1" title="Ver ficha assinada" onClick={(ev) => ev.stopPropagation()}>
                                      <FileText className="h-4 w-4" /> Ver
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ DESCONTOS EPI ============ */}
              <TabsContent value="descontos_epi" className="mt-4">
                {(() => {
                  const alerts = (raioX as any)?.epiDiscountAlerts || [];
                  if (alerts.length === 0) return <div className="text-center py-12 text-muted-foreground">Nenhum desconto de EPI registrado</div>;
                  const pendentes = alerts.filter((a: any) => a.status === 'pendente');
                  const confirmados = alerts.filter((a: any) => a.status === 'confirmado');
                  const cancelados = alerts.filter((a: any) => a.status === 'cancelado');
                  const motivoLabel = (m: string) => m === 'mau_uso' ? 'Mau Uso / Dano' : m === 'perda' ? 'Perda' : m === 'furto' ? 'Furto / Extravio' : m;
                  return (
                    <div className="space-y-4">
                      {/* Resumo */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-amber-700">{pendentes.length}</p>
                          <p className="text-xs text-amber-600 font-medium">Pendentes</p>
                          <p className="text-xs text-amber-500 mt-1">R$ {pendentes.reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toFixed(2)}</p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-green-700">{confirmados.length}</p>
                          <p className="text-xs text-green-600 font-medium">Confirmados</p>
                          <p className="text-xs text-green-500 mt-1">R$ {confirmados.reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                          <p className="text-2xl font-bold text-gray-500">{cancelados.length}</p>
                          <p className="text-xs text-gray-500 font-medium">Cancelados</p>
                          <p className="text-xs text-gray-400 mt-1">R$ {cancelados.reduce((s: number, a: any) => s + parseFloat(a.valorTotal || '0'), 0).toFixed(2)}</p>
                        </div>
                      </div>
                      {/* Tabela */}
                      <div className="overflow-x-auto rounded-lg border bg-white">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-red-50 border-b">
                            <th className="p-3 text-left font-semibold text-red-900">EPI</th>
                            <th className="p-3 text-left font-semibold text-red-900">Motivo</th>
                            <th className="p-3 text-right font-semibold text-red-900">Qtd</th>
                            <th className="p-3 text-right font-semibold text-red-900">Unit.</th>
                            <th className="p-3 text-right font-semibold text-red-900">Total</th>
                            <th className="p-3 text-left font-semibold text-red-900">Mês Ref.</th>
                            <th className="p-3 text-center font-semibold text-red-900">Status</th>
                            <th className="p-3 text-center font-semibold text-red-900">Ações</th>
                          </tr></thead>
                          <tbody>
                            {alerts.map((a: any) => (
                              <tr key={a.id} className={`border-b last:border-0 hover:bg-muted/30 ${a.status === 'pendente' ? 'bg-amber-50/50' : ''}`}>
                                <td className="p-3 font-medium text-xs">{a.epiNome || "-"}{a.ca ? ` (CA: ${a.ca})` : ''}</td>
                                <td className="p-3 text-xs">{motivoLabel(a.motivoCobranca)}</td>
                                <td className="p-3 text-right font-mono text-xs">{a.quantidade}</td>
                                <td className="p-3 text-right font-mono text-xs">R$ {parseFloat(a.valorUnitario || '0').toFixed(2)}</td>
                                <td className="p-3 text-right font-mono font-bold text-red-600">R$ {parseFloat(a.valorTotal || '0').toFixed(2)}</td>
                                <td className="p-3 text-xs">{a.mesReferencia || "-"}</td>
                                <td className="p-3 text-center">
                                  <Badge variant={a.status === 'pendente' ? 'secondary' : a.status === 'confirmado' ? 'destructive' : 'outline'}
                                    className={`text-xs ${a.status === 'pendente' ? 'bg-amber-100 text-amber-800' : a.status === 'confirmado' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                                    {a.status === 'pendente' ? 'Pendente' : a.status === 'confirmado' ? 'Descontado' : 'Cancelado'}
                                  </Badge>
                                </td>
                                <td className="p-3 text-center">
                                  {a.status === 'pendente' ? (
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => {
                                          if (confirm('Confirmar desconto de R$ ' + parseFloat(a.valorTotal || '0').toFixed(2) + ' na folha do colaborador?')) {
                                            fetch('/api/trpc/epis.validateDiscount', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({ json: { id: a.id, acao: 'confirmado' } }),
                                            }).then(() => window.location.reload());
                                          }
                                        }}
                                        className="px-2 py-1 text-xs font-semibold rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                                        title="Confirmar desconto em folha"
                                      >
                                        Confirmar
                                      </button>
                                      <button
                                        onClick={() => {
                                          const justificativa = prompt('Justificativa para cancelar o desconto:');
                                          if (justificativa && justificativa.trim()) {
                                            fetch('/api/trpc/epis.validateDiscount', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({ json: { id: a.id, acao: 'cancelado', justificativa: justificativa.trim() } }),
                                            }).then(() => window.location.reload());
                                          } else if (justificativa !== null) {
                                            alert('Justificativa obrigatória para cancelar o desconto.');
                                          }
                                        }}
                                        className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                                        title="Cancelar desconto"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      {a.validadoPor ? `${a.validadoPor}` : '-'}
                                      {a.dataValidacao ? ` em ${formatDate(a.dataValidacao)}` : ''}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {cancelados.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-2">
                          {cancelados.map((c: any) => (
                            <div key={c.id} className="flex gap-2 py-1">
                              <span className="font-medium">Cancelado:</span>
                              <span>{c.epiNome}</span>
                              <span className="italic">— {c.justificativa || 'Sem justificativa'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
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
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-blue-500" />
                            {funcaoDetalhes.nome} {funcaoDetalhes.cbo ? <Badge variant="outline" className="ml-2">CBO: {funcaoDetalhes.cbo}</Badge> : null}
                          </CardTitle>
                          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => {
                            const companyName = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || 'Empresa';
                            const empName = emp?.nomeCompleto || 'Colaborador';
                            const empCargo = emp?.funcao || emp?.cargo || funcaoDetalhes.nome || '';
                            const empMatricula = emp?.codigoInterno || emp?.matricula || '';
                            const printW = window.open('', '_blank');
                            if (!printW) return;
                            printW.document.write(`<!DOCTYPE html><html><head><title>Ficha da Função - ${empName}</title>
                              <style>
                                @media print { @page { margin: 15mm; } }
                                body { font-family: Arial, sans-serif; font-size: 12px; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
                                .header { text-align: center; border-bottom: 3px solid #1B2A4A; padding-bottom: 15px; margin-bottom: 20px; }
                                .header h1 { color: #1B2A4A; font-size: 18px; margin: 0; }
                                .header p { color: #666; font-size: 11px; margin: 4px 0 0; }
                                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 20px; }
                                .info-item { font-size: 11px; }
                                .info-item strong { color: #1B2A4A; }
                                .section { margin-bottom: 20px; }
                                .section h2 { font-size: 14px; color: #1B2A4A; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px; }
                                .section-content { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #1B2A4A; white-space: pre-line; line-height: 1.6; }
                                .section-os .section-content { border-left-color: #d97706; background: #fffbeb; }
                                .signature { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
                                .signature div { border-top: 1px solid #333; padding-top: 8px; font-size: 11px; }
                                .footer { text-align: center; font-size: 9px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px; }
                              </style></head><body>
                              <div class="header">
                                <h1>${companyName}</h1>
                                <p>FICHA DA FUNÇÃO — DESCRIÇÃO DE ATIVIDADES E ORDEM DE SERVIÇO (NR-1)</p>
                              </div>
                              <div class="info-grid">
                                <div class="info-item"><strong>Colaborador:</strong> ${empName}</div>
                                <div class="info-item"><strong>eSocial:</strong> ${empMatricula || '-'}</div>
                                <div class="info-item"><strong>Função:</strong> ${funcaoDetalhes.nome}</div>
                                <div class="info-item"><strong>CBO:</strong> ${funcaoDetalhes.cbo || '-'}</div>
                                <div class="info-item"><strong>Setor:</strong> ${emp?.setor || '-'}</div>
                                <div class="info-item"><strong>Data:</strong> ${todayBrasilia()}</div>
                              </div>
                              <div class="section">
                                <h2>Descrição da Função e Atividades</h2>
                                <div class="section-content">${funcaoDetalhes.descricao || 'Sem descrição cadastrada'}</div>
                              </div>
                              ${funcaoDetalhes.ordemServico ? `<div class="section section-os">
                                <h2>Ordem de Serviço — NR-1</h2>
                                <div class="section-content">${funcaoDetalhes.ordemServico}</div>
                              </div>` : ''}
                              <div class="signature">
                                <div>${empName}<br/><small>Colaborador</small></div>
                                <div>Responsável RH<br/><small>${companyName}</small></div>
                              </div>
                              <div class="footer">Documento gerado em ${nowBrasilia()} — ${companyName}</div>
                            </body></html>`);
                            printW.document.close();
                            setTimeout(() => printW.print(), 300);
                          }}>
                            <Printer className="h-3.5 w-3.5" /> Imprimir Ficha
                          </Button>
                        </div>
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

              {/* ============ AVISO PRÉVIO ============ */}
              <TabsContent value="aviso" className="mt-4">
                {avisosPrevios.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum aviso prévio registrado</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" /> Avisos Prévios — {avisosPrevios.length}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Início</th><th className="p-2 text-left">Fim</th><th className="p-2 text-center">Dias</th><th className="p-2 text-left">Redução</th><th className="p-2 text-right">Valor Estimado</th><th className="p-2 text-center">Status</th></tr></thead>
                        <tbody>
                          {avisosPrevios.map((a: any) => {
                            const tipoLabel: Record<string, string> = { empregador_trabalhado: 'Empregador (Trabalhado)', empregador_indenizado: 'Empregador (Indenizado)', empregado_trabalhado: 'Empregado (Trabalhado)', empregado_indenizado: 'Empregado (Indenizado)' };
                            return (
                              <tr key={a.id} className="border-b last:border-0">
                                <td className="p-2 font-medium">{tipoLabel[a.tipo] || a.tipo}</td>
                                <td className="p-2">{formatDate(a.dataInicio)}</td>
                                <td className="p-2">{formatDate(a.dataFim)}</td>
                                <td className="p-2 text-center font-bold">{a.diasAviso || 30}</td>
                                <td className="p-2">{a.reducaoJornada === '2h_dia' ? '2h/dia' : a.reducaoJornada === '7_dias_corridos' ? '7 dias corridos' : 'Nenhuma'}</td>
                                <td className="p-2 text-right font-bold">{a.valorEstimadoTotal ? formatMoeda(a.valorEstimadoTotal) : '-'}</td>
                                <td className="p-2 text-center"><Badge variant={a.status === 'concluido' ? 'default' : a.status === 'cancelado' ? 'destructive' : 'secondary'}>{a.status}</Badge></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ FÉRIAS ============ */}
              <TabsContent value="ferias" className="mt-4">
                {ferias.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum período de férias registrado</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Palmtree className="h-5 w-5 text-cyan-500" /> Férias — {ferias.length} período(s)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Per. Aquisitivo</th><th className="p-2 text-left">Início</th><th className="p-2 text-left">Fim</th><th className="p-2 text-center">Dias</th><th className="p-2 text-center">Abono</th><th className="p-2 text-right">Valor Total</th><th className="p-2 text-center">Status</th></tr></thead>
                        <tbody>
                          {ferias.map((f: any) => (
                            <tr key={f.id} className="border-b last:border-0">
                              <td className="p-2 text-xs">{formatDate(f.periodoAquisitivoInicio)} a {formatDate(f.periodoAquisitivoFim)}</td>
                              <td className="p-2">{formatDate(f.dataInicio)}</td>
                              <td className="p-2">{formatDate(f.dataFim)}</td>
                              <td className="p-2 text-center font-bold">{f.diasGozo || 30}</td>
                              <td className="p-2 text-center">{f.abonoPecuniario ? <Badge>Sim</Badge> : 'Não'}</td>
                              <td className="p-2 text-right font-bold">{f.valorTotal ? formatMoeda(f.valorTotal) : '-'}</td>
                              <td className="p-2 text-center"><Badge variant={f.status === 'concluida' ? 'default' : f.status === 'vencida' ? 'destructive' : f.status === 'em_gozo' ? 'default' : 'secondary'}>{f.status}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ CIPA ============ */}
              <TabsContent value="cipa" className="mt-4">
                {cipa.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhuma participação em CIPA registrada</div>
                ) : (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-green-500" /> CIPA — {cipa.length} mandato(s)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Cargo</th><th className="p-2 text-left">Representação</th><th className="p-2 text-left">Mandato</th><th className="p-2 text-left">Estabilidade</th><th className="p-2 text-center">Status</th></tr></thead>
                        <tbody>
                          {cipa.map((c: any) => (
                            <tr key={c.id} className="border-b last:border-0">
                              <td className="p-2 font-medium">{(c.cargoCipa || '').replace(/_/g, ' ')}</td>
                              <td className="p-2">{c.representacao}</td>
                              <td className="p-2 text-xs">{formatDate(c.mandatoInicio)} a {formatDate(c.mandatoFim)}</td>
                              <td className="p-2 text-xs">{formatDate(c.inicioEstabilidade)} a {formatDate(c.fimEstabilidade)}</td>
                              <td className="p-2 text-center"><Badge variant={c.statusMembro === 'Ativo' ? 'default' : 'destructive'}>{c.statusMembro}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ============ PJ ============ */}
              <TabsContent value="pj" className="mt-4">
                {pjContratos.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Nenhum contrato PJ registrado</div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2"><FileSignature className="h-5 w-5 text-purple-500" /> Contratos PJ — {pjContratos.length}</h3>
                        <Button size="sm" variant="outline" className="gap-1.5 text-purple-700 border-purple-300 hover:bg-purple-50" onClick={() => {
                          const contrato = pjContratos[0];
                          if (!contrato) return;
                          window.location.href = `/contrato-pj/${contrato.id}`;
                        }}>

                          <Printer className="h-4 w-4" /> Gerar Contrato
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Nº Contrato</th><th className="p-2 text-left">Vigência</th><th className="p-2 text-right">Valor Mensal</th><th className="p-2 text-center">Adiant./Fech.</th><th className="p-2 text-center">Status</th></tr></thead>
                          <tbody>
                            {pjContratos.map((c: any) => (
                              <tr key={c.id} className="border-b last:border-0">
                                <td className="p-2 font-mono font-semibold">{c.numeroContrato || '-'}</td>
                                <td className="p-2 text-xs">{formatDate(c.dataInicio)} a {formatDate(c.dataFim)}</td>
                                <td className="p-2 text-right font-bold">{formatMoeda(c.valorMensal || '0')}</td>
                                <td className="p-2 text-center text-xs">{c.percentualAdiantamento || 40}% / {c.percentualFechamento || 60}%</td>
                                <td className="p-2 text-center"><Badge variant={c.status === 'ativo' ? 'default' : c.status === 'encerrado' ? 'destructive' : 'secondary'}>{c.status}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {pjPagamentos.length > 0 && (
                      <div className="bg-white rounded-xl border p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><DollarSign className="h-5 w-5 text-purple-500" /> Pagamentos PJ — {pjPagamentos.length}</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Mês Ref.</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-right">Valor</th><th className="p-2 text-left">Data Pgto</th><th className="p-2 text-center">Status</th></tr></thead>
                            <tbody>
                              {pjPagamentos.map((p: any) => (
                                <tr key={p.id} className="border-b last:border-0">
                                  <td className="p-2">{p.mesReferencia}</td>
                                  <td className="p-2"><Badge variant={p.tipo === 'adiantamento' ? 'secondary' : p.tipo === 'bonificacao' ? 'default' : 'outline'}>{p.tipo}</Badge></td>
                                  <td className="p-2 text-right font-bold">{formatMoeda(p.valor || '0')}</td>
                                  <td className="p-2 text-xs">{formatDate(p.dataPagamento)}</td>
                                  <td className="p-2 text-center"><Badge variant={p.status === 'pago' ? 'default' : p.status === 'cancelado' ? 'destructive' : 'secondary'}>{p.status}</Badge></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
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
