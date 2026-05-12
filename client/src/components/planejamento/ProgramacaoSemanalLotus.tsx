import React, { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileSpreadsheet, Printer, ChevronLeft, ChevronRight, AlertTriangle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseCalendarioJson, ehDiaUtil, diasUteisEntre, type CalendarioMSProject } from "@shared/diasUteis";

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
): { top: string | null; bottom: string | null } {
  const ds = dateStr(dia);
  const ehUtil = cal ? ehDiaUtil(ds, cal) : (dia.getDay() !== 0 && dia.getDay() !== 6);
  const inPrev = ehUtil && !!(prevIni && prevFim && ds >= prevIni && ds <= prevFim);
  let inReal = !!(realIni && realFim && ds >= realIni && ds <= realFim);
  const passou = dia.getTime() <= hoje.getTime();
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
      inReal = true;
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
    gerenciadoraNome, gerenciadoraLogoUrl, clienteLogoUrl, engenheiroResponsavel, calendarioJson, projetoStart,
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

  // Filtra atividades que tocam a semana (previsto OU real dentro do range)
  const semIniStr = dias.length ? dateStr(dias[0]) : "";
  const semFimStr = dias.length ? dateStr(dias[dias.length - 1]) : "";

  // Rev. 1677 — Carrega avanços ANTES do filtro pra detectar antecipadas
  // (atividades cujo previsto começa no futuro mas o engenheiro já lançou
  // avanço nesta semana). Antes da Rev. 1677 essas atividades sumiam da
  // tabela LOTUS — agora aparecem com a barra inferior LARANJA conforme
  // a legenda da gerenciadora (SERVIÇO EXECUTADO ANTECIPADAMENTE).
  const { data: avancosLista = [] } = trpc.planejamento.listarAvancos.useQuery(
    { projetoId, revisaoId },
    { enabled: !!projetoId && !!revisaoId },
  );
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
    // Cutoff = mínimo entre semFim e hoje (semana corrente não cobra dias futuros).
    const hojeStr = dateStr(hoje);
    const cutoffStr = hojeStr < semFimStr ? hojeStr : semFimStr;
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
      if (float <= 0) criticasIds.add(a.id);
      else if (float <= 14) quaseCriticasIds.add(a.id);
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

  // Rev. 1679 — Totalização da semana (Prev / Real / Δ).
  // Soma simples das colunas META SEMANAL — cada linha já está em pp do
  // projeto inteiro (peso × fração), então o Σ vira o avanço global da
  // semana (Σ metaPct = PV semanal · Σ realPct = EV semanal · Δ = Real-Prev).
  // Antecipadas entram no Real (têm avanço lançado) mas não no Prev (não
  // estavam no plano da semana) — coerente com a regra Lean já vigente.
  const totaisSemana = useMemo(() => {
    let totalPrev = 0;
    let totalReal = 0;
    for (const a of atividadesDaSemana) {
      const m = metricas.get(a.id);
      if (!m) continue;
      totalPrev += m.metaPct;
      totalReal += m.realPct;
    }
    const totalDelta = totalReal - totalPrev;
    return { totalPrev, totalReal, totalDelta };
  }, [atividadesDaSemana, metricas]);

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

  const handleExportExcel = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Programação Semanal");

      // Helper: número de coluna → letra Excel ("A","B"..."AA"...)
      const colLetter = (n: number): string => {
        let s = "";
        while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
        return s;
      };
      // Estrutura (Rev. 1664):
      //   ITEM(1) TAREFA(2) PrevIni(3) PrevFim(4) RealIni(5) RealFim(6)
      //   MetaPrev(7) MetaReal(8) MetaΔ(9) RESP(10) Dias(11..10+N) STATUS(11+N)
      const totalCols = 11 + dias.length;
      const lastCol = colLetter(totalCols);

      // Header (3 linhas)
      ws.mergeCells(`A1:${lastCol}1`);
      const titleCell = ws.getCell("A1");
      titleCell.value = `PROGRAMAÇÃO SEMANAL - ${nomeProjeto.toUpperCase()} - ${periodoStr}`;
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 28;

      // Linha de cabeçalhos
      const headerRow = 3;
      ws.getRow(headerRow).values = [
        "ITEM", "TAREFA",
        "Previsto Início", "Previsto Fim",
        "Real Início", "Real Fim",
        "META SEM. PREV. %", "META SEM. REAL %", "META SEM. Δ pp",
        "RESPONSÁVEL",
        ...dias.map((d) => `${abrevDia(d)} ${fmtDiaMes(d)}`),
        "STATUS",
      ];
      const hr = ws.getRow(headerRow);
      hr.font = { bold: true };
      hr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      hr.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
        c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      });

      // Dados
      const corHex: Record<string, string> = {
        "bg-blue-800":   "FF1E40AF",
        "bg-green-500":  "FF22C55E",
        "bg-yellow-400": "FFFACC15",
        "bg-orange-400": "FFFB923C",
        "bg-red-500":    "FFEF4444",
      };
      // Rev. 1664 — META SEMANAL agora ocupa 3 colunas (Prev/Real/Δ).
      // ITEM(1) TAREFA(2) PrevIni(3) PrevFim(4) RealIni(5) RealFim(6)
      // MetaPrev(7) MetaReal(8) MetaΔ(9) RESP(10) Dias(11..10+N) STATUS(11+N)
      const diasColStart = 11;
      const statusCol = 11 + dias.length;
      let r = headerRow + 1;
      linhas.forEach((l) => {
        if (l.tipo === "grupo") {
          ws.getRow(r).values = [l.eap, l.nome.toUpperCase()];
          ws.getRow(r).font = { bold: true, color: { argb: "FFB91C1C" } };
          ws.getRow(r).alignment = { vertical: "middle" };
        } else {
          const a = l.ativ;
          const m = metricas.get(a.id);
          const ant = isAntecipada(a);
          const st = statusLabel(m, ant);
          const metaPrevTxt = m && m.metaPct > 0 ? fmtPct1(m.metaPct) : "—";
          const metaRealTxt = m && (m.realPct > 0 || m.metaPct > 0) ? fmtPct1(m.realPct) : "—";
          const metaDeltaTxt = (() => {
            if (!m || (m.metaPct <= 0 && m.realPct <= 0)) return "—";
            const d = m.realPct - m.metaPct;
            return `${d > 0 ? "+" : ""}${fmtPct1(d)}`;
          })();
          ws.getRow(r).values = [
            a.eapCodigo, a.nome,
            fmtBR(a.dataInicio), fmtBR(a.dataFim),
            fmtBR(a.dataInicioReal), fmtBR(a.dataFimReal),
            metaPrevTxt, metaRealTxt, metaDeltaTxt,
            (a.responsavelLotus ?? engenheiroResponsavel) || "—",
            ...dias.map(() => ""),
            st.txt,
          ];
          // Cor do Δ: verde ≥0, vermelho <0
          if (m && (m.metaPct > 0 || m.realPct > 0)) {
            const d = m.realPct - m.metaPct;
            ws.getCell(r, 9).font = { bold: true, color: { argb: d >= 0 ? "FF065F46" : "FF991B1B" } };
          }
          const temAvSemX = !!m && m.somaSemanal > 0;
          const acumAteSemX = m?.acumPct ?? 0;
          dias.forEach((d, idx) => {
            const f = faixasCelula(d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje, calMSP, m?.aderenciaPct ?? null, m?.metaPct ?? 0, temAvSemX, acumAteSemX);
            // Excel não suporta faixas internas — prioriza realizado (faixa de
            // baixo). Se só houver previsto, usa a cor do previsto.
            const cor = f.bottom || f.top;
            if (cor) {
              const cell = ws.getCell(r, diasColStart + idx);
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: corHex[cor] || "FF999999" } };
            }
          });
          // Cor de fundo da célula Status conforme classificação
          if (st.txt === "No prazo" || st.txt === "Concluída") {
            ws.getCell(r, statusCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
            ws.getCell(r, statusCol).font = { bold: true, color: { argb: "FF065F46" } };
          } else if (st.txt === "Atrasado" || st.txt === "Não exec.") {
            ws.getCell(r, statusCol).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
            ws.getCell(r, statusCol).font = { bold: true, color: { argb: "FF991B1B" } };
          }
        }
        ws.getRow(r).eachCell({ includeEmpty: true }, (c) => {
          c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
        });
        r++;
      });

      // Rev. 1679 — Linha de totalização (Prev / Real / Δ) no Excel.
      if (linhas.some((l) => l.tipo === "ativ")) {
        const totalPrevTxt = fmtPct1(totaisSemana.totalPrev);
        const totalRealTxt = fmtPct1(totaisSemana.totalReal);
        const totalDeltaTxt = `${totaisSemana.totalDelta > 0 ? "+" : ""}${fmtPct1(totaisSemana.totalDelta)}`;
        // Rótulo na coluna 1 (top-left do merge) — Excel descarta valores
        // das demais células mescladas, então o texto precisa ficar aqui.
        ws.getRow(r).values = [
          "TOTAL DA SEMANA", "", "", "", "", "",
          totalPrevTxt, totalRealTxt, totalDeltaTxt,
          "", ...dias.map(() => ""), "",
        ];
        ws.getRow(r).font = { bold: true };
        ws.getRow(r).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        ws.mergeCells(r, 1, r, 6);
        ws.getCell(r, 1).alignment = { horizontal: "right", vertical: "middle" };
        ws.getCell(r, 8).font = { bold: true, color: { argb: "FF065F46" } };
        ws.getCell(r, 9).font = {
          bold: true,
          color: { argb: totaisSemana.totalDelta >= 0 ? "FF065F46" : "FF991B1B" },
        };
        ws.getRow(r).eachCell({ includeEmpty: true }, (c) => {
          c.border = { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "thin" }, right: { style: "thin" } };
        });
        r++;
      }

      // Larguras
      ws.getColumn(1).width = 8;
      ws.getColumn(2).width = 50;
      [3, 4, 5, 6].forEach((i) => (ws.getColumn(i).width = 12));
      ws.getColumn(7).width = 14;  // META SEM. PREV. %
      ws.getColumn(8).width = 14;  // META SEM. REAL %
      ws.getColumn(9).width = 12;  // META SEM. Δ pp
      ws.getColumn(10).width = 18; // RESPONSÁVEL
      for (let i = 0; i < dias.length; i++) ws.getColumn(diasColStart + i).width = 9;
      ws.getColumn(statusCol).width = 13;

      // Legenda
      r += 2;
      ws.getCell(`A${r}`).value = "LEGENDA:";
      ws.getCell(`A${r}`).font = { bold: true };
      const legenda = [
        ["PREVISTO", "FF1E40AF"],
        ["REALIZADO", "FF22C55E"],
        ["SERVIÇO NÃO PROGRAMADO EXECUTADO", "FFFACC15"],
        ["SERVIÇO EXECUTADO ANTECIPADAMENTE", "FFFB923C"],
        ["ATRASADO / NÃO EXECUTADO", "FFEF4444"],
      ];
      legenda.forEach(([txt, hex], i) => {
        const row = r + 1 + i;
        ws.getCell(`A${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hex } };
        ws.getCell(`B${row}`).value = txt;
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Programacao_Semanal_${nomeProjeto.replace(/\s+/g, "_")}_${periodoStr.replace(/[\/\s]/g, "")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel exportado", description: a.download });
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
                Programação Semanal — {nomeProjeto}
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
                        const f = faixasCelula(d, a.dataInicio, a.dataFim, a.dataInicioReal, a.dataFimReal, hoje, calMSP, m?.aderenciaPct ?? null, m?.metaPct ?? 0, temAvSem, acumAteSem);
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
            {/* Rev. 1679 — Totalização da semana (Prev / Real / Δ). */}
            {linhas.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-500 font-bold">
                  <td colSpan={6} className="border border-slate-300 px-2 py-2 text-right text-[11px] text-slate-800 uppercase tracking-wide">
                    Total da semana
                  </td>
                  <td className="border border-slate-300 px-1 py-2 text-center text-[11px] tabular-nums whitespace-nowrap text-slate-900" title="Σ Prev. — meta planejada da semana (PV semanal do projeto)">
                    {fmtPct1(totaisSemana.totalPrev)}
                  </td>
                  <td className="border border-slate-300 px-1 py-2 text-center text-[11px] tabular-nums whitespace-nowrap text-emerald-700" title="Σ Real. — avanço executado na semana (EV semanal do projeto)">
                    {fmtPct1(totaisSemana.totalReal)}
                  </td>
                  <td
                    className={`border border-slate-300 px-1 py-2 text-center text-[11px] tabular-nums whitespace-nowrap ${
                      totaisSemana.totalDelta >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                    title="Σ Δ — desvio total da semana em pontos percentuais (Real − Prev)"
                  >
                    {`${totaisSemana.totalDelta > 0 ? "+" : ""}${fmtPct1(totaisSemana.totalDelta)}`}
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
