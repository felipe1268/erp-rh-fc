import React, { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, ChevronRight, Calendar, Printer, Loader2,
  Brain, AlertTriangle, Wrench, Users, Package, Clock,
  CheckCircle2, ArrowRight, TrendingDown, Zap, RefreshCcw,
  Home, CalendarRange, HardHat, Truck, CheckCircle, XCircle,
  Info, Hammer, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover as UiPopover, PopoverContent as UiPopoverContent, PopoverTrigger as UiPopoverTrigger } from "@/components/ui/popover";

const n = (v: any) => parseFloat(v) || 0;

// ── Classificação de insumos ──────────────────────────────────────────────────

const PALAVRAS_PESSOA = [
  "servente","pedreiro","mestre","carpinteiro","ferreiro","armador","eletricista",
  "encanador","pintor","operador","ajudante","oficial","encarregado","técnico",
  "topógrafo","instalador","montador","soldador","motorista","almoxarife",
  "auxiliar","trabalhador","operário","vigia","porteiro","gestor","coordenador",
  "engenheiro","arquiteto","fiscal","supervisor","contínuo","faxineiro",
  "serralheiro","rebocador","azulejista","impermeabilizador","jardineiro",
];

const PALAVRAS_EQUIP = [
  "vibrador","compactador","betoneira","bomba","guincho","andaime","escavadeira",
  "retroescavadeira","trator","compressor","furadeira","esmerilhadeira",
  "guindaste","grua","balancim","patrol","motoniveladora","caçamba","caminhão",
  "veículo","carro","equipamento","ferramenta","aparelho","dispositivo",
  "roçadeira","gerador","motosserra","martelete","perfurador","perfuratriz",
  "cortadora","britadeira","mangote","gabarito","forma metálica",
];

function isPessoa(desc: string): boolean {
  const d = desc.toLowerCase();
  return PALAVRAS_PESSOA.some(p => d.includes(p));
}

