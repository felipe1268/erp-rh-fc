import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as XLSX from "xlsx";
import { getDb } from "../db";
import {
  timeRecords, timeInconsistencies, employees, obras, dixiDevices, warnings, obraHorasRateio, pontoConsolidacao, obraSns
} from "../../drizzle/schema";
import { eq, and, sql, like, or, between, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ============================================================
// HELPERS
// ============================================================
function diffMinutes(start: string, end: string): number {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${mins < 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

function normalizeNameForMatch(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract YYYY-MM from a date string YYYY-MM-DD */
function dateToMesRef(dateStr: string): string {
  return dateStr.substring(0, 7); // "2025-12" from "2025-12-15"
}

// Parse DIXI XLS - handles both date formats (DD/MM/YYYY and YYYY/MM/DD)
function parseDixiXLS(buffer: Buffer): {
  records: Array<{
    dixiId: string;
    nome: string;
    data: string; // YYYY-MM-DD
    hora: string; // HH:MM:SS
    modo: string;
    sn: string;
  }>;
  deviceSerial: string;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  const sheetName = workbook.SheetNames.find((n: string) =>
    n.includes("Registro") || n.includes("Original")
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const records: any[] = [];
  let deviceSerial = "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const dixiId = String(row[0] || "").trim();
    const nome = String(row[1] || "").trim();
    if (!nome) continue;

    let dataStr = "";
    let horaStr = "";
    const rawDate = row[2];

    if (typeof rawDate === "number") {
      // Excel serial date number
      const epoch = new Date(1899, 11, 30);
      const dt = new Date(epoch.getTime() + rawDate * 86400000);
      dataStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const frac = rawDate - Math.floor(rawDate);
      const totalSecs = Math.round(frac * 86400);
      const hh = Math.floor(totalSecs / 3600);
      const mm = Math.floor((totalSecs % 3600) / 60);
      const ss = totalSecs % 60;
      horaStr = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    } else {
      const dtStr = String(rawDate);
      // Try DD/MM/YYYY HH:MM:SS
      let match = dtStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
      if (match) {
        dataStr = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
        horaStr = `${match[4].padStart(2, "0")}:${match[5]}:${(match[6] || "00").padStart(2, "0")}`;
      } else {
        // Try YYYY/MM/DD HH:MM:SS
        match = dtStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
        if (match) {
          dataStr = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
          horaStr = `${match[4].padStart(2, "0")}:${match[5]}:${(match[6] || "00").padStart(2, "0")}`;
        }
      }
    }

    const modo = String(row[3] || "").trim(); // F = Fingerprint, Face
    const sn = String(row[7] || row[6] || "").trim();
    if (sn && !deviceSerial) deviceSerial = sn;

    if (dataStr && nome) {
      records.push({ dixiId, nome, data: dataStr, hora: horaStr, modo, sn });
    }
  }

  return { records, deviceSerial };
}

// Match employee name from DIXI to database
function matchEmployee(
  dixiName: string,
  employeeList: Array<{ id: number; nomeCompleto: string; jornadaTrabalho?: any }>
): { id: number; nomeCompleto: string; jornadaTrabalho?: any } | null {
  const normalized = normalizeNameForMatch(dixiName);
  const parts = normalized.split(" ");

  // Exact match
  for (const emp of employeeList) {
    if (normalizeNameForMatch(emp.nomeCompleto) === normalized) return emp;
  }

  // Match by first + last name
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    for (const emp of employeeList) {
      const empNorm = normalizeNameForMatch(emp.nomeCompleto);
      const empParts = empNorm.split(" ");
      if (empParts[0] === firstName && empParts[empParts.length - 1] === lastName) return emp;
    }
  }

  // Partial match - first name + any other part
  if (parts.length >= 1) {
    const firstName = parts[0];
    for (const emp of employeeList) {
      const empNorm = normalizeNameForMatch(emp.nomeCompleto);
      if (empNorm.startsWith(firstName + " ")) {
        const empParts = empNorm.split(" ");
        const matchCount = parts.filter(p => empParts.includes(p)).length;
        if (matchCount >= 2) return emp;
      }
    }
  }

  return null;
}

// Group punches by person+day, assign entry/exit slots, detect inconsistencies
// NOW: mesReferencia is derived from each record's date, not from input
function processRecords(
  records: Array<{ dixiId: string; nome: string; data: string; hora: string; modo: string; sn: string }>,
  employeeList: Array<{ id: number; nomeCompleto: string; jornadaTrabalho: any }>,
  obraId: number | null,
  companyId: number,
) {
  // Group by person+day
  const grouped: Record<string, Record<string, string[]>> = {};
  const nameToEmployee: Record<string, { id: number; nomeCompleto: string; jornadaTrabalho?: any } | null> = {};

  for (const r of records) {
    const key = normalizeNameForMatch(r.nome);
    if (!grouped[key]) {
      grouped[key] = {};
      nameToEmployee[key] = matchEmployee(r.nome, employeeList);
    }
    if (!grouped[key][r.data]) grouped[key][r.data] = [];
    grouped[key][r.data].push(r.hora);
  }

  const timeRecordsToInsert: any[] = [];
  const inconsistencies: any[] = [];
  const unmatchedNames: string[] = [];

  for (const [normName, days] of Object.entries(grouped)) {
    const emp = nameToEmployee[normName];
    if (!emp) {
      const originalName = records.find(r => normalizeNameForMatch(r.nome) === normName)?.nome || normName;
      unmatchedNames.push(originalName);
      continue;
    }

    for (const [data, horas] of Object.entries(days)) {
      horas.sort();

      // Remove duplicate punches (within 2 minutes)
      const filtered: string[] = [];
      for (const h of horas) {
        if (filtered.length === 0) { filtered.push(h); continue; }
        const lastH = filtered[filtered.length - 1];
        const [lh, lm] = lastH.split(":").map(Number);
        const [ch, cm] = h.split(":").map(Number);
        const diff = Math.abs((ch * 60 + cm) - (lh * 60 + lm));
        if (diff >= 2) filtered.push(h);
      }

      const entrada1 = filtered[0] ? filtered[0].substring(0, 5) : "";
      const saida1 = filtered[1] ? filtered[1].substring(0, 5) : "";
      const entrada2 = filtered[2] ? filtered[2].substring(0, 5) : "";
      const saida2 = filtered[3] ? filtered[3].substring(0, 5) : "";
      const entrada3 = filtered[4] ? filtered[4].substring(0, 5) : "";
      const saida3 = filtered[5] ? filtered[5].substring(0, 5) : "";

      let totalMinutes = 0;
      if (entrada1 && saida1) totalMinutes += diffMinutes(entrada1, saida1);
      if (entrada2 && saida2) totalMinutes += diffMinutes(entrada2, saida2);
      if (entrada3 && saida3) totalMinutes += diffMinutes(entrada3, saida3);

      let expectedMinutes = 480;
      if (emp.jornadaTrabalho) {
        try {
          const jornada = typeof emp.jornadaTrabalho === "string" ? JSON.parse(emp.jornadaTrabalho) : emp.jornadaTrabalho;
          const dayOfWeek = new Date(data + "T12:00:00").getDay();
          const dayMap: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
          const dayKey = dayMap[dayOfWeek];
          if (jornada[dayKey]) {
            const j = jornada[dayKey];
            if (j.entrada && j.saida) {
              const totalJornada = diffMinutes(j.entrada, j.saida);
              const intervalo = j.intervalo ? parseFloat(j.intervalo.replace(":", ".")) * 60 : 60;
              expectedMinutes = totalJornada - (typeof intervalo === "number" ? intervalo : 60);
            }
          }
        } catch (e) { /* use default */ }
      }

      const horasExtras = totalMinutes > expectedMinutes ? totalMinutes - expectedMinutes : 0;
      const atrasos = totalMinutes < expectedMinutes && totalMinutes > 0 ? expectedMinutes - totalMinutes : 0;
      const isOddPunches = filtered.length % 2 !== 0;
      const isMissingPunch = filtered.length < 4 && filtered.length > 0;

      // AUTO-DETECT mesReferencia from record date
      const mesReferencia = dateToMesRef(data);

      const rec = {
        companyId,
        employeeId: emp.id,
        obraId,
        mesReferencia,
        data,
        entrada1, saida1, entrada2, saida2, entrada3, saida3,
        horasTrabalhadas: minutesToHHMM(totalMinutes),
        horasExtras: horasExtras > 0 ? minutesToHHMM(horasExtras) : "0:00",
        horasNoturnas: "0:00",
        faltas: "0",
        atrasos: atrasos > 0 ? minutesToHHMM(atrasos) : "0:00",
        fonte: "dixi",
        ajusteManual: 0,
        batidasBrutas: JSON.stringify(filtered),
      };

      timeRecordsToInsert.push(rec);

      if (isOddPunches) {
        inconsistencies.push({
          companyId, employeeId: emp.id, obraId, mesReferencia, data,
          tipoInconsistencia: "batida_impar" as const,
          descricao: `${filtered.length} batida(s) registrada(s) - número ímpar indica falta de entrada ou saída`,
          status: "pendente" as const,
        });
      }

      if (isMissingPunch && !isOddPunches) {
        inconsistencies.push({
          companyId, employeeId: emp.id, obraId, mesReferencia, data,
          tipoInconsistencia: "falta_batida" as const,
          descricao: `Apenas ${filtered.length} batida(s) - esperado 4 (entrada, saída intervalo, retorno, saída)`,
          status: "pendente" as const,
        });
      }
    }
  }

  return { timeRecordsToInsert, inconsistencies, unmatchedNames };
}

// ============================================================
// ROUTER
// ============================================================
export const fechamentoPontoRouter = router({

  // ===================== UPLOAD DIXI (INTELIGENTE) =====================
  // Upload auto-detecta mês dos registros do arquivo. Não depende do filtro de mês.
  // Valida SN obrigatoriamente - bloqueia se SN não estiver vinculado a obra.
  uploadDixi: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      files: z.array(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Get all employees for this company
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(eq(employees.companyId, input.companyId));

      // Get all dixi devices for this company (to match SN -> obra)
      const devices = await db.select().from(dixiDevices).where(eq(dixiDevices.companyId, input.companyId));
      // Get active SNs from obra_sns table
      const activeSns = await db.select({
        sn: obraSns.sn,
        obraId: obraSns.obraId,
        obraNome: obras.nome,
      }).from(obraSns)
        .leftJoin(obras, eq(obraSns.obraId, obras.id))
        .where(and(eq(obraSns.companyId, input.companyId), eq(obraSns.status, "ativo")));
      // Also get obras list for fallback (legacy snRelogioPonto field)
      const obrasList = await db.select({
        id: obras.id,
        nome: obras.nome,
        snRelogioPonto: obras.snRelogioPonto,
      }).from(obras).where(eq(obras.companyId, input.companyId));

      let totalImported = 0;
      let totalInconsistencies = 0;
      let totalUnmatched: string[] = [];
      const fileResults: any[] = [];
      const mesesAfetados = new Set<string>();

      for (const file of input.files) {
        const buffer = Buffer.from(file.fileBase64, "base64");
        const { records, deviceSerial } = parseDixiXLS(buffer);

        // ===== VALIDAÇÃO DE SN OBRIGATÓRIA =====
        if (!deviceSerial) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Arquivo "${file.fileName}": Não foi possível identificar o número de série (SN) do equipamento DIXI. Verifique se o arquivo está no formato correto.`,
          });
        }

        // Find obra by SN
        let obraId: number | null = null;
        let obraNome = "";

        // 1. Check obra_sns table (primary - supports multiple SNs per obra)
        const snMatch = activeSns.find(s => s.sn === deviceSerial);
        if (snMatch) {
          obraId = snMatch.obraId;
          obraNome = snMatch.obraNome || "";
        }

        // 2. Fallback: Check dixi_devices table
        if (!obraId) {
          const device = devices.find(d => d.serialNumber === deviceSerial);
          if (device && device.obraId) {
            obraId = device.obraId;
            const obra = obrasList.find(o => o.id === device.obraId);
            if (obra) obraNome = obra.nome;
          }
        }

        // 3. Fallback: Check legacy obras.snRelogioPonto field
        if (!obraId) {
          const obra = obrasList.find(o => o.snRelogioPonto === deviceSerial);
          if (obra) {
            obraId = obra.id;
            obraNome = obra.nome;
          }
        }

        // ===== BLOQUEAR SE SN NÃO VINCULADO A OBRA =====
        if (!obraId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Arquivo "${file.fileName}": O equipamento DIXI com SN "${deviceSerial}" não está vinculado a nenhuma obra cadastrada. Por favor, cadastre o SN na aba de Obras antes de fazer o upload.`,
          });
        }

        // Process records - mesReferencia is auto-detected from each record's date
        const { timeRecordsToInsert, inconsistencies, unmatchedNames } = processRecords(
          records, empList as any, obraId, input.companyId
        );

        // Group records by mesReferencia (auto-detected)
        const recordsByMes: Record<string, any[]> = {};
        const inconsByMes: Record<string, any[]> = {};
        for (const rec of timeRecordsToInsert) {
          if (!recordsByMes[rec.mesReferencia]) recordsByMes[rec.mesReferencia] = [];
          recordsByMes[rec.mesReferencia].push(rec);
        }
        for (const inc of inconsistencies) {
          if (!inconsByMes[inc.mesReferencia]) inconsByMes[inc.mesReferencia] = [];
          inconsByMes[inc.mesReferencia].push(inc);
        }

        // Process each month separately
        for (const [mesRef, recs] of Object.entries(recordsByMes)) {
          mesesAfetados.add(mesRef);

          // Delete existing DIXI records for this company/mesRef/obra
          await db.delete(timeRecords).where(
            and(
              eq(timeRecords.companyId, input.companyId),
              eq(timeRecords.mesReferencia, mesRef),
              eq(timeRecords.obraId, obraId!),
              eq(timeRecords.fonte, "dixi"),
            )
          );
          await db.delete(timeInconsistencies).where(
            and(
              eq(timeInconsistencies.companyId, input.companyId),
              eq(timeInconsistencies.mesReferencia, mesRef),
              eq(timeInconsistencies.obraId, obraId!),
            )
          );

          // Insert time records in batches
          if (recs.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < recs.length; i += batchSize) {
              const batch = recs.slice(i, i + batchSize);
              await db.insert(timeRecords).values(batch);
            }
          }

          // Insert inconsistencies for this month
          const monthIncons = inconsByMes[mesRef] || [];
          if (monthIncons.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < monthIncons.length; i += batchSize) {
              const batch = monthIncons.slice(i, i + batchSize);
              await db.insert(timeInconsistencies).values(batch);
            }
          }

          // ===== RATEIO AUTOMÁTICO POR OBRA (por mês) =====
          await db.delete(obraHorasRateio).where(
            and(
              eq(obraHorasRateio.companyId, input.companyId),
              eq(obraHorasRateio.mesAno, mesRef),
              eq(obraHorasRateio.obraId, obraId!),
            )
          );

          const empIds = Array.from(new Set(recs.map((r: any) => r.employeeId)));
          const empValores = await db.select({
            id: employees.id,
            valorHora: employees.valorHora,
          }).from(employees).where(inArray(employees.id, empIds));
          const valorHoraMap: Record<number, number> = {};
          for (const e of empValores) {
            valorHoraMap[e.id] = parseFloat(String(e.valorHora || "0").replace(",", ".")) || 0;
          }

          const rateioByEmp: Record<number, { horasNormais: number; horasExtras: number; totalHoras: number; dias: number }> = {};
          for (const rec of recs) {
            if (!rateioByEmp[rec.employeeId]) {
              rateioByEmp[rec.employeeId] = { horasNormais: 0, horasExtras: 0, totalHoras: 0, dias: 0 };
            }
            const r = rateioByEmp[rec.employeeId];
            r.dias++;
            if (rec.horasTrabalhadas) {
              const [h, m] = rec.horasTrabalhadas.split(":").map(Number);
              r.totalHoras += (h || 0) * 60 + (m || 0);
            }
            if (rec.horasExtras && rec.horasExtras !== "0:00") {
              const [h, m] = rec.horasExtras.split(":").map(Number);
              r.horasExtras += (h || 0) * 60 + (m || 0);
            }
          }

          const rateioInserts: any[] = [];
          for (const [empId, data] of Object.entries(rateioByEmp)) {
            const normais = data.totalHoras - data.horasExtras;
            rateioInserts.push({
              companyId: input.companyId,
              obraId: obraId!,
              employeeId: Number(empId),
              dixiDeviceId: devices.find(d => d.serialNumber === deviceSerial)?.id || null,
              mesAno: mesRef,
              horasNormais: minutesToHHMM(normais > 0 ? normais : 0),
              horasExtras: minutesToHHMM(data.horasExtras),
              horasNoturnas: "0:00",
              totalHoras: minutesToHHMM(data.totalHoras),
              diasTrabalhados: data.dias,
            });
          }

          if (rateioInserts.length > 0) {
            await db.insert(obraHorasRateio).values(rateioInserts);
          }
        }

        totalImported += timeRecordsToInsert.length;
        totalInconsistencies += inconsistencies.length;
        totalUnmatched = [...totalUnmatched, ...unmatchedNames];

        // Collect months found in this file
        const mesesNoArquivo = Object.keys(recordsByMes).sort();

        fileResults.push({
          fileName: file.fileName,
          deviceSerial,
          obraNome,
          obraId,
          mesesDetectados: mesesNoArquivo,
          totalRegistrosBrutos: records.length,
          totalDiasProcessados: timeRecordsToInsert.length,
          totalInconsistencias: inconsistencies.length,
          funcionariosNaoEncontrados: unmatchedNames,
          funcionariosProcessados: new Set(timeRecordsToInsert.map(r => r.employeeId)).size,
        });
      }

      return {
        success: true,
        totalImported,
        totalInconsistencies,
        totalUnmatched: Array.from(new Set(totalUnmatched)),
        mesesAfetados: Array.from(mesesAfetados).sort(),
        fileResults,
      };
    }),

  // List time records for a month
  listRecords: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      obraId: z.number().optional(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [
        eq(timeRecords.companyId, input.companyId),
        eq(timeRecords.mesReferencia, input.mesReferencia),
      ];
      if (input.obraId) conditions.push(eq(timeRecords.obraId, input.obraId));
      if (input.employeeId) conditions.push(eq(timeRecords.employeeId, input.employeeId));

      const recs = await db.select({
        record: timeRecords,
        employeeName: employees.nomeCompleto,
        employeeCpf: employees.cpf,
        employeeFuncao: employees.funcao,
      })
        .from(timeRecords)
        .leftJoin(employees, eq(timeRecords.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(sql`${employees.nomeCompleto} ASC, ${timeRecords.data} ASC`);

      return recs;
    }),

  // Get summary by employee for a month
  getSummary: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      obraId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [
        eq(timeRecords.companyId, input.companyId),
        eq(timeRecords.mesReferencia, input.mesReferencia),
      ];
      if (input.obraId) conditions.push(eq(timeRecords.obraId, input.obraId));

      const recs = await db.select({
        employeeId: timeRecords.employeeId,
        employeeName: employees.nomeCompleto,
        employeeCpf: employees.cpf,
        employeeFuncao: employees.funcao,
        obraId: timeRecords.obraId,
        data: timeRecords.data,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
        horasExtras: timeRecords.horasExtras,
        atrasos: timeRecords.atrasos,
        ajusteManual: timeRecords.ajusteManual,
        fonte: timeRecords.fonte,
      })
        .from(timeRecords)
        .leftJoin(employees, eq(timeRecords.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(sql`${employees.nomeCompleto} ASC`);

      // Group by employee
      const byEmployee: Record<number, any> = {};
      for (const r of recs) {
        if (!byEmployee[r.employeeId]) {
          byEmployee[r.employeeId] = {
            employeeId: r.employeeId,
            employeeName: r.employeeName,
            employeeCpf: r.employeeCpf,
            employeeFuncao: r.employeeFuncao,
            obraId: r.obraId,
            obraIds: new Set<number>(),
            diasTrabalhados: 0,
            totalMinutosTrabalhados: 0,
            totalMinutosExtras: 0,
            totalMinutosAtrasos: 0,
            temAjusteManual: false,
          };
        }
        const emp = byEmployee[r.employeeId];
        emp.diasTrabalhados++;
        if (r.obraId) emp.obraIds.add(r.obraId);
        if (r.horasTrabalhadas) {
          const [h, m] = r.horasTrabalhadas.split(":").map(Number);
          emp.totalMinutosTrabalhados += (h || 0) * 60 + (m || 0);
        }
        if (r.horasExtras && r.horasExtras !== "0:00") {
          const [h, m] = r.horasExtras.split(":").map(Number);
          emp.totalMinutosExtras += (h || 0) * 60 + (m || 0);
        }
        if (r.atrasos && r.atrasos !== "0:00") {
          const [h, m] = r.atrasos.split(":").map(Number);
          emp.totalMinutosAtrasos += (h || 0) * 60 + (m || 0);
        }
        if (r.ajusteManual) emp.temAjusteManual = true;
      }

      // Fetch obra names
      const allObraIds = new Set<number>();
      for (const emp of Object.values(byEmployee)) {
        for (const oId of emp.obraIds) allObraIds.add(oId);
      }
      let obraNameMap: Record<number, string> = {};
      if (allObraIds.size > 0) {
        const obraRows = await db.select({ id: obras.id, nome: obras.nome })
          .from(obras)
          .where(inArray(obras.id, Array.from(allObraIds)));
        for (const o of obraRows) obraNameMap[o.id] = o.nome;
      }

      return Object.values(byEmployee).map((emp: any) => {
        const obraIdsArr = Array.from(emp.obraIds) as number[];
        return {
          ...emp,
          obraIds: obraIdsArr,
          obraNomes: obraIdsArr.map((id: number) => obraNameMap[id] || `Obra #${id}`),
          multiplasObras: obraIdsArr.length > 1,
          horasTrabalhadas: minutesToHHMM(emp.totalMinutosTrabalhados),
          horasExtras: minutesToHHMM(emp.totalMinutosExtras),
          atrasos: minutesToHHMM(emp.totalMinutosAtrasos),
        };
      });
    }),

  // List inconsistencies
  listInconsistencies: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      obraId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [
        eq(timeInconsistencies.companyId, input.companyId),
        eq(timeInconsistencies.mesReferencia, input.mesReferencia),
      ];
      if (input.obraId) conditions.push(eq(timeInconsistencies.obraId, input.obraId));
      if (input.status) conditions.push(eq(timeInconsistencies.status, input.status as any));

      const results = await db.select({
        inconsistency: timeInconsistencies,
        employeeName: employees.nomeCompleto,
        employeeCpf: employees.cpf,
        employeeFuncao: employees.funcao,
        obraNome: obras.nome,
      })
        .from(timeInconsistencies)
        .leftJoin(employees, eq(timeInconsistencies.employeeId, employees.id))
        .leftJoin(obras, eq(timeInconsistencies.obraId, obras.id))
        .where(and(...conditions))
        .orderBy(sql`${timeInconsistencies.data} ASC, ${employees.nomeCompleto} ASC`);

      // Fetch time records for each inconsistency's employee+date to show context
      const enriched = await Promise.all(results.map(async (r) => {
        const dayRecords = await db.select({
          record: timeRecords,
          obraNome: obras.nome,
        })
          .from(timeRecords)
          .leftJoin(obras, eq(timeRecords.obraId, obras.id))
          .where(and(
            eq(timeRecords.companyId, input.companyId),
            eq(timeRecords.employeeId, r.inconsistency.employeeId),
            eq(timeRecords.data, r.inconsistency.data),
          ))
          .orderBy(sql`${timeRecords.obraId} ASC`);

        return {
          ...r,
          dayRecords: dayRecords.map(dr => ({ ...dr.record, obraNome: dr.obraNome })),
        };
      }));

      return enriched;
    }),

  // Resolve inconsistency
  resolveInconsistency: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["justificado", "ajustado", "advertencia"]),
      justificativa: z.string().optional(),
      resolvidoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.update(timeInconsistencies)
        .set({
          status: input.status,
          justificativa: input.justificativa || null,
          resolvidoPor: input.resolvidoPor || ctx.user?.name || "RH",
          resolvidoEm: new Date().toISOString().split("T")[0],
        })
        .where(eq(timeInconsistencies.id, input.id));
      return { success: true };
    }),

  // Manual time record entry/update
  manualEntry: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      obraId: z.number().optional(),
      mesReferencia: z.string(),
      data: z.string(),
      entrada1: z.string().optional(),
      saida1: z.string().optional(),
      entrada2: z.string().optional(),
      saida2: z.string().optional(),
      entrada3: z.string().optional(),
      saida3: z.string().optional(),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      let totalMinutes = 0;
      if (input.entrada1 && input.saida1) totalMinutes += diffMinutes(input.entrada1, input.saida1);
      if (input.entrada2 && input.saida2) totalMinutes += diffMinutes(input.entrada2, input.saida2);
      if (input.entrada3 && input.saida3) totalMinutes += diffMinutes(input.entrada3, input.saida3);

      const existing = await db.select().from(timeRecords)
        .where(and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.data, input.data),
        ))
        .limit(1);

      const record = {
        companyId: input.companyId,
        employeeId: input.employeeId,
        obraId: input.obraId || null,
        mesReferencia: input.mesReferencia,
        data: input.data,
        entrada1: input.entrada1 || null,
        saida1: input.saida1 || null,
        entrada2: input.entrada2 || null,
        saida2: input.saida2 || null,
        entrada3: input.entrada3 || null,
        saida3: input.saida3 || null,
        horasTrabalhadas: minutesToHHMM(totalMinutes),
        horasExtras: "0:00",
        horasNoturnas: "0:00",
        faltas: "0",
        atrasos: "0:00",
        fonte: "manual",
        ajusteManual: 1,
        ajustadoPor: ctx.user?.name || "RH",
        justificativa: input.justificativa || null,
      };

      if (existing.length > 0) {
        await db.update(timeRecords).set(record as any).where(eq(timeRecords.id, existing[0].id));
        await db.update(timeInconsistencies)
          .set({ status: "ajustado", resolvidoPor: ctx.user?.name || "RH", resolvidoEm: new Date().toISOString().split("T")[0] })
          .where(and(
            eq(timeInconsistencies.employeeId, input.employeeId),
            eq(timeInconsistencies.data, input.data),
          ));
        return { success: true, action: "updated" };
      } else {
        await db.insert(timeRecords).values(record as any);
        return { success: true, action: "created" };
      }
    }),

  // Get employee detail for a month (day by day) — NOW includes obra info per record
  getEmployeeDetail: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const recs = await db.select({
        record: timeRecords,
        obraNome: obras.nome,
      })
        .from(timeRecords)
        .leftJoin(obras, eq(timeRecords.obraId, obras.id))
        .where(and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.mesReferencia, input.mesReferencia),
        ))
        .orderBy(sql`${timeRecords.obraId} ASC, ${timeRecords.data} ASC`);

      const incons = await db.select()
        .from(timeInconsistencies)
        .where(and(
          eq(timeInconsistencies.companyId, input.companyId),
          eq(timeInconsistencies.employeeId, input.employeeId),
          eq(timeInconsistencies.mesReferencia, input.mesReferencia),
        ));

      const emp = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(eq(employees.id, input.employeeId)).limit(1);

      // Group records by obra for display
      const byObra: Record<string, { obraId: number | null; obraNome: string; records: any[] }> = {};
      for (const r of recs) {
        const obraKey = String(r.record.obraId || 0);
        if (!byObra[obraKey]) {
          byObra[obraKey] = {
            obraId: r.record.obraId,
            obraNome: r.obraNome || "Sem Obra Definida",
            records: [],
          };
        }
        byObra[obraKey].records.push(r.record);
      }

      return {
        employee: emp[0] || null,
        recordsByObra: Object.values(byObra),
        records: recs.map(r => r.record), // flat list for backward compat
        inconsistencies: incons,
      };
    }),

  // Stats for dashboard cards
  getStats: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [
        eq(timeRecords.companyId, input.companyId),
        eq(timeRecords.mesReferencia, input.mesReferencia),
      ];

      const [totalRecs] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeRecords).where(and(...conditions));

      const [totalEmps] = await db.select({ count: sql<number>`COUNT(DISTINCT ${timeRecords.employeeId})` })
        .from(timeRecords).where(and(...conditions));

      const [totalIncons] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeInconsistencies)
        .where(and(
          eq(timeInconsistencies.companyId, input.companyId),
          eq(timeInconsistencies.mesReferencia, input.mesReferencia),
          eq(timeInconsistencies.status, "pendente"),
        ));

      const [totalManual] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeRecords)
        .where(and(
          ...conditions,
          eq(timeRecords.ajusteManual, 1),
        ));

      return {
        totalRegistros: Number(totalRecs?.count || 0),
        totalColaboradores: Number(totalEmps?.count || 0),
        totalInconsistencias: Number(totalIncons?.count || 0),
        totalAjustesManuais: Number(totalManual?.count || 0),
      };
    }),

  // ===================== LIMPAR BASE DO MÊS (ADMIN ONLY) =====================
  clearMonthData: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      tipo: z.enum(["tudo", "registros", "inconsistencias", "rateio"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("Apenas administradores podem limpar a base de dados");
      const db = (await getDb())!;
      if (input.tipo === "tudo" || input.tipo === "registros") {
        await db.delete(timeRecords).where(and(eq(timeRecords.companyId, input.companyId), eq(timeRecords.mesReferencia, input.mesReferencia)));
      }
      if (input.tipo === "tudo" || input.tipo === "inconsistencias") {
        await db.delete(timeInconsistencies).where(and(eq(timeInconsistencies.companyId, input.companyId), eq(timeInconsistencies.mesReferencia, input.mesReferencia)));
      }
      if (input.tipo === "tudo" || input.tipo === "rateio") {
        await db.delete(obraHorasRateio).where(and(eq(obraHorasRateio.companyId, input.companyId), eq(obraHorasRateio.mesAno, input.mesReferencia)));
      }
      return { success: true };
    }),

  // ===================== VERIFICAÇÃO DE DUPLICIDADE =====================
  checkDuplicates: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [existing] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeRecords)
        .where(and(eq(timeRecords.companyId, input.companyId), eq(timeRecords.mesReferencia, input.mesReferencia)));
      return { existingCount: Number(existing?.count || 0), hasData: Number(existing?.count || 0) > 0 };
    }),

  // ===================== RATEIO POR OBRA =====================
  getRateioPorObra: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rateio = await db.select({
        obraId: obraHorasRateio.obraId,
        nomeObra: obras.nome,
        codigoObra: obras.codigo,
        snRelogioPonto: obras.snRelogioPonto,
        employeeId: obraHorasRateio.employeeId,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        horasNormais: obraHorasRateio.horasNormais,
        horasExtras: obraHorasRateio.horasExtras,
        totalHoras: obraHorasRateio.totalHoras,
        diasTrabalhados: obraHorasRateio.diasTrabalhados,
      })
        .from(obraHorasRateio)
        .leftJoin(obras, eq(obraHorasRateio.obraId, obras.id))
        .leftJoin(employees, eq(obraHorasRateio.employeeId, employees.id))
        .where(and(eq(obraHorasRateio.companyId, input.companyId), eq(obraHorasRateio.mesAno, input.mesReferencia)))
        .orderBy(obras.nome, employees.nomeCompleto);

      // Check if obras have SNs linked (from obra_sns table)
      const obraIds = Array.from(new Set(rateio.map(r => r.obraId).filter(Boolean)));
      let snWarnings: Record<number, string> = {};
      let obraSnMap: Record<number, string[]> = {};
      if (obraIds.length > 0) {
        const linkedSns = await db.select({
          obraId: obraSns.obraId,
          sn: obraSns.sn,
          status: obraSns.status,
        }).from(obraSns).where(
          and(
            eq(obraSns.companyId, input.companyId),
            inArray(obraSns.obraId, obraIds as number[]),
          )
        );
        for (const s of linkedSns) {
          if (!obraSnMap[s.obraId]) obraSnMap[s.obraId] = [];
          obraSnMap[s.obraId].push(s.sn);
        }
        for (const oId of obraIds) {
          if (oId && !obraSnMap[oId as number]) {
            snWarnings[oId as number] = "Nenhum SN vinculado a esta obra. O rateio pode estar incorreto.";
          }
        }
      }

      // Agrupar por obra
      const porObra: Record<number, {
        obraId: number; nomeObra: string; codigoObra: string; sns: string[];
        funcionarios: any[]; totalHoras: string; totalExtras: string; totalDias: number;
        snWarning: string | null;
      }> = {};
      for (const r of rateio) {
        const oId = r.obraId || 0;
        if (!porObra[oId]) porObra[oId] = {
          obraId: oId,
          nomeObra: r.nomeObra || "Sem Obra",
          codigoObra: r.codigoObra || "",
          sns: obraSnMap[oId] || (r.snRelogioPonto ? [r.snRelogioPonto] : []),
          funcionarios: [],
          totalHoras: "0:00",
          totalExtras: "0:00",
          totalDias: 0,
          snWarning: snWarnings[oId] || null,
        };
        porObra[oId].funcionarios.push(r);
        porObra[oId].totalDias += r.diasTrabalhados || 0;
      }
      return Object.values(porObra);
    }),

  // ===================== CONSOLIDAÇÃO MENSAL =====================
  getMonthStatuses: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ano: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const meses: Record<string, { status: 'vazio' | 'aberto' | 'consolidado'; totalRegistros: number; consolidadoPor?: string; consolidadoEm?: string }> = {};
      for (let m = 1; m <= 12; m++) {
        const mesRef = `${input.ano}-${String(m).padStart(2, '0')}`;
        meses[mesRef] = { status: 'vazio', totalRegistros: 0 };
      }
      // Check which months have data
      const monthCounts = await db.select({
        mesReferencia: timeRecords.mesReferencia,
        count: sql<number>`COUNT(*)`,
      }).from(timeRecords)
        .where(and(
          eq(timeRecords.companyId, input.companyId),
          like(timeRecords.mesReferencia, `${input.ano}-%`),
        ))
        .groupBy(timeRecords.mesReferencia);
      for (const mc of monthCounts) {
        const mesKey = mc.mesReferencia || '';
        if (meses[mesKey]) {
          meses[mesKey].status = 'aberto';
          meses[mesKey].totalRegistros = Number(mc.count);
        }
      }
      // Check consolidation status
      const consolidacoes = await db.select().from(pontoConsolidacao)
        .where(and(
          eq(pontoConsolidacao.companyId, input.companyId),
          like(pontoConsolidacao.mesReferencia, `${input.ano}-%`),
        ));
      for (const c of consolidacoes) {
        if (meses[c.mesReferencia] && c.status === 'consolidado') {
          meses[c.mesReferencia].status = 'consolidado';
          meses[c.mesReferencia].consolidadoPor = c.consolidadoPor || undefined;
          meses[c.mesReferencia].consolidadoEm = c.consolidadoEm || undefined;
        }
      }
      return meses;
    }),

  consolidarMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Check if there are pending inconsistencies
      const [pendingIncons] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeInconsistencies)
        .where(and(
          eq(timeInconsistencies.companyId, input.companyId),
          eq(timeInconsistencies.mesReferencia, input.mesReferencia),
          eq(timeInconsistencies.status, 'pendente'),
        ));
      if (Number(pendingIncons?.count || 0) > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Existem ${pendingIncons?.count} inconsistências pendentes. Resolva todas antes de consolidar o mês.`,
        });
      }
      // Check if already consolidated
      const existing = await db.select().from(pontoConsolidacao)
        .where(and(
          eq(pontoConsolidacao.companyId, input.companyId),
          eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
        )).limit(1);
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      if (existing.length > 0) {
        await db.update(pontoConsolidacao).set({
          status: 'consolidado',
          consolidadoPor: ctx.user?.name || 'RH',
          consolidadoEm: now,
          observacoes: input.observacoes || null,
        }).where(eq(pontoConsolidacao.id, existing[0].id));
      } else {
        await db.insert(pontoConsolidacao).values({
          companyId: input.companyId,
          mesReferencia: input.mesReferencia,
          status: 'consolidado',
          consolidadoPor: ctx.user?.name || 'RH',
          consolidadoEm: now,
          observacoes: input.observacoes || null,
        });
      }
      return { success: true, consolidadoPor: ctx.user?.name || 'RH', consolidadoEm: now };
    }),

  desconsolidarMes: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o Admin Master pode desconsolidar um mês.' });
      }
      const db = (await getDb())!;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await db.update(pontoConsolidacao).set({
        status: 'aberto',
        desconsolidadoPor: ctx.user?.name || 'Admin',
        desconsolidadoEm: now,
      }).where(and(
        eq(pontoConsolidacao.companyId, input.companyId),
        eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
      ));
      return { success: true };
    }),

  getConsolidacaoStatus: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(pontoConsolidacao)
        .where(and(
          eq(pontoConsolidacao.companyId, input.companyId),
          eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
        )).limit(1);
      if (rows.length === 0) return { consolidado: false };
      return {
        consolidado: rows[0].status === 'consolidado',
        consolidadoPor: rows[0].consolidadoPor,
        consolidadoEm: rows[0].consolidadoEm,
        desconsolidadoPor: rows[0].desconsolidadoPor,
        desconsolidadoEm: rows[0].desconsolidadoEm,
      };
    }),

  // ===================== CONFLITOS OBRA/DIA =====================
  getConflitosObraDia: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Find employees with records in multiple obras on the same day
      const conditions: any[] = [
        eq(timeRecords.companyId, input.companyId),
        eq(timeRecords.mesReferencia, input.mesReferencia),
      ];
      if (input.employeeId) conditions.push(eq(timeRecords.employeeId, input.employeeId));

      const recs = await db.select({
        employeeId: timeRecords.employeeId,
        employeeName: employees.nomeCompleto,
        data: timeRecords.data,
        obraId: timeRecords.obraId,
        obraNome: obras.nome,
        entrada1: timeRecords.entrada1,
        saida2: timeRecords.saida2,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
      })
        .from(timeRecords)
        .leftJoin(employees, eq(timeRecords.employeeId, employees.id))
        .leftJoin(obras, eq(timeRecords.obraId, obras.id))
        .where(and(...conditions))
        .orderBy(sql`${timeRecords.employeeId} ASC, ${timeRecords.data} ASC`);

      // Group by employee+date and find conflicts
      const byEmpDate: Record<string, Array<{ obraId: number | null; obraNome: string | null; horasTrabalhadas: string | null; entrada1: string | null; saida2: string | null }>> = {};
      const empNames: Record<number, string> = {};
      for (const r of recs) {
        const key = `${r.employeeId}|${r.data}`;
        if (!byEmpDate[key]) byEmpDate[key] = [];
        byEmpDate[key].push({ obraId: r.obraId, obraNome: r.obraNome, horasTrabalhadas: r.horasTrabalhadas, entrada1: r.entrada1, saida2: r.saida2 });
        if (r.employeeName) empNames[r.employeeId] = r.employeeName;
      }

      const conflitos: Array<{
        employeeId: number;
        employeeName: string;
        data: string;
        obras: Array<{ obraId: number | null; obraNome: string | null; horasTrabalhadas: string | null }>;
      }> = [];

      for (const [key, entries] of Object.entries(byEmpDate)) {
        if (entries.length > 1) {
          // Multiple obras on same day = conflict
          const obraIds = new Set(entries.map(e => e.obraId));
          if (obraIds.size > 1) {
            const [empId, data] = key.split('|');
            conflitos.push({
              employeeId: Number(empId),
              employeeName: empNames[Number(empId)] || 'Desconhecido',
              data,
              obras: entries,
            });
          }
        }
      }

      return conflitos;
    }),

  // ===================== VALIDAR SN ANTES DO UPLOAD =====================
  validateSN: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      files: z.array(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const devices = await db.select().from(dixiDevices).where(eq(dixiDevices.companyId, input.companyId));
      // Get active SNs from obra_sns table
      const activeSns = await db.select({
        sn: obraSns.sn,
        obraId: obraSns.obraId,
        obraNome: obras.nome,
      }).from(obraSns)
        .leftJoin(obras, eq(obraSns.obraId, obras.id))
        .where(and(eq(obraSns.companyId, input.companyId), eq(obraSns.status, "ativo")));
      const obrasList = await db.select({
        id: obras.id,
        nome: obras.nome,
        snRelogioPonto: obras.snRelogioPonto,
      }).from(obras).where(eq(obras.companyId, input.companyId));

      const results: Array<{
        fileName: string;
        deviceSerial: string;
        obraId: number | null;
        obraNome: string;
        valid: boolean;
        totalRecords: number;
        mesesDetectados: string[];
        error?: string;
      }> = [];

      for (const file of input.files) {
        const buffer = Buffer.from(file.fileBase64, "base64");
        const { records, deviceSerial } = parseDixiXLS(buffer);

        if (!deviceSerial) {
          results.push({
            fileName: file.fileName, deviceSerial: "", obraId: null, obraNome: "",
            valid: false, totalRecords: records.length, mesesDetectados: [],
            error: "Não foi possível identificar o SN do equipamento neste arquivo.",
          });
          continue;
        }

        // Find obra by SN
        let obraId: number | null = null;
        let obraNome = "";

        // 1. Check obra_sns table (primary)
        const snMatch = activeSns.find(s => s.sn === deviceSerial);
        if (snMatch) {
          obraId = snMatch.obraId;
          obraNome = snMatch.obraNome || "";
        }

        // 2. Fallback: dixi_devices
        if (!obraId) {
          const device = devices.find(d => d.serialNumber === deviceSerial);
          if (device && device.obraId) {
            obraId = device.obraId;
            const obra = obrasList.find(o => o.id === device.obraId);
            if (obra) obraNome = obra.nome;
          }
        }

        // 3. Fallback: legacy obras.snRelogioPonto
        if (!obraId) {
          const obra = obrasList.find(o => o.snRelogioPonto === deviceSerial);
          if (obra) { obraId = obra.id; obraNome = obra.nome; }
        }

        // Detect months in file
        const meses = new Set<string>();
        for (const r of records) {
          if (r.data) meses.add(dateToMesRef(r.data));
        }

        results.push({
          fileName: file.fileName,
          deviceSerial,
          obraId,
          obraNome,
          valid: obraId !== null,
          totalRecords: records.length,
          mesesDetectados: Array.from(meses).sort(),
          error: obraId ? undefined : `SN "${deviceSerial}" não está vinculado a nenhuma obra. Cadastre o SN na aba de Obras antes de fazer o upload.`,
        });
      }

      return {
        allValid: results.every(r => r.valid),
        results,
      };
    }),

  // ===================== RESOLVER CONFLITO DE OBRA/DIA =====================
  resolveConflito: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      employeeId: z.number(),
      data: z.string(), // YYYY-MM-DD
      acao: z.enum(["manter_obra", "confirmar_deslocamento", "excluir_registro"]),
      obraIdManter: z.number().optional(), // para manter_obra: qual obra manter
      obraIdExcluir: z.number().optional(), // para excluir_registro: qual registro excluir
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Verificar consolidação
      const mesRef = input.data.substring(0, 7);
      const consolidacao = await db.select().from(pontoConsolidacao)
        .where(and(
          eq(pontoConsolidacao.companyId, input.companyId),
          eq(pontoConsolidacao.mesReferencia, mesRef),
          eq(pontoConsolidacao.status, "consolidado"),
        )).limit(1);
      if (consolidacao.length > 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Mês consolidado. Não é possível alterar registros.' });
      }

      const resolvidoPor = ctx.user?.name || "RH";

      if (input.acao === "manter_obra" && input.obraIdManter) {
        // Excluir registros de OUTRAS obras neste dia para este funcionário
        await db.delete(timeRecords).where(and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.data, input.data),
          sql`${timeRecords.obraId} != ${input.obraIdManter}`,
        ));
        // Registrar justificativa no registro mantido
        if (input.justificativa) {
          await db.update(timeRecords)
            .set({ justificativa: `[Conflito resolvido por ${resolvidoPor}] ${input.justificativa}` })
            .where(and(
              eq(timeRecords.companyId, input.companyId),
              eq(timeRecords.employeeId, input.employeeId),
              eq(timeRecords.data, input.data),
              eq(timeRecords.obraId, input.obraIdManter),
            ));
        }
        return { success: true, message: `Registros de outras obras removidos. Mantido na obra selecionada.` };
      }

      if (input.acao === "confirmar_deslocamento") {
        // Marcar todos os registros deste dia com justificativa de deslocamento confirmado
        await db.update(timeRecords)
          .set({ justificativa: `[Deslocamento confirmado por ${resolvidoPor}] ${input.justificativa || "Deslocamento real entre obras"}` })
          .where(and(
            eq(timeRecords.companyId, input.companyId),
            eq(timeRecords.employeeId, input.employeeId),
            eq(timeRecords.data, input.data),
          ));
        return { success: true, message: `Deslocamento entre obras confirmado e registrado.` };
      }

      if (input.acao === "excluir_registro" && input.obraIdExcluir) {
        // Excluir registro específico de uma obra
        await db.delete(timeRecords).where(and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.data, input.data),
          eq(timeRecords.obraId, input.obraIdExcluir),
        ));
        return { success: true, message: `Registro da obra removido (erro de lançamento).` };
      }

      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ação inválida ou parâmetros faltando.' });
    }),
});
