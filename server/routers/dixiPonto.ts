import { router, protectedProcedure } from "../_core/trpc";
import { getDb, detectarInconsistenciaPonto } from "../db";
import {
  dixiAfdImportacoes, dixiAfdMarcacoes, employees, obras, obraSns, dixiDevices,
  timeRecords, timeInconsistencies, unmatchedDixiRecords, dixiNameMappings,
  obraHorasRateio, systemCriteria, terminationNotices, obraFuncionarios,
} from "../../drizzle/schema";
import { eq, and, sql, desc, inArray, isNull, like, or, between } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// ============================================================
// AFD PARSER - Portaria 671
// ============================================================
interface AFDHeader {
  sn: string;
  cnpj: string;
  cno: string;
  razaoSocial: string;
  dataInicio: string;
  dataFim: string;
  totalRegistros: number;
}

interface AFDMarcacao {
  nsr: string;
  data: string;     // YYYY-MM-DD
  hora: string;     // HH:MM
  cpf: string;
}

function parseAFD(content: string): { header: AFDHeader; marcacoes: AFDMarcacao[] } | null {
  try {
    const lines = content.split("\n").filter(l => l.trim().length > 0);
    if (lines.length < 2) return null;

    // Registro Tipo 1: Cabeçalho
    const headerLine = lines[0];
    let sn = "", cnpj = "", cno = "", razaoSocial = "";

    if (headerLine.length >= 140) {
      const tipoReg = headerLine.substring(9, 10);
      if (tipoReg === "1") {
        cnpj = headerLine.substring(11, 25).trim();
        cno = headerLine.substring(25, 39).trim();
        razaoSocial = headerLine.substring(39, 139).trim();
        sn = headerLine.substring(139, 156).trim();
      }
    }

    // Fallback: tentar encontrar SN em formato REP + dígitos
    if (!sn) {
      const snMatch = headerLine.match(/REP\d{5,}/);
      if (snMatch) sn = snMatch[0];
    }

    // Fallback 2: tentar encontrar qualquer sequência alfanumérica longa na posição esperada
    if (!sn && headerLine.length > 139) {
      const possibleSn = headerLine.substring(139, 160).trim().replace(/\s+/g, '');
      if (possibleSn.length >= 5) sn = possibleSn;
    }

    // Registro Tipo 3: Marcações de ponto
    const marcacoes: AFDMarcacao[] = [];
    let dataInicio = "", dataFim = "";

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length < 34) continue;

      const tipoReg = line.substring(9, 10);
      if (tipoReg === "3") {
        const nsr = line.substring(0, 9).trim();
        const dataRaw = line.substring(10, 18); // DDMMAAAA
        const horaRaw = line.substring(18, 22); // HHMM
        const cpfRaw = line.substring(22, 34).trim();

        // Converter DDMMAAAA para YYYY-MM-DD
        const dia = dataRaw.substring(0, 2);
        const mes = dataRaw.substring(2, 4);
        const ano = dataRaw.substring(4, 8);
        const dataFormatada = `${ano}-${mes}-${dia}`;

        // Converter HHMM para HH:MM
        const horaFormatada = `${horaRaw.substring(0, 2)}:${horaRaw.substring(2, 4)}`;

        const dataLegivel = `${dia}/${mes}/${ano}`;
        if (!dataInicio) dataInicio = dataLegivel;
        dataFim = dataLegivel;

        // Limpar CPF (remover zeros à esquerda extras, manter 11 dígitos)
        const cpfLimpo = cpfRaw.replace(/^0+/, '').padStart(11, '0');

        marcacoes.push({
          nsr,
          data: dataFormatada,
          hora: horaFormatada,
          cpf: cpfLimpo,
        });
      }
    }

    // Registro Tipo 9: Trailer (validação)
    const lastLine = lines[lines.length - 1];
    let totalRegistrosTrailer = 0;
    if (lastLine.length >= 35 && lastLine.substring(9, 10) === "9") {
      totalRegistrosTrailer = parseInt(lastLine.substring(26, 35).trim()) || 0;
    }

    return {
      header: {
        sn: sn || "DESCONHECIDO",
        cnpj, cno, razaoSocial,
        dataInicio, dataFim,
        totalRegistros: marcacoes.length,
      },
      marcacoes,
    };
  } catch {
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================
function formatCPF(cpf: string): string {
  const digits = cpf.replace(/\D/g, '').padStart(11, '0');
  return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`;
}

function normalizeCPF(cpf: string): string {
  return cpf.replace(/\D/g, '').padStart(11, '0');
}

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

function dateToMesRef(dateStr: string): string {
  return dateStr.substring(0, 7);
}

// ============================================================
// ROUTER
// ============================================================
export const dixiPontoRouter = router({

  // ===================== PREVIEW AFD =====================
  // Parse AFD file and return preview data without importing
  previewAFD: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), fileContent: z.string(), // text content of AFD file
      fileName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const parsed = parseAFD(input.fileContent);
      if (!parsed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo AFD inválido. Verifique se o arquivo está no formato correto da Portaria 671.",
        });
      }

      const { header, marcacoes } = parsed;

      // Check if SN is linked to an obra
      const db = (await getDb())!;
      let obraId: number | null = null;
      let obraNome = "";

      // 1. Check obra_sns table
      const activeSns = await db.select({
        sn: obraSns.sn,
        obraId: obraSns.obraId,
        obraNome: obras.nome,
      }).from(obraSns)
        .leftJoin(obras, eq(obraSns.obraId, obras.id))
        .where(and(companyFilter(obraSns.companyId, input), eq(obraSns.status, "ativo")));

      const snMatch = activeSns.find(s => s.sn === header.sn);
      if (snMatch) {
        obraId = snMatch.obraId;
        obraNome = snMatch.obraNome || "";
      }

      // 2. Fallback: dixi_devices
      if (!obraId) {
        const devices = await db.select().from(dixiDevices).where(companyFilter(dixiDevices.companyId, input));
        const device = devices.find(d => d.serialNumber === header.sn);
        if (device && device.obraId) {
          obraId = device.obraId;
          const obra = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, device.obraId));
          if (obra[0]) obraNome = obra[0].nome;
        }
      }

      // 3. Fallback: obras.snRelogioPonto
      if (!obraId) {
        const obrasList = await db.select({ id: obras.id, nome: obras.nome, snRelogioPonto: obras.snRelogioPonto })
          .from(obras)
          .where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));
        const obra = obrasList.find(o => o.snRelogioPonto === header.sn);
        if (obra) {
          obraId = obra.id;
          obraNome = obra.nome;
        }
      }

      // Count unique CPFs
      const cpfSet = Array.from(new Set(marcacoes.map(m => m.cpf)));

      // Get employees to match CPFs
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
      }).from(employees).where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

      // Match CPFs to employees
      const cpfToEmployee: Record<string, { id: number; nome: string } | null> = {};
      let matchedCount = 0;
      let unmatchedCpfs: string[] = [];

      for (const cpf of cpfSet) {
        const normalizedCpf = normalizeCPF(cpf);
        const emp = empList.find(e => {
          if (!e.cpf) return false;
          return normalizeCPF(e.cpf) === normalizedCpf;
        });
        if (emp) {
          cpfToEmployee[cpf] = { id: emp.id, nome: emp.nomeCompleto };
          matchedCount++;
        } else {
          cpfToEmployee[cpf] = null;
          unmatchedCpfs.push(formatCPF(normalizedCpf));
        }
      }

      // Get first 20 marcações for preview
      const previewMarcacoes = marcacoes.slice(0, 20).map(m => ({
        nsr: m.nsr,
        data: m.data,
        hora: m.hora,
        cpf: formatCPF(normalizeCPF(m.cpf)),
        funcionario: cpfToEmployee[m.cpf]?.nome || "NÃO ENCONTRADO",
        status: cpfToEmployee[m.cpf] ? "ok" : "cpf_nao_encontrado",
      }));

      // Detect date range
      const datas = marcacoes.map(m => m.data).sort();
      const mesesDetectados = Array.from(new Set(datas.map(d => d.substring(0, 7)))).sort();

      return {
        header: {
          ...header,
          snVinculado: !!obraId,
          obraId,
          obraNome,
        },
        resumo: {
          totalMarcacoes: marcacoes.length,
          totalFuncionarios: cpfSet.length,
          funcionariosIdentificados: matchedCount,
          funcionariosNaoIdentificados: unmatchedCpfs.length,
          cpfsNaoEncontrados: unmatchedCpfs,
          mesesDetectados,
          dataInicio: datas[0] || "",
          dataFim: datas[datas.length - 1] || "",
        },
        previewMarcacoes,
        fileName: input.fileName,
      };
    }),

  // ===================== IMPORTAR AFD =====================
  importAFD: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), fileContent: z.string(),
      fileName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const parsed = parseAFD(input.fileContent);
      if (!parsed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo AFD inválido.",
        });
      }

      const { header, marcacoes } = parsed;
      const db = (await getDb())!;

      // ===== VALIDAR SN =====
      let obraId: number | null = null;
      let obraNome = "";

      const activeSns = await db.select({
        sn: obraSns.sn, obraId: obraSns.obraId, obraNome: obras.nome,
      }).from(obraSns)
        .leftJoin(obras, eq(obraSns.obraId, obras.id))
        .where(and(companyFilter(obraSns.companyId, input), eq(obraSns.status, "ativo")));

      const snMatch = activeSns.find(s => s.sn === header.sn);
      if (snMatch) { obraId = snMatch.obraId; obraNome = snMatch.obraNome || ""; }

      if (!obraId) {
        const devices = await db.select().from(dixiDevices).where(companyFilter(dixiDevices.companyId, input));
        const device = devices.find(d => d.serialNumber === header.sn);
        if (device?.obraId) {
          obraId = device.obraId;
          const obra = await db.select({ nome: obras.nome }).from(obras).where(eq(obras.id, device.obraId));
          if (obra[0]) obraNome = obra[0].nome;
        }
      }

      if (!obraId) {
        const obrasList = await db.select({ id: obras.id, nome: obras.nome, snRelogioPonto: obras.snRelogioPonto })
          .from(obras).where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));
        const obra = obrasList.find(o => o.snRelogioPonto === header.sn);
        if (obra) { obraId = obra.id; obraNome = obra.nome; }
      }

      if (!obraId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `O SN "${header.sn}" não está vinculado a nenhuma obra cadastrada. Cadastre o SN na aba de Relógios/Obras antes de importar.`,
        });
      }

      // ===== BUSCAR FUNCIONÁRIOS POR CPF =====
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        jornadaTrabalho: employees.jornadaTrabalho,
        matricula: employees.matricula,
      }).from(employees).where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

      // Build CPF lookup map
      const cpfMap: Record<string, typeof empList[0]> = {};
      for (const emp of empList) {
        if (emp.cpf) {
          cpfMap[normalizeCPF(emp.cpf)] = emp;
        }
      }

      // ===== BUSCAR CRITÉRIOS =====
      const criteriaRows = await db.select().from(systemCriteria).where(companyFilter(systemCriteria.companyId, input));
      const criteriaMap: Record<string, string> = {};
      for (const c of criteriaRows) { criteriaMap[c.chave] = c.valor; }
      const tolAtraso = parseInt(criteriaMap['ponto_tolerancia_atraso'] || '10');
      const tolSaida = parseInt(criteriaMap['ponto_tolerancia_saida'] || '10');
      const faltaApos = parseInt(criteriaMap['ponto_falta_apos_atraso'] || '120');

      // ===== AGRUPAR MARCAÇÕES POR CPF+DIA =====
      const grouped: Record<string, Record<string, string[]>> = {};
      const cpfToName: Record<string, string> = {};

      for (const m of marcacoes) {
        const cpfNorm = normalizeCPF(m.cpf);
        if (!grouped[cpfNorm]) grouped[cpfNorm] = {};
        if (!grouped[cpfNorm][m.data]) grouped[cpfNorm][m.data] = [];
        grouped[cpfNorm][m.data].push(m.hora);
        if (!cpfToName[cpfNorm]) cpfToName[cpfNorm] = formatCPF(cpfNorm);
      }

      // ===== PROCESSAR REGISTROS =====
      const timeRecordsToInsert: any[] = [];
      const inconsistenciesToInsert: any[] = [];
      const afdMarcacoesToInsert: any[] = [];
      let unmatchedCpfs: string[] = [];
      const mesesAfetados = new Set<string>();

      // Create import log first
      const [importLog] = await db.insert(dixiAfdImportacoes).values({
        companyId: input.companyId,
        metodo: 'AFD',
        arquivoNome: input.fileName,
        snRelogio: header.sn,
        obraId,
        obraNome,
        totalMarcacoes: marcacoes.length,
        totalFuncionarios: 0,
        totalInconsistencias: 0,
        periodoInicio: header.dataInicio,
        periodoFim: header.dataFim,
        status: 'sucesso',
        importadoPor: ctx.user?.name || 'Sistema',
      });

      // Get the inserted ID
      const [lastInsert] = await db.select({ id: dixiAfdImportacoes.id })
        .from(dixiAfdImportacoes)
        .where(and(
          companyFilter(dixiAfdImportacoes.companyId, input),
          eq(dixiAfdImportacoes.arquivoNome, input.fileName),
        ))
        .orderBy(desc(dixiAfdImportacoes.id))
        .limit(1);
      const importacaoId = lastInsert.id;

      // Insert raw AFD marcações
      for (const m of marcacoes) {
        const cpfNorm = normalizeCPF(m.cpf);
        const emp = cpfMap[cpfNorm];
        afdMarcacoesToInsert.push({
          companyId: input.companyId,
          importacaoId,
          nsr: m.nsr,
          cpf: cpfNorm,
          data: m.data,
          hora: m.hora,
          snRelogio: header.sn,
          obraId,
          employeeId: emp?.id || null,
          employeeName: emp?.nomeCompleto || null,
          status: emp ? 'processado' : 'cpf_nao_encontrado',
        });
      }

      // Insert raw marcações in batches
      if (afdMarcacoesToInsert.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < afdMarcacoesToInsert.length; i += batchSize) {
          const batch = afdMarcacoesToInsert.slice(i, i + batchSize);
          await db.insert(dixiAfdMarcacoes).values(batch);
        }
      }

      // Process grouped records (by CPF + day)
      for (const [cpfNorm, days] of Object.entries(grouped)) {
        const emp = cpfMap[cpfNorm];

        if (!emp) {
          unmatchedCpfs.push(formatCPF(cpfNorm));
          // Create inconsistency for unmatched CPF
          for (const [data, horas] of Object.entries(days)) {
            const mesRef = dateToMesRef(data);
            mesesAfetados.add(mesRef);
            inconsistenciesToInsert.push({
              companyId: input.companyId,
              employeeId: null,
              obraId,
              mesReferencia: mesRef,
              data,
              tipoInconsistencia: 'cpf_nao_encontrado' as const,
              descricao: `CPF ${formatCPF(cpfNorm)} não encontrado no cadastro de funcionários. ${horas.length} marcação(ões) no dia.`,
              status: 'pendente' as const,
            });
          }
          continue;
        }

        for (const [data, horas] of Object.entries(days)) {
          horas.sort();
          const mesRef = dateToMesRef(data);
          mesesAfetados.add(mesRef);

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

          const entrada1 = filtered[0] || "";
          const saida1 = filtered[1] || "";
          const entrada2 = filtered[2] || "";
          const saida2 = filtered[3] || "";
          const entrada3 = filtered[4] || "";
          const saida3 = filtered[5] || "";

          let totalMinutes = 0;
          if (entrada1 && saida1) totalMinutes += diffMinutes(entrada1, saida1);
          if (entrada2 && saida2) totalMinutes += diffMinutes(entrada2, saida2);
          if (entrada3 && saida3) totalMinutes += diffMinutes(entrada3, saida3);

          let expectedMinutes = 480;
          let isDiaFolga = false;
          if (emp.jornadaTrabalho) {
            try {
              const jornada = typeof emp.jornadaTrabalho === "string" ? JSON.parse(emp.jornadaTrabalho) : emp.jornadaTrabalho;
              const dayOfWeek = new Date(data + "T12:00:00").getDay();
              const dayMap: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
              const dayKey = dayMap[dayOfWeek];
              if (jornada[dayKey] && jornada[dayKey].entrada && jornada[dayKey].saida) {
                const j = jornada[dayKey];
                const totalJornada = diffMinutes(j.entrada, j.saida);
                let intervaloMin = 60;
                if (j.intervalo) {
                  const parts = j.intervalo.split(":");
                  if (parts.length === 2) intervaloMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                }
                expectedMinutes = totalJornada - intervaloMin;
              } else {
                expectedMinutes = 0;
                isDiaFolga = true;
              }
            } catch { /* use default */ }
          }

          const diffBruto = totalMinutes - expectedMinutes;
          let horasExtras = 0;
          let atrasos = 0;
          let faltas = "0";

          if (isDiaFolga && totalMinutes > 0) {
            horasExtras = totalMinutes;
          } else if (diffBruto > 0) {
            horasExtras = diffBruto > tolSaida ? diffBruto : 0;
          } else if (diffBruto < 0 && totalMinutes > 0) {
            const atrasoReal = Math.abs(diffBruto);
            if (atrasoReal >= faltaApos) {
              faltas = "1";
            } else if (atrasoReal > tolAtraso) {
              atrasos = atrasoReal;
            }
          }

          const isOddPunches = filtered.length % 2 !== 0;

          timeRecordsToInsert.push({
            companyId: input.companyId,
            employeeId: emp.id,
            obraId,
            mesReferencia: mesRef,
            data,
            entrada1, saida1, entrada2, saida2, entrada3, saida3,
            horasTrabalhadas: minutesToHHMM(totalMinutes),
            horasExtras: horasExtras > 0 ? minutesToHHMM(horasExtras) : "0:00",
            horasNoturnas: "0:00",
            faltas,
            atrasos: atrasos > 0 ? minutesToHHMM(atrasos) : "0:00",
            fonte: "dixi",
            ajusteManual: 0,
            batidasBrutas: JSON.stringify(filtered),
          });

          if (isOddPunches) {
            inconsistenciesToInsert.push({
              companyId: input.companyId,
              employeeId: emp.id,
              obraId,
              mesReferencia: mesRef,
              data,
              tipoInconsistencia: "batida_impar" as const,
              descricao: `${filtered.length} batida(s) - número ímpar indica falta de entrada ou saída`,
              status: "pendente" as const,
            });
          }
        }
      }

      // ===== INSERIR REGISTROS NO BANCO =====
      // Delete existing DIXI records for affected months/obra
      for (const mesRef of Array.from(mesesAfetados)) {
        await db.delete(timeRecords).where(
          and(
            companyFilter(timeRecords.companyId, input),
            eq(timeRecords.mesReferencia, mesRef),
            eq(timeRecords.obraId, obraId!),
            eq(timeRecords.fonte, "dixi"),
          )
        );
        await db.delete(timeInconsistencies).where(
          and(
            companyFilter(timeInconsistencies.companyId, input),
            eq(timeInconsistencies.mesReferencia, mesRef),
            eq(timeInconsistencies.obraId, obraId!),
          )
        );
      }

      // Insert time records
      if (timeRecordsToInsert.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < timeRecordsToInsert.length; i += batchSize) {
          await db.insert(timeRecords).values(timeRecordsToInsert.slice(i, i + batchSize));
        }
      }

      // Insert inconsistencies
      if (inconsistenciesToInsert.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < inconsistenciesToInsert.length; i += batchSize) {
          await db.insert(timeInconsistencies).values(inconsistenciesToInsert.slice(i, i + batchSize));
        }
      }

      // ===== RATEIO POR OBRA =====
      for (const mesRef of Array.from(mesesAfetados)) {
        await db.delete(obraHorasRateio).where(
          and(
            companyFilter(obraHorasRateio.companyId, input),
            eq(obraHorasRateio.mesAno, mesRef),
            eq(obraHorasRateio.obraId, obraId!),
          )
        );

        const mesRecords = timeRecordsToInsert.filter(r => r.mesReferencia === mesRef);
        const empIds = Array.from(new Set(mesRecords.map(r => r.employeeId)));

        const rateioByEmp: Record<number, { horasNormais: number; horasExtras: number; totalHoras: number; dias: number }> = {};
        for (const rec of mesRecords) {
          if (!rateioByEmp[rec.employeeId]) rateioByEmp[rec.employeeId] = { horasNormais: 0, horasExtras: 0, totalHoras: 0, dias: 0 };
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

      // ===== DETECTAR INCONSISTÊNCIAS PONTO x OBRA (alocação principal) =====
      // Para cada funcionário que bateu ponto nesta obra, verificar se é a obra principal dele
      const uniqueEmpIds = Array.from(new Set(timeRecordsToInsert.map(r => r.employeeId)));
      let obraInconsistenciasCount = 0;
      if (obraId && uniqueEmpIds.length > 0) {
        // Buscar alocações ativas dos funcionários
        const alocacoes = await db.select({
          employeeId: obraFuncionarios.employeeId,
          obraId: obraFuncionarios.obraId,
        }).from(obraFuncionarios)
          .where(and(
            companyFilter(obraFuncionarios.companyId, input),
            eq(obraFuncionarios.isActive, 1),
            sql`${obraFuncionarios.employeeId} IN (${sql.raw(uniqueEmpIds.join(","))})`,
          ));
        const alocMap = Object.fromEntries(alocacoes.map(a => [a.employeeId, a.obraId]));
        // Agrupar datas por funcionário
        const empDatas: Record<number, Set<string>> = {};
        for (const rec of timeRecordsToInsert) {
          if (!empDatas[rec.employeeId]) empDatas[rec.employeeId] = new Set();
          empDatas[rec.employeeId].add(rec.data);
        }
        for (const empId of uniqueEmpIds) {
          const obraAlocada = alocMap[empId];
          // Se funcionário tem obra alocada diferente da obra do ponto, ou não tem obra alocada
          if (obraAlocada && obraAlocada !== obraId) {
            const datas = empDatas[empId];
            if (datas) {
              for (const dataPonto of Array.from(datas)) {
                await detectarInconsistenciaPonto({
                  companyId: input.companyId,
                  employeeId: empId,
                  obraPontoId: obraId,
                  dataPonto,
                  snRelogio: header.sn,
                });
                obraInconsistenciasCount++;
              }
            }
          }
        }
      }

      // ===== ATUALIZAR LOG DE IMPORTAÇÃO =====
      const uniqueEmployees = new Set(timeRecordsToInsert.map(r => r.employeeId));
      await db.update(dixiAfdImportacoes).set({
        totalFuncionarios: uniqueEmployees.size,
        totalInconsistencias: inconsistenciesToInsert.length,
        status: inconsistenciesToInsert.length > 0 ? 'parcial' : 'sucesso',
        detalhes: {
          mesesAfetados: Array.from(mesesAfetados),
          totalDiasProcessados: timeRecordsToInsert.length,
          cpfsNaoEncontrados: unmatchedCpfs,
        },
      }).where(eq(dixiAfdImportacoes.id, importacaoId));

      return {
        success: true,
        importacaoId,
        totalMarcacoes: marcacoes.length,
        totalDiasProcessados: timeRecordsToInsert.length,
        totalFuncionarios: uniqueEmployees.size,
        totalInconsistencias: inconsistenciesToInsert.length,
        cpfsNaoEncontrados: unmatchedCpfs,
        mesesAfetados: Array.from(mesesAfetados).sort(),
        obraNome,
        snRelogio: header.sn,
        obraInconsistencias: obraInconsistenciasCount,
      };
    }),

  // ===================== HISTÓRICO DE IMPORTAÇÕES =====================
  listImportacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return db.select().from(dixiAfdImportacoes)
        .where(companyFilter(dixiAfdImportacoes.companyId, input))
        .orderBy(desc(dixiAfdImportacoes.dataImportacao));
    }),

  // ===================== MARCAÇÕES AFD (BRUTAS) =====================
  listMarcacoes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), importacaoId: z.number().optional(),
      data: z.string().optional(),
      cpf: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [companyFilter(dixiAfdMarcacoes.companyId, input)];
      if (input.importacaoId) conditions.push(eq(dixiAfdMarcacoes.importacaoId, input.importacaoId));
      if (input.data) conditions.push(eq(dixiAfdMarcacoes.data, input.data));
      if (input.cpf) conditions.push(eq(dixiAfdMarcacoes.cpf, normalizeCPF(input.cpf)));

      return db.select().from(dixiAfdMarcacoes)
        .where(and(...conditions))
        .orderBy(desc(dixiAfdMarcacoes.data), dixiAfdMarcacoes.hora);
    }),

  // ===================== DASHBOARD STATS =====================
  dashboardStats: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;

      // Total obras ativas
      const obrasAtivas = await db.select({ count: sql<number>`count(*)` })
        .from(obras)
        .where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`, sql`${obras.status} = 'Em_Andamento'`));

      // Total relógios (SNs ativos)
      const relogios = await db.select({ count: sql<number>`count(*)` })
        .from(obraSns)
        .where(and(companyFilter(obraSns.companyId, input), eq(obraSns.status, 'ativo')));

      // Total funcionários ativos
      const funcs = await db.select({ count: sql<number>`count(*)` })
        .from(employees)
        .where(and(companyFilter(employees.companyId, input), sql`${employees.deletedAt} IS NULL`));

      // Total importações
      const imports = await db.select({ count: sql<number>`count(*)` })
        .from(dixiAfdImportacoes)
        .where(companyFilter(dixiAfdImportacoes.companyId, input));

      // Última importação
      const lastImport = await db.select()
        .from(dixiAfdImportacoes)
        .where(companyFilter(dixiAfdImportacoes.companyId, input))
        .orderBy(desc(dixiAfdImportacoes.dataImportacao))
        .limit(1);

      // Inconsistências pendentes
      const pendentes = await db.select({ count: sql<number>`count(*)` })
        .from(timeInconsistencies)
        .where(and(
          companyFilter(timeInconsistencies.companyId, input),
          eq(timeInconsistencies.status, 'pendente'),
        ));

      // Total marcações AFD
      const totalMarcacoes = await db.select({ count: sql<number>`count(*)` })
        .from(dixiAfdMarcacoes)
        .where(companyFilter(dixiAfdMarcacoes.companyId, input));

      return {
        obrasAtivas: obrasAtivas[0]?.count || 0,
        relogios: relogios[0]?.count || 0,
        funcionarios: funcs[0]?.count || 0,
        totalImportacoes: imports[0]?.count || 0,
        totalMarcacoes: totalMarcacoes[0]?.count || 0,
        inconsistenciasPendentes: pendentes[0]?.count || 0,
        ultimaImportacao: lastImport[0] || null,
      };
    }),

  // ===================== DELETE IMPORTAÇÃO =====================
  deleteImportacao: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Delete associated marcações
      await db.delete(dixiAfdMarcacoes).where(
        and(eq(dixiAfdMarcacoes.importacaoId, input.id), companyFilter(dixiAfdMarcacoes.companyId, input))
      );
      // Delete import log
      await db.delete(dixiAfdImportacoes).where(
        and(eq(dixiAfdImportacoes.id, input.id), companyFilter(dixiAfdImportacoes.companyId, input))
      );
      return { success: true };
    }),
});
