import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { PersonPhoto } from "@/components/PersonPhoto";
import { removeAccents } from "@/lib/searchUtils";
import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { TrendingDown, Plus, Trash2, Search, Users, Target, CalendarClock, CheckCircle2, Settings } from "lucide-react";
import PeriodSelectorCard from "@/components/PeriodSelectorCard";

// Plano de Desligamento (layoff) — fila sequencial de demissões programadas por mês.

const STATUS_OPTS: { value: string; label: string; cls: string }[] = [
  { value: "planejado", label: "🟢 Planejado", cls: "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-sm" },
  { value: "em_analise", label: "🔵 Em análise RH", cls: "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-sm" },
  { value: "ferias", label: "🌴 Férias programada", cls: "bg-gradient-to-r from-teal-400 to-cyan-600 text-white shadow-sm" },
  { value: "aviso_previo", label: "⏳ Aviso prévio", cls: "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm" },
  { value: "desligado", label: "✔ Desligado", cls: "bg-gradient-to-r from-red-500 to-rose-700 text-white shadow-sm" },
  { value: "cancelado", label: "✖ Cancelado", cls: "bg-gray-200 text-gray-500 line-through" },
];
const statusInfo = (s: string) => STATUS_OPTS.find(o => o.value === s) || STATUS_OPTS[0];

