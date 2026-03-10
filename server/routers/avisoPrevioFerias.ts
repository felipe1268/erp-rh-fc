import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb, createAuditLog } from "../db";
import { terminationNotices, vacationPeriods, employees, companies, obras, obraFuncionarios } from "../../drizzle/schema";
import { eq, and, sql, isNull, lte, gte, desc, asc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
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

/** Calcula data fim do aviso prévio (dia de início conta como dia 1) */
function calcularDataFim(dataInicio: string, diasAviso: number): string {
  const dt = new Date(dataInicio + 'T00:00:00');
  dt.setDate(dt.getDate() + diasAviso - 1);
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
 * 
 * REGRAS IMPORTANTES:
 * - O aviso prévio integra o tempo de serviço para TODOS os efeitos legais (Art. 487 §1º CLT)
 * - A "data de saída" = dia seguinte ao término do aviso (para saldo de salário)
 * - Férias proporcionais: da admissão até a data de saída
 * - 13º proporcional: de janeiro do ano vigente até a data de saída
 * - FGTS: calculado até a data de saída
 * - Saldo de salário: divisor = 30 (padrão CLT)
 */
function calcularRescisaoCompleta(params: {
  salarioBase: number;
  dataAdmissao: string;
  dataDesligamento: string;
  dataFimAviso?: string; // data de término do aviso prévio
  tipo: string;
  vrDiario: number; // valor diário do VR/VA
  diasTrabalhadosMes: number; // dias trabalhados no mês do término (calculado externamente)
}) {
  const { salarioBase, dataAdmissao, dataDesligamento, tipo, vrDiario, diasTrabalhadosMes } = params;
  
  // ============================================================
  // DATA DE REFERÊNCIA PARA CÁLCULOS
  // CLT Art. 487 §1º: O período do aviso prévio integra o tempo
  // de serviço para TODOS os efeitos legais.
  // 
  // REGRA: O aviso prévio projeta o tempo de serviço até o
  // ÚLTIMO DIA DO MÊS de término. Isso significa que:
  // - Se o aviso termina em 13/03, projeta até 31/03
  // - Se o aviso termina em 15/03, projeta até 31/03
  // Isso garante que o mês do término seja contado inteiro
  // para férias, 13º e FGTS.
  //
  // Para SALDO DE SALÁRIO: usa a dataSaida real (dia seguinte
  // ao término), pois paga apenas os dias efetivamente devidos.
  // ============================================================
  const dataFimAviso = params.dataFimAviso || dataDesligamento;
  const dtFimAviso = new Date(dataFimAviso + 'T00:00:00');
  
  // Data de saída real = dia seguinte ao término do aviso
  // Usada para saldo de salário (dias efetivos no mês)
  const dtDataSaida = new Date(dtFimAviso);
  dtDataSaida.setDate(dtDataSaida.getDate() + 1);
  const dataSaida = dtDataSaida.toISOString().split('T')[0];
  
  // Data de referência projetada = último dia do mês de término
  // Usada para férias, 13º e FGTS (aviso projeta tempo de serviço)
  const dtProjecao = new Date(dtFimAviso.getFullYear(), dtFimAviso.getMonth() + 1, 0);
  const dataProjecao = dtProjecao.toISOString().split('T')[0];
  
  // ============================================================
  // DIVISOR DO SALDO DE SALÁRIO = 30 (padrão CLT)
  // CLT Art. 64: "O salário-hora normal, no caso de empregado mensalista,
  // será obtido dividindo-se o salário mensal correspondente à duração
  // do trabalho, a que se refere o art. 58, por 30 (trinta)"
  // ============================================================
  const DIVISOR_CLT = 30;
  const salarioDia = salarioBase / DIVISOR_CLT;
  const anosServico = calcularAnosServico(dataAdmissao, dataSaida);
  const diasAvisoTotal = calcularDiasAvisoTotal(anosServico);
  const diasExtrasAviso = calcularDiasExtrasAviso(anosServico);
  
  // ============================================================
  // 1. SALDO DE SALÁRIO
  // Dias trabalhados no mês da saída (dia 1 até dia da saída)
  // Divisor = 30 (padrão CLT)
  // ============================================================
  const saldoSalario = salarioDia * diasTrabalhadosMes;
  
  // ============================================================
  // 2. FÉRIAS PROPORCIONAIS + 1/3 CONSTITUCIONAL
  // CLT Art. 487 §1º: O período do aviso integra o tempo de serviço
  // Calcula da admissão até a DATA PROJETADA (último dia do mês)
  // ============================================================
  const mesesFerias = calcularMesesFeriasProporcionais(dataAdmissao, dataProjecao);
  const feriasProporcional = (salarioBase * mesesFerias) / 12;
  const tercoConstitucional = feriasProporcional / 3;
  const totalFerias = feriasProporcional + tercoConstitucional;
  
  // ============================================================
  // 3. FÉRIAS VENCIDAS (se houver)
  // Períodos aquisitivos completos não gozados
  // Usa data projetada para contar períodos completos
  // ============================================================
  const periodosVencidos = Math.max(0, calcularFeriasVencidas(dataAdmissao, dataProjecao) - 1);
  const feriasVencidas = periodosVencidos > 0 ? (salarioBase + salarioBase / 3) * periodosVencidos : 0;
  
  // ============================================================
  // 4. 13º SALÁRIO PROPORCIONAL
  // Conta de JANEIRO do ano vigente até a DATA PROJETADA
  // O aviso prévio projeta o mês inteiro de término
  // CLT: o aviso prévio integra o tempo de serviço
  // ============================================================
  const meses13o = calcularMeses13o(dataAdmissao, dataProjecao);
  const decimoTerceiroProporcional = (salarioBase * meses13o) / 12;
  
  // ============================================================
  // 5. AVISO PRÉVIO INDENIZADO
  // Lei 12.506/2011: 30 dias + 3 dias por ano de serviço
  // ============================================================
  let avisoPrevioIndenizado = 0;
  if (tipo === 'empregador_indenizado') {
    avisoPrevioIndenizado = salarioDia * diasAvisoTotal;
  } else if (tipo === 'empregador_trabalhado') {
    avisoPrevioIndenizado = salarioDia * diasExtrasAviso;
  }
  
  // ============================================================
  // 6. VR / VALE REFEIÇÃO PROPORCIONAL
  // ============================================================
  const vrProporcional = vrDiario * diasTrabalhadosMes;
  
  // ============================================================
  // 7. FGTS (estimativa - 8% sobre remuneração)
  // Calcula até a DATA PROJETADA (aviso integra tempo de serviço)
  // ============================================================
  const mesesTotais = calcularMesesServico(dataAdmissao, dataProjecao);
  const fgtsEstimado = salarioBase * 0.08 * mesesTotais;
  
  // ============================================================
  // 8. MULTA 40% FGTS (apenas demissão sem justa causa pelo empregador)
  // ============================================================
  const multaFGTS = (tipo.includes('empregador')) ? fgtsEstimado * 0.4 : 0;
  
  // ============================================================
  // TOTAL DA RESCISÃO
  // Inclui multa FGTS 40% pois é custo direto para a empresa
  // FGTS estimado é apenas informativo (depositado na conta FGTS)
  // ============================================================
  const total = saldoSalario + totalFerias + feriasVencidas + decimoTerceiroProporcional + avisoPrevioIndenizado + vrProporcional + multaFGTS;
  
  return {
    // Dados base
    salarioBase: salarioBase.toFixed(2),
    salarioDia: salarioDia.toFixed(2),
    diasReaisMes: DIVISOR_CLT,
    anosServico,
    diasAvisoTotal,
    diasExtrasAviso,
    diasTrabalhadosMes,
    mesesFerias,
    meses13o,
    dataSaida,
    
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
    
    mesesTotais,
    dataRefCalculo: dataSaida,
    dataProjecao,
    
    // Data limite pagamento (Art. 477 §6º CLT: 10 dias corridos após término do aviso)
    dataLimitePagamento: (() => {
      const dt = new Date(dataFimAviso + 'T00:00:00');
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;

        // Auto-conclude: mark as 'concluido' any aviso where dataFim < today and status is still 'em_andamento'
        // SKIP avisos that were manually reverted (revertidoManualmente = 1)
        const today = new Date().toISOString().split('T')[0];
        await db.update(terminationNotices)
          .set({ status: 'concluido', dataConclusao: today, updatedAt: sql`NOW()` })
          .where(and(
            companyFilter(terminationNotices.companyId, input),
            eq(terminationNotices.status, 'em_andamento'),
            isNull(terminationNotices.deletedAt),
            sql`${terminationNotices.dataFim} IS NOT NULL AND ${terminationNotices.dataFim} < ${today}`,
            sql`(${terminationNotices.revertidoManualmente} = 0 OR ${terminationNotices.revertidoManualmente} IS NULL)`
          ));

        const conditions = [
          companyFilter(terminationNotices.companyId, input),
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
        .leftJoin(employees, eq(terminationNotices.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(terminationNotices.createdAt));
        
        // Recalcular valorEstimadoTotal em tempo real para cada registro
        const results = [];
        for (const r of rows) {
          let valorRecalculado = r.valorEstimadoTotal;
          try {
            const [emp] = await db.select().from(employees).where(eq(employees.id, r.employeeId));
            if (emp && r.dataFim) {
              const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
              const salarioBase = parseBRL(emp.salarioBase);
              const dtFimAviso = new Date(r.dataFim + 'T00:00:00');
              const dtDataSaida = new Date(dtFimAviso);
              dtDataSaida.setDate(dtDataSaida.getDate() + 1);
              const diasTrabalhadosMes = dtDataSaida.getDate();
              
              const previsao = calcularRescisaoCompleta({
                salarioBase,
                dataAdmissao,
                dataDesligamento: r.dataInicio,
                dataFimAviso: r.dataFim,
                tipo: r.tipo,
                vrDiario: 0,
                diasTrabalhadosMes,
              });
              valorRecalculado = previsao.total;
            }
          } catch (e) {
            // Se falhar o recálculo, mantém o valor armazenado
          }
          // Calcular data limite de pagamento (Art. 477 §6º CLT: 10 dias corridos após término)
          let dataLimitePagamento: string | null = null;
          let dataDiaTrabalhado: string | null = null;
          if (r.dataFim) {
            const dtFim = new Date(r.dataFim + 'T00:00:00');
            dtFim.setDate(dtFim.getDate() + 10);
            dataLimitePagamento = dtFim.toISOString().split('T')[0];
          }
          // dataDiaTrabalhado = último dia trabalhado (dia anterior ao início do aviso)
          if (r.dataInicio) {
            const dtInicio = new Date(r.dataInicio + 'T00:00:00');
            dtInicio.setDate(dtInicio.getDate() - 1);
            dataDiaTrabalhado = dtInicio.toISOString().split('T')[0];
          }
          results.push({
            ...r,
            valorEstimadoTotal: valorRecalculado,
            dataLimitePagamento,
            dataDiaTrabalhado,
            employeeName: r.employeeName || 'Funcionário excluído',
            employeeCpf: r.employeeCpf || '-',
            employeeCargo: r.employeeCargo || '-',
          });
        }
        return results;
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [row] = await db.select()
          .from(terminationNotices)
          .where(eq(terminationNotices.id, input.id));
        if (!row) return null;
        
        // Recalcular previsão em tempo real (não usar JSON armazenado que pode estar desatualizado)
        try {
          const [emp] = await db.select().from(employees).where(eq(employees.id, row.employeeId));
          if (emp) {
            const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
            const salarioBase = parseBRL(emp.salarioBase);
            const dataFim = row.dataFim;
            
            // Data de saída = dia seguinte ao término do aviso
            const dtFimAviso = new Date(dataFim + 'T00:00:00');
            const dtDataSaida = new Date(dtFimAviso);
            dtDataSaida.setDate(dtDataSaida.getDate() + 1);
            const diasTrabalhadosMes = dtDataSaida.getDate();
            
            const previsao = calcularRescisaoCompleta({
              salarioBase,
              dataAdmissao,
              dataDesligamento: row.dataInicio, // data de início do aviso
              dataFimAviso: dataFim,
              tipo: row.tipo,
              vrDiario: 0,
              diasTrabalhadosMes,
            });
            
            // Retornar com previsão recalculada (incluir dataAdmissao para cálculo de tempo de serviço no frontend)
            return {
              ...row,
              employeeName: emp.nomeCompleto || 'Funcionário',
              employeeCpf: emp.cpf || '-',
              employeeCargo: emp.cargo || emp.funcao || '-',
              previsaoRescisao: JSON.stringify({ ...previsao, dataAdmissao }),
            };
          }
        } catch (e) {
          // Se falhar o recálculo, retorna o valor armazenado
          console.error('Erro ao recalcular previsão:', e);
        }
        
        // Fallback: buscar dados do funcionário mesmo sem recálculo
        try {
          const [emp2] = await db.select().from(employees).where(eq(employees.id, row.employeeId));
          if (emp2) {
            return {
              ...row,
              employeeName: emp2.nomeCompleto || 'Funcionário',
              employeeCpf: emp2.cpf || '-',
              employeeCargo: emp2.cargo || emp2.funcao || '-',
            };
          }
        } catch {}
        return { ...row, employeeName: 'Funcionário excluído', employeeCpf: '-', employeeCargo: '-' };
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
        
        // Data de término do aviso = início do aviso + dias de aviso
        const dataInicioAviso = calcularDataInicioAviso(dataDesligamento);
        const dataFimAviso = calcularDataFim(dataInicioAviso, diasAviso);
        
        // Dias trabalhados no mês da SAÍDA (dia seguinte ao término do aviso)
        // CLT: a data de saída = dia após o término do aviso
        // Saldo de salário = dia 1 até dia da saída no mês de saída
        const dtFimAviso = new Date(dataFimAviso + 'T00:00:00');
        const dtDataSaida = new Date(dtFimAviso);
        dtDataSaida.setDate(dtDataSaida.getDate() + 1);
        const diasTrabalhadosMes = input.diasTrabalhadosOverride ?? dtDataSaida.getDate();
        
        // ============================================================
        // VR: buscar da config de benefícios da obra do funcionário
        // ============================================================
        let vrDiario = 0;
        let vrConfigNome = '';
        let vrExtra: any = {};
        // Buscar obra via alocação ativa (fora do try para uso posterior)
        const [empObraAloc] = await db.select({ obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, emp.id), eq(obraFuncionarios.isActive, 1)));
        try {
          const obraId = empObraAloc?.obraId || null;
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
            // VR proporcional na rescisão = totalMensal / 30 (divisor CLT) × dias trabalhados
            const DIVISOR_CLT_VR = 30;
            vrDiario = totalVAMensal / DIVISOR_CLT_VR; // usar divisor CLT padrão (30 dias)
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
          dataFimAviso,
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
          dataFimAviso,
          dataFimEstimada: dataFimAviso,
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
            obraAtualId: empObraAloc?.obraId || null,
          },
        };
      }),

    /** Comparativo de custos: Aviso Trabalhado vs Indenizado */
    comparativo: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        dataDesligamento: z.string(),
      }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado" });

        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const salarioBase = parseBRL(emp.salarioBase);
        const anosServico = calcularAnosServico(dataAdmissao, input.dataDesligamento);

        // ============================================================
        // VR: buscar da config de benefícios da obra do funcionário
        // ============================================================
        let vrDiario = 0;
        try {
          // Buscar obra via alocação ativa
          const [empObraAloc] = await db.select({ obraId: obraFuncionarios.obraId }).from(obraFuncionarios).where(and(eq(obraFuncionarios.employeeId, emp.id), eq(obraFuncionarios.isActive, 1)));
          const obraId = empObraAloc?.obraId || null;
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
            const totalVAMensal = (cafeAtivo ? cafe * diasUteis : 0) + (lancheAtivo ? lanche * diasUteis : 0) + vaMes;
            vrDiario = totalVAMensal / 30;
          }
        } catch { vrDiario = 0; }

        // ============================================================
        // DESCONTOS (compartilhados entre os dois cenários)
        // ============================================================
        const descontos: Array<{ descricao: string; valor: number; tipo: string }> = [];
        try {
          const [advRows] = await db.execute(
            sql`SELECT mesReferencia, valorAdiantamento FROM advances WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND aprovado = 'Aprovado' ORDER BY mesReferencia DESC`
          ) as any[];
          if (advRows && advRows.length > 0) {
            const val = parseBRL(advRows[0].valorAdiantamento);
            if (val > 0) descontos.push({ descricao: `Adiantamento (${advRows[0].mesReferencia})`, valor: val, tipo: 'adiantamento' });
          }
        } catch {}
        try {
          const [epiRows] = await db.execute(
            sql`SELECT descricao, valorDesconto FROM epi_discount_alerts WHERE employeeId = ${input.employeeId} AND companyId = ${emp.companyId} AND status = 'pendente'`
          ) as any[];
          if (epiRows) {
            for (const epi of epiRows) {
              const val = parseBRL(epi.valorDesconto);
              if (val > 0) descontos.push({ descricao: `EPI: ${epi.descricao || 'Desconto EPI'}`, valor: val, tipo: 'epi' });
            }
          }
        } catch {}
        const totalDescontos = descontos.reduce((s, d) => s + d.valor, 0);

        // ============================================================
        // CENÁRIO 1: AVISO TRABALHADO
        // ============================================================
        const diasAvisoTrab = 30; // sempre 30 dias trabalhados
        const dataInicioTrab = calcularDataInicioAviso(input.dataDesligamento);
        const dataFimTrab = calcularDataFim(dataInicioTrab, diasAvisoTrab);
        const dtFimTrab = new Date(dataFimTrab + 'T00:00:00');
        const dtSaidaTrab = new Date(dtFimTrab); dtSaidaTrab.setDate(dtSaidaTrab.getDate() + 1);
        const diasTrabMesTrab = dtSaidaTrab.getDate();

        const prevTrab = calcularRescisaoCompleta({
          salarioBase, dataAdmissao, dataDesligamento: input.dataDesligamento,
          dataFimAviso: dataFimTrab, tipo: 'empregador_trabalhado',
          vrDiario, diasTrabalhadosMes: diasTrabMesTrab,
        });
        const totalBrutoTrab = parseFloat(prevTrab.total);
        const totalLiquidoTrab = totalBrutoTrab - totalDescontos;

        // Custo total para empresa no trabalhado:
        // Verbas rescisórias + salário dos 30 dias trabalhados (já incluso no saldo)
        // + encargos sobre o período trabalhado (INSS patronal ~28.8%, FGTS 8%)
        const custoSalarioTrab = salarioBase; // 30 dias de trabalho = 1 salário
        const encargosPatronaisTrab = custoSalarioTrab * 0.368; // ~36.8% (INSS 28.8% + FGTS 8%)
        const custoTotalEmpresaTrab = totalBrutoTrab + encargosPatronaisTrab;

        // ============================================================
        // CENÁRIO 2: AVISO INDENIZADO
        // ============================================================
        const diasAvisoInd = calcularDiasAvisoTotal(anosServico);
        const dataInicioInd = calcularDataInicioAviso(input.dataDesligamento);
        const dataFimInd = calcularDataFim(dataInicioInd, diasAvisoInd);
        const dtFimInd = new Date(dataFimInd + 'T00:00:00');
        const dtSaidaInd = new Date(dtFimInd); dtSaidaInd.setDate(dtSaidaInd.getDate() + 1);
        const diasTrabMesInd = dtSaidaInd.getDate();

        const prevInd = calcularRescisaoCompleta({
          salarioBase, dataAdmissao, dataDesligamento: input.dataDesligamento,
          dataFimAviso: dataFimInd, tipo: 'empregador_indenizado',
          vrDiario, diasTrabalhadosMes: diasTrabMesInd,
        });
        const totalBrutoInd = parseFloat(prevInd.total);
        const totalLiquidoInd = totalBrutoInd - totalDescontos;

        // Custo total para empresa no indenizado:
        // Verbas rescisórias (já inclui aviso indenizado)
        // Não há encargos patronais sobre o período (funcionário não trabalha)
        const custoTotalEmpresaInd = totalBrutoInd;

        // ============================================================
        // DIFERENÇA E RECOMENDAÇÃO
        // ============================================================
        const diferencaBruta = totalBrutoInd - totalBrutoTrab;
        const diferencaCustoEmpresa = custoTotalEmpresaInd - custoTotalEmpresaTrab;
        const maisEconomico = custoTotalEmpresaInd <= custoTotalEmpresaTrab ? 'indenizado' : 'trabalhado';

        return {
          funcionario: {
            nome: emp.nomeCompleto,
            cargo: emp.cargo || (emp as any).funcao || '',
            cpf: emp.cpf,
            salarioBase: salarioBase.toFixed(2),
            dataAdmissao,
            anosServico,
            mesesServico: calcularMesesServico(dataAdmissao, input.dataDesligamento),
          },
          trabalhado: {
            tipo: 'empregador_trabalhado',
            diasAviso: diasAvisoTrab,
            diasExtras: calcularDiasExtrasAviso(anosServico),
            dataInicio: dataInicioTrab,
            dataFim: dataFimTrab,
            dataSaida: prevTrab.dataSaida,
            dataLimitePagamento: prevTrab.dataLimitePagamento,
            previsao: prevTrab,
            totalBruto: totalBrutoTrab.toFixed(2),
            totalLiquido: totalLiquidoTrab.toFixed(2),
            custoTotalEmpresa: custoTotalEmpresaTrab.toFixed(2),
            encargosPatronais: encargosPatronaisTrab.toFixed(2),
            observacao: `Funcionário trabalha 30 dias. Dias extras (${calcularDiasExtrasAviso(anosServico)}d) são indenizados separadamente. Empresa arca com encargos patronais (~36,8%) sobre o salário do período trabalhado.`,
          },
          indenizado: {
            tipo: 'empregador_indenizado',
            diasAviso: diasAvisoInd,
            diasExtras: 0,
            dataInicio: dataInicioInd,
            dataFim: dataFimInd,
            dataSaida: prevInd.dataSaida,
            dataLimitePagamento: prevInd.dataLimitePagamento,
            previsao: prevInd,
            totalBruto: totalBrutoInd.toFixed(2),
            totalLiquido: totalLiquidoInd.toFixed(2),
            custoTotalEmpresa: custoTotalEmpresaInd.toFixed(2),
            encargosPatronais: '0.00',
            observacao: `Funcionário é dispensado imediatamente. Todo o período de aviso (${diasAvisoInd} dias) é pago como indenização. Sem encargos patronais sobre o período.`,
          },
          descontos: descontos.map(d => ({ ...d, valor: d.valor.toFixed(2) })),
          totalDescontos: totalDescontos.toFixed(2),
          analise: {
            diferencaBruta: diferencaBruta.toFixed(2),
            diferencaCustoEmpresa: diferencaCustoEmpresa.toFixed(2),
            maisEconomico,
            economiaEstimada: Math.abs(diferencaCustoEmpresa).toFixed(2),
            resumo: maisEconomico === 'indenizado'
              ? `O aviso INDENIZADO é mais econômico para a empresa, com economia estimada de R$ ${Math.abs(diferencaCustoEmpresa).toFixed(2)} considerando encargos patronais.`
              : `O aviso TRABALHADO é mais econômico para a empresa, com economia estimada de R$ ${Math.abs(diferencaCustoEmpresa).toFixed(2)}. Porém, considere que o funcionário permanece 30 dias na empresa.`,
          },
        };
      }),

    /** Buscar configuração de benefícios de alimentação */
    getMealBenefitConfig: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), obraId: z.number().optional() }))
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        try {
          const [rows] = await db.execute(
            sql`SELECT mbc.*, o.nome as obraNome FROM meal_benefit_configs mbc LEFT JOIN obras o ON mbc.obraId = o.id WHERE mbc.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) ORDER BY mbc.obraId IS NULL DESC, o.nome ASC`
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
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

        // Bloquear duplicidade: verificar se já existe aviso em andamento para este colaborador
        const [existente] = await db.select({ id: terminationNotices.id })
          .from(terminationNotices)
          .where(and(
            companyFilter(terminationNotices.companyId, input),
            eq(terminationNotices.employeeId, input.employeeId),
            eq(terminationNotices.status, 'em_andamento'),
            isNull(terminationNotices.deletedAt),
          ))
          .limit(1);
        if (existente) {
          throw new TRPCError({ code: "CONFLICT", message: "Este colaborador já possui um aviso prévio em andamento. Conclua ou cancele o aviso existente antes de criar um novo." });
        }
        
        const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split("T")[0];
        const dataDesligamento = input.dataDesligamento || input.dataInicio;
        // dataInicio do aviso = último dia trabalhado + 1
        const dataInicioAviso = calcularDataInicioAviso(input.dataInicio);
        const anosServico = calcularAnosServico(dataAdmissao, dataDesligamento);
        const diasAviso = calcularDiasAviso(anosServico, input.tipo);
        const salarioBase = parseBRL(emp.salarioBase);
        const dataFim = calcularDataFim(dataInicioAviso, diasAviso);
        
        // Dias trabalhados no mês da SAÍDA (dia seguinte ao término do aviso)
        // CLT: data de saída = dia após o término do aviso
        const dtFimAviso = new Date(dataFim + 'T00:00:00');
        const dtDataSaida = new Date(dtFimAviso);
        dtDataSaida.setDate(dtDataSaida.getDate() + 1);
        const diasTrabalhadosMes = input.diasTrabalhados ?? dtDataSaida.getDate();
        
        const previsao = calcularRescisaoCompleta({
          salarioBase,
          dataAdmissao,
          dataDesligamento,
          dataFimAviso: dataFim, // TÉRMINO do aviso para férias, 13º, FGTS
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
          // Dias trabalhados no mês da SAÍDA (dia seguinte ao término do aviso)
          const dtFimAviso = new Date(dataFim + 'T00:00:00');
          const dtDataSaida = new Date(dtFimAviso);
          dtDataSaida.setDate(dtDataSaida.getDate() + 1);
          const diasTrabalhadosMes = diasTrabalhados ?? dtDataSaida.getDate();

          const previsao = calcularRescisaoCompleta({
            salarioBase,
            dataAdmissao,
            dataDesligamento: dataDesligFinal,
            dataFimAviso: dataFim, // TÉRMINO do aviso para férias, 13º, FGTS
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

    /** Recalcular TODOS os avisos prévios em andamento de uma empresa */
    recalcularTodos: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        // Buscar todos os avisos em andamento da empresa
        const avisos = await db.select().from(terminationNotices)
          .where(and(
            companyFilter(terminationNotices.companyId, input),
            eq(terminationNotices.status, 'em_andamento'),
            isNull(terminationNotices.deletedAt),
          ));

        let recalculados = 0;
        let erros = 0;
        for (const aviso of avisos) {
          try {
            const [emp] = await db.select().from(employees).where(eq(employees.id, aviso.employeeId));
            if (!emp) { erros++; continue; }

            const tipo = aviso.tipo;
            const dataInicioFinal = aviso.dataInicio;
            const dataDesligFinal = aviso.dataInicio; // dataInicio é o dia após o último dia trabalhado
            const dataAdmissao = emp.dataAdmissao || new Date().toISOString().split('T')[0];
            const anosServico = calcularAnosServico(dataAdmissao, dataDesligFinal);
            const diasAviso = calcularDiasAviso(anosServico, tipo);
            const salarioBase = parseBRL(emp.salarioBase);
            const dataFim = calcularDataFim(dataInicioFinal, diasAviso);

            // Dias trabalhados no mês da SAÍDA
            const dtFimAviso = new Date(dataFim + 'T00:00:00');
            const dtDataSaida = new Date(dtFimAviso);
            dtDataSaida.setDate(dtDataSaida.getDate() + 1);
            const diasTrabalhadosMes = dtDataSaida.getDate();

            const previsao = calcularRescisaoCompleta({
              salarioBase,
              dataAdmissao,
              dataDesligamento: dataDesligFinal,
              dataFimAviso: dataFim,
              tipo,
              vrDiario: 0,
              diasTrabalhadosMes,
            });

            await db.update(terminationNotices).set({
              diasAviso,
              anosServico,
              salarioBase: salarioBase.toFixed(2),
              dataFim,
              previsaoRescisao: JSON.stringify(previsao),
              valorEstimadoTotal: previsao.total,
            }).where(eq(terminationNotices.id, aviso.id));

            recalculados++;
          } catch (e) {
            console.error(`Erro ao recalcular aviso ${aviso.id}:`, e);
            erros++;
          }
        }

        return { recalculados, erros, total: avisos.length };
      }),

    /** Reverter status de Concluído para Em Andamento */
    revertConcluido: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [aviso] = await db.select().from(terminationNotices).where(eq(terminationNotices.id, input.id));
        if (!aviso) throw new TRPCError({ code: 'NOT_FOUND', message: 'Aviso prévio não encontrado' });
        if (aviso.status !== 'concluido') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Apenas avisos com status Concluído podem ser revertidos' });
        
        await db.update(terminationNotices).set({
          status: 'em_andamento',
          dataConclusao: null,
          revertidoManualmente: 1,
          updatedAt: sql`NOW()`,
        } as any).where(eq(terminationNotices.id, input.id));
        
        // Registrar auditoria
        await createAuditLog({
          userId: ctx.user.id,
          userName: ctx.user.name ?? 'Sistema',
          action: 'REVERT_AVISO_PREVIO',
          module: 'aviso_previo',
          entityType: 'terminationNotices',
          entityId: input.id,
          details: `Status revertido de Concluído para Em Andamento por ${ctx.user.name}`,
        });
        
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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];
        const em80dias = new Date(hoje);
        em80dias.setDate(em80dias.getDate() + 80);
        const em80diasStr = em80dias.toISOString().split('T')[0];

        const obrasAtivas = await db.select().from(obras)
          .where(and(
            companyFilter(obras.companyId, input),
            sql`${obras.deletedAt} IS NULL`,
            sql`${obras.status} IN ('Em_Andamento', 'Em Andamento')`,
            sql`${obras.dataPrevisaoFim} IS NOT NULL`,
            sql`${obras.dataPrevisaoFim} BETWEEN ${hojeStr} AND ${em80diasStr}`,
          ));

        const allEmps = await db.select().from(employees)
          .where(and(
            companyFilter(employees.companyId, input),
            sql`${employees.deletedAt} IS NULL`,
            eq(employees.status, 'Ativo'),
          ));

        // Buscar todas as alocações ativas de uma vez
        const allObraAlocs = await db.select({ employeeId: obraFuncionarios.employeeId, obraId: obraFuncionarios.obraId })
          .from(obraFuncionarios).where(and(companyFilter(obraFuncionarios.companyId, input), eq(obraFuncionarios.isActive, 1)));
        const obraEmpMap: Record<number, Set<number>> = {};
        for (const a of allObraAlocs) {
          if (!obraEmpMap[a.obraId]) obraEmpMap[a.obraId] = new Set();
          obraEmpMap[a.obraId].add(a.employeeId);
        }

        const result = obrasAtivas.map(obra => {
          const fimPrevisto = new Date(obra.dataPrevisaoFim! + 'T00:00:00');
          const diasRestantes = Math.ceil((fimPrevisto.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
          const obraEmpIds = obraEmpMap[obra.id] || new Set();
          const funcsAlocados = allEmps.filter(e => obraEmpIds.has(e.id));

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
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), status: z.string().optional(), employeeId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const conditions: any[] = [
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
        ];
        if (input.status) {
          if (input.status === 'vencida') {
            // Vencida = status 'vencida' OU flag vencida=1, MAS excluir concluídas/canceladas
            conditions.push(sql`(${vacationPeriods.status} = 'vencida' OR ${vacationPeriods.vencida} = 1)`);
            conditions.push(sql`${vacationPeriods.status} NOT IN ('concluida', 'cancelada')`);
          } else {
            conditions.push(eq(vacationPeriods.status, input.status as any));
          }
        }
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
        
        // Recálculo em tempo real dos valores de férias usando salário atual
        const recalculated = rows.map(r => {
          try {
            const salAtual = parseBRL(r.employeeSalario || '0');
            const diasGozo = r.diasGozo || 30;
            const abono = r.abonoPecuniario ? 1 : 0;
            const diasAbono = abono ? Math.floor(diasGozo / 3) : 0;
            const diasEfetivos = diasGozo - diasAbono;
            if (salAtual > 0) {
              const valorFerias = (salAtual / 30) * diasEfetivos;
              const terco = valorFerias / 3;
              const valorAbono = abono ? ((salAtual / 30) * diasAbono + (salAtual / 30) * diasAbono / 3) : 0;
              const pagDobro = r.pagamentoEmDobro === 1;
              const mult = pagDobro ? 2 : 1;
              const totalRecalc = (valorFerias + terco + valorAbono) * mult;
              return {
                ...r,
                valorFerias: (valorFerias * mult).toFixed(2),
                valorTercoConstitucional: (terco * mult).toFixed(2),
                valorTotal: totalRecalc.toFixed(2),
              };
            }
          } catch {}
          return r;
        });
        return recalculated;
      }),

    calendario: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
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
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          sql`(${vacationPeriods.dataInicio} BETWEEN ${inicioAno} AND ${fimAno} OR ${vacationPeriods.periodoConcessivoFim} BETWEEN ${inicioAno} AND ${fimAno})`,
        ))
        .orderBy(asc(vacationPeriods.dataInicio));
        
        return rows;
      }),

    alertas: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
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
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
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
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          eq(vacationPeriods.status, 'pendente'),
          sql`${vacationPeriods.periodoConcessivoFim} BETWEEN ${hoje} AND ${em60diasStr}`,
        ));
        
        return { vencidas, prestesVencer };
      }),

    gerarPeriodos: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const [emp] = await db.select().from(employees).where(eq(employees.id, input.employeeId));
        if (!emp || !emp.dataAdmissao) throw new TRPCError({ code: "BAD_REQUEST", message: "Funcionário sem data de admissão" });
        
        const periodos = calcularPeriodosFerias(emp.dataAdmissao);
        
        const existentes = await db.select({ periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio })
          .from(vacationPeriods)
          .where(and(
            companyFilter(vacationPeriods.companyId, input),
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
              pagamentoEmDobro: 0,
            });
            criados++;
          }
        }
        
        return { success: true, periodosGerados: criados };
      }),

    fluxoCaixa: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
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
          companyFilter(employees.companyId, input),
          eq(employees.status, 'Ativo'),
          isNull(employees.deletedAt),
        ));
        
        // Also fetch DB vacation periods to get actual status (agendada, em_gozo, etc.)
        const dbPeriods = await db.select({
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          status: vacationPeriods.status,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
        })
        .from(vacationPeriods)
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
        ));
        // Map: employeeId -> { periodoKey -> status }
        const dbStatusMap: Record<number, Record<string, string>> = {};
        for (const dp of dbPeriods) {
          if (!dbStatusMap[dp.employeeId]) dbStatusMap[dp.employeeId] = {};
          const key = `${dp.periodoAquisitivoInicio}_${dp.periodoAquisitivoFim}`;
          dbStatusMap[dp.employeeId][key] = dp.status;
        }

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
                const tercoConstitucional = salario / 3;
                const valorFerias = salario + tercoConstitucional;
                totalMes += valorFerias;
                // Determine status: check DB first, then fallback to calculated
                const periodoKey = `${p.inicio}_${p.fim}`;
                const dbStatus = dbStatusMap[func.id]?.[periodoKey];
                let fStatus = 'prevista';
                if (dbStatus && dbStatus !== 'pendente') {
                  fStatus = dbStatus; // agendada, em_gozo, concluida, vencida, cancelada
                } else if (p.vencida) {
                  fStatus = 'vencida';
                }

                funcionariosNoMes.push({
                  id: func.id,
                  nome: func.nome,
                  cargo: func.cargo,
                  salario: func.salario,
                  salarioBase: salario.toFixed(2),
                  tercoConstitucional: tercoConstitucional.toFixed(2),
                  valorEstimado: valorFerias.toFixed(2),
                  fimConcessivo: p.fimConcessivo,
                  vencida: p.vencida,
                  status: fStatus,
                });
                break;
              }
            }
          }
          
          const totalSalarioBase = funcionariosNoMes.reduce((s, f) => s + parseFloat(f.salarioBase), 0);
          const totalTerco = funcionariosNoMes.reduce((s, f) => s + parseFloat(f.tercoConstitucional), 0);
          meses.push({
            mes: mes + 1,
            nomeMes: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes],
            totalFuncionarios: funcionariosNoMes.length,
            valorTotal: totalMes.toFixed(2),
            totalSalarioBase: totalSalarioBase.toFixed(2),
            totalTercoConstitucional: totalTerco.toFixed(2),
            funcionarios: funcionariosNoMes,
          });
        }
        
        return meses;
      }),

    create: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
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

    // ============================================================
    // GERAR PERÍODOS PARA TODOS OS ATIVOS DE UMA VEZ
    // ============================================================
    gerarPeriodosTodos: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .mutation(async ({ input }) => {
        const db = (await getDb())!;
        const ativos = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          dataAdmissao: employees.dataAdmissao,
          salario: employees.salarioBase,
        })
        .from(employees)
        .where(and(
          companyFilter(employees.companyId, input),
          eq(employees.status, 'Ativo'),
          isNull(employees.deletedAt),
        ));

        let totalCriados = 0;
        let funcionariosProcessados = 0;
        let funcionariosSemAdmissao = 0;

        for (const emp of ativos) {
          if (!emp.dataAdmissao) {
            funcionariosSemAdmissao++;
            continue;
          }
          funcionariosProcessados++;
          const periodos = calcularPeriodosFerias(emp.dataAdmissao);
          const existentes = await db.select({ periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio })
            .from(vacationPeriods)
            .where(and(
              companyFilter(vacationPeriods.companyId, input),
              eq(vacationPeriods.employeeId, emp.id),
              isNull(vacationPeriods.deletedAt),
            ));
          const existentesSet = new Set(existentes.map(e => e.periodoAquisitivoInicio));
          let numPeriodo = existentes.length;

          for (const p of periodos) {
            if (p.adquirido && !existentesSet.has(p.inicio)) {
              numPeriodo++;
              // Calcular data sugerida: 30 dias antes do fim do concessivo
              const fimConcessivo = new Date(p.fimConcessivo + 'T00:00:00');
              const sugeridaInicio = new Date(fimConcessivo);
              sugeridaInicio.setDate(sugeridaInicio.getDate() - 30);
              const sugeridaFim = new Date(fimConcessivo);
              sugeridaFim.setDate(sugeridaFim.getDate() - 1);

              await db.insert(vacationPeriods).values({
                companyId: input.companyId,
                employeeId: emp.id,
                periodoAquisitivoInicio: p.inicio,
                periodoAquisitivoFim: p.fim,
                periodoConcessivoFim: p.fimConcessivo,
                status: p.vencida ? 'vencida' : 'pendente',
                vencida: p.vencida ? 1 : 0,
                pagamentoEmDobro: 0,
                numeroPeriodo: numPeriodo,
                dataSugeridaInicio: sugeridaInicio.toISOString().split('T')[0],
                dataSugeridaFim: sugeridaFim.toISOString().split('T')[0],
              });
              totalCriados++;
            }
          }
        }

        return {
          success: true,
          totalCriados,
          funcionariosProcessados,
          funcionariosSemAdmissao,
          totalAtivos: ativos.length,
        };
      }),

    // ============================================================
    // CONFIRMAR FÉRIAS VENCIDAS EM LOTE ("Já foi pago")
    // ============================================================
    confirmarVencidasLote: protectedProcedure
      .input(z.object({
        ids: z.array(z.number()),
        observacao: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        let confirmados = 0;
        for (const id of input.ids) {
          await db.update(vacationPeriods).set({
            status: 'concluida',
            observacoes: input.observacao || `Férias confirmadas como pagas por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}`,
            aprovadoPor: ctx.user.name ?? 'Sistema',
            aprovadoPorUserId: ctx.user.id,
          } as any).where(eq(vacationPeriods.id, id));
          confirmados++;
        }
        return { success: true, confirmados };
      }),

    // ============================================================
    // CONFIRMAR TODAS AS VENCIDAS DE UM FUNCIONÁRIO
    // ============================================================
    confirmarTodasVencidasFuncionario: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const vencidas = await db.select({ id: vacationPeriods.id })
          .from(vacationPeriods)
          .where(and(
            companyFilter(vacationPeriods.companyId, input),
            eq(vacationPeriods.employeeId, input.employeeId),
            eq(vacationPeriods.status, 'vencida'),
            isNull(vacationPeriods.deletedAt),
          ));
        let confirmados = 0;
        for (const v of vencidas) {
          await db.update(vacationPeriods).set({
            status: 'concluida',
            observacoes: `Férias confirmadas como pagas (lote) por ${ctx.user.name} em ${new Date().toLocaleDateString('pt-BR')}`,
            aprovadoPor: ctx.user.name ?? 'Sistema',
            aprovadoPorUserId: ctx.user.id,
          } as any).where(eq(vacationPeriods.id, v.id));
          confirmados++;
        }
        return { success: true, confirmados };
      }),

    // ============================================================
    // RH DEFINE/ALTERA DATA DE FÉRIAS (com tracking de alteração)
    // ============================================================
    definirDataFerias: protectedProcedure
      .input(z.object({
        id: z.number(),
        dataInicio: z.string(),
        dataFim: z.string(),
        diasGozo: z.number().default(30),
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = (await getDb())!;
        const [periodo] = await db.select().from(vacationPeriods).where(eq(vacationPeriods.id, input.id));
        if (!periodo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Período não encontrado' });

        // Buscar salário do funcionário para calcular valores
        const [emp] = await db.select().from(employees).where(eq(employees.id, periodo.employeeId));
        const salario = emp ? parseBRL(emp.salarioBase) : 0;
        const valorFerias = (salario / 30) * input.diasGozo;
        const terco = valorFerias / 3;
        const total = valorFerias + terco;

        // Calcular data de pagamento (2 dias antes do início)
        const dtPag = new Date(input.dataInicio + 'T00:00:00');
        dtPag.setDate(dtPag.getDate() - 2);

        // Verificar se a data foi alterada em relação à sugerida
        const foiAlterada = periodo.dataSugeridaInicio && periodo.dataSugeridaInicio !== input.dataInicio ? 1 : 0;

        await db.update(vacationPeriods).set({
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          diasGozo: input.diasGozo,
          valorFerias: valorFerias.toFixed(2),
          valorTercoConstitucional: terco.toFixed(2),
          valorTotal: total.toFixed(2),
          dataPagamento: dtPag.toISOString().split('T')[0],
          status: 'agendada',
          dataAlteradaPeloRh: foiAlterada,
          observacoes: input.observacoes || (foiAlterada ? `Data alterada pelo RH (${ctx.user.name}). Original: ${periodo.dataSugeridaInicio} a ${periodo.dataSugeridaFim}` : null),
          aprovadoPor: ctx.user.name ?? 'Sistema',
          aprovadoPorUserId: ctx.user.id,
        } as any).where(eq(vacationPeriods.id, input.id));

        return { success: true, foiAlterada: !!foiAlterada };
      }),

    // ============================================================
    // CALENDÁRIO COMPLETO (com dados sugeridos e status)
    // ============================================================
    calendarioCompleto: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const inicioAno = `${input.ano}-01-01`;
        const fimAno = `${input.ano}-12-31`;

        // Buscar todos os períodos que têm data no ano OU concessivo no ano
        const rows = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          dataInicio: vacationPeriods.dataInicio,
          dataFim: vacationPeriods.dataFim,
          dataSugeridaInicio: vacationPeriods.dataSugeridaInicio,
          dataSugeridaFim: vacationPeriods.dataSugeridaFim,
          dataAlteradaPeloRh: vacationPeriods.dataAlteradaPeloRh,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          diasGozo: vacationPeriods.diasGozo,
          valorTotal: vacationPeriods.valorTotal,
          status: vacationPeriods.status,
          vencida: vacationPeriods.vencida,
          observacoes: vacationPeriods.observacoes,
          employeeName: employees.nomeCompleto,
          employeeCargo: employees.cargo,
          employeeSalario: employees.salarioBase,
          employeeSetor: employees.setor,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
          sql`(
            (${vacationPeriods.dataInicio} BETWEEN ${inicioAno} AND ${fimAno})
            OR (${vacationPeriods.dataSugeridaInicio} BETWEEN ${inicioAno} AND ${fimAno})
            OR (${vacationPeriods.periodoConcessivoFim} BETWEEN ${inicioAno} AND ${fimAno})
            OR (${vacationPeriods.status} IN ('pendente', 'vencida', 'agendada', 'em_gozo'))
          )`,
        ))
        .orderBy(asc(employees.nomeCompleto), asc(vacationPeriods.periodoAquisitivoInicio));

        return rows;
      }),

    // ============================================================
    // LISTAR VENCIDAS PARA CONFIRMAÇÃO
    // ============================================================
    listarVencidas: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        const rows = await db.select({
          id: vacationPeriods.id,
          employeeId: vacationPeriods.employeeId,
          periodoAquisitivoInicio: vacationPeriods.periodoAquisitivoInicio,
          periodoAquisitivoFim: vacationPeriods.periodoAquisitivoFim,
          periodoConcessivoFim: vacationPeriods.periodoConcessivoFim,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          status: vacationPeriods.status,
          employeeName: employees.nomeCompleto,
          employeeCpf: employees.cpf,
          employeeCargo: employees.cargo,
          employeeDataAdmissao: employees.dataAdmissao,
        })
        .from(vacationPeriods)
        .innerJoin(employees, eq(vacationPeriods.employeeId, employees.id))
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          eq(vacationPeriods.status, 'vencida'),
          isNull(vacationPeriods.deletedAt),
          sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
          isNull(employees.deletedAt),
        ))
        .orderBy(asc(employees.nomeCompleto), asc(vacationPeriods.periodoAquisitivoInicio));

        // Agrupar por funcionário
        const grouped: Record<number, { employee: any; periodos: any[] }> = {};
        for (const r of rows) {
          if (!grouped[r.employeeId]) {
            grouped[r.employeeId] = {
              employee: {
                id: r.employeeId,
                nome: r.employeeName,
                cpf: r.employeeCpf,
                cargo: r.employeeCargo,
                dataAdmissao: r.employeeDataAdmissao,
              },
              periodos: [],
            };
          }
          grouped[r.employeeId].periodos.push({
            id: r.id,
            periodoAquisitivoInicio: r.periodoAquisitivoInicio,
            periodoAquisitivoFim: r.periodoAquisitivoFim,
            periodoConcessivoFim: r.periodoConcessivoFim,
            numeroPeriodo: r.numeroPeriodo,
          });
        }

        return Object.values(grouped);
      }),

    // ============================================================
    // DETALHES COMPLETOS DE FÉRIAS DE UM FUNCIONÁRIO
    // ============================================================
    feriasDoFuncionario: protectedProcedure
      .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number() }))
      .query(async ({ input }) => {
        const db = (await getDb())!;
        
        // Dados do funcionário
        const [emp] = await db.select({
          id: employees.id,
          nome: employees.nomeCompleto,
          cpf: employees.cpf,
          cargo: employees.cargo,
          setor: employees.setor,
          dataAdmissao: employees.dataAdmissao,
          salarioBase: employees.salarioBase,
          status: employees.status,
        })
        .from(employees)
        .where(eq(employees.id, input.employeeId));
        
        if (!emp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' });
        
        // Períodos calculados (baseado na data de admissão)
        const periodosCalculados = emp.dataAdmissao ? calcularPeriodosFerias(emp.dataAdmissao) : [];
        
        // Períodos registrados no banco
        const periodosDb = await db.select({
          id: vacationPeriods.id,
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
          dataSugeridaInicio: vacationPeriods.dataSugeridaInicio,
          dataSugeridaFim: vacationPeriods.dataSugeridaFim,
          dataAlteradaPeloRh: vacationPeriods.dataAlteradaPeloRh,
          numeroPeriodo: vacationPeriods.numeroPeriodo,
          observacoes: vacationPeriods.observacoes,
          createdAt: vacationPeriods.createdAt,
        })
        .from(vacationPeriods)
        .where(and(
          companyFilter(vacationPeriods.companyId, input),
          eq(vacationPeriods.employeeId, input.employeeId),
          isNull(vacationPeriods.deletedAt),
        ))
        .orderBy(asc(vacationPeriods.periodoAquisitivoInicio));
        
        // Recalcular valores com salário atual
        const salAtual = parseBRL(emp.salarioBase || '0');
        const periodosRecalc = periodosDb.map(p => {
          const diasGozo = p.diasGozo || 30;
          const abono = p.abonoPecuniario ? 1 : 0;
          const diasAbono = abono ? Math.floor(diasGozo / 3) : 0;
          const diasEfetivos = diasGozo - diasAbono;
          if (salAtual > 0) {
            const vf = (salAtual / 30) * diasEfetivos;
            const terco = vf / 3;
            const va = abono ? ((salAtual / 30) * diasAbono + (salAtual / 30) * diasAbono / 3) : 0;
            const mult = p.pagamentoEmDobro === 1 ? 2 : 1;
            return { ...p, valorTotal: ((vf + terco + va) * mult).toFixed(2), valorFerias: (vf * mult).toFixed(2), valorTercoConstitucional: (terco * mult).toFixed(2) };
          }
          return p;
        });
        
        // Merge: períodos calculados que NÃO estão no banco
        const dbInicios = new Set(periodosDb.map(p => p.periodoAquisitivoInicio));
        const periodosNaoRegistrados = periodosCalculados
          .filter(p => p.adquirido && !dbInicios.has(p.inicio))
          .map((p, i) => ({
            id: null as number | null,
            tipo: 'nao_registrado' as const,
            periodoAquisitivoInicio: p.inicio,
            periodoAquisitivoFim: p.fim,
            periodoConcessivoFim: p.fimConcessivo,
            vencida: p.vencida,
            status: p.vencida ? 'vencida' : 'pendente',
            valorEstimado: salAtual > 0 ? (salAtual + salAtual / 3).toFixed(2) : '0.00',
          }));
        
        // Resumo
        // Vencidas: apenas períodos NÃO concluídos/cancelados que estão vencidos
        const statusFinalizados = ['concluida', 'cancelada'];
        const totalVencidas = periodosRecalc.filter(p => !statusFinalizados.includes(p.status) && (p.vencida === 1 || p.status === 'vencida')).length
          + periodosNaoRegistrados.filter(p => p.vencida).length;
        const totalRegistrados = periodosRecalc.length;
        const totalNaoRegistrados = periodosNaoRegistrados.length;
        const totalConcluidas = periodosRecalc.filter(p => p.status === 'concluida').length;
        const totalEmGozo = periodosRecalc.filter(p => p.status === 'em_gozo').length;
        // Valor estimado: apenas períodos pendentes/agendados/vencidos (não concluídos/cancelados)
        const valorTotalEstimado = periodosRecalc
          .filter(p => !statusFinalizados.includes(p.status))
          .reduce((sum, p) => sum + parseFloat(p.valorTotal || '0'), 0)
          + periodosNaoRegistrados.reduce((sum, p) => sum + parseFloat(p.valorEstimado || '0'), 0);
        
        return {
          funcionario: emp,
          periodosRegistrados: periodosRecalc,
          periodosNaoRegistrados,
          resumo: {
            totalPeriodos: totalRegistrados + totalNaoRegistrados,
            totalRegistrados,
            totalNaoRegistrados,
            totalVencidas,
            totalConcluidas,
            totalEmGozo,
            valorTotalEstimado: valorTotalEstimado.toFixed(2),
          },
        };
      }),
  }),
});
