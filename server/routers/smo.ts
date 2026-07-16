import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getEffectiveAllowedObraIds, getCurrentUserEmployeeId } from "../db";
import { eq, and, sql, isNull, desc, inArray, ilike, or } from "drizzle-orm";
import { storagePut } from "../storage";
import {
  smoSolicitacoes, smoAtividadesEap, smoOnboardingChecklist,
  obras, employees, obraFuncionarios, convencaoColetiva,
  encargosSociais, planejamentoProjetos, planejamentoAtividades,
  planejamentoRevisoes, mealBenefitConfigs,
  clientes, employeeIntegrations, companies,
} from "../../drizzle/schema";
import { resolveMealBenefitConfig } from "../services/mealBenefitResolver";

function companyFilter(col: any, input: { companyId: number; companyIds?: number[] }) {
  if (input.companyIds && input.companyIds.length > 0) {
    return inArray(col, input.companyIds);
  }
  return eq(col, input.companyId);
}

const parseBRL = (v: any) => parseFloat(String(v || "0").replace(/\./g, "").replace(",", ".")) || 0;

// Calcula a mediana de uma lista de salários, filtrando outliers grosseiros (> 5× a mediana bruta).
// Usa mediana (não média) para ser robusto a valores incorretos no cadastro.
function calcSalarioMediana(sals: number[]): number {
  if (sals.length === 0) return 0;
  const sorted = [...sals].sort((a, b) => a - b);
  const rawMid = Math.floor(sorted.length / 2);
  const rawMediana = sorted.length % 2 !== 0 ? sorted[rawMid] : (sorted[rawMid - 1] + sorted[rawMid]) / 2;
  // Remove outliers: valores > 5× a mediana bruta (ex: dados cadastrados errados)
  const filtered = sorted.filter(s => s <= rawMediana * 5);
  const arr = filtered.length > 0 ? filtered : sorted;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

// ─────────────────────────────────────────────────────────────────────────
// Rev. 1357 — Encargos por regime (Experiência 45+45 vs Indeterminado)
// CLT Art. 443/445: contrato de experiência até 90 dias (3 meses).
// Nesse período NÃO incidem aviso prévio nem multa de 40% do FGTS se a
// rescisão ocorrer ao término do prazo. Esses encargos estão no GRUPO C
// da tabela `encargos_sociais` ("Encargos ligados à demissão do trabalhador").
// Logo: durante a experiência aplicamos apenas A+B; após o 90º dia aplicamos
// A+B+C (encargos plenos).
// ─────────────────────────────────────────────────────────────────────────
const MESES_EXPERIENCIA = 3;
type RegimeContratacao = "experiencia" | "indeterminado";

function splitEncargosPorGrupo(rows: Array<{ grupo: string | null; valor: any }>) {
  let basicoPerc = 0;   // Grupos A + B (incidem todos os meses)
  let rescisaoPerc = 0; // Grupo C (só após o término da experiência)
  for (const e of rows) {
    const v = parseFloat(String(e.valor) || "0");
    if ((e.grupo || "").toUpperCase() === "C") rescisaoPerc += v;
    else basicoPerc += v;
  }
  return { basicoPerc, rescisaoPerc, totalPerc: basicoPerc + rescisaoPerc };
}

// Recalcula custos da SMO (usado em create e update). Retorna {custoMensal, custoTotal, detalhes}.
async function computeCustoSMO(
  db: any,
  input: { companyId: number; companyIds?: number[] },
  obraId: number,
  funcao: string,
  quantidade: number,
  duracaoMeses: number,
  regime: RegimeContratacao,
) {
  const encargosRows = await db.select().from(encargosSociais).where(companyFilter(encargosSociais.companyId, input));
  let { basicoPerc, rescisaoPerc, totalPerc: totalEncargosPerc } = splitEncargosPorGrupo(encargosRows);
  if (totalEncargosPerc === 0) { basicoPerc = 66.7; rescisaoPerc = 12.6; totalEncargosPerc = 79.3; }

  const [convData] = await db.select().from(convencaoColetiva)
    .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
    .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);

  const convVrDiario = parseFloat(convData?.valeRefeicao || "0");
  const convVaVal = parseFloat(convData?.valeAlimentacao || "0");
  const pisoFallback = parseFloat(convData?.pisoSalarial || "2500");

  const mealCfg = await getMealConfig(db, input, obraId);
  const benef = calcBeneficiosFromConfig(mealCfg, convVrDiario, convVaVal);

  let emps = await db.select({ salarioBase: employees.salarioBase })
    .from(employees)
    .where(and(companyFilter(employees.companyId, input), eq(employees.funcao, funcao), eq(employees.status, "Ativo")));
  if (emps.length === 0) {
    const palavras = funcao.split(/\s+/).filter(p => p.length > 2);
    if (palavras.length > 0) {
      const likePattern = `%${palavras[0]}%`;
      emps = await db.select({ salarioBase: employees.salarioBase })
        .from(employees)
        .where(and(companyFilter(employees.companyId, input), sql`${employees.funcao} ILIKE ${likePattern}`, eq(employees.status, "Ativo")));
    }
  }

  let salarioRef = 0;
  if (emps.length > 0) {
    const sals = emps.map((e: any) => parseBRL(e.salarioBase)).filter((s: number) => s > 0);
    salarioRef = calcSalarioMediana(sals);
  }
  if (salarioRef === 0) salarioRef = pisoFallback;

  // Rev. 4296 — Teto de sanidade: se salarioRef > pisoFallback × 12, provavelmente dado incorreto
  // (ex: salário anual digitado no campo mensal, ou digitação errada). Filtra outliers não capturados
  // pela mediana quando há apenas 1 funcionário na função consultada.
  let alertaSalarioAnomalo = false;
  let salarioRefOriginal = 0;
  const CAP_SALARIO = pisoFallback > 0 ? pisoFallback * 12 : 30000;
  if (salarioRef > CAP_SALARIO) {
    console.warn(`[SMO] salarioRef anomalo para "${funcao}": R$${salarioRef.toFixed(0)} > teto R$${CAP_SALARIO.toFixed(0)}. Usando piso R$${pisoFallback.toFixed(0)}.`);
    salarioRefOriginal = salarioRef;
    salarioRef = pisoFallback > 0 ? pisoFallback : 2500;
    alertaSalarioAnomalo = true;
  }

  const vr = benef.vrMensal;
  const va = benef.vaMensal;
  const vt = salarioRef * 0.06;
  const beneficios = vr + va + vt + 45;
  const dur = duracaoMeses || 1;

  const blended = calcEncargosBlended(basicoPerc, rescisaoPerc, regime, dur);
  const encargosValor = salarioRef * (blended.mediaPerc / 100);
  const encargosValorExp = salarioRef * (blended.mensalExperienciaPerc / 100);
  const encargosValorEf = salarioRef * (blended.mensalEfetivoPerc / 100);
  const custoMensalUnitExperiencia = salarioRef + encargosValorExp + beneficios;
  const custoMensalUnitEfetivo = salarioRef + encargosValorEf + beneficios;
  const custoMensalUnit = salarioRef + encargosValor + beneficios;
  const custoMensal = custoMensalUnit * quantidade;
  const custoUnico = (200 + 350 + 250) * quantidade;
  const folhaPeriodo = (custoMensalUnitExperiencia * blended.mesesExperiencia + custoMensalUnitEfetivo * blended.mesesEfetivo) * quantidade;
  const custoTotal = folhaPeriodo + custoUnico;

  const fatorBDI = 1.35;
  const tercMensal = salarioRef * fatorBDI * quantidade;
  const tercTotal = tercMensal * dur;

  const detalhes = {
    salarioBase: salarioRef,
    regimeContratacao: regime,
    encargosPerc: totalEncargosPerc,
    encargosBasicoPerc: blended.basicoPerc,
    encargosRescisaoPerc: blended.rescisaoPerc,
    encargosMediaPerc: blended.mediaPerc,
    encargosValor,
    encargosValorExperiencia: encargosValorExp,
    encargosValorEfetivo: encargosValorEf,
    mesesExperiencia: blended.mesesExperiencia,
    mesesEfetivo: blended.mesesEfetivo,
    custoMensalUnitExperiencia,
    custoMensalUnitEfetivo,
    beneficios,
    custoMensalUnit,
    custoMensalTotal: custoMensal,
    custoTotal,
    tercMensalTotal: tercMensal,
    tercTotal,
    recomendacao: custoTotal > tercTotal ? "terceirizar" : "contratar",
    baseSalarial: alertaSalarioAnomalo
      ? `ANOMALIA (R$${salarioRefOriginal.toFixed(0)}) → Piso convenção`
      : emps.length > 0 ? "Média ativos" : "Piso convenção",
    alertaSalarioAnomalo,
    salarioRefOriginal: alertaSalarioAnomalo ? salarioRefOriginal : undefined,
    rev: 4296,
  };

  return { custoMensal, custoTotal, detalhes };
}

