import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { terminationNotices, vacationPeriods, employees, companies, obras, obraFuncionarios } from "../../drizzle/schema";
import { eq, and, sql, isNull, lte, gte, desc, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { parseBRL } from "../utils/parseBRL";

// ============================================================
// CÁLCULOS CLT - RESCISÃO TRABALHISTA
// ============================================================

/** Calcula anos completos de serviço entre admissão e data de referência */
function calcularAnosServico(dataAdmissao: string, dataRef?: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const ref = dataRef ? new Date(dataRef + 'T00:00:00') : new Date();
  let anos = ref.getFullYear() - admissao.getFullYear();
  const mesRef = ref.getMonth();
  const mesAdm = admissao.getMonth();
  if (mesRef < mesAdm || (mesRef === mesAdm && ref.getDate() < admissao.getDate())) {
    anos--;
  }
  return Math.max(0, anos);
}

/** Calcula meses completos de serviço (para férias proporcionais) */
function calcularMesesServico(dataAdmissao: string, dataRef?: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const ref = dataRef ? new Date(dataRef + 'T00:00:00') : new Date();
  let meses = (ref.getFullYear() - admissao.getFullYear()) * 12 + (ref.getMonth() - admissao.getMonth());
  // Se o dia de referência é menor que o dia de admissão, subtrai 1 mês
  if (ref.getDate() < admissao.getDate()) {
    meses--;
  }
  return Math.max(0, meses);
}

/** Calcula meses trabalhados no ano corrente (para 13º proporcional) */
function calcularMeses13o(dataAdmissao: string, dataDesligamento: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const deslig = new Date(dataDesligamento + 'T00:00:00');
  const anoDeslig = deslig.getFullYear();
  
  // Mês inicial: janeiro do ano OU mês de admissão (se admitido no mesmo ano)
  const mesInicio = admissao.getFullYear() === anoDeslig ? admissao.getMonth() : 0;
  const mesFim = deslig.getMonth();
  
  let meses = mesFim - mesInicio + 1;
  
  // Se admitido no mesmo mês e trabalhou menos de 15 dias, não conta o primeiro mês
  if (admissao.getFullYear() === anoDeslig && admissao.getMonth() === mesInicio) {
    const diasNoMesAdmissao = new Date(anoDeslig, mesInicio + 1, 0).getDate() - admissao.getDate() + 1;
    if (diasNoMesAdmissao < 15) {
      meses--;
    }
  }
  
  // Se no mês do desligamento trabalhou menos de 15 dias, não conta
  if (deslig.getDate() < 15) {
    meses--;
  }
  
  return Math.max(0, Math.min(12, meses));
}

/** Calcula dias TOTAIS de aviso prévio proporcional (Art. 1º Lei 12.506/2011) */
function calcularDiasAvisoTotal(anosServico: number): number {
  // 30 dias base + 3 dias por ano completo (máximo 90 dias total)
  return Math.min(30 + (anosServico * 3), 90);
}

/** Calcula dias de aviso prévio TRABALHADO (sempre 30 dias fixos) */
function calcularDiasAvisoTrabalhado(): number {
  return 30;
}

/** Calcula dias de aviso prévio conforme o tipo:
 *  - Trabalhado: 30 dias fixos (extras são indenizados separadamente)
 *  - Indenizado: 30 + 3*anos (tudo é pago, não trabalha)
 */
function calcularDiasAviso(anosServico: number, tipo?: string): number {
  if (tipo && tipo.includes('trabalhado')) {
    return 30; // Aviso trabalhado = sempre 30 dias
  }
  return calcularDiasAvisoTotal(anosServico); // Indenizado = total
}

/** Calcula dias extras do aviso prévio (Lei 12.506 - apenas os 3 dias por ano) */
function calcularDiasExtrasAviso(anosServico: number): number {
  return Math.min(anosServico * 3, 60); // máximo 60 dias extras (90 - 30 base)
}

/** Calcula data fim do aviso prévio */
function calcularDataFim(dataInicio: string, diasAviso: number): string {
  const dt = new Date(dataInicio + 'T00:00:00');
  dt.setDate(dt.getDate() + diasAviso);
  return dt.toISOString().split("T")[0];
}

/** Calcula data de início do aviso = último dia trabalhado + 1 dia */
function calcularDataInicioAviso(ultimoDiaTrabalhado: string): string {
  const dt = new Date(ultimoDiaTrabalhado + 'T00:00:00');
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().split("T")[0];
}

/** Calcula meses de férias proporcionais (desde admissão ou último período aquisitivo completo) */
function calcularMesesFeriasProporcionais(dataAdmissao: string, dataDesligamento: string): number {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
  const deslig = new Date(dataDesligamento + 'T00:00:00');
  
  // Calcular quantos períodos aquisitivos completos existem
  const mesesTotais = calcularMesesServico(dataAdmissao, dataDesligamento);
  
  // Meses proporcionais = meses desde o início do período aquisitivo atual
  const mesesProporcionais = mesesTotais % 12;
  
  // Se mesesTotais é múltiplo de 12, significa que completou exatamente N anos
  // Nesse caso, férias proporcionais = 0 (mas tem férias vencidas a pagar)
  return mesesProporcionais === 0 && mesesTotais > 0 ? 12 : mesesProporcionais;
}

/** Calcula períodos de férias vencidas (não gozadas) */
function calcularFeriasVencidas(dataAdmissao: string, dataDesligamento: string): number {
  const mesesTotais = calcularMesesServico(dataAdmissao, dataDesligamento);
  // Períodos completos de 12 meses = férias vencidas
  return Math.floor(mesesTotais / 12);
}

/**
 * CÁLCULO COMPLETO DE RESCISÃO - CLT
 * Segue exatamente as regras da CLT e Lei 12.506/2011
 */
function calcularRescisaoCompleta(params: {
  salarioBase: number;
  dataAdmissao: string;
  dataDesligamento: string;
  tipo: string;
  vrDiario: number; // valor diário do VR/VA
  diasTrabalhadosMes: number; // dias trabalhados no mês do desligamento
}) {
  const { salarioBase, dataAdmissao, dataDesligamento, tipo, vrDiario, diasTrabalhadosMes } = params;
  
  // Usar dias reais do mês para cálculo do saldo de salário (CLT)
  // Fevereiro = 28 ou 29, meses com 31 dias, etc.
  const dtDeslig = new Date(dataDesligamento + 'T00:00:00');
  const diasReaisMes = new Date(dtDeslig.getFullYear(), dtDeslig.getMonth() + 1, 0).getDate();
  const salarioDia = salarioBase / diasReaisMes;
  const anosServico = calcularAnosServico(dataAdmissao, dataDesligamento);
  const diasAvisoTotal = calcularDiasAvisoTotal(anosServico);
  const diasExtrasAviso = calcularDiasExtrasAviso(anosServico);
  
  // ============================================================
  // 1. SALDO DE SALÁRIO
  // Dias trabalhados no mês do desligamento
  // ============================================================
  const saldoSalario = salarioDia * diasTrabalhadosMes;
  
  // ============================================================
  // 2. FÉRIAS PROPORCIONAIS + 1/3 CONSTITUCIONAL
  // Meses desde o início do período aquisitivo atual
  // ============================================================
  const mesesFerias = calcularMesesFeriasProporcionais(dataAdmissao, dataDesligamento);
  const feriasProporcional = (salarioBase * mesesFerias) / 12;
  const tercoConstitucional = feriasProporcional / 3;
  const totalFerias = feriasProporcional + tercoConstitucional;
  
  // ============================================================
  // 3. FÉRIAS VENCIDAS (se houver)
  // Períodos aquisitivos completos não gozados
  // ============================================================
  const periodosVencidos = Math.max(0, calcularFeriasVencidas(dataAdmissao, dataDesligamento) - 1);
  // -1 porque o primeiro período completo gera as férias proporcionais acima
  const feriasVencidas = periodosVencidos > 0 ? (salarioBase + salarioBase / 3) * periodosVencidos : 0;
  
  // ============================================================
  // 4. 13º SALÁRIO PROPORCIONAL
  // Meses trabalhados no ano do desligamento (>14 dias = conta o mês)
  // ============================================================
  const meses13o = calcularMeses13o(dataAdmissao, dataDesligamento);
  const decimoTerceiroProporcional = (salarioBase * meses13o) / 12;
  
  // ============================================================
  // 5. AVISO PRÉVIO INDENIZADO
  // Lei 12.506/2011: 30 dias + 3 dias por ano de serviço
  // Se indenizado pelo empregador: paga os dias extras (3 por ano)
  // Se trabalhado: não há valor indenizado
  // ============================================================
  let avisoPrevioIndenizado = 0;
  if (tipo === 'empregador_indenizado') {
    // Empregador indeniza o aviso completo (30 + extras)
    avisoPrevioIndenizado = salarioDia * diasAvisoTotal;
  } else if (tipo === 'empregador_trabalhado') {
    // Empregador: aviso trabalhado, mas os dias extras da Lei 12.506 são indenizados
    avisoPrevioIndenizado = salarioDia * diasExtrasAviso;
  }
  // Se pedido pelo empregado, não há indenização
  
  // ============================================================
  // 6. VR / VALE REFEIÇÃO PROPORCIONAL
  // Dias trabalhados no mês * valor diário
  // ============================================================
  const vrProporcional = vrDiario * diasTrabalhadosMes;
  
  // ============================================================
  // 7. FGTS (estimativa - 8% sobre remuneração)
  // ============================================================
  const mesesTotais = calcularMesesServico(dataAdmissao, dataDesligamento);
  const fgtsEstimado = salarioBase * 0.08 * mesesTotais;
  
  // ============================================================
  // 8. MULTA 40% FGTS (apenas demissão sem justa causa pelo empregador)
  // ============================================================
  const multaFGTS = (tipo.includes('empregador')) ? fgtsEstimado * 0.4 : 0;
  
  // ============================================================
  // TOTAL
  // ============================================================
  const total = saldoSalario + totalFerias + feriasVencidas + decimoTerceiroProporcional + avisoPrevioIndenizado + vrProporcional;
  // Nota: FGTS e multa 40% são depositados na conta do FGTS, não somam no total líquido
  
  return {
    // Dados base
    salarioBase: salarioBase.toFixed(2),
    salarioDia: salarioDia.toFixed(2),
    diasReaisMes,
    anosServico,
    diasAvisoTotal,
    diasExtrasAviso,
    diasTrabalhadosMes,
    mesesFerias,
    meses13o,
    
    // Verbas rescisórias
    saldoSalario: saldoSalario.toFixed(2),
    feriasProporcional: feriasProporcional.toFixed(2),
    tercoConstitucional: tercoConstitucional.toFixed(2),
    totalFerias: totalFerias.toFixed(2),
    feriasVencidas: feriasVencidas.toFixed(2),
    periodosVencidos,
    decimoTerceiroProporcional: decimoTerceiroProporcional.toFixed(2),
    avisoPrevioIndenizado: avisoPrevioIndenizado.toFixed(2),
    vrProporcional: vrProporcional.toFixed(2),
    vrDiario: vrDiario.toFixed(2),
    
    // FGTS (informativo)
    fgtsEstimado: fgtsEstimado.toFixed(2),
    multaFGTS: multaFGTS.toFixed(2),
    
    // Total
    total: total.toFixed(2),
    
    // Data limite pagamento (Art. 477 §6º CLT: 10 dias corridos após desligamento)
    dataLimitePagamento: (() => {
      const dt = new Date(dataDesligamento + 'T00:00:00');
      dt.setDate(dt.getDate() + 10);
      return dt.toISOString().split("T")[0];
    })(),
  };
}

/** Calcula período aquisitivo de férias */
function calcularPeriodosFerias(dataAdmissao: string) {
  const admissao = new Date(dataAdmissao + 'T00:00:00');
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

    /** Calcular previsão de rescisão - CLT completa com descontos */
    calcular: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        tipo: z.string(),
        dataDesligamento: z.string(), // último dia trabalhado (obrigatório)
        diasTrabalhadosOverride: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
        
        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const dataDesligamento = input.dataDesligamento;
        const salarioBase = parseBRL(emp.salarioBase);
        const anosServico = calcularAnosServico(dataAdmissao, dataDesligamento);
        const diasAviso = calcularDiasAviso(anosServico, input.tipo);
        const diasExtras = calcularDiasExtrasAviso(anosServico);
        
        // Dias trabalhados no mês do desligamento
        const dtDeslig = new Date(dataDesligamento + 'T00:00:00');
        const diasTrabalhadosMes = input.diasTrabalhadosOverride ?? dtDeslig.getDate();
        
        // ============================================================
        // VR: buscar da config de benefícios da obra do funcionário
        // ============================================================
        let vrDiario = 0;
        let vrConfigNome = '';
        let vrExtra: any = {};
        try {
          const obraId = (emp as any).obraAtualId;
          let cfgRows: any[] = [];
          if (obraId) {
            const [rows] = await db.execute(
              sql`SELECT * FROM meal_benefit_configs WHERE companyId = ${emp.companyId} AND obraId = ${obraId} AND ativo = 1 LIMIT 1`
            ) as any[];
            cfgRows = rows || [];
          }
          if (cfgRows.length === 0) {
            const [rows] = await db.execute(
              sql`SELECT * FROM meal_benefit_configs WHERE companyId = ${emp.companyId} AND obraId IS NULL AND ativo = 1 LIMIT 1`
            ) as any[];
            cfgRows = rows || [];
          }
          if (cfgRows.length > 0) {
            const cfg = cfgRows[0];
            const cafe = parseBRL(cfg.cafeManhaDia);
            const lanche = parseBRL(cfg.lancheTardeDia);
            const vaMes = parseBRL(cfg.valeAlimentacaoMes);
            const diasUteis = cfg.diasUteisRef || 22;
            const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
            const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
            // Total VA iFood MENSAL = café(dia × diasUteis) + lanche(dia × diasUteis) + VA mensal
            // Cada item só entra se estiver ativo na config
            const totalVAMensal = (cafeAtivo ? cafe * diasUteis : 0) + (lancheAtivo ? lanche * diasUteis : 0) + vaMes;
            // VR proporcional na rescisão = totalMensal / dias reais do mês × dias trabalhados
            const diasReaisMesVR = new Date(dtDeslig.getFullYear(), dtDeslig.getMonth() + 1, 0).getDate();
            vrDiario = totalVAMensal / diasReaisMesVR; // usar dias reais do mês (28 para fev, 30/31 para outros)
            vrConfigNome = cfg.nome || 'Padrão';
            // Guardar info extra para exibição
            vrExtra = { totalVAMensal, cafeAtivo, lancheAtivo, cafeDia: cafe, lancheDia: lanche, vaMes, diasUteis };
          }
        } catch { vrDiario = 0; }
        
        // ============================================================
        // DESCONTOS: buscar pendências do funcionário
        // ============================================================
        const descontos: Array<{ descricao: string; valor: number; tipo: string; referencia?: string }> = [];
        
        // 1. Adiantamentos pendentes (aprovados mas não descontados)
        try {
          const [advRows] = await db.execute(
            sql`SELECT mesReferencia, valorAdiantamento FROM advances WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND aprovado = 'Aprovado' ORDER BY mesReferencia DESC`
          ) as any[];
          // Considerar o último adiantamento como pendente de desconto na rescisão
          if (advRows && advRows.length > 0) {
            const lastAdv = advRows[0];
            const val = parseBRL(lastAdv.valorAdiantamento);
            if (val > 0) {
              descontos.push({
                descricao: `Adiantamento (${lastAdv.mesReferencia})`,
                valor: val,
                tipo: 'adiantamento',
                referencia: lastAdv.mesReferencia,
              });
            }
          }
        } catch {}
        
        // 2. EPIs com desconto pendente
        try {
          const [epiRows] = await db.execute(
            sql`SELECT descricao, valorDesconto, createdAt FROM epi_discount_alerts WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND status = 'pendente' ORDER BY createdAt DESC`
          ) as any[];
          if (epiRows) {
            for (const epi of epiRows) {
              const val = parseBRL(epi.valorDesconto);
              if (val > 0) {
                descontos.push({
                  descricao: `EPI: ${epi.descricao || 'Desconto EPI'}`,
                  valor: val,
                  tipo: 'epi',
                });
              }
            }
          }
        } catch {}
        
        // 3. Descontos do ponto do mês atual (não fechados/abonados)
        try {
          const mesRef = dataDesligamento.substring(0, 7); // YYYY-MM
          const [pontoRows] = await db.execute(
            sql`SELECT tipo, valorTotal FROM ponto_descontos WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND mesReferencia = ${mesRef} AND status IN ('calculado','revisado') ORDER BY data ASC`
          ) as any[];
          if (pontoRows) {
            let totalPonto = 0;
            for (const p of pontoRows) {
              totalPonto += parseBRL(p.valorTotal);
            }
            if (totalPonto > 0) {
              descontos.push({
                descricao: `Descontos do Ponto (${mesRef})`,
                valor: totalPonto,
                tipo: 'ponto',
                referencia: mesRef,
              });
            }
          }
        } catch {}
        
        const totalDescontos = descontos.reduce((s, d) => s + d.valor, 0);
        
        // ============================================================
        // CÁLCULO DAS VERBAS RESCISÓRIAS
        // ============================================================
        const previsao = calcularRescisaoCompleta({
          salarioBase,
          dataAdmissao,
          dataDesligamento,
          tipo: input.tipo,
          vrDiario,
          diasTrabalhadosMes,
        });
        
        // Total líquido = verbas - descontos
        const totalVerbas = parseFloat(previsao.total);
        const totalLiquido = totalVerbas - totalDescontos;
        
        return {
          anosServico,
          diasAviso,
          diasExtras,
          salarioBase: salarioBase.toFixed(2),
          dataAdmissao,
          dataDesligamento,
          dataInicioAviso: calcularDataInicioAviso(dataDesligamento),
          dataFimEstimada: calcularDataFim(calcularDataInicioAviso(dataDesligamento), diasAviso),
          previsaoRescisao: previsao,
          vrConfigNome,
          vrExtra,
          descontos: descontos.map(d => ({ ...d, valor: d.valor.toFixed(2) })),
          totalDescontos: totalDescontos.toFixed(2),
          totalLiquido: totalLiquido.toFixed(2),
          funcionario: {
            nome: emp.nomeCompleto,
            cargo: emp.cargo || (emp as any).funcao || '',
            cpf: emp.cpf,
            obraAtualId: (emp as any).obraAtualId,
          },
        };
      }),

    /** Buscar configuração de benefícios de alimentação */
    getMealBenefitConfig: protectedProcedure
      .input(z.object({ companyId: z.number(), obraId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        try {
          if (input.obraId) {
            const [rows] = await db.execute(
              sql`SELECT * FROM meal_benefit_configs WHERE companyId = ${input.companyId} AND obraId = ${input.obraId} AND ativo = 1 LIMIT 1`
            ) as any[];
            if (rows && rows.length > 0) return rows[0];
          }
          // Fallback: config padrão da empresa
          const [rows] = await db.execute(
            sql`SELECT * FROM meal_benefit_configs WHERE companyId = ${input.companyId} AND obraId IS NULL AND ativo = 1 LIMIT 1`
          ) as any[];
          return rows && rows.length > 0 ? rows[0] : null;
        } catch {
          return null;
        }
      }),

    /** Listar todas as configurações de benefícios de alimentação */
    listMealBenefitConfigs: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        try {
          const [rows] = await db.execute(
            sql`SELECT mbc.*, o.nome as obraNome FROM meal_benefit_configs mbc LEFT JOIN obras o ON mbc.obraId = o.id WHERE mbc.companyId = ${input.companyId} ORDER BY mbc.obraId IS NULL DESC, o.nome ASC`
          ) as any[];
          return rows || [];
        } catch {
          return [];
        }
      }),

    /** Criar/atualizar configuração de benefícios de alimentação */
    saveMealBenefitConfig: protectedProcedure
      .input(z.object({
        id: z.number().optional(),
        companyId: z.number(),
        obraId: z.number().nullable().optional(),
        nome: z.string(),
        cafeManhaDia: z.string(),
        lancheTardeDia: z.string(),
        valeAlimentacaoMes: z.string(),
        jantaDia: z.string(),
        totalVA_iFood: z.string(),
        diasUteisRef: z.number().default(22),
        cafeAtivo: z.boolean().default(true),
        lancheAtivo: z.boolean().default(true),
        jantaAtivo: z.boolean().default(false),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const cafeAtivoInt = input.cafeAtivo ? 1 : 0;
        const lancheAtivoInt = input.lancheAtivo ? 1 : 0;
        const jantaAtivoInt = input.jantaAtivo ? 1 : 0;
        if (input.id) {
          await db.execute(
            sql`UPDATE meal_benefit_configs SET 
              nome = ${input.nome},
              obraId = ${input.obraId ?? null},
              cafeManhaDia = ${input.cafeManhaDia},
              lancheTardeDia = ${input.lancheTardeDia},
              valeAlimentacaoMes = ${input.valeAlimentacaoMes},
              jantaDia = ${input.jantaDia},
              totalVA_iFood = ${input.totalVA_iFood},
              diasUteisRef = ${input.diasUteisRef},
              cafeAtivo = ${cafeAtivoInt},
              lancheAtivo = ${lancheAtivoInt},
              jantaAtivo = ${jantaAtivoInt},
              observacoes = ${input.observacoes || null}
            WHERE id = ${input.id}`
          );
          return { success: true, id: input.id };
        } else {
          const [result] = await db.execute(
            sql`INSERT INTO meal_benefit_configs (companyId, obraId, nome, cafeManhaDia, lancheTardeDia, valeAlimentacaoMes, jantaDia, totalVA_iFood, diasUteisRef, cafeAtivo, lancheAtivo, jantaAtivo, observacoes)
            VALUES (${input.companyId}, ${input.obraId ?? null}, ${input.nome}, ${input.cafeManhaDia}, ${input.lancheTardeDia}, ${input.valeAlimentacaoMes}, ${input.jantaDia}, ${input.totalVA_iFood}, ${input.diasUteisRef}, ${cafeAtivoInt}, ${lancheAtivoInt}, ${jantaAtivoInt}, ${input.observacoes || null})`
          ) as any;
          return { success: true, id: result.insertId };
        }
      }),

    /** Deletar configuração de benefícios de alimentação */
    deleteMealBenefitConfig: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        await db.execute(sql`DELETE FROM meal_benefit_configs WHERE id = ${input.id}`);
        return { success: true };
      }),

    create: protectedProcedure
      .input(z.object({
        companyId: z.number(),
        employeeId: z.number(),
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']),
        dataInicio: z.string(),
        dataDesligamento: z.string().optional(),
        reducaoJornada: z.enum(['2h_dia','7_dias_corridos','nenhuma']).default('nenhuma'),
        observacoes: z.string().optional(),
        vrDiario: z.number().optional(),
        diasTrabalhados: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });
        
        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const dataDesligamento = input.dataDesligamento || input.dataInicio;
        // dataInicio do aviso = último dia trabalhado + 1
        const dataInicioAviso = calcularDataInicioAviso(input.dataInicio);
        const anosServico = calcularAnosServico(dataAdmissao, dataDesligamento);
        const diasAviso = calcularDiasAviso(anosServico, input.tipo);
        const salarioBase = parseBRL(emp.salarioBase);
        const dataFim = calcularDataFim(dataInicioAviso, diasAviso);
        
        const dtDeslig = new Date(dataDesligamento + 'T00:00:00');
        const diasTrabalhadosMes = input.diasTrabalhados ?? dtDeslig.getDate();
        
        const previsao = calcularRescisaoCompleta({
          salarioBase,
          dataAdmissao,
          dataDesligamento,
          tipo: input.tipo,
          vrDiario: input.vrDiario ?? 0,
          diasTrabalhadosMes,
        });
        
        const [result] = await db.insert(terminationNotices).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          tipo: input.tipo,
          dataInicio: dataInicioAviso,
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
        tipo: z.enum(['empregador_trabalhado','empregador_indenizado','empregado_trabalhado','empregado_indenizado']).optional(),
        dataInicio: z.string().optional(),
        dataDesligamento: z.string().optional(),
        reducaoJornada: z.enum(['2h_dia','7_dias_corridos','nenhuma']).optional(),
        status: z.enum(['em_andamento','concluido','cancelado']).optional(),
        dataConclusao: z.string().optional(),
        motivoCancelamento: z.string().optional(),
        observacoes: z.string().optional(),
        diasTrabalhados: z.number().optional(),
        recalcular: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const { id, recalcular, diasTrabalhados, dataDesligamento, ...rest } = input;
        const updateData: any = {};
        Object.entries(rest).forEach(([k, v]) => { if (v !== undefined) updateData[k] = v; });

        // Se recalcular=true, busca o aviso e o funcionário para recalcular tudo
        if (recalcular) {
          const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, id));
          if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
          const [emp] = await db.select().from(employees).where(eq(employees.id, aviso.employeeId));
          if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' });

          const tipo = input.tipo || aviso.tipo;
          // Se dataInicio é passado, é o último dia trabalhado, precisa +1
          const dataInicioFinal = input.dataInicio ? calcularDataInicioAviso(input.dataInicio) : aviso.dataInicio;
          const dataDesligFinal = dataDesligamento || (input.dataInicio || aviso.dataInicio);
          const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
          const anosServico = calcularAnosServico(dataAdmissao, dataDesligFinal);
          const diasAviso = calcularDiasAviso(anosServico, tipo);
          const salarioBase = parseBRL(emp.salarioBase);
          const dataFim = calcularDataFim(dataInicioFinal, diasAviso);
          const dtDeslig = new Date(dataDesligFinal + 'T00:00:00');
          const diasTrabalhadosMes = diasTrabalhados ?? dtDeslig.getDate();

          const previsao = calcularRescisaoCompleta({
            salarioBase,
            dataAdmissao,
            dataDesligamento: dataDesligFinal,
            tipo,
            vrDiario: 0,
            diasTrabalhadosMes,
          });

          updateData.tipo = tipo;
          updateData.dataInicio = dataInicioFinal;
          updateData.dataFim = dataFim;
          updateData.diasAviso = diasAviso;
          updateData.anosServico = anosServico;
          updateData.salarioBase = salarioBase.toFixed(2);
          updateData.previsaoRescisao = JSON.stringify(previsao);
          updateData.valorEstimadoTotal = previsao.total;
        }

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

    /** Gerar dados para PDF do Aviso Prévio */
    gerarPdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices)
          .where(and(eq(terminationNotices.id, input.id), isNull(terminationNotices.deletedAt)));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });

        const [emp] = await db.select().from(employees).where(eq(employees.id, aviso.employeeId));
        if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' });

        const [empresa] = await db.select().from(companies).where(eq(companies.id, aviso.companyId));

        let previsao: any = {};
        try { previsao = JSON.parse(aviso.previsaoRescisao || '{}'); } catch { }

        const tipoLabels: Record<string, string> = {
          'empregador_trabalhado': 'Aviso Prévio Trabalhado (pelo Empregador)',
          'empregador_indenizado': 'Aviso Prévio Indenizado (pelo Empregador)',
          'empregado_trabalhado': 'Aviso Prévio Trabalhado (pelo Empregado)',
          'empregado_indenizado': 'Aviso Prévio Indenizado (pelo Empregado)',
        };

        const reducaoLabels: Record<string, string> = {
          '2h_dia': 'Redução de 2 horas diárias (Art. 488 CLT)',
          '7_dias_corridos': '7 dias corridos (Art. 488, parágrafo único CLT)',
          'nenhuma': 'Sem redução',
        };

        return {
          empresa: {
            nome: empresa?.razaoSocial || empresa?.nomeFantasia || '',
            cnpj: empresa?.cnpj || '',
            endereco: empresa?.endereco || '',
            cidade: empresa?.cidade || '',
            estado: empresa?.estado || '',
          },
          funcionario: {
            nome: emp.nomeCompleto,
            cpf: emp.cpf,
            cargo: emp.cargo || (emp as any).funcao || '',
            dataAdmissao: emp.dataAdmissao || '',
            ctps: (emp as any).ctps || '',
            serieCtps: (emp as any).serieCtps || '',
          },
          aviso: {
            tipo: aviso.tipo,
            tipoLabel: tipoLabels[aviso.tipo] || aviso.tipo,
            dataInicio: aviso.dataInicio,
            dataFim: aviso.dataFim,
            diasAviso: aviso.diasAviso,
            anosServico: aviso.anosServico,
            reducaoJornada: aviso.reducaoJornada,
            reducaoLabel: reducaoLabels[aviso.reducaoJornada || 'nenhuma'] || '',
            salarioBase: aviso.salarioBase,
            status: aviso.status,
            observacoes: aviso.observacoes,
          },
          previsaoRescisao: previsao,
          valorEstimadoTotal: aviso.valorEstimadoTotal,
        };
      }),

    /** Alerta 80 dias - Obras próximas do fim com funcionários alocados */
    alertaObras80Dias: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];
        const em80dias = new Date(hoje);
        em80dias.setDate(em80dias.getDate() + 80);
        const em80diasStr = em80dias.toISOString().split('T')[0];

        const obrasAtivas = await db.select().from(obras)
          .where(and(
            eq(obras.companyId, input.companyId),
            sql`${obras.deletedAt} IS NULL`,
            sql`${obras.status} IN ('Em_Andamento', 'Em Andamento')`,
            sql`${obras.dataPrevisaoFim} IS NOT NULL`,
            sql`${obras.dataPrevisaoFim} BETWEEN ${hojeStr} AND ${em80diasStr}`,
          ));

        const allEmps = await db.select().from(employees)
          .where(and(
            eq(employees.companyId, input.companyId),
            sql`${employees.deletedAt} IS NULL`,
            eq(employees.status, 'Ativo'),
          ));

        const result = obrasAtivas.map(obra => {
          const fimPrevisto = new Date(obra.dataPrevisaoFim! + 'T00:00:00');
          const diasRestantes = Math.ceil((fimPrevisto.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          const funcsAlocados = allEmps.filter(e => (e as any).obraAtualId === obra.id);

          return {
            obraId: obra.id,
            obraNome: obra.nome,
            obraCodigo: obra.codigo,
            cliente: obra.cliente,
            dataPrevisaoFim: obra.dataPrevisaoFim,
            diasRestantes,
            urgencia: diasRestantes <= 30 ? 'critico' as const : diasRestantes <= 60 ? 'urgente' as const : 'atencao' as const,
            funcionarios: funcsAlocados.map(e => ({
              id: e.id,
              nome: e.nomeCompleto,
              cargo: e.cargo || (e as any).funcao || '',
              dataAdmissao: e.dataAdmissao,
              anosServico: e.dataAdmissao ? calcularAnosServico(e.dataAdmissao) : 0,
              diasAvisoPrevio: e.dataAdmissao ? calcularDiasAvisoTotal(calcularAnosServico(e.dataAdmissao)) : 30,
            })),
            totalFuncionarios: funcsAlocados.length,
          };
        }).sort((a, b) => a.diasRestantes - b.diasRestantes);

        return result;
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

    alertas: protectedProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date().toISOString().split("T")[0];
        const em60dias = new Date();
        em60dias.setDate(em60dias.getDate() + 60);
        const em60diasStr = em60dias.toISOString().split("T")[0];
        
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

    gerarPeriodos: protectedProcedure
      .input(z.object({ companyId: z.number(), employeeId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp || !emp.dataAdmissao) throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário sem data de admissão" });
        
        const periodos = calcularPeriodosFerias(emp.dataAdmissao);
        
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

    fluxoCaixa: protectedProcedure
      .input(z.object({ companyId: z.number(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        
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
              if (fimConcessivo >= inicioMes && fimConcessivo <= new Date(input.ano, mes + 3, 0)) {
                const salario = parseBRL(func.salario);
                const valorFerias = salario + (salario / 3);
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
                break;
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
        
        const salario = parseBRL(emp.salarioBase);
        const diasGozo = input.diasGozo;
        const diasAbono = input.abonoPecuniario ? Math.floor(diasGozo / 3) : 0;
        const diasEfetivos = diasGozo - diasAbono;
        
        const valorFerias = (salario / 30) * diasEfetivos;
        const terco = valorFerias / 3;
        const valorAbono = input.abonoPecuniario ? (salario / 30) * diasAbono + ((salario / 30) * diasAbono / 3) : 0;
        const total = valorFerias + terco + valorAbono;
        
        let dataPagamento: string | null = null;
        if (input.dataInicio) {
          const dt = new Date(input.dataInicio + 'T00:00:00');
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
