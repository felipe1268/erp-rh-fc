import { trpc } from "../../lib/trpc";
import { useCompany } from "../../contexts/CompanyContext";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Truck, Wrench, Fuel, Shield, FileText, AlertTriangle, DollarSign, ArrowLeft,
  Activity, ClipboardCheck, Droplets, ParkingCircle, Car, Heart, Calendar,
  TrendingUp, ChevronDown, ChevronUp, ShoppingCart, Scale, Receipt, Camera, Printer,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

function fmt(v: any) { return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d: any) { if (!d) return "—"; const s = String(d).split("T")[0]; return s.split("-").reverse().join("/"); }

const TIPO_CORES: Record<string, { bg: string; icon: any; label: string }> = {
  manutencao: { bg: "bg-orange-500", icon: Wrench, label: "Manutenção" },
  combustivel: { bg: "bg-amber-500", icon: Fuel, label: "Combustível" },
  pedagio: { bg: "bg-blue-500", icon: Receipt, label: "Pedágio" },
  multa: { bg: "bg-red-500", icon: AlertTriangle, label: "Multa" },
  lavagem: { bg: "bg-cyan-500", icon: Droplets, label: "Lavagem" },
  estacionamento: { bg: "bg-purple-500", icon: ParkingCircle, label: "Estacionamento" },
  checklist: { bg: "bg-green-500", icon: ClipboardCheck, label: "Checklist" },
  seguro: { bg: "bg-indigo-500", icon: Shield, label: "Seguro" },
  ipva: { bg: "bg-rose-500", icon: FileText, label: "IPVA" },
  licenciamento: { bg: "bg-teal-500", icon: FileText, label: "Licenciamento" },
  compra: { bg: "bg-violet-500", icon: ShoppingCart, label: "Compra" },
};

type Tab = "resumo" | "timeline" | "manutencoes" | "combustivel" | "custos" | "checklists" | "documentos";

