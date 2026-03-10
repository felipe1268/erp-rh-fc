/**
 * Job de Sincronização Automática de Status de Funcionários
 * 
 * Atualiza automaticamente o campo `status` dos funcionários com base em:
 * 1. Férias em gozo (vacation_periods com status 'em_gozo' e data atual dentro do período)
 * 2. Afastamento por atestado (atestados com dataRetorno >= hoje)
 * 3. Licença maternidade/paternidade (licencaMaternidade = 1 e data atual dentro do período)
 * 
 * Status manuais permitidos: Ativo, Recluso, Desligado, Lista_Negra
 * Status automáticos: Ferias, Afastado, Licenca
 * 
 * Roda a cada 1 hora e na inicialização do servidor (com delay de 30s).
 */
import { getDb } from "../db";
import { employees, vacationPeriods, atestados } from "../../drizzle/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";

let statusSyncInterval: NodeJS.Timeout | null = null;

// Status que são controlados automaticamente pelo sistema
const AUTO_STATUS = ['Ferias', 'Afastado', 'Licenca'] as const;
// Status que são definidos manualmente pelo usuário (não devem ser alterados pelo job)
const MANUAL_STATUS = ['Ativo', 'Recluso', 'Desligado', 'Lista_Negra'] as const;

export async function syncEmployeeStatus(): Promise<{
  updated: number;
  toFerias: number;
  toAfastado: number;
  toLicenca: number;
  toAtivo: number;
  details: Array<{ id: number; nome: string; from: string; to: string; reason: string }>;
}> {
  const db = await getDb();
  if (!db) return { updated: 0, toFerias: 0, toAfastado: 0, toLicenca: 0, toAtivo: 0, details: [] };

  const today = new Date().toISOString().split('T')[0];
  const result = {
    updated: 0,
    toFerias: 0,
    toAfastado: 0,
    toLicenca: 0,
    toAtivo: 0,
    details: [] as Array<{ id: number; nome: string; from: string; to: string; reason: string }>,
  };

  try {
    // 1. Buscar todos os funcionários não-deletados e não-desligados
    const allEmps = await db.select({
      id: employees.id,
      nomeCompleto: employees.nomeCompleto,
      status: employees.status,
      companyId: employees.companyId,
      licencaMaternidade: employees.licencaMaternidade,
      licencaDataInicio: employees.licencaDataInicio,
      licencaDataFim: employees.licencaDataFim,
    }).from(employees)
      .where(and(
        isNull(employees.deletedAt),
        sql`${employees.status} NOT IN ('Desligado', 'Lista_Negra')`,
      ));

    if (allEmps.length === 0) return result;

    const empIds = allEmps.map(e => e.id);

    // 2. Buscar férias em gozo (status = 'em_gozo' OU agendada com data atual dentro do período)
    const feriasAtivas = await db.select({
      employeeId: vacationPeriods.employeeId,
      dataInicio: vacationPeriods.dataInicio,
      dataFim: vacationPeriods.dataFim,
      status: vacationPeriods.status,
    }).from(vacationPeriods)
      .where(and(
        inArray(vacationPeriods.employeeId, empIds),
        isNull(vacationPeriods.deletedAt),
        sql`(
          ${vacationPeriods.status} = 'em_gozo'
          OR (
            ${vacationPeriods.status} = 'agendada'
            AND ${vacationPeriods.dataInicio} IS NOT NULL
            AND ${vacationPeriods.dataFim} IS NOT NULL
            AND ${vacationPeriods.dataInicio} <= ${today}
            AND ${vacationPeriods.dataFim} >= ${today}
          )
        )`,
      ));

    const empIdsEmFerias = new Set(feriasAtivas.map(f => f.employeeId));

    // 3. Buscar atestados com afastamento ativo (dataRetorno >= hoje)
    const atestadosAtivos = await db.select({
      employeeId: atestados.employeeId,
      dataRetorno: atestados.dataRetorno,
      tipo: atestados.tipo,
    }).from(atestados)
      .where(and(
        inArray(atestados.employeeId, empIds),
        isNull(atestados.deletedAt),
        sql`${atestados.dataRetorno} >= ${today}`,
        sql`${atestados.diasAfastamento} > 0`,
      ));

    const empIdsAfastados = new Set(atestadosAtivos.map(a => a.employeeId));

    // 4. Verificar licenças ativas (licencaMaternidade = 1 e data atual dentro do período)
    const empIdsEmLicenca = new Set<number>();
    for (const emp of allEmps) {
      if (
        emp.licencaMaternidade === 1 &&
        emp.licencaDataInicio &&
        emp.licencaDataFim &&
        emp.licencaDataInicio <= today &&
        emp.licencaDataFim >= today
      ) {
        empIdsEmLicenca.add(emp.id);
      }
    }

    // 5. Determinar o status correto para cada funcionário
    // Prioridade: Licença > Férias > Afastado > status manual
    for (const emp of allEmps) {
      let newStatus: string | null = null;
      let reason = '';

      if (empIdsEmLicenca.has(emp.id)) {
        newStatus = 'Licenca';
        reason = `Licença ativa (${emp.licencaDataInicio} a ${emp.licencaDataFim})`;
      } else if (empIdsEmFerias.has(emp.id)) {
        newStatus = 'Ferias';
        const ferias = feriasAtivas.find(f => f.employeeId === emp.id);
        reason = `Férias em gozo (${ferias?.dataInicio} a ${ferias?.dataFim})`;
      } else if (empIdsAfastados.has(emp.id)) {
        newStatus = 'Afastado';
        const atestado = atestadosAtivos.find(a => a.employeeId === emp.id);
        reason = `Atestado ativo (retorno: ${atestado?.dataRetorno})`;
      } else if (AUTO_STATUS.includes(emp.status as any)) {
        // Status era automático mas não tem mais justificativa → volta para Ativo
        newStatus = 'Ativo';
        reason = 'Sem férias/afastamento/licença ativa - retornando para Ativo';
      }

      // Só atualizar se o status mudou
      if (newStatus && newStatus !== emp.status) {
        await db.update(employees)
          .set({ status: newStatus as any })
          .where(eq(employees.id, emp.id));

        result.updated++;
        result.details.push({
          id: emp.id,
          nome: emp.nomeCompleto,
          from: emp.status,
          to: newStatus,
          reason,
        });

        if (newStatus === 'Ferias') result.toFerias++;
        else if (newStatus === 'Afastado') result.toAfastado++;
        else if (newStatus === 'Licenca') result.toLicenca++;
        else if (newStatus === 'Ativo') result.toAtivo++;
      }
    }

    if (result.updated > 0) {
      console.log(`[StatusSync] ${result.updated} funcionário(s) atualizado(s): ${result.toFerias} → Férias, ${result.toAfastado} → Afastado, ${result.toLicenca} → Licença, ${result.toAtivo} → Ativo`);
      result.details.forEach(d => console.log(`  [StatusSync] ${d.nome}: ${d.from} → ${d.to} (${d.reason})`));
    } else {
      console.log("[StatusSync] Nenhuma atualização necessária.");
    }

    // 6. Atualizar férias concluídas: vacation_periods em_gozo cujo dataFim < hoje → concluida
    const feriasExpiradas = await db.update(vacationPeriods)
      .set({ status: 'concluida' as any })
      .where(and(
        eq(vacationPeriods.status, 'em_gozo'),
        isNull(vacationPeriods.deletedAt),
        sql`${vacationPeriods.dataFim} < ${today}`,
      ));

    return result;
  } catch (e) {
    console.error("[StatusSync] Erro ao sincronizar status:", e);
    return result;
  }
}

export function startStatusSyncJob() {
  if (statusSyncInterval) clearInterval(statusSyncInterval);
  // Verificar a cada 1 hora
  statusSyncInterval = setInterval(syncEmployeeStatus, 60 * 60 * 1000);
  console.log("[StatusSync] Job de sincronização de status iniciado (verifica a cada 1h)");
  // Executar na primeira vez com delay de 30s
  setTimeout(syncEmployeeStatus, 30000);
}