function mesLabel(m: string) {
  const [y, mm] = m.split("-");
  const nomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${nomes[Number(mm) - 1] || mm}/${y}`;
}

function proximosMeses(n = 18): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export default function PlanoDesligamento() {
  const { companyIdNum: companyId, selectedCompany } = useCompany();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.planoDesligamento.list.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId },
  );

  const [addOpen, setAddOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [mesAdd, setMesAdd] = useState(proximosMeses(1)[0]);
  const [obsEdit, setObsEdit] = useState<{ id: number; texto: string } | null>(null);

  const { data: elegiveis } = trpc.planoDesligamento.elegiveis.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId && addOpen },
  );

  const invalidate = () => {
    utils.planoDesligamento.list.invalidate();
    utils.planoDesligamento.elegiveis.invalidate();
  };

  // Governança: consolidação, solicitações pendentes e revisões
  const { data: gov } = trpc.planoDesligamento.governanca.useQuery(
    { companyId: companyId! },
    { enabled: !!companyId },
  );
  const invalidateGov = () => utils.planoDesligamento.governanca.invalidate();
  // Safari (iPad/iPhone) mostra "The string did not match the expected pattern." quando a
  // resposta da rede chega quebrada — é falha de conexão, não erro de dados.
  const errMsg = (e: any) => {
    const m = String(e?.message || "");
    return /did not match the expected pattern|Load failed|Failed to fetch|NetworkError/i.test(m)
      ? "Falha de conexão com o servidor — verifique a internet e tente novamente."
      : m;
  };
  const [govOpen, setGovOpen] = useState(false);
  const consolidarMut = trpc.planoDesligamento.consolidar.useMutation({
    onSuccess: (r) => { toast.success(`🔒 Plano consolidado — Rev. ${r.revisao}`); invalidateGov(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const desconsolidarMut = trpc.planoDesligamento.desconsolidar.useMutation({
    onSuccess: () => { toast.success("🔓 Plano destravado para edição"); invalidateGov(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const decidirMut = trpc.planoDesligamento.decidirMudancas.useMutation({
    onSuccess: (r) => {
      toast.success(r.aplicadas > 0 ? `✓ ${r.aplicadas} mudança(s) aplicada(s)${r.revisao ? ` — Rev. ${r.revisao}` : ""}` : "Solicitação(ões) rejeitada(s)");
      invalidate(); invalidateGov();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const toastPendente = () => toast.info("🔒 Plano consolidado — solicitação enviada para aprovação do Admin Master", { duration: 5000 });

  const addMut = trpc.planoDesligamento.add.useMutation({
    onSuccess: (r: any) => {
      if (r.pendente) { toastPendente(); invalidateGov(); }
      else toast.success(`${r.inseridos} funcionário(s) adicionado(s) ao plano`);
      invalidate(); setAddOpen(false); setSelecionados(new Set()); setBusca("");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const updMut = trpc.planoDesligamento.update.useMutation({
    onSuccess: (r: any) => { if (r?.pendente) { toastPendente(); invalidateGov(); } invalidate(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaInput, setMetaInput] = useState("");
  const metaMut = trpc.planoDesligamento.setMeta.useMutation({
    onSuccess: () => { toast.success("Meta atualizada"); invalidate(); setMetaOpen(false); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [tetoInput, setTetoInput] = useState("");
  const tetoMut = trpc.planoDesligamento.setTetoMes.useMutation({
    onSuccess: () => { toast.success("Teto mensal atualizado"); invalidate(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const [redistribuindo, setRedistribuindo] = useState(false);
  // Seleção múltipla p/ iniciar aviso prévio direto do plano
  const [, navigate] = useLocation();
  const [selAviso, setSelAviso] = useState<Set<number>>(new Set());
  const toggleSelAviso = (id: number) => setSelAviso(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dataAvisoSugerida = (it: any): string => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    const d = `${it.mesPlanejado}-01`;
    return d > hojeISO ? d : hojeISO;
  };
  const iniciarAvisos = (lista: any[]) => {
    const fila = [...lista]
      .sort((a, b) => String(a.mesPlanejado).localeCompare(String(b.mesPlanejado)) || a.id - b.id)
      .map(it => ({ employeeId: it.employeeId, nome: it.nome, data: dataAvisoSugerida(it), tipo: "empregador_trabalhado" }));
    if (fila.length === 0) return;
    sessionStorage.setItem("avisoPrevioQueue", JSON.stringify(fila));
    navigate("/aviso-previo"); // navegação SPA — preserva a empresa selecionada (recarga completa resetava o contexto)
  };
  // Liga/desliga cada linha do gráfico de tendência (4b)
  const [linhasGraf, setLinhasGraf] = useState<{ prev: boolean; real: boolean; tend: boolean }>({ prev: true, real: true, tend: true });
  const toggleLinha = (k: "prev" | "real" | "tend") => setLinhasGraf(s => ({ ...s, [k]: !s[k] }));

  const delMut = trpc.planoDesligamento.remove.useMutation({
    onSuccess: (r: any) => { if (r?.pendente) { toastPendente(); invalidateGov(); } else toast.success("Removido do plano"); invalidate(); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const itens = data?.itens ?? [];
  const resumo = data?.resumo;

  const porMes = useMemo(() => {
    const map = new Map<string, typeof itens>();
    for (const it of itens) {
      if (!map.has(it.mesPlanejado)) map.set(it.mesPlanejado, [] as any);
      map.get(it.mesPlanejado)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [itens]);

  // Filtro por período (padrão da plataforma) — null = ano todo
  const MESES_LABEL_FILTRO = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const hoje = new Date();
  const mesAtualStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [mesFiltro, setMesFiltro] = useState<number | null>(null);
  const [buscaFila, setBuscaFila] = useState("");
  const [abaPlano, setAbaPlano] = useState<"fila" | "dash">("fila");
  const [filtroObraFila, setFiltroObraFila] = useState("todas");
  // Obras presentes na fila (com contagem) — para o filtro rápido por obra
  const obrasFila = useMemo(() => {
    const m = new Map<string, number>();
    for (const [, lista] of porMes) for (const i of lista as any[]) {
      const o = String(i.obraAtual || "").trim();
      if (o) m.set(o, (m.get(o) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { sensitivity: "base" }));
  }, [porMes]);
  const porMesFiltrado = useMemo(() => {
    const pref = `${anoFiltro}-`;
    const alvo = mesFiltro === null ? null : `${anoFiltro}-${String(mesFiltro).padStart(2, "0")}`;
    let base = porMes.filter(([m]) => (alvo ? m === alvo : m.startsWith(pref)));
    if (filtroObraFila !== "todas") {
      base = base
        .map(([m, lista]) => [m, lista.filter((i: any) => String(i.obraAtual || "").trim() === filtroObraFila)] as [string, typeof lista])
        .filter(([, lista]) => lista.length > 0);
    }
    const q = removeAccents(buscaFila.trim().toLowerCase());
    if (!q) return base;
    return base
      .map(([m, lista]) => [m, lista.filter((i: any) =>
        removeAccents(`${i.nome || ""} ${i.funcao || ""} ${i.obraAtual || ""}`.toLowerCase()).includes(q)
      )] as [string, typeof lista])
      .filter(([, lista]) => lista.length > 0);
  }, [porMes, anoFiltro, mesFiltro, buscaFila, filtroObraFila]);
  const monthStatus = useMemo(() => {
    const st: Record<number, "data" | "none"> = {};
    for (let m = 1; m <= 12; m++) st[m] = "none";
    for (const [m, lista] of porMes) {
      if (!m.startsWith(`${anoFiltro}-`)) continue;
      // Respeita o filtro por obra: mês só "tem dados" se houver alguém daquela obra
      const tem = filtroObraFila === "todas"
        ? (lista as any[]).length > 0
        : (lista as any[]).some((i: any) => String(i.obraAtual || "").trim() === filtroObraFila);
      if (tem) st[Number(m.slice(5, 7))] = "data";
    }
    return st;
  }, [porMes, anoFiltro, filtroObraFila]);

  // Ordenação sugestiva do dialog de adicionar (apoio à decisão)
  const [ordenacao, setOrdenacao] = useState<"sugestao" | "faltas" | "atrasos" | "atestados" | "frequencia" | "menos_tempo" | "mais_tempo" | "mais_velho" | "mais_novo" | "nome">("sugestao");
  const [filtroContrato, setFiltroContrato] = useState<"todos" | "clt" | "pj">("todos");
  const [filtroFuncao, setFiltroFuncao] = useState<string>("todas");
  // Ordenação da fila do plano (custo do aviso prévio)
  const [ordemPlano, setOrdemPlano] = useState<"fila" | "caro" | "barato" | "faltas" | "atestados">("fila");
  // Filtro por grupo: todos | só quem entra em férias antes (1º passo) | só desligamento direto (2º passo)
  const [filtroGrupo, setFiltroGrupo] = useState<"todos" | "ferias" | "direto">("todos");
  // Rev. 4988 — PJ/Sócio não tem férias CLT: nunca entra na conta de férias do plano
  const precisaFerias = (i: any) => String(i.tipoContrato || "").toUpperCase() !== "PJ"
    && (Number(i.feriasVencidas ?? 0) > 0 || Number(i.feriasPendentes ?? 0) > 0 || !!i.feriasAgendada);

  // Memória de cálculo (dialog por mês)
  const [memoriaMes, setMemoriaMes] = useState<string | null>(null);
  // Detalhe de custos do funcionário (dialog ao clicar na linha)
  const [detalheItem, setDetalheItem] = useState<any | null>(null);

  // Imprimir/PDF do detalhe de custos (janela própria — nunca window.print de container fixed)
  const imprimirDetalhe = (it: any, avisoInfoFn: (i: any) => any, economiaFn: (i: any) => any, isPJFn: (i: any) => boolean) => {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const av = avisoInfoFn(it);
    if (!av) { toast.error("Sem salário base cadastrado — não é possível gerar o documento."); return; }
    const pj = isPJFn(it);
    const sal = parseMoneyBR(it.salarioBase) ?? 0;
    const custoFerias = !pj && precisaFerias(it) ? sal * (4 / 3) : 0;
    const ec = economiaFn(it);
    const logo = selectedCompany?.logoUrl || "/logo-fc.jpg";
    const empresa = selectedCompany?.name || "";
    const agora = new Date();
    const dataEmissao = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const emissor = user?.name || (user as any)?.username || "Usuário";
    const row = (label: string, valor: number, cls = "") =>
      `<tr class="${cls}"><td>${esc(label)}</td><td class="v">${esc(fmtMoney(valor))}</td></tr>`;
    const linhas = pj
      ? row("Aviso contratual (15 dias)", av.valor)
      : [
          custoFerias > 0 ? row("🏖 Férias antes de desligar (salário do mês de gozo + 1/3)", custoFerias) : "",
          row(`Aviso prévio (${av.dias} dias)`, av.valor),
          row("13º proporcional", av.decimo),
          row("Férias + 1/3 (vencidas em dobro + proporcionais)", av.feriasVal),
        ].join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Estimativa de Custos de Desligamento — ${esc(it.nome)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1e293b; padding: 32px 40px; font-size: 13px; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
  .header img { max-height: 52px; max-width: 180px; object-fit: contain; }
  .header .emp { font-size: 15px; font-weight: 700; }
  .header .meta { text-align: right; font-size: 11px; color: #64748b; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  .pessoa { background: #f1f5f9; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
  .pessoa .nome { font-size: 15px; font-weight: 700; text-transform: uppercase; }
  .pessoa .info { font-size: 11px; color: #64748b; margin-top: 2px; }
  .kpis { display: flex; gap: 10px; margin-bottom: 18px; }
  .kpi { flex: 1; border-radius: 10px; padding: 10px 12px; text-align: center; border: 1px solid #e2e8f0; }
  .kpi .t { font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  .kpi .n { font-size: 16px; font-weight: 700; margin-top: 3px; }
  .kpi.red { background: #fef2f2; border-color: #fecaca; } .kpi.red .n { color: #b91c1c; }
  .kpi.green { background: #f0fdf4; border-color: #bbf7d0; } .kpi.green .n { color: #15803d; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; margin: 16px 0 6px; color: #334155; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
  td.v { text-align: right; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.total td { background: #0f172a; color: #fff; font-weight: 700; border: none; }
  .multa { border: 2px solid #fca5a5; background: #fef2f2; border-radius: 10px; padding: 12px 14px; margin: 14px 0; display: flex; justify-content: space-between; align-items: center; }
  .multa b { color: #991b1b; } .multa .n { font-size: 17px; font-weight: 800; color: #b91c1c; }
  .multa .d { font-size: 11px; color: #7f1d1d; margin-top: 2px; }
  .nota { font-size: 11px; color: #64748b; margin-top: 10px; }
  .footer { margin-top: 28px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 10px; color: #64748b; }
  .footer b { color: #334155; }
  @media print { body { padding: 12px 8px; } }
</style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px">
      ${logo ? `<img src="${escAttr(logo)}" alt="Logo">` : ""}
      <div class="emp">${esc(empresa)}</div>
    </div>
    <div class="meta">Emitido em ${esc(dataEmissao)}<br>por <b>${esc(emissor)}</b></div>
  </div>
  <h1>Estimativa de Custos de Desligamento</h1>
  <div class="sub">Documento de apoio à decisão — Plano de Desligamento</div>
  <div class="pessoa">
    <div>
      <div class="nome">${esc(it.nome)}</div>
      <div class="info">${esc(it.funcao || "")} · ${pj ? "PJ" : "CLT"}${it.obraAtual ? " · " + esc(it.obraAtual) : ""}</div>
    </div>
    <div style="text-align:right;font-size:11px;color:#64748b">Desligamento planejado<br><b style="font-size:13px;color:#0f172a">${esc(mesLabel(it.mesPlanejado))}</b></div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="t">Rescisão total</div><div class="n">${esc(fmtMoney(av.total))}</div></div>
    <div class="kpi red"><div class="t">Custo adicional real</div><div class="n">${esc(fmtMoney(pj ? av.total : av.multaFgts))}</div></div>
    <div class="kpi green"><div class="t">Economia mensal</div><div class="n">${ec ? esc(fmtMoney(ec.total)) + "/mês" : "—"}</div></div>
  </div>
  <h2>${pj ? "Aviso contratual" : "Direitos adquiridos — seriam pagos de qualquer forma"}</h2>
  <table>${linhas}<tr class="total"><td>Total da rescisão estimada</td><td class="v">${esc(fmtMoney(av.total))}</td></tr></table>
  ${!pj ? `<div class="multa"><div><b>⚠ Multa 40% do FGTS</b><div class="d">Único custo que só existe por causa da demissão — todo o restante é direito adquirido.</div></div><div class="n">${esc(fmtMoney(av.multaFgts))}</div></div>` : `<div class="nota">PJ: sem verbas CLT — paga-se apenas o período de aviso previsto em contrato.</div>`}
  ${ec && !pj && av.multaFgts > 0 && ec.total > 0 ? `<div class="nota">💡 Com a economia de ${esc(fmtMoney(ec.total))}/mês, o custo adicional se paga em aproximadamente ${Math.max(1, Math.ceil(av.multaFgts / ec.total))} mês(es).</div>` : ""}
  <div class="nota">Valores estimados com base no salário atual — a rescisão oficial é calculada pelo RH/contabilidade.</div>
  <div class="footer">
    ${esc(empresa)} — documento gerado eletronicamente pelo sistema em ${esc(dataEmissao)}.<br>
    Emitido por: <b>${esc(emissor)}</b> · Documento de uso interno e confidencial, contém dados pessoais protegidos pela LGPD (Lei nº 13.709/2018). Acesso registrado para fins de rastreabilidade.
  </div>
  <div style="margin-top:8px;padding:7px 10px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:8.5px;color:#475569;line-height:1.55;page-break-inside:avoid;"><b style="color:#0f172a;">🔒 LGPD — Lei nº 13.709/2018:</b> este documento contém dados pessoais e é de uso interno e confidencial do RH. <b style="color:#0f172a;">Emissão registrada e rastreável:</b> gerado por <b style="color:#0f172a;">${esc(emissor)}</b> em ${esc(dataEmissao)}, pelo sistema FC Gestão Integrada (${esc(empresa)}). O emissor responde pela guarda e pelo descarte seguro desta impressão.</div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, ${logo ? 400 : 100}); };<\/script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Bloqueador de pop-up impediu a impressão. Permita pop-ups e tente de novo."); return; }
    w.document.write(html);
    w.document.close();
  };

  // ── Sugestão de cronograma por IA (fluxo de caixa) ──
  const [iaOpen, setIaOpen] = useState(false);
  const [iaProg, setIaProg] = useState(0);
  const [iaAplicando, setIaAplicando] = useState(false);
  const [iaAplicaProg, setIaAplicaProg] = useState(0);
  // Ajustes manuais do usuário SOBRE a sugestão da IA (id → mês escolhido)
  const [iaEdit, setIaEdit] = useState<Record<number, string>>({});
  const iaTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const iaMut = trpc.planoDesligamento.sugerirCronogramaIA.useMutation({
    onSuccess: () => { if (iaTimer.current) clearInterval(iaTimer.current); setIaProg(100); },
    onError: (e) => { if (iaTimer.current) clearInterval(iaTimer.current); setIaOpen(false); setIaProg(0); toast.error(e.message); },
  });
  // Perguntas antes da análise (diretrizes do gestor)
  const [iaConfigOpen, setIaConfigOpen] = useState(false);
  const [iaMesInicio, setIaMesInicio] = useState<string>("");
  const [iaMesPico, setIaMesPico] = useState<string>("");
  const [iaDiluicao, setIaDiluicao] = useState<string>("");
  const [iaMaxMes, setIaMaxMes] = useState("");
  const [iaMinMes, setIaMinMes] = useState("");
  // Máscara BR ao digitar: "40000" → "40.000"; preserva centavos após a vírgula
  const maskMoneyBR = (raw: string): string => {
    const s = raw.replace(/[^\d,]/g, "");
    const [int, ...resto] = s.split(",");
    const intFmt = int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return resto.length ? `${intFmt},${resto.join("").slice(0, 2)}` : intFmt;
  };
  const [iaObs, setIaObs] = useState("");
  // Critérios de prioridade de desligamento (chips clicáveis)
  const [iaPrioridades, setIaPrioridades] = useState<string[]>(["faltas", "atestados"]);
  const PRIO_CHIPS: { key: string; label: string }[] = [
    { key: "faltas", label: "⚠ Quem mais faltou" },
    { key: "atestados", label: "🩺 Mais atestados" },
    { key: "advertencias", label: "📋 Advertências / disciplina" },
    { key: "pontualidade", label: "⏰ Pontualidade (atrasos)" },
  ];
  const togglePrio = (k: string) => setIaPrioridades(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  // Teto ↔ Diluição linkados pelo custo total do plano: mudar um recalcula o outro
  const DILUICAO_OPCOES = Array.from({ length: 36 }, (_, i) => i + 1);
  const custoTotalPlano = () => itens.reduce((s: number, it: any) => s + (avisoInfo(it)?.total ?? 0), 0);
  const onTetoChange = (raw: string) => {
    const masked = maskMoneyBR(raw);
    setIaMaxMes(masked);
    const teto = parseMoneyBR(masked);
    const total = custoTotalPlano();
    if (teto && teto > 0 && total > 0) {
      const meses = Math.min(36, Math.max(1, Math.ceil(total / teto)));
      setIaDiluicao(String(meses));
    }
  };
  const onDiluicaoChange = (v: string) => {
    setIaDiluicao(v === "auto" ? "" : v);
    if (v === "auto") return;
    const total = custoTotalPlano();
    const n = Number(v);
    if (total > 0 && n > 0) setIaMaxMes(maskMoneyBR(String(Math.ceil(total / n))));
  };
  const iniciarIA = () => {
    setIaConfigOpen(false);
    setIaOpen(true); setIaProg(3); iaMut.reset(); setIaEdit({});
    if (iaTimer.current) clearInterval(iaTimer.current);
    iaTimer.current = setInterval(() => setIaProg(p => (p < 92 ? p + Math.max(1, Math.round((92 - p) / 18)) : p)), 450);
    iaMut.mutate({
      companyId: companyId!,
      mesInicio: iaMesInicio || undefined,
      mesPico: iaMesPico || undefined,
      mesesDiluicao: iaDiluicao ? Number(iaDiluicao) : undefined,
      maxPorMes: parseMoneyBR(iaMaxMes) || undefined,
      minPorMes: parseMoneyBR(iaMinMes) || undefined,
      instrucoes: iaObs.trim() ? iaObs.trim().slice(0, 400) : undefined,
      prioridades: iaPrioridades.length ? (iaPrioridades as any) : undefined,
    });
  };
  const aplicarIA = async () => {
    const sugs = (iaMut.data?.sugestoes ?? [])
      .map(s => ({ ...s, mesSugerido: iaEdit[s.id] ?? s.mesSugerido }))
      .filter(s => s.mesSugerido !== s.mesAtual);
    if (sugs.length === 0) { toast.info("Nenhuma mudança de mês a aplicar"); setIaOpen(false); return; }
    setIaAplicando(true);
    setIaAplicaProg(0);
    try {
      let feitos = 0;
      let pendentes = 0;
      for (const s of sugs) {
        const r: any = await updMut.mutateAsync({ companyId: companyId!, id: s.id, mesPlanejado: s.mesSugerido });
        if (r?.pendente) pendentes++;
        feitos++;
        setIaAplicaProg(Math.round((feitos / sugs.length) * 100));
      }
      if (pendentes > 0) {
        toast.info(`🔒 Plano consolidado — ${pendentes} solicitação(ões) enviada(s) para aprovação do Admin Master`, { duration: 6000 });
        invalidateGov();
      } else {
        toast.success(`${sugs.length} desligamento(s) remanejado(s) conforme a sugestão`);
      }
      invalidate(); setIaOpen(false);
    } catch (e: any) { toast.error(e?.message || "Falha ao aplicar"); }
    finally { setIaAplicando(false); }
  };

  // ── Aviso prévio indenizado (Lei 12.506/2011): 30 dias + 3 por ano completo, máx. 90 ──
  const parseMoneyBR = (v?: string | null): number | null => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    let s = String(v).replace(/[R$\s]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "3.000" = milhar BR, não 3
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };
  // Estimativa do CUSTO TOTAL da demissão sem justa causa (aviso indenizado):
  // aviso + 13º proporcional + férias vencidas/proporcionais +1/3 + multa 40% FGTS (estimada por tempo de casa)
  const avisoInfo = (it: any): { dias: number; valor: number; total: number; feriasVal: number; decimo: number; multaFgts: number } | null => {
    const sal = parseMoneyBR(it.salarioBase);
    if (!sal || sal <= 0 || !it.dataAdmissao) return null;
    const adm = new Date(String(it.dataAdmissao).slice(0, 10) + "T00:00:00");
    if (isNaN(adm.getTime())) return null;
    // Quem JÁ FOI desligado congela o cálculo na data do desligamento (realizado não sobe mais);
    // os demais recalculam todo dia pela data de hoje (valor tende a subir até concluir).
    let hoje = new Date();
    if (it.status === "desligado" && it.dataDesligamentoRef) {
      const ref = new Date(String(it.dataDesligamentoRef).slice(0, 10) + "T00:00:00");
      if (!isNaN(ref.getTime())) hoje = ref;
    }
    // PJ: sem verbas CLT — aviso contratual de 15 dias (paga-se 15 dias de trabalho proporcionais)
    if (isPJ(it)) {
      const aviso15 = (sal / 30) * 15;
      return { dias: 15, valor: aviso15, total: aviso15, feriasVal: 0, decimo: 0, multaFgts: 0 };
    }
    const anos = Math.max(0, Math.floor((hoje.getTime() - adm.getTime()) / (365.25 * 86400000)));
    const mesesCasa = Math.max(0, Math.floor((hoje.getTime() - adm.getTime()) / (30.44 * 86400000)));
    const dias = Math.min(90, 30 + anos * 3);
    const aviso = (sal / 30) * dias;
    // 13º proporcional: avos do ano corrente (mês atual conta com 15+ dias — aproximação: mês cheio)
    const decimo = sal * ((hoje.getMonth() + 1) / 12);
    // Férias vencidas (períodos completos não gozados) + proporcionais do período corrente, ambas +1/3
    const vencidas = Number(it.feriasVencidas ?? 0);
    const avosFerias = mesesCasa % 12;
    // Férias vencida paga em DOBRO na rescisão (art. 137 CLT) + 1/3
    const feriasVal = (vencidas * sal * 2 + sal * (avosFerias / 12)) * (4 / 3);
    // Multa 40% FGTS sobre depósitos estimados (8% × salário × meses de casa)
    const multaFgts = sal * 0.08 * mesesCasa * 0.4;
    return { dias, valor: aviso, total: aviso + decimo + feriasVal + multaFgts, feriasVal, decimo, multaFgts };
  };
  const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isPJ = (e: any) => String(e.tipoContrato || "").toUpperCase() === "PJ";
  // Custo total de UMA demissão do plano (rescisão + férias antes de desligar, quando aplicável)
  const custoItemPlano = (i: any): number => {
    const base = avisoInfo(i)?.total ?? 0;
    const ferias = !isPJ(i) && precisaFerias(i) ? (parseMoneyBR(i.salarioBase) ?? 0) * (4 / 3) : 0;
    return base + ferias;
  };
  // Mês seguinte no formato YYYY-MM
  const mesProx = (m: string) => { const [y, mm] = String(m).split("-").map(Number); return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`; };
  // Parcelas de caixa de um item: quem entra em férias antes custa as FÉRIAS no mês planejado (gozo)
  // e a RESCISÃO no mês seguinte (desliga depois da volta). Desligamento direto = tudo no mês planejado.
  const parcelasItem = (i: any): { mes: string; valor: number; tipo: "ferias" | "rescisao" }[] => {
    const m = String(i.mesPlanejado || "");
    if (!/^\d{4}-\d{2}$/.test(m)) return [];
    const resc = avisoInfo(i)?.total ?? 0;
    if (!isPJ(i) && precisaFerias(i)) {
      const sal = parseMoneyBR(i.salarioBase) ?? 0;
      return [{ mes: m, valor: sal * (4 / 3), tipo: "ferias" }, { mes: mesProx(m), valor: resc, tipo: "rescisao" }];
    }
    return [{ mes: m, valor: resc, tipo: "rescisao" }];
  };
  // Limite legal do gozo (período concessivo): mês planejado das férias NÃO pode passar do vencimento
  const limiteFeriasMes = (i: any): string | null =>
    !isPJ(i) && precisaFerias(i) && i.feriasProxVenc ? String(i.feriasProxVenc).slice(0, 7) : null;
  // Rev. 4987 — regra dos 2 vencimentos: se o vencimento mais próximo é do 1º PERÍODO,
  // dá pra prorrogar (férias dobram) até o vencimento do 2º período; se já é o 2º
  // período (ou mais), o vencimento vira limite duro — proibido mover pra depois.
  const vence1Periodo = (i: any): boolean => Number(i.feriasProxVencNumero ?? 1) === 1;
  const limiteDuroFeriasMes = (i: any): string | null => {
    const lim1 = limiteFeriasMes(i);
    if (!lim1) return null;
    if (!vence1Periodo(i)) return lim1;
    return i.feriasVenc2 ? String(i.feriasVenc2).slice(0, 7) : lim1;
  };
  const foraDoLimiteFerias = (i: any): boolean => {
    const lim = limiteFeriasMes(i);
    return !!lim && String(i.mesPlanejado || "") > lim;
  };
  // Itens ativos do plano (fora cancelados/já desligados) e totais por ano — recalculados diariamente
  const ativosPlano = useMemo(() => itens.filter((i: any) => i.status !== "cancelado" && i.status !== "desligado"), [itens]);
  // Teto de desembolso mensal (configurável) + carga atual por mês (parcelas cruzadas: férias no gozo, rescisão no mês seguinte)
  const tetoMes: number | null = (resumo as any)?.tetoMes ?? null;
  const TETO_MARGEM = 1.1; // margenzinha de 10% pra cima
  const cargaPorMes = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of ativosPlano) for (const p of parcelasItem(i)) map.set(p.mes, (map.get(p.mes) ?? 0) + p.valor);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativosPlano]);
  // Sugestão de realocação p/ desafogar um mês estourado: o item mais barato que caiba num mês com folga
  const sugestaoDesafogo = (mes: string): { item: any; destino: string; valor: number } | null => {
    if (!tetoMes) return null;
    const doMes = ativosPlano.filter(i => i.mesPlanejado === mes).map(i => ({ i, v: custoItemPlano(i) })).sort((a, b) => a.v - b.v);
    const meses = proximosMeses();
    for (const { i, v } of doMes) {
      const lim = limiteDuroFeriasMes(i);
      for (const m of meses) {
        if (m === mes || (lim && m > lim)) continue;
        if ((cargaPorMes.get(m) ?? 0) + v <= tetoMes * TETO_MARGEM) return { item: i, destino: m, valor: v };
      }
    }
    return null;
  };
  // Redistribuição automática: preenche mês a mês até o teto (com a margem), respeitando o limite das férias
  const redistribuir = async () => {
    if (!tetoMes || !companyId) return;
    const meses = proximosMeses(24);
    const fila = [...ativosPlano].sort((a, b) => {
      const la = limiteFeriasMes(a) ?? "9999-99", lb = limiteFeriasMes(b) ?? "9999-99";
      return la.localeCompare(lb) || String(a.mesPlanejado).localeCompare(String(b.mesPlanejado)) || a.id - b.id;
    });
    const carga = new Map<string, number>();
    const destino = new Map<number, string>();
    for (const i of fila) {
      const parcelas = parcelasItem(i);
      const lim = limiteDuroFeriasMes(i);
      let alocado: string | null = null;
      for (const m of meses) {
        if (lim && m > lim) break;
        const cabe = parcelas.every(p => {
          const pm = p.mes === i.mesPlanejado ? m : mesProx(m);
          return (carga.get(pm) ?? 0) + p.valor <= tetoMes * TETO_MARGEM;
        });
        if (cabe) { alocado = m; break; }
      }
      if (!alocado) alocado = lim && lim < meses[0] ? meses[0] : (lim ?? meses[meses.length - 1]);
      for (const p of parcelas) {
        const pm = p.mes === i.mesPlanejado ? alocado : mesProx(alocado);
        carga.set(pm, (carga.get(pm) ?? 0) + p.valor);
      }
      if (alocado !== i.mesPlanejado) destino.set(i.id, alocado);
    }
    if (destino.size === 0) { toast.info("Nada a mover — a distribuição já respeita o teto."); return; }
    if (!confirm(`Redistribuir ${destino.size} pessoa(s) pra caber no teto de ${fmtMoney(tetoMes)}/mês (±10%)?`)) return;
    setRedistribuindo(true);
    try {
      for (const [id, m] of destino) await updMut.mutateAsync({ companyId, id, mesPlanejado: m });
      toast.success(`${destino.size} pessoa(s) remanejada(s) pra caber no teto.`);
    } catch (e: any) { toast.error(errMsg(e)); } finally { setRedistribuindo(false); invalidate(); }
  };
  const custosPorAno = useMemo(() => {
    const map = new Map<string, { total: number; multa: number; qtd: number }>();
    for (const i of ativosPlano) {
      const ano = String(i.mesPlanejado || "").slice(0, 4);
      if (!/^\d{4}$/.test(ano)) continue;
      const e = map.get(ano) ?? { total: 0, multa: 0, qtd: 0 };
      e.total += custoItemPlano(i);
      e.multa += avisoInfo(i)?.multaFgts ?? 0; // único custo que só existe por causa da demissão
      e.qtd += 1;
      map.set(ano, e);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativosPlano, resumo?.vaMensal]);
  const custoTotalPlanoGeral = useMemo(() => custosPorAno.reduce((s, [, v]) => s + v.total, 0), [custosPorAno]);
  const multaTotalPlano = useMemo(() => custosPorAno.reduce((s, [, v]) => s + v.multa, 0), [custosPorAno]);
  // Memória de cálculo / auditoria dos totais do topo (clique em qualquer valor)
  const [memoriaAud, setMemoriaAud] = useState<{ titulo: string; pessoas: any[]; foco?: "economia" | "multa"; mesRef?: string } | null>(null);

  // Economia MENSAL ao desligar: salário + encargos (INSS patronal/RAT/terceiros/FGTS + provisões 13º/férias ≈ 55%)
  // + alimentação (VA vigente da empresa) + EPI/uniforme REAL (média mensal do histórico de entregas
  // projetada pra frente; sem registro = R$ 0). PJ = só o valor mensal do contrato.
  const economiaMensal = (it: any): { total: number; sal: number; encargos: number; va: number; epi: number } | null => {
    const sal = parseMoneyBR(it.salarioBase);
    if (!sal || sal <= 0) return null;
    if (isPJ(it)) return { total: sal, sal, encargos: 0, va: 0, epi: 0 };
    const encargos = sal * 0.55;
    const va = Number(resumo?.vaMensal ?? 0);
    const epi = Number(it.epiMedioMes ?? 0) || 0;
    return { total: sal + encargos + va + epi, sal, encargos, va, epi };
  };

  const mesesDeCasa = (dataAdmissao?: string | null) => {
    if (!dataAdmissao) return null;
    const d = new Date(String(dataAdmissao).slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  };
  const tempoLabel = (meses: number | null) => {
    if (meses === null) return null;
    if (meses < 12) return `${meses}m de casa`;
    const anos = Math.floor(meses / 12);
    const resto = meses % 12;
    return `${anos}a${resto > 0 ? ` ${resto}m` : ""} de casa`;
  };
  const idadeAnos = (dataNascimento?: string | null) => {
    if (!dataNascimento) return null;
    const d = new Date(String(dataNascimento).slice(0, 10) + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    const hoje = new Date();
    let anos = hoje.getFullYear() - d.getFullYear();
    if (hoje.getMonth() < d.getMonth() || (hoje.getMonth() === d.getMonth() && hoje.getDate() < d.getDate())) anos--;
    return anos >= 0 && anos < 120 ? anos : null;
  };
  // Estabilidades/proteções marcadas no sistema (CIPA, gestante, licença/afastamento)
  const protecoes = (e: any): { label: string; cls: string }[] => {
    const out: { label: string; cls: string }[] = [];
    if (e.cipaEstabilidadeFim) {
      const fim = String(e.cipaEstabilidadeFim).slice(0, 10);
      const semFim = fim.startsWith("9999");
      out.push({ label: semFim ? "🛡 CIPA" : `🛡 CIPA até ${fim.slice(8, 10)}/${fim.slice(5, 7)}/${fim.slice(0, 4)}`, cls: "bg-blue-100 text-blue-800 border-blue-300" });
    }
    if (Number(e.licencaMaternidade ?? 0) === 1) out.push({ label: "🤰 Gestante/maternidade", cls: "bg-pink-100 text-pink-800 border-pink-300" });
    if (e.licencaTipo) out.push({ label: `⚕️ Licença: ${String(e.licencaTipo).replace(/_/g, " ")}`, cls: "bg-orange-100 text-orange-800 border-orange-300" });
    if (e.statusFuncionario === "Afastado") out.push({ label: "⚕️ Afastado (INSS)", cls: "bg-orange-100 text-orange-800 border-orange-300" });
    if (e.statusFuncionario === "Recluso") out.push({ label: "Recluso", cls: "bg-gray-200 text-gray-700 border-gray-300" });
    if (e.avisoAtivo) out.push({ label: "⏳ Já está de aviso prévio", cls: "bg-amber-100 text-amber-800 border-amber-300" });
    return out;
  };
  // Score sugestivo: mais faltas/atestados/advertências e menos tempo de casa sobem na lista;
  // quem tem estabilidade/proteção afunda na ordenação de sugestões
  const scoreSugestao = (e: any) => {
    const m = mesesDeCasa(e.dataAdmissao);
    const pontoTempo = m === null ? 0 : m < 12 ? 3 : m < 36 ? 1 : 0;
    const base = Number(e.faltas12m ?? 0) * 3 + Number(e.atrasos12m ?? 0) + Number(e.atestados12m ?? 0) * 2 + Number(e.advertencias12m ?? 0) * 2 + pontoTempo;
    return protecoes(e).length > 0 ? base - 1000 : base;
  };
  // Situação de férias — apoio ao cronograma de desembolso (férias vencida = dobro na rescisão)
  const fmtBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const feriasBadges = (it: any): { label: string; cls: string }[] => {
    const out: { label: string; cls: string }[] = [];
    // Rev. 4988 — PJ não tem férias CLT: nenhum selo de férias
    if (String(it.tipoContrato || "").toUpperCase() === "PJ") return out;
    const vencidas = Number(it.feriasVencidas ?? 0);
    const pendentes = Number(it.feriasPendentes ?? 0);
    const prox = it.feriasProxVenc ? String(it.feriasProxVenc).slice(0, 10) : null;
    const agendada = it.feriasAgendada ? String(it.feriasAgendada).slice(0, 10) : null;
    const emGozoFim = it.feriasEmGozoFim ? String(it.feriasEmGozoFim).slice(0, 10) : null;
    if (emGozoFim || it.statusFuncionario === "Ferias") {
      out.push({ label: `🌴 EM FÉRIAS agora${emGozoFim ? ` — volta após ${fmtBR(emGozoFim)}` : ""}`, cls: "bg-teal-100 text-teal-800 border-teal-300" });
    }
    if (vencidas > 0) {
      out.push({ label: `🏖 Férias VENCIDA${vencidas > 1 ? ` ×${vencidas}` : ""} — dobra na rescisão, sugerir gozo antes`, cls: "bg-red-100 text-red-800 border-red-300" });
    } else if (prox) {
      const dias = Math.round((new Date(prox + "T12:00:00").getTime() - Date.now()) / 86400000);
      if (dias <= 90) out.push({ label: `🏖 Férias vence em ${fmtBR(prox)} — priorizar gozo/desligamento`, cls: "bg-amber-100 text-amber-800 border-amber-300" });
      else if (pendentes > 0) out.push({ label: `🏖 Férias a gozar (vence ${fmtBR(prox)}) — pode antecipar p/ diluir desembolso`, cls: "bg-emerald-100 text-emerald-800 border-emerald-300" });
    }
    if (agendada) out.push({ label: `🗓 Férias agendada ${fmtBR(agendada)} — 💡 antecipar p/ desligar depois do gozo`, cls: "bg-blue-100 text-blue-800 border-blue-300" });
    // Trava: mês planejado do gozo NÃO pode passar do limite (período concessivo) das férias.
    // Rev. 4987 — 1º período vencido = pode prorrogar (dobra); 2º período = proibido.
    if (foraDoLimiteFerias(it)) {
      const durou = limiteDuroFeriasMes(it);
      const passouDoDuro = !!durou && String(it.mesPlanejado || "") > durou;
      if (passouDoDuro) {
        out.push({ label: `🚫 Mês planejado DEPOIS do vencimento do 2º PERÍODO — PROIBIDO, mover pra antes`, cls: "bg-red-200 text-red-900 border-red-400 font-bold" });
      } else if (vence1Periodo(it)) {
        out.push({ label: `⚠️ Mês planejado DEPOIS do vencimento do 1º período (vence ${fmtBR(String(it.feriasProxVenc).slice(0, 10))}) — dá pra prorrogar, mas as férias dobram`, cls: "bg-orange-100 text-orange-900 border-orange-300 font-bold" });
      } else {
        out.push({ label: `🚫 Mês planejado DEPOIS do limite das férias (2º período, vence ${fmtBR(String(it.feriasProxVenc).slice(0, 10))}) — PROIBIDO, mover pra antes`, cls: "bg-red-200 text-red-900 border-red-400 font-bold" });
      }
    }
    return out;
  };

  const elegFiltrados = useMemo(() => {
    const q = removeAccents(busca.toLowerCase());
    const base = (elegiveis ?? []).filter((e: any) => {
      if (filtroContrato === "pj" && !isPJ(e)) return false;
      if (filtroContrato === "clt" && isPJ(e)) return false;
      if (filtroFuncao !== "todas" && String(e.funcao || "").trim() !== filtroFuncao) return false;
      return !q || removeAccents(`${e.nome} ${e.funcao || ""} ${e.obraAtual || ""}`.toLowerCase()).includes(q);
    });
    const byNome = (a: any, b: any) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR", { sensitivity: "base" });
    const sorted = [...base];
    switch (ordenacao) {
      case "sugestao":
        sorted.sort((a, b) => scoreSugestao(b) - scoreSugestao(a) || byNome(a, b)); break;
      case "faltas":
        sorted.sort((a, b) => Number(b.faltas12m ?? 0) - Number(a.faltas12m ?? 0) || byNome(a, b)); break;
      case "atrasos":
        sorted.sort((a, b) => Number(b.atrasos12m ?? 0) - Number(a.atrasos12m ?? 0) || byNome(a, b)); break;
      case "frequencia":
        sorted.sort((a, b) => (Number(a.freqPct ?? 101)) - (Number(b.freqPct ?? 101)) || (Number(a.pontPct ?? 101)) - (Number(b.pontPct ?? 101)) || byNome(a, b)); break;
      case "atestados":
        sorted.sort((a, b) => (Number(b.atestados12m ?? 0) - Number(a.atestados12m ?? 0)) || (Number(b.atestadosDias12m ?? 0) - Number(a.atestadosDias12m ?? 0)) || byNome(a, b)); break;
      case "menos_tempo":
        sorted.sort((a, b) => (mesesDeCasa(a.dataAdmissao) ?? 9999) - (mesesDeCasa(b.dataAdmissao) ?? 9999) || byNome(a, b)); break;
      case "mais_tempo":
        sorted.sort((a, b) => (mesesDeCasa(b.dataAdmissao) ?? -1) - (mesesDeCasa(a.dataAdmissao) ?? -1) || byNome(a, b)); break;
      case "mais_velho":
        sorted.sort((a, b) => (idadeAnos(b.dataNascimento) ?? -1) - (idadeAnos(a.dataNascimento) ?? -1) || byNome(a, b)); break;
      case "mais_novo":
        sorted.sort((a, b) => (idadeAnos(a.dataNascimento) ?? 999) - (idadeAnos(b.dataNascimento) ?? 999) || byNome(a, b)); break;
      default:
        sorted.sort(byNome);
    }
    return sorted;
  }, [elegiveis, busca, ordenacao, filtroContrato, filtroFuncao]);

  const funcoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const e of elegiveis ?? []) { const f = String((e as any).funcao || "").trim(); if (f) set.add(f); }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [elegiveis]);
  // Quantidade de pessoas por função (para exibir ao lado no dropdown)
  const funcaoContagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of elegiveis ?? []) {
      const f = String((e as any).funcao || "").trim();
      if (f) m.set(f, (m.get(f) ?? 0) + 1);
    }
    return m;
  }, [elegiveis]);

  const progresso = resumo && resumo.meta > 0 ? Math.min(100, Math.round((resumo.desligados / resumo.meta) * 100)) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-5xl mx-auto">
        {/* Hero header */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-red-950 text-white p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-red-500/20 border border-red-400/30 flex items-center justify-center shrink-0">
                <TrendingDown className="h-6 w-6 text-red-300" />
              </div>
              <div>
                <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
                  Plano de Desligamento
                  {gov?.consolidado && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200">
                      🔒 Consolidado · Rev. {gov.revisaoAtual}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-slate-300">Fila de demissões programadas por mês · <span className="text-red-300 font-medium">confidencial RH</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={!companyId} onClick={() => setGovOpen(true)}
                className="relative text-slate-300 hover:text-white hover:bg-white/10 border border-white/20 rounded-lg text-xs font-semibold">
                📜 Revisões
                {(gov?.pendentes?.length ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {gov!.pendentes.length}
                  </span>
                )}
              </Button>
              {gov?.master && !gov?.consolidado && (
                <Button disabled={!companyId || consolidarMut.isPending} onClick={() => consolidarMut.mutate({ companyId: companyId! })}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow text-xs">
                  🔒 Consolidar
                </Button>
              )}
              {gov?.master && gov?.consolidado && (
                <Button disabled={!companyId || desconsolidarMut.isPending} onClick={() => desconsolidarMut.mutate({ companyId: companyId! })}
                  variant="ghost" className="text-amber-200 hover:text-white hover:bg-white/10 border border-amber-300/40 rounded-lg text-xs font-semibold">
                  🔓 Desconsolidar
                </Button>
              )}
              <Button onClick={() => setAddOpen(true)} disabled={!companyId}
                className="bg-white text-slate-900 hover:bg-slate-100 font-semibold shadow">
                <Plus className="h-4 w-4 mr-1" /> Adicionar ao plano
              </Button>
              <Button variant="ghost" size="icon" disabled={!companyId} title="Configurar meta"
                onClick={() => { setMetaInput(resumo?.metaCustom ? String(resumo.metaCustom) : ""); setTetoInput(tetoMes != null ? tetoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""); setMetaOpen(true); }}
                className="text-slate-300 hover:text-white hover:bg-white/10 border border-white/20 rounded-lg">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Progresso da meta dentro do hero */}
          {resumo && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                <span>Progresso da meta {resumo.metaCustom ? `(${resumo.metaCustom} pessoas — definida manualmente)` : "(redução 50%)"}</span>
                <span className="font-semibold text-white">{resumo.desligados} de {resumo.meta} · {progresso}%</span>
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all" style={{ width: `${progresso}%` }} />
              </div>
              {/* Custo total do plano + total por ano — recalculado todo dia (aviso, 13º e férias crescem com a data) */}
              {custoTotalPlanoGeral > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <div role="button" onClick={() => setMemoriaAud({ titulo: `Impacto no caixa — plano completo (${ativosPlano.length} pessoas)`, pessoas: ativosPlano })}
                    className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 flex-1 min-w-[240px] cursor-pointer hover:bg-white/10 transition-colors" title="Ver memória de cálculo">
                    <p className="text-[11px] text-slate-300 leading-tight">💰 Impacto no caixa ({ativosPlano.length} pessoa{ativosPlano.length !== 1 ? "s" : ""}) 🔍</p>
                    <p className="text-xl font-bold text-white tabular-nums leading-tight">{fmtMoney(custoTotalPlanoGeral)}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">rescisões + férias antes de desligar · atualizado diariamente pela data de hoje</p>
                  </div>
                  <div role="button" onClick={() => setMemoriaAud({ titulo: `Custo REAL da demissão — multa 40% FGTS (${ativosPlano.length} pessoas)`, pessoas: ativosPlano })}
                    className="rounded-xl bg-red-500/10 border border-red-400/30 px-4 py-2.5 flex-1 min-w-[240px] cursor-pointer hover:bg-red-500/20 transition-colors" title="Ver memória de cálculo">
                    <p className="text-[11px] text-red-200 leading-tight">⚠ Custo REAL da demissão (multa 40% FGTS) 🔍</p>
                    <p className="text-xl font-bold text-red-100 tabular-nums leading-tight">{fmtMoney(multaTotalPlano)}</p>
                    <p className="text-[10px] text-red-200/70 leading-tight">único valor que só existe por causa da demissão — o restante ({fmtMoney(custoTotalPlanoGeral - multaTotalPlano)}) é direito adquirido do funcionário, pago agora ou depois</p>
                  </div>
                  {custosPorAno.map(([ano, v]) => (
                    <div key={ano} role="button" title="Ver memória de cálculo"
                      onClick={() => setMemoriaAud({ titulo: `Total ${ano} (${v.qtd} pessoas)`, pessoas: ativosPlano.filter((i: any) => String(i.mesPlanejado || "").startsWith(`${ano}-`)) })}
                      className={`rounded-xl px-4 py-2.5 flex-1 min-w-[150px] border cursor-pointer transition-colors ${
                      Number(ano) === new Date().getFullYear() ? "bg-amber-500/10 border-amber-300/30 hover:bg-amber-500/20" : "bg-white/5 border-white/10 hover:bg-white/10"
                    }`}>
                      <p className={`text-[11px] leading-tight ${Number(ano) === new Date().getFullYear() ? "text-amber-200" : "text-slate-300"}`}>
                        📅 Total {ano} ({v.qtd} pessoa{v.qtd !== 1 ? "s" : ""})
                      </p>
                      <p className={`text-xl font-bold tabular-nums leading-tight ${Number(ano) === new Date().getFullYear() ? "text-amber-100" : "text-white"}`}>
                        {fmtMoney(v.total)}
                      </p>
                      <p className={`text-[10px] leading-tight ${Number(ano) === new Date().getFullYear() ? "text-amber-200/70" : "text-slate-400"}`}>
                        a dispor até dez/{ano} · custo real (multa 40%): <span className="font-semibold">{fmtMoney(v.multa)}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* KPIs */}
        {resumo && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Users, label: "Quadro ativo hoje", valor: resumo.headcountAtivo, sub: "colaboradores", iconCls: "bg-slate-100 text-slate-600" },
              { icon: Target, label: "Meta de redução", valor: resumo.meta, sub: resumo.metaCustom ? "desligamentos (manual ⚙)" : "desligamentos (50%)", iconCls: "bg-indigo-50 text-indigo-600" },
              {
                icon: CalendarClock, label: "Programados", valor: resumo.programados,
                sub: resumo.programados + resumo.desligados < resumo.meta
                  ? `faltam ${resumo.meta - resumo.programados - resumo.desligados} p/ meta`
                  : "meta coberta ✓",
                iconCls: "bg-amber-50 text-amber-600",
                subCls: resumo.programados + resumo.desligados < resumo.meta ? "text-amber-600" : "text-green-600",
              },
              { icon: CheckCircle2, label: "Já desligados", valor: resumo.desligados, sub: `${progresso}% da meta`, iconCls: "bg-green-50 text-green-600" },
            ].map((k, i) => (
              <Card key={i} className="border-gray-100 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${k.iconCls}`}>
                    <k.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
                    <p className="text-2xl font-bold leading-tight">{k.valor}</p>
                    <p className={`text-[11px] leading-tight ${(k as any).subCls || "text-muted-foreground"}`}>{k.sub}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Abas: Fila × Dash */}
        <div className="flex gap-1 border-b border-gray-200">
          {([
            { k: "fila", label: "📋 Fila de desligamentos" },
            { k: "dash", label: "📊 Dash" },
          ] as const).map(({ k, label }) => (
            <button key={k} type="button" onClick={() => setAbaPlano(k)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors -mb-px ${
                abaPlano === k
                  ? "bg-white border-gray-200 text-slate-900 shadow-sm"
                  : "bg-transparent border-transparent text-gray-500 hover:text-gray-800"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Fila por mês */}
        {abaPlano === "dash" ? (() => {
          // ====== DASH — análise do plano (só programados ativos) ======
          const todos = porMes.flatMap(([m, lista]) => (lista as any[]).filter(i => i.status !== "cancelado" && i.status !== "desligado").map(i => ({ ...i, __mes: m })));
          if (todos.length === 0) return <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum desligamento programado para analisar.</CardContent></Card>;
          const custo = (i: any) => custoItemPlano(i);
          const multa = (i: any) => avisoInfo(i)?.multaFgts ?? 0;
          const eco = (i: any) => economiaMensal(i)?.total ?? 0;
          const soma = (arr: any[], f: (i: any) => number) => arr.reduce((s, i) => s + f(i), 0);
          const totalCusto = soma(todos, custo);
          const totalMulta = soma(todos, multa);
          const totalEco = soma(todos, eco);
          const pjs = todos.filter(i => isPJ(i));
          // Caixa cruzado: férias no mês do gozo, rescisão de quem tira férias antes no mês seguinte
          const parcelasAll = todos.flatMap(parcelasItem);
          const mesesArr = Array.from(new Set([...todos.map(i => i.__mes), ...parcelasAll.map(p => p.mes)])).sort();
          const porMesDash = mesesArr.map(m => {
            const l = todos.filter(i => i.__mes === m);
            // Rev. 4990 — contribuintes REAIS do caixa do mês (inclui rescisões vindas de
            // férias do mês anterior); multa e nº de pessoas seguem os contribuintes, não
            // só os planejados — senão a barra vermelha e a contagem não fecham com o valor.
            const contribs = todos.filter(i => parcelasItem(i).some(p => p.mes === m));
            const multaMes = soma(todos.filter(i => parcelasItem(i).some(p => p.mes === m && p.tipo === "rescisao")), multa);
            return { m, n: contribs.length, custo: parcelasAll.filter(p => p.mes === m).reduce((s, p) => s + p.valor, 0), multa: multaMes, eco: soma(l, eco) };
          });
          const maxCustoMes = Math.max(...porMesDash.map(x => x.custo), 1);
          const funcs = Array.from(new Set(todos.map(i => String(i.funcao || "—")))).map(f => {
            const l = todos.filter(i => String(i.funcao || "—") === f);
            return { f, n: l.length, custo: soma(l, custo), eco: soma(l, eco) };
          }).sort((a, b) => b.n - a.n || b.custo - a.custo);
          const maxFuncCusto = Math.max(...funcs.map(x => x.custo), 1);
          const mesMaisCaro = [...porMesDash].sort((a, b) => b.custo - a.custo)[0];
          const mesMaisBarato = [...porMesDash].sort((a, b) => a.custo - b.custo)[0];
          const obrasD = Array.from(new Set(todos.map(i => String(i.obraAtual || "🚫 Sem obra (sem alocação ativa)")))).map(o => {
            const l = todos.filter(i => String(i.obraAtual || "🚫 Sem obra (sem alocação ativa)") === o);
            return { o, n: l.length, custo: soma(l, custo) };
          }).sort((a, b) => b.custo - a.custo);
          const maxObraCusto = Math.max(...obrasD.map(x => x.custo), 1);
          const maisCaros = [...todos].sort((a, b) => custo(b) - custo(a)).slice(0, 5);
          const custoMedio = totalCusto / todos.length;
          const tempos = todos.map(i => mesesDeCasa(i.dataAdmissao)).filter((x): x is number => x !== null);
          const tempoMedio = tempos.length ? Math.round(tempos.reduce((s, x) => s + x, 0) / tempos.length) : null;
          const idades = todos.map(i => idadeAnos(i.dataNascimento)).filter((x): x is number => x !== null);
          const idadeMedia = idades.length ? Math.round(idades.reduce((s, x) => s + x, 0) / idades.length) : null;
          const paybackMeses = totalEco > 0 ? totalMulta / totalEco : null;
          const comFerias = todos.filter(i => precisaFerias(i)).length;
          const pctMultaTotal = totalCusto > 0 ? Math.round((totalMulta / totalCusto) * 100) : 0;
          return (
            <div className="space-y-5">
              {/* ===== 1. O plano em 1 minuto (narrativa) ===== */}
              <Card className="overflow-hidden border-0 shadow-md">
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-white/60 font-bold">1 · O plano em 1 minuto</p>
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-start gap-2.5">
                      <span className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center text-xs shrink-0 mt-0.5">👥</span>
                      <p className="text-sm text-white/90 leading-snug">
                        <b className="text-white">{todos.length} pessoas</b> saem do quadro
                        <span className="text-white/60"> ({todos.length - pjs.length} CLT · {pjs.length} PJ)</span>
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center text-xs shrink-0 mt-0.5">💸</span>
                      <p className="text-sm text-white/90 leading-snug">
                        Sai do caixa <b className="text-white">{fmtMoney(totalCusto)}</b>. Desse valor, só{" "}
                        <b className="text-red-300">{fmtMoney(totalMulta)}</b> <span className="text-white/60">({pctMultaTotal}%)</span> é custo criado pela demissão: a multa de 40% do FGTS.
                        Os outros <b className="text-white">{fmtMoney(totalCusto - totalMulta)}</b> já são do funcionário e seriam pagos de qualquer forma.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="h-6 w-6 rounded-full bg-white/10 flex items-center justify-center text-xs shrink-0 mt-0.5">💰</span>
                      <p className="text-sm text-white/90 leading-snug">
                        Depois do plano, a folha fica <b className="text-emerald-300">{fmtMoney(totalEco)} menor por mês</b>.
                        {paybackMeses !== null && <> Em <b className="text-emerald-300">~{Math.max(1, Math.ceil(paybackMeses))} mês(es)</b> essa economia já cobre a multa.</>}
                      </p>
                    </div>
                  </div>
                  {/* Barra didática: composição do impacto */}
                  <div className="mt-3">
                    <div className="h-4 rounded-full overflow-hidden flex bg-white/10">
                      <div className="h-full bg-gradient-to-r from-rose-500 to-red-400" style={{ width: `${Math.max(4, pctMultaTotal)}%` }} />
                      <div className="h-full flex-1 bg-gradient-to-r from-indigo-400 to-violet-400" />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-white/70">
                      <span>🔴 Custo real (multa 40%): <b className="text-red-300">{fmtMoney(totalMulta)}</b></span>
                      <span>🟣 Direitos adquiridos: <b>{fmtMoney(totalCusto - totalMulta)}</b></span>
                    </div>
                  </div>
                </div>
              </Card>
              {/* ===== 2. Os 4 números que importam ===== */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">2 · Os 4 números que importam <span className="normal-case font-normal">(toque em qualquer um p/ ver a conta)</span></p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { t: "👥 Pessoas", v: String(todos.length), sub: `${todos.length - pjs.length} CLT + ${pjs.length} PJ`, cls: "from-slate-800 to-slate-600", aud: `Pessoas no plano (${todos.length})`, foco: undefined },
                    { t: "💸 Sai do caixa", v: fmtMoney(totalCusto), sub: `média ${fmtMoney(custoMedio)} por pessoa`, cls: "from-indigo-700 to-violet-600", aud: `Impacto total no caixa (${todos.length} pessoas)`, foco: undefined },
                    { t: "⚠ Custo real (multa 40%)", v: fmtMoney(totalMulta), sub: `só ${pctMultaTotal}% do que sai do caixa`, cls: "from-rose-700 to-red-500", aud: `Custo real (multa 40%) — ${todos.length} pessoas`, foco: "multa" as const },
                    { t: "💰 Folha cai", v: `${fmtMoney(totalEco)}/mês`, sub: paybackMeses !== null ? `multa se paga em ~${Math.max(1, Math.ceil(paybackMeses))} mês(es)` : "", cls: "from-emerald-700 to-teal-500", aud: `Economia ao concluir (${todos.length} pessoas)`, foco: "economia" as const },
                  ].map((c, i) => (
                    <div key={i} role="button" title="Ver memória de cálculo"
                      onClick={() => setMemoriaAud({ titulo: c.aud, pessoas: todos, foco: c.foco })}
                      className={`rounded-xl bg-gradient-to-br ${c.cls} text-white px-4 py-3 shadow-md cursor-pointer hover:opacity-90 transition-opacity`}>
                      <p className="text-[10px] uppercase tracking-wide text-white/70 font-bold">{c.t} 🔍</p>
                      <p className="text-xl font-extrabold tabular-nums mt-0.5 leading-tight">{c.v}</p>
                      {c.sub && <p className="text-[10px] text-white/70 mt-0.5">{c.sub}</p>}
                    </div>
                  ))}
                </div>
              </div>
              {/* ===== 3. Perfil de quem sai ===== */}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">3 · Perfil de quem sai</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { t: "🏖 Entram em férias antes", v: `${comFerias}`, sub: "1º passo do fluxo" },
                    { t: "⏱ Tempo médio de casa", v: tempoMedio !== null ? tempoLabel(tempoMedio) ?? "—" : "—", sub: "dos programados" },
                    { t: "🎂 Idade média", v: idadeMedia !== null ? `${idadeMedia} anos` : "—", sub: "dos programados" },
                    { t: "📅 Duração do plano", v: `${mesesArr.length} meses`, sub: `${mesesArr[0] ? mesLabel(mesesArr[0]) : ""} → ${mesesArr.length ? mesLabel(mesesArr[mesesArr.length - 1]) : ""}` },
                    { t: "🔺 Mês mais pesado", v: mesMaisCaro ? mesLabel(mesMaisCaro.m) : "—", sub: mesMaisCaro ? `${fmtMoney(mesMaisCaro.custo)} · ${mesMaisCaro.n} pessoa(s)` : "" },
                    { t: "🔻 Mês mais leve", v: mesMaisBarato ? mesLabel(mesMaisBarato.m) : "—", sub: mesMaisBarato ? `${fmtMoney(mesMaisBarato.custo)} · ${mesMaisBarato.n} pessoa(s)` : "" },
                    { t: "👷 Funções", v: `${funcs.length}`, sub: funcs[0] ? `maioria: ${funcs[0].f} (${funcs[0].n})` : "" },
                    { t: "🏗 Obras", v: `${obrasD.length}`, sub: obrasD[0] ? `maior custo: ${obrasD[0].o}` : "" },
                  ].map((c, i) => (
                    <Card key={i}><CardContent className="p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">{c.t}</p>
                      <p className="text-lg font-bold tabular-nums leading-tight mt-0.5">{c.v}</p>
                      <p className="text-[10px] text-muted-foreground">{c.sub}</p>
                    </CardContent></Card>
                  ))}
                </div>
              </div>
              {/* ===== 4. Quando pesa no caixa ===== */}
              <Card><CardContent className="p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">4 · Quando pesa no caixa</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px]">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-r from-rose-600 to-red-500 inline-block" /> custo real (multa 40%)</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-r from-indigo-500 to-violet-500 inline-block" /> direitos adquiridos</span>
                  <span className="inline-flex items-center gap-1.5"><span className="font-bold text-emerald-700">+R$/mês</span> = economia ganha ao concluir o mês</span>
                  <span className="text-muted-foreground">número na barra = pessoas · toque no mês p/ ver a conta</span>
                </div>
                <div className="space-y-2">
                  {porMesDash.map((x, mi) => {
                    const wTotal = Math.max(8, Math.round((x.custo / maxCustoMes) * 100));
                    const pctMulta = x.custo > 0 ? Math.min(100, Math.round((x.multa / x.custo) * 100)) : 0;
                    const ecoAcum = porMesDash.slice(0, mi + 1).reduce((s, y) => s + y.eco, 0);
                    return (
                      <div key={x.m} role="button" title="Ver memória de cálculo do mês"
                        onClick={() => setMemoriaAud({ titulo: `${mesLabel(x.m)} (${x.n} pessoa(s))`, pessoas: todos.filter(i => parcelasItem(i).some(p => p.mes === x.m)), mesRef: x.m })}
                        className="flex items-center gap-3 cursor-pointer hover:bg-muted/40 rounded-lg px-1 -mx-1">
                        <span className="w-24 shrink-0 text-xs font-semibold">{mesLabel(x.m)}</span>
                        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full flex overflow-hidden" style={{ width: `${wTotal}%` }}>
                            <div className="h-full bg-gradient-to-r from-rose-600 to-red-500 shrink-0" style={{ width: `${pctMulta}%` }} />
                            <div className="h-full flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 flex items-center justify-end pr-2">
                              <span className="text-[10px] font-bold text-white">{x.n}</span>
                            </div>
                          </div>
                        </div>
                        <span className="w-28 shrink-0 text-right text-xs font-bold tabular-nums">{fmtMoney(x.custo)}</span>
                        <span className="hidden md:block w-28 shrink-0 text-right text-[11px] tabular-nums text-emerald-700">+{fmtMoney(x.eco)}/mês</span>
                        <span className="hidden lg:block w-32 shrink-0 text-right text-[11px] tabular-nums font-bold text-emerald-800">Σ {fmtMoney(ecoAcum)}/mês</span>
                      </div>
                    );
                  })}
                  {/* Linha de fechamento */}
                  <div className="flex items-center gap-3 border-t pt-2 mt-1">
                    <span className="w-24 shrink-0 text-xs font-bold text-emerald-800">Ao concluir</span>
                    <div className="flex-1 text-[11px] text-muted-foreground">economia mensal acumulada: cada mês concluído soma a economia dele nos meses seguintes</div>
                    <span className="w-28 shrink-0" />
                    <span className="hidden md:block w-28 shrink-0" />
                    <span className="hidden lg:block w-32 shrink-0 text-right text-xs font-extrabold tabular-nums text-emerald-800">Σ {fmtMoney(totalEco)}/mês</span>
                  </div>
                </div>
                {/* Acumulado no mobile (colunas escondidas em tela estreita) */}
                <div className="lg:hidden mt-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-800">
                  <b>Economia acumulada:</b> ao concluir todos os meses, a folha fica <b>{fmtMoney(totalEco)}/mês</b> menor — cada mês concluído soma a economia dele nos seguintes.
                </div>
              </CardContent></Card>
              {/* ===== 4b. Previsto × Realizado ===== */}
              {(() => {
                const todosAll = porMes.flatMap(([m, lista]) => (lista as any[]).filter(i => i.status !== "cancelado").map(i => ({ ...i, __mes: m })));
                const parcelasPR = todosAll.flatMap(parcelasItem);
                const mesesPR = Array.from(new Set([...todosAll.map(i => i.__mes), ...parcelasPR.map(p => p.mes)])).sort();
                const linhasPR = mesesPR.map(m => {
                  const l = todosAll.filter(i => i.__mes === m);
                  const reais = l.filter(i => i.status === "desligado");
                  return {
                    m, nPrev: l.length, custoPrev: parcelasPR.filter(p => p.mes === m).reduce((s, p) => s + p.valor, 0),
                    nReal: reais.length, custoReal: soma(reais, custo), ecoReal: soma(reais, eco),
                    ecoPrev: soma(l, eco),
                  };
                });
                const totPR = {
                  nPrev: linhasPR.reduce((s, x) => s + x.nPrev, 0),
                  custoPrev: linhasPR.reduce((s, x) => s + x.custoPrev, 0),
                  nReal: linhasPR.reduce((s, x) => s + x.nReal, 0),
                  custoReal: linhasPR.reduce((s, x) => s + x.custoReal, 0),
                  ecoReal: linhasPR.reduce((s, x) => s + x.ecoReal, 0),
                };
                const pctExec = totPR.nPrev > 0 ? Math.round((totPR.nReal / totPR.nPrev) * 100) : 0;
                if (totPR.nPrev === 0) return null;
                const mesAtual = new Date().toISOString().slice(0, 7);
                // Acumulados até o mês atual (o que JÁ deveria ter acontecido) × o que foi medido de verdade
                const atePresente = linhasPR.filter(x => x.m <= mesAtual);
                const ecoPrevAcum = atePresente.reduce((s, x) => s + x.ecoPrev, 0);
                const ecoRealAcum = totPR.ecoReal;
                const nPrevAcum = atePresente.reduce((s, x) => s + x.nPrev, 0);
                const pessoasPrevAcum = todosAll.filter(i => i.__mes <= mesAtual);
                const pessoasRealTodas = todosAll.filter(i => i.status === "desligado");
                // Série acumulada p/ o gráfico de tendência
                let accP = 0, accR = 0;
                const serie = linhasPR.map(x => { accP += x.nPrev; accR += x.nReal; return { m: x.m, cp: accP, cr: accR }; });
                const idxHoje = Math.max(0, serie.findIndex(s => s.m >= mesAtual) === -1 ? serie.length - 1 : serie.findIndex(s => s.m >= mesAtual));
                const mlab2 = (m: string) => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5)) - 1] + "/" + m.slice(2, 4);
                const W = 720, H = 150, PAD = 26;
                const xAt = (i: number) => PAD + (serie.length > 1 ? (i / (serie.length - 1)) * (W - PAD * 2) : 0);
                const yAt = (v: number) => H - PAD + 6 - (v / Math.max(1, totPR.nPrev)) * (H - PAD * 2);
                const ptsPrev = serie.map((s, i) => `${xAt(i)},${yAt(s.cp)}`).join(" ");
                const ptsReal = serie.slice(0, idxHoje + 1).map((s, i) => `${xAt(i)},${yAt(s.cr)}`).join(" ");
                // Tendência: do realizado de hoje, seguindo o ritmo previsto dos meses futuros
                const baseReal = serie[idxHoje]?.cr ?? 0;
                const ptsTend = serie.slice(idxHoje).map((s, k) => `${xAt(idxHoje + k)},${yAt(baseReal + (s.cp - (serie[idxHoje]?.cp ?? 0)))}`).join(" ");
                return (
                  <Card><CardContent className="p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">4b · Previsto × Realizado</p>
                    {/* Card grande de % concluído + acumulados */}
                    <div className="grid sm:grid-cols-3 gap-2 mb-3">
                      <div role="button" title="Ver quem já foi desligado"
                        onClick={() => totPR.nReal > 0 && setMemoriaAud({ titulo: `Realizado — plano inteiro (${totPR.nReal} pessoa(s))`, pessoas: pessoasRealTodas })}
                        className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white px-4 py-3 cursor-pointer">
                        <p className="text-[10px] uppercase tracking-widest opacity-80">Execução do plano 🔍</p>
                        <p className="text-4xl font-black leading-tight tabular-nums">{pctExec}%<span className="text-lg font-bold opacity-90"> concluído</span></p>
                        <div className="h-2 bg-white/25 rounded-full overflow-hidden mt-1.5 mb-1">
                          <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, pctExec)}%` }} />
                        </div>
                        <p className="text-[10px] opacity-85">{totPR.nReal} de {totPR.nPrev} desligamentos programados</p>
                      </div>
                      <div role="button" title="Ver memória do previsto até hoje"
                        onClick={() => pessoasPrevAcum.length > 0 && setMemoriaAud({ titulo: `Economia prevista acumulada até ${mesLabel(mesAtual)} (${pessoasPrevAcum.length} pessoa(s))`, pessoas: pessoasPrevAcum, foco: "economia" })}
                        className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-3 cursor-pointer">
                        <p className="text-[10px] uppercase tracking-widest text-indigo-500 font-bold">Σ Economia PREVISTA até hoje 🔍</p>
                        <p className="text-xl font-extrabold tabular-nums text-indigo-700 leading-tight">{fmtMoney(ecoPrevAcum)}<span className="text-xs font-bold">/mês</span></p>
                        <p className="text-[10px] text-indigo-500 mt-1">se os {nPrevAcum} programados até {mesLabel(mesAtual)} tivessem saído</p>
                      </div>
                      <div role="button" title="Ver memória da economia realizada"
                        onClick={() => totPR.nReal > 0 && setMemoriaAud({ titulo: `Economia realizada — plano inteiro (${totPR.nReal} pessoa(s))`, pessoas: pessoasRealTodas, foco: "economia" })}
                        className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 cursor-pointer">
                        <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Σ Economia REALIZADA (medida) 🔍</p>
                        <p className="text-xl font-extrabold tabular-nums text-emerald-700 leading-tight">{fmtMoney(ecoRealAcum)}<span className="text-xs font-bold">/mês</span></p>
                        <p className="text-[10px] mt-1">
                          <span className="text-emerald-600">{totPR.nReal} desligado(s) de verdade · </span>
                          <b className={ecoPrevAcum > 0 && ecoRealAcum < ecoPrevAcum ? "text-red-600" : "text-emerald-700"}>
                            {ecoPrevAcum > 0 ? Math.round((ecoRealAcum / ecoPrevAcum) * 100) : 0}% do previsto até hoje
                          </b>
                        </p>
                      </div>
                    </div>
                    {/* Linha de tendência — acumulado de pessoas */}
                    <div className="rounded-xl border bg-slate-50/60 px-3 py-2 mb-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground mb-1">
                        <b className="text-slate-700 text-[11px]">📈 Tendência — desligamentos acumulados</b>
                        <button type="button" onClick={() => toggleLinha("prev")} title="Tocar para ligar/desligar esta linha"
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-opacity ${linhasGraf.prev ? "" : "opacity-40 line-through"}`}>
                          <span className="h-0.5 w-5 bg-indigo-500 inline-block" /> previsto
                        </button>
                        <button type="button" onClick={() => toggleLinha("real")} title="Tocar para ligar/desligar esta linha"
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-opacity ${linhasGraf.real ? "" : "opacity-40 line-through"}`}>
                          <span className="h-1 w-5 bg-emerald-500 inline-block rounded" /> realizado
                        </button>
                        <button type="button" onClick={() => toggleLinha("tend")} title="Tocar para ligar/desligar esta linha"
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-opacity ${linhasGraf.tend ? "" : "opacity-40 line-through"}`}>
                          <span className="h-0.5 w-5 inline-block border-t-2 border-dashed border-emerald-500" /> o que vai acontecer (no ritmo previsto)
                        </button>
                      </div>
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
                        <line x1={PAD} y1={yAt(0)} x2={W - PAD} y2={yAt(0)} stroke="#cbd5e1" strokeWidth="1" />
                        {idxHoje >= 0 && <line x1={xAt(idxHoje)} y1={PAD - 8} x2={xAt(idxHoje)} y2={yAt(0)} stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" />}
                        {idxHoje >= 0 && <text x={xAt(idxHoje)} y={PAD - 12} textAnchor="middle" fontSize="9" fill="#b45309" fontWeight="700">hoje</text>}
                        {linhasGraf.prev && <polyline points={ptsPrev} fill="none" stroke="#6366f1" strokeWidth="2" />}
                        {linhasGraf.tend && <polyline points={ptsTend} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="5 4" opacity="0.8" />}
                        {linhasGraf.real && <polyline points={ptsReal} fill="none" stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />}
                        {linhasGraf.prev && serie.map((s, i) => <circle key={"p" + i} cx={xAt(i)} cy={yAt(s.cp)} r="2.5" fill="#6366f1" />)}
                        {linhasGraf.real && serie.slice(0, idxHoje + 1).map((s, i) => <circle key={"r" + i} cx={xAt(i)} cy={yAt(s.cr)} r="3.5" fill="#10b981" />)}
                        {linhasGraf.prev && <text x={xAt(serie.length - 1) - 4} y={yAt(serie[serie.length - 1]?.cp ?? 0) - 5} textAnchor="end" fontSize="10" fill="#4338ca" fontWeight="700">{totPR.nPrev}</text>}
                        {linhasGraf.real && idxHoje >= 0 && <text x={xAt(idxHoje) + 5} y={yAt(serie[idxHoje]?.cr ?? 0) + 3} fontSize="10" fill="#047857" fontWeight="700">{serie[idxHoje]?.cr ?? 0}</text>}
                        {serie.map((s, i) => (serie.length <= 10 || i % 2 === 0 || i === serie.length - 1) && (
                          <text key={"m" + i} x={xAt(i)} y={H - 4} textAnchor="middle" fontSize="8.5" fill={i === idxHoje ? "#b45309" : "#64748b"} fontWeight={i === idxHoje ? "700" : "400"}>{mlab2(s.m)}</text>
                        ))}
                      </svg>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-900 text-white">
                          <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-right [&>th:first-child]:text-left">
                            <th>Mês</th>
                            <th>Previsto (pessoas)</th><th>Previsto (R$)</th>
                            <th className="text-emerald-300">Realizado (pessoas)</th><th className="text-emerald-300">Realizado (R$)</th>
                            <th className="text-emerald-300">Economia realizada</th>
                            <th>% exec.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {linhasPR.map((x, ix) => {
                            const p = x.nPrev > 0 ? Math.round((x.nReal / x.nPrev) * 100) : 0;
                            const ant = ix > 0 ? linhasPR[ix - 1].custoPrev : null;
                            const seta = ant === null ? null : x.custoPrev > ant
                              ? <span className="text-red-600 text-[10px] font-bold" title="maior que o mês anterior">▲</span>
                              : x.custoPrev < ant
                              ? <span className="text-emerald-600 text-[10px] font-bold" title="menor que o mês anterior">▼</span>
                              : <span className="text-slate-400 text-[10px]" title="igual ao mês anterior">＝</span>;
                            const pessoasMes = todosAll.filter(i => i.__mes === x.m);
                            const pessoasReal = pessoasMes.filter(i => i.status === "desligado");
                            return (
                              <tr key={x.m} role="button" title="Ver memória de cálculo do mês"
                                onClick={() => setMemoriaAud({ titulo: `Previsto — ${mesLabel(x.m)} (${x.nPrev} pessoa(s))`, pessoas: pessoasMes })}
                                className={`[&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left ${ix % 2 ? "bg-slate-50/60" : ""} cursor-pointer hover:bg-indigo-50/60`}>
                                <td className="font-semibold">{mesLabel(x.m)}</td>
                                <td className="tabular-nums">{x.nPrev}</td>
                                <td className="tabular-nums">{fmtMoney(x.custoPrev)} {seta}</td>
                                <td className="tabular-nums font-semibold text-emerald-700"
                                  onClick={(e) => { if (x.nReal > 0) { e.stopPropagation(); setMemoriaAud({ titulo: `Realizado — ${mesLabel(x.m)} (${x.nReal} pessoa(s))`, pessoas: pessoasReal }); } }}>
                                  {x.nReal > 0 ? x.nReal : "—"}</td>
                                <td className="tabular-nums text-emerald-700"
                                  onClick={(e) => { if (x.nReal > 0) { e.stopPropagation(); setMemoriaAud({ titulo: `Realizado — ${mesLabel(x.m)} (${x.nReal} pessoa(s))`, pessoas: pessoasReal }); } }}>
                                  {x.nReal > 0 ? fmtMoney(x.custoReal) : "—"}</td>
                                <td className="tabular-nums text-emerald-700"
                                  onClick={(e) => { if (x.nReal > 0) { e.stopPropagation(); setMemoriaAud({ titulo: `Economia realizada — ${mesLabel(x.m)} (${x.nReal} pessoa(s))`, pessoas: pessoasReal, foco: "economia" }); } }}>
                                  {x.nReal > 0 ? `+${fmtMoney(x.ecoReal)}/mês` : "—"}</td>
                                <td className="tabular-nums font-bold">{p > 0 ? `${p}%` : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-900">
                          <tr role="button" title="Ver memória de cálculo do plano inteiro"
                            onClick={() => setMemoriaAud({ titulo: `Previsto × Realizado — plano inteiro (${totPR.nPrev} pessoas)`, pessoas: todosAll })}
                            className="[&>td]:px-2 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left cursor-pointer hover:bg-indigo-100/60">
                            <td>TOTAL 🔍</td>
                            <td className="tabular-nums">{totPR.nPrev}</td>
                            <td className="tabular-nums">{fmtMoney(totPR.custoPrev)}</td>
                            <td className="tabular-nums text-emerald-700"
                              onClick={(e) => { if (totPR.nReal > 0) { e.stopPropagation(); setMemoriaAud({ titulo: `Realizado — plano inteiro (${totPR.nReal} pessoa(s))`, pessoas: todosAll.filter(i => i.status === "desligado") }); } }}>{totPR.nReal}</td>
                            <td className="tabular-nums text-emerald-700"
                              onClick={(e) => { if (totPR.nReal > 0) { e.stopPropagation(); setMemoriaAud({ titulo: `Realizado — plano inteiro (${totPR.nReal} pessoa(s))`, pessoas: todosAll.filter(i => i.status === "desligado") }); } }}>{fmtMoney(totPR.custoReal)}</td>
                            <td className="tabular-nums text-emerald-700"
                              onClick={(e) => { if (totPR.nReal > 0) { e.stopPropagation(); setMemoriaAud({ titulo: `Economia realizada — plano inteiro (${totPR.nReal} pessoa(s))`, pessoas: todosAll.filter(i => i.status === "desligado"), foco: "economia" }); } }}>+{fmtMoney(totPR.ecoReal)}/mês</td>
                            <td className="tabular-nums">{pctExec}%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">Realizado = quem já foi desligado de verdade (baixa automática pelo cadastro). Quem está de aviso prévio entra no plano automaticamente no mês corrente.</p>
                  </CardContent></Card>
                );
              })()}
              {/* ===== 5. Onde está o custo ===== */}
              <div className="grid md:grid-cols-2 gap-3">
                <Card><CardContent className="p-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">5 · Onde está o custo</p>
                  <p className="text-sm font-bold mb-3">👷 Por função <span className="text-[10px] font-normal text-muted-foreground">— barra proporcional ao valor · toque p/ ver a conta</span></p>
                  <div className="space-y-2">
                    {funcs.map(x => (
                      <div key={x.f} role="button" title="Ver memória de cálculo"
                        onClick={() => setMemoriaAud({ titulo: `${x.f} (${x.n} pessoa(s))`, pessoas: todos.filter(i => String(i.funcao || "—") === x.f) })}
                        className="cursor-pointer hover:bg-muted/40 rounded-lg px-1 -mx-1 py-0.5">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-medium truncate">{x.f}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center justify-center min-w-[20px] px-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{x.n}</span>
                            <span className="text-[11px] font-bold tabular-nums w-24 text-right">{fmtMoney(x.custo)}</span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full"
                            style={{ width: `${Math.max(3, Math.round((x.custo / maxFuncCusto) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">&nbsp;</p>
                  <p className="text-sm font-bold mb-3">🏗 Por obra <span className="text-[10px] font-normal text-muted-foreground">— barra proporcional ao valor · toque p/ ver a conta</span></p>
                  <div className="space-y-2">
                    {obrasD.map(x => (
                      <div key={x.o} role="button" title="Ver memória de cálculo"
                        onClick={() => setMemoriaAud({ titulo: `${x.o} (${x.n} pessoa(s))`, pessoas: todos.filter(i => String(i.obraAtual || "🚫 Sem obra (sem alocação ativa)") === x.o) })}
                        className="cursor-pointer hover:bg-muted/40 rounded-lg px-1 -mx-1 py-0.5">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[11px] font-medium truncate">{x.o}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center justify-center min-w-[20px] px-1 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold">{x.n}</span>
                            <span className="text-[11px] font-bold tabular-nums w-24 text-right">{fmtMoney(x.custo)}</span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full"
                            style={{ width: `${Math.max(3, Math.round((x.custo / maxObraCusto) * 100))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent></Card>
              </div>
              {/* ===== 5b. Demissões por função e por habilidade, mês a mês ===== */}
              {(() => {
                const mlab = (m: string) => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5)) - 1] + "/" + m.slice(2, 4);
                // Inclui também quem JÁ FOI desligado (pra pintar de verde o concluído)
                const base = porMes.flatMap(([m, lista]) => (lista as any[]).filter(i => i.status !== "cancelado").map(i => ({ ...i, __mes: m })));
                const mesesB = Array.from(new Set(base.map(i => i.__mes))).sort();
                const habsDe = (i: any): string[] => Array.isArray(i.habilidades) && i.habilidades.length > 0 ? i.habilidades.map((h: any) => String(h.nome)) : [];
                const matriz = (rotulos: string[], pertence: (i: any, r: string) => boolean) =>
                  rotulos.map(r => ({
                    r,
                    total: base.filter(i => pertence(i, r)).length,
                    cels: mesesB.map(m => base.filter(i => i.__mes === m && pertence(i, r))),
                  })).sort((a, b) => b.total - a.total);
                const funcoesU = Array.from(new Set(base.map(i => String(i.funcao || "—"))));
                const habsU = Array.from(new Set(base.flatMap(habsDe)));
                const mFunc = matriz(funcoesU, (i, r) => String(i.funcao || "—") === r);
                const mHab = matriz(habsU, (i, r) => habsDe(i).includes(r));
                const semHab = base.filter(i => habsDe(i).length === 0);
                const legenda = (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground mb-3">
                    <span className="inline-flex items-center gap-1"><span className="h-4 w-7 rounded-md bg-indigo-500 inline-block shadow-sm" /> programado</span>
                    <span className="inline-flex items-center gap-1"><span className="h-4 w-7 rounded-md bg-emerald-500 inline-block shadow-sm text-white text-[9px] font-bold leading-4 text-center">✓</span> já desligado (concluído)</span>
                    <span className="inline-flex items-center gap-1"><span className="h-4 w-7 rounded-md bg-gradient-to-r from-emerald-500 to-indigo-500 inline-block shadow-sm" /> parcial</span>
                    <span>· toque em qualquer número p/ ver a conta</span>
                  </div>
                );
                const mesPassado = (m: string) => m < new Date().toISOString().slice(0, 7);
                const tabela = (titulo: React.ReactNode, m: typeof mFunc, corHead: string) => {
                  const mx = Math.max(1, ...m.flatMap(x => x.cels.map(c => c.length)));
                  const totFeitos = m.length > 0 ? base.filter(i => i.status === "desligado" && m.some(x => x.cels.some(c => c.includes(i)))).length : 0;
                  return (
                    <Card><CardContent className="p-4">
                      {titulo}
                      {legenda}
                      <div className="overflow-x-auto -mx-1 px-1">
                        <table className="text-[10px] border-separate border-spacing-[3px]">
                          <thead>
                            <tr>
                              <th className="text-left pr-2 sticky left-0 bg-white z-10">&nbsp;</th>
                              {mesesB.map(mm => (
                                <th key={mm} className={`px-1 pb-0.5 font-bold whitespace-nowrap ${mm === new Date().toISOString().slice(0, 7) ? "text-amber-600" : mesPassado(mm) ? "text-emerald-600" : corHead}`}>
                                  {mlab(mm)}
                                </th>
                              ))}
                              <th className="pl-2 font-bold text-slate-600">Σ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.map(x => {
                              const pessoasR = base.filter(i => x.cels.some(c => c.includes(i)));
                              const feitos = pessoasR.filter(i => i.status === "desligado").length;
                              return (
                                <tr key={x.r}>
                                  <td className="pr-2 font-semibold whitespace-nowrap max-w-[130px] truncate sticky left-0 bg-white z-10 cursor-pointer hover:underline" title={x.r + " — ver memória de cálculo"}
                                    role="button" onClick={() => setMemoriaAud({ titulo: `${x.r} (${x.total} pessoa(s))`, pessoas: pessoasR })}>
                                    {feitos > 0 && <span className="text-emerald-600 mr-0.5">✓</span>}{x.r}
                                  </td>
                                  {x.cels.map((c, ci) => {
                                    if (c.length === 0) return <td key={ci} className="h-7 min-w-[32px] text-center rounded-md bg-slate-50 text-slate-200">·</td>;
                                    const done = c.filter(i => i.status === "desligado").length;
                                    const allDone = done === c.length;
                                    return (
                                      <td key={ci}
                                        role="button"
                                        title={`${x.r} · ${mesLabel(mesesB[ci])}${done > 0 ? ` — ${done} de ${c.length} já desligado(s)` : ""} · toque p/ ver a conta`}
                                        onClick={() => setMemoriaAud({ titulo: `${x.r} — ${mesLabel(mesesB[ci])} (${c.length} pessoa(s))`, pessoas: c })}
                                        className={`h-7 min-w-[32px] text-center rounded-md font-bold tabular-nums cursor-pointer text-white shadow-sm transition-transform active:scale-95 ${
                                          allDone ? "bg-emerald-500" : done > 0 ? "bg-gradient-to-r from-emerald-500 to-indigo-500" : "bg-indigo-500"}`}
                                        style={!allDone && done === 0 ? { opacity: 0.45 + 0.55 * (c.length / mx) } : undefined}>
                                        {allDone ? "✓" : ""}{allDone && c.length === 1 ? "" : c.length}{!allDone && done > 0 ? `·✓${done}` : ""}
                                      </td>
                                    );
                                  })}
                                  <td className="pl-2 font-bold tabular-nums cursor-pointer hover:underline text-slate-700"
                                    role="button" title="Ver memória de cálculo"
                                    onClick={() => setMemoriaAud({ titulo: `${x.r} (${x.total} pessoa(s))`, pessoas: pessoasR })}>
                                    {x.total}{feitos > 0 && <span className="text-emerald-600 font-semibold"> ·✓{feitos}</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {totFeitos > 0 && <p className="mt-2 text-[10px] font-semibold text-emerald-700">✓ {totFeitos} desligamento(s) já concluído(s) — aparecem em verde.</p>}
                    </CardContent></Card>
                  );
                };
                return (
                  <div className="space-y-3">
                    {tabela(
                      <><p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">5b · Demissões por função, mês a mês</p>
                        <p className="text-sm font-bold mb-2">👷 Função × mês <span className="text-[10px] font-normal text-muted-foreground">— nº de pessoas · quanto mais forte a cor, mais gente no mês</span></p></>,
                      mFunc, "text-indigo-500")}
                    {tabela(
                      <><p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">5c · Demissões por habilidade, mês a mês</p>
                        <p className="text-sm font-bold mb-1">🛠 Habilidade × mês <span className="text-[10px] font-normal text-muted-foreground">— quem sai leva essas habilidades</span></p>
                        {semHab.length > 0 && <p className="text-[10px] text-muted-foreground mb-2">{semHab.length} pessoa(s) do plano sem habilidade cadastrada ficam fora desta tabela.</p>}
                        {habsU.length === 0 && <p className="text-[11px] text-muted-foreground">Ninguém no plano tem habilidade cadastrada.</p>}</>,
                      mHab, "text-violet-500")}
                  </div>
                );
              })()}
              {/* Ranking completo — da mais cara à mais barata */}
              <Card><CardContent className="p-4">
                {(() => {
                  const rank = [...todos].map((i: any) => {
                    const av = avisoInfo(i);
                    return { i, c: custo(i), multa: av?.multaFgts ?? 0 };
                  }).sort((a, b) => b.c - a.c);
                  const maxC = Math.max(...rank.map(r => r.c), 1);
                  const n = rank.length;
                  const tierOf = (idx: number) => idx < Math.ceil(n / 3) ? 0 : idx < Math.ceil((2 * n) / 3) ? 1 : 2;
                  const tiers = [
                    { t: "🔴 Mais caras", cls: "bg-red-50 text-red-700 border-red-200", bar: "from-rose-600 to-red-500" },
                    { t: "🟡 Custo médio", cls: "bg-amber-50 text-amber-700 border-amber-200", bar: "from-amber-500 to-orange-400" },
                    { t: "🟢 Mais baratas", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "from-emerald-500 to-teal-400" },
                  ];
                  return (
                    <>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">6 · Pessoa a pessoa</p>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold">💸 Ranking completo — da demissão mais cara à mais barata</p>
                        <span className="text-[11px] text-muted-foreground">{n} pessoas</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-3">Barra = custo total da rescisão · <span className="text-red-600 font-semibold">valor vermelho = custo real (multa 40%)</span> · toque na pessoa p/ ver a memória de cálculo individual</p>
                      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-1">
                        {rank.map((r, idx) => {
                          const tier = tierOf(idx);
                          const showHeader = idx === 0 || tierOf(idx - 1) !== tier;
                          return (
                            <div key={r.i.id}>
                              {showHeader && (
                                <div className={`sticky top-0 z-10 mt-2 mb-1 px-2 py-1 rounded-md border text-[11px] font-bold ${tiers[tier].cls}`}>
                                  {tiers[tier].t}
                                </div>
                              )}
                              <div className="flex items-center gap-2 py-1.5 px-1 rounded-lg cursor-pointer hover:bg-muted/40" onClick={() => setDetalheItem(r.i)}>
                                <span className="w-7 text-center text-[11px] font-bold text-slate-400 shrink-0">{idx + 1}º</span>
                                <PersonPhoto src={r.i.fotoUrl} alt={r.i.nome || ""} className="h-8 w-8 rounded-full shrink-0" />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-xs font-semibold truncate">{r.i.nome}{isPJ(r.i) && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-violet-100 text-violet-700">PJ</span>}</span>
                                  <span className="block text-[10px] text-muted-foreground truncate">{r.i.funcao} · {r.i.obraAtual || "sem obra"} · {mesLabel(r.i.__mes)}</span>
                                  <span className="block h-1.5 mt-1 bg-slate-100 rounded-full overflow-hidden">
                                    <span className={`block h-full rounded-full bg-gradient-to-r ${tiers[tier].bar}`} style={{ width: `${Math.max(2, Math.round((r.c / maxC) * 100))}%` }} />
                                  </span>
                                </span>
                                <span className="text-right shrink-0">
                                  <span className="block text-xs font-extrabold tabular-nums">{fmtMoney(r.c)}</span>
                                  <span className="block text-[10px] tabular-nums text-red-600 font-semibold">{r.multa > 0 ? `multa ${fmtMoney(r.multa)}` : "sem multa"}</span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </CardContent></Card>
            </div>
          );
        })() : isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
        ) : porMes.length === 0 ? (
          <Card className="border-dashed border-2 border-gray-200 shadow-none">
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-full bg-red-50 flex items-center justify-center">
                <CalendarClock className="h-7 w-7 text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-gray-800">Nenhum desligamento programado</p>
                <p className="text-sm text-muted-foreground mt-0.5">Monte a fila mês a mês — o sistema sugere quem tem mais faltas, atestados e menos tempo de casa.</p>
              </div>
              <Button onClick={() => setAddOpen(true)} disabled={!companyId} className="mt-1">
                <Plus className="h-4 w-4 mr-1" /> Começar o plano
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
          {/* Filtro de período — padrão da plataforma */}
          <PeriodSelectorCard
            ano={anoFiltro}
            mes={mesFiltro}
            onAno={setAnoFiltro}
            onMes={setMesFiltro}
            onAnoTodo={() => setMesFiltro(null)}
            monthStatus={monthStatus}
          />
          {/* Somatória do período filtrado — "Ano todo" mostra o total previsto do ano */}
          {mesFiltro === null && (() => {
            const doAnoAtivos = porMesFiltrado.flatMap(([, lista]) => lista.filter((i: any) => i.status !== "cancelado" && i.status !== "desligado"));
            if (doAnoAtivos.length === 0) return null;
            const totalAnoFiltro = doAnoAtivos.reduce((s: number, i: any) => s + custoItemPlano(i), 0);
            const economiaAno = doAnoAtivos.reduce((s: number, i: any) => s + (economiaMensal(i)?.total ?? 0), 0);
            return (
              <Card className="border-slate-200 shadow-sm bg-slate-50">
                <CardContent className="p-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div role="button" className="cursor-pointer hover:opacity-70" title="Ver memória de cálculo"
                    onClick={() => setMemoriaAud({ titulo: `Impacto no caixa em ${anoFiltro} (${doAnoAtivos.length} pessoas)`, pessoas: doAnoAtivos })}>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Σ Impacto no caixa em {anoFiltro} 🔍</p>
                    <p className="text-lg font-extrabold text-slate-900 tabular-nums leading-tight">{fmtMoney(totalAnoFiltro)}</p>
                  </div>
                  <div role="button" className="cursor-pointer hover:opacity-70" title="Ver memória de cálculo"
                    onClick={() => setMemoriaAud({ titulo: `Custo real (multa 40%) em ${anoFiltro} (${doAnoAtivos.length} pessoas)`, pessoas: doAnoAtivos })}>
                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Custo real (multa 40%)</p>
                    <p className="text-lg font-bold text-red-700 tabular-nums leading-tight">{fmtMoney(doAnoAtivos.reduce((s: number, i: any) => s + (avisoInfo(i)?.multaFgts ?? 0), 0))}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Pessoas programadas</p>
                    <p className="text-lg font-bold text-slate-700 tabular-nums leading-tight">{doAnoAtivos.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Economia após concluir</p>
                    <p className="text-lg font-bold text-emerald-700 tabular-nums leading-tight">{fmtMoney(economiaAno)}<span className="text-xs font-medium text-emerald-600">/mês</span></p>
                  </div>
                  <p className="text-[10px] text-slate-400 ml-auto">rescisões + férias antes de desligar · atualizado diariamente</p>
                </CardContent>
              </Card>
            );
          })()}
          {/* Busca na fila */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={buscaFila} onChange={e => setBuscaFila(e.target.value)}
              placeholder="Buscar na fila por nome, função ou obra…" className="pl-9 bg-white" />
            {buscaFila && (
              <button type="button" onClick={() => setBuscaFila("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">✕</button>
            )}
          </div>
          {/* Ordenação da fila pelo custo do aviso prévio */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Ordenar fila:</span>
            {([
              { k: "fila",   label: "Ordem da fila" },
              { k: "caro",   label: "Demissão mais cara" },
              { k: "barato", label: "Demissão mais barata" },
              { k: "faltas", label: "⚠ Mais faltas" },
              { k: "atestados", label: "🩺 Mais atestados" },
            ] as const).map(({ k, label }) => (
              <button key={k} type="button" onClick={() => setOrdemPlano(k)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  ordemPlano === k ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}>
                {label}
              </button>
            ))}
            <span className="text-[11px] font-medium text-muted-foreground ml-2 mr-1">Mostrar:</span>
            {([
              { k: "todos",  label: "Todos" },
              { k: "ferias", label: "🏖 Entram em férias antes" },
              { k: "direto", label: "✅ Desligamento direto" },
            ] as const).map(({ k, label }) => (
              <button key={k} type="button" onClick={() => setFiltroGrupo(k)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  filtroGrupo === k ? "bg-amber-600 border-amber-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}>
                {label}
              </button>
            ))}
            <span className="text-[11px] font-medium text-muted-foreground ml-2 mr-1">Obra:</span>
            <Select value={filtroObraFila} onValueChange={setFiltroObraFila}>
              <SelectTrigger className={`h-7 w-auto gap-1 px-2.5 text-[11px] rounded-full border ${
                filtroObraFila !== "todas" ? "border-teal-600 bg-teal-600 text-white font-semibold" : "border-gray-200 bg-white text-gray-600"
              }`}>
                <SelectValue placeholder="Obra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">🏗 Todas as obras</SelectItem>
                {obrasFila.map(([o, n]) => (
                  <SelectItem key={o} value={o}>
                    {o}
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] px-1 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold align-middle">{n}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtroObraFila !== "todas" && (
              <button type="button" onClick={() => setFiltroObraFila("todas")}
                className="px-2 py-1 rounded-full text-[11px] font-semibold border border-dashed border-teal-300 bg-teal-50 text-teal-700 hover:bg-teal-100">✕</button>
            )}
            <button type="button" disabled={redistribuindo || updMut.isPending}
              title={tetoMes ? `Remanejar a fila pra caber em ${fmtMoney(tetoMes)}/mês (±10%)` : "Defina o teto mensal na engrenagem ⚙ do topo"}
              onClick={() => { if (!tetoMes) { setTetoInput(""); setMetaOpen(true); toast.info("Defina primeiro o teto de desembolso mensal."); return; } redistribuir(); }}
              className="ml-auto px-3 py-1.5 rounded-full text-[11px] font-bold border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60">
              {redistribuindo ? "⏳ Redistribuindo…" : `⚖️ Redistribuir${tetoMes ? ` (teto ${fmtMoney(tetoMes)}/mês)` : " pelo teto"}`}
            </button>
            <button type="button" onClick={() => setIaConfigOpen(true)} disabled={iaMut.isPending}
              className="px-3 py-1.5 rounded-full text-[11px] font-bold border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-60">
              ✨ Sugestão da IA (fluxo de caixa)
            </button>
          </div>
          {porMesFiltrado.length === 0 && (() => {
            // Rev. 4990 — mesmo mês em OUTRO ano do plano? Oferece o pulo direto
            // (ex.: clicar "Jul" com o ano em 2026 quando o plano só tem Julho/2027)
            const outrosAnos = mesFiltro !== null
              ? Array.from(new Set(porMes.map(([m]) => String(m)).filter(m => Number(m.slice(5, 7)) === mesFiltro && Number(m.slice(0, 4)) !== anoFiltro).map(m => Number(m.slice(0, 4))))).sort()
              : [];
            return (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-3">
                <p>Nenhum desligamento programado {mesFiltro === null ? `em ${anoFiltro}` : `em ${MESES_LABEL_FILTRO[mesFiltro - 1]}/${anoFiltro}`}. Use o calendário acima para navegar ou o botão "Ano todo".</p>
                {outrosAnos.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {outrosAnos.map(y => (
                      <Button key={y} variant="outline" size="sm" className="h-8" onClick={() => setAnoFiltro(y)}>
                        👉 Ver {MESES_LABEL_FILTRO[(mesFiltro as number) - 1]}/{y}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            );
          })()}
          {porMesFiltrado.map(([mes, lista]) => {
            const programados = lista.filter(i => i.status !== "cancelado").length;
            const desligadosMes = lista.filter(i => i.status === "desligado").length;
            const ativosMes = lista.filter(i => i.status !== "cancelado" && i.status !== "desligado");
            const totalEconomia = ativosMes.reduce((s, i) => s + (economiaMensal(i)?.total ?? 0), 0);
            // Caixa CRUZADO por mês (parcelasItem): férias caem no mês do gozo; a rescisão de quem
            // entra em férias antes cai no MÊS SEGUINTE. Então este mês recebe também as rescisões
            // de quem entrou de férias no mês anterior — autoajustável com o plano inteiro.
            const parcelasDoMes = ativosPlano.flatMap(parcelasItem).filter(p => p.mes === mes);
            const custoFeriasMes = parcelasDoMes.filter(p => p.tipo === "ferias").reduce((s, p) => s + p.valor, 0);
            const totalAviso = parcelasDoMes.filter(p => p.tipo === "rescisao").reduce((s, p) => s + p.valor, 0);
            const ordenar = (arr: any[]) => {
              if (ordemPlano === "fila") return arr;
              if (ordemPlano === "faltas" || ordemPlano === "atestados") {
                const key = ordemPlano === "faltas" ? "faltas12m" : "atestados12m";
                return [...arr].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
              }
              return [...arr].sort((a, b) => {
                const va = avisoInfo(a)?.total ?? -1, vb = avisoInfo(b)?.total ?? -1;
                return ordemPlano === "caro" ? vb - va : va - vb;
              });
            };
            // Grupos: 1º passo = colocar de férias (vencida/pendente OU agendada → antecipar); depois desligar direto
            const grupoFerias = ordenar(lista.filter(precisaFerias));
            const grupoDireto = ordenar(lista.filter(i => !precisaFerias(i)));
            const grupos: [string, string, any[]][] = [
              ["🏖 1º passo — colocar de férias antes de desligar (inclui antecipar férias já agendadas)", "bg-amber-50 text-amber-800 border-amber-200", filtroGrupo === "direto" ? [] : grupoFerias],
              ["✅ 2º passo — férias em dia, pode desligar direto", "bg-emerald-50 text-emerald-800 border-emerald-200", filtroGrupo === "ferias" ? [] : grupoDireto],
            ];
            let seq = 0;
            return (
            <Card key={mes} className="overflow-hidden border-gray-100 shadow-sm">
              <CardHeader className="py-3 px-4 bg-gradient-to-r from-slate-50 to-white border-b space-y-2">
                {/* Linha 1: mês + contagens */}
                <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-red-500" />
                    <span className="font-bold text-gray-800 text-base">{mesLabel(mes)}</span>
                  </span>
                  <Badge variant="secondary">{programados} programado(s)</Badge>
                  {desligadosMes > 0 && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{desligadosMes} desligado(s)</Badge>
                  )}
                  {grupoFerias.filter(i => i.status !== "cancelado" && i.status !== "desligado").length > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100">🏖 {grupoFerias.filter(i => i.status !== "cancelado" && i.status !== "desligado").length} em férias antes</Badge>
                  )}
                  {mes < mesAtualStr && ativosMes.length > 0 && (
                    <Badge className="bg-red-600 text-white hover:bg-red-600 animate-pulse">⚠ {ativosMes.length} atrasado(s)</Badge>
                  )}
                </CardTitle>
                {/* Linha 2: custos do mês (mini-cards, clicáveis → memória de cálculo) */}
                {(custoFeriasMes > 0 || totalAviso > 0 || totalEconomia > 0) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" onClick={() => setMemoriaMes(mes)} role="button">
                    <div className="cursor-pointer rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-amber-700 font-semibold truncate">🏖 Custo férias</p>
                      <p className="text-[13px] font-bold text-amber-900 tabular-nums truncate">{custoFeriasMes > 0 ? fmtMoney(custoFeriasMes) : "—"}</p>
                    </div>
                    <div className="cursor-pointer rounded-lg border border-red-200 bg-red-50/70 px-2.5 py-1.5 min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-red-700 font-semibold truncate">Custo demissões</p>
                      <p className="text-[13px] font-bold text-red-800 tabular-nums truncate">{totalAviso > 0 ? fmtMoney(totalAviso) : "—"}</p>
                    </div>
                    <div className="cursor-pointer rounded-lg border border-slate-300 bg-slate-100/80 px-2.5 py-1.5 min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-slate-700 font-semibold truncate">Σ Custo total do mês</p>
                      <p className="text-[13px] font-extrabold text-slate-900 tabular-nums truncate">{(custoFeriasMes + totalAviso) > 0 ? fmtMoney(custoFeriasMes + totalAviso) : "—"}</p>
                    </div>
                    <div className="cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 min-w-0">
                      <p className="text-[9px] uppercase tracking-wide text-emerald-700 font-semibold truncate">Economia</p>
                      <p className="text-[13px] font-bold text-emerald-800 tabular-nums truncate">{totalEconomia > 0 ? `${fmtMoney(totalEconomia)}/mês` : "—"}</p>
                    </div>
                  </div>
                )}
                {tetoMes != null && (() => {
                  const totalMes = custoFeriasMes + totalAviso;
                  if (totalMes <= 0) return null;
                  const pct = Math.round((totalMes / tetoMes) * 100);
                  if (totalMes > tetoMes * TETO_MARGEM) {
                    const sug = sugestaoDesafogo(mes);
                    return (
                      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold">🚨 Estourou o teto: {fmtMoney(totalMes)} de {fmtMoney(tetoMes)}</p>
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums bg-red-600 text-white">{pct}% do teto</span>
                        </div>
                        <div className="relative h-2 mt-1 mb-1 rounded-full bg-white border border-black/5 overflow-hidden" title={`${pct}% do teto — o trecho vermelho escuro é o excedente`}>
                          <div className="absolute inset-y-0 left-0 bg-amber-400" style={{ width: `${(100 / pct) * 100}%` }} />
                          <div className="absolute inset-y-0 bg-red-600" style={{ left: `${(100 / pct) * 100}%`, right: 0 }} />
                        </div>
                        {sug ? (
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            💡 Sugestão: mover <strong>{sug.item.nome}</strong> ({fmtMoney(sug.valor)}) pra <strong>{mesLabel(sug.destino)}</strong>, que tem folga.
                            <button type="button" disabled={updMut.isPending}
                              onClick={(e) => { e.stopPropagation(); updMut.mutate({ companyId: companyId!, id: sug.item.id, mesPlanejado: sug.destino }); }}
                              className="px-2 py-0.5 rounded-full text-[11px] font-bold border border-red-300 bg-white text-red-700 hover:bg-red-100">
                              Mover agora →
                            </button>
                          </p>
                        ) : (
                          <p className="mt-0.5">Nenhum mês com folga suficiente — redistribua o plano inteiro ou aumente o teto.</p>
                        )}
                        <button type="button" disabled={redistribuindo || updMut.isPending}
                          onClick={(e) => { e.stopPropagation(); redistribuir(); }}
                          className="mt-1.5 px-3 py-1 rounded-full text-[11px] font-bold border border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">
                          {redistribuindo ? "⏳ Redistribuindo…" : "⚖️ Redistribuir tudo automaticamente"}
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div className={`rounded-lg border px-3 py-2 text-[11px] font-semibold ${pct > 100 ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50/70 text-emerald-700"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{pct > 100 ? "⚠️" : "✅"} Teto mensal: {fmtMoney(totalMes)} de {fmtMoney(tetoMes)}{pct > 100 ? " — dentro da margem de 10%" : ""}</span>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-extrabold tabular-nums ${pct > 100 ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"}`}>{pct}% do teto</span>
                      </div>
                      <div className="relative h-2 mt-1.5 rounded-full bg-white border border-black/5 overflow-hidden">
                        <div className={`h-full rounded-full ${pct > 100 ? "bg-amber-400" : pct >= 85 ? "bg-amber-300" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        {pct > 100 && <div className="absolute inset-y-0 right-0 bg-red-500" style={{ width: `${Math.min(10, pct - 100)}%` }} title="excedente acima do teto" />}
                      </div>
                    </div>
                  );
                })()}
              </CardHeader>
              <CardContent className="p-0 divide-y divide-gray-100">
                {grupos.map(([titulo, cls, gLista]) => gLista.length > 0 && (
                <div key={titulo}>
                  <div className={`px-4 py-1.5 text-[11px] font-bold border-y first:border-t-0 ${cls}`}>
                    {titulo} ({gLista.length})
                  </div>
                {gLista.map((it: any) => {
                  const idx = seq++;
                  const si = statusInfo(it.status);
                  const finalizado = it.status === "desligado" || it.status === "cancelado";
                  const atrasado = !finalizado && it.mesPlanejado < mesAtualStr;
                  return (
                    <div key={it.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${finalizado ? "opacity-60 bg-gray-50/50" : atrasado ? "bg-red-50/70 border-l-4 border-red-500 hover:bg-red-50" : "hover:bg-slate-50/60"} transition-colors`}>
                      <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        it.status === "desligado" ? "bg-red-100 text-red-700" : atrasado ? "bg-red-500 text-white" : "bg-slate-100 text-slate-600"
                      }`}>{idx + 1}</span>
                      <PersonPhoto src={(it as any).fotoUrl} alt={it.nome || ""} className="h-9 w-9 rounded-full shrink-0" />
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setDetalheItem(it)} title="Ver todos os custos desta demissão">
                        <p className="text-sm font-medium truncate">
                          {it.nome}
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-bold bg-slate-800 text-white align-middle">📅 {mesLabel(it.mesPlanejado)}</span>
                          {atrasado && (
                            <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[10px] font-bold bg-red-600 text-white animate-pulse align-middle">⚠ ATRASADO — era p/ {mesLabel(it.mesPlanejado)}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {it.funcao}{it.obraAtual ? ` · ${it.obraAtual}` : ""}
                          {it.statusFuncionario && it.statusFuncionario !== "Ativo" ? ` · ${it.statusFuncionario}` : ""}
                        </p>
                        {(() => {
                          const tempo = tempoLabel(mesesDeCasa((it as any).dataAdmissao));
                          const idade = idadeAnos((it as any).dataNascimento);
                          return (tempo || idade !== null) && (
                            <p className="text-[10px] text-slate-500 truncate">
                              {tempo && <span>🏗 {tempo}</span>}
                              {tempo && idade !== null && " · "}
                              {idade !== null && <span>🎂 {idade} anos</span>}
                            </p>
                          );
                        })()}
                        {(() => {
                          const badges = feriasBadges(it);
                          return badges.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {badges.map((b, i) => (
                                <span key={i} className={`px-1.5 py-0 rounded text-[10px] font-semibold border ${b.cls}`}>{b.label}</span>
                              ))}
                            </div>
                          );
                        })()}
                        {(() => {
                          const habs: any[] = Array.isArray((it as any).habilidades) ? (it as any).habilidades : [];
                          return (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {habs.length > 0 ? habs.map((h, i) => (
                                <span key={i} className="px-1.5 py-0 rounded text-[10px] font-semibold border bg-violet-50 text-violet-700 border-violet-200"
                                  title={h.nivel ? `Nível: ${h.nivel}` : undefined}>
                                  🛠 {h.nome}{h.nivel && h.nivel !== "Basico" ? ` · ${h.nivel}` : ""}
                                </span>
                              )) : (
                                <span className="px-1.5 py-0 rounded text-[10px] font-medium border bg-slate-50 text-slate-400 border-slate-200">sem habilidades cadastradas</span>
                              )}
                            </div>
                          );
                        })()}
                        {it.observacoes && <p className="text-[11px] text-blue-600 break-words">📝 {it.observacoes}</p>}
                      </div>
                      {(() => {
                        const av = avisoInfo(it);
                        const ec = economiaMensal(it);
                        return (
                          <span className="w-[140px] text-right shrink-0 leading-tight"
                            title={[
                              av ? `Aviso prévio (${av.dias} dias): ${fmtMoney(av.valor)}\n13º proporcional: ${fmtMoney(av.decimo)}\nFérias + 1/3: ${fmtMoney(av.feriasVal)}\nMulta 40% FGTS (estimada): ${fmtMoney(av.multaFgts)}` : "",
                              ec ? `\nECONOMIA MENSAL após desligar:\nSalário: ${fmtMoney(ec.sal)}${ec.encargos ? `\nEncargos/impostos (~55%): ${fmtMoney(ec.encargos)}` : ""}${ec.va ? `\nAlimentação (VA/VR): ${fmtMoney(ec.va)}` : ""}${ec.epi ? `\nEPI/uniforme (estimado): ${fmtMoney(ec.epi)}` : ""}` : "",
                            ].join("\n") || undefined}>
                            {av ? (
                              <>
                                <span className="block text-[13px] font-bold text-red-700">{fmtMoney(av.total)}</span>
                                <span className="block text-[10px] text-muted-foreground">demissão estimada · aviso {av.dias} dias {fmtMoney(av.valor)}</span>
                              </>
                            ) : (
                              <span className="text-[10px] text-gray-400">sem salário base</span>
                            )}
                            {ec && (
                              <span className="block text-[11px] font-bold text-emerald-700">economiza {fmtMoney(ec.total)}/mês</span>
                            )}
                          </span>
                        );
                      })()}
                      <div className="flex items-center gap-1 shrink-0 rounded-full border border-gray-200 bg-white shadow-sm px-1 py-0.5">
                        <Select value={it.status} onValueChange={(v) => updMut.mutate({ companyId: companyId!, id: it.id, status: v as any })}>
                          <SelectTrigger className={`h-7 w-auto gap-1 px-2.5 text-[11px] rounded-full border-0 font-semibold ${si.cls}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={it.mesPlanejado} onValueChange={(v) => updMut.mutate({ companyId: companyId!, id: it.id, mesPlanejado: v })}>
                          <SelectTrigger className="h-7 w-auto gap-1 px-2 text-[11px] rounded-full border-0 bg-transparent text-slate-600 hover:bg-slate-100 font-medium [&>svg:last-child]:h-3 [&>svg:last-child]:w-3" title="Mudar o mês do desligamento">
                            <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
                            <span>mover</span>
                          </SelectTrigger>
                          <SelectContent>
                            {(() => {
                              // Carga já prevista em cada mês (autoajustável — recalcula a cada mudança do plano)
                              const carga = new Map<string, { n: number; total: number }>();
                              for (const p of itens as any[]) {
                                if (p.status === "cancelado" || p.status === "desligado" || !p.mesPlanejado) continue;
                                const c = carga.get(p.mesPlanejado) ?? { n: 0, total: 0 };
                                c.n += 1; c.total += custoItemPlano(p);
                                carga.set(p.mesPlanejado, c);
                              }
                              const lim1 = limiteFeriasMes(it);
                              const lim2 = limiteDuroFeriasMes(it);
                              const eh1 = vence1Periodo(it);
                              return Array.from(new Set([it.mesPlanejado, ...proximosMeses()])).sort().map(m => {
                                const c = carga.get(m);
                                // Limite DURO = vencimento do 2º período (1º vencido ainda pode prorrogar, dobrando)
                                const bloqueado = !!lim2 && m > lim2 && m !== it.mesPlanejado;
                                const prorroga = !bloqueado && eh1 && !!lim1 && m > lim1;
                                const vence1Aqui = eh1 && m === lim1;
                                const vence2Aqui = !!lim2 && m === lim2 && lim2 !== lim1;
                                const estoura = !bloqueado && m !== it.mesPlanejado && tetoMes != null
                                  && (cargaPorMes.get(m) ?? 0) + custoItemPlano(it) > tetoMes * TETO_MARGEM;
                                return (
                                  <SelectItem key={m} value={m} disabled={bloqueado}>
                                    <span className="flex flex-col items-start leading-tight">
                                      <span>{m === it.mesPlanejado ? `✓ ${mesLabel(m)}` : mesLabel(m)}{bloqueado ? " 🚫" : prorroga ? " ⚠️" : estoura ? " ⚠️" : ""}</span>
                                      <span className={`text-[10px] tabular-nums ${bloqueado ? "text-red-500" : prorroga ? "text-orange-600" : estoura ? "text-amber-600" : vence1Aqui || vence2Aqui ? "text-blue-600" : c ? "text-slate-500" : "text-emerald-600"}`}>
                                        {bloqueado ? "após vencer o 2º período — proibido"
                                          : prorroga ? `1º período vencido — dá pra prorrogar (férias dobram)${vence2Aqui ? " · vence o 2º período" : ""}`
                                          : vence1Aqui ? `vence o 1º período${c ? ` · ${c.n} previsto${c.n !== 1 ? "s" : ""} · ${fmtMoney(c.total)}` : ""}`
                                          : c ? `${c.n} previsto${c.n !== 1 ? "s" : ""} · ${fmtMoney(c.total)}${estoura ? " — estoura o teto!" : ""}`
                                          : estoura ? "estoura o teto!" : "livre — nada previsto"}
                                      </span>
                                    </span>
                                  </SelectItem>
                                );
                              });
                            })()}
                          </SelectContent>
                        </Select>
                        <div className="h-4 w-px bg-gray-200" />
                        {!finalizado && !isPJ(it) && (
                          <>
                            <button type="button" onClick={() => iniciarAvisos([it])}
                              title="Iniciar aviso prévio — abre a tela do Aviso Prévio com colaborador, tipo e data já preenchidos"
                              className="h-7 px-2 inline-flex items-center gap-1 rounded-full text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100">
                              📣 iniciar aviso
                            </button>
                            <input type="checkbox" checked={selAviso.has(it.id)} onChange={() => toggleSelAviso(it.id)}
                              title="Selecionar p/ aviso múltiplo"
                              className="h-4 w-4 accent-orange-600 cursor-pointer" />
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" title="Observações"
                          onClick={() => setObsEdit({ id: it.id, texto: it.observacoes || "" })}>
                          <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-red-500 hover:bg-red-50" title="Remover do plano"
                          disabled={delMut.isPending}
                          onClick={() => { if (confirm(`Remover ${it.nome} do plano?`)) delMut.mutate({ companyId: companyId!, id: it.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                </div>
                ))}
              </CardContent>
            </Card>
            );
          })}
          </>
        )}

        {/* Dialog: memória de cálculo do mês */}
        <Dialog open={!!memoriaMes} onOpenChange={(o) => { if (!o) setMemoriaMes(null); }}>
          <DialogContent className="max-w-5xl">
            <DialogHeader><DialogTitle>🧮 Memória de cálculo — {memoriaMes ? mesLabel(memoriaMes) : ""}</DialogTitle></DialogHeader>
            {(() => {
              if (!memoriaMes) return null;
              // Rev. 4990 — a memória agora usa as MESMAS parcelas de caixa dos mini-cards:
              // inclui rescisões de quem entrou de férias no mês ANTERIOR (caixa cruzado).
              // Antes listava só os planejados do mês → dialog não fechava com o card.
              const contribs = ativosPlano
                .map((it: any) => ({ it, ps: parcelasItem(it).filter((p: any) => p.mes === memoriaMes) }))
                .filter((x: any) => x.ps.length > 0);
              const linhasAll = contribs.map(({ it, ps }: any) => ({
                it, av: avisoInfo(it), ec: economiaMensal(it), sal: parseMoneyBR(it.salarioBase) ?? 0,
                temFeriasMes: ps.some((p: any) => p.tipo === "ferias"),
                temRescMes: ps.some((p: any) => p.tipo === "rescisao"),
                rescDeOutroMes: ps.some((p: any) => p.tipo === "rescisao") && String(it.mesPlanejado) !== memoriaMes,
              }));
              // Rescisões que CAEM NO CAIXA deste mês (= card "Custo demissões")
              const linhas = linhasAll.filter((l: any) => l.temRescMes);
              // Férias gozadas neste mês (= card "Custo férias")
              const linhasFer = linhasAll.filter((l: any) => l.temFeriasMes);
              // Economia: pessoas PLANEJADAS neste mês (= card "Economia")
              const linhasEco = linhasAll.filter((l: any) => String(l.it.mesPlanejado) === memoriaMes);
              const tot = (f: (l: any) => number) => linhas.reduce((s: number, l: any) => s + f(l), 0);
              const totE = (f: (l: any) => number) => linhasEco.reduce((s: number, l: any) => s + f(l), 0);
              const totCusto = tot(l => l.av?.total ?? 0);
              const totFerias = linhasFer.reduce((s: number, l: any) => s + l.sal * (4 / 3), 0);
              const totEco = totE(l => l.ec?.total ?? 0);
              const imprimirMes = () => {
                const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
                const logo = selectedCompany?.logoUrl || "/logo-fc.jpg";
                const empresa = selectedCompany?.name || "";
                const agora = new Date();
                const dataEmissao = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const emissor = user?.name || (user as any)?.username || "Usuário";
                const rowsCusto = linhas.map(({ it, av, sal, rescDeOutroMes }: any, ix: number) => `
                  <tr${ix % 2 ? ' class="alt"' : ""}>
                    <td>${esc(it.nome)}${isPJ(it) ? ' <span class="pj">PJ</span>' : ""}${rescDeOutroMes ? ` <span style="font-size:8.5px;color:#92400e;">(férias em ${esc(mesLabel(String(it.mesPlanejado)))} → rescisão neste mês)</span>` : ""}</td>
                    <td class="v">${sal ? esc(fmtMoney(sal)) : "—"}</td>
                    <td class="v">${av ? esc(fmtMoney(av.valor)) + " · " + av.dias + "d" : "—"}</td>
                    <td class="v">${av ? esc(fmtMoney(av.decimo)) : "—"}</td>
                    <td class="v">${av ? esc(fmtMoney(av.feriasVal)) : "—"}</td>
                    <td class="v">${av ? esc(fmtMoney(av.multaFgts)) : "—"}</td>
                    <td class="v tot red">${av ? esc(fmtMoney(av.total)) : "—"}</td>
                  </tr>`).join("");
                const rowsEco = linhasEco.map(({ it, ec }: any, ix: number) => `
                  <tr${ix % 2 ? ' class="alt"' : ""}>
                    <td>${esc(it.nome)}${isPJ(it) ? ' <span class="pj">PJ</span>' : ""}</td>
                    <td class="v">${ec ? esc(fmtMoney(ec.sal)) : "—"}</td>
                    <td class="v">${ec ? esc(fmtMoney(ec.encargos)) : "—"}</td>
                    <td class="v">${ec ? esc(fmtMoney(ec.va)) : "—"}</td>
                    <td class="v">${ec ? esc(fmtMoney(ec.epi)) : "—"}</td>
                    <td class="v tot green">${ec ? esc(fmtMoney(ec.total)) : "—"}</td>
                  </tr>`).join("");
                const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Memória de Cálculo — ${esc(mesLabel(memoriaMes))}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
  .head img { max-height: 42px; max-width: 150px; object-fit: contain; }
  .head .tit { text-align: right; }
  .head h1 { margin: 0; font-size: 15px; }
  .head p { margin: 2px 0 0; color: #475569; font-size: 10px; }
  .kpis { display: flex; gap: 8px; margin-bottom: 10px; }
  .kpi { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; }
  .kpi b { display: block; font-size: 14px; }
  .kpi span { color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
  h2 { font-size: 12px; margin: 12px 0 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0f172a; color: #fff; text-align: right; padding: 4px 6px; font-size: 9.5px; }
  th:first-child { text-align: left; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
  td.v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.alt td { background: #f8fafc; }
  td.tot { font-weight: 700; }
  .red { color: #b91c1c; } .green { color: #047857; }
  tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid #0f172a; }
  .pj { background: #ede9fe; color: #6d28d9; font-size: 8px; font-weight: 700; padding: 0 3px; border-radius: 3px; }
  ul { margin: 4px 0 0; padding-left: 16px; color: #475569; font-size: 9.5px; }
  .foot { margin-top: 12px; border-top: 1px solid #cbd5e1; padding-top: 6px; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="head">
    ${logo ? `<img src="${escAttr(logo.startsWith("http") ? logo : window.location.origin + logo)}" alt="">` : `<b>${esc(empresa)}</b>`}
    <div class="tit">
      <h1>🧮 Memória de Cálculo — Plano de Desligamento · ${esc(mesLabel(memoriaMes))}</h1>
      <p>${esc(empresa)} · confidencial RH</p>
      <p>Emitido em ${esc(dataEmissao)} por ${esc(emissor)}</p>
    </div>
  </div>
  <div class="kpis">
    <div class="kpi"><span>Custo das demissões</span><b class="red">${esc(fmtMoney(totCusto))}</b>${linhas.length} rescisões · pago 1 vez</div>
    <div class="kpi"><span>Economia mensal</span><b class="green">${esc(fmtMoney(totEco))}/mês</b>${esc(fmtMoney(totEco * 12))} por ano</div>
    <div class="kpi"><span>Payback</span><b>${totEco > 0 ? (totCusto / totEco).toFixed(1) + " meses" : "—"}</b>para a rescisão se pagar</div>
  </div>
  <h2>💸 Custo estimado das demissões <small style="font-weight:400;color:#64748b">— rescisão sem justa causa · aviso indenizado</small></h2>
  <table>
    <thead><tr><th>Funcionário</th><th>Salário</th><th>Aviso prévio</th><th>13º proporc.</th><th>Férias + 1/3</th><th>Multa 40% FGTS</th><th>Total</th></tr></thead>
    <tbody>${rowsCusto}</tbody>
    <tfoot><tr><td>TOTAL (${linhas.length})</td>
      <td class="v">${esc(fmtMoney(tot((l: any) => l.sal)))}</td>
      <td class="v">${esc(fmtMoney(tot((l: any) => l.av?.valor ?? 0)))}</td>
      <td class="v">${esc(fmtMoney(tot((l: any) => l.av?.decimo ?? 0)))}</td>
      <td class="v">${esc(fmtMoney(tot((l: any) => l.av?.feriasVal ?? 0)))}</td>
      <td class="v">${esc(fmtMoney(tot((l: any) => l.av?.multaFgts ?? 0)))}</td>
      <td class="v red">${esc(fmtMoney(totCusto))}</td></tr></tfoot>
  </table>
  <ul>
    <li><b>Aviso prévio</b> (Lei 12.506): 30 dias + 3 por ano completo de casa (máx. 90) × salário ÷ 30. PJ: 15 dias contratuais, sem as demais verbas.</li>
    <li><b>13º proporcional</b>: salário × meses trabalhados no ano ÷ 12.</li>
    <li><b>Férias + 1/3</b>: períodos vencidos pagos em dobro (art. 137 CLT) + proporcional do período atual, tudo com adicional de 1/3.</li>
    <li><b>Multa FGTS</b>: 40% sobre depósitos estimados (8% do salário × meses de casa). O valor exato depende do saldo real do FGTS.</li>
  </ul>
  <h2>📉 Economia mensal após os desligamentos <small style="font-weight:400;color:#64748b">— custos que deixam de existir todo mês</small></h2>
  <table>
    <thead><tr><th>Funcionário</th><th>Salário</th><th>Encargos (~55%)</th><th>Alimentação (VA/VR)</th><th>EPI/uniforme</th><th>Economia/mês</th></tr></thead>
    <tbody>${rowsEco}</tbody>
    <tfoot><tr><td>TOTAL (${linhasEco.length})</td>
      <td class="v">${esc(fmtMoney(totE((l: any) => l.ec?.sal ?? 0)))}</td>
      <td class="v">${esc(fmtMoney(totE((l: any) => l.ec?.encargos ?? 0)))}</td>
      <td class="v">${esc(fmtMoney(totE((l: any) => l.ec?.va ?? 0)))}</td>
      <td class="v">${esc(fmtMoney(totE((l: any) => l.ec?.epi ?? 0)))}</td>
      <td class="v green">${esc(fmtMoney(totEco))}</td></tr></tfoot>
  </table>
  <ul>
    <li><b>Encargos/impostos (~55%)</b>: INSS patronal (20%) + RAT + terceiros (~8,8%) + FGTS (8%) + provisões de 13º (8,33%) e férias com 1/3 (11,11%). PJ não tem encargos — economia = valor do contrato.</li>
    <li><b>Alimentação</b>: custo médio mensal por pessoa da configuração vigente de VA/refeitório da empresa.</li>
    <li><b>EPI/uniforme</b>: média mensal real do histórico de entregas de EPI (total ÷ meses de registro). Sem registro = R$ 0.</li>
  </ul>
  <div class="foot">
    <span>Valores estimados para planejamento — a rescisão exata usa o saldo real do FGTS e as datas do aviso no módulo de rescisão.</span>
    <span>${esc(empresa)} · ${esc(dataEmissao)}</span>
  </div>
  <div style="margin-top:8px;padding:7px 10px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:8.5px;color:#475569;line-height:1.55;page-break-inside:avoid;"><b style="color:#0f172a;">🔒 LGPD — Lei nº 13.709/2018:</b> este documento contém dados pessoais e é de uso interno e confidencial do RH. <b style="color:#0f172a;">Emissão registrada e rastreável:</b> gerado por <b style="color:#0f172a;">${esc(emissor)}</b> em ${esc(dataEmissao)}, pelo sistema FC Gestão Integrada (${esc(empresa)}). O emissor responde pela guarda e pelo descarte seguro desta impressão.</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</scr${""}ipt>
</body></html>`;
                const w = window.open("", "_blank");
                if (w) { w.document.write(html); w.document.close(); }
              };
              return (
                <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                  <div className="flex justify-end -mb-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={imprimirMes}>
                      🖨 Imprimir / PDF (A4)
                    </Button>
                  </div>
                  {/* Resumo executivo */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-gradient-to-br from-rose-500 to-red-600 text-white p-3 shadow-sm">
                      <p className="text-[10px] uppercase tracking-wide opacity-80">Custo das demissões</p>
                      <p className="text-lg font-extrabold leading-tight">{fmtMoney(totCusto)}</p>
                      <p className="text-[10px] opacity-80">{linhas.length} rescisões · pago 1 vez</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-3 shadow-sm">
                      <p className="text-[10px] uppercase tracking-wide opacity-80">Economia mensal</p>
                      <p className="text-lg font-extrabold leading-tight">{fmtMoney(totEco)}<span className="text-xs font-semibold">/mês</span></p>
                      <p className="text-[10px] opacity-80">{fmtMoney(totEco * 12)} por ano</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 text-white p-3 shadow-sm">
                      <p className="text-[10px] uppercase tracking-wide opacity-80">Payback</p>
                      <p className="text-lg font-extrabold leading-tight">{totEco > 0 ? `${(totCusto / totEco).toFixed(1)} meses` : "—"}</p>
                      <p className="text-[10px] opacity-80">para a rescisão se pagar</p>
                    </div>
                  </div>
                  {/* Férias gozadas neste mês (parcela de caixa do 1º passo) */}
                  {linhasFer.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12px] text-amber-900">
                      <b>🏖 Custo férias do mês: {fmtMoney(totFerias)}</b> — {linhasFer.length} pessoa(s) em gozo (salário × 4/3): {linhasFer.map((l: any) => l.it.nome).join(", ")}. A rescisão delas cai no caixa do mês seguinte.
                      <div className="mt-1 font-bold text-slate-800">Σ Custo total do mês = {fmtMoney(totFerias)} (férias) + {fmtMoney(totCusto)} (demissões) = {fmtMoney(totFerias + totCusto)}</div>
                    </div>
                  )}
                  {/* Custo das demissões */}
                  <div className="rounded-xl border border-red-100 overflow-hidden shadow-sm">
                    <div className="bg-gradient-to-r from-red-50 to-rose-50 border-b border-red-100 px-3 py-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-red-800">💸 Custo estimado das demissões</p>
                      <span className="text-[10px] text-red-700 font-medium">rescisão sem justa causa · aviso indenizado</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 text-muted-foreground sticky top-0">
                          <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-right [&>th:first-child]:text-left">
                            <th>Funcionário</th><th>Salário</th><th>Aviso prévio</th><th>13º proporc.</th><th>Férias + 1/3</th><th>Multa 40% FGTS</th><th>Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {linhas.map(({ it, av, sal, rescDeOutroMes }: any, i: number) => (
                            <tr key={it.id} className={`[&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left ${i % 2 ? "bg-slate-50/60" : ""} hover:bg-rose-50/50`}>
                              <td className="font-medium">
                                <span className="flex items-center gap-1.5">
                                  <PersonPhoto src={(it as any).fotoUrl} alt={it.nome || ""} className="h-6 w-6 rounded-full shrink-0" />
                                  <span>
                                    {it.nome}{isPJ(it) ? <span className="ml-1 px-1 py-0 rounded bg-violet-100 text-violet-700 text-[9px] font-bold">PJ</span> : ""}
                                    {rescDeOutroMes && <span className="ml-1 px-1 py-0 rounded bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold whitespace-nowrap">🏖 férias em {mesLabel(String(it.mesPlanejado))} → rescisão aqui</span>}
                                  </span>
                                </span>
                              </td>
                              <td>{sal ? fmtMoney(sal) : "—"}</td>
                              <td>{av ? <>{fmtMoney(av.valor)}<span className="text-muted-foreground"> · {av.dias}d</span></> : "—"}</td>
                              <td>{av ? fmtMoney(av.decimo) : "—"}</td>
                              <td>{av ? fmtMoney(av.feriasVal) : "—"}</td>
                              <td>{av ? fmtMoney(av.multaFgts) : "—"}</td>
                              <td className="font-bold text-red-700">{av ? fmtMoney(av.total) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-red-100/70 font-bold">
                          <tr className="[&>td]:px-2 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left">
                            <td>TOTAL ({linhas.length})</td>
                            <td>{fmtMoney(tot(l => l.sal))}</td>
                            <td>{fmtMoney(tot(l => l.av?.valor ?? 0))}</td>
                            <td>{fmtMoney(tot(l => l.av?.decimo ?? 0))}</td>
                            <td>{fmtMoney(tot(l => l.av?.feriasVal ?? 0))}</td>
                            <td>{fmtMoney(tot(l => l.av?.multaFgts ?? 0))}</td>
                            <td className="text-red-700">{fmtMoney(totCusto)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <ul className="text-[11px] text-muted-foreground px-3 py-2 space-y-0.5 list-disc pl-7 bg-slate-50/60 border-t">
                      <li><strong>Aviso prévio</strong> (Lei 12.506): 30 dias + 3 por ano completo de casa (máx. 90) × salário ÷ 30. <strong>PJ</strong>: 15 dias contratuais, sem as demais verbas.</li>
                      <li><strong>13º proporcional</strong>: salário × meses trabalhados no ano ÷ 12.</li>
                      <li><strong>Férias + 1/3</strong>: períodos vencidos pagos <strong>em dobro</strong> (art. 137 CLT) + proporcional do período atual, tudo com adicional de 1/3.</li>
                      <li><strong>Multa FGTS</strong>: 40% sobre depósitos estimados (8% do salário × meses de casa). O valor exato depende do saldo real da conta do FGTS.</li>
                    </ul>
                  </div>
                  {/* Economia mensal */}
                  <div className="rounded-xl border border-emerald-100 overflow-hidden shadow-sm">
                    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 px-3 py-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-emerald-800">📉 Economia mensal após os desligamentos</p>
                      <span className="text-[10px] text-emerald-700 font-medium">custos que deixam de existir todo mês</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 text-muted-foreground sticky top-0">
                          <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-right [&>th:first-child]:text-left">
                            <th>Funcionário</th><th>Salário</th><th>Encargos (~55%)</th><th>Alimentação (VA/VR)</th><th>EPI/uniforme</th><th>Economia/mês</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {linhasEco.map(({ it, ec }: any, i: number) => (
                            <tr key={it.id} className={`[&>td]:px-2 [&>td]:py-1.5 [&>td]:text-right [&>td:first-child]:text-left ${i % 2 ? "bg-slate-50/60" : ""} hover:bg-emerald-50/50`}>
                              <td className="font-medium">
                                <span className="flex items-center gap-1.5">
                                  <PersonPhoto src={(it as any).fotoUrl} alt={it.nome || ""} className="h-6 w-6 rounded-full shrink-0" />
                                  <span>{it.nome}{isPJ(it) ? <span className="ml-1 px-1 py-0 rounded bg-violet-100 text-violet-700 text-[9px] font-bold">PJ</span> : ""}</span>
                                </span>
                              </td>
                              <td>{ec ? fmtMoney(ec.sal) : "—"}</td>
                              <td>{ec ? fmtMoney(ec.encargos) : "—"}</td>
                              <td>{ec ? fmtMoney(ec.va) : "—"}</td>
                              <td>{ec ? fmtMoney(ec.epi) : "—"}</td>
                              <td className="font-bold text-emerald-700">{ec ? fmtMoney(ec.total) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-emerald-100/70 font-bold">
                          <tr className="[&>td]:px-2 [&>td]:py-2 [&>td]:text-right [&>td:first-child]:text-left">
                            <td>TOTAL ({linhasEco.length})</td>
                            <td>{fmtMoney(totE(l => l.ec?.sal ?? 0))}</td>
                            <td>{fmtMoney(totE(l => l.ec?.encargos ?? 0))}</td>
                            <td>{fmtMoney(totE(l => l.ec?.va ?? 0))}</td>
                            <td>{fmtMoney(totE(l => l.ec?.epi ?? 0))}</td>
                            <td className="text-emerald-700">{fmtMoney(totEco)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <ul className="text-[11px] text-muted-foreground px-3 py-2 space-y-0.5 list-disc pl-7 bg-slate-50/60 border-t">
                      <li><strong>Encargos/impostos (~55%)</strong>: INSS patronal (20%) + RAT + terceiros (~8,8%) + FGTS (8%) + provisões de 13º (8,33%) e férias com 1/3 (11,11%). <strong>PJ não tem encargos</strong> — economia = valor do contrato.</li>
                      <li><strong>Alimentação</strong>: custo médio mensal por pessoa da configuração vigente de VA/refeitório da empresa{resumo?.vaMensal ? ` (${fmtMoney(Number(resumo.vaMensal))})` : ""}.</li>
                      <li><strong>EPI/uniforme</strong>: média mensal REAL do histórico de entregas de EPI de cada um (total entregue ÷ meses de registro), projetada pra frente. Sem registro = R$ 0.</li>
                      <li>Custos de faltas, horas extras e passivos variáveis não entram — a economia real tende a ser <strong>maior</strong> que a estimada.</li>
                    </ul>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Valores estimados para planejamento — a rescisão exata usa o saldo real do FGTS e as datas do aviso no módulo de rescisão.
                  </p>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Dialog: perguntas antes da análise da IA */}
        <Dialog open={iaConfigOpen} onOpenChange={setIaConfigOpen}>
          <DialogContent className="max-w-md p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabeçalho */}
            <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 px-5 py-4 text-white shrink-0">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center text-lg shrink-0">✨</span>
                  <span>
                    Configurar análise da IA
                    <span className="block text-[11px] font-normal text-white/80 mt-0.5">Tudo é opcional — o que ficar em branco a IA decide pelo caixa</span>
                  </span>
                </DialogTitle>
              </DialogHeader>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-4">
              {/* 1 — Calendário */}
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3.5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                  <p className="text-xs font-bold uppercase tracking-wide text-violet-700">📅 Calendário</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1.5">Começar as demissões a partir de</p>
                  <Select value={iaMesInicio || "auto"} onValueChange={(v) => setIaMesInicio(v === "auto" ? "" : v)}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">✨ Deixar a IA decidir</SelectItem>
                      {proximosMeses(12).map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">Nada antes desse mês (férias podem começar antes).</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm font-medium mb-1.5">Mês de pico</p>
                    <Select value={iaMesPico || "auto"} onValueChange={(v) => setIaMesPico(v === "auto" ? "" : v)}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">✨ IA decide</SelectItem>
                        {proximosMeses(12).map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1.5">Diluir em</p>
                    <Select value={iaDiluicao || "auto"} onValueChange={onDiluicaoChange}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">✨ IA decide</SelectItem>
                        {DILUICAO_OPCOES.map(n => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "mês" : "meses"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* 2 — Limites de caixa */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">💰 Limites de caixa por mês</p>
                </div>
                <p className="text-[11px] text-muted-foreground -mt-1">Teto e diluição são linkados: mudar um recalcula o outro pelo custo total do plano ({fmtMoney(custoTotalPlano())}).</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm font-medium mb-1.5">Teto (R$)</p>
                    <Input inputMode="decimal" placeholder="Ex.: 30.000" value={iaMaxMes} onChange={(e) => onTetoChange(e.target.value)} className="bg-white" />
                    <p className="text-[11px] text-muted-foreground mt-1">Máximo de rescisões no mês</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1.5">Mínimo (R$)</p>
                    <Input inputMode="decimal" placeholder="Ex.: 10.000" value={iaMinMes} onChange={(e) => setIaMinMes(maskMoneyBR(e.target.value))} className="bg-white" />
                    <p className="text-[11px] text-muted-foreground mt-1">Evita mês com valor irrisório</p>
                  </div>
                </div>
              </div>

              {/* 3 — Prioridade de desligamento */}
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
                  <p className="text-xs font-bold uppercase tracking-wide text-red-700">🎯 Dar prioridade para</p>
                </div>
                <p className="text-[11px] text-muted-foreground">Quem se encaixa nos critérios marcados sai PRIMEIRO (meses mais cedo). Últimos 12 meses.</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIO_CHIPS.map(c => {
                    const on = iaPrioridades.includes(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => togglePrio(c.key)}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${on ? "bg-red-600 border-red-600 text-white shadow-sm" : "bg-white border-slate-200 text-slate-600"}`}
                      >
                        {on ? "✓ " : ""}{c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4 — Instruções extras */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">4</span>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">📝 Instruções extras</p>
                </div>
                <Textarea
                  value={iaObs}
                  onChange={(e) => setIaObs(e.target.value.slice(0, 400))}
                  placeholder="Ex.: não desligar ninguém da obra X em setembro; priorizar quem tem férias vencidas…"
                  rows={2}
                  className="bg-white"
                />
              </div>
            </div>

            <div className="border-t bg-slate-50 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
              <Button variant="ghost" onClick={() => setIaConfigOpen(false)}>Cancelar</Button>
              <Button onClick={iniciarIA} className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white shadow-md">✨ Analisar e distribuir</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: sugestão de cronograma pela IA */}
        <Dialog open={iaOpen} onOpenChange={(o) => { if (!o && !iaMut.isPending) { setIaOpen(false); setIaProg(0); } }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>✨ Sugestão de cronograma — IA</DialogTitle></DialogHeader>
            {!iaMut.data ? (
              <div className="py-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white text-lg shadow-md animate-pulse">✨</div>
                  <p className="text-sm text-muted-foreground">Analisando fluxo de caixa, custos de rescisão e férias de cada um…</p>
                </div>
                <div className="h-3 w-full rounded-full bg-violet-100 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500" style={{ width: `${iaProg}%` }} />
                </div>
                <p className="text-right text-xs font-bold text-violet-700">{iaProg}%</p>
              </div>
            ) : (() => {
              const sugs = iaMut.data.sugestoes.map((s: any) => ({ ...s, mesEfetivo: iaEdit[s.id] ?? s.mesSugerido }));
              const nMudam = sugs.filter((s: any) => s.mesEfetivo !== s.mesAtual).length;
              const porMesIA = new Map<string, any[]>();
              for (const s of sugs) {
                if (!porMesIA.has(s.mesEfetivo)) porMesIA.set(s.mesEfetivo, []);
                porMesIA.get(s.mesEfetivo)!.push(s);
              }
              const mesesIA = [...porMesIA.keys()].sort();
              const mesOpcoes = proximosMeses(36);
              return (
                <div className="space-y-3">
                  {/* Cards resumo */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white p-3 shadow-sm">
                      <p className="text-[10px] uppercase tracking-wide opacity-80">Analisados</p>
                      <p className="text-lg font-extrabold leading-tight">{sugs.length}</p>
                      <p className="text-[10px] opacity-80">no plano ativo</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-3 shadow-sm">
                      <p className="text-[10px] uppercase tracking-wide opacity-80">Remanejar</p>
                      <p className="text-lg font-extrabold leading-tight">{nMudam}</p>
                      <p className="text-[10px] opacity-80">mudam de mês</p>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white p-3 shadow-sm">
                      <p className="text-[10px] uppercase tracking-wide opacity-80">Mantidos</p>
                      <p className="text-lg font-extrabold leading-tight">{sugs.length - nMudam}</p>
                      <p className="text-[10px] opacity-80">seguem como está</p>
                    </div>
                  </div>
                  {iaMut.data.resumo && (
                    <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-3">
                      <p className="text-[10px] uppercase tracking-wide font-bold text-violet-700 mb-1">🧠 Estratégia da IA</p>
                      <p className="text-xs text-violet-900 whitespace-pre-wrap leading-relaxed">{iaMut.data.resumo}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">Agrupado por mês sugerido. Pode ajustar o mês de cada um antes de aplicar — os totais recalculam na hora.</p>
                  <div className="max-h-[42vh] overflow-y-auto rounded-xl border shadow-sm">
                    {mesesIA.map(mes => {
                      const doMes = porMesIA.get(mes)!;
                      const totalMes = doMes.reduce((t: number, x: any) => t + (Number(x.custoEstimado) || 0), 0);
                      return (
                        <div key={mes}>
                          <div className="sticky top-0 z-10 px-3 py-1.5 bg-slate-800 text-white flex items-center justify-between text-[11px] font-bold">
                            <span>📅 {mesLabel(mes)} · {doMes.length} pessoa(s)</span>
                            <span className="tabular-nums">Σ {fmtMoney(totalMes)}</span>
                          </div>
                          <div className="divide-y">
                            {doMes.map((s: any, i: number) => {
                              const mudou = s.mesEfetivo !== s.mesAtual;
                              const editado = iaEdit[s.id] !== undefined && iaEdit[s.id] !== s.mesSugerido;
                              const probl = (Number(s.faltas12m) || 0) + (Number(s.atestados12m) || 0) + (Number(s.advertencias12m) || 0) + (Number(s.atrasos12m) || 0);
                              return (
                                <div key={s.id} className={`px-3 py-2 flex items-center gap-2.5 text-xs ${editado ? "bg-blue-50/60" : mudou ? "bg-amber-50/40" : i % 2 ? "bg-slate-50/60" : ""}`}>
                                  <PersonPhoto src={(itens.find((it: any) => it.id === s.id) as any)?.fotoUrl} alt={s.nome || ""} className={`h-8 w-8 rounded-full shrink-0 ring-2 ${editado ? "ring-blue-300" : mudou ? "ring-amber-300" : "ring-slate-200"}`} />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold break-words leading-tight">
                                      {s.nome}
                                      {probl > 0 && (
                                        <span className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold align-middle">
                                          {[
                                            Number(s.faltas12m) > 0 ? `⚠ ${s.faltas12m} falta(s)` : null,
                                            Number(s.atestados12m) > 0 ? `🩺 ${s.atestados12m} atestado(s)` : null,
                                            Number(s.advertencias12m) > 0 ? `📋 ${s.advertencias12m} advertência(s)` : null,
                                            Number(s.atrasos12m) > 0 ? `⏰ ${s.atrasos12m} atraso(s)` : null,
                                          ].filter(Boolean).join(" · ")}
                                        </span>
                                      )}
                                    </p>
                                    {s.motivo && <p className="text-[11px] text-muted-foreground break-words">{editado ? "✏️ ajustado manualmente por você" : s.motivo}</p>}
                                  </div>
                                  <span className="text-red-600 font-semibold shrink-0 tabular-nums">{fmtMoney(s.custoEstimado)}</span>
                                  <div className="shrink-0 flex items-center gap-1.5">
                                    {mudou && <span className="text-[10px] text-muted-foreground line-through">{mesLabel(s.mesAtual)}</span>}
                                    <select
                                      value={s.mesEfetivo}
                                      onChange={(e) => setIaEdit(prev => ({ ...prev, [s.id]: e.target.value }))}
                                      className={`h-7 w-[120px] rounded-md border px-1.5 text-[11px] font-medium appearance-auto ${editado ? "border-blue-400 bg-blue-50 text-blue-900" : mudou ? "border-amber-300 bg-amber-50 text-amber-900" : "bg-white border-slate-200"}`}
                                    >
                                      {(mesOpcoes.includes(s.mesEfetivo) ? mesOpcoes : [s.mesEfetivo, ...mesOpcoes]).map(m => (
                                        <option key={m} value={m}>{mesLabel(m)}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => { setIaOpen(false); setIaProg(0); }}>Fechar</Button>
                    <Button className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 shadow-md" disabled={iaAplicando || nMudam === 0} onClick={aplicarIA}>
                      {iaAplicando ? (
                        <span className="flex items-center gap-2">
                          <span className="relative h-2 w-20 rounded-full bg-white/30 overflow-hidden">
                            <span className="absolute inset-y-0 left-0 bg-white rounded-full transition-all duration-300" style={{ width: `${iaAplicaProg}%` }} />
                          </span>
                          {iaAplicaProg}%
                        </span>
                      ) : nMudam === 0 ? "Nada a remanejar" : `Aplicar ${nMudam} sugestão(ões)`}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Dialog: governança — solicitações pendentes + histórico de revisões */}
        <Dialog open={govOpen} onOpenChange={setGovOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>📜 Revisões do Plano {gov?.consolidado ? `· 🔒 Consolidado (Rev. ${gov.revisaoAtual})` : "· 🔓 aberto para edição"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Solicitações pendentes */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-1.5">⏳ Solicitações aguardando aprovação ({gov?.pendentes?.length ?? 0})</p>
                {(gov?.pendentes?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma solicitação pendente.</p>
                ) : (
                  <div className="rounded-xl border divide-y">
                    {gov!.pendentes.map((p: any) => (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                        <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${p.tipo === "remover" ? "bg-red-100 text-red-700" : p.tipo === "adicionar" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {p.tipo === "adicionar" ? "➕ Adicionar" : p.tipo === "remover" ? "🗑 Remover" : p.tipo === "mover" ? "📅 Mover" : "Status"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold break-words leading-tight">{p.employeeNome || `Item #${p.itemId}`}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {(() => {
                              const fmt = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? mesLabel(v) : v);
                              return p.de && p.para ? `${fmt(p.de)} → ${fmt(p.para)}` : p.para ? `→ ${fmt(p.para)}` : p.de ? `(estava em ${fmt(p.de)})` : "";
                            })()}
                            {" · "}por {p.criadoPor || "?"} em {String(p.criadoEm || "").slice(0, 10).split("-").reverse().join("/")}
                          </p>
                        </div>
                        {gov?.master && (
                          <div className="shrink-0 flex gap-1">
                            <Button size="sm" className="h-7 px-2 text-[11px] bg-green-600 hover:bg-green-700" disabled={decidirMut.isPending}
                              onClick={() => decidirMut.mutate({ companyId: companyId!, ids: [p.id], aprovar: true })}>✓ Aprovar</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-600 border-red-200" disabled={decidirMut.isPending}
                              onClick={() => decidirMut.mutate({ companyId: companyId!, ids: [p.id], aprovar: false })}>✕</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {gov?.master && (gov?.pendentes?.length ?? 0) > 1 && (
                  <div className="flex justify-end gap-2 mt-2">
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200" disabled={decidirMut.isPending}
                      onClick={() => decidirMut.mutate({ companyId: companyId!, ids: gov!.pendentes.map((p: any) => p.id), aprovar: false })}>Rejeitar todas</Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={decidirMut.isPending}
                      onClick={() => decidirMut.mutate({ companyId: companyId!, ids: gov!.pendentes.map((p: any) => p.id), aprovar: true })}>✓ Aprovar todas</Button>
                  </div>
                )}
                {!gov?.master && (gov?.pendentes?.length ?? 0) > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1.5">Só o Admin Master pode aprovar ou rejeitar.</p>
                )}
              </div>

              {/* Histórico de revisões */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-1.5">🕘 Histórico de revisões</p>
                {(gov?.revisoes?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma revisão ainda — consolide o plano para gerar a Rev. 1.</p>
                ) : (
                  <div className="rounded-xl border divide-y">
                    {gov!.revisoes.map((r: any) => (
                      <div key={r.numero} className="px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">Rev. {r.numero} <span className="font-normal text-muted-foreground">· {r.qtdItens} pessoa(s) no plano</span></span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{String(r.criadoEm || "").slice(0, 10).split("-").reverse().join("/")} · {r.criadoPor || "?"}</span>
                        </div>
                        {r.descricao && <p className="text-[11px] text-muted-foreground break-words mt-0.5">{r.descricao}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: adicionar funcionários */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden flex flex-col max-h-[92dvh]">
            {/* Cabeçalho colorido */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-5 pt-5 pb-4 shrink-0">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">➕ Adicionar ao Plano de Desligamento</DialogTitle>
              </DialogHeader>
              <div className="flex gap-2 items-center mt-3">
                <Select value={mesAdd} onValueChange={setMesAdd}>
                  <SelectTrigger className="w-[160px] bg-white/10 border-white/20 text-white font-semibold"><SelectValue /></SelectTrigger>
                  <SelectContent>{proximosMeses().map(m => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="🔍 Buscar por nome, função ou obra…" value={busca} onChange={e => setBusca(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-400" />
              </div>
            </div>
            <div className="space-y-3 px-5 py-4 overflow-y-auto flex-1 min-h-0">
              {/* Filtro CLT/PJ + chips de ordenação sugestiva (últimos 12 meses) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex rounded-full border border-indigo-200 overflow-hidden mr-2 shadow-sm">
                  {([
                    { k: "todos", label: "Todos" },
                    { k: "clt",   label: "CLT" },
                    { k: "pj",    label: "PJ" },
                  ] as const).map(({ k, label }) => (
                    <button key={k} type="button" onClick={() => setFiltroContrato(k)}
                      className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                        filtroContrato === k ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white" : "bg-white text-gray-600 hover:bg-indigo-50"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <Select value={filtroFuncao} onValueChange={setFiltroFuncao}>
                  <SelectTrigger className={`h-7 w-auto gap-1 px-2.5 mr-2 text-[11px] rounded-lg border ${filtroFuncao !== "todas" ? "border-slate-800 bg-slate-800 text-white font-semibold" : "border-gray-200 bg-white text-gray-600"}`}>
                    <SelectValue placeholder="Função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as funções</SelectItem>
                    {funcoesDisponiveis.map(f => (
                      <SelectItem key={f} value={f}>
                        {f}
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] px-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold align-middle">
                          {funcaoContagem.get(f) ?? 0}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {([
                  { k: "sugestao",    label: "⭐ Sugestões" },
                  { k: "faltas",      label: "Mais faltas" },
                  { k: "atrasos",     label: "Mais atrasos" },
                  { k: "frequencia",  label: "Menor assiduidade" },
                  { k: "atestados",   label: "Mais atestados" },
                  { k: "menos_tempo", label: "Menos tempo de casa" },
                  { k: "mais_tempo",  label: "Mais tempo de casa" },
                  { k: "mais_velho",  label: "Mais velho" },
                  { k: "mais_novo",   label: "Mais novo" },
                  { k: "nome",        label: "A → Z" },
                ] as const).map(({ k, label }) => (
                  <button key={k} type="button" onClick={() => setOrdenacao(k)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      ordenacao === k
                        ? "bg-gradient-to-r from-rose-600 to-red-500 border-rose-500 text-white shadow-md shadow-rose-200 scale-105"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-rose-50 hover:border-rose-200"
                    }`}>
                    {label}
                  </button>
                ))}
                <button type="button"
                  onClick={() => { setBusca(""); setFiltroContrato("todos"); setFiltroFuncao("todas"); setOrdenacao("nome"); }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold border border-dashed border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors">
                  ✕ Sem filtros (todos)
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Indicadores dos <strong>últimos 12 meses</strong> — ponto considera só <strong>meses consolidados</strong> no Fechamento de Ponto (meses abertos ainda têm inconsistências). "Sugestões" prioriza quem tem mais faltas, atrasos, atestados, advertências e menos tempo de casa.
              </p>
              <div className="border border-indigo-100 rounded-xl overflow-hidden shadow-sm">
                {/* Cabeçalho de colunas — leitura tipo tabela */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-50 via-violet-50 to-indigo-50 border-b border-indigo-100 text-[10px] font-bold uppercase tracking-wide text-indigo-900">
                  <span className="flex-1">Funcionário ({elegFiltrados.length})</span>
                  <span className="w-12 text-center leading-tight text-red-600">Faltas</span>
                  <span className="w-14 text-center leading-tight text-orange-600">Atrasos</span>
                  <span className="w-16 text-center leading-tight text-emerald-600 break-words">Assiduidade</span>
                  <span className="w-16 text-center leading-tight text-sky-600 break-words">Pontualidade</span>
                  <span className="w-14 text-center leading-tight text-amber-600">Atestados</span>
                  <span className="w-16 text-center leading-tight text-purple-600 break-words">Advertências</span>
                  <span className="w-10 text-center leading-tight">Idade</span>
                  <span className="w-16 text-center leading-tight break-words">Tempo de casa</span>
                </div>
                <div className="max-h-[52vh] overflow-y-auto divide-y divide-gray-100">
                  {(elegFiltrados ?? []).map((e: any) => {
                    const meses  = mesesDeCasa(e.dataAdmissao);
                    const faltas = Number(e.faltas12m ?? 0);
                    const atras  = Number(e.atrasos12m ?? 0);
                    const freq   = e.freqPct === null || e.freqPct === undefined ? null : Number(e.freqPct);
                    const pont   = e.pontPct === null || e.pontPct === undefined ? null : Number(e.pontPct);
                    const atest  = Number(e.atestados12m ?? 0);
                    const atestD = Number(e.atestadosDias12m ?? 0);
                    const adv    = Number(e.advertencias12m ?? 0);
                    const sel    = selecionados.has(e.id);
                    const toggle = () => setSelecionados(prev => {
                      const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n;
                    });
                    return (
                      <div key={e.id} onClick={toggle}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                          sel ? "bg-gradient-to-r from-rose-50 to-orange-50/60 shadow-[inset_3px_0_0_0_theme(colors.rose.500)]" : "odd:bg-slate-50/50 hover:bg-indigo-50/50"
                        }`}>
                        <Checkbox checked={sel} onCheckedChange={toggle} onClick={(ev) => ev.stopPropagation()} />
                        <PersonPhoto src={e.fotoUrl} alt={e.nome || ""} className="h-9 w-9 rounded-full shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm truncate ${sel ? "font-semibold text-red-900" : "font-medium"}`}>
                            {e.nome}
                            {isPJ(e) && <span className="ml-1.5 px-1.5 py-0 rounded text-[9px] font-bold bg-violet-100 text-violet-700 border border-violet-300 align-middle">PJ</span>}
                            {String(e.tipoContrato || "").toLowerCase() === "socio" && <span className="ml-1.5 px-1.5 py-0 rounded text-[9px] font-bold bg-gray-100 text-gray-600 border border-gray-300 align-middle">SÓCIO</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{e.funcao}{e.obraAtual ? ` · ${e.obraAtual}` : ""}</p>
                          {protecoes(e).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {protecoes(e).map((p, i) => (
                                <span key={i} className={`px-1.5 py-0 rounded text-[10px] font-semibold border ${p.cls}`}>{p.label}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className={`w-12 text-center text-sm font-bold ${faltas > 0 ? "text-red-600" : "text-gray-300"}`}>
                          {faltas > 0 ? faltas : "—"}
                        </span>
                        <span className={`w-14 text-center text-sm font-bold ${atras > 0 ? "text-orange-600" : "text-gray-300"}`}>
                          {atras > 0 ? atras : "—"}
                        </span>
                        <span className={`w-16 text-center text-xs font-bold ${
                          freq === null ? "text-gray-300" : freq < 90 ? "text-red-600" : freq < 97 ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {freq !== null ? `${freq}%` : "—"}
                        </span>
                        <span className={`w-16 text-center text-xs font-bold ${
                          pont === null ? "text-gray-300" : pont < 80 ? "text-red-600" : pont < 95 ? "text-amber-600" : "text-sky-600"
                        }`}>
                          {pont !== null ? `${pont}%` : "—"}
                        </span>
                        <span className={`w-14 text-center text-sm font-bold ${atest > 0 ? "text-amber-600" : "text-gray-300"}`}>
                          {atest > 0 ? <>{atest}<span className="text-[10px] font-medium text-amber-500">{atestD > 0 ? ` (${atestD}d)` : ""}</span></> : "—"}
                        </span>
                        <span className={`w-16 text-center text-sm font-bold ${adv > 0 ? "text-purple-600" : "text-gray-300"}`}>
                          {adv > 0 ? adv : "—"}
                        </span>
                        <span className="w-10 text-center text-sm font-medium text-gray-600">
                          {idadeAnos(e.dataNascimento) !== null ? `${idadeAnos(e.dataNascimento)}a` : "—"}
                        </span>
                        <span className={`w-16 text-center text-[11px] font-medium leading-tight ${
                          meses !== null && meses < 12 ? "text-blue-600" : "text-gray-500"
                        }`}>
                          {meses !== null ? tempoLabel(meses) : "—"}
                        </span>
                      </div>
                    );
                  })}
                  {elegiveis && elegFiltrados.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">Nenhum funcionário encontrado</p>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="items-center gap-2 px-5 py-3 border-t bg-slate-50 shrink-0">
              {selecionados.size > 0 && (
                <button type="button" onClick={() => setSelecionados(new Set())}
                  className="mr-auto text-xs text-gray-500 underline hover:text-gray-700">
                  Limpar seleção ({selecionados.size})
                </button>
              )}
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button disabled={selecionados.size === 0 || addMut.isPending}
                className="bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 text-white shadow-md shadow-rose-200 border-0"
                onClick={() => addMut.mutate({ companyId: companyId!, employeeIds: Array.from(selecionados), mesPlanejado: mesAdd })}>
                Adicionar {selecionados.size > 0 ? `(${selecionados.size})` : ""} em {mesLabel(mesAdd)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: observações */}
        <Dialog open={!!obsEdit} onOpenChange={(o) => !o && setObsEdit(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Observações do RH</DialogTitle></DialogHeader>
            <Textarea rows={4} value={obsEdit?.texto || ""} onChange={e => setObsEdit(p => p ? { ...p, texto: e.target.value } : p)}
              placeholder="Ex.: colocar de férias antes; verificar estabilidade CIPA; aguardar fim da concretagem…" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setObsEdit(null)}>Cancelar</Button>
              <Button disabled={updMut.isPending} onClick={() => { if (obsEdit) { updMut.mutate({ companyId: companyId!, id: obsEdit.id, observacoes: obsEdit.texto }); setObsEdit(null); } }}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Memória de cálculo / auditoria dos totais do topo */}
        <Dialog open={!!memoriaAud} onOpenChange={(o) => { if (!o) setMemoriaAud(null); }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-base">🔍 Memória de cálculo — {memoriaAud?.titulo}</DialogTitle>
            </DialogHeader>
            {memoriaAud && memoriaAud.foco === "economia" && (() => {
              // ===== Vista focada: ECONOMIA MENSAL — como cada R$/mês é composto =====
              const linhasE = memoriaAud.pessoas.map((i: any) => {
                const ec = economiaMensal(i);
                return { id: i.id, nome: i.nome, mes: i.mesPlanejado, pj: isPJ(i), fotoUrl: (i as any).fotoUrl || "",
                  sal: ec?.sal ?? 0, encargos: ec?.encargos ?? 0, va: ec?.va ?? 0, epi: ec?.epi ?? 0, total: ec?.total ?? 0 };
              }).sort((a, b) => b.total - a.total);
              const somaE = (k: "sal" | "encargos" | "va" | "epi" | "total") => linhasE.reduce((s, l) => s + (Number(l[k]) || 0), 0);
              const imprimirEco = () => {
                const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
                const logo = selectedCompany?.logoUrl || "/logo-fc.jpg";
                const empresa = selectedCompany?.name || "";
                const agora = new Date();
                const dataEmissao = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const emissor = user?.name || (user as any)?.username || "Usuário";
                const rows = linhasE.map((l, ix) => `
                  <tr${ix % 2 ? ' class="alt"' : ""}>
                    <td>${esc(l.nome)}${l.pj ? ' <span class="pj">PJ</span>' : ""}</td>
                    <td class="v">${esc(fmtMoney(l.sal))}</td>
                    <td class="v">${l.pj ? "—" : esc(fmtMoney(l.encargos))}</td>
                    <td class="v">${l.va > 0 ? esc(fmtMoney(l.va)) : "—"}</td>
                    <td class="v">${l.epi > 0 ? esc(fmtMoney(l.epi)) : "—"}</td>
                    <td class="v tot green">${esc(fmtMoney(l.total))}</td>
                  </tr>`).join("");
                const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Memória de Cálculo — Economia — ${esc(memoriaAud.titulo)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #047857; padding-bottom: 8px; margin-bottom: 10px; }
  .head img { max-height: 42px; max-width: 150px; object-fit: contain; }
  .head .tit { text-align: right; }
  .head h1 { margin: 0; font-size: 14px; color: #065f46; }
  .head p { margin: 2px 0 0; color: #475569; font-size: 10px; }
  .hero { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
  .hero b { font-size: 16px; color: #065f46; }
  .hero p { margin: 2px 0 0; color: #047857; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #064e3b; color: #fff; text-align: right; padding: 4px 6px; font-size: 9.5px; }
  th:first-child { text-align: left; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
  td.v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.alt td { background: #f8fafc; }
  td.tot { font-weight: 700; } .green { color: #047857; }
  tfoot td { font-weight: 700; background: #d1fae5; border-top: 2px solid #064e3b; }
  .pj { background: #ede9fe; color: #6d28d9; font-size: 8px; font-weight: 700; padding: 0 3px; border-radius: 3px; }
  .foot { margin-top: 12px; border-top: 1px solid #cbd5e1; padding-top: 6px; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="head">
    ${logo ? `<img src="${escAttr(logo.startsWith("http") ? logo : window.location.origin + logo)}" alt="">` : `<b>${esc(empresa)}</b>`}
    <div class="tit">
      <h1>💰 Memória de Cálculo — Economia Mensal · ${esc(memoriaAud.titulo)}</h1>
      <p>${esc(empresa)} · confidencial RH</p>
      <p>Emitido em ${esc(dataEmissao)} por ${esc(emissor)}</p>
    </div>
  </div>
  <div class="hero">
    <b>${esc(fmtMoney(somaE("total")))}/mês</b> · ${linhasE.length} pessoa(s)
    <p>= salário + encargos (55% do salário, só CLT) + vale alimentação + EPI médio — todo mês, a partir do desligamento. PJ: valor do contrato, sem encargos.</p>
  </div>
  <table>
    <thead><tr><th>Funcionário</th><th>Salário</th><th>Encargos 55%</th><th>VA</th><th>EPI médio</th><th>Σ /mês</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Σ ${linhasE.length} pessoas</td>
      <td class="v">${esc(fmtMoney(somaE("sal")))}</td>
      <td class="v">${esc(fmtMoney(somaE("encargos")))}</td>
      <td class="v">${esc(fmtMoney(somaE("va")))}</td>
      <td class="v">${esc(fmtMoney(somaE("epi")))}</td>
      <td class="v green">${esc(fmtMoney(somaE("total")))}</td></tr></tfoot>
  </table>
  <div class="foot">
    <span>Valores estimados para planejamento — VA e EPI entram quando cadastrados.</span>
    <span>${esc(empresa)} · ${esc(dataEmissao)}</span>
  </div>
  <div style="margin-top:8px;padding:7px 10px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:8.5px;color:#475569;line-height:1.55;page-break-inside:avoid;"><b style="color:#0f172a;">🔒 LGPD — Lei nº 13.709/2018:</b> este documento contém dados pessoais e é de uso interno e confidencial do RH. <b style="color:#0f172a;">Emissão registrada e rastreável:</b> gerado por <b style="color:#0f172a;">${esc(emissor)}</b> em ${esc(dataEmissao)}, pelo sistema FC Gestão Integrada (${esc(empresa)}). O emissor responde pela guarda e pelo descarte seguro desta impressão.</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</scr${""}ipt>
</body></html>`;
                const w = window.open("", "_blank");
                if (w) { w.document.write(html); w.document.close(); }
              };
              return (
                <div className="space-y-3">
                  <div className="rounded-2xl overflow-hidden border-0 shadow-md">
                    <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white px-4 py-3.5 flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">💰 Economia mensal ao concluir</p>
                        <p className="text-3xl font-extrabold tabular-nums leading-tight mt-0.5">{fmtMoney(somaE("total"))}<span className="text-base font-bold">/mês</span></p>
                        <p className="text-[11px] text-white/80 mt-1">salário + encargos (55%, só CLT) + vale alimentação + EPI médio · {linhasE.length} pessoa(s) · {fmtMoney(somaE("total") * 12)}/ano</p>
                      </div>
                      <Button variant="secondary" size="sm" className="h-8 gap-1.5 bg-white/15 hover:bg-white/25 text-white border-0 shrink-0" onClick={imprimirEco}>
                        🖨 Imprimir / PDF (A4)
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <div className="max-h-[50vh] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-900 text-white">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Funcionário</th>
                            <th className="text-right px-2 py-2 font-semibold">Salário</th>
                            <th className="text-right px-2 py-2 font-semibold">Encargos 55%</th>
                            <th className="text-right px-2 py-2 font-semibold">VA</th>
                            <th className="text-right px-2 py-2 font-semibold">EPI médio</th>
                            <th className="text-right px-3 py-2 font-semibold text-emerald-300">Σ /mês</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {linhasE.map((l, ix) => (
                            <tr key={l.id} className={ix % 2 ? "bg-slate-50/60" : ""}>
                              <td className="px-3 py-1.5">
                                <span className="flex items-center gap-2 min-w-0">
                                  <PersonPhoto src={l.fotoUrl} alt={l.nome || ""} className="h-6 w-6 rounded-full shrink-0" />
                                  <span className="truncate font-medium">{l.nome}{l.pj && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-violet-100 text-violet-700">PJ</span>}</span>
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(l.sal)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{l.pj ? "—" : fmtMoney(l.encargos)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{l.va > 0 ? fmtMoney(l.va) : "—"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{l.epi > 0 ? fmtMoney(l.epi) : "—"}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-bold text-emerald-700">{fmtMoney(l.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-slate-900 text-white font-bold">
                          <tr>
                            <td className="px-3 py-2">Σ {linhasE.length} pessoas</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(somaE("sal"))}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(somaE("encargos"))}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(somaE("va"))}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(somaE("epi"))}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{fmtMoney(somaE("total"))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">PJ: economia = valor mensal do contrato (sem encargos). VA e EPI entram quando cadastrados. Clique no funcionário na fila p/ detalhe individual.</p>
                </div>
              );
            })()}
            {memoriaAud && memoriaAud.foco === "multa" && (() => {
              // ===== Vista focada: MULTA 40% FGTS — fórmula pessoa a pessoa =====
              const linhasM = memoriaAud.pessoas.map((i: any) => {
                const av = avisoInfo(i);
                const sal = parseMoneyBR(i.salarioBase) ?? 0;
                const meses = mesesDeCasa(i.dataAdmissao);
                return { id: i.id, nome: i.nome, mes: i.mesPlanejado, pj: isPJ(i), fotoUrl: (i as any).fotoUrl || "",
                  sal, meses, multa: av?.multaFgts ?? 0 };
              }).sort((a, b) => b.multa - a.multa);
              const totalM = linhasM.reduce((s, l) => s + l.multa, 0);
              const imprimirMulta = () => {
                const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
                const logo = selectedCompany?.logoUrl || "/logo-fc.jpg";
                const empresa = selectedCompany?.name || "";
                const agora = new Date();
                const dataEmissao = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const emissor = user?.name || (user as any)?.username || "Usuário";
                const rows = linhasM.map((l, ix) => `
                  <tr${ix % 2 ? ' class="alt"' : ""}>
                    <td>${esc(l.nome)}${l.pj ? ' <span class="pj">PJ</span>' : ""}</td>
                    <td class="v">${esc(fmtMoney(l.sal))}</td>
                    <td class="v">${l.meses ?? "—"}</td>
                    <td class="v">${l.pj ? "—" : esc(fmtMoney(l.multa > 0 ? l.multa / 0.4 : 0.08 * l.sal * (l.meses ?? 0)))}</td>
                    <td class="v tot red">${l.pj ? "—" : esc(fmtMoney(l.multa))}</td>
                  </tr>`).join("");
                const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Memória de Cálculo — Multa 40% — ${esc(memoriaAud.titulo)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #b91c1c; padding-bottom: 8px; margin-bottom: 10px; }
  .head img { max-height: 42px; max-width: 150px; object-fit: contain; }
  .head .tit { text-align: right; }
  .head h1 { margin: 0; font-size: 14px; color: #991b1b; }
  .head p { margin: 2px 0 0; color: #475569; font-size: 10px; }
  .hero { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
  .hero b { font-size: 16px; color: #991b1b; }
  .hero p { margin: 2px 0 0; color: #b91c1c; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #7f1d1d; color: #fff; text-align: right; padding: 4px 6px; font-size: 9.5px; }
  th:first-child { text-align: left; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
  td.v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.alt td { background: #f8fafc; }
  td.tot { font-weight: 700; } .red { color: #b91c1c; }
  tfoot td { font-weight: 700; background: #fee2e2; border-top: 2px solid #7f1d1d; }
  .pj { background: #ede9fe; color: #6d28d9; font-size: 8px; font-weight: 700; padding: 0 3px; border-radius: 3px; }
  .foot { margin-top: 12px; border-top: 1px solid #cbd5e1; padding-top: 6px; color: #64748b; font-size: 9px; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="head">
    ${logo ? `<img src="${escAttr(logo.startsWith("http") ? logo : window.location.origin + logo)}" alt="">` : `<b>${esc(empresa)}</b>`}
    <div class="tit">
      <h1>⚠ Memória de Cálculo — Custo Real (Multa 40% FGTS) · ${esc(memoriaAud.titulo)}</h1>
      <p>${esc(empresa)} · confidencial RH</p>
      <p>Emitido em ${esc(dataEmissao)} por ${esc(emissor)}</p>
    </div>
  </div>
  <div class="hero">
    <b>${esc(fmtMoney(totalM))}</b> · ${linhasM.length} pessoa(s)
    <p>Fórmula (estimativa): 40% × (8% × salário × meses de casa). Único custo que só existe por causa da demissão — o resto é direito adquirido. PJ não tem multa. O valor oficial vem do extrato do FGTS na rescisão.</p>
  </div>
  <table>
    <thead><tr><th>Funcionário</th><th>Salário</th><th>Meses de casa</th><th>FGTS estimado (8%×sal×meses)</th><th>Multa 40%</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">Σ ${linhasM.length} pessoas</td><td class="v red">${esc(fmtMoney(totalM))}</td></tr></tfoot>
  </table>
  <div class="foot">
    <span>Estimativa pelo salário e tempo de casa atuais — valor oficial no extrato do FGTS.</span>
    <span>${esc(empresa)} · ${esc(dataEmissao)}</span>
  </div>
  <div style="margin-top:8px;padding:7px 10px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;font-size:8.5px;color:#475569;line-height:1.55;page-break-inside:avoid;"><b style="color:#0f172a;">🔒 LGPD — Lei nº 13.709/2018:</b> este documento contém dados pessoais e é de uso interno e confidencial do RH. <b style="color:#0f172a;">Emissão registrada e rastreável:</b> gerado por <b style="color:#0f172a;">${esc(emissor)}</b> em ${esc(dataEmissao)}, pelo sistema FC Gestão Integrada (${esc(empresa)}). O emissor responde pela guarda e pelo descarte seguro desta impressão.</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</scr${""}ipt>
</body></html>`;
                const w = window.open("", "_blank");
                if (w) { w.document.write(html); w.document.close(); }
              };
              return (
                <div className="space-y-3">
                  <div className="rounded-2xl overflow-hidden border-0 shadow-md">
                    <div className="bg-gradient-to-br from-rose-700 via-red-600 to-red-500 text-white px-4 py-3.5 flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">⚠ Custo real — Multa 40% do FGTS</p>
                        <p className="text-3xl font-extrabold tabular-nums leading-tight mt-0.5">{fmtMoney(totalM)}</p>
                        <p className="text-[11px] text-white/80 mt-1">40% × (8% × salário × meses de casa) · único custo que só existe por causa da demissão · PJ não tem multa</p>
                      </div>
                      <Button variant="secondary" size="sm" className="h-8 gap-1.5 bg-white/15 hover:bg-white/25 text-white border-0 shrink-0" onClick={imprimirMulta}>
                        🖨 Imprimir / PDF (A4)
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <div className="max-h-[50vh] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-900 text-white">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold">Funcionário</th>
                            <th className="text-right px-2 py-2 font-semibold">Salário</th>
                            <th className="text-right px-2 py-2 font-semibold">Meses de casa</th>
                            <th className="text-right px-2 py-2 font-semibold">FGTS estimado (8%×sal×meses)</th>
                            <th className="text-right px-3 py-2 font-semibold text-red-300">Multa 40%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {linhasM.map((l, ix) => (
                            <tr key={l.id} className={ix % 2 ? "bg-slate-50/60" : ""}>
                              <td className="px-3 py-1.5">
                                <span className="flex items-center gap-2 min-w-0">
                                  <PersonPhoto src={l.fotoUrl} alt={l.nome || ""} className="h-6 w-6 rounded-full shrink-0" />
                                  <span className="truncate font-medium">{l.nome}{l.pj && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-violet-100 text-violet-700">PJ</span>}</span>
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(l.sal)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{l.meses ?? "—"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums">{l.pj ? "—" : fmtMoney(l.multa > 0 ? l.multa / 0.4 : 0.08 * l.sal * (l.meses ?? 0))}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-bold text-red-700">{l.pj ? "—" : fmtMoney(l.multa)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 bg-slate-900 text-white font-bold">
                          <tr>
                            <td className="px-3 py-2" colSpan={4}>Σ {linhasM.length} pessoas</td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-300">{fmtMoney(totalM)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Estimativa pelo salário e tempo de casa atuais — o valor oficial vem do extrato do FGTS na rescisão.</p>
                </div>
              );
            })()}
            {memoriaAud && !memoriaAud.foco && (() => {
              // Rev. 4990 — quando aberta a partir de um MÊS do gráfico de caixa (mesRef),
              // cada linha mostra só as parcelas que caem NAQUELE mês (caixa cruzado):
              // férias do gozo no mês, ou rescisão de quem entrou de férias no mês anterior.
              const mesRef = memoriaAud.mesRef;
              const linhas = memoriaAud.pessoas.map((i: any) => {
                const av = avisoInfo(i);
                const feriasAntesPlena = !isPJ(i) && precisaFerias(i) ? (parseMoneyBR(i.salarioBase) ?? 0) * (4 / 3) : 0;
                const psRef = mesRef ? parcelasItem(i).filter((p: any) => p.mes === mesRef) : null;
                const temResc = psRef ? psRef.some((p: any) => p.tipo === "rescisao") : true;
                const feriasAntes = psRef ? (psRef.find((p: any) => p.tipo === "ferias")?.valor ?? 0) : feriasAntesPlena;
                return {
                  id: i.id, nome: i.nome, mes: i.mesPlanejado, pj: isPJ(i), fotoUrl: (i as any).fotoUrl || "",
                  status: String(i.status || ""),
                  aviso: temResc ? (av?.valor ?? 0) : 0, decimo: temResc ? (av?.decimo ?? 0) : 0, ferias: temResc ? (av?.feriasVal ?? 0) : 0,
                  multa: temResc ? (av?.multaFgts ?? 0) : 0, feriasAntes,
                  total: (temResc ? (av?.total ?? 0) : 0) + feriasAntes,
                  semSalario: !av,
                };
              }).sort((a, b) => String(a.mes).localeCompare(String(b.mes)) || String(a.nome).localeCompare(String(b.nome)));
              const soma = (k: keyof typeof linhas[0]) => linhas.reduce((s, l) => s + (Number(l[k]) || 0), 0);
              const imprimirMemoria = () => {
                const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const escAttr = (s: any) => esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
                const logo = selectedCompany?.logoUrl || "/logo-fc.jpg";
                const empresa = selectedCompany?.name || "";
                const agora = new Date();
                const dataEmissao = agora.toLocaleDateString("pt-BR") + " às " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const emissor = user?.name || (user as any)?.username || "Usuário";
                const fotoAbs = (u: string) => (u ? (u.startsWith("http") ? u : `${window.location.origin}${u}`) + (u.includes("?") ? "&" : "?") + "w=128" : "");
                const linhasHtml = linhas.map((l, ix) => `
                  <tr${ix % 2 ? ' class="alt"' : ""}>
                    <td><span class="who">${l.fotoUrl ? `<img class="foto" src="${escAttr(fotoAbs(l.fotoUrl))}" alt="">` : `<span class="foto ini">${esc(String(l.nome || "?").trim().charAt(0).toUpperCase())}</span>`}<span class="wcol"><span class="nome">${esc(l.nome)}</span><span class="meta2">${l.status === "desligado" ? '<span class="st ok">✓ Concluído</span>' : l.status === "cancelado" ? '<span class="st off">Cancelado</span>' : l.status === "aviso_previo" ? '<span class="st av">⏳ Em aviso</span>' : '<span class="st prog">📅 Programado</span>'}${l.pj ? ' <span class="pj">PJ</span>' : ""}<span class="mes">· ${esc(mesLabel(l.mes))}</span></span></span></span></td>
                    <td class="v">${esc(fmtMoney(l.aviso))}</td>
                    <td class="v">${esc(fmtMoney(l.decimo))}</td>
                    <td class="v">${esc(fmtMoney(l.ferias))}</td>
                    <td class="v multa">${esc(fmtMoney(l.multa))}</td>
                    <td class="v ferias">${l.feriasAntes > 0 ? esc(fmtMoney(l.feriasAntes)) : "—"}</td>
                    <td class="v total">${esc(fmtMoney(l.total))}</td>
                  </tr>`).join("");
                const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Memória de Cálculo — ${esc(memoriaAud.titulo)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #1e293b; font-size: 11px; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
  .header img { max-height: 52px; max-width: 160px; object-fit: contain; }
  .header .t h1 { font-size: 16px; color: #0f172a; }
  .header .t p { font-size: 11px; color: #64748b; margin-top: 2px; }
  .meta { text-align: right; font-size: 10px; color: #64748b; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; table-layout: fixed; }
  th { background: #0f172a; color: #fff; text-align: left; padding: 5px 6px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; }
  th:first-child { width: 31%; border-radius: 6px 0 0 0; } th:last-child { border-radius: 0 6px 0 0; }
  th.v, td.v { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; font-size: 10.5px; }
  tr.alt td { background: #f8fafc; }
  tr { page-break-inside: avoid; }
  .mes { color: #94a3b8; font-size: 8.5px; }
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .wcol { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .nome { font-weight: 600; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta2 { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .foto { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid #cbd5e1; }
  .foto.ini { display: inline-flex; align-items: center; justify-content: center; background: #e2e8f0; color: #475569; font-weight: 700; font-size: 10px; }
  .pj { background: #ede9fe; color: #6d28d9; font-weight: 700; font-size: 8px; padding: 1px 3px; border-radius: 3px; }
  .st { font-weight: 700; font-size: 8px; padding: 1px 4px; border-radius: 3px; }
  .st.ok { background: #d1fae5; color: #047857; } .st.off { background: #e2e8f0; color: #475569; text-decoration: line-through; }
  .st.av { background: #fef3c7; color: #b45309; } .st.prog { background: #e0e7ff; color: #4338ca; }
  .multa { color: #dc2626; font-weight: 600; }
  .ferias { color: #b45309; }
  .total { font-weight: 700; }
  tfoot td { background: #0f172a; color: #fff; font-weight: 700; border: none; padding: 6px; }
  tfoot .multa { color: #fca5a5; } tfoot .ferias { color: #fcd34d; }
  .legend { margin-top: 14px; font-size: 9.5px; color: #475569; line-height: 1.6; page-break-inside: avoid; }
  .legend b.m { color: #dc2626; }
  .destaque { margin-top: 10px; padding: 8px 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; font-size: 10.5px; page-break-inside: avoid; }
  .rodape { margin-top: 16px; padding-top: 8px; border-top: 2px solid #0f172a; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; gap: 12px; }
  .lgpd { margin-top: 8px; padding: 7px 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 8.5px; color: #475569; line-height: 1.55; page-break-inside: avoid; }
  .lgpd b { color: #0f172a; }
</style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px;">
      ${logo ? `<img src="${escAttr(logo)}" alt="Logo">` : ""}
      <div class="t">
        <h1>Memória de Cálculo — Plano de Desligamento</h1>
        <p>${esc(memoriaAud.titulo)} · ${esc(empresa)} · confidencial RH</p>
      </div>
    </div>
    <div class="meta">Emitido em ${esc(dataEmissao)}<br>por ${esc(emissor)}</div>
  </div>
  <table>
    <thead><tr>
      <th>Funcionário · mês</th><th class="v">Aviso</th><th class="v">13º prop.</th><th class="v">Férias +1/3</th><th class="v">Multa 40%</th><th class="v">Férias antes</th><th class="v">Total</th>
    </tr></thead>
    <tbody>${linhasHtml}</tbody>
    <tfoot><tr>
      <td>Σ ${linhas.length} pessoa${linhas.length !== 1 ? "s" : ""}</td>
      <td class="v">${esc(fmtMoney(soma("aviso")))}</td>
      <td class="v">${esc(fmtMoney(soma("decimo")))}</td>
      <td class="v">${esc(fmtMoney(soma("ferias")))}</td>
      <td class="v multa">${esc(fmtMoney(soma("multa")))}</td>
      <td class="v ferias">${esc(fmtMoney(soma("feriasAntes")))}</td>
      <td class="v">${esc(fmtMoney(soma("total")))}</td>
    </tr></tfoot>
  </table>
  <div class="destaque"><b style="color:#dc2626;">⚠ Custo REAL da demissão = ${esc(fmtMoney(soma("multa")))}</b> (multa 40% FGTS) — único valor que só existe por causa da demissão. O restante (${esc(fmtMoney(soma("total") - soma("multa")))}) é direito adquirido do funcionário, pago agora ou depois.</div>
  <div class="legend">
    <b>Como cada coluna é calculada</b> (com a data de emissão — os valores crescem dia a dia):<br>
    • <b>Aviso</b>: 30 dias + 3 por ano de casa (máx. 90) × salário/30. PJ: 15 dias contratuais.<br>
    • <b>13º proporcional</b>: salário × avos do ano corrente.<br>
    • <b>Férias +1/3</b>: vencidas em dobro (art. 137 CLT) + proporcionais, ambas +1/3.<br>
    • <b class="m">Multa 40% FGTS</b>: 40% sobre depósitos estimados (8% × salário × meses de casa).<br>
    • <b>Férias antes</b>: salário do mês de gozo +1/3 de quem entra em férias antes de desligar.
  </div>
  <div class="lgpd"><b>🔒 LGPD — Lei nº 13.709/2018:</b> este documento contém dados pessoais e é de uso interno e confidencial do RH. O tratamento destes dados atende à Lei Geral de Proteção de Dados. <b>Emissão registrada e rastreável:</b> gerado por <b>${esc(emissor)}</b> em ${esc(dataEmissao)}, pelo sistema FC Gestão Integrada (${esc(empresa)}). O emissor responde pela guarda e pelo descarte seguro desta impressão.</div>
  <div class="rodape"><span>${esc(empresa)} — Plano de Desligamento (confidencial RH)</span><span>Emitido por ${esc(emissor)} · ${esc(dataEmissao)}</span></div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, ${linhas.some(l => l.fotoUrl) ? 1200 : logo ? 400 : 100}); };<\/script>
</body></html>`;
                const w = window.open("", "_blank");
                if (!w) { toast.error("Bloqueador de pop-up impediu a impressão — permita pop-ups e tente de novo."); return; }
                w.document.write(html);
                w.document.close();
              };
              const agora = new Date();
              const dataHoje = agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
              const totalGeral = soma("total");
              const multaGeral = soma("multa");
              // Agrupar por mês para divisores visuais
              const grupos: { mes: string; itens: typeof linhas }[] = [];
              for (const l of linhas) {
                const g = grupos[grupos.length - 1];
                if (g && g.mes === l.mes) g.itens.push(l);
                else grupos.push({ mes: l.mes, itens: [l] });
              }
              return (
                <div className="flex flex-col gap-3">
                  {/* Cabeçalho: data + resumo + imprimir */}
                  <div className="flex flex-wrap items-stretch gap-2">
                    <div className="flex items-center rounded-xl bg-white border px-3 py-2 shrink-0">
                      <img src={selectedCompany?.logoUrl || "/logo-fc.jpg"} alt="Logo" className="h-10 max-w-[110px] object-contain" />
                    </div>
                    <div className="flex-1 min-w-[160px] rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide opacity-70">💰 Impacto no caixa</p>
                      <p className="text-lg font-extrabold tabular-nums leading-tight">{fmtMoney(totalGeral)}</p>
                      <p className="text-[10px] opacity-70">{linhas.length} pessoa{linhas.length !== 1 ? "s" : ""} · {dataHoje}</p>
                    </div>
                    <div className="flex-1 min-w-[160px] rounded-xl bg-red-50 border border-red-200 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-red-500 font-semibold">⚠ Custo real (multa 40%)</p>
                      <p className="text-lg font-extrabold tabular-nums leading-tight text-red-700">{fmtMoney(multaGeral)}</p>
                      <p className="text-[10px] text-red-500">{totalGeral > 0 ? Math.round((multaGeral / totalGeral) * 100) : 0}% do impacto no caixa</p>
                    </div>
                    <div className="flex-1 min-w-[160px] rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-emerald-600 font-semibold">✔ Direito adquirido</p>
                      <p className="text-lg font-extrabold tabular-nums leading-tight text-emerald-700">{fmtMoney(totalGeral - multaGeral)}</p>
                      <p className="text-[10px] text-emerald-600">pago agora ou depois, de qualquer forma</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={imprimirMemoria} className="text-xs self-center shrink-0">
                      🖨 Imprimir / PDF (A4)
                    </Button>
                  </div>
                  {/* Barra proporção multa × direito adquirido */}
                  {totalGeral > 0 && (
                    <div className="h-2 rounded-full overflow-hidden flex">
                      <div className="bg-red-500" style={{ width: `${(multaGeral / totalGeral) * 100}%` }} title="Custo real (multa 40%)" />
                      <div className="bg-emerald-400 flex-1" title="Direito adquirido" />
                    </div>
                  )}
                  <div className="max-h-[52vh] overflow-y-auto border rounded-xl shadow-sm">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="text-left bg-slate-800 text-slate-200">
                          <th className="px-2.5 py-2 font-semibold">Funcionário</th>
                          <th className="px-2 py-2 font-semibold text-right">Aviso</th>
                          <th className="px-2 py-2 font-semibold text-right">13º prop.</th>
                          <th className="px-2 py-2 font-semibold text-right">Férias +1/3</th>
                          <th className="px-2 py-2 font-semibold text-right text-red-300">Multa 40%</th>
                          <th className="px-2 py-2 font-semibold text-right text-amber-300">Férias antes</th>
                          <th className="px-2 py-2 font-bold text-right">Total</th>
                        </tr>
                      </thead>
                      {grupos.map(g => (
                        <tbody key={g.mes} className="divide-y">
                          <tr className="bg-slate-100/90">
                            <td colSpan={6} className="px-2.5 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wide">📅 {mesLabel(g.mes)} · {g.itens.length} pessoa{g.itens.length !== 1 ? "s" : ""}</td>
                            <td className="px-2 py-1 text-right text-[10px] font-bold text-slate-600 tabular-nums">{fmtMoney(g.itens.reduce((s, l) => s + l.total, 0))}</td>
                          </tr>
                          {g.itens.map((l, ix) => (
                            <tr key={l.id} className={`hover:bg-blue-50/60 ${ix % 2 ? "bg-slate-50/60" : "bg-white"}`}>
                              <td className="px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <PersonPhoto src={l.fotoUrl} alt={l.nome || ""} className="h-6 w-6 rounded-full shrink-0" />
                                </span>{" "}
                                <span className="font-medium break-words align-middle">{l.nome}</span>
                                {l.pj && <span className="ml-1 text-[9px] font-bold bg-violet-100 text-violet-700 px-1 rounded">PJ</span>}
                                {l.status === "desligado" ? <span className="ml-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1 rounded">✓ Concluído</span>
                                  : l.status === "cancelado" ? <span className="ml-1 text-[9px] font-bold bg-slate-200 text-slate-600 px-1 rounded line-through">Cancelado</span>
                                  : l.status === "aviso_previo" ? <span className="ml-1 text-[9px] font-bold bg-amber-100 text-amber-700 px-1 rounded">⏳ Em aviso</span>
                                  : <span className="ml-1 text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1 rounded">📅 Programado</span>}
                                {l.semSalario && <span className="ml-1 text-[9px] font-bold bg-red-100 text-red-700 px-1 rounded">sem salário cadastrado</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtMoney(l.aviso)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtMoney(l.decimo)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{fmtMoney(l.ferias)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-red-600 font-semibold">{fmtMoney(l.multa)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-amber-700">{l.feriasAntes > 0 ? fmtMoney(l.feriasAntes) : "—"}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">{fmtMoney(l.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      ))}
                      <tfoot className="sticky bottom-0 bg-slate-900 text-white">
                        <tr>
                          <td className="px-2.5 py-2 font-bold">Σ {linhas.length} pessoa{linhas.length !== 1 ? "s" : ""}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmtMoney(soma("aviso"))}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmtMoney(soma("decimo"))}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmtMoney(soma("ferias"))}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-bold text-red-300">{fmtMoney(multaGeral)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-amber-300">{fmtMoney(soma("feriasAntes"))}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-extrabold">{fmtMoney(totalGeral)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {/* Legenda compacta em grade */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground leading-snug bg-slate-50 border rounded-xl px-3 py-2">
                    <p><strong>Aviso</strong>: 30 dias + 3/ano de casa (máx. 90) × salário/30 · PJ: 15 dias.</p>
                    <p><strong>13º proporcional</strong>: salário × avos do ano corrente.</p>
                    <p><strong>Férias +1/3</strong>: vencidas em dobro (art. 137 CLT) + proporcionais.</p>
                    <p><strong className="text-red-600">Multa 40% FGTS</strong>: 40% × (8% × salário × meses de casa) — <u>único custo que só existe por causa da demissão</u>.</p>
                    <p><strong className="text-amber-700">Férias antes</strong>: salário do mês de gozo +1/3 de quem entra em férias antes de desligar.</p>
                    <p>Valores calculados com a data de hoje — crescem dia a dia. Clique no funcionário na fila p/ detalhe individual.</p>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Detalhe de custos do funcionário */}
        <Dialog open={!!detalheItem} onOpenChange={(o) => !o && setDetalheItem(null)}>
          <DialogContent className="max-w-md w-[calc(100vw-24px)] sm:w-full p-0 gap-0 overflow-hidden flex flex-col max-h-[92dvh]">
            {detalheItem && (() => {
              const it = detalheItem;
              const av = avisoInfo(it);
              const sal = parseMoneyBR(it.salarioBase) ?? 0;
              const pj = isPJ(it);
              const ferias = precisaFerias(it);
              const custoFerias = !pj && ferias ? sal * (4 / 3) : 0;
              const ec = economiaMensal(it);
              return (
                <>
                  {/* Cabeçalho escuro */}
                  <div className="bg-slate-900 px-5 pt-5 pb-4 text-white shrink-0">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-3 text-white">
                        <PersonPhoto src={it.fotoUrl} alt={it.nome || ""} className="h-11 w-11 rounded-full ring-2 ring-white/30" />
                        <span className="min-w-0 text-left">
                          <span className="block text-sm font-bold uppercase break-words leading-tight">{it.nome}</span>
                          <span className="block text-[11px] font-normal text-slate-300 mt-0.5">{it.funcao} · {pj ? "PJ" : "CLT"} · {mesLabel(it.mesPlanejado)}</span>
                        </span>
                      </DialogTitle>
                    </DialogHeader>
                    {av && (
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="rounded-lg bg-white/10 px-2 py-2 text-center">
                          <p className="text-[9px] uppercase tracking-wide text-slate-300">Rescisão total</p>
                          <p className="text-sm font-bold mt-0.5">{fmtMoney(av.total)}</p>
                        </div>
                        <div className="rounded-lg bg-red-500/90 px-2 py-2 text-center">
                          <p className="text-[9px] uppercase tracking-wide text-red-100">Custo real</p>
                          <p className="text-sm font-bold mt-0.5">{pj ? fmtMoney(av.total) : fmtMoney(av.multaFgts)}</p>
                        </div>
                        <div className="rounded-lg bg-emerald-500/90 px-2 py-2 text-center">
                          <p className="text-[9px] uppercase tracking-wide text-emerald-100">Economia/mês</p>
                          <p className="text-sm font-bold mt-0.5">{ec ? fmtMoney(ec.total) : "—"}</p>
                        </div>
                      </div>
                    )}
                    {av && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full mt-3 bg-white/15 hover:bg-white/25 text-white border-0"
                        onClick={() => imprimirDetalhe(it, avisoInfo, economiaMensal, isPJ)}
                      >
                        🖨 Imprimir / Gerar PDF
                      </Button>
                    )}
                  </div>

                  {av ? (
                    <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
                      {/* Direitos adquiridos */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">{pj ? "Aviso contratual" : "✔ Direitos adquiridos"}</p>
                          {!pj && <span className="text-[10px] text-muted-foreground">seriam pagos de qualquer forma</span>}
                        </div>
                        <div className="rounded-xl border divide-y overflow-hidden">
                          {custoFerias > 0 && (
                            <div className="flex items-center justify-between px-3 py-2.5 bg-amber-50/50">
                              <span className="text-sm">🏖 Férias antes de desligar <span className="text-[10px] text-muted-foreground">(+1/3)</span></span>
                              <span className="text-sm font-semibold tabular-nums">{fmtMoney(custoFerias)}</span>
                            </div>
                          )}
                          {pj ? (
                            <div className="flex items-center justify-between px-3 py-2.5">
                              <span className="text-sm">Aviso contratual (15 dias)</span>
                              <span className="text-sm font-semibold tabular-nums">{fmtMoney(av.valor)}</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between px-3 py-2.5">
                                <span className="text-sm">Aviso prévio ({av.dias} dias)</span>
                                <span className="text-sm font-semibold tabular-nums">{fmtMoney(av.valor)}</span>
                              </div>
                              <div className="flex items-center justify-between px-3 py-2.5">
                                <span className="text-sm">13º proporcional</span>
                                <span className="text-sm font-semibold tabular-nums">{fmtMoney(av.decimo)}</span>
                              </div>
                              <div className="flex items-center justify-between px-3 py-2.5">
                                <span className="text-sm">Férias + 1/3</span>
                                <span className="text-sm font-semibold tabular-nums">{fmtMoney(av.feriasVal)}</span>
                              </div>
                            </>
                          )}
                        </div>
                        {pj && <p className="text-[10px] text-muted-foreground mt-1">PJ: sem verbas CLT — paga-se só o aviso do contrato.</p>}
                      </div>

                      {/* Custo adicional real */}
                      {!pj && (
                        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-3">
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-red-800">⚠ Multa 40% do FGTS</p>
                              <p className="text-[11px] text-red-700/80 leading-snug mt-0.5">Único custo que só existe por causa da demissão</p>
                            </div>
                            <span className="text-lg font-bold text-red-700 tabular-nums shrink-0 ml-2">{fmtMoney(av.multaFgts)}</span>
                          </div>
                        </div>
                      )}

                      {/* Payback */}
                      {ec && (
                        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-emerald-800">Economia após desligar</p>
                            {!pj && av.multaFgts > 0 && ec.total > 0 && (
                              <p className="text-[11px] text-emerald-700/80">a multa se paga em ~{Math.max(1, Math.ceil(av.multaFgts / ec.total))} mês(es)</p>
                            )}
                          </div>
                          <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmtMoney(ec.total)}/mês</span>
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground text-center">Estimativa pelo salário atual — a rescisão oficial é do RH/contabilidade.</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground px-5 py-6">Sem salário base cadastrado — não é possível estimar os custos.</p>
                  )}
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Barra flutuante — aviso prévio múltiplo */}
        {selAviso.size > 0 && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-slate-900 text-white shadow-2xl px-4 py-2.5">
            <span className="text-[12px] font-semibold">{selAviso.size} selecionado{selAviso.size > 1 ? "s" : ""}</span>
            <button type="button"
              onClick={() => iniciarAvisos(ativosPlano.filter((i: any) => selAviso.has(i.id) && !isPJ(i)))}
              className="px-3 py-1 rounded-full text-[12px] font-bold bg-orange-500 hover:bg-orange-600">
              📣 Iniciar aviso múltiplo →
            </button>
            <button type="button" onClick={() => setSelAviso(new Set())}
              className="px-2 py-1 rounded-full text-[11px] font-semibold text-slate-300 hover:text-white">✕ limpar</button>
          </div>
        )}

        {/* Configurar meta de desligamentos */}
        <Dialog open={metaOpen} onOpenChange={(o) => !metaMut.isPending && setMetaOpen(o)}>
          <DialogContent className="max-w-md p-0 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 px-5 py-4 text-white">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">⚙️ Metas do plano</DialogTitle>
              </DialogHeader>
              <p className="text-[11px] text-indigo-100 mt-0.5">Defina quantas pessoas e quanto por mês — o resto o sistema ajusta sozinho.</p>
            </div>
            <div className="px-5 pb-1 pt-4 space-y-3">
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50/60 p-3.5">
                <p className="text-sm font-bold text-indigo-800 flex items-center gap-1.5 mb-1">🎯 Meta de redução (pessoas)</p>
                <p className="text-[11px] text-indigo-600/80 mb-2">
                  Quantas pessoas você quer colocar no plano? Em branco = automático (50% do quadro).
                </p>
                <Input type="number" inputMode="numeric" min={1} placeholder={`Automático: ${resumo ? Math.ceil((resumo.baseInicial ?? 0) / 2) : "50%"}`}
                  className="bg-white border-indigo-200 focus-visible:ring-indigo-400 text-base font-semibold"
                  value={metaInput} onChange={e => setMetaInput(e.target.value)} />
                {resumo && (
                  <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] font-semibold">
                    <span className="px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-indigo-700">👥 Quadro hoje: {resumo.headcountAtivo}</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white">🎯 Meta atual: {resumo.meta}{resumo.metaCustom ? " (manual)" : " (auto 50%)"}</span>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/60 p-3.5">
                <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5 mb-1">💰 Teto de desembolso mensal</p>
                <p className="text-[11px] text-emerald-700/80 mb-2">
                  Máximo por mês com o plano (férias + rescisões). O "⚖️ Redistribuir" remaneja a fila pra caber nesse valor (±10%). Em branco = sem teto.
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-600">R$</span>
                  <Input type="text" inputMode="decimal" placeholder="ex.: 30.000,00"
                    className="bg-white border-emerald-200 focus-visible:ring-emerald-400 pl-9 text-base font-semibold tabular-nums"
                    value={tetoInput}
                    onChange={e => setTetoInput(e.target.value.replace(/[^\d.,]/g, ""))}
                    onBlur={() => {
                      const v = parseMoneyBR(tetoInput);
                      setTetoInput(v != null && v > 0 ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
                    }} />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] font-semibold">
                  {(() => { const v = parseMoneyBR(tetoInput); return v != null && v > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white">✅ Novo teto: {fmtMoney(v)}/mês</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-700">Sem teto definido</span>
                  ); })()}
                  {tetoMes != null && <span className="px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-700">Atual: {fmtMoney(tetoMes)}/mês</span>}
                </div>
              </div>
            </div>
            <DialogFooter className="px-5 pb-4 pt-2">
              <Button variant="outline" disabled={metaMut.isPending || tetoMut.isPending} onClick={() => setMetaOpen(false)}>Cancelar</Button>
              <Button className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 font-bold"
                disabled={metaMut.isPending || tetoMut.isPending || !companyId} onClick={() => {
                const n = parseInt(metaInput, 10);
                if (metaInput.trim() !== "" && (!Number.isFinite(n) || n < 1)) { toast.error("Informe um número válido (mínimo 1)"); return; }
                const t = parseMoneyBR(tetoInput);
                if (tetoInput.trim() !== "" && (t == null || t < 1)) { toast.error("Teto inválido — informe um valor em reais"); return; }
                const novoTeto = tetoInput.trim() === "" ? null : t;
                if (novoTeto !== tetoMes) tetoMut.mutate({ companyId: companyId!, teto: novoTeto });
                metaMut.mutate({ companyId: companyId!, meta: metaInput.trim() === "" ? null : n });
              }}>💾 Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
