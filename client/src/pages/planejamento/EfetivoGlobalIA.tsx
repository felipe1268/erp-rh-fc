import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, Users, ArrowRight, MapPin, AlertTriangle,
  TrendingUp, TrendingDown, CheckCircle2, Building2, RefreshCw, Lightbulb, Clock, Plane, CalendarClock,
  Printer, FileWarning, Move, Gauge, Activity,
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

type Props = { companyId: number };

const norm = (s: any) => String(s ?? "").trim();

function deltaTone(delta: number) {
  if (delta > 0) return { txt: "text-red-700", bg: "bg-red-50", border: "border-red-200", label: "Falta", icon: <TrendingUp className="h-3.5 w-3.5" /> };
  if (delta < 0) return { txt: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "Sobra", icon: <TrendingDown className="h-3.5 w-3.5" /> };
  return { txt: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "Equilibrado", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
}

function SectionTitle({ icon, children, count, accent = "indigo" }: { icon: React.ReactNode; children: React.ReactNode; count?: number; accent?: "indigo" | "emerald" | "red" | "amber" }) {
  const bar: Record<string, string> = {
    indigo: "from-indigo-500 to-indigo-300", emerald: "from-emerald-500 to-emerald-300",
    red: "from-red-500 to-red-300", amber: "from-amber-500 to-amber-300",
  };
  const chip: Record<string, string> = {
    indigo: "text-indigo-700 bg-indigo-50 border-indigo-100", emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    red: "text-red-700 bg-red-50 border-red-100", amber: "text-amber-700 bg-amber-50 border-amber-100",
  };
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <span className={`h-5 w-1 rounded-full bg-gradient-to-b ${bar[accent]}`} />
      <span className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5">{icon}{children}</span>
      {typeof count === "number" && count > 0 && (
        <span className={`text-[10px] font-bold rounded-full border px-1.5 py-0.5 ${chip[accent]}`}>{count}</span>
      )}
    </div>
  );
}

const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Metadados de exibição das 3 ações do plano: realocar / antecipar férias / aviso prévio.
function acaoMeta(acao: any): { label: string; cls: string; Icon: any } {
  if (acao === "realocar") return { label: "Realocar", cls: "bg-emerald-100 text-emerald-700", Icon: Move };
  if (acao === "antecipar_ferias") return { label: "Antecipar férias", cls: "bg-amber-100 text-amber-700", Icon: Plane };
  return { label: "Aviso prévio", cls: "bg-red-100 text-red-700", Icon: FileWarning };
}

// Sugestões NUNCA são retroativas: o backend já clampa datas vencidas p/ HOJE e marca
// `atrasado`. Aqui revalidamos no cliente (cobre também análises salvas antes do fix).
function ehAtrasado(brDate: any, flag?: boolean): boolean {
  if (flag) return true;
  const m = norm(brDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])); d.setHours(0, 0, 0, 0);
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return d.getTime() < h.getTime();
}

// Agrupa o plano de ação (realocar / aviso prévio) por mês/ano da DATA IDEAL.
// A dataIdeal já vem com a folga de ~30 dias (aviso prévio) ou a data em que a
// equipe se libera (realocar) — então o agrupamento responde "quando agir".
function agruparPorMes(itens: any[]) {
  const buckets = new Map<string, { key: string; label: string; ord: number; itens: any[] }>();
  const semData: any[] = [];
  for (const p of itens) {
    const m = norm(p?.dataIdeal).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dia = m ? Number(m[1]) : 0;
    const mes = m ? Number(m[2]) : 0;
    const ano = m ? Number(m[3]) : 0;
    if (!m || mes < 1 || mes > 12 || !ano) { semData.push(p); continue; }
    const key = `${ano}-${String(mes).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, { key, label: `${MESES_PT[mes - 1]}/${ano}`, ord: ano * 100 + mes, itens: [] });
    buckets.get(key)!.itens.push({ ...p, _dia: dia });
  }
  const grupos = Array.from(buckets.values()).sort((a, b) => a.ord - b.ord);
  for (const g of grupos) g.itens.sort((a, b) => (a._dia || 0) - (b._dia || 0));
  return { grupos, semData };
}

function AgendaRow({ p }: { p: any }) {
  const meta = acaoMeta(p?.acao);
  const atrasado = ehAtrasado(p?.dataIdeal, p?.atrasado);
  const obs = p?.acao === "realocar"
    ? (norm(p.destino) ? <span className="text-emerald-700 font-medium">→ {p.destino}</span> : (norm(p.motivo) || "—"))
    : p?.acao === "antecipar_ferias"
      ? (norm(p.motivo) || "Antecipar férias p/ ganhar tempo e buscar realocação")
      : (norm(p.motivo) || "Fim de obra (sem demanda próxima)");
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/60 text-xs text-slate-700">
      <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-800">
        {norm(p.dataIdeal) || "—"}
        {atrasado && <span className="ml-1 text-[9px] font-bold text-rose-700 bg-rose-100 rounded px-1 py-0.5 align-middle">atrasado</span>}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 inline-flex items-center gap-1 ${meta.cls}`}>
          <meta.Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </td>
      <td className="px-3 py-2 font-medium text-slate-800">{p.cargo}</td>
      <td className="px-3 py-2 text-center tabular-nums font-semibold">{Number(p.quantidade) > 0 ? p.quantidade : "—"}</td>
      <td className="px-3 py-2 text-amber-700">{p.obra}</td>
      <td className="px-3 py-2 text-slate-600">{obs}</td>
    </tr>
  );
}

