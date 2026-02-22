import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { terminationNotices, vacationPeriods, employees, companies } from "../../drizzle/schema";
import { eq, and, sql, isNull, lte, gte, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ============================================================
// CÁLCULOS CLT
// ============================================================

/** Calcula dias de aviso prévio proporcional (Art. 1º Lei 12.506/2011) */
function calcularDiasAviso(anosServico: number): number {
  // 30 dias base + 3 dias por ano (máximo 90 dias)
  return Math.min(30 + (anosServico * 3), 90);
}

/** Calcula anos de serviço */
function calcularAnosServico(dataAdmissao: string): number {
  const admissao = new Date(dataAdmissao);
  const hoje = new Date();
  let anos = hoje.getFullYear() - admissao.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesAdmissao = admissao.getMonth();
  if (mesAtual < mesAdmissao || (mesAtual === mesAdmissao && hoje.getDate() < admissao.getDate())) {
    anos--;
  }
  return Math.max(0, anos);
}

/** Calcula data fim do aviso prévio */
function calcularDataFim(dataInicio: string, diasAviso: number): string {
  const dt = new Date(dataInicio);
  dt.setDate(dt.getDate() + diasAviso);
  return dt.toISOString().split("T")[0];
}

/** Estima valor da rescisão */
function estimarRescisao(salarioBase: number, anosServico: number, mesesTrabalhadosAno: number, diasTrabalhadosMes: number, tipo: string) {
  const salarioDia = salarioBase / 30;
  const saldoSalario = salarioDia * diasTrabalhadosMes;
  const decimoTerceiroProp = (salarioBase / 12) * mesesTrabalhadosAno;
  const feriasProp = (salarioBase / 12) * mesesTrabalhadosAno;
  const tercoFerias = feriasProp / 3;
  
  // FGTS: 8% do salário por mês trabalhado (estimativa)
  const fgtsEstimado = salarioBase * 0.08 * (anosServico * 12 + mesesTrabalhadosAno);
  
  // Multa 40% FGTS (apenas demissão sem justa causa pelo empregador)
  const multaFGTS = tipo.includes('empregador') ? fgtsEstimado * 0.4 : 0;
  
  // Aviso prévio indenizado
  const diasAviso = calcularDiasAviso(anosServico);
  const avisoPrevioIndenizado = tipo.includes('indenizado') ? salarioDia * diasAviso : 0;
  
  const total = saldoSalario + decimoTerceiroProp + feriasProp + tercoFerias + multaFGTS + avisoPrevioIndenizado;
  
  return {
    saldoSalario: saldoSalario.toFixed(2),
    decimoTerceiroProporcional: decimoTerceiroProp.toFixed(2),
    feriasProporcional: feriasProp.toFixed(2),
    tercoConstitucional: tercoFerias.toFixed(2),
    fgtsEstimado: fgtsEstimado.toFixed(2),
    multaFGTS: multaFGTS.toFixed(2),
    avisoPrevioIndenizado: avisoPrevioIndenizado.toFixed(2),
    total: total.toFixed(2),
  };
}

/** Calcula período aquisitivo de férias */
function calcularPeriodosFerias(dataAdmissao: string) {
  const admissao = new Date(dataAdmissao);
  const hoje = new Date();
  const periodos = [];
  
  let inicioAquisitivo = new Date(admissao);
  while (inicioAquisitivo < hoje) {
    const fimAquisitivo = new Date(inicioAquisitivo);
    fimAquisitivo.setFullYear(fimAquisitivo.getFullYear() + 1);
    fimAquisitivo.setDate(fimAquisitivo.getDate() - 1);
    
    const fimConcessivo = new Date(fimAquisitivo);
    fimConcessivo.setFullYear(fimConcessivo.getFullYear() + 1);
    
    const vencida = hoje > fimConcessivo;
    
    periodos.push({
      inicio: inicioAquisitivo.toISOString().split("T")[0],
      fim: fimAquisitivo.toISOString().split("T")[0],
      fimConcessivo: fimConcessivo.toISOString().split("T")[0],
      vencida,
      adquirido: fimAquisitivo <= hoje,
    });
    
    inicioAquisitivo = new Date(fimAquisitivo);
    inicioAquisitivo.setDate(inicioAquisitivo.getDate() + 1);
  }
  
  return periodos;
}

export const avisoPrevioFeriasRouter = router({
  // ============================================================
  // AVISO PRÉVIO
  // ============================================================
  avisoPrevio: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), status: z.string().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [
          eq(terminationNotices.companyId, input.companyId),
          isNull(terminationNotices.deletedAt),
        ];
        if (input.status) conditions.push(eq(terminationNotices.status, input.status as any));
        
        const rows = await db.select({
          id: terminationNotices.id,
          companyId: terminationNotices.companyId,
          employeeId: terminationNotices.employeeId,
          tipo: terminationNotices.tipo,
          dataInicio: terminationNotices.dataInicio,
          dataFim: terminationNotices.dataFim,
          diasAviso: terminationNotices.diasAviso,
          anosServico: terminationNotices.anosServico,
          reducaoJornada: terminationNotices.reducaoJornada,
          salarioBase: terminationNotices.salarioBase,
          previsaoRescisao: terminationNotices.previsaoRescisao,
          valorEstimadoTotal: terminationNotices.valorEstimadoTotal,
          status: terminationNotices.status,
          dataConclusao: terminationNotices.dataConclusao,
          observacoes: terminationNotices.observacoes,
          criadoPor: terminationNotices.criadoPor,
          createdAt: terminationNotices.createdAt,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
        })
        .from(terminationNotices)
        .innerJoin(employees, eq(terminationNotices.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(terminationNotices.createdAt));
        
        return rows;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select()
          .from(terminationNotices)
          .where(eq(terminationNotices.id, input.id));
        return row || null;
      }),

    calcular: protectedProcedure
      .input(z.object({ employeeId: z.number(), tipo: z.string() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
        
        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const anosServico = calcularAnosServico(dataAdmissao);
        const diasAviso = calcularDiasAviso(anosServico);
        const salarioBase = parseFloat(emp.salarioBase || "0");
        
        const hoje = new Date();
        const mesesTrabalhadosAno = hoje.getMonth() + 1;
        const diasTrabalhadosMes = hoje.getDate();
        
        const previsao = estimarRescisao(salarioBase, anosServico, mesesTrabalhadosAno, diasTrabalhadosMes, input.tipo);
        
        return {
          anosServico,
          diasAviso,
          salarioBase: salarioBase.toFixed(2),
          dataFimEstimada: calcularDataFim(new Date().toISOString().split("T")[0], diasAviso),
          previsaoRescisao: previsao,
        };
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number(),
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']),
        dataInicio: z.string(),
        reducaoJornada: z.enum(['2h_dia','7_dias_corridos','nenhuma']).default('nenhuma'),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
        
        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const anosServico = calcularAnosServico(dataAdmissao);
        const diasAviso = calcularDiasAviso(anosServico);
        const salarioBase = parseFloat(emp.salarioBase || "0");
        const dataFim = calcularDataFim(input.dataInicio, diasAviso);
        
        const hoje = new Date();
        const mesesTrabalhadosAno = hoje.getMonth() + 1;
        const diasTrabalhadosMes = hoje.getDate();
        const previsao = estimarRescisao(salarioBase, anosServico, mesesTrabalhadosAno, diasTrabalhadosMes, input.tipo);
        
        const [result] = await db.insert(terminationNotices).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipo: input.tipo,
          dataInicio: input.dataInicio,
          dataFim,
          diasAviso,
          anosServico,
          reducaoJornada: input.reducaoJornada,
          salarioBase: salarioBase.toFixed(2),
          previsaoRescisao: JSON.stringify(previsao),
          valorEstimadoTotal: previsao.total,
          status: 'em_andamento',
          observacoes: input.observacoes || null,
          criadoPor: ctx.user.name ?? 'Sistema',
          criadoPorUserId: ctx.user.id,
        });
        
        return { success: true, id: result.insertId, diasAviso, dataFim, previsao };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        reducaoJornada: z.enum(['2h_dia','7_dias_corridos','nenhuma']).optional(),
        status: z.enum(['em_andamento','concluido','cancelado']).optional(),
        dataConclusao: z.string().optional(),
        motivoCancelamento: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(terminationNotices).set(updateData).where(eq(terminationNotices.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(terminationNotices).set({
          deletedAt: sql`NOW()`,
          deletedBy: ctx.user.name ?? 'Sistema',
          deletedByUserId: ctx.user.id,
        } as any).where(eq(terminationNotices.id, input.id));
        return { success: true };
      }),
  }),

  // ============================================================
  // FÉRIAS
  // ============================================================
  ferias: router({
    list: protectedProcedure
      .input(z.object({ companyId: z.number(), status: z.string().optional(), employeeId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions = [
          eq(vacationPeriods.companyId, input.companyId),
          isNull(vacationPeriods.deletedAt),
        ];
        if (input.status) conditions.push(eq(vacationPeriods.status, input.status as any));
        if (input.employeeId) conditions.push(eq(vacationPeriods.employeeId, input.employeeId));
        
        const rows = await db.select({
          id: vacationPeriods.id,
          companyId: vacationPeriods.companyId,
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          diasGozo: vacationPeriods.diasGozo,
          fracionamento: vacationPeriods.fracionamento,
          abonoPecuniario: vacationPeriods.abonoPecuniario,
          valorFerias: vacationPeriods.valorFerias,
          valorTercoConstitucional: vacationPeriods.valorTercoConstitucional,
          valorTotal: vacationPeriods.valorTotal,
          dataPagamento: vacationPeriods.dataPagamento,
          status: vacationPeriods.status,
          vencida: vacationPeriods.vencida,
          pagamentoEmDobro: vacationPeriods.pagamentoEmDobro,
          observacoes: vacationPeriods.observacoes,
          createdAt: vacationPeriods.createdAt,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeSalario: employees.salarioBase,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(vacationPeriods.periodoConcessivoFim));
        
        return rows;
      }),

    /** Calendário de férias - visão mensal para fluxo de caixa */
    calendario: protectedProcedure
      .input(z.object({ companyId: z.number(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const inicioAno = `${input.ano}-01-01`;
        const fimAno = `${input.ano}-12-31`;
        
        const rows = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          diasGozo: vacationPeriods.diasGozo,
          valorTotal: vacationPeriods.valorTotal,
          status: vacationPeriods.status,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
          employeeSalario: employees.salarioBase,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          eq(vacationPeriods.companyId, input.companyId),
          isNull(vacationPeriods.deletedAt),
          sql`(${vacationPeriods.dataInicio} BETWEEN ${inicioAno} AND ${fimAno} OR ${vacationPeriods.periodoConcessivoFim} BETWEEN ${inicioAno} AND ${fimAno})`,
        ))
        .orderBy(asc(vacationPeriods.dataInicio));
        
        return rows;
      }),

    /** Alertas de férias vencidas e prestes a vencer */
    alertas: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date().toISOString().split("T")[0];
        const em30dias = new Date();
        em30dias.setDate(em30dias.getDate() + 30);
        const em30diasStr = em30dias.toISOString().split("T")[0];
        const em60dias = new Date();
        em60dias.setDate(em60dias.getDate() + 60);
        const em60diasStr = em60dias.toISOString().split("T")[0];
        
        // Férias vencidas (período concessivo já passou e status pendente)
        const vencidas = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          status: vacationPeriods.status,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          eq(vacationPeriods.companyId, input.companyId),
          isNull(vacationPeriods.deletedAt),
          eq(vacationPeriods.status, 'pendente'),
          sql`${vacationPeriods.periodoConcessivoFim} < ${hoje}`,
        ));
        
        // Prestes a vencer (próximos 60 dias)
        const prestesVencer = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          status: vacationPeriods.status,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          eq(vacationPeriods.companyId, input.companyId),
          isNull(vacationPeriods.deletedAt),
          eq(vacationPeriods.status, 'pendente'),
          sql`${vacationPeriods.periodoConcessivoFim} BETWEEN ${hoje} AND ${em60diasStr}`,
        ));
        
        return { vencidas, prestesVencer };
      }),

    /** Gerar períodos de férias automaticamente para um funcionário */
    gerarPeriodos: protectedProcedure
      .input(z.object({ companyId: z.number(), employeeId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp || !emp.dataAdmissao) throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário sem data de admissão" });
        
        const periodos = calcularPeriodosFerias(emp.dataAdmissao);
        
        // Verificar quais períodos já existem
        const existentes = await db.select({ periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio })
          .from(vacationPeriods)
          .where(and(
            eq(vacationPeriods.companyId, input.companyId),
            eq(vacationPeriods.employeeId, input.employeeId),
            isNull(vacationPeriods.deletedAt),
          ));
        
        const existentesSet = new Set(existentes.map(e => e.periodoAquisitivoInicio));
        let criados = 0;
        
        for (const p of periodos) {
          if (p.adquirido && !existentesSet.has(p.inicio)) {
            await db.insert(vacationPeriods).values({
              companyId: input.companyId,
              employeeId: input.employeeId,
              periodoAquisitivoInicio: p.inicio,
              periodoAquisitivoFim: p.fim,
              periodoConcessivoFim: p.fimConcessivo,
              status: p.vencida ? 'vencida' : 'pendente',
              vencida: p.vencida ? 1 : 0,
              pagamentoEmDobro: p.vencida ? 1 : 0,
            });
            criados++;
          }
        }
        
        return { success: true, periodosGerados: criados };
      }),

    /** Fluxo de caixa prévio - previsão de gastos com férias por mês */
    fluxoCaixa: protectedProcedure
      .input(z.object({ companyId: z.number(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        
        // Buscar todos os funcionários ativos com data de admissão
        const funcs = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          dataAdmissao: employees.dataAdmissao,
          salario: employees.salarioBase,
          cargo: employees.cargo,
          status: employees.status,
        })
        .from(employees)
        .where(and(
          eq(employees.companyId, input.companyId),
          eq(employees.status, 'Ativo'),
          isNull(employees.deletedAt),
        ));
        
        // Para cada mês do ano, calcular quem tem férias vencendo
        const meses: any[] = [];
        for (let mes = 0; mes < 12; mes++) {
          const inicioMes = new Date(input.ano, mes, 1);
          const fimMes = new Date(input.ano, mes + 1, 0);
          const funcionariosNoMes: any[] = [];
          let totalMes = 0;
          
          for (const func of funcs) {
            if (!func.dataAdmissao) continue;
            const periodos = calcularPeriodosFerias(func.dataAdmissao);
            
            for (const p of periodos) {
              if (!p.adquirido) continue;
              const fimConcessivo = new Date(p.fimConcessivo);
              // Se o período concessivo vence neste mês ou nos próximos 2 meses
              if (fimConcessivo >= inicioMes && fimConcessivo <= new Date(input.ano, mes + 3, 0)) {
                const salario = parseFloat(func.salario || "0");
                const valorFerias = salario + (salario / 3); // salário + 1/3
                totalMes += valorFerias;
                funcionariosNoMes.push({
                  id: func.id,
                  nome: func.nome,
                  cargo: func.cargo,
                  salario: func.salario,
                  valorEstimado: valorFerias.toFixed(2),
                  fimConcessivo: p.fimConcessivo,
                  vencida: p.vencida,
                });
                break; // Apenas o período mais urgente
              }
            }
          }
          
          meses.push({
            mes: mes + 1,
            nomeMes: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes],
            totalFuncionarios: funcionariosNoMes.length,
            valorTotal: totalMes.toFixed(2),
            funcionarios: funcionariosNoMes,
          });
        }
        
        return meses;
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number(),
        periodoAquisitivoInicio: z.string(),
        periodoAquisitivoFim: z.string(),
        periodoConcessivoFim: z.string(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        diasGozo: z.number().default(30),
        fracionamento: z.number().default(1),
        periodo2Inicio: z.string().optional(),
        periodo2Fim: z.string().optional(),
        periodo3Inicio: z.string().optional(),
        periodo3Fim: z.string().optional(),
        abonoPecuniario: z.number().default(0),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });
        
        const salario = parseFloat(emp.salarioBase || "0");
        const diasGozo = input.diasGozo;
        const diasAbono = input.abonoPecuniario ? Math.floor(diasGozo / 3) : 0;
        const diasEfetivos = diasGozo - diasAbono;
        
        const valorFerias = (salario / 30) * diasEfetivos;
        const terco = valorFerias / 3;
        const valorAbono = input.abonoPecuniario ? (salario / 30) * diasAbono + ((salario / 30) * diasAbono / 3) : 0;
        const total = valorFerias + terco + valorAbono;
        
        // Pagamento deve ser 2 dias antes do início
        let dataPagamento: string | null = null;
        if (input.dataInicio) {
          const dt = new Date(input.dataInicio);
          dt.setDate(dt.getDate() - 2);
          dataPagamento = dt.toISOString().split("T")[0];
        }
        
        await db.insert(vacationPeriods).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          periodoAquisitivoInicio: input.periodoAquisitivoInicio,
          periodoAquisitivoFim: input.periodoAquisitivoFim,
          periodoConcessivoFim: input.periodoConcessivoFim,
          dataInicio: input.dataInicio || null,
          dataFim: input.dataFim || null,
          diasGozo,
          fracionamento: input.fracionamento,
          periodo2Inicio: input.periodo2Inicio || null,
          periodo2Fim: input.periodo2Fim || null,
          periodo3Inicio: input.periodo3Inicio || null,
          periodo3Fim: input.periodo3Fim || null,
          abonoPecuniario: input.abonoPecuniario,
          valorFerias: valorFerias.toFixed(2),
          valorTercoConstitucional: terco.toFixed(2),
          valorAbono: valorAbono.toFixed(2),
          valorTotal: total.toFixed(2),
          dataPagamento,
          status: input.dataInicio ? 'agendada' : 'pendente',
          aprovadoPor: ctx.user.name ?? 'Sistema',
          aprovadoPorUserId: ctx.user.id,
          observacoes: input.observacoes || null,
        });
        
        return { success: true };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        dataInicio: z.string().optional(),
        dataFim: z.string().optional(),
        diasGozo: z.number().optional(),
        fracionamento: z.number().optional(),
        periodo2Inicio: z.string().optional(),
        periodo2Fim: z.string().optional(),
        periodo3Inicio: z.string().optional(),
        periodo3Fim: z.string().optional(),
        abonoPecuniario: z.number().optional(),
        status: z.string().optional(),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });
        await db.update(vacationPeriods).set(updateData).where(eq(vacationPeriods.id, id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        await db.update(vacationPeriods).set({
          deletedAt: sql`NOW()`,
          deletedBy: ctx.user.name ?? 'Sistema',
          deletedByUserId: ctx.user.id,
        } as any).where(eq(vacationPeriods.id, input.id));
        return { success: true };
      }),
  }),
});
