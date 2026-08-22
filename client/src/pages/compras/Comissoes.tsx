import React, { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumeroOcDisplay } from "@shared/numeroOc";
import { toast } from "sonner";
import { TrendingDown, Loader2, DollarSign, Award, BarChart3, ShoppingCart, AlertTriangle, Building2, Filter, BookOpen, Lock, History, HandCoins, Scale, FileText, HelpCircle } from "lucide-react";
import { DEFAULT_PREMIO_FAIXAS, calcPremioProgressivo, faixaLabel, faixasTexto, type PremioFaixa } from "@shared/premioFaixas";
import IntegraSignAssinar from "@/pages/IntegraSignAssinar";
import { PersonPhoto } from "@/components/PersonPhoto";

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  em_aberto:        { label: "Em Aberto",  cls: "bg-gray-100 text-gray-600" },
  aprovada_diretor: { label: "Aprovada",   cls: "bg-green-100 text-green-700" },
  paga:             { label: "Paga",       cls: "bg-blue-100 text-blue-700" },
};

const OC_STATUS: Record<string, { label: string; cls: string }> = {
  pendente:   { label: "Pendente",   cls: "bg-gray-100 text-gray-600" },
  aprovada:   { label: "Aprovada",   cls: "bg-blue-100 text-blue-700" },
  entregue:   { label: "Entregue",   cls: "bg-green-100 text-green-700" },
  cancelada:  { label: "Cancelada",  cls: "bg-red-100 text-red-700" },
  recebido:   { label: "Recebido",   cls: "bg-green-100 text-green-700" },
};