function isEquipOrcamento(desc: string): boolean {
  const d = desc.toLowerCase();
  return PALAVRAS_EQUIP.some(p => d.includes(p));
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtBR(s?: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function fmtBRDate(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function dateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

interface Week {
  numero: number;
  ini: Date;
  fim: Date;
}

function computeWeeks(atividades: any[]): Week[] {
  const folhas = atividades.filter((a: any) => !a.isGrupo && a.dataInicio && a.dataFim);
  if (!folhas.length) return [];

  const allIni  = folhas.map((a: any) => a.dataInicio).sort();
  const allFim  = folhas.map((a: any) => a.dataFim).sort();
  const minDate = new Date(allIni[0] + "T00:00:00");
  const maxDate = new Date(allFim[allFim.length - 1] + "T00:00:00");

  // Recuar até a segunda-feira da primeira semana
  const firstMon = new Date(minDate);
  const dow = firstMon.getDay();
  firstMon.setDate(firstMon.getDate() - (dow === 0 ? 6 : dow - 1));

  const weeks: Week[] = [];
  let cur = new Date(firstMon);
  let num = 1;
  while (cur <= maxDate) {
    const ini = new Date(cur);
    const fim = new Date(cur);
    fim.setDate(fim.getDate() + 4);
    weeks.push({ numero: num, ini, fim });
    cur.setDate(cur.getDate() + 7);
    num++;
  }
  return weeks;
}

function atividadesDaSemana(atividades: any[], week: Week) {
  const ini = dateStr(week.ini);
  const fim = dateStr(week.fim);
  return atividades.filter((a: any) =>
    !a.isGrupo &&
    a.dataInicio && a.dataFim &&
    a.dataFim >= ini && a.dataInicio <= fim
  );
}

function currentWeekIdx(weeks: Week[]): number {
  // Rev. 1532 — Considera Sáb/Dom ainda como "semana corrente" (Mon-Sun lógico),
  // não cai mais para Semana 1 no fim de semana. Pega a última Week cujo ini <= hoje.
  const today = new Date();
  let lastIdx = -1;
  weeks.forEach((w, i) => { if (w.ini <= today) lastIdx = i; });
  return lastIdx >= 0 ? lastIdx : 0;
}

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  projetoId:   number;
  revisaoId:   number;
  orcamentoId: number | null | undefined;
  companyId:   number;
  nomeProjeto: string;
  nomeCliente: string;
  atividades:  any[];
  avancosMap:  Record<number, number>;
  refisLista?: any[];
  /** Portal mode: hides authenticated-only sections (Recursos do orçamento, JULINHO IA, Modo Relatório). */
  portalMode?: boolean;
  /** Rev. 1532 — Curva S (planejada/baseline + realizada) para computar Realizado e Aderência por semana via delta, em paridade com a aba Avanço Semanal. Opcional: quando ausente, banner mostra apenas Previsto. */
  curvaData?: {
    curvaPlanejada?: { semana: string; acumulado: number }[];
    curvaBaseline?: { semana: string; acumulado: number }[];
    curvaRealizada?: { semana: string; acumulado: number }[];
  } | null;
  /** Rev. 1534 — Janela de Recovery Schedule (AACE 23R-02): em quantas semanas
   * diluir o débito acumulado. Quando undefined, usa default 4. */
  recoveryWindow?: number | null;
  /** Quando definido (modo interno), exibe seletor que persiste no banco via
   * tRPC. Quando undefined (Portal do Cliente), só lê o valor congelado. */
  onChangeRecoveryWindow?: (semanas: number) => void;
}

// ── Cores de status ───────────────────────────────────────────────────────────

function statusColor(atrasada: boolean, avanco: number) {
  if (avanco >= 100) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (atrasada)      return "bg-red-100 text-red-700 border-red-200";
  if (avanco > 0)    return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function statusLabel(atrasada: boolean, avanco: number) {
  if (avanco >= 100) return "Concluída";
  if (atrasada)      return "Atrasada";
  if (avanco > 0)    return "Em execução";
  return "Prevista";
}

function severidadeCor(sev: string) {
  if (sev === "alta")  return "border-l-red-500 bg-red-50";
  if (sev === "media") return "border-l-amber-500 bg-amber-50";
  return "border-l-blue-500 bg-blue-50";
}

function tipoIcon(tipo: string) {
  if (tipo === "recurso")    return <Package className="h-3.5 w-3.5 text-blue-600" />;
  if (tipo === "atraso")     return <TrendingDown className="h-3.5 w-3.5 text-red-600" />;
  if (tipo === "alternativa") return <Zap className="h-3.5 w-3.5 text-amber-600" />;
  return <RefreshCcw className="h-3.5 w-3.5 text-slate-500" />;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProgramacaoSemanal({
  projetoId, revisaoId, orcamentoId, companyId,
  nomeProjeto, nomeCliente, atividades: atividadesProp, avancosMap,
  refisLista = [], portalMode = false, curvaData = null,
  recoveryWindow = null, onChangeRecoveryWindow,
}: Props) {
  // Rev. 1534 — Janela atual de Recovery Schedule (default 4 semanas).
  const janelaRecuperacao = Math.max(1, recoveryWindow ?? 4);
  // Atividades desativadas (a.disabled === true) NÃO devem aparecer em nenhuma
  // parte da Programação Semanal — nem em totais, nem em listagens, nem nos
  // alertas de IA. Filtramos uma única vez aqui para garantir consistência.
  const atividades = useMemo(
    () => (atividadesProp || []).filter((a: any) => !a.disabled),
    [atividadesProp]
  );
  const semanas  = useMemo(() => computeWeeks(atividades), [atividades]);
  const refisSemanas = useMemo(() => {
    const s = new Set<string>();
    refisLista.forEach((r: any) => {
      if (r.semana) s.add(String(r.semana).substring(0, 10));
    });
    return s;
  }, [refisLista]);
  const [idx, setIdx] = useState<number>(() => currentWeekIdx(semanas));
  const [modoRelatorio, setModoRelatorio] = useState(false);
  const [qtdSemanas, setQtdSemanas] = useState(3);
  const [alertas, setAlertas]  = useState<any>(null);
  const [loadIA, setLoadIA]    = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const semanaAtual = semanas[idx];

  const atividadesSemAtualTodas = useMemo(
    () => semanaAtual ? atividadesDaSemana(atividades, semanaAtual) : [],
    [atividades, semanaAtual]
  );

  const atividadesSemAtual = useMemo(
    () => atividadesSemAtualTodas.filter((a: any) => !a.isIndireta),
    [atividadesSemAtualTodas]
  );

  const grupoMap = useMemo(() => {
    const m = new Map<string, string>();
    atividades.forEach((a: any) => {
      if (a.isGrupo && a.eapCodigo) m.set(a.eapCodigo, a.nome);
    });
    return m;
  }, [atividades]);

  const hierarquiaOf = (eap: string | null | undefined): string[] => {
    if (!eap) return [];
    const parts = eap.split(".");
    const chain: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join(".");
      const nome = grupoMap.get(prefix);
      if (nome) chain.push(nome);
    }
    return chain;
  };

  const folhasTodas = useMemo(() => atividades.filter((a: any) => !a.isGrupo && !a.isIndireta), [atividades]);

  // Rev. 1531 — Previsto na semana via OVERLAP (espelha fix Portal Rev. 1528).
  // Atividades multi-semana contribuem proporcionalmente em vez de pelo peso integral.
  const previstoSemanaDelta = useMemo(() => {
    if (!semanaAtual) return 0;
    const semIniMs = semanaAtual.ini.getTime();
    const semFimMs = semanaAtual.fim.getTime() + 3 * 86400000 + 86400000; // Sex+3d=Dom; +1d exclusivo
    let prev = 0;
    folhasTodas.forEach((a: any) => {
      if (!a.dataInicio || !a.dataFim) return;
      const aIni = new Date(a.dataInicio + "T00:00:00").getTime();
      const aFim = new Date(a.dataFim + "T00:00:00").getTime() + 86400000;
      const overlapMs = Math.max(0, Math.min(aFim, semFimMs) - Math.max(aIni, semIniMs));
      const overlapDays = overlapMs / 86400000;
      const dur = (a.duracaoDias && a.duracaoDias > 0) ? a.duracaoDias : Math.max(1, (aFim - aIni) / 86400000);
      prev += n(a.pesoFinanceiro) * (overlapDays / dur);
    });
    return prev;
  }, [folhasTodas, semanaAtual]);

  // Rev. 1532 — Realizado + Aderência da semana via delta da Curva S Realizada,
  // em paridade com a aba Avanço Semanal (mesmas fórmulas, mesmo número).
  // Quando curvaData não está disponível, retorna null e o banner esconde estes campos.
  const evmSemana = useMemo(() => {
    if (!semanaAtual || !curvaData) return null;
    const semIniStr = dateStr(semanaAtual.ini);
    const semAntDate = new Date(semanaAtual.ini.getTime() - 7 * 86400000);
    const semAntStr = dateStr(semAntDate);
    const acumAt = (arr: { semana: string; acumulado: number }[] | undefined, semFim: string): number => {
      if (!arr || !arr.length) return 0;
      const ord = arr.slice().sort((a, b) => a.semana.localeCompare(b.semana));
      let last = 0;
      for (const p of ord) { if (p.semana <= semFim) last = p.acumulado; else break; }
      return last;
    };
    const planejadaArr = (curvaData.curvaPlanejada?.length ? curvaData.curvaPlanejada : curvaData.curvaBaseline) ?? [];
    const realizadaArr = curvaData.curvaRealizada ?? [];
    const planAtual = acumAt(planejadaArr, semIniStr);
    const planAntes = acumAt(planejadaArr, semAntStr);
    const realAtual = acumAt(realizadaArr, semIniStr);
    const realAntes = acumAt(realizadaArr, semAntStr);
    const previstoCurvaS = Math.max(0, planAtual - planAntes);
    const realizado = Math.max(0, realAtual - realAntes);
    const aderencia = previstoCurvaS > 0 ? (realizado / previstoCurvaS) * 100 : null;
    // Rev. 1533 — Débito acumulado (Schedule Variance negativo) até o fim da
    // SEMANA ANTERIOR, baseado em PMBOK 7ª/AACE 23R-02 (Recovery Schedule).
    // PV é IMUTÁVEL (baseline). Débito é métrica gerencial, não substitui PV.
    // Meta de Recuperação = Previsto da semana + Débito acumulado anterior →
    // o quanto entregar HOJE para zerar atraso. Se 0 = obra em dia.
    const debitoAcumulado = Math.max(0, planAntes - realAntes);
    const metaRecuperacao = previstoCurvaS + debitoAcumulado; // meta agressiva (1 sem)
    // Rev. 1534 — Meta DILUÍDA em N semanas (Recovery Schedule, AACE 23R-02):
    // o engenheiro escolhe a janela; a cobrança vira factível em vez de cair
    // tudo numa única semana.
    const metaDiluida = previstoCurvaS + (debitoAcumulado / janelaRecuperacao);
    // Data prevista de convergência: fim da semana atual + N semanas.
    const semanaFimDate = new Date(semanaAtual.fim.getTime() + janelaRecuperacao * 7 * 86400000);
    const dataConvergencia = semanaFimDate.toLocaleDateString("pt-BR");
    // Janela mínima viável (camada 2): com base no MAIOR delta semanal já
    // realizado vs MÉDIA dos baselines semanais (últimos 6 períodos). Se a
    // capacidade comprovada não supera o baseline (folga≤0), retorna null.
    let janelaMinima: number | null = null;
    if (debitoAcumulado > 0.01 && realizadaArr.length >= 2 && planejadaArr.length >= 2) {
      const deltasReal: number[] = [];
      const ordReal = realizadaArr.slice().sort((a, b) => a.semana.localeCompare(b.semana));
      for (let i = 1; i < ordReal.length; i++) {
        deltasReal.push(Math.max(0, ordReal[i].acumulado - ordReal[i - 1].acumulado));
      }
      const deltasPrev: number[] = [];
      const ordPrev = planejadaArr.slice().sort((a, b) => a.semana.localeCompare(b.semana));
      for (let i = 1; i < ordPrev.length; i++) {
        deltasPrev.push(Math.max(0, ordPrev[i].acumulado - ordPrev[i - 1].acumulado));
      }
      const ult6Real = deltasReal.slice(-6);
      const ult6Prev = deltasPrev.slice(-6);
      const ritmoMaxReal = ult6Real.length ? Math.max(...ult6Real) : 0;
      const baselineMedio = ult6Prev.length ? ult6Prev.reduce((s, x) => s + x, 0) / ult6Prev.length : 0;
      const folga = ritmoMaxReal - baselineMedio;
      if (folga > 0.05) {
        janelaMinima = Math.max(1, Math.ceil(debitoAcumulado / folga));
      }
    }
    return {
      previstoCurvaS, realizado, aderencia,
      debitoAcumulado, metaRecuperacao, metaDiluida,
      dataConvergencia, janelaMinima,
    };
  }, [semanaAtual, curvaData, janelaRecuperacao]);

  // Rev. 1544 — "MAIOR PESO da semana" agora usa CONTRIBUIÇÃO em pp na semana
  // (peso% × ΔPrev_semana / 100), não peso TOTAL no projeto. Antes, atividades
  // multi-semana com peso projeto alto (ex. "Locação de gradil" 8,83% durando
  // 13 meses) eram destacadas mesmo contribuindo com apenas ~0,05pp na semana,
  // enquanto "Tapume autoportante" (peso projeto 0,45% × Prev 36% = 0,16pp,
  // 3× mais relevante) ficava sem destaque. Ranqueamos por contribuição real.
  //
  // Last Planner System (Lean Construction): Top 3 a 5 'constraints' por
  // semana é o sweet spot gerencial. Adotamos Top 3.
  //
  // CPM/Goldratt: atividades com float ≤ 0 (sem folga até o fim do projeto)
  // recebem badge CRÍTICA separado. Float ≤ 14 dias = QUASE CRÍTICA.
  // Float é calculado igual à aba 'Caminho Crítico' (projectEnd − dataFim).
  const pesoSemana = useMemo(() => {
    const indiretas = atividadesSemAtualTodas.filter((a: any) => a.isIndireta);
    const pesoTotal = folhasTodas.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0) || 1;
    const somaSemana = atividadesSemAtual.reduce((s: number, a: any) => s + n(a.pesoFinanceiro), 0);
    const pctSemana = (somaSemana / pesoTotal) * 100;

    // projectEnd para cálculo de float (mesma lógica da aba Caminho Crítico)
    const projectEndStr = folhasTodas
      .map((a: any) => a.dataFim)
      .filter(Boolean)
      .sort()
      .pop();
    const projectEndMs = projectEndStr ? new Date(projectEndStr + "T12:00:00").getTime() : 0;

    // Janela calendário Mon-Dom (mesma do per-row e do cabeçalho)
    const semIniMs = semanaAtual ? semanaAtual.ini.getTime() : 0;
    const domingo = semanaAtual ? new Date(semanaAtual.fim) : null;
    if (domingo) { domingo.setDate(domingo.getDate() + 2); domingo.setHours(23, 59, 59, 999); }
    const semFimMs = domingo ? domingo.getTime() : 0;

    // Calcula contribuição em pp e float por atividade
    const enriched = atividadesSemAtual.map((a: any) => {
      let contribSemana = 0;
      if (a.dataInicio && a.dataFim && semIniMs && semFimMs) {
        const ini = new Date(a.dataInicio + "T12:00:00").getTime();
        const fim = new Date(a.dataFim    + "T12:00:00").getTime();
        const interp = (ref: number) => {
          if (ref >= fim) return 100;
          if (ref <= ini) return 0;
          return ((ref - ini) / (fim - ini)) * 100;
        };
        const dPrev = interp(semFimMs) - interp(semIniMs);
        contribSemana = n(a.pesoFinanceiro) * dPrev / 100; // em pp
      }
      const fimMs = a.dataFim ? new Date(a.dataFim + "T12:00:00").getTime() : 0;
      const float = (projectEndMs && fimMs)
        ? Math.round((projectEndMs - fimMs) / 86400000)
        : 999;
      return { id: a.id, contribSemana, float };
    });

    // Top 3 por contribuição (filtra contribuições > 0 — sem destaque pra zero)
    const top3 = [...enriched]
      .filter(x => x.contribSemana > 0.001)
      .sort((a, b) => b.contribSemana - a.contribSemana)
      .slice(0, 3);
    const maiorPesoIds = new Set<number>(top3.map(x => x.id));
    const contribById  = new Map<number, number>(enriched.map(x => [x.id, x.contribSemana]));
    const maiorContribVal = top3[0]?.contribSemana ?? 0;

    // Críticas / quase críticas (zero ou pouca folga até o fim do projeto)
    const criticasIds      = new Set<number>(enriched.filter(x => x.float <= 0).map(x => x.id));
    const quaseCriticasIds = new Set<number>(enriched.filter(x => x.float > 0 && x.float <= 14).map(x => x.id));

    return {
      somaSemana, pctSemana,
      maiorPesoIds, maiorContribVal, contribById,
      criticasIds, quaseCriticasIds,
      diretasCount: atividadesSemAtual.length,
      indiretasCount: indiretas.length,
    };
  }, [atividadesSemAtual, atividadesSemAtualTodas, folhasTodas, semanaAtual]);

  // EAP codes for the current week (for resource lookup)
  const eapsDaSemana = useMemo(
    () => [...new Set(atividadesSemAtual.map((a: any) => a.eapCodigo).filter(Boolean))] as string[],
    [atividadesSemAtual]
  );

  // ── Próximas N semanas para o relatório ──────────────────────────────────
  const proximas3 = useMemo(() => {
    const result = [];
    for (let i = idx; i < Math.min(idx + qtdSemanas, semanas.length); i++) {
      result.push({ semana: semanas[i], atividades: atividadesDaSemana(atividades, semanas[i]).filter((a: any) => !a.isIndireta) });
    }
    return result;
  }, [idx, semanas, atividades, qtdSemanas]);

  // ── Recursos do orçamento ─────────────────────────────────────────────────
  const todosEaps = useMemo(() => {
    const eaps = new Set<string>();
    proximas3.forEach(({ atividades: at }) => at.forEach((a: any) => a.eapCodigo && eaps.add(a.eapCodigo)));
    return [...eaps];
  }, [proximas3]);

  const atividadeNomes = useMemo(
    () => [...new Set(
      proximas3.flatMap(({ atividades: at }) => at.map((a: any) => a.nome as string).filter(Boolean))
    )],
    [proximas3]
  );

  const recursosQuery = trpc.planejamento.buscarRecursosSemana.useQuery(
    { companyId, orcamentoId: orcamentoId ?? 0, eapCodigos: todosEaps, atividadeNomes },
    { enabled: !portalMode && !!orcamentoId && (todosEaps.length > 0 || atividadeNomes.length > 0) }
  );

  const recursos = recursosQuery.data;

  // ── Equipamentos do almoxarifado / patrimônio ─────────────────────────────
  const equipQuery = trpc.planejamento.buscarEquipamentosDisponiveis.useQuery(
    { companyId },
    { enabled: !portalMode && companyId > 0 }
  );

  // ── AI alerts mutation ────────────────────────────────────────────────────
  const [iaErro, setIaErro] = useState<string | null>(null);
  const alertasMut = trpc.iaCronograma.alertasSemana.useMutation({
    onSuccess: (data) => { setAlertas(data); setLoadIA(false); setIaErro(null); },
    onError:   (err)  => { setLoadIA(false); setIaErro(err.message ?? "Erro ao consultar a IA."); },
  });

  function gerarAlertas() {
    if (proximas3.length === 0) return;
    setLoadIA(true);
    setAlertas(null);
    alertasMut.mutate({
      projetoId,
      nomeProjeto,
      semanas: proximas3.map(({ semana, atividades: at }) => ({
        numero: semana.numero,
        ini:    dateStr(semana.ini),
        fim:    dateStr(semana.fim),
        atividades: at.map((a: any) => {
          const av = avancosMap[a.id] ?? 0;
          const atrasada = !!a.dataFim && a.dataFim < today && av < 100;
          return {
            eapCodigo:        a.eapCodigo,
            nome:             a.nome,
            dataInicio:       a.dataInicio,
            dataFim:          a.dataFim,
            recursoPrincipal: a.recursoPrincipal,
            avancoPrevisto:   parseFloat(a.pesoFinanceiro ?? "0"),
            avancoReal:       av,
            atrasada,
          };
        }),
        insumos: (recursos?.insumos ?? [])
          .filter((ins: any) => {
            const itensEap = (recursos?.itens ?? []).filter((it: any) =>
              at.some((a: any) => a.eapCodigo === it.eapCodigo) &&
              it.servicoCodigo === ins.composicaoCodigo
            );
            return itensEap.length > 0;
          })
          .map((ins: any) => ({
            descricao:  ins.insumoDescricao ?? "",
            unidade:    ins.unidade ?? "",
            quantidade: ins.quantidade ?? "",
            tipo:       parseFloat(ins.alocacaoMdo ?? "0") > 0 ? "MO" : "MAT",
          })),
      })),
    });
  }

  // ── Impressão ─────────────────────────────────────────────────────────────
  function imprimir() {
    window.print();
  }

  if (!semanas.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <CalendarRange className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Nenhuma atividade com datas no cronograma.</p>
        <p className="text-xs mt-1">Cadastre atividades com início e fim para gerar a programação semanal.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Cabeçalho e navegação ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-700">Programação Semanal</span>
          <span className="text-xs text-slate-400">{semanas.length} semanas no cronograma</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de quantidade de semanas (visível em modo relatório) */}
          {modoRelatorio && (
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2 py-1">
              <span className="text-[10px] text-slate-500 font-medium">Semanas:</span>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => setQtdSemanas(n)}
                  className={`h-5 w-5 text-[10px] font-bold rounded transition-colors ${
                    qtdSemanas === n
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-600 hover:bg-blue-50 border border-slate-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          <Button
            variant="outline" size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { setModoRelatorio(!modoRelatorio); }}
          >
            {modoRelatorio ? <Home className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />}
            {modoRelatorio ? "Visão Semanal" : `Relatório ${qtdSemanas} Semana${qtdSemanas !== 1 ? "s" : ""}`}
          </Button>
          {modoRelatorio && (
            <Button size="sm" className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700" onClick={imprimir}>
              <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
            </Button>
          )}
        </div>
      </div>

      {/* ── Modo: Visão Semanal ─────────────────────────────────────────────── */}
      {!modoRelatorio && (
        <>
          {/* Navegador de semana */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center justify-between gap-3">
            <button
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>

            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-2 mb-0.5">
                <p className="text-xs text-slate-500 font-medium">Semana {semanaAtual?.numero}</p>
                {semanaAtual && dateStr(semanaAtual.ini) <= today && dateStr(semanaAtual.fim) >= today && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Semana Atual
                  </span>
                )}
                {semanaAtual && refisSemanas.has(dateStr(semanaAtual.ini)) && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5">
                    <CheckCircle2 className="h-3 w-3" />
                    REFIS Emitido
                  </span>
                )}
              </div>
              <p className="text-base font-bold text-slate-800">
                {semanaAtual ? `${fmtBRDate(semanaAtual.ini)} — ${fmtBRDate(semanaAtual.fim)}` : "—"}
              </p>
              <p className="text-[11px] text-slate-400">
                Segunda a Sexta · {atividadesSemAtual.length} atividade{atividadesSemAtual.length !== 1 ? "s" : ""}
              </p>
            </div>

            <button
              onClick={() => setIdx(Math.min(semanas.length - 1, idx + 1))}
              disabled={idx === semanas.length - 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>

          {/* Linha de navegação rápida */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {semanas.map((s, i) => {
              const atv = atividadesDaSemana(atividades, s);
              const temAtrasada = atv.some((a: any) => a.dataFim && a.dataFim < today && (avancosMap[a.id] ?? 0) < 100);
              const isCurrent   = dateStr(s.ini) <= today && dateStr(s.fim) >= today;
              const temRefis    = refisSemanas.has(dateStr(s.ini));
              return (
                <button
                  key={s.numero}
                  onClick={() => setIdx(i)}
                  title={`Sem. ${s.numero} — ${fmtBRDate(s.ini)} a ${fmtBRDate(s.fim)}${temRefis ? " ✓ REFIS emitido" : ""}`}
                  className={`h-6 min-w-[36px] px-1.5 text-[10px] font-bold rounded border shrink-0 transition-colors flex items-center gap-0.5
                    ${i === idx
                      ? "bg-blue-600 text-white border-blue-600"
                      : isCurrent
                        ? "bg-red-500 text-white border-red-600"
                        : temRefis
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                          : temAtrasada
                            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                >
                  {temRefis && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  {s.numero}
                </button>
              );
            })}
          </div>

          {/* Rev. 1532 — Banner unificado: Previsto + Realizado + Aderência (SPI sem.)
              em paridade total com a aba Avanço Semanal. Mesmo número, mesmo nome. */}
          {atividadesSemAtual.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-800">
                  Semana {semanaAtual?.numero}
                </span>
              </div>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-600 font-medium">Previsto:</span>
                <span className="text-sm font-bold text-orange-600 tabular-nums">
                  {(evmSemana?.previstoCurvaS ?? previstoSemanaDelta).toFixed(2)}%
                </span>
              </div>
              {evmSemana && (
                <>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-600 font-medium">Realizado:</span>
                    <span className="text-sm font-bold text-emerald-600 tabular-nums">
                      {evmSemana.realizado.toFixed(2)}%
                    </span>
                  </div>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-600 font-medium">Aderência (SPI sem.):</span>
                    <span className={`text-sm font-bold tabular-nums ${evmSemana.aderencia == null ? "text-slate-400" : evmSemana.aderencia >= 95 ? "text-emerald-600" : "text-red-600"}`}>
                      {evmSemana.aderencia == null ? "—" : `${evmSemana.aderencia.toFixed(0)}%`}
                    </span>
                  </div>
                </>
              )}
              <span className="text-slate-300">|</span>
              <div className="text-[11px] text-slate-600">
                <span className="font-medium">{pesoSemana.diretasCount}</span> atividade{pesoSemana.diretasCount !== 1 ? "s" : ""}
              </div>
              {pesoSemana.indiretasCount > 0 && (
                <div className="text-[11px] text-gray-500 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
                  <span className="font-medium">{pesoSemana.indiretasCount}</span> indiretas
                </div>
              )}
            </div>
            {/* Rev. 1534 — Linha 2: Débito + Meta DILUÍDA + Seletor de janela
                (Recovery Schedule, AACE 23R-02). PV permanece imutável. */}
            {evmSemana && evmSemana.debitoAcumulado > 0.01 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1.5 mt-1 border-t border-blue-200/70">
                <div className="flex items-center gap-1.5" title="Quanto a obra ficou devendo das semanas anteriores (PV acumulado − EV acumulado até a semana passada). Não é descontado do baseline; é meta gerencial.">
                  <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-[11px] text-slate-700 font-medium">Atraso a recuperar:</span>
                  <span className="text-sm font-bold text-red-600 tabular-nums">
                    {evmSemana.debitoAcumulado.toFixed(2)}%
                  </span>
                </div>
                <span className="text-slate-300">|</span>
                <div className="flex items-center gap-1.5" title={`Meta semanal DILUÍDA em ${janelaRecuperacao} semanas = Previsto baseline + (Débito ÷ ${janelaRecuperacao}). Cobrança factível, baseline imutável.`}>
                  <Zap className="h-3.5 w-3.5 text-blue-700" />
                  <span className="text-[11px] text-slate-700 font-medium">Meta diluída ({janelaRecuperacao}{janelaRecuperacao === 1 ? " sem" : " sem"}):</span>
                  <span className="text-sm font-bold text-blue-700 tabular-nums">
                    {evmSemana.metaDiluida.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ({evmSemana.previstoCurvaS.toFixed(2)}% baseline + {(evmSemana.debitoAcumulado / janelaRecuperacao).toFixed(2)}%/sem)
                  </span>
                </div>
                {/* Seletor: só engenheiro mexe; cliente vê congelado */}
                {!portalMode && onChangeRecoveryWindow && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-600">Recuperar em</span>
                    <select
                      value={janelaRecuperacao}
                      onChange={(e) => onChangeRecoveryWindow(parseInt(e.target.value))}
                      className="text-[11px] font-semibold border border-blue-300 bg-white rounded px-1.5 py-0.5 text-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      title="Janela de Recovery Schedule. Quanto MAIOR a janela, mais factível a meta semanal. PV (baseline) permanece intacto."
                    >
                      {[1, 2, 4, 6, 8, 12].map(n => (
                        <option key={n} value={n}>{n} sem</option>
                      ))}
                    </select>
                  </div>
                )}
                {!portalMode && evmSemana.janelaMinima != null && (
                  <span
                    className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 cursor-help"
                    title={`Com base no MAIOR avanço semanal já realizado (capacidade comprovada) vs MÉDIA do baseline das últimas 6 semanas. Janela menor que esta provavelmente não é factível.`}
                  >
                    💡 Sugerido: {evmSemana.janelaMinima} sem
                  </span>
                )}
                <span className="text-slate-300">|</span>
                <span className="text-[11px] text-slate-600" title={`Mantendo a meta diluída de ${evmSemana.metaDiluida.toFixed(2)}%/sem, o débito acumulado zera nesta data.`}>
                  📅 Atraso zerado em <strong className="text-slate-800">{evmSemana.dataConvergencia}</strong>
                </span>
                {/* Meta agressiva (1 sem) só pra engenheiro como referência de teto */}
                {!portalMode && janelaRecuperacao > 1 && (
                  <span className="text-[10px] text-slate-400" title="Meta agressiva: cobrar TODO o débito numa única semana. Quase sempre irrealista — exibido só como teto de referência.">
                    (agressiva 1 sem: {evmSemana.metaRecuperacao.toFixed(2)}%)
                  </span>
                )}
              </div>
            )}
            <div className="text-[10px] text-slate-400">
              <strong>Como ler:</strong>{" "}
              {evmSemana
                ? <>&quot;Previsto&quot; e &quot;Realizado&quot; são o <strong>delta da Curva S nesta semana</strong> (o quanto a obra deve / efetivamente avançou de seg a dom). Atividades multi-semana contribuem proporcionalmente.</>
                : <>&quot;Previsto&quot; é estimado pelo <strong>overlap dias × peso ÷ duração</strong> (atividades multi-semana contribuem proporcionalmente). Realizado e Aderência indisponíveis sem histórico de avanços.</>
              }
              {evmSemana && evmSemana.debitoAcumulado > 0.01 && <> O <strong>baseline (PV) é imutável</strong>; o débito é métrica gerencial diluída em {janelaRecuperacao} semanas — não substitui o cronograma original.</>}
              {" "}Peso bruto das atividades ativas: <strong className="tabular-nums">{pesoSemana.somaSemana.toFixed(2)}%</strong>
              {pesoSemana.maiorContribVal > 0 && <> · maior contribuição na semana: <strong>{pesoSemana.maiorContribVal.toFixed(2)}pp</strong></>}
              {pesoSemana.criticasIds.size > 0 && <> · <strong className="text-red-600">{pesoSemana.criticasIds.size} crítica{pesoSemana.criticasIds.size !== 1 ? "s" : ""}</strong> (caminho crítico)</>}
              {pesoSemana.quaseCriticasIds.size > 0 && <> · <strong className="text-amber-600">{pesoSemana.quaseCriticasIds.size} quase crítica{pesoSemana.quaseCriticasIds.size !== 1 ? "s" : ""}</strong> (folga ≤ 14 d)</>}
              {" "}(informativo).
            </div>
            </div>
          )}

          {/* Tabela de atividades */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">
                Atividades da Semana {semanaAtual?.numero}
              </span>
              <span className="text-[10px] text-slate-400 ml-1">
                {atividadesSemAtual.length} atividade{atividadesSemAtual.length !== 1 ? "s" : ""}
              </span>
            </div>

            {atividadesSemAtual.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                Nenhuma atividade prevista para esta semana.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/40 text-left text-[11px] font-semibold text-slate-500">
                      <th className="py-2 px-3 w-16">EAP</th>
                      <th className="py-2 px-3">Atividade</th>
                      <th className="py-2 px-3 w-24">Início</th>
                      <th className="py-2 px-3 w-24">Fim</th>
                      {/* Rev. 1536 — Coluna "Recurso" removida no portal:
                          é texto livre que quase sempre vem vazio (só "—") e
                          os recursos previstos do orçamento já aparecem em
                          bloco próprio abaixo. No módulo interno mantemos. */}
                      {!portalMode && <th className="py-2 px-3 w-28">Recurso</th>}
                      <th className="py-2 px-3 w-20 text-right" title="Peso financeiro da atividade no PROJETO INTEIRO (estático, vem do cronograma). É o BAC% da atividade no EVM.">Peso%</th>
                      <th className="py-2 px-3 w-24 text-right" title="Contribuição em pp ao Previsto DESTA semana = Peso% × ΔPrevisto da semana / 100. Mostra quanto cada atividade efetivamente 'move o ponteiro' no acumulado da semana. Ranking deste valor define o TOP 3 (Last Planner System).">Peso Sem%</th>
                      <th className="py-2 px-3 w-20 text-right" title="% que esta atividade DEVERIA estar concluída até o fim desta semana, calculado linearmente entre data de início e fim">Previsto%</th>
                      <th className="py-2 px-3 w-20 text-right">Real%</th>
                      <th className="py-2 px-3 w-20 text-right" title="Desvio = Real% − Previsto%. Positivo = atividade adiantada (verde). Negativo = atrasada (vermelho). Em semanas futuras o desvio fica em cinza neutro — a atividade ainda nem teve a chance de ser executada.">Desvio</th>
                      <th className="py-2 px-3 w-28 text-right" title={`Quanto esta atividade precisa avançar POR SEMANA para zerar o atraso individual, diluído na janela de Recovery Schedule (${janelaRecuperacao} semanas). Em semanas futuras é zero (atividade ainda não devia ter avançado).`}>Recuperação</th>
                      <th className="py-2 px-3 w-24 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atividadesSemAtual.map((a: any, i: number) => {
                      const av       = avancosMap[a.id] ?? 0;
                      const atrasada = !!a.dataFim && a.dataFim < today && av < 100;
                      const isMaiorPeso  = pesoSemana.maiorPesoIds.has(a.id);
                      const isCritica    = pesoSemana.criticasIds.has(a.id);
                      const isQuaseCrit  = pesoSemana.quaseCriticasIds.has(a.id);
                      const contribPp    = pesoSemana.contribById.get(a.id) ?? 0;

                      // Previsto% individual — % que a atividade DEVERIA estar
                      // concluída no fim desta semana (interpolação linear pela data).
                      // Rev. 1541 — usa DOMINGO 23:59 como fim da semana (mesma janela
                      // calendário Mon-Dom que o cabeçalho 'Previsto/Realizado da semana'
                      // do PlanejamentoDetalhe usa). Antes usávamos a sexta-feira
                      // (semanaAtual.fim), o que escondia atividades começando no
                      // sáb/dom: ex. 'Locação de gradil' inicia 08/05 (sex) — com ref=sex
                      // o per-row dava prevInd=0% e marcava 'em dia', enquanto o
                      // cabeçalho contava 3 dias de overlap (sex→dom) e cobrava o avanço
                      // proporcional. Resultado: cada linha verde, agregado vermelho.
                      // Agora as duas visões usam a MESMA janela calendário.
                      let prevInd = 0;
                      if (a.dataInicio && a.dataFim && semanaAtual?.fim) {
                        const ini = new Date(a.dataInicio + "T12:00:00").getTime();
                        const fim = new Date(a.dataFim    + "T12:00:00").getTime();
                        // Domingo = sexta + 2 dias; usamos 23:59:59 para fechar a semana.
                        const domingo = new Date(semanaAtual.fim);
                        domingo.setDate(domingo.getDate() + 2);
                        domingo.setHours(23, 59, 59, 999);
                        const ref = domingo.getTime();
                        if (ref >= fim)       prevInd = 100;
                        else if (ref > ini)   prevInd = Math.min(100, ((ref - ini) / (fim - ini)) * 100);
                      }
                      // Rev. 1511: Desvio = Real − Previsto. Positivo = adiantada (verde).
                      // Negativo = atrasada (vermelho).
                      // Rev. 1512: Para SEMANAS FUTURAS (que ainda não começaram),
                      // exibir o desvio em CINZA neutro — atividade ainda nem teve a
                      // chance de ser executada, seria injusto pintar de vermelho.
                      const desvio = av - prevInd;
                      const semanaFutura = !!semanaAtual && dateStr(semanaAtual.ini) > today;
                      // Rev. 1542 — Pill visual de aderência por atividade.
                      // Faixa neutra de ±2pp evita "ruído" para microvariações de
                      // arredondamento; > +2pp = adiantada (azul); < −2pp = atrasada
                      // (vermelho); semana futura = cinza neutro.
                      const aderencia = semanaFutura
                        ? { label: "—", icon: "·",  cls: "bg-slate-100 text-slate-500 ring-slate-200" }
                        : desvio >  2 ? { label: "Adiantada", icon: "▲", cls: "bg-blue-50 text-blue-700 ring-blue-200" }
                        : desvio < -2 ? { label: "Atrasada",  icon: "▼", cls: "bg-red-50 text-red-700 ring-red-200" }
                        :               { label: "No prazo",  icon: "●", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
                      const desvioCor = semanaFutura
                        ? "text-slate-400"
                        : desvio >  2  ? "text-blue-600"    :
                          desvio >= -2 ? "text-emerald-600" :
                          desvio >= -10 ? "text-amber-600"  :
                                          "text-red-600";
                      // Rev. 1544 — Realce de linha: CRÍTICA tem prioridade visual
                      // (vermelho) sobre MAIOR PESO (laranja); ambas podem aparecer
                      // simultaneamente nos badges do nome.
                      const rowBg = isCritica
                        ? "bg-red-50/70 border-l-4 border-l-red-500"
                        : isMaiorPeso
                          ? "bg-orange-50/60 border-l-4 border-l-orange-400"
                          : isQuaseCrit
                            ? "bg-amber-50/40 border-l-4 border-l-amber-300"
                            : atrasada
                              ? "bg-red-50/40"
                              : i % 2 === 0 ? "bg-white" : "bg-slate-50/30";
                      return (
                        <tr key={a.id ?? i} className={`border-b border-slate-50 ${rowBg}`}>
                          <td className="py-2 px-3 font-mono text-slate-500">{a.eapCodigo ?? "—"}</td>
                          <td className="py-2 px-3 text-slate-800 font-medium max-w-[300px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isCritica && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" />}
                              {!isCritica && isMaiorPeso && <Zap className="h-3 w-3 shrink-0 text-orange-500" />}
                              <span className={`truncate ${isCritica ? "font-semibold text-red-900" : isMaiorPeso ? "font-semibold text-orange-900" : ""}`}>{a.nome}</span>
                              {isCritica && (
                                <span
                                  title="Caminho crítico: zero folga até o fim do projeto. Qualquer atraso aqui empurra a entrega."
                                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[9px] font-bold shrink-0 ring-1 ring-red-200"
                                >
                                  CRÍTICA
                                </span>
                              )}
                              {!isCritica && isQuaseCrit && (
                                <span
                                  title="Quase crítica: folga ≤ 14 dias até o fim do projeto. Pouca margem para atraso."
                                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold shrink-0 ring-1 ring-amber-200"
                                >
                                  QUASE CRÍTICA
                                </span>
                              )}
                              {isMaiorPeso && (
                                <span
                                  title={`Top 3 da semana por contribuição ao Previsto: ${contribPp.toFixed(2)}pp (peso% × fração da atividade nesta semana).`}
                                  className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-bold shrink-0"
                                >
                                  TOP {Array.from(pesoSemana.maiorPesoIds).indexOf(a.id) + 1} · {contribPp.toFixed(2)}pp
                                </span>
                              )}
                            </div>
                            {(() => {
                              const h = hierarquiaOf(a.eapCodigo);
                              return h.length > 0 ? (
                                <div className="text-[9px] text-slate-400 mt-0.5 italic leading-tight truncate">
                                  {h.map((seg, si) => (
                                    <span key={si}>
                                      {si > 0 && <span className="mx-0.5">›</span>}
                                      <span className="text-slate-500 font-medium not-italic">{seg}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{fmtBR(a.dataInicio)}</td>
                          <td className="py-2 px-3 text-slate-600">{fmtBR(a.dataFim)}</td>
                          {!portalMode && (
                            <td className="py-2 px-3 text-slate-500 max-w-[120px] truncate">{a.recursoPrincipal || "—"}</td>
                          )}
                          <td className={`py-2 px-3 text-right font-medium ${isMaiorPeso ? "text-orange-700 font-bold" : "text-slate-600"}`}>{parseFloat(a.pesoFinanceiro ?? "0").toFixed(2)}%</td>
                          <td
                            className={`py-2 px-3 text-right tabular-nums ${
                              contribPp >= 0.10 ? "font-bold text-orange-700" :
                              contribPp >= 0.01 ? "font-semibold text-slate-700" :
                                                  "text-slate-400"
                            }`}
                            title={`Contribuição em pp ao Previsto da semana = ${parseFloat(a.pesoFinanceiro ?? "0").toFixed(2)}% × ΔPrev_semana / 100`}
                          >
                            {contribPp < 0.005 ? "—" : `${contribPp.toFixed(2)}pp`}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-500 tabular-nums">{prevInd.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right font-semibold text-slate-800 tabular-nums">{av.toFixed(1)}%</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={`font-bold tabular-nums ${desvioCor}`}>
                                {desvio > 0 ? "+" : ""}{desvio.toFixed(1)}pp
                              </span>
                              <span
                                title={semanaFutura
                                  ? "Semana futura — atividade ainda não devia ter avançado."
                                  : `${aderencia.label}: Real ${av.toFixed(1)}% vs Previsto ${prevInd.toFixed(1)}% (faixa neutra ±2pp).`}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ring-1 ${aderencia.cls}`}
                              >
                                <span className="leading-none">{aderencia.icon}</span>
                                <span className="leading-none">{aderencia.label}</span>
                              </span>
                            </div>
                          </td>
                          {/* Rev. 1534 — Recuperação por atividade DILUÍDA em N semanas:
                              gap = max(0, Previsto% − Real%); pp/sem = gap ÷ N.
                              Em semanas futuras a atividade nem devia ter avançado, então 0. */}
                          <td className="py-2 px-3 text-right font-semibold tabular-nums" title={`Diluído em ${janelaRecuperacao} semana(s). Gap total: ${semanaFutura ? "0" : Math.max(0, prevInd - av).toFixed(1)}pp.`}>
                            {(() => {
                              const gap = semanaFutura ? 0 : Math.max(0, prevInd - av);
                              if (gap < 0.05) return <span className="text-emerald-600">— em dia</span>;
                              const pps = gap / janelaRecuperacao;
                              return <span className="text-blue-700">+{pps.toFixed(1)}pp/sem</span>;
                            })()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor(atrasada, av)}`}>
                              {statusLabel(atrasada, av)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recursos do orçamento para a semana */}
          {!portalMode && orcamentoId && eapsDaSemana.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/60 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Recursos previstos no orçamento</span>
                {recursosQuery.isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400 ml-1" />}
              </div>
              {recursosQuery.data && (
                <RecursosDaSemana
                  recursos={recursosQuery.data}
                  eapsAtivas={eapsDaSemana}
                  equipDisponiveis={equipQuery.data}
                />
              )}
              {!recursosQuery.data && !recursosQuery.isLoading && (
                <p className="text-xs text-slate-400 p-4">Sem dados de recursos vinculados ao orçamento.</p>
              )}
            </div>
          )}

          {/* Bloco JULINHO Alertas */}
          {!portalMode && (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-50 bg-gradient-to-r from-blue-50 to-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-semibold text-slate-700">JULINHO — Alertas das próximas 3 semanas</span>
              </div>
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1 bg-blue-600 hover:bg-blue-700"
                onClick={gerarAlertas}
                disabled={loadIA}
              >
                {loadIA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                {alertas ? "Reanalisar" : "Analisar"}
              </Button>
            </div>

            {!alertas && !loadIA && !iaErro && (
              <div className="py-8 text-center text-slate-400 text-xs">
                Clique em "Analisar" para o JULINHO avaliar as próximas 3 semanas com base no cronograma.
              </div>
            )}
            {loadIA && (
              <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                Analisando programação das próximas {proximas3.length} semanas…
              </div>
            )}
            {iaErro && !loadIA && (
              <div className="m-4 flex items-start gap-2 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-0.5">Erro ao consultar o JULINHO</div>
                  <div className="text-red-500">{iaErro}</div>
                </div>
              </div>
            )}
            {alertas && <AlertasBlock alertas={alertas} semanas={proximas3.map(p => p.semana)} />}
          </div>
          )}
        </>
      )}

      {/* ── Modo: Relatório 3 Semanas ──────────────────────────────────────── */}
      {modoRelatorio && (
        <RelatorioTresSemanas
          proximas3={proximas3}
          avancosMap={avancosMap}
          today={today}
          nomeProjeto={nomeProjeto}
          nomeCliente={nomeCliente}
          recursos={recursos}
          equipDisponiveis={equipQuery.data}
          alertas={alertas}
          loadIA={loadIA}
          iaErro={iaErro}
          onGerarAlertas={gerarAlertas}
          hierarquiaOf={hierarquiaOf}
          portalMode={portalMode}
        />
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function cruzarComAlmox(nomeEquip: string, disponíveis: any): { almox: any | null; patrim: any | null } {
  const d = nomeEquip.toLowerCase();
  const almox = (disponíveis?.almoxarifado ?? []).find((a: any) =>
    d.split(" ").some((w: string) => w.length > 3 && a.nome.toLowerCase().includes(w))
  ) ?? null;
  const patrim = (disponíveis?.patrimonio ?? []).find((p: any) =>
    d.split(" ").some((w: string) => w.length > 3 && p.nome.toLowerCase().includes(w))
  ) ?? null;
  return { almox, patrim };
}

function RecursosDaSemana({
  recursos, eapsAtivas, equipDisponiveis,
}: {
  recursos: any;
  eapsAtivas: string[];
  equipDisponiveis?: any;
}) {
  const matchedByNome = !!recursos.matchedByNome;
  const itensAtivos = matchedByNome
    ? (recursos.itens ?? [])
    : (recursos.itens ?? []).filter((it: any) => eapsAtivas.includes(it.eapCodigo));
  const servCodes   = new Set(itensAtivos.map((it: any) => it.servicoCodigo).filter(Boolean));
  const insumos     = (recursos.insumos ?? []).filter((ins: any) => servCodes.has(ins.composicaoCodigo));

  // ── Classificação tripartida ──────────────────────────────────────────────
  // MO: itens com alocacaoMdo > 0 E descricao é ofício/pessoa
  // EQUIP: itens com alocacaoMdo > 0 MAS a descricao parece equipamento
  // MAT: itens com alocacaoMat > 0 e alocacaoMdo = 0
  const pessoaMO: any[] = [];
  const equipOrc: any[] = [];
  insumos
    .filter((i: any) => parseFloat(i.alocacaoMdo ?? "0") > 0)
    .forEach((i: any) => {
      const desc = i.insumoDescricao ?? "";
      if (isEquipOrcamento(desc)) equipOrc.push(i);
      else if (isPessoa(desc))    pessoaMO.push(i);
      else                        pessoaMO.push(i); // dúvida → vai p/ MO
    });

  const mat = insumos.filter(
    (i: any) => parseFloat(i.alocacaoMat ?? "0") > 0 && parseFloat(i.alocacaoMdo ?? "0") === 0
  );

  if (!itensAtivos.length) {
    return <p className="text-xs text-slate-400 p-4">Sem recursos de orçamento vinculados a estas atividades.</p>;
  }

  const temAlmoxCadastrado = (equipDisponiveis?.almoxarifado?.length ?? 0) + (equipDisponiveis?.patrimonio?.length ?? 0) > 0;

  return (
    <div className="p-4 space-y-4">
      {matchedByNome && (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>EAPs do cronograma e orçamento não coincidem — recursos buscados por nome da atividade.</span>
        </div>
      )}

      {/* ── MÃO DE OBRA ─ pessoas / equipe ─────────────────────────────────── */}
      {pessoaMO.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <HardHat className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs font-semibold text-blue-700">Mão de Obra</span>
            <span className="text-[10px] text-slate-400">(equipe necessária)</span>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[10px] text-slate-500 border-b border-slate-100">
                <th className="pb-1 font-semibold">Ofício / Função</th>
                <th className="pb-1 font-semibold text-right w-20">Qtd</th>
                <th className="pb-1 font-semibold w-16">Un</th>
              </tr>
            </thead>
            <tbody>
              {pessoaMO.map((i: any, idx: number) => (
                <tr key={idx} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-blue-50/20"}`}>
                  <td className="py-1 text-slate-700 font-medium">{i.insumoDescricao}</td>
                  <td className="py-1 text-right text-slate-600 font-mono">
                    {i.quantidade ? parseFloat(i.quantidade).toFixed(2) : "—"}
                  </td>
                  <td className="py-1 text-slate-400 pl-2">{i.unidade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MATERIAIS ──────────────────────────────────────────────────────── */}
      {mat.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Package className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">Materiais</span>
            <span className="text-[10px] text-slate-400">({mat.length} item{mat.length !== 1 ? "s" : ""})</span>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[10px] text-slate-500 border-b border-slate-100">
                <th className="pb-1 font-semibold">Descrição</th>
                <th className="pb-1 font-semibold text-right w-24">Quantidade</th>
                <th className="pb-1 font-semibold w-16">Un</th>
              </tr>
            </thead>
            <tbody>
              {mat.map((i: any, idx: number) => (
                <tr key={idx} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-amber-50/20"}`}>
                  <td className="py-1 text-slate-700">{i.insumoDescricao}</td>
                  <td className="py-1 text-right text-slate-600 font-mono">
                    {i.quantidade ? parseFloat(i.quantidade).toFixed(2) : "—"}
                  </td>
                  <td className="py-1 text-slate-400 pl-2">{i.unidade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── EQUIPAMENTOS ───────────────────────────────────────────────────── */}
      {(equipOrc.length > 0 || !temAlmoxCadastrado) && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Equipamentos</span>
            {!temAlmoxCadastrado && (
              <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                <Info className="h-2.5 w-2.5" /> Cadastre equipamentos no Almoxarifado para ver disponibilidade
              </span>
            )}
          </div>
          {equipOrc.length > 0 ? (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left text-[10px] text-slate-500 border-b border-slate-100">
                  <th className="pb-1 font-semibold">Equipamento</th>
                  <th className="pb-1 font-semibold text-right w-24">Qtd</th>
                  <th className="pb-1 font-semibold w-16">Un</th>
                  <th className="pb-1 font-semibold w-28 text-center">Disponível</th>
                </tr>
              </thead>
              <tbody>
                {equipOrc.map((i: any, idx: number) => {
                  const { almox, patrim } = cruzarComAlmox(i.insumoDescricao ?? "", equipDisponiveis);
                  const dispAlmox  = almox ? almox.disponivel : null;
                  const dispPatrim = patrim ? patrim.disponivel : null;
                  const temCadastro = almox !== null || patrim !== null;
                  return (
                    <tr key={idx} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-emerald-50/20"}`}>
                      <td className="py-1 text-slate-700 font-medium">{i.insumoDescricao}</td>
                      <td className="py-1 text-right text-slate-600 font-mono">
                        {i.quantidade ? parseFloat(i.quantidade).toFixed(2) : "—"}
                      </td>
                      <td className="py-1 text-slate-400 pl-2">{i.unidade ?? "—"}</td>
                      <td className="py-1 text-center">
                        {!temCadastro ? (
                          <span className="text-[10px] text-slate-400 italic">não cadastrado</span>
                        ) : (dispAlmox || dispPatrim) ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                            <CheckCircle className="h-2.5 w-2.5" />
                            {almox ? `${almox.qtdDisponivel} ${almox.unidade}` : patrim?.local || "Sim"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                            <XCircle className="h-2.5 w-2.5" /> Indisponível
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-[11px] text-slate-400 italic">
              Nenhum equipamento identificado no orçamento para estas atividades. Caso haja concretagem, andaimes ou máquinas — cadastre-os no Almoxarifado para rastrear disponibilidade.
            </p>
          )}
          {/* Patrimônio disponível na empresa */}
          {temAlmoxCadastrado && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Hammer className="h-2.5 w-2.5" /> Patrimônio cadastrado na empresa
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(equipDisponiveis?.patrimonio ?? []).map((p: any, i: number) => (
                  <span
                    key={i}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      p.disponivel
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                  >
                    {p.nome}{p.local ? ` · ${p.local}` : ""}
                    {p.disponivel ? " ✓" : " (indisponível)"}
                  </span>
                ))}
                {(equipDisponiveis?.almoxarifado ?? []).map((a: any, i: number) => (
                  <span
                    key={`alm-${i}`}
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      a.disponivel
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                  >
                    {a.nome} — {a.qtdDisponivel} {a.unidade}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fallback: sem MO, MAT nem EQUIP → mostra composições */}
      {itensAtivos.length > 0 && !pessoaMO.length && !mat.length && !equipOrc.length && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wrench className="h-3 w-3 text-slate-500" />
            <span className="text-[11px] font-semibold text-slate-600">Composições</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {itensAtivos.slice(0, 10).map((it: any, idx: number) => (
              <span key={idx} className="text-[11px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full">
                {it.descricao}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertasBlock({ alertas, semanas }: { alertas: any; semanas: Week[] }) {
  if (!alertas) return null;
  return (
    <div className="p-4 space-y-4">
      {alertas.resumo && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs text-slate-700 leading-relaxed">
          <span className="font-semibold text-slate-800">Síntese executiva: </span>
          {alertas.resumo}
        </div>
      )}
      {alertas.alertas?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Alertas</p>
          {alertas.alertas.map((al: any, i: number) => (
            <div key={i} className={`border-l-4 rounded-r-lg p-3 ${severidadeCor(al.severidade)}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                {tipoIcon(al.tipo)}
                <span className="text-xs font-semibold text-slate-800">{al.titulo}</span>
                {al.semana && <span className="text-[10px] text-slate-500 ml-auto">Sem. {al.semana}</span>}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">{al.descricao}</p>
            </div>
          ))}
        </div>
      )}
      {alertas.frentesAlternativas?.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Frentes alternativas sugeridas</p>
          {alertas.frentesAlternativas.map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
              <Zap className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] text-amber-600 font-semibold">Sem. {f.semana} — </span>
                <span className="text-xs text-slate-700">{f.sugestao}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {alertas.previsaoImpacto && (
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-start gap-2">
          <Clock className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-[11px] font-semibold text-slate-600">Impacto estimado no prazo: </span>
            <span className="text-[11px] text-slate-600">{alertas.previsaoImpacto}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relatório 3 Semanas (tela + print) ──────────────────────────────────────

function RelatorioTresSemanas({
  proximas3, avancosMap, today, nomeProjeto, nomeCliente,
  recursos, equipDisponiveis, alertas, loadIA, iaErro, onGerarAlertas,
  hierarquiaOf, portalMode = false,
}: {
  proximas3: { semana: Week; atividades: any[] }[];
  avancosMap: Record<number, number>;
  today: string;
  nomeProjeto: string;
  nomeCliente: string;
  recursos: any;
  equipDisponiveis?: any;
  alertas: any;
  loadIA: boolean;
  iaErro: string | null;
  onGerarAlertas: () => void;
  hierarquiaOf: (eap: string | null | undefined) => string[];
  portalMode?: boolean;
}) {
  const dataGeracao = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Gerar alertas antes de imprimir */}
      {!portalMode && !alertas && !iaErro && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Brain className="h-4 w-4" />
            Gere os alertas do JULINHO para incluir no relatório
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs" onClick={onGerarAlertas} disabled={loadIA}>
            {loadIA ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
            {loadIA ? "Analisando…" : "Gerar alertas IA"}
          </Button>
        </div>
      )}
      {!portalMode && iaErro && !loadIA && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-[13px]">Erro ao consultar o JULINHO</div>
              <div className="text-[11px] text-red-500 mt-0.5">{iaErro}</div>
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-xs border-red-200 text-red-600 hover:bg-red-100 gap-1" onClick={onGerarAlertas} disabled={loadIA}>
            <RefreshCcw className="h-3 w-3" />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Relatório imprimível */}
      <div id="relatorio-semanal-print" className="bg-white rounded-xl border border-slate-200 overflow-hidden print:rounded-none print:border-none print:shadow-none">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-blue-800 to-blue-900 text-white p-5 print:p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium opacity-70 uppercase tracking-widest mb-1">Programação Semanal</p>
              <h1 className="text-lg font-bold">{nomeProjeto}</h1>
              <p className="text-sm opacity-80">{nomeCliente}</p>
            </div>
            <div className="text-right text-xs opacity-70">
              <p className="font-semibold">FC Engenharia</p>
              <p>Emitido em: {dataGeracao}</p>
              {proximas3.length > 0 && (
                <p className="mt-1">
                  Sem. {proximas3[0].semana.numero} a {proximas3[proximas3.length - 1].semana.numero}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* N colunas de semana */}
        <div className={`grid gap-0 divide-x divide-slate-200 ${
          proximas3.length >= 5 ? "grid-cols-3" :
          proximas3.length === 4 ? "grid-cols-4" :
          proximas3.length === 3 ? "grid-cols-3" :
          proximas3.length === 2 ? "grid-cols-2" : "grid-cols-1"
        } ${proximas3.length >= 5 ? "flex-wrap" : ""}`}>
          {proximas3.map(({ semana, atividades: at }) => {
            const itensEap = (recursos?.itens ?? []).filter((it: any) => at.some((a: any) => a.eapCodigo === it.eapCodigo));
            const servs    = new Set(itensEap.map((it: any) => it.servicoCodigo).filter(Boolean));
            const insEap   = (recursos?.insumos ?? []).filter((ins: any) => servs.has(ins.composicaoCodigo));
            const pessoasEap: any[] = [];
            const equipEap:   any[] = [];
            insEap.filter((i: any) => parseFloat(i.alocacaoMdo ?? "0") > 0).forEach((i: any) => {
              if (isEquipOrcamento(i.insumoDescricao ?? "")) equipEap.push(i);
              else pessoasEap.push(i);
            });
            const matEap   = insEap.filter((i: any) => parseFloat(i.alocacaoMat ?? "0") > 0 && parseFloat(i.alocacaoMdo ?? "0") === 0);
            const atrasadas = at.filter((a: any) => a.dataFim && a.dataFim < today && (avancosMap[a.id] ?? 0) < 100).length;

            return (
              <div key={semana.numero} className="flex flex-col">
                {/* Header da semana */}
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-blue-700">SEMANA {semana.numero}</p>
                    {atrasadas > 0 && (
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">
                        {atrasadas} atrasada{atrasadas !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {fmtBRDate(semana.ini)} a {fmtBRDate(semana.fim)}
                  </p>
                  <p className="text-[10px] text-slate-400">{at.length} atividade{at.length !== 1 ? "s" : ""}</p>
                </div>

                {/* Atividades */}
                <div className="flex-1 px-3 py-2 space-y-1 min-h-[180px]">
                  {at.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic py-4 text-center">Sem atividades</p>
                  )}
                  {at.map((a: any, i: number) => {
                    const av       = avancosMap[a.id] ?? 0;
                    const atrasada = !!a.dataFim && a.dataFim < today && av < 100;
                    return (
                      <div key={a.id ?? i}
                        className={`rounded p-1.5 border text-[11px] ${atrasada ? "bg-red-50 border-red-200" : av >= 100 ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold leading-tight text-slate-700">
                            {a.eapCodigo && <span className="font-mono text-slate-400 mr-1">{a.eapCodigo}</span>}
                            {a.nome}
                          </span>
                          <span className={`shrink-0 text-[10px] font-bold ${atrasada ? "text-red-600" : av >= 100 ? "text-emerald-600" : "text-blue-600"}`}>{av.toFixed(0)}%</span>
                        </div>
                        {(() => {
                          const h = hierarquiaOf(a.eapCodigo);
                          return h.length > 0 ? (
                            <div className="text-[9px] text-slate-400 mt-0.5 leading-tight truncate">
                              {h.map((seg, si) => (
                                <span key={si}>
                                  {si > 0 && <span className="mx-0.5">›</span>}
                                  <span className="text-slate-500 font-medium">{seg}</span>
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          <span>{fmtBR(a.dataInicio)} → {fmtBR(a.dataFim)}</span>
                          {a.recursoPrincipal && <span className="truncate text-slate-400">· {a.recursoPrincipal}</span>}
                          <span className="text-blue-500 font-medium">{n(a.pesoFinanceiro).toFixed(2)}%</span>
                        </div>
                        {/* Barra de progresso mini */}
                        <div className="mt-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${av >= 100 ? "bg-emerald-500" : atrasada ? "bg-red-500" : "bg-blue-500"}`}
                            style={{ width: `${Math.min(100, av)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recursos da semana */}
                {(pessoasEap.length > 0 || matEap.length > 0 || equipEap.length > 0 || itensEap.length > 0) && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-1.5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Package className="h-2.5 w-2.5" /> Recursos necessários
                    </p>
                    {pessoasEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-blue-600 font-medium flex items-center gap-0.5"><HardHat className="h-2.5 w-2.5" /> Mão de obra</p>
                        {pessoasEap.slice(0, 4).map((i: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600 pl-3">• {i.insumoDescricao}</p>
                        ))}
                      </div>
                    )}
                    {matEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-amber-600 font-medium flex items-center gap-0.5"><Package className="h-2.5 w-2.5" /> Materiais</p>
                        {matEap.slice(0, 4).map((i: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600 pl-3">• {i.insumoDescricao}{i.quantidade ? ` (${parseFloat(i.quantidade).toFixed(0)} ${i.unidade ?? ""})` : ""}</p>
                        ))}
                      </div>
                    )}
                    {equipEap.length > 0 && (
                      <div>
                        <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5"><Truck className="h-2.5 w-2.5" /> Equipamentos</p>
                        {equipEap.slice(0, 4).map((i: any, idx: number) => {
                          const { almox, patrim } = cruzarComAlmox(i.insumoDescricao ?? "", equipDisponiveis);
                          const disp = almox?.disponivel || patrim?.disponivel;
                          return (
                            <p key={idx} className="text-[10px] text-slate-600 pl-3 flex items-center gap-1">
                              • {i.insumoDescricao}
                              {(almox || patrim) && (
                                <span className={`text-[9px] font-bold ${disp ? "text-emerald-600" : "text-red-500"}`}>
                                  {disp ? "✓" : "✗"}
                                </span>
                              )}
                            </p>
                          );
                        })}
                      </div>
                    )}
                    {!pessoasEap.length && !matEap.length && !equipEap.length && itensEap.length > 0 && (
                      <div>
                        {itensEap.slice(0, 4).map((it: any, idx: number) => (
                          <p key={idx} className="text-[10px] text-slate-600">• {it.descricao}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Recursos texto (sem orçamento vinculado) */}
                {!recursos && at.some((a: any) => a.recursoPrincipal) && (
                  <div className="px-3 pb-3 pt-2 border-t border-slate-100 space-y-1">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Recursos</p>
                    {[...new Set(at.map((a: any) => a.recursoPrincipal).filter(Boolean))].slice(0, 5).map((r: any, i: number) => (
                      <p key={i} className="text-[10px] text-slate-600">• {r}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Alertas IA no rodapé */}
        {alertas && (
          <div className="border-t border-slate-200 p-5 space-y-4 bg-slate-50/40">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-bold text-slate-700">Análise JULINHO — Alertas e Recomendações</p>
            </div>
            {alertas.resumo && (
              <p className="text-xs text-slate-700 leading-relaxed bg-white border border-slate-100 rounded-lg p-3">
                <span className="font-semibold">Síntese: </span>{alertas.resumo}
              </p>
            )}
            {alertas.alertas?.length > 0 && (
              <div className="grid grid-cols-2 gap-2 print:grid-cols-2">
                {alertas.alertas.map((al: any, i: number) => (
                  <div key={i} className={`border-l-4 rounded-r-lg p-2.5 text-xs ${severidadeCor(al.severidade)}`}>
                    <div className="flex items-center gap-1 mb-0.5">
                      {tipoIcon(al.tipo)}
                      <span className="font-semibold text-slate-800">{al.titulo}</span>
                      {al.semana && <span className="text-[10px] text-slate-400 ml-auto">Sem. {al.semana}</span>}
                    </div>
                    <p className="text-[11px] text-slate-600">{al.descricao}</p>
                  </div>
                ))}
              </div>
            )}
            {alertas.frentesAlternativas?.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Frentes alternativas</p>
                <div className="space-y-1">
                  {alertas.frentesAlternativas.map((f: any, i: number) => (
                    <p key={i} className="text-[11px] text-slate-700 flex items-start gap-1.5">
                      <Zap className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                      <span><strong>Sem. {f.semana}:</strong> {f.sugestao}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            {alertas.previsaoImpacto && (
              <p className="text-[11px] text-slate-600 bg-white border border-slate-100 rounded-lg p-2.5 flex items-start gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span><strong>Impacto estimado:</strong> {alertas.previsaoImpacto}</span>
              </p>
            )}
          </div>
        )}

        {/* Rodapé */}
        <div className="border-t border-slate-200 px-5 py-3 flex justify-between items-center text-[10px] text-slate-400 bg-slate-50">
          <span>FC Engenharia Civil · Sistema ERP RH&amp;DP</span>
          <span>Gerado em {dataGeracao} · Documento confidencial</span>
        </div>
      </div>

      {/* CSS de impressão embutido */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #relatorio-semanal-print, #relatorio-semanal-print * { visibility: visible; }
          #relatorio-semanal-print { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