function calcEncargosBlended(
  basicoPerc: number,
  rescisaoPerc: number,
  regime: RegimeContratacao,
  duracaoMeses: number,
) {
  const totalPerc = basicoPerc + rescisaoPerc;
  const dur = Math.max(1, duracaoMeses || 1);
  if (regime === "indeterminado") {
    return {
      regime,
      basicoPerc,
      rescisaoPerc,
      mensalExperienciaPerc: totalPerc,
      mensalEfetivoPerc: totalPerc,
      mediaPerc: totalPerc,
      mesesExperiencia: 0,
      mesesEfetivo: dur,
    };
  }
  const mesesExp = Math.min(MESES_EXPERIENCIA, dur);
  const mesesEf = Math.max(0, dur - MESES_EXPERIENCIA);
  const mediaPerc = (basicoPerc * mesesExp + totalPerc * mesesEf) / dur;
  return {
    regime,
    basicoPerc,
    rescisaoPerc,
    mensalExperienciaPerc: basicoPerc,
    mensalEfetivoPerc: totalPerc,
    mediaPerc,
    mesesExperiencia: mesesExp,
    mesesEfetivo: mesesEf,
  };
}

// Rev. 3985 — resolve a config VIGENTE na data de referência (default: hoje), não mais "mais recente por createdAt"
async function getMealConfig(db: any, input: { companyId: number; companyIds?: number[] }, obraId?: number, refDate?: string) {
  const dataRef = refDate || new Date().toISOString().split("T")[0];
  const companyId = input.companyId ?? (input.companyIds && input.companyIds[0]);
  if (companyId) {
    const cfg = await resolveMealBenefitConfig(db, companyId, obraId || null, dataRef);
    if (cfg) return cfg;
  }
  // Fallback final: qualquer config ativa da empresa (multi-company ou dado legado sem vigência)
  const [any] = await db.select().from(mealBenefitConfigs)
    .where(and(companyFilter(mealBenefitConfigs.companyId, input), eq(mealBenefitConfigs.ativo, 1)))
    .orderBy(desc(mealBenefitConfigs.createdAt)).limit(1);
  return any || null;
}

function calcBeneficiosFromConfig(mealCfg: any, convVrDiario: number, convVaMensal: number) {
  const diasUteisRef = mealCfg?.diasUteisRef || 22;
  let cafeMensal = 0, lancheMensal = 0, vrMensal = 0, vaMensal = 0;

  if (mealCfg) {
    const cafeAtivo = mealCfg.cafeAtivo === 1;
    const lancheAtivo = mealCfg.lancheAtivo === 1;
    const cafeDia = cafeAtivo ? parseBRL(mealCfg.cafeManhaDia) : 0;
    const lancheDia = lancheAtivo ? parseBRL(mealCfg.lancheTardeDia) : 0;
    cafeMensal = Math.round(cafeDia * diasUteisRef * 100) / 100;
    lancheMensal = Math.round(lancheDia * diasUteisRef * 100) / 100;
    vrMensal = cafeMensal + lancheMensal;

    const cfgVaMensal = parseBRL(mealCfg.valeAlimentacaoMes);
    const cfgTotalIFood = parseBRL(mealCfg.totalVaIFood);

    if (cfgTotalIFood > 0) {
      vaMensal = Math.round((cfgTotalIFood - vrMensal) * 100) / 100;
    } else if (cfgVaMensal > 0) {
      vaMensal = Math.round(cfgVaMensal * diasUteisRef * 100) / 100;
    }
  } else if (convVrDiario > 0 || convVaMensal > 0) {
    vrMensal = convVrDiario * 22;
    vaMensal = convVaMensal;
  } else {
    vrMensal = 220;
    vaMensal = 460.75;
  }

  return { cafeMensal, lancheMensal, vrMensal, vaMensal, diasUteisRef };
}

function isTransientDbError(err: any): boolean {
  const texts = [err?.message, err?.cause?.message, err?.code, err?.cause?.code].filter(Boolean).join(' ');
  return /connection|timeout|socket|ECONNRE|ETIMEDOUT|EPIPE|terminating|SSL|57P01|08006|53300|57P03/i.test(texts);
}

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const transient = isTransientDbError(err);
      const msg = err?.cause?.message || err?.message || '';
      console.warn(`[SMO] ${label} attempt ${attempt}/${maxAttempts} failed (transient=${transient}):`, msg.slice(0, 120));
      if (!transient || attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
  }
  throw new Error(`${label}: all retries exhausted`);
}

const FUNCOES_PREDEFINIDAS = [
  "Ajudante Geral",
  "Ajudante de Armador",
  "Ajudante de Carpinteiro",
  "Ajudante de Eletricista",
  "Ajudante de Encanador",
  "Ajudante de Pedreiro",
  "Ajudante de Pintor",
  "Apontador de Obras",
  "Armador",
  "Auxiliar Administrativo",
  "Auxiliar de Almoxarifado",
  "Auxiliar de Topografia",
  "Bombeiro Hidráulico",
  "Caldeireiro",
  "Carpinteiro",
  "Carpinteiro de Formas",
  "Coordenador de Obras",
  "Eletricista",
  "Eletricista Industrial",
  "Encarregado de Obras",
  "Encanador",
  "Engenheiro Civil",
  "Engenheiro de Segurança",
  "Estaqueiro",
  "Ferreiro / Armador",
  "Gesseiro",
  "Guincheiro",
  "Impermeabilizador",
  "Instalador de Drywall",
  "Manobrista",
  "Marmorista",
  "Mecânico de Manutenção",
  "Meio Oficial",
  "Mestre de Obras",
  "Montador de Andaimes",
  "Montador de Estruturas Metálicas",
  "Motorista",
  "Motorista de Caminhão",
  "Operador de Betoneira",
  "Operador de Escavadeira",
  "Operador de Grua",
  "Operador de Guindaste",
  "Operador de Munck",
  "Operador de Retroescavadeira",
  "Operador de Rolo Compactador",
  "Pedreiro",
  "Pedreiro de Acabamento",
  "Pedreiro de Alvenaria",
  "Pintor",
  "Pintor Industrial",
  "Poceiro",
  "Serralheiro",
  "Servente de Obras",
  "Soldador",
  "Técnico em Edificações",
  "Técnico de Segurança do Trabalho",
  "Topógrafo",
  "Vidraceiro",
  "Vigia / Vigilante",
];

const QUALIFICACOES_DISPONIVEIS = [
  "NR-10", "NR-12", "NR-18", "NR-33", "NR-35", "NR-06",
  "CNH A", "CNH B", "CNH C", "CNH D", "CNH E",
  "Operador de Guindaste", "Operador de Retroescavadeira",
  "Soldador", "Eletricista Industrial",
  "ASO (Trabalho em Altura)", "ASO (Espaço Confinado)",
];

const ONBOARDING_ITEMS = [
  "Exame Admissional (ASO)",
  "Integração de Segurança",
  "Entrega de EPIs",
  "Entrega de Uniformes",
  "Cadastro no Relógio de Ponto",
  "Abertura de Conta Salário",
  "Cadastro no Sistema (ERP)",
  "Treinamento Inicial da Função",
];

const SLA_DIAS: Record<string, number> = {
  urgente: 10,
  normal: 15,
  planejada: 30,
};

const PRAZO_MINIMO_DIAS = 10;

async function assertOwnership(db: any, id: number, ctx: { companyId: number; companyIds?: number[] }) {
  const [row] = await db.select({ companyId: smoSolicitacoes.companyId })
    .from(smoSolicitacoes).where(eq(smoSolicitacoes.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
  const allowed = ctx.companyIds && ctx.companyIds.length > 0
    ? ctx.companyIds.includes(row.companyId)
    : row.companyId === ctx.companyId;
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado" });
}

/**
 * Verifica se o usuário pode editar/excluir uma SMO.
 * Regras:
 *  - admin_master e role=admin: sempre podem.
 *  - Criador (employees.id == solicitanteId, via email): pode SOMENTE enquanto
 *    NENHUMA das três aprovações (coord/rh/diretoria) tiver sido registrada.
 *  - Demais usuários: bloqueados.
 */
async function assertCanEditOrDelete(db: any, id: number, user: { id: number; role?: string | null }) {
  const [row] = await db.select({
    solicitanteId: smoSolicitacoes.solicitanteId,
    aprovadoPorCoord: smoSolicitacoes.aprovadoPorCoord,
    aprovadoPorRh: smoSolicitacoes.aprovadoPorRh,
    aprovadoPorDiretoria: smoSolicitacoes.aprovadoPorDiretoria,
  }).from(smoSolicitacoes).where(eq(smoSolicitacoes.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });
  if (user.role === "admin_master" || user.role === "admin") return;
  const myEmployeeId = await getCurrentUserEmployeeId(user.id);
  const isCreator = myEmployeeId != null && myEmployeeId === row.solicitanteId;
  if (!isCreator) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o criador, RH ou Admin podem alterar esta solicitação." });
  }
  const jaAprovado = !!row.aprovadoPorCoord || !!row.aprovadoPorRh || !!row.aprovadoPorDiretoria;
  if (jaAprovado) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solicitação já aprovada — não pode mais ser alterada pelo criador." });
  }
}