export default function ComprasComissoes() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id ?? 0;
  const [obraFiltro, setObraFiltro] = useState<string>("todas");

  const { data: configData } = trpc.purchase.getConfigCompras.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: comissoesData, isLoading: loadingComissoes } = trpc.purchase.listarComissoes.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: ocsData, isLoading: loadingOCs } = trpc.purchase.analiseComissoesOCs.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: obras } = trpc.obras.list.useQuery({ companyId }, { enabled: !!companyId });

  // Rev. 5104 — Regras de Comissão versionadas (documento vivo)
  const { user } = useAuth();
  const isAdminMaster = (user as any)?.role === "admin_master";
  const utils = trpc.useUtils();
  const { data: regrasData } = trpc.purchase.regrasComissaoGet.useQuery({ companyId }, { enabled: !!companyId });
  // Rev. 5107 — adesão ao programa (termo com assinatura online via IntegraSign)
  const { data: adesaoData, refetch: refetchAdesao } = trpc.purchase.termoAdesaoStatus.useQuery({ companyId }, { enabled: !!companyId });
  const iniciarAdesao = trpc.purchase.termoAdesaoIniciar.useMutation({
    onSuccess: (r) => {
      refetchAdesao();
      if (r.jaHabilitado) { toast.success("Você já está habilitado no programa."); return; }
      // Rev. 5110 — assinatura acontece AQUI na tela (diálogo), sem sair para outra página
      if (r.token) { setSignToken(r.token); }
      else toast.success("Termo criado — aguardando assinatura.");
    },
    onError: (e) => toast.error(e.message),
  });
  // Rev. 5110 — token em assinatura no diálogo desta tela (participante e depois sócio)
  const [signToken, setSignToken] = useState<string | null>(null);
  const habilitadosSet = new Set((adesaoData?.habilitados || []).map((h: any) => String(h.nome || "").trim().toUpperCase()));
  const pendentesSet = new Set((adesaoData?.pendentes || []).map((h: any) => String(h.nome || "").trim().toUpperCase()));
  const { data: antecipacoes } = trpc.purchase.comissaoAntecipacoesListar.useQuery({ companyId }, { enabled: !!companyId });
  const regra = regrasData?.vigente as any;
  const [editRegra, setEditRegra] = useState(false);
  const [aba, setAba] = useState<"visao" | "regras" | "termo" | "ranking">("visao");
  // Rev. 5111 — Ranking do processo completo (SC → cotação → OC → prêmio)
  const { data: rankingCounts } = trpc.purchase.rankingProcessoCounts.useQuery({ companyId }, { enabled: !!companyId });
  const [verHistorico, setVerHistorico] = useState(false);
  const [indicadorAberto, setIndicadorAberto] = useState<string | null>(null);
  const [anteciparOpen, setAnteciparOpen] = useState(false);
  const [fPct, setFPct] = useState(""); const [fGatilho, setFGatilho] = useState("");
  const [fTeto, setFTeto] = useState(""); const [fAntec, setFAntec] = useState("");
  const [fTexto, setFTexto] = useState(""); const [fSenha, setFSenha] = useState("");
  const [fKpis, setFKpis] = useState<{ chave: string; label: string; peso: number; como?: string }[]>([]);
  const [fFaixas, setFFaixas] = useState<PremioFaixa[]>(DEFAULT_PREMIO_FAIXAS);
  const [aObra, setAObra] = useState(""); const [aComprador, setAComprador] = useState("");
  const [aValor, setAValor] = useState(""); const [aObs, setAObs] = useState(""); const [aSenha, setASenha] = useState("");
  const salvarRegraMut = trpc.purchase.regrasComissaoSalvar.useMutation({
    onSuccess: (r) => { toast.success(`Regras atualizadas (versão ${r.versao})`); setEditRegra(false); setFSenha(""); utils.purchase.regrasComissaoGet.invalidate(); utils.purchase.getConfigCompras.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const anteciparMut = trpc.purchase.comissaoAntecipacaoRegistrar.useMutation({
    onSuccess: () => { toast.success("Antecipação registrada"); setAnteciparOpen(false); setASenha(""); setAValor(""); setAObs(""); utils.purchase.comissaoAntecipacoesListar.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const comissoes = comissoesData ?? [];
  const ocsAll = ocsData ?? [];
  const pctConfig = regra ? Number(regra.percentual) : Number(configData?.config?.comissaoPercentual ?? 10);
  const gatilhoMin = Number(regra?.gatilho_min_pct ?? 0);
  const tetoValor = Number(regra?.teto_valor ?? 0);
  const antecMax = Number(regra?.antecipacao_max_pct ?? 40);
  // Rev. 5108 — prêmio escalonado progressivo por faixas de economia
  // Fallback (regras ainda não carregadas): preserva o percentual único legado, nunca assume a tabela nova
  const faixas: PremioFaixa[] = (regrasData as any)?.faixas ?? [{ atePct: null, premioPct: pctConfig }];
  const pctMax = faixas[faixas.length - 1]?.premioPct ?? pctConfig;
  const premioObra = (saldo: number, meta: number) => calcPremioProgressivo(saldo, meta, faixas, gatilhoMin).premio;

  const obraMap = Object.fromEntries((obras ?? []).map((o: any) => [String(o.id), o.nome]));

  const obrasComOC = [...new Set(ocsAll.map((oc: any) => String(oc.obraId)))].sort((a, b) => {
    const nA = obraMap[a] || a;
    const nB = obraMap[b] || b;
    return nA.localeCompare(nB);
  });

  const ocs = obraFiltro === "todas" ? ocsAll : ocsAll.filter((oc: any) => String(oc.obraId) === obraFiltro);
  const comissoesFiltradas = obraFiltro === "todas" ? comissoes : comissoes.filter((c: any) => String(c.obraId) === obraFiltro);

  const totalCompradoOCs = ocs.reduce((s: number, oc: any) => s + (oc.valorComprado || 0), 0);
  const ocsSemlMeta = ocs.filter((oc: any) => !oc.temMeta);

  const obraSaldoMap: Record<string, { totalMeta: number; totalComprado: number; saldo: number }> = {};
  for (const oc of ocsAll) {
    if (!oc.temMeta) continue;
    const key = String(oc.obraId);
    if (!obraSaldoMap[key]) obraSaldoMap[key] = { totalMeta: 0, totalComprado: 0, saldo: 0 };
    obraSaldoMap[key].totalMeta += oc.valorMeta || 0;
    obraSaldoMap[key].totalComprado += oc.valorComprado || 0;
  }
  for (const key of Object.keys(obraSaldoMap)) {
    const o = obraSaldoMap[key];
    o.saldo = o.totalMeta - o.totalComprado;
  }

  // Gatilho mínimo: a obra só gera comissão se o saving for ≥ X% da meta
  const obraGeraComissao = (key: string) => {
    const o = obraSaldoMap[key];
    if (!o || o.saldo <= 0 || o.totalMeta <= 0) return false;
    return (o.saldo / o.totalMeta) * 100 >= gatilhoMin;
  };
  const obrasFiltradasKeys = obraFiltro === "todas" ? Object.keys(obraSaldoMap) : [obraFiltro];
  const economiaObras = obrasFiltradasKeys.reduce((s, key) => s + Math.max(0, obraSaldoMap[key]?.saldo ?? 0), 0);
  const economiaElegivel = obrasFiltradasKeys.reduce((s, key) => s + (obraGeraComissao(key) ? obraSaldoMap[key].saldo : 0), 0);
  const comissaoBruta = obrasFiltradasKeys.reduce((s, key) => {
    const o = obraSaldoMap[key];
    return s + (o && obraGeraComissao(key) ? premioObra(o.saldo, o.totalMeta) : 0);
  }, 0);
  const comissaoPotencial = tetoValor > 0 ? Math.min(comissaoBruta, tetoValor) : comissaoBruta;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Rev. 5107 — Termo de Adesão ao Programa de Prêmio por Desempenho (modelo imprimível)
  const imprimirTermoAdesao = () => {
    const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const kpis = regrasData?.kpis || [];
    const agora = new Date().toLocaleString("pt-BR");
    const emissor = esc((user as any)?.name || (user as any)?.email || "");
    const empresa = esc((selectedCompany as any)?.razaoSocial || selectedCompany?.name || "");
    const cnpj = esc((selectedCompany as any)?.cnpj || "");
    const logo = esc((selectedCompany as any)?.logoUrl || "/logo-fc.jpg");
    const kpiRows = kpis.map((k: any) => `
      <tr><td><b>${esc(k.label)}</b><br/><span class="mut">${esc(k.como)}</span>
      ${k.formula ? `<br/><span class="mut"><b>Fórmula:</b> ${esc(k.formula)}</span>` : ""}
      ${(k.regua || []).length ? `<br/><span class="mut"><b>Régua:</b> ${(k.regua || []).map((r: string) => esc(r)).join(" · ")}</span>` : ""}</td>
      <td class="num">${esc(k.peso)}%</td></tr>`).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo de Adesão — Prêmio por Desempenho em Compras</title>
<style>
  @page { size: A4; margin: 18mm 14mm 22mm 14mm; @bottom-center { content: "🔒 LGPD — Lei nº 13.709/2018 · Emitido por ${emissor} em ${agora} · ${empresa} — emissão registrada e rastreável"; font-size: 8px; color: #64748b; } }
  * { box-sizing: border-box; }
  /* Na TELA: respiro de ~2cm em todas as laterais e largura de folha A4; na IMPRESSÃO as margens vêm do @page */
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 10mm; max-width: 210mm; margin-left: auto; margin-right: auto; background: #fff; }
  @media print { body { padding: 0; max-width: none; } }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px; }
  .head img { height: 44px; } .head .t { text-align: right; }
  .head h1 { margin: 0; font-size: 15px; } .head p { margin: 2px 0 0; color: #64748b; font-size: 10px; }
  h2 { font-size: 12px; margin: 14px 0 4px; border-left: 4px solid #eab308; padding-left: 6px; }
  p { margin: 4px 0; text-align: justify; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; table-layout: fixed; }
  th { background: #0f172a; color: #fff; text-transform: uppercase; font-size: 9px; padding: 5px 6px; text-align: left; }
  td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .num { text-align: right; font-weight: bold; width: 60px; }
  .mut { color: #64748b; font-size: 9.5px; }
  .box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin: 6px 0; }
  .sig { display: flex; gap: 24px; margin-top: 34px; } .sig div { flex: 1; text-align: center; }
  .sig .line { border-top: 1px solid #334155; padding-top: 4px; font-size: 10px; }
  .blank { display: inline-block; min-width: 220px; border-bottom: 1px dotted #94a3b8; }
</style></head><body>
<div class="head">
  <img src="${logo}" alt="logo"/>
  <div class="t"><h1>TERMO DE ADESÃO — PROGRAMA DE PRÊMIO POR DESEMPENHO EM COMPRAS</h1>
  <p>Regulamento versão ${esc(regra?.versao ?? 1)} · Emitido em ${agora} por ${emissor}</p></div>
</div>
<div class="box" style="background:#f8fafc">
<p><b>EMPREGADORA:</b> ${empresa}${cnpj ? `, CNPJ ${cnpj}` : ""}.</p>
<p><b>PARTICIPANTE:</b> <span class="blank"></span>, CPF <span class="blank" style="min-width:140px"></span>, função <span class="blank" style="min-width:160px"></span>.</p>
</div>
<p class="mut" style="margin-top:6px"><b>Assinatura eletrônica:</b> a adesão oficial é feita DENTRO DO SISTEMA (botão "Estou ciente de tudo — aderir e assinar" na tela Prêmios): o participante assina eletronicamente e, em seguida, o sócio administrador assina — só então a habilitação ao ranking é concluída e o termo fica arquivado no dossiê RH. Este modelo impresso serve para conferência e arquivo físico opcional.</p>

<h2>Cláusula 1ª — Natureza jurídica</h2>
<p>O programa institui <b>PRÊMIO por desempenho superior ao ordinariamente esperado</b>, por liberalidade da EMPREGADORA, nos termos do art. 457, §§ 2º e 4º, da CLT. O prêmio <b>não constitui salário</b>, não integra a remuneração para nenhum efeito, não gera habitualidade nem reflexos em férias, 13º, FGTS, INSS ou verbas rescisórias.</p>

<h2>Cláusula 2ª — Base de cálculo e apuração por projeto</h2>
<p>O prêmio é apurado <b>por obra (projeto)</b> sobre o saving global validado (Meta do orçamento − Total comprado em OCs entregues), somente quando o saving da obra atingir o gatilho mínimo de ${gatilhoMin}% da meta. O percentual de prêmio é <b>escalonado e progressivo por faixas de economia</b>: cada fatia do saving paga o percentual da sua faixa, conforme a tabela vigente: ${esc(faixasTexto(faixas))}. Todo crédito é computado no <b>login que emitiu a Ordem de Compra</b>, e o valor da obra é dividido entre os compradores proporcionalmente à economia gerada por cada um.</p>

<h2>Cláusula 3ª — Scorecard de KPIs (fator de desempenho)</h2>
<p>O valor apurado é multiplicado pela nota do scorecard abaixo (0 a 100%), medida individualmente por login:</p>
<table><thead><tr><th>Indicador — definição, fórmula e régua de pontuação</th><th style="width:60px;text-align:right">Peso</th></tr></thead>
<tbody>${kpiRows}</tbody></table>

<h2>Cláusula 4ª — Pagamento: prazo e condições</h2>
<p>O direito ao prêmio <b>somente se constitui no apuramento final da obra</b>, assim entendido o encerramento do projeto com a <b>entrega de todas as pendências e o aceite final do cliente</b>. O pagamento será realizado em <b>até 30 (trinta) dias úteis após a liberação da retenção final da obra</b> — retenção contratual de garantia (usualmente 5% do valor total da obra) retida pelo cliente até a quitação de todas as pendências —, marco em que a obra se considera integralmente encerrada. O valor de cada participante é <b>proporcional à economia gerada pelo seu login</b> (Cláusula 2ª), multiplicado pela sua nota individual no scorecard de KPIs. Valores exibidos em painéis, relatórios ou provisões durante a execução são <b>mera expectativa</b>, não configurando direito adquirido, verba devida ou promessa de pagamento. Antecipações são liberalidade excepcional, limitadas a ${antecMax}% do provisionado, autorizadas exclusivamente pelo Administrador Master, e serão descontadas do valor final; se a apuração final resultar menor que o antecipado, o excedente será compensado na forma da lei.</p>

<h2>Cláusula 5ª — Desligamento</h2>
<p>(a) Dispensa por <b>justa causa</b>: perda integral do prêmio ainda não pago. (b) Pedido de demissão ou dispensa sem justa causa: o PARTICIPANTE recebe apenas o <b>proporcional ao que já estiver apurado e validado</b> até a data do desligamento, pago no ciclo normal (encerramento da obra), nada sendo devido sobre projeções ou obras não fechadas, pois o direito só nasce com a apuração final (Cláusula 4ª).</p>

<h2>Cláusula 6ª — Vigência e alterações</h2>
<p>O programa é por prazo indeterminado, podendo ser alterado ou extinto pela EMPREGADORA a qualquer tempo, respeitados os valores já apurados e validados. Toda alteração gera nova versão do regulamento, registrada com autor, data e histórico no sistema.</p>

<h2>Declaração de ciência e adesão</h2>
<div class="box"><p>Declaro que li e compreendi integralmente o regulamento acima, aderindo voluntariamente ao programa. Estou ciente de que o prêmio é liberalidade condicionada a desempenho e apuração final por projeto, <b>não integra meu salário</b> e que os valores provisionados constituem mera expectativa até o fechamento de cada obra.</p></div>

<div class="sig">
  <div><div class="line"><b>EMPREGADORA</b><br/>${empresa}</div></div>
  <div><div class="line"><b>PARTICIPANTE</b><br/>Nome e CPF</div></div>
</div>
<div class="sig">
  <div><div class="line">Testemunha 1 — Nome/CPF</div></div>
  <div><div class="line">Testemunha 2 — Nome/CPF</div></div>
</div>
<p class="mut" style="margin-top:14px">Local e data: ______________________________, ____/____/______</p>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Habilite pop-ups para gerar o termo."); return; }
    w.document.write(html);
    w.document.close();
  };

  const isLoading = loadingComissoes || loadingOCs;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Award className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Análise de Prêmios</h1>
              <p className="text-sm text-gray-500">
                Prêmio escalonado: <span className="font-bold text-yellow-700">{faixas[0]?.premioPct}% a {pctMax}%</span> sobre a economia negociada, conforme a faixa atingida
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              className="h-9 px-3 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-300 min-w-[200px]"
              value={obraFiltro}
              onChange={e => setObraFiltro(e.target.value)}
            >
              <option value="todas">Todas as Obras</option>
              {obrasComOC.map(obraId => (
                <option key={obraId} value={obraId}>
                  {obraMap[obraId] || `Obra ${obraId}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {obraFiltro !== "todas" && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
            <Building2 className="h-4 w-4 text-yellow-600 shrink-0" />
            <span className="text-yellow-800">
              Filtrando por: <span className="font-bold">{obraMap[obraFiltro] || `Obra ${obraFiltro}`}</span>
            </span>
            <button
              className="ml-auto text-xs text-yellow-700 hover:text-yellow-900 underline"
              onClick={() => setObraFiltro("todas")}
            >
              Limpar filtro
            </button>
          </div>
        )}

        {/* Rev. 5109 — Navegação em abas (iPad friendly) */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-full sm:w-auto sm:inline-flex">
          {([
            { key: "visao", label: "Visão Geral", icon: <BarChart3 className="h-4 w-4" /> },
            { key: "regras", label: "Regras do Prêmio", icon: <BookOpen className="h-4 w-4" /> },
            { key: "termo", label: "Termo de Adesão", icon: <FileText className="h-4 w-4" />, alerta: adesaoData?.minha?.status !== "concluido" },
            { key: "ranking", label: "Ranking", icon: <Award className="h-4 w-4" /> },
          ] as { key: "visao" | "regras" | "termo" | "ranking"; label: string; icon: React.ReactNode; alerta?: boolean }[]).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setAba(t.key)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${aba === t.key ? "bg-white text-yellow-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {t.icon}
              <span>{t.label}</span>
              {t.alerta && <span className="h-2 w-2 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>

        {/* ══ ABA: TERMO DE ADESÃO ══ */}
        {aba === "termo" && (<>
        {/* Rev. 5107 — Habilitação no programa: termo com assinatura online (participante → sócio) */}
        <Card className={adesaoData?.minha?.status === "concluido" ? "border-emerald-200" : "border-amber-200"}>
          <CardContent className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className={`h-5 w-5 shrink-0 ${adesaoData?.minha?.status === "concluido" ? "text-emerald-600" : "text-amber-600"}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">Habilitação no Programa — Termo de Adesão</p>
                {adesaoData?.minha?.status === "concluido" ? (
                  <p className="text-xs text-emerald-700">Você está habilitado: termo assinado por você e pelo sócio administrador (regulamento v{adesaoData.minha.regraVersao}). Documento arquivado no seu dossiê RH.</p>
                ) : adesaoData?.minha?.faltaSocio ? (
                  <p className="text-xs text-amber-700">Você já assinou — aguardando a assinatura do sócio administrador para concluir sua habilitação no ranking.</p>
                ) : adesaoData?.minha ? (
                  <p className="text-xs text-amber-700">Termo criado — falta a sua assinatura eletrônica.</p>
                ) : (
                  <p className="text-xs text-gray-600">Para participar do ranking é obrigatório assinar eletronicamente o Termo de Adesão. Você assina primeiro; depois o sócio administrador assina e sua habilitação é concluída.</p>
                )}
              </div>
            </div>
            {adesaoData?.minha?.status === "concluido" ? (
              <Badge className="bg-emerald-100 text-emerald-700">✓ Habilitado</Badge>
            ) : adesaoData?.minha?.faltaSocio ? (
              (adesaoData.minha as any).socioToken ? (
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setSignToken((adesaoData.minha as any).socioToken)}>
                  Colher assinatura do sócio administrador
                </Button>
              ) : (
                <Badge className="bg-amber-100 text-amber-700">Aguardando sócio</Badge>
              )
            ) : adesaoData?.minha && adesaoData.minha.meuToken ? (
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setSignToken(adesaoData.minha!.meuToken!)}>
                Visualizar o termo e assinar
              </Button>
            ) : (
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={iniciarAdesao.isPending}
                onClick={() => iniciarAdesao.mutate({ companyId, aceiteCiencia: true })}>
                {iniciarAdesao.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                ✓ Visualizar o termo e assinar
              </Button>
            )}
          </CardContent>
        </Card>
        <div className="flex items-center justify-between flex-wrap gap-2 px-1">
          <p className="text-xs text-gray-500">Quer ler antes de assinar? O modelo completo do termo pode ser impresso ou salvo em PDF.</p>
          <Button size="sm" variant="outline" onClick={imprimirTermoAdesao}>
            <FileText className="h-3.5 w-3.5 mr-1" /> Ver / imprimir modelo do termo
          </Button>
        </div>

        {/* Rev. 5110 — assinatura eletrônica DENTRO da tela: participante e, em seguida, sócio */}
        <Dialog open={!!signToken} onOpenChange={(o) => { if (!o) { setSignToken(null); refetchAdesao(); } }}>
          <DialogContent className="max-w-4xl w-[96vw] max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-amber-600" />
                Termo de Adesão — assinatura eletrônica
              </DialogTitle>
            </DialogHeader>
            {signToken && (
              <IntegraSignAssinar key={signToken} tokenProp={signToken} embedded onAssinado={() => refetchAdesao()} />
            )}
            {adesaoData?.minha?.faltaSocio && (adesaoData.minha as any).socioToken && signToken !== (adesaoData.minha as any).socioToken && (
              <div className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className="text-sm text-gray-600">
                  Sua assinatura foi registrada. Agora é a vez de <b>{(adesaoData.minha as any).socioNome || "o sócio administrador"}</b> assinar — pode ser aqui mesmo, neste aparelho.
                </p>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => setSignToken((adesaoData!.minha as any).socioToken)}>
                  Sócio administrador assina agora →
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </>)}

        {/* ══ ABA: RANKING ══ */}
        {aba === "ranking" && (() => {
          // Rev. 5111 — Ranking do processo completo: SCs, cotações, OCs e prêmio a receber por pessoa
          const norm = (s: any) => String(s || "").trim().toUpperCase();
          type Pessoa = { nome: string; scs: number; cotacoes: number; ocs: number; economia: number; comprado: number; premio: number; obras: Set<string> };
          const pessoas: Record<string, Pessoa> = {};
          const get = (nome: string) => {
            const k = norm(nome);
            if (!pessoas[k]) pessoas[k] = { nome, scs: 0, cotacoes: 0, ocs: 0, economia: 0, comprado: 0, premio: 0, obras: new Set() };
            return pessoas[k];
          };
          for (const r of rankingCounts?.scs ?? []) get(r.nome).scs = r.qtd;
          for (const r of rankingCounts?.cotacoes ?? []) get(r.nome).cotacoes = r.qtd;
          // Rev. 5112 — base do ranking = PROCESSO FINALIZADO: só OCs entregues/recebidas
          // (regulamento: saving sobre OCs entregues). Canceladas, rascunhos e pendentes ficam fora.
          const ENTREGUE = new Set(["entregue", "parcial", "entregue_parcial", "recebido"]);
          const ocsRank = ocsAll.filter((oc: any) => ENTREGUE.has(String(oc.status)));
          const obrasRank = [...new Set(ocsRank.map((oc: any) => String(oc.obraId)))];
          for (const obraId of obrasRank) {
            const ocsObra = ocsRank.filter((oc: any) => String(oc.obraId) === obraId);
            // Meta × comprado da obra recalculados SÓ com OCs entregues (mesma base do motor que paga)
            let metaObra = 0, compradoMeta = 0;
            for (const oc of ocsObra) { if (oc.temMeta) { metaObra += oc.valorMeta || 0; compradoMeta += oc.valorComprado || 0; } }
            const saldoObra = metaObra - compradoMeta;
            const atingiuGatilho = metaObra > 0 && saldoObra > 0 && (saldoObra / metaObra) * 100 >= gatilhoMin;
            const comObra = atingiuGatilho ? premioObra(saldoObra, metaObra) : 0;
            const porComprador: Record<string, { nome: string; economia: number; comprado: number; ocs: number }> = {};
            for (const oc of ocsObra) {
              const nome = oc.compradorNome || "Sem login registrado";
              const k = norm(nome);
              if (!porComprador[k]) porComprador[k] = { nome, economia: 0, comprado: 0, ocs: 0 };
              porComprador[k].ocs += 1;
              if (!oc.temMeta) continue;
              porComprador[k].economia += oc.economia || 0;
              porComprador[k].comprado += oc.valorComprado || 0;
            }
            const lista = Object.values(porComprador);
            const somaPositiva = lista.reduce((s, c) => s + Math.max(0, c.economia), 0);
            const somaComprado = lista.reduce((s, c) => s + c.comprado, 0);
            const share = (c: any) => somaPositiva > 0 ? Math.max(0, c.economia) / somaPositiva : (somaComprado > 0 ? c.comprado / somaComprado : 0);
            for (const c of lista) {
              const p = get(c.nome);
              p.ocs += c.ocs;
              p.economia += c.economia; // saldo REAL (positivo e negativo), sem maquiagem
              p.comprado += c.comprado;
              p.premio += comObra * share(c);
              if (c.ocs > 0) p.obras.add(obraId);
            }
          }
          // Rev. 5119 — desligados fora da lista (só colaboradores ativos aparecem)
          const desligados = new Set((rankingCounts?.desligados ?? []).map(norm));
          const ranking = Object.values(pessoas)
            .filter(p => p.scs > 0 || p.cotacoes > 0 || p.ocs > 0)
            .filter(p => !desligados.has(norm(p.nome)))
            .sort((a, b) => b.premio - a.premio || b.economia - a.economia || (b.scs + b.cotacoes + b.ocs) - (a.scs + a.cotacoes + a.ocs));
          const medalha = (i: number) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`;
          const tot = {
            scs: ranking.reduce((s, p) => s + p.scs, 0),
            cotacoes: ranking.reduce((s, p) => s + p.cotacoes, 0),
            ocs: ranking.reduce((s, p) => s + p.ocs, 0),
            economia: ranking.reduce((s, p) => s + p.economia, 0),
            premio: ranking.reduce((s, p) => s + p.premio, 0),
          };
          return (
            <Card className="border-yellow-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-5 w-5 text-yellow-600" />
                  Ranking Geral — Processo de Compras completo
                </CardTitle>
                <p className="text-xs text-gray-500">Quem participou do processo (Solicitação de Compra → Cotação → Ordem de Compra) e quanto cada um tem a receber. <b>Só contam OCs entregues/recebidas</b> — canceladas, rascunhos e pendentes ficam fora. Valores são expectativa: o direito só nasce na apuração final de cada obra.</p>
              </CardHeader>
              <CardContent>
                {ranking.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">Nenhuma movimentação de compras registrada ainda.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-10 px-2">#</TableHead>
                          <TableHead className="min-w-[160px]">Pessoa</TableHead>
                          <TableHead className="text-center px-2">SCs</TableHead>
                          <TableHead className="text-center px-2">Cotações</TableHead>
                          <TableHead className="text-center px-2">OCs entregues</TableHead>
                          <TableHead className="text-center px-2">Obras</TableHead>
                          <TableHead className="text-right px-2">Economia (saldo real)</TableHead>
                          <TableHead className="text-right px-2">Prêmio a receber</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ranking.map((p, i) => (
                          <TableRow key={norm(p.nome)} className={i < 3 && p.premio > 0 ? "bg-yellow-50/60" : ""}>
                            <TableCell className="px-2 text-base">{medalha(i)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 min-w-0">
                                <PersonPhoto src={(rankingCounts as any)?.fotos?.[norm(p.nome)]} alt={p.nome} size="sm" />
                              <div className="min-w-0">
                                <div className="font-medium text-sm truncate">{p.nome}</div>
                                {habilitadosSet.has(norm(p.nome)) ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 text-[9px] px-1 py-0">Habilitado</Badge>
                                ) : pendentesSet.has(norm(p.nome)) ? (
                                  <Badge className="bg-amber-100 text-amber-700 text-[9px] px-1 py-0">Termo pendente</Badge>
                                ) : p.ocs > 0 ? (
                                  <Badge className="bg-red-100 text-red-600 text-[9px] px-1 py-0">Sem termo</Badge>
                                ) : (
                                  <span className="text-[9px] text-gray-400">Apoio no processo</span>
                                )}
                              </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center px-2 tabular-nums">{p.scs || "—"}</TableCell>
                            <TableCell className="text-center px-2 tabular-nums">{p.cotacoes || "—"}</TableCell>
                            <TableCell className="text-center px-2 tabular-nums">{p.ocs || "—"}</TableCell>
                            <TableCell className="text-center px-2 tabular-nums">{p.obras.size || "—"}</TableCell>
                            <TableCell className={`text-right px-2 tabular-nums font-medium ${p.economia > 0 ? "text-emerald-700" : p.economia < 0 ? "text-red-600" : "text-gray-400"}`}>
                              {p.economia !== 0 ? fmt(p.economia) : "—"}
                            </TableCell>
                            <TableCell className="text-right px-2 tabular-nums font-bold text-yellow-700">{p.premio > 0 ? fmt(p.premio) : "—"}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50 font-semibold border-t-2">
                          <TableCell className="px-2" />
                          <TableCell className="text-sm">Total</TableCell>
                          <TableCell className="text-center px-2 tabular-nums">{tot.scs}</TableCell>
                          <TableCell className="text-center px-2 tabular-nums">{tot.cotacoes}</TableCell>
                          <TableCell className="text-center px-2 tabular-nums">{tot.ocs}</TableCell>
                          <TableCell className="text-center px-2" />
                          <TableCell className={`text-right px-2 tabular-nums ${tot.economia >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmt(tot.economia)}</TableCell>
                          <TableCell className="text-right px-2 tabular-nums text-yellow-700">{fmt(tot.premio)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <p className="text-[10px] text-gray-400 mt-2">Economia = meta do orçamento − valor comprado, somando só OCs entregues com preço meta (saldo real: quem estourou aparece negativo, em vermelho). Prêmio = regra vigente (faixas progressivas, gatilho de {gatilhoMin}% por obra), dividido proporcionalmente à economia de cada login e ainda sujeito à nota individual dos KPIs. Quem fez SC/cotação mas não emitiu OC aparece como apoio no processo, sem prêmio próprio.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* ══ ABA: REGRAS ══ */}
        {aba === "regras" && (<>
        {/* Rev. 5104 — Regras da Comissão: documento vivo, versionado, edição só ADM Master + senha */}
        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base flex-wrap">
              <span className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-yellow-600" />
                Regras do Prêmio de Compras (Gratificação)
                {regra && <Badge className="bg-yellow-100 text-yellow-700">Versão {regra.versao} · vigente</Badge>}
              </span>
              <span className="flex items-center gap-2">
                <button className="text-xs text-gray-500 hover:text-gray-800 underline flex items-center gap-1" onClick={() => setVerHistorico(v => !v)}>
                  <History className="h-3.5 w-3.5" /> Histórico
                </button>
                <Button size="sm" variant="outline" onClick={imprimirTermoAdesao}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Termo de Adesão
                </Button>
                {isAdminMaster && (
                  <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700 hover:bg-yellow-50" onClick={() => {
                    setFPct(String(pctConfig)); setFGatilho(String(gatilhoMin)); setFTeto(String(tetoValor)); setFAntec(String(antecMax)); setFTexto(regra?.texto_complementar || ""); setFSenha(""); setFKpis((regrasData?.kpis || []).map((k: any) => ({ ...k }))); setFFaixas(faixas.map((f: PremioFaixa) => ({ ...f }))); setEditRegra(true);
                  }}>
                    <Lock className="h-3.5 w-3.5 mr-1" /> Alterar regras
                  </Button>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                {
                  key: "premio",
                  destaque: true,
                  label: "Prêmio sobre o saving",
                  valor: <>{faixas[0]?.premioPct}% a {pctMax}%<span className="text-xs font-normal text-yellow-700"> escalonado</span></>,
                  explica: `É o percentual da economia da obra que se transforma em prêmio, escalonado por faixas: quanto maior a economia em relação à meta, maior o percentual. Tabela vigente: ${faixasTexto(faixas)}. O modelo é progressivo, como o imposto de renda: cada fatia do saving paga o percentual da própria faixa, sem degraus. O resultado ainda é multiplicado pela nota dos KPIs de cada comprador.`,
                },
                {
                  key: "gatilho",
                  label: "Gatilho mínimo",
                  valor: <>{gatilhoMin}%<span className="text-xs font-normal text-gray-500"> de saving da obra</span></>,
                  explica: `É a economia mínima que a obra precisa alcançar para o prêmio existir. A economia deve ser de pelo menos ${gatilhoMin}% da meta de compras: numa meta de R$ 1.000.000, é preciso economizar ao menos ${fmt(1000000 * gatilhoMin / 100)}. Abaixo disso, a economia é bem-vinda para a obra, mas não gera prêmio.`,
                },
                {
                  key: "teto",
                  label: "Teto por período",
                  valor: <>{tetoValor > 0 ? fmt(tetoValor) : "Sem teto"}</>,
                  explica: tetoValor > 0
                    ? `É o valor máximo de prêmio que pode ser pago no período, independentemente do tamanho da economia. Atualmente está limitado a ${fmt(tetoValor)}.`
                    : `É o valor máximo de prêmio que poderia ser pago no período. Hoje não há limite configurado: passou do gatilho mínimo, quanto maior a economia validada, maior o prêmio.`,
                },
                {
                  key: "antec",
                  label: "Antecipação máx.",
                  valor: <>{antecMax}%<span className="text-xs font-normal text-gray-500"> do provisionado</span></>,
                  explica: `É o máximo que o Administrador Master pode liberar como adiantamento antes do fechamento da obra, em situação excepcional (obra grande, controlada e sem pendências). Limitado a ${antecMax}% do valor provisionado e sempre descontado do acerto final.`,
                },
              ] as { key: string; destaque?: boolean; label: string; valor: React.ReactNode; explica: string }[]).map((ind) => (
                <button
                  key={ind.key}
                  type="button"
                  onClick={() => setIndicadorAberto(indicadorAberto === ind.key ? null : ind.key)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${ind.destaque ? "border-yellow-200 bg-yellow-50" : "border-gray-200 bg-gray-50"} ${indicadorAberto === ind.key ? "ring-2 ring-yellow-300" : ""}`}
                >
                  <p className={`text-[10px] font-bold uppercase flex items-center gap-1 ${ind.destaque ? "text-yellow-600" : "text-gray-500"}`}>
                    {ind.label}
                    <HelpCircle className="h-3 w-3 opacity-60 shrink-0" />
                  </p>
                  <p className={`text-lg font-bold ${ind.destaque ? "text-yellow-800" : "text-gray-800"}`}>{ind.valor}</p>
                  {indicadorAberto === ind.key && (
                    <p className="mt-1 text-[11px] font-normal normal-case text-gray-600 leading-relaxed">{ind.explica}</p>
                  )}
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-700 space-y-1.5 leading-relaxed">
              <div className="rounded-lg border border-yellow-200 bg-yellow-50/60 px-3 py-2">
                <p className="font-bold text-yellow-800">💡 A ideia em uma frase</p>
                <p className="text-gray-700">Se você comprar <span className="font-bold">mais barato que o orçamento da obra</span>, comprando certo (rápido, no prazo, com qualidade e dentro do sistema), uma parte dessa economia <span className="font-bold">vira prêmio em dinheiro pra você</span>. A empresa ganha, você ganha.</p>
              </div>
              <p><span className="font-bold">1. O que é esse dinheiro?</span> É um <span className="font-bold">PRÊMIO</span> por desempenho acima do esperado, um bônus por mérito previsto no art. 457, §2º e §4º da CLT. <span className="font-bold">Não é comissão nem salário</span>: não entra em férias, 13º, FGTS ou rescisão. É um extra que só existe quando você gera economia real.</p>
              <p><span className="font-bold">2. Como a conta é feita? Por OBRA, não por compra, e o percentual é ESCALONADO.</span> Cada obra tem uma <span className="font-bold">meta de compras</span>, que é o preço previsto no orçamento. No fim, soma-se tudo o que foi comprado em OCs entregues. <span className="font-bold">Sobrou dinheiro? Essa sobra é o "saving"</span>, e ela vira prêmio por faixas: quanto maior a economia em relação à meta, maior o percentual que cada fatia paga.
                <span className="block mt-1">
                  <span className="block rounded-lg border border-gray-200 overflow-hidden">
                    <span className="grid grid-cols-2 bg-gray-100 text-[10px] font-bold uppercase text-gray-500">
                      <span className="px-2 py-1">Economia da obra (% da meta)</span>
                      <span className="px-2 py-1 text-right">Prêmio dessa fatia do saving</span>
                    </span>
                    {faixas.map((f: PremioFaixa, i: number) => (
                      <span key={i} className="grid grid-cols-2 border-t border-gray-100 text-gray-700">
                        <span className="px-2 py-1">{faixaLabel(faixas, i)}</span>
                        <span className="px-2 py-1 text-right font-bold text-yellow-700">{String(f.premioPct).replace(".", ",")}%</span>
                      </span>
                    ))}
                  </span>
                </span>
                <span className="block mt-1 text-gray-600 bg-gray-50 rounded px-2 py-1">{(() => {
                  const META_EX = 1000000, SAVING_EX = 60000, ECO_EX = 6;
                  const premioEx = calcPremioProgressivo(SAVING_EX, META_EX, faixas, gatilhoMin).premio;
                  if (faixas.length <= 1) {
                    return (<><span className="font-semibold">📌 Exemplo:</span> hoje a regra vigente tem faixa única de {String(faixas[0]?.premioPct ?? 0).replace(".", ",")}%. Numa meta de R$ 1.000.000 com saving de R$ 60.000 (6% de economia), o prêmio da obra é <span className="font-bold">{fmt(premioEx)}</span>, a dividir entre os compradores e multiplicar pela nota dos KPIs.</>);
                  }
                  const fatias: string[] = [];
                  let anterior = 0;
                  for (const f of faixas) {
                    const limite = f.atePct === null ? ECO_EX : Math.min(f.atePct, ECO_EX);
                    if (limite <= anterior) { if (f.atePct !== null && f.atePct < ECO_EX) { anterior = f.atePct; } continue; }
                    const valorFatia = ((limite - anterior) / 100) * META_EX;
                    fatias.push(`a fatia de ${String(anterior).replace(".", ",")}% a ${String(limite).replace(".", ",")}% da meta (${fmt(valorFatia)}) paga ${String(f.premioPct).replace(".", ",")}%`);
                    anterior = limite;
                    if (limite >= ECO_EX) break;
                  }
                  return (<><span className="font-semibold">📌 Como funciona o progressivo:</span> a conta é como a do imposto de renda, por fatias. Numa meta de R$ 1.000.000 com saving de R$ 60.000 (6% de economia): {fatias.join("; ")}. Prêmio da obra = <span className="font-bold">{fmt(premioEx)}</span>, a dividir entre os compradores e multiplicar pela nota dos KPIs. Sem degraus: economizar R$ 1 a mais nunca diminui o prêmio.</>);
                })()}</span>
                <span className="block mt-1 text-gray-600"><span className="font-semibold">⚠️ Atenção:</span> a conta é do TOTAL da obra. Se a obra estourou o orçamento, não há prêmio nela, mesmo que algumas compras isoladas tenham sido baratas. E OCs sem preço meta ficam fora da conta até a meta ser cadastrada.</span></p>
              <p><span className="font-bold">2.1. De quem é o crédito? Do LOGIN que emitiu a OC.</span> Cada compra conta para quem a emitiu no sistema, inclusive quando você cobre outra obra como suplente. O prêmio da obra é um "bolo" dividido <span className="font-bold">na proporção da economia que cada um gerou</span>.
                <span className="block mt-1 text-gray-600 bg-gray-50 rounded px-2 py-1"><span className="font-semibold">📌 Exemplo:</span> com um prêmio de obra de R$ 5.000, se João economizou R$ 45.000 e Maria R$ 5.000, João leva 90% (R$ 4.500) e Maria 10% (R$ 500).</span>
                <span className="block mt-1 text-gray-600"><span className="font-semibold">⚠️ E quem estourou?</span> Quem comprou acima da meta nas suas OCs <span className="font-bold">diminui o bolo de todos</span>, porque o estouro reduz o saving da obra; participa com 0% da divisão e ainda responde pelos próprios KPIs. Ou seja: estourar prejudica você e o time.</span></p>
              <div className="rounded-lg border border-gray-200 overflow-hidden my-1">
                <div className="bg-gray-50 px-3 py-1.5 text-[11px] font-bold text-gray-700 flex items-center justify-between">
                  <span>Scorecard de KPIs: o atingimento ponderado multiplica o prêmio</span>
                  <span className="text-gray-400 font-normal">soma = {(regrasData?.kpis || []).reduce((s: number, k: any) => s + Number(k.peso), 0)}%</span>
                </div>
                <div>
                  {(regrasData?.kpis || []).map((k: any) => (
                    <div key={k.chave} className="border-t border-gray-100 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-gray-800">{k.label}</p>
                          <p className="text-gray-500">{k.como}</p>
                        </div>
                        <span className="text-right whitespace-nowrap">
                          <span className="font-bold text-yellow-700 text-sm">{Number(k.peso)}%</span>
                          <span className="block text-[10px] text-gray-400">= até {(pctConfig * Number(k.peso) / 100).toFixed(2).replace(".", ",")}% do saving</span>
                        </span>
                      </div>
                      {k.formula && (
                        <p className="mt-1"><span className="font-semibold text-gray-600">Fórmula:</span> <span className="text-gray-600">{k.formula}</span></p>
                      )}
                      {(k.regua || []).length > 0 && (
                        <div className="mt-1">
                          <p className="font-semibold text-gray-600">Régua de pontuação:</p>
                          <ul className="list-disc pl-4 text-gray-600 space-y-0.5">
                            {(k.regua || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {k.fonte && (
                        <p className="mt-1 text-gray-400"><span className="font-semibold">Fonte da medição:</span> {k.fonte}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="bg-yellow-50 px-3 py-1.5 text-[10px] text-yellow-700 border-t border-yellow-100">
                  <span className="font-bold">Como o scorecard multiplica o prêmio:</span> primeiro calcula-se o prêmio potencial da obra pelas faixas escalonadas (regra 2); depois cada KPI é pontuado de 0 a 100% no fechamento da obra. A nota final é a soma de atingimento × peso, e o prêmio pago é o prêmio potencial × nota final. Uma nota de 85% sobre um potencial de R$ 10.000 resulta em R$ 8.500. Receber o valor cheio exige excelência nos 5 indicadores.
                </div>
              </div>
              <p><span className="font-bold">3. Tem um mínimo pra valer (gatilho){tetoValor > 0 ? " e um máximo (teto)" : ", e sem limite máximo"}:</span> a economia da obra precisa ser de pelo menos <span className="font-bold">{gatilhoMin}% da meta</span> para destravar o prêmio{tetoValor > 0 ? `, e o prêmio do período fica limitado a ${fmt(tetoValor)}` : ". Passou do gatilho, não há teto: quanto mais economia validada, maior o prêmio"}.
                <span className="block mt-1 text-gray-600 bg-gray-50 rounded px-2 py-1"><span className="font-semibold">📌 Exemplo:</span> numa meta de R$ 1.000.000 com gatilho de {gatilhoMin}%, a economia precisa chegar a {fmt(1000000 * gatilhoMin / 100)} para haver prêmio. Economizou só R$ 10.000? Bom pra obra, mas ainda não destrava o prêmio.</span>
                <span className="block mt-1 text-gray-600"><span className="font-semibold">⚠️ Preço sem qualidade não conta:</span> material devolvido ou trocado sai da base de cálculo. Comprar barato sem qualidade não gera prêmio.</span></p>
              <p><span className="font-bold">4. Quando cai o dinheiro? 30 dias úteis após a LIBERAÇÃO DA RETENÇÃO FINAL da obra.</span> Durante a execução você acompanha o valor provisionado nesta tela, mas ele é <span className="font-bold">expectativa, não dinheiro garantido</span>: a obra precisa "respirar" até o fim, pois uma compra estourada no final pode mudar a conta. A régua do pagamento é esta:
                <span className="block mt-1 text-gray-600 bg-gray-50 rounded px-2 py-1">
                  <span className="font-semibold">📅 Linha do tempo do pagamento:</span><br/>
                  <span className="font-semibold">1º</span> A obra termina e é encerrada.<br/>
                  <span className="font-semibold">2º</span> Apuramento final: entrega de todas as pendências, aceite final do cliente e validação do saving e das notas de KPI de cada comprador.<br/>
                  <span className="font-semibold">3º</span> O cliente libera a <span className="font-bold">retenção final da obra</span>, normalmente <span className="font-bold">5% do valor total</span>, que ele segura como garantia até zerar todas as pendências.<br/>
                  <span className="font-semibold">4º</span> Pagamento em <span className="font-bold">até 30 dias úteis</span> após essa liberação.
                </span>
                <span className="block mt-1 text-gray-600"><span className="font-semibold">⚠️ Importante:</span> o marco do pagamento é a <span className="font-bold">liberação da retenção final</span>, que é quando a obra realmente encerra todas as pendências e o dinheiro entra no caixa. Liberou a retenção, contam-se 30 dias úteis e o prêmio é pago. O valor de cada um sai <span className="font-bold">proporcional à economia que cada login gerou</span> (regra 2.1), multiplicado pela nota individual dos KPIs.</span>
                <span className="block mt-1 text-gray-600 bg-gray-50 rounded px-2 py-1"><span className="font-semibold">📌 Pense assim:</span> é como uma colheita. Você planta a economia o ano todo, mas só colhe quando a safra fecha e o cliente libera a retenção. O painel mostra o tamanho da plantação, não o dinheiro no bolso.</span>
                <span className="block mt-1">Para participar é obrigatório o <span className="font-bold">Termo de Adesão assinado</span> — está na aba <button type="button" className="font-bold underline" onClick={() => setAba("termo")}>Termo de Adesão</button>.</span></p>
              <p><span className="font-bold">5. Dá pra adiantar uma parte?</span> Dá, em situação excepcional: em obra grande, controlada e sem pendências, o Administrador Master pode liberar <span className="font-bold">até {antecMax}% do valor provisionado</span>, mediante senha dele. O adiantamento é descontado do acerto final; se a apuração final vier menor, a diferença é compensada.</p>
              <p><span className="font-bold">6. E se eu sair da empresa?</span> <span className="font-bold">Justa causa: perde tudo</span> que ainda não foi pago. Pedido de demissão ou dispensa sem justa causa: você recebe <span className="font-bold">só o que já estava apurado e validado</span> até a data da saída, pago no ciclo normal de fechamento da obra. Obra ainda em andamento é expectativa e não entra.
                <span className="block mt-1 text-gray-600 bg-gray-50 rounded px-2 py-1"><span className="font-semibold">📌 Exemplo:</span> a Obra A fechou com R$ 3.000 apurados pra você e a Obra B está na metade com R$ 5.000 provisionados. Saindo hoje sem justa causa, você recebe os R$ 3.000 da Obra A no ciclo normal; os R$ 5.000 da Obra B não são devidos, pois ainda eram expectativa.</span>
                <span className="block mt-1 text-gray-500">(Formato alinhado à jurisprudência do TST: perda total fora da justa causa é inválida; condicionar ao apurado é lícito.)</span></p>
              {regra?.texto_complementar && (
                <p className="pt-1 border-t border-gray-100"><span className="font-bold">Disposições complementares:</span> {regra.texto_complementar}</p>
              )}
            </div>
            {verHistorico && (
              <div className="border-t border-gray-100 pt-2 space-y-1">
                {(regrasData?.historico || []).map((h: any) => (
                  <div key={h.id} className="text-[11px] text-gray-500 flex flex-wrap gap-x-2">
                    <span className="font-bold text-gray-700">v{h.versao}</span>
                    <span>{Number(h.percentual)}% · gatilho {Number(h.gatilho_min_pct)}% · teto {Number(h.teto_valor) > 0 ? fmt(Number(h.teto_valor)) : "—"} · antecipação {Number(h.antecipacao_max_pct)}%</span>
                    <span>por {h.criado_por_nome}</span>
                    <span>{new Date(h.created_at).toLocaleDateString("pt-BR")}</span>
                    {Number(h.vigente) === 1 ? <Badge className="bg-emerald-100 text-emerald-700 h-4 text-[9px]">vigente</Badge> : <span className="text-gray-400">encerrada</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </>)}

        {/* ══ ABA: VISÃO GERAL ══ */}
        {aba === "visao" && (<>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="group relative">
            <Card className="border-green-200 bg-green-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="h-7 w-7 text-green-600 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-green-700">{fmt(totalCompradoOCs)}</p>
                    <p className="text-xs text-green-600">Total Comprado ({ocs.length} OCs)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">Total Comprado</div>
              <div>Soma do valor total de todas as Ordens de Compra (OCs) emitidas{obraFiltro !== "todas" ? " para esta obra" : ""}. Inclui apenas OCs com status ativo (exclui canceladas).</div>
            </div>
          </div>
          <div className="group relative">
            <Card className="border-emerald-200 bg-emerald-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <TrendingDown className="h-7 w-7 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-emerald-700">{fmt(economiaObras)}</p>
                    <p className="text-xs text-emerald-600">Saldo Positivo (por Obra)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">Saldo Positivo por Obra</div>
              <div>Calculado por obra: Meta Total da Obra - Total Comprado na Obra. Se uma OC economizou mas outra estourou, o estouro reduz o saldo. Somente obras com saldo positivo geram prêmio. Economias isoladas por OC nao contam se a obra estourar no total.</div>
            </div>
          </div>
          <div className="group relative">
            <Card className="border-yellow-200 bg-yellow-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-7 w-7 text-yellow-600 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-yellow-700">{fmt(comissaoPotencial)}</p>
                    <p className="text-xs text-yellow-600">Prêmio Potencial (escalonado)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">Prêmio Potencial</div>
              <div>Prêmio escalonado e progressivo por faixas de economia: cada fatia do saving paga o percentual da sua faixa (de {faixas[0]?.premioPct}% a {pctMax}%). Representa o valor que pode ser pago como prêmio (gratificação) ao comprador pela negociação abaixo do preço meta do orçamento.</div>
            </div>
          </div>
          <div className="group relative">
            <Card className="border-orange-200 bg-orange-50 cursor-help">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-7 w-7 text-orange-500 shrink-0" />
                  <div>
                    <p className="text-lg font-bold text-orange-700">{ocsSemlMeta.length}</p>
                    <p className="text-xs text-orange-600">OCs sem Preco Meta</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-900" />
              <div className="font-semibold mb-1">OCs sem Preco Meta</div>
              <div>Ordens de Compra cujos itens nao possuem preco meta do orcamento vinculado. Sem preco meta, nao e possivel calcular economia nem prêmio. Ideal: zero — todas as OCs devem ter referencia de preco meta.</div>
            </div>
          </div>
        </div>

        {obrasComOC.length > 1 && obraFiltro === "todas" && (
          <Card className="border-yellow-100">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-yellow-600" />
                Ranking por Obra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {obrasComOC.map(obraId => {
                  const ocsObra = ocsAll.filter((oc: any) => String(oc.obraId) === obraId);
                  const infoObra = obraSaldoMap[obraId];
                  const saldoObra = infoObra?.saldo ?? 0;
                  const comObra = obraGeraComissao(obraId) ? premioObra(saldoObra, infoObra?.totalMeta ?? 0) : 0;
                  const semMetaObra = ocsObra.filter((oc: any) => !oc.temMeta).length;
                  return (
                    <React.Fragment key={obraId}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-100 hover:border-yellow-300 hover:bg-yellow-50/50 cursor-pointer transition-colors"
                      onClick={() => setObraFiltro(obraId)}
                    >
                      <Building2 className="h-5 w-5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 truncate">{obraMap[obraId] || `Obra ${obraId}`}</div>
                        <div className="text-[10px] text-gray-400">{ocsObra.length} OC(s){semMetaObra > 0 ? ` · ${semMetaObra} sem meta` : ""}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-gray-600">Meta: <span className="font-semibold">{fmt(infoObra?.totalMeta ?? 0)}</span></div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-gray-600">Comprado: <span className="font-semibold">{fmt(infoObra?.totalComprado ?? 0)}</span></div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-xs ${saldoObra >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          Saldo: <span className="font-semibold">{fmt(saldoObra)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-yellow-700">Prêmio: <span className="font-bold">{fmt(comObra)}</span></div>
                      </div>
                    </div>
                    {comObra > 0 && (() => {
                      // Divisão por login: participação proporcional à economia gerada por cada comprador
                      const porComprador: Record<string, { nome: string; economia: number; comprado: number }> = {};
                      for (const oc of ocsObra) {
                        if (!oc.temMeta) continue;
                        const nome = oc.compradorNome || "Sem login registrado";
                        if (!porComprador[nome]) porComprador[nome] = { nome, economia: 0, comprado: 0 };
                        porComprador[nome].economia += oc.economia || 0;
                        porComprador[nome].comprado += oc.valorComprado || 0;
                      }
                      const lista = Object.values(porComprador);
                      const somaPositiva = lista.reduce((s, c) => s + Math.max(0, c.economia), 0);
                      const somaComprado = lista.reduce((s, c) => s + c.comprado, 0);
                      const share = (c: any) => somaPositiva > 0 ? Math.max(0, c.economia) / somaPositiva : (somaComprado > 0 ? c.comprado / somaComprado : 0);
                      return (
                        <div className="ml-9 mb-2 -mt-1 rounded-b-lg border border-t-0 border-yellow-100 bg-yellow-50/40 px-3 py-1.5">
                          <p className="text-[10px] font-bold text-yellow-700 mb-0.5">Divisão do prêmio por comprador (login)</p>
                          {lista.sort((a, b) => share(b) - share(a)).map(c => (
                            <div key={c.nome} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
                              <span className="text-gray-700 flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{c.nome}</span>
                                {habilitadosSet.has(String(c.nome).trim().toUpperCase()) ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 text-[9px] px-1 py-0 shrink-0">Habilitado</Badge>
                                ) : pendentesSet.has(String(c.nome).trim().toUpperCase()) ? (
                                  <Badge className="bg-amber-100 text-amber-700 text-[9px] px-1 py-0 shrink-0">Termo pendente</Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-600 text-[9px] px-1 py-0 shrink-0">Sem termo</Badge>
                                )}
                              </span>
                              <span className="text-gray-500">economia {fmt(Math.max(0, c.economia))}{c.economia < 0 ? ` (estourou ${fmt(-c.economia)})` : ""}</span>
                              <span className="font-semibold text-gray-700">{(share(c) * 100).toFixed(1)}%</span>
                              <span className="font-bold text-yellow-700">{fmt(comObra * share(c))}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </React.Fragment>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5" />
              Ordens de Compra — Analise de Economia
              {obraFiltro !== "todas" && (
                <span className="text-xs font-normal text-gray-500 ml-2">({obraMap[obraFiltro] || `Obra ${obraFiltro}`})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : ocs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Nenhuma ordem de compra encontrada{obraFiltro !== "todas" ? " para esta obra" : ""}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OC</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-right">Valor Meta</TableHead>
                    <TableHead className="text-right">Valor Comprado</TableHead>
                    <TableHead className="text-right">Dif. Item</TableHead>
                    <TableHead className="text-right">Saldo Obra</TableHead>
                    <TableHead className="text-right">Prêmio (escalonado)</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ocs.map((oc: any) => {
                    const st = OC_STATUS[oc.status] || { label: oc.status, cls: "bg-gray-100 text-gray-600" };
                    const obraKey = String(oc.obraId);
                    const saldoObra = obraSaldoMap[obraKey]?.saldo ?? 0;
                    const obraPositiva = saldoObra > 0;
                    return (
                      <TableRow key={oc.id}>
                        <TableCell className="font-mono text-xs font-medium">{formatNumeroOcDisplay(oc.numeroOc)}</TableCell>
                        <TableCell>{oc.fornecedorNome || "—"}</TableCell>
                        <TableCell>{obraMap[obraKey] || "Obra " + oc.obraId}</TableCell>
                        <TableCell className="text-right">
                          {oc.temMeta ? (
                            <span className="font-medium">{fmt(oc.valorMeta)}</span>
                          ) : (
                            <span className="text-orange-500 text-xs">Sem meta</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{fmt(oc.valorComprado)}</TableCell>
                        <TableCell className="text-right">
                          {oc.temMeta ? (
                            <span className={`font-medium ${oc.economia > 0 ? "text-green-700" : oc.economia < 0 ? "text-red-600" : "text-gray-500"}`}>
                              {fmt(oc.economia)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {oc.temMeta ? (
                            <span className={`text-xs font-medium ${saldoObra > 0 ? "text-emerald-600" : saldoObra < 0 ? "text-red-600" : "text-gray-500"}`}>
                              {fmt(saldoObra)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!oc.temMeta ? (
                            <span className="text-gray-400">—</span>
                          ) : !obraPositiva ? (
                            <span className="text-red-400 text-xs">Obra c/ deficit</span>
                          ) : (
                            <span className="text-yellow-600 text-xs">Ver saldo obra</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={st.cls}>{st.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {comissoesFiltradas.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Award className="h-5 w-5" />
                Prêmios Formalizados
                {obraFiltro !== "todas" && (
                  <span className="text-xs font-normal text-gray-500 ml-2">({obraMap[obraFiltro] || `Obra ${obraFiltro}`})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-right">Meta</TableHead>
                    <TableHead className="text-right">Comprado</TableHead>
                    <TableHead className="text-right">Economia</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-right">Prêmio</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoesFiltradas.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.compradorNome || "—"}</TableCell>
                      <TableCell>{c.obraNome || obraMap[String(c.obraId)] || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.valorMetaTotal || 0))}</TableCell>
                      <TableCell className="text-right">{fmt(Number(c.valorCompradoTotal || 0))}</TableCell>
                      <TableCell className="text-right font-medium text-green-700">{fmt(Number(c.economiaTotal || 0))}</TableCell>
                      <TableCell className="text-center">{Number(c.percentualParticipacao || 0).toFixed(0)}%</TableCell>
                      <TableCell className="text-right font-bold text-yellow-700">{fmt(Number(c.valorComissao || 0))}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).cls}>
                          {(STATUS_CFG[c.status] || STATUS_CFG.em_aberto).label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Rev. 5104 — Antecipações liberadas pelo ADM Master */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base flex-wrap">
              <span className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-emerald-600" /> Antecipações Liberadas</span>
              {isAdminMaster && (
                <Button size="sm" variant="outline" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50" onClick={() => { setAObra(""); setAComprador(""); setAValor(""); setAObs(""); setASenha(""); setAnteciparOpen(true); }}>
                  <Lock className="h-3.5 w-3.5 mr-1" /> Liberar antecipação
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(antecipacoes || []).length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nenhuma antecipação registrada. Regra: até {antecMax}% do provisionado, só em obra saudável, liberada pelo Administrador Master com senha.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Comprador</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Observação</TableHead>
                    <TableHead>Liberada por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(antecipacoes || []).map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{new Date(a.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="font-medium">{a.comprador_nome}</TableCell>
                      <TableCell>{obraMap[String(a.obra_id)] || `Obra ${a.obra_id}`}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">{fmt(Number(a.valor))}</TableCell>
                      <TableCell className="text-xs text-gray-500 max-w-[240px] break-words">{a.observacao || "—"}</TableCell>
                      <TableCell className="text-xs">{a.criado_por_nome}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700">
            <span className="font-bold">Como funciona:</span> O prêmio é calculado sobre o <span className="font-bold">saldo global da obra</span> (Meta Total − Total Comprado), respeitando gatilho mínimo de {gatilhoMin}% e {tetoValor > 0 ? `teto de ${fmt(tetoValor)}` : "sem teto"}. Se um item economizou mas a obra estourou no geral, o prêmio é reduzido ou zerado. As regras completas estão na aba <button type="button" className="font-bold underline" onClick={() => setAba("regras")}>Regras do Prêmio</button>. Alterações só pelo Administrador Master, com senha, e ficam no histórico. OCs "Sem meta" não entram no cálculo até que o preço meta seja definido.
          </p>
        </div>
        </>)}

        {/* Dialog — Alterar regras (ADM Master + senha) */}
        <Dialog open={editRegra} onOpenChange={setEditRegra}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Scale className="h-5 w-5 text-yellow-600" /> Alterar Regras do Prêmio</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Prêmio sobre o saving (%)</label>
                  <Input type="number" inputMode="decimal" min={0} max={100} value={fPct} onChange={e => setFPct(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Gatilho mínimo de saving (%)</label>
                  <Input type="number" inputMode="decimal" min={0} max={100} value={fGatilho} onChange={e => setFGatilho(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Teto (R$; 0 = sem teto)</label>
                  <Input type="number" inputMode="decimal" min={0} value={fTeto} onChange={e => setFTeto(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Antecipação máxima (%)</label>
                  <Input type="number" inputMode="decimal" min={0} max={100} value={fAntec} onChange={e => setFAntec(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Faixas do prêmio escalonado (progressivo por fatia de economia)</label>
                <div className="space-y-1 mt-1">
                  {fFaixas.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24">{i === fFaixas.length - 1 ? "Acima de" : i === 0 ? "Economia até" : "De " + (fFaixas[i - 1].atePct ?? 0) + "% até"}</span>
                      {i === fFaixas.length - 1 ? (
                        <span className="w-20 h-8 flex items-center justify-end text-xs text-gray-500 pr-2">{fFaixas[i - 1]?.atePct ?? 0}%</span>
                      ) : (
                        <Input type="number" inputMode="decimal" min={0.1} max={100} step={0.1} className="w-20 h-8 text-right" value={f.atePct === null ? "" : String(f.atePct)}
                          onChange={e => setFFaixas(arr => arr.map((x, j) => j === i ? { ...x, atePct: e.target.value === "" ? null : parseFloat(e.target.value) || 0 } : x))} />
                      )}
                      <span className="text-xs text-gray-400">de economia →</span>
                      <Input type="number" inputMode="decimal" min={0} max={100} step={0.5} className="w-20 h-8 text-right" value={String(f.premioPct)}
                        onChange={e => setFFaixas(arr => arr.map((x, j) => j === i ? { ...x, premioPct: parseFloat(e.target.value || "0") || 0 } : x))} />
                      <span className="text-xs text-gray-400">% de prêmio</span>
                      {fFaixas.length > 2 && i < fFaixas.length - 1 && (
                        <button type="button" className="text-red-400 text-xs" onClick={() => setFFaixas(arr => arr.filter((_, j) => j !== i))}>remover</button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setFFaixas(arr => {
                        const ult = arr[arr.length - 1];
                        const anterior = arr[arr.length - 2];
                        const novoLimite = (anterior?.atePct ?? 0) + 5;
                        return [...arr.slice(0, -1), { atePct: novoLimite, premioPct: anterior?.premioPct ?? 0 }, ult];
                      })}>+ Adicionar faixa</Button>
                    <p className="text-[10px] text-gray-400">Limites devem ser crescentes; a última faixa é sempre "acima de".</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Pesos do Scorecard de KPIs (soma deve dar 100%)</label>
                <div className="space-y-1 mt-1">
                  {fKpis.map((k, i) => (
                    <div key={k.chave} className="flex items-center gap-2">
                      <span className="flex-1 text-xs text-gray-700">{k.label}</span>
                      <Input type="number" inputMode="decimal" min={0} max={100} className="w-20 h-8 text-right" value={String(k.peso)}
                        onChange={e => setFKpis(arr => arr.map((x, j) => j === i ? { ...x, peso: parseFloat(e.target.value || "0") || 0 } : x))} />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  ))}
                  {(() => { const soma = fKpis.reduce((s, k) => s + k.peso, 0); return (
                    <p className={`text-[10px] font-bold ${Math.abs(soma - 100) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>Soma: {soma}% {Math.abs(soma - 100) < 0.01 ? "✓" : "— precisa dar 100%"}</p>
                  ); })()}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Disposições complementares (opcional)</label>
                <Textarea rows={3} value={fTexto} onChange={e => setFTexto(e.target.value)} placeholder="Regras adicionais específicas da empresa…" />
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <label className="text-xs font-bold text-amber-700 flex items-center gap-1"><Lock className="h-3 w-3" /> Senha do Administrador Master</label>
                <Input type="password" value={fSenha} onChange={e => setFSenha(e.target.value)} placeholder="Obrigatória para salvar" className="mt-1 bg-white" />
                <p className="text-[10px] text-amber-600 mt-1">A alteração cria uma nova versão das regras — o histórico anterior é preservado e os cálculos passados não mudam.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditRegra(false)}>Cancelar</Button>
                <Button
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  disabled={salvarRegraMut.isPending || !fSenha || Math.abs(fKpis.reduce((s, k) => s + k.peso, 0) - 100) > 0.01}
                  onClick={() => salvarRegraMut.mutate({
                    companyId, senhaMaster: fSenha,
                    percentual: parseFloat(fPct || "0") || 0,
                    gatilhoMinPct: parseFloat(fGatilho || "0") || 0,
                    tetoValor: parseFloat(fTeto || "0") || 0,
                    antecipacaoMaxPct: parseFloat(fAntec || "0") || 0,
                    textoComplementar: fTexto,
                    kpis: fKpis.map((k: any) => ({ chave: k.chave, label: k.label, peso: k.peso, como: k.como || "", formula: k.formula || "", regua: k.regua || [], fonte: k.fonte || "" })),
                    faixas: fFaixas.map(f => ({ atePct: f.atePct, premioPct: f.premioPct })),
                  })}
                >
                  {salvarRegraMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar nova versão"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog — Liberar antecipação (ADM Master + senha) */}
        <Dialog open={anteciparOpen} onOpenChange={setAnteciparOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><HandCoins className="h-5 w-5 text-emerald-600" /> Liberar Antecipação de Prêmio</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Obra</label>
                <select className="w-full h-9 px-3 text-sm rounded-lg border border-gray-300 bg-white" value={aObra} onChange={e => setAObra(e.target.value)}>
                  <option value="">Selecione…</option>
                  {(obras ?? []).map((o: any) => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
                </select>
                {aObra && (obraSaldoMap[aObra]?.saldo ?? 0) <= 0 && (
                  <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Atenção: esta obra está SEM saldo positivo — antecipar aqui foge da regra de obra saudável.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Comprador</label>
                <Input value={aComprador} onChange={e => setAComprador(e.target.value)} placeholder="Nome do comprador" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Valor (R$)</label>
                <Input type="number" inputMode="decimal" min={0} value={aValor} onChange={e => setAValor(e.target.value)} />
                {aObra && obraGeraComissao(aObra) && (
                  <p className="text-[10px] text-gray-500 mt-1">Provisionado da obra: {fmt(premioObra(obraSaldoMap[aObra].saldo, obraSaldoMap[aObra].totalMeta))} · limite {antecMax}% = {fmt(premioObra(obraSaldoMap[aObra].saldo, obraSaldoMap[aObra].totalMeta) * (antecMax / 100))}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Observação</label>
                <Textarea rows={2} value={aObs} onChange={e => setAObs(e.target.value)} placeholder="Justificativa (obra controlada, medições em dia…)" />
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <label className="text-xs font-bold text-amber-700 flex items-center gap-1"><Lock className="h-3 w-3" /> Senha do Administrador Master</label>
                <Input type="password" value={aSenha} onChange={e => setASenha(e.target.value)} placeholder="Obrigatória" className="mt-1 bg-white" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAnteciparOpen(false)}>Cancelar</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={anteciparMut.isPending || !aSenha || !aObra || !aComprador || !(parseFloat(aValor || "0") > 0)}
                  onClick={() => anteciparMut.mutate({ companyId, senhaMaster: aSenha, obraId: Number(aObra), compradorNome: aComprador, valor: parseFloat(aValor), observacao: aObs })}
                >
                  {anteciparMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Liberar antecipação"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
