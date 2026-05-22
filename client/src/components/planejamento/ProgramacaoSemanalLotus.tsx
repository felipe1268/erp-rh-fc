import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileSpreadsheet, Printer, ChevronLeft, ChevronRight, AlertTriangle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseCalendarioJson, ehDiaUtil, diasUteisEntre, fracaoDecorridaMs, pvPonderadoPorAtividade, type CalendarioMSProject } from "@shared/diasUteis";

// Rev. 1663 — Threshold de aderência semanal (PPC do Last Planner System).
// PMBOK 7ª usa SPI ≥ 0,95 como "no prazo". Mantemos a convenção: ≥95% verde,
// <95% vermelho. Ajuste pontual aqui se o cliente pedir tolerância diferente.
const ADERENCIA_THRESHOLD = 95;

interface Atividade {
  id: number;
  eapCodigo?: string | null;
  nome: string;
  nivel?: number | null;
  isGrupo?: boolean | null;
  // Rev. 1681 — necessários para alinhar o universo de folhas com o
  // PlanejamentoDetalhe (`!isGrupo && !disabled && !isIndireta`),
  // garantindo paridade absoluta no Σ acumulado.
  isIndireta?: boolean | null;
  disabled?: boolean | null;
  dataInicio?: string | null;
  dataFim?: string | null;
  dataInicioReal?: string | null;
  dataFimReal?: string | null;
  // Rev. 1875 — JSON string com array de datas YYYY-MM-DD em que o engenheiro
  // marcou sáb/dom como TRABALHADO só para esta atividade (override granular).
  diasTrabalhadosExtras?: string | null;
  pesoFinanceiro?: string | number | null;
  responsavelLotus?: string | null;
  // Rev. 1817 — Override bruto enviado pelo servidor.
  isExterna?: boolean | null;
  externaResponsavel?: string | null;
  // Responsável resolvido (override → contrato terceiro → FC).
  // FONTE ÚNICA: usado pelo input.defaultValue como label curto.
  responsavel?: {
    tipo: "manual" | "externa" | "contrato_terceiro" | "fc";
    label: string;
    labelCurto: string;
    fonteRef: { contratoId?: number; contratoNumero?: string | null; empresaTerceiraId?: number; cnpj?: string | null } | null;
  } | null;
}

interface Props {
  projetoId: number;
  revisaoId: number;
  companyId: number;
  nomeProjeto: string;
  nomeCliente: string;
  atividades: Atividade[];
  semanas: { numero: number; ini: Date; fim: Date }[];
  semanaIdx: number;
  onSemanaChange: (idx: number) => void;
  gerenciadoraNome?: string | null;
  gerenciadoraLogoUrl?: string | null;
  clienteLogoUrl?: string | null;
  engenheiroResponsavel?: string | null;
  calendarioJson?: string | null;
  /** Data de início efetiva do projeto (YYYY-MM-DD). A primeira semana
   *  começa nessa data ao invés de seguir o cutoff, evitando mostrar
   *  dias anteriores ao início real do projeto. */
  projetoStart?: string | null;
  /** Data de término contratual do projeto (YYYY-MM-DD). Necessária para
   *  calcular `pvMacro` (snapshot Texto11/MSP) — fonte oficial do PV
   *  acumulado, garantindo paridade com o Avanço Físico Semanal. */
  projetoFinish?: string | null;
  /** Cutoff oficial do projeto (ISO com hora). Quando o cutoff cai DENTRO
   *  da janela visível (semIni ≤ cutoff < semFim), o ACUMULADO ATÉ é
   *  capeado nele (mesma regra de `refFimAcum` do PlanejamentoDetalhe
   *  ~L5103) — paridade absoluta com cards do Avanço Físico Semanal. */
  cutoffIso?: string | null;
  /** Rev. 1683 — No Portal do Cliente o `trpc.planejamento.listarAvancos`
   *  não está disponível (companyId=0, sem auth interna). Quando esta prop
   *  é fornecida, ela substitui a query e alimenta `avancosPorAtv`/
   *  `temAvSemPorAtv` exatamente com os mesmos campos
   *  (atividadeId, semana, percentualAcumulado, percentualSemanal). */
  avancosOverride?: Array<{
    atividadeId: number;
    semana: string;
    percentualAcumulado: number | string;
    percentualSemanal: number | string;
  }> | null;
}

// Programação LOTUS exibe os 7 dias da semana (seg→dom). Sáb/dom ficam
// VAZIOS automaticamente quando o cronograma não tem atividade prevista
// nesses dias — o preenchimento é dirigido pelas datas previstas/reais
// de cada atividade (corCelula). Se o cronograma for atualizado e passar
// a ter atividade em fim de semana, a célula passa a pintar sozinha.
const DIAS_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
// Indexado por Date.getDay() (0=dom, 1=seg, ..., 6=sáb).
const DIAS_ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function abrevDia(d: Date): string { return DIAS_ABREV[d.getDay()]; }