async function assertObraAccess(db: any, obraId: number, ctx: { companyId: number; companyIds?: number[] }) {
  const [obra] = await db.select({ companyId: obras.companyId })
    .from(obras).where(eq(obras.id, obraId));
  if (!obra) throw new TRPCError({ code: "NOT_FOUND", message: "Obra não encontrada" });
  const allowed = ctx.companyIds && ctx.companyIds.length > 0
    ? ctx.companyIds.includes(obra.companyId)
    : obra.companyId === ctx.companyId;
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado à obra" });
}

export const smoRouter = router({
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      status: z.string().optional(),
      obraId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(smoSolicitacoes.companyId, input), isNull(smoSolicitacoes.deletedAt)];
      if (input.status) conds.push(eq(smoSolicitacoes.status, input.status));
      if (input.obraId) conds.push(eq(smoSolicitacoes.obraId, input.obraId));

      // Filtro por obras permitidas (data-row level). null => sem restrição.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conds.push(inArray(smoSolicitacoes.obraId, allowed));
      }

      // Pré-computa identidade do usuário p/ marcar canEdit por linha.
      const isMasterOrAdmin = ctx.user.role === "admin_master" || ctx.user.role === "admin";
      const myEmployeeId = isMasterOrAdmin ? null : await getCurrentUserEmployeeId(ctx.user.id);

      return await withRetry('list', async () => {
        const rows = await db.select({
          solicitacao: smoSolicitacoes,
          obraNome: obras.nome,
        })
          .from(smoSolicitacoes)
          .leftJoin(obras, eq(smoSolicitacoes.obraId, obras.id))
          .where(and(...conds))
          .orderBy(desc(smoSolicitacoes.criadoEm));

        const solIds = rows.map(r => r.solicitacao.id);
        let eapMap: Record<number, any[]> = {};
        if (solIds.length > 0) {
          const eaps = await db.select().from(smoAtividadesEap).where(inArray(smoAtividadesEap.solicitacaoId, solIds));
          for (const e of eaps) {
            if (!eapMap[e.solicitacaoId]) eapMap[e.solicitacaoId] = [];
            eapMap[e.solicitacaoId].push(e);
          }
        }

        return rows.map(r => {
          const s = r.solicitacao;
          let canEdit = false;
          if (isMasterOrAdmin) {
            canEdit = true;
          } else if (myEmployeeId != null && myEmployeeId === s.solicitanteId) {
            // Criador só pode editar enquanto NENHUMA aprovação existir.
            canEdit = !s.aprovadoPorCoord && !s.aprovadoPorRh && !s.aprovadoPorDiretoria;
          }
          return {
            ...s,
            obraNome: r.obraNome,
            atividades: eapMap[s.id] || [],
            canEdit,
          };
        });
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      const [row] = await db.select({
        solicitacao: smoSolicitacoes,
        obraNome: obras.nome,
      })
        .from(smoSolicitacoes)
        .leftJoin(obras, eq(smoSolicitacoes.obraId, obras.id))
        .where(eq(smoSolicitacoes.id, input.id));
      if (!row) return null;
      const atividades = await db.select().from(smoAtividadesEap).where(eq(smoAtividadesEap.solicitacaoId, input.id));
      const checklist = await db.select().from(smoOnboardingChecklist).where(eq(smoOnboardingChecklist.solicitacaoId, input.id));

      const s = row.solicitacao;
      const isMasterOrAdmin = ctx.user.role === "admin_master" || ctx.user.role === "admin";
      let canEdit = false;
      if (isMasterOrAdmin) {
        canEdit = true;
      } else {
        const myEmployeeId = await getCurrentUserEmployeeId(ctx.user.id);
        if (myEmployeeId != null && myEmployeeId === s.solicitanteId) {
          canEdit = !s.aprovadoPorCoord && !s.aprovadoPorRh && !s.aprovadoPorDiretoria;
        }
      }

      // Rev. 1361 — para SMOs antigas (criadas antes da Rev. 1357), o detalheCustos
      // não tem o split por regime de Experiência. Recomputa on-the-fly se faltar
      // (e persiste de volta para evitar reprocessar).
      let detalheCustosOut: string | null = s.detalheCustos as any;
      try {
        const reg = ((s as any).regimeContratacao || "experiencia") as RegimeContratacao;
        const parsed = s.detalheCustos ? JSON.parse(s.detalheCustos) : null;
        const faltaSplit = !parsed
          || parsed.regimeContratacao == null
          || parsed.encargosBasicoPerc == null
          || parsed.mesesExperiencia == null
          || parsed.custoMensalUnitExperiencia == null
          || !parsed.rev;  // Rev. 4296: garante recompute com teto de sanidade salarial
        if (faltaSplit && s.obraId && s.funcaoSolicitada) {
          const recomputado = await computeCustoSMO(
            db, { companyId: input.companyId, companyIds: input.companyIds },
            s.obraId, s.funcaoSolicitada, s.quantidade || 1, s.duracaoMeses || 1, reg,
          );
          detalheCustosOut = JSON.stringify(recomputado.detalhes);
          await db.update(smoSolicitacoes)
            .set({ detalheCustos: detalheCustosOut, custoMensalEstimado: String(recomputado.custoMensal), custoTotalEstimado: String(recomputado.custoTotal) } as any)
            .where(eq(smoSolicitacoes.id, input.id));
        }
      } catch (e) { console.error("[SMO getById] erro ao recomputar detalheCustos:", e); }

      return { ...s, detalheCustos: detalheCustosOut, obraNome: row.obraNome, atividades, checklist, canEdit };
    }),

  obrasAtivas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(obras.companyId, input), isNull(obras.deletedAt), eq(obras.isActive, 1)];
      // Filtro centralizado: null => admin_master/admin (vê tudo); array vazio => sem acesso.
      const allowed = await getEffectiveAllowedObraIds(ctx.user.id, ctx.user.role);
      if (allowed !== null) {
        if (allowed.length === 0) return [];
        conds.push(inArray(obras.id, allowed));
      }
      const rows = await db.select({ id: obras.id, nome: obras.nome, codigo: obras.codigo, responsavel: obras.responsavel })
        .from(obras)
        .where(and(...conds));
      return rows;
    }),

  atividadesEap: protectedProcedure
    .input(z.object({ obraId: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      await assertObraAccess(db, input.obraId, input);
      const [proj] = await db.select().from(planejamentoProjetos).where(eq(planejamentoProjetos.obraId, input.obraId)).limit(1);
      if (!proj) return [];
      const [rev] = await db.select().from(planejamentoRevisoes)
        .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
        .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
      if (!rev) return [];
      const ativs = await db.select().from(planejamentoAtividades)
        .where(and(eq(planejamentoAtividades.revisaoId, rev.id), eq(planejamentoAtividades.projetoId, proj.id)));
      return ativs.map(a => ({
        id: a.id, eapCodigo: a.eapCodigo, nome: a.nome, nivel: a.nivel,
        isGrupo: a.isGrupo, dataInicio: a.dataInicio, dataFim: a.dataFim,
      }));
    }),

  funcoesDisponiveis: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.selectDistinct({ funcao: employees.funcao })
        .from(employees)
        .where(and(companyFilter(employees.companyId, input), sql`${employees.funcao} IS NOT NULL AND ${employees.funcao} <> ''`));
      const fromDb = rows.map(r => r.funcao).filter(Boolean) as string[];
      const merged = Array.from(new Set([...FUNCOES_PREDEFINIDAS, ...fromDb]));
      merged.sort((a, b) => a.localeCompare(b, "pt-BR"));
      return merged;
    }),

  qualificacoesDisponiveis: protectedProcedure
    .query(() => QUALIFICACOES_DISPONIVEIS),

  calcularImpactoFinanceiro: protectedProcedure
    .input(z.object({
      companyId: z.number(), companyIds: z.array(z.number()).optional(),
      funcao: z.string(), quantidade: z.number(), duracaoMeses: z.number(), obraId: z.number(),
      regimeContratacao: z.enum(["experiencia", "indeterminado"]).default("experiencia"),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let emps = await db.select({ salarioBase: employees.salarioBase, funcao: employees.funcao })
        .from(employees)
        .where(and(companyFilter(employees.companyId, input), eq(employees.funcao, input.funcao), eq(employees.status, "Ativo")));

      if (emps.length === 0) {
        const palavras = input.funcao.split(/\s+/).filter(p => p.length > 2);
        if (palavras.length > 0) {
          const likePattern = `%${palavras[0]}%`;
          emps = await db.select({ salarioBase: employees.salarioBase, funcao: employees.funcao })
            .from(employees)
            .where(and(companyFilter(employees.companyId, input), sql`${employees.funcao} ILIKE ${likePattern}`, eq(employees.status, "Ativo")));
        }
      }

      let salarioRef = 0;
      if (emps.length > 0) {
        const sals = emps.map(e => parseBRL(e.salarioBase)).filter(s => s > 0);
        salarioRef = calcSalarioMediana(sals);
      }
      const [convPiso] = await db.select({ pisoSalarial: convencaoColetiva.pisoSalarial })
        .from(convencaoColetiva)
        .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
        .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);
      const pisoRef = parseFloat(convPiso?.pisoSalarial || "2500");
      if (salarioRef === 0) salarioRef = pisoRef;
      let alertaImpFinanceiro = false;
      const capImpFinanceiro = pisoRef * 12;
      if (salarioRef > capImpFinanceiro) {
        console.warn(`[SMO calcular] salarioRef anomalo para "${input.funcao}": R$${salarioRef.toFixed(0)} > teto R$${capImpFinanceiro.toFixed(0)}. Usando piso.`);
        salarioRef = pisoRef;
        alertaImpFinanceiro = true;
      }

      const encargos = await db.select().from(encargosSociais).where(companyFilter(encargosSociais.companyId, input));
      let { basicoPerc, rescisaoPerc, totalPerc: totalEncargosPerc } = splitEncargosPorGrupo(encargos);
      if (totalEncargosPerc === 0) {
        // Fallback CLT padrão: A+B ≈ 79.3% – 12.6% (aviso+multa) = 66.7% de "básico"
        basicoPerc = 66.7;
        rescisaoPerc = 12.6;
        totalEncargosPerc = 79.3;
      }
      const blended = calcEncargosBlended(basicoPerc, rescisaoPerc, input.regimeContratacao, input.duracaoMeses);

      const [conv] = await db.select().from(convencaoColetiva)
        .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
        .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);

      const mealCfg = await getMealConfig(db, input, input.obraId);
      const convVrDiario = parseFloat(conv?.valeRefeicao || "0");
      const convVaMensal = parseFloat(conv?.valeAlimentacao || "0");
      const benef = calcBeneficiosFromConfig(mealCfg, convVrDiario, convVaMensal);

      const vr = benef.vrMensal;
      const va = benef.vaMensal;
      const vt = salarioRef * 0.06;
      const seguroVidaGrupo = 45;
      const exameAdmissional = 200;
      const epiEstimado = 350;
      const uniformeEstimado = 250;

      const beneficios = vr + va + vt + seguroVidaGrupo;
      // Encargos "médio ponderado" no período (mistura experiência + efetivo)
      const encargosValor = salarioRef * (blended.mediaPerc / 100);
      const encargosValorExperiencia = salarioRef * (blended.mensalExperienciaPerc / 100);
      const encargosValorEfetivo = salarioRef * (blended.mensalEfetivoPerc / 100);
      const custoMensalExperiencia = salarioRef + encargosValorExperiencia + beneficios;
      const custoMensalEfetivo = salarioRef + encargosValorEfetivo + beneficios;
      const custoMensal = salarioRef + encargosValor + beneficios; // média ponderada
      const custoUnico = exameAdmissional + epiEstimado + uniformeEstimado;
      const custoMensalTotal = custoMensal * input.quantidade;
      // Custo total = soma exata (3m experiência + restante efetivo) × qtd + custos únicos
      const custoFolhaPeriodo = (custoMensalExperiencia * blended.mesesExperiencia + custoMensalEfetivo * blended.mesesEfetivo) * input.quantidade;
      const custoTotal = custoFolhaPeriodo + (custoUnico * input.quantidade);

      const ferias13 = salarioRef / 12 + (salarioRef / 12) / 3 + salarioRef / 12;

      return {
        salarioBase: salarioRef,
        regimeContratacao: input.regimeContratacao,
        encargosPercentual: totalEncargosPerc,         // % pleno (legado, compat)
        encargosBasicoPerc: blended.basicoPerc,         // grupos A+B
        encargosRescisaoPerc: blended.rescisaoPerc,     // grupo C (aviso + multa)
        encargosMediaPerc: blended.mediaPerc,           // % médio ponderado p/ regime
        encargosValor,
        encargosValorExperiencia,
        encargosValorEfetivo,
        custoMensalExperiencia,
        custoMensalEfetivo,
        mesesExperiencia: blended.mesesExperiencia,
        mesesEfetivo: blended.mesesEfetivo,
        valeRefeicao: vr,
        valeAlimentacao: va,
        valeTransporte: vt,
        seguroVidaGrupo,
        totalBeneficios: beneficios,
        exameAdmissional,
        epiEstimado,
        uniformeEstimado,
        ferias13provisao: ferias13,
        custoMensalUnitario: custoMensal,
        custoMensalTotal,
        custoUnicoTotal: custoUnico * input.quantidade,
        custoTotal,
        baseSalarial: alertaImpFinanceiro
          ? "ANOMALIA detectada → Piso convenção"
          : emps.length > 0 ? "Média dos ativos" : "Piso salarial (convenção)",
        qtdReferencia: emps.length,
        alertaSalarioAnomalo: alertaImpFinanceiro,
        beneficiosOrigem: mealCfg ? `Config: ${mealCfg.nome || "VR/VA"}` : (convVrDiario > 0 ? "Convenção Coletiva" : "Valores padrão"),
        cafeMensal: benef.cafeMensal,
        lancheMensal: benef.lancheMensal,
      };
    }),

  analiseComparativa: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      obraId: z.number(),
      lucroTerceirizacaoPerc: z.number().min(0).max(100).default(20),
      itens: z.array(z.object({
        funcao: z.string(),
        quantidade: z.number().min(1),
        duracaoMeses: z.number().min(1),
        regimeContratacao: z.enum(["experiencia", "indeterminado"]).default("experiencia"),
      })).min(1),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const encargos = await db.select().from(encargosSociais).where(companyFilter(encargosSociais.companyId, input));
      let { basicoPerc, rescisaoPerc, totalPerc: totalEncargosPerc } = splitEncargosPorGrupo(encargos);
      if (totalEncargosPerc === 0) {
        basicoPerc = 66.7; rescisaoPerc = 12.6; totalEncargosPerc = 79.3;
      }

      const [conv] = await db.select().from(convencaoColetiva)
        .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
        .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);

      const convVrDiario = parseFloat(conv?.valeRefeicao || "0");
      const convVaMensal = parseFloat(conv?.valeAlimentacao || "0");

      const mealCfg = await getMealConfig(db, input, input.obraId);
      const benef = calcBeneficiosFromConfig(mealCfg, convVrDiario, convVaMensal);
      const { cafeMensal, lancheMensal, vrMensal, vaMensal, diasUteisRef } = benef;
      const exameAdmissional = 200;
      const examePeriodico = 150;
      const exameDemissional = 150;
      const epiEstimado = 350;
      const uniformeEstimado = 250;
      const treinamentoIntegracao = 300;
      const seguroVidaGrupo = 45;
      const planoSaudeMensal = 0;
      const custoAdmissao = exameAdmissional + epiEstimado + uniformeEstimado + treinamentoIntegracao;

      const analiseItens = [];
      let totalCltMensal = 0;
      let totalCltPeriodo = 0;
      let totalTercMensal = 0;
      let totalTercPeriodo = 0;
      let totalImpactoFolha = 0;

      for (const item of input.itens) {
        let emps = await db.select({ salarioBase: employees.salarioBase, funcao: employees.funcao })
          .from(employees)
          .where(and(companyFilter(employees.companyId, input), eq(employees.funcao, item.funcao), eq(employees.status, "Ativo")));

        if (emps.length === 0) {
          const palavras = item.funcao.split(/\s+/).filter(p => p.length > 2);
          if (palavras.length > 0) {
            const likePattern = `%${palavras[0]}%`;
            emps = await db.select({ salarioBase: employees.salarioBase, funcao: employees.funcao })
              .from(employees)
              .where(and(companyFilter(employees.companyId, input), sql`${employees.funcao} ILIKE ${likePattern}`, eq(employees.status, "Ativo")));
          }
        }

        let salarioRef = 0;
        let baseSalarialOrigem = "Piso salarial (padrão)";
        if (emps.length > 0) {
          const sals = emps.map(e => parseBRL(e.salarioBase)).filter(s => s > 0);
          salarioRef = calcSalarioMediana(sals);
          if (salarioRef > 0) {
            const funcRef = emps[0].funcao || item.funcao;
            baseSalarialOrigem = emps.length === 1
              ? `Salário real (${funcRef})`
              : `Mediana de ${emps.length} profissionais (${funcRef})`;
          }
        }
        if (salarioRef === 0) salarioRef = parseFloat(conv?.pisoSalarial || "2500");

        const vt = salarioRef * 0.06;
        const blended = calcEncargosBlended(basicoPerc, rescisaoPerc, item.regimeContratacao, item.duracaoMeses);
        const encargosValor = salarioRef * (blended.mediaPerc / 100);
        const encargosValorExperiencia = salarioRef * (blended.mensalExperienciaPerc / 100);
        const encargosValorEfetivo = salarioRef * (blended.mensalEfetivoPerc / 100);

        const inss = salarioRef * 0.20;
        const fgts = salarioRef * 0.08;
        const rat = salarioRef * 0.03;
        const sistemaS = salarioRef * 0.058;
        const provisaoFerias = (salarioRef / 12) + ((salarioRef / 12) / 3);
        const provisao13 = salarioRef / 12;
        const provisaoMultaFGTS = salarioRef * 0.08 * 0.40 / 12;

        const beneficiosFixos = vrMensal + vaMensal + vt + seguroVidaGrupo + planoSaudeMensal;
        const custoMensalUnitExperiencia = salarioRef + encargosValorExperiencia + beneficiosFixos;
        const custoMensalUnitEfetivo = salarioRef + encargosValorEfetivo + beneficiosFixos;
        const custoMensalUnit = salarioRef + encargosValor + beneficiosFixos; // média ponderada
        const custoMensalTotal = custoMensalUnit * item.quantidade;

        const custosAdmissaoTotal = custoAdmissao * item.quantidade;
        const examePeriodicoTotal = Math.floor(item.duracaoMeses / 12) * examePeriodico * item.quantidade;
        const exameDemissionalTotal = exameDemissional * item.quantidade;
        // Folha do período = experiência (custo reduzido) + restante (custo pleno)
        const folhaPeriodo = (custoMensalUnitExperiencia * blended.mesesExperiencia + custoMensalUnitEfetivo * blended.mesesEfetivo) * item.quantidade;
        const custoPeriodo = folhaPeriodo + custosAdmissaoTotal + examePeriodicoTotal + exameDemissionalTotal;

        const lucroTercPerc = input.lucroTerceirizacaoPerc / 100;
        const tercMensalUnit = custoMensalUnit * (1 + lucroTercPerc);
        const tercMensalTotal = tercMensalUnit * item.quantidade;
        const tercMobilizacao = 500 * item.quantidade;
        const tercPeriodoTotal = (tercMensalTotal * item.duracaoMeses) + tercMobilizacao;

        const diferencaMensal = tercMensalTotal - custoMensalTotal;
        const custoAdmDemissaoClt = custosAdmissaoTotal + exameDemissionalTotal;
        const economiaCltPeriodo = tercPeriodoTotal - custoPeriodo;
        const recomendacao = economiaCltPeriodo > 0
          ? "contratar"
          : (item.duracaoMeses <= 6 ? "terceirizar" : "contratar");

        totalCltMensal += custoMensalTotal;
        totalCltPeriodo += custoPeriodo;
        totalTercMensal += tercMensalTotal;
        totalTercPeriodo += tercPeriodoTotal;
        totalImpactoFolha += custoMensalTotal;

        analiseItens.push({
          funcao: item.funcao,
          quantidade: item.quantidade,
          duracaoMeses: item.duracaoMeses,
          salarioBase: salarioRef,
          baseSalarial: baseSalarialOrigem,
          qtdReferencia: emps.length,
          clt: {
            regimeContratacao: item.regimeContratacao,
            encargosPerc: totalEncargosPerc,
            encargosBasicoPerc: blended.basicoPerc,
            encargosRescisaoPerc: blended.rescisaoPerc,
            encargosMediaPerc: blended.mediaPerc,
            encargosValor,
            mesesExperiencia: blended.mesesExperiencia,
            mesesEfetivo: blended.mesesEfetivo,
            custoMensalUnitExperiencia,
            custoMensalUnitEfetivo,
            folhaPeriodo,
            detalhamento: {
              salarioBruto: salarioRef,
              inss,
              fgts,
              rat,
              sistemaS,
              totalEncargos: encargosValor,
              cafeMensal,
              lancheMensal,
              valeRefeicao: vrMensal,
              valeAlimentacao: vaMensal,
              valeTransporte: vt,
              seguroVidaGrupo,
              planoSaude: planoSaudeMensal,
              provisaoFerias,
              provisao13,
              provisaoMultaFGTS,
            },
            custoMensalUnit,
            custoMensalTotal,
            custosAdmissao: {
              exameAdmissional,
              epiEstimado,
              uniformeEstimado,
              treinamentoIntegracao,
              totalPorProfissional: custoAdmissao,
              totalGeral: custosAdmissaoTotal,
            },
            custosDemissao: {
              exameDemissional,
              totalGeral: exameDemissionalTotal,
            },
            custoPeriodo,
          },
          terceirizacao: {
            lucroPerc: input.lucroTerceirizacaoPerc,
            baseCustoMensal: custoMensalUnit,
            lucroValor: custoMensalUnit * lucroTercPerc,
            custoMensalUnit: tercMensalUnit,
            custoMensalTotal: tercMensalTotal,
            mobilizacao: tercMobilizacao,
            custoPeriodo: tercPeriodoTotal,
          },
          comparativo: {
            diferencaMensal,
            tercMaisCaro: diferencaMensal > 0,
            custoAdmDemissaoClt,
            economiaCltPeriodo,
            mesesParaCompensarAdmissao: custoAdmDemissaoClt > 0 && diferencaMensal > 0 ? Math.ceil(custoAdmDemissaoClt / diferencaMensal) : 0,
            recomendacao,
          },
        });
      }

      const diferencaPeriodo = totalTercPeriodo - totalCltPeriodo;
      const recomendacaoGeral = diferencaPeriodo > 0 ? "contratar" : "avaliar_terceirizacao";

      return {
        itens: analiseItens,
        resumo: {
          clt: { mensal: totalCltMensal, periodo: totalCltPeriodo },
          terceirizacao: { mensal: totalTercMensal, periodo: totalTercPeriodo },
          diferencaMensal: totalTercMensal - totalCltMensal,
          diferencaPeriodo,
          impactoFolhaProximoMes: totalImpactoFolha,
          recomendacaoGeral,
        },
        parametros: {
          encargosPerc: totalEncargosPerc,
          lucroTercPerc: input.lucroTerceirizacaoPerc,
          custoAdmissaoPorProfissional: custoAdmissao,
          mobilizacaoPorProfissional: 500,
          beneficiosOrigem: mealCfg ? "Configuração VR/VA" : (convVrDiario > 0 ? "Convenção Coletiva" : "Valores padrão"),
          cafeMensal,
          lancheMensal,
          vaMensal,
          vrMensal,
          diasUteisRef,
        },
      };
    }),

  efetivoObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const alocados = await db.select({
        funcao: employees.funcao,
        count: sql<number>`count(*)::int`,
      })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(eq(obraFuncionarios.obraId, input.obraId), eq(obraFuncionarios.isActive, 1), eq(employees.status, "Ativo")))
        .groupBy(employees.funcao);

      return alocados.map(a => ({ funcao: a.funcao || "Sem função", quantidade: a.count }));
    }),

  sugerirRealocacao: protectedProcedure
    .input(z.object({
      companyId: z.number(), companyIds: z.array(z.number()).optional(),
      funcao: z.string(), quantidade: z.number(), dataInicio: z.string(), obraIdDestino: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const todasObras = await db.select({ id: obras.id, nome: obras.nome, dataPrevisaoFim: obras.dataPrevisaoFim })
        .from(obras)
        .where(and(
          companyFilter(obras.companyId, input),
          isNull(obras.deletedAt),
          eq(obras.isActive, 1),
          sql`${obras.id} <> ${input.obraIdDestino}`,
          sql`${obras.status} IN ('Em andamento', 'em_andamento')`,
        ));

      const sugestoes: Array<{
        obraId: number; obraNome: string; funcionarios: Array<{ id: number; nome: string; funcao: string }>;
        dataLiberacao: string | null; motivo: string;
      }> = [];

      for (const obra of todasObras) {
        const funcsNaObra = await db.select({
          empId: employees.id,
          empNome: employees.nomeCompleto,
          empFuncao: employees.funcao,
        })
          .from(obraFuncionarios)
          .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
          .where(and(
            eq(obraFuncionarios.obraId, obra.id),
            eq(obraFuncionarios.isActive, 1),
            eq(employees.status, "Ativo"),
            eq(employees.funcao, input.funcao),
          ));

        if (funcsNaObra.length === 0) continue;

        let dataLiberacao = obra.dataPrevisaoFim;
        const [proj] = await db.select().from(planejamentoProjetos).where(eq(planejamentoProjetos.obraId, obra.id)).limit(1);
        if (proj) {
          const [rev] = await db.select().from(planejamentoRevisoes)
            .where(and(eq(planejamentoRevisoes.projetoId, proj.id), eq(planejamentoRevisoes.status, "aprovada")))
            .orderBy(desc(planejamentoRevisoes.numero)).limit(1);
          if (rev) {
            const ativs = await db.select().from(planejamentoAtividades)
              .where(and(
                eq(planejamentoAtividades.revisaoId, rev.id),
                eq(planejamentoAtividades.projetoId, proj.id),
                eq(planejamentoAtividades.isGrupo, false),
              ));
            const maxDataFim = ativs.reduce((max, a) => {
              if (a.dataFim && a.dataFim > (max || "")) return a.dataFim;
              return max;
            }, "");
            if (maxDataFim) dataLiberacao = maxDataFim;
          }
        }

        if (dataLiberacao && dataLiberacao <= input.dataInicio) {
          sugestoes.push({
            obraId: obra.id,
            obraNome: obra.nome,
            funcionarios: funcsNaObra.map(f => ({ id: f.empId, nome: f.empNome, funcao: f.empFuncao || input.funcao })),
            dataLiberacao,
            motivo: `Obra "${obra.nome}" prevista para terminar em ${dataLiberacao}. ${funcsNaObra.length} ${input.funcao}(s) disponíveis para realocação.`,
          });
        }
      }

      return sugestoes;
    }),

  solicitacoesSimilares: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), funcao: z.string(), excludeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const seteDiasAtras = new Date(); seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
      const conds: any[] = [
        companyFilter(smoSolicitacoes.companyId, input),
        isNull(smoSolicitacoes.deletedAt),
        eq(smoSolicitacoes.funcaoSolicitada, input.funcao),
        sql`${smoSolicitacoes.criadoEm} >= ${seteDiasAtras.toISOString()}`,
        sql`${smoSolicitacoes.status} NOT IN ('rejeitada', 'concluida')`,
      ];
      if (input.excludeId) conds.push(sql`${smoSolicitacoes.id} <> ${input.excludeId}`);
      const rows = await db.select({
        id: smoSolicitacoes.id,
        obraId: smoSolicitacoes.obraId,
        quantidade: smoSolicitacoes.quantidade,
        solicitanteNome: smoSolicitacoes.solicitanteNome,
        status: smoSolicitacoes.status,
        obraNome: obras.nome,
      })
        .from(smoSolicitacoes)
        .leftJoin(obras, eq(smoSolicitacoes.obraId, obras.id))
        .where(and(...conds));
      return rows;
    }),

  historicoTurnover: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number(), funcao: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const seisMesesAtras = new Date(); seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);
      const contratados = await db.select({ count: sql<number>`count(*)::int` })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(
          eq(obraFuncionarios.obraId, input.obraId),
          eq(employees.funcao, input.funcao),
          sql`${obraFuncionarios.dataInicio} >= ${seisMesesAtras.toISOString().substring(0, 10)}`,
        ));
      const desligados = await db.select({ count: sql<number>`count(*)::int` })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(
          eq(obraFuncionarios.obraId, input.obraId),
          eq(employees.funcao, input.funcao),
          eq(obraFuncionarios.isActive, 0),
          sql`${obraFuncionarios.dataFim} >= ${seisMesesAtras.toISOString().substring(0, 10)}`,
        ));
      return {
        contratados: contratados[0]?.count || 0,
        desligados: desligados[0]?.count || 0,
      };
    }),

  custoAtualObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const alocados = await db.select({
        salarioBase: employees.salarioBase,
      })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(eq(obraFuncionarios.obraId, input.obraId), eq(obraFuncionarios.isActive, 1), eq(employees.status, "Ativo")));

      let totalFolhaBruta = 0;
      for (const a of alocados) {
        const raw = String(a.salarioBase || "0").replace(/\./g, "").replace(",", ".");
        totalFolhaBruta += parseFloat(raw) || 0;
      }

      return {
        totalFuncionarios: alocados.length,
        folhaBrutaMensal: totalFolhaBruta,
      };
    }),

  updateChecklist: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      concluido: z.boolean(),
      concluidoPor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(smoOnboardingChecklist).set({
        concluido: input.concluido,
        concluidoPor: input.concluido ? (input.concluidoPor || "RH") : null,
        concluidoEm: input.concluido ? new Date().toISOString() : null,
      }).where(eq(smoOnboardingChecklist.id, input.id));
      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      obraId: z.number(),
      solicitanteId: z.number(),
      solicitanteNome: z.string(),
      itens: z.array(z.object({
        funcao: z.string(),
        quantidade: z.number().min(1),
        duracaoMeses: z.number().min(1).default(1),
        regimeContratacao: z.enum(["experiencia", "indeterminado"]).default("experiencia"),
      })).min(1),
      dataInicioNecessidade: z.string(),
      prioridade: z.enum(["urgente", "normal", "planejada"]),
      observacao: z.string().optional(),
      atividadesDescricao: z.string().optional(),
      status: z.enum(["rascunho", "enviada"]).default("rascunho"),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const loteId = `L${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const prazoMinimoAlerta = input.prioridade !== "urgente" &&
        (() => {
          const diff = (new Date(input.dataInicioNecessidade).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          return diff < PRAZO_MINIMO_DIAS;
        })();

      const encargosRows = await db.select().from(encargosSociais).where(companyFilter(encargosSociais.companyId, input));
      let { basicoPerc: bPerc, rescisaoPerc: rPerc, totalPerc: totalEncargosPerc } = splitEncargosPorGrupo(encargosRows);
      if (totalEncargosPerc === 0) {
        bPerc = 66.7; rPerc = 12.6; totalEncargosPerc = 79.3;
      }

      const [convData] = await db.select().from(convencaoColetiva)
        .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
        .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);

      const convVrDiario = parseFloat(convData?.valeRefeicao || "0");
      const convVaVal = parseFloat(convData?.valeAlimentacao || "0");
      const pisoFallback = parseFloat(convData?.pisoSalarial || "2500");

      const mealCfgCreate = await getMealConfig(db, input, input.obraId, input.dataInicioNecessidade);
      const benefCreate = calcBeneficiosFromConfig(mealCfgCreate, convVrDiario, convVaVal);

      const results = [];
      for (const item of input.itens) {
        let emps = await db.select({ salarioBase: employees.salarioBase })
          .from(employees)
          .where(and(companyFilter(employees.companyId, input), eq(employees.funcao, item.funcao), eq(employees.status, "Ativo")));

        if (emps.length === 0) {
          const palavras = item.funcao.split(/\s+/).filter(p => p.length > 2);
          if (palavras.length > 0) {
            const likePattern = `%${palavras[0]}%`;
            emps = await db.select({ salarioBase: employees.salarioBase })
              .from(employees)
              .where(and(companyFilter(employees.companyId, input), sql`${employees.funcao} ILIKE ${likePattern}`, eq(employees.status, "Ativo")));
          }
        }

        let salarioRef = 0;
        if (emps.length > 0) {
          const sals = emps.map(e => parseBRL(e.salarioBase)).filter(s => s > 0);
          salarioRef = calcSalarioMediana(sals);
        }
        if (salarioRef === 0) salarioRef = pisoFallback;

        let alertaCreate = false;
        let salarioOriginalCreate = 0;
        const capCreate = pisoFallback > 0 ? pisoFallback * 12 : 30000;
        if (salarioRef > capCreate) {
          console.warn(`[SMO create] salarioRef anomalo para "${item.funcao}": R$${salarioRef.toFixed(0)} > teto R$${capCreate.toFixed(0)}. Usando piso.`);
          salarioOriginalCreate = salarioRef;
          salarioRef = pisoFallback > 0 ? pisoFallback : 2500;
          alertaCreate = true;
        }

        const vr = benefCreate.vrMensal;
        const va = benefCreate.vaMensal;
        const vt = salarioRef * 0.06;
        const beneficios = vr + va + vt + 45;
        const dur = item.duracaoMeses || 1;
        const blendedCreate = calcEncargosBlended(bPerc, rPerc, item.regimeContratacao, dur);
        const encargosValor = salarioRef * (blendedCreate.mediaPerc / 100);
        const encargosValorExp = salarioRef * (blendedCreate.mensalExperienciaPerc / 100);
        const encargosValorEf = salarioRef * (blendedCreate.mensalEfetivoPerc / 100);
        const custoMensalUnitExperiencia = salarioRef + encargosValorExp + beneficios;
        const custoMensalUnitEfetivo = salarioRef + encargosValorEf + beneficios;
        const custoMensalUnit = salarioRef + encargosValor + beneficios;
        const custoMensal = custoMensalUnit * item.quantidade;
        const custoUnico = (200 + 350 + 250) * item.quantidade;
        const folhaPeriodo = (custoMensalUnitExperiencia * blendedCreate.mesesExperiencia + custoMensalUnitEfetivo * blendedCreate.mesesEfetivo) * item.quantidade;
        const custoTotal = folhaPeriodo + custoUnico;

        const fatorBDI = 1.35;
        const tercMensal = salarioRef * fatorBDI * item.quantidade;
        const tercTotal = tercMensal * dur;

        const detalhes = {
          salarioBase: salarioRef,
          regimeContratacao: item.regimeContratacao,
          encargosPerc: totalEncargosPerc,                 // pleno (legado)
          encargosBasicoPerc: blendedCreate.basicoPerc,
          encargosRescisaoPerc: blendedCreate.rescisaoPerc,
          encargosMediaPerc: blendedCreate.mediaPerc,
          encargosValor,
          encargosValorExperiencia: encargosValorExp,
          encargosValorEfetivo: encargosValorEf,
          mesesExperiencia: blendedCreate.mesesExperiencia,
          mesesEfetivo: blendedCreate.mesesEfetivo,
          custoMensalUnitExperiencia,
          custoMensalUnitEfetivo,
          beneficios,
          custoMensalUnit,
          custoMensalTotal: custoMensal,
          custoTotal,
          tercMensalTotal: tercMensal,
          tercTotal,
          recomendacao: custoTotal > tercTotal ? "terceirizar" : "contratar",
          baseSalarial: alertaCreate
            ? `ANOMALIA (R$${salarioOriginalCreate.toFixed(0)}) → Piso convenção`
            : emps.length > 0 ? "Média ativos" : "Piso convenção",
          alertaSalarioAnomalo: alertaCreate,
          salarioRefOriginal: alertaCreate ? salarioOriginalCreate : undefined,
          rev: 4296,
        };

        const [sol] = await db.insert(smoSolicitacoes).values({
          companyId: input.companyId,
          obraId: input.obraId,
          solicitanteId: input.solicitanteId,
          solicitanteNome: input.solicitanteNome,
          funcaoSolicitada: item.funcao,
          quantidade: item.quantidade,
          dataInicioNecessidade: input.dataInicioNecessidade,
          duracaoMeses: item.duracaoMeses || 1,
          prioridade: input.prioridade,
          observacao: input.observacao || null,
          qualificacoes: input.atividadesDescricao || null,
          status: input.status,
          custoMensalEstimado: String(custoMensal.toFixed(2)),
          custoTotalEstimado: String(custoTotal.toFixed(2)),
          detalheCustos: JSON.stringify(detalhes),
          prazoMinimoAlerta,
          loteId,
          regimeContratacao: item.regimeContratacao,
        } as any).returning();
        results.push(sol);
      }
      return { loteId, count: results.length, ids: results.map(r => r.id) };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      funcaoSolicitada: z.string().optional(),
      quantidade: z.number().min(1).optional(),
      dataInicioNecessidade: z.string().optional(),
      duracaoMeses: z.number().min(1).optional(),
      regimeContratacao: z.enum(["experiencia", "indeterminado"]).optional(),
      prioridade: z.enum(["urgente", "normal", "planejada"]).optional(),
      qualificacoes: z.string().optional(),
      observacao: z.string().optional(),
      custoMensalEstimado: z.string().optional(),
      custoTotalEstimado: z.string().optional(),
      detalheCustos: z.string().optional(),
      sugestaoRealocacao: z.string().optional(),
      candidatoIndicadoNome: z.string().optional().nullable(),
      candidatoIndicadoTelefone: z.string().optional().nullable(),
      status: z.string().optional(),
      atividades: z.array(z.object({
        atividadeId: z.number(),
        eapCodigo: z.string().optional(),
        nomeAtividade: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const { id, companyId, companyIds, atividades, ...data } = input;
      await assertOwnership(db, id, { companyId, companyIds });
      await assertCanEditOrDelete(db, id, ctx.user);

      // Rev. 1357 — recalcula custos quando função, qtd, duração ou regime mudam
      const fieldsThatAffectCusto: Array<keyof typeof data> = ["funcaoSolicitada", "quantidade", "duracaoMeses", "regimeContratacao"];
      const triggersRecalc = fieldsThatAffectCusto.some(k => data[k] !== undefined) && data.detalheCustos === undefined;
      const dataToPersist: any = { ...data, atualizadoEm: new Date().toISOString() };
      if (triggersRecalc) {
        const [current] = await db.select().from(smoSolicitacoes).where(eq(smoSolicitacoes.id, id));
        if (current) {
          const funcao = (data.funcaoSolicitada ?? current.funcaoSolicitada) as string;
          const qtd = (data.quantidade ?? current.quantidade ?? 1) as number;
          const dur = (data.duracaoMeses ?? current.duracaoMeses ?? 1) as number;
          const reg = (data.regimeContratacao ?? (current as any).regimeContratacao ?? "experiencia") as RegimeContratacao;
          const computed = await computeCustoSMO(db, { companyId, companyIds }, current.obraId, funcao, qtd, dur, reg);
          dataToPersist.custoMensalEstimado = String(computed.custoMensal.toFixed(2));
          dataToPersist.custoTotalEstimado = String(computed.custoTotal.toFixed(2));
          dataToPersist.detalheCustos = JSON.stringify(computed.detalhes);
        }
      }
      await db.update(smoSolicitacoes).set(dataToPersist).where(eq(smoSolicitacoes.id, id));

      if (atividades !== undefined) {
        await db.delete(smoAtividadesEap).where(eq(smoAtividadesEap.solicitacaoId, id));
        if (atividades.length > 0) {
          await db.insert(smoAtividadesEap).values(atividades.map(a => ({ solicitacaoId: id, ...a })));
        }
      }

      return { success: true };
    }),

  aprovar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      // Etapa "coord" removida em Rev. 1276 — fluxo agora é Enviada → RH → Diretoria.
      // Aceita apenas "rh" e "diretoria"; valor "coord" legado é convertido para "rh" para
      // compatibilidade com clientes antigos durante a transição.
      etapa: z.enum(["coord", "rh", "diretoria"]).transform(v => (v === "coord" ? "rh" : v)),
      aprovadorNome: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      const agora = new Date().toISOString();
      const statusMap: Record<string, string> = {
        rh: "aprovada_rh",
        diretoria: "aprovada_diretoria",
      };
      const colMap: Record<string, any> = {
        rh: { aprovadoPorRh: input.aprovadorNome, aprovadoPorRhEm: agora, status: statusMap[input.etapa] },
        diretoria: { aprovadoPorDiretoria: input.aprovadorNome, aprovadoPorDiretoriaEm: agora, status: statusMap[input.etapa] },
      };
      await db.update(smoSolicitacoes).set({ ...colMap[input.etapa], atualizadoEm: agora } as any).where(eq(smoSolicitacoes.id, input.id));
      return { success: true };
    }),

  rejeitar: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      rejeitadoPor: z.string(),
      motivoRejeicao: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      const agora = new Date().toISOString();
      await db.update(smoSolicitacoes).set({
        status: "rejeitada",
        rejeitadoPor: input.rejeitadoPor,
        rejeitadoEm: agora,
        motivoRejeicao: input.motivoRejeicao,
        atualizadoEm: agora,
      }).where(eq(smoSolicitacoes.id, input.id));
      return { success: true };
    }),

  reverterAprovacao: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      etapa: z.enum(["rh", "diretoria"]),
      motivo: z.string().min(5, "Informe o motivo da reversão (mínimo 5 caracteres)"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas Admin Master pode reverter aprovações" });
      }
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);

      const [sol] = await db.select().from(smoSolicitacoes).where(eq(smoSolicitacoes.id, input.id));
      if (!sol) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada" });

      if (sol.status === "rejeitada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação rejeitada — use outra ação para alterar" });
      }
      if (sol.status === "concluida") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação já concluída — não pode ser revertida" });
      }
      if (sol.status === "em_recrutamento") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solicitação já em recrutamento — não é possível reverter aprovações nesta fase" });
      }

      const agora = new Date().toISOString();
      const obsReversao = `[REVERSÃO ${agora.replace("T", " ").substring(0, 19)}] Etapa "${input.etapa}" revertida por ${ctx.user.name || "Admin"}: ${input.motivo}`;
      const obsAtual = sol.observacao ? `${sol.observacao}\n${obsReversao}` : obsReversao;

      if (input.etapa === "diretoria") {
        if (!sol.aprovadoPorDiretoria) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Aprovação da Diretoria não encontrada — nada a reverter" });
        }
        await db.update(smoSolicitacoes).set({
          aprovadoPorDiretoria: null,
          aprovadoPorDiretoriaEm: null,
          status: sol.aprovadoPorRh ? "aprovada_rh" : "enviada",
          observacao: obsAtual,
          atualizadoEm: agora,
        }).where(eq(smoSolicitacoes.id, input.id));
      } else {
        if (!sol.aprovadoPorRh) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Aprovação do RH não encontrada — nada a reverter" });
        }
        await db.update(smoSolicitacoes).set({
          aprovadoPorRh: null,
          aprovadoPorRhEm: null,
          aprovadoPorDiretoria: null,
          aprovadoPorDiretoriaEm: null,
          status: "enviada",
          observacao: obsAtual,
          atualizadoEm: agora,
        }).where(eq(smoSolicitacoes.id, input.id));
      }

      return { success: true, etapa: input.etapa };
    }),

  iniciarRecrutamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      const agora = new Date().toISOString();
      await db.update(smoSolicitacoes).set({ status: "em_recrutamento", atualizadoEm: agora }).where(eq(smoSolicitacoes.id, input.id));
      await db.insert(smoOnboardingChecklist).values(
        ONBOARDING_ITEMS.map(item => ({ solicitacaoId: input.id, item }))
      );
      return { success: true };
    }),

  concluir: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      await db.update(smoSolicitacoes).set({ status: "concluida", atualizadoEm: new Date().toISOString() }).where(eq(smoSolicitacoes.id, input.id));
      return { success: true };
    }),

  toggleChecklistItem: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional(), concluido: z.boolean(), concluidoPor: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [chk] = await db.select({ solicitacaoId: smoOnboardingChecklist.solicitacaoId })
        .from(smoOnboardingChecklist).where(eq(smoOnboardingChecklist.id, input.id));
      if (!chk) throw new Error("Item não encontrado");
      await assertOwnership(db, chk.solicitacaoId, input);
      await db.update(smoOnboardingChecklist).set({
        concluido: input.concluido,
        concluidoPor: input.concluido ? input.concluidoPor : null,
        concluidoEm: input.concluido ? new Date().toISOString() : null,
      }).where(eq(smoOnboardingChecklist.id, input.id));
      return { success: true };
    }),

  gerarCartaBanco: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const [emp] = await db.select().from(employees).where(and(eq(employees.id, input.employeeId), companyFilter(employees.companyId, input)));
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado" });
      const [company] = await db.select().from(companies).where(eq(companies.id, emp.companyId));
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });

      const formatCPF = (c: string) => {
        const d = (c || "").replace(/\D/g, "");
        if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
        return c || "";
      };
      const formatCNPJ = (c: string) => {
        const d = (c || "").replace(/\D/g, "");
        if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
        return c || "";
      };
      const fmtDate = (d: string | null) => {
        if (!d) return "___/___/______";
        const [y, m, day] = d.split("-");
        return `${day}/${m}/${y}`;
      };

      const enderecoEmpresa = [company.endereco, company.cidade, company.estado].filter(Boolean).join(", ");
      const responsavelNome = ctx.user.name || "RH";
      const hoje = new Date();
      const cidadeData = `${company.cidade || "___________"}, ${fmtDate(hoje.toISOString().split("T")[0])}`;

      return {
        nomeEmpresa: company.razaoSocial,
        nomeFantasia: company.nomeFantasia || "",
        cnpj: formatCNPJ(company.cnpj),
        enderecoEmpresa,
        endereco: company.endereco || "",
        cidade: company.cidade || "",
        estado: company.estado || "",
        logoUrl: company.logoUrl || "",
        telefoneEmpresa: company.telefone || "",
        emailEmpresa: company.email || "",
        nomeColaborador: emp.nomeCompleto,
        cpf: formatCPF(emp.cpf),
        rg: emp.rg || "",
        cargo: emp.cargo || emp.funcao || "",
        dataAdmissao: fmtDate(emp.dataAdmissao),
        responsavelNome,
        cidadeData,
      };
    }),

  atualizarQtdEmAndamento: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional(), qtdEmAndamento: z.number().min(0) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      await db.update(smoSolicitacoes).set({
        qtdEmAndamento: input.qtdEmAndamento,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(smoSolicitacoes.id, input.id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      await assertCanEditOrDelete(db, input.id, ctx.user);
      await db.update(smoSolicitacoes).set({ deletedAt: new Date().toISOString() }).where(eq(smoSolicitacoes.id, input.id));
      return { success: true };
    }),

  dashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const all = await withRetry('dashboard', () =>
        db.select({
          status: smoSolicitacoes.status,
          quantidade: smoSolicitacoes.quantidade,
          custoTotalEstimado: smoSolicitacoes.custoTotalEstimado,
          prioridade: smoSolicitacoes.prioridade,
        })
          .from(smoSolicitacoes)
          .where(and(companyFilter(smoSolicitacoes.companyId, input), isNull(smoSolicitacoes.deletedAt)))
      );

      const byStatus: Record<string, number> = {};
      const byPrioridade: Record<string, number> = {};
      let totalCusto = 0;
      let totalVagas = 0;

      for (const r of all) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        byPrioridade[r.prioridade] = (byPrioridade[r.prioridade] || 0) + 1;
        totalCusto += parseFloat(String(r.custoTotalEstimado) || "0");
        totalVagas += r.quantidade;
      }

      return { byStatus, byPrioridade, totalCusto, totalVagas, total: all.length };
    }),

  uploadCurriculo: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      fileName: z.string(),
      fileBase64: z.string(),
      contentType: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);

      const ALLOWED_EXTS = ["pdf", "doc", "docx"];
      const ALLOWED_MIME = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      const MAX_SIZE = 10 * 1024 * 1024;

      const rawExt = (input.fileName.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!ALLOWED_EXTS.includes(rawExt)) {
        throw new Error("Tipo de arquivo não permitido. Envie PDF, DOC ou DOCX.");
      }
      if (!ALLOWED_MIME.includes(input.contentType)) {
        throw new Error("Tipo MIME não permitido.");
      }

      const buf = Buffer.from(input.fileBase64, "base64");
      if (buf.length > MAX_SIZE) {
        throw new Error("Arquivo muito grande. Máximo 10MB.");
      }

      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 100);
      const key = `smo/curriculos/${input.id}_${Date.now()}.${rawExt}`;
      const result = await storagePut(key, buf, input.contentType);
      await db.update(smoSolicitacoes).set({
        curriculoArquivoNome: safeName,
        curriculoArquivoKey: result.key,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(smoSolicitacoes.id, input.id));
      return { key: result.key, fileName: safeName };
    }),

  removerCurriculo: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      await db.update(smoSolicitacoes).set({
        curriculoArquivoNome: null,
        curriculoArquivoKey: null,
        atualizadoEm: new Date().toISOString(),
      }).where(eq(smoSolicitacoes.id, input.id));
      return { success: true };
    }),

  verificarIntegracaoObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      obraId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const [obra] = await db.select().from(obras).where(eq(obras.id, input.obraId)).limit(1);
      if (!obra || !obra.cliente) return { exigeIntegracao: false };

      const clienteNomeObra = obra.cliente.trim();

      const clienteRows = await db.select().from(clientes).where(
        and(
          companyFilter(clientes.companyId, input),
          or(
            ilike(clientes.razaoSocial, clienteNomeObra),
            ilike(clientes.nomeFantasia, clienteNomeObra),
          ),
          eq(clientes.tipo, "PJ"),
        )
      ).limit(1);

      if (clienteRows.length === 0 || !clienteRows[0].integracaoRequer) {
        return { exigeIntegracao: false };
      }

      const cfg = clienteRows[0];

      const empAtivos = await db
        .select({ id: obraFuncionarios.employeeId, nome: employees.nomeCompleto })
        .from(obraFuncionarios)
        .innerJoin(employees, eq(obraFuncionarios.employeeId, employees.id))
        .where(and(
          eq(obraFuncionarios.obraId, input.obraId),
          eq(obraFuncionarios.isActive, 1),
          eq(employees.status, "Ativo"),
        ));

      const hoje = new Date();
      const alertas: { empId: number; empNome: string; status: string; vencimento: string | null }[] = [];

      if (empAtivos.length > 0) {
        const empIds = empAtivos.map(e => e.id).filter(Boolean) as number[];
        const integracoesEmp = await db.select().from(employeeIntegrations).where(
          and(
            eq(employeeIntegrations.companyId, input.companyId),
            inArray(employeeIntegrations.employeeId, empIds),
            eq(employeeIntegrations.tipo, "externa"),
            eq(employeeIntegrations.clienteId, cfg.id),
          )
        );

        const mapUltima: Record<number, any> = {};
        for (const int of integracoesEmp) {
          const prev = mapUltima[int.employeeId];
          if (!prev || int.dataRealizacao > prev.dataRealizacao) {
            mapUltima[int.employeeId] = int;
          }
        }

        for (const emp of empAtivos) {
          if (!emp.id) continue;
          const ultima = mapUltima[emp.id];
          if (!ultima) {
            alertas.push({ empId: emp.id, empNome: emp.nome || "", status: "SEM_REGISTRO", vencimento: null });
          } else if (ultima.dataVencimento) {
            const venc = new Date(ultima.dataVencimento);
            const diasAteVenc = Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
            if (diasAteVenc < 0) {
              alertas.push({ empId: emp.id, empNome: emp.nome || "", status: "VENCIDA", vencimento: ultima.dataVencimento });
            } else if (diasAteVenc <= 30) {
              alertas.push({ empId: emp.id, empNome: emp.nome || "", status: "A_VENCER", vencimento: ultima.dataVencimento });
            }
          }
        }
      }

      return {
        exigeIntegracao: true,
        clienteId: cfg.id,
        clienteNome: cfg.razaoSocial || cfg.nomeFantasia || clienteNomeObra,
        diasSemana: cfg.integracaoDiasSemana,
        duracao: cfg.integracaoDuracao,
        validadeMeses: cfg.integracaoValidadeMeses,
        email: cfg.integracaoEmail,
        plataforma: cfg.integracaoPlataforma,
        procedimento: cfg.integracaoProcedimento,
        alertas,
        totalAlerta: alertas.length,
      };
    }),
});
