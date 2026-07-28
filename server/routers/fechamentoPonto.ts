import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as XLSX from "xlsx";
import { getDb } from "../db";
import {
  timeRecords, timeInconsistencies, employees, obras, dixiDevices, warnings, obraHorasRateio, pontoConsolidacao, obraSns, systemCriteria, terminationNotices, unmatchedDixiRecords, dixiNameMappings, vacationPeriods, fieldNotes, atestados, feriados, obraFuncionarios, obraPontoInconsistencies, employeeSiteHistory
} from "../../drizzle/schema";
import { eq, and, sql, like, or, between, inArray, isNull } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";
import { parseBRL } from "../utils/parseBRL";
import { jornadaEfetiva, obraTemJornada, obraNaDataFromAlocacoes, type AlocacaoObra } from "../utils/jornadaObra";

// ============================================================
// HELPERS
// ============================================================
function lastDayOfMonth(mesRef: string): string {
  const [y, m] = mesRef.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${mesRef}-${String(lastDay).padStart(2, "0")}`;
}

// ============================================================
// CYCLE / DIA-CORTE HELPERS
// ============================================================
// Returns the company's `ponto_dia_corte` (1..28). Falls back to 15.
async function getDiaCorte(db: any, companyId: number): Promise<number> {
  try {
    const rows = ((await db.execute(sql`
      SELECT valor FROM system_criteria WHERE "companyId" = ${companyId} AND chave = 'ponto_dia_corte' LIMIT 1
    `)) as any).rows || [];
    if (rows.length === 0) return 15;
    const raw = String(rows[0].valor || '').replace(/[^0-9]/g, '');
    const n = parseInt(raw || '15', 10);
    if (!Number.isFinite(n)) return 15;
    return Math.min(28, Math.max(1, n));
  } catch { return 15; }
}

// Cycle range for a given competência YYYY-MM:
//   - dataInicioCiclo = day after diaCorte of prevMonth (rolls over to currentMonth/01
//     when prevMonth has fewer than diaCorte+1 days — e.g. Feb with diaCorte=28).
//   - dataFimCiclo    = (currentMonth, day = diaCorte). diaCorte is capped at 28
//     by getDiaCorte so this day always exists.
// "Escuro" = (currentMonth, day = diaCorte+1) → last day of month → belongs to NEXT competência.
function computeCicloRange(mesRef: string, diaCorte: number): { dataInicioCiclo: string; dataFimCiclo: string } {
  const [y, m] = mesRef.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  // Use JS Date with UTC and rollover to safely add 1 day to (prevYear, prevMonth, diaCorte).
  const inicioDate = new Date(Date.UTC(prevY, prevM - 1, diaCorte));
  inicioDate.setUTCDate(inicioDate.getUTCDate() + 1);
  const fimDate = new Date(Date.UTC(y, m - 1, diaCorte));
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  return { dataInicioCiclo: toIso(inicioDate), dataFimCiclo: toIso(fimDate) };
}

// Checks whether a *specific* date is within any consolidated cycle for the given company(ies).
// Used by all single-record write endpoints to enforce per-date locking instead of full-month locking.
async function isDateLocked(db: any, input: { companyId: number; companyIds?: number[] }, data: string): Promise<{ locked: boolean; mesReferencia?: string }> {
  const cids = resolveCompanyIds(input);
  const cidsSql = sql.join(cids.map(id => sql`${id}`), sql`,`);
  const rows = ((await db.execute(sql`
    SELECT "mesReferencia" FROM ponto_consolidacao
    WHERE "companyId" IN (${cidsSql})
      AND status = 'consolidado'
      AND "data_inicio_ciclo" IS NOT NULL AND "data_fim_ciclo" IS NOT NULL
      AND ${data}::date BETWEEN "data_inicio_ciclo" AND "data_fim_ciclo"
    LIMIT 1
  `)) as any).rows || [];
  if (rows.length === 0) return { locked: false };
  return { locked: true, mesReferencia: rows[0].mesReferencia };
}

// Throws if the given date falls inside a consolidated cycle.
async function assertDateNotLocked(db: any, input: { companyId: number; companyIds?: number[] }, data: string): Promise<void> {
  const { locked, mesReferencia } = await isDateLocked(db, input, data);
  if (locked) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Dia ${data} pertence ao ciclo consolidado de ${mesReferencia}. Desconsolide antes de alterar.`,
    });
  }
}