export default function RaioXVeiculo() {
  const { selectedCompany } = useCompany();
  const [, navigate] = useLocation();
  const cId = selectedCompany?.id ?? 0;
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("resumo");
  const [timelineFilter, setTimelineFilter] = useState<string>("todos");
  const [expandedTimeline, setExpandedTimeline] = useState(false);

  const { data: vehicles } = trpc.frotas.listVehicles.useQuery({ companyId: cId }, { enabled: cId > 0 });
  const { data: raioX, isLoading } = trpc.frotas.getVehicleRaioX.useQuery(
    { companyId: cId, vehicleId: vehicleId! },
    { enabled: cId > 0 && !!vehicleId }
  );

  const v = raioX?.vehicle;
  const tco = raioX?.tco;
  const score = raioX?.healthScore ?? 0;
  const alertas = raioX?.alertas ?? [];

  const filteredTimeline = useMemo(() => {
    if (!raioX?.timeline) return [];
    if (timelineFilter === "todos") return raioX.timeline;
    return raioX.timeline.filter((t: any) => t.tipo === timelineFilter);
  }, [raioX?.timeline, timelineFilter]);

  const scoreColor = score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-500" : "text-red-500";
  const scoreBg = score >= 80 ? "from-emerald-500 to-emerald-600" : score >= 50 ? "from-amber-400 to-amber-500" : "from-red-500 to-red-600";

  const tcoPie = tco ? [
    { label: "Combustível", value: tco.combustivel, color: "#f59e0b" },
    { label: "Manutenção", value: tco.manutencao, color: "#f97316" },
    { label: "Pedágios", value: tco.pedagios, color: "#3b82f6" },
    { label: "Seguros", value: tco.seguros, color: "#6366f1" },
    { label: "IPVA", value: tco.ipva, color: "#f43f5e" },
    { label: "Multas", value: tco.multas, color: "#ef4444" },
    { label: "Licenciamento", value: tco.licenciamento, color: "#14b8a6" },
    { label: "Lavagens", value: tco.lavagens, color: "#06b6d4" },
    { label: "Estacionamentos", value: tco.estacionamentos, color: "#8b5cf6" },
  ].filter(i => i.value > 0) : [];

  const tcoTotal = tco?.total || 0;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "resumo", label: "Resumo", icon: Activity },
    { key: "timeline", label: "Timeline", icon: Calendar },
    { key: "manutencoes", label: "Manutenções", icon: Wrench },
    { key: "combustivel", label: "Combustível", icon: Fuel },
    { key: "custos", label: "TCO / Custos", icon: DollarSign },
    { key: "checklists", label: "Checklists", icon: ClipboardCheck },
    { key: "documentos", label: "Documentos", icon: FileText },
  ];

  const handlePrintPDF = useCallback(() => {
    if (!v || !raioX) return;
    const logoUrl = selectedCompany?.logoUrl || "";
    const companyName = selectedCompany?.name || selectedCompany?.nome || "Empresa";
    const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    const rawPhoto = v.foto_url || v.fotoUrl || "";
    const vehiclePhoto = rawPhoto && /^https?:\/\//i.test(rawPhoto) ? escHtml(rawPhoto) : "";
    const now = new Date();
    const dataEmissao = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const manutRows = (raioX.manutencoes || []).map((m: any) => `
      <tr>
        <td>${fmtDate(m.data_manutencao)}</td>
        <td>${m.tipo || "—"}</td>
        <td>${m.descricao || "—"}</td>
        <td class="r">${m.km_na_manutencao ? Number(m.km_na_manutencao).toLocaleString("pt-BR") : "—"}</td>
        <td class="r">R$ ${fmt(m.custo)}</td>
        <td>${m.status || "—"}</td>
      </tr>`).join("");

    const combRows = (raioX.combustivel || []).slice(0, 100).map((f: any) => `
      <tr>
        <td>${fmtDate(f.data)}</td>
        <td class="r">${Number(f.litros || 0).toFixed(1)}</td>
        <td class="r">${f.preco_litro ? Number(f.preco_litro).toFixed(3) : "—"}</td>
        <td class="r">R$ ${fmt(f.valor_total)}</td>
        <td class="r">${f.km_atual ? Number(f.km_atual).toLocaleString("pt-BR") : "—"}</td>
        <td>${f.posto || "—"}</td>
      </tr>`).join("");

    const pedagRows = (raioX.pedagios || []).slice(0, 100).map((t: any) => `
      <tr>
        <td>${fmtDate(t.data)}</td>
        <td>${t.descricao || t.praca_pedagio || "Pedágio"}</td>
        <td>${t.rodovia || "—"}</td>
        <td class="r">R$ ${fmt(t.valor)}</td>
      </tr>`).join("");

    const multaRows = (raioX.multas || []).map((m: any) => `
      <tr>
        <td>${fmtDate(m.data_infracao)}</td>
        <td>${m.descricao || "—"}</td>
        <td>${m.gravidade || "—"}</td>
        <td class="r">R$ ${fmt(m.valor_original)}</td>
        <td>${m.status || "—"}</td>
      </tr>`).join("");

    const seguroRows = (raioX.seguros || []).map((s: any) => `
      <tr>
        <td>${s.seguradora || "—"}</td>
        <td>${s.numero_apolice || "—"}</td>
        <td>${fmtDate(s.data_inicio)} a ${fmtDate(s.data_fim)}</td>
        <td class="r">R$ ${fmt(s.valor_premio)}</td>
        <td>${s.status || "—"}</td>
      </tr>`).join("");

    const checkRows = (raioX.checklists || []).map((c: any) => `
      <tr>
        <td>${fmtDate(c.data_checklist)}</td>
        <td>${c.motorista_nome || "—"}</td>
        <td class="r">${Number(c.score_geral || 0).toFixed(0)}%</td>
        <td>${c.ok_count}/${c.total_count}</td>
        <td>${c.status || "—"}</td>
      </tr>`).join("");

    const tcoItems = tcoPie.map(item => `
      <tr>
        <td><span class="dot" style="background:${item.color}"></span> ${item.label}</td>
        <td class="r">R$ ${fmt(item.value)}</td>
        <td class="r">${tcoTotal > 0 ? ((item.value / tcoTotal) * 100).toFixed(1) : 0}%</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ficha do Veículo — ${v.placa}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; font-size: 11px; line-height: 1.4; }
    @page { size: A4; margin: 15mm 12mm; }
    @media print { .no-print { display: none !important; } }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 15px; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header img { height: 50px; max-width: 160px; object-fit: contain; }
    .header-company { font-size: 14px; font-weight: 700; color: #1e3a5f; }
    .header-right { text-align: right; font-size: 9px; color: #64748b; }
    .title-bar { background: #1e3a5f; color: white; padding: 10px 16px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .title-bar h1 { font-size: 16px; font-weight: 700; }
    .vehicle-photo { width: 70px; height: 70px; border-radius: 8px; object-fit: cover; border: 2px solid rgba(255,255,255,0.3); flex-shrink: 0; }
    .vehicle-photo-placeholder { width: 70px; height: 70px; border-radius: 8px; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 24px; }
    .title-bar .score { background: white; color: #1e3a5f; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
    .info-box label { display: block; font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 2px; }
    .info-box span { font-size: 12px; font-weight: 700; color: #1e293b; }
    .section { margin-bottom: 14px; page-break-inside: avoid; }
    .section-title { font-size: 12px; font-weight: 700; color: #1e3a5f; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f1f5f9; padding: 5px 6px; text-align: left; font-weight: 600; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 4px 6px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) { background: #fafbfc; }
    .r { text-align: right; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
    .tco-total { font-size: 18px; font-weight: 900; color: #1e3a5f; text-align: center; margin: 8px 0; }
    .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi-box { text-align: center; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0; }
    .kpi-box .val { font-size: 16px; font-weight: 800; }
    .kpi-box .lab { font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
    .btn-print { position: fixed; top: 20px; right: 20px; padding: 10px 24px; background: #1e3a5f; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; z-index: 999; }
    .btn-print:hover { background: #2c5282; }
    .empty { color: #94a3b8; text-align: center; padding: 12px; font-style: italic; }
  </style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>

  <div class="header">
    <div class="header-left">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" />` : ""}
      <div>
        <div class="header-company">${companyName}</div>
        <div style="font-size:10px;color:#64748b;">Ficha Completa do Veículo</div>
      </div>
    </div>
    <div class="header-right">
      Emitido em: ${dataEmissao}<br/>
      Sistema ERP — Gestão de Frotas
    </div>
  </div>

  <div class="title-bar">
    ${vehiclePhoto ? `<img src="${vehiclePhoto}" class="vehicle-photo" alt="Foto do veículo" />` : `<div class="vehicle-photo-placeholder">🚗</div>`}
    <div style="flex:1">
      <h1>${v.placa}</h1>
      <div style="font-size:11px;opacity:0.8">${v.marca || ""} ${v.modelo || ""} • ${v.ano_fabricacao || v.anoFabricacao || "—"} • ${v.tipo_veiculo || v.tipoVeiculo || "—"}</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="text-align:right;font-size:10px;">
        <div>KM Atual</div>
        <div style="font-size:14px;font-weight:700;">${Number(v.km_atual || v.kmAtual || 0).toLocaleString("pt-BR")} km</div>
      </div>
      <div class="score">${score}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box"><label>Chassi</label><span>${v.chassi || "—"}</span></div>
    <div class="info-box"><label>Renavam</label><span>${v.renavam || "—"}</span></div>
    <div class="info-box"><label>Cor</label><span>${v.cor || "—"}</span></div>
    <div class="info-box"><label>Combustível</label><span>${v.tipo_combustivel || v.tipoCombustivel || "—"}</span></div>
    <div class="info-box"><label>Status</label><span>${v.status_veiculo || v.statusVeiculo || "Ativo"}</span></div>
    <div class="info-box"><label>Lotação</label><span>${v.lotacao || v.obra_nome || "—"}</span></div>
    <div class="info-box"><label>Proprietário</label><span>${v.proprietario || "Próprio"}</span></div>
    <div class="info-box"><label>Tag Sem Parar</label><span>${v.tag_sem_parar || v.tagSemParar || "—"}</span></div>
  </div>

  <div class="kpi-row">
    <div class="kpi-box" style="background:#fff7ed;border-color:#fdba74;"><div class="val" style="color:#ea580c;">${raioX.manutencoes?.length || 0}</div><div class="lab">Manutenções</div></div>
    <div class="kpi-box" style="background:#fffbeb;border-color:#fcd34d;"><div class="val" style="color:#d97706;">${raioX.combustivel?.length || 0}</div><div class="lab">Abastecimentos</div></div>
    <div class="kpi-box" style="background:#fef2f2;border-color:#fca5a5;"><div class="val" style="color:#dc2626;">${raioX.multas?.length || 0}</div><div class="lab">Multas</div></div>
    <div class="kpi-box" style="background:#f0fdf4;border-color:#86efac;"><div class="val" style="color:#16a34a;">${raioX.checklists?.length || 0}</div><div class="lab">Checklists</div></div>
    <div class="kpi-box" style="background:#eff6ff;border-color:#93c5fd;"><div class="val" style="color:#1e3a5f;">R$ ${fmt(tcoTotal)}</div><div class="lab">TCO Total</div></div>
  </div>

  ${tcoItems ? `
  <div class="section">
    <div class="section-title">💰 Composição do TCO (Custo Total de Propriedade)</div>
    <div class="tco-total">R$ ${fmt(tcoTotal)}</div>
    <table>
      <thead><tr><th>Categoria</th><th class="r">Valor</th><th class="r">%</th></tr></thead>
      <tbody>${tcoItems}</tbody>
    </table>
  </div>` : ""}

  ${manutRows ? `
  <div class="section">
    <div class="section-title">🔧 Histórico de Manutenções (${raioX.manutencoes?.length || 0})</div>
    <table>
      <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="r">KM</th><th class="r">Custo</th><th>Status</th></tr></thead>
      <tbody>${manutRows}</tbody>
    </table>
  </div>` : `<div class="section"><div class="section-title">🔧 Manutenções</div><div class="empty">Nenhuma manutenção registrada</div></div>`}

  ${combRows ? `
  <div class="section">
    <div class="section-title">⛽ Histórico de Abastecimentos (${raioX.combustivel?.length || 0})</div>
    <table>
      <thead><tr><th>Data</th><th class="r">Litros</th><th class="r">R$/L</th><th class="r">Total</th><th class="r">KM</th><th>Posto</th></tr></thead>
      <tbody>${combRows}</tbody>
    </table>
  </div>` : `<div class="section"><div class="section-title">⛽ Abastecimentos</div><div class="empty">Nenhum abastecimento registrado</div></div>`}

  ${pedagRows ? `
  <div class="section">
    <div class="section-title">🛣️ Pedágios (${raioX.pedagios?.length || 0})</div>
    <table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Rodovia</th><th class="r">Valor</th></tr></thead>
      <tbody>${pedagRows}</tbody>
    </table>
  </div>` : ""}

  ${multaRows ? `
  <div class="section">
    <div class="section-title">🚨 Multas (${raioX.multas?.length || 0})</div>
    <table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Gravidade</th><th class="r">Valor</th><th>Status</th></tr></thead>
      <tbody>${multaRows}</tbody>
    </table>
  </div>` : ""}

  ${seguroRows ? `
  <div class="section">
    <div class="section-title">🛡️ Seguros (${raioX.seguros?.length || 0})</div>
    <table>
      <thead><tr><th>Seguradora</th><th>Apólice</th><th>Vigência</th><th class="r">Prêmio</th><th>Status</th></tr></thead>
      <tbody>${seguroRows}</tbody>
    </table>
  </div>` : ""}

  ${checkRows ? `
  <div class="section">
    <div class="section-title">✅ Checklists (${raioX.checklists?.length || 0})</div>
    <table>
      <thead><tr><th>Data</th><th>Motorista</th><th class="r">Score</th><th>Conformes</th><th>Status</th></tr></thead>
      <tbody>${checkRows}</tbody>
    </table>
  </div>` : ""}

  <div class="footer">
    <span>${companyName} — Gestão de Frotas</span>
    <span>Veículo: ${v.placa} | Emitido: ${dataEmissao}</span>
  </div>
</body>
</html>`;

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
    }
  }, [v, raioX, selectedCompany, score, tcoPie, tcoTotal]);

  if (!vehicleId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white p-6 rounded-b-2xl shadow-lg">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-xl" onClick={() => navigate("/frotas/painel")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="p-2 rounded-xl bg-white/10"><Car className="h-6 w-6" /></div>
              <h1 className="text-2xl font-bold tracking-tight">Raio-X do Veículo</h1>
            </div>
            <p className="text-cyan-100 text-sm">Selecione um veículo para visualizar seu histórico completo</p>
          </div>
        </div>
        <div className="max-w-4xl mx-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {(vehicles || []).filter((v: any) => v.statusVeiculo === "Ativo").map((v: any) => (
              <Card key={v.id} className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] border-0 shadow-md overflow-hidden" onClick={() => setVehicleId(v.id)}>
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    <div className="w-20 h-20 flex-shrink-0 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center overflow-hidden">
                      {(v.foto_url || v.fotoUrl) ? (
                        <img src={v.foto_url || v.fotoUrl} alt={v.placa} className="w-full h-full object-cover" />
                      ) : (
                        <Truck className="h-7 w-7 text-slate-400" />
                      )}
                    </div>
                    <div className="p-3 flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 dark:text-white">{v.placa}</p>
                      <p className="text-xs text-slate-500 truncate">{v.marca} {v.modelo}</p>
                      <p className="text-[10px] text-slate-400">{v.tipoVeiculo} • {v.anoFabricacao || '—'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] text-white p-6 rounded-b-2xl shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-xl" onClick={() => { setVehicleId(null); setTab("resumo"); }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="w-14 h-14 rounded-xl bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
              {(v?.foto_url || v?.fotoUrl) ? (
                <img src={v.foto_url || v.fotoUrl} alt={v?.placa} className="w-full h-full object-cover" />
              ) : (
                <Car className="h-6 w-6" />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Raio-X — {v?.placa || "..."}</h1>
              <p className="text-cyan-100 text-sm">{v?.marca} {v?.modelo} • {v?.ano_fabricacao || v?.anoFabricacao || "—"} • {v?.tipo_veiculo || v?.tipoVeiculo || "—"}</p>
            </div>
            {v && (
              <div className="ml-auto flex items-center gap-3">
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 rounded-xl gap-1.5" onClick={handlePrintPDF}>
                  <Printer className="h-4 w-4" />
                  <span className="hidden sm:inline text-xs">Imprimir PDF</span>
                </Button>
                <div className="text-right">
                  <p className="text-xs text-cyan-200">KM Atual</p>
                  <p className="text-lg font-bold">{Number(v.km_atual || v.kmAtual || 0).toLocaleString("pt-BR")} km</p>
                </div>
                <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${scoreBg} flex items-center justify-center shadow-lg`}>
                  <div className="text-center">
                    <p className="text-xl font-black">{score}</p>
                    <p className="text-[8px] font-medium -mt-1">SAÚDE</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {tabs.map(t => (
              <button key={t.key}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${tab === t.key ? "bg-white text-[#1e3a5f] shadow-md" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
                onClick={() => setTab(t.key)}
              >
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {isLoading && <div className="text-center py-20 text-slate-400">Carregando dados do veículo...</div>}

        {!isLoading && raioX && tab === "resumo" && (
          <>
            {alertas.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {alertas.map((a: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 p-3 rounded-xl border ${a.nivel === "critico" ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800" : "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800"}`}>
                    <AlertTriangle className={`h-4 w-4 shrink-0 ${a.nivel === "critico" ? "text-red-500" : "text-amber-500"}`} />
                    <span className={`text-xs font-medium ${a.nivel === "critico" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>{a.mensagem}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {[
                { label: "Manutenções", value: raioX.manutencoes?.length || 0, icon: Wrench, color: "from-orange-500 to-orange-600" },
                { label: "Abastecimentos", value: raioX.combustivel?.length || 0, icon: Fuel, color: "from-amber-500 to-amber-600" },
                { label: "Multas", value: raioX.multas?.length || 0, icon: AlertTriangle, color: "from-red-500 to-red-600" },
                { label: "Checklists", value: raioX.checklists?.length || 0, icon: ClipboardCheck, color: "from-green-500 to-green-600" },
                { label: "TCO Total", value: `R$ ${fmt(tcoTotal)}`, icon: DollarSign, color: "from-[#1e3a5f] to-[#2c5282]" },
              ].map((kpi, i) => (
                <Card key={i} className="border-0 shadow-md overflow-hidden">
                  <CardContent className="p-0">
                    <div className={`bg-gradient-to-r ${kpi.color} px-3 py-2 flex items-center gap-2`}>
                      <kpi.icon className="h-4 w-4 text-white/80" />
                      <span className="text-[10px] text-white/90 font-medium">{kpi.label}</span>
                    </div>
                    <div className="p-3">
                      <p className="text-lg font-bold text-slate-800 dark:text-white">{kpi.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Heart className="h-4 w-4 text-red-500" /> Score de Saúde</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${scoreBg} flex items-center justify-center shadow-lg`}>
                      <div className="text-center text-white">
                        <p className="text-3xl font-black">{score}</p>
                        <p className="text-[10px]">/ 100</p>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <p className={scoreColor + " font-semibold"}>
                        {score >= 80 ? "Veículo em ótimas condições" : score >= 50 ? "Requer atenção em alguns pontos" : "Situação crítica — ações urgentes necessárias"}
                      </p>
                      <p>Checklist: {raioX.checklists?.length > 0 ? `Último em ${fmtDate(raioX.checklists[0]?.data_checklist)}` : "Nenhum realizado"}</p>
                      <p>Manutenções pendentes: {raioX.manutencoes?.filter((m: any) => m.status === "agendada").length || 0}</p>
                      <p>Multas pendentes: {raioX.multas?.filter((m: any) => m.status === "pendente").length || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4 text-emerald-500" /> Composição do TCO</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {tcoPie.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-slate-600 dark:text-slate-400 flex-1">{item.label}</span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-white">R$ {fmt(item.value)}</span>
                        <span className="text-[10px] text-slate-400 w-10 text-right">{tcoTotal > 0 ? ((item.value / tcoTotal) * 100).toFixed(0) : 0}%</span>
                      </div>
                    ))}
                    {tcoPie.length === 0 && <p className="text-xs text-slate-400">Nenhum custo registrado</p>}
                    {tcoTotal > 0 && (
                      <div className="mt-2">
                        <div className="flex h-3 rounded-full overflow-hidden">
                          {tcoPie.map((item, i) => (
                            <div key={i} style={{ width: `${(item.value / tcoTotal) * 100}%`, backgroundColor: item.color }} className="transition-all" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-500" /> Últimos Eventos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(raioX.timeline || []).slice(0, 8).map((ev: any, i: number) => {
                    const tc = TIPO_CORES[ev.tipo] || { bg: "bg-gray-500", icon: Activity, label: ev.tipo };
                    const Icon = tc.icon;
                    return (
                      <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <div className={`w-8 h-8 rounded-lg ${tc.bg} flex items-center justify-center`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 dark:text-white truncate">{ev.descricao}</p>
                          <p className="text-[10px] text-slate-400">{fmtDate(ev.data)} • {tc.label}</p>
                        </div>
                        {ev.valor > 0 && <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">R$ {fmt(ev.valor)}</span>}
                      </div>
                    );
                  })}
                  {(!raioX.timeline || raioX.timeline.length === 0) && <p className="text-xs text-slate-400 text-center py-4">Nenhum evento registrado</p>}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!isLoading && raioX && tab === "timeline" && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-500" /> Timeline Completa</CardTitle>
                <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                  <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Tipos</SelectItem>
                    {Object.entries(TIPO_CORES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                <div className="space-y-0">
                  {(expandedTimeline ? filteredTimeline : filteredTimeline.slice(0, 30)).map((ev: any, i: number) => {
                    const tc = TIPO_CORES[ev.tipo] || { bg: "bg-gray-500", icon: Activity, label: ev.tipo };
                    const Icon = tc.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 pl-1 py-2 relative">
                        <div className={`w-8 h-8 rounded-full ${tc.bg} flex items-center justify-center z-10 shrink-0 shadow-sm`}>
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">{tc.label}</Badge>
                            <span className="text-[10px] text-slate-400">{fmtDate(ev.data)}</span>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 truncate">{ev.descricao}</p>
                        </div>
                        {ev.valor > 0 && <span className="text-xs font-semibold text-slate-500 pt-1.5">R$ {fmt(ev.valor)}</span>}
                      </div>
                    );
                  })}
                </div>
                {filteredTimeline.length > 30 && !expandedTimeline && (
                  <Button variant="ghost" className="w-full mt-2 text-xs" onClick={() => setExpandedTimeline(true)}>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" /> Ver mais {filteredTimeline.length - 30} eventos
                  </Button>
                )}
                {expandedTimeline && filteredTimeline.length > 30 && (
                  <Button variant="ghost" className="w-full mt-2 text-xs" onClick={() => setExpandedTimeline(false)}>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" /> Recolher
                  </Button>
                )}
                {filteredTimeline.length === 0 && <p className="text-xs text-slate-400 text-center py-8">Nenhum evento encontrado</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && raioX && tab === "manutencoes" && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4 text-orange-500" /> Histórico de Manutenções ({raioX.manutencoes?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left p-2 font-semibold text-slate-500">Data</th>
                      <th className="text-left p-2 font-semibold text-slate-500">Tipo</th>
                      <th className="text-left p-2 font-semibold text-slate-500">Descrição</th>
                      <th className="text-right p-2 font-semibold text-slate-500">KM</th>
                      <th className="text-right p-2 font-semibold text-slate-500">Custo</th>
                      <th className="text-left p-2 font-semibold text-slate-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(raioX.manutencoes || []).map((m: any) => (
                      <tr key={m.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2">{fmtDate(m.data_manutencao)}</td>
                        <td className="p-2"><Badge variant="outline" className={`text-[9px] ${m.tipo === "preventiva" ? "border-blue-300 text-blue-700" : "border-orange-300 text-orange-700"}`}>{m.tipo}</Badge></td>
                        <td className="p-2 max-w-[300px] truncate">{m.descricao}</td>
                        <td className="p-2 text-right">{m.km_na_manutencao ? Number(m.km_na_manutencao).toLocaleString("pt-BR") : "—"}</td>
                        <td className="p-2 text-right font-semibold">R$ {fmt(m.custo)}</td>
                        <td className="p-2"><Badge variant="outline" className={`text-[9px] ${m.status === "realizada" ? "border-green-300 text-green-700 bg-green-50" : m.status === "agendada" ? "border-blue-300 text-blue-700 bg-blue-50" : "border-amber-300 text-amber-700 bg-amber-50"}`}>{m.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!raioX.manutencoes || raioX.manutencoes.length === 0) && <p className="text-xs text-slate-400 text-center py-6">Nenhuma manutenção registrada</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && raioX && tab === "combustivel" && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Fuel className="h-4 w-4 text-amber-500" /> Histórico de Abastecimentos ({raioX.combustivel?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {raioX.combustivel?.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-100 dark:border-amber-800 text-center">
                    <p className="text-[10px] text-amber-600">Total Litros</p>
                    <p className="text-lg font-bold text-amber-700">{raioX.combustivel.reduce((s: number, f: any) => s + Number(f.litros || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}L</p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-800 text-center">
                    <p className="text-[10px] text-emerald-600">Consumo Médio</p>
                    <p className="text-lg font-bold text-emerald-700">{(() => { const c = raioX.combustivel.filter((f: any) => Number(f.consumo_km_l) > 0); return c.length > 0 ? (c.reduce((s: number, f: any) => s + Number(f.consumo_km_l), 0) / c.length).toFixed(1) : "—"; })()} km/L</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-800 text-center">
                    <p className="text-[10px] text-blue-600">Gasto Total</p>
                    <p className="text-lg font-bold text-blue-700">R$ {fmt(tco?.combustivel)}</p>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left p-2 font-semibold text-slate-500">Data</th>
                      <th className="text-right p-2 font-semibold text-slate-500">Litros</th>
                      <th className="text-right p-2 font-semibold text-slate-500">R$/L</th>
                      <th className="text-right p-2 font-semibold text-slate-500">Total</th>
                      <th className="text-right p-2 font-semibold text-slate-500">KM</th>
                      <th className="text-right p-2 font-semibold text-slate-500">km/L</th>
                      <th className="text-left p-2 font-semibold text-slate-500">Posto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(raioX.combustivel || []).slice(0, 50).map((f: any) => (
                      <tr key={f.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2">{fmtDate(f.data)}</td>
                        <td className="p-2 text-right">{Number(f.litros).toFixed(1)}</td>
                        <td className="p-2 text-right">{f.preco_litro ? Number(f.preco_litro).toFixed(3) : "—"}</td>
                        <td className="p-2 text-right font-semibold">R$ {fmt(f.valor_total)}</td>
                        <td className="p-2 text-right">{f.km_atual ? Number(f.km_atual).toLocaleString("pt-BR") : "—"}</td>
                        <td className="p-2 text-right">{f.consumo_km_l && Number(f.consumo_km_l) > 0 ? Number(f.consumo_km_l).toFixed(1) : "—"}</td>
                        <td className="p-2 truncate max-w-[150px]">{f.posto || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!raioX.combustivel || raioX.combustivel.length === 0) && <p className="text-xs text-slate-400 text-center py-6">Nenhum abastecimento registrado</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && raioX && tab === "custos" && (
          <div className="space-y-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-500" /> Custo Total de Propriedade (TCO)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-4">
                  <p className="text-3xl font-black text-slate-800 dark:text-white">R$ {fmt(tcoTotal)}</p>
                  <p className="text-xs text-slate-400 mt-1">Soma de todos os custos registrados</p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {tcoPie.map((item, i) => (
                    <div key={i} className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                      <div className="w-4 h-4 rounded-full mx-auto mb-1" style={{ backgroundColor: item.color }} />
                      <p className="text-[10px] text-slate-500">{item.label}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-white">R$ {fmt(item.value)}</p>
                      <p className="text-[9px] text-slate-400">{tcoTotal > 0 ? ((item.value / tcoTotal) * 100).toFixed(1) : 0}%</p>
                    </div>
                  ))}
                </div>
                {tcoTotal > 0 && (
                  <div className="mt-4">
                    <div className="flex h-6 rounded-xl overflow-hidden shadow-inner">
                      {tcoPie.map((item, i) => (
                        <div key={i} style={{ width: `${(item.value / tcoTotal) * 100}%`, backgroundColor: item.color }} className="transition-all relative group">
                          <div className="absolute inset-0 flex items-center justify-center">
                            {(item.value / tcoTotal) * 100 > 8 && <span className="text-[9px] text-white font-bold">{((item.value / tcoTotal) * 100).toFixed(0)}%</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Pedágios e Sem Parar ({raioX.pedagios?.length || 0})</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {(raioX.pedagios || []).slice(0, 20).map((t: any) => (
                      <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <Receipt className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{t.descricao || t.praca_pedagio || "Pedágio"}</p>
                          <p className="text-[10px] text-slate-400">{fmtDate(t.data)}</p>
                        </div>
                        <span className="text-xs font-semibold">R$ {fmt(t.valor)}</span>
                      </div>
                    ))}
                    {(!raioX.pedagios || raioX.pedagios.length === 0) && <p className="text-xs text-slate-400 text-center py-4">Sem registros</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Multas ({raioX.multas?.length || 0})</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {(raioX.multas || []).map((m: any) => (
                      <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${m.status === "paga" ? "text-green-500" : "text-red-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs truncate">{m.descricao}</p>
                          <p className="text-[10px] text-slate-400">{fmtDate(m.data_infracao)} • {m.gravidade}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold">R$ {fmt(m.valor_original)}</span>
                          <Badge variant="outline" className={`ml-1 text-[8px] ${m.status === "paga" ? "border-green-300 text-green-700" : "border-red-300 text-red-700"}`}>{m.status}</Badge>
                        </div>
                      </div>
                    ))}
                    {(!raioX.multas || raioX.multas.length === 0) && <p className="text-xs text-slate-400 text-center py-4">Sem multas</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!isLoading && raioX && tab === "checklists" && (
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-green-500" /> Histórico de Checklists ({raioX.checklists?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(raioX.checklists || []).map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${Number(c.score_geral) >= 80 ? "bg-gradient-to-br from-green-500 to-green-600" : Number(c.score_geral) >= 50 ? "bg-gradient-to-br from-amber-400 to-amber-500" : "bg-gradient-to-br from-red-500 to-red-600"}`}>
                      {Number(c.score_geral || 0).toFixed(0)}%
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-800 dark:text-white">{fmtDate(c.data_checklist)} — {c.motorista_nome || "—"}</p>
                      <p className="text-[10px] text-slate-400">{c.ok_count}/{c.total_count} itens conformes • KM: {c.km_atual ? Number(c.km_atual).toLocaleString("pt-BR") : "—"}</p>
                    </div>
                    <Badge variant="outline" className={`text-[9px] ${c.status === "preenchido" ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}`}>{c.status}</Badge>
                  </div>
                ))}
                {(!raioX.checklists || raioX.checklists.length === 0) && <p className="text-xs text-slate-400 text-center py-6">Nenhum checklist realizado</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && raioX && tab === "documentos" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-indigo-500" /> Seguros ({raioX.seguros?.length || 0})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(raioX.seguros || []).map((s: any) => (
                    <div key={s.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">{s.seguradora}</p>
                        <Badge variant="outline" className={`text-[9px] ${s.status === "ativa" ? "border-green-300 text-green-700" : "border-red-300 text-red-700"}`}>{s.status}</Badge>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Apólice: {s.numero_apolice || "—"} • {fmtDate(s.data_inicio)} a {fmtDate(s.data_fim)}</p>
                      <p className="text-[10px] text-slate-400">Prêmio: R$ {fmt(s.valor_premio)} • Franquia: R$ {fmt(s.franquia)}</p>
                    </div>
                  ))}
                  {(!raioX.seguros || raioX.seguros.length === 0) && <p className="text-xs text-slate-400 text-center py-4">Sem seguros registrados</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Scale className="h-4 w-4 text-rose-500" /> IPVA e Licenciamento</CardTitle></CardHeader>
              <CardContent>
                <p className="text-[10px] text-slate-500 font-semibold mb-2">IPVA</p>
                <div className="space-y-1.5 mb-3">
                  {(raioX.ipva || []).map((i: any) => (
                    <div key={i.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <span className="text-xs font-medium w-10">{i.ano_referencia}</span>
                      <span className="text-xs flex-1">R$ {fmt(i.valor_total)}</span>
                      <Badge variant="outline" className={`text-[8px] ${i.status === "pago" ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}`}>{i.status}</Badge>
                    </div>
                  ))}
                  {(!raioX.ipva || raioX.ipva.length === 0) && <p className="text-xs text-slate-400">Sem IPVA</p>}
                </div>
                <p className="text-[10px] text-slate-500 font-semibold mb-2">Licenciamento</p>
                <div className="space-y-1.5">
                  {(raioX.licenciamento || []).map((l: any) => (
                    <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <span className="text-xs font-medium w-10">{l.ano_exercicio}</span>
                      <span className="text-xs flex-1">R$ {fmt(l.valor)}</span>
                      <Badge variant="outline" className={`text-[8px] ${l.status === "pago" ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}`}>{l.status}</Badge>
                    </div>
                  ))}
                  {(!raioX.licenciamento || raioX.licenciamento.length === 0) && <p className="text-xs text-slate-400">Sem licenciamento</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Droplets className="h-4 w-4 text-cyan-500" /> Lavagens ({raioX.lavagens?.length || 0})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {(raioX.lavagens || []).map((l: any) => (
                    <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Droplets className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{l.tipo} — {l.local || "—"}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(l.data)}</p>
                      </div>
                      <span className="text-xs font-semibold">R$ {fmt(l.valor)}</span>
                    </div>
                  ))}
                  {(!raioX.lavagens || raioX.lavagens.length === 0) && <p className="text-xs text-slate-400 text-center py-4">Sem lavagens</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4 text-violet-500" /> Compras Vinculadas ({raioX.compras?.length || 0})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {(raioX.compras || []).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <ShoppingCart className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{c.numero_sc} — {c.titulo || "—"}</p>
                        <p className="text-[10px] text-slate-400">{fmtDate(c.created_at)}</p>
                      </div>
                      <Badge variant="outline" className="text-[8px]">{c.status}</Badge>
                    </div>
                  ))}
                  {(!raioX.compras || raioX.compras.length === 0) && <p className="text-xs text-slate-400 text-center py-4">Sem compras vinculadas</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
