import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileSpreadsheet, Printer, ChevronLeft, ChevronRight, AlertTriangle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseCalendarioJson, ehDiaUtil, diasUteisEntre, fracaoDecorridaMs, type CalendarioMSProject } from "@shared/diasUteis";

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
  pesoFinanceiro?: string | number | null;
  responsavelLotus?: string | null;
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
): { top: string | null; bottom: string | null } {
  const ds = dateStr(dia);
  const ehUtil = cal ? ehDiaUtil(ds, cal) : (dia.getDay() !== 0 && dia.getDay() !== 6);
  const inPrev = ehUtil && !!(prevIni && prevFim && ds >= prevIni && ds <= prevFim);
  let inReal = !!(realIni && realFim && ds >= realIni && ds <= realFim);
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

  // Agrupa por EAP-pai (nivel 1 = grupo principal, nivel 2 = subgrupo)
  // Mostra cabeçalhos de grupo na ordem hierárquica.
  type LinhaGrupo = { tipo: "grupo"; eap: string; nome: string; nivel: number };
  type LinhaAtiv = { tipo: "ativ"; ativ: Atividade };
  const linhas: (LinhaGrupo | LinhaAtiv)[] = useMemo(() => {
    const result: (LinhaGrupo | LinhaAtiv)[] = [];
    const gruposEmitidos = new Set<string>();
    const eapPrefixos = (eap: string): string[] => {
      const partes = eap.split(".");
      const out: string[] = [];
      for (let i = 1; i < partes.length; i++) out.push(partes.slice(0, i).join("."));
      return out;
    };
    const grupoMap = new Map<string, Atividade>();
    atividades.forEach((a) => {
      if (a.isGrupo && a.eapCodigo) grupoMap.set(a.eapCodigo, a);
    });
    atividadesDaSemana.forEach((a) => {
      const eap = a.eapCodigo || "";
      const prefixos = eapPrefixos(eap);
      prefixos.forEach((p) => {
        if (!gruposEmitidos.has(p)) {
          const g = grupoMap.get(p);
          if (g) {
            result.push({ tipo: "grupo", eap: p, nome: g.nome, nivel: p.split(".").length });
            gruposEmitidos.add(p);
          }
        }
      });
      result.push({ tipo: "ativ", ativ: a });
    });
    return result;
  }, [atividadesDaSemana, atividades]);

  const handleSetReal = (atividadeId: number, campo: "dataInicioReal" | "dataFimReal", valor: string) => {
    setRealDates.mutate({ atividadeId, companyId, [campo]: valor || null } as any);
  };

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
    for (const a of atividadesDaSemana) {
      const peso = parseFloat(String(a.pesoFinanceiro ?? "0")) || 0;
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
      const realPct = peso * (somaSemanal / 100);
      const aderenciaPct = metaPct > 0 ? (realPct / metaPct) * 100 : null;
      out.set(a.id, { metaPct, realPct, aderenciaPct, acumPct, somaSemanal });
    }
    return out;
  }, [atividadesDaSemana, avancosPorAtv, semIniStr, semFimStr, calMSP, hoje]);

  // Rev. 1680 — Análise da semana: caminho crítico (CPM) + maior peso (Top 3).
  // Replica a lógica do `pesoSemana` da aba Padrão FC (`ProgramacaoSemanal.tsx` ~L641):
  //  • float = (projectEnd − dataFim) em dias corridos. ≤0 = crítica, ≤14 = quase crítica.
  //  • maiorPeso = Top 3 por contribuição em pp na semana (= metaPct, que já
  //    é peso financeiro × fração da janela semanal). Filtra contribuições > 0.
  // projectEnd = maior dataFim de TODAS as atividades do projeto (folhas).
  const analiseSemana = useMemo(() => {
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
  }, [atividades, atividadesDaSemana, metricas]);

  // Rev. 1681 — pvMacro replicado de PlanejamentoDetalhe ~L4893 (FONTE ÚNICA
  // do "Previsto%" do EVM clássico). Garante paridade absoluta com o card
  // "PREVISTO (SEMANA)" / "Previsto (Acum.)" do Avanço Físico Semanal.
  // Mesma fórmula: PV(t) = du(início_projeto → t)/du(envelope) × 100, com
  // snapshot exato do MSP (Texto11) quando refStr === StatusDate gravado.
  const pvMacro = useMemo(() => {
    if (!projetoStart || !projetoFinish || !calMSP) return null as null | ((refStr: string) => number);
    const projIniIso = projetoStart.slice(0, 10);
    const projFimIso = projetoFinish.slice(0, 10);
    const projIniMs = new Date(projIniIso + "T12:00:00").getTime();
    const projFimMs = new Date(projFimIso + "T12:00:00").getTime();
    if (projFimMs <= projIniMs) return null;
    const envOk = !calMSP.envelopeStartSnapshot || !calMSP.envelopeFinishSnapshot
      || (projIniIso === calMSP.envelopeStartSnapshot && projFimIso === calMSP.envelopeFinishSnapshot);
    return (refStr: string): number => {
      if (calMSP.previstoMspSnapshot != null && calMSP.statusDateSnapshot
          && refStr === calMSP.statusDateSnapshot && envOk) {
        return Number(calMSP.previstoMspSnapshot);
      }
      const ref = new Date(refStr + "T12:00:00").getTime();
      return Math.min(100, Math.max(0, fracaoDecorridaMs(projIniMs, ref, projFimMs, calMSP) * 100));
    };
  }, [projetoStart, projetoFinish, calMSP]);

  // Rev. 1681 — Totais OFICIAIS da semana (paridade absoluta com Avanço Físico
  // Semanal do PlanejamentoDetalhe). O TOTAL DA SEMANA mostra o ACUMULADO até
  // o fim da janela visível — mesma semântica do card "PREVISTO (SEMANA)"
  // 1,41% / "REALIZADO (ACUM.)" 1,38% / "VARIAÇÃO" -0,03%.
  //
  //  • Previsto = pvMacro(semFim) — snapshot Texto11/MSP da raiz.
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

    // Previsto ACUMULADO (oficial): pvMacro(refFimAcum) quando MSP disponível;
    // fallback = interpolação linear (mesma fórmula do else de pvMacro
    // L5107-5119 do PlanejamentoDetalhe).
    let prevAcumOficial = 0;
    let fonteOficial: "msp" | "linear" | "fallback" = "fallback";
    if (refFimAcum && pvMacro) {
      prevAcumOficial = pvMacro(refFimAcum);
      fonteOficial = "msp";
    } else if (refFimAcum && folhas.length > 0) {
      const refMs = new Date(refFimAcum + "T12:00:00").getTime();
      for (const a of folhas) {
        const peso = pesoOf(a);
        if (peso === 0 || !a.dataInicio || !a.dataFim) continue;
        const aIni = new Date(a.dataInicio + "T12:00:00").getTime();
        const aFim = new Date(a.dataFim    + "T12:00:00").getTime();
        let exp = 0;
        if (refMs >= aFim)      exp = 100;
        else if (refMs > aIni)  exp = Math.min(100, ((refMs - aIni) / (aFim - aIni)) * 100);
        prevAcumOficial += peso * exp / 100;
      }
      fonteOficial = "linear";
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
  }, [atividades, atividadesDaSemana, avancosPorAtv, metricas, semIniStr, semFimStr, pvMacro, cutoffIso]);

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
            if (cell.style) newCell.style = JSON.parse(JSON.stringify(cell.style));
          });
        });
        // Merges (model.merges é array de strings tipo "B10:C13")
        const mergesArr: string[] = (tplWs as any).model?.merges ?? [];
        mergesArr.forEach((m) => { try { newWs.mergeCells(m); } catch { /* já mesclado */ } });
        return newWs;
      };

      // 5. Helper: limpa imagens existentes da aba e adiciona os 3 logos do cadastro
      //    nas MESMAS posições (TwoCellAnchor) do template original.
      // Posições extraídas do template REVTE-PSEM-FC original:
      //   • Img0 — gerenciadora (LOTUS): cols B-C / rows 2-5
      //   • Img2 — cliente (Santuário): cols I-K / rows 2-4
      //   • Img1 — construtora (FC/proponente): cols N-P / rows 2-5
      const POS_GER = { tl: { col: 1.9999, row: 1.2988 }, br: { col: 3.2851, row: 4.9999 } } as any;
      const POS_CLI = { tl: { col: 8.9999, row: 1.9676 }, br: { col: 11.9999, row: 3.9999 } } as any;
      const POS_EMP = { tl: { col: 13.9999, row: 1.2116 }, br: { col: 15.9999, row: 4.9430 } } as any;
      const insertLogos = (ws: any) => {
        // Limpa imagens herdadas do template (logos do exemplo Santuário/Lotus/FC)
        try {
          if (Array.isArray((ws as any)._media)) {
            (ws as any)._media = (ws as any)._media.filter((m: any) => m?.type !== "image");
          }
        } catch { /* noop */ }
        const addImg = (img: { buf: ArrayBuffer; ext: "png" | "jpeg" } | null, pos: any) => {
          if (!img) return;
          const id = wb.addImage({ buffer: img.buf as any, extension: img.ext });
          ws.addImage(id, pos);
        };
        addImg(imgGer, POS_GER);
        addImg(imgCli, POS_CLI);
        addImg(imgEmp, POS_EMP);
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
          const realPct = peso * (somaSemanal / 100);
          const aderenciaPct = metaPct > 0 ? (realPct / metaPct) * 100 : null;
          mts.set(a.id, { metaPct, realPct, aderenciaPct, acumPct, somaSemanal });
        }
        return { sem, dias, ats, mts, semIni, semFim, temAvSem };
      };

      // 8. Helper: monta lista de linhas (grupos + atividades) na ordem hierárquica
      const grupoMap = new Map<string, Atividade>();
      atividades.forEach((a) => { if (a.isGrupo && a.eapCodigo) grupoMap.set(a.eapCodigo, a); });
      const eapPrefixos = (eap: string): string[] => {
        const partes = eap.split(".");
        const out: string[] = [];
        for (let i = 1; i < partes.length; i++) out.push(partes.slice(0, i).join("."));
        return out;
      };
      type LinhaExp = { tipo: "grupo"; eap: string; nome: string } | { tipo: "ativ"; ativ: Atividade };
      const buildLinhas = (ats: Atividade[]): LinhaExp[] => {
        const out: LinhaExp[] = [];
        const emit = new Set<string>();
        ats.forEach((a) => {
          eapPrefixos(a.eapCodigo || "").forEach((p) => {
            if (!emit.has(p)) {
              const g = grupoMap.get(p);
              if (g) { out.push({ tipo: "grupo", eap: p, nome: g.nome }); emit.add(p); }
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

        // 10a. Cabeçalho (D2 é a âncora do merge D2:K5) — mantém formatação do template
        const tituloCell = ws.getCell("D2");
        const periodo = `${fmtBRDate(sem.ini)} a ${fmtBRDate(sem.fim)}`;
        tituloCell.value = `${(nomeCliente || nomeProjeto).toUpperCase()}\nPROGRAMAÇÃO SEMANAL DE ATIVIDADES\nSEMANA ${String(sem.numero).padStart(2,"0")} · ${periodo}`;

        // 10b. Faixa "PERÍODO" (J7:P7 merged) e datas dos dias (L9 J:P)
        ws.getCell("J7").value = `PERÍODO: ${fmtBRDate(sem.ini)} a ${fmtBRDate(sem.fim)}`;
        for (let i = 0; i < 7; i++) {
          const d = dias[i];
          ws.getCell(9, 10 + i).value = d ? fmtBRDate(d).slice(0, 5) : "";
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
              cells.push(sc.style ? JSON.parse(JSON.stringify(sc.style)) : null);
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
                if (sty) dc.style = JSON.parse(JSON.stringify(sty));
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
        linhasExp.forEach((l, idx) => {
          const r0 = FIRST_TASK_ROW + idx * ROWS_PER_TASK;
          if (l.tipo === "grupo") {
            ws.getCell(r0, 2).value = l.eap;
            ws.getCell(r0, 4).value = l.nome.toUpperCase();
            // Fundo cinza claro para destacar o grupo (mesmo cinza do tema E7E6E6)
            for (let dr = 0; dr < ROWS_PER_TASK; dr++) {
              for (let c = 2; c <= 16; c++) {
                const cell = ws.getCell(r0 + dr, c);
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } } as any;
              }
            }
            // Fonte negrito no nome
            const fontDst = ws.getCell(r0, 4).font || {};
            ws.getCell(r0, 4).font = { ...fontDst, bold: true };
          } else {
            const a = l.ativ;
            ws.getCell(r0, 2).value = a.eapCodigo ?? "";
            ws.getCell(r0, 4).value = a.nome;
            ws.getCell(r0, 5).value = a.dataInicio ? fmtBR(a.dataInicio) : "";
            ws.getCell(r0, 6).value = a.dataFim ? fmtBR(a.dataFim) : "";
            ws.getCell(r0, 7).value = a.dataInicioReal ? fmtBR(a.dataInicioReal) : "";
            ws.getCell(r0, 8).value = a.dataFimReal ? fmtBR(a.dataFimReal) : "";
            ws.getCell(r0, 9).value = a.responsavelLotus ?? engenheiroResponsavel ?? "";

            // Pinta as barras dos dias (J-P) — esquema 4-linhas-por-tarefa do Lotus:
            // r0   = margem branca (topo)
            // r0+1 = faixa Previsto (azul)
            // r0+2 = faixa Realizado (verde/vermelho/laranja/amarelo)
            // r0+3 = margem branca (base)
            const m = mts.get(a.id);
            const temAvSemX = !!m && m.somaSemanal > 0;
            const acumAteSemX = m?.acumPct ?? 0;
            dias.forEach((d, di) => {
              const cIdx = 10 + di; // J=10
              const f = faixasCelula(
                d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje, calMSP,
                m?.aderenciaPct ?? null, m?.metaPct ?? 0, temAvSemX, acumAteSemX, inicioSemanaCorrente,
              );
              const corTop = corClassToHex(f.top);
              const corBot = corClassToHex(f.bottom);
              if (corTop) {
                ws.getCell(r0 + 1, cIdx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corTop } } as any;
              }
              if (corBot) {
                ws.getCell(r0 + 2, cIdx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corBot } } as any;
              }
              // Se só tem uma das faixas, espelha pra ocupar as 2 linhas (barra cheia)
              if (corTop && !corBot) {
                ws.getCell(r0 + 2, cIdx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corTop } } as any;
              } else if (!corTop && corBot) {
                ws.getCell(r0 + 1, cIdx).fill = { type: "pattern", pattern: "solid", fgColor: { argb: corBot } } as any;
              }
            });
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

      // 12. Salva e dispara download (naming padrão Lotus: REVTE-PSEM-FC-AA-MM-DD.xlsx)
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const today = new Date();
      const yy = String(today.getFullYear()).slice(-2);
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const a = document.createElement("a");
      a.href = url;
      a.download = `REVTE-PSEM-FC-${yy}-${mm}-${dd}.xlsx`;
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
                {dias.map((d, i) => (
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
                  return (
                    <tr key={`g-${l.eap}-${i}`} className="bg-slate-50">
                      <td className="border border-slate-300 px-1 py-1 font-bold text-red-700">{l.eap}</td>
                      <td colSpan={10 + dias.length} className="border border-slate-300 px-2 py-1 font-bold text-red-700 uppercase">{l.nome}</td>
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
                        defaultValue={a.responsavelLotus ?? engenheiroResponsavel ?? ""}
                        placeholder={engenheiroResponsavel || "—"}
                        onBlur={(e) => {
                          const novo = e.target.value.trim();
                          const padrao = (engenheiroResponsavel || "").trim();
                          const atual = (a.responsavelLotus || "").trim();
                          // Se igual ao atual (após trim), não envia.
                          if (novo === atual) return;
                          // Se novo == padrão, persiste null pra "voltar ao default".
                          const valor = novo === padrao || novo === "" ? null : novo;
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
                      return dias.map((d, idx) => {
                        const f = faixasCelula(d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje, calMSP, m?.aderenciaPct ?? null, m?.metaPct ?? 0, temAvSem, acumAteSem, inicioSemanaCorrente);
                        return (
                          <td key={idx} className="border border-slate-300 p-0 h-6 align-middle" title={tip}>
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
                    title="Previsto acumulado oficial (pvMacro) — paridade absoluta com card 'PREVISTO (SEMANA)' do FC"
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