export default function EfetivoGlobalIA({ companyId }: Props) {
  const { selectedCompany } = useCompany();
  const [resultado, setResultado] = useState<any | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [criadoPor, setCriadoPor] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<any>(null);

  const utils = trpc.useUtils();

  // Restaura a última análise global salva (recuperação após queda / reabertura).
  const ultima = trpc.iaCronograma.ultimaEfetivoGlobal.useQuery(
    { companyId }, { enabled: !!companyId, refetchOnWindowFocus: false },
  );
  useEffect(() => {
    if (!resultado && ultima.data?.resultado) {
      setResultado(ultima.data.resultado);
      setGeradoEm(ultima.data.resultado?.geradoEm ?? ultima.data.criadoEm ?? null);
      setCriadoPor(ultima.data.criadoPor ?? null);
    }
  }, [ultima.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const analisar = trpc.iaCronograma.efetivoGlobal.useMutation({
    onSuccess: (data) => {
      setResultado(data);
      setGeradoEm(data?.geradoEm ?? new Date().toISOString());
      setCriadoPor(null);
      utils.iaCronograma.ultimaEfetivoGlobal.invalidate({ companyId });
    },
    onError: async () => {
      // iPad/Safari pode derrubar a conexão mesmo com o servidor tendo concluído
      // e PERSISTIDO. Tenta recuperar o resultado fresco antes de mostrar erro.
      const fresh = await utils.iaCronograma.ultimaEfetivoGlobal.fetch({ companyId });
      if (fresh?.resultado) {
        setResultado(fresh.resultado);
        setGeradoEm(fresh.resultado?.geradoEm ?? fresh.criadoEm ?? null);
        setCriadoPor(fresh.criadoPor ?? null);
      }
    },
  });

  const loading = analisar.isPending;

  useEffect(() => {
    if (loading) {
      setProgress(8);
      progressTimer.current = setInterval(() => {
        setProgress((p) => (p >= 95 ? 95 : p + Math.max(1, Math.round((95 - p) / 14))));
      }, 700);
    } else {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setProgress(resultado ? 100 : 0);
    }
    return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const histMax = useMemo(() => {
    const hs = (resultado?.histograma ?? []) as any[];
    return Math.max(1, ...hs.map((h) => Math.max(Number(h.atualTotal) || 0, Number(h.recomendadoTotal) || 0)));
  }, [resultado]);

  const erroIa = resultado?.erroIa as string | null | undefined;
  const transferencias = (resultado?.transferencias ?? []) as any[];
  const previsaoDisponibilidade = (resultado?.previsaoDisponibilidade ?? []) as any[];
  const histograma = (resultado?.histograma ?? []) as any[];
  const totais = resultado?.resumoTotais ?? null;
  const obrasIgnoradas = (resultado?.obrasIgnoradas ?? []) as any[];
  const grupos = (resultado?.gruposProximidade ?? []) as any[];
  const planoEquipe = (resultado?.planoEquipe ?? []) as any[];
  const planoRealocar = planoEquipe.filter((p) => p?.acao === "realocar");
  const planoFerias = planoEquipe.filter((p) => p?.acao === "antecipar_ferias");
  const planoAviso = planoEquipe.filter((p) => p?.acao === "aviso_previo");

  // Saúde do efetivo (dial gerencial): % de funções equilibradas + contagem por situação.
  const saude = useMemo(() => {
    const hs = (resultado?.histograma ?? []) as any[];
    let falta = 0, sobra = 0, ok = 0, totFalta = 0, totSobra = 0;
    for (const h of hs) {
      const d = Number(h.delta) || 0;
      if (d > 0) { falta++; totFalta += d; }
      else if (d < 0) { sobra++; totSobra += Math.abs(d); }
      else ok++;
    }
    const tot = falta + sobra + ok;
    const pct = tot ? Math.round((ok / tot) * 100) : 0;
    return { falta, sobra, ok, totFalta, totSobra, tot, pct };
  }, [resultado]);
  const dialColor = saude.pct >= 80 ? "#10b981" : saude.pct >= 50 ? "#f59e0b" : "#ef4444";

  // Agenda por mês/ano: quando começar a realocar / dar aviso prévio por falta de frente.
  const agenda = useMemo(() => agruparPorMes((resultado?.planoEquipe ?? []) as any[]), [resultado]);

  // Relatório imprimível / PDF — padrão institucional FC (faixa azul #1B2A4A).
  // TODO o texto vindo da IA é escapado (esc/escAttr) antes de entrar no HTML — evita XSS.
  const imprimirRelatorio = () => {
    if (!resultado) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const safeImgUrl = (u: any) => { const s = String(u ?? "").trim(); return /^(https?:|blob:|data:image\/)/i.test(s) ? s : ""; };
    const logoUrl = safeImgUrl(selectedCompany?.logoUrl) || `${window.location.origin}/logo-fc.jpg`;
    const nomeEmpresa = selectedCompany?.nomeFantasia || selectedCompany?.razaoSocial || "Empresa";
    const cnpjEmpresa = selectedCompany?.cnpj || "";
    const dataEmissao = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const dataAnalise = geradoEm ? new Date(geradoEm).toLocaleString("pt-BR") : dataEmissao;

    const css = `@page{size:A4 portrait;margin:12mm 14mm 16mm 14mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.45}.logo-bar{background:#1B2A4A;padding:14px 20px;display:flex;align-items:center;gap:16px;margin-bottom:14px;border-radius:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.logo-bar img{height:48px;object-fit:contain}.logo-bar .title{color:#fff;flex:1}.logo-bar .title h1{font-size:15px;font-weight:bold;letter-spacing:1.4px;margin-bottom:2px}.logo-bar .title p{font-size:9.5px;opacity:.88}.logo-bar .info-right{color:#fff;text-align:right;font-size:9px;opacity:.92}.logo-bar .info-right p{margin-bottom:2px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.kpi{border:1px solid #d1d9e6;border-radius:8px;padding:9px 8px;text-align:center;background:#f9fafb}.kpi .v{font-size:18px;font-weight:700;color:#1B2A4A}.kpi .l{font-size:8.5px;color:#6b7280;font-weight:600;margin-top:2px}.section{margin-bottom:14px;page-break-inside:avoid}.section-title{font-size:12px;font-weight:700;color:#1B2A4A;border-bottom:2px solid #2d4a7a;padding-bottom:3px;margin-bottom:7px;display:flex;align-items:center;gap:6px}.intro{background:#f0f4f8;border-left:4px solid #1B2A4A;padding:9px 13px;border-radius:0 4px 4px 0;font-size:10px;color:#334155;margin-bottom:14px;print-color-adjust:exact;-webkit-print-color-adjust:exact}table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px}th{background:#e8edf4;color:#1B2A4A;font-weight:600;text-align:left;padding:4px 6px;border:1px solid #d1d9e6;print-color-adjust:exact;-webkit-print-color-adjust:exact}td{padding:4px 6px;border:1px solid #e5e7eb;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}tr:nth-child(even){background:#f9fafb}.tag{display:inline-block;padding:1px 7px;border-radius:10px;font-size:8px;font-weight:700;print-color-adjust:exact;-webkit-print-color-adjust:exact}.tag-realoc{background:#dcfce7;color:#166534}.tag-ferias{background:#fef3c7;color:#92400e}.tag-aviso{background:#fef2f2;color:#991b1b}.tag-data{background:#1B2A4A;color:#fff}.tag-atraso{background:#ffe4e6;color:#9f1239}.muted{color:#6b7280}.empty{color:#9ca3af;font-size:9px;font-style:italic;padding:6px 0}ul.bul{margin:0;padding-left:16px}ul.bul li{margin-bottom:2px}.bar-wrap{display:flex;align-items:center;gap:6px}.bar-track{flex:1;height:8px;background:#eef2f7;border-radius:6px;overflow:hidden}.bar-fill{height:100%;border-radius:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.footer{margin-top:18px;border-top:1px solid #e5e7eb;padding-top:7px;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8}`;

    const tagAcao = (acao: string) => acao === "realocar"
      ? `<span class="tag tag-realoc">REALOCAR</span>`
      : acao === "antecipar_ferias"
        ? `<span class="tag tag-ferias">ANTECIPAR FÉRIAS</span>`
        : `<span class="tag tag-aviso">AVISO PRÉVIO</span>`;
    const tagAtraso = (p: any) => ehAtrasado(p?.dataIdeal, p?.atrasado) ? ` <span class="tag tag-atraso">ATRASADO</span>` : "";

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Efetivo × IA — Todas as Obras</title><style>${css}</style></head><body>`;
    html += `<div class="logo-bar"><img src="${escAttr(logoUrl)}" alt="Logo" /><div class="title"><h1>EFETIVO × IA — PLANEJAMENTO DE MÃO DE OBRA</h1><p>${esc(nomeEmpresa.toUpperCase())}${cnpjEmpresa ? " — CNPJ: " + esc(cnpjEmpresa) : ""}</p></div><div class="info-right"><p>Análise gerada em: ${esc(dataAnalise)}</p><p>Impresso em: ${esc(dataEmissao)}</p></div></div>`;

    html += `<div class="intro">Visão geral do efetivo de <strong>todas as obras ativas</strong> da empresa cruzado com o cronograma das próximas 8 semanas. Indica onde <strong>sobra</strong> e onde <strong>falta</strong> equipe e recomenda, por equipe, <strong>quando realocar</strong> (há obra próxima com demanda) ou <strong>quando providenciar o aviso prévio</strong> (obra concluindo sem demanda próxima). Remanejamento sugerido só entre obras da mesma cidade/estado.</div>`;

    // KPIs
    if (totais) {
      html += `<div class="kpis">`;
      html += `<div class="kpi"><div class="v">${esc(resultado.totalObras ?? 0)}</div><div class="l">Obras analisadas</div></div>`;
      html += `<div class="kpi"><div class="v">${esc(totais.efetivoTotal ?? 0)}</div><div class="l">Efetivo total</div></div>`;
      html += `<div class="kpi"><div class="v">${esc(totais.ativos ?? 0)}</div><div class="l">Disponíveis (ativos)</div></div>`;
      html += Number(totais.feriasHorizonte) > 0
        ? `<div class="kpi"><div class="v">${esc(totais.feriasHorizonte)}</div><div class="l">Entram de férias (8 sem)</div></div>`
        : `<div class="kpi"><div class="v">${esc(totais.funcoes ?? 0)}</div><div class="l">Funções</div></div>`;
      html += `</div>`;
    }

    // Resumo executivo
    if (resultado.resumoExecutivo) {
      html += `<div class="section"><div class="section-title">Leitura geral</div><p style="font-size:10px;color:#334155">${esc(resultado.resumoExecutivo)}</p></div>`;
    }

    // Plano de ação por equipe (REALOCAR × ANTECIPAR FÉRIAS × AVISO PRÉVIO) — destaque do relatório
    html += `<div class="section"><div class="section-title">Plano de ação por equipe — realocar × antecipar férias × aviso prévio</div>`;
    if (planoEquipe.length === 0) {
      html += `<p class="empty">Nenhuma ação de realocação, antecipação de férias ou aviso prévio recomendada no horizonte.</p>`;
    } else {
      html += `<table><thead><tr><th style="width:96px">Ação</th><th>Função</th><th>Obra (origem)</th><th style="width:46px;text-align:center">Qtd</th><th style="width:78px">Data ideal</th><th>Destino / Justificativa</th></tr></thead><tbody>`;
      for (const p of planoEquipe) {
        const dest = p.acao === "realocar" && norm(p.destino)
          ? `<strong>→ ${esc(p.destino)}</strong>`
          : p.acao === "antecipar_ferias"
            ? `<span class="muted">Antecipar férias p/ ganhar tempo e buscar realocação</span>`
            : `<span class="muted">Fim de obra — providenciar aviso prévio</span>`;
        html += `<tr><td>${tagAcao(p.acao)}${tagAtraso(p)}</td><td><strong>${esc(p.cargo)}</strong></td><td>${esc(p.obra)}</td><td style="text-align:center">${esc(Number(p.quantidade) > 0 ? p.quantidade : "—")}</td><td>${norm(p.dataIdeal) ? `<span class="tag tag-data">${esc(p.dataIdeal)}</span>` : "—"}</td><td>${dest}${norm(p.motivo) ? `<div class="muted" style="margin-top:3px">${esc(p.motivo)}</div>` : ""}</td></tr>`;
      }
      html += `</tbody></table>`;
      html += `<p style="font-size:8px;color:#94a3b8;margin-top:4px">Antecipar férias: alternativa ao aviso prévio quando há período de férias agendável — ganha ~30 dias para buscar realocação. Aviso prévio: a data ideal considera ~30 dias antes do fim do serviço, para que o aviso termine junto com a conclusão da frente/obra. Nenhuma data é retroativa (sempre hoje ou futuro).</p>`;
    }
    html += `</div>`;

    // Agenda por mês/ano — quando começar a realocar / antecipar férias / dar aviso prévio
    if (planoEquipe.length > 0) {
      const ag = agruparPorMes(planoEquipe);
      html += `<div class="section"><div class="section-title">Agenda por mês — quando começar a realocar / antecipar férias / dar aviso prévio</div>`;
      html += `<table><thead><tr><th style="width:78px">Data ideal</th><th style="width:96px">Ação</th><th>Função</th><th style="width:46px;text-align:center">Qtd</th><th>Obra (origem)</th><th>Destino / Observação</th></tr></thead><tbody>`;
      const linhaAgenda = (p: any) => {
        const obs = p.acao === "realocar"
          ? (norm(p.destino) ? `<strong style="color:#166534">→ ${esc(p.destino)}</strong>` : (norm(p.motivo) ? esc(p.motivo) : "—"))
          : p.acao === "antecipar_ferias"
            ? (norm(p.motivo) ? esc(p.motivo) : `<span class="muted">Antecipar férias p/ ganhar tempo e buscar realocação</span>`)
            : (norm(p.motivo) ? esc(p.motivo) : `<span class="muted">Fim de obra (sem demanda próxima)</span>`);
        return `<tr><td><span class="tag tag-data">${norm(p.dataIdeal) ? esc(p.dataIdeal) : "—"}</span>${tagAtraso(p)}</td><td>${tagAcao(p.acao)}</td><td><strong>${esc(p.cargo)}</strong></td><td style="text-align:center">${esc(Number(p.quantidade) > 0 ? p.quantidade : "—")}</td><td style="color:#854d0e">${esc(p.obra)}</td><td>${obs}</td></tr>`;
      };
      for (const g of ag.grupos) {
        const pessoas = g.itens.reduce((s: number, x: any) => s + (Number(x.quantidade) || 0), 0);
        html += `<tr><td colspan="6" style="background:#1B2A4A;color:#fff;font-weight:700;font-size:9px;padding:4px 6px;print-color-adjust:exact;-webkit-print-color-adjust:exact">${esc(g.label)} — ${esc(pessoas)} pessoa(s)</td></tr>`;
        for (const p of g.itens) html += linhaAgenda(p);
      }
      if (ag.semData.length > 0) {
        html += `<tr><td colspan="6" style="background:#cbd5e1;color:#1f2937;font-weight:700;font-size:9px;padding:4px 6px;print-color-adjust:exact;-webkit-print-color-adjust:exact">Sem data definida pela IA</td></tr>`;
        for (const p of ag.semData) html += linhaAgenda(p);
      }
      html += `</tbody></table></div>`;
    }

    // Remanejamento sugerido
    html += `<div class="section"><div class="section-title">Remanejamento sugerido (entre obras próximas)</div>`;
    if (transferencias.length === 0) {
      html += `<p class="empty">Nenhuma transferência sugerida entre obras da mesma cidade no momento.</p>`;
    } else {
      html += `<table><thead><tr><th>Função</th><th>De</th><th>Para</th><th style="width:80px">Cidade</th><th style="width:46px;text-align:center">Qtd</th><th style="width:78px">Disponível</th><th>Motivo / Impacto</th></tr></thead><tbody>`;
      for (const t of transferencias) {
        const mot = `${norm(t.motivo) ? esc(t.motivo) : ""}${norm(t.impacto) ? `<div class="muted" style="margin-top:3px"><strong>Impacto:</strong> ${esc(t.impacto)}</div>` : ""}` || "—";
        html += `<tr><td><strong>${esc(t.cargo)}</strong></td><td style="color:#854d0e">${esc(t.deObra)}</td><td style="color:#166534">${esc(t.paraObra)}</td><td>${esc(t.cidade)}</td><td style="text-align:center">${esc(t.quantidade)}</td><td>${norm(t.dataDisponivel) ? esc(t.dataDisponivel) : "Imediato"}</td><td>${mot}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;

    // Previsão de disponibilidade
    if (previsaoDisponibilidade.length > 0) {
      html += `<div class="section"><div class="section-title">Previsão de disponibilidade (quando sobra mão de obra)</div>`;
      html += `<table><thead><tr><th>Função</th><th>Obra</th><th style="width:78px">Data estimada</th><th style="width:46px;text-align:center">Qtd</th><th>Motivo / Sugestão</th></tr></thead><tbody>`;
      for (const d of previsaoDisponibilidade) {
        const ms = `${norm(d.motivo) ? esc(d.motivo) : ""}${norm(d.sugestao) ? `<div class="muted" style="margin-top:3px"><strong>Sugestão:</strong> ${esc(d.sugestao)}</div>` : ""}` || "—";
        html += `<tr><td><strong>${esc(d.cargo)}</strong></td><td>${esc(d.obra)}</td><td><span class="tag tag-data">${esc(d.dataEstimada)}</span></td><td style="text-align:center">${esc(Number(d.quantidade) > 0 ? d.quantidade : "—")}</td><td>${ms}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }

    // Efetivo por função (atual × recomendado)
    if (histograma.length > 0) {
      html += `<div class="section"><div class="section-title">Efetivo por função (atual × recomendado)</div>`;
      html += `<table><thead><tr><th>Função</th><th style="width:70px">Categoria</th><th style="width:50px;text-align:center">Atual</th><th style="width:60px;text-align:center">Recom.</th><th style="width:60px;text-align:center">Situação</th><th>Leitura</th></tr></thead><tbody>`;
      for (const h of histograma) {
        const d = Number(h.delta) || 0;
        const sit = d > 0 ? `<span class="tag tag-aviso">Falta ${d}</span>` : d < 0 ? `<span class="tag" style="background:#fef9c3;color:#854d0e">Sobra ${Math.abs(d)}</span>` : `<span class="tag tag-realoc">OK</span>`;
        html += `<tr><td><strong>${esc(h.cargo)}</strong></td><td class="muted">${esc(h.categoria || "—")}</td><td style="text-align:center">${esc(h.atualTotal ?? 0)}</td><td style="text-align:center">${esc(h.recomendadoTotal ?? 0)}</td><td style="text-align:center">${sit}</td><td class="muted">${esc(h.leitura || "")}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }

    // Riscos + recomendações
    const riscos = (Array.isArray(resultado.riscos) ? resultado.riscos : []) as string[];
    const recs = (Array.isArray(resultado.recomendacoes) ? resultado.recomendacoes : []) as string[];
    if (riscos.length > 0 || recs.length > 0) {
      html += `<div class="section">`;
      if (riscos.length > 0) {
        html += `<div class="section-title">Riscos</div><ul class="bul">${riscos.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
      }
      if (recs.length > 0) {
        html += `<div class="section-title" style="margin-top:8px">Recomendações</div><ul class="bul">${recs.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`;
      }
      html += `</div>`;
    }

    // Obras ignoradas
    if (obrasIgnoradas.length > 0) {
      html += `<div class="section"><div class="section-title">Obras fora da análise (${esc(obrasIgnoradas.length)})</div><ul class="bul">${obrasIgnoradas.map((o: any) => `<li>${esc(norm(o.obra))} — <span class="muted">${esc(norm(o.motivo))}</span></li>`).join("")}</ul></div>`;
    }

    html += `<div class="footer"><span>ERP Gestão Integrada — Planejamento de Mão de Obra (gerado por IA · revisão humana recomendada)</span><span>${esc(dataEmissao)}</span></div>`;
    html += `</body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-5 overflow-hidden">
      {/* Cabeçalho gerencial — faixa institucional FC (#1B2A4A) */}
      <div className="relative px-5 py-4 bg-gradient-to-br from-[#1B2A4A] via-[#22315a] to-[#1B2A4A] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)", backgroundSize: "18px 18px" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur flex items-center justify-center shrink-0">
              <Gauge className="h-6 w-6 text-sky-300" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-sky-300/90 bg-white/10 rounded px-1.5 py-0.5">Painel Gerencial</span>
              <h2 className="text-base font-bold leading-tight mt-1">Efetivo × IA — Todas as Obras</h2>
              <p className="text-[11px] text-slate-300 leading-tight">Cruza o efetivo de cada obra com o cronograma de 8 semanas e indica realocação ou aviso prévio por equipe.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {geradoEm && !loading && (
              <span className="hidden md:flex items-center gap-1 text-[10px] text-slate-300/90">
                <Clock className="h-3 w-3" />
                {new Date(geradoEm).toLocaleString("pt-BR")}{criadoPor ? ` · ${criadoPor}` : ""}
              </span>
            )}
            {resultado && !loading && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 bg-white/10 border-white/25 text-white hover:bg-white/20 hover:text-white"
                onClick={imprimirRelatorio}
                title="Imprimir / gerar PDF do relatório (padrão FC)"
              >
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </Button>
            )}
            <Button
              size="sm"
              className="gap-1.5 bg-sky-500 hover:bg-sky-400 text-white shadow-sm"
              disabled={loading || !companyId}
              onClick={() => analisar.mutate({ companyId })}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (resultado ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />)}
              {loading ? "Analisando..." : (resultado ? "Reanalisar" : "Analisar todas as obras")}
            </Button>
          </div>
        </div>
      </div>

      {/* Barra de progresso */}
      {loading && (
        <div className="px-5 pt-3">
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Lendo o efetivo e o cronograma de cada obra e consolidando uma única análise de IA...
          </p>
        </div>
      )}

      {/* Conteúdo */}
      <div className="p-4">
        {!resultado && !loading && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-slate-50 ring-1 ring-slate-100 flex items-center justify-center">
              <Gauge className="h-7 w-7 text-[#1B2A4A]/40" />
            </div>
            <p className="text-sm text-slate-500 max-w-md">
              Clique em <strong className="text-slate-700">Analisar todas as obras</strong> para ver onde sobra e onde falta equipe,
              e receber sugestões de remanejamento entre obras da mesma cidade.
            </p>
          </div>
        )}

        {resultado && (
          <div className="space-y-4">
            {erroIa && (
              <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div><strong>IA indisponível.</strong> {erroIa} O efetivo atual por função (abaixo) continua válido — vem direto do banco.</div>
              </div>
            )}

            {/* Dashboard gerencial: dial de saúde + KPIs */}
            {totais && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* Dial / gauge de saúde do efetivo */}
                <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                      <circle
                        cx="48" cy="48" r="40" fill="none" stroke={dialColor} strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={`${(saude.pct / 100) * 251.33} 251.33`}
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-extrabold text-slate-800 leading-none">{saude.pct}%</span>
                      <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">saúde</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-indigo-600" /> Saúde do efetivo</p>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" /> <strong>{saude.ok}</strong> equilibrada(s)</div>
                      <div className="flex items-center gap-1.5 text-red-700"><span className="h-2 w-2 rounded-full bg-red-500 shrink-0" /> <strong>{saude.falta}</strong> com falta {saude.totFalta > 0 && <span className="text-slate-400">(+{saude.totFalta})</span>}</div>
                      <div className="flex items-center gap-1.5 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" /> <strong>{saude.sobra}</strong> com sobra {saude.totSobra > 0 && <span className="text-slate-400">(−{saude.totSobra})</span>}</div>
                    </div>
                  </div>
                </div>

                {/* KPIs */}
                <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Obras analisadas", value: resultado.totalObras ?? 0, icon: <Building2 className="h-5 w-5" />, color: "text-indigo-600", bg: "bg-indigo-50", ring: "ring-indigo-100" },
                    { label: "Efetivo total", value: totais.efetivoTotal ?? 0, icon: <Users className="h-5 w-5" />, color: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-100" },
                    { label: "Disponíveis (ativos)", value: totais.ativos ?? 0, icon: <CheckCircle2 className="h-5 w-5" />, color: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-100" },
                    ...(Number(totais.feriasHorizonte) > 0
                      ? [{ label: "Entram de férias (8 sem)", value: totais.feriasHorizonte ?? 0, icon: <Plane className="h-5 w-5" />, color: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-100" }]
                      : [{ label: "Funções", value: totais.funcoes ?? 0, icon: <TrendingUp className="h-5 w-5" />, color: "text-purple-600", bg: "bg-purple-50", ring: "ring-purple-100" }]),
                  ].map((k, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-2 hover:shadow-sm transition-shadow">
                      <div className={`w-9 h-9 rounded-lg ${k.bg} ${k.color} ring-1 ${k.ring} flex items-center justify-center`}>{k.icon}</div>
                      <div>
                        <p className={`text-2xl font-extrabold ${k.color} leading-none`}>{k.value}</p>
                        <p className="text-[10px] text-slate-500 leading-tight mt-1">{k.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resumo executivo */}
            {resultado.resumoExecutivo && (
              <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4">
                <p className="text-xs font-bold text-indigo-700 mb-1.5 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Leitura geral</p>
                <p className="text-sm text-slate-700 leading-relaxed">{resultado.resumoExecutivo}</p>
              </div>
            )}

            {/* Plano de ação por equipe — realocar × antecipar férias × aviso prévio */}
            {planoEquipe.length > 0 && (
              <div>
                <SectionTitle icon={<Move className="h-4 w-4 text-indigo-600" />} count={planoEquipe.length}>Plano de ação por equipe — realocar × antecipar férias × aviso prévio</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {planoRealocar.map((p, i) => (
                    <div key={`r${i}`} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-white bg-emerald-600 rounded-full px-2 py-0.5 flex items-center gap-1"><Move className="h-3 w-3" /> REALOCAR</span>
                        {norm(p.dataIdeal) && <span className={`text-[10px] font-bold text-white rounded-full px-2 py-0.5 flex items-center gap-1 ${ehAtrasado(p.dataIdeal, p.atrasado) ? "bg-rose-600" : "bg-slate-700"}`}><CalendarClock className="h-3 w-3" /> {p.dataIdeal}{ehAtrasado(p.dataIdeal, p.atrasado) ? " · atrasado" : ""}</span>}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mb-1">{p.cargo}{Number(p.quantidade) > 0 && <span className="text-emerald-700"> · {p.quantidade} pessoa(s)</span>}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-700 mb-1">
                        <span className="font-medium text-amber-700 truncate max-w-[44%]">{p.obra}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="font-medium text-emerald-700 truncate max-w-[44%]">{p.destino}</span>
                      </div>
                      {p.motivo && <p className="text-[11px] text-slate-600 leading-snug">{p.motivo}</p>}
                    </div>
                  ))}
                  {planoFerias.map((p, i) => (
                    <div key={`f${i}`} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-white bg-amber-500 rounded-full px-2 py-0.5 flex items-center gap-1"><Plane className="h-3 w-3" /> ANTECIPAR FÉRIAS</span>
                        {norm(p.dataIdeal) && <span className={`text-[10px] font-bold text-white rounded-full px-2 py-0.5 flex items-center gap-1 ${ehAtrasado(p.dataIdeal, p.atrasado) ? "bg-rose-600" : "bg-slate-700"}`}><CalendarClock className="h-3 w-3" /> {p.dataIdeal}{ehAtrasado(p.dataIdeal, p.atrasado) ? " · atrasado" : ""}</span>}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mb-1">{p.cargo}{Number(p.quantidade) > 0 && <span className="text-amber-700"> · {p.quantidade} pessoa(s)</span>}</p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-1"><Building2 className="h-3 w-3" /> {p.obra} <span className="text-amber-600 font-medium">· antecipar férias p/ ganhar tempo e buscar realocação</span></p>
                      {p.motivo && <p className="text-[11px] text-slate-600 leading-snug">{p.motivo}</p>}
                    </div>
                  ))}
                  {planoAviso.map((p, i) => (
                    <div key={`a${i}`} className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-white bg-red-600 rounded-full px-2 py-0.5 flex items-center gap-1"><FileWarning className="h-3 w-3" /> AVISO PRÉVIO</span>
                        {norm(p.dataIdeal) && <span className={`text-[10px] font-bold text-white rounded-full px-2 py-0.5 flex items-center gap-1 ${ehAtrasado(p.dataIdeal, p.atrasado) ? "bg-rose-600" : "bg-slate-700"}`}><CalendarClock className="h-3 w-3" /> {p.dataIdeal}{ehAtrasado(p.dataIdeal, p.atrasado) ? " · atrasado" : ""}</span>}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mb-1">{p.cargo}{Number(p.quantidade) > 0 && <span className="text-red-700"> · {p.quantidade} pessoa(s)</span>}</p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-1"><Building2 className="h-3 w-3" /> {p.obra} <span className="text-red-600 font-medium">· fim de obra (sem demanda próxima)</span></p>
                      {p.motivo && <p className="text-[11px] text-slate-600 leading-snug">{p.motivo}</p>}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Antecipar férias: alternativa ao aviso prévio quando há período agendável — ganha ~30 dias para buscar realocação. Aviso prévio: a data ideal já considera ~30 dias antes do fim do serviço, para que o aviso termine junto com a conclusão da frente/obra. Nenhuma sugestão é retroativa (sempre hoje ou futuro).</p>
              </div>
            )}

            {/* Agenda por mês/ano — quando começar a realocar / dar aviso prévio */}
            {planoEquipe.length > 0 && (
              <div>
                <SectionTitle icon={<CalendarClock className="h-4 w-4 text-indigo-600" />} count={planoEquipe.length}>Agenda por mês — quando começar a realocar / dar aviso prévio</SectionTitle>
                <p className="text-[11px] text-slate-500 mb-2.5">Data ideal para <strong>iniciar</strong> a ação, já com folga de ~30 dias antes do fim da frente — tempo de cumprir o aviso prévio e a obra concluir junto.</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 text-left">
                        <th className="px-3 py-2 font-semibold">Data ideal</th>
                        <th className="px-3 py-2 font-semibold">Ação</th>
                        <th className="px-3 py-2 font-semibold">Função</th>
                        <th className="px-3 py-2 font-semibold text-center">Qtd</th>
                        <th className="px-3 py-2 font-semibold">Obra (origem)</th>
                        <th className="px-3 py-2 font-semibold">Destino / Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agenda.grupos.map((g) => {
                        const pessoas = g.itens.reduce((s: number, x: any) => s + (Number(x.quantidade) || 0), 0);
                        const nReal = g.itens.filter((x: any) => x.acao === "realocar").length;
                        const nFerias = g.itens.filter((x: any) => x.acao === "antecipar_ferias").length;
                        const nAviso = g.itens.filter((x: any) => x.acao === "aviso_previo").length;
                        return (
                          <React.Fragment key={g.key}>
                            <tr className="bg-[#1B2A4A] text-white">
                              <td colSpan={6} className="px-3 py-1.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-bold tracking-wide flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-sky-300" /> {g.label}</span>
                                  <span className="text-[10px] text-slate-300">
                                    {pessoas} pessoa(s){nReal > 0 ? ` · ${nReal} realocar` : ""}{nFerias > 0 ? ` · ${nFerias} antecipar férias` : ""}{nAviso > 0 ? ` · ${nAviso} aviso prévio` : ""}
                                  </span>
                                </div>
                              </td>
                            </tr>
                            {g.itens.map((p: any, i: number) => <AgendaRow key={`${g.key}-${i}`} p={p} />)}
                          </React.Fragment>
                        );
                      })}
                      {agenda.semData.length > 0 && (
                        <>
                          <tr className="bg-slate-200 text-slate-700">
                            <td colSpan={6} className="px-3 py-1.5 text-xs font-bold">Sem data definida pela IA</td>
                          </tr>
                          {agenda.semData.map((p: any, i: number) => <AgendaRow key={`sd-${i}`} p={p} />)}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Transferências sugeridas */}
            <div>
              <SectionTitle icon={<ArrowRight className="h-4 w-4 text-indigo-600" />} count={transferencias.length}>Remanejamento sugerido (entre obras próximas)</SectionTitle>
              {transferencias.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500">
                  Nenhuma transferência sugerida entre obras da mesma cidade no momento.
                  {grupos.length === 0 && " (Não há 2+ obras ativas na mesma cidade/estado para remanejar.)"}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {transferencias.map((t, i) => (
                    <div key={i} className="rounded-lg border border-indigo-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-semibold text-slate-800">{t.cargo}</span>
                        <span className="text-[10px] font-bold text-white bg-indigo-600 rounded-full px-2 py-0.5">{t.quantidade} pessoa(s)</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-700 mb-1.5">
                        <span className="font-medium text-amber-700 truncate max-w-[40%]">{t.deObra}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                        <span className="font-medium text-emerald-700 truncate max-w-[40%]">{t.paraObra}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1.5">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> {t.cidade}</p>
                        {norm(t.dataDisponivel) && (
                          <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Disponível a partir de {t.dataDisponivel}</span>
                        )}
                      </div>
                      {t.motivo && <p className="text-[11px] text-slate-600 leading-snug">{t.motivo}</p>}
                      {t.impacto && <p className="text-[11px] text-slate-500 leading-snug mt-1"><strong>Impacto:</strong> {t.impacto}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Previsão de disponibilidade — QUANDO sobra mão de obra p/ realocar */}
            {previsaoDisponibilidade.length > 0 && (
              <div>
                <SectionTitle icon={<CalendarClock className="h-4 w-4 text-emerald-600" />} count={previsaoDisponibilidade.length} accent="emerald">Previsão de disponibilidade (quando sobra mão de obra)</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {previsaoDisponibilidade.map((d, i) => (
                    <div key={i} className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-800">{d.cargo}</span>
                        <span className="text-[10px] font-bold text-white bg-emerald-600 rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0">
                          <CalendarClock className="h-3 w-3" /> {d.dataEstimada}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-1.5">
                        <Building2 className="h-3 w-3" /> {d.obra}
                        {Number(d.quantidade) > 0 && <span className="font-semibold text-emerald-700">· {d.quantidade} pessoa(s)</span>}
                      </p>
                      {d.motivo && <p className="text-[11px] text-slate-600 leading-snug">{d.motivo}</p>}
                      {d.sugestao && <p className="text-[11px] text-slate-500 leading-snug mt-1"><strong>Sugestão:</strong> {d.sugestao}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histograma por função */}
            <div>
              <SectionTitle icon={<Users className="h-4 w-4 text-indigo-600" />} count={histograma.length}>Efetivo por função (atual × recomendado)</SectionTitle>
              {histograma.length === 0 ? (
                <p className="text-xs text-slate-400">Sem efetivo alocado nas obras analisadas.</p>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                  {histograma.map((h, i) => {
                    const tone = deltaTone(Number(h.delta) || 0);
                    const atual = Number(h.atualTotal) || 0;
                    const reco = Number(h.recomendadoTotal) || 0;
                    return (
                      <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 hover:shadow-sm transition-shadow">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">
                            {h.cargo}{h.categoria ? <span className="text-[10px] font-medium text-slate-400 ml-1.5">{h.categoria}</span> : null}
                          </span>
                          <span className={`text-[10px] font-bold flex items-center gap-1 rounded-full border px-2 py-0.5 ${tone.bg} ${tone.txt} ${tone.border}`}>
                            {tone.icon} {tone.label}{h.delta ? ` ${h.delta > 0 ? "+" : ""}${h.delta}` : ""}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-slate-500 w-14 shrink-0">Atual</span>
                            <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-slate-400 rounded-full transition-all duration-500" style={{ width: `${(atual / histMax) * 100}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-700 w-6 text-right tabular-nums">{atual}</span>
                          </div>
                          {Number(h.feriasHorizonte) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-medium text-amber-600 w-14 shrink-0 flex items-center gap-0.5"><Plane className="h-2.5 w-2.5" /> Disp.</span>
                              <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${((Number(h.disponivelHorizonte) || 0) / histMax) * 100}%` }} />
                              </div>
                              <span className="text-xs font-bold text-amber-600 w-6 text-right tabular-nums">{Number(h.disponivelHorizonte) || 0}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-indigo-600 w-14 shrink-0">Recom.</span>
                            <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(reco / histMax) * 100}%` }} />
                            </div>
                            <span className="text-xs font-bold text-indigo-700 w-6 text-right tabular-nums">{reco}</span>
                          </div>
                        </div>
                        {Number(h.feriasHorizonte) > 0 && (
                          <p className="text-[10px] text-amber-700 mt-2 flex items-center gap-1">
                            <Plane className="h-3 w-3" /> {h.feriasHorizonte} pessoa(s) entram de férias inadiáveis nas próximas 8 semanas (já abatidas do "Disp.")
                          </p>
                        )}
                        {h.leitura && <p className="text-[11px] text-slate-600 leading-snug mt-2 pt-2 border-t border-slate-100">{h.leitura}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Riscos + recomendações */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.isArray(resultado.riscos) && resultado.riscos.length > 0 && (
                <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50/70 to-white p-4">
                  <p className="text-[13px] font-bold text-red-700 mb-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Riscos</p>
                  <ul className="space-y-1.5 text-[11px] text-slate-700 list-disc pl-4 marker:text-red-400">
                    {resultado.riscos.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(resultado.recomendacoes) && resultado.recomendacoes.length > 0 && (
                <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-4">
                  <p className="text-[13px] font-bold text-emerald-700 mb-2 flex items-center gap-1.5"><Lightbulb className="h-4 w-4" /> Recomendações</p>
                  <ul className="space-y-1.5 text-[11px] text-slate-700 list-disc pl-4 marker:text-emerald-400">
                    {resultado.recomendacoes.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Obras ignoradas */}
            {obrasIgnoradas.length > 0 && (
              <details className="text-[11px] text-slate-500">
                <summary className="cursor-pointer select-none">{obrasIgnoradas.length} obra(s) sem cronograma/efetivo (não entraram na análise)</summary>
                <ul className="mt-1.5 space-y-0.5 pl-4 list-disc">
                  {obrasIgnoradas.map((o: any, i: number) => <li key={i}>{norm(o.obra)} — {norm(o.motivo)}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