// Rev. 1926 — Mapa dia-da-semana → coluna do template Excel (cabeçalho FIXO
// do cliente: J=Segunda, K=Terça, L=Quarta, M=Quinta, N=Sexta, O=Sábado,
// P=Domingo). Usado pelo handleExportExcel pra alinhar cada data à coluna
// correta independente da ordem do array `dias` (semanas Fri→Thu, Sat→Fri,
// etc.). Sun(0)→16, Mon(1)→10, Tue(2)→11, Wed(3)→12, Thu(4)→13, Fri(5)→14,
// Sat(6)→15.
function dowToExcelCol(dow: number): number {
  return dow === 0 ? 16 : 9 + dow;
}
const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtBR(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function fmtDiaMes(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${MESES_ABREV[d.getMonth()]}`;
}
function dateStr(d: Date) {
  return d.toISOString().split("T")[0];
}
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function diasDaSemana(ini: Date, fim: Date): Date[] {
  // Respeita exatamente a janela definida pelo cutoff do projeto (Padrão FC).
  // Se o cutoff for Qui, a semana vai de Sex→Qui. Se for outro dia, ajusta sozinho.
  const arr: Date[] = [];
  const start = new Date(ini); start.setHours(0, 0, 0, 0);
  const end = new Date(fim); end.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    arr.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
}

/**
 * Calcula DUAS faixas empilhadas (modelo LOTUS): a faixa superior representa
 * o PREVISTO e a inferior o REALIZADO. Quando os dois ocorrem no mesmo dia,
 * ambas ficam visíveis (azul em cima + verde embaixo).
 *
 * Cores:
 *  Top (previsto):     🟦 azul = previsto · 🟥 vermelho = previsto que passou sem real
 *  Bottom (realizado): 🟩 verde = real conforme previsto · 🟧 laranja = antecipado · 🟨 amarelo = não programado
 */
function faixasCelula(
  dia: Date,
  prevIni: string | null | undefined,
  prevFim: string | null | undefined,
  realIni: string | null | undefined,
  realFim: string | null | undefined,
  hoje: Date,
  cal: CalendarioMSProject | null,
  aderenciaPct: number | null, // Rev. 1663 — % aderência da SEMANA (não do dia)
  metaPct: number,             // Rev. 1663 — meta semanal da atividade
  // Rev. 1664.1 — Auto-derivação do REAL a partir do avanço semanal do FC.
  // Quando o usuário lança avanço no FC (planejamento_avancos), o LOTUS
  // passa a refletir esse avanço sem precisar preencher Real Início/Fim
  // manualmente. Isso elimina a divergência clássica "FC mostra 100%, mas
  // LOTUS mostra tudo vermelho".
  temAvancoNaSemana: boolean = false,
  acumPctAteSemana: number = 0,
  // Rev. 1785 — Início da SEMANA CORRENTE (a que contém `hoje`). A regra
  // de "vermelho = previsto não executado" agora dispara apenas para dias
  // de semanas FECHADAS (Last Planner System / PPC: o compromisso só é
  // avaliado no fechamento da semana, não dia-a-dia dentro da semana
  // aberta). Antes era `dia <= hoje`, o que pintava ter/qua de vermelho
  // mesmo a semana ainda estando em curso (com cutoff na qui/sex).
  inicioSemanaCorrente: Date | null = null,
  // Rev. 1875 — Override granular: datas em que esta atividade específica
  // teve trabalho em sáb/dom (engenheiro marcou manualmente clicando na
  // célula). Tratadas como `ehUtil=true` apenas para esta atividade.
  diasExtras: Set<string> | null = null,
  // Rev. 1894 — Cutoff oficial do projeto (YYYY-MM-DD). Quando informado,
  // NENHUM dia posterior ao cutoff é pintado (nem previsto azul, nem
  // realizado verde/vermelho/etc). Padrão LOTUS / status-date PMBOK: o
  // relatório fotografa a obra ATÉ o cutoff; o futuro fica em branco e
  // entra no próximo relatório semanal. Sem cutoff (null), comportamento
  // anterior é preservado (pinta envelope completo).
  cutoffStr: string | null = null,
): { top: string | null; bottom: string | null } {
  const ds = dateStr(dia);
  // Rev. 1894/1905 — Guard de cutoff REVISADO: dias > cutoff bloqueiam
  // APENAS a faixa REALIZADO (bottom). O PREVISTO (top azul) continua
  // sendo computado e exibido pra que o PLANO apareça em TODAS as semanas
  // do cronograma até o último dia do projeto. User (16/05/2026, screenshot
  // LOTUS Sem.3 [15-21/05] toda em branco com "Oficial 14/05" como cutoff):
  // "O PREVISTO DEVE APARECER TODAS AS SEMANAS DO CRONOGRAMA, ATÉ O ULTIMO
  // DIA DO PROJETO". Antes (Rev. 1894), o guard zerava TOP+BOTTOM matando
  // o previsto futuro — semanas após o cutoff oficial apareciam totalmente
  // brancas (sem nenhuma indicação de plano).
  // O zeramento do bottom (snapshot da execução até a data de fotografia)
  // é aplicado ao final do cálculo, preservando toda a lógica de inPrev,
  // inReal auto-derivado, passou/aderência, e a regra "previsto passou sem
  // execução = vermelho" pra semanas FECHADAS antes do cutoff.
  const passouCutoff = !!cutoffStr && ds > cutoffStr;
  // Rev. 1914 — RESTAURADO: respeitar 100% o calendário do projeto (MSP).
  // Reverte a Rev. 1912 parte A. Decisão do usuário (16/05/2026): "Respeite
  // o calendário que veio do project para não ter erros". Quem dita se um
  // sáb/dom (ou qualquer feriado) é útil é o `calendarioJson` importado do
  // MS Project. Se o MSP marca sáb como útil → ERP pinta. Se MSP marca como
  // folga → não pinta. O fallback (sem cal) mantém o padrão clássico
  // seg-sex. `diasExtras` (Rev. 1875) continua sendo um override manual
  // pra atividade específica.
  const ehUtilCal = cal ? ehDiaUtil(ds, cal) : (dia.getDay() !== 0 && dia.getDay() !== 6);
  const ehUtil = ehUtilCal || (!!diasExtras && diasExtras.has(ds));
  const inPrev = ehUtil && !!(prevIni && prevFim && ds >= prevIni && ds <= prevFim);
  // Rev. 1875 — Respeitar calendário MSP TAMBÉM no REAL explícito. Antes,
  // se o engenheiro lançasse `dataInicioReal/dataFimReal` em uma janela que
  // contivesse sáb/dom, esses dias eram pintados automaticamente — o que
  // viola a regra "sem atividade em fim de semana por padrão". Agora sáb/dom
  // só pintam quando o calendário do projeto (planejamento_projetos.calendario_json
  // exceptions com working=true ou weekDays[6/0]=true) explicitamente marcar
  // aquele dia como trabalhado. O engenheiro habilita pontualmente via
  // exceção de calendário (mecanismo manual descrito na Rev. 1875).
  let inReal = ehUtil && !!(realIni && realFim && ds >= realIni && ds <= realFim);
  // Rev. 1785 — `passou` agora = "dia pertence a uma semana JÁ FECHADA".
  // Se `inicioSemanaCorrente` não foi informado (compatibilidade com chamadas
  // antigas), cai no comportamento anterior (`dia ≤ hoje`).
  const passou = inicioSemanaCorrente
    ? dia.getTime() < inicioSemanaCorrente.getTime()
    : dia.getTime() <= hoje.getTime();
  // Auto-derivação: sem datas reais explícitas, usa o avanço semanal do FC
  // como sinal de "executado". Cobre três cenários:
  //  • Avanço lançado nesta semana DENTRO do envelope previsto → dias
  //    previstos da semana viram verdes (caminho original).
  //  • Acumulado ≥ 100% → toda a janela prevista (até hoje) vira verde,
  //    inclusive em semanas anteriores que ainda não tinham real.
  //  • Rev. 1677 — Avanço lançado em atividade ANTECIPADA / NÃO PROGRAMADA
  //    (sem inPrev no dia): pinta dias úteis já passados da semana. Como
  //    ds < prevIni, o branch abaixo já cuida de pintar LARANJA (antecipado);
  //    quando não há prevIni no horizonte, cai em AMARELO (não programado).
  if (!inReal && !(realIni && realFim)) {
    if (inPrev) {
      if (temAvancoNaSemana) inReal = true;
      else if (acumPctAteSemana >= 100 && passou) inReal = true;
    } else if (temAvancoNaSemana && passou && ehUtil) {
      // Rev. 1688 — Só auto-deriva REAL fora do envelope previsto quando o
      // dia está ANTES do início previsto (atividade antecipada — pinta
      // LARANJA pelo branch `ds < prevIni` abaixo). Para dias APÓS `prevFim`
      // não pinta nada: a atividade já terminou e não faz sentido marcar
      // execução "fantasma" amarela depois do fim do plano. Antes desta
      // revisão, atividades curtas (ex: "Início" 04/05→04/05) com avanço
      // lançado na semana ganhavam células AMARELAS em ter/qua/qui — bug
      // visível no Portal do Cliente, divergente do módulo Planejamento.
      const passouFimPrev = !!prevFim && ds > prevFim;
      if (!passouFimPrev) inReal = true;
    }
  }

  // Faixa superior (PREVISTO)
  let top: string | null = null;
  if (inPrev) {
    // Se passou sem real e a atividade tinha meta exigida na semana, o
    // previsto vira vermelho ("não executado"). Sem meta (meta=0), permanece
    // azul informativo.
    // Regra de negócio: previsto que JÁ PASSOU (dia ≤ hoje) sem real no
    // próprio dia e com meta exigida na semana → vermelho. NÃO depende de
    // realFim global da atividade — uma atividade pode ter realFim em D-2 e
    // mesmo assim ter dias previstos D-1/D sem execução, que devem aparecer
    // vermelhos por dia (o que vale é "tem real NESSE dia? — `inReal`").
    top = (passou && !inReal && metaPct > 0) ? "bg-red-500" : "bg-blue-800";
  }

  // Faixa inferior (REALIZADO)
  let bottom: string | null = null;
  if (inReal) {
    if (prevIni && ds < prevIni) {
      bottom = "bg-orange-400";   // antecipado (executado antes do envelope)
    } else if (!inPrev) {
      bottom = "bg-yellow-400";   // fora da janela prevista (não programado)
    } else {
      // Real dentro do plano da semana → cor reflete aderência semanal (PPC).
      // Sem meta (atividade sem peso ou janela fora da semana atual) → verde
      // neutro pra não punir injustamente.
      if (aderenciaPct == null || metaPct <= 0) bottom = "bg-green-500";
      else bottom = aderenciaPct >= ADERENCIA_THRESHOLD ? "bg-green-500" : "bg-red-500";
    }
  }

  // Rev. 1913 — RESTAURADA a semântica da Rev. 1905 (revoga Rev. 1912 parte B):
  // pra dias > cutoff, zera APENAS o `bottom` (realizado). O `top` (previsto
  // azul/vermelho) continua exibido em TODAS as semanas até o fim do projeto.
  // Decisão do usuário (16/05/2026, msg "o previsto deve aparecer até o final
  // do cronograma, o cutoff deve ser respeitado para definir a linha de corte
  // da semana mas o resto deve ser mantido"). Modelo de leitura: o cronograma
  // mostra o PLANO inteiro (até o fim do projeto) com SNAPSHOT do realizado
  // até a data de corte. PMBOK status-date estrito (Rev. 1894/1912-B) volta a
  // ficar revogado. A correção do FDS da Rev. 1912 parte A (`ehUtilCal`) e do
  // `calMarcaUtil` permanecem intactas — sáb/dom continuam cinza vazio sempre.
  if (passouCutoff) bottom = null;

  return { top, bottom };
}

export default function ProgramacaoSemanalLotus(props: Props) {
  const {
    projetoId, revisaoId, companyId, nomeProjeto, nomeCliente, atividades, semanas, semanaIdx, onSemanaChange,
    gerenciadoraNome, gerenciadoraLogoUrl, clienteLogoUrl, engenheiroResponsavel, calendarioJson, projetoStart, projetoFinish, cutoffIso,
    avancosOverride = null,
  } = props;
  const calMSP = useMemo(() => parseCalendarioJson(calendarioJson), [calendarioJson]);

  const utils = trpc.useUtils();
  const { toast } = useToast();
  const setRealDates = trpc.planejamento.setRealDates.useMutation({
    onSuccess: async () => {
      await utils.planejamento.listarAtividades.invalidate();
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro ao salvar data", description: e.message }),
  });

  const semana = semanas[semanaIdx];
  const dias = useMemo(() => {
    if (!semana) return [];
    // Clip da PRIMEIRA semana visível à data de início real do projeto:
    // não faz sentido mostrar dias anteriores ao começo do cronograma.
    let ini = semana.ini;
    if (projetoStart) {
      const ps = parseDate(projetoStart.slice(0, 10));
      if (ps.getTime() > ini.getTime() && ps.getTime() <= semana.fim.getTime()) {
        ini = ps;
      }
    }
    return diasDaSemana(ini, semana.fim);
  }, [semana, projetoStart]);
  // Rev. 1852 — Reordena os dias para EXIBIÇÃO quando o cutoff cai em sex
  // (semana sáb→sex): move sáb/dom iniciais para o fim, ficando seg→sex,sáb,dom.
  // Pedido do usuário (15/05/2026, screenshot LOTUS Sem.16): "Quando a cutoff
  // for sexta quero que sábado e domingo fique a direita".
  // Apenas display: `dias` original permanece cronológico para filtros (semIniStr/
  // semFimStr) e para o export Excel (template tem layout fixo sáb→sex).
  const diasDisplay = useMemo(() => {
    if (dias.length === 0) return dias;
    const ultimo = dias[dias.length - 1];
    // Cutoff = último dia da semana. Só reordena se cutoff for sex (5).
    if (ultimo.getDay() !== 5) return dias;
    const semana: Date[] = [];
    const fimDeSemana: Date[] = [];
    for (const d of dias) {
      const dow = d.getDay();
      if (dow === 0 || dow === 6) fimDeSemana.push(d);
      else semana.push(d);
    }
    return [...semana, ...fimDeSemana];
  }, [dias]);
  const periodoStr = useMemo(() => {
    if (dias.length === 0) return "";
    const ini = dias[0];
    const fim = dias[dias.length - 1];
    return `${String(ini.getDate()).padStart(2, "0")}/${String(ini.getMonth() + 1).padStart(2, "0")}/${ini.getFullYear()} a ${String(fim.getDate()).padStart(2, "0")}/${String(fim.getMonth() + 1).padStart(2, "0")}/${fim.getFullYear()}`;
  }, [dias]);
  const hoje = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  // Rev. 1785 — Início da semana corrente (a que contém `hoje`). Usado pela
  // regra de coloração "previsto não executado" (Last Planner / PPC):
  // só pinta vermelho dias de semanas FECHADAS, mantendo a semana em curso
  // toda azul até o cutoff. Se hoje cair fora do range do projeto (semanas
  // não contêm hoje), fica null e a função preserva o comportamento antigo.
  const inicioSemanaCorrente = useMemo(() => {
    const hStr = dateStr(hoje);
    const found = semanas.find((s) => dateStr(s.ini) <= hStr && dateStr(s.fim) >= hStr);
    return found ? found.ini : null;
  }, [semanas, hoje]);
  // Rev. 1894 — Cutoff oficial (YYYY-MM-DD) usado por `faixasCelula` para
  // BLOQUEAR pintura de previsto/realizado em dias FUTUROS (> cutoff).
  // Pedido do usuário (16/05/2026, screenshot LOTUS export Excel): "A
  // PINTURA DEVE DO PREVISTO E REALIZADO REVE RESPEITAR O CUTOFF". O LOTUS
  // é um snapshot fotografado até a data de corte; o futuro fica em branco
  // e aparece no próximo relatório.
  const cutoffStrGlobal = useMemo(
    () => (cutoffIso ? cutoffIso.slice(0, 10) : null),
    [cutoffIso],
  );

  // Filtra atividades que tocam a semana (previsto OU real dentro do range)
  const semIniStr = dias.length ? dateStr(dias[0]) : "";
  const semFimStr = dias.length ? dateStr(dias[dias.length - 1]) : "";

  // Rev. 1677 — Carrega avanços ANTES do filtro pra detectar antecipadas
  // (atividades cujo previsto começa no futuro mas o engenheiro já lançou
  // avanço nesta semana). Antes da Rev. 1677 essas atividades sumiam da
  // tabela LOTUS — agora aparecem com a barra inferior LARANJA conforme
  // a legenda da gerenciadora (SERVIÇO EXECUTADO ANTECIPADAMENTE).
  // Rev. 1683 — No Portal do Cliente `companyId=0` e a query interna
  // `listarAvancos` não está disponível (ela exige sessão autenticada).
  // Quando `avancosOverride` é fornecido (Portal), usamos diretamente os
  // avanços vindos do payload do tRPC `portalExterno.cliente.planejamentoObra`,
  // mantendo a paridade absoluta dos cálculos PV/EV/Δ entre ERP e Portal.
  const { data: avancosListaQuery = [] } = trpc.planejamento.listarAvancos.useQuery(
    { projetoId, revisaoId },
    { enabled: !avancosOverride && !!projetoId && !!revisaoId },
  );
  const avancosLista = avancosOverride ?? avancosListaQuery;
  const avancosPorAtv = useMemo(() => {
    const idx = new Map<number, any[]>();
    for (const av of (avancosLista as any[])) {
      const arr = idx.get(av.atividadeId) ?? [];
      arr.push(av);
      idx.set(av.atividadeId, arr);
    }
    return idx;
  }, [avancosLista]);
  // Set de atividadeIds que tiveram avanço lançado nesta semana (semana ISO
  // do registro está no campo `semana` de planejamento_avancos).
  const temAvSemPorAtv = useMemo(() => {
    const s = new Set<number>();
    if (!semIniStr) return s;
    for (const av of (avancosLista as any[])) {
      const sem = String(av.semana ?? "").slice(0, 10);
      if (sem >= semIniStr && sem <= semFimStr) {
        const pct = parseFloat(String(av.percentualSemanal ?? "0")) || 0;
        if (pct > 0) s.add(av.atividadeId);
      }
    }
    return s;
  }, [avancosLista, semIniStr, semFimStr]);

  const atividadesDaSemana = useMemo(() => {
    if (!semIniStr) return [];
    return atividades.filter((a) => {
      if (a.isGrupo) return false; // só folhas com data
      const tocaPrev = a.dataInicio && a.dataFim && !(a.dataFim < semIniStr || a.dataInicio > semFimStr);
      const tocaReal = a.dataInicioReal && a.dataFimReal && !(a.dataFimReal < semIniStr || a.dataInicioReal > semFimStr);
      // Rev. 1677 — Antecipada: previsto inteiramente no futuro (dataInicio
      // > semFim) mas com avanço lançado nesta semana. Inclui na tabela pra
      // a barra inferior aparecer LARANJA (executado antecipadamente).
      const antecipadaComAvanco = !!a.dataInicio && a.dataInicio > semFimStr && temAvSemPorAtv.has(a.id);
      return tocaPrev || tocaReal || antecipadaComAvanco;
    });
  }, [atividades, semIniStr, semFimStr, temAvSemPorAtv]);

  // Rev. 2254 — Reconstrói a cadeia de pais via `nivel` + ordem original (MSP
  // outline), NÃO por prefixo de EAP. Motivo: grupos como "VITRAIS",
  // "PROTÓTIPO", "VITRAL 01/02/03" frequentemente vêm do MSP só com nome
  // (eapCodigo NULL) — o prefix-match anterior os ignorava e a tela mostrava
  // as folhas soltas, sem hierarquia. Mesmo algoritmo do Cronograma:
  // para cada folha, anda pra trás no array (que vem ordenado por `ordem`)
  // procurando ancestrais com `isGrupo=true` e `nivel` estritamente menor,
  // empilhando até nivel 1.
  type LinhaGrupo = { tipo: "grupo"; eap: string; nome: string; nivel: number };
  type LinhaAtiv = { tipo: "ativ"; ativ: Atividade };
  const linhas: (LinhaGrupo | LinhaAtiv)[] = useMemo(() => {
    const result: (LinhaGrupo | LinhaAtiv)[] = [];
   try {
    const idxById = new Map<number, number>();
    atividades.forEach((a, i) => idxById.set(a.id, i));

    const ancestralCache = new Map<number, Atividade[]>();
    const getAncestrais = (a: Atividade): Atividade[] => {
      if (ancestralCache.has(a.id)) return ancestralCache.get(a.id)!;
      const chain: Atividade[] = [];
      const idx = idxById.get(a.id);
      if (idx == null) { ancestralCache.set(a.id, chain); return chain; }
      let nivelAlvo = (a.nivel ?? 1) - 1;
      for (let j = idx - 1; j >= 0 && nivelAlvo >= 1; j--) {
        const cand = atividades[j];
        const cn = cand.nivel ?? 1;
        if (cand.isGrupo && cn <= nivelAlvo) {
          chain.unshift(cand);
          nivelAlvo = cn - 1;
        }
      }
      ancestralCache.set(a.id, chain);
      return chain;
    };

    const gruposEmitidos = new Set<number>();
    atividadesDaSemana.forEach((a) => {
      const ancestrais = getAncestrais(a);
      ancestrais.forEach((g) => {
        if (!gruposEmitidos.has(g.id)) {
          result.push({
            tipo: "grupo",
            eap: g.eapCodigo || "",
            nome: g.nome,
            nivel: g.nivel ?? 1,
          });
          gruposEmitidos.add(g.id);
        }
      });
      result.push({ tipo: "ativ", ativ: a });
    });
    return result;
   } catch (err) {
    if (typeof window !== "undefined") console.error("[Lotus.linhas] memo falhou — usando defaults:", err);
    return result;
   }
  }, [atividadesDaSemana, atividades]);

  const handleSetReal = (atividadeId: number, campo: "dataInicioReal" | "dataFimReal", valor: string) => {
    setRealDates.mutate({ atividadeId, companyId, [campo]: valor || null } as any);
  };

  // Rev. 1875 — Toggle de "fim de semana trabalhado" por atividade. Clicar
  // num quadradinho de SÁB/DOM marca/desmarca aquele dia como trabalhado
  // SÓ para esta atividade (não muda o calendário do projeto). Optimistic
  // update via invalidate da listarAtividades após a mutação.
  // OBS: reusa o `utils` declarado mais acima no componente (L254).
  const toggleDiaExtra = trpc.planejamento.toggleDiaTrabalhadoExtra.useMutation({
    onSuccess: () => {
      utils.planejamento.listarAtividades.invalidate({ revisaoId });
    },
    onError: (err) => {
      console.error("[toggleDiaExtra] erro:", err);
      try { (window as any).toast?.error?.(`Não foi possível alternar o dia trabalhado: ${err.message}`); } catch {}
    },
  });
  // Parsing memoizado por atividade — JSON.parse só roda quando a lista muda.
  const diasExtrasPorAtv = useMemo(() => {
    const m = new Map<number, Set<string>>();
    for (const a of atividades) {
      const raw = (a as any).diasTrabalhadosExtras;
      if (!raw) continue;
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const s = new Set<string>();
          for (const v of arr) if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) s.add(v);
          if (s.size > 0) m.set(a.id, s);
        }
      } catch {}
    }
    return m;
  }, [atividades]);

  // Rev. 1678 — Edit-on-click para datas Real Início/Fim. Antes mostrávamos
  // `<Input type="date">` direto, mas o iOS Safari/Chrome renderizam esse
  // input em formato longo localizado ("4 de mai. de 2026"), violando a regra
  // de ouro do projeto (datas dd/MM/aaaa). Agora exibimos um botão com
  // `fmtBR(...)` por padrão e só trocamos pro input nativo quando o usuário
  // clica — o picker abre, o usuário escolhe e voltamos ao display dd/MM/aaaa.
  const [editingReal, setEditingReal] = useState<{ atvId: number; campo: "dataInicioReal" | "dataFimReal" } | null>(null);
  const RealDateCell = ({ a, campo }: { a: Atividade; campo: "dataInicioReal" | "dataFimReal" }) => {
    const valor = (campo === "dataInicioReal" ? a.dataInicioReal : a.dataFimReal) || "";
    const isEditing = editingReal?.atvId === a.id && editingReal?.campo === campo;
    if (isEditing) {
      return (
        <Input
          type="date"
          autoFocus
          defaultValue={valor}
          onBlur={(e) => {
            const novo = e.target.value;
            if (novo !== valor) handleSetReal(a.id, campo, novo);
            setEditingReal(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            if (e.key === "Escape") setEditingReal(null);
          }}
          className="h-6 text-[10px] px-1 border-slate-200"
          disabled={setRealDates.isPending}
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => setEditingReal({ atvId: a.id, campo })}
        title={valor ? "Clique para alterar" : "Clique para definir"}
        className={`w-full h-6 text-[10px] tabular-nums whitespace-nowrap text-center rounded px-1 transition-colors ${
          valor ? "text-slate-700 hover:bg-blue-50" : "text-slate-300 hover:bg-blue-50"
        } print:hover:bg-transparent print:cursor-default`}
        disabled={setRealDates.isPending}
      >
        {valor ? fmtBR(valor) : "—"}
      </button>
    );
  };

  // Rev. 1663 — Métricas de aderência semanal (PPC do Last Planner System).
  // Para cada atividade da semana calcula:
  //   • metaPct       = peso × du(semana ∩ envelope até cutoff) / du(envelope)
  //   • realPct       = peso × Σ(percentualSemanal de avanços que caem na semana) / 100
  //   • aderenciaPct  = realPct / metaPct × 100
  //   • acumuladoPct  = avanço acumulado mais recente até semFim
  // Fonte única: planejamento_avancos (mesmo dado do FC). Sem rateio diário —
  // a literatura (Ballard, Lean Construction Institute) trata semana como
  // unidade de compromisso. As cores das células diárias usam a aderência da
  // SEMANA (não do dia individual).
  // (Rev. 1677: avancosLista/avancosPorAtv subiram para o bloco do filtro
  //  atividadesDaSemana — uma única chamada de hook).

  const metricas = useMemo(() => {
    const out = new Map<number, { metaPct: number; realPct: number; aderenciaPct: number | null; acumPct: number; somaSemanal: number }>();
    try {
    if (!semIniStr) return out;
    // Rev. 1787 — Cutoff só se aplica na SEMANA CORRENTE (que contém hoje).
    // Para semanas FUTURAS o cutoff deve ser semFim (cobra meta planejada cheia
    // — essência do look-ahead do Last Planner). Para semanas PASSADAS idem
    // (semana já fechou; PPC = meta cheia × realizado).
    // Antes: `cutoffStr = min(hoje, semFim)` — fazia toda semana futura ficar
    // "Sem meta" porque janFim virava < janIni para atividades começando após hoje.
    const hojeStr = dateStr(hoje);
    const semanaContemHoje = semIniStr <= hojeStr && hojeStr <= semFimStr;
    const cutoffStr = semanaContemHoje ? hojeStr : semFimStr;

    // Padrão único (decisão usuário Rev. 1819, 15/05/2026): EVM clássico via
    // `pesoFinanceiro` para TODAS as obras. O peso é definido no cadastro do
    // cronograma (procedure `recalcularPesosFinanceiros` no servidor, com
    // base nos itens do orçamento). Se uma obra está com `pesoFinanceiro=0`
    // nas folhas, NÃO é caso de fallback aqui — é caso de rodar a propagação
    // do orçamento naquela obra (foi feito em prod via SQL replicando a mesma
    // fórmula da procedure).
    for (const a of atividadesDaSemana) {
      // Rev. 1819 — Number.isFinite blinda contra Infinity/NaN/dados inválidos.
      const pesoRaw = parseFloat(String(a.pesoFinanceiro ?? "0"));
      const peso = Number.isFinite(pesoRaw) && pesoRaw > 0 ? pesoRaw : 0;
      const ini = a.dataInicio?.slice(0, 10);
      const fim = a.dataFim?.slice(0, 10);
      let metaPct = 0;
      if (ini && fim && peso > 0) {
        // Sempre dias úteis (com calMSP quando disponível, ou seg-sex como
        // fallback — `diasUteisEntre` aceita `null` e considera dia útil
        // segunda a sexta). Garante paridade visual independentemente do
        // projeto ter calendário customizado importado.
        const duEnv = diasUteisEntre(ini, fim, calMSP);
        if (duEnv > 0) {
          // Janela cobrável da semana: [max(semIni,iniAtv) → min(cutoff,fimAtv)]
          const janIni = semIniStr > ini ? semIniStr : ini;
          const janFim = cutoffStr < fim ? cutoffStr : fim;
          if (janIni <= janFim) {
            const duJan = diasUteisEntre(janIni, janFim, calMSP);
            metaPct = peso * (duJan / duEnv);
          }
        }
      }
      // Realizado da semana = soma dos percentualSemanal cujo `semana` cai no range.
      const avsAtiv = avancosPorAtv.get(a.id) ?? [];
      let somaSemanal = 0;
      let acumPct = 0;
      for (const av of avsAtiv) {
        const sem = av.semana as string;
        if (sem >= semIniStr && sem <= semFimStr) {
          somaSemanal += parseFloat(String(av.percentualSemanal ?? "0")) || 0;
        }
        if (sem <= semFimStr) {
          const acu = parseFloat(String(av.percentualAcumulado ?? "0")) || 0;
          if (acu > acumPct) acumPct = acu;
        }
      }
      let realPct = peso * (somaSemanal / 100);
      // Rev. 1851 — Indiretas/LoE auto-progridem por definição (PMBOK §6.4.2 /
      // DCMA #6): realizado = planejado por construção, sem entrada manual em
      // planejamento_avancos. Sem este tratamento, a coluna Real fica sempre 0
      // e o status colore "Não exec." indevidamente para 01.01-01.05 (equipe
      // técnica, refeições, canteiro, máquinas, ASO/EPI), distorcendo PPC.
      // acumPct sintetizado como fração de dias úteis decorridos do envelope —
      // permite o status virar "Concluída" no fim do projeto.
      if (a.isIndireta) {
        if (metaPct > 0) {
          realPct = metaPct;
          if (peso > 0) somaSemanal = (metaPct / peso) * 100;
        }
        if (ini && fim) {
          const duEnv = diasUteisEntre(ini, fim, calMSP);
          if (duEnv > 0) {
            const cutoffAcum = cutoffStr < fim ? cutoffStr : fim;
            if (cutoffAcum >= ini) {
              const duDecorrido = diasUteisEntre(ini, cutoffAcum, calMSP);
              const acumAuto = Math.min(100, (duDecorrido / duEnv) * 100);
              if (acumAuto > acumPct) acumPct = acumAuto;
            }
          }
        }
      }
      const aderenciaPct = metaPct > 0 ? (realPct / metaPct) * 100 : null;
      out.set(a.id, { metaPct, realPct, aderenciaPct, acumPct, somaSemanal });
    }
    return out;
    } catch (err) {
      // Rev. 1816 — Blindagem: nunca derruba a tela LOTUS por bug nesse memo.
      if (typeof window !== "undefined") console.error("[Lotus.metricas] memo falhou — usando defaults:", err);
      return out;
    }
  }, [atividadesDaSemana, avancosPorAtv, semIniStr, semFimStr, calMSP, hoje]);

  // Rev. 1680 — Análise da semana: caminho crítico (CPM) + maior peso (Top 3).
  // Replica a lógica do `pesoSemana` da aba Padrão FC (`ProgramacaoSemanal.tsx` ~L641):
  //  • float = (projectEnd − dataFim) em dias corridos. ≤0 = crítica, ≤14 = quase crítica.
  //  • maiorPeso = Top 3 por contribuição em pp na semana (= metaPct, que já
  //    é peso financeiro × fração da janela semanal). Filtra contribuições > 0.
  // projectEnd = maior dataFim de TODAS as atividades do projeto (folhas).
  const analiseSemana = useMemo(() => {
   try {
    const folhas = atividades.filter((a) => !a.isGrupo && a.dataFim);
    const projectEndStr = folhas
      .map((a) => a.dataFim!)
      .filter(Boolean)
      .sort()
      .pop();
    const projectEndMs = projectEndStr ? new Date(projectEndStr + "T12:00:00").getTime() : 0;
    const criticasIds = new Set<number>();
    const quaseCriticasIds = new Set<number>();
    const contribById = new Map<number, number>();
    for (const a of atividadesDaSemana) {
      const fimMs = a.dataFim ? new Date(a.dataFim + "T12:00:00").getTime() : 0;
      const float = (projectEndMs && fimMs)
        ? Math.round((projectEndMs - fimMs) / 86400000)
        : 999;
      // Rev. 1786 — LoE/Indireta NÃO compõe caminho crítico (PMBOK §6.4.2 / DCMA #6).
      // Externas também são excluídas (já são tratadas como alerta visual em separado).
      const elegivel = !a.isIndireta && !(a as any).isExterna;
      if (elegivel && float <= 0) criticasIds.add(a.id);
      else if (elegivel && float <= 14) quaseCriticasIds.add(a.id);
      const m = metricas.get(a.id);
      if (m && m.metaPct > 0) contribById.set(a.id, m.metaPct);
    }
    const top3 = Array.from(contribById.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const maiorPesoIds = new Set<number>(top3.map(([id]) => id));
    const maiorPesoOrder = new Map<number, number>(top3.map(([id], idx) => [id, idx + 1]));
    return { criticasIds, quaseCriticasIds, maiorPesoIds, maiorPesoOrder, contribById };
   } catch (err) {
    if (typeof window !== "undefined") console.error("[Lotus.analiseSemana] memo falhou — usando defaults:", err);
    return {
      criticasIds: new Set<number>(),
      quaseCriticasIds: new Set<number>(),
      maiorPesoIds: new Set<number>(),
      maiorPesoOrder: new Map<number, number>(),
      contribById: new Map<number, number>(),
    };
   }
  }, [atividades, atividadesDaSemana, metricas]);

  // Rev. 1811 — Closure que delega à função compartilhada `pvPonderadoPorAtividade`
  // (curva S por atividade, FONTE ÚNICA de PREVISTO em todo o módulo
  // Planejamento). Substitui o pvMacro Rev. 1681 (% do prazo decorrido linear
  // do envelope MSP) — esse representava só "tempo decorrido", não a curva S
  // física esperada. Universo de folhas IGUAL ao usado no `totaisSemana` e ao
  // PlanejamentoDetalhe (sem indiretas, sem grupos, sem disabled).
  const pvOficial = useMemo(() => {
    return (refStr: string): number => {
      const folhas = atividades.filter((a: any) => !a.isGrupo && !a.disabled && !a.isIndireta);
      // usarPesoPorDuracao=false: ProgramacaoSemanalLotus pondera por
      // pesoFinanceiro, igual ao default do PlanejamentoDetalhe (L245).
      return pvPonderadoPorAtividade(refStr, folhas, false, calMSP);
    };
  }, [atividades, calMSP]);

  // Rev. 1681 — Totais OFICIAIS da semana (paridade absoluta com Avanço Físico
  // Semanal do PlanejamentoDetalhe). O TOTAL DA SEMANA mostra o ACUMULADO até
  // o fim da janela visível — mesma semântica do card "PREVISTO (SEMANA)"
  // 1,41% / "REALIZADO (ACUM.)" 1,38% / "VARIAÇÃO" -0,03%.
  //
  //  • Previsto = pvPonderadoPorAtividade(refFimAcum) — curva S por atividade (Rev. 1811).
  //  • Realizado = Σ peso × percentualAcumulado/100 (último avanço ≤ semFim
  //    por atividade, sobre TODAS as folhas do projeto — não só as da
  //    semana). Mesma fórmula de `previstoRealizadoSemana.realizadoAcumulado`
  //    em PlanejamentoDetalhe ~L5055-5066.
  //  • Δ = Real − Prev (negativo = atrasado).
  //
  // Σ row-by-row (somatório das colunas META SEMANAL exibidas) é mantido só
  // como FALLBACK quando pvMacro é null (projeto sem MSP). Rev. 1679 ficou
  // estritamente como fallback — paridade era impossível pela diferença de
  // semântica (Σ delta semanal vs snapshot MSP acumulado).
  const totaisSemana = useMemo(() => {
   try {
    // Universo de folhas IGUAL ao PlanejamentoDetalhe ~L506:
    //   !isGrupo && !disabled && (refisComIndiretasGlobal || !isIndireta)
    // LOTUS não expõe o toggle de indiretas, então adotamos o caso default
    // (refisComIndiretasGlobal=false) — exclui indiretas do total. É o
    // mesmo cenário do card "PREVISTO (SEMANA)" que o usuário compara.
    const folhas = atividades.filter((a) => !a.isGrupo && !a.disabled && !a.isIndireta);
    const pesoOf = (a: Atividade) => parseFloat(String(a.pesoFinanceiro ?? "0")) || 0;

    // refFimAcum espelha PlanejamentoDetalhe ~L5103: para semana CORRENTE
    // (que contém o cutoff oficial), encurta ao cutoff; para passada/futura,
    // usa semFim. Garante paridade quando o cutoff oficial não bate exatamente
    // com o fim visual da janela (ex: cutoff = quarta, janela termina quinta).
    const cutoffStr = cutoffIso ? cutoffIso.slice(0, 10) : null;
    const refFimAcum = (cutoffStr && semIniStr && semFimStr
                        && cutoffStr >= semIniStr && cutoffStr < semFimStr)
      ? cutoffStr
      : semFimStr;

    // Realizado ACUMULADO (oficial): Σ peso × acumAtual/100 sobre todas as folhas.
    let realAcumOficial = 0;
    if (refFimAcum) {
      for (const a of folhas) {
        const peso = pesoOf(a);
        if (peso === 0) continue;
        const avs = (avancosPorAtv.get(a.id) ?? [])
          .filter((av: any) => String(av.semana ?? "").slice(0, 10) <= refFimAcum)
          .sort((x: any, y: any) => String(y.semana).localeCompare(String(x.semana)));
        const acumAtual = avs.length ? (parseFloat(String(avs[0].percentualAcumulado ?? "0")) || 0) : 0;
        realAcumOficial += peso * acumAtual / 100;
      }
    }

    // Rev. 1811 — Previsto ACUMULADO (oficial) = curva S por atividade,
    // mesma função usada no PlanejamentoDetalhe (top bar + cards). Garante
    // paridade absoluta entre o "Previsto acumulado oficial" do Lotus e o
    // "PREVISTO (SEMANA)" do Avanço Semanal para o MESMO refFimAcum.
    let prevAcumOficial = 0;
    let fonteOficial: "msp" | "linear" | "fallback" = "fallback";
    if (refFimAcum && folhas.length > 0) {
      // Rev. 1819 — strictPesoFinanceiro=true: mesmo padrão único do memo
      // `metricas` (peso financeiro puro, sem fallback de duração). Garante
      // que rodapé "Previsto acumulado oficial" não diverge das linhas quando
      // a obra está com cobertura parcial de pesoFinanceiro (ex.: CHLORUM e
      // QIU 2 enquanto o usuário não roda "Recalcular pesos").
      prevAcumOficial = pvPonderadoPorAtividade(refFimAcum, folhas, false, calMSP, true);
      fonteOficial = calMSP ? "msp" : "linear";
    }

    // Σ row-by-row (mantido para auditoria interna / Excel — pode somar com
    // tooltip explicando que é a contribuição agregada das atividades da
    // semana corrente, NÃO o avanço acumulado).
    let totalPrevRow = 0;
    let totalRealRow = 0;
    for (const a of atividadesDaSemana) {
      const m = metricas.get(a.id);
      if (!m) continue;
      totalPrevRow += m.metaPct;
      totalRealRow += m.realPct;
    }

    return {
      // Oficiais (acumulados — paridade com card grande):
      prevAcumOficial,
      realAcumOficial,
      deltaOficial: realAcumOficial - prevAcumOficial,
      fonteOficial,
      refFimAcum,
      // Σ row-by-row (mantido como referência interna):
      totalPrevRow,
      totalRealRow,
    };
   } catch (err) {
    // Rev. 1816 — Blindagem: nunca derruba a tela LOTUS por bug nesse memo.
    // Se algo der errado (data malformada, divisão por zero residual, etc.)
    // retorna defaults seguros e loga pra console — o resto da tela continua
    // funcionando (tabela, células, exportação Excel).
    if (typeof window !== "undefined") {
      console.error("[Lotus.totaisSemana] memo falhou — usando defaults:", err);
    }
    return {
      prevAcumOficial: 0,
      realAcumOficial: 0,
      deltaOficial: 0,
      fonteOficial: "fallback" as const,
      refFimAcum: null as string | null,
      totalPrevRow: 0,
      totalRealRow: 0,
    };
   }
  }, [atividades, atividadesDaSemana, avancosPorAtv, metricas, semIniStr, semFimStr, calMSP, cutoffIso]);

  // Rev. 1679 — Totalização da semana (Prev / Real / Δ) — DEPRECATED.
  // Substituído pela paridade oficial em `totaisSemana` (Rev. 1681).
  // Mantido o memo abaixo só pra evitar quebrar referências enquanto
  // não migramos cada consumer.
  // Soma simples das colunas META SEMANAL — cada linha já está em pp do
  // projeto inteiro (peso × fração), então o Σ vira o avanço global da
  // semana (Σ metaPct = PV semanal · Σ realPct = EV semanal · Δ = Real-Prev).
  // Antecipadas entram no Real (têm avanço lançado) mas não no Prev (não
  // estavam no plano da semana) — coerente com a regra Lean já vigente.

  const fmtPct1 = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;
  // Rev. 1664 — paleta de status:
  //   • Concluída (acum ≥ 100%)              → VERDE   (única cor verde, exclusiva
  //                                                     de quem terminou de fato).
  //   • No prazo (aderência ≥ threshold)      → AZUL    (em andamento dentro do
  //                                                     ritmo planejado — não é
  //                                                     "concluído", então não pode
  //                                                     ser verde).
  //   • Atrasado / Não exec.                  → VERMELHO
  //   • Sem meta (fora da janela cobrável)    → CINZA neutro.
  // Rev. 1677 — Detecta atividade ANTECIPADA: previsto começa depois do fim
  // da semana atual e há avanço lançado na semana. Status separado em laranja
  // (mesma cor da barra inferior — paridade com a legenda da gerenciadora).
  const isAntecipada = (a: Atividade): boolean => {
    return !!a.dataInicio && !!semFimStr && a.dataInicio > semFimStr && temAvSemPorAtv.has(a.id);
  };
  const statusLabel = (m: { metaPct: number; realPct: number; aderenciaPct: number | null; acumPct: number; somaSemanal: number } | undefined, antecipada = false) => {
    if (!m) return { txt: "—", cls: "text-slate-400" };
    if (m.acumPct >= 100) return { txt: "Concluída", cls: "text-emerald-700 font-bold bg-emerald-50" };
    if (antecipada) return { txt: "Antecipada", cls: "text-orange-700 font-bold bg-orange-50" };
    if (m.metaPct <= 0)  return { txt: "Sem meta", cls: "text-slate-500" };
    if (m.aderenciaPct == null) return { txt: "—", cls: "text-slate-400" };
    if (m.aderenciaPct >= ADERENCIA_THRESHOLD) return { txt: "No prazo", cls: "text-blue-700 font-bold bg-blue-50" };
    if (m.realPct <= 0) return { txt: "Não exec.", cls: "text-red-700 font-bold bg-red-50" };
    return { txt: "Atrasado", cls: "text-red-700 font-bold bg-red-50" };
  };
  const tooltipAtiv = (a: Atividade): string => {
    const m = metricas.get(a.id);
    if (!m) return a.nome;
    const aderTxt = m.aderenciaPct == null ? "—" : `${m.aderenciaPct.toFixed(0)}%`;
    const antPrefix = isAntecipada(a) ? "🚀 ANTECIPADA — previsto começa em " + fmtBR(a.dataInicio) + "\n" : "";
    return `${antPrefix}${a.nome}\nMeta semanal: ${fmtPct1(m.metaPct)}\nRealizado na semana: ${fmtPct1(m.realPct)}\nAderência: ${aderTxt}\nAcumulado: ${fmtPct1(m.acumPct)}`;
  };

  // Rev. 1791 — Exportação Excel cumulativa, padrão visual LOTUS (template-fill).
  // Carrega o template oficial da Lotus (`/templates/programacao_semanal_lotus.xlsx`,
  // capturado da entrega real do cliente — REVTE-PSEM-FC), preserva 100% do styling
  // (fontes Manrope/Blinker, larguras, alturas, merges, page setup A4 landscape
  // fit-to-width, bordas, theme colors), apaga os dados de exemplo e clona a aba
  // "SEMANA 01- FC" para cada semana do projeto até a SELECIONADA, gerando UM
  // arquivo cumulativo com abas "SEMANA 01 - FC", "SEMANA 02 - FC"... até "SEMANA NN - FC".
  // Os 3 logos (gerenciadora · cliente · construtora) vêm do CADASTRO da obra/empresa,
  // nunca hardcoded — re-renderizam automaticamente quando trocados no cadastro.
  const handleExportExcel = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;

      // 1. Buscar empresaLogoUrl (FC/proponente) via getProjetoById — lazy fetch.
      //    (clienteLogoUrl + gerenciadoraLogoUrl já chegam por props.)
      //    No Portal Cliente o componente é montado com projetoId=0/companyId=0
      //    (avancosOverride sinaliza esse modo) e getProjetoById é protectedProcedure
      //    — então o fetch é GATED para evitar 401 quebrando o export inteiro. No
      //    portal, o logo da construtora simplesmente não é renderizado (logos da
      //    gerenciadora e do cliente seguem aparecendo via props).
      let empresaLogoUrl: string | null = null;
      const isPortalMode = !!avancosOverride || projetoId <= 0 || companyId <= 0;
      if (!isPortalMode) {
        try {
          const projeto = await utils.planejamento.getProjetoById.fetch({ id: projetoId, companyId });
          empresaLogoUrl = ((projeto as any)?.obra?.empresaLogoUrl ?? null) as string | null;
        } catch { /* fetch falhou — segue sem logo da construtora */ }
      }

      // 2. Carregar template do servidor (Vite serve client/public/ na raiz)
      const tplResp = await fetch("/templates/programacao_semanal_lotus.xlsx");
      if (!tplResp.ok) throw new Error("Template Lotus não encontrado em /templates/programacao_semanal_lotus.xlsx");
      const tplBuf = await tplResp.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(tplBuf);
      const tplWs = wb.worksheets[0]; // "SEMANA 01- FC"

      // 3. Pré-carrega logos do cadastro como ArrayBuffer + extensão correta
      const fetchImg = async (url: string | null | undefined): Promise<{ buf: ArrayBuffer; ext: "png" | "jpeg" } | null> => {
        if (!url) return null;
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const buf = await r.arrayBuffer();
          const ct = (r.headers.get("content-type") || "").toLowerCase();
          const isJpg = ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g(\?|$)/i.test(url);
          return { buf, ext: isJpg ? "jpeg" : "png" };
        } catch { return null; }
      };
      const [imgEmp, imgCli, imgGer] = await Promise.all([
        fetchImg(empresaLogoUrl),
        fetchImg(clienteLogoUrl),
        fetchImg(gerenciadoraLogoUrl),
      ]);

      // Rev. 1800 — Helpers de clone SEGURO para evitar "Converting circular structure to JSON".
      // ExcelJS internamente cria instâncias (Anchor, Style, etc.) que mantêm refs ao Workbook
      // (`_workbook`, `worksheets[N]`) — JSON.parse(JSON.stringify(...)) sobre essas instâncias
      // estoura `TypeError: Converting circular structure to JSON --> _workbook --> worksheets --> Array`
      // visto pelo user em 14/05/2026 ao exportar Programação Semanal. Solução: extrair APENAS
      // os campos conhecidos (DTOs puros), sem tocar nas instâncias internas do ExcelJS.
      const safeCloneAnchor = (a: any): any => a == null ? null : {
        nativeCol: a.nativeCol, nativeColOff: a.nativeColOff,
        nativeRow: a.nativeRow, nativeRowOff: a.nativeRowOff,
        col: a.col, row: a.row,
      };
      const safeCloneRange = (r: any): any => {
        if (!r) return null;
        return {
          tl: safeCloneAnchor(r.tl),
          br: safeCloneAnchor(r.br),
          ext: r.ext ? { width: r.ext.width, height: r.ext.height } : undefined,
          editAs: r.editAs,
        };
      };
      const safeCloneStyle = (s: any): any => {
        if (!s) return s;
        // Cell.style é um getter que retorna {font, alignment, border, fill, numFmt, protection}.
        // Esses sub-objetos são plain DTOs em ExcelJS — JSON.stringify costuma funcionar, mas
        // já flagramos casos onde border.diagonal/fill.gradients viraram refs ciclícas. Aqui
        // tentamos JSON.stringify dentro de try/catch e caímos em pick explícito se falhar.
        try {
          return JSON.parse(JSON.stringify(s));
        } catch {
          return {
            font: s.font ? { ...s.font, color: s.font.color ? { ...s.font.color } : undefined } : undefined,
            alignment: s.alignment ? { ...s.alignment } : undefined,
            border: s.border ? {
              top: s.border.top ? { style: s.border.top.style, color: s.border.top.color ? { ...s.border.top.color } : undefined } : undefined,
              left: s.border.left ? { style: s.border.left.style, color: s.border.left.color ? { ...s.border.left.color } : undefined } : undefined,
              bottom: s.border.bottom ? { style: s.border.bottom.style, color: s.border.bottom.color ? { ...s.border.bottom.color } : undefined } : undefined,
              right: s.border.right ? { style: s.border.right.style, color: s.border.right.color ? { ...s.border.right.color } : undefined } : undefined,
            } : undefined,
            fill: s.fill ? {
              type: s.fill.type, pattern: s.fill.pattern,
              fgColor: s.fill.fgColor ? { ...s.fill.fgColor } : undefined,
              bgColor: s.fill.bgColor ? { ...s.fill.bgColor } : undefined,
            } : undefined,
            numFmt: s.numFmt,
            protection: s.protection ? { ...s.protection } : undefined,
          };
        }
      };

      // 4. Helper: clone profundo da aba template (cells+styles, merges, columns,
      //    rows, pageSetup, views). ExcelJS não tem clone nativo entre worksheets
      //    do mesmo workbook — esta função suprime a lacuna.
      const cloneSheetFromTemplate = (newName: string) => {
        const newWs = wb.addWorksheet(newName, {
          pageSetup: { ...tplWs.pageSetup },
          properties: { ...(tplWs as any).properties } as any,
          views: tplWs.views?.map(v => ({ ...v })),
        });
        // Larguras das colunas (1..19)
        for (let i = 1; i <= 19; i++) {
          const src = tplWs.getColumn(i);
          const dst = newWs.getColumn(i);
          if (src.width != null) dst.width = src.width;
          if ((src as any).hidden) dst.hidden = true;
        }
        // Cells (value + style) e alturas de linha
        tplWs.eachRow({ includeEmpty: true }, (row, rIdx) => {
          const newRow = newWs.getRow(rIdx);
          if (row.height != null) newRow.height = row.height;
          row.eachCell({ includeEmpty: true }, (cell, cIdx) => {
            const newCell = newRow.getCell(cIdx);
            newCell.value = cell.value;
            if (cell.style) newCell.style = safeCloneStyle(cell.style);
          });
        });
        // Merges (model.merges é array de strings tipo "B10:C13")
        const mergesArr: string[] = (tplWs as any).model?.merges ?? [];
        mergesArr.forEach((m) => { try { newWs.mergeCells(m); } catch { /* já mesclado */ } });
        return newWs;
      };

      // 5. Helper: substitui os 3 logos preservando o RANGE NATIVO (TwoCellAnchor
      //    com EMU offsets exatos) das imagens originais do template — garante
      //    paridade absoluta de posição/tamanho com o REVTE-PSEM-FC.
      // Rev. 1802 — Posições no template (verificadas pelo screenshot do user
      // 14/05/2026, comparando PLANILHA MODELO × export atual):
      //   index 0 → POSIÇÃO ESQUERDA (cols B-D)   — modelo: CLIENTE (Santuário)
      //   index 1 → POSIÇÃO DIREITA (cols N-P)    — modelo: GERENCIADORA (LOTUS)
      //   index 2 → POSIÇÃO CENTRO (cols I-L)     — modelo: EMPRESA (FC)
      // (Antes da Rev. 1802 a atribuição estava trocada: a esquerda recebia
      //  Lotus, o centro recebia Santuário e a direita recebia FC, gerando
      //  layout invertido frente ao padrão do cliente.)
      const tplMedia: any[] = Array.isArray((tplWs as any)._media) ? (tplWs as any)._media.slice() : [];
      const tplImgs = tplMedia.filter((m) => m?.type === "image");
      const POS_ESQUERDA = safeCloneRange(tplImgs[0]?.range);
      const POS_DIREITA  = safeCloneRange(tplImgs[1]?.range);
      const POS_CENTRO   = safeCloneRange(tplImgs[2]?.range);

      const insertLogos = (ws: any) => {
        // Remove SOMENTE as imagens da aba (preserva qualquer outro tipo de media)
        try {
          if (Array.isArray((ws as any)._media)) {
            (ws as any)._media = (ws as any)._media.filter((m: any) => m?.type !== "image");
          }
        } catch { /* noop */ }
        const addImg = (
          img: { buf: ArrayBuffer; ext: "png" | "jpeg" } | null,
          range: any,
        ) => {
          if (!img || !range) return;
          const id = wb.addImage({ buffer: img.buf as any, extension: img.ext });
          // Re-anexa no RANGE NATIVO original (cópia profunda — addImage muta)
          ws.addImage(id, safeCloneRange(range));
        };
        // Conforme planilha modelo do cliente:
        addImg(imgCli, POS_ESQUERDA);  // Santuário (cliente) à esquerda
        addImg(imgEmp, POS_CENTRO);    // FC (empresa) ao centro
        addImg(imgGer, POS_DIREITA);   // LOTUS (gerenciadora) à direita
      };

      // 6. Cores oficiais extraídas do tema do template (#4472C4 = Accent1).
      //    Padronização do ERP daqui pra frente — bate com a paleta Office padrão
      //    e com a expectativa visual da Lotus (Rev. 1791).
      const COR_PREVISTO  = "FF4472C4"; // azul Accent1
      const COR_REALIZADO = "FF00B050"; // verde positivo
      const COR_ATRASADO  = "FFFF0000"; // vermelho
      const COR_ANTECIP   = "FFED7D31"; // laranja Accent2
      const COR_NAO_PROG  = "FFFFC000"; // amarelo Accent4
      const corClassToHex = (cls: string | null): string | null => {
        if (cls === "bg-blue-800")   return COR_PREVISTO;
        if (cls === "bg-green-500")  return COR_REALIZADO;
        if (cls === "bg-red-500")    return COR_ATRASADO;
        if (cls === "bg-orange-400") return COR_ANTECIP;
        if (cls === "bg-yellow-400") return COR_NAO_PROG;
        return null;
      };

      // 7. Helper: calcula dados de UMA semana específica (replica metricas +
      //    atividadesDaSemana — mesma fórmula do componente, sem useMemo pois
      //    rodamos N vezes em loop).
      type DadosSemana = {
        sem: { numero: number; ini: Date; fim: Date };
        dias: Date[];
        ats: Atividade[];
        mts: Map<number, { metaPct: number; realPct: number; aderenciaPct: number | null; acumPct: number; somaSemanal: number }>;
        semIni: string;
        semFim: string;
        temAvSem: Set<number>;
      };
      const calcSemana = (sem: { numero: number; ini: Date; fim: Date }): DadosSemana => {
        // Clip da PRIMEIRA semana ao projetoStart (mesma regra do hook `dias` L237-249)
        let iniDate = sem.ini;
        if (projetoStart) {
          const ps = parseDate(projetoStart.slice(0, 10));
          if (ps.getTime() > iniDate.getTime() && ps.getTime() <= sem.fim.getTime()) iniDate = ps;
        }
        const dias = diasDaSemana(iniDate, sem.fim);
        const semIni = dias.length ? dateStr(dias[0]) : "";
        const semFim = dias.length ? dateStr(dias[dias.length - 1]) : "";

        const temAvSem = new Set<number>();
        for (const av of (avancosLista as any[])) {
          const s = String(av.semana ?? "").slice(0, 10);
          if (s >= semIni && s <= semFim) {
            const pct = parseFloat(String(av.percentualSemanal ?? "0")) || 0;
            if (pct > 0) temAvSem.add(av.atividadeId);
          }
        }

        const ats = atividades.filter((a) => {
          if (a.isGrupo) return false;
          const tocaPrev = a.dataInicio && a.dataFim && !(a.dataFim < semIni || a.dataInicio > semFim);
          const tocaReal = a.dataInicioReal && a.dataFimReal && !(a.dataFimReal < semIni || a.dataInicioReal > semFim);
          const ant = !!a.dataInicio && a.dataInicio > semFim && temAvSem.has(a.id);
          return tocaPrev || tocaReal || ant;
        });

        const hojeStr = dateStr(hoje);
        const semContemHoje = semIni <= hojeStr && hojeStr <= semFim;
        const cutoffStr = semContemHoje ? hojeStr : semFim;

        const mts = new Map<number, any>();
        for (const a of ats) {
          const peso = parseFloat(String(a.pesoFinanceiro ?? "0")) || 0;
          const ini = a.dataInicio?.slice(0, 10);
          const fim = a.dataFim?.slice(0, 10);
          let metaPct = 0;
          if (ini && fim && peso > 0) {
            const duEnv = diasUteisEntre(ini, fim, calMSP);
            if (duEnv > 0) {
              const janIni = semIni > ini ? semIni : ini;
              const janFim = cutoffStr < fim ? cutoffStr : fim;
              if (janIni <= janFim) {
                const duJan = diasUteisEntre(janIni, janFim, calMSP);
                metaPct = peso * (duJan / duEnv);
              }
            }
          }
          const avs = avancosPorAtv.get(a.id) ?? [];
          let somaSemanal = 0, acumPct = 0;
          for (const av of avs) {
            const s2 = av.semana as string;
            if (s2 >= semIni && s2 <= semFim) somaSemanal += parseFloat(String(av.percentualSemanal ?? "0")) || 0;
            if (s2 <= semFim) {
              const acu = parseFloat(String(av.percentualAcumulado ?? "0")) || 0;
              if (acu > acumPct) acumPct = acu;
            }
          }
          let realPct = peso * (somaSemanal / 100);
          // Rev. 1851 — Indiretas/LoE auto-progridem (PMBOK §6.4.2). Mesmo
          // tratamento do bloco `metricas` ~L498-522: realPct = metaPct e
          // acumPct sintetizado por dias úteis decorridos do envelope.
          if (a.isIndireta) {
            if (metaPct > 0) {
              realPct = metaPct;
              if (peso > 0) somaSemanal = (metaPct / peso) * 100;
            }
            if (ini && fim) {
              const duEnv = diasUteisEntre(ini, fim, calMSP);
              if (duEnv > 0) {
                const cutoffAcum = cutoffStr < fim ? cutoffStr : fim;
                if (cutoffAcum >= ini) {
                  const duDecorrido = diasUteisEntre(ini, cutoffAcum, calMSP);
                  const acumAuto = Math.min(100, (duDecorrido / duEnv) * 100);
                  if (acumAuto > acumPct) acumPct = acumAuto;
                }
              }
            }
          }
          const aderenciaPct = metaPct > 0 ? (realPct / metaPct) * 100 : null;
          mts.set(a.id, { metaPct, realPct, aderenciaPct, acumPct, somaSemanal });
        }
        return { sem, dias, ats, mts, semIni, semFim, temAvSem };
      };

      // 8. Helper: monta lista de linhas (grupos + atividades) na ordem hierárquica.
      // Rev. 2254 — Mesmo algoritmo do render (nivel + ordem original), NÃO
      // prefix-match de EAP. Garante que grupos sem eapCodigo (VITRAIS,
      // PROTÓTIPO, VITRAL 01/02/03 etc.) também apareçam no Excel.
      type LinhaExp = { tipo: "grupo"; eap: string; nome: string; nivel: number } | { tipo: "ativ"; ativ: Atividade };
      const idxByIdExp = new Map<number, number>();
      atividades.forEach((a, i) => idxByIdExp.set(a.id, i));
      const ancestralCacheExp = new Map<number, Atividade[]>();
      const getAncestraisExp = (a: Atividade): Atividade[] => {
        if (ancestralCacheExp.has(a.id)) return ancestralCacheExp.get(a.id)!;
        const chain: Atividade[] = [];
        const idx = idxByIdExp.get(a.id);
        if (idx == null) { ancestralCacheExp.set(a.id, chain); return chain; }
        let nivelAlvo = (a.nivel ?? 1) - 1;
        for (let j = idx - 1; j >= 0 && nivelAlvo >= 1; j--) {
          const cand = atividades[j];
          const cn = cand.nivel ?? 1;
          if (cand.isGrupo && cn <= nivelAlvo) {
            chain.unshift(cand);
            nivelAlvo = cn - 1;
          }
        }
        ancestralCacheExp.set(a.id, chain);
        return chain;
      };
      const buildLinhas = (ats: Atividade[]): LinhaExp[] => {
        const out: LinhaExp[] = [];
        const emit = new Set<number>();
        ats.forEach((a) => {
          getAncestraisExp(a).forEach((g) => {
            if (!emit.has(g.id)) {
              out.push({ tipo: "grupo", eap: g.eapCodigo || "", nome: g.nome, nivel: g.nivel ?? 1 });
              emit.add(g.id);
            }
          });
          out.push({ tipo: "ativ", ativ: a });
        });
        return out;
      };

      // 9. Constantes do template
      const FIRST_TASK_ROW = 10;
      const ROWS_PER_TASK = 4;
      const TEMPLATE_TASK_SLOTS = 13; // Linhas 10-61 = 13 blocos de 4
      const fmtBRDate = (d: Date) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

      // 10. Helper: preenche UMA aba (já clonada do template) com dados de uma semana
      const preencherAba = (ws: any, dados: DadosSemana) => {
        const { sem, dias, ats, mts } = dados;

        // Rev. 1886 — Garante larguras mínimas das colunas para que nenhum
        // texto fique cortado (problema visto no screenshot: TAREFA estourava
        // e as datas mostravam "4/05/202" cortado). Só AUMENTA — preserva
        // valores maiores que o template já tenha.
        // D=TAREFA, E/F=Data Prev. Inicio/Fim, G/H=Data Real Inicio/Fim,
        // I=Responsável, J..P=7 dias da semana.
        // Rev. 1889 — user pediu explicitamente largura 12 nas 4 colunas de
        // data (E/F/G/H). Aumentado de 10 → 12 e agora FORÇADO (sem o "se
        // menor que" — o template tinha 7.x e ficava cortado mesmo após
        // Rev. 1886). I (RESPONSÁVEL) também ganhou +2.
        const minWidths: Record<number, number> = {
          5: 12,   // E — Prev. Início (caber "22-abr")
          6: 12,   // F — Prev. Fim
          7: 12,   // G — Real Início
          8: 12,   // H — Real Fim
          9: 16,   // I — RESPONSÁVEL
        };
        for (const [colStr, minW] of Object.entries(minWidths)) {
          const col = ws.getColumn(parseInt(colStr, 10));
          col.width = minW;  // FORÇA — ignora largura do template
        }
        // Rev. 1940 — TAREFA (col D) com largura AUTO-AJUSTÁVEL pelo conteúdo
        // mais longo desta aba (grupo nome.toUpperCase + atividade nome), ao
        // invés do hardcoded 50 das Rev. 1886/1889 que cortava textos como
        // "TAPUMES METÁLICOS PARA ISOLAMENTO DAS ÁREAS DE ATUAÇÃO DE APOIO...".
        // Unidade de width do ExcelJS ≈ chars na fonte default — fator 1.05
        // + 4 chars de padding empírico cobre bold (grupos) sem exagerar.
        // MIN 50 (não regride), MAX 120 (evita aba ficar absurdamente larga).
        {
          let maxLen = 0;
          for (const l of buildLinhas(ats)) {
            const t = l.tipo === "grupo" ? (l.nome || "").toUpperCase() : (l.ativ.nome || "");
            if (t.length > maxLen) maxLen = t.length;
          }
          const tarefaW = Math.min(120, Math.max(50, Math.ceil(maxLen * 1.05) + 4));
          ws.getColumn(4).width = tarefaW;
        }

        // 10a. Cabeçalho (D2 é a âncora do merge D2:K5) — mantém formatação do template
        const tituloCell = ws.getCell("D2");
        const periodo = `${fmtBRDate(sem.ini)} a ${fmtBRDate(sem.fim)}`;
        tituloCell.value = `${(nomeCliente || nomeProjeto).toUpperCase()}\nPROGRAMAÇÃO SEMANAL DE ATIVIDADES\nSEMANA ${String(sem.numero).padStart(2,"0")} · ${periodo}`;

        // 10b. Faixa "PERÍODO" (J7:P7 merged) e datas dos dias (L9 J:P)
        ws.getCell("J7").value = `PERÍODO: ${fmtBRDate(sem.ini)} a ${fmtBRDate(sem.fim)}`;
        // Rev. 1926 — Mapeamento por DIA DA SEMANA real (não por ordem).
        // Template do cliente tem cabeçalhos FIXOS Seg|Ter|Qua|Qui|Sex|Sáb|Dom
        // nas cols J(10)→P(16). Quando o projeto usa semanas Sex→Qui (corte
        // na quinta, comum em obras com PSEM toda quinta), o código antigo
        // (`cIdx = 10 + di`) escrevia 19/jun(Sex)→J(Seg), 24/jun(Qua)→O(Sáb),
        // 25/jun(Qui)→P(Dom) — desalinhando data×rótulo e fazendo Wed/Thu
        // com previsto azul "vazar" pras cols rotuladas Sáb/Dom (que deveriam
        // ficar cinza vazio). User (16/05/2026, screenshots Sem.08 19-25/jun
        // ERP cinza vs Excel azul em Sáb/Dom): "GARANTE QUE SERÁ RESPEITADO
        // DOS DADOS QUE ESTIVER NO ERP, MANTENDO A FORMATAÇÃO DO CLIENTE".
        // Fix: cada dia vai pro col que casa com seu getDay() — Sat sempre
        // em O(15), Sun sempre em P(16), independente da ordem em `dias`.
        for (let i = 0; i < 7; i++) {
          const d = dias[i];
          if (!d) continue;
          ws.getCell(9, dowToExcelCol(d.getDay())).value = fmtBRDate(d).slice(0, 5);
        }

        // 10c. Limpa as 13 slots de tarefas do template (mantém styling)
        for (let slot = 0; slot < TEMPLATE_TASK_SLOTS; slot++) {
          const r0 = FIRST_TASK_ROW + slot * ROWS_PER_TASK;
          ws.getCell(r0, 2).value = "";
          ws.getCell(r0, 4).value = "";
          for (let c = 5; c <= 8; c++) ws.getCell(r0, c).value = "";
          ws.getCell(r0, 9).value = "";
          for (let dr = 0; dr < ROWS_PER_TASK; dr++) {
            for (let c = 10; c <= 16; c++) {
              const cell = ws.getCell(r0 + dr, c);
              cell.value = "";
              cell.fill = { type: "pattern", pattern: "none" } as any;
            }
          }
          // Garante linha visível (caso tenha sido escondida em export anterior)
          ws.getRow(r0).hidden = false;
          for (let dr = 1; dr < ROWS_PER_TASK; dr++) ws.getRow(r0 + dr).hidden = false;
        }

        const linhasExp = buildLinhas(ats);

        // 10d. Expande linhas além das 13 slots se necessário (clona último bloco).
        //      A legenda do template ocupa L65-L71 (slot 14 começaria em L62 e
        //      sobrescreveria a legenda). Pra resolver, INSERIMOS linhas em L62
        //      via `spliceRows` — isso EMPURRA a legenda e tudo abaixo pra baixo
        //      no número certo de linhas, e ainda atualiza merges/imagens conforme
        //      o ExcelJS suporta. Em seguida re-ancoramos os novos blocos copiando
        //      estilos+merges do bloco-modelo (último slot original L58-61, agora
        //      deslocado pelo splice — por isso capturamos antes do splice).
        if (linhasExp.length > TEMPLATE_TASK_SLOTS) {
          const slotsExtras = linhasExp.length - TEMPLATE_TASK_SLOTS;
          const novasLinhas = slotsExtras * ROWS_PER_TASK;
          const insertAt = FIRST_TASK_ROW + TEMPLATE_TASK_SLOTS * ROWS_PER_TASK; // 62
          const baseRow0Orig = FIRST_TASK_ROW + (TEMPLATE_TASK_SLOTS - 1) * ROWS_PER_TASK; // 58 (modelo)

          // Captura estilos+heights do bloco-modelo ANTES do splice (após splice
          // os indices não mudam pra L≤61, mas pra robustez capturamos primeiro)
          const blocoModelo: Array<{ height: number | undefined; cells: Array<any | null> }> = [];
          for (let dr = 0; dr < ROWS_PER_TASK; dr++) {
            const srcRow = ws.getRow(baseRow0Orig + dr);
            const cells: Array<any | null> = [null];
            for (let c = 1; c <= 17; c++) {
              const sc = ws.getCell(baseRow0Orig + dr, c);
              cells.push(sc.style ? safeCloneStyle(sc.style) : null);
            }
            blocoModelo.push({ height: srcRow.height, cells });
          }

          // Insere `novasLinhas` linhas vazias em L62 — empurra legenda pra baixo.
          // ATENÇÃO: `spliceRows` do ExcelJS NÃO desloca merges existentes (apenas
          // values/styles). Se não tratarmos, os merges antigos da legenda (ex.
          // E65:F65, S65:S68) ficam parados nas linhas 62..64 conflitando com os
          // novos slots extras (gera "Cannot merge already merged cells" silencioso
          // → blocos corrompidos). Solução: extrair os merges com row ≥ 62 ANTES
          // do splice, removê-los, fazer o splice e reaplicá-los deslocados em
          // (row + novasLinhas).
          const mergesAntes: string[] = (() => {
            try { return ((ws as any).model?.merges ?? []).slice(); } catch { return []; }
          })();
          const mergesDeslocar: string[] = [];
          for (const rng of mergesAntes) {
            const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rng);
            if (!m) continue;
            const r1 = parseInt(m[2], 10);
            if (r1 >= insertAt) {
              mergesDeslocar.push(rng);
              try { ws.unMergeCells(rng); } catch {}
            }
          }
          try {
            const blanks = Array.from({ length: novasLinhas }, () => []);
            ws.spliceRows(insertAt, 0, ...blanks);
          } catch { /* worksheets sem suporte caem aqui — segue mesmo assim */ }
          // Reaplica os merges deslocados (row1+novasLinhas .. row2+novasLinhas)
          for (const rng of mergesDeslocar) {
            const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rng)!;
            const novoRng = `${m[1]}${parseInt(m[2],10)+novasLinhas}:${m[3]}${parseInt(m[4],10)+novasLinhas}`;
            try { ws.mergeCells(novoRng); } catch {}
          }

          // Preenche os novos slots (L62 .. L62+novasLinhas-1) com estilo+merges do modelo
          for (let s = 0; s < slotsExtras; s++) {
            const targetRow0 = insertAt + s * ROWS_PER_TASK;
            for (let dr = 0; dr < ROWS_PER_TASK; dr++) {
              const dstRow = ws.getRow(targetRow0 + dr);
              if (blocoModelo[dr].height != null) dstRow.height = blocoModelo[dr].height;
              for (let c = 1; c <= 17; c++) {
                const dc = ws.getCell(targetRow0 + dr, c);
                const sty = blocoModelo[dr].cells[c];
                if (sty) dc.style = safeCloneStyle(sty);
                dc.value = "";
              }
            }
            // Replica merges do bloco-modelo: B-C × 4 + D/E/F/G/H/I × 4
            try { ws.mergeCells(`B${targetRow0}:C${targetRow0 + 3}`); } catch {}
            ["D","E","F","G","H","I"].forEach((col) => {
              try { ws.mergeCells(`${col}${targetRow0}:${col}${targetRow0 + 3}`); } catch {}
            });
          }

          // Atualiza printArea para incluir TODA a região deslocada (legenda + folga)
          try {
            const novaUltimaLinha = 73 + novasLinhas; // printArea original ia até 73
            (ws.pageSetup as any).printArea = `A1:Q${novaUltimaLinha}`;
          } catch {}
        } else if (linhasExp.length < TEMPLATE_TASK_SLOTS) {
          // Esconde slots não utilizados
          for (let slot = linhasExp.length; slot < TEMPLATE_TASK_SLOTS; slot++) {
            const r0 = FIRST_TASK_ROW + slot * ROWS_PER_TASK;
            for (let dr = 0; dr < ROWS_PER_TASK; dr++) ws.getRow(r0 + dr).hidden = true;
          }
        }

        // 10e. Preenche cada linha (grupo ou atividade)
        // Rev. 1886 — Helper de formato de data PARA EXPORT: bate 100% com o
        // modelo do cliente (ex: "22-abr", "3-nov"). Antes usávamos fmtBR
        // ("dd/mm/yyyy"), que estourava a largura das colunas de Data Prev/Real
        // e ficava cortado ("4/05/202" no screenshot do user).
        const fmtCurto = (s?: string | null): string => {
          if (!s) return "";
          const [y, m, d] = s.split("-");
          if (!y || !m || !d) return "";
          const di = parseInt(d, 10);
          const mi = parseInt(m, 10);
          if (isNaN(di) || isNaN(mi) || mi < 1 || mi > 12) return "";
          return `${di}-${MESES_ABREV[mi - 1]}`;
        };
        // Rev. 1893 — Cinza dos fins de semana (Sábado=col 15, Domingo=col 16)
        // do PADRÃO do cliente. Forçamos #D9D9D9 (cinza claro Excel padrão) em
        // TODAS as 4 linhas de cada slot de tarefa, para AMBAS as colunas. O
        // loop de pintura dos dias logo abaixo só sobrescreve quando há
        // previsto/realizado naquele dia (Rev. 1875 dias_trabalhados_extras),
        // preservando o cinza nos sáb/dom NÃO trabalhados.
        const CINZA_FDS = "FFD9D9D9";
        const pintaCinzaFds = (r0: number) => {
          for (let dr = 0; dr < ROWS_PER_TASK; dr++) {
            for (const cIdx of [15, 16]) {
              ws.getCell(r0 + dr, cIdx).fill = {
                type: "pattern", pattern: "solid", fgColor: { argb: CINZA_FDS },
              } as any;
            }
          }
        };
        linhasExp.forEach((l, idx) => {
          const r0 = FIRST_TASK_ROW + idx * ROWS_PER_TASK;
          if (l.tipo === "grupo") {
            ws.getCell(r0, 2).value = l.eap;
            ws.getCell(r0, 4).value = l.nome.toUpperCase();
            // Rev. 1889 — User: "o ERP ainda esta pintando de cinza as celulas
            // tire isso e deixa sem preenchimento". O TEMPLATE original do
            // cliente vem com cinza nas linhas de grupo (mesmo após Rev. 1886
            // ter removido nosso fill manual). Aqui forçamos `fill: none` em
            // B-N (cols 2-14) das linhas de grupo p/ sobrescrever o template.
            // Rev. 1893 — limite mudou de 16 → 14 para PRESERVAR o cinza de
            // Sáb/Dom (cols 15-16), que é exigência do padrão do cliente.
            for (let cIdx = 2; cIdx <= 14; cIdx++) {
              const c = ws.getCell(r0, cIdx);
              (c as any).fill = { type: "pattern", pattern: "none" };
            }
            // Rev. 1893 — força cinza nos sáb/dom da linha de grupo também.
            pintaCinzaFds(r0);
            // Fonte negrito no nome
            const fontDst = ws.getCell(r0, 4).font || {};
            ws.getCell(r0, 4).font = { ...fontDst, bold: true };
          } else {
            const a = l.ativ;
            // Rev. 1893 — pinta cinza Sáb/Dom ANTES do loop de dias; assim,
            // quando NÃO há previsto/realizado no fim de semana (caso normal),
            // o cinza fica visível, e quando há (Rev. 1875 dias_trabalhados_extras)
            // a pintura colorida do loop sobrescreve naturalmente.
            pintaCinzaFds(r0);
            ws.getCell(r0, 2).value = a.eapCodigo ?? "";
            ws.getCell(r0, 4).value = a.nome;
            ws.getCell(r0, 5).value = fmtCurto(a.dataInicio);
            ws.getCell(r0, 6).value = fmtCurto(a.dataFim);
            ws.getCell(r0, 7).value = fmtCurto(a.dataInicioReal);
            ws.getCell(r0, 8).value = fmtCurto(a.dataFimReal);
            // Rev. 1818 — Export Excel agora usa o RESPONSÁVEL RESOLVIDO
            // (mesma fonte da tela: contrato terceiro vinculado → FC, com
            // valor legado MSP já filtrado). Evita reexibir "CAIO AUGUSTO"
            // herdado quando a UI já mostra "FC".
            ws.getCell(r0, 9).value = a.responsavel?.labelCurto ?? a.responsavel?.label ?? "FC";

            // Pinta as barras dos dias (J-P) — esquema 4-linhas-por-tarefa do Lotus:
            // r0   = margem branca (topo)              ← NUNCA pintar
            // r0+1 = faixa Previsto (azul)             ← UMA linha só
            // r0+2 = faixa Realizado (verde/vermelho/laranja/amarelo) ← UMA linha só
            // r0+3 = margem branca (base)              ← NUNCA pintar
            // Rev. 1897 — User (16/05/2026, 3 screenshots zoom): "note que os
            // dias da semana tem 4 ceculas, a primeira fica vazia, a segunda
            // fica demarcado em azul como previsto, a terceira é preenchida
            // se for executada/não executada/outro status conforme legenda,
            // e a 4 fica em branco. Este detalhe é importante ser respeitado".
            // Reforço defensivo abaixo (após o loop): força fill:none em r0 e
            // r0+3 das cols 10-14 (Seg-Sex) — cols 15-16 (Sáb/Dom) mantêm o
            // cinza_fds da Rev. 1893. Garante a convenção mesmo se o template
            // original tiver algum fill residual nessas linhas, ou se alguma
            // revisão futura adicionar pintura por engano nelas.
            const m = mts.get(a.id);
            const temAvSemX = !!m && m.somaSemanal > 0;
            const acumAteSemX = m?.acumPct ?? 0;
            // Rev. 1893 — passa diasExtrasAtv ao faixasCelula no EXPORT, mesma
            // estratégia da UI L1768-1770. Sem isso, fim de semana marcado
            // como dia trabalhado (Rev. 1875 dias_trabalhados_extras) saía
            // apenas com o cinza de fundo no Excel, divergindo da tela.
            const diasExtrasAtvExp = diasExtrasPorAtv.get(a.id) ?? null;
            // Rev. 1904 — Reset DEFINITIVO de BRANCO em TODAS as 4 linhas ×
            // 5 dias úteis (cols J=10..N=14) ANTES do loop de pintura.
            // Resolve 2 bugs reportados (user 16/05/2026, screenshot LOTUS
            // Sem.01 com Mon-Thu):
            //   (1) "BLUE não respeita 2ª célula" — quando inPrev=false,
            //       r0+1 herdava cor residual (azul/verde) do template; a
            //       Rev. 1897 só cobriu r0/r0+3 com solid BRANCO, deixando
            //       r0+1/r0+2 em pattern:none que MANTÉM fgColor herdado em
            //       LibreOffice/Excel Online.
            //   (2) "CUTOFF não respeitado" — dias além da janela `dias`
            //       (ex: semana clipped por projetoStart pra 4 dias úteis,
            //       cIdx=14/N sem data) ficavam com r0+1/r0+2 coloridos por
            //       residual, simulando "paint vazando além do cutoff
            //       visível da semana".
            // Fix DEFINITIVO: solid BRANCO em r0/r0+1/r0+2/r0+3 cols J-N
            // ANTES do loop. O dias.forEach a seguir SOBRESCREVE r0+1/r0+2
            // só quando há corTop/corBot. Resultado: dias sem previsto OU
            // além do cutoff ficam 100% brancos; dias com previsto recebem
            // azul (r0+1) + status (r0+2); sem template-bleed.
            // Mantém cols 15-16 (Sáb/Dom) intactas — o cinza_fds Rev. 1893
            // foi aplicado antes via pintaCinzaFds(r0) (L1361/1365).
            const BRANCO = "FFFFFFFF";
            for (let cIdx = 10; cIdx <= 14; cIdx++) {
              for (let dr = 0; dr < ROWS_PER_TASK; dr++) {
                ws.getCell(r0 + dr, cIdx).fill = {
                  type: "pattern", pattern: "solid", fgColor: { argb: BRANCO },
                } as any;
              }
            }
            dias.forEach((d, _di) => {
              // Rev. 1926 — cIdx por DIA DA SEMANA real (espelha L9 header).
              // Antes: `10 + di` (sequencial) desalinhava semanas que não
              // começam na seg (ex: Sex→Qui), fazendo Wed/Thu vazar pra
              // cols Sáb/Dom e sobrescrever o cinza_fds.
              const cIdx = dowToExcelCol(d.getDay());
              const f = faixasCelula(
                d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje, calMSP,
                m?.aderenciaPct ?? null, m?.metaPct ?? 0, temAvSemX, acumAteSemX, inicioSemanaCorrente,
                diasExtrasAtvExp, cutoffStrGlobal,
              );
              // Rev. 1886 — PARA EXPORT: TOP sempre azul quando há previsto p/ o
              // dia (= o cliente pediu "previsto sempre vem azul na célula
              // superior"). O sinal de ATRASADO ("previsto que passou sem
              // execução") migra do TOP para o BOTTOM em vermelho — assim a
              // linha de baixo concentra todos os status de execução
              // (verde/vermelho/laranja/amarelo) e a linha de cima sempre
              // representa o PLANO (azul).
              let topCls = f.top;
              let botCls = f.bottom;
              if (f.top === "bg-red-500" && !f.bottom) {
                topCls = "bg-blue-800";
                botCls = "bg-red-500";
              }
              const corTop = corClassToHex(topCls);
              const corBot = corClassToHex(botCls);
              // Rev. 1895 — User (16/05/2026, 2 screenshots): "O PREVISTO EM
              // AZUL EM CIMA ESTA CORRETO, POREM ABAIXO A COR IRÁ VARIAR
              // CONFORME INDICADO NA LEGENDA.. MAS NÃO TEM COR AZUL E EM CIMA
              // COMO ESTA ACONTECENDO HOJE". O bloco anterior espelhava a
              // ÚNICA faixa existente nas DUAS linhas (barra cheia 2-rows)
              // — isso violava o conceito LOTUS: TOPO = PLANO (azul) + BAIXO
              // = STATUS (verde/vermelho/laranja/amarelo) ou VAZIO. Agora:
              // r0+1 (topo) recebe APENAS corTop; r0+2 (baixo) recebe APENAS
              // corBot. Sem espelhamento — célula com só previsto fica meia
              // pintada (faixa superior azul + faixa inferior branca).
              if (corTop) {
                ws.getCell(r0 + 1, cIdx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corTop } } as any;
              }
              if (corBot) {
                ws.getCell(r0 + 2, cIdx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corBot } } as any;
              }
            });
            // Rev. 1897/1904 — O reforço defensivo de margens BRANCAS em
            // r0/r0+3 foi PROMOVIDO p/ ANTES do loop (Rev. 1904 acima),
            // cobrindo r0/r0+1/r0+2/r0+3 — não precisa mais aqui (o paint
            // do dias.forEach sobrescreve r0+1/r0+2 quando há corTop/corBot,
            // r0/r0+3 sempre permanecem BRANCAS porque o loop não toca
            // elas). Mantida a regra "não toca 15-16 (Sáb/Dom) p/ preservar
            // cinza_fds Rev. 1893" — o reset Rev. 1904 também é cIdx 10-14.
          }
        });

        // 10f. Insere os 3 logos do cadastro
        insertLogos(ws);
      };

      // 11. Cumulativo: gera abas da semana 1 até a semana SELECIONADA, na ordem.
      //     ORDEM CRÍTICA: pré-clonar TODAS as N-1 abas adicionais ANTES de
      //     preencher qualquer uma. Se preenchêssemos `tplWs` primeiro e depois
      //     clonássemos a partir dela, as abas 2..N herdariam dados/estilos da
      //     semana 1 (cabeçalho, valores nas células, slots extras criados
      //     dinamicamente). Clonando do `tplWs` puro garantimos que cada aba
      //     parte do TEMPLATE PRISTINO.
      const semanasParaExportar = semanas.slice(0, semanaIdx + 1);
      if (semanasParaExportar.length === 0) throw new Error("Nenhuma semana disponível para exportar");

      const abasParaPreencher: Array<{ ws: any; sem: { numero: number; ini: Date; fim: Date } }> = [];
      // Primeira semana usa a aba template diretamente (preenchida POR ÚLTIMO,
      // depois que todos os clones já foram tirados dela).
      abasParaPreencher.push({ ws: tplWs, sem: semanasParaExportar[0] });
      // Demais semanas: clona do template pristino ANTES de preencher tplWs
      for (let i = 1; i < semanasParaExportar.length; i++) {
        const sem = semanasParaExportar[i];
        const numStr = String(sem.numero).padStart(2, "0");
        const newWs = cloneSheetFromTemplate(`SEMANA ${numStr} - FC`);
        abasParaPreencher.push({ ws: newWs, sem });
      }
      // Renomeia a aba da primeira semana e preenche todas (na ordem cronológica)
      const numStr0 = String(semanasParaExportar[0].numero).padStart(2, "0");
      tplWs.name = `SEMANA ${numStr0} - FC`;
      for (const { ws, sem } of abasParaPreencher) {
        preencherAba(ws, calcSemana(sem));
      }

      // 12. Salva e dispara download.
      // Rev. 1823 — naming agora respeita o NOME DA OBRA (ex.:
      // "QIU-2-FASE-4-PSEM-FC-26-05-15.xlsx") em vez do hardcoded "REVTE".
      // Sanitiza acentos/espaços/caracteres inválidos pra nome de arquivo.
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const today = new Date();
      const yy = String(today.getFullYear()).slice(-2);
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const slugObra = (nomeProjeto ?? "OBRA")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toUpperCase()
        .slice(0, 60) || "OBRA";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugObra}-PSEM-FC-${yy}-${mm}-${dd}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel exportado", description: `${semanasParaExportar.length} semana(s) — ${a.download}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao exportar Excel", description: e.message });
    }
  };

  const handleExportPDF = () => {
    // Usa o print do navegador — o CSS @media print abaixo já está otimizado.
    window.print();
  };

  if (!semana) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        Nenhuma semana disponível. Importe um cronograma primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar (oculta no print) */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onSemanaChange(Math.max(0, semanaIdx - 1))} disabled={semanaIdx === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-slate-700">
            Semana {semana.numero} — {periodoStr}
          </span>
          <Button variant="outline" size="sm" onClick={() => onSemanaChange(Math.min(semanas.length - 1, semanaIdx + 1))} disabled={semanaIdx >= semanas.length - 1}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={setRealDates.isPending}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Printer className="h-4 w-4 mr-1.5" /> PDF / Imprimir
          </Button>
        </div>
      </div>

      {/* Linha de navegação rápida — mesmo padrão do FC */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin print:hidden">
        {semanas.map((s, i) => {
          const hojeStr = dateStr(hoje);
          const isCurrent = dateStr(s.ini) <= hojeStr && dateStr(s.fim) >= hojeStr;
          return (
            <button
              key={s.numero}
              onClick={() => onSemanaChange(i)}
              title={`Sem. ${s.numero} — ${String(s.ini.getDate()).padStart(2,"0")}/${String(s.ini.getMonth()+1).padStart(2,"0")}/${s.ini.getFullYear()} a ${String(s.fim.getDate()).padStart(2,"0")}/${String(s.fim.getMonth()+1).padStart(2,"0")}/${s.fim.getFullYear()}`}
              className={`h-6 min-w-[36px] px-1.5 text-[10px] font-bold rounded border shrink-0 transition-colors flex items-center justify-center
                ${i === semanaIdx
                  ? "bg-blue-600 text-white border-blue-600"
                  : isCurrent
                    ? "bg-red-500 text-white border-red-600"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
            >
              {s.numero}
            </button>
          );
        })}
      </div>

      {/* Folha imprimível (modelo LOTUS) */}
      <div id="lotus-print-area" className="bg-white border border-slate-300 rounded-md overflow-hidden print:border-0 print:rounded-none">
        {/* Cabeçalho com logos (altura fixa pra evitar que imagens grandes estiquem o container) */}
        <div className="flex items-center border-b-2 border-slate-800 h-[72px]">
          <div className="flex-1 flex items-center justify-center px-4 h-full">
            <div className="text-center">
              <div className="text-[15px] font-bold tracking-tight text-slate-900 uppercase">
                Programação Semanal — {nomeProjeto} — {semana.numero}ª SEMANA
              </div>
              <div className="text-[12px] text-slate-700 mt-0.5">{periodoStr}</div>
              {nomeCliente && <div className="text-[11px] text-slate-500 mt-0.5">Cliente: {nomeCliente}</div>}
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 h-full border-l border-slate-300 bg-slate-50">
            {gerenciadoraLogoUrl ? (
              <img src={gerenciadoraLogoUrl} alt={gerenciadoraNome || "Gerenciadora"} className="max-h-10 max-w-[110px] w-auto h-auto object-contain" />
            ) : gerenciadoraNome ? (
              <div className="text-[10px] font-semibold text-slate-600 px-2 py-1 border border-dashed border-slate-300 rounded">{gerenciadoraNome}</div>
            ) : null}
            {clienteLogoUrl && <img src={clienteLogoUrl} alt={nomeCliente} className="max-h-10 max-w-[110px] w-auto h-auto object-contain" />}
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400">
                <th rowSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold w-12">ITEM</th>
                <th rowSpan={2} className="border border-slate-300 px-2 py-1 text-left font-bold min-w-[260px]">TAREFA</th>
                <th colSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold">DATA</th>
                <th colSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold">Real</th>
                {/* Rev. 1664 — META SEMANAL agrupada em 3 colunas: Prev. / Real. / Δ.
                     Prev = quanto deveria avançar nesta semana (PV semanal × peso).
                     Real = quanto efetivamente avançou (Σ avanços lançados na semana).
                     Δ    = Real − Prev (em pontos percentuais; verde se ≥ 0). */}
                <th colSpan={3} className="border border-slate-300 px-1 py-1 text-center font-bold whitespace-nowrap" title="Meta semanal de avanço físico — Prev (planejado) × Real (executado) × Δ (desvio em pontos percentuais). Base para Aderência (PPC) e Status.">META SEMANAL</th>
                <th rowSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold w-24">RESPONSÁVEL</th>
                <th colSpan={dias.length} className="border border-slate-300 px-1 py-1 text-center font-bold">PERÍODO: {periodoStr}</th>
                <th rowSpan={2} className="border border-slate-300 px-1 py-1 text-center font-bold w-20" title="Status da atividade na semana selecionada">STATUS</th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-400">
                {/* Rev. 1678 — Larguras ampliadas (w-16→w-20) para caber dd/MM/aaaa completo. */}
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-20">Início</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-20">Fim</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-20">Início</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-20">Fim</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-14 whitespace-nowrap" title="Meta planejada na semana (PV semanal × peso financeiro)">Prev.</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-14 whitespace-nowrap" title="Avanço efetivamente lançado na semana (peso × Σ% semanal / 100)">Real.</th>
                <th className="border border-slate-300 px-1 py-1 text-center font-semibold w-14 whitespace-nowrap" title="Desvio em pontos percentuais: Real − Prev. Verde se ≥ 0 (em dia/adiantado), vermelho se &lt; 0 (atrasado).">Δ</th>
                {diasDisplay.map((d, i) => (
                  <th key={i} className="border border-slate-300 px-0.5 py-1 text-center font-semibold w-[60px]">
                    <div className="text-[9px]">{abrevDia(d)}</div>
                    <div className="text-[9px] text-slate-500">{fmtDiaMes(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={11 + dias.length} className="text-center py-8 text-slate-400 text-xs">
                    Nenhuma atividade nesta semana.
                  </td>
                </tr>
              )}
              {linhas.map((l, i) => {
                if (l.tipo === "grupo") {
                  // Rev. 2254 — Indent visual por nivel (mesma hierarquia do
                  // Cronograma). nivel 1 = sem indent; nivel 2+ = +12px por nível.
                  const indentPx = Math.max(0, (l.nivel - 1)) * 12;
                  return (
                    <tr key={`g-${l.nivel}-${l.nome}-${i}`} className="bg-slate-50">
                      <td className="border border-slate-300 px-1 py-1 font-bold text-red-700">{l.eap}</td>
                      <td colSpan={10 + dias.length} className="border border-slate-300 px-2 py-1 font-bold text-red-700 uppercase" style={{ paddingLeft: `${8 + indentPx}px` }}>{l.nome}</td>
                    </tr>
                  );
                }
                const a = l.ativ;
                const m = metricas.get(a.id);
                const tip = tooltipAtiv(a);
                const ant = isAntecipada(a);
                const st = statusLabel(m, ant);
                // Rev. 1680 — Tags CRÍTICA / QUASE CRÍTICA / TOP N (maior peso).
                const isCritica = analiseSemana.criticasIds.has(a.id);
                const isQuaseCrit = analiseSemana.quaseCriticasIds.has(a.id);
                const isMaiorPeso = analiseSemana.maiorPesoIds.has(a.id);
                const topRank = analiseSemana.maiorPesoOrder.get(a.id);
                const contribPp = analiseSemana.contribById.get(a.id) ?? 0;
                // Realce de linha: CRÍTICA > MAIOR PESO > QUASE CRÍTICA > ANTECIPADA.
                const rowBg = isCritica
                  ? "bg-red-50/70"
                  : isMaiorPeso
                    ? "bg-orange-50/60"
                    : isQuaseCrit
                      ? "bg-amber-50/40"
                      : ant
                        ? "bg-orange-50/40"
                        : "";
                return (
                  <tr key={`a-${a.id}`} className={`hover:bg-blue-50/40 ${rowBg}`}>
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700">{a.eapCodigo}</td>
                    <td className="border border-slate-300 px-2 py-1 text-slate-800" title={tip}>
                      <div className="flex items-start gap-1.5 flex-wrap">
                        {isCritica && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600 mt-0.5" />}
                        {!isCritica && isMaiorPeso && <Zap className="h-3 w-3 shrink-0 text-orange-500 mt-0.5" />}
                        <span className={isCritica ? "font-semibold text-red-900" : isMaiorPeso ? "font-semibold text-orange-900" : ""}>
                          {a.nome}
                        </span>
                        {ant && (
                          <span
                            title={`Atividade antecipada: previsto começa em ${fmtBR(a.dataInicio)}, mas houve avanço nesta semana.`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold ring-1 ring-orange-200"
                          >
                            🚀 ANTECIPADA
                          </span>
                        )}
                        {isCritica && (
                          <span
                            title="Caminho crítico: zero folga até o fim do projeto. Qualquer atraso aqui empurra a entrega."
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold ring-1 ring-red-200"
                          >
                            CRÍTICA
                          </span>
                        )}
                        {!isCritica && isQuaseCrit && (
                          <span
                            title="Quase crítica: folga ≤ 14 dias até o fim do projeto. Pouca margem para atraso."
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold ring-1 ring-amber-200"
                          >
                            QUASE CRÍTICA
                          </span>
                        )}
                        {/* Rev. 1786 — Badge LoE/Indireta. Substitui o vermelho "CRÍTICA" para
                            atividades de apoio (admin, mob/desmob, vigilância). PMBOK §6.4.2
                            classifica esse tipo como Level of Effort (LoE) — não consome float
                            e portanto não compõe o caminho crítico. DCMA Assessment #6 reforça. */}
                        {a.isIndireta && (
                          <span
                            title="Indireta / Level of Effort (LoE) — atividade de apoio que NÃO compõe o caminho crítico (PMBOK §6.4.2 / DCMA #6)."
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[9px] font-bold ring-1 ring-slate-300"
                          >
                            INDIRETA (LoE)
                          </span>
                        )}
                        {isMaiorPeso && (
                          <span
                            title={`Top ${topRank} da semana por contribuição ao Previsto: ${contribPp.toFixed(2)}pp (peso financeiro × fração da janela semanal).`}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold ring-1 ring-orange-200"
                          >
                            TOP {topRank} · {contribPp.toFixed(2)}pp
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Rev. 1678 — Datas dd/MM/aaaa (regra de ouro do projeto). */}
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 text-[10px] tabular-nums whitespace-nowrap">
                      {fmtBR(a.dataInicio)}
                    </td>
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 text-[10px] tabular-nums whitespace-nowrap">
                      {fmtBR(a.dataFim)}
                    </td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center print:px-1">
                      <RealDateCell a={a} campo="dataInicioReal" />
                    </td>
                    <td className="border border-slate-300 px-0.5 py-0.5 text-center print:px-1">
                      <RealDateCell a={a} campo="dataFimReal" />
                    </td>
                    {/* Rev. 1664 — META SEMANAL: Prev / Real / Δ */}
                    <td className={`border border-slate-300 px-1 py-1 text-center text-[10px] tabular-nums whitespace-nowrap ${m && m.metaPct > 0 ? "text-slate-800 font-semibold" : "text-slate-400"}`} title={tip}>
                      {m && m.metaPct > 0 ? fmtPct1(m.metaPct) : "—"}
                    </td>
                    <td className={`border border-slate-300 px-1 py-1 text-center text-[10px] tabular-nums whitespace-nowrap ${m && m.realPct > 0 ? "text-emerald-700 font-semibold" : "text-slate-400"}`} title={tip}>
                      {m && (m.realPct > 0 || m.metaPct > 0) ? fmtPct1(m.realPct) : "—"}
                    </td>
                    {(() => {
                      if (!m || (m.metaPct <= 0 && m.realPct <= 0)) {
                        return <td className="border border-slate-300 px-1 py-1 text-center text-[10px] text-slate-400" title={tip}>—</td>;
                      }
                      const delta = m.realPct - m.metaPct;
                      const cls = delta >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold";
                      const sinal = delta > 0 ? "+" : "";
                      return (
                        <td className={`border border-slate-300 px-1 py-1 text-center text-[10px] tabular-nums whitespace-nowrap ${cls}`} title={tip}>
                          {sinal}{fmtPct1(delta)}
                        </td>
                      );
                    })()}
                    <td className="border border-slate-300 px-1 py-1 text-center text-slate-700 text-[10px] uppercase">
                      <input
                        type="text"
                        // Rev. 1818 — Mostra o Responsável RESOLVIDO automaticamente.
                        // PRIORIZA `a.responsavel?.labelCurto` (resolução do servidor,
                        // já filtra valor legado MSP) sobre o raw `responsavelLotus`,
                        // pra eliminar o ruído "CAIO AUGUSTO" herdado do MS Project.
                        // Mantém editável: ao digitar, vira override manual via setRealDates.
                        // Visual idêntico ao histórico (texto preto, sem badge).
                        key={`resp-${a.id}-${a.responsavel?.labelCurto ?? ""}-${a.responsavelLotus ?? ""}`}
                        defaultValue={a.responsavel?.labelCurto || ""}
                        placeholder={a.responsavel?.labelCurto || "FC"}
                        onBlur={(e) => {
                          const novo = e.target.value.trim();
                          // Rev. 1853 — REMOVIDO o caminho `novo === padraoEng`
                          // (engenheiroResponsavel da FC). Bug crítico: quando o
                          // engenheiro do obra é uma empresa terceira (ex.: Rohr),
                          // digitar "Rohr" como Responsável Manual era tratado
                          // como reset → save mandava NULL → resolver caía em FC →
                          // loop infinito (user reclamava: "coloquei a info no
                          // campo mas o link não foi feito"). Agora "default"
                          // abrange 3 caminhos: vazio, "FC"/"FC ENGENHARIA"
                          // (literais triviais), ou label idêntico ao resolvido
                          // pelo contrato terceiro (sem necessidade de override
                          // manual). O cleanup one-shot da Rev. 1846 já purgou
                          // o legado MSP, então o caminho `padraoEng` ficou
                          // obsoleto E ativamente nocivo.
                          const padraoResolvido = (a.responsavel?.labelCurto || "").trim();
                          const padraoResolvidoTipo = a.responsavel?.tipo;
                          const atual = (a.responsavelLotus || "").trim();
                          if (novo === atual) return;
                          const ehDefault =
                            novo === "" ||
                            novo.toLowerCase() === "fc" ||
                            novo.toLowerCase() === "fc engenharia" ||
                            // Só trata como reset se o resolvido vem de fonte
                            // automática (contrato terceiro/externa/FC) — se já
                            // é manual, digitar o mesmo valor mantém manual.
                            (padraoResolvido !== "" &&
                              novo === padraoResolvido &&
                              padraoResolvidoTipo !== "manual");
                          const valor = ehDefault ? null : novo;
                          setRealDates.mutate({
                            atividadeId: a.id,
                            companyId,
                            responsavelLotus: valor,
                          });
                        }}
                        className="w-full bg-transparent text-center text-[10px] uppercase outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-blue-300 rounded px-1 print:bg-transparent print:ring-0"
                        disabled={setRealDates.isPending}
                      />
                    </td>
                    {(() => {
                      // Constantes por atividade — fora do dias.map pra evitar
                      // recálculo a cada um dos 7 dias (sugestão code review Rev 1664).
                      const temAvSem = !!m && m.somaSemanal > 0;
                      const acumAteSem = m?.acumPct ?? 0;
                      const diasExtrasAtv = diasExtrasPorAtv.get(a.id) ?? null;
                      return diasDisplay.map((d, idx) => {
                        const f = faixasCelula(d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje, calMSP, m?.aderenciaPct ?? null, m?.metaPct ?? 0, temAvSem, acumAteSem, inicioSemanaCorrente, diasExtrasAtv, cutoffStrGlobal);
                        // Rev. 1875 — Sáb/dom é clicável para alternar
                        // "trabalhado nesta atividade". Dias úteis padrão
                        // ficam não-clicáveis (cor/pintura é dirigida por
                        // datas previstas/reais + avanços, como sempre).
                        const dow = d.getDay();
                        const dsIso = dateStr(d);
                        const ehFds = dow === 0 || dow === 6;
                        // Rev. 1914 — RESTAURADO: respeitar 100% o calendário MSP.
                        // Reverte a Rev. 1912 parte A. Se o calMSP marca sáb como útil,
                        // a célula NÃO ganha o fundo cinza (continua branca/colorida) e
                        // o clique manual via `podeAlternar` fica naturalmente bloqueado
                        // (não faz sentido "marcar como trabalhado" um dia que já é útil
                        // pelo calendário do projeto). Decisão do usuário 16/05/2026:
                        // "Respeite o calendário que veio do project para não ter erros".
                        const calMarcaUtil = calMSP ? ehDiaUtil(dsIso, calMSP) : !ehFds;
                        const marcadoExtra = !!diasExtrasAtv && diasExtrasAtv.has(dsIso);
                        const podeAlternar = ehFds && !calMarcaUtil; // só sáb/dom não-úteis pelo calendário
                        const tipoCel = marcadoExtra
                          ? `${tip}\n\n☑ Sáb/Dom marcado como trabalhado nesta atividade. Clique para desmarcar.`
                          : podeAlternar
                            ? `${tip}\n\n＋ Clique para marcar este ${dow === 6 ? "sábado" : "domingo"} como trabalhado nesta atividade.`
                            : tip;
                        return (
                          <td
                            key={idx}
                            className={`border border-slate-300 p-0 h-6 align-middle ${podeAlternar ? "cursor-pointer hover:bg-indigo-50 print:hover:bg-transparent print:cursor-default" : ""} ${marcadoExtra ? "bg-indigo-50/40" : ""}`}
                            title={tipoCel}
                            onClick={podeAlternar ? () => {
                              if (toggleDiaExtra.isPending) return;
                              toggleDiaExtra.mutate({ atividadeId: a.id, companyId, data: dsIso });
                            } : undefined}
                          >
                            <div className="flex flex-col gap-[2px] mx-0.5 my-1">
                              <div className={`h-[6px] rounded-sm ${f.top ?? "bg-transparent"}`} />
                              <div className={`h-[6px] rounded-sm ${f.bottom ?? "bg-transparent"}`} />
                            </div>
                          </td>
                        );
                      });
                    })()}
                    <td className={`border border-slate-300 px-1 py-1 text-center text-[10px] whitespace-nowrap ${st.cls}`} title={tip}>
                      {st.txt}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Rev. 1681 — Totalização ACUMULADA (Prev / Real / Δ).
                Paridade absoluta com o Avanço Físico Semanal do FC: o valor
                aqui mostrado é o ACUMULADO do projeto até o fim desta janela
                semanal — mesma fonte do card "PREVISTO (SEMANA)" / "REALIZADO
                (ACUM.)" / "VARIAÇÃO". Não é Σ das colunas Prev./Real. acima
                (que são deltas semanais por atividade). */}
            {linhas.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-500 font-bold">
                  <td
                    colSpan={6}
                    className="border border-slate-300 px-2 py-2 text-right text-[11px] text-slate-800 uppercase tracking-wide"
                    title={`Avanço acumulado do projeto até ${totaisSemana.refFimAcum ? fmtBR(totaisSemana.refFimAcum) : ""} — fonte: ${
                      totaisSemana.fonteOficial === "msp"
                        ? "snapshot MS Project (Texto11/PV oficial)"
                        : totaisSemana.fonteOficial === "linear"
                          ? "interpolação linear por peso financeiro (sem MSP)"
                          : "fallback (sem dados)"
                    }. Bate com o card 'PREVISTO (SEMANA)' / 'REALIZADO (ACUM.)' do Avanço Físico Semanal.`}
                  >
                    Acumulado do projeto até {totaisSemana.refFimAcum ? fmtBR(totaisSemana.refFimAcum) : "—"}
                  </td>
                  <td
                    className="border border-slate-300 px-1 py-2 text-center text-[11px] tabular-nums whitespace-nowrap text-slate-900"
                    title="Previsto acumulado oficial (curva S por atividade, Rev. 1811) — paridade absoluta com card 'PREVISTO (SEMANA)' do FC"
                  >
                    {fmtPct1(totaisSemana.prevAcumOficial)}
                  </td>
                  <td
                    className="border border-slate-300 px-1 py-2 text-center text-[11px] tabular-nums whitespace-nowrap text-emerald-700"
                    title="Realizado acumulado oficial (Σ peso × % acumulado por atividade) — paridade absoluta com card 'REALIZADO (ACUM.)' do FC"
                  >
                    {fmtPct1(totaisSemana.realAcumOficial)}
                  </td>
                  <td
                    className={`border border-slate-300 px-1 py-2 text-center text-[11px] tabular-nums whitespace-nowrap ${
                      totaisSemana.deltaOficial >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                    title="Variação acumulada (Real − Prev) — paridade absoluta com card 'VARIAÇÃO (REAL − PREV.)' do FC"
                  >
                    {`${totaisSemana.deltaOficial > 0 ? "+" : ""}${fmtPct1(totaisSemana.deltaOficial)}`}
                  </td>
                  <td className="border border-slate-300" />
                  <td colSpan={dias.length} className="border border-slate-300" />
                  <td className="border border-slate-300" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Legenda */}
        <div className="border-t border-slate-300 px-3 py-2 bg-white">
          <div className="text-[10px] font-bold text-slate-700 mb-1.5">LEGENDA:</div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10px] text-slate-700">
            {/* Rev. 1680 — Tags do nome da atividade. */}
            <div className="flex items-center gap-1.5" title="Caminho crítico: zero folga até o fim do projeto."><span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold ring-1 ring-red-200">CRÍTICA</span>sem folga (atraso = atrasa entrega)</div>
            <div className="flex items-center gap-1.5" title="Quase crítica: folga ≤ 14 dias."><span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold ring-1 ring-amber-200">QUASE CRÍTICA</span>folga ≤ 14 dias</div>
            <div className="flex items-center gap-1.5" title="Indireta / Level of Effort (PMBOK §6.4.2 / DCMA #6) — não compõe caminho crítico."><span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[9px] font-bold ring-1 ring-slate-300">INDIRETA (LoE)</span>apoio (não entra no caminho crítico)</div>
            <div className="flex items-center gap-1.5" title="Top 3 da semana por contribuição ao Previsto."><span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold ring-1 ring-orange-200">TOP N · X,XXpp</span>maior peso da semana (Top 3)</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-blue-800 rounded-sm border border-slate-400" />PREVISTO</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-green-500 rounded-sm border border-slate-400" />REALIZADO (aderência ≥ {ADERENCIA_THRESHOLD}%)</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-yellow-400 rounded-sm border border-slate-400" />SERVIÇO NÃO PROGRAMADO EXECUTADO</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-orange-400 rounded-sm border border-slate-400" />SERVIÇO EXECUTADO ANTECIPADAMENTE</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-3 bg-red-500 rounded-sm border border-slate-400" />ATRASADO / NÃO EXECUTADO / ADERÊNCIA &lt; {ADERENCIA_THRESHOLD}%</div>
          </div>
          <div className="text-[9px] text-slate-500 mt-1.5">
            <span className="font-semibold">Meta semanal</span> = peso financeiro × (dias úteis da semana ÷ dias úteis do envelope).
            <span className="font-semibold"> Aderência</span> = realizado da semana ÷ meta da semana × 100. Threshold conforme PMBOK 7ª (SPI ≥ 0,95).
          </div>
          {engenheiroResponsavel && (
            <div className="text-[10px] text-slate-500 mt-2">
              Engenheiro Responsável: <span className="font-semibold text-slate-700">{engenheiroResponsavel}</span>
            </div>
          )}
        </div>
      </div>

      {setRealDates.isPending && (
        <div className="flex items-center gap-2 text-xs text-slate-500 print:hidden">
          <Loader2 className="h-3 w-3 animate-spin" /> Salvando data...
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #lotus-print-area, #lotus-print-area * { visibility: visible; }
          #lotus-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A3 landscape; margin: 8mm; }
        }
      `}</style>
    </div>
  );
}
