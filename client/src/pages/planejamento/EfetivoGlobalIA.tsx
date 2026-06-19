import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, Users, ArrowRight, MapPin, AlertTriangle,
  TrendingUp, TrendingDown, CheckCircle2, Building2, RefreshCw, Lightbulb, Clock, Plane, CalendarClock,
  Printer, FileWarning, Move,
} from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

type Props = { companyId: number };

const norm = (s: any) => String(s ?? "").trim();

function deltaTone(delta: number) {
  if (delta > 0) return { txt: "text-red-700", bg: "bg-red-50", border: "border-red-200", label: "Falta", icon: <TrendingUp className="h-3.5 w-3.5" /> };
  if (delta < 0) return { txt: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "Sobra", icon: <TrendingDown className="h-3.5 w-3.5" /> };
  return { txt: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "Equilibrado", icon: <CheckCircle2 className="h-3.5 w-3.5" /> };
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
  const planoAviso = planoEquipe.filter((p) => p?.acao === "aviso_previo");

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

    const css = `@page{size:A4 portrait;margin:12mm 14mm 16mm 14mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.45}.logo-bar{background:#1B2A4A;padding:14px 20px;display:flex;align-items:center;gap:16px;margin-bottom:14px;border-radius:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.logo-bar img{height:48px;object-fit:contain}.logo-bar .title{color:#fff;flex:1}.logo-bar .title h1{font-size:15px;font-weight:bold;letter-spacing:1.4px;margin-bottom:2px}.logo-bar .title p{font-size:9.5px;opacity:.88}.logo-bar .info-right{color:#fff;text-align:right;font-size:9px;opacity:.92}.logo-bar .info-right p{margin-bottom:2px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.kpi{border:1px solid #d1d9e6;border-radius:8px;padding:9px 8px;text-align:center;background:#f9fafb}.kpi .v{font-size:18px;font-weight:700;color:#1B2A4A}.kpi .l{font-size:8.5px;color:#6b7280;font-weight:600;margin-top:2px}.section{margin-bottom:14px;page-break-inside:avoid}.section-title{font-size:12px;font-weight:700;color:#1B2A4A;border-bottom:2px solid #2d4a7a;padding-bottom:3px;margin-bottom:7px;display:flex;align-items:center;gap:6px}.intro{background:#f0f4f8;border-left:4px solid #1B2A4A;padding:9px 13px;border-radius:0 4px 4px 0;font-size:10px;color:#334155;margin-bottom:14px;print-color-adjust:exact;-webkit-print-color-adjust:exact}table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px}th{background:#e8edf4;color:#1B2A4A;font-weight:600;text-align:left;padding:4px 6px;border:1px solid #d1d9e6;print-color-adjust:exact;-webkit-print-color-adjust:exact}td{padding:4px 6px;border:1px solid #e5e7eb;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}tr:nth-child(even){background:#f9fafb}.tag{display:inline-block;padding:1px 7px;border-radius:10px;font-size:8px;font-weight:700;print-color-adjust:exact;-webkit-print-color-adjust:exact}.tag-realoc{background:#dcfce7;color:#166534}.tag-aviso{background:#fef2f2;color:#991b1b}.tag-data{background:#1B2A4A;color:#fff}.muted{color:#6b7280}.empty{color:#9ca3af;font-size:9px;font-style:italic;padding:6px 0}ul.bul{margin:0;padding-left:16px}ul.bul li{margin-bottom:2px}.bar-wrap{display:flex;align-items:center;gap:6px}.bar-track{flex:1;height:8px;background:#eef2f7;border-radius:6px;overflow:hidden}.bar-fill{height:100%;border-radius:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.footer{margin-top:18px;border-top:1px solid #e5e7eb;padding-top:7px;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8}`;

    const tagAcao = (acao: string) => acao === "realocar"
      ? `<span class="tag tag-realoc">REALOCAR</span>`
      : `<span class="tag tag-aviso">AVISO PRÉVIO</span>`;

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

    // Plano de ação por equipe (REALOCAR × AVISO PRÉVIO) — destaque do relatório
    html += `<div class="section"><div class="section-title">Plano de ação por equipe — realocar × aviso prévio</div>`;
    if (planoEquipe.length === 0) {
      html += `<p class="empty">Nenhuma ação de realocação ou aviso prévio recomendada no horizonte.</p>`;
    } else {
      html += `<table><thead><tr><th style="width:80px">Ação</th><th>Função</th><th>Obra (origem)</th><th style="width:46px;text-align:center">Qtd</th><th style="width:78px">Data ideal</th><th>Destino / Justificativa</th></tr></thead><tbody>`;
      for (const p of planoEquipe) {
        const dest = p.acao === "realocar" && norm(p.destino) ? `<strong>→ ${esc(p.destino)}</strong>` : `<span class="muted">Fim de obra — providenciar aviso prévio</span>`;
        html += `<tr><td>${tagAcao(p.acao)}</td><td><strong>${esc(p.cargo)}</strong></td><td>${esc(p.obra)}</td><td style="text-align:center">${esc(Number(p.quantidade) > 0 ? p.quantidade : "—")}</td><td>${norm(p.dataIdeal) ? `<span class="tag tag-data">${esc(p.dataIdeal)}</span>` : "—"}</td><td>${dest}${norm(p.motivo) ? `<div class="muted" style="margin-top:3px">${esc(p.motivo)}</div>` : ""}</td></tr>`;
      }
      html += `</tbody></table>`;
      html += `<p style="font-size:8px;color:#94a3b8;margin-top:4px">Aviso prévio: a data ideal considera ~30 dias antes do fim do serviço, para que o aviso termine junto com a conclusão da frente/obra.</p>`;
    }
    html += `</div>`;

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

    html += `<div class="footer"><span>ERP FC Engenharia — Planejamento de Mão de Obra (gerado por IA · revisão humana recomendada)</span><span>${esc(dataEmissao)}</span></div>`;
    html += `</body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white shadow-sm mb-5 overflow-hidden">
      {/* Cabeçalho do painel */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-indigo-100 bg-white/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              Efetivo × IA — Todas as Obras
            </h2>
            <p className="text-[11px] text-slate-500 leading-tight">
              Cruza o efetivo de cada obra com o cronograma e sugere remanejamento entre obras próximas (mesma cidade).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {geradoEm && !loading && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400">
              <Clock className="h-3 w-3" />
              {new Date(geradoEm).toLocaleString("pt-BR")}{criadoPor ? ` · ${criadoPor}` : ""}
            </span>
          )}
          {resultado && !loading && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              onClick={imprimirRelatorio}
              title="Imprimir / gerar PDF do relatório (padrão FC)"
            >
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
            disabled={loading || !companyId}
            onClick={() => analisar.mutate({ companyId })}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (resultado ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />)}
            {loading ? "Analisando..." : (resultado ? "Reanalisar" : "Analisar todas as obras")}
          </Button>
        </div>
      </div>

      {/* Barra de progresso */}
      {loading && (
        <div className="px-4 pt-3">
          <div className="h-1.5 w-full rounded-full bg-indigo-100 overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Lendo o efetivo e o cronograma de cada obra e consolidando uma única análise de IA...
          </p>
        </div>
      )}

      {/* Conteúdo */}
      <div className="p-4">
        {!resultado && !loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 gap-2">
            <Users className="h-8 w-8 text-indigo-200" />
            <p className="text-sm text-slate-500 max-w-md">
              Clique em <strong>Analisar todas as obras</strong> para ver onde sobra e onde falta equipe,
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

            {/* Totais */}
            {totais && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: "Obras analisadas", value: resultado.totalObras ?? 0, icon: <Building2 className="h-4 w-4" />, color: "text-indigo-600", bg: "bg-indigo-50" },
                  { label: "Efetivo total", value: totais.efetivoTotal ?? 0, icon: <Users className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Disponíveis (ativos)", value: totais.ativos ?? 0, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-600", bg: "bg-emerald-50" },
                  ...(Number(totais.feriasHorizonte) > 0
                    ? [{ label: "Entram de férias (8 sem)", value: totais.feriasHorizonte ?? 0, icon: <Plane className="h-4 w-4" />, color: "text-amber-600", bg: "bg-amber-50" }]
                    : [{ label: "Funções", value: totais.funcoes ?? 0, icon: <TrendingUp className="h-4 w-4" />, color: "text-purple-600", bg: "bg-purple-50" }]),
                ].map((k, i) => (
                  <div key={i} className="bg-white rounded-lg border border-slate-100 p-2.5 flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-md ${k.bg} ${k.color} flex items-center justify-center shrink-0`}>{k.icon}</div>
                    <div>
                      <p className="text-[10px] text-slate-500 leading-tight">{k.label}</p>
                      <p className={`text-base font-bold ${k.color} leading-tight`}>{k.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resumo executivo */}
            {resultado.resumoExecutivo && (
              <div className="rounded-lg border border-indigo-100 bg-white p-3">
                <p className="text-xs font-semibold text-indigo-700 mb-1 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Leitura geral</p>
                <p className="text-sm text-slate-700 leading-relaxed">{resultado.resumoExecutivo}</p>
              </div>
            )}

            {/* Plano de ação por equipe — realocar × aviso prévio */}
            {planoEquipe.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Move className="h-3.5 w-3.5 text-indigo-600" /> Plano de ação por equipe — realocar × aviso prévio
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {planoRealocar.map((p, i) => (
                    <div key={`r${i}`} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-white bg-emerald-600 rounded-full px-2 py-0.5 flex items-center gap-1"><Move className="h-3 w-3" /> REALOCAR</span>
                        {norm(p.dataIdeal) && <span className="text-[10px] font-bold text-white bg-slate-700 rounded-full px-2 py-0.5 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {p.dataIdeal}</span>}
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
                  {planoAviso.map((p, i) => (
                    <div key={`a${i}`} className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold text-white bg-red-600 rounded-full px-2 py-0.5 flex items-center gap-1"><FileWarning className="h-3 w-3" /> AVISO PRÉVIO</span>
                        {norm(p.dataIdeal) && <span className="text-[10px] font-bold text-white bg-slate-700 rounded-full px-2 py-0.5 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {p.dataIdeal}</span>}
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mb-1">{p.cargo}{Number(p.quantidade) > 0 && <span className="text-red-700"> · {p.quantidade} pessoa(s)</span>}</p>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-1"><Building2 className="h-3 w-3" /> {p.obra} <span className="text-red-600 font-medium">· fim de obra (sem demanda próxima)</span></p>
                      {p.motivo && <p className="text-[11px] text-slate-600 leading-snug">{p.motivo}</p>}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Aviso prévio: a data ideal já considera ~30 dias antes do fim do serviço, para que o aviso termine junto com a conclusão da frente/obra.</p>
              </div>
            )}

            {/* Transferências sugeridas */}
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5 text-indigo-600" /> Remanejamento sugerido (entre obras próximas)
              </p>
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
                <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-emerald-600" /> Previsão de disponibilidade (quando sobra mão de obra)
                </p>
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
              <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-indigo-600" /> Efetivo por função (atual × recomendado)
              </p>
              {histograma.length === 0 ? (
                <p className="text-xs text-slate-400">Sem efetivo alocado nas obras analisadas.</p>
              ) : (
                <div className="space-y-1.5">
                  {histograma.map((h, i) => {
                    const tone = deltaTone(Number(h.delta) || 0);
                    const atual = Number(h.atualTotal) || 0;
                    const reco = Number(h.recomendadoTotal) || 0;
                    return (
                      <div key={i} className={`rounded-lg border ${tone.border} ${tone.bg} p-2.5`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {h.cargo}{h.categoria ? <span className="text-[10px] font-normal text-slate-400"> · {h.categoria}</span> : null}
                          </span>
                          <span className={`text-[10px] font-bold flex items-center gap-1 ${tone.txt}`}>
                            {tone.icon} {tone.label}{h.delta ? ` (${h.delta > 0 ? "+" : ""}${h.delta})` : ""}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 w-20 shrink-0">Atual: {atual}</span>
                            <div className="flex-1 h-2 rounded-full bg-white overflow-hidden border border-slate-100">
                              <div className="h-full bg-slate-400" style={{ width: `${(atual / histMax) * 100}%` }} />
                            </div>
                          </div>
                          {Number(h.feriasHorizonte) > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-amber-600 w-20 shrink-0 flex items-center gap-0.5"><Plane className="h-2.5 w-2.5" /> Disp.: {Number(h.disponivelHorizonte) || 0}</span>
                              <div className="flex-1 h-2 rounded-full bg-white overflow-hidden border border-slate-100">
                                <div className="h-full bg-amber-400" style={{ width: `${((Number(h.disponivelHorizonte) || 0) / histMax) * 100}%` }} />
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 w-20 shrink-0">Recom.: {reco}</span>
                            <div className="flex-1 h-2 rounded-full bg-white overflow-hidden border border-slate-100">
                              <div className="h-full bg-indigo-500" style={{ width: `${(reco / histMax) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                        {Number(h.feriasHorizonte) > 0 && (
                          <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                            <Plane className="h-3 w-3" /> {h.feriasHorizonte} pessoa(s) entram de férias inadiáveis nas próximas 8 semanas (já abatidas do "Disp.")
                          </p>
                        )}
                        {h.leitura && <p className="text-[11px] text-slate-600 leading-snug mt-1.5">{h.leitura}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Riscos + recomendações */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.isArray(resultado.riscos) && resultado.riscos.length > 0 && (
                <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Riscos</p>
                  <ul className="space-y-1 text-[11px] text-slate-700 list-disc pl-4">
                    {resultado.riscos.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {Array.isArray(resultado.recomendacoes) && resultado.recomendacoes.length > 0 && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
                  <p className="text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5" /> Recomendações</p>
                  <ul className="space-y-1 text-[11px] text-slate-700 list-disc pl-4">
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
