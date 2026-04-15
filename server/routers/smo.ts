import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, sql, isNull, desc, inArray } from "drizzle-orm";
import { storagePut } from "../storage";
import {
  smoSolicitacoes, smoAtividadesEap, smoOnboardingChecklist,
  obras, employees, obraFuncionarios, convencaoColetiva,
  encargosSociais, planejamentoProjetos, planejamentoAtividades,
  planejamentoRevisoes,
} from "../../drizzle/schema";

function companyFilter(col: any, input: { companyId: number; companyIds?: number[] }) {
  if (input.companyIds && input.companyIds.length > 0) {
    return inArray(col, input.companyIds);
  }
  return eq(col, input.companyId);
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
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(smoSolicitacoes.companyId, input), isNull(smoSolicitacoes.deletedAt)];
      if (input.status) conds.push(eq(smoSolicitacoes.status, input.status));
      if (input.obraId) conds.push(eq(smoSolicitacoes.obraId, input.obraId));

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

      return rows.map(r => ({
        ...r.solicitacao,
        obraNome: r.obraNome,
        atividades: eapMap[r.solicitacao.id] || [],
      }));
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
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
      return { ...row.solicitacao, obraNome: row.obraNome, atividades, checklist };
    }),

  obrasAtivas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const conds: any[] = [companyFilter(obras.companyId, input), isNull(obras.deletedAt), eq(obras.isActive, 1)];
      const isMasterOrAdmin = ctx.user.role === "admin_master" || ctx.user.role === "admin";
      if (!isMasterOrAdmin) {
        conds.push(eq(obras.responsavelId, ctx.user.id));
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
        const sals = emps.map(e => parseFloat(e.salarioBase || "0")).filter(s => s > 0);
        salarioRef = sals.length > 0 ? sals.reduce((a, b) => a + b, 0) / sals.length : 0;
      }
      if (salarioRef === 0) {
        const [conv] = await db.select().from(convencaoColetiva)
          .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
          .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);
        salarioRef = parseFloat(conv?.pisoSalarial || "2500");
      }

      const encargos = await db.select().from(encargosSociais).where(companyFilter(encargosSociais.companyId, input));
      let totalEncargosPerc = 0;
      for (const e of encargos) totalEncargosPerc += parseFloat(String(e.valor) || "0");
      if (totalEncargosPerc === 0) totalEncargosPerc = 79.3;

      const [conv] = await db.select().from(convencaoColetiva)
        .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
        .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);

      const vr = parseFloat(conv?.valeRefeicao || "0") * 22;
      const va = parseFloat(conv?.valeAlimentacao || "0");
      const vt = salarioRef * 0.06;
      const exameAdmissional = 200;
      const epiEstimado = 350;
      const uniformeEstimado = 250;

      const encargosValor = salarioRef * (totalEncargosPerc / 100);
      const custoMensal = salarioRef + encargosValor + vr + va + vt;
      const custoUnico = exameAdmissional + epiEstimado + uniformeEstimado;
      const custoMensalTotal = custoMensal * input.quantidade;
      const custoTotal = (custoMensal * input.quantidade * input.duracaoMeses) + (custoUnico * input.quantidade);

      const ferias13 = salarioRef / 12 + (salarioRef / 12) / 3 + salarioRef / 12;

      return {
        salarioBase: salarioRef,
        encargosPercentual: totalEncargosPerc,
        encargosValor,
        valeRefeicao: vr,
        valeAlimentacao: va,
        valeTransporte: vt,
        exameAdmissional,
        epiEstimado,
        uniformeEstimado,
        ferias13provisao: ferias13,
        custoMensalUnitario: custoMensal,
        custoMensalTotal,
        custoUnicoTotal: custoUnico * input.quantidade,
        custoTotal,
        baseSalarial: emps.length > 0 ? "Média dos ativos" : "Piso salarial (convenção)",
        qtdReferencia: emps.length,
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
      })).min(1),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      const encargos = await db.select().from(encargosSociais).where(companyFilter(encargosSociais.companyId, input));
      let totalEncargosPerc = 0;
      for (const e of encargos) totalEncargosPerc += parseFloat(String(e.valor) || "0");
      if (totalEncargosPerc === 0) totalEncargosPerc = 79.3;

      const [conv] = await db.select().from(convencaoColetiva)
        .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
        .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);

      const vrDiario = parseFloat(conv?.valeRefeicao || "0");
      const vrMensal = vrDiario * 22;
      const vaMensal = parseFloat(conv?.valeAlimentacao || "0");
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
          const sals = emps.map(e => parseFloat(e.salarioBase || "0")).filter(s => s > 0);
          salarioRef = sals.length > 0 ? sals.reduce((a, b) => a + b, 0) / sals.length : 0;
          if (salarioRef > 0) {
            const funcRef = emps[0].funcao || item.funcao;
            baseSalarialOrigem = emps.length === 1
              ? `Salário real (${funcRef})`
              : `Média de ${emps.length} profissionais (${funcRef})`;
          }
        }
        if (salarioRef === 0) salarioRef = parseFloat(conv?.pisoSalarial || "2500");

        const vt = salarioRef * 0.06;
        const encargosValor = salarioRef * (totalEncargosPerc / 100);

        const inss = salarioRef * 0.20;
        const fgts = salarioRef * 0.08;
        const rat = salarioRef * 0.03;
        const sistemaS = salarioRef * 0.058;
        const provisaoFerias = (salarioRef / 12) + ((salarioRef / 12) / 3);
        const provisao13 = salarioRef / 12;
        const provisaoMultaFGTS = salarioRef * 0.08 * 0.40 / 12;

        const custoMensalUnit = salarioRef + encargosValor + vrMensal + vaMensal + vt + seguroVidaGrupo + planoSaudeMensal;
        const custoMensalTotal = custoMensalUnit * item.quantidade;

        const custosAdmissaoTotal = custoAdmissao * item.quantidade;
        const examePeriodicoTotal = Math.floor(item.duracaoMeses / 12) * examePeriodico * item.quantidade;
        const exameDemissionalTotal = exameDemissional * item.quantidade;
        const custoPeriodo = (custoMensalTotal * item.duracaoMeses) + custosAdmissaoTotal + examePeriodicoTotal + exameDemissionalTotal;

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
            encargosPerc: totalEncargosPerc,
            encargosValor,
            detalhamento: {
              salarioBruto: salarioRef,
              inss,
              fgts,
              rat,
              sistemaS,
              totalEncargos: encargosValor,
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
      for (const a of alocados) totalFolhaBruta += parseFloat(a.salarioBase || "0");

      return {
        totalFuncionarios: alocados.length,
        folhaBrutaMensal: totalFolhaBruta,
      };
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
      let totalEncargosPerc = 0;
      for (const e of encargosRows) totalEncargosPerc += parseFloat(String(e.valor) || "0");
      if (totalEncargosPerc === 0) totalEncargosPerc = 79.3;

      const [convData] = await db.select().from(convencaoColetiva)
        .where(and(companyFilter(convencaoColetiva.companyId, input), eq(convencaoColetiva.status, "vigente")))
        .orderBy(desc(convencaoColetiva.vigenciaInicio)).limit(1);

      const vrDiario = parseFloat(convData?.valeRefeicao || "0");
      const vaValor = parseFloat(convData?.valeAlimentacao || "0");
      const pisoFallback = parseFloat(convData?.pisoSalarial || "2500");

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
          const sals = emps.map(e => parseFloat(e.salarioBase || "0")).filter(s => s > 0);
          salarioRef = sals.length > 0 ? sals.reduce((a, b) => a + b, 0) / sals.length : 0;
        }
        if (salarioRef === 0) salarioRef = pisoFallback;

        const vr = vrDiario * 22;
        const va = vaValor;
        const vt = salarioRef * 0.06;
        const encargosValor = salarioRef * (totalEncargosPerc / 100);
        const custoMensal = (salarioRef + encargosValor + vr + va + vt) * item.quantidade;
        const custoUnico = (200 + 350 + 250) * item.quantidade;
        const custoTotal = (custoMensal * (item.duracaoMeses || 1)) + custoUnico;

        const fatorBDI = 1.35;
        const tercMensal = salarioRef * fatorBDI * item.quantidade;
        const tercTotal = tercMensal * (item.duracaoMeses || 1);

        const detalhes = {
          salarioBase: salarioRef,
          encargosPerc: totalEncargosPerc,
          encargosValor,
          beneficios: vr + va + vt,
          custoMensalUnit: salarioRef + encargosValor + vr + va + vt,
          custoMensalTotal: custoMensal,
          custoTotal,
          tercMensalTotal: tercMensal,
          tercTotal,
          recomendacao: custoTotal > tercTotal ? "terceirizar" : "contratar",
          baseSalarial: emps.length > 0 ? "Média ativos" : "Piso convenção",
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
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, companyId, companyIds, atividades, ...data } = input;
      await assertOwnership(db, id, { companyId, companyIds });
      await db.update(smoSolicitacoes).set({ ...data, atualizadoEm: new Date().toISOString() } as any).where(eq(smoSolicitacoes.id, id));

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
      etapa: z.enum(["coord", "rh", "diretoria"]),
      aprovadorNome: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      const agora = new Date().toISOString();
      const statusMap: Record<string, string> = {
        coord: "aprovada_coord",
        rh: "aprovada_rh",
        diretoria: "aprovada_diretoria",
      };
      const colMap: Record<string, any> = {
        coord: { aprovadoPorCoord: input.aprovadorNome, aprovadoPorCoordEm: agora, status: statusMap[input.etapa] },
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

  delete: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await assertOwnership(db, input.id, input);
      await db.update(smoSolicitacoes).set({ deletedAt: new Date().toISOString() }).where(eq(smoSolicitacoes.id, input.id));
      return { success: true };
    }),

  dashboard: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const all = await db.select({
        status: smoSolicitacoes.status,
        quantidade: smoSolicitacoes.quantidade,
        custoTotalEstimado: smoSolicitacoes.custoTotalEstimado,
        prioridade: smoSolicitacoes.prioridade,
      })
        .from(smoSolicitacoes)
        .where(and(companyFilter(smoSolicitacoes.companyId, input), isNull(smoSolicitacoes.deletedAt)));

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
});
