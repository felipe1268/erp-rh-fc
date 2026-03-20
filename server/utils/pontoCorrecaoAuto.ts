import { getDb } from "../db";
import { timeRecords, vacationPeriods, terminationNotices, employees, systemCriteria } from "../../drizzle/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

function minsToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

async function getCriteria(companyId: number) {
  const db = getDb();
  const rows = await db.select().from(systemCriteria)
    .where(eq(systemCriteria.companyId, companyId)).limit(1);
  const c = rows[0];
  return {
    tolAtraso: c ? Number(c.pontoToleranciaAtraso ?? 10) : 10,
    tolSaida:  c ? Number(c.pontoToleranciaSaida  ?? 10) : 10,
    faltaApos: c ? Number(c.pontoFaltaAposAtraso   ?? 240) : 240,
  };
}

/**
 * Aplica automaticamente as correções de Aviso Prévio e Férias
 * nos registros de ponto já salvos de um funcionário.
 * Chamado após salvar/atualizar férias ou aviso prévio.
 * Ignora registros com ajusteManual = 1 para preservar correções manuais.
 */
export async function corrigirPontoFuncionario(companyId: number, employeeId: number): Promise<void> {
  const db = getDb();
  const criteria = await getCriteria(companyId);

  // ── 1. FÉRIAS ─────────────────────────────────────────────────────────────
  const feriasAtivas = await db.select({
    dataInicio:    vacationPeriods.dataInicio,
    dataFim:       vacationPeriods.dataFim,
    periodo2Inicio: vacationPeriods.periodo2Inicio,
    periodo2Fim:    vacationPeriods.periodo2Fim,
    periodo3Inicio: vacationPeriods.periodo3Inicio,
    periodo3Fim:    vacationPeriods.periodo3Fim,
  }).from(vacationPeriods).where(
    and(
      eq(vacationPeriods.companyId, companyId),
      eq(vacationPeriods.employeeId, employeeId),
      sql`${vacationPeriods.status} NOT IN ('cancelada', 'pendente')`,
      isNull(vacationPeriods.deletedAt),
      sql`${vacationPeriods.dataInicio} IS NOT NULL`,
    )
  );

  for (const fp of feriasAtivas) {
    const ranges: Array<{ inicio: string; fim: string }> = [];
    if (fp.dataInicio && fp.dataFim)           ranges.push({ inicio: fp.dataInicio,    fim: fp.dataFim });
    if (fp.periodo2Inicio && fp.periodo2Fim)   ranges.push({ inicio: fp.periodo2Inicio, fim: fp.periodo2Fim });
    if (fp.periodo3Inicio && fp.periodo3Fim)   ranges.push({ inicio: fp.periodo3Inicio, fim: fp.periodo3Fim });

    for (const { inicio, fim } of ranges) {
      await db.execute(sql`
        UPDATE time_records
        SET faltas = '0', atrasos = '0:00'
        WHERE company_id = ${companyId}
          AND employee_id = ${employeeId}
          AND ajuste_manual = 0
          AND data BETWEEN ${inicio} AND ${fim}
          AND (faltas != '0' OR (atrasos IS NOT NULL AND atrasos != '0:00' AND atrasos != ''))
      `);
    }
  }

  // ── 2. AVISO PRÉVIO ────────────────────────────────────────────────────────
  const avisos = await db.select({
    dataInicio:    terminationNotices.dataInicio,
    dataFim:       terminationNotices.dataFim,
    reducaoJornada: terminationNotices.reducaoJornada,
  }).from(terminationNotices).where(
    and(
      eq(terminationNotices.companyId, companyId),
      eq(terminationNotices.employeeId, employeeId),
      eq(terminationNotices.status, 'em_andamento'),
      sql`${terminationNotices.tipo} IN ('empregador_trabalhado', 'empregado_trabalhado')`,
      sql`${terminationNotices.reducaoJornada} IN ('2h_dia', '7_dias_corridos')`,
      isNull(terminationNotices.deletedAt),
    )
  );

  for (const aviso of avisos) {
    const [emp] = await db.select({ jornadaTrabalho: employees.jornadaTrabalho })
      .from(employees).where(eq(employees.id, employeeId));
    if (!emp) continue;

    const records = await db.select({
      id:   timeRecords.id,
      data: timeRecords.data,
      entrada1: timeRecords.entrada1, saida1: timeRecords.saida1,
      entrada2: timeRecords.entrada2, saida2: timeRecords.saida2,
      entrada3: timeRecords.entrada3, saida3: timeRecords.saida3,
      horasTrabalhadas: timeRecords.horasTrabalhadas,
    }).from(timeRecords).where(
      and(
        eq(timeRecords.companyId, companyId),
        eq(timeRecords.employeeId, employeeId),
        sql`${timeRecords.ajusteManual} = 0`,
        sql`${timeRecords.data} BETWEEN ${aviso.dataInicio} AND ${aviso.dataFim}`,
      )
    );

    for (const rec of records) {
      const data = rec.data!;
      const dm = (a: string | null | undefined, b: string | null | undefined) => {
        if (!a || !b) return 0;
        const [ah, am] = a.split(':').map(Number);
        const [bh, bm] = b.split(':').map(Number);
        return Math.max(0, (bh * 60 + bm) - (ah * 60 + am));
      };
      let totalMinutes = dm(rec.entrada1, rec.saida1) + dm(rec.entrada2, rec.saida2) + dm(rec.entrada3, rec.saida3);
      if (totalMinutes === 0 && rec.horasTrabalhadas) {
        const p = rec.horasTrabalhadas.split(':');
        if (p.length === 2) totalMinutes = parseInt(p[0]) * 60 + parseInt(p[1]);
      }

      let expectedMinutes = 480;
      let isDiaFolga = false;
      if (emp.jornadaTrabalho) {
        try {
          const jornada = typeof emp.jornadaTrabalho === 'string'
            ? JSON.parse(emp.jornadaTrabalho) : emp.jornadaTrabalho;
          const dow = new Date(data + 'T12:00:00').getDay();
          const dayMap: Record<number, string> = { 0:'dom',1:'seg',2:'ter',3:'qua',4:'qui',5:'sex',6:'sab' };
          const dk = dayMap[dow];
          if (jornada[dk]?.entrada && jornada[dk]?.saida) {
            const j = jornada[dk];
            const [sh, sm] = j.saida.split(':').map(Number);
            const [eh, em] = j.entrada.split(':').map(Number);
            let intervMin = 60;
            if (j.intervalo) {
              const ip = j.intervalo.split(':');
              if (ip.length === 2) intervMin = parseInt(ip[0]) * 60 + parseInt(ip[1]);
            }
            expectedMinutes = Math.max(0, (sh * 60 + sm) - (eh * 60 + em) - intervMin);
          } else { expectedMinutes = 0; isDiaFolga = true; }
        } catch { /* usa 480 */ }
      }

      if (aviso.reducaoJornada === '2h_dia') {
        expectedMinutes = Math.max(0, expectedMinutes - 120);
      } else if (aviso.reducaoJornada === '7_dias_corridos') {
        const fimAviso  = new Date(aviso.dataFim + 'T12:00:00');
        const dataAtual = new Date(data + 'T12:00:00');
        const diffDias  = Math.ceil((fimAviso.getTime() - dataAtual.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDias <= 7) expectedMinutes = 0;
      }

      const diffBruto = totalMinutes - expectedMinutes;
      let horasExtras = 0, atrasos = 0, faltas = '0';

      if (isDiaFolga && totalMinutes > 0) {
        horasExtras = totalMinutes;
      } else if (diffBruto > 0) {
        horasExtras = diffBruto > criteria.tolSaida ? diffBruto : 0;
      } else if (diffBruto < 0 && totalMinutes > 0) {
        const atrasoReal = Math.abs(diffBruto);
        if (atrasoReal > criteria.tolAtraso) {
          if (atrasoReal >= criteria.faltaApos) faltas = '1';
          else atrasos = atrasoReal;
        }
      } else if (totalMinutes === 0) {
        faltas = '1';
      }

      await db.execute(sql`
        UPDATE time_records
        SET horas_extras = ${minsToHHMM(horasExtras)},
            atrasos      = ${minsToHHMM(atrasos)},
            faltas       = ${faltas}
        WHERE id = ${rec.id}
      `);
    }
  }
}