// Returns the list of locked date ranges that intersect [from, to] (inclusive).
async function getLockedRangesInWindow(db: any, input: { companyId: number; companyIds?: number[] }, from: string, to: string): Promise<Array<{ mesReferencia: string; dataInicioCiclo: string; dataFimCiclo: string }>> {
  const cids = resolveCompanyIds(input);
  const cidsSql = sql.join(cids.map(id => sql`${id}`), sql`,`);
  const rows = ((await db.execute(sql`
    SELECT "mesReferencia",
           "data_inicio_ciclo"::text AS "dataInicioCiclo",
           "data_fim_ciclo"::text AS "dataFimCiclo"
    FROM ponto_consolidacao
    WHERE "companyId" IN (${cidsSql})
      AND status = 'consolidado'
      AND "data_inicio_ciclo" IS NOT NULL AND "data_fim_ciclo" IS NOT NULL
      AND "data_fim_ciclo" >= ${from}::date
      AND "data_inicio_ciclo" <= ${to}::date
  `)) as any).rows || [];
  return rows as any[];
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

function hhmmToMins(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

// Returns expected NET work minutes for a given day from the employee's jornada JSON.
// horasTrabalhadas = sum of punch intervals (lunch gap excluded), so we also subtract
// the lunch break (intervalo) from the expected range to keep comparison consistent.
function getExpectedMinsFromJornada(jornadaTrabalho: string | null | undefined, dateStr: string): number | null {
  if (!jornadaTrabalho) return null;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const day = parsed[dayKey];
    if (!day?.entrada || !day?.saida) return 0;
    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    let expectedMins = toMins(day.saida) - toMins(day.entrada);
    if (day.intervalo) {
      const [ih, im] = day.intervalo.split(":").map(Number);
      expectedMins -= (ih || 0) * 60 + (im || 0);
    }
    return Math.max(0, expectedMins);
  } catch { return null; }
}

// Chave de AGRUPAMENTO por pessoa: preserva dígitos!
// O relógio pode ser configurado com códigos internos (ex: "jfc063", "jfc066").
// A normalização de nome (que remove dígitos) fazia "jfc063" e "jfc066" colidirem
// na MESMA chave "JFC", fundindo as batidas de funcionários diferentes num só.
function normalizeGroupKey(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

// ============================================================
// CRITÉRIOS DO SISTEMA - Helper para buscar critérios configurados
// ============================================================
interface CriteriaMap {
  // Horas Extras
  heDiasUteis: number;        // % HE dias úteis (padrão CLT: 50)
  heDomingosFeriados: number; // % HE domingos/feriados (padrão CLT: 100)
  heAdicionalNoturno: number; // % adicional noturno (padrão CLT: 20)
  heNoturnoInicio: string;    // Início horário noturno (padrão: 22:00)
  heNoturnoFim: string;       // Fim horário noturno (padrão: 05:00)
  heInterjornada: number;     // % HE interjornada (padrão: 50)
  heLimiteMensal: number;     // Limite máximo HE mensais (padrão: 44h)
  heBancoHoras: boolean;      // Empresa usa banco de horas
  // Jornada
  jornadaHorasDiarias: number;   // Horas diárias padrão (padrão: 8)
  jornadaHorasSemanais: number;  // Horas semanais (padrão: 44)
  jornadaIntervaloAlmoco: number; // Intervalo almoço em min (padrão: 60)
  jornadaSabadoTipo: string;     // compensado, meio_periodo, normal, folga
  // Ponto
  pontoToleranciaAtraso: number;  // Tolerância atraso entrada em min (padrão: 5 — Art. 58 §1º CLT)
  pontoToleranciaSaida: number;   // Tolerância saída antecipada em min (padrão: 5 — Art. 58 §1º CLT)
  pontoFaltaAposAtraso: number;   // Considerar falta após X min de atraso (padrão: 120)
  pontoHoraNoturnaReduzida: string; // Duração hora noturna reduzida (padrão: 52:30)
}

const DEFAULT_CRITERIA: CriteriaMap = {
  heDiasUteis: 50,
  heDomingosFeriados: 100,
  heAdicionalNoturno: 20,
  heNoturnoInicio: "22:00",
  heNoturnoFim: "05:00",
  heInterjornada: 50,
  heLimiteMensal: 44,
  heBancoHoras: false,
  jornadaHorasDiarias: 8,
  jornadaHorasSemanais: 44,
  jornadaIntervaloAlmoco: 60,
  jornadaSabadoTipo: "compensado",
  pontoToleranciaAtraso: 5,
  pontoToleranciaSaida: 5,
  pontoFaltaAposAtraso: 120,
  pontoHoraNoturnaReduzida: "52:30",
};

async function getCriteriaMap(companyId: number): Promise<CriteriaMap> {
  try {
    const db = await getDb();
    if (!db) return { ...DEFAULT_CRITERIA };
    const rows = await db.select().from(systemCriteria)
      .where(eq(systemCriteria.companyId, companyId));
    if (rows.length === 0) return { ...DEFAULT_CRITERIA };
    
    const map: Record<string, string> = {};
    for (const r of rows) map[r.chave] = r.valor;
    
    return {
      heDiasUteis: parseFloat(map["he_dias_uteis"] || "50"),
      heDomingosFeriados: parseFloat(map["he_domingos_feriados"] || "100"),
      heAdicionalNoturno: parseFloat(map["he_adicional_noturno"] || "20"),
      heNoturnoInicio: map["he_noturno_inicio"] || "22:00",
      heNoturnoFim: map["he_noturno_fim"] || "05:00",
      heInterjornada: parseFloat(map["he_interjornada"] || "50"),
      heLimiteMensal: parseFloat(map["he_limite_mensal"] || "44"),
      heBancoHoras: map["he_banco_horas"] === "1",
      jornadaHorasDiarias: parseFloat(map["jornada_horas_diarias"] || "8"),
      jornadaHorasSemanais: parseFloat(map["jornada_horas_semanais"] || "44"),
      jornadaIntervaloAlmoco: parseFloat(map["jornada_intervalo_almoco"] || "60"),
      jornadaSabadoTipo: map["jornada_sabado_tipo"] || "compensado",
      pontoToleranciaAtraso: parseFloat(map["ponto_tolerancia_atraso"] || "5"),
      pontoToleranciaSaida: parseFloat(map["ponto_tolerancia_saida"] || "5"),
      pontoFaltaAposAtraso: parseFloat(map["ponto_falta_apos_atraso"] || "120"),
      pontoHoraNoturnaReduzida: map["ponto_hora_noturna_reduzida"] || "52:30",
    };
  } catch {
    return { ...DEFAULT_CRITERIA };
  }
}

/** Calcula minutos noturnos entre duas batidas */
function calcNightMinutes(entrada: string, saida: string, noturnoInicio: string, noturnoFim: string): number {
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const entMin = toMin(entrada);
  const saiMin = toMin(saida);
  const notIni = toMin(noturnoInicio); // ex: 22:00 = 1320
  const notFim = toMin(noturnoFim);     // ex: 05:00 = 300
  
  let nightMins = 0;
  // Noturno cruza meia-noite (22:00 - 05:00)
  if (notIni > notFim) {
    // Período 1: notIni até 23:59
    const p1Start = Math.max(entMin, notIni);
    const p1End = Math.min(saiMin > notIni ? saiMin : 1440, 1440);
    if (p1End > p1Start) nightMins += p1End - p1Start;
    // Período 2: 00:00 até notFim (para saídas após meia-noite)
    if (saiMin <= notFim) {
      const p2Start = Math.max(entMin < notFim ? entMin : 0, 0);
      const p2End = Math.min(saiMin, notFim);
      if (p2End > p2Start) nightMins += p2End - p2Start;
    }
  } else {
    // Noturno não cruza meia-noite
    const start = Math.max(entMin, notIni);
    const end = Math.min(saiMin, notFim);
    if (end > start) nightMins += end - start;
  }
  return nightMins;
}

/** Obtém percentuais de HE para um funcionário (acordo individual > critérios empresa > padrão CLT) */
function getEmployeeHEPercentuais(emp: any, criteria: CriteriaMap) {
  if (emp.acordoHoraExtra === 1) {
    return {
      heDiasUteis: parseFloat(emp.heNormal50 || "50"),
      heDomingosFeriados: parseFloat(emp.he100 || "100"),
      heAdicionalNoturno: parseFloat(emp.heNoturna || "20"),
      heFeriado: parseFloat(emp.heFeriado || "100"),
      heInterjornada: parseFloat(emp.heInterjornada || "50"),
    };
  }
  return {
    heDiasUteis: criteria.heDiasUteis,
    heDomingosFeriados: criteria.heDomingosFeriados,
    heAdicionalNoturno: criteria.heAdicionalNoturno,
    heFeriado: criteria.heDomingosFeriados,
    heInterjornada: criteria.heInterjornada,
  };
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
    n.includes("Registro") || n.includes("Original") || n.includes("Marca")
  ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const records: any[] = [];
  let deviceSerial = "";

  // First pass: extract SN from any row (even without nome)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;
    const snVal = String(row[7] || row[6] || "").trim();
    if (snVal && !deviceSerial) { deviceSerial = snVal; break; }
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const dixiId = String(row[0] || "").trim();
    const nome = String(row[1] || "").trim();
    // Se nome vazio, usar dixiId como identificador
    const nomeOuId = nome || dixiId;
    if (!nomeOuId) continue;

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

    if (dataStr && nomeOuId) {
      records.push({ dixiId, nome: nomeOuId, data: dataStr, hora: horaStr, modo, sn });
    }
  }

  return { records, deviceSerial };
}

// Match employee name from DIXI to database
function matchEmployee(
  dixiName: string,
  employeeList: Array<{ id: number; nomeCompleto: string; jornadaTrabalho?: any; matricula?: string | null; codigoInterno?: string | null }>,
  dixiId?: string,
  memoryMappings?: Array<{ dixiName: string; employeeId: number }>
): { id: number; nomeCompleto: string; jornadaTrabalho?: any } | null {
  const normalized = normalizeNameForMatch(dixiName);
  const parts = normalized.split(" ");

  // 0. Match by memory mapping (vinculações anteriores salvas)
  if (memoryMappings && memoryMappings.length > 0) {
    // Comparação com dígitos preservados: mapeamentos como "jfc063" não podem
    // colidir com "jfc066" (a normalização de nome removeria os números).
    const groupKey = normalizeGroupKey(dixiName);
    const normalizedMemory = memoryMappings.find(m => normalizeGroupKey(m.dixiName) === groupKey);
    if (normalizedMemory) {
      const emp = employeeList.find(e => e.id === normalizedMemory.employeeId);
      if (emp) return emp;
    }
  }

  // 1. Match by matricula (ID do relógio DIXI = matrícula do funcionário)
  if (dixiId) {
    const padded = dixiId.padStart(3, "0"); // "10" -> "010", "1" -> "001"
    for (const emp of employeeList) {
      if (emp.matricula && (emp.matricula === dixiId || emp.matricula === padded || emp.matricula.padStart(3, "0") === padded)) {
        return emp;
      }
    }
  }

  // 1.5. Match by DIXI nome = codigoInterno ou matrícula do funcionário
  // Permite configurar o relógio com o Nº Interno (ex: JFC018) em vez de nomes,
  // evitando confusão quando há funcionários com nomes parecidos (ex: dois "Jean Carlos").
  // codigoInterno tem prioridade sobre matricula.
  const dixiNameUpper = dixiName.trim().toUpperCase();
  for (const emp of employeeList) {
    if (emp.codigoInterno && emp.codigoInterno.trim().toUpperCase() === dixiNameUpper) return emp;
  }
  for (const emp of employeeList) {
    if (emp.matricula && emp.matricula.trim().toUpperCase() === dixiNameUpper) return emp;
  }

  // 2. Exact name match
  for (const emp of employeeList) {
    if (normalizeNameForMatch(emp.nomeCompleto) === normalized) return emp;
  }

  // 3. Match by first + last name — com detecção de ambiguidade
  // Se mais de um funcionário casar com mesmo primeiro+último nome, manda para Não Identificados
  if (parts.length >= 2) {
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const candidates3 = employeeList.filter(emp => {
      const empParts = normalizeNameForMatch(emp.nomeCompleto).split(" ");
      return empParts[0] === firstName && empParts[empParts.length - 1] === lastName;
    });
    // Rev. 4714 — ambiguidade AMPLA: além do primeiro+último exato, considere
    // qualquer funcionário cujo nome CONTENHA todos os tokens do nome DIXI.
    // Caso real: "Alex Silva" casava (primeiro+último) só com
    // "ALEX ALESSANDRO MONTEIRO DA SILVA", mas "ALEX DA SILVA DOMINGOS" também
    // contém ALEX+SILVA — escolher pelo sufixo creditava as batidas ao
    // funcionário errado. Com >1 contendo todos os tokens → Não Identificados
    // (o usuário vincula 1x e a memória de vinculações resolve dali em diante).
    const containsAll = employeeList.filter(emp => {
      const empParts = normalizeNameForMatch(emp.nomeCompleto).split(" ");
      return parts.every(p => empParts.includes(p));
    });
    // >1 funcionário contém TODOS os tokens → ambíguo de verdade: para AQUI
    // (não deixa o passo 4 "desempatar" errado) → Não Identificados.
    if (containsAll.length > 1) return null;
    if (candidates3.length === 1) return candidates3[0];
    // Se > 1 candidato com mesmo primeiro+último → ambíguo → cai no próximo passo
    // Se nenhum → também cai no próximo passo
  }

  // 4. Partial match - primeiro nome + mínimo 2 partes em comum — com detecção de ambiguidade
  // Se mais de um funcionário casar → manda para Não Identificados ao invés de escolher errado
  if (parts.length >= 1) {
    const firstName = parts[0];
    const candidates4 = employeeList.filter(emp => {
      const empNorm = normalizeNameForMatch(emp.nomeCompleto);
      if (!empNorm.startsWith(firstName + " ")) return false;
      const empParts = empNorm.split(" ");
      const matchCount = parts.filter(p => empParts.includes(p)).length;
      return matchCount >= 2;
    });
    if (candidates4.length === 1) return candidates4[0];
    // Se > 1 candidato (nome ambíguo entre dois funcionários) → retorna null → vai para Não Identificados
    // O usuário resolve manualmente vinculando ao funcionário correto
  }

  return null;
}

// Group punches by person+day, assign entry/exit slots, detect inconsistencies
// NOW: mesReferencia is derived from each record's date, not from input
function processRecords(
  records: Array<{ dixiId: string; nome: string; data: string; hora: string; modo: string; sn: string }>,
  employeeList: Array<{ id: number; nomeCompleto: string; jornadaTrabalho: any; matricula?: string | null; codigoInterno?: string | null; acordoHoraExtra?: any; heNormal50?: any; heNoturna?: any; he100?: any; heFeriado?: any; heInterjornada?: any; cargoConfianca?: number | null }>,
  obraId: number | null,
  companyId: number,
  criteria: CriteriaMap = DEFAULT_CRITERIA,
  activeAvisos: Array<{ employeeId: number; dataInicio: string; dataFim: string; reducaoJornada: string | null }> = [],
  memoryMappings: Array<{ dixiName: string; employeeId: number }> = [],
  activeFeriasGozo: Array<{ employeeId: number; dataInicio: string; dataFim: string; periodo2Inicio: string | null; periodo2Fim: string | null; periodo3Inicio: string | null; periodo3Fim: string | null }> = [],
  // Jornada da OBRA do lote (JSON). Quando preenchida, PREVALECE sobre a jornada
  // do funcionário para TODOS os dias deste import (a obra é a do lote/SN).
  obraJornada: string | null = null,
) {
  // Group by person+day
  const grouped: Record<string, Record<string, string[]>> = {};
  const nameToEmployee: Record<string, { id: number; nomeCompleto: string; jornadaTrabalho?: any } | null> = {};

  for (const r of records) {
    const key = normalizeGroupKey(r.nome);
    if (!grouped[key]) {
      grouped[key] = {};
      nameToEmployee[key] = matchEmployee(r.nome, employeeList, r.dixiId, memoryMappings);
    }
    if (!grouped[key][r.data]) grouped[key][r.data] = [];
    grouped[key][r.data].push(r.hora);
  }

  const timeRecordsToInsert: any[] = [];
  const inconsistencies: any[] = [];
  const unmatchedNames: string[] = [];
  const unmatchedRecordsToInsert: any[] = [];

  for (const [normName, days] of Object.entries(grouped)) {
    const emp = nameToEmployee[normName];
    if (!emp) {
      const originalName = records.find(r => normalizeGroupKey(r.nome) === normName)?.nome || normName;
      const dixiId = records.find(r => normalizeGroupKey(r.nome) === normName)?.dixiId || null;
      unmatchedNames.push(originalName);
      
      // Salvar registros não identificados para vinculação posterior
      for (const [data, horas] of Object.entries(days)) {
        horas.sort();
        const filtered: string[] = [];
        for (const h of horas) {
          if (filtered.length === 0) { filtered.push(h); continue; }
          const lastH = filtered[filtered.length - 1];
          const [lh, lm] = lastH.split(":").map(Number);
          const [ch, cm] = h.split(":").map(Number);
          const diff = Math.abs((ch * 60 + cm) - (lh * 60 + lm));
          if (diff >= 2) filtered.push(h);
        }
        unmatchedRecordsToInsert.push({
          companyId,
          obraId,
          mesReferencia: dateToMesRef(data),
          dixiName: originalName,
          dixiId: dixiId,
          data,
          entrada1: filtered[0] ? filtered[0].substring(0, 5) : null,
          saida1: filtered[1] ? filtered[1].substring(0, 5) : null,
          entrada2: filtered[2] ? filtered[2].substring(0, 5) : null,
          saida2: filtered[3] ? filtered[3].substring(0, 5) : null,
          entrada3: filtered[4] ? filtered[4].substring(0, 5) : null,
          saida3: filtered[5] ? filtered[5].substring(0, 5) : null,
          batidasBrutas: JSON.stringify(filtered),
          status: 'pendente' as const,
        });
      }
      continue;
    }

    // Jornada efetiva: a da OBRA prevalece sobre a do funcionário quando cadastrada.
    const empJornadaEfetiva = jornadaEfetiva(emp.jornadaTrabalho, obraJornada);

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

      let expectedMinutes = 480; // default 8h se não tiver jornada definida
      let isDiaFolgaJornada = false; // true se o dia NÃO tem jornada (sáb/dom sem escala = tudo é HE)
      if (empJornadaEfetiva) {
        try {
          const jornada = typeof empJornadaEfetiva === "string" ? JSON.parse(empJornadaEfetiva) : empJornadaEfetiva;
          const dayOfWeek = new Date(data + "T12:00:00").getDay();
          const dayMap: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
          const dayKey = dayMap[dayOfWeek];
          if (jornada[dayKey] && jornada[dayKey].entrada && jornada[dayKey].saida) {
            const j = jornada[dayKey];
            const totalJornada = diffMinutes(j.entrada, j.saida);
            // Intervalo no formato "HH:MM" -> converter para minutos
            let intervaloMin = 60; // default 1h
            if (j.intervalo) {
              const parts = j.intervalo.split(":");
              if (parts.length === 2) {
                intervaloMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
              }
            }
            expectedMinutes = totalJornada - intervaloMin;
          } else {
            // Dia sem jornada definida (ex: sáb/dom sem escala)
            // expectedMinutes = 0 → qualquer hora trabalhada = hora extra
            expectedMinutes = 0;
            isDiaFolgaJornada = true;
          }
        } catch (e) { /* use default 480 */ }
      }

      // ---- APLICAR CRITÉRIOS DO SISTEMA ----
      const tolAtraso = criteria.pontoToleranciaAtraso; // min
      const tolSaida = criteria.pontoToleranciaSaida;   // min
      const faltaApos = criteria.pontoFaltaAposAtraso;  // min

      // ===== INTEGRAÇÃO AVISO PRÉVIO (ANTES do diffBruto) =====
      // Reduz expectedMinutes ANTES de calcular a diferença para que o cálculo de
      // HE, atraso e falta respeite a jornada reduzida (Art. 488 CLT).
      const avisoAtivo = activeAvisos.find(a =>
        a.employeeId === emp.id && data >= a.dataInicio && data <= a.dataFim
      );
      if (avisoAtivo) {
        if (avisoAtivo.reducaoJornada === '2h_dia') {
          // Reduz 2 horas por dia da jornada esperada
          expectedMinutes = Math.max(0, expectedMinutes - 120);
        } else if (avisoAtivo.reducaoJornada === '7_dias_corridos') {
          // Nos últimos 7 dias corridos o funcionário não precisa comparecer
          const fimAviso = new Date(avisoAtivo.dataFim + 'T12:00:00');
          const dataAtual  = new Date(data + 'T12:00:00');
          const diffDias = Math.ceil((fimAviso.getTime() - dataAtual.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDias <= 7) expectedMinutes = 0;
        }
      }

      // ===== INTEGRAÇÃO FÉRIAS =====
      // Verifica se o funcionário está em período de gozo de férias no dia.
      // Suporta até 3 fracionamentos cadastrados em vacation_periods.
      const inFeriasRange = (inicio: string | null, fim: string | null) =>
        !!inicio && !!fim && data >= inicio && data <= fim;
      const emFeriasGozo = activeFeriasGozo.find(f =>
        f.employeeId === emp.id && (
          inFeriasRange(f.dataInicio, f.dataFim) ||
          inFeriasRange(f.periodo2Inicio, f.periodo2Fim) ||
          inFeriasRange(f.periodo3Inicio, f.periodo3Fim)
        )
      );

      // Calcular diferença bruta (agora com expectedMinutes já corrigido pelo aviso prévio)
      const diffBruto = totalMinutes - expectedMinutes;
      
      // Aplicar tolerâncias:
      // Se trabalhou a mais, mas dentro da tolerância de saída, não conta HE
      // Se trabalhou a menos, mas dentro da tolerância de atraso, não conta atraso
      let horasExtras = 0;
      let atrasos = 0;
      let faltas = "0";

      // CARGO DE CONFIANÇA (CLT Art. 62, II): sem controle de jornada
      // Não registra falta, atraso ou hora extra
      const isCargoConfianca = !!(emp as any).cargoConfianca;
      if (isCargoConfianca) {
        faltas = "0";
        atrasos = 0;
        horasExtras = 0;
      } else if (emFeriasGozo) {
        // Dias de férias: zera faltas e atrasos — o funcionário não precisa bater ponto no período de gozo
        faltas = "0";
        atrasos = 0;
        horasExtras = 0;
      } else if (isDiaFolgaJornada && totalMinutes > 0) {
        // DIA DE FOLGA (sáb/dom sem escala): TUDO é hora extra
        horasExtras = totalMinutes;
        // Não gerar atraso nem falta em dia de folga
      } else if (diffBruto > 0) {
        // Trabalhou mais que o esperado em dia normal
        // REGRA: Chegada antecipada SEMPRE conta como hora extra (sem tolerância)
        // A tolerância de saída só se aplica para não gerar HE por poucos minutos a mais no fim
        // Mas se chegou cedo, isso é intencional e deve contar
        
        // Verificar se o excesso vem de chegada antecipada
        let chegouCedo = false;
        if (entrada1 && empJornadaEfetiva) {
          try {
            const jornada = typeof empJornadaEfetiva === "string" ? JSON.parse(empJornadaEfetiva) : empJornadaEfetiva;
            const dayOfWeek2 = new Date(data + "T12:00:00").getDay();
            const dayMap2: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
            const dayKey2 = dayMap2[dayOfWeek2];
            if (jornada[dayKey2]?.entrada) {
              const entradaEsperada = diffMinutes("00:00", jornada[dayKey2].entrada);
              const entradaReal = diffMinutes("00:00", entrada1);
              if (entradaReal < entradaEsperada) {
                chegouCedo = true;
              }
            }
          } catch (e) { /* ignore */ }
        }
        
        if (chegouCedo) {
          // Chegou cedo: aplica mesma tolerância de 10min (CLT Art. 58 §1º + Súmula 366 TST)
          horasExtras = diffBruto > tolSaida ? diffBruto : 0;
        } else {
          // Saiu tarde: aplica tolerância de saída
          horasExtras = diffBruto > tolSaida ? diffBruto : 0;
        }
      } else if (diffBruto < 0 && totalMinutes > 0) {
        const atrasoReal = Math.abs(diffBruto);
        if (atrasoReal >= faltaApos && !avisoAtivo) {
          // Atraso muito grande: considerar falta (exceto durante aviso prévio)
          faltas = "1";
          atrasos = 0;
        } else if (atrasoReal > tolAtraso) {
          // Atraso fora da tolerância (>10min): registrar como atraso
          atrasos = atrasoReal;
        }
        // Dentro da tolerância (<=10min): atraso = 0, não desconta
      }
      
      // Classificar tipo de HE: sábado=50%, domingo/feriado=100%, dia útil=50%
      const dayOfWeekForHE = new Date(data + "T12:00:00").getDay();
      // 0=dom, 6=sab
      const tipoHE = dayOfWeekForHE === 0 ? '100' : (dayOfWeekForHE === 6 ? '50' : '50');
      
      // Calcular horas noturnas
      let nightMinutes = 0;
      if (entrada1 && saida1) nightMinutes += calcNightMinutes(entrada1, saida1, criteria.heNoturnoInicio, criteria.heNoturnoFim);
      if (entrada2 && saida2) nightMinutes += calcNightMinutes(entrada2, saida2, criteria.heNoturnoInicio, criteria.heNoturnoFim);
      if (entrada3 && saida3) nightMinutes += calcNightMinutes(entrada3, saida3, criteria.heNoturnoInicio, criteria.heNoturnoFim);
      
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
        horasNoturnas: nightMinutes > 0 ? minutesToHHMM(nightMinutes) : "0:00",
        faltas,
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

      // Regra (Rev. 1229): NÃO gerar inconsistência "falta_batida" para
      // pares de batidas (2). O funcionário pode legitimamente ter
      // trabalhado meio período. Apenas batidas ímpares são tratadas como
      // inconsistência. A variável isMissingPunch fica disponível caso
      // futuramente queiramos um aviso visual sem bloqueio.
      void isMissingPunch;
    }
  }

  return { timeRecordsToInsert, inconsistencies, unmatchedNames, unmatchedRecordsToInsert };
}

// ============================================================
// ROUTER
// ============================================================
export const fechamentoPontoRouter = router({

  // ===================== UPLOAD DIXI (INTELIGENTE) =====================
  previewDixi: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      files: z.array(z.object({ fileName: z.string(), fileBase64: z.string() })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        jornadaTrabalho: employees.jornadaTrabalho,
        matricula: employees.matricula,
        codigoInterno: employees.codigoInterno,
        cpf: employees.cpf,
        funcao: employees.funcao,
        status: employees.status,
        cargoConfianca: employees.cargoConfianca,
      }).from(employees).where(and(
        companyFilter(employees.companyId, input),
        sql`${employees.deletedAt} IS NULL`,
        sql`${employees.status} NOT IN ('Desligado', 'Afastado', 'Recluso', 'Lista_Negra')`,
      ));

      const activeSns = await db.select({
        sn: obraSns.sn, obraId: obraSns.obraId, obraNome: obras.nome,
      }).from(obraSns).leftJoin(obras, eq(obraSns.obraId, obras.id))
        .where(and(companyFilter(obraSns.companyId, input), eq(obraSns.status, "ativo")));
      const devices = await db.select().from(dixiDevices).where(companyFilter(dixiDevices.companyId, input));
      const obrasList = await db.select({ id: obras.id, nome: obras.nome, snRelogioPonto: obras.snRelogioPonto })
        .from(obras).where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));
      const memMappings = await db.select({ dixiName: dixiNameMappings.dixiName, employeeId: dixiNameMappings.employeeId })
        .from(dixiNameMappings).where(companyFilter(dixiNameMappings.companyId, input));

      const previewEmployees: Array<{
        employeeId: number; nomeCompleto: string; cpf: string; funcao: string;
        dixiName: string; totalRegistros: number; meses: string[];
      }> = [];
      const mesesDetectados = new Set<string>();
      let obraId: number | null = null;
      let obraNome = "";
      let deviceSerial = "";
      let isSharedSn = false;
      let sharedSnObras: Array<{ obraId: number; obraNome: string }> = [];

      for (const file of input.files) {
        const buffer = Buffer.from(file.fileBase64, "base64");
        const { records, deviceSerial: sn } = parseDixiXLS(buffer);
        deviceSerial = sn;

        const snMatches = activeSns.filter(s => s.sn === sn);
        if (snMatches.length > 0) { obraId = snMatches[0].obraId; obraNome = snMatches[0].obraNome || ""; }
        if (!obraId) {
          const device = devices.find(d => d.serialNumber === sn);
          if (device?.obraId) { obraId = device.obraId; const o = obrasList.find(x => x.id === device.obraId); if (o) obraNome = o.nome; }
        }
        if (!obraId) {
          const o = obrasList.find(x => x.snRelogioPonto === sn);
          if (o) { obraId = o.id; obraNome = o.nome; }
        }
        if (snMatches.length > 1) {
          isSharedSn = true;
          sharedSnObras = snMatches.map(m => ({ obraId: m.obraId!, obraNome: m.obraNome || "" }));
        }

        const byPerson: Record<string, { dixiName: string; dixiId: string; records: any[] }> = {};
        for (const rec of records) {
          const key = rec.nome;
          if (!byPerson[key]) byPerson[key] = { dixiName: rec.nome, dixiId: rec.dixiId, records: [] };
          byPerson[key].records.push(rec);
          const mesRef = rec.data.substring(0, 7);
          mesesDetectados.add(mesRef);
        }

        for (const [, group] of Object.entries(byPerson)) {
          const emp = matchEmployee(group.dixiName, empList as any, group.dixiId, memMappings as any);
          if (emp) {
            const existing = previewEmployees.find(p => p.employeeId === emp.id);
            const meses = Array.from(new Set(group.records.map((r: any) => r.data.substring(0, 7))));
            if (existing) {
              existing.totalRegistros += group.records.length;
              existing.meses = Array.from(new Set([...existing.meses, ...meses]));
            } else {
              const empData = empList.find((e: any) => e.id === emp.id) as any;
              previewEmployees.push({
                employeeId: emp.id,
                nomeCompleto: emp.nomeCompleto,
                cpf: empData?.cpf || "",
                funcao: empData?.funcao || "",
                dixiName: group.dixiName,
                totalRegistros: group.records.length,
                meses,
              });
            }
          }
        }
      }

      const mesesArr = Array.from(mesesDetectados).sort();
      let existingByEmployee: Record<number, number> = {};
      let existingRecordsByEmployee: Record<number, Array<{ data: string; entrada1: string; saida1: string; entrada2: string; saida2: string; horasTrabalhadas: string; horasExtras: string; faltas: string; fonte: string; obraId: number | null; obraNome: string; createdAt: string }>> = {};
      const obraIdsToCheck = isSharedSn && sharedSnObras.length > 1
        ? sharedSnObras.map(o => o.obraId)
        : obraId ? [obraId] : [];
      if (mesesArr.length > 0 && obraIdsToCheck.length > 0) {
        const obraNomeById: Record<number, string> = {};
        for (const o of obrasList) obraNomeById[o.id] = o.nome;
        for (const mesRef of mesesArr) {
          const existingRecs = await db.select({
            employeeId: timeRecords.employeeId,
            data: timeRecords.data,
            entrada1: timeRecords.entrada1,
            saida1: timeRecords.saida1,
            entrada2: timeRecords.entrada2,
            saida2: timeRecords.saida2,
            horasTrabalhadas: timeRecords.horasTrabalhadas,
            horasExtras: timeRecords.horasExtras,
            faltas: timeRecords.faltas,
            fonte: timeRecords.fonte,
            obraId: timeRecords.obraId,
            createdAt: timeRecords.createdAt,
          })
            .from(timeRecords)
            .where(and(
              companyFilter(timeRecords.companyId, input),
              eq(timeRecords.mesReferencia, mesRef),
              inArray(timeRecords.obraId, obraIdsToCheck),
              eq(timeRecords.fonte, "dixi"),
            ))
            .orderBy(sql`${timeRecords.data} ASC`);
          for (const r of existingRecs) {
            existingByEmployee[r.employeeId] = (existingByEmployee[r.employeeId] || 0) + 1;
            if (!existingRecordsByEmployee[r.employeeId]) existingRecordsByEmployee[r.employeeId] = [];
            existingRecordsByEmployee[r.employeeId].push({
              data: r.data,
              entrada1: r.entrada1 || "",
              saida1: r.saida1 || "",
              entrada2: r.entrada2 || "",
              saida2: r.saida2 || "",
              horasTrabalhadas: r.horasTrabalhadas || "00:00",
              horasExtras: r.horasExtras || "0:00",
              faltas: r.faltas || "0",
              fonte: r.fonte || "dixi",
              obraId: r.obraId ?? null,
              obraNome: r.obraId ? (obraNomeById[r.obraId] || `Obra #${r.obraId}`) : "",
              createdAt: r.createdAt || "",
            });
          }
        }
      }

      const hasExistingData = Object.keys(existingByEmployee).length > 0;

      let employeeObraRouting: Record<number, { obraId: number; obraNome: string; status: "resolved" | "ambiguous" | "unassigned" }> = {};
      if (isSharedSn && sharedSnObras.length > 1) {
        const empIds = previewEmployees.map(e => e.employeeId);
        if (empIds.length > 0) {
          const allocs = await db.select({
            employeeId: obraFuncionarios.employeeId,
            obraId: obraFuncionarios.obraId,
          }).from(obraFuncionarios).where(and(
            inArray(obraFuncionarios.employeeId, empIds),
            eq(obraFuncionarios.isActive, 1),
          ));
          const sharedObraIds = new Set(sharedSnObras.map(o => o.obraId));
          const empAllocations: Record<number, Set<number>> = {};
          for (const alloc of allocs) {
            if (sharedObraIds.has(alloc.obraId)) {
              if (!empAllocations[alloc.employeeId]) empAllocations[alloc.employeeId] = new Set();
              empAllocations[alloc.employeeId].add(alloc.obraId);
            }
          }
          for (const empId of empIds) {
            const allocObras = Array.from(empAllocations[empId] || new Set());
            if (allocObras.length === 1) {
              const obraInfo = sharedSnObras.find(o => o.obraId === allocObras[0]);
              if (obraInfo) {
                employeeObraRouting[empId] = { obraId: obraInfo.obraId, obraNome: obraInfo.obraNome, status: "resolved" };
              }
            } else if (allocObras.length > 1) {
              const obraInfo = sharedSnObras.find(o => o.obraId === allocObras[0]);
              employeeObraRouting[empId] = { obraId: obraInfo?.obraId || 0, obraNome: allocObras.map(id => sharedSnObras.find(o => o.obraId === id)?.obraNome).join(" / "), status: "ambiguous" };
            } else {
              employeeObraRouting[empId] = { obraId: 0, obraNome: "", status: "unassigned" };
            }
          }
        }
      }

      let apontamentosCampo: Array<{ employeeId: number; nomeCompleto: string; data: string; tipoOcorrencia: string; descricao: string; status: string }> = [];
      if (mesesArr.length > 0) {
        const empIds = previewEmployees.map(e => e.employeeId);
        if (empIds.length > 0) {
          const firstDay = `${mesesArr[0]}-01`;
          const lastMes = mesesArr[mesesArr.length - 1];
          const [ly, lm] = lastMes.split('-').map(Number);
          const lastDay = `${lastMes}-${new Date(ly, lm, 0).getDate()}`;
          const fnRows = await db.select({
            employeeId: fieldNotes.employeeId,
            data: fieldNotes.data,
            tipoOcorrencia: fieldNotes.tipoOcorrencia,
            descricao: fieldNotes.descricao,
            status: fieldNotes.status,
          }).from(fieldNotes).where(and(
            companyFilter(fieldNotes.companyId, input),
            sql`${fieldNotes.deletedAt} IS NULL`,
            sql`${fieldNotes.data} BETWEEN ${firstDay} AND ${lastDay}`,
            inArray(fieldNotes.employeeId, empIds),
          ));
          for (const fn of fnRows) {
            const emp = empList.find((e: any) => e.id === fn.employeeId);
            apontamentosCampo.push({
              employeeId: fn.employeeId,
              nomeCompleto: emp?.nomeCompleto || `ID ${fn.employeeId}`,
              data: fn.data,
              tipoOcorrencia: fn.tipoOcorrencia,
              descricao: fn.descricao,
              status: fn.status,
            });
          }
        }
      }

      return {
        hasExistingData,
        obraId, obraNome, deviceSerial,
        isSharedSn,
        sharedSnObras,
        meses: mesesArr,
        apontamentosCampo,
        employees: previewEmployees.map(e => ({
          ...e,
          jaImportado: !!existingByEmployee[e.employeeId],
          registrosExistentes: existingByEmployee[e.employeeId] || 0,
          registrosDetalhe: existingRecordsByEmployee[e.employeeId] || [],
          obraDestino: employeeObraRouting[e.employeeId] || null,
        })).sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto)),
        totalRegistros: previewEmployees.reduce((sum, e) => sum + e.totalRegistros, 0),
      };
    }),

  uploadDixi: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), files: z.array(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
      })),
      mode: z.enum(["replace_all", "selective"]).optional(),
      selectedEmployeeIds: z.array(z.number()).optional(),
      periodoInicio: z.string().optional(),
      periodoFim: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Get all employees for this company
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        jornadaTrabalho: employees.jornadaTrabalho,
        matricula: employees.matricula,
        codigoInterno: employees.codigoInterno,
        status: employees.status,
        cargoConfianca: employees.cargoConfianca,
      }).from(employees).where(and(
        companyFilter(employees.companyId, input),
        sql`${employees.deletedAt} IS NULL`,
        sql`${employees.status} NOT IN ('Desligado', 'Afastado', 'Recluso', 'Lista_Negra')`,
      ));

      // Get all dixi devices for this company (to match SN -> obra)
      const devices = await db.select().from(dixiDevices).where(companyFilter(dixiDevices.companyId, input));
      // Get active SNs from obra_sns table
      const activeSns = await db.select({
        sn: obraSns.sn,
        obraId: obraSns.obraId,
        obraNome: obras.nome,
      }).from(obraSns)
        .leftJoin(obras, eq(obraSns.obraId, obras.id))
        .where(and(companyFilter(obraSns.companyId, input), eq(obraSns.status, "ativo")));
      // Also get obras list for fallback (legacy snRelogioPonto field)
      const obrasList = await db.select({
        id: obras.id,
        nome: obras.nome,
        snRelogioPonto: obras.snRelogioPonto,
      }).from(obras).where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));

      let totalImported = 0;
      let totalInconsistencies = 0;
      let totalUnmatched: string[] = [];
      const fileResults: any[] = [];
      const mesesAfetados = new Set<string>();

      for (const file of input.files) {
        const buffer = Buffer.from(file.fileBase64, "base64");
        const { records, deviceSerial } = parseDixiXLS(buffer);
        let fileActualInserted = 0;

        // ===== VALIDAÇÃO DE SN OBRIGATÓRIA =====
        if (!deviceSerial) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Arquivo "${file.fileName}": Não foi possível identificar o número de série (SN) do equipamento DIXI. Verifique se o arquivo está no formato correto.`,
          });
        }

        // Find obra by SN (supports shared SNs across multiple obras)
        let obraId: number | null = null;
        let obraNome = "";
        let fileSharedSnObras: Array<{ obraId: number; obraNome: string }> = [];

        // 1. Check obra_sns table (primary - supports shared SNs)
        const snMatches = activeSns.filter(s => s.sn === deviceSerial);
        if (snMatches.length > 0) {
          obraId = snMatches[0].obraId;
          obraNome = snMatches[0].obraNome || "";
          if (snMatches.length > 1) {
            fileSharedSnObras = snMatches.map(m => ({ obraId: m.obraId!, obraNome: m.obraNome || "" }));
          }
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

        // ===== SHARED SN: Load employee→obra assignments with ambiguity detection =====
        let empObraMap: Record<number, { obraId: number; obraNome: string; status: "resolved" | "ambiguous" | "unassigned" }> = {};
        if (fileSharedSnObras.length > 1) {
          const sharedObraIds = fileSharedSnObras.map(o => o.obraId);
          const allocs = await db.select({
            employeeId: obraFuncionarios.employeeId,
            obraId: obraFuncionarios.obraId,
          }).from(obraFuncionarios).where(and(
            inArray(obraFuncionarios.obraId, sharedObraIds),
            eq(obraFuncionarios.isActive, 1),
          ));
          const empAllocSets: Record<number, Set<number>> = {};
          for (const alloc of allocs) {
            if (!empAllocSets[alloc.employeeId]) empAllocSets[alloc.employeeId] = new Set();
            empAllocSets[alloc.employeeId].add(alloc.obraId);
          }
          for (const [empIdStr, allocSet] of Object.entries(empAllocSets)) {
            const empId = Number(empIdStr);
            const allocObras = Array.from(allocSet);
            if (allocObras.length === 1) {
              const obraInfo = fileSharedSnObras.find(o => o.obraId === allocObras[0]);
              if (obraInfo) {
                empObraMap[empId] = { obraId: obraInfo.obraId, obraNome: obraInfo.obraNome, status: "resolved" };
              }
            } else if (allocObras.length > 1) {
              empObraMap[empId] = { obraId: 0, obraNome: allocObras.map(id => fileSharedSnObras.find(o => o.obraId === id)?.obraNome).join(" / "), status: "ambiguous" };
            }
          }
        }

        // Buscar critérios do sistema para aplicar nos cálculos
        const criteria = await getCriteriaMap(input.companyId);

        // Buscar avisos prévios ativos (trabalhados) para não gerar falta
        const activeAvisos = await db.select({
          employeeId: terminationNotices.employeeId,
          dataInicio: terminationNotices.dataInicio,
          dataFim: terminationNotices.dataFim,
          reducaoJornada: terminationNotices.reducaoJornada,
        }).from(terminationNotices).where(
          and(
            companyFilter(terminationNotices.companyId, input),
            eq(terminationNotices.status, 'em_andamento'),
            sql`${terminationNotices.tipo} IN ('empregador_trabalhado', 'empregado_trabalhado')`,
            sql`${terminationNotices.deletedAt} IS NULL`,
          )
        );

        // Buscar períodos de férias em gozo — para não gerar falta nos dias de férias
        const activeFeriasGozo = await db.select({
          employeeId: vacationPeriods.employeeId,
          dataInicio:    vacationPeriods.dataInicio,
          dataFim:       vacationPeriods.dataFim,
          periodo2Inicio: vacationPeriods.periodo2Inicio,
          periodo2Fim:    vacationPeriods.periodo2Fim,
          periodo3Inicio: vacationPeriods.periodo3Inicio,
          periodo3Fim:    vacationPeriods.periodo3Fim,
        }).from(vacationPeriods).where(
          and(
            companyFilter(vacationPeriods.companyId, input),
            sql`${vacationPeriods.status} NOT IN ('cancelada', 'pendente')`,
            isNull(vacationPeriods.deletedAt),
            sql`${vacationPeriods.dataInicio} IS NOT NULL`,
          )
        );

        // Carregar memória de vinculação DIXI para auto-match
        const memMappings = await db.select({
          dixiName: dixiNameMappings.dixiName,
          employeeId: dixiNameMappings.employeeId,
        }).from(dixiNameMappings).where(companyFilter(dixiNameMappings.companyId, input));

        // Jornada da OBRA do lote: quando cadastrada, PREVALECE sobre a do funcionário.
        // (No caso normal, o lote é 1 obra. Em SN compartilhado o rec.obraId é reatribuído
        // depois; o recálculo/relatório aplicam a jornada por obra-do-dia — ver recalcularPeriodo.)
        let obraJornadaLote: string | null = null;
        if (obraId) {
          try {
            const [oj] = await db.select({ j: obras.jornadaTrabalho }).from(obras).where(and(eq(obras.id, obraId), companyFilter(obras.companyId, input)));
            if (oj && obraTemJornada(oj.j)) obraJornadaLote = oj.j as any;
          } catch { /* sem jornada de obra → usa a do funcionário */ }
        }

        // Process records - mesReferencia is auto-detected from each record's date
        const { timeRecordsToInsert, inconsistencies, unmatchedNames, unmatchedRecordsToInsert } = processRecords(
          records, empList as any, obraId, input.companyId, criteria, activeAvisos, memMappings, activeFeriasGozo as any, obraJornadaLote
        );
        // [DIXI-DEBUG] after processRecords
        const _dbgKelly = timeRecordsToInsert.filter((r: any) => r.employeeId === 141);
        console.log(`[DIXI-DEBUG] processRecords → total=${timeRecordsToInsert.length} | kelly(141)=${_dbgKelly.length} registros | datas=${_dbgKelly.map((r:any)=>r.data).join(',')} | fileSharedSn=${fileSharedSnObras.length}`);

        // ===== SHARED SN: Reassign obraId by employee→obra assignment =====
        const skippedEmployeeIds = new Set<number>();
        if (fileSharedSnObras.length > 1) {
          const sharedSnObraNames = fileSharedSnObras.map(o => o.obraNome).join(", ");
          const unresolvedEmployees = new Set<number>();

          for (const rec of timeRecordsToInsert) {
            const routing = empObraMap[rec.employeeId];
            if (routing && routing.status === "resolved") {
              rec.obraId = routing.obraId;
            } else {
              unresolvedEmployees.add(rec.employeeId);
              skippedEmployeeIds.add(rec.employeeId);
            }
          }
          for (const inc of inconsistencies) {
            const routing = empObraMap[inc.employeeId];
            if (routing && routing.status === "resolved") {
              inc.obraId = routing.obraId;
            }
          }

          if (unresolvedEmployees.size > 0) {
            const pontoIncons: any[] = [];
            const seenEmpDays = new Set<string>();
            for (const rec of timeRecordsToInsert) {
              if (!unresolvedEmployees.has(rec.employeeId)) continue;
              const key = `${rec.employeeId}|${rec.data}`;
              if (seenEmpDays.has(key)) continue;
              seenEmpDays.add(key);
              const routing = empObraMap[rec.employeeId];
              const reason = routing?.status === "ambiguous"
                ? `SN compartilhado entre ${sharedSnObraNames} — funcionário alocado em múltiplas obras (${routing.obraNome}), não foi possível determinar destino`
                : `SN compartilhado entre ${sharedSnObraNames} — funcionário sem alocação definida em nenhuma dessas obras`;
              pontoIncons.push({
                companyId: input.companyId,
                employeeId: rec.employeeId,
                obraAlocadaId: null,
                obraPontoId: obraId!,
                dataPonto: rec.data,
                snRelogio: deviceSerial,
                status: "pendente",
                observacoes: reason,
              });
            }
            if (pontoIncons.length > 0) {
              const unresolvedEmpArr = Array.from(unresolvedEmployees);
              const inconsDates = Array.from(new Set(pontoIncons.map((p: any) => p.dataPonto)));
              await db.delete(obraPontoInconsistencies).where(and(
                eq(obraPontoInconsistencies.companyId, input.companyId),
                inArray(obraPontoInconsistencies.employeeId, unresolvedEmpArr),
                eq(obraPontoInconsistencies.snRelogio, deviceSerial),
                eq(obraPontoInconsistencies.status, "pendente"),
                inArray(obraPontoInconsistencies.dataPonto, inconsDates),
              ));
              for (let i = 0; i < pontoIncons.length; i += 50) {
                await db.insert(obraPontoInconsistencies).values(pontoIncons.slice(i, i + 50));
              }
            }

            const resolvedOnly = timeRecordsToInsert.filter(r => !skippedEmployeeIds.has(r.employeeId));
            timeRecordsToInsert.length = 0;
            timeRecordsToInsert.push(...resolvedOnly);

            const resolvedIncons = inconsistencies.filter(i => !skippedEmployeeIds.has(i.employeeId));
            inconsistencies.length = 0;
            inconsistencies.push(...resolvedIncons);
          }
        }
        // [DIXI-DEBUG] after routing
        const _dbgKelly2 = timeRecordsToInsert.filter((r: any) => r.employeeId === 141);
        console.log(`[DIXI-DEBUG] pós-routing → kelly(141)=${_dbgKelly2.length} | skipped=${[...skippedEmployeeIds].join(',')} | empObraMap[141]=${JSON.stringify((empObraMap as any)[141])}`);

        // ===== FILTRO DE PERÍODO DO USUÁRIO =====
        // Se o usuário informou periodoInicio/periodoFim, descartar registros fora do intervalo.
        // Isso evita que batidas do próximo ciclo (ex: 15/06 num arquivo que cobre 15/05-14/06)
        // gerem faltas indevidas no fechamento atual.
        if (input.periodoInicio || input.periodoFim) {
          const de = input.periodoInicio || "0000-01-01";
          const ate = input.periodoFim || "9999-12-31";
          const beforeRec = timeRecordsToInsert.length;
          const beforeInc = inconsistencies.length;
          const filteredRec = timeRecordsToInsert.filter((r: any) => r.data >= de && r.data <= ate);
          const filteredInc = inconsistencies.filter((i: any) => i.data >= de && i.data <= ate);
          const filteredUnm = unmatchedRecordsToInsert.filter((r: any) => r.data >= de && r.data <= ate);
          timeRecordsToInsert.length = 0;
          timeRecordsToInsert.push(...filteredRec);
          inconsistencies.length = 0;
          inconsistencies.push(...filteredInc);
          unmatchedRecordsToInsert.length = 0;
          unmatchedRecordsToInsert.push(...filteredUnm);
          const ignorados = beforeRec - filteredRec.length;
          if (ignorados > 0) {
            console.log(`[DIXI período ${de}→${ate}] ${ignorados} registro(s) ignorados por estar fora do período (${beforeInc - filteredInc.length} inconsistências também descartadas)`);
          }
          const _dbgKelly3 = timeRecordsToInsert.filter((r: any) => r.employeeId === 141);
          console.log(`[DIXI-DEBUG] pós-período ${de}→${ate} → kelly(141)=${_dbgKelly3.length} | datas=${_dbgKelly3.map((r:any)=>r.data).join(',')}`);
        }

        // Salvar registros não identificados para vinculação posterior
        if (unmatchedRecordsToInsert.length > 0) {
          const unmatchedMeses = Array.from(new Set(unmatchedRecordsToInsert.map((r: any) => r.mesReferencia)));
          for (const mesRef of unmatchedMeses) {
            await db.delete(unmatchedDixiRecords).where(
              and(
                companyFilter(unmatchedDixiRecords.companyId, input),
                eq(unmatchedDixiRecords.mesReferencia, mesRef as string),
                obraId ? eq(unmatchedDixiRecords.obraId, obraId) : sql`1=1`,
              )
            );
          }
          const batchSize = 50;
          for (let i = 0; i < unmatchedRecordsToInsert.length; i += batchSize) {
            const batch = unmatchedRecordsToInsert.slice(i, i + batchSize);
            await db.insert(unmatchedDixiRecords).values(batch);
          }
        }

        // Group records by mesReferencia + obraId (supports shared SN routing)
        const recordsByMesObra: Record<string, any[]> = {};
        const inconsByMesObra: Record<string, any[]> = {};
        for (const rec of timeRecordsToInsert) {
          const key = `${rec.mesReferencia}|${rec.obraId}`;
          if (!recordsByMesObra[key]) recordsByMesObra[key] = [];
          recordsByMesObra[key].push(rec);
        }
        for (const inc of inconsistencies) {
          const key = `${inc.mesReferencia}|${inc.obraId}`;
          if (!inconsByMesObra[key]) inconsByMesObra[key] = [];
          inconsByMesObra[key].push(inc);
        }

        if (input.mode === "selective" && (!input.selectedEmployeeIds || input.selectedEmployeeIds.length === 0)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Modo seletivo requer pelo menos um funcionário selecionado." });
        }
        const isSelective = input.mode === "selective" && input.selectedEmployeeIds && input.selectedEmployeeIds.length > 0;
        const selectedSet = isSelective ? new Set(input.selectedEmployeeIds) : null;

        console.log(`[DIXI-DEBUG] grupos recordsByMesObra: ${Object.keys(recordsByMesObra).join(' | ')} | mode=${input.mode} | selectedIds=${input.selectedEmployeeIds?.join(',')}`);
        for (const [mesObraKey, allRecs] of Object.entries(recordsByMesObra)) {
          const [mesRef, groupObraIdStr] = mesObraKey.split("|");
          const groupObraId = Number(groupObraIdStr);
          const recs = selectedSet ? allRecs.filter((r: any) => selectedSet.has(r.employeeId)) : allRecs;
          console.log(`[DIXI-DEBUG] grupo ${mesObraKey}: allRecs=${allRecs.length} recs(pós-seletivo)=${recs.length} | kelly=${recs.filter((r:any)=>r.employeeId===141).length}`);
          if (recs.length === 0) continue;
          mesesAfetados.add(mesRef);

          const mesStart = `${mesRef}-01`;
          const mesEnd = lastDayOfMonth(mesRef);
          const lockedRanges = await getLockedRangesInWindow(db, input, mesStart, mesEnd);
          const isDateInLocked = (d: string): boolean => {
            for (const r of lockedRanges) {
              if (d >= r.dataInicioCiclo && d <= r.dataFimCiclo) return true;
            }
            return false;
          };

          // Delete old records for this (mesRef, groupObraId) combo
          const empIdsInGroup = Array.from(new Set(recs.map((r: any) => r.employeeId))) as number[];
          if (isSelective && selectedSet) {
            const selIds = input.selectedEmployeeIds!.filter(id => empIdsInGroup.includes(id));
            for (let i = 0; i < selIds.length; i += 50) {
              const batch = selIds.slice(i, i + 50);
              const baseConds = [
                companyFilter(timeRecords.companyId, input),
                eq(timeRecords.mesReferencia, mesRef),
                eq(timeRecords.obraId, groupObraId),
                eq(timeRecords.fonte, "dixi"),
                inArray(timeRecords.employeeId, batch),
              ];
              for (const r of lockedRanges) {
                baseConds.push(sql`NOT (${timeRecords.data} BETWEEN ${r.dataInicioCiclo}::date AND ${r.dataFimCiclo}::date)`);
              }
              await db.delete(timeRecords).where(and(...baseConds));
              const incConds = [
                companyFilter(timeInconsistencies.companyId, input),
                eq(timeInconsistencies.mesReferencia, mesRef),
                eq(timeInconsistencies.obraId, groupObraId),
                inArray(timeInconsistencies.employeeId, batch),
              ];
              for (const r of lockedRanges) {
                incConds.push(sql`NOT (${timeInconsistencies.data} BETWEEN ${r.dataInicioCiclo}::date AND ${r.dataFimCiclo}::date)`);
              }
              await db.delete(timeInconsistencies).where(and(...incConds));
            }
          } else {
            // For shared SNs, only delete records of employees in this group
            if (fileSharedSnObras.length > 1) {
              for (let i = 0; i < empIdsInGroup.length; i += 50) {
                const batch = empIdsInGroup.slice(i, i + 50);
                const baseConds = [
                  companyFilter(timeRecords.companyId, input),
                  eq(timeRecords.mesReferencia, mesRef),
                  eq(timeRecords.obraId, groupObraId),
                  eq(timeRecords.fonte, "dixi"),
                  inArray(timeRecords.employeeId, batch),
                ];
                for (const r of lockedRanges) {
                  baseConds.push(sql`NOT (${timeRecords.data} BETWEEN ${r.dataInicioCiclo}::date AND ${r.dataFimCiclo}::date)`);
                }
                await db.delete(timeRecords).where(and(...baseConds));
                const incConds = [
                  companyFilter(timeInconsistencies.companyId, input),
                  eq(timeInconsistencies.mesReferencia, mesRef),
                  eq(timeInconsistencies.obraId, groupObraId),
                  inArray(timeInconsistencies.employeeId, batch),
                ];
                for (const r of lockedRanges) {
                  incConds.push(sql`NOT (${timeInconsistencies.data} BETWEEN ${r.dataInicioCiclo}::date AND ${r.dataFimCiclo}::date)`);
                }
                await db.delete(timeInconsistencies).where(and(...incConds));
              }
            } else {
              const baseConds = [
                companyFilter(timeRecords.companyId, input),
                eq(timeRecords.mesReferencia, mesRef),
                eq(timeRecords.obraId, groupObraId),
                eq(timeRecords.fonte, "dixi"),
              ];
              for (const r of lockedRanges) {
                baseConds.push(sql`NOT (${timeRecords.data} BETWEEN ${r.dataInicioCiclo}::date AND ${r.dataFimCiclo}::date)`);
              }
              await db.delete(timeRecords).where(and(...baseConds));
              const incConds = [
                companyFilter(timeInconsistencies.companyId, input),
                eq(timeInconsistencies.mesReferencia, mesRef),
                eq(timeInconsistencies.obraId, groupObraId),
              ];
              for (const r of lockedRanges) {
                incConds.push(sql`NOT (${timeInconsistencies.data} BETWEEN ${r.dataInicioCiclo}::date AND ${r.dataFimCiclo}::date)`);
              }
              await db.delete(timeInconsistencies).where(and(...incConds));
            }
          }

          // Filtrar registros DIXI onde já existe lançamento manual para o mesmo funcionário/dia
          let recsParaInserir = recs.filter((r: any) => !isDateInLocked(String(r.data)));
          if (recsParaInserir.length > 0) {
            const empIds = [...new Set(recsParaInserir.map((r: any) => r.employeeId))];
            const manuaisExistentes = await db.execute(sql`
              SELECT "employeeId", data FROM time_records
              WHERE "companyId" = ${input.companyId}
                AND fonte = 'manual'
                AND "employeeId" IN (${sql.join(empIds.map((id: number) => sql`${id}`), sql`, `)})
                AND data BETWEEN ${`${mesRef}-01`} AND ${lastDayOfMonth(mesRef)}
            `);
            const manualSet = new Set((manuaisExistentes.rows as any[]).map((r: any) => `${r.employeeId}|${r.data}`));
            recsParaInserir = recsParaInserir.filter((r: any) => !manualSet.has(`${r.employeeId}|${r.data}`));
          }
          console.log(`[DIXI-DEBUG] grupo ${mesObraKey}: recsParaInserir=${recsParaInserir.length} | kelly=${recsParaInserir.filter((r:any)=>r.employeeId===141).length}`);
          if (recsParaInserir.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < recsParaInserir.length; i += batchSize) {
              const batch = recsParaInserir.slice(i, i + batchSize);
              await db.insert(timeRecords).values(batch);
            }
            fileActualInserted += recsParaInserir.length;
          }

          const allGroupIncons = inconsByMesObra[mesObraKey] || [];
          const monthIncons = (selectedSet ? allGroupIncons.filter((i: any) => selectedSet.has(i.employeeId)) : allGroupIncons)
            .filter((i: any) => !isDateInLocked(String(i.data)));
          if (monthIncons.length > 0) {
            const batchSize = 50;
            for (let i = 0; i < monthIncons.length; i += batchSize) {
              const batch = monthIncons.slice(i, i + batchSize);
              await db.insert(timeInconsistencies).values(batch);
            }
          }

          // Rateio per obra group
          if (isSelective && selectedSet) {
            const selIds = input.selectedEmployeeIds!.filter(id => empIdsInGroup.includes(id));
            for (let i = 0; i < selIds.length; i += 50) {
              const batch = selIds.slice(i, i + 50);
              await db.delete(obraHorasRateio).where(
                and(
                  companyFilter(obraHorasRateio.companyId, input),
                  eq(obraHorasRateio.mesAno, mesRef),
                  eq(obraHorasRateio.obraId, groupObraId),
                  inArray(obraHorasRateio.employeeId, batch),
                )
              );
            }
          } else {
            if (fileSharedSnObras.length > 1) {
              for (let i = 0; i < empIdsInGroup.length; i += 50) {
                const batch = empIdsInGroup.slice(i, i + 50);
                await db.delete(obraHorasRateio).where(
                  and(
                    companyFilter(obraHorasRateio.companyId, input),
                    eq(obraHorasRateio.mesAno, mesRef),
                    eq(obraHorasRateio.obraId, groupObraId),
                    inArray(obraHorasRateio.employeeId, batch),
                  )
                );
              }
            } else {
              await db.delete(obraHorasRateio).where(
                and(
                  companyFilter(obraHorasRateio.companyId, input),
                  eq(obraHorasRateio.mesAno, mesRef),
                  eq(obraHorasRateio.obraId, groupObraId),
                )
              );
            }
          }

          const empIds = Array.from(new Set(recsParaInserir.map((r: any) => r.employeeId)));
          if (empIds.length === 0) continue;
          const empValores = await db.select({
            id: employees.id,
            valorHora: employees.valorHora,
          }).from(employees).where(inArray(employees.id, empIds));
          const valorHoraMap: Record<number, number> = {};
          for (const e of empValores) {
            valorHoraMap[e.id] = parseBRL(e.valorHora);
          }

          const rateioByEmp: Record<number, { horasNormais: number; horasExtras: number; totalHoras: number; dias: number }> = {};
          for (const rec of recsParaInserir) {
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
              obraId: groupObraId,
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

        totalImported += fileActualInserted;
        totalInconsistencies += inconsistencies.length;
        totalUnmatched = [...totalUnmatched, ...unmatchedNames];

        // Collect months found in this file
        const mesesNoArquivo = Array.from(new Set(Object.keys(recordsByMesObra).map(k => k.split("|")[0]))).sort();

        fileResults.push({
          fileName: file.fileName,
          deviceSerial,
          obraNome,
          obraId,
          isSharedSn: fileSharedSnObras.length > 1,
          sharedSnObras: fileSharedSnObras.length > 1 ? fileSharedSnObras : undefined,
          mesesDetectados: mesesNoArquivo,
          totalRegistrosBrutos: records.length,
          totalDiasProcessados: fileActualInserted,
          totalInconsistencias: inconsistencies.length,
          funcionariosNaoEncontrados: unmatchedNames,
          funcionariosProcessados: new Set(timeRecordsToInsert.filter((r: any) => !selectedSet || selectedSet.has(r.employeeId)).map(r => r.employeeId)).size,
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      obraId: z.number().optional(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [
        companyFilter(timeRecords.companyId, input),
        eq(timeRecords.mesReferencia, input.mesReferencia),
        // Rev. 2075 — RH controla ponto APENAS de CLT. PJ não bate ponto.
        // COALESCE garante que linhas legadas com tipoContrato NULL (defaults
        // antigos CLT) continuem visíveis. Filtro defensivo em todos os
        // endpoints de Fechamento de Ponto pra evitar leak de PJ no futuro.
        sql`COALESCE(${employees.tipoContrato}, 'CLT') <> 'PJ'`,
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      obraId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [
        companyFilter(timeRecords.companyId, input),
        // Rev. 2075 — RH controla ponto APENAS de CLT. PJ não bate ponto.
        // Filtra rankings (Pontuais/Atrasados/HE/Faltosos) + KPIs derivados.
        sql`COALESCE(${employees.tipoContrato}, 'CLT') <> 'PJ'`,
      ];
      // Quando o ciclo não coincide com o mês calendário (ex: 16/03–15/04),
      // usar range de datas para pegar registros dos dois meses envolvidos.
      if (input.dataInicio && input.dataFim) {
        conditions.push(sql`${timeRecords.data} >= ${input.dataInicio} AND ${timeRecords.data} <= ${input.dataFim}`);
      } else {
        conditions.push(eq(timeRecords.mesReferencia, input.mesReferencia));
      }
      if (input.obraId) conditions.push(eq(timeRecords.obraId, input.obraId));

      const recs = await db.select({
        employeeId: timeRecords.employeeId,
        employeeName: employees.nomeCompleto,
        employeeCpf: employees.cpf,
        employeeFuncao: employees.funcao,
        employeeStatus: employees.status,
        employeeCargoConfianca: employees.cargoConfianca,
        // Rev. 2015 — foto pra avatar circular ao lado do nome
        employeeFotoUrl: employees.fotoUrl,
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
            employeeStatus: r.employeeStatus,
            cargoConfianca: !!(r as any).employeeCargoConfianca,
            employeeFotoUrl: (r as any).employeeFotoUrl || null,
            obraId: r.obraId,
            obraIds: new Set<number>(),
            datesSet: new Set<string>(),
            diasTrabalhados: 0,
            totalMinutosTrabalhados: 0,
            totalMinutosExtras: 0,
            totalMinutosAtrasos: 0,
            temAjusteManual: false,
          };
        }
        const emp = byEmployee[r.employeeId];
        // Conta dias únicos: se já existe registro manual para esse dia, o DIXI não conta novamente
        if (!emp.datesSet.has(r.data)) {
          emp.datesSet.add(r.data);
          emp.diasTrabalhados++;
        }
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

      // Rev. 2054 — Férias no período: detecta colaboradores que estiveram em gozo de
      // férias em qualquer dia do ciclo, pra excluir do ranking "Menos Dias Trabalhados"
      // (injusto contar quem estava de férias como "pouco trabalho"). Suporta 3 fracionamentos.
      const periodoIniBound = input.dataInicio || `${input.mesReferencia}-01`;
      const [yyB, mmB] = input.mesReferencia.split("-").map(Number);
      const periodoFimBound = input.dataFim || `${input.mesReferencia}-${String(new Date(yyB, mmB, 0).getDate()).padStart(2, "0")}`;
      const feriasNoCiclo = await db.select({
        employeeId: vacationPeriods.employeeId,
        dataInicio: vacationPeriods.dataInicio,
        dataFim: vacationPeriods.dataFim,
        periodo2Inicio: vacationPeriods.periodo2Inicio,
        periodo2Fim: vacationPeriods.periodo2Fim,
        periodo3Inicio: vacationPeriods.periodo3Inicio,
        periodo3Fim: vacationPeriods.periodo3Fim,
      }).from(vacationPeriods).where(
        and(
          companyFilter(vacationPeriods.companyId, input),
          sql`${vacationPeriods.status} NOT IN ('cancelada', 'pendente')`,
          isNull(vacationPeriods.deletedAt),
        )
      );
      const overlap = (ini: string | null, fim: string | null) =>
        !!ini && !!fim && !(fim < periodoIniBound || ini > periodoFimBound);
      const overlapDays = (ini: string | null, fim: string | null): number => {
        if (!overlap(ini, fim)) return 0;
        const a = (ini! < periodoIniBound) ? periodoIniBound : ini!;
        const b = (fim! > periodoFimBound) ? periodoFimBound : fim!;
        const ms = new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime();
        return Math.max(0, Math.round(ms / 86400000) + 1);
      };
      const feriasByEmp: Record<number, { emFerias: boolean; diasFerias: number }> = {};
      for (const f of feriasNoCiclo) {
        const dias =
          overlapDays(f.dataInicio, f.dataFim) +
          overlapDays(f.periodo2Inicio, f.periodo2Fim) +
          overlapDays(f.periodo3Inicio, f.periodo3Fim);
        if (dias > 0) {
          const cur = feriasByEmp[f.employeeId] || { emFerias: false, diasFerias: 0 };
          feriasByEmp[f.employeeId] = { emFerias: true, diasFerias: cur.diasFerias + dias };
        }
      }

      // Fetch active termination notices for this company/month
      const activeAvisos = await db.select({
        employeeId: terminationNotices.employeeId,
        dataInicio: terminationNotices.dataInicio,
        dataFim: terminationNotices.dataFim,
        reducaoJornada: terminationNotices.reducaoJornada,
      }).from(terminationNotices).where(
        and(
          companyFilter(terminationNotices.companyId, input),
          eq(terminationNotices.status, 'em_andamento'),
          sql`${terminationNotices.tipo} IN ('empregador_trabalhado', 'empregado_trabalhado')`,
          sql`${terminationNotices.deletedAt} IS NULL`,
        )
      );
      const avisoPrevioEmployeeIds = new Set(activeAvisos.map(a => a.employeeId));

      // Rev. 2015 — CIPA: identifica quem é membro ATIVO ou está em ESTABILIDADE pós-mandato.
      // Pula tudo se não há nenhum employee na lista (range vazio).
      const allEmployeeIdsArr = Object.keys(byEmployee).map(Number);
      const cipaInfoByEmp: Record<number, { status: 'ativo' | 'estabilidade'; cargoCipa: string | null; fimEstabilidade: string | null }> = {};
      if (allEmployeeIdsArr.length > 0) {
        try {
          const { cipaMembers } = await import("../../drizzle/schema");
          const hojeStr = new Date().toISOString().slice(0, 10);
          const cipaRows = await db.select({
            employeeId: cipaMembers.employeeId,
            cargoCipa: cipaMembers.cargoCipa,
            statusMembro: cipaMembers.statusMembro,
            inicioEstabilidade: cipaMembers.inicioEstabilidade,
            fimEstabilidade: cipaMembers.fimEstabilidade,
          })
            .from(cipaMembers)
            .where(and(
              companyFilter(cipaMembers.companyId, input),
              inArray(cipaMembers.employeeId, allEmployeeIdsArr),
            ));
          // Pode haver várias linhas por employee (mandatos antigos). Decide a "melhor":
          // 1º Ativo (statusMembro=Ativo); 2º Estabilidade vigente (hoje <= fimEstabilidade)
          // Mantém também o cargoCipa pra exibir tooltip.
          for (const row of cipaRows) {
            const empId = row.employeeId;
            const existing = cipaInfoByEmp[empId];
            // Ativo tem prioridade
            if (String(row.statusMembro || '').trim().toLowerCase() === 'ativo') {
              cipaInfoByEmp[empId] = { status: 'ativo', cargoCipa: row.cargoCipa, fimEstabilidade: row.fimEstabilidade };
              continue;
            }
            // Estabilidade vigente? Só se ainda não tiver nada OU o existing for outra estabilidade mais antiga
            if (row.fimEstabilidade && row.fimEstabilidade >= hojeStr) {
              if (!existing || (existing.status === 'estabilidade' && (existing.fimEstabilidade ?? '') < row.fimEstabilidade)) {
                cipaInfoByEmp[empId] = { status: 'estabilidade', cargoCipa: row.cargoCipa, fimEstabilidade: row.fimEstabilidade };
              }
            }
          }
        } catch (err: any) {
          console.warn('[getSummary] CIPA lookup falhou:', err?.message);
        }
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

      const STATUS_INATIVOS = ['Desligado', 'Afastado', 'Recluso', 'Lista_Negra'];
      return Object.values(byEmployee).map((emp: any) => {
        const obraIdsArr = Array.from(emp.obraIds) as number[];
        const statusInativo = STATUS_INATIVOS.includes(emp.employeeStatus);
        const cipa = cipaInfoByEmp[emp.employeeId] || null;
        return {
          ...emp,
          obraIds: obraIdsArr,
          obraNomes: obraIdsArr.map((id: number) => obraNameMap[id] || `Obra #${id}`),
          multiplasObras: obraIdsArr.length > 1,
          horasTrabalhadas: minutesToHHMM(emp.totalMinutosTrabalhados),
          horasExtras: minutesToHHMM(emp.totalMinutosExtras),
          atrasos: minutesToHHMM(emp.totalMinutosAtrasos),
          emAvisoPrevio: avisoPrevioEmployeeIds.has(emp.employeeId),
          alertaInativo: statusInativo,
          // Rev. 2054 — Férias no ciclo (pra excluir do ranking "Menos Dias Trabalhados")
          emFerias: !!feriasByEmp[emp.employeeId]?.emFerias,
          diasFerias: feriasByEmp[emp.employeeId]?.diasFerias || 0,
          // Rev. 2015 — CIPA marker
          cipaStatus: cipa?.status || null,           // 'ativo' | 'estabilidade' | null
          cipaCargo: cipa?.cargoCipa || null,         // "Presidente", "Vice", "Secretário", "Membro Titular" etc.
          cipaFimEstabilidade: cipa?.fimEstabilidade || null, // YYYY-MM-DD
        };
      });
    }),

  // List inconsistencies
  listInconsistencies: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      obraId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions: any[] = [
        companyFilter(timeInconsistencies.companyId, input),
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

      // Buscar atestados que cobrem o mês para excluir inconsistências de dias com atestado
      const { atestados: atSchema } = await import('../../drizzle/schema');
      const [yy, mm] = input.mesReferencia.split("-").map(Number);
      const prevMonthAtStart = new Date(yy, mm - 7, 1).toISOString().substring(0, 10);
      const mesEnd = `${input.mesReferencia}-${String(new Date(yy, mm, 0).getDate()).padStart(2, "0")}`;
      const atestList = await db.select().from(atSchema)
        .where(and(companyFilter(atSchema.companyId, input), sql`${atSchema.deletedAt} IS NULL`, sql`${atSchema.dataEmissao} >= ${prevMonthAtStart}`, sql`${atSchema.dataEmissao} <= ${mesEnd}`));
      const atestSet = new Set<string>();
      for (const at of atestList) {
        if (!at.employeeId || !at.dataEmissao) continue;
        const afTipo = (at as any).afastamentoTipo || 'dia';
        if (afTipo === 'horas') {
          atestSet.add(`${at.employeeId}-${at.dataEmissao}`);
        } else {
          const dias = at.diasAfastamento || 1;
          const sd = new Date(at.dataEmissao + 'T12:00:00Z');
          for (let d = 0; d < dias; d++) {
            const dt = new Date(sd); dt.setUTCDate(sd.getUTCDate() + d);
            atestSet.add(`${at.employeeId}-${dt.toISOString().substring(0, 10)}`);
          }
        }
      }

      // Buscar IDs de funcionários com cargo de confiança (CLT Art. 62, II)
      const cargoConfiancaEmps = await db.select({ id: employees.id })
        .from(employees)
        .where(and(companyFilter(employees.companyId, input), sql`${employees.cargoConfianca} = 1`, sql`${employees.deletedAt} IS NULL`));
      const cargoConfiancaIds = new Set(cargoConfiancaEmps.map(e => e.id));

      // Filtrar: excluir sem_registro de dias cobertos por atestado ou de cargo de confiança
      const filtered = results.filter(r => {
        if (r.inconsistency.tipoInconsistencia === 'sem_registro' && atestSet.has(`${r.inconsistency.employeeId}-${r.inconsistency.data}`)) {
          return false;
        }
        if (r.inconsistency.tipoInconsistencia === 'sem_registro' && cargoConfiancaIds.has(r.inconsistency.employeeId)) {
          return false;
        }
        return true;
      });

      // Fetch time records for each inconsistency's employee+date to show context
      const enriched = await Promise.all(filtered.map(async (r) => {
        const dayRecords = await db.select({
          record: timeRecords,
          obraNome: obras.nome,
        })
          .from(timeRecords)
          .leftJoin(obras, eq(timeRecords.obraId, obras.id))
          .where(and(
            companyFilter(timeRecords.companyId, input),
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
      const userName = input.resolvidoPor || ctx.user?.name || "RH";
      const hoje = new Date().toISOString().split("T")[0];

      // Per-day lock: refuse if the inconsistency's date is inside a consolidated cycle.
      const [incLock] = await db.select({ data: timeInconsistencies.data, companyId: timeInconsistencies.companyId })
        .from(timeInconsistencies).where(eq(timeInconsistencies.id, input.id)).limit(1);
      if (incLock?.data) {
        await assertDateNotLocked(db, { companyId: incLock.companyId }, String(incLock.data));
      }

      // Se for advertência, criar registro no módulo de warnings
      let warningId: number | null = null;
      if (input.status === "advertencia") {
        // Buscar dados da inconsistência para preencher a advertência
        const [inc] = await db.select().from(timeInconsistencies)
          .where(eq(timeInconsistencies.id, input.id)).limit(1);
        if (inc) {
          // Contar advertências existentes do funcionário para definir sequência
          const existingWarnings = await db.select().from(warnings)
            .where(and(eq(warnings.employeeId, inc.employeeId), isNull(warnings.deletedAt)));
          const totalAdv = existingWarnings.filter(w => w.tipoAdvertencia === "Verbal" || w.tipoAdvertencia === "Escrita").length;
          const sequencia = totalAdv + 1;
          // Definir tipo: 1ª e 2ª são Verbal, 3ª em diante Escrita
          const tipoAdv = sequencia <= 2 ? "Verbal" as const : "Escrita" as const;

          const result = await db.insert(warnings).values({
            companyId: inc.companyId,
            employeeId: inc.employeeId,
            tipoAdvertencia: tipoAdv,
            sequencia,
            dataOcorrencia: inc.data,
            motivo: `Inconsistência de ponto: ${inc.descricao || inc.tipoInconsistencia}`,
            descricao: input.justificativa || `Advertência gerada automaticamente a partir de inconsistência de ponto (${inc.tipoInconsistencia}) do dia ${inc.data}. ${inc.descricao || ""}`,
            aplicadoPor: userName,
            origemModulo: "fechamento_ponto",
            origemId: inc.id,
          });
          warningId = Number(result[0].id);
        }
      }

      await db.update(timeInconsistencies)
        .set({
          status: input.status,
          justificativa: input.justificativa || null,
          resolvidoPor: userName,
          resolvidoEm: hoje,
          warningId: warningId,
        })
        .where(eq(timeInconsistencies.id, input.id));
      return { success: true, warningId };
    }),

  // Manual time record entry/update
  manualEntry: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
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
      motivoAjuste: z.string().optional(),
      tipoDia: z.enum(["normal", "feriado", "atestado", "bh"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Quando o dia é marcado como Feriado, Atestado ou BH (Banco de Horas),
      // zera batidas/horas automaticamente — o dia é abonado, não há jornada
      // a contabilizar. No caso de BH, a falta é debitada do saldo do banco
      // de horas do funcionário (lógica adicional após o save do time_record).
      const tipoDia = input.tipoDia ?? "normal";
      const isAbonado = tipoDia === "feriado" || tipoDia === "atestado" || tipoDia === "bh";

      // Bloqueia lançamento em dia de férias
      const feriasAtivas = await db.select({
        dataInicio: vacationPeriods.dataInicio,
        dataFim: vacationPeriods.dataFim,
        periodo2Inicio: vacationPeriods.periodo2Inicio,
        periodo2Fim: vacationPeriods.periodo2Fim,
        periodo3Inicio: vacationPeriods.periodo3Inicio,
        periodo3Fim: vacationPeriods.periodo3Fim,
      }).from(vacationPeriods).where(
        and(
          companyFilter(vacationPeriods.companyId, input),
          eq(vacationPeriods.employeeId, input.employeeId),
          sql`${vacationPeriods.status} NOT IN ('cancelada', 'pendente')`,
          isNull(vacationPeriods.deletedAt),
        )
      );
      const inRange = (d: string, start: string | null, end: string | null) =>
        start && end ? d >= start && d <= end : false;
      const emFerias = feriasAtivas.some(f =>
        inRange(input.data, f.dataInicio, f.dataFim) ||
        inRange(input.data, f.periodo2Inicio, f.periodo2Fim) ||
        inRange(input.data, f.periodo3Inicio, f.periodo3Fim)
      );
      if (emFerias) {
        // Rev. 1231: durante férias, só bloquear LANÇAMENTO inédito.
        // Se já existe registro do dia (ex.: batida indevida da catraca),
        // permitir EDIÇÃO/correção manual — caso contrário o usuário fica
        // sem como zerar/ajustar batidas espúrias durante o período.
        const jaExiste = await db.select({ id: timeRecords.id })
          .from(timeRecords)
          .where(and(
            companyFilter(timeRecords.companyId, input),
            eq(timeRecords.employeeId, input.employeeId),
            eq(timeRecords.data, input.data),
          ))
          .limit(1);
        if (jaExiste.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `O dia ${input.data} está dentro de um período de férias do funcionário. Não é permitido lançar ponto neste dia.`,
          });
        }
        // Existe registro: segue o fluxo normal (será sobrescrito como ajusteManual).
      }

      // Per-day lock: refuse if data is inside a consolidated cycle.
      await assertDateNotLocked(db, input, input.data);

      let totalMinutes = 0;
      if (!isAbonado) {
        if (input.entrada1 && input.saida1) totalMinutes += diffMinutes(input.entrada1, input.saida1);
        if (input.entrada2 && input.saida2) totalMinutes += diffMinutes(input.entrada2, input.saida2);
        if (input.entrada3 && input.saida3) totalMinutes += diffMinutes(input.entrada3, input.saida3);
      }

      // Fetch employee jornada to compute overtime correctly.
      // Importante: validar tenant — só ler/alterar funcionário que pertença ao
      // escopo da empresa (companyFilter), evitando vazamento entre tenants já
      // que esse endpoint mexe em ponto e em banco_horas_saldo/lancamentos.
      const empData = await db.select({ jornadaTrabalho: employees.jornadaTrabalho })
        .from(employees).where(and(
          eq(employees.id, input.employeeId),
          companyFilter(employees.companyId, input),
        )).limit(1);
      if (empData.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Funcionário ${input.employeeId} não pertence ao escopo da empresa ${input.companyId}.`,
        });
      }
      const jornadaFunc = empData[0]?.jornadaTrabalho ?? null;
      // Jornada da OBRA do lançamento prevalece sobre a do funcionário.
      let obraJornadaManual: string | null = null;
      if (input.obraId) {
        try {
          const [oj] = await db.select({ j: obras.jornadaTrabalho }).from(obras).where(and(eq(obras.id, input.obraId), companyFilter(obras.companyId, input)));
          if (oj && obraTemJornada(oj.j)) obraJornadaManual = oj.j as any;
        } catch { /* sem jornada de obra → usa a do funcionário */ }
      }
      const jornadaTrabalho = jornadaEfetiva(jornadaFunc, obraJornadaManual);
      const dow = new Date(input.data + "T12:00:00Z").getUTCDay();
      const isWeekendDay = dow === 0 || dow === 6;
      // Weekend: 100% das horas trabalhadas = hora extra
      const expectedMins = isWeekendDay ? 0 : getExpectedMinsFromJornada(jornadaTrabalho, input.data);
      const heMins = isAbonado ? 0
        : (isWeekendDay ? totalMinutes : (expectedMins !== null ? Math.max(0, totalMinutes - expectedMins) : 0));
      const atrasoMins = !isAbonado && !isWeekendDay && expectedMins !== null && totalMinutes < expectedMins && totalMinutes > 0
        ? Math.max(0, expectedMins - totalMinutes)
        : 0;

      // Pré-validação BH (sem I/O): se for marcar como BH, a jornada esperada
      // do dia precisa existir (sem jornada não há quanto debitar). Validamos
      // antes de abrir transação para falhar rápido com mensagem clara.
      if (tipoDia === "bh") {
        const debitMinsCheck = isWeekendDay ? 0 : (expectedMins ?? 0);
        if (debitMinsCheck <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Dia ${input.data} não tem jornada esperada (fim de semana ou jornada não cadastrada). Não é possível alocar como Banco de Horas.`,
          });
        }
      }

      // Build justificativa with motivo
      const motivoPrefix = input.motivoAjuste ? `[${input.motivoAjuste}] ` : "";
      const justFinal = motivoPrefix + (input.justificativa || "");

      const record = {
        companyId: input.companyId,
        employeeId: input.employeeId,
        obraId: input.obraId || null,
        mesReferencia: input.mesReferencia,
        data: input.data,
        entrada1: isAbonado ? null : (input.entrada1 || null),
        saida1:   isAbonado ? null : (input.saida1   || null),
        entrada2: isAbonado ? null : (input.entrada2 || null),
        saida2:   isAbonado ? null : (input.saida2   || null),
        entrada3: isAbonado ? null : (input.entrada3 || null),
        saida3:   isAbonado ? null : (input.saida3   || null),
        horasTrabalhadas: minutesToHHMM(totalMinutes),
        horasExtras: minutesToHHMM(heMins),
        horasNoturnas: "0:00",
        faltas: "0",
        atrasos: atrasoMins > 0 ? minutesToHHMM(atrasoMins) : "0:00",
        fonte: "manual",
        ajusteManual: 1,
        ajustadoPor: ctx.user?.name || "RH",
        justificativa: justFinal || null,
        tipoDia,
      };

      // Atomicidade: salvar o ponto, estornar débito BH anterior (se houver) e
      // aplicar o novo débito BH dentro de uma única transação. Sem isso, uma
      // falha intermediária poderia deixar o dia com tipoDia='bh' sem débito
      // correspondente — ou, na re-edição, estornar o débito antigo sem
      // aplicar o novo. O delete-then-insert do lançamento [BH-FALTA] dentro
      // da mesma transação também serializa execuções concorrentes do mesmo
      // (employeeId, companyId, data) via lock de linha em time_records.
      const saveAction = await db.transaction(async (tx: any) => {
        // Serialização contra corrida: advisory lock por (employeeId, data).
        // Sem unique constraint em time_records(companyId, employeeId, data) ou
        // em banco_horas_lancamentos(employeeId, companyId, data, [BH-FALTA]),
        // duas requisições concorrentes para o mesmo dia poderiam ambas
        // observar "sem registro" e ambas inserir, gerando duplicatas e débito
        // BH em duplicidade. O advisory_xact_lock segura até o COMMIT/ROLLBACK
        // desta transação — só uma execução por (empregado, dia) avança por
        // vez. Não bloqueia outros empregados/dias.
        const [yLk, mLk, dLk] = input.data.split("-").map(Number);
        const dateKey = (yLk * 10000) + (mLk * 100) + dLk;
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.employeeId}, ${dateKey})`);

        const existing = await tx.select().from(timeRecords)
          .where(and(
            companyFilter(timeRecords.companyId, input),
            eq(timeRecords.employeeId, input.employeeId),
            eq(timeRecords.data, input.data),
          ))
          .limit(1);
        const prevTipoDia: string = (existing[0] as any)?.tipoDia ?? "normal";

        let action: "updated" | "created";
        if (existing.length > 0) {
          await tx.update(timeRecords).set(record as any).where(eq(timeRecords.id, existing[0].id));
          // Apagar quaisquer outros registros DIXI do mesmo funcionário/dia (não o que acabamos de salvar)
          await tx.execute(sql`
            DELETE FROM time_records
            WHERE "companyId" = ${input.companyId}
              AND "employeeId" = ${input.employeeId}
              AND data = ${input.data}
              AND fonte = 'dixi'
              AND id != ${existing[0].id}
          `);
          await tx.update(timeInconsistencies)
            .set({ status: "ajustado", resolvidoPor: ctx.user?.name || "RH", resolvidoEm: new Date().toISOString().split("T")[0] })
            .where(and(
              companyFilter(timeInconsistencies.companyId, input),
              eq(timeInconsistencies.employeeId, input.employeeId),
              eq(timeInconsistencies.data, input.data),
              eq(timeInconsistencies.status, "pendente"),
            ));
          action = "updated";
        } else {
          // Apagar DIXI existente antes de inserir o manual
          await tx.execute(sql`
            DELETE FROM time_records
            WHERE "companyId" = ${input.companyId}
              AND "employeeId" = ${input.employeeId}
              AND data = ${input.data}
              AND fonte = 'dixi'
          `);
          await tx.insert(timeRecords).values(record as any);
          // Mesma resolução automática do branch de UPDATE: ao corrigir uma
          // inconsistência cujo dia ainda não tinha registro (ex.: sem_registro /
          // falta_batida), o lançamento manual também deve marcá-la como
          // "ajustado" — caso contrário ela permaneceria pendente na lista.
          await tx.update(timeInconsistencies)
            .set({ status: "ajustado", resolvidoPor: ctx.user?.name || "RH", resolvidoEm: new Date().toISOString().split("T")[0] })
            .where(and(
              companyFilter(timeInconsistencies.companyId, input),
              eq(timeInconsistencies.employeeId, input.employeeId),
              eq(timeInconsistencies.data, input.data),
              eq(timeInconsistencies.status, "pendente"),
            ));
          action = "created";
        }

        // BH (Banco de Horas): pós-save — estorna débito anterior (se o dia
        // já era BH) e/ou aplica novo débito (se a edição marcou como BH).
        // Marcador "[BH-FALTA]" identifica os lançamentos criados por aqui,
        // sem interferir nos demais lançamentos do banco de horas (HE, ajustes
        // manuais via tela de Banco de Horas, etc.). Como estamos em transação,
        // o delete-then-insert é atômico e idempotente.
        if (prevTipoDia === "bh") {
          const prevLancRows = ((await tx.execute(sql`
            SELECT id, minutos FROM banco_horas_lancamentos
            WHERE "employeeId" = ${input.employeeId}
              AND "companyId" = ${input.companyId}
              AND data = ${input.data}
              AND descricao LIKE '[BH-FALTA]%'
          `)) as any).rows || [];
          for (const lanc of prevLancRows) {
            const credit = Number(lanc.minutos) || 0;
            if (credit > 0) {
              await tx.execute(sql`
                INSERT INTO banco_horas_saldo ("employeeId", "companyId", "saldoMinutos", "atualizadoEm")
                VALUES (${input.employeeId}, ${input.companyId}, ${credit}, NOW())
                ON CONFLICT ("employeeId", "companyId")
                DO UPDATE SET "saldoMinutos" = banco_horas_saldo."saldoMinutos" + ${credit}, "atualizadoEm" = NOW()
              `);
            }
            await tx.execute(sql`
              DELETE FROM banco_horas_lancamentos WHERE id = ${lanc.id}
            `);
          }
        }
        if (tipoDia === "bh") {
          const debitMins = expectedMins ?? 0;
          if (debitMins > 0) {
            // Defesa em profundidade contra corrida: apaga qualquer lançamento
            // [BH-FALTA] residual do mesmo dia antes do INSERT (caso o
            // prevTipoDia tenha mudado entre a SELECT e a UPDATE de outra
            // requisição concorrente). Sob a transação atual e o lock de linha
            // de time_records, isso garante exatamente um lançamento por dia.
            await tx.execute(sql`
              DELETE FROM banco_horas_lancamentos
              WHERE "employeeId" = ${input.employeeId}
                AND "companyId" = ${input.companyId}
                AND data = ${input.data}
                AND descricao LIKE '[BH-FALTA]%'
            `);
            const dataBr = input.data.split("-").reverse().join("/");
            const desc = `[BH-FALTA] Falta convertida em Banco de Horas — ${dataBr}`;
            await tx.execute(sql`
              INSERT INTO banco_horas_saldo ("employeeId", "companyId", "saldoMinutos", "atualizadoEm")
              VALUES (${input.employeeId}, ${input.companyId}, ${-debitMins}, NOW())
              ON CONFLICT ("employeeId", "companyId")
              DO UPDATE SET "saldoMinutos" = banco_horas_saldo."saldoMinutos" + ${-debitMins}, "atualizadoEm" = NOW()
            `);
            await tx.execute(sql`
              INSERT INTO banco_horas_lancamentos ("employeeId", "companyId", tipo, minutos, descricao, data, "criadoEm", "criadoPor", "minutosBase", "minutosAcrescimo")
              VALUES (${input.employeeId}, ${input.companyId}, 'debito', ${debitMins}, ${desc}, ${input.data}, NOW(), ${ctx.user?.name || 'RH'}, ${debitMins}, 0)
            `);
          }
        }

        return action;
      });

      return { success: true, action: saveAction };
    }),

  // Get employee detail for a month (day by day) — NOW includes obra info per record
  getEmployeeDetail: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
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
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.mesReferencia, input.mesReferencia),
        ))
        .orderBy(sql`${timeRecords.obraId} ASC, ${timeRecords.data} ASC`);

      const incons = await db.select()
        .from(timeInconsistencies)
        .where(and(
          companyFilter(timeInconsistencies.companyId, input),
          eq(timeInconsistencies.employeeId, input.employeeId),
          eq(timeInconsistencies.mesReferencia, input.mesReferencia),
          eq(timeInconsistencies.status, "pendente"),
        ));

      const emp = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        cpf: employees.cpf,
        funcao: employees.funcao,
        jornadaTrabalho: employees.jornadaTrabalho,
        status: employees.status,
      }).from(employees).where(eq(employees.id, input.employeeId)).limit(1);

      // Compute HE on-the-fly for each record (no need to run "Processar Ponto")
      // Note: time_records does NOT have tipoDia — use day-of-week from date instead.
      const criteria = await getCriteriaMap(input.companyId);
      const empJornada = emp[0]?.jornadaTrabalho ?? null;

      // Jornada da OBRA prevalece sobre a do funcionário (por registro, via obraId).
      const cidsDet = resolveCompanyIds(input);
      const obraJornadaMapDet = new Map<number, string>();
      {
        const obrasJ = await db.select({ id: obras.id, j: obras.jornadaTrabalho })
          .from(obras).where(and(inArray(obras.companyId, cidsDet), isNull(obras.deletedAt)));
        for (const o of obrasJ) if (obraTemJornada(o.j)) obraJornadaMapDet.set(o.id, o.j as string);
      }
      const jornadaEfetivaRecDet = (oid: number | null): string | null => {
        if (obraJornadaMapDet.size === 0) return empJornada;
        const obraJ = oid != null ? (obraJornadaMapDet.get(oid) ?? null) : null;
        return jornadaEfetiva(empJornada, obraJ);
      };

      function computeHeForRecord(rec: any): string {
        const trabMins = hhmmToMins(rec.horasTrabalhadas);
        if (trabMins <= 0) return "0:00";
        // Skip Sundays (dow=0)
        const dateStr = rec.data instanceof Date ? rec.data.toISOString().slice(0, 10) : String(rec.data || "").slice(0, 10);
        if (!dateStr) return "0:00";
        const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
        if (dow === 0) return "0:00";
        const expected = getExpectedMinsFromJornada(jornadaEfetivaRecDet(rec.obraId ?? null), dateStr)
          ?? (criteria.jornadaHorasDiarias * 60);
        const he = Math.max(0, trabMins - expected);
        return minutesToHHMM(he);
      }

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
        byObra[obraKey].records.push({ ...r.record, horasExtras: computeHeForRecord(r.record) });
      }

      return {
        employee: emp[0] || null,
        recordsByObra: Object.values(byObra),
        records: recs.map(r => ({ ...r.record, horasExtras: computeHeForRecord(r.record) })), // flat list for backward compat
        inconsistencies: incons,
      };
    }),

  // Stats for dashboard cards
  getStats: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [
        companyFilter(timeRecords.companyId, input),
        eq(timeRecords.mesReferencia, input.mesReferencia),
        // Rev. 2075 — Excluir PJ dos KPIs (RH só controla ponto de CLT).
        // EXISTS guard pra não exigir JOIN explícito em cada SELECT COUNT.
        sql`NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = ${timeRecords.employeeId} AND e."tipoContrato" = 'PJ')`,
      ];

      const [totalRecs] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeRecords).where(and(...conditions));

      const [totalEmps] = await db.select({ count: sql<number>`COUNT(DISTINCT ${timeRecords.employeeId})` })
        .from(timeRecords).where(and(...conditions));

      const [totalIncons] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeInconsistencies)
        .where(and(
          companyFilter(timeInconsistencies.companyId, input),
          eq(timeInconsistencies.mesReferencia, input.mesReferencia),
          eq(timeInconsistencies.status, "pendente"),
          // Rev. 2075 — Excluir PJ também aqui (4ª KPI). PJ não bate ponto,
          // logo qualquer inconsistência associada a employeeId PJ é ruído.
          sql`NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = ${timeInconsistencies.employeeId} AND e."tipoContrato" = 'PJ')`,
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      tipo: z.enum(["tudo", "registros", "inconsistencias", "rateio"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new Error("Apenas administradores podem limpar a base de dados");
      const db = (await getDb())!;
      // Não apaga dados em datas dentro de ciclos consolidados.
      const mesStart = `${input.mesReferencia}-01`;
      const mesEnd = lastDayOfMonth(input.mesReferencia);
      const lockedRanges = await getLockedRangesInWindow(db, input, mesStart, mesEnd);
      const notLockedClause = lockedRanges.length > 0
        ? sql.join(lockedRanges.map(r => sql`NOT (data >= ${r.dataInicioCiclo} AND data <= ${r.dataFimCiclo})`), sql` AND `)
        : sql`TRUE`;
      if (input.tipo === "tudo" || input.tipo === "registros") {
        await db.delete(timeRecords).where(and(companyFilter(timeRecords.companyId, input), eq(timeRecords.mesReferencia, input.mesReferencia), notLockedClause));
      }
      if (input.tipo === "tudo" || input.tipo === "inconsistencias") {
        await db.delete(timeInconsistencies).where(and(companyFilter(timeInconsistencies.companyId, input), eq(timeInconsistencies.mesReferencia, input.mesReferencia), notLockedClause));
      }
      if (input.tipo === "tudo" || input.tipo === "rateio") {
        // Rateio é por mês inteiro — só permite quando não há ciclos consolidados sobrepondo o mês.
        if (lockedRanges.length === 0) {
          await db.delete(obraHorasRateio).where(and(companyFilter(obraHorasRateio.companyId, input), eq(obraHorasRateio.mesAno, input.mesReferencia)));
        }
      }
      return { success: true, lockedRanges };
    }),

  clearByPeriod: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(),
      dataInicio: z.string(),
      dataFim: z.string(),
      tipo: z.enum(["tudo", "registros", "inconsistencias"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") throw new Error("Apenas administradores podem limpar a base de dados");
      const db = (await getDb())!;
      const lockedRanges = await getLockedRangesInWindow(db, input, input.dataInicio, input.dataFim);
      const notLockedClause = lockedRanges.length > 0
        ? sql.join(lockedRanges.map(r => sql`NOT (data >= ${r.dataInicioCiclo} AND data <= ${r.dataFimCiclo})`), sql` AND `)
        : sql`TRUE`;
      let deletedRecords = 0;
      let deletedInconsistencias = 0;
      if (input.tipo === "tudo" || input.tipo === "registros") {
        const res = await db.delete(timeRecords).where(and(
          companyFilter(timeRecords.companyId, input),
          sql`${timeRecords.data} >= ${input.dataInicio}`,
          sql`${timeRecords.data} <= ${input.dataFim}`,
          notLockedClause,
        )).returning({ id: timeRecords.id });
        deletedRecords = res.length;
      }
      if (input.tipo === "tudo" || input.tipo === "inconsistencias") {
        const res = await db.delete(timeInconsistencies).where(and(
          companyFilter(timeInconsistencies.companyId, input),
          sql`${timeInconsistencies.data} >= ${input.dataInicio}`,
          sql`${timeInconsistencies.data} <= ${input.dataFim}`,
          notLockedClause,
        )).returning({ id: timeInconsistencies.id });
        deletedInconsistencias = res.length;
      }
      return { success: true, deletedRecords, deletedInconsistencias, lockedRanges };
    }),

  // ===================== VERIFICAÇÃO DE DUPLICIDADE =====================
  checkDuplicates: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [existing] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeRecords)
        .where(and(companyFilter(timeRecords.companyId, input), eq(timeRecords.mesReferencia, input.mesReferencia)));
      return { existingCount: Number(existing?.count || 0), hasData: Number(existing?.count || 0) > 0 };
    }),

  // ===================== RATEIO POR OBRA =====================
  getRateioPorObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
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
        .where(and(companyFilter(obraHorasRateio.companyId, input), eq(obraHorasRateio.mesAno, input.mesReferencia)))
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
            companyFilter(obraSns.companyId, input),
            inArray(obraSns.obraId, obraIds as number[]),
            eq(obraSns.status, "ativo"),
          )
        );
        for (const s of linkedSns) {
          if (s.obraId == null) continue;
          if (!obraSnMap[s.obraId]) obraSnMap[s.obraId] = [];
          if (obraSnMap[s.obraId].includes(s.sn)) continue; // dedup por SN
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const meses: Record<string, { status: 'vazio' | 'aberto' | 'consolidado' | 'parcial'; totalRegistros: number; consolidadoPor?: string; consolidadoEm?: string; dataInicioCiclo?: string; dataFimCiclo?: string }> = {};
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
          companyFilter(timeRecords.companyId, input),
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
      // Check consolidation status — distinguish "consolidado" vs "parcial".
      const consolidacoes = await db.select().from(pontoConsolidacao)
        .where(and(
          companyFilter(pontoConsolidacao.companyId, input),
          like(pontoConsolidacao.mesReferencia, `${input.ano}-%`),
        ));
      for (const c of consolidacoes) {
        if (meses[c.mesReferencia] && c.status === 'consolidado') {
          // No modelo de ciclo de folha (corte 15), o ciclo SEMPRE termina antes do
          // último dia do mês — o "escuro" pertence à competência seguinte. Portanto
          // nunca chamamos esse caso de "parcial": é o ciclo completo daquele mês.
          meses[c.mesReferencia].status = 'consolidado';
          meses[c.mesReferencia].consolidadoPor = c.consolidadoPor || undefined;
          meses[c.mesReferencia].consolidadoEm = c.consolidadoEm || undefined;
          meses[c.mesReferencia].dataInicioCiclo = (c.dataInicioCiclo as string | null) || undefined;
          meses[c.mesReferencia].dataFimCiclo = (c.dataFimCiclo as string | null) || undefined;
        }
      }
      return meses;
    }),

  consolidarMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Compute payroll cycle range based on the company's diaCorte.
      // Only inconsistencies INSIDE this cycle range block consolidation —
      // dark days (after diaCorte of the current month) belong to the next competência.
      const diaCorte = await getDiaCorte(db, input.companyId);
      const { dataInicioCiclo, dataFimCiclo } = computeCicloRange(input.mesReferencia, diaCorte);

      // Ignora pendências cuja `mesReferencia` já tenha um pontoConsolidacao
      // consolidado e diferente do mês que está sendo (re)consolidado agora.
      // Isso evita que pendências herdadas do antigo modelo (mês calendário)
      // bloqueiem re-consolidações no novo modelo de ciclo de folha.
      const [pendingIncons] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(timeInconsistencies)
        .where(and(
          companyFilter(timeInconsistencies.companyId, input),
          eq(timeInconsistencies.status, 'pendente'),
          sql`${timeInconsistencies.data} >= ${dataInicioCiclo}`,
          sql`${timeInconsistencies.data} <= ${dataFimCiclo}`,
          sql`NOT EXISTS (
            SELECT 1 FROM ponto_consolidacao pc
             WHERE pc."companyId" = ${timeInconsistencies.companyId}
               AND pc."mesReferencia" = ${timeInconsistencies.mesReferencia}
               AND pc.status = 'consolidado'
               AND pc."mesReferencia" <> ${input.mesReferencia}
          )`,
        ));
      if (Number(pendingIncons?.count || 0) > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Existem ${pendingIncons?.count} inconsistências pendentes no ciclo ${dataInicioCiclo} → ${dataFimCiclo}. Resolva todas antes de consolidar.`,
        });
      }
      // Check if already consolidated
      const existing = await db.select().from(pontoConsolidacao)
        .where(and(
          companyFilter(pontoConsolidacao.companyId, input),
          eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
        )).limit(1);
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      if (existing.length > 0) {
        await db.update(pontoConsolidacao).set({
          status: 'consolidado',
          dataInicioCiclo,
          dataFimCiclo,
          consolidadoPor: ctx.user?.name || 'RH',
          consolidadoEm: now,
          observacoes: input.observacoes || null,
        }).where(eq(pontoConsolidacao.id, existing[0].id));
      } else {
        await db.insert(pontoConsolidacao).values({
          companyId: input.companyId,
          mesReferencia: input.mesReferencia,
          dataInicioCiclo,
          dataFimCiclo,
          status: 'consolidado',
          consolidadoPor: ctx.user?.name || 'RH',
          consolidadoEm: now,
          observacoes: input.observacoes || null,
        });
      }
      // After consolidation, auto-trigger payrollEngine processarPonto
      // This creates/opens the payroll period and generates timecard_daily from time_records
      let payrollResult = null;
      try {
        // 1. Ensure payroll_period exists for this competencia
        const existingPeriodRows = ((await db.execute(sql`
          SELECT id, status FROM payroll_periods 
          WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1
        `)) as any).rows || [];
        
        if (!existingPeriodRows[0]) {
          // Create the payroll period with the correct date ranges
          const [yearStr, monthStr] = input.mesReferencia.split('-');
          const year = parseInt(yearStr), month = parseInt(monthStr);
          const prevMonth = month === 1 ? 12 : month - 1;
          const prevYear = month === 1 ? year - 1 : year;
          const criteriaForPeriod = await getDiaCorte(db, input.companyId);
          const diaCorte = criteriaForPeriod;
          const pontoInicioDate = new Date(Date.UTC(prevYear, prevMonth - 1, diaCorte));
          pontoInicioDate.setUTCDate(pontoInicioDate.getUTCDate() + 1);
          const pontoInicio = pontoInicioDate.toISOString().slice(0, 10);
          const pontoFim = `${year}-${String(month).padStart(2, '0')}-${String(diaCorte).padStart(2, '0')}`;
          const lastDay = new Date(year, month, 0).getDate();
          const escuroInicio = `${year}-${String(month).padStart(2, '0')}-${String(diaCorte + 1).padStart(2, '0')}`;
          const escuroFim = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          
          const empCountRows = ((await db.execute(sql`
            SELECT COUNT(*) as total FROM employees 
            WHERE "companyId" = ${input.companyId} AND "tipoContrato" = 'CLT' AND status IN ('Ativo', 'Ferias') AND "deletedAt" IS NULL
          `)) as any).rows || [];
          
          await db.execute(sql`
            INSERT INTO payroll_periods ("companyId", "mesReferencia", "pontoInicio", "pontoFim", "escuroInicio", "escuroFim", status, "totalFuncionarios")
            VALUES (${input.companyId}, ${input.mesReferencia}, ${pontoInicio}, ${pontoFim}, ${escuroInicio}, ${escuroFim}, 'aberta', ${empCountRows[0]?.total || 0})
          `);
        } else if (existingPeriodRows[0].status === 'pagamento_consolidado') {
          console.log(`[consolidarMes] Payroll period at 'pagamento_consolidado', skipping processarPonto`);
          return { success: true, consolidadoPor: ctx.user?.name || 'RH', consolidadoEm: now, payrollResult: null };
        } else {
          console.log(`[consolidarMes] Payroll period at status '${existingPeriodRows[0].status}', reprocessando ponto...`);
        }
        
        // 2. Call processarPonto logic inline (reads time_records, generates timecard_daily)
        // Import the necessary schemas
        const { timeRecords: trSchema, systemCriteria: scSchema } = await import('../../drizzle/schema');
        
        // Get criteria
        const criteriaRows = await db.select().from(scSchema).where(companyFilter(scSchema.companyId, input));
        const criteriaMap: Record<string, string> = {};
        for (const r of criteriaRows) criteriaMap[r.chave] = r.valor;
        const diaCorte = parseInt(criteriaMap['ponto_dia_corte'] || '15');
        const cargaHorariaDiaria = parseInt(criteriaMap['jornada_horas_diarias'] || '8');
        const toleranciaAtraso = parseInt(criteriaMap['ponto_tolerancia_atraso'] || '5');
        const faltaAposAtraso = parseInt(criteriaMap['ponto_falta_apos_atraso'] || '120');
        const toleranciaSaida = parseInt(criteriaMap['ponto_tolerancia_saida'] || '5');
        const sabadoTipo = criteriaMap['jornada_sabado_tipo'] || 'compensado';
        const fecharNoEscuro = criteriaMap['fechar_no_escuro'] !== 'nao';
        
        const [yearStr2, monthStr2] = input.mesReferencia.split('-');
        const year2 = parseInt(yearStr2), month2 = parseInt(monthStr2);
        const prevMonth2 = month2 === 1 ? 12 : month2 - 1;
        const prevYear2 = month2 === 1 ? year2 - 1 : year2;
        const pontoInicio2Date = new Date(Date.UTC(prevYear2, prevMonth2 - 1, diaCorte));
        pontoInicio2Date.setUTCDate(pontoInicio2Date.getUTCDate() + 1);
        const pontoInicio2 = pontoInicio2Date.toISOString().slice(0, 10);
        const pontoFim2 = `${year2}-${String(month2).padStart(2, '0')}-${String(diaCorte).padStart(2, '0')}`;
        const lastDay2 = new Date(year2, month2, 0).getDate();
        
        // Get employees
        const empList = await db.select({ id: employees.id, nomeCompleto: employees.nomeCompleto, valorHora: employees.valorHora, salarioBase: employees.salarioBase })
          .from(employees)
          .where(and(companyFilter(employees.companyId, input), eq(employees.tipoContrato, 'CLT'), sql`${employees.status} IN ('Ativo', 'Ferias')`, sql`${employees.deletedAt} IS NULL`));
        
        // Get time_records for ponto period
        const records = await db.select().from(trSchema)
          .where(and(companyFilter(trSchema.companyId, input), sql`${trSchema.data} >= ${pontoInicio2}`, sql`${trSchema.data} <= ${pontoFim2}`));
        
        const recordMap = new Map<string, any[]>();
        for (const r of records) {
          const key = `${r.employeeId}-${r.data}`;
          if (!recordMap.has(key)) recordMap.set(key, []);
          recordMap.get(key)!.push(r);
        }
        
        // Buscar atestados que cobrem o período do ponto
        const { atestados: atSchema } = await import('../../drizzle/schema');
        const prevMonthAtStart = new Date(year2, month2 - 7, 1).toISOString().substring(0, 10);
        const atestList = await db.select().from(atSchema)
          .where(and(companyFilter(atSchema.companyId, input), sql`${atSchema.deletedAt} IS NULL`, sql`${atSchema.dataEmissao} >= ${prevMonthAtStart}`, sql`${atSchema.dataEmissao} <= ${pontoFim2}`));
        const atestMap = new Map<string, number>();
        for (const at of atestList) {
          if (!at.employeeId || !at.dataEmissao) continue;
          const afTipo = (at as any).afastamentoTipo || 'dia';
          if (afTipo === 'horas') {
            atestMap.set(`${at.employeeId}-${at.dataEmissao}`, at.id);
          } else {
            const dias = at.diasAfastamento || 1;
            const sd = new Date(at.dataEmissao + 'T12:00:00Z');
            for (let d = 0; d < dias; d++) {
              const dt = new Date(sd); dt.setUTCDate(sd.getUTCDate() + d);
              atestMap.set(`${at.employeeId}-${dt.toISOString().substring(0, 10)}`, at.id);
            }
          }
        }

        // Preserve existing treatments before deleting
        const savedTreatments = ((await db.execute(sql`
          SELECT "employeeId", "data", "resolucaoTipo", "resolucaoObs", "resolucaoPor", "resolucaoEm",
                 "inconsistenciaResolvida", "isFalta", "isInconsistente", "isAtraso", "isSaidaAntecipada",
                 "statusDia", "statusAnterior", "afericaoResultado", "afericaoObs", "afericaoEm",
                 "atestadoId", "advertenciaId",
                 "entrada1", "saida1", "entrada2", "saida2"
          FROM timecard_daily
          WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
            AND ("resolucaoTipo" IS NOT NULL OR "afericaoResultado" IS NOT NULL)
        `)) as any).rows || [];
        const treatmentMap = new Map<string, any>();
        for (const t of savedTreatments) {
          treatmentMap.set(`${t.employeeId}-${t.data}`, t);
        }
        if (savedTreatments.length > 0) {
          console.log(`[consolidarMes] Preservando ${savedTreatments.length} tratamentos existentes`);
        }

        // Clear existing timecard_daily
        await db.execute(sql`DELETE FROM timecard_daily WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}`);
        try { await db.execute(sql.raw(`DELETE FROM timecard_daily WHERE companyid = ${Number(input.companyId)} AND mescompetencia = '${input.mesReferencia.replace(/'/g, "''")}'`)); } catch {}
        
        let totalInserted = 0, totalFaltas = 0, totalAtrasos = 0;
        const _minutesToHHMM = (mins: number) => { const h = Math.floor(Math.abs(mins) / 60); const m = Math.abs(mins) % 60; return `${mins < 0 ? '-' : ''}${h}:${String(m).padStart(2, '0')}`; };
        const _parseTime = (str: string | null | undefined): number | null => { if (!str) return null; const parts = str.split(':'); if (parts.length < 2) return null; const h = parseInt(parts[0]), m = parseInt(parts[1]); if (isNaN(h) || isNaN(m)) return null; return h * 60 + m; };
        const _getDateRange = (start: string, end: string): string[] => { const dates: string[] = []; const s = new Date(start + 'T12:00:00Z'); const e = new Date(end + 'T12:00:00Z'); const c = new Date(s); while (c <= e) { dates.push(c.toISOString().substring(0, 10)); c.setUTCDate(c.getUTCDate() + 1); } return dates; };
        
        // Collect all rows in memory first, then batch insert
        const batchRows: string[] = [];
        const BATCH_SIZE = 200;
        
        const _esc = (v: any) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
        const _escNum = (v: any) => v === null || v === undefined ? 'NULL' : String(Number(v));
        
        const flushBatch = async () => {
          if (batchRows.length === 0) return;
          const insertSql = `INSERT INTO timecard_daily ("companyId", "employeeId", "data", "mesCompetencia", "statusDia",
            "entrada1", "saida1", "entrada2", "saida2", "entrada3", "saida3",
            "horasTrabalhadas", "horasExtras", "horasNoturnas",
            "isFalta", "isAtraso", "isSaidaAntecipada", "minutosAtraso", "minutosSaidaAntecipada",
            "tipoDia", "timeRecordId", "obraId", "origemRegistro", "numBatidas", "isInconsistente", "inconsistenciaTipo",
            "obraSecundariaId", "rateioPercentual", "atestadoId") VALUES ${batchRows.join(',')}`;
          await db.execute(sql.raw(insertSql));
          batchRows.length = 0;
        };
        
        for (const emp of empList) {
          const pontoDates = _getDateRange(pontoInicio2, pontoFim2);
          for (const dateStr of pontoDates) {
            const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
            if (dow === 0) continue;
            const key = `${emp.id}-${dateStr}`;
            const recs = recordMap.get(key) || [];
            let tipoDia = 'util';
            if (dow === 6) tipoDia = sabadoTipo === 'compensado' ? 'compensado' : 'sabado';
            let isFalta = 0, isAtraso = 0, isSaidaAntecipada = 0, minutosAtraso = 0, minutosSaidaAntecipada = 0;
            let horasTrabalhadas = '0:00', horasExtras = '0:00', horasNoturnas = '0:00';
            let origemRegistro = 'dixi', numBatidas = 0, isInconsistente = 0;
            let inconsistenciaTipo: string | null = null, obraId: number | null = null;
            let obraSecundariaId: number | null = null, rateioPercentual: number | null = null, timeRecordId: number | null = null;
            
            const atestadoIdDia = atestMap.get(`${emp.id}-${dateStr}`) || null;
            
            if (recs.length > 0) {
              const rec = recs[0];
              timeRecordId = rec.id; obraId = rec.obraId || null;
              horasTrabalhadas = rec.horasTrabalhadas || '0:00'; horasExtras = rec.horasExtras || '0:00'; horasNoturnas = rec.horasNoturnas || '0:00';
              numBatidas = [rec.entrada1, rec.saida1, rec.entrada2, rec.saida2, rec.entrada3, rec.saida3].filter(Boolean).length;
              // Respeitar tipoDia abonado vindo do time_records (atestado/feriado/bh definidos no editor)
              const recTipoDia = ((rec as any).tipoDia || '').toLowerCase();
              if (recTipoDia === 'atestado' || recTipoDia === 'feriado' || recTipoDia === 'bh') {
                tipoDia = recTipoDia;
              }
              if (recs.length > 1) {
                obraSecundariaId = recs[1].obraId || null;
                const totalMinsPrimary = _parseTime(rec.horasTrabalhadas) || 0;
                const totalMinsSecondary = _parseTime(recs[1].horasTrabalhadas) || 0;
                const totalMins = totalMinsPrimary + totalMinsSecondary;
                rateioPercentual = totalMins > 0 ? Math.round((totalMinsPrimary / totalMins) * 100) : 50;
                origemRegistro = 'rateado';
                horasTrabalhadas = _minutesToHHMM(totalMins);
                horasExtras = _minutesToHHMM((_parseTime(rec.horasExtras) || 0) + (_parseTime(recs[1].horasExtras) || 0));
              }
              if (numBatidas > 0 && numBatidas % 2 !== 0) { isInconsistente = 1; inconsistenciaTipo = 'batida_impar'; }
              else if (!rec.entrada1 && rec.saida1) { isInconsistente = 1; inconsistenciaTipo = 'entrada_faltando'; }
              else if (rec.entrada1 && !rec.saida1 && numBatidas === 1) { isInconsistente = 1; inconsistenciaTipo = 'saida_faltando'; }
              if (numBatidas === 0 && tipoDia === 'util' && !atestadoIdDia) { isFalta = 1; totalFaltas++; }
              const entrada = _parseTime(rec.entrada1);
              if (entrada !== null && tipoDia === 'util' && !atestadoIdDia) {
                const atraso = entrada - 7 * 60;
                if (atraso > faltaAposAtraso) { isFalta = 1; totalFaltas++; }
                else if (atraso > toleranciaAtraso) { isAtraso = 1; minutosAtraso = atraso; totalAtrasos++; }
              }
              const saida = _parseTime(rec.saida2 || rec.saida1);
              if (saida !== null && tipoDia === 'util' && !atestadoIdDia) {
                const saidaAnt = (7 + cargaHorariaDiaria + 1) * 60 - saida;
                if (saidaAnt > toleranciaSaida) { isSaidaAntecipada = 1; minutosSaidaAntecipada = saidaAnt; }
              }
            } else {
              if (tipoDia === 'util' && !atestadoIdDia) { isFalta = 1; totalFaltas++; }
            }
            
            const statusDia = atestadoIdDia ? 'atestado' : 'registrado';
            batchRows.push(`(${_escNum(input.companyId)}, ${_escNum(emp.id)}, ${_esc(dateStr)}, ${_esc(input.mesReferencia)}, ${_esc(statusDia)},
              ${_esc(recs[0]?.entrada1 || null)}, ${_esc(recs[0]?.saida1 || null)}, ${_esc(recs[0]?.entrada2 || null)}, ${_esc(recs[0]?.saida2 || null)}, ${_esc(recs[0]?.entrada3 || null)}, ${_esc(recs[0]?.saida3 || null)},
              ${_esc(horasTrabalhadas)}, ${_esc(horasExtras)}, ${_esc(horasNoturnas)},
              ${_escNum(isFalta)}, ${_escNum(isAtraso)}, ${_escNum(isSaidaAntecipada)}, ${_escNum(minutosAtraso)}, ${_escNum(minutosSaidaAntecipada)},
              ${_esc(tipoDia)}, ${_escNum(timeRecordId)}, ${_escNum(obraId)}, ${_esc(origemRegistro)}, ${_escNum(numBatidas)}, ${_escNum(isInconsistente)}, ${_esc(inconsistenciaTipo)},
              ${_escNum(obraSecundariaId)}, ${_escNum(rateioPercentual)}, ${_escNum(atestadoIdDia)})`);
            totalInserted++;
            
            if (batchRows.length >= BATCH_SIZE) await flushBatch();
          }
          
          // Escuro days
          if (fecharNoEscuro) {
            for (let d = diaCorte + 1; d <= lastDay2; d++) {
              const dateStr = `${year2}-${String(month2).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
              if (dow === 0) continue;
              let tipoDia = 'util';
              if (dow === 6) tipoDia = sabadoTipo === 'compensado' ? 'compensado' : 'sabado';
              batchRows.push(`(${_escNum(input.companyId)}, ${_escNum(emp.id)}, ${_esc(dateStr)}, ${_esc(input.mesReferencia)}, 'escuro',
                NULL, NULL, NULL, NULL, NULL, NULL,
                ${_esc(_minutesToHHMM(cargaHorariaDiaria * 60))}, '0:00', '0:00',
                0, 0, 0, 0, 0,
                ${_esc(tipoDia)}, NULL, NULL, 'escuro', 0, 0, NULL,
                NULL, NULL, NULL)`);
              totalInserted++;
              
              if (batchRows.length >= BATCH_SIZE) await flushBatch();
            }
          }
        }
        
        // Flush remaining rows
        await flushBatch();
        
        // Re-apply preserved treatments
        let totalTreatmentsRestored = 0;
        if (treatmentMap.size > 0) {
          const _escT = (v: any) => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
          for (const [key, t] of treatmentMap) {
            try {
              const updates: string[] = [];
              if (t.resolucaoTipo) {
                updates.push(`"resolucaoTipo" = ${_escT(t.resolucaoTipo)}`);
                updates.push(`"resolucaoObs" = ${_escT(t.resolucaoObs)}`);
                updates.push(`"resolucaoPor" = ${_escT(t.resolucaoPor || 'Sistema')}`);
                updates.push(`"resolucaoEm" = ${t.resolucaoEm ? _escT(t.resolucaoEm) : 'NOW()'}`);
                updates.push(`"inconsistenciaResolvida" = 1`);
                updates.push(`"isInconsistente" = 0`);
                if (t.resolucaoTipo === 'atestado' || t.resolucaoTipo === 'justificar' || t.resolucaoTipo === 'abonar') {
                  updates.push(`"isFalta" = 0`);
                }
                if (t.resolucaoTipo === 'ajustar_horario') {
                  if (t.entrada1) updates.push(`"entrada1" = ${_escT(t.entrada1)}`);
                  if (t.saida1) updates.push(`"saida1" = ${_escT(t.saida1)}`);
                  if (t.entrada2) updates.push(`"entrada2" = ${_escT(t.entrada2)}`);
                  if (t.saida2) updates.push(`"saida2" = ${_escT(t.saida2)}`);
                }
              }
              if (t.afericaoResultado) {
                updates.push(`"afericaoResultado" = ${_escT(t.afericaoResultado)}`);
                if (t.afericaoObs) updates.push(`"afericaoObs" = ${_escT(t.afericaoObs)}`);
                if (t.afericaoEm) updates.push(`"afericaoEm" = ${_escT(t.afericaoEm)}`);
                if (t.statusDia && t.statusDia !== 'registrado') updates.push(`"statusDia" = ${_escT(t.statusDia)}`);
                if (t.statusAnterior) updates.push(`"statusAnterior" = ${_escT(t.statusAnterior)}`);
              }
              if (t.atestadoId) updates.push(`"atestadoId" = ${Number(t.atestadoId)}`);
              if (t.advertenciaId) updates.push(`"advertenciaId" = ${Number(t.advertenciaId)}`);
              if (updates.length > 0) {
                await db.execute(sql.raw(
                  `UPDATE timecard_daily SET ${updates.join(', ')} WHERE "companyId" = ${Number(input.companyId)} AND "employeeId" = ${Number(t.employeeId)} AND "data" = ${_escT(t.data)} AND "mesCompetencia" = ${_escT(input.mesReferencia)}`
                ));
                totalTreatmentsRestored++;
              }
            } catch (e: any) {
              console.warn(`[consolidarMes] Falha ao restaurar tratamento ${key}:`, e?.message);
            }
          }
          console.log(`[consolidarMes] ${totalTreatmentsRestored}/${treatmentMap.size} tratamentos restaurados`);
        }

        // Update payroll period status
        await db.execute(sql`
          UPDATE payroll_periods SET status = 'ponto_importado', "pontoImportadoEm" = NOW(), "pontoImportadoPor" = ${ctx.user?.name || 'Sistema'}
          WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        `);
        
        payrollResult = { totalFuncionarios: empList.length, totalRegistros: totalInserted, totalFaltas, totalAtrasos, totalTreatmentsRestored };
        console.log(`[consolidarMes] PayrollEngine processarPonto: ${empList.length} funcionários, ${totalInserted} registros, ${totalTreatmentsRestored} tratamentos restaurados`);
      } catch (payrollErr: any) {
        console.error('[consolidarMes] Erro ao processar ponto no payrollEngine:', payrollErr.message);
        // Don't fail the consolidation if payroll processing fails
        payrollResult = { error: payrollErr.message };
      }
      
      return { success: true, consolidadoPor: ctx.user?.name || 'RH', consolidadoEm: now, payrollResult };
    }),

  desconsolidarMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verificação robusta de permissão para desconsolidação
      // Aceita: admin_master, admin, ou owner do projeto
      const userRole = (ctx.user.role || '').toString().trim().toLowerCase();
      const isOwner = ctx.user.openId === process.env.OWNER_OPEN_ID;
      const isAdmin = userRole.includes('admin');
      const isAllowed = isAdmin || isOwner;
      console.log('[Desconsolidar] User:', ctx.user.id, ctx.user.name, 
        'Role raw:', JSON.stringify(ctx.user.role), 
        'Role normalized:', userRole,
        'isAdmin:', isAdmin, 'isOwner:', isOwner, 'isAllowed:', isAllowed,
        'openId:', ctx.user.openId, 'ownerOpenId:', process.env.OWNER_OPEN_ID);
      if (!isAllowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `Apenas administradores podem desconsolidar um mês. Seu role atual: ${userRole}. Contate o Admin Master.` });
      }
      const db = (await getDb())!;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      // When desconsolidando, also clear the cycle range so guards no longer match.
      await db.update(pontoConsolidacao).set({
        status: 'aberto',
        dataInicioCiclo: null,
        dataFimCiclo: null,
        desconsolidadoPor: ctx.user?.name || 'Admin',
        desconsolidadoEm: now,
      }).where(and(
        companyFilter(pontoConsolidacao.companyId, input),
        eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
      ));
      return { success: true };
    }),

  getConsolidacaoStatus: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select().from(pontoConsolidacao)
        .where(and(
          companyFilter(pontoConsolidacao.companyId, input),
          eq(pontoConsolidacao.mesReferencia, input.mesReferencia),
        )).limit(1);
      if (rows.length === 0) return { consolidado: false, parcial: false };
      const consolidado = rows[0].status === 'consolidado';
      const dataInicioCiclo = rows[0].dataInicioCiclo as string | null;
      const dataFimCiclo = rows[0].dataFimCiclo as string | null;
      // No modelo de ciclo de folha, "parcial" não existe — o escuro pertence à
      // próxima competência. Mantemos o campo no retorno por compatibilidade.
      const parcial = false;
      return {
        consolidado,
        parcial,
        dataInicioCiclo,
        dataFimCiclo,
        consolidadoPor: rows[0].consolidadoPor,
        consolidadoEm: rows[0].consolidadoEm,
        desconsolidadoPor: rows[0].desconsolidadoPor,
        desconsolidadoEm: rows[0].desconsolidadoEm,
      };
    }),

  // Verifica se uma data específica está dentro de um ciclo consolidado.
  // Usado pelo Espelho de Ponto para avisar antes da edição.
  isDateLocked: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), data: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      return await isDateLocked(db, input, input.data);
    }),

  // ===================== CONFLITOS OBRA/DIA =====================
  getConflitosObraDia: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      employeeId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Find employees with records in multiple obras on the same day
      const conditions: any[] = [
        companyFilter(timeRecords.companyId, input),
        eq(timeRecords.mesReferencia, input.mesReferencia),
      ];
      if (input.employeeId) conditions.push(eq(timeRecords.employeeId, input.employeeId));

      const recs = await db.select({
        id: timeRecords.id,
        employeeId: timeRecords.employeeId,
        employeeName: employees.nomeCompleto,
        data: timeRecords.data,
        obraId: timeRecords.obraId,
        obraNome: obras.nome,
        entrada1: timeRecords.entrada1,
        saida1: timeRecords.saida1,
        entrada2: timeRecords.entrada2,
        saida2: timeRecords.saida2,
        entrada3: timeRecords.entrada3,
        saida3: timeRecords.saida3,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
        ajusteManual: timeRecords.ajusteManual,
        justificativa: timeRecords.justificativa,
      })
        .from(timeRecords)
        .leftJoin(employees, eq(timeRecords.employeeId, employees.id))
        .leftJoin(obras, eq(timeRecords.obraId, obras.id))
        .where(and(...conditions))
        .orderBy(sql`${timeRecords.employeeId} ASC, ${timeRecords.data} ASC`);

      // Group by employee+date and find conflicts
      const byEmpDate: Record<string, Array<typeof recs[0]>> = {};
      const empNames: Record<number, string> = {};
      for (const r of recs) {
        const key = `${r.employeeId}|${r.data}`;
        if (!byEmpDate[key]) byEmpDate[key] = [];
        byEmpDate[key].push(r);
        if (r.employeeName) empNames[r.employeeId] = r.employeeName;
      }

      // Função para verificar sobreposição de horários entre obras
      const parseTimeMin = (t: string | null) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      // Normaliza nome da obra para comparação (evita falso conflito entre duplicatas de mesmo nome)
      const obraKey = (r: { obraId: number | null; obraNome: string | null }) =>
        r.obraNome ? r.obraNome.trim().toUpperCase() : (r.obraId != null ? String(r.obraId) : '__null__');

      // Constrói intervalos de presença. Uma ENTRADA SEM SAÍDA (funcionário
      // ainda trabalhando OU que esqueceu de bater a saída) ocupa o período até
      // o fim do dia (fim = Infinity) — assim uma entrada em aberto numa obra
      // conflita com qualquer batida posterior em OUTRA obra.
      const INF = Number.POSITIVE_INFINITY;
      const buildIntervalos = (entries: typeof recs) => {
        const intervalos: { obraKey: string; inicio: number; fim: number }[] = [];
        for (const r of entries) {
          const key = obraKey(r);
          const pares: Array<[string | null, string | null]> = [
            [r.entrada1, r.saida1], [r.entrada2, r.saida2], [r.entrada3, r.saida3],
          ];
          for (const [ent, sai] of pares) {
            if (ent) intervalos.push({ obraKey: key, inicio: parseTimeMin(ent), fim: sai ? parseTimeMin(sai) : INF });
          }
        }
        return intervalos;
      };

      // Conflito REAL = dois intervalos em OBRAS DIFERENTES que se cruzam no
      // tempo (o funcionário não pode estar em 2 obras ao mesmo tempo). Batidas
      // na MESMA obra nunca geram sobreposição aqui — são turnos do mesmo dia.
      const checkOverlap = (entries: typeof recs) => {
        const intervalos = buildIntervalos(entries);
        for (let i = 0; i < intervalos.length; i++) {
          for (let j = i + 1; j < intervalos.length; j++) {
            const a = intervalos[i], b = intervalos[j];
            if (a.obraKey !== b.obraKey && a.inicio < b.fim && b.inicio < a.fim) {
              return true;
            }
          }
        }
        return false;
      };

      // Duplicata REAL na mesma obra = duas batidas IDÊNTICAS (mesmos horários
      // de entrada/saída) — típico erro do relógio que registrou 2x a mesma
      // batida. Batidas em horários DIFERENTES na mesma obra são legítimas
      // (entrada + saída / turnos distintos) e NÃO são duplicata.
      const hasExactDuplicate = (entries: typeof recs) => {
        const vistos = new Set<string>();
        for (const r of entries) {
          const sig = `${obraKey(r)}|${r.entrada1 || ''}|${r.saida1 || ''}|${r.entrada2 || ''}|${r.saida2 || ''}|${r.entrada3 || ''}|${r.saida3 || ''}`;
          if (vistos.has(sig)) return true;
          vistos.add(sig);
        }
        return false;
      };

      // Analisar transferência: detectar se é deslocamento entre obras (horários diferentes)
      // e sugerir horário de saída na obra anterior
      const analyzeTransfer = (entries: typeof recs) => {
        if (entries.length < 2) return null;
        // Ordenar por horário de entrada (primeira batida)
        const sorted = [...entries].sort((a, b) => {
          const ta = parseTimeMin(a.entrada1);
          const tb = parseTimeMin(b.entrada1);
          return ta - tb;
        });
        
        const transfers: Array<{
          fromObraId: number | null;
          fromObraNome: string | null;
          toObraId: number | null;
          toObraNome: string | null;
          fromEntrada: string | null;
          toEntrada: string | null;
          suggestedExit: string; // horário sugerido de saída na obra anterior
          gapMinutes: number; // diferença em minutos entre as batidas
        }> = [];
        
        for (let i = 0; i < sorted.length - 1; i++) {
          const from = sorted[i];
          const to = sorted[i + 1];
          const fromEntrada = parseTimeMin(from.entrada1);
          const toEntrada = parseTimeMin(to.entrada1);
          const gap = toEntrada - fromEntrada;
          
          // Se a obra anterior não tem saída registrada, sugerir saída
          const fromHasExit = !!(from.saida1 || from.saida2);
          
          if (gap > 0 && obraKey(from) !== obraKey(to)) {
            // Sugerir saída = entrada na próxima obra (o funcionário saiu para ir à outra)
            const suggestedExitMin = toEntrada;
            const sugH = Math.floor(suggestedExitMin / 60);
            const sugM = suggestedExitMin % 60;
            const suggestedExit = `${String(sugH).padStart(2, '0')}:${String(sugM).padStart(2, '0')}`;
            
            transfers.push({
              fromObraId: from.obraId,
              fromObraNome: from.obraNome,
              toObraId: to.obraId,
              toObraNome: to.obraNome,
              fromEntrada: from.entrada1,
              toEntrada: to.entrada1,
              suggestedExit,
              gapMinutes: gap,
            });
          }
        }
        return transfers.length > 0 ? transfers : null;
      };

      const conflitos: Array<{
        employeeId: number;
        employeeName: string;
        data: string;
        hasOverlap: boolean;
        isSameObraDuplicate: boolean;
        transferAnalysis: Array<{
          fromObraId: number | null;
          fromObraNome: string | null;
          toObraId: number | null;
          toObraNome: string | null;
          fromEntrada: string | null;
          toEntrada: string | null;
          suggestedExit: string;
          gapMinutes: number;
        }> | null;
        obras: Array<{ obraId: number | null; obraNome: string | null; horasTrabalhadas: string | null }>;
        records: Array<{ id: number; obraId: number | null; obraNome: string | null; horasTrabalhadas: string | null; entrada1: string | null; saida1: string | null; entrada2: string | null; saida2: string | null; entrada3: string | null; saida3: string | null; ajusteManual: number | null }>;
      }> = [];

      for (const [key, entries] of Object.entries(byEmpDate)) {
        if (entries.length > 1) {
          // Usar nome normalizado da obra como chave — evita falso conflito entre duplicatas de mesma obra (IDs diferentes, mesmo nome)
          const obraNames = new Set(entries.map(e => obraKey(e)));
          const [empId, data] = key.split('|');

          if (obraNames.size > 1) {
            // JÁ RESOLVIDO: se TODOS os registros do dia já carregam o marcador
            // de deslocamento confirmado (individual ou em lote), o conflito foi
            // tratado pelo RH e NÃO deve reaparecer na lista. Antes desta guarda,
            // confirmar_deslocamento só gravava a justificativa/rateio sem remover
            // a condição multi-obra, então a linha "voltava" mesmo após o sucesso.
            // Se um novo upload Dixi acrescentar um registro SEM o marcador, o
            // `.every` falha e o conflito reaparece p/ nova conferência (correto).
            const todosConfirmados = entries.every(e =>
              (e.justificativa || '').includes('[Deslocamento confirmado'));
            if (todosConfirmados) continue;

            // MÚLTIPLAS OBRAS no mesmo dia → deslocamento (válido) OU conflito,
            // dependendo do horário. checkOverlap trata entrada-sem-saída como
            // presença até o fim do dia (cobre o caso "esqueceu de bater a saída
            // na obra A e bateu entrada na obra B").
            const overlap = checkOverlap(entries);
            const transferInfo = !overlap ? analyzeTransfer(entries) : null;
            conflitos.push({
              employeeId: Number(empId),
              employeeName: empNames[Number(empId)] || 'Desconhecido',
              data,
              hasOverlap: overlap,
              isSameObraDuplicate: false,
              transferAnalysis: transferInfo,
              obras: entries.map(e => ({ obraId: e.obraId, obraNome: e.obraNome, horasTrabalhadas: e.horasTrabalhadas })),
              records: entries.map(e => ({ id: e.id, obraId: e.obraId, obraNome: e.obraNome, horasTrabalhadas: e.horasTrabalhadas, entrada1: e.entrada1, saida1: e.saida1, entrada2: e.entrada2, saida2: e.saida2, entrada3: e.entrada3, saida3: e.saida3, ajusteManual: e.ajusteManual })),
            });
          } else if (hasExactDuplicate(entries)) {
            // MESMA obra: só é conflito quando há batidas IDÊNTICAS (duplicata
            // real do relógio). Vários registros na mesma obra em horários
            // DIFERENTES são turnos legítimos (entrada + saída) e NÃO entram
            // no relatório de conflitos.
            conflitos.push({
              employeeId: Number(empId),
              employeeName: empNames[Number(empId)] || 'Desconhecido',
              data,
              hasOverlap: false,
              isSameObraDuplicate: true,
              transferAnalysis: null,
              obras: entries.map(e => ({ obraId: e.obraId, obraNome: e.obraNome, horasTrabalhadas: e.horasTrabalhadas })),
              records: entries.map(e => ({ id: e.id, obraId: e.obraId, obraNome: e.obraNome, horasTrabalhadas: e.horasTrabalhadas, entrada1: e.entrada1, saida1: e.saida1, entrada2: e.entrada2, saida2: e.saida2, entrada3: e.entrada3, saida3: e.saida3, ajusteManual: e.ajusteManual })),
            });
          }
        }
      }

      // Ordenar: sobreposições primeiro (precisam resolução manual)
      conflitos.sort((a, b) => (b.hasOverlap ? 1 : 0) - (a.hasOverlap ? 1 : 0));

      return conflitos;
    }),

  // ===================== VALIDAR SN ANTES DO UPLOAD =====================
  validateSN: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), files: z.array(z.object({
        fileName: z.string(),
        fileBase64: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const devices = await db.select().from(dixiDevices).where(companyFilter(dixiDevices.companyId, input));
      // Get active SNs from obra_sns table
      const activeSns = await db.select({
        sn: obraSns.sn,
        obraId: obraSns.obraId,
        obraNome: obras.nome,
      }).from(obraSns)
        .leftJoin(obras, eq(obraSns.obraId, obras.id))
        .where(and(companyFilter(obraSns.companyId, input), eq(obraSns.status, "ativo")));
      const obrasList = await db.select({
        id: obras.id,
        nome: obras.nome,
        snRelogioPonto: obras.snRelogioPonto,
      }).from(obras).where(and(companyFilter(obras.companyId, input), sql`${obras.deletedAt} IS NULL`));

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

        // 1. Check obra_sns table (primary - supports shared SNs)
        const snMatches = activeSns.filter(s => s.sn === deviceSerial);
        if (snMatches.length > 0) {
          obraId = snMatches[0].obraId;
          obraNome = snMatches[0].obraNome || "";
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

        const meses = new Set<string>();
        const contagemPorMes: Record<string, number> = {};
        for (const r of records) {
          if (r.data) {
            const mes = dateToMesRef(r.data);
            meses.add(mes);
            contagemPorMes[mes] = (contagemPorMes[mes] || 0) + 1;
          }
        }

        results.push({
          fileName: file.fileName,
          deviceSerial,
          obraId,
          obraNome,
          valid: obraId !== null,
          isSharedSn: snMatches.length > 1,
          sharedSnObras: snMatches.length > 1 ? snMatches.map(m => ({ obraId: m.obraId!, obraNome: m.obraNome || "" })) : undefined,
          totalRecords: records.length,
          mesesDetectados: Array.from(meses).sort(),
          registrosPorMes: contagemPorMes,
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
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
      data: z.string(), // YYYY-MM-DD
      acao: z.enum(["manter_obra", "confirmar_deslocamento", "excluir_registro", "excluir_por_id", "marcar_falta"]),
      obraIdManter: z.number().optional(), // para manter_obra: qual obra manter
      obraIdExcluir: z.number().optional(), // para excluir_registro: qual registro excluir
      recordId: z.number().optional(), // para excluir_por_id: excluir registro específico pelo id PK
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Per-day lock: only the consolidated cycle range is locked, not the calendar month.
      await assertDateNotLocked(db, input, input.data);

      const resolvidoPor = ctx.user?.name || "RH";

      if (input.acao === "manter_obra" && input.obraIdManter) {
        // Excluir registros de OUTRAS obras neste dia para este funcionário
        await db.delete(timeRecords).where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.data, input.data),
          sql`${timeRecords.obraId} != ${input.obraIdManter}`,
        ));
        // Registrar justificativa no registro mantido
        if (input.justificativa) {
          await db.update(timeRecords)
            .set({ justificativa: `[Conflito resolvido por ${resolvidoPor}] ${input.justificativa}` })
            .where(and(
              companyFilter(timeRecords.companyId, input),
              eq(timeRecords.employeeId, input.employeeId),
              eq(timeRecords.data, input.data),
              eq(timeRecords.obraId, input.obraIdManter),
            ));
        }
        return { success: true, message: `Registros de outras obras removidos. Mantido na obra selecionada.` };
      }

      if (input.acao === "confirmar_deslocamento") {
        // Buscar todos os registros deste dia para este funcionário
        const registros = await db.select().from(timeRecords).where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.data, input.data),
        ));

        const parseTime = (t: string | null) => {
          if (!t) return 0;
          const [h, m] = t.split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };

        // Extrair todos os intervalos de cada registro para verificar sobreposição
        const intervalos: { recId: number; obraId: number | null; inicio: number; fim: number }[] = [];
        for (const r of registros) {
          // Par completo (entrada+saída) => intervalo fechado.
          // Entrada SEM saída (ainda trabalhando) => intervalo ABERTO até o fim do dia
          // (fim = Infinity), espelhando getConflitosObraDia. Isso garante que um
          // deslocamento NÃO seja confirmado quando há presença impossível (obra A
          // aberta sobrepondo obra B) — esse caso vira sobreposição e exige resolução manual.
          if (r.entrada1 && r.saida1) intervalos.push({ recId: r.id, obraId: r.obraId, inicio: parseTime(r.entrada1), fim: parseTime(r.saida1) });
          else if (r.entrada1) intervalos.push({ recId: r.id, obraId: r.obraId, inicio: parseTime(r.entrada1), fim: Infinity });
          if (r.entrada2 && r.saida2) intervalos.push({ recId: r.id, obraId: r.obraId, inicio: parseTime(r.entrada2), fim: parseTime(r.saida2) });
          else if (r.entrada2) intervalos.push({ recId: r.id, obraId: r.obraId, inicio: parseTime(r.entrada2), fim: Infinity });
          if (r.entrada3 && r.saida3) intervalos.push({ recId: r.id, obraId: r.obraId, inicio: parseTime(r.entrada3), fim: parseTime(r.saida3) });
          else if (r.entrada3) intervalos.push({ recId: r.id, obraId: r.obraId, inicio: parseTime(r.entrada3), fim: Infinity });
        }

        // Verificar sobreposição entre obras DIFERENTES
        for (let i = 0; i < intervalos.length; i++) {
          for (let j = i + 1; j < intervalos.length; j++) {
            const a = intervalos[i], b = intervalos[j];
            if (a.obraId !== b.obraId) {
              // Sobreposição: inicio_A < fim_B E inicio_B < fim_A
              if (a.inicio < b.fim && b.inicio < a.fim) {
                throw new TRPCError({ 
                  code: 'BAD_REQUEST', 
                  message: `Horários sobrepostos entre obras! O funcionário não pode estar em duas obras ao mesmo tempo. Resolva manualmente escolhendo qual obra manter.` 
                });
              }
            }
          }
        }

        // Sem sobreposição — deslocamento real válido. Calcular rateio proporcional.
        const calcMinutes = (rec: typeof registros[0]) => {
          let mins = 0;
          if (rec.entrada1 && rec.saida1) mins += parseTime(rec.saida1) - parseTime(rec.entrada1);
          if (rec.entrada2 && rec.saida2) mins += parseTime(rec.saida2) - parseTime(rec.entrada2);
          if (rec.entrada3 && rec.saida3) mins += parseTime(rec.saida3) - parseTime(rec.entrada3);
          return Math.max(mins, 0);
        };

        const obrasMinutos = registros.map(r => ({ id: r.id, obraId: r.obraId, minutos: calcMinutes(r) }));
        const totalMinutos = obrasMinutos.reduce((s, o) => s + o.minutos, 0);
        const totalHorasStr = totalMinutos > 0 
          ? `${Math.floor(totalMinutos / 60).toString().padStart(2, '0')}:${(totalMinutos % 60).toString().padStart(2, '0')}`
          : '00:00';

        for (const obra of obrasMinutos) {
          const proporcao = totalMinutos > 0 ? ((obra.minutos / totalMinutos) * 100).toFixed(1) : '0';
          const horasStr = `${Math.floor(obra.minutos / 60).toString().padStart(2, '0')}:${(obra.minutos % 60).toString().padStart(2, '0')}`;
          await db.update(timeRecords)
            .set({ 
              justificativa: `[Deslocamento confirmado por ${resolvidoPor}] ${input.justificativa || "Deslocamento real entre obras"} | Rateio: ${horasStr} (${proporcao}%)`,
              horasTrabalhadas: horasStr,
            })
            .where(eq(timeRecords.id, obra.id));
        }

        return { 
          success: true, 
          message: `Deslocamento entre obras confirmado com rateio proporcional. ${obrasMinutos.length} registros atualizados. Total: ${totalHorasStr}.`,
          rateio: obrasMinutos.map(o => ({ obraId: o.obraId, minutos: o.minutos, proporcao: totalMinutos > 0 ? ((o.minutos / totalMinutos) * 100).toFixed(1) : '0' })),
        };
      }

      if (input.acao === "excluir_registro" && input.obraIdExcluir) {
        // Excluir registro específico de uma obra
        await db.delete(timeRecords).where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.data, input.data),
          eq(timeRecords.obraId, input.obraIdExcluir),
        ));
        return { success: true, message: `Registro da obra removido (erro de lançamento).` };
      }

      if (input.acao === "excluir_por_id" && input.recordId) {
        // Excluir registro específico pelo ID primário (usado para batidas duplicadas da mesma obra)
        await db.delete(timeRecords).where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.id, input.recordId),
        ));
        return { success: true, message: `Registro duplicado excluído com sucesso.` };
      }

      if (input.acao === "marcar_falta") {
        // Remover TODOS os registros do dia e registrar como falta
        await db.delete(timeRecords).where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.employeeId, input.employeeId),
          eq(timeRecords.data, input.data),
        ));
        // Inserir um registro de falta (sem horários)
        await db.insert(timeRecords).values({
          companyId: input.companyId,
          employeeId: input.employeeId,
          data: input.data,
          mesReferencia: input.data.substring(0, 7),
          obraId: null,
          entrada1: null,
          saida1: null,
          entrada2: null,
          saida2: null,
          horasTrabalhadas: "00:00",
          justificativa: `[FALTA - registrada por ${resolvidoPor}] ${input.justificativa || "Conflito de obra resolvido como falta"}`,
          ajusteManual: 1,
        });
        return { success: true, message: `Dia marcado como FALTA. Todos os registros conflitantes foram removidos.` };
      }

      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Ação inválida ou parâmetros faltando.' });
    }),

  // ===================== RESOLVER EM LOTE POR TIPO =====================
  resolveBatchByType: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      tipoInconsistencia: z.enum(["batida_impar", "falta_batida", "horario_divergente", "batida_duplicada", "sem_registro"]),
      status: z.enum(["justificado", "ajustado"]),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = ctx.user?.name || "RH";
      const hoje = new Date().toISOString().split("T")[0];

      // Buscar inconsistências pendentes deste tipo, EXCLUINDO datas dentro de um ciclo consolidado.
      const pendentes = await db.select().from(timeInconsistencies)
        .where(and(
          companyFilter(timeInconsistencies.companyId, input),
          eq(timeInconsistencies.mesReferencia, input.mesReferencia),
          eq(timeInconsistencies.tipoInconsistencia, input.tipoInconsistencia),
          eq(timeInconsistencies.status, "pendente"),
        ));

      if (pendentes.length === 0) return { success: true, resolved: 0 };

      const lockedRanges = await getLockedRangesInWindow(db, input, `${input.mesReferencia}-01`, lastDayOfMonth(input.mesReferencia));
      const isLocked = (data: string) => lockedRanges.some(r => data >= r.dataInicioCiclo && data <= r.dataFimCiclo);
      const editaveis = pendentes.filter(p => !p.data || !isLocked(String(p.data)));
      if (editaveis.length === 0) return { success: true, resolved: 0, skipped: pendentes.length };

      const ids = editaveis.map(p => p.id);
      await db.update(timeInconsistencies)
        .set({
          status: input.status,
          justificativa: input.justificativa || `Resolvido em lote (${input.tipoInconsistencia}) por ${userName}`,
          resolvidoPor: userName,
          resolvidoEm: hoje,
        })
        .where(inArray(timeInconsistencies.id, ids));

      return { success: true, resolved: ids.length };
    }),

  // ===================== RESOLVER TODAS AS INCONSISTÊNCIAS =====================
  resolveAllInconsistencies: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      status: z.enum(["justificado", "ajustado"]),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = ctx.user?.name || "RH";
      const hoje = new Date().toISOString().split("T")[0];

      // Resolver inconsistências pendentes EXCETO as que caem em ciclos consolidados.
      const pendentes = await db.select().from(timeInconsistencies)
        .where(and(
          companyFilter(timeInconsistencies.companyId, input),
          eq(timeInconsistencies.mesReferencia, input.mesReferencia),
          eq(timeInconsistencies.status, "pendente"),
        ));

      if (pendentes.length === 0) return { success: true, resolved: 0 };

      const lockedRanges = await getLockedRangesInWindow(db, input, `${input.mesReferencia}-01`, lastDayOfMonth(input.mesReferencia));
      const isLocked = (data: string) => lockedRanges.some(r => data >= r.dataInicioCiclo && data <= r.dataFimCiclo);
      const editaveis = pendentes.filter(p => !p.data || !isLocked(String(p.data)));
      if (editaveis.length === 0) return { success: true, resolved: 0, skipped: pendentes.length };

      const ids = editaveis.map(p => p.id);
      await db.update(timeInconsistencies)
        .set({
          status: input.status,
          justificativa: input.justificativa || `Resolvido em lote (todas) por ${userName}`,
          resolvidoPor: userName,
          resolvidoEm: hoje,
        })
        .where(inArray(timeInconsistencies.id, ids));

      return { success: true, resolved: ids.length };
    }),

  // ===================== RESOLVER MÚLTIPLOS IDS =====================
  resolveSelectedInconsistencies: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()),
      status: z.enum(["justificado", "ajustado"]),
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = ctx.user?.name || "RH";
      const hoje = new Date().toISOString().split("T")[0];

      if (input.ids.length === 0) return { success: true, resolved: 0 };

      // Per-date lock: filter out IDs whose data falls inside a consolidated cycle.
      const rows = await db.select({ id: timeInconsistencies.id, data: timeInconsistencies.data, companyId: timeInconsistencies.companyId })
        .from(timeInconsistencies)
        .where(inArray(timeInconsistencies.id, input.ids));
      const editableIds: number[] = [];
      let skipped = 0;
      for (const r of rows) {
        if (!r.data) { editableIds.push(r.id); continue; }
        const { locked } = await isDateLocked(db, { companyId: r.companyId }, String(r.data));
        if (locked) skipped++;
        else editableIds.push(r.id);
      }
      if (editableIds.length === 0) return { success: true, resolved: 0, skipped };

      await db.update(timeInconsistencies)
        .set({
          status: input.status,
          justificativa: input.justificativa || `Resolvido em lote (selecionados) por ${userName}`,
          resolvidoPor: userName,
          resolvidoEm: hoje,
        })
        .where(and(
          inArray(timeInconsistencies.id, editableIds),
          eq(timeInconsistencies.status, "pendente"),
        ));

      return { success: true, resolved: editableIds.length, skipped };
    }),

  // ===================== RESOLVER TODOS OS CONFLITOS DE OBRA =====================
  resolveAllConflitos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      acao: z.enum(["confirmar_deslocamento"]), // Em lote só permite confirmar deslocamento
      justificativa: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const resolvidoPor = ctx.user?.name || "RH";

      // Buscar registros do mês com conflitos. Datas dentro de um ciclo consolidado
      // são puladas (registradas em skippedLocked).
      const mesStart = `${input.mesReferencia}-01`;
      const mesEnd = lastDayOfMonth(input.mesReferencia);
      const lockedRanges = await getLockedRangesInWindow(db, input, mesStart, mesEnd);
      const isLocked = (data: string) => lockedRanges.some(r => data >= r.dataInicioCiclo && data <= r.dataFimCiclo);
      const allRecs = await db.select({
        employeeId: timeRecords.employeeId,
        data: timeRecords.data,
      }).from(timeRecords)
        .where(and(
          companyFilter(timeRecords.companyId, input),
          between(timeRecords.data, mesStart, mesEnd),
        ));

      // Agrupar por empId+data e encontrar conflitos
      const grouped: Record<string, { employeeId: number; data: string; count: number }> = {};
      for (const r of allRecs) {
        const key = `${r.employeeId}|${r.data}`;
        if (!grouped[key]) grouped[key] = { employeeId: r.employeeId, data: r.data!, count: 0 };
        grouped[key].count++;
      }

      const conflitos = Object.values(grouped).filter(g => g.count > 1);
      let resolved = 0;
      const skippedOverlaps: { employeeId: number; data: string; employeeName?: string }[] = [];

      const parseTime = (t: string | null) => {
        if (!t) return 0;
        const [h, m] = t.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };

      // Função para verificar sobreposição de horários entre obras
      const hasOverlap = (registros: any[]) => {
        const intervalos: { obraId: number | null; inicio: number; fim: number }[] = [];
        for (const r of registros) {
          // Entrada SEM saída => intervalo ABERTO (fim = Infinity), igual a getConflitosObraDia,
          // para que presença impossível (obra A aberta sobrepondo obra B) seja detectada como
          // sobreposição e PULADA do rateio em lote (exige resolução manual).
          if (r.entrada1 && r.saida1) intervalos.push({ obraId: r.obraId, inicio: parseTime(r.entrada1), fim: parseTime(r.saida1) });
          else if (r.entrada1) intervalos.push({ obraId: r.obraId, inicio: parseTime(r.entrada1), fim: Infinity });
          if (r.entrada2 && r.saida2) intervalos.push({ obraId: r.obraId, inicio: parseTime(r.entrada2), fim: parseTime(r.saida2) });
          else if (r.entrada2) intervalos.push({ obraId: r.obraId, inicio: parseTime(r.entrada2), fim: Infinity });
          if (r.entrada3 && r.saida3) intervalos.push({ obraId: r.obraId, inicio: parseTime(r.entrada3), fim: parseTime(r.saida3) });
          else if (r.entrada3) intervalos.push({ obraId: r.obraId, inicio: parseTime(r.entrada3), fim: Infinity });
        }
        for (let i = 0; i < intervalos.length; i++) {
          for (let j = i + 1; j < intervalos.length; j++) {
            const a = intervalos[i], b = intervalos[j];
            if (a.obraId !== b.obraId && a.inicio < b.fim && b.inicio < a.fim) {
              return true;
            }
          }
        }
        return false;
      };

      let skippedLocked = 0;
      for (const c of conflitos) {
        if (c.data && isLocked(String(c.data))) { skippedLocked++; continue; }
        // Buscar registros completos
        const registros = await db.select().from(timeRecords).where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.employeeId, c.employeeId),
          eq(timeRecords.data, c.data!),
        ));

        // Só é deslocamento quando há 2+ OBRAS distintas no dia. Vários
        // registros na MESMA obra são turnos legítimos — não aplicar rateio.
        const obrasDistintas = new Set(registros.map(r => r.obraId));
        if (obrasDistintas.size < 2) { continue; }

        // Verificar sobreposição — se houver, PULAR e exigir resolução manual
        if (hasOverlap(registros)) {
          // Buscar nome do funcionário para a mensagem
          const emp = await db.select({ nomeCompleto: employees.nomeCompleto }).from(employees).where(eq(employees.id, c.employeeId)).limit(1);
          skippedOverlaps.push({ employeeId: c.employeeId, data: c.data, employeeName: emp[0]?.nomeCompleto || `ID ${c.employeeId}` });
          continue;
        }

        // Sem sobreposição — deslocamento real válido, calcular rateio proporcional
        const obrasMinutos = registros.map(r => {
          let mins = 0;
          if (r.entrada1 && r.saida1) mins += parseTime(r.saida1) - parseTime(r.entrada1);
          if (r.entrada2 && r.saida2) mins += parseTime(r.saida2) - parseTime(r.entrada2);
          if (r.entrada3 && r.saida3) mins += parseTime(r.saida3) - parseTime(r.entrada3);
          return { id: r.id, minutos: Math.max(mins, 0) };
        });
        const totalMinutos = obrasMinutos.reduce((s, o) => s + o.minutos, 0);

        for (const obra of obrasMinutos) {
          const proporcao = totalMinutos > 0 ? ((obra.minutos / totalMinutos) * 100).toFixed(1) : '0';
          const horasStr = `${Math.floor(obra.minutos / 60).toString().padStart(2, '0')}:${(obra.minutos % 60).toString().padStart(2, '0')}`;
          await db.update(timeRecords)
            .set({ 
              justificativa: `[Deslocamento confirmado em lote por ${resolvidoPor}] ${input.justificativa || "Deslocamento real entre obras"} | Rateio: ${horasStr} (${proporcao}%)`,
              horasTrabalhadas: horasStr,
            })
            .where(eq(timeRecords.id, obra.id));
        }
        resolved++;
      }

      const lockedSuffix = skippedLocked > 0 ? ` ${skippedLocked} dia(s) pulado(s) por estar(em) em ciclo consolidado.` : '';
      return {
        success: true,
        resolved,
        skippedOverlaps,
        skippedLocked,
        message: skippedOverlaps.length > 0
          ? `${resolved} conflito(s) resolvido(s) com rateio proporcional. ${skippedOverlaps.length} conflito(s) com SOBREPOSIÇÃO DE HORÁRIOS precisam ser resolvidos manualmente (o funcionário não pode estar em 2 obras ao mesmo tempo).${lockedSuffix}`
          : `${resolved} conflito(s) resolvido(s) com rateio proporcional.${lockedSuffix}`
      };
    }),

  // ============================================================
  // RESOLVER DUPLICATAS EM LOTE (mesma obra, mesmo funcionário, mesmo dia)
  // ============================================================
  resolveAllDuplicatas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const resolvidoPor = ctx.user?.name || "RH";

      const mesStart = `${input.mesReferencia}-01`;
      const mesEnd = lastDayOfMonth(input.mesReferencia);
      const lockedRanges = await getLockedRangesInWindow(db, input, mesStart, mesEnd);
      const isLocked = (data: string) => lockedRanges.some(r => data >= r.dataInicioCiclo && data <= r.dataFimCiclo);

      // Buscar todos os registros do mês com campos necessários
      const allRecs = await db.execute(sql`
        SELECT id, "employeeId", "obraId", data, "horasTrabalhadas", "ajusteManual",
               "entrada1", "saida1", "entrada2", "saida2", "entrada3", "saida3"
        FROM time_records
        WHERE "companyId" IN (${sql.join((input.companyIds || [input.companyId]).map(id => sql`${id}`), sql`, `)})
          AND data BETWEEN ${mesStart} AND ${mesEnd}
        ORDER BY "employeeId", data, "ajusteManual" DESC
      `);

      // Agrupar por (employeeId, obraId, data)
      const grupos: Record<string, any[]> = {};
      for (const r of (allRecs as any[])) {
        const key = `${r.employeeId}|${r.obraId}|${r.data}`;
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(r);
      }

      // Função para calcular minutos de trabalho de um registro
      const calcMinutos = (r: any): number => {
        let mins = 0;
        if (r.entrada1 && r.saida1) {
          const [h1, m1] = r.entrada1.split(':').map(Number);
          const [h2, m2] = r.saida1.split(':').map(Number);
          mins += (h2 * 60 + m2) - (h1 * 60 + m1);
        }
        if (r.entrada2 && r.saida2) {
          const [h1, m1] = r.entrada2.split(':').map(Number);
          const [h2, m2] = r.saida2.split(':').map(Number);
          mins += (h2 * 60 + m2) - (h1 * 60 + m1);
        }
        return Math.max(mins, 0);
      };

      let resolved = 0;
      let skippedLocked = 0;
      const idsParaExcluir: number[] = [];

      for (const [, recs] of Object.entries(grupos)) {
        if (recs.length < 2) continue; // Só processa grupos com 2+ registros
        const dataGrupo = recs[0]?.data ? String(recs[0].data) : null;
        if (dataGrupo && isLocked(dataGrupo)) { skippedLocked++; continue; }

        // Subagrupar por ASSINATURA de horários — só batidas IDÊNTICAS são
        // duplicata real do relógio. Registros com horários DIFERENTES na mesma
        // obra são turnos legítimos (entrada + saída) e NUNCA são excluídos.
        const porAssinatura: Record<string, any[]> = {};
        for (const r of recs) {
          const sig = `${r.entrada1 || ''}|${r.saida1 || ''}|${r.entrada2 || ''}|${r.saida2 || ''}|${r.entrada3 || ''}|${r.saida3 || ''}`;
          (porAssinatura[sig] ||= []).push(r);
        }

        let grupoResolvido = false;
        for (const dups of Object.values(porAssinatura)) {
          if (dups.length < 2) continue; // assinatura única = batida legítima, mantém

          // Ordenar: prioridade 1 = manual (ajusteManual=1), prioridade 2 = mais horas
          const sorted = [...dups].sort((a, b) => {
            if ((b.ajusteManual || 0) !== (a.ajusteManual || 0)) return (b.ajusteManual || 0) - (a.ajusteManual || 0);
            return calcMinutos(b) - calcMinutos(a);
          });

          // Manter o primeiro (melhor candidato), excluir as cópias idênticas
          const [manter, ...excluir] = sorted;
          await db.execute(sql`
            UPDATE time_records SET justificativa = ${`[Duplicata resolvida em lote por ${resolvidoPor}] Batida idêntica duplicada — mantido registro com ajuste manual/mais horas`}
            WHERE id = ${manter.id}
          `);
          for (const exc of excluir) idsParaExcluir.push(Number(exc.id));
          grupoResolvido = true;
        }
        if (grupoResolvido) resolved++;
      }

      // Excluir em lote
      if (idsParaExcluir.length > 0) {
        await db.execute(sql`
          DELETE FROM time_records WHERE id IN (${sql.join(idsParaExcluir.map(id => sql`${id}`), sql`, `)})
        `);
      }

      const lockedSuffix = skippedLocked > 0 ? ` ${skippedLocked} grupo(s) ignorado(s) por estar(em) em ciclo consolidado.` : '';
      return {
        success: true,
        resolved,
        excluidos: idsParaExcluir.length,
        skippedLocked,
        message: `${resolved} grupo(s) de duplicatas resolvido(s). ${idsParaExcluir.length} registro(s) duplicado(s) excluído(s). Em cada caso foi mantido o registro com mais horas ou o ajuste manual.${lockedSuffix}`,
      };
    }),

  // ============================================================
  // LIMPEZA: REMOVER REGISTROS DIXI ONDE EXISTE MANUAL NO MESMO DIA
  // ============================================================
  limparDixiComManual: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      if (ctx.user.role !== "admin" && ctx.user.role !== "admin_master") {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas administradores podem executar esta operação.' });
      }

      const companyIds = input.companyIds || [input.companyId];
      const companyIdsSql = sql.join(companyIds.map(id => sql`${id}`), sql`, `);

      let dateFilter = sql``;
      if (input.mesReferencia) {
        const mesStart = `${input.mesReferencia}-01`;
        const mesEnd = lastDayOfMonth(input.mesReferencia);
        dateFilter = sql` AND tr.data BETWEEN ${mesStart} AND ${mesEnd}`;
      }

      // Encontrar todos os IDs de registros DIXI que têm um registro Manual correspondente (mesmo companyId, employeeId, data)
      const dixiParaApagar = await db.execute(sql`
        SELECT tr.id FROM time_records tr
        WHERE tr."companyId" IN (${companyIdsSql})
          AND tr.fonte = 'dixi'
          ${dateFilter}
          AND EXISTS (
            SELECT 1 FROM time_records m
            WHERE m."companyId" = tr."companyId"
              AND m."employeeId" = tr."employeeId"
              AND m.data = tr.data
              AND m.fonte = 'manual'
          )
      `);

      const ids = (dixiParaApagar.rows as any[]).map(r => Number(r.id));
      if (ids.length === 0) {
        return { success: true, excluidos: 0, message: 'Nenhum registro DIXI encontrado com conflito Manual. Base já está limpa.' };
      }

      await db.execute(sql`
        DELETE FROM time_records
        WHERE id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
      `);

      return {
        success: true,
        excluidos: ids.length,
        message: `${ids.length} registro(s) DIXI excluído(s) onde já existia lançamento manual para o mesmo funcionário/dia. A prioridade do lançamento manual foi preservada.`,
      };
    }),

  // ============================================================
  // REGISTROS NÃO IDENTIFICADOS (UNMATCHED)
  // ============================================================
  getUnmatchedRecords: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const conditions = [companyFilter(unmatchedDixiRecords.companyId, input)];
      if (input.mesReferencia) {
        conditions.push(eq(unmatchedDixiRecords.mesReferencia, input.mesReferencia));
      }
      
      const records = await db.select({
        id: unmatchedDixiRecords.id,
        obraId: unmatchedDixiRecords.obraId,
        mesReferencia: unmatchedDixiRecords.mesReferencia,
        dixiName: unmatchedDixiRecords.dixiName,
        dixiId: unmatchedDixiRecords.dixiId,
        data: unmatchedDixiRecords.data,
        entrada1: unmatchedDixiRecords.entrada1,
        saida1: unmatchedDixiRecords.saida1,
        entrada2: unmatchedDixiRecords.entrada2,
        saida2: unmatchedDixiRecords.saida2,
        entrada3: unmatchedDixiRecords.entrada3,
        saida3: unmatchedDixiRecords.saida3,
        batidasBrutas: unmatchedDixiRecords.batidasBrutas,
        status: unmatchedDixiRecords.status,
        linkedEmployeeId: unmatchedDixiRecords.linkedEmployeeId,
        obraNome: obras.nome,
      }).from(unmatchedDixiRecords)
        .leftJoin(obras, eq(unmatchedDixiRecords.obraId, obras.id))
        .where(and(...conditions))
        .orderBy(unmatchedDixiRecords.dixiName, unmatchedDixiRecords.data);

      // Agrupar por nome DIXI
      const grouped: Record<string, {
        dixiName: string;
        dixiId: string | null;
        obraNome: string | null;
        obraId: number | null;
        totalDias: number;
        status: string;
        records: typeof records;
      }> = {};
      for (const r of records) {
        const key = r.dixiName;
        if (!grouped[key]) {
          grouped[key] = {
            dixiName: r.dixiName,
            dixiId: r.dixiId,
            obraNome: r.obraNome,
            obraId: r.obraId,
            totalDias: 0,
            status: r.status,
            records: [],
          };
        }
        grouped[key].totalDias++;
        grouped[key].records.push(r);
      }

      return {
        total: records.length,
        totalNomes: Object.keys(grouped).length,
        pendentes: records.filter(r => r.status === 'pendente').length,
        grouped: Object.values(grouped),
      };
    }),

  linkUnmatchedToEmployee: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dixiName: z.string(),
      employeeId: z.number(),
      mesReferencia: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Buscar todos os registros pendentes deste nome
      const conditions = [
        companyFilter(unmatchedDixiRecords.companyId, input),
        eq(unmatchedDixiRecords.dixiName, input.dixiName),
        eq(unmatchedDixiRecords.status, 'pendente'),
      ];
      if (input.mesReferencia) {
        conditions.push(eq(unmatchedDixiRecords.mesReferencia, input.mesReferencia));
      }
      
      const pendingRecords = await db.select().from(unmatchedDixiRecords)
        .where(and(...conditions));
      
      if (pendingRecords.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro pendente encontrado para este nome.' });
      }

      // Buscar dados do funcionário para calcular horas
      const [emp] = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(eq(employees.id, input.employeeId));
      
      if (!emp) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado.' });
      }

      // Buscar critérios do sistema
      const criteriaRows = await db.select().from(systemCriteria)
        .where(companyFilter(systemCriteria.companyId, input));
      const criteria: CriteriaMap = { ...DEFAULT_CRITERIA };
      for (const c of criteriaRows) {
        (criteria as any)[c.chave] = parseFloat(String(c.valor));
      }

      // Jornada da OBRA prevalece sobre a do funcionário (por registro, via rec.obraId).
      const cidsLink = resolveCompanyIds(input);
      const obraJornadaMapLink = new Map<number, string>();
      {
        const obrasJ = await db.select({ id: obras.id, j: obras.jornadaTrabalho })
          .from(obras).where(and(inArray(obras.companyId, cidsLink), isNull(obras.deletedAt)));
        for (const o of obrasJ) if (obraTemJornada(o.j)) obraJornadaMapLink.set(o.id, o.j as string);
      }
      const jornadaEfetivaRecLink = (oid: number | null): string | null => {
        if (obraJornadaMapLink.size === 0) return emp.jornadaTrabalho ?? null;
        const obraJ = oid != null ? (obraJornadaMapLink.get(oid) ?? null) : null;
        return jornadaEfetiva(emp.jornadaTrabalho, obraJ);
      };

      // Per-day lock: descobrir intervalos de ciclos consolidados que abrangem as datas pendentes.
      const datasPendentes = pendingRecords.map(r => String(r.data)).filter(Boolean);
      const minData = datasPendentes.length > 0 ? datasPendentes.reduce((a, b) => a < b ? a : b) : null;
      const maxData = datasPendentes.length > 0 ? datasPendentes.reduce((a, b) => a > b ? a : b) : null;
      const lockedRanges = (minData && maxData)
        ? await getLockedRangesInWindow(db, input, minData, maxData)
        : [];
      const isLocked = (data: string) => lockedRanges.some(r => data >= r.dataInicioCiclo && data <= r.dataFimCiclo);
      const lockedRecordIds: number[] = [];

      // Converter registros não identificados em timeRecords reais
      const newTimeRecords: any[] = [];
      const newInconsistencies: any[] = [];
      const processedRecordIds: number[] = [];

      for (const rec of pendingRecords) {
        if (rec.data && isLocked(String(rec.data))) {
          lockedRecordIds.push(rec.id);
          continue;
        }
        processedRecordIds.push(rec.id);
        const entrada1 = rec.entrada1 || "";
        const saida1 = rec.saida1 || "";
        const entrada2 = rec.entrada2 || "";
        const saida2 = rec.saida2 || "";
        const entrada3 = rec.entrada3 || "";
        const saida3 = rec.saida3 || "";
        
        let totalMinutes = 0;
        if (entrada1 && saida1) totalMinutes += diffMinutes(entrada1, saida1);
        if (entrada2 && saida2) totalMinutes += diffMinutes(entrada2, saida2);
        if (entrada3 && saida3) totalMinutes += diffMinutes(entrada3, saida3);

        const recJornadaLink = jornadaEfetivaRecLink(rec.obraId ?? null);
        let expectedMinutes = 480;
        let isDiaFolgaJornada2 = false;
        if (recJornadaLink) {
          try {
            const jornada = typeof recJornadaLink === "string" ? JSON.parse(recJornadaLink) : recJornadaLink;
            const dayOfWeek = new Date(rec.data + "T12:00:00").getDay();
            const dayMap: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
            const dayKey = dayMap[dayOfWeek];
            if (jornada[dayKey]?.entrada && jornada[dayKey]?.saida) {
              const totalJornada = diffMinutes(jornada[dayKey].entrada, jornada[dayKey].saida);
              let intervaloMin = 60;
              if (jornada[dayKey].intervalo) {
                const parts = jornada[dayKey].intervalo.split(":");
                if (parts.length === 2) intervaloMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
              }
              expectedMinutes = totalJornada - intervaloMin;
            } else {
              expectedMinutes = 0;
              isDiaFolgaJornada2 = true;
            }
          } catch (e) { /* use default */ }
        }

        const diffBruto = totalMinutes - expectedMinutes;
        let horasExtras = 0;
        let atrasos = 0;
        let faltas = "0";
        
        if (isDiaFolgaJornada2 && totalMinutes > 0) {
          horasExtras = totalMinutes;
        } else if (diffBruto > 0) {
          // Verificar se chegou cedo (hora extra por chegada antecipada)
          let chegouCedo2 = false;
          if (entrada1 && recJornadaLink) {
            try {
              const jornada2 = typeof recJornadaLink === "string" ? JSON.parse(recJornadaLink) : recJornadaLink;
              const dow2 = new Date(rec.data + "T12:00:00").getDay();
              const dm2: Record<number, string> = { 0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab" };
              const dk2 = dm2[dow2];
              if (jornada2[dk2]?.entrada) {
                const entEsp = diffMinutes("00:00", jornada2[dk2].entrada);
                const entReal = diffMinutes("00:00", entrada1);
                if (entReal < entEsp) chegouCedo2 = true;
              }
            } catch (e) { /* ignore */ }
          }
          if (chegouCedo2) {
            horasExtras = diffBruto; // Chegou cedo: SEMPRE conta HE
          } else {
            horasExtras = diffBruto > criteria.pontoToleranciaSaida ? diffBruto : 0;
          }
        } else if (diffBruto < 0 && totalMinutes > 0) {
          const atrasoReal = Math.abs(diffBruto);
          if (atrasoReal >= criteria.pontoFaltaAposAtraso) {
            faltas = "1";
          } else if (atrasoReal > criteria.pontoToleranciaAtraso) {
            atrasos = atrasoReal;
          }
          // Dentro da tolerância (<=10min): atraso = 0, não desconta
        }

        const batidas = rec.batidasBrutas ? (typeof rec.batidasBrutas === 'string' ? JSON.parse(rec.batidasBrutas) : rec.batidasBrutas) : [];
        const numBatidas = Array.isArray(batidas) ? batidas.length : 0;

        newTimeRecords.push({
          companyId: input.companyId,
          employeeId: input.employeeId,
          obraId: rec.obraId,
          mesReferencia: rec.mesReferencia,
          data: rec.data,
          entrada1, saida1, entrada2, saida2, entrada3, saida3,
          horasTrabalhadas: minutesToHHMM(totalMinutes),
          horasExtras: horasExtras > 0 ? minutesToHHMM(horasExtras) : "0:00",
          horasNoturnas: "0:00",
          faltas,
          atrasos: atrasos > 0 ? minutesToHHMM(atrasos) : "0:00",
          fonte: "dixi",
          ajusteManual: 0,
          batidasBrutas: JSON.stringify(batidas),
        });

        if (numBatidas % 2 !== 0) {
          newInconsistencies.push({
            companyId: input.companyId, employeeId: input.employeeId, obraId: rec.obraId,
            mesReferencia: rec.mesReferencia, data: rec.data,
            tipoInconsistencia: "batida_impar" as const,
            descricao: `${numBatidas} batida(s) registrada(s) - número ímpar indica falta de entrada ou saída`,
            status: "pendente" as const,
          });
        }
        // Rev. 1229: 2 batidas pares são consideradas válidas (meio período).
      }

      // Antes de inserir: remover registros DIXI existentes para os mesmos (employeeId, obraId, data)
      // Isso evita duplicatas quando o usuário vincula um registro que já foi importado via upload normal
      if (newTimeRecords.length > 0) {
        for (const rec of newTimeRecords) {
          await db.delete(timeRecords).where(and(
            companyFilter(timeRecords.companyId, input),
            eq(timeRecords.employeeId, rec.employeeId),
            eq(timeRecords.data, rec.data),
            rec.obraId != null ? eq(timeRecords.obraId, rec.obraId) : sql`${timeRecords.obraId} IS NULL`,
            eq(timeRecords.fonte, "dixi"),
          ));
        }
      }

      // Inserir registros de ponto
      if (newTimeRecords.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < newTimeRecords.length; i += batchSize) {
          await db.insert(timeRecords).values(newTimeRecords.slice(i, i + batchSize));
        }
      }

      // Inserir inconsistências
      if (newInconsistencies.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < newInconsistencies.length; i += batchSize) {
          await db.insert(timeInconsistencies).values(newInconsistencies.slice(i, i + batchSize));
        }
      }

      // Marcar registros como vinculados — somente os que não estavam em ciclos consolidados.
      if (processedRecordIds.length > 0) {
        await db.update(unmatchedDixiRecords).set({
          status: 'vinculado',
          linkedEmployeeId: input.employeeId,
          resolvidoPor: ctx.user?.name || 'sistema',
          resolvidoEm: new Date().toISOString(),
        }).where(inArray(unmatchedDixiRecords.id, processedRecordIds));
      }

      // ===== SALVAR NA MEMÓRIA DE VINCULAÇÃO DIXI =====
      // Verifica se já existe um mapeamento para este nome
      const existingMapping = await db.select().from(dixiNameMappings)
        .where(and(
          companyFilter(dixiNameMappings.companyId, input),
          eq(dixiNameMappings.dixiName, input.dixiName),
        ));
      
      if (existingMapping.length === 0) {
        // Criar novo mapeamento
        await db.insert(dixiNameMappings).values({
          companyId: input.companyId,
          dixiName: input.dixiName,
          dixiId: pendingRecords[0]?.dixiId || null,
          employeeId: input.employeeId,
          employeeName: emp.nomeCompleto,
          source: 'import_link',
          createdBy: ctx.user?.name || 'sistema',
        });
      } else if (existingMapping[0].employeeId !== input.employeeId) {
        // Atualizar mapeamento existente para novo funcionário
        await db.update(dixiNameMappings).set({
          employeeId: input.employeeId,
          employeeName: emp.nomeCompleto,
          source: 'import_link',
          createdBy: ctx.user?.name || 'sistema',
        }).where(eq(dixiNameMappings.id, existingMapping[0].id));
      }

      return {
        success: true,
        recordsLinked: processedRecordIds.length,
        recordsLockedSkipped: lockedRecordIds.length,
        employeeName: emp.nomeCompleto,
        inconsistenciesCreated: newInconsistencies.length,
      };
    }),

  discardUnmatched: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dixiName: z.string(),
      mesReferencia: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      const conditions = [
        companyFilter(unmatchedDixiRecords.companyId, input),
        eq(unmatchedDixiRecords.dixiName, input.dixiName),
        eq(unmatchedDixiRecords.status, 'pendente'),
      ];
      if (input.mesReferencia) {
        conditions.push(eq(unmatchedDixiRecords.mesReferencia, input.mesReferencia));
      }
      
      // Per-day lock: descartar somente registros fora dos ciclos consolidados.
      const pending = await db.select({ id: unmatchedDixiRecords.id, data: unmatchedDixiRecords.data })
        .from(unmatchedDixiRecords).where(and(...conditions));
      const datas = pending.map(p => String(p.data)).filter(Boolean);
      const minD = datas.length > 0 ? datas.reduce((a, b) => a < b ? a : b) : null;
      const maxD = datas.length > 0 ? datas.reduce((a, b) => a > b ? a : b) : null;
      const lockedRanges = (minD && maxD) ? await getLockedRangesInWindow(db, input, minD, maxD) : [];
      const isLocked = (data: string) => lockedRanges.some(r => data >= r.dataInicioCiclo && data <= r.dataFimCiclo);
      const idsToDiscard = pending.filter(p => !p.data || !isLocked(String(p.data))).map(p => p.id);
      const skippedLocked = pending.length - idsToDiscard.length;

      let discarded = 0;
      if (idsToDiscard.length > 0) {
        const result = await db.update(unmatchedDixiRecords).set({
          status: 'descartado',
          resolvidoPor: ctx.user?.name || 'sistema',
          resolvidoEm: new Date().toISOString(),
        }).where(inArray(unmatchedDixiRecords.id, idsToDiscard));
        discarded = (result as any)[0]?.affectedRows || idsToDiscard.length;
      }

      return { success: true, discarded, skippedLocked };
    }),

  // ============================================================
  // MEMÓRIA DE VINCULAÇÃO DIXI - CRUD
  // ============================================================
  getDixiMappings: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const mappings = await db.select({
        id: dixiNameMappings.id,
        dixiName: dixiNameMappings.dixiName,
        dixiId: dixiNameMappings.dixiId,
        employeeId: dixiNameMappings.employeeId,
        employeeName: dixiNameMappings.employeeName,
        source: dixiNameMappings.source,
        createdBy: dixiNameMappings.createdBy,
        createdAt: dixiNameMappings.createdAt,
      }).from(dixiNameMappings)
        .where(companyFilter(dixiNameMappings.companyId, input))
        .orderBy(dixiNameMappings.dixiName);
      
      return mappings;
    }),

  addDixiMapping: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), dixiName: z.string(),
      dixiId: z.string().optional(),
      employeeId: z.number(),
      employeeName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Verificar se já existe
      const existing = await db.select().from(dixiNameMappings)
        .where(and(
          companyFilter(dixiNameMappings.companyId, input),
          eq(dixiNameMappings.dixiName, input.dixiName),
        ));
      
      if (existing.length > 0) {
        throw new TRPCError({ code: 'CONFLICT', message: `Já existe um mapeamento para o nome "${input.dixiName}".` });
      }
      
      await db.insert(dixiNameMappings).values({
        companyId: input.companyId,
        dixiName: input.dixiName,
        dixiId: input.dixiId || null,
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        source: 'manual',
        createdBy: ctx.user?.name || 'sistema',
      });
      
      return { success: true };
    }),

  deleteDixiMapping: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      await db.delete(dixiNameMappings).where(eq(dixiNameMappings.id, input.id));
      return { success: true };
    }),

  // ============================================================
  // SIMULADOR DE FOLHA POR MÊS (HORISTAS)
  // ============================================================
  simularFolhaHoristas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), diasUteis: z.number().min(1).max(31),
      horasPorDia: z.number().min(1).max(24).default(8),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Buscar todos os funcionários CLT ativos (todos são horistas)
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        funcao: employees.funcao,
        setor: employees.setor,
        valorHora: employees.valorHora,
        horasMensais: employees.horasMensais,
        salarioBase: employees.salarioBase,
        tipoContrato: employees.tipoContrato,
        codigoInterno: employees.codigoInterno,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, 'CLT'),
          sql`${employees.valorHora} IS NOT NULL AND ${employees.valorHora} != ''`,
          sql`${employees.status} IN ('Ativo', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
        )
      );
      
      const horasTotaisMes = input.diasUteis * input.horasPorDia;
      
      const simulacao = empList.map(emp => {
        const valorHoraStr = emp.valorHora || '0';
        const valorHora = parseBRL(valorHoraStr);
        const salarioPrevisto = valorHora * horasTotaisMes;
        
        return {
          id: emp.id,
          nomeCompleto: emp.nomeCompleto,
          codigoInterno: emp.codigoInterno,
          funcao: emp.funcao,
          setor: emp.setor,
          valorHora: valorHoraStr,
          valorHoraNum: valorHora,
          horasMes: horasTotaisMes,
          salarioPrevisto,
          salarioBase: emp.salarioBase,
        };
      });
      
      const totalFolha = simulacao.reduce((acc, e) => acc + e.salarioPrevisto, 0);
      
      return {
        diasUteis: input.diasUteis,
        horasPorDia: input.horasPorDia,
        horasTotaisMes,
        funcionarios: simulacao,
        totalFolha,
        totalFuncionarios: simulacao.length,
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // CORREÇÃO MANUAL DE PERÍODO — permite informar manualmente que um funcionário
  // estava de férias ou aviso prévio em um intervalo de datas e corrige os
  // registros de ponto já lançados naquele período.
  // ─────────────────────────────────────────────────────────────────────────
  corrigirPeriodoEspecialManual: protectedProcedure
    .input(z.object({
      companyId:   z.number(),
      employeeId:  z.number(),
      dataInicio:  z.string(), // YYYY-MM-DD
      dataFim:     z.string(), // YYYY-MM-DD
      tipo:        z.enum(['ferias', 'aviso_2h', 'aviso_7dias']),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      if (input.tipo === 'ferias') {
        // ── Férias: zera faltas e atrasos (preserva ajuste manual) ──────────
        const result = await db.execute(sql`
          UPDATE time_records
          SET faltas = '0', atrasos = '0:00'
          WHERE company_id = ${input.companyId}
            AND employee_id = ${input.employeeId}
            AND ajuste_manual = 0
            AND data BETWEEN ${input.dataInicio} AND ${input.dataFim}
        `);
        return { corrigidos: Number((result as any).rowCount ?? 0) };
      }

      // ── Aviso Prévio: recalcula expectedMinutes com redução ──────────────
      const criteria = await getCriteriaMap(input.companyId);
      const [emp] = await db.select({ jornadaTrabalho: employees.jornadaTrabalho })
        .from(employees).where(eq(employees.id, input.employeeId));

      // Jornada da OBRA prevalece sobre a do funcionário (por registro, via obraId).
      const obraJornadaMapAv = new Map<number, string>();
      {
        const obrasJ = await db.select({ id: obras.id, j: obras.jornadaTrabalho })
          .from(obras).where(and(eq(obras.companyId, input.companyId), isNull(obras.deletedAt)));
        for (const o of obrasJ) if (obraTemJornada(o.j)) obraJornadaMapAv.set(o.id, o.j as string);
      }
      const jornadaEfetivaRecAv = (oid: number | null): string | null => {
        if (obraJornadaMapAv.size === 0) return emp?.jornadaTrabalho ?? null;
        const obraJ = oid != null ? (obraJornadaMapAv.get(oid) ?? null) : null;
        return jornadaEfetiva(emp?.jornadaTrabalho ?? null, obraJ);
      };

      const records = await db.select({
        id: timeRecords.id, data: timeRecords.data, obraId: timeRecords.obraId,
        entrada1: timeRecords.entrada1, saida1: timeRecords.saida1,
        entrada2: timeRecords.entrada2, saida2: timeRecords.saida2,
        entrada3: timeRecords.entrada3, saida3: timeRecords.saida3,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
      }).from(timeRecords).where(
        and(
          eq(timeRecords.companyId, input.companyId),
          eq(timeRecords.employeeId, input.employeeId),
          sql`${timeRecords.ajusteManual} = 0`,
          sql`${timeRecords.data} BETWEEN ${input.dataInicio} AND ${input.dataFim}`,
        )
      );

      let corrigidos = 0;
      for (const rec of records) {
        const data = rec.data!;
        const recJornadaAv = jornadaEfetivaRecAv(rec.obraId ?? null);
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
        if (recJornadaAv) {
          try {
            const jornada = typeof recJornadaAv === 'string' ? JSON.parse(recJornadaAv) : recJornadaAv;
            const dow = new Date(data + 'T12:00:00').getDay();
            const dayMap: Record<number, string> = { 0:'dom',1:'seg',2:'ter',3:'qua',4:'qui',5:'sex',6:'sab' };
            const dk = dayMap[dow];
            if (jornada[dk]?.entrada && jornada[dk]?.saida) {
              const j = jornada[dk];
              const [sh, sm] = j.saida.split(':').map(Number);
              const [eh, em2] = j.entrada.split(':').map(Number);
              let intMin = 60;
              if (j.intervalo) { const ip = j.intervalo.split(':'); if (ip.length===2) intMin = parseInt(ip[0])*60+parseInt(ip[1]); }
              expectedMinutes = Math.max(0, (sh*60+sm)-(eh*60+em2)-intMin);
            } else { expectedMinutes = 0; isDiaFolga = true; }
          } catch { /* usa 480 */ }
        }

        if (input.tipo === 'aviso_2h') {
          expectedMinutes = Math.max(0, expectedMinutes - 120);
        } else if (input.tipo === 'aviso_7dias') {
          // Nos 7 dias corridos finais o funcionário pode se ausentar; usa dataFim como fim do aviso
          const fimAviso  = new Date(input.dataFim + 'T12:00:00');
          const dataAtual = new Date(data + 'T12:00:00');
          const diffDias  = Math.ceil((fimAviso.getTime() - dataAtual.getTime()) / (1000*60*60*24));
          if (diffDias <= 7) expectedMinutes = 0;
        }

        const diffBruto = totalMinutes - expectedMinutes;
        const { pontoToleranciaAtraso: tolAtraso, pontoToleranciaSaida: tolSaida, pontoFaltaAposAtraso: faltaApos } = criteria;
        let horasExtras = 0, atrasos = 0, faltas = '0';

        if (isDiaFolga && totalMinutes > 0) {
          horasExtras = totalMinutes;
        } else if (diffBruto > 0) {
          horasExtras = diffBruto > tolSaida ? diffBruto : 0;
        } else if (diffBruto < 0 && totalMinutes > 0) {
          const ar = Math.abs(diffBruto);
          if (ar > tolAtraso) { if (ar >= faltaApos) faltas = '1'; else atrasos = ar; }
        } else if (totalMinutes === 0) {
          faltas = '1';
        }

        await db.execute(sql`
          UPDATE time_records
          SET horas_extras = ${minutesToHHMM(horasExtras)},
              atrasos      = ${minutesToHHMM(atrasos)},
              faltas       = ${faltas}
          WHERE id = ${rec.id}
        `);
        corrigidos++;
      }
      return { corrigidos };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // CORREÇÃO RETROATIVA — aplica as regras de Aviso Prévio e Férias sobre
  // registros já salvos no banco, sem precisar re-importar o DIXI.
  // Pula registros com ajusteManual = 1 para preservar correções manuais.
  // ─────────────────────────────────────────────────────────────────────────
  aplicarCorrecaoRetroativa: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const criteria = await getCriteriaMap(input.companyId);

      let corrigidasFerias = 0;
      let corrigidasAviso = 0;

      // ── 1. FÉRIAS ──────────────────────────────────────────────────────────
      // Para cada período de férias ativo, zera faltas/atrasos dos registros
      // de ponto que caem dentro do período.
      const feriasAtivas = await db.select({
        employeeId: vacationPeriods.employeeId,
        dataInicio:    vacationPeriods.dataInicio,
        dataFim:       vacationPeriods.dataFim,
        periodo2Inicio: vacationPeriods.periodo2Inicio,
        periodo2Fim:    vacationPeriods.periodo2Fim,
        periodo3Inicio: vacationPeriods.periodo3Inicio,
        periodo3Fim:    vacationPeriods.periodo3Fim,
      }).from(vacationPeriods).where(
        and(
          companyFilter(vacationPeriods.companyId, input),
          sql`${vacationPeriods.status} NOT IN ('cancelada', 'pendente')`,
          isNull(vacationPeriods.deletedAt),
          sql`${vacationPeriods.dataInicio} IS NOT NULL`,
        )
      );

      for (const fp of feriasAtivas) {
        // Monta os intervalos válidos deste período
        const ranges: Array<{ inicio: string; fim: string }> = [];
        if (fp.dataInicio && fp.dataFim)           ranges.push({ inicio: fp.dataInicio,    fim: fp.dataFim });
        if (fp.periodo2Inicio && fp.periodo2Fim)   ranges.push({ inicio: fp.periodo2Inicio, fim: fp.periodo2Fim });
        if (fp.periodo3Inicio && fp.periodo3Fim)   ranges.push({ inicio: fp.periodo3Inicio, fim: fp.periodo3Fim });

        for (const { inicio, fim } of ranges) {
          const result = await db.execute(sql`
            UPDATE time_records
            SET faltas = '0', atrasos = '0:00'
            WHERE company_id = ${input.companyId}
              AND employee_id = ${fp.employeeId}
              AND ajuste_manual = 0
              AND data BETWEEN ${inicio} AND ${fim}
              AND (faltas != '0' OR (atrasos IS NOT NULL AND atrasos != '0:00' AND atrasos != ''))
          `);
          corrigidasFerias += Number((result as any).rowCount ?? 0);
        }
      }

      // ── 2. AVISO PRÉVIO ────────────────────────────────────────────────────
      // Para cada aviso com reducaoJornada, recalcula expectedMinutes e
      // corrige HE / atrasos / faltas dos registros não ajustados manualmente.
      const avisos = await db.select({
        employeeId:    terminationNotices.employeeId,
        dataInicio:    terminationNotices.dataInicio,
        dataFim:       terminationNotices.dataFim,
        reducaoJornada: terminationNotices.reducaoJornada,
      }).from(terminationNotices).where(
        and(
          companyFilter(terminationNotices.companyId, input),
          eq(terminationNotices.status, 'em_andamento'),
          sql`${terminationNotices.tipo} IN ('empregador_trabalhado', 'empregado_trabalhado')`,
          sql`${terminationNotices.reducaoJornada} IN ('2h_dia', '7_dias_corridos')`,
          sql`${terminationNotices.deletedAt} IS NULL`,
        )
      );

      // Jornada da OBRA prevalece sobre a do funcionário (por registro, via obraId).
      const obraJornadaMapSim = new Map<number, string>();
      {
        const obrasJ = await db.select({ id: obras.id, j: obras.jornadaTrabalho })
          .from(obras).where(and(companyFilter(obras.companyId, input), isNull(obras.deletedAt)));
        for (const o of obrasJ) if (obraTemJornada(o.j)) obraJornadaMapSim.set(o.id, o.j as string);
      }

      for (const aviso of avisos) {
        // Busca o funcionário para obter a jornada de trabalho
        const empRows = await db.select({
          id: employees.id,
          jornadaTrabalho: employees.jornadaTrabalho,
        }).from(employees).where(eq(employees.id, aviso.employeeId));
        if (!empRows.length) continue;
        const emp = empRows[0];
        const jornadaEfetivaRecSim = (oid: number | null): string | null => {
          if (obraJornadaMapSim.size === 0) return emp.jornadaTrabalho ?? null;
          const obraJ = oid != null ? (obraJornadaMapSim.get(oid) ?? null) : null;
          return jornadaEfetiva(emp.jornadaTrabalho, obraJ);
        };

        // Busca registros não ajustados dentro do período do aviso
        const records = await db.select({
          id:              timeRecords.id,
          data:            timeRecords.data,
          obraId:          timeRecords.obraId,
          entrada1:        timeRecords.entrada1,
          saida1:          timeRecords.saida1,
          entrada2:        timeRecords.entrada2,
          saida2:          timeRecords.saida2,
          entrada3:        timeRecords.entrada3,
          saida3:          timeRecords.saida3,
          horasTrabalhadas: timeRecords.horasTrabalhadas,
        }).from(timeRecords).where(
          and(
            eq(timeRecords.companyId, input.companyId),
            eq(timeRecords.employeeId, aviso.employeeId),
            sql`${timeRecords.ajusteManual} = 0`,
            sql`${timeRecords.data} BETWEEN ${aviso.dataInicio} AND ${aviso.dataFim}`,
          )
        );

        for (const rec of records) {
          const data = rec.data!;

          // Calcula totalMinutes a partir das batidas armazenadas
          let totalMinutes = 0;
          const dm = (a: string | null | undefined, b: string | null | undefined) => {
            if (!a || !b) return 0;
            const [ah, am] = a.split(':').map(Number);
            const [bh, bm] = b.split(':').map(Number);
            return Math.max(0, (bh * 60 + bm) - (ah * 60 + am));
          };
          totalMinutes += dm(rec.entrada1, rec.saida1);
          totalMinutes += dm(rec.entrada2, rec.saida2);
          totalMinutes += dm(rec.entrada3, rec.saida3);

          // Se não tem batidas, tenta parsear horasTrabalhadas direto
          if (totalMinutes === 0 && rec.horasTrabalhadas) {
            const parts = rec.horasTrabalhadas.split(':');
            if (parts.length === 2) totalMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
          }

          // Calcula expectedMinutes a partir da jornada efetiva (obra > func) deste dia
          const recJornadaSim = jornadaEfetivaRecSim(rec.obraId ?? null);
          let expectedMinutes = 480;
          let isDiaFolga = false;
          if (recJornadaSim) {
            try {
              const jornada = typeof recJornadaSim === 'string'
                ? JSON.parse(recJornadaSim) : recJornadaSim;
              const dow = new Date(data + 'T12:00:00').getDay();
              const dayMap: Record<number, string> = { 0:'dom',1:'seg',2:'ter',3:'qua',4:'qui',5:'sex',6:'sab' };
              const dk = dayMap[dow];
              if (jornada[dk]?.entrada && jornada[dk]?.saida) {
                const j = jornada[dk];
                const [sh, sm] = j.saida.split(':').map(Number);
                const [eh, em2] = j.entrada.split(':').map(Number);
                const totalJ = (sh * 60 + sm) - (eh * 60 + em2);
                let intervMin = 60;
                if (j.intervalo) {
                  const ip = j.intervalo.split(':');
                  if (ip.length === 2) intervMin = parseInt(ip[0]) * 60 + parseInt(ip[1]);
                }
                expectedMinutes = Math.max(0, totalJ - intervMin);
              } else {
                expectedMinutes = 0;
                isDiaFolga = true;
              }
            } catch { /* usa 480 */ }
          }

          // Aplica redução do aviso prévio
          if (aviso.reducaoJornada === '2h_dia') {
            expectedMinutes = Math.max(0, expectedMinutes - 120);
          } else if (aviso.reducaoJornada === '7_dias_corridos') {
            const fimAviso  = new Date(aviso.dataFim + 'T12:00:00');
            const dataAtual = new Date(data + 'T12:00:00');
            const diffDias  = Math.ceil((fimAviso.getTime() - dataAtual.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDias <= 7) expectedMinutes = 0;
          }

          const diffBruto = totalMinutes - expectedMinutes;
          const tolAtraso = criteria.pontoToleranciaAtraso;
          const tolSaida  = criteria.pontoToleranciaSaida;
          const faltaApos = criteria.pontoFaltaAposAtraso;

          let horasExtras = 0;
          let atrasos = 0;
          let faltas  = '0';

          if (isDiaFolga && totalMinutes > 0) {
            horasExtras = totalMinutes;
          } else if (diffBruto > 0) {
            // Chegou cedo (antecipada): tudo HE se não há batida de entrada definida com tolerância
            // Saiu mais tarde: só conta se além da tolerância
            horasExtras = diffBruto > tolSaida ? diffBruto : 0;
          } else if (diffBruto < 0 && totalMinutes > 0) {
            const atrasoReal = Math.abs(diffBruto);
            if (atrasoReal <= tolAtraso) {
              // dentro da tolerância — sem penalidade
            } else if (atrasoReal >= faltaApos) {
              faltas = '1';
            } else {
              atrasos = atrasoReal;
            }
          } else if (totalMinutes === 0) {
            faltas = '1';
          }

          const heStr    = minsToHHMM(horasExtras);
          const atrasStr = minsToHHMM(atrasos);

          await db.execute(sql`
            UPDATE time_records
            SET horas_extras = ${heStr},
                atrasos      = ${atrasStr},
                faltas       = ${faltas}
            WHERE id = ${rec.id}
          `);
          corrigidasAviso++;
        }
      }

      return {
        corrigidasFerias,
        corrigidasAviso,
        total: corrigidasFerias + corrigidasAviso,
      };
    }),

  // Recalcula atrasos/HE/totalizadores de TODOS os time_records do período
  // sem alterar as batidas brutas. Útil para reprocessar dias que foram
  // importados pelo Dixi antes da lógica completa rodar (ex: dias com
  // batidas ímpares cujo atraso ficou em "0:00").
  recalcularPeriodo: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      dataInicio: z.string(),
      dataFim:    z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // Validação de escopo: o funcionário precisa pertencer a uma das empresas
      // do contexto (companyId ou companyIds). Bloqueia IDOR via chamada direta.
      const empCheck = await db.select({
        id: employees.id,
        companyId: employees.companyId,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(and(
        eq(employees.id, input.employeeId),
        companyFilter(employees.companyId, input),
      )).limit(1);
      if (empCheck.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Funcionário não pertence à empresa informada ou você não tem permissão.",
        });
      }
      const jornadaTrabalho = empCheck[0].jornadaTrabalho ?? null;
      const empCompanyId = Number(empCheck[0].companyId);

      // Não toca em datas dentro de ciclos consolidados (usa a empresa do funcionário)
      const lockedRanges = await getLockedRangesInWindow(
        db, { companyId: empCompanyId }, input.dataInicio, input.dataFim,
      );
      const isLocked = (d: string) =>
        lockedRanges.some(r => d >= r.dataInicioCiclo && d <= r.dataFimCiclo);

      const recs = await db.select().from(timeRecords)
        .where(and(
          companyFilter(timeRecords.companyId, input),
          eq(timeRecords.employeeId, input.employeeId),
          sql`${timeRecords.data} BETWEEN ${input.dataInicio} AND ${input.dataFim}`,
        ));

      // Jornada da OBRA prevalece sobre a do funcionário: carrega a jornada das
      // obras presentes nos registros (por rec.obraId). Map vazio → comportamento legado.
      const obraJornadaMap = new Map<number, string>();
      const obraIdsRecs = Array.from(new Set(recs.map(r => r.obraId).filter((x): x is number => x != null)));
      if (obraIdsRecs.length > 0) {
        const obrasJ = await db.select({ id: obras.id, j: obras.jornadaTrabalho })
          .from(obras).where(and(inArray(obras.id, obraIdsRecs), companyFilter(obras.companyId, input)));
        for (const o of obrasJ) if (obraTemJornada(o.j)) obraJornadaMap.set(o.id, o.j as string);
      }

      let recalculados = 0;
      let pulados = 0;
      let lockedSkipped = 0;
      const ajustes: Array<{ data: string; antes: { he: string; atraso: string; total: string }; depois: { he: string; atraso: string; total: string } }> = [];

      for (const rec of recs) {
        const dataStr = String(rec.data);
        if (isLocked(dataStr)) { lockedSkipped++; continue; }

        // Recalcula a partir das batidas existentes
        let totalMinutes = 0;
        if (rec.entrada1 && rec.saida1) totalMinutes += diffMinutes(rec.entrada1, rec.saida1);
        if (rec.entrada2 && rec.saida2) totalMinutes += diffMinutes(rec.entrada2, rec.saida2);
        if (rec.entrada3 && rec.saida3) totalMinutes += diffMinutes(rec.entrada3, rec.saida3);

        const dow = new Date(dataStr + "T12:00:00Z").getUTCDay();
        const isWeekendDay = dow === 0 || dow === 6;
        // A jornada da obra do registro (rec.obraId) prevalece sobre a do funcionário.
        const jornadaEfetivaRec = jornadaEfetiva(
          jornadaTrabalho,
          rec.obraId != null ? (obraJornadaMap.get(rec.obraId) ?? null) : null,
        );
        const expectedMins = isWeekendDay ? 0 : getExpectedMinsFromJornada(jornadaEfetivaRec, dataStr);
        const heMins = isWeekendDay
          ? totalMinutes
          : (expectedMins !== null ? Math.max(0, totalMinutes - expectedMins) : 0);
        const atrasoMins = !isWeekendDay && expectedMins !== null && totalMinutes < expectedMins && totalMinutes > 0
          ? Math.max(0, expectedMins - totalMinutes)
          : 0;

        const novoTotal  = minutesToHHMM(totalMinutes);
        const novoHE     = minutesToHHMM(heMins);
        const novoAtraso = atrasoMins > 0 ? minutesToHHMM(atrasoMins) : "0:00";

        const mudou =
          (rec.horasTrabalhadas || "0:00") !== novoTotal ||
          (rec.horasExtras || "0:00")      !== novoHE ||
          (rec.atrasos || "0:00")          !== novoAtraso;

        if (!mudou) { pulados++; continue; }

        ajustes.push({
          data: dataStr,
          antes:  { he: rec.horasExtras || "0:00", atraso: rec.atrasos || "0:00", total: rec.horasTrabalhadas || "0:00" },
          depois: { he: novoHE, atraso: novoAtraso, total: novoTotal },
        });

        await db.update(timeRecords)
          .set({
            horasTrabalhadas: novoTotal,
            horasExtras: novoHE,
            atrasos: novoAtraso,
          } as any)
          .where(eq(timeRecords.id, rec.id));
        recalculados++;
      }

      console.log(`[RecalcPonto] emp=${input.employeeId} ${input.dataInicio}→${input.dataFim}: ${recalculados} recalculados, ${pulados} sem alteração, ${lockedSkipped} bloqueados (ciclo consolidado), por ${ctx.user?.name || "RH"}`);

      return {
        recalculados,
        pulados,
        lockedSkipped,
        totalAvaliados: recs.length,
        ajustes: ajustes.slice(0, 50), // amostra para a UI mostrar
      };
    }),

  limparPontoPeriodo: protectedProcedure
    .input(z.object({
      companyId:  z.number(),
      employeeId: z.number(),
      dataInicio: z.string(),
      dataFim:    z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Per-day lock: não apaga datas dentro de ciclos consolidados.
      const lockedRanges = await getLockedRangesInWindow(db!, { companyId: input.companyId }, input.dataInicio, input.dataFim);
      const notLockedClause = lockedRanges.length > 0
        ? sql.join(lockedRanges.map(r => sql`NOT (data >= ${r.dataInicioCiclo} AND data <= ${r.dataFimCiclo})`), sql` AND `)
        : sql`TRUE`;
      const result = await db!.execute(sql`
        DELETE FROM time_records
        WHERE company_id = ${input.companyId}
          AND employee_id = ${input.employeeId}
          AND data BETWEEN ${input.dataInicio} AND ${input.dataFim}
          AND ${notLockedClause}
      `);
      const deleted = Number((result as any).rowCount ?? 0);
      console.log(`[LimparPonto] Removidos ${deleted} registros de ponto — emp=${input.employeeId} de ${input.dataInicio} a ${input.dataFim} (lockedRanges=${lockedRanges.length})`);
      return { deleted, lockedRangesSkipped: lockedRanges.length };
    }),

  // ========================================================
  // RELATÓRIO DE FALTAS / ATRASOS / SAÍDAS ANTECIPADAS
  // ========================================================
  // Para cada funcionário ativo no período, calcula:
  //   - faltas injustificadas (dia útil sem batida e sem atestado/férias)
  //   - faltas justificadas    (dia útil sem batida COM atestado/férias)
  //   - dsr perdido            (1 falta injustificada na semana → 1 DSR perdido)
  //   - atrasos                (entrada > tolerância)
  //   - saídas antecipadas     (saída < jornada – tolerância)
  //   - drill-down: lista de datas com motivo
  getFaltasReport: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      dataInicio: z.string(), // YYYY-MM-DD
      dataFim:    z.string(),
      obraIds:    z.array(z.number()).optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { dataInicio, dataFim } = input;
      if (dataInicio > dataFim) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data inicial maior que data final." });
      }
      const cids = resolveCompanyIds(input);

      // ----- 1) Funcionários ATIVOS CLT no período (mesmo critério do consolidarMes)
      const empConds: any[] = [
        inArray(employees.companyId, cids),
        isNull(employees.deletedAt),
        // SOMENTE CLT — exclui Autônomos, PJ, Prestadores de Serviço
        eq(employees.tipoContrato, 'CLT'),
        // SOMENTE Ativos ou em Férias — exclui Demitido, Afastado, Recluso, Lista_Negra, Excluído
        sql`${employees.status} IN ('Ativo', 'Ferias')`,
        // Admitido até dataFim
        sql`(${employees.dataAdmissao} IS NULL OR ${employees.dataAdmissao} <= ${dataFim})`,
        // Não desligado antes do início (considera dataDemissao OU dataDesligamentoEfetiva)
        sql`(
          (${employees.dataDemissao} IS NULL AND ${employees.dataDesligamentoEfetiva} IS NULL)
          OR COALESCE(${employees.dataDesligamentoEfetiva}, ${employees.dataDemissao}) >= ${dataInicio}
        )`,
      ];
      const empListRaw = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        matricula: employees.matricula,
        cpf: employees.cpf,
        cargo: employees.cargo,
        funcao: employees.funcao,
        setor: employees.setor,
        dataAdmissao: employees.dataAdmissao,
        dataDemissao: employees.dataDemissao,
        dataDesligamentoEfetiva: employees.dataDesligamentoEfetiva,
        jornadaTrabalho: employees.jornadaTrabalho,
        status: employees.status,
        companyId: employees.companyId,
      }).from(employees).where(and(...empConds));

      // ----- 1b) Deduplicação por (matrícula|cpf) — pega o registro com maior id (mais recente)
      const dedup = new Map<string, typeof empListRaw[number]>();
      for (const e of empListRaw) {
        const key = (e.matricula || "").trim().toLowerCase()
          || (e.cpf || "").replace(/\D/g, "")
          || `id:${e.id}`;
        const cur = dedup.get(key);
        if (!cur || (e.id || 0) > (cur.id || 0)) dedup.set(key, e);
      }
      const empList = Array.from(dedup.values());

      if (empList.length === 0) {
        return { funcionarios: [], totais: { injustificadas: 0, justificadas: 0, dsrPerdido: 0, atrasos: 0, saidasAntecipadas: 0 } };
      }

      const empIds = empList.map(e => e.id);

      // ----- 2) Filtro opcional por obra: pega só funcionários que tiveram registro/lotação na obra no período
      let obraEmpIds: Set<number> | null = null;
      if (input.obraIds && input.obraIds.length > 0) {
        const recsObra = await db.select({ employeeId: timeRecords.employeeId })
          .from(timeRecords)
          .where(and(
            inArray(timeRecords.companyId, cids),
            between(timeRecords.data, dataInicio, dataFim),
            inArray(timeRecords.obraId, input.obraIds),
          ));
        obraEmpIds = new Set(recsObra.map(r => r.employeeId).filter((x): x is number => x != null));
      }

      // ----- 3) Registros de ponto no período
      const recs = await db.select({
        employeeId: timeRecords.employeeId,
        data: timeRecords.data,
        obraId: timeRecords.obraId,
        entrada1: timeRecords.entrada1,
        saida1: timeRecords.saida1,
        entrada2: timeRecords.entrada2,
        saida2: timeRecords.saida2,
      }).from(timeRecords).where(and(
        inArray(timeRecords.companyId, cids),
        inArray(timeRecords.employeeId, empIds),
        between(timeRecords.data, dataInicio, dataFim),
      ));
      const recsByEmpDay = new Map<string, typeof recs[number]>();
      for (const r of recs) recsByEmpDay.set(`${r.employeeId}|${r.data}`, r);

      // ----- 3b) Jornada da OBRA prevalece sobre a do funcionário (alocados).
      // Carrega a jornada das obras da empresa que TÊM jornada cadastrada; e o
      // histórico de lotação (employee_site_history) p/ resolver a obra dos dias
      // SEM batida (faltas). Map vazio → comportamento legado (zero regressão).
      const obraJornadaMap = new Map<number, string>();
      const obrasJ = await db.select({ id: obras.id, j: obras.jornadaTrabalho })
        .from(obras).where(and(inArray(obras.companyId, cids), isNull(obras.deletedAt)));
      for (const o of obrasJ) if (obraTemJornada(o.j)) obraJornadaMap.set(o.id, o.j as string);
      const alocByEmp = new Map<number, AlocacaoObra[]>();
      if (obraJornadaMap.size > 0) {
        const hist = await db.select({
          employeeId: employeeSiteHistory.employeeId,
          obraId: employeeSiteHistory.obraId,
          dataInicio: employeeSiteHistory.dataInicio,
          dataFim: employeeSiteHistory.dataFim,
        }).from(employeeSiteHistory).where(and(
          inArray(employeeSiteHistory.companyId, cids),
          inArray(employeeSiteHistory.employeeId, empIds),
        ));
        for (const h of hist) {
          const arr = alocByEmp.get(h.employeeId) || [];
          arr.push({ obraId: h.obraId ?? null, dataInicio: h.dataInicio ?? null, dataFim: h.dataFim ?? null });
          alocByEmp.set(h.employeeId, arr);
        }
      }
      // Resolve a jornada efetiva (obra ou funcionário) p/ um dia de um funcionário.
      function jornadaEfetivaDia(emp: { id: number; jornadaTrabalho: any }, ds: string): string | null {
        if (obraJornadaMap.size === 0) return emp.jornadaTrabalho ?? null;
        const rec = recsByEmpDay.get(`${emp.id}|${ds}`);
        let oid: number | null = rec?.obraId ?? null;
        if (oid == null) oid = obraNaDataFromAlocacoes(alocByEmp.get(emp.id) || [], ds);
        const obraJ = oid != null ? (obraJornadaMap.get(oid) ?? null) : null;
        return jornadaEfetiva(emp.jornadaTrabalho, obraJ);
      }

      // ----- 4) Atestados que cobrem dias do período
      const ats = await db.select({
        employeeId: atestados.employeeId,
        dataEmissao: atestados.dataEmissao,
        diasAfastamento: atestados.diasAfastamento,
        dataRetorno: atestados.dataRetorno,
        afastamentoTipo: atestados.afastamentoTipo,
        tipo: atestados.tipo,
      }).from(atestados).where(and(
        inArray(atestados.companyId, cids),
        inArray(atestados.employeeId, empIds),
        isNull(atestados.deletedAt),
        // overlap com período
        sql`${atestados.dataEmissao} <= ${dataFim}`,
      ));
      // Set de dias cobertos por atestado: empId|YYYY-MM-DD → tipo
      // Rev. 4005 — guard contra data corrompida (ex.: "20026-05-09" por erro de
      // digitação) que fazia este loop iterar ~18 mil anos dia a dia e travar o
      // relatório indefinidamente para QUALQUER usuário que consultasse a empresa
      // afetada. Clampa o range de iteração aos limites do período solicitado
      // (dataInicio/dataFim) ANTES do loop, em vez de iterar o range bruto do
      // atestado e descartar dias fora do período depois.
      const atestSet = new Map<string, string>();
      const dInicioDate = new Date(dataInicio + "T12:00:00Z");
      const dFimDate = new Date(dataFim + "T12:00:00Z");
      for (const a of ats) {
        if ((a.afastamentoTipo || "dia") !== "dia") continue; // afastamento em horas não cobre dia inteiro
        const start = a.dataEmissao;
        let endStr: string;
        if (a.dataRetorno) {
          // dataRetorno = primeiro dia de volta ao trabalho → cobre até dia anterior
          const rd = new Date(a.dataRetorno + "T12:00:00Z");
          rd.setUTCDate(rd.getUTCDate() - 1);
          endStr = rd.toISOString().slice(0, 10);
        } else {
          const dias = Math.max(1, a.diasAfastamento || 1);
          const sd = new Date(start + "T12:00:00Z");
          sd.setUTCDate(sd.getUTCDate() + dias - 1);
          endStr = sd.toISOString().slice(0, 10);
        }
        const sd = new Date(start + "T12:00:00Z");
        const ed = new Date(endStr + "T12:00:00Z");
        if (isNaN(sd.getTime()) || isNaN(ed.getTime())) continue; // data inválida — ignora com segurança
        // Clampa aos limites do período ANTES de iterar, pra nunca varrer mais
        // que o período solicitado independente do que veio gravado no banco.
        const loopStart = sd < dInicioDate ? dInicioDate : sd;
        const loopEnd = ed > dFimDate ? dFimDate : ed;
        for (let d = new Date(loopStart); d <= loopEnd; d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().slice(0, 10);
          atestSet.set(`${a.employeeId}|${ds}`, a.tipo || "Atestado");
        }
      }

      // ----- 5) Férias gozadas no período (vacationPeriods)
      const vacs = await db.select({
        employeeId: vacationPeriods.employeeId,
        dataInicio: vacationPeriods.dataInicio,
        dataFim: vacationPeriods.dataFim,
        periodo2Inicio: vacationPeriods.periodo2Inicio,
        periodo2Fim: vacationPeriods.periodo2Fim,
        periodo3Inicio: vacationPeriods.periodo3Inicio,
        periodo3Fim: vacationPeriods.periodo3Fim,
      }).from(vacationPeriods).where(and(
        inArray(vacationPeriods.companyId, cids),
        inArray(vacationPeriods.employeeId, empIds),
      ));
      const feriasSet = new Set<string>();
      // Rev. 4005 — mesmo guard do bloco de atestados acima: clampa aos limites
      // do período ANTES de iterar, pra uma data corrompida em vacation_periods
      // não travar o relatório varrendo décadas/séculos dia a dia.
      const addRange = (empId: number, ini?: string | null, fim?: string | null) => {
        if (!ini || !fim) return;
        const sd = new Date(ini + "T12:00:00Z");
        const ed = new Date(fim + "T12:00:00Z");
        if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return; // data inválida — ignora com segurança
        const loopStart = sd < dInicioDate ? dInicioDate : sd;
        const loopEnd = ed > dFimDate ? dFimDate : ed;
        for (let d = new Date(loopStart); d <= loopEnd; d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().slice(0, 10);
          feriasSet.add(`${empId}|${ds}`);
        }
      };
      for (const v of vacs) {
        addRange(v.employeeId, v.dataInicio, v.dataFim);
        addRange(v.employeeId, v.periodo2Inicio, v.periodo2Fim);
        addRange(v.employeeId, v.periodo3Inicio, v.periodo3Fim);
      }

      // ----- 6) Feriados (geral + por empresa)
      const ferRows = await db.select({ data: feriados.data, recorrente: feriados.recorrente })
        .from(feriados).where(and(
          eq(feriados.ativo, 1),
          or(isNull(feriados.companyId), inArray(feriados.companyId, cids)) as any,
        ));
      const feriadoSet = new Set<string>();
      const yIni = parseInt(dataInicio.slice(0, 4), 10);
      const yFim = parseInt(dataFim.slice(0, 4), 10);
      for (const f of ferRows) {
        if (f.recorrente === 1) {
          for (let y = yIni; y <= yFim; y++) {
            const md = String(f.data).slice(5);
            const ds = `${y}-${md}`;
            if (ds >= dataInicio && ds <= dataFim) feriadoSet.add(ds);
          }
        } else {
          if (String(f.data) >= dataInicio && String(f.data) <= dataFim) feriadoSet.add(String(f.data));
        }
      }

      // ----- 7) Critérios de tolerância (usa companyId principal)
      const criteria = await getCriteriaMap(input.companyId);
      const tolAtraso = criteria.pontoToleranciaAtraso;
      const tolSaida  = criteria.pontoToleranciaSaida;
      const sabadoTipo = criteria.jornadaSabadoTipo; // compensado, meio_periodo, normal, folga

      // ----- Helper: é dia útil esperado para esse funcionário?
      // Retorna { isWorkday, expectedEntrada, expectedSaida, expectedMins }
      function getExpected(emp: typeof empList[number], dateStr: string) {
        const dow = new Date(dateStr + "T12:00:00Z").getUTCDay(); // 0=dom..6=sab
        if (dow === 0) return { isWorkday: false, entrada: null as string | null, saida: null as string | null, mins: 0 };
        // Jornada efetiva do dia: a da OBRA alocada prevalece sobre a do funcionário.
        const jornadaDia = jornadaEfetivaDia(emp, dateStr);
        // Tenta jornada efetiva (obra > funcionário)
        if (jornadaDia) {
          try {
            const parsed = typeof jornadaDia === "string" ? JSON.parse(jornadaDia) : jornadaDia;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const keys = ["dom","seg","ter","qua","qui","sex","sab"];
              const day = parsed[keys[dow]];
              if (!day || !day.entrada || !day.saida) {
                return { isWorkday: false, entrada: null, saida: null, mins: 0 };
              }
              const toMins = (t: string) => { const [h,m] = t.split(":").map(Number); return (h||0)*60 + (m||0); };
              let mins = toMins(day.saida) - toMins(day.entrada);
              if (day.intervalo) {
                const [ih, im] = String(day.intervalo).split(":").map(Number);
                mins -= (ih || 0) * 60 + (im || 0);
              }
              return { isWorkday: true, entrada: day.entrada as string, saida: day.saida as string, mins: Math.max(0, mins) };
            }
          } catch {}
        }
        // Fallback: seg-sex sempre; sab depende do critério
        if (dow === 6) {
          if (sabadoTipo === "folga") return { isWorkday: false, entrada: null, saida: null, mins: 0 };
        }
        return { isWorkday: true, entrada: null, saida: null, mins: 0 };
      }

      // ----- 8) Itera funcionários × dias
      type FaltaItem = { data: string; tipo: "injustificada" | "justificada" | "atraso" | "saida_antecipada"; descricao?: string; minutos?: number };
      type EmpRow = {
        employeeId: number;
        nomeCompleto: string;
        matricula: string | null;
        cargo: string | null;
        setor: string | null;
        status: string;
        injustificadas: number;
        justificadas: number;
        dsrPerdido: number;
        atrasos: number;
        saidasAntecipadas: number;
        minutosAtraso: number;
        minutosSaidaAntec: number;
        detalhes: FaltaItem[];
      };
      const result: EmpRow[] = [];
      const totais = { injustificadas: 0, justificadas: 0, dsrPerdido: 0, atrasos: 0, saidasAntecipadas: 0 };

      const startD = new Date(dataInicio + "T12:00:00Z");
      const endD = new Date(dataFim + "T12:00:00Z");

      for (const emp of empList) {
        if (obraEmpIds && !obraEmpIds.has(emp.id)) continue;

        const empAdmissao = emp.dataAdmissao || dataInicio;
        const empDeslig = emp.dataDesligamentoEfetiva || emp.dataDemissao || dataFim;

        const row: EmpRow = {
          employeeId: emp.id,
          nomeCompleto: emp.nomeCompleto,
          matricula: emp.matricula || null,
          cargo: emp.cargo || emp.funcao || null,
          setor: emp.setor || null,
          status: emp.status || "Ativo",
          injustificadas: 0,
          justificadas: 0,
          dsrPerdido: 0,
          atrasos: 0,
          saidasAntecipadas: 0,
          minutosAtraso: 0,
          minutosSaidaAntec: 0,
          detalhes: [],
        };

        // Para DSR: por semana ISO (segunda-domingo). Marca semanas com falta injustificada.
        const semanasComFaltaInj = new Set<string>();
        // Para evitar contar DSR de semana cujo domingo está fora do período → só conta se domingo ∈ período.

        for (let d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().slice(0, 10);
          if (ds < empAdmissao || ds > empDeslig) continue;

          if (feriadoSet.has(ds)) continue;
          if (feriasSet.has(`${emp.id}|${ds}`)) continue;

          const exp = getExpected(emp, ds);
          if (!exp.isWorkday) continue;

          const rec = recsByEmpDay.get(`${emp.id}|${ds}`);
          const hasBatida = !!(rec && (rec.entrada1 || rec.entrada2 || rec.saida1 || rec.saida2));

          if (!hasBatida) {
            const atestTipo = atestSet.get(`${emp.id}|${ds}`);
            if (atestTipo) {
              row.justificadas++;
              row.detalhes.push({ data: ds, tipo: "justificada", descricao: atestTipo });
            } else {
              row.injustificadas++;
              row.detalhes.push({ data: ds, tipo: "injustificada" });
              // Marca semana (segunda como referência)
              const dd = new Date(ds + "T12:00:00Z");
              const dow = dd.getUTCDay(); // 0=dom..6=sab
              const offsetParaSegunda = dow === 0 ? -6 : 1 - dow;
              const seg = new Date(dd);
              seg.setUTCDate(seg.getUTCDate() + offsetParaSegunda);
              semanasComFaltaInj.add(seg.toISOString().slice(0, 10));
            }
            continue;
          }

          // Tem batida → checa atraso e saída antecipada
          if (exp.entrada && rec?.entrada1) {
            const toMins = (t: string) => { const [h,m] = t.split(":").map(Number); return (h||0)*60 + (m||0); };
            const atrasoMin = toMins(rec.entrada1) - toMins(exp.entrada);
            if (atrasoMin > tolAtraso) {
              row.atrasos++;
              row.minutosAtraso += atrasoMin;
              row.detalhes.push({ data: ds, tipo: "atraso", minutos: atrasoMin, descricao: `Entrou às ${rec.entrada1} (esperado ${exp.entrada})` });
            }
          }
          if (exp.saida) {
            // Última batida do dia
            const ultima = rec?.saida2 || rec?.entrada2 || rec?.saida1 || null;
            if (ultima) {
              const toMins = (t: string) => { const [h,m] = t.split(":").map(Number); return (h||0)*60 + (m||0); };
              const antecMin = toMins(exp.saida) - toMins(ultima);
              if (antecMin > tolSaida) {
                row.saidasAntecipadas++;
                row.minutosSaidaAntec += antecMin;
                row.detalhes.push({ data: ds, tipo: "saida_antecipada", minutos: antecMin, descricao: `Saiu às ${ultima} (esperado ${exp.saida})` });
              }
            }
          }
        }

        // DSR perdido: número de semanas com pelo menos 1 falta injustificada
        // (cada semana com falta injustificada → 1 DSR perdido — Lei 605/49)
        row.dsrPerdido = semanasComFaltaInj.size;

        // Ordena detalhes por data
        row.detalhes.sort((a, b) => a.data.localeCompare(b.data));

        if (row.injustificadas + row.justificadas + row.atrasos + row.saidasAntecipadas > 0) {
          result.push(row);
          totais.injustificadas += row.injustificadas;
          totais.justificadas   += row.justificadas;
          totais.dsrPerdido     += row.dsrPerdido;
          totais.atrasos        += row.atrasos;
          totais.saidasAntecipadas += row.saidasAntecipadas;
        }
      }

      // Ordena por nome em ordem alfabética
      result.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));

      return { funcionarios: result, totais };
    }),

  // Retorna os dias trabalhados (com batida de ponto) de um colaborador num período
  getDiasEmployee: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      dataInicio: z.string(), // YYYY-MM-DD
      dataFim: z.string(),    // YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cids = resolveCompanyIds(input);
      const rows = await db.select({
        data: timeRecords.data,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
        obraId: timeRecords.obraId,
      })
        .from(timeRecords)
        .where(and(
          inArray(timeRecords.companyId, cids),
          eq(timeRecords.employeeId, input.employeeId),
          sql`${timeRecords.data} >= ${input.dataInicio}`,
          sql`${timeRecords.data} <= ${input.dataFim}`,
        ))
        .orderBy(timeRecords.data);

      // Agrupa por data (pode ter múltiplas obras no mesmo dia)
      const byDate: Record<string, { horasTrabalhadas: string | null; obraIds: number[] }> = {};
      for (const r of rows) {
        if (!byDate[r.data]) byDate[r.data] = { horasTrabalhadas: r.horasTrabalhadas, obraIds: [] };
        if (r.obraId) byDate[r.data].obraIds.push(r.obraId);
      }

      // Rev. 2030 — Cruza com vacation_periods (3 fracionamentos possíveis) pra
      // marcar dias em GOZO de férias. Esses dias NÃO devem ser "falta provável".
      const vacs = await db.select({
        dataInicio: vacationPeriods.dataInicio,
        dataFim:    vacationPeriods.dataFim,
        periodo2Inicio: vacationPeriods.periodo2Inicio,
        periodo2Fim:    vacationPeriods.periodo2Fim,
        periodo3Inicio: vacationPeriods.periodo3Inicio,
        periodo3Fim:    vacationPeriods.periodo3Fim,
      }).from(vacationPeriods).where(and(
        inArray(vacationPeriods.companyId, cids),
        eq(vacationPeriods.employeeId, input.employeeId),
      ));
      const feriasSet = new Set<string>();
      const addRange = (ini?: string | null, fim?: string | null) => {
        if (!ini || !fim) return;
        const sd = new Date(ini + "T12:00:00Z");
        const ed = new Date(fim + "T12:00:00Z");
        for (let d = new Date(sd); d <= ed; d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().slice(0, 10);
          if (ds < input.dataInicio || ds > input.dataFim) continue;
          feriasSet.add(ds);
        }
      };
      for (const v of vacs) {
        addRange(v.dataInicio, v.dataFim);
        addRange(v.periodo2Inicio, v.periodo2Fim);
        addRange(v.periodo3Inicio, v.periodo3Fim);
      }

      // Gera todos os dias do período
      const all: { data: string; dow: number; trabalhado: boolean; horasTrabalhadas: string | null; ferias: boolean }[] = [];
      const cur = new Date(input.dataInicio + "T12:00:00Z");
      const end = new Date(input.dataFim + "T12:00:00Z");
      while (cur <= end) {
        const ds = cur.toISOString().slice(0, 10);
        all.push({
          data: ds,
          dow: cur.getUTCDay(), // 0=Dom,1=Seg…6=Sáb
          trabalhado: !!byDate[ds],
          horasTrabalhadas: byDate[ds]?.horasTrabalhadas ?? null,
          ferias: feriasSet.has(ds),
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      return { dias: all, totalTrabalhados: Object.keys(byDate).length };
    }),

  // ===========================================================
  // Rev. 2019 — Memória de cálculo do "Atraso Acumulado" por dia
  // Devolve, pra UM colaborador no período, todos os dias em que houve atraso
  // (entrada após a esperada + tolerância CLT). Inclui: data, dow, entrada
  // esperada, entrada real, minutos de atraso, acumulado e tolerância aplicada.
  // ===========================================================
  getAtrasoDetalhe: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      dataInicio: z.string(), // YYYY-MM-DD
      dataFim: z.string(),    // YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cids = resolveCompanyIds(input);

      // 1) Funcionário (jornadaTrabalho pra derivar entrada esperada por dia)
      const empRows = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      const emp = empRows[0];
      if (!emp) {
        return { dias: [], totalMinutos: 0, tolerancia: 5, nome: "", entradaPadrao: null as string | null };
      }

      // 2) Registros de ponto do período
      // Rev. 2032 — agora também trazemos as 4 batidas e horasTrabalhadas pra
      // mostrar no modal: "Trabalhou X de Y esperadas → déficit Z".
      const recs = await db.select({
        data: timeRecords.data,
        obraId: timeRecords.obraId,
        entrada1: timeRecords.entrada1,
        saida1: timeRecords.saida1,
        entrada2: timeRecords.entrada2,
        saida2: timeRecords.saida2,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
        atrasos: timeRecords.atrasos,
      }).from(timeRecords).where(and(
        inArray(timeRecords.companyId, cids),
        eq(timeRecords.employeeId, input.employeeId),
        sql`${timeRecords.data} >= ${input.dataInicio}`,
        sql`${timeRecords.data} <= ${input.dataFim}`,
      )).orderBy(timeRecords.data);

      // 3) Tolerância (Art. 58 §1º CLT — padrão 5 min)
      const criteria = await getCriteriaMap(input.companyId);
      const tolAtraso = criteria.pontoToleranciaAtraso;

      // 3b) Jornada da OBRA prevalece sobre a do funcionário (contexto do modal).
      // Carrega jornada das obras + alocações do colaborador. Map vazio → legado.
      const obraJornadaMap = new Map<number, string>();
      const obrasJ = await db.select({ id: obras.id, j: obras.jornadaTrabalho })
        .from(obras).where(and(inArray(obras.companyId, cids), isNull(obras.deletedAt)));
      for (const o of obrasJ) if (obraTemJornada(o.j)) obraJornadaMap.set(o.id, o.j as string);
      const recObraByDay = new Map<string, number | null>();
      for (const r of recs) recObraByDay.set(String(r.data), r.obraId ?? null);
      let alocAtraso: AlocacaoObra[] = [];
      if (obraJornadaMap.size > 0) {
        const hist = await db.select({
          obraId: employeeSiteHistory.obraId,
          dataInicio: employeeSiteHistory.dataInicio,
          dataFim: employeeSiteHistory.dataFim,
        }).from(employeeSiteHistory).where(and(
          inArray(employeeSiteHistory.companyId, cids),
          eq(employeeSiteHistory.employeeId, input.employeeId),
        ));
        alocAtraso = hist.map(h => ({ obraId: h.obraId ?? null, dataInicio: h.dataInicio ?? null, dataFim: h.dataFim ?? null }));
      }
      // Jornada efetiva (string JSON) p/ um dia: obra-do-dia > funcionário.
      function jornadaEfetivaDiaAtraso(ds: string): string | null {
        if (obraJornadaMap.size === 0) return emp.jornadaTrabalho ?? null;
        let oid = recObraByDay.get(ds) ?? null;
        if (oid == null) oid = obraNaDataFromAlocacoes(alocAtraso, ds);
        const obraJ = oid != null ? (obraJornadaMap.get(oid) ?? null) : null;
        return jornadaEfetiva(emp.jornadaTrabalho, obraJ);
      }

      // 4) Helper inline: entrada esperada por dia (jornada efetiva — obra > func)
      let jornadaParsed: any = null;
      if (emp.jornadaTrabalho) {
        try { jornadaParsed = typeof emp.jornadaTrabalho === "string" ? JSON.parse(emp.jornadaTrabalho) : emp.jornadaTrabalho; } catch {}
      }
      const keysDow = ["dom","seg","ter","qua","qui","sex","sab"];
      function getEntradaEsperada(ds: string): string | null {
        const dow = new Date(ds + "T12:00:00Z").getUTCDay();
        const jStr = jornadaEfetivaDiaAtraso(ds);
        let jParsed: any = null;
        if (jStr) { try { jParsed = typeof jStr === "string" ? JSON.parse(jStr) : jStr; } catch {} }
        if (jParsed && typeof jParsed === "object" && !Array.isArray(jParsed)) {
          const day = jParsed[keysDow[dow]];
          if (day && day.entrada) return String(day.entrada);
        }
        return null;
      }
      // Entrada padrão pra exibir no cabeçalho (pega seg como referência se houver)
      const entradaPadrao = jornadaParsed && jornadaParsed.seg && jornadaParsed.seg.entrada ? String(jornadaParsed.seg.entrada) : null;

      const toMins = (t: string | null | undefined) => {
        if (!t) return 0;
        const [h, m] = String(t).split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      };

      // 5) Itera registros e monta linhas de atraso.
      //
      // Rev. 2027 — CORREÇÃO DE BUG (divergência tabela vs detalhe):
      // a fonte de verdade do atraso é o campo `timeRecords.atrasos`
      // gravado pelo motor de cálculo (mesmo campo que `getSummary` soma
      // pra montar a coluna "Atraso Acumulado" da tabela). Antes, este
      // procedure RECALCULAVA do zero (entrada1 vs jornada cadastrada
      // com tolerância) — o que divergia da tabela sempre que houvesse
      // (a) jornada alterada depois, (b) abono/justificativa, (c) ajuste
      // manual no registro, (d) regra de cálculo do motor diferente do
      // simples "real - esperada > 5min". A garantia agora é:
      //   SOMA(dias[].minutos) === tabela "Atraso Acumulado"
      // sempre. Entrada esperada/real continuam exibidas como CONTEXTO
      // pra ajudar a auditoria; observação aparece quando o motor
      // gravou diferente do que a entrada esperada/real sugeririam.
      // Rev. 2032 — DiaAtraso enriquecido: além de entrada esperada/real e
      // atraso (vindo do motor), agora carrega as 4 batidas, total trabalhado
      // e jornada esperada do dia. Assim o modal mostra a equação completa:
      //   "Trabalhou Xh de Yh esperadas → déficit Zh = atraso"
      type DiaAtraso = {
        data: string;
        dow: number;
        entradaEsperada: string | null;
        entradaReal: string | null;
        // batidas completas do dia (podem ser null se não bateu)
        entrada1: string | null;
        saida1: string | null;
        entrada2: string | null;
        saida2: string | null;
        // total trabalhado no dia (string HH:MM, vem do timeRecords)
        horasTrabalhadas: string | null;
        // jornada esperada em minutos (líquida — descontando intervalo de almoço)
        jornadaEsperadaMin: number | null;
        // total trabalhado em minutos (parseado de horasTrabalhadas)
        horasTrabalhadasMin: number | null;
        minutos: number;     // atraso em minutos — vem de timeRecords.atrasos (motor)
        acumulado: number;   // soma corrida desde o início do período
        observacao: string | null;
      };
      const dias: DiaAtraso[] = [];
      let acumulado = 0;

      for (const r of recs) {
        const ds = String(r.data);
        const dow = new Date(ds + "T12:00:00Z").getUTCDay();
        const esperada = getEntradaEsperada(ds);
        const real = r.entrada1 || null;
        // Jornada efetiva do dia (obra > funcionário) — string p/ getExpectedMinsFromJornada.
        const jornadaStr = jornadaEfetivaDiaAtraso(ds);

        // Fonte primária: o campo já gravado pelo motor (mesmo que a tabela).
        let minutos = 0;
        if (r.atrasos && r.atrasos !== "0:00") {
          const [h, m] = String(r.atrasos).split(":").map(Number);
          minutos = (h || 0) * 60 + (m || 0);
        }

        if (minutos <= 0) continue;

        // Rev. 2032 — total trabalhado em minutos e jornada esperada líquida.
        const horasTrabMin = r.horasTrabalhadas ? toMins(r.horasTrabalhadas) : null;
        const jornadaEsperadaMin = getExpectedMinsFromJornada(jornadaStr, ds);

        // Observação só quando o motor gravou algo mas o esperada/real
        // sugerem outro valor (ajuda a auditoria sem mudar o número).
        let observacao: string | null = null;
        if (esperada && real) {
          const diffSugerido = toMins(real) - toMins(esperada);
          const diffEsperadoComTol = diffSugerido > tolAtraso ? diffSugerido : 0;
          const delta = Math.abs(diffEsperadoComTol - minutos);
          if (delta >= 2) {
            // 2 min de margem pra arredondamento.
            if (diffEsperadoComTol > minutos) {
              observacao = "Motor registrou menos atraso que real-esperada sugere — provável abono/justificativa parcial.";
            } else if (diffEsperadoComTol === 0 && minutos > 0) {
              observacao = "Real está dentro da tolerância CLT vs jornada cadastrada — atraso pode ter vindo de jornada alterada depois ou ajuste manual.";
            } else {
              observacao = "Motor registrou mais atraso que real-esperada sugere — provável jornada cadastrada diferente do dia ou ajuste manual.";
            }
          }
        } else if (!esperada) {
          observacao = "Jornada do dia não configurada no cadastro — atraso vindo do registro consolidado.";
        } else if (!real) {
          observacao = "Sem entrada1 registrada — atraso vindo do registro consolidado (provável falta parcial).";
        }

        acumulado += minutos;
        dias.push({
          data: ds,
          dow,
          entradaEsperada: esperada,
          entradaReal: real,
          // Rev. 2032 — payload enriquecido pro modal "sem mistério":
          entrada1: r.entrada1 || null,
          saida1: r.saida1 || null,
          entrada2: r.entrada2 || null,
          saida2: r.saida2 || null,
          horasTrabalhadas: r.horasTrabalhadas || null,
          jornadaEsperadaMin,
          horasTrabalhadasMin: horasTrabMin,
          minutos,
          acumulado,
          observacao,
        });
      }

      return {
        nome: emp.nomeCompleto,
        tolerancia: tolAtraso,
        entradaPadrao,
        totalMinutos: acumulado,
        dias,
      };
    }),

  // ===========================================================
  // Rev. 2051 — Memória de cálculo de Horas Extras (dia a dia)
  // Devolve TODOS os dias do período em que o motor gravou HE > 0
  // pra um colaborador, com batidas, total trabalhado, jornada
  // esperada e o excedente (= HE). Permite ao RH conferir "de
  // onde vieram as Xh de HE acumuladas no mês".
  // ===========================================================
  getHeDetalhe: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cids = resolveCompanyIds(input);
      const empRows = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(and(
        eq(employees.id, input.employeeId),
        inArray(employees.companyId, cids),
      )).limit(1);
      const emp = empRows[0];
      if (!emp) return { nome: "", dias: [], totalMinutos: 0, entradaPadrao: null as string | null };

      const recs = await db.select({
        data: timeRecords.data,
        entrada1: timeRecords.entrada1,
        saida1: timeRecords.saida1,
        entrada2: timeRecords.entrada2,
        saida2: timeRecords.saida2,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
        horasExtras: timeRecords.horasExtras,
        atrasos: timeRecords.atrasos,
        obraId: timeRecords.obraId,
      }).from(timeRecords).where(and(
        inArray(timeRecords.companyId, cids),
        eq(timeRecords.employeeId, input.employeeId),
        sql`${timeRecords.data} >= ${input.dataInicio}`,
        sql`${timeRecords.data} <= ${input.dataFim}`,
      )).orderBy(timeRecords.data);

      const jornadaStr = typeof emp.jornadaTrabalho === "string"
        ? emp.jornadaTrabalho
        : (emp.jornadaTrabalho ? JSON.stringify(emp.jornadaTrabalho) : null);
      let jornadaParsed: any = null;
      if (jornadaStr) { try { jornadaParsed = JSON.parse(jornadaStr); } catch {} }
      const entradaPadrao = jornadaParsed && jornadaParsed.seg && jornadaParsed.seg.entrada ? String(jornadaParsed.seg.entrada) : null;

      const toMins = (t: string | null | undefined) => {
        if (!t) return 0;
        const [h, m] = String(t).split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      };

      type DiaHE = {
        data: string;
        dow: number;
        entrada1: string | null;
        saida1: string | null;
        entrada2: string | null;
        saida2: string | null;
        horasTrabalhadas: string | null;
        horasTrabalhadasMin: number | null;
        jornadaEsperadaMin: number | null;
        heMin: number;
        acumulado: number;
        observacao: string | null;
      };
      const dias: DiaHE[] = [];
      let acumulado = 0;
      for (const r of recs) {
        const ds = String(r.data);
        let heMin = 0;
        if (r.horasExtras && r.horasExtras !== "0:00") {
          const [h, m] = String(r.horasExtras).split(":").map(Number);
          heMin = (h || 0) * 60 + (m || 0);
        }
        if (heMin <= 0) continue;
        const dow = new Date(ds + "T12:00:00Z").getUTCDay();
        const horasTrabMin = r.horasTrabalhadas ? toMins(r.horasTrabalhadas) : null;
        const jornadaEsperadaMin = getExpectedMinsFromJornada(jornadaStr, ds);
        let observacao: string | null = null;
        if (dow === 0) observacao = "Domingo trabalhado — adicional 100% (CLT Art. 67).";
        else if (dow === 6 && (jornadaEsperadaMin === 0 || jornadaEsperadaMin === null)) observacao = "Sábado fora da jornada — toda a hora trabalhada é HE.";
        else if (horasTrabMin !== null && jornadaEsperadaMin !== null && jornadaEsperadaMin > 0) {
          const excedenteSugerido = Math.max(0, horasTrabMin - jornadaEsperadaMin);
          if (Math.abs(excedenteSugerido - heMin) >= 2) {
            if (excedenteSugerido > heMin) observacao = "Motor registrou HE menor que (trabalhado − esperado) — provável abono parcial ou ajuste manual.";
            else observacao = "Motor registrou HE maior que (trabalhado − esperado) — provável adicional noturno, DSR ou compensação de banco.";
          }
        }
        acumulado += heMin;
        dias.push({
          data: ds, dow,
          entrada1: r.entrada1 || null, saida1: r.saida1 || null,
          entrada2: r.entrada2 || null, saida2: r.saida2 || null,
          horasTrabalhadas: r.horasTrabalhadas || null,
          horasTrabalhadasMin: horasTrabMin,
          jornadaEsperadaMin,
          heMin, acumulado, observacao,
        });
      }
      return { nome: emp.nomeCompleto, entradaPadrao, totalMinutos: acumulado, dias };
    }),

  // ===========================================================
  // Rev. 2051 — Memória de cálculo de Faltas / Dias Trabalhados
  // Devolve TODOS os dias do período, classificando cada um:
  //   trabalhado / falta_nao_justificada / atestado / ferias /
  //   feriado / fim_de_semana / futuro / dispensa_rescisao.
  // Permite ao RH ver exatamente quais dias contam como "falta"
  // e quais foram cobertos por atestado/férias/dispensa.
  // ===========================================================
  getFaltaDetalhe: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      employeeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cids = resolveCompanyIds(input);
      const empRows = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
      }).from(employees).where(and(
        eq(employees.id, input.employeeId),
        inArray(employees.companyId, cids),
      )).limit(1);
      const emp = empRows[0];
      if (!emp) return { nome: "", dias: [], totais: { trabalhados: 0, faltas_nao_justificadas: 0, atestados: 0, ferias: 0, feriados: 0, fds: 0, futuros: 0, dispensa: 0 } };

      const recs = await db.select({
        data: timeRecords.data,
        horasTrabalhadas: timeRecords.horasTrabalhadas,
      }).from(timeRecords).where(and(
        inArray(timeRecords.companyId, cids),
        eq(timeRecords.employeeId, input.employeeId),
        sql`${timeRecords.data} >= ${input.dataInicio}`,
        sql`${timeRecords.data} <= ${input.dataFim}`,
      ));
      const byDate: Record<string, string | null> = {};
      for (const r of recs) byDate[String(r.data)] = r.horasTrabalhadas || null;

      const ats = await db.select({
        id: atestados.id,
        tipo: atestados.tipo,
        dataEmissao: atestados.dataEmissao,
        diasAfastamento: atestados.diasAfastamento,
        dataRetorno: atestados.dataRetorno,
        cid: atestados.cid,
        motivo: atestados.motivo,
      }).from(atestados).where(and(
        inArray(atestados.companyId, cids),
        eq(atestados.employeeId, input.employeeId),
        sql`${atestados.deletedAt} IS NULL`,
      ));
      type AtInfo = { tipo: string; cid: string | null; motivo: string | null; dataEmissao: string; dataRetorno: string | null };
      const atestadoByDate: Record<string, AtInfo> = {};
      for (const a of ats) {
        if (!a.dataEmissao) continue;
        const ini = a.dataEmissao;
        const ndias = Math.max(1, Number(a.diasAfastamento) || 1);
        const start = new Date(ini + "T12:00:00Z");
        for (let i = 0; i < ndias; i++) {
          const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
          const ds = d.toISOString().slice(0, 10);
          if (ds < input.dataInicio || ds > input.dataFim) continue;
          if (!atestadoByDate[ds]) {
            atestadoByDate[ds] = { tipo: a.tipo || "Atestado", cid: a.cid, motivo: a.motivo, dataEmissao: a.dataEmissao, dataRetorno: a.dataRetorno };
          }
        }
      }

      const vacs = await db.select({
        dataInicio: vacationPeriods.dataInicio, dataFim: vacationPeriods.dataFim,
        periodo2Inicio: vacationPeriods.periodo2Inicio, periodo2Fim: vacationPeriods.periodo2Fim,
        periodo3Inicio: vacationPeriods.periodo3Inicio, periodo3Fim: vacationPeriods.periodo3Fim,
      }).from(vacationPeriods).where(and(
        inArray(vacationPeriods.companyId, cids),
        eq(vacationPeriods.employeeId, input.employeeId),
      ));
      const feriasSet = new Set<string>();
      const addRangeTo = (ini: any, fim: any, set: Set<string>) => {
        if (!ini || !fim) return;
        const sd = new Date(String(ini) + "T12:00:00Z"); const ed = new Date(String(fim) + "T12:00:00Z");
        for (let d = new Date(sd); d <= ed; d.setUTCDate(d.getUTCDate() + 1)) {
          const ds = d.toISOString().slice(0, 10);
          if (ds < input.dataInicio || ds > input.dataFim) continue;
          set.add(ds);
        }
      };
      for (const v of vacs) {
        addRangeTo(v.dataInicio, v.dataFim, feriasSet);
        addRangeTo(v.periodo2Inicio, v.periodo2Fim, feriasSet);
        addRangeTo(v.periodo3Inicio, v.periodo3Fim, feriasSet);
      }

      const dispRows = await db.select({
        dataInicio: terminationNotices.dataInicio,
        dataFim: terminationNotices.dataFim,
      }).from(terminationNotices).where(and(
        inArray(terminationNotices.companyId, cids),
        eq(terminationNotices.employeeId, input.employeeId),
        eq(terminationNotices.status, 'em_andamento'),
        sql`${terminationNotices.deletedAt} IS NULL`,
      ));
      const dispensaSet = new Set<string>();
      for (const d of dispRows) addRangeTo(d.dataInicio, d.dataFim, dispensaSet);

      const ferRows = await db.select({ data: feriados.data, nome: feriados.nome, recorrente: feriados.recorrente })
        .from(feriados).where(and(
          eq(feriados.ativo, 1),
          or(isNull(feriados.companyId), inArray(feriados.companyId, cids)) as any,
        ));
      const feriadoMap = new Map<string, string>();
      const yIni = Number(input.dataInicio.slice(0, 4));
      const yFim = Number(input.dataFim.slice(0, 4));
      for (const f of ferRows) {
        if (!f.data) continue;
        if (f.recorrente === 1) {
          for (let y = yIni; y <= yFim; y++) {
            const ds = `${y}-${String(f.data).slice(5)}`;
            if (ds >= input.dataInicio && ds <= input.dataFim) feriadoMap.set(ds, String(f.nome || "Feriado"));
          }
        } else {
          const ds = String(f.data);
          if (ds >= input.dataInicio && ds <= input.dataFim) feriadoMap.set(ds, String(f.nome || "Feriado"));
        }
      }

      type Status = "trabalhado" | "falta_nao_justificada" | "atestado" | "ferias" | "feriado" | "fds" | "futuro" | "dispensa";
      type Dia = {
        data: string; dow: number; status: Status;
        horasTrabalhadas: string | null;
        atestadoInfo: AtInfo | null;
        feriadoNome: string | null;
      };
      const dias: Dia[] = [];
      const hoje = new Date().toISOString().slice(0, 10);
      const cur = new Date(input.dataInicio + "T12:00:00Z");
      const end = new Date(input.dataFim + "T12:00:00Z");
      while (cur <= end) {
        const ds = cur.toISOString().slice(0, 10);
        const dow = cur.getUTCDay();
        const isWeekend = dow === 0 || dow === 6;
        const isFeriado = feriadoMap.has(ds);
        const trab = ds in byDate;
        let status: Status;
        if (ds > hoje) status = "futuro";
        else if (trab) status = "trabalhado";
        else if (atestadoByDate[ds]) status = "atestado";
        else if (feriasSet.has(ds)) status = "ferias";
        else if (isFeriado) status = "feriado";
        else if (isWeekend) status = "fds";
        else if (dispensaSet.has(ds)) status = "dispensa";
        else status = "falta_nao_justificada";
        dias.push({
          data: ds, dow, status,
          horasTrabalhadas: byDate[ds] || null,
          atestadoInfo: atestadoByDate[ds] || null,
          feriadoNome: feriadoMap.get(ds) || null,
        });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      const totais = {
        trabalhados: dias.filter(d => d.status === "trabalhado").length,
        faltas_nao_justificadas: dias.filter(d => d.status === "falta_nao_justificada").length,
        atestados: dias.filter(d => d.status === "atestado").length,
        ferias: dias.filter(d => d.status === "ferias").length,
        feriados: dias.filter(d => d.status === "feriado").length,
        fds: dias.filter(d => d.status === "fds").length,
        futuros: dias.filter(d => d.status === "futuro").length,
        dispensa: dias.filter(d => d.status === "dispensa").length,
      };

      return { nome: emp.nomeCompleto, dias, totais };
    }),
});
