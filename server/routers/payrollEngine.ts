import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getCompaniesForUser } from "../db";
import { employees, timeRecords, systemCriteria, obras, heSolicitacoes, vrBenefits, advances, vacationPeriods, companyBankAccounts, dissidios, dissidioFuncionarios } from "../../drizzle/schema";
import { eq, and, sql, between, inArray, isNull } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { EMPLOYEE_STATUS_DESLIGADOS } from "../../shared/modules";
import { TRPCError } from "@trpc/server";
import { parseBRL } from "../utils/parseBRL";
import { gerarCnab240 } from "./cnab240";
import { calcularEncargosDiferenca } from "./sindical";

// ============================================================
// HELPERS
// ============================================================
function formatMoney(val: number): string {
  return val.toFixed(2);
}

// ============================================================
// Rev. 3293 — ARREDONDAMENTO P/ MÚLTIPLOS DE R$ 1 com CARRY-FORWARD auditável.
// Cada evento de pagamento de um funcionário (vale OU folha mensal) paga o real
// inteiro mais próximo do líquido EXATO; o residual em centavos vira SALDO que
// carrega p/ o PRÓXIMO evento do mesmo funcionário (vale→folha→vale...).
// Prova: residual_n = exato_n + B_{n-1} − pago_n = B_n (saldo corrente após o
// evento n). Logo o carry do evento n = B_{n-1} = residual do ÚLTIMO evento
// anterior (maior `ordem` < ordemAtual), NÃO a soma de todos → estável em regeneração.
// ============================================================
function ordemArredondamento(mesReferencia: string, origem: "vale" | "folha"): number {
  const [y, m] = (mesReferencia || "").split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return 0;
  return ((y * 12) + (m - 1)) * 2 + (origem === "folha" ? 1 : 0);
}
type SaldoArredItem = { ordem: number; residual: number };
type SaldoArredMap = Map<string, SaldoArredItem[]>;
async function carregarSaldosArredondamento(db: any, companyIds: number[]): Promise<SaldoArredMap> {
  const map: SaldoArredMap = new Map();
  if (!companyIds || companyIds.length === 0) return map;
  try {
    const rows = ((await db.execute(sql`
      SELECT "companyId", "employeeId", "ordem", "residualGerado"
      FROM payroll_rounding_ledger
      WHERE "companyId" IN (${sql.join(companyIds.map((id) => sql`${id}`), sql`,`)})
    `)) as any).rows || [];
    for (const r of rows) {
      const key = `${r.companyId}:${r.employeeId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ ordem: Number(r.ordem) || 0, residual: parseFloat(r.residualGerado) || 0 });
    }
  } catch (e: any) {
    console.error("[arredondamento] falha ao carregar saldos (assumindo 0):", e?.message || e);
  }
  return map;
}
function saldoAnteriorArred(saldos: SaldoArredMap, companyId: number, employeeId: number, ordemAtual: number): number {
  const arr = saldos.get(`${companyId}:${employeeId}`) || [];
  let melhorOrdem = -Infinity;
  let saldo = 0;
  for (const e of arr) {
    if (e.ordem < ordemAtual && e.ordem > melhorOrdem) { melhorOrdem = e.ordem; saldo = e.residual; }
  }
  return Math.round(saldo * 100) / 100;
}
type ArredResultado = { valorExato: number; saldoAnterior: number; valorPago: number; ajuste: number; residual: number };
function aplicarArredondamentoReal(valorExato: number, saldoAnterior: number): ArredResultado {
  const base = valorExato + saldoAnterior;
  const valorPago = Math.max(0, Math.round(base));
  const residual = Math.round((base - valorPago) * 100) / 100;
  const ajuste = Math.round((valorPago - valorExato) * 100) / 100;
  return { valorExato, saldoAnterior, valorPago, ajuste, residual };
}
function parseTime(str: string | null | undefined): number | null {
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0]), m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}
function minutesToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${mins < 0 ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

// Calculates the expected NET work minutes for a given day based on the employee's
// Extract expected entry time in minutes from jornadaTrabalho JSON for a given date.
// Returns 7*60 (07:00) as fallback if jornada is absent or doesn't have entry for that day.
function getExpectedEntrada(jornadaTrabalho: string | null | undefined, dateStr: string): number {
  if (!jornadaTrabalho) return 7 * 60;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return 7 * 60;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const day = parsed[dayKey];
    if (!day?.entrada) return 7 * 60;
    const [h, m] = day.entrada.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  } catch { return 7 * 60; }
}

// jornadaTrabalho JSON. Returns cargaHorariaDiaria*60 as fallback if jornada is absent.
// horasTrabalhadas = sum of punch intervals (gaps like lunch are excluded), so
// expectedMins must also exclude the lunch break (intervalo).
function getExpectedMins(jornadaTrabalho: string | null | undefined, dateStr: string, cargaHorariaDiaria: number): number {
  if (!jornadaTrabalho) return cargaHorariaDiaria * 60;
  try {
    const parsed = JSON.parse(jornadaTrabalho);
    if (typeof parsed !== "object" || Array.isArray(parsed)) return cargaHorariaDiaria * 60;
    const keys = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
    const dayKey = keys[new Date(dateStr + "T12:00:00Z").getUTCDay()];
    const day = parsed[dayKey];
    if (!day?.entrada || !day?.saida) return 0; // non-working day per jornada
    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    let expectedMins = toMins(day.saida) - toMins(day.entrada);
    if (day.intervalo) {
      const [ih, im] = day.intervalo.split(":").map(Number);
      expectedMins -= (ih || 0) * 60 + (im || 0); // subtract lunch break
    }
    return Math.max(0, expectedMins);
  } catch { return cargaHorariaDiaria * 60; }
}

// Get business days in a month (Mon-Sat, excluding Sundays)
function getDiasUteisNoMes(year: number, month: number): number {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0) count++; // Exclude Sundays only (construction workers work Saturdays)
  }
  return count;
}

// Get the Nth business day of a month
function getNthBusinessDay(year: number, month: number, n: number): string {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) { // Mon-Fri for payment
      count++;
      if (count === n) {
        return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
}

// Get all dates in a range
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().substring(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

// Parse month reference to year and month
function calcularINSS(salarioMensal: number): number {
  const faixas = [
    { teto: 1621.00, aliquota: 0.075 },
    { teto: 2902.84, aliquota: 0.09 },
    { teto: 4354.00, aliquota: 0.12 },
    { teto: 8475.55, aliquota: 0.14 },
  ];
  let inss = 0;
  let anterior = 0;
  for (const f of faixas) {
    if (salarioMensal <= anterior) break;
    const base = Math.min(salarioMensal, f.teto) - anterior;
    inss += base * f.aliquota;
    anterior = f.teto;
  }
  return inss;
}

const VALOR_DEPENDENTE_IR = 228.80;

function calcularIRRF(baseIR: number, salarioBrutoMensal: number, semReducao = false): number {
  const faixas = [
    { limite: 2428.80, aliquota: 0, deducao: 0 },
    { limite: 2826.65, aliquota: 0.075, deducao: 182.16 },
    { limite: 3751.05, aliquota: 0.15, deducao: 394.16 },
    { limite: 4664.68, aliquota: 0.225, deducao: 675.49 },
    { limite: Infinity, aliquota: 0.275, deducao: 908.73 },
  ];
  let irrfBruto = 0;
  for (const f of faixas) {
    if (baseIR <= f.limite) {
      irrfBruto = Math.max(0, baseIR * f.aliquota - f.deducao);
      break;
    }
  }
  if (irrfBruto <= 0) return 0;
  if (semReducao) return irrfBruto;
  let redutor = 0;
  if (salarioBrutoMensal <= 5000) {
    redutor = irrfBruto;
  } else if (salarioBrutoMensal <= 7350) {
    redutor = Math.max(0, 978.62 - (0.133145 * salarioBrutoMensal));
  }
  return Math.max(0, irrfBruto - redutor);
}

function parseMesRef(mesRef: string): { year: number; month: number } {
  const [y, m] = mesRef.split("-").map(Number);
  return { year: y, month: m };
}

// Get previous month reference
function getPrevMesRef(mesRef: string): string {
  const { year, month } = parseMesRef(mesRef);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

// Get next month reference
function getNextMesRef(mesRef: string): string {
  const { year, month } = parseMesRef(mesRef);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

// CLT — base legal de cálculo do dia para descontos de falta:
// "Mês comercial" de 30 dias, independentemente do mês ter 28/29/30/31 dias
// e independentemente da jornada diária (8h, 6h, 12x36, etc).
// Súmula 431 TST + Lei 605/49 + CLT Art. 64.
// Valor-dia = salarioBase / 30
// Fallback (se salarioBase vazio): valorHora × 220 / 30 = valorHora × 7,3333
export function valorDiaLegal(salarioBaseStr: string | null | undefined, valorHora: number): number {
  const salBase = parseBRLLocal(salarioBaseStr);
  if (salBase > 0) return salBase / 30;
  return valorHora * (220 / 30);
}
function parseBRLLocal(v: string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  // Formato BR ("2.774,20"): remove pontos de milhar, troca vírgula por ponto
  if (s.includes(',')) {
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  // Formato decimal americano ("6200.00") ou inteiro: parseFloat direto
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Garante que payroll_periods tem row pra cada (companyId, mesReferencia) da lista.
 * Sem isso, mutations como gerarVale/realizarAfericao/simularPagamento rodam UPDATE
 * em 0 linhas silenciosamente (frontend mostra os números mas DB não persiste — bug
 * histórico onde Vale aparecia 100% sem totais e Aferir Escuro reabria em 0%).
 * Idempotente: se já existe, pula. Usa criteria da empresa pra calcular pontoInicio/Fim.
 */
async function ensurePeriodExists(
  db: any,
  companyIds: number[],
  mesReferencia: string,
) {
  for (const cid of companyIds) {
    const existing = ((await db.execute(sql`
      SELECT id FROM payroll_periods
      WHERE "companyId" = ${cid} AND "mesReferencia" = ${mesReferencia}
      LIMIT 1
    `)) as any).rows || [];
    if (existing[0]) continue;

    const criteria = await getPayrollCriteria(db, cid);
    const { year, month } = parseMesRef(mesReferencia);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const diaCorte = criteria.diaCorte;
    const pontoInicioDate = new Date(Date.UTC(prevYear, prevMonth - 1, diaCorte));
    pontoInicioDate.setUTCDate(pontoInicioDate.getUTCDate() + 1);
    const pontoInicio = pontoInicioDate.toISOString().slice(0, 10);
    const pontoFim = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
    const lastDay = new Date(year, month, 0).getDate();
    const escuroInicio = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
    const escuroFim = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const empCount = ((await db.execute(sql`
      SELECT COUNT(*) as total FROM employees
      WHERE "companyId" = ${cid}
      AND "tipoContrato" = 'CLT'
      AND status IN ('Ativo', 'Ferias')
      AND "deletedAt" IS NULL
    `)) as any).rows || [];
    const totalFunc = empCount[0]?.total || 0;

    await db.execute(sql`
      INSERT INTO payroll_periods ("companyId", "mesReferencia", "pontoInicio", "pontoFim", "escuroInicio", "escuroFim", status, "totalFuncionarios")
      VALUES (${cid}, ${mesReferencia}, ${pontoInicio}, ${pontoFim}, ${escuroInicio}, ${escuroFim}, 'aberta', ${totalFunc})
    `);
  }
}

// Get payroll criteria from systemCriteria table
// Maps the actual DB keys (system_criteria.chave) to the engine's internal names
async function getPayrollCriteria(db: any, companyId: number) {
  const rows = await db.select().from(systemCriteria).where(eq(systemCriteria.companyId, companyId));
  const map: Record<string, string> = {};
  for (const r of rows) map[r.chave] = r.valor;
  return {
    // Ponto
    diaCorte: parseInt(map["ponto_dia_corte"] || "15"),
    pontoToleranciaAtraso: parseInt(map["ponto_tolerancia_atraso"] || "5"),
    pontoToleranciaSaida: parseInt(map["ponto_tolerancia_saida"] || "5"),
    pontoToleranciaLegal: 10, // CLT Art. 58 §1º + Súmula 366 TST — 10 min/dia total
    pontoBatidaImparTolerancia: parseInt(map["ponto_batida_impar_tolerancia"] || "30"),
    pontoFaltaAposAtraso: parseInt(map["ponto_falta_apos_atraso"] || "120"),
    pontoHoraNoturnaReduzida: map["ponto_hora_noturna_reduzida"] || "52:30",
    // Folha
    percentualAdiantamento: parseInt(map["folha_percentual_adiantamento"] || "40"),
    diaAdiantamento: parseInt(map["folha_dia_vale"] || "20"),
    diaPagamento: parseInt(map["folha_dia_pagamento"] || "5"),
    descontoVrFalta: map["folha_desconto_vr_faltas"] !== "0",
    descontoVtFalta: map["folha_desconto_vt_faltas"] !== "0",
    bloquearConsolidacaoInconsistencias: map["folha_bloquear_consolidacao_inconsistencias"] === "1",
    // Jornada
    cargaHorariaDiaria: parseInt(map["jornada_horas_diarias"] || "8"),
    jornadaHorasSemanais: parseInt(map["jornada_horas_semanais"] || "44"),
    jornadaIntervaloAlmoco: parseInt(map["jornada_intervalo_almoco"] || "60"),
    jornadaSabadoTipo: map["jornada_sabado_tipo"] || "compensado",
    jornadaDescansoSemanal: parseInt(map["jornada_descanso_semanal"] || "1"),
    // Horas Extras
    hePercentualDiurna: parseFloat(map["he_dias_uteis"] || "60"),
    hePercentualNoturna: parseFloat(map["he_adicional_noturno"] || "20"),
    hePercentualDomingo: parseFloat(map["he_domingos_feriados"] || "100"),
    heInterjornada: parseFloat(map["he_interjornada"] || "50"),
    heLimiteMensal: parseInt(map["he_limite_mensal"] || "44"),
    heBancoHoras: map["he_banco_horas"] === "1",
    heNoturnoInicio: map["he_noturno_inicio"] || "22:00",
    heNoturnoFim: map["he_noturno_fim"] || "05:00",
    // Benefícios
    vtPercentualDesconto: parseFloat(map["ben_vt_percentual_desconto"] || "6"),
    diasUteisPadraoMes: parseInt(map["ben_dias_uteis_mes"] || "22"),
    vrValorDiario: parseFloat(map["ben_vr_valor_diario"] || "0"),
    // Advertências
    advValidadeMeses: parseInt(map["adv_validade_meses"] || "6"),
    advQtdParaSuspensao: parseInt(map["adv_qtd_para_suspensao"] || "3"),
    advDiasSuspensao: parseInt(map["adv_dias_suspensao"] || "3"),
    // Controle
    maxFaltasVale: parseInt(map["adiantamento_max_faltas"] || "5"),
    fecharNoEscuro: map["fechar_no_escuro"] !== "nao",
    // Conferência com Contabilidade: obrigatoria | recomendada | opcional
    conferenciaContabilidade: (map["folha_conferencia_contabilidade"] || "recomendada") as "obrigatoria" | "recomendada" | "opcional",
  };
}

// ============================================================
// Computes HE maps directly from time_records — no processarPonto needed.
// Returns heUtilMap (dias úteis), heFimMap (sáb/compensado/feriado), heMap (total).
// ============================================================
async function computeHEFromTimeRecords(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  companyId: number,
  mesReferencia: string,
  cargaHorariaDiaria: number
): Promise<{ heUtilMap: Map<number, number>; heFimMap: Map<number, number>; heMap: Map<number, number> }> {
  // time_records does NOT have tipoDia — derive day type from date's weekday
  const trRaws = ((await db.execute(sql`
    SELECT tr."employeeId", tr.data, tr."horasTrabalhadas", e."jornadaTrabalho"
    FROM time_records tr
    JOIN employees e ON e.id = tr."employeeId"
    WHERE tr."companyId" = ${companyId}
      AND tr."mesReferencia" = ${mesReferencia}
      AND tr."horasTrabalhadas" IS NOT NULL
      AND tr."horasTrabalhadas" != ''
      AND tr."horasTrabalhadas" != '0:00'
  `)) as any).rows || [];

  const heUtilMap = new Map<number, number>();
  const heFimMap = new Map<number, number>();
  const heMap = new Map<number, number>();

  for (const r of trRaws) {
    const empId = Number(r.employeeId);
    const trabMins = parseTime(String(r.horasTrabalhadas)) || 0;
    if (trabMins <= 0) continue;
    const dateStr = r.data instanceof Date ? r.data.toISOString().slice(0, 10) : String(r.data).slice(0, 10);
    // dow: 0=Sun, 1=Mon … 5=Fri, 6=Sat
    const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
    // Sundays: not expected to work — skip
    if (dow === 0) continue;
    const expectedMins = getExpectedMins(r.jornadaTrabalho, dateStr, cargaHorariaDiaria);
    const heMins = Math.max(0, trabMins - expectedMins);
    if (heMins <= 0) continue;
    // Saturdays use the "fim de semana" (100%) rate; weekdays use the "util" (50%) rate
    if (dow === 6) {
      heFimMap.set(empId, (heFimMap.get(empId) || 0) + heMins);
    } else {
      heUtilMap.set(empId, (heUtilMap.get(empId) || 0) + heMins);
    }
    heMap.set(empId, (heMap.get(empId) || 0) + heMins);
  }

  return { heUtilMap, heFimMap, heMap };
}

/**
 * Recalcula `valeResultJson.totalVale` e atualiza os valores dos funcionários no JSON
 * a partir dos dados reais em `payroll_advances`. Persiste no `payroll_periods.valeResultJson`.
 * Use sempre que houver edição/alteração individual de um vale para manter card e folha em sincronia.
 */
async function sincronizarValeJson(db: any, companyId: number, mesReferencia: string) {
  try {
    const periodRows = ((await db.execute(sql`
      SELECT "valeResultJson" FROM payroll_periods
      WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}
      LIMIT 1
    `)) as any).rows || [];
    if (periodRows.length === 0 || !periodRows[0].valeResultJson) return;

    const raw = periodRows[0].valeResultJson;
    const json = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!json || !Array.isArray(json.funcionarios)) return;

    const advRows = ((await db.execute(sql`
      SELECT "employeeId", "valorTotalVale", "valorAdiantamento", "irRetidoAdiantamento",
             "valorLiquidoVale", status, observacoes
      FROM payroll_advances
      WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}
    `)) as any).rows || [];
    const advMap = new Map<number, any>();
    for (const a of advRows) advMap.set(Number(a.employeeId), a);

    let totalVale = 0;
    json.funcionarios = json.funcionarios.map((f: any) => {
      const adv = advMap.get(Number(f.employeeId));
      if (!adv) return f;
      const bruto = parseFloat(adv.valorTotalVale) || 0;
      const liq = parseFloat(adv.valorLiquidoVale) || 0;
      const ir = parseFloat(adv.irRetidoAdiantamento) || 0;
      const status = adv.status || f.status;
      const editado = (adv.observacoes || "").includes("[EDITADO") || (adv.observacoes || "").includes("LÍQUIDO EDITADO");
      if (status === "calculado") totalVale += liq;
      return {
        ...f,
        valorTotalVale: bruto,
        valorAdiantamento: bruto,
        irRetido: ir,
        valorLiquido: liq,
        status,
        temAlerta: status === 'bloqueado',
        bloqueado: status === 'bloqueado',
        editadoManualmente: editado || !!f.editadoManualmente,
      };
    });
    json.totalVale = Math.round(totalVale * 100) / 100;

    await db.execute(sql`
      UPDATE payroll_periods
      SET "valeResultJson" = ${JSON.stringify(json)}
      WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}
    `);
  } catch (e) {
    console.error("[sincronizarValeJson] erro:", e);
  }
}

/**
 * Rev. 3292 — Conjunto de employeeIds que HOJE não podem receber vale/adiantamento:
 * PJ, Sócio ou registro excluído (deletedAt). Defensivo contra snapshots velhos:
 * um vale gerado quando a pessoa era CLT NÃO pode sobreviver depois que ela vira PJ
 * (ex.: recontratação como PJ). READ-ONLY.
 */
async function getIdsInelegiveisVale(db: any, ids: number[], mesReferencia?: string): Promise<Set<number>> {
  const inelegivel = new Set<number>();
  const limpos = [...new Set(ids.map((n) => Number(n)).filter((n) => Number.isFinite(n)))];
  if (limpos.length === 0) return inelegivel;
  // Rev. 3312 — quando o mês é conhecido, também barra DESLIGADOS cuja saída
  // efetiva (dataDesligamentoEfetiva, ou dataDemissao na falta) é ANTERIOR ao 1º
  // dia do mês: já não trabalhavam no período, mas ficaram congelados no snapshot
  // (gerado quando eram Ativo). Desligado em aviso prévio que ainda cobre o mês
  // tem saída >= 1º dia (ou datas no mês) → permanece (recebe vale proporcional).
  let primeiroDiaMes: string | null = null;
  if (mesReferencia && /^\d{4}-\d{2}$/.test(mesReferencia)) primeiroDiaMes = `${mesReferencia}-01`;
  try {
    const rows = ((await db.execute(sql`
      SELECT id, COALESCE("tipoContrato", 'CLT') as "tipoContrato", "deletedAt",
             status, "dataDesligamentoEfetiva", "dataDemissao"
      FROM employees
      WHERE id IN (${sql.join(limpos.map((id) => sql`${id}`), sql`,`)})
    `)) as any).rows || [];
    for (const r of rows as any[]) {
      const tc = String(r.tipoContrato || "CLT");
      if (r.deletedAt != null || tc === "PJ" || tc === "Socio") { inelegivel.add(Number(r.id)); continue; }
      if (primeiroDiaMes && EMPLOYEE_STATUS_DESLIGADOS.includes(String(r.status || ""))) {
        const saida = r.dataDesligamentoEfetiva || r.dataDemissao;
        if (saida) {
          const saidaISO = String(saida).slice(0, 10); // YYYY-MM-DD (comparação lexicográfica segura)
          if (saidaISO < primeiroDiaMes) inelegivel.add(Number(r.id));
        }
      }
    }
  } catch (e) {
    console.error("[getIdsInelegiveisVale] erro:", e);
  }
  return inelegivel;
}

/**
 * Rev. 3292 — Sanitiza o snapshot de vale (`valeResultJson`, texto) NA LEITURA:
 * remove funcionários que hoje são PJ/Sócio/excluídos e recalcula os agregados.
 * Não persiste (read-only); só corrige o que é exibido. Mantém o tipo string.
 */
async function sanitizarValeSnapshotNaoClt(db: any, jsonStr: string | null, mesReferencia?: string): Promise<string | null> {
  if (!jsonStr) return jsonStr;
  try {
    const json = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
    if (!json || !Array.isArray(json.funcionarios) || json.funcionarios.length === 0) return jsonStr;
    const ids = json.funcionarios.map((f: any) => Number(f.employeeId));
    const inelegivel = await getIdsInelegiveisVale(db, ids, mesReferencia);
    if (inelegivel.size === 0) return jsonStr;
    json.funcionarios = json.funcionarios.filter((f: any) => !inelegivel.has(Number(f.employeeId)));
    let totalVale = 0;
    let totalAlertas = 0;
    for (const f of json.funcionarios) {
      if (f.status === "calculado") totalVale += Number(f.valorLiquido) || 0;
      if (f.temAlerta) totalAlertas++;
    }
    json.totalFuncionarios = json.funcionarios.length;
    json.totalAlertas = totalAlertas;
    json.totalVale = Math.round(totalVale * 100) / 100;
    return JSON.stringify(json);
  } catch (e) {
    console.error("[sanitizarValeSnapshotNaoClt] erro:", e);
    return jsonStr;
  }
}

/**
 * Rev. 4691 — Sanitiza o snapshot de pagamento (`pagamentoResultJson`) NA LEITURA
 * contra as decisões de aviso prévio já registradas (payroll_folha_decisoes).
 * O snapshot é gerado ANTES da decisão do RH; sem esta sanitização, ao reabrir a
 * tela o card "Aviso Prévio Encerrando no Mês" reaparecia com funcionários já
 * decididos (Pagar/Não Pagar). Read-only: não persiste, só corrige a exibição —
 * a próxima simulação regrava o snapshot já consistente.
 */
async function sanitizarPagamentoSnapshotDecisoesAviso(
  db: any, jsonStr: string | null, companyId: number, mesReferencia: string,
): Promise<string | null> {
  if (!jsonStr) return jsonStr;
  try {
    const json = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
    if (!json || !Array.isArray(json.alertasAvisoEncerrado) || json.alertasAvisoEncerrado.length === 0) return jsonStr;
    const decRows = ((await db.execute(sql`
      SELECT DISTINCT ON ("employeeId") "employeeId", decisao
      FROM payroll_folha_decisoes
      WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}
      ORDER BY "employeeId", "decididoEm" DESC
    `)) as any).rows || [];
    if (decRows.length === 0) return jsonStr;
    const decMap = new Map<number, string>();
    for (const r of decRows as any[]) decMap.set(Number(r.employeeId), r.decisao);

    const decididos = (json.alertasAvisoEncerrado as any[]).filter(a => decMap.has(Number(a.employeeId)));
    if (decididos.length === 0) return jsonStr;

    // Remove do card quem já foi decidido
    json.alertasAvisoEncerrado = (json.alertasAvisoEncerrado as any[]).filter(a => !decMap.has(Number(a.employeeId)));

    const funcionarios: any[] = Array.isArray(json.funcionarios) ? json.funcionarios : [];
    const naoPagarIds = new Set<number>();
    for (const a of decididos) {
      const empId = Number(a.employeeId);
      if (decMap.get(empId) === 'nao_pagar') {
        naoPagarIds.add(empId);
        if (!Array.isArray(json.excluidosPorDecisaoAviso)) json.excluidosPorDecisaoAviso = [];
        if (!(json.excluidosPorDecisaoAviso as any[]).some((e: any) => Number(e.employeeId) === empId)) {
          json.excluidosPorDecisaoAviso.push({ employeeId: empId, nome: a.nome });
        }
      }
    }
    json.funcionarios = funcionarios
      .filter((f: any) => !naoPagarIds.has(Number(f.employeeId)))
      .map((f: any) => (decMap.get(Number(f.employeeId)) === 'pagar' ? { ...f, alertaAvisoEncerrado: false } : f));

    // Recalcula totais espelhando a simulação: quem segue com alerta pendente fica FORA.
    let totalBruto = 0, totalDescontos = 0, totalLiquido = 0;
    for (const f of json.funcionarios as any[]) {
      if (f.alertaAvisoEncerrado) continue;
      totalBruto += Number(f.salarioBruto) || 0;
      totalDescontos += Number(f.totalDescontos) || 0;
      totalLiquido += Number(f.salarioLiquido) || 0;
    }
    json.totalFuncionarios = (json.funcionarios as any[]).length;
    json.totalBruto = Math.round(totalBruto * 100) / 100;
    json.totalDescontos = Math.round(totalDescontos * 100) / 100;
    json.totalLiquido = Math.round(totalLiquido * 100) / 100;
    return JSON.stringify(json);
  } catch (e) {
    console.error("[sanitizarPagamentoSnapshotDecisoesAviso] erro:", e);
    return jsonStr;
  }
}

export const payrollEngineRouter = router({
  // ============================================================
  // 1. ABRIR / LISTAR COMPETÊNCIAS
  // ============================================================
  listPeriods: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const ano = input.ano || new Date().getFullYear();
      const rows = ((await db.execute(sql`
        SELECT * FROM payroll_periods 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" LIKE ${ano + '%'}
        ORDER BY "mesReferencia" DESC
      `)) as any).rows || [];
      return rows || [];
    }),

  getPeriod: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT * FROM payroll_periods 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      const period = rows[0];
      if (!period) return null;
      // Rev. 3292 — sanitiza o snapshot de vale na leitura: ninguém que hoje é
      // PJ/Sócio/excluído pode aparecer (cura snapshots gerados quando era CLT).
      if (period.valeResultJson) {
        period.valeResultJson = await sanitizarValeSnapshotNaoClt(db, period.valeResultJson, input.mesReferencia);
      }
      // Rev. 4691 — aplica na leitura as decisões de aviso prévio já tomadas
      // (senão o card "Decisão Necessária" reaparece a cada reabertura da tela).
      // Folha CONSOLIDADA é registro fechado: não reescrever totais na leitura.
      if (period.pagamentoResultJson && !period.pagamentoConsolidadoEm) {
        period.pagamentoResultJson = await sanitizarPagamentoSnapshotDecisoesAviso(
          db, period.pagamentoResultJson, input.companyId, input.mesReferencia,
        );
      }
      return period;
    }),

  openPeriod: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const diaCorte = criteria.diaCorte;
      const pontoInicioDate = new Date(Date.UTC(prevYear, prevMonth - 1, diaCorte));
      pontoInicioDate.setUTCDate(pontoInicioDate.getUTCDate() + 1);
      const pontoInicio = pontoInicioDate.toISOString().slice(0, 10);
      const pontoFim = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
      const lastDay = new Date(year, month, 0).getDate();
      const escuroInicio = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
      const escuroFim = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      // Check if already exists
      const existing = ((await db.execute(sql`
        SELECT id FROM payroll_periods 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      if (existing[0]) {
        return { id: existing[0].id, message: "Competência já existe" };
      }

      // Count active employees
      const empCount = ((await db.execute(sql`
        SELECT COUNT(*) as total FROM employees 
        WHERE "companyId" = ${input.companyId} 
        AND "tipoContrato" = 'CLT'
        AND status IN ('Ativo', 'Ferias')
        AND "deletedAt" IS NULL
      `)) as any).rows || [];
      const totalFunc = empCount[0]?.total || 0;

      const result = ((await db.execute(sql`
        INSERT INTO payroll_periods ("companyId", "mesReferencia", "pontoInicio", "pontoFim", "escuroInicio", "escuroFim", status, "totalFuncionarios")
        VALUES (${input.companyId}, ${input.mesReferencia}, ${pontoInicio}, ${pontoFim}, ${escuroInicio}, ${escuroFim}, 'aberta', ${totalFunc})
        RETURNING id
      `)) as any).rows || [];
      return { id: result[0].id, message: "Competência aberta com sucesso" };
    }),

  // ============================================================
  // 2. PROCESSAR PONTO IMPORTADO + GERAR TIMECARD DAILY
  // ============================================================
  processarPonto: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Validate period exists and is in correct status
      const periods = ((await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1`
      )) as any).rows || [];
      if (!periods[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Competência não encontrada. Abra a competência primeiro." });
      if (periods[0].status === "pagamento_consolidado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Pagamento já consolidado. Desconsolide o pagamento antes de reprocessar o ponto.` });
      }

      try {
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const diaCorte = criteria.diaCorte;
      const pontoInicioDate = new Date(Date.UTC(prevYear, prevMonth - 1, diaCorte));
      pontoInicioDate.setUTCDate(pontoInicioDate.getUTCDate() + 1);
      const pontoInicio = pontoInicioDate.toISOString().slice(0, 10);
      const pontoFim = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;
      const lastDay = new Date(year, month, 0).getDate();

      // Get all active CLT employees
      const empList = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        valorHora: employees.valorHora,
        salarioBase: employees.salarioBase,
        jornadaTrabalho: employees.jornadaTrabalho,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
        )
      );

      // Get time_records for the ponto period (may include multiple clocks/obras)
      const records = await db.select().from(timeRecords).where(
        and(
          companyFilter(timeRecords.companyId, input),
          sql`${timeRecords.data} >= ${pontoInicio}`,
          sql`${timeRecords.data} <= ${pontoFim}`,
        )
      );

      // Build a map: employeeId-date -> record[] (multiple records = multiple clocks)
      const recordMap = new Map<string, any[]>();
      for (const r of records) {
        const key = `${r.employeeId}-${r.data}`;
        if (!recordMap.has(key)) recordMap.set(key, []);
        recordMap.get(key)!.push(r);
      }

      // Preserve existing treatments (resoluções, aferições, abonos) before deleting
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
        console.log(`[processarPonto] Preservando ${savedTreatments.length} tratamentos existentes para reaplicar após reprocessamento`);
      }

      // Clear existing timecard_daily for this competencia
      await db.execute(sql`
        DELETE FROM timecard_daily WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `);
      try { await db.execute(sql.raw(`DELETE FROM timecard_daily WHERE companyid = ${Number(input.companyId)} AND mescompetencia = '${input.mesReferencia.replace(/'/g, "''")}'`)); } catch {}

      let totalInserted = 0;
      let totalFaltas = 0;
      let totalAtrasos = 0;
      let totalInconsistencias = 0;

      // Helper: count punches in a record
      const countPunches = (rec: any): number => {
        let count = 0;
        if (rec.entrada1) count++;
        if (rec.saida1) count++;
        if (rec.entrada2) count++;
        if (rec.saida2) count++;
        if (rec.entrada3) count++;
        if (rec.saida3) count++;
        return count;
      };

      // Helper: detect inconsistency type
      const detectInconsistency = (rec: any, numBatidas: number): { isInconsistente: number; tipo: string | null } => {
        if (numBatidas > 0 && numBatidas % 2 !== 0) {
          return { isInconsistente: 1, tipo: "batida_impar" };
        }
        if (!rec.entrada1 && rec.saida1) {
          return { isInconsistente: 1, tipo: "entrada_faltando" };
        }
        if (rec.entrada1 && !rec.saida1 && numBatidas === 1) {
          return { isInconsistente: 1, tipo: "saida_faltando" };
        }
        return { isInconsistente: 0, tipo: null };
      };

      // Collect time_records HE updates to apply after all employees are processed
      // (updates time_records.horasExtras so the detail view shows computed HE correctly)
      const timeRecordHEUpdates: { id: number; he: string }[] = [];

      // Process each employee
      for (const emp of empList) {
        // PART 1: Days from ponto period - status: registrado
        const pontoDates = getDateRange(pontoInicio, pontoFim);
        for (const dateStr of pontoDates) {
          const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
          if (dow === 0) continue; // Skip Sundays
          const key = `${emp.id}-${dateStr}`;
          const recs = recordMap.get(key) || [];
          let tipoDia: string = "util";
          if (dow === 6) tipoDia = criteria.jornadaSabadoTipo === "compensado" ? "compensado" : "sabado";

          let isFalta = 0, isAtraso = 0, isSaidaAntecipada = 0;
          let minutosAtraso = 0, minutosSaidaAntecipada = 0;
          let horasTrabalhadas = "0:00", horasExtras = "0:00", horasNoturnas = "0:00";
          let origemRegistro = "dixi";
          let numBatidas = 0;
          let isInconsistente = 0;
          let inconsistenciaTipo: string | null = null;
          let obraId: number | null = null;
          let obraSecundariaId: number | null = null;
          let rateioPercentual: number | null = null;
          let timeRecordId: number | null = null;

          if (recs.length > 0) {
            const rec = recs[0];
            timeRecordId = rec.id;
            obraId = rec.obraId || null;
            horasTrabalhadas = rec.horasTrabalhadas || "0:00";
            horasNoturnas = rec.horasNoturnas || "0:00";
            numBatidas = countPunches(rec);

            // Respeitar tipoDia abonado vindo do time_records (atestado/feriado/bh definidos no editor do Espelho de Ponto)
            // Sem isso, a derivação puramente por dow marcaria isFalta=1 mesmo em dias abonados.
            const recTipoDia = (rec.tipoDia || "").toLowerCase();
            if (recTipoDia === "atestado" || recTipoDia === "feriado" || recTipoDia === "bh") {
              tipoDia = recTipoDia;
            }

            // Multi-obra detection
            if (recs.length > 1) {
              obraSecundariaId = recs[1].obraId || null;
              if (rec.entrada1 && recs[1].entrada1 && rec.entrada1 === recs[1].entrada1) {
                isInconsistente = 1;
                inconsistenciaTipo = "sobreposicao_horario";
                totalInconsistencias++;
              } else {
                const totalMinsPrimary = parseTime(rec.horasTrabalhadas) || 0;
                const totalMinsSecondary = parseTime(recs[1].horasTrabalhadas) || 0;
                const totalMins = totalMinsPrimary + totalMinsSecondary;
                rateioPercentual = totalMins > 0 ? Math.round((totalMinsPrimary / totalMins) * 100) : 50;
                origemRegistro = "rateado";
                horasTrabalhadas = minutesToHHMM(totalMins);
                // HE will be recalculated below in the general HE block using combined horasTrabalhadas
              }
            }

            // Recalculate HE from actual worked minutes vs expected jornada
            // (rec.horasExtras from time_records is unreliable — always 0 for manual entries
            //  and often 0 for biometric imports that don't compute it at import time)
            if (!isInconsistente || inconsistenciaTipo !== "sobreposicao_horario") {
              const expectedMins = getExpectedMins(emp.jornadaTrabalho, dateStr, criteria.cargaHorariaDiaria);
              const actualMins = parseTime(horasTrabalhadas) || 0;
              const heMins = Math.max(0, actualMins - expectedMins);
              horasExtras = heMins > 0 ? minutesToHHMM(heMins) : "0:00";
            }

            // Queue update of time_records.horasExtras so detail view reflects computed HE
            if (timeRecordId !== null) {
              timeRecordHEUpdates.push({ id: timeRecordId, he: horasExtras });
            }

            // Inconsistency detection
            if (!isInconsistente) {
              const incon = detectInconsistency(rec, numBatidas);
              isInconsistente = incon.isInconsistente;
              inconsistenciaTipo = incon.tipo;
              if (isInconsistente) totalInconsistencias++;
            }

            // Check for absence
            if (numBatidas === 0) {
              if (tipoDia === "util") { isFalta = 1; totalFaltas++; }
            }
            // Check for tardiness (CLT Art. 58 §1º + Súmula 366 TST)
            // ≤ 10 min = OK (tolerância legal), > 10 min = desconta TOTALIDADE
            const entrada = parseTime(rec.entrada1);
            if (entrada !== null && tipoDia === "util") {
              const jornadaEntrada = getExpectedEntrada(emp.jornadaTrabalho, dateStr);
              const atraso = entrada - jornadaEntrada;
              if (atraso > criteria.pontoFaltaAposAtraso) {
                isFalta = 1; totalFaltas++;
              } else if (atraso > criteria.pontoToleranciaLegal) {
                isAtraso = 1; minutosAtraso = atraso; totalAtrasos++;
              }
            }
            // Check for early departure (CLT Art. 58 §1º + Súmula 366 TST)
            // ≤ 10 min = OK, > 10 min = desconta TOTALIDADE
            const saida = parseTime(rec.saida2 || rec.saida1);
            if (saida !== null && tipoDia === "util") {
              const jornadaSaida = (getExpectedEntrada(emp.jornadaTrabalho, dateStr) / 60 + criteria.cargaHorariaDiaria + 1) * 60;
              const saidaAntecipada = jornadaSaida - saida;
              if (saidaAntecipada > criteria.pontoToleranciaLegal) {
                isSaidaAntecipada = 1; minutosSaidaAntecipada = saidaAntecipada;
              }
            }
          } else {
            if (tipoDia === "util") { isFalta = 1; totalFaltas++; }
          }

          await db.execute(sql`
            INSERT INTO timecard_daily ("companyId", "employeeId", "data", "mesCompetencia", "statusDia", 
              "entrada1", "saida1", "entrada2", "saida2", "entrada3", "saida3",
              "horasTrabalhadas", "horasExtras", "horasNoturnas",
              "isFalta", "isAtraso", "isSaidaAntecipada", "minutosAtraso", "minutosSaidaAntecipada",
              "tipoDia", "timeRecordId", "obraId",
              "origemRegistro", "numBatidas", "isInconsistente", "inconsistenciaTipo",
              "obraSecundariaId", "rateioPercentual")
            VALUES (${input.companyId}, ${emp.id}, ${dateStr}, ${input.mesReferencia}, 'registrado',
              ${recs[0]?.entrada1 || null}, ${recs[0]?.saida1 || null}, ${recs[0]?.entrada2 || null}, ${recs[0]?.saida2 || null}, ${recs[0]?.entrada3 || null}, ${recs[0]?.saida3 || null},
              ${horasTrabalhadas}, ${horasExtras}, ${horasNoturnas},
              ${isFalta}, ${isAtraso}, ${isSaidaAntecipada}, ${minutosAtraso}, ${minutosSaidaAntecipada},
              ${tipoDia}, ${timeRecordId}, ${obraId},
              ${origemRegistro}, ${numBatidas}, ${isInconsistente}, ${inconsistenciaTipo},
              ${obraSecundariaId}, ${rateioPercentual})
          `);
          totalInserted++;
        }

        // PART 2: Days "no escuro" (after diaCorte to end of month) - status: escuro
        if (criteria.fecharNoEscuro) {
          for (let d = diaCorte + 1; d <= lastDay; d++) {
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
            if (dow === 0) continue;
            let tipoDia = "util";
            if (dow === 6) tipoDia = criteria.jornadaSabadoTipo === "compensado" ? "compensado" : "sabado";
            await db.execute(sql`
              INSERT INTO timecard_daily ("companyId", "employeeId", data, "mesCompetencia", "statusDia",
                "horasTrabalhadas", "horasExtras", "horasNoturnas",
                "isFalta", "isAtraso", "isSaidaAntecipada", "minutosAtraso", "minutosSaidaAntecipada",
                "tipoDia", "origemRegistro", "numBatidas", "isInconsistente")
              VALUES (${input.companyId}, ${emp.id}, ${dateStr}, ${input.mesReferencia}, 'escuro',
                ${minutesToHHMM(criteria.cargaHorariaDiaria * 60)}, '0:00', '0:00',
                0, 0, 0, 0, 0,
                ${tipoDia}, 'escuro', 0, 0)
            `);
            totalInserted++;
          }
        }
      }

      // Batch-update time_records.horasExtras with computed values
      // so the employee detail view shows HE correctly (it reads from time_records)
      for (const upd of timeRecordHEUpdates) {
        await db.execute(sql`UPDATE time_records SET "horasExtras" = ${upd.he} WHERE id = ${upd.id}`);
      }

      // Create alerts for inconsistencies
      if (totalInconsistencias > 0) {
        await db.execute(sql`
          INSERT INTO payroll_alerts (companyId, mesReferencia, tipo, titulo, descricao, prioridade)
          VALUES (${input.companyId}, ${input.mesReferencia}, 'inconsistencias_ponto',
            ${`${totalInconsistencias} inconsistência(s) detectada(s) no ponto`},
            ${`Foram encontradas ${totalInconsistencias} inconsistências que precisam ser resolvidas antes de avançar.`},
            ${totalInconsistencias > 10 ? "alta" : "media"})
        `);
      }

      // Re-apply preserved treatments to newly inserted records
      let totalTreatmentsRestored = 0;
      if (treatmentMap.size > 0) {
        for (const [key, t] of treatmentMap) {
          try {
            const updates: string[] = [];
            if (t.resolucaoTipo) {
              updates.push(`"resolucaoTipo" = '${String(t.resolucaoTipo).replace(/'/g, "''")}'`);
              updates.push(`"resolucaoObs" = '${String(t.resolucaoObs || '').replace(/'/g, "''")}'`);
              updates.push(`"resolucaoPor" = '${String(t.resolucaoPor || 'Sistema').replace(/'/g, "''")}'`);
              updates.push(`"resolucaoEm" = ${t.resolucaoEm ? `'${t.resolucaoEm}'` : 'NOW()'}`);
              updates.push(`"inconsistenciaResolvida" = 1`);
              updates.push(`"isInconsistente" = 0`);
              if (t.resolucaoTipo === 'atestado' || t.resolucaoTipo === 'justificar' || t.resolucaoTipo === 'abonar') {
                updates.push(`"isFalta" = 0`);
              }
              if (t.resolucaoTipo === 'ajustar_horario') {
                if (t.entrada1) updates.push(`"entrada1" = '${t.entrada1}'`);
                if (t.saida1) updates.push(`"saida1" = '${t.saida1}'`);
                if (t.entrada2) updates.push(`"entrada2" = '${t.entrada2}'`);
                if (t.saida2) updates.push(`"saida2" = '${t.saida2}'`);
              }
            }
            if (t.afericaoResultado) {
              updates.push(`"afericaoResultado" = '${String(t.afericaoResultado).replace(/'/g, "''")}'`);
              if (t.afericaoObs) updates.push(`"afericaoObs" = '${String(t.afericaoObs).replace(/'/g, "''")}'`);
              if (t.afericaoEm) updates.push(`"afericaoEm" = '${t.afericaoEm}'`);
              if (t.statusDia && t.statusDia !== 'registrado') updates.push(`"statusDia" = '${t.statusDia}'`);
              if (t.statusAnterior) updates.push(`"statusAnterior" = '${t.statusAnterior}'`);
            }
            if (t.atestadoId) updates.push(`"atestadoId" = ${Number(t.atestadoId)}`);
            if (t.advertenciaId) updates.push(`"advertenciaId" = ${Number(t.advertenciaId)}`);

            if (updates.length > 0) {
              await db.execute(sql.raw(
                `UPDATE timecard_daily SET ${updates.join(', ')} WHERE "companyId" = ${Number(input.companyId)} AND "employeeId" = ${Number(t.employeeId)} AND "data" = '${t.data}' AND "mesCompetencia" = '${input.mesReferencia.replace(/'/g, "''")}'`
              ));
              totalTreatmentsRestored++;
            }
          } catch (e: any) {
            console.warn(`[processarPonto] Falha ao restaurar tratamento ${key}:`, e?.message);
          }
        }
        console.log(`[processarPonto] ${totalTreatmentsRestored}/${treatmentMap.size} tratamentos restaurados com sucesso`);
      }

      // Update period status
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'ponto_importado',
          "pontoImportadoEm" = NOW(),
          "pontoImportadoPor" = ${ctx.user.name || "Sistema"}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      const treatmentMsg = totalTreatmentsRestored > 0 ? ` (${totalTreatmentsRestored} tratamento(s) preservado(s))` : '';
      return {
        totalFuncionarios: empList.length,
        totalRegistros: totalInserted,
        totalFaltas,
        totalAtrasos,
        totalInconsistencias,
        totalTreatmentsRestored,
        message: `Ponto processado: ${empList.length} funcionários, ${totalInserted} registros, ${totalInconsistencias} inconsistências${treatmentMsg}`,
      };
      } catch (err: any) {
        console.error("[processarPonto] Error:", err);
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao processar ponto: ${err.message || "Erro desconhecido"}` });
      }
    }),

  // ============================================================
  // 2.1 LISTAR INCONSISTÊNCIAS DO PONTO
  // ============================================================
  listarInconsistencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT td.*, e."nomeCompleto", e.funcao, e."codigoInterno", o.nome as "obraNome"
        FROM timecard_daily td
        LEFT JOIN employees e ON td."employeeId" = e.id
        LEFT JOIN obras o ON td."obraId" = o.id
        WHERE td."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) 
        AND td."mesCompetencia" = ${input.mesReferencia}
        AND td."isInconsistente" = 1
        ORDER BY td."data", e."nomeCompleto"
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 2.2 RESOLVER INCONSISTÊNCIA (Ajustar Horário / Atestado / Advertência / Justificar)
  // ============================================================
  resolverInconsistencia: protectedProcedure
    .input(z.object({
      timecardDailyId: z.number(),
      resolucaoTipo: z.enum(["ajustar_horario", "atestado", "advertencia", "justificar", "abonar"]),
      novaEntrada1: z.string().optional(),
      novaSaida1: z.string().optional(),
      novaEntrada2: z.string().optional(),
      novaSaida2: z.string().optional(),
      observacao: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      if (input.resolucaoTipo === "ajustar_horario") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            entrada1 = COALESCE(${input.novaEntrada1 || null}, entrada1),
            saida1 = COALESCE(${input.novaSaida1 || null}, saida1),
            entrada2 = COALESCE(${input.novaEntrada2 || null}, entrada2),
            saida2 = COALESCE(${input.novaSaida2 || null}, saida2),
            "isInconsistente" = 0,
            "resolucaoTipo" = 'ajustar_horario',
            "resolucaoObs" = ${input.observacao || "Horário ajustado manualmente"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW(),
            "origemRegistro" = 'manual'
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "atestado") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            "isInconsistente" = 0,
            "resolucaoTipo" = 'atestado',
            "resolucaoObs" = ${input.observacao || "Justificado por atestado médico"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW(),
            "isFalta" = 0
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "advertencia") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            "isInconsistente" = 0,
            "resolucaoTipo" = 'advertencia',
            "resolucaoObs" = ${input.observacao || "Advertência emitida"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW()
          WHERE id = ${input.timecardDailyId}
        `);
      } else if (input.resolucaoTipo === "justificar" || input.resolucaoTipo === "abonar") {
        await db.execute(sql`
          UPDATE timecard_daily SET 
            "isInconsistente" = 0,
            "resolucaoTipo" = ${input.resolucaoTipo},
            "resolucaoObs" = ${input.observacao || "Justificado pelo gestor"},
            "resolucaoPor" = ${ctx.user.name || "Sistema"},
            "resolucaoEm" = NOW(),
            "isFalta" = 0
          WHERE id = ${input.timecardDailyId}
        `);
      }

      return { success: true, message: `Inconsistência resolvida: ${input.resolucaoTipo}` };
    }),

  // ============================================================
  // 2.3 RESUMO DE INCONSISTÊNCIAS (para o wizard)
  // ============================================================
  resumoInconsistencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT 
          SUM(CASE WHEN "isInconsistente" = 1 THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN "inconsistenciaResolvida" = 1 THEN 1 ELSE 0 END) as resolvidas,
          SUM(CASE WHEN "inconsistenciaTipo" = 'batida_impar' AND "isInconsistente" = 1 THEN 1 ELSE 0 END) as "batidasImpares",
          SUM(CASE WHEN "inconsistenciaTipo" = 'sobreposicao_horario' AND "isInconsistente" = 1 THEN 1 ELSE 0 END) as sobreposicoes,
          SUM(CASE WHEN "inconsistenciaTipo" = 'entrada_faltando' AND "isInconsistente" = 1 THEN 1 ELSE 0 END) as "entradasFaltando",
          SUM(CASE WHEN "inconsistenciaTipo" = 'saida_faltando' AND "isInconsistente" = 1 THEN 1 ELSE 0 END) as "saidasFaltando"
        FROM timecard_daily 
        WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      return rows[0] || { pendentes: 0, resolvidas: 0, batidasImpares: 0, sobreposicoes: 0, entradasFaltando: 0, saidasFaltando: 0 };
    }),

  // ============================================================
  // 3. AFERIÇÃO - Cruzar ponto com período "no escuro" do mês anterior
  // ============================================================
  realizarAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Garante que payroll_periods existe pra mesReferencia E prevMes (a aferição
      // UPDATEa ambos). Sem isso o UPDATE silenciosamente afetava 0 linhas.
      const _prevMesEnsure = getPrevMesRef(input.mesReferencia);
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      await ensurePeriodExists(db, resolveCompanyIds(input), _prevMesEnsure);

      // --- GUARD: block re-aferição if consolidated ---
      const ppGuard = ((await db.execute(sql`
        SELECT "afericaoConsolidadoEm" FROM payroll_periods
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      if (ppGuard.length > 0 && ppGuard[0].afericaoConsolidadoEm) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Aferição consolidada — desconsolide primeiro para reaferir.",
        });
      }

      const criteria = await getPayrollCriteria(db, input.companyId);
      const prevMes = getPrevMesRef(input.mesReferencia);
      const { year, month } = parseMesRef(input.mesReferencia);
      const prevParsed = parseMesRef(prevMes);
      const diaCorte = criteria.diaCorte;
      const prevLastDay = new Date(prevParsed.year, prevParsed.month, 0).getDate();
      const afericaoCompanyIds = resolveCompanyIds(input);
      const afericaoCidsSql = sql.join(afericaoCompanyIds.map(id => sql`${id}`), sql`,`);

      // Limpar apenas ajustes NÃO decididos (preservar confirmados/cancelados)
      await db.execute(sql`
        DELETE FROM payroll_adjustments 
        WHERE "companyId" IN (${afericaoCidsSql}) 
        AND "mesOrigem" = ${prevMes}
        AND "mesDesconto" = ${input.mesReferencia}
        AND tipo IN ('falta', 'atraso', 'sem_registro')
        AND status NOT IN ('pendente', 'cancelado', 'aplicado')
      `);

      // Resetar todos os registros da aferição anterior, EXCETO os que:
      //   (a) correspondem a payroll_adjustments já decididos (pendente/cancelado/aplicado);
      //   (b) foram tratados manualmente (origemRegistro manual/ajuste_manual);
      //   (c) tiveram resolução manual aplicada (resolucaoTipo NOT NULL).
      // Esses casos representam validações manuais que devem ser respeitadas.
      await db.execute(sql`
        UPDATE timecard_daily td SET 
          "statusDia" = 'escuro',
          "statusAnterior" = NULL,
          "afericaoResultado" = NULL,
          "afericaoObs" = NULL,
          "afericaoEm" = NULL,
          "entrada1" = NULL, "saida1" = NULL, "entrada2" = NULL, "saida2" = NULL,
          "entrada3" = NULL, "saida3" = NULL,
          "isFalta" = 0, "isAtraso" = 0,
          "origemRegistro" = 'dixi'
        WHERE td."companyId" IN (${afericaoCidsSql}) 
        AND td."mesCompetencia" = ${prevMes}
        AND (td."statusAnterior" = 'escuro' OR td."statusDia" IN ('escuro', 'pendente', 'pendente_decisao', 'aferido'))
        AND td."origemRegistro" NOT IN ('manual', 'ajuste_manual', 'ajusteManual')
        AND td."resolucaoTipo" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM payroll_adjustments pa 
          WHERE pa."timecardDailyId" = td.id 
          AND pa.status IN ('pendente', 'cancelado', 'aplicado')
        )
      `);

      // Janela do "escuro" a aferir = competência inteira (cut-to-cut)
      // Ex.: competência Mar/2026 → 16/02/2026 a 15/03/2026.
      // Cobre tanto os dias do mês anterior pós-corte quanto os dias do mês atual
      // até o dia_corte (todos podem ter sido projetados/estimados).
      const escuroInicio = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
      const escuroFim = `${year}-${String(month).padStart(2, "0")}-${String(diaCorte).padStart(2, "0")}`;

      // Buscar registros escuro + já decididos (preservados do reset) — excluir PJ/Sócio
      // IMPORTANTE: amarrar td.data >= escuroInicio para não puxar dias do início da
      // competência anterior (ex.: 15/01 quando o escuro real é 16/01-31/01).
      // Excluir linhas tratadas manualmente que NÃO possuem ajuste decidido:
      // essas representam validações manuais que devem permanecer intocadas pela re-aferição.
      // Linhas com ajuste decidido (pendente/cancelado/aplicado) ainda entram no loop para
      // que o branch `jaDecidido` preserve a classificação original no relatório.
      const escuroRecords = ((await db.execute(sql`
        SELECT td.* FROM timecard_daily td
        JOIN employees e ON e.id = td."employeeId"
        WHERE td."companyId" IN (${afericaoCidsSql}) 
        AND td."mesCompetencia" = ${prevMes}
        AND td.data >= ${escuroInicio}
        AND td.data <= ${escuroFim}
        AND (td."statusDia" = 'escuro' OR (td."statusAnterior" = 'escuro' AND td."statusDia" IN ('pendente', 'pendente_decisao', 'aferido')))
        AND COALESCE(e."tipoContrato",'CLT') NOT IN ('PJ','Socio')
        AND (
          (td."origemRegistro" NOT IN ('manual', 'ajuste_manual', 'ajusteManual') AND td."resolucaoTipo" IS NULL)
          OR EXISTS (
            SELECT 1 FROM payroll_adjustments pa
            WHERE pa."timecardDailyId" = td.id
            AND pa."mesOrigem" = ${prevMes}
            AND pa."mesDesconto" = ${input.mesReferencia}
            AND pa.status IN ('pendente', 'cancelado', 'aplicado')
          )
        )
        ORDER BY td."employeeId", td.data
      `)) as any).rows || [];
      if (!escuroRecords || (escuroRecords as any[]).length === 0) {
        for (const cid of afericaoCompanyIds) {
          await db.execute(sql`
            UPDATE payroll_periods SET status = 'aferida', "afericaoRealizada" = 1, "afericaoEm" = NOW(), "afericaoPor" = ${ctx.user.name || "Sistema"}
            WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
          `);
        }
        return { totalAferidos: 0, divergencias: 0, message: "Nenhum registro 'no escuro' encontrado no mês anterior. Competência avançada." };
      }

      const actualRecords = await db.select().from(timeRecords).where(
        and(
          companyFilter(timeRecords.companyId, input),
          sql`${timeRecords.data} >= ${escuroInicio}`,
          sql`${timeRecords.data} <= ${escuroFim}`,
        )
      );

      const normalizeDate = (d: any): string => {
        if (!d) return '';
        if (d instanceof Date) {
          return d.toISOString().slice(0, 10);
        }
        return String(d).slice(0, 10);
      };

      const actualMap = new Map<string, any>();
      for (const r of actualRecords) {
        actualMap.set(`${r.employeeId}-${normalizeDate(r.data)}`, r);
      }

      // Build a map employeeId → jornadaTrabalho for correct HE recalculation per employee
      const escuroEmployeeIds = [...new Set((escuroRecords as any[]).map((e: any) => Number(e.employeeId)))];
      const escuroEmpRows = escuroEmployeeIds.length > 0
        ? ((await db.execute(sql`SELECT id, "jornadaTrabalho" FROM employees WHERE id IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})`)) as any).rows || []
        : [];
      const empJornadaMap = new Map<number, string | null>();
      for (const row of escuroEmpRows) {
        empJornadaMap.set(row.id, row.jornadaTrabalho ?? null);
      }

      // ===== BATCH-LOAD employee data upfront to avoid N+1 queries =====
      const empDataRows = escuroEmployeeIds.length > 0
        ? ((await db.execute(sql`SELECT id, "valorHora", "salarioBase", "vtValorDiario", "nomeCompleto", funcao, status, "codigoInterno" FROM employees WHERE id IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})`)) as any).rows || []
        : [];
      const empValorHoraMap = new Map<number, number>();
      const empSalarioBaseMap = new Map<number, string>();
      const empVtDiarioMap = new Map<number, number>();
      const empNomeMap = new Map<number, string>();
      const empFuncaoMap = new Map<number, string>();
      const empStatusMap = new Map<number, string>();
      const empCodigoMap = new Map<number, string>();
      for (const row of empDataRows) {
        empValorHoraMap.set(row.id, parseBRL(row.valorHora));
        empSalarioBaseMap.set(row.id, row.salarioBase || '');
        empVtDiarioMap.set(row.id, parseBRL(row.vtValorDiario));
        empNomeMap.set(row.id, row.nomeCompleto || `ID ${row.id}`);
        empFuncaoMap.set(row.id, row.funcao || '');
        empStatusMap.set(row.id, row.status || 'Ativo');
        if (row.codigoInterno) empCodigoMap.set(row.id, row.codigoInterno);
      }

      // ===== BATCH-LOAD vacation periods that overlap the escuro date range =====
      const feriasDateSet = new Set<string>();
      if (escuroEmployeeIds.length > 0) {
        const feriasRows = ((await db.execute(sql`
          SELECT "employeeId", "dataInicio", "dataFim", "periodo2Inicio", "periodo2Fim",
                 "periodo3Inicio", "periodo3Fim"
          FROM vacation_periods 
          WHERE "employeeId" IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})
          AND status NOT IN ('cancelada', 'pendente')
          AND "dataInicio" IS NOT NULL AND "dataFim" IS NOT NULL
          AND "dataFim" >= ${escuroInicio} AND "dataInicio" <= ${escuroFim}
        `)) as any).rows || [];
        for (const vp of feriasRows) {
          const periods = [
            { ini: vp.dataInicio, fim: vp.dataFim },
            { ini: vp.periodo2Inicio, fim: vp.periodo2Fim },
            { ini: vp.periodo3Inicio, fim: vp.periodo3Fim },
          ];
          for (const p of periods) {
            if (!p.ini || !p.fim) continue;
            const start = new Date(p.ini);
            const end = new Date(p.fim);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
              const dateStr = d.toISOString().split('T')[0];
              feriasDateSet.add(`${vp.employeeId}-${dateStr}`);
            }
          }
        }
      }

      // Build obraId → obraNome map for divergências
      const escuroObraIds = [...new Set((escuroRecords as any[]).map((e: any) => e.obraId).filter(Boolean).map(Number))];
      const obraNomeMap = new Map<number, string>();
      if (escuroObraIds.length > 0) {
        const obraRows = ((await db.execute(sql`SELECT id, nome FROM obras WHERE id IN (${sql.join(escuroObraIds.map(id => sql`${id}`), sql`,`)})`)) as any).rows || [];
        for (const o of obraRows) obraNomeMap.set(o.id, o.nome || `Obra ${o.id}`);
      }

      const STATUS_JUSTIFICADO = new Set(['Ferias', 'Afastado', 'Desligado', 'Recluso', 'Lista_Negra']);
      const justificadosList: any[] = [];
      const empVrDiarioMap = new Map<number, number>();
      if (criteria.descontoVrFalta && escuroEmployeeIds.length > 0) {
        const vrRows = ((await db.execute(sql`
          SELECT DISTINCT ON ("employeeId") "employeeId", "valorDiario" FROM vr_benefits 
          WHERE "employeeId" IN (${sql.join(escuroEmployeeIds.map(id => sql`${id}`), sql`,`)})
          AND "companyId" IN (${afericaoCidsSql})
          ORDER BY "employeeId", "mesReferencia" DESC
        `)) as any).rows || [];
        for (const row of vrRows) empVrDiarioMap.set(row.employeeId, parseBRL(row.valorDiario));
      }

      // Load previously decided adjustments to preserve them on re-aferição
      const jaDecididosRows = ((await db.execute(sql`
        SELECT "employeeId", data, tipo, status, "valorDesconto", "valorTotal", id as "adjustmentId"
        FROM payroll_adjustments
        WHERE "companyId" IN (${afericaoCidsSql})
        AND "mesOrigem" = ${prevMes}
        AND "mesDesconto" = ${input.mesReferencia}
        AND status IN ('pendente', 'cancelado', 'aplicado')
      `)) as any).rows || [];
      const jaDecididoMap = new Map<string, any>();
      const jaDecididosList: any[] = [];
      for (const adj of jaDecididosRows) {
        const adjKey = `${adj.employeeId}-${normalizeDate(adj.data)}`;
        jaDecididoMap.set(adjKey, adj);
        if (adj.status === 'cancelado') continue;
        jaDecididosList.push(adj);
      }

      // Defensive dedup set: any (companyId,employeeId,data,tipo,mesOrigem,mesDesconto)
      // tuple already in payroll_adjustments must NOT be re-inserted, regardless of status.
      // Protects against concurrent re-aferição or stale rows the DELETE step kept.
      const existingAdjRows = ((await db.execute(sql`
        SELECT "employeeId", data, tipo
        FROM payroll_adjustments
        WHERE "companyId" IN (${afericaoCidsSql})
        AND "mesOrigem" = ${prevMes}
        AND "mesDesconto" = ${input.mesReferencia}
        AND tipo IN ('falta', 'atraso', 'sem_registro')
      `)) as any).rows || [];
      const existingAdjKeys = new Set<string>();
      for (const r of existingAdjRows) {
        existingAdjKeys.add(`${r.employeeId}|${normalizeDate(r.data)}|${r.tipo}`);
      }

      let totalAferidos = 0;
      let divergencias = 0;
      let totalOk = 0;
      const divergenciasList: any[] = [];
      const validadosList: any[] = [];

      const adjustmentInserts: string[] = [];
      const timecardAferidoUpdates: { id: number; resultado: string; obs: string | null; actual: any; horasExtras: string; numBatidas: number }[] = [];
      const timecardSemRegistroIds: number[] = [];
      const timecardSemRegistroObs: string[] = [];

      for (const escuroRaw of escuroRecords) {
        const escuro = { ...escuroRaw, data: normalizeDate(escuroRaw.data) };
        const key = `${escuro.employeeId}-${escuro.data}`;
        const actual = actualMap.get(key);
        let resultado = "ok";
        let obs = "";
        const empNome = empNomeMap.get(escuro.employeeId) || `ID ${escuro.employeeId}`;
        const empFuncao = empFuncaoMap.get(escuro.employeeId) || '';
        const empStatus = empStatusMap.get(escuro.employeeId) || 'Ativo';
        const empCodigo = empCodigoMap.get(escuro.employeeId) || null;
        const empObraNome = escuro.obraId ? (obraNomeMap.get(Number(escuro.obraId)) || null) : null;

        // Skip items that have already been decided (confirmed/cancelled)
        // but preserve their original classification in the report
        const jaDecidido = jaDecididoMap.get(key);
        if (jaDecidido) {
          totalAferidos++;
          const tipoOriginal = jaDecidido.tipo;
          if (tipoOriginal === 'falta' && jaDecidido.status !== 'cancelado') {
            divergencias++;
            const valorHoraEmpD = empValorHoraMap.get(escuro.employeeId) || 0;
            const faltaValD = parseBRL(jaDecidido.valorTotal || jaDecidido.valorDesconto || '0');
            const vrDescD = parseBRL(jaDecidido.vrDesconto || '0');
            const vtDescD = parseBRL(jaDecidido.vtDesconto || '0');
            const salDescD = valorDiaLegal(empSalarioBaseMap.get(escuro.employeeId), valorHoraEmpD);
            divergenciasList.push({
              employeeId: escuro.employeeId,
              employeeName: empNome,
              funcao: empFuncao,
              empStatus,
              codigoInterno: empCodigo,
              obraNome: empObraNome,
              data: escuro.data,
              tipo: "falta",
              valorDesconto: faltaValD,
              escuroEntrada1: escuro.entrada1 || '-',
              escuroSaida1: escuro.saida1 || '-',
              adjustmentId: jaDecidido.adjustmentId,
              jaDecidido: true,
              statusDecisao: jaDecidido.status,
              memoria: {
                valorHora: valorHoraEmpD,
                cargaHorariaDiaria: criteria.cargaHorariaDiaria,
                descontoSalarial: salDescD,
                descontoVR: vrDescD,
                descontoVT: vtDescD,
                totalDesconto: faltaValD,
              },
            });
          } else if (tipoOriginal === 'atraso' && jaDecidido.status !== 'cancelado') {
            divergencias++;
            const valorHoraEmpD = empValorHoraMap.get(escuro.employeeId) || 0;
            const valorMinutoD = valorHoraEmpD / 60;
            const atrasoValD = parseBRL(jaDecidido.valorTotal || jaDecidido.valorDesconto || '0');
            const entradaRealD = actual?.entrada1 || '-';
            const empJornadaD = empJornadaMap.get(escuro.employeeId) ?? null;
            const jornadaEntradaD = getExpectedEntrada(empJornadaD, escuro.data);
            const entradaMinD = parseTime(entradaRealD);
            // CLT Art. 58 §1º + Súmula 366 TST: > 5 min = desconta TOTALIDADE
            const minutosAtrasoD = entradaMinD !== null && entradaMinD > jornadaEntradaD ? entradaMinD - jornadaEntradaD : 0;
            divergenciasList.push({
              employeeId: escuro.employeeId,
              employeeName: empNome,
              funcao: empFuncao,
              empStatus,
              codigoInterno: empCodigo,
              obraNome: empObraNome,
              data: escuro.data,
              tipo: "atraso",
              minutos: minutosAtrasoD,
              valorDesconto: atrasoValD,
              realEntrada: entradaRealD,
              adjustmentId: jaDecidido.adjustmentId,
              jaDecidido: true,
              statusDecisao: jaDecidido.status,
              memoria: {
                valorHora: valorHoraEmpD,
                valorMinuto: valorMinutoD,
                minutosAtraso: minutosAtrasoD,
                toleranciaLegal: criteria.pontoToleranciaLegal,
                entradaEsperada: minutesToHHMM(jornadaEntradaD),
                entradaReal: entradaRealD,
              },
            });
          } else {
            totalOk++;
          }
          continue;
        }

        const isFerias = feriasDateSet.has(key);
        const isStatusJustificado = STATUS_JUSTIFICADO.has(empStatus);

        if (isFerias || isStatusJustificado) {
          const motivo = isFerias ? 'Férias' : empStatus === 'Afastado' ? 'Afastado' : empStatus === 'Desligado' ? 'Desligado' : empStatus === 'Recluso' ? 'Recluso' : empStatus === 'Lista_Negra' ? 'Lista Negra' : empStatus;
          resultado = "justificado";
          obs = `Ausência justificada: ${motivo}`;
          totalOk++;
          justificadosList.push({
            employeeId: escuro.employeeId,
            employeeName: empNome,
            funcao: empFuncao,
            data: escuro.data,
            motivo,
            empStatus,
          });
          timecardAferidoUpdates.push({ id: escuro.id, resultado: "justificado", obs, actual: actual || { entrada1: null, saida1: null, entrada2: null, saida2: null, entrada3: null, saida3: null, horasTrabalhadas: '0:00', horasNoturnas: '0:00', isFalta: false, isAtraso: false, isSaidaAntecipada: false, minutosAtraso: 0, minutosSaidaAntecipada: 0 }, horasExtras: '0:00', numBatidas: 0 });
          totalAferidos++;
          continue;
        }

        const tipoDiaEscuro = (escuro.tipoDia || 'util').toLowerCase();
        const isDiaUtil = tipoDiaEscuro === 'util';
        const isFimDeSemanaOuFeriado = ['sabado', 'domingo', 'compensado', 'feriado'].includes(tipoDiaEscuro);

        if (!actual && isFimDeSemanaOuFeriado) {
          resultado = "ok";
          obs = `Sem registro em ${tipoDiaEscuro === 'feriado' ? 'feriado' : tipoDiaEscuro === 'domingo' ? 'domingo' : 'sábado'} — esperado (não é dia útil)`;
          totalOk++;
          validadosList.push({
            employeeId: escuro.employeeId,
            employeeName: empNome,
            data: escuro.data,
            escuroEntrada1: escuro.entrada1 || '-',
            escuroSaida1: escuro.saida1 || '-',
            realEntrada1: '-',
            realSaida1: '-',
            horasTrabalhadas: '0:00',
          });
          timecardAferidoUpdates.push({ id: escuro.id, resultado: "ok", obs, actual: { entrada1: null, saida1: null, entrada2: null, saida2: null, entrada3: null, saida3: null, horasTrabalhadas: '0:00', horasNoturnas: '0:00', isFalta: false, isAtraso: false, isSaidaAntecipada: false, minutosAtraso: 0, minutosSaidaAntecipada: 0 }, horasExtras: '0:00', numBatidas: 0 });
          totalAferidos++;
          continue;
        }

        if (actual) {
          if (!actual.entrada1 && !actual.saida1 && !actual.entrada2 && !actual.saida2) {
            if (isFimDeSemanaOuFeriado) {
              resultado = "ok";
              obs = `Sem batida em ${tipoDiaEscuro === 'feriado' ? 'feriado' : tipoDiaEscuro === 'domingo' ? 'domingo' : 'sábado'} — esperado`;
              totalOk++;
              validadosList.push({
                employeeId: escuro.employeeId,
                employeeName: empNome,
                data: escuro.data,
                escuroEntrada1: escuro.entrada1 || '-',
                escuroSaida1: escuro.saida1 || '-',
                realEntrada1: '-',
                realSaida1: '-',
                horasTrabalhadas: '0:00',
              });
              timecardAferidoUpdates.push({ id: escuro.id, resultado: "ok", obs, actual, horasExtras: '0:00', numBatidas: 0 });
              totalAferidos++;
              continue;
            }
            resultado = "falta";
            obs = "Falta identificada na aferição";
            divergencias++;

            const valorHoraEmp = empValorHoraMap.get(escuro.employeeId) || 0;
            const valorFalta = valorDiaLegal(empSalarioBaseMap.get(escuro.employeeId), valorHoraEmp);
            let vrDesconto = "0", vtDesconto = "0";
            if (criteria.descontoVrFalta) {
              vrDesconto = formatMoney(empVrDiarioMap.get(escuro.employeeId) || 0);
            }
            if (criteria.descontoVtFalta) {
              vtDesconto = formatMoney(empVtDiarioMap.get(escuro.employeeId) || 0);
            }
            const totalDesc = valorFalta + parseBRL(vrDesconto) + parseBRL(vtDesconto);

            const esc = (s: string) => s.replace(/'/g, "''");
            const dedupKeyFalta = `${escuro.employeeId}|${escuro.data}|falta`;
            if (!existingAdjKeys.has(dedupKeyFalta)) {
              adjustmentInserts.push(
                `(${input.companyId}, ${escuro.employeeId}, '${esc(prevMes)}', '${esc(input.mesReferencia)}', '${esc(escuro.data)}', 'falta', '${esc(`Falta dia ${escuro.data} - Aferição do período no escuro de ${prevMes}`)}', '${formatMoney(valorFalta)}', '${vrDesconto}', '${vtDesconto}', '${formatMoney(totalDesc)}', ${escuro.id}, 'pendente')`
              );
              existingAdjKeys.add(dedupKeyFalta);
            }

            divergenciasList.push({
              employeeId: escuro.employeeId,
              employeeName: empNome,
              funcao: empFuncao,
              empStatus,
              codigoInterno: empCodigo,
              obraNome: empObraNome,
              data: escuro.data,
              tipo: "falta",
              valorDesconto: totalDesc,
              escuroEntrada1: escuro.entrada1,
              escuroSaida1: escuro.saida1,
              memoria: {
                valorHora: valorHoraEmp,
                cargaHorariaDiaria: criteria.cargaHorariaDiaria,
                descontoSalarial: valorFalta,
                descontoVR: parseBRL(vrDesconto),
                descontoVT: parseBRL(vtDesconto),
                totalDesconto: totalDesc,
              },
            });
          } else if (isFimDeSemanaOuFeriado) {
            resultado = "ok";
            obs = `Batida em ${tipoDiaEscuro === 'feriado' ? 'feriado' : tipoDiaEscuro === 'domingo' ? 'domingo' : 'sábado'} — horas computadas como hora extra`;
            totalOk++;
            validadosList.push({
              employeeId: escuro.employeeId,
              employeeName: empNome,
              data: escuro.data,
              escuroEntrada1: escuro.entrada1 || '-',
              escuroSaida1: escuro.saida1 || '-',
              realEntrada1: actual.entrada1 || '-',
              realSaida1: actual.saida1 || '-',
              horasTrabalhadas: actual.horasTrabalhadas || '0:00',
              heIndicator: true,
            });
          } else {
            const entrada = parseTime(actual.entrada1);
            if (entrada !== null) {
              const empJornada = empJornadaMap.get(escuro.employeeId) ?? null;
              const jornadaEntrada = getExpectedEntrada(empJornada, escuro.data);
              const atraso = entrada - jornadaEntrada;
              // CLT Art. 58 §1º + Súmula 366 TST:
              // ≤ 10 min = OK (tolerância legal), > 10 min = desconta TOTALIDADE
              if (atraso > criteria.pontoToleranciaLegal) {
                resultado = "atraso";
                obs = `Atraso de ${minutesToHHMM(atraso)} (ultrapassou tolerância legal de ${criteria.pontoToleranciaLegal} min — CLT Art. 58 §1º / Súmula 366 TST — desconto integral)`;
                divergencias++;

                const valorHoraEmp = empValorHoraMap.get(escuro.employeeId) || 0;
                const valorMinuto = valorHoraEmp / 60;
                const valorAtraso = valorMinuto * atraso;

                const esc = (s: string) => s.replace(/'/g, "''");
                const dedupKeyAtraso = `${escuro.employeeId}|${escuro.data}|atraso`;
                if (!existingAdjKeys.has(dedupKeyAtraso)) {
                  adjustmentInserts.push(
                    `(${input.companyId}, ${escuro.employeeId}, '${esc(prevMes)}', '${esc(input.mesReferencia)}', '${esc(escuro.data)}', 'atraso', '${esc(`Atraso ${minutesToHHMM(atraso)} dia ${escuro.data} - Aferição do período no escuro de ${prevMes}`)}', '${formatMoney(valorAtraso)}', '0', '0', '${formatMoney(valorAtraso)}', ${escuro.id}, 'pendente')`
                  );
                  existingAdjKeys.add(dedupKeyAtraso);
                }

                divergenciasList.push({
                  employeeId: escuro.employeeId,
                  employeeName: empNome,
                  funcao: empFuncao,
                  empStatus,
                  codigoInterno: empCodigo,
                  obraNome: empObraNome,
                  data: escuro.data,
                  tipo: "atraso",
                  minutos: atraso,
                  valorDesconto: valorAtraso,
                  realEntrada: actual.entrada1,
                  memoria: {
                    valorHora: valorHoraEmp,
                    valorMinuto,
                    minutosAtraso: atraso,
                    toleranciaLegal: criteria.pontoToleranciaLegal,
                    entradaEsperada: minutesToHHMM(jornadaEntrada),
                    entradaReal: actual.entrada1,
                  },
                });
              } else {
                resultado = "ok";
                totalOk++;
                validadosList.push({
                  employeeId: escuro.employeeId,
                  employeeName: empNome,
                  data: escuro.data,
                  escuroEntrada1: escuro.entrada1 || '-',
                  escuroSaida1: escuro.saida1 || '-',
                  realEntrada1: actual.entrada1 || '-',
                  realSaida1: actual.saida1 || '-',
                  horasTrabalhadas: actual.horasTrabalhadas || '0:00',
                });
              }
            } else {
              resultado = "ok";
              totalOk++;
              validadosList.push({
                employeeId: escuro.employeeId,
                employeeName: empNome,
                data: escuro.data,
                escuroEntrada1: escuro.entrada1 || '-',
                escuroSaida1: escuro.saida1 || '-',
                realEntrada1: actual.entrada1 || '-',
                realSaida1: actual.saida1 || '-',
                horasTrabalhadas: actual.horasTrabalhadas || '0:00',
              });
            }
          }
        } else {
          resultado = "falta";
          obs = `Falta identificada na aferição — sem registro no DIXI para ${escuro.data}`;
          divergencias++;

          const valorHoraEmpSR = empValorHoraMap.get(escuro.employeeId) || 0;
          const valorFaltaSR = valorDiaLegal(empSalarioBaseMap.get(escuro.employeeId), valorHoraEmpSR);
          let vrDescontoSR = "0", vtDescontoSR = "0";
          if (criteria.descontoVrFalta) {
            vrDescontoSR = formatMoney(empVrDiarioMap.get(escuro.employeeId) || 0);
          }
          if (criteria.descontoVtFalta) {
            vtDescontoSR = formatMoney(empVtDiarioMap.get(escuro.employeeId) || 0);
          }
          const totalDescSR = valorFaltaSR + parseBRL(vrDescontoSR) + parseBRL(vtDescontoSR);

          const esc = (s: string) => s.replace(/'/g, "''");
          const dedupKeyFaltaSR = `${escuro.employeeId}|${escuro.data}|falta`;
          if (!existingAdjKeys.has(dedupKeyFaltaSR)) {
            adjustmentInserts.push(
              `(${input.companyId}, ${escuro.employeeId}, '${esc(prevMes)}', '${esc(input.mesReferencia)}', '${esc(escuro.data)}', 'falta', '${esc(`Falta dia ${escuro.data} — Sem registro no DIXI. Aferição do período no escuro de ${prevMes}`)}', '${formatMoney(valorFaltaSR)}', '${vrDescontoSR}', '${vtDescontoSR}', '${formatMoney(totalDescSR)}', ${escuro.id}, 'pendente')`
            );
            existingAdjKeys.add(dedupKeyFaltaSR);
          }

          divergenciasList.push({
            employeeId: escuro.employeeId,
            employeeName: empNome,
            funcao: empFuncao,
            empStatus,
            obraNome: empObraNome,
            data: escuro.data,
            tipo: "falta",
            valorDesconto: totalDescSR,
            escuroEntrada1: escuro.entrada1 || '-',
            escuroSaida1: escuro.saida1 || '-',
            memoria: {
              valorHora: valorHoraEmpSR,
              cargaHorariaDiaria: criteria.cargaHorariaDiaria,
              descontoSalarial: valorFaltaSR,
              descontoVR: parseBRL(vrDescontoSR),
              descontoVT: parseBRL(vtDescontoSR),
              totalDesconto: totalDescSR,
            },
          });
        }

        if (actual) {
          const empJornada = empJornadaMap.get(escuro.employeeId) ?? null;
          const expectedMinsAf = getExpectedMins(empJornada, escuro.data, criteria.cargaHorariaDiaria);
          const actualMinsAf = (() => {
            const str = actual.horasTrabalhadas;
            if (!str) return 0;
            const parts = str.split(":");
            return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
          })();
          const heAfMins = Math.max(0, actualMinsAf - expectedMinsAf);
          const horasExtrasAf = heAfMins > 0 ? minutesToHHMM(heAfMins) : "0:00";
          const numBatidasVal = [actual.entrada1, actual.saida1, actual.entrada2, actual.saida2, actual.entrada3, actual.saida3].filter(Boolean).length;
          timecardAferidoUpdates.push({ id: escuro.id, resultado, obs: obs || null, actual, horasExtras: horasExtrasAf, numBatidas: numBatidasVal });
        } else {
          timecardSemRegistroIds.push(escuro.id);
          timecardSemRegistroObs.push(obs);
        }
        totalAferidos++;
      }

      // ===== BATCH INSERT adjustments (single query) =====
      if (adjustmentInserts.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < adjustmentInserts.length; i += batchSize) {
          const batch = adjustmentInserts.slice(i, i + batchSize);
          await db.execute(sql.raw(
            `INSERT INTO payroll_adjustments ("companyId", "employeeId", "mesOrigem", "mesDesconto", data, tipo, descricao, "valorDesconto", "valorVrDesconto", "valorVtDesconto", "valorTotal", "timecardDailyId", status) VALUES ${batch.join(',')}`
          ));
        }
      }

      // Enrich divergenciasList with adjustmentId for frontend actions
      if (divergenciasList.length > 0) {
        const adjRows = ((await db.execute(sql`
          SELECT id, "employeeId", data, tipo FROM payroll_adjustments
          WHERE "companyId" = ${input.companyId}
          AND "mesOrigem" = ${prevMes} AND "mesDesconto" = ${input.mesReferencia}
          AND tipo IN ('falta','atraso','sem_registro')
        `)) as any).rows || [];
        const adjMap = new Map<string, number>();
        for (const a of adjRows) adjMap.set(`${a.employeeId}-${normalizeDate(a.data)}-${a.tipo}`, a.id);
        for (const d of divergenciasList) {
          d.adjustmentId = adjMap.get(`${d.employeeId}-${normalizeDate(d.data)}-${d.tipo}`) || null;
        }
      }

      // ===== BATCH UPDATE timecard_daily for aferido records (parallel chunks of 10) =====
      if (timecardAferidoUpdates.length > 0) {
        const chunkSize = 10;
        for (let i = 0; i < timecardAferidoUpdates.length; i += chunkSize) {
          const chunk = timecardAferidoUpdates.slice(i, i + chunkSize);
          await Promise.all(chunk.map(u => db.execute(sql`
            UPDATE timecard_daily SET 
              "statusDia" = 'aferido', "statusAnterior" = 'escuro',
              "afericaoResultado" = ${u.resultado}, "afericaoObs" = ${u.obs},
              "afericaoEm" = NOW(),
              entrada1 = ${u.actual.entrada1 ?? null}, saida1 = ${u.actual.saida1 ?? null},
              entrada2 = ${u.actual.entrada2 ?? null}, saida2 = ${u.actual.saida2 ?? null},
              entrada3 = ${u.actual.entrada3 ?? null}, saida3 = ${u.actual.saida3 ?? null},
              "horasTrabalhadas" = ${u.actual.horasTrabalhadas || '0:00'},
              "horasExtras" = ${u.horasExtras},
              "horasNoturnas" = ${u.actual.horasNoturnas || '0:00'},
              "timeRecordId" = ${u.actual.id ?? null}, "obraId" = ${u.actual.obraId ?? null},
              "origemRegistro" = 'aferido', "numBatidas" = ${u.numBatidas},
              "isFalta" = ${u.resultado === "falta" ? 1 : 0},
              "isAtraso" = ${u.resultado === "atraso" ? 1 : 0}
            WHERE id = ${u.id}
          `)));
        }
      }

      if (timecardSemRegistroIds.length > 0) {
        await db.execute(sql.raw(`
          UPDATE timecard_daily SET 
            "statusDia" = 'pendente',
            "statusAnterior" = 'escuro',
            "afericaoResultado" = 'falta',
            "afericaoObs" = 'Falta identificada na aferição — sem registro no DIXI.',
            "afericaoEm" = NOW(),
            "isFalta" = 1,
            "isAtraso" = 0
          WHERE id IN (${timecardSemRegistroIds.join(',')})
        `));
      }

      const totalJustificados = justificadosList.length;
      const jaConfirmadosCount = jaDecididosRows.filter((a: any) => a.status === 'cancelado').length;
      const afericaoResultPayload = {
        totalAferidos, divergencias, totalOk, faltas: divergenciasList.filter((d: any) => d.tipo === 'falta').length,
        atrasos: divergenciasList.filter((d: any) => d.tipo === 'atraso').length,
        semRegistro: 0,
        totalJustificados,
        jaConfirmados: jaConfirmadosCount,
        divergenciasList, validadosList, justificadosList,
      };
      const resultJson = JSON.stringify(afericaoResultPayload);

      // Update period for all companies
      for (const cid of afericaoCompanyIds) {
        await db.execute(sql`
          UPDATE payroll_periods SET 
            "afericaoRealizada" = 1,
            "afericaoEm" = NOW(),
            "afericaoPor" = ${ctx.user.name || "Sistema"},
            "totalDivergenciasAferidas" = ${divergencias},
            "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${prevMes}
        `);
        await db.execute(sql`
          UPDATE payroll_periods SET status = 'aferida', "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
        `);
      }

      // Create alert if divergences found
      if (divergencias > 0) {
        await db.execute(sql`
          INSERT INTO payroll_alerts ("companyId", "mesReferencia", tipo, titulo, descricao, prioridade)
          VALUES (${input.companyId}, ${input.mesReferencia}, 'divergencias_aferidas',
            ${`${divergencias} divergência(s) encontrada(s) na aferição de ${prevMes}`},
            ${`Foram identificadas ${divergencias} ocorrências no período "no escuro" de ${prevMes} que gerarão descontos na folha de ${input.mesReferencia}.`},
            ${divergencias > 5 ? "alta" : "media"})
        `);
      }

      return { 
        ...afericaoResultPayload,
        message: `Aferição concluída: ${totalAferidos} dias aferidos, ${totalOk} OK, ${divergencias} divergências, ${totalJustificados} justificados`
      };
    }),

  // ============================================================
  // 3a-2. ATUALIZAR RESULTADO DA AFERIÇÃO (salvar progresso)
  // ============================================================
  atualizarAfericaoResult: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
      afericaoResult: z.any(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const cids = resolveCompanyIds(input);
      const resultJson = JSON.stringify(input.afericaoResult);
      for (const cid of cids) {
        await db.execute(sql`
          UPDATE payroll_periods SET "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
        `);
        const prevMes = getPrevMesRef(input.mesReferencia);
        await db.execute(sql`
          UPDATE payroll_periods SET "afericaoResultJson" = ${resultJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${prevMes}
        `);
      }
      return { message: "Progresso da aferição salvo com sucesso" };
    }),

  // ============================================================
  // 3b. LISTAR ALERTAS DA AFERIÇÃO (pendente_decisao)
  // ============================================================
  listarAlertasAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pa.*, e."nomeCompleto", e."funcao", e."codigoInterno"
        FROM payroll_adjustments pa
        LEFT JOIN employees e ON pa."employeeId" = e.id
        WHERE pa."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) 
        AND pa."mesDesconto" = ${input.mesReferencia}
        AND pa.status = 'pendente_decisao'
        ORDER BY e."nomeCompleto", pa.data
      `)) as any).rows || [];
      return rows || [];
    }),

  detalharDiasAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), employeeId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);
      const prevMes = getPrevMesRef(input.mesReferencia);
      const prevParsed = parseMesRef(prevMes);
      const diaCorte = criteria.diaCorte;
      const prevLastDay = new Date(prevParsed.year, prevParsed.month, 0).getDate();
      const escuroInicio = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(diaCorte + 1).padStart(2, "0")}`;
      const escuroFim = `${prevParsed.year}-${String(prevParsed.month).padStart(2, "0")}-${String(prevLastDay).padStart(2, "0")}`;

      const tcRows = ((await db.execute(sql`
        SELECT td."data", td."statusDia", td."tipoDia", td."entrada1", td."saida1", td."entrada2", td."saida2",
               td."horasTrabalhadas", td."horasExtras", td."isFalta", td."isAtraso", td."minutosAtraso",
               td."numBatidas", td."afericaoResultado", td."afericaoObs", td."obraId",
               o.nome AS "obraNome"
        FROM timecard_daily td
        LEFT JOIN obras o ON o.id = td."obraId"
        WHERE td."companyId" = ${input.companyId} AND td."employeeId" = ${input.employeeId}
          AND td."data" >= ${escuroInicio} AND td."data" <= ${escuroFim}
        ORDER BY td."data"
      `)) as any).rows || [];

      const ferRows = ((await db.execute(sql`
        SELECT data, nome, tipo FROM feriados
        WHERE ("companyId" = ${input.companyId} OR "companyId" IS NULL)
          AND ativo = 1
          AND data >= ${escuroInicio} AND data <= ${escuroFim}
      `)) as any).rows || [];
      const feriadoMap = new Map<string, string>();
      for (const f of ferRows as any[]) {
        const fk = f.data instanceof Date ? f.data.toISOString().split('T')[0] : String(f.data);
        feriadoMap.set(fk, f.nome);
      }

      const tcMap = new Map<string, any>();
      for (const r of tcRows as any[]) {
        const dk = r.data instanceof Date ? r.data.toISOString().split('T')[0] : String(r.data);
        tcMap.set(dk, r);
      }

      const dias: any[] = [];
      const start = new Date(`${escuroInicio}T12:00:00`);
      const end = new Date(`${escuroFim}T12:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const dow = d.getDay();
        const isSab = dow === 6;
        const isDom = dow === 0;
        const nomeFeriado = feriadoMap.get(dateStr) || null;
        const tc = tcMap.get(dateStr) || null;

        const tcTipoDia = tc?.tipoDia?.toLowerCase() || null;
        let classificacao = 'dia_util';
        if (tcTipoDia && ['sabado', 'domingo', 'compensado', 'feriado'].includes(tcTipoDia)) {
          classificacao = tcTipoDia === 'compensado' ? 'sabado' : tcTipoDia;
        } else {
          if (isDom) classificacao = 'domingo';
          else if (isSab) classificacao = 'sabado';
        }
        if (nomeFeriado) classificacao = 'feriado';

        dias.push({
          data: dateStr,
          diaSemana: dow,
          classificacao,
          nomeFeriado,
          temRegistro: !!tc && (tc.numBatidas > 0 || !!tc.entrada1),
          statusDia: tc?.statusDia || null,
          tipoDia: tc?.tipoDia || null,
          entrada1: tc?.entrada1 || null,
          saida1: tc?.saida1 || null,
          entrada2: tc?.entrada2 || null,
          saida2: tc?.saida2 || null,
          horasTrabalhadas: tc?.horasTrabalhadas || null,
          numBatidas: tc?.numBatidas || 0,
          isFalta: tc?.isFalta || 0,
          afericaoResultado: tc?.afericaoResultado || null,
          afericaoObs: tc?.afericaoObs || null,
          obraNome: tc?.obraNome || null,
        });
      }

      const empRow = ((await db.execute(sql`
        SELECT "nomeCompleto", "funcao", "codigoInterno", "jornadaTrabalho", "salarioBase", "valorHora"
        FROM employees WHERE id = ${input.employeeId} AND "companyId" = ${input.companyId}
      `)) as any).rows?.[0] || {};

      const salarioBase = parseFloat(empRow.salarioBase) || 0;
      const valorHora = parseFloat(empRow.valorHora) || 0;
      const jornadaObj = (() => {
        try {
          const j = empRow.jornadaTrabalho;
          if (!j) return null;
          return typeof j === 'string' ? JSON.parse(j) : j;
        } catch { return null; }
      })();
      const horasDiarias = (() => {
        if (!jornadaObj) return 8;
        const seg = jornadaObj.seg || jornadaObj.segunda;
        if (seg?.entrada && seg?.saida) {
          const [eh, em] = seg.entrada.split(':').map(Number);
          const [sh, sm] = seg.saida.split(':').map(Number);
          const [ih, im] = (seg.intervalo || '01:00').split(':').map(Number);
          return (sh * 60 + sm - eh * 60 - em - ih * 60 - im) / 60;
        }
        return 8;
      })();
      const descontoDiario = valorHora > 0 ? valorHora * horasDiarias : salarioBase / 30;

      return {
        employee: { id: input.employeeId, nome: empRow.nomeCompleto, funcao: empRow.funcao, codigo: empRow.codigoInterno, jornada: empRow.jornadaTrabalho, salarioBase },
        descontoDiario: Math.round(descontoDiario * 100) / 100,
        periodoInicio: escuroInicio,
        periodoFim: escuroFim,
        dias,
      };
    }),

  // ============================================================
  // 3c. DECIDIR ALERTA DA AFERIÇÃO (erro relógio vs falta real)
  // ============================================================
  decidirAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      decisoes: z.array(z.object({
        adjustmentId: z.number(),
        decisao: z.enum(["erro_relogio", "falta_real", "banco_horas"]),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      
      let errosRelogio = 0;
      let faltasReais = 0;
      let bancoHoras = 0;
      
      for (const dec of input.decisoes) {
        if (dec.decisao === "banco_horas") {
          const adjRows = ((await db.execute(sql`
            SELECT "employeeId", "timecardDailyId", "companyId", data, tipo, descricao FROM payroll_adjustments WHERE id = ${dec.adjustmentId}
          `)) as any).rows || [];
          const adj = adjRows[0];
          if (!adj) continue;

          const isAtraso = adj.tipo === 'atraso';
          const sufixoBH = ` [DECISÃO: Banco de Horas negativo por ${ctx.user.name || "Usuário"}]`;
          await db.execute(sql`
            UPDATE payroll_adjustments SET 
              status = 'cancelado',
              descricao = COALESCE(descricao, '') || ${sufixoBH}::text
            WHERE id = ${dec.adjustmentId} AND "companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)})
          `);

          let minutosDebito: number;
          if (isAtraso) {
            const atrasoMatch = (adj.descricao || '').match(/Atraso\s+(\d+):(\d+)/);
            if (atrasoMatch) {
              minutosDebito = parseInt(atrasoMatch[1]) * 60 + parseInt(atrasoMatch[2]);
            } else {
              const atrasoMatch2 = (adj.descricao || '').match(/(\d+)\s*min/i);
              minutosDebito = atrasoMatch2 ? parseInt(atrasoMatch2[1]) : 30;
            }
          } else {
            const empJornada = ((await db.execute(sql`
              SELECT "jornadaTrabalho" FROM employees WHERE id = ${adj.employeeId}
            `)) as any).rows?.[0]?.jornadaTrabalho || '08:48';
            const [jH, jM] = empJornada.split(':').map(Number);
            minutosDebito = (jH || 0) * 60 + (jM || 0);
          }

          await db.execute(sql`
            INSERT INTO banco_horas_saldo ("employeeId", "companyId", "saldoMinutos", "atualizadoEm")
            VALUES (${adj.employeeId}, ${adj.companyId}, ${-minutosDebito}, NOW())
            ON CONFLICT ("employeeId", "companyId")
            DO UPDATE SET "saldoMinutos" = banco_horas_saldo."saldoMinutos" + ${-minutosDebito}, "atualizadoEm" = NOW()
          `);

          const descBH = isAtraso
            ? `Atraso aferição convertido em banco de horas negativo (${minutosDebito} min) — ${adj.data ? String(adj.data).slice(0, 10) : ''}`
            : `Falta aferição convertida em banco de horas negativo — ${adj.data ? String(adj.data).slice(0, 10) : ''}`;
          await db.execute(sql`
            INSERT INTO banco_horas_lancamentos ("employeeId", "companyId", tipo, minutos, descricao, data, "criadoEm", "criadoPor", "minutosBase", "minutosAcrescimo")
            VALUES (${adj.employeeId}, ${adj.companyId}, 'debito', ${minutosDebito}, ${descBH}, ${adj.data}, NOW(), ${ctx.user.name || 'Sistema'}, ${minutosDebito}, 0)
          `);

          if (adj.timecardDailyId) {
            await db.execute(sql`
              UPDATE timecard_daily SET 
                "statusDia" = 'decidido',
                "statusAnterior" = 'decidido',
                "afericaoResultado" = 'banco_horas',
                "afericaoObs" = CONCAT(COALESCE("afericaoObs", ''), ' [Convertido em banco de horas negativo]'),
                "isFalta" = 0, "isAtraso" = 0
              WHERE id = ${adj.timecardDailyId}
            `);
          }
          bancoHoras++;
        } else if (dec.decisao === "erro_relogio") {
          const sufixo = ` [DECISÃO: Erro do relógio - mantido como trabalhado por ${ctx.user.name || "Usuário"}]`;
          await db.execute(sql`
            UPDATE payroll_adjustments SET 
              status = 'cancelado',
              descricao = COALESCE(descricao, '') || ${sufixo}::text
            WHERE id = ${dec.adjustmentId} AND "companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)})
          `);
          const adjRow = ((await db.execute(sql`
            SELECT "timecardDailyId" FROM payroll_adjustments WHERE id = ${dec.adjustmentId}
          `)) as any).rows || [];
          const tcId = (adjRow as any[])?.[0]?.timecardDailyId;
          if (tcId) {
            await db.execute(sql`
              UPDATE timecard_daily SET 
                "statusDia" = 'decidido',
                "statusAnterior" = 'decidido',
                "afericaoResultado" = 'ok',
                "afericaoObs" = CONCAT(COALESCE("afericaoObs", ''), ' [Erro do relógio - mantido como trabalhado]'),
                "isFalta" = 0, "isAtraso" = 0
              WHERE id = ${tcId}
            `);
          }
          errosRelogio++;
        } else {
          const sufixo2 = ` [DECISÃO: Falta real confirmada por ${ctx.user.name || "Usuário"}]`;
          await db.execute(sql`
            UPDATE payroll_adjustments SET 
              status = 'aplicado',
              tipo = 'falta',
              descricao = COALESCE(descricao, '') || ${sufixo2}::text
            WHERE id = ${dec.adjustmentId} AND "companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)})
          `);
          const adjRow2 = ((await db.execute(sql`
            SELECT "timecardDailyId" FROM payroll_adjustments WHERE id = ${dec.adjustmentId}
          `)) as any).rows || [];
          const tcId2 = (adjRow2 as any[])?.[0]?.timecardDailyId;
          if (tcId2) {
            await db.execute(sql`
              UPDATE timecard_daily SET 
                "statusDia" = 'decidido',
                "statusAnterior" = 'decidido',
                "afericaoResultado" = 'falta',
                "afericaoObs" = CONCAT(COALESCE("afericaoObs", ''), ' [Falta real confirmada]'),
                "isFalta" = 1
              WHERE id = ${tcId2}
            `);
          }
          faltasReais++;
        }
      }
      
      // Update cached afericaoResultJson to persist decisions
      const afericaoCids = resolveCompanyIds(input);
      for (const cid of afericaoCids) {
        const periodRows = ((await db.execute(sql`
          SELECT "afericaoResultJson" FROM payroll_periods 
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia} AND "afericaoResultJson" IS NOT NULL
        `)) as any).rows || [];
        if (periodRows.length > 0 && periodRows[0].afericaoResultJson) {
          try {
            const cached = typeof periodRows[0].afericaoResultJson === 'string' ? JSON.parse(periodRows[0].afericaoResultJson) : periodRows[0].afericaoResultJson;
            const decidedIds = new Set(input.decisoes.map(d => d.adjustmentId));
            const decisaoMap = new Map(input.decisoes.map(d => [d.adjustmentId, d.decisao]));
            if (cached.divergenciasList) {
              for (const div of cached.divergenciasList) {
                if (div.adjustmentId && decidedIds.has(div.adjustmentId)) {
                  const dec = decisaoMap.get(div.adjustmentId);
                  if (dec === 'falta_real') {
                    div.jaDecidido = true;
                    div.statusDecisao = 'pendente';
                  } else if (dec === 'erro_relogio' || dec === 'banco_horas') {
                    div.jaDecidido = true;
                    div.statusDecisao = 'cancelado';
                    if (dec === 'banco_horas') div.statusDecisao = 'banco_horas';
                  }
                }
              }
              const pendentes = cached.divergenciasList.filter((d: any) => !d.jaDecidido);
              cached.faltas = pendentes.filter((d: any) => d.tipo === 'falta').length;
              cached.atrasos = pendentes.filter((d: any) => d.tipo === 'atraso').length;
              cached.divergencias = pendentes.length;
              cached.jaConfirmados = (cached.jaConfirmados || 0) + errosRelogio + bancoHoras;
            }
            const updatedJson = JSON.stringify(cached);
            await db.execute(sql`
              UPDATE payroll_periods SET "afericaoResultJson" = ${updatedJson}
              WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
            `);
          } catch { /* ignore parse errors */ }
        }
      }

      const parts = [];
      if (faltasReais > 0) parts.push(`${faltasReais} falta(s) confirmada(s)`);
      if (errosRelogio > 0) parts.push(`${errosRelogio} erro(s) de relógio`);
      if (bancoHoras > 0) parts.push(`${bancoHoras} convertida(s) em banco de horas`);
      return {
        errosRelogio,
        faltasReais,
        bancoHoras,
        message: `Decisão registrada: ${parts.join(', ') || 'nenhuma alteração'}`,
      };
    }),

  // ============================================================
  // 4. GERAR VALE / ADIANTAMENTO
  // ============================================================
  gerarVale: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
      preservarEditados: z.boolean().optional(),
      forcarRecalculoTodos: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Garante que payroll_periods existe — sem isso o UPDATE no fim da mutation
      // afetava 0 linhas e os dados de Vale não eram persistidos.
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);

      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);

      // Get active CLT employees.
      // Rev. — INCLUI 'Aviso' (aviso prévio TRABALHADO em andamento) e 'Ferias'
      // além de 'Ativo'. O vale é um adiantamento da 1ª quinzena: quem está em
      // aviso trabalhado ou em férias CONTINUA empregado e trabalhou (no todo ou
      // em parte) o mês — a proporcionalidade de férias (feriasMesMap) e a regra
      // de bloqueio "<10 dias na quinzena" já tratam quem não trabalhou o suficiente.
      // Antes, com `= 'Ativo'` estrito, funcionários cujo status virava 'Aviso'/'Ferias'
      // no fim do mês (ex.: férias/aviso começando após o dia 15) sumiam do vale,
      // mesmo tendo trabalhado a quinzena inteira. Espelha o filtro da folha.
      const empListAtivos = await db.select({
        id: employees.id,
        companyId: employees.companyId,
        nomeCompleto: employees.nomeCompleto,
        valorHora: employees.valorHora,
        salarioBase: employees.salarioBase,
        horasMensais: employees.horasMensais,
        dataAdmissao: employees.dataAdmissao,
        tipoRemuneracao: employees.tipoRemuneracao,
        dependentesIR: employees.dependentesIR,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Aviso', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
          sql`(${employees.valorHora} IS NOT NULL AND ${employees.valorHora} != '') OR ${employees.tipoRemuneracao} = 'mensalista'`,
        )
      );

      // ── Desligados com aviso prévio: incluir funcionários que estavam trabalhando no mês ──
      // Funcionários desligados que tinham aviso prévio cujo último dia (dataFim) cai dentro do mês
      // devem receber vale proporcional aos dias efetivamente trabalhados no mês.
      const primeiroDiaMesAviso = `${year}-${String(month).padStart(2, '0')}-01`;
      const ultimoDiaMesAviso = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
      const companyIdsSqlForAviso = sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`);
      const avisoDesligadosRows = ((await db.execute(sql`
        SELECT e.id, e."companyId", e."nomeCompleto", e."valorHora", e."salarioBase", 
               e."horasMensais", e."dataAdmissao", e."tipoRemuneracao",
               COALESCE(e.dependentes_ir, 0) as "dependentesIR",
               tn."dataFim" as "avisoUltimoDia"
        FROM employees e
        INNER JOIN termination_notices tn ON tn."employeeId" = e.id AND tn."deletedAt" IS NULL
          AND tn.status NOT IN ('cancelado')
        WHERE e."companyId" IN (${companyIdsSqlForAviso})
          AND e."tipoContrato" = 'CLT'
          AND e.status = 'Desligado'
          AND e."deletedAt" IS NULL
          AND ((e."valorHora" IS NOT NULL AND e."valorHora" != '') OR e."tipoRemuneracao" = 'mensalista')
          -- Rev. 2497 — Aviso INDENIZADO: empresa paga, funcionario sai em
          -- dataInicio-1; dataFim eh so projecao legal (13o/ferias). Fora.
          AND tn.tipo NOT LIKE '%indenizado%'
          -- Rev. 2498 — Cap por dataDesligamentoEfetiva: se RH ja efetivou
          -- a saida antes do mes, nao entra (mesmo com tn.dataFim projetada
          -- la na frente). Espelha homeData.ts L601.
          AND (e."dataDesligamentoEfetiva" IS NULL
               OR e."dataDesligamentoEfetiva" >= ${primeiroDiaMesAviso}::date)
          AND tn."dataFim" >= ${primeiroDiaMesAviso}::date
          AND tn."dataInicio" <= ${ultimoDiaMesAviso}::date
      `)) as any).rows || [];

      // Map: employeeId → último dia trabalhado no mês (para cálculo proporcional)
      const avisoUltimoDiaMap = new Map<number, number>();
      const ativosIds = new Set(empListAtivos.map(e => e.id));
      const desligadosNoMes: typeof empListAtivos = [];

      for (const row of avisoDesligadosRows as any[]) {
        const empId = Number(row.id);
        if (ativosIds.has(empId)) continue;
        const ultimoDiaAviso = new Date(row.avisoUltimoDia);
        const diaNoMes = ultimoDiaAviso.getUTCDate();
        const mesAviso = ultimoDiaAviso.getUTCMonth() + 1;
        const anoAviso = ultimoDiaAviso.getUTCFullYear();
        const diasNoMesAtual = new Date(year, month, 0).getDate();
        const diasEfetivos = (anoAviso === year && mesAviso === month)
          ? diaNoMes
          : (ultimoDiaAviso >= new Date(`${ultimoDiaMesAviso}T12:00:00Z`) ? diasNoMesAtual : 0);
        if (diasEfetivos > 0) {
          avisoUltimoDiaMap.set(empId, diasEfetivos);
          desligadosNoMes.push({
            id: empId,
            companyId: Number(row.companyId),
            nomeCompleto: row.nomeCompleto,
            valorHora: row.valorHora,
            salarioBase: row.salarioBase,
            horasMensais: row.horasMensais,
            dataAdmissao: row.dataAdmissao,
            tipoRemuneracao: row.tipoRemuneracao || 'horista',
            dependentesIR: Number(row.dependentesIR) || 0,
          });
        }
      }

      const empList = [...empListAtivos, ...desligadosNoMes].sort((a: any, b: any) =>
        (a.nomeCompleto || '').localeCompare(b.nomeCompleto || '', 'pt-BR', { sensitivity: 'base' })
      );

      const excluidos = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.status} IN ('Ativo', 'Aviso', 'Ferias')`,
          sql`${employees.deletedAt} IS NULL`,
          sql`(${employees.valorHora} IS NULL OR ${employees.valorHora} = '')`,
          sql`(${employees.tipoRemuneracao} IS NULL OR ${employees.tipoRemuneracao} != 'mensalista')`,
        )
      );

      // Count faltas ONLY from day 1 to 15 of current month (not the full ponto period)
      const primeiroDiaMes = `${year}-${String(month).padStart(2, '0')}-01`;
      const dia15Mes = `${year}-${String(month).padStart(2, '0')}-15`;
      const companyIdsSql = sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`);
      const faltasRows = ((await db.execute(sql`
        SELECT "employeeId", SUM("isFalta") as "totalFaltas"
        FROM timecard_daily 
        WHERE "companyId" IN (${companyIdsSql}) 
        AND "mesCompetencia" = ${input.mesReferencia}
        AND data BETWEEN ${primeiroDiaMes}::date AND ${dia15Mes}::date
        AND "statusDia" = 'registrado'
        GROUP BY "employeeId"
      `)) as any).rows || [];
      const faltasMap = new Map<number, number>();
      for (const r of (faltasRows || [])) {
        faltasMap.set(Number(r.employeeId), Number(r.totalFaltas) || 0);
      }

      // ── Férias no mês: salário proporcional ───────────────────────────────
      // Fórmula: salário = valorHora × (horasMensais × diasTrabalhados / 30)
      //          diasTrabalhados = diasNoMes − diasDeFerias (calendário)
      // Buscar períodos de férias que se sobrepõem com o mês inteiro de referência
      const ultimoDiaMes = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
      const feriasRows = ((await db.execute(sql`
        SELECT "employeeId", "dataInicio", "dataFim"
        FROM vacation_periods
        WHERE "companyId" IN (${companyIdsSql})
          AND "deletedAt" IS NULL
          AND status IN ('em_gozo', 'concluida')
          AND "dataInicio" <= ${ultimoDiaMes}::date
          AND ("dataFim" >= ${primeiroDiaMes}::date OR "dataFim" IS NULL)
      `)) as any).rows || [];

      // Helper: conta dias de calendário entre duas datas inclusive
      function diasCalendarioEntre(start: Date, end: Date): number {
        const msPerDay = 1000 * 60 * 60 * 24;
        const diffMs = end.getTime() - start.getTime();
        return Math.round(diffMs / msPerDay) + 1;
      }

      // Helper: conta dias úteis (não-domingo) entre duas datas inclusive
      function diasUteisEntre(start: Date, end: Date): number {
        let count = 0;
        const d = new Date(start);
        d.setHours(12, 0, 0, 0);
        const endClone = new Date(end);
        endClone.setHours(12, 0, 0, 0);
        while (d <= endClone) {
          if (d.getDay() !== 0) count++;
          d.setDate(d.getDate() + 1);
        }
        return count;
      }

      const dia1 = new Date(`${primeiroDiaMes}T12:00:00Z`);
      const dia15 = new Date(`${dia15Mes}T12:00:00Z`);
      const diaFim = new Date(`${ultimoDiaMes}T12:00:00Z`);

      // feriasMesMap: employeeId → dias de calendário de férias no mês (para salário proporcional)
      // feriasQuinzenaMap: employeeId → dias úteis de férias na quinzena 1-15 (para regra de bloqueio)
      const feriasMesMap = new Map<number, number>();
      const feriasQuinzenaMap = new Map<number, number>();

      for (const row of feriasRows as any[]) {
        const empId = Number(row.employeeId);
        const vacStart = new Date(`${row.dataInicio}T12:00:00Z`);
        const vacEnd = row.dataFim ? new Date(`${row.dataFim}T12:00:00Z`) : diaFim;

        // Overlap com mês inteiro → dias de calendário (para salário proporcional)
        const mesStart = vacStart < dia1 ? dia1 : vacStart;
        const mesEnd = vacEnd > diaFim ? diaFim : vacEnd;
        if (mesStart <= mesEnd) {
          feriasMesMap.set(empId, (feriasMesMap.get(empId) || 0) + diasCalendarioEntre(mesStart, mesEnd));
        }

        // Overlap com quinzena 1-15 → dias úteis (para regra de bloqueio)
        const q15Start = vacStart < dia1 ? dia1 : vacStart;
        const q15End = vacEnd > dia15 ? dia15 : vacEnd;
        if (q15Start <= q15End) {
          feriasQuinzenaMap.set(empId, (feriasQuinzenaMap.get(empId) || 0) + diasUteisEntre(q15Start, q15End));
        }
      }

      // HE is now a SEPARATE MODULE (he_periods / horasExtras router).
      // Vale = pure advance only — no HE included here.

      // Preserve manually-rejected employees across recalc
      const rejeitadosRows = ((await db.execute(sql`
        SELECT "employeeId" FROM payroll_advances
        WHERE "companyId" IN (${companyIdsSql}) AND "mesReferencia" = ${input.mesReferencia} AND status = 'rejeitado'
      `)) as any).rows || [];
      const rejeitadosSet = new Set<number>((rejeitadosRows as any[]).map((r: any) => Number(r.employeeId)));

      // Preserve manually-approved alerts across recalc (decidirVale sets status='calculado' + motivoBloqueio LIKE '%[APROVADO%')
      const aprovadosAlertaRows = ((await db.execute(sql`
        SELECT "employeeId" FROM payroll_advances
        WHERE "companyId" IN (${companyIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
          AND status = 'calculado' AND "motivoBloqueio" LIKE '%[APROVADO%'
      `)) as any).rows || [];
      const aprovadosAlertaSet = new Set<number>((aprovadosAlertaRows as any[]).map((r: any) => Number(r.employeeId)));

      // Detect manually edited advances
      const editadosRows = ((await db.execute(sql`
        SELECT pa."employeeId", e."nomeCompleto", pa."valorTotalVale", pa."irRetidoAdiantamento",
               pa."valorLiquidoVale", pa."observacoes", pa."companyId", pa."salarioBrutoMes",
               pa."percentualAdiantamento", pa."valorAdiantamento", pa."valorHorasExtras",
               pa."horasExtrasQtd", pa.bloqueado, pa."motivoBloqueio", pa."faltasNoPeriodo",
               pa."valorHora", pa."cargaHorariaDiaria", pa."diasUteisNoMes", pa.status
        FROM payroll_advances pa
        JOIN employees e ON e.id = pa."employeeId"
        WHERE pa."companyId" IN (${companyIdsSql}) AND pa."mesReferencia" = ${input.mesReferencia}
          AND (pa."observacoes" LIKE '%[EDITADO%' OR pa."observacoes" LIKE '%LÍQUIDO EDITADO%')
      `)) as any).rows || [];

      const editadosMap = new Map<number, any>();
      const editadosNomes: string[] = [];
      for (const r of editadosRows as any[]) {
        editadosMap.set(Number(r.employeeId), r);
        editadosNomes.push(r.nomeCompleto);
      }

      // If there are edited advances and user hasn't chosen yet, return warning
      if (editadosMap.size > 0 && !input.preservarEditados && !input.forcarRecalculoTodos) {
        return {
          success: false,
          needsConfirmation: true,
          editados: editadosNomes,
          editadosCount: editadosMap.size,
          message: `${editadosMap.size} funcionário(s) com valores editados manualmente: ${editadosNomes.join(", ")}. Deseja manter os valores editados ou recalcular tudo?`,
          funcionarios: [],
          totalVale: 0,
          bloqueados: 0,
        };
      }

      const preservarEditados = input.preservarEditados === true;

      // Clear existing advances for this month (all companies)
      const allCompanyIds = resolveCompanyIds(input);
      for (const cid of allCompanyIds) {
        if (preservarEditados && editadosMap.size > 0) {
          const editadosIds = [...editadosMap.keys()];
          await db.execute(sql`
            DELETE FROM payroll_advances
            WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
              AND "employeeId" NOT IN (${sql.join(editadosIds.map(id => sql`${id}`), sql`,`)})
          `);
        } else {
          await db.execute(sql`
            DELETE FROM payroll_advances WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
          `);
        }
      }

      const results: any[] = [];
      let totalVale = 0;
      let bloqueados = 0;
      const dataPrevista = `${year}-${String(month).padStart(2, "0")}-${String(criteria.diaAdiantamento).padStart(2, "0")}`;

      // Pre-calculate all employees in memory (no DB calls in loop)
      const advanceInsertRows: any[] = [];
      const eventInsertRows: any[] = [];
      // Rev. 3293 — arredondamento p/ R$ 1 com carry-forward (vale). DELETE do ledger
      // do mês/origem ANTES de ler saldos (idempotente; não lê o próprio vale(M) atual).
      const ledgerInsertRows: any[] = [];
      const ordemVale = ordemArredondamento(input.mesReferencia, "vale");
      for (const cid of allCompanyIds) {
        await db.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'vale'`);
      }
      const saldosArred = await carregarSaldosArredondamento(db, allCompanyIds);

      // Dias úteis na primeira quinzena (1–15) — exclui domingos (construção civil trabalha sábado)
      let diasUteisFirstHalf = 0;
      for (let d = 1; d <= 15; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (dow !== 0) diasUteisFirstHalf++;
      }

      // Dias reais do mês (28, 29, 30 ou 31) para cálculo proporcional do horista
      const diasNoMes = new Date(year, month, 0).getDate();

      for (const emp of empList) {
        // Skip employees with preserved manual edits
        if (preservarEditados && editadosMap.has(emp.id)) {
          const ed = editadosMap.get(emp.id)!;
          const edBruto = parseFloat(ed.valorTotalVale) || 0;
          const edLiq = parseFloat(ed.valorLiquidoVale) || 0;
          const edIR = parseFloat(ed.irRetidoAdiantamento) || 0;
          totalVale += edLiq;
          results.push({
            employeeId: emp.id, nome: emp.nomeCompleto,
            valorHora: parseBRL(emp.valorHora), salarioBruto: parseFloat(ed.salarioBrutoMes) || 0,
            valorAdiantamento: edBruto, valorHE: 0, valorTotalVale: edBruto,
            irRetido: edIR, valorLiquido: edLiq,
            isMensalista: emp.tipoRemuneracao === 'mensalista',
            temAlerta: false, bloqueado: false, faltas: 0, minutosHE: 0,
            status: ed.status || 'calculado', editadoManualmente: true,
          });
          continue;
        }

        const valorHora = parseBRL(emp.valorHora);
        const horasMensaisBase = emp.horasMensais ? Number(emp.horasMensais) : 220;
        const percentual = criteria.percentualAdiantamento;
        const faltas = faltasMap.get(emp.id) || 0;
        const minutosHE = 0;
        const valorHE = 0;
        const isMensalista = (emp.tipoRemuneracao === 'mensalista');

        // ── Salário proporcional: férias + aviso prévio (desligados) + admissão no mês ──
        const diasFeriasNoMes = feriasMesMap.get(emp.id) || 0;
        const avisoUltimoDia = avisoUltimoDiaMap.get(emp.id);
        const diasAusentesAviso = avisoUltimoDia ? Math.max(0, diasNoMes - avisoUltimoDia) : 0;

        // Rev. 2178 — Admissão no meio do mês: dias ANTES da admissão contam como ausentes.
        // Sem isso, horista virava `valorHora * (horasMensaisBase * diasNoMes / 30)` (integral)
        // e mensalista permanecia no `salBase` puro — o adiantamento saía sobre o mês cheio
        // mesmo quando o colaborador só trabalhou parte do mês. Caso reportado por Lilian:
        // Fabio Kelly admitido 04/05/2026, vale puxava R$ 904,79 (40% sobre 2.262 = mês cheio)
        // quando deveria puxar proporcional aos 28 dias efetivamente trabalhados.
        let diasAntesAdmissao = 0;
        if (emp.dataAdmissao) {
          const admDate = new Date(emp.dataAdmissao + "T12:00:00Z");
          if (admDate.getUTCFullYear() === year && admDate.getUTCMonth() + 1 === month) {
            diasAntesAdmissao = Math.max(0, admDate.getUTCDate() - 1);
          }
        }

        const diasTrabalhados = Math.max(0, diasNoMes - diasFeriasNoMes - diasAusentesAviso - diasAntesAdmissao);
        const temProporcional = diasFeriasNoMes > 0 || diasAusentesAviso > 0 || diasAntesAdmissao > 0;

        let salarioBruto: number;
        let salarioMensalCompleto: number;

        if (isMensalista) {
          const salBase = parseBRL(emp.salarioBase);
          salarioMensalCompleto = salBase;
          if (temProporcional) {
            salarioBruto = salBase * (diasTrabalhados / diasNoMes);
          } else {
            salarioBruto = salBase;
          }
        } else {
          salarioBruto = valorHora * (horasMensaisBase * diasTrabalhados / 30);
          salarioMensalCompleto = valorHora * (horasMensaisBase * diasNoMes / 30);
        }

        const valorAdiantamento = salarioBruto * (percentual / 100);

        const numDependentes = Number(emp.dependentesIR) || 0;
        const salarioProjetado = salarioMensalCompleto;
        const inssProjetado = calcularINSS(salarioProjetado);
        const baseIR = salarioProjetado - inssProjetado - (numDependentes * VALOR_DEPENDENTE_IR);
        const irrfMensal = calcularIRRF(baseIR, salarioProjetado, false);
        const irAdiantamento = irrfMensal > 0 ? Math.round(Math.min(irrfMensal, valorAdiantamento) * 100) / 100 : 0;
        const valorTotalVale = valorAdiantamento;
        const valorLiquidoVale = valorTotalVale - irAdiantamento;

        // Para regra de bloqueio: férias úteis na quinzena 1-15
        const diasFeriasQuinzena = feriasQuinzenaMap.get(emp.id) || 0;
        const diasTrabalhadosNaQuinzena = Math.max(0, diasUteisFirstHalf - faltas - diasFeriasQuinzena);

        // ── Regras de bloqueio ────────────────────────────────────────────
        const motivosBloqueio: string[] = [];
        const isDesligadoAviso = avisoUltimoDiaMap.has(emp.id);

        // 0) Desligado em aviso prévio — alerta informativo (vale proporcional)
        if (isDesligadoAviso) {
          motivosBloqueio.push(`Desligado em aviso prévio — vale proporcional (${diasTrabalhados}/${diasNoMes} dias trabalhados no mês)`);
        }

        // 1) Menos de 10 dias trabalhados por faltas + férias na quinzena
        if (diasTrabalhadosNaQuinzena < 10) {
          const detalhes = [
            faltas > 0 ? `${faltas} falta(s)` : null,
            diasFeriasQuinzena > 0 ? `${diasFeriasQuinzena} dia(s) de férias` : null,
            isDesligadoAviso ? `aviso prévio até dia ${avisoUltimoDia}` : null,
          ].filter(Boolean).join(", ");
          motivosBloqueio.push(`Menos de 10 dias trabalhados na quinzena (${diasTrabalhadosNaQuinzena} dias${detalhes ? ` — ${detalhes}` : ""})`);
        }

        // 2) Admitido no mês de referência (menos de 10 dias disponíveis)
        //    Rev. 2178 — também informa que o vale já saiu proporcional aos dias trabalhados.
        if (diasAntesAdmissao > 0) {
          motivosBloqueio.push(
            `Admitido no mês de referência (${emp.dataAdmissao}) — vale proporcional a ${diasTrabalhados}/${diasNoMes} dias trabalhados`
          );
        }

        const bloqueado = motivosBloqueio.length > 0;
        // Se o RH já aprovou manualmente este alerta em uma decisão anterior, ignorar o bloqueio
        const foiAprovadoManualmente = aprovadosAlertaSet.has(emp.id);
        const motivoBloqueio = foiAprovadoManualmente
          ? motivosBloqueio.join(" | ") + " [APROVADO MANUALMENTE]"
          : motivosBloqueio.join(" | ");

        const isRejeitadoPrev = rejeitadosSet.has(emp.id);
        if (bloqueado && !foiAprovadoManualmente && !isRejeitadoPrev) {
          bloqueados++;
          const alertaTipo = motivosBloqueio.length > 1 ? "multiplo"
            : isDesligadoAviso ? "aviso_previo_proporcional"
            : diasFeriasNoMes > 0 ? "ferias_proporcional"
            : faltas > 0 ? "faltas_excessivas"
            : "admissao_recente";
          advanceInsertRows.push(sql`(${emp.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatMoney(salarioBruto)}, ${percentual},
            ${formatMoney(valorAdiantamento)}, ${formatMoney(valorHE)}, ${minutesToHHMM(minutosHE)}, ${formatMoney(valorTotalVale)},
            ${formatMoney(irAdiantamento)}, ${formatMoney(valorLiquidoVale)},
            ${formatMoney(0)}, ${formatMoney(valorLiquidoVale)},
            ${1}, ${motivoBloqueio},
            ${faltas}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis}, ${'alerta'})`);
          results.push({
            employeeId: emp.id, nome: emp.nomeCompleto, valorHora, salarioBruto,
            valorAdiantamento, valorHE, valorTotalVale,
            irRetido: irAdiantamento, valorLiquido: valorLiquidoVale,
            isMensalista,
            temAlerta: true, alertaTipo, alertaMotivo: motivoBloqueio,
            bloqueado: true, faltas, minutosHE, status: 'alerta',
          });
          continue;
        }

        // Aprovado automaticamente, aprovado manualmente ou previously rejeitado
        const savedMotivo = foiAprovadoManualmente ? motivoBloqueio : null;
        // Rev. 3293 — arredondamento p/ R$ 1 com carry-forward (só no path disbursado;
        // rejeitado não paga nem arredonda). valorLiquidoVale gravado = valor PAGO.
        let valorPagoVale = valorLiquidoVale;
        let ajusteVale = 0;
        let saldoAntVale = 0;
        let residualVale = 0;
        if (!isRejeitadoPrev) {
          saldoAntVale = saldoAnteriorArred(saldosArred, emp.companyId, emp.id, ordemVale);
          const arr = aplicarArredondamentoReal(valorLiquidoVale, saldoAntVale);
          valorPagoVale = arr.valorPago; ajusteVale = arr.ajuste; residualVale = arr.residual;
          ledgerInsertRows.push(sql`(${emp.companyId}, ${emp.id}, 'vale', ${input.mesReferencia}, ${ordemVale},
            ${formatMoney(valorLiquidoVale)}, ${formatMoney(saldoAntVale)}, ${formatMoney(ajusteVale)}, ${formatMoney(valorPagoVale)}, ${formatMoney(residualVale)})`);
        }
        advanceInsertRows.push(sql`(${emp.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatMoney(salarioBruto)}, ${percentual},
          ${formatMoney(valorAdiantamento)}, ${formatMoney(valorHE)}, ${minutesToHHMM(minutosHE)}, ${formatMoney(valorTotalVale)},
          ${formatMoney(irAdiantamento)}, ${formatMoney(valorPagoVale)},
          ${formatMoney(ajusteVale)}, ${formatMoney(valorLiquidoVale)},
          ${0}, ${savedMotivo},
          ${faltas}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis}, ${'calculado'})`);

        if (!isRejeitadoPrev) {
          eventInsertRows.push(sql`(${emp.companyId}, 'saida_vale', 'folha_pagamento', ${input.mesReferencia}, ${dataPrevista},
            ${formatMoney(valorPagoVale)}, 'consolidado', ${emp.id}, ${emp.nomeCompleto},
            ${`Vale ${input.mesReferencia} - ${emp.nomeCompleto}`}, 'payroll_advance', ${ctx.user.name || "Sistema"})`);
          totalVale += valorPagoVale;
        }

        const temAlertaFerias = !foiAprovadoManualmente && !isRejeitadoPrev && diasFeriasNoMes > 0;
        const temAlertaAviso = !foiAprovadoManualmente && !isRejeitadoPrev && isDesligadoAviso;
        const temAlertaInfo = temAlertaFerias || temAlertaAviso;
        const alertaMotivoList: string[] = [];
        if (temAlertaAviso) alertaMotivoList.push(`Desligado em aviso prévio — vale proporcional (${diasTrabalhados}/${diasNoMes} dias trabalhados)`);
        if (temAlertaFerias) alertaMotivoList.push(`Férias no mês: ${diasFeriasNoMes} dia(s) — salário proporcional (${diasTrabalhados}/${diasNoMes} dias trabalhados)`);
        const alertaTipoFinal = temAlertaAviso ? "aviso_previo_proporcional" : temAlertaFerias ? "ferias_proporcional" : "";
        results.push({
          employeeId: emp.id, nome: emp.nomeCompleto, valorHora, salarioBruto,
          valorAdiantamento, valorHE, valorTotalVale,
          irRetido: irAdiantamento, valorLiquido: valorPagoVale,
          valorLiquidoExato: valorLiquidoVale, ajusteArredondamento: ajusteVale, saldoAnteriorArredondamento: saldoAntVale,
          isMensalista,
          temAlerta: temAlertaInfo, alertaTipo: alertaTipoFinal,
          alertaMotivo: alertaMotivoList.join(" | "),
          bloqueado: false, faltas, minutosHE, status: isRejeitadoPrev ? 'rejeitado' : 'calculado',
        });
      }

      // Batch INSERT all advances in one query
      if (advanceInsertRows.length > 0) {
        await db.execute(sql`
          INSERT INTO payroll_advances ("companyId", "employeeId", "mesReferencia", "salarioBrutoMes", "percentualAdiantamento",
            "valorAdiantamento", "valorHorasExtras", "horasExtrasQtd", "valorTotalVale",
            "irRetidoAdiantamento", "valorLiquidoVale",
            "ajusteArredondamento", "valorLiquidoExato",
            "bloqueado", "motivoBloqueio",
            "faltasNoPeriodo", "valorHora", "cargaHorariaDiaria", "diasUteisNoMes", status)
          VALUES ${sql.join(advanceInsertRows, sql`,`)}
        `);
      }

      // Re-apply 'rejeitado' status to previously-rejected employees
      for (const empId of rejeitadosSet) {
        await db.execute(sql`
          UPDATE payroll_advances SET status = 'rejeitado'
          WHERE "mesReferencia" = ${input.mesReferencia}
            AND "employeeId" = ${empId}
        `);
      }

      // Batch INSERT all financial events in one query
      if (eventInsertRows.length > 0) {
        // Also delete existing financial events for this vale (avoid duplicates on recalc)
        for (const cid of allCompanyIds) {
          await db.execute(sql`DELETE FROM financial_events WHERE "companyId" = ${cid} AND "mesCompetencia" = ${input.mesReferencia} AND "origemTipo" = 'payroll_advance'`);
        }
        await db.execute(sql`
          INSERT INTO financial_events ("companyId", tipo, categoria, "mesCompetencia", "dataPrevista", valor, status, "employeeId", "employeeName", descricao, "origemTipo", "criadoPor")
          VALUES ${sql.join(eventInsertRows, sql`,`)}
        `);
      }

      // Rev. 3293 — grava o ledger de arredondamento do vale (carry-forward auditável).
      if (ledgerInsertRows.length > 0) {
        await db.execute(sql`
          INSERT INTO payroll_rounding_ledger ("companyId", "employeeId", "origem", "mesReferencia", "ordem",
            "valorExato", "saldoAnterior", "ajusteAplicado", "valorPago", "residualGerado")
          VALUES ${sql.join(ledgerInsertRows, sql`,`)}
        `);
      }

      const valeResultPayload = {
        totalFuncionarios: empList.length,
        totalAlertas: bloqueados,
        totalVale,
        diasUteis,
        percentual: criteria.percentualAdiantamento,
        funcionarios: results,
        excluidos: excluidos.map(e => ({ id: e.id, nome: e.nomeCompleto })),
        message: bloqueados > 0 
          ? `Vale calculado: ${empList.length} funcionários, ${bloqueados} com alerta (decisão pendente), total R$ ${formatMoney(totalVale)}`
          : `Vale calculado: ${empList.length} funcionários, total R$ ${formatMoney(totalVale)}`,
      };
      const valeJson = JSON.stringify(valeResultPayload);

      // Update period for all companies
      for (const cid of allCompanyIds) {
        const companyVale = advanceInsertRows.length > 0 ? totalVale : 0;
        await db.execute(sql`
          UPDATE payroll_periods SET 
            status = 'vale_gerado',
            "valeGeradoEm" = NOW(),
            "valeGeradoPor" = ${ctx.user.name || "Sistema"},
            "totalVale" = ${formatMoney(companyVale)},
            "valeResultJson" = ${valeJson}
          WHERE "companyId" = ${cid} AND "mesReferencia" = ${input.mesReferencia}
        `);
      }

      return valeResultPayload;
      } catch (err: any) {
        console.error('[gerarVale] Erro:', err?.message || err, err?.stack);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Erro ao calcular vale: ${err?.message || 'erro desconhecido'}` });
      }
    }),

  // ============================================================
  // 4b. CONTAS BANCÁRIAS DA FOLHA (mapa employeeId → conta-empresa)
  // ============================================================
  // Rev. 3317 — O snapshot do Vale (`valeResultJson`) NÃO carrega os campos
  // de conta-empresa (só `simularPagamento` enriquece os funcionários com eles).
  // Para a view "Por Banco" do Vale funcionar inclusive sobre snapshots ANTIGOS
  // sem precisar regerar o vale, o front faz um JOIN client-side com este mapa
  // leve (employeeId → conta-empresa para pagamento + dados PIX/CPF).
  contasBancariasFolha: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Tenant guard: intersecta as empresas pedidas com as acessíveis do usuário
      // (getCompaniesForUser retorna TODAS p/ admin/admin_master). Sem isto,
      // resolveCompanyIds confiaria cegamente no companyId/companyIds do cliente.
      const permitidas = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      const permitidasIds = new Set((permitidas || []).map((c: any) => Number(c.id)));
      const allowed = resolveCompanyIds(input).filter(id => permitidasIds.has(Number(id)));
      if (allowed.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso às empresas solicitadas" });
      }

      const emps = await db.select({
        id: employees.id,
        cpf: employees.cpf,
        contaEmpresaId: employees.contaBancariaEmpresaId,
        tipoChavePix: employees.tipoChavePix,
        chavePix: employees.chavePix,
      }).from(employees).where(
        and(
          inArray(employees.companyId, allowed),
          isNull(employees.deletedAt),
        )
      );

      const contas = await db.select().from(companyBankAccounts)
        .where(and(
          inArray(companyBankAccounts.companyId, allowed),
          isNull(companyBankAccounts.deletedAt),
        ));
      const contaMap = new Map(contas.map((c: any) => [c.id, c]));

      return emps.map((e: any) => {
        const ce: any = e.contaEmpresaId ? contaMap.get(e.contaEmpresaId) : null;
        return {
          employeeId: e.id,
          cpf: e.cpf || null,
          tipoChavePix: e.tipoChavePix || null,
          chavePix: e.chavePix || null,
          contaEmpresaId: e.contaEmpresaId || null,
          contaEmpresaBanco: ce?.banco || null,
          contaEmpresaCodigoBanco: ce?.codigoBanco || null,
          contaEmpresaAgencia: ce?.agencia || null,
          contaEmpresaConta: ce?.conta || null,
          contaEmpresaTipo: ce?.tipoConta || null,
          contaEmpresaApelido: ce?.apelido || null,
        };
      });
    }),

  // ============================================================
  // 5. LISTAR VALES DO MÊS
  // ============================================================
  listarVales: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pa.*, e."nomeCompleto", e.funcao, e."codigoInterno"
        FROM payroll_advances pa
        LEFT JOIN employees e ON pa."employeeId" = e.id
        WHERE pa."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pa."mesReferencia" = ${input.mesReferencia}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 5b. DECIDIR VALE (usuário aprova ou rejeita para funcionários com alerta)
  // ============================================================
  decidirVale: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      decisoes: z.array(z.object({
        employeeId: z.number(),
        pagar: z.boolean(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { year, month } = parseMesRef(input.mesReferencia);
      const criteria = await getPayrollCriteria(db, input.companyId);
      const dataPrevista = `${year}-${String(month).padStart(2, "0")}-${String(criteria.diaAdiantamento).padStart(2, "0")}`;
      // Rev. 3293 — arredondamento p/ R$ 1 com carry-forward ao aprovar vale bloqueado.
      const ordemValeDec = ordemArredondamento(input.mesReferencia, "vale");
      const saldosArredDec = await carregarSaldosArredondamento(db, [input.companyId]);

      let aprovados = 0;
      let rejeitados = 0;

      // Rev. 3292 — guarda dura: quem hoje é PJ/Sócio/excluído NUNCA recebe vale,
      // mesmo que a decisão peça "pagar" (snapshot velho de quando era CLT).
      const inelegivelVale = await getIdsInelegiveisVale(db, input.decisoes.map((d) => d.employeeId), input.mesReferencia);

      for (const decisao of input.decisoes) {
        if (decisao.pagar && inelegivelVale.has(decisao.employeeId)) {
          await db.execute(sql`
            UPDATE payroll_advances SET status = 'rejeitado', bloqueado = 1,
              "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ' [BLOQUEADO: inelegível ao vale (PJ/Sócio/excluído ou desligado antes do mês)]'
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
          `);
          rejeitados++;
          continue;
        }
        if (decisao.pagar) {
          // Aprovar: mudar status para 'calculado', bloqueado = 0
          const aprovadoPorNome = ctx.user.name || "Usuário";
          await db.execute(sql`
            UPDATE payroll_advances SET status = 'calculado', bloqueado = 0,
              "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ${` [APROVADO por ${aprovadoPorNome}]`}
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
          `);
          // Create financial event for approved
          const advRows = ((await db.execute(sql`
            SELECT "valorTotalVale", "valorLiquidoVale", "valorLiquidoExato" FROM payroll_advances 
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
          `)) as any).rows || [];
          const adv = (advRows as any[])?.[0];
          if (adv) {
            // Rev. 3293 — arredonda o líquido EXATO p/ R$ 1 com carry-forward (disbursement
            // do vale bloqueado). Grava pago em valorLiquidoVale + ledger + financial_event.
            const valorExatoVale = parseBRL(adv.valorLiquidoExato ?? adv.valorLiquidoVale ?? adv.valorTotalVale);
            const saldoAntDec = saldoAnteriorArred(saldosArredDec, input.companyId, decisao.employeeId, ordemValeDec);
            const arrDec = aplicarArredondamentoReal(valorExatoVale, saldoAntDec);
            await db.execute(sql`
              UPDATE payroll_advances SET "valorLiquidoVale" = ${formatMoney(arrDec.valorPago)},
                "ajusteArredondamento" = ${formatMoney(arrDec.ajuste)}, "valorLiquidoExato" = ${formatMoney(valorExatoVale)}
              WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
            `);
            await db.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "employeeId" = ${decisao.employeeId} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'vale'`);
            await db.execute(sql`
              INSERT INTO payroll_rounding_ledger ("companyId", "employeeId", "origem", "mesReferencia", "ordem",
                "valorExato", "saldoAnterior", "ajusteAplicado", "valorPago", "residualGerado")
              VALUES (${input.companyId}, ${decisao.employeeId}, 'vale', ${input.mesReferencia}, ${ordemValeDec},
                ${formatMoney(valorExatoVale)}, ${formatMoney(saldoAntDec)}, ${formatMoney(arrDec.ajuste)}, ${formatMoney(arrDec.valorPago)}, ${formatMoney(arrDec.residual)})
            `);
            const empRows = ((await db.execute(sql`SELECT "nomeCompleto" FROM employees WHERE id = ${decisao.employeeId}`)) as any).rows || [];
            const empName = (empRows as any[])?.[0]?.nomeCompleto || 'Funcionário';
            // Rev. 3293 — idempotência: remove evento de vale anterior deste funcionário
            // antes de reinserir, p/ re-aprovação não duplicar a saída financeira.
            await db.execute(sql`DELETE FROM financial_events WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId} AND "origemTipo" = 'payroll_advance' AND tipo = 'saida_vale'`);
            await db.execute(sql`
              INSERT INTO financial_events ("companyId", tipo, categoria, "mesCompetencia", "dataPrevista", valor, status, "employeeId", "employeeName", descricao, "origemTipo", "criadoPor")
              VALUES (${input.companyId}, 'saida_vale', 'folha_pagamento', ${input.mesReferencia}, ${dataPrevista}, ${formatMoney(arrDec.valorPago)}, 'consolidado', ${decisao.employeeId}, ${empName}, ${`Vale ${input.mesReferencia} - ${empName} (aprovado manualmente)`}, 'payroll_advance', ${ctx.user.name || "Sistema"})
            `);
          }
          aprovados++;
        } else {
          // Rejeitar: mudar status para 'rejeitado', manter bloqueado = 1
          const rejeitadoPorNome = ctx.user.name || "Usuário";
          await db.execute(sql`
            UPDATE payroll_advances SET status = 'rejeitado',
              "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ${` [REJEITADO por ${rejeitadoPorNome}]`}
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${decisao.employeeId}
          `);
          rejeitados++;
        }
      }

      // Rev. 3313 — persiste a decisão (aprovar/rejeitar) no snapshot valeResultJson.
      // Sem isto, decidirVale só atualizava payroll_advances; como o card/Folha LÊ o
      // snapshot, a exclusão "voltava" como 'calculado' no próximo reload (getPeriod).
      // Espelha o que reverterVale já faz.
      await sincronizarValeJson(db, input.companyId, input.mesReferencia);

      return {
        aprovados,
        rejeitados,
        message: `Decisão registrada: ${aprovados} aprovados, ${rejeitados} rejeitados`,
      };
    }),

  reverterVale: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string(), employeeId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      // Rev. 3292 — guarda dura: reverter NUNCA pode promover vale a quem hoje é
      // PJ/Sócio/excluído (caminho alternativo ao decidirVale para 'calculado'+evento).
      const inelegivelRev = await getIdsInelegiveisVale(db, [input.employeeId], input.mesReferencia);
      if (inelegivelRev.has(input.employeeId)) {
        await db.execute(sql`
          UPDATE payroll_advances SET status = 'rejeitado', bloqueado = 1,
            "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ' [BLOQUEADO: inelegível ao vale (PJ/Sócio/excluído ou desligado antes do mês)]'
          WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
        `);
        return { message: "Funcionário inelegível ao vale (PJ/Sócio/excluído ou desligado antes do mês) — não pode ser revertido." };
      }
      const revertidoPorNome = ctx.user.name || "Usuário";
      await db.execute(sql`
        UPDATE payroll_advances SET status = 'calculado', bloqueado = 0,
          "motivoBloqueio" = COALESCE("motivoBloqueio", '') || ${` [REVERTIDO por ${revertidoPorNome}]`}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
      `);
      // Re-add financial event for this employee
      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const dataPrevista = `${year}-${String(month).padStart(2, "0")}-${String(criteria.diaAdiantamento).padStart(2, "0")}`;
      const advRows = ((await db.execute(sql`
        SELECT "valorTotalVale", "valorLiquidoVale" FROM payroll_advances
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
      `)) as any).rows || [];
      const adv = (advRows as any[])?.[0];
      if (adv) {
        const valorFinanceiro = adv.valorLiquidoVale ?? adv.valorTotalVale;
        const empRows = ((await db.execute(sql`SELECT "nomeCompleto" FROM employees WHERE id = ${input.employeeId}`)) as any).rows || [];
        const empName = (empRows as any[])?.[0]?.nomeCompleto || 'Funcionário';
        await db.execute(sql`
          INSERT INTO financial_events ("companyId", tipo, categoria, "mesCompetencia", "dataPrevista", valor, status, "employeeId", "employeeName", descricao, "origemTipo", "criadoPor")
          VALUES (${input.companyId}, 'saida_vale', 'folha_pagamento', ${input.mesReferencia}, ${dataPrevista}, ${valorFinanceiro}, 'consolidado', ${input.employeeId}, ${empName}, ${`Vale ${input.mesReferencia} - ${empName} (revertido)`}, 'payroll_advance', ${ctx.user.name || "Sistema"})
        `);
      }
      return { message: "Vale revertido com sucesso" };
    }),

  // Rev. 3984 — decisão "pagar ou não?" para funcionários cujo aviso prévio
  // ENCERRA dentro do mês de referência (espelha decidirVale). Grava em tabela
  // dedicada (payroll_folha_decisoes) porque payroll_payments é regenerada a
  // cada simulação; a decisão é reaplicada automaticamente na próxima chamada
  // de simularPagamento.
  decidirFolhaAviso: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
      decisoes: z.array(z.object({
        employeeId: z.number(),
        pagar: z.boolean(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const decididoPorNome = ctx.user.name || "Usuário";
      let aprovados = 0;
      let rejeitados = 0;
      for (const decisao of input.decisoes) {
        const decisaoStr = decisao.pagar ? 'pagar' : 'nao_pagar';
        await db.execute(sql`
          INSERT INTO payroll_folha_decisoes ("companyId", "employeeId", "mesReferencia", decisao, motivo, "decididoPor")
          VALUES (${input.companyId}, ${decisao.employeeId}, ${input.mesReferencia}, ${decisaoStr}, 'aviso_encerrado_no_mes', ${decididoPorNome})
        `);
        if (decisao.pagar) aprovados++; else rejeitados++;
      }
      return {
        aprovados,
        rejeitados,
        message: `Decisão registrada: ${aprovados} liberado(s) para pagamento, ${rejeitados} excluído(s) da folha. Rode a simulação novamente para atualizar os totais.`,
      };
    }),

  editarValorVale: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      employeeId: z.number(),
      novoValor: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas usuários Master podem editar valores de vale." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const valorNum = parseFloat(input.novoValor.replace(/[^\d.,]/g, "").replace(",", "."));
      if (isNaN(valorNum) || valorNum < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Valor inválido." });
      }
      const valorFormatado = valorNum.toFixed(2);

      const oldRows = ((await db.execute(sql`
        SELECT "valorTotalVale", "valorAdiantamento", "irRetidoAdiantamento", "valorLiquidoVale",
               "salarioBrutoMes", "percentualAdiantamento"
        FROM payroll_advances
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
      `)) as any).rows || [];
      if (oldRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro de vale não encontrado." });
      }
      const row = oldRows[0];
      const valorAnterior = row.valorTotalVale;
      const liquidoAnterior = row.valorLiquidoVale;
      const editadoPor = ctx.user.name || "Master";
      const obs = `[EDITADO por ${editadoPor}: Bruto R$ ${valorAnterior} → R$ ${valorFormatado}, Líq R$ ${liquidoAnterior} → R$ ${valorFormatado}, IR zerado${input.motivo ? ` | Motivo: ${input.motivo}` : ""}]`;

      await db.execute(sql`
        UPDATE payroll_advances
        SET "valorTotalVale" = ${valorFormatado},
            "valorAdiantamento" = ${valorFormatado},
            "irRetidoAdiantamento" = ${"0.00"},
            "valorLiquidoVale" = ${valorFormatado},
            "ajusteArredondamento" = ${"0.00"},
            "valorLiquidoExato" = ${valorFormatado},
            "observacoes" = COALESCE("observacoes", '') || ${' ' + obs},
            "updatedAt" = NOW()
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
      `);

      // Rev. 3293 — override manual do master substitui o arredondamento automático;
      // remove a linha 'vale' do ledger p/ não corromper o carry-forward dos próximos
      // eventos (o valor forçado pelo master vira o pago final, sem residual).
      await db.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "employeeId" = ${input.employeeId} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'vale'`);

      await db.execute(sql`
        UPDATE financial_events
        SET valor = ${valorFormatado},
            descricao = descricao || ${` (bruto editado: ${valorAnterior} → ${valorFormatado})`}
        WHERE "companyId" = ${input.companyId}
          AND "mesCompetencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
          AND "origemTipo" = 'payroll_advance'
          AND tipo = 'saida_vale'
      `);

      await sincronizarValeJson(db, input.companyId, input.mesReferencia);

      return { success: true, employeeId: input.employeeId, valorAnterior, novoValor: valorFormatado, novoIR: "0.00", novoLiquido: valorFormatado, message: `Bruto editado: R$ ${valorAnterior} → R$ ${valorFormatado} (Líquido = R$ ${valorFormatado}, IR zerado)` };
    }),

  editarLiquidoVale: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      employeeId: z.number(),
      novoLiquido: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas usuários Master podem editar valores de vale." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const liquidoNum = parseFloat(input.novoLiquido.replace(/[^\d.,]/g, "").replace(",", "."));
      if (isNaN(liquidoNum) || liquidoNum < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Valor líquido inválido." });
      }

      const oldRows = ((await db.execute(sql`
        SELECT "valorTotalVale", "valorAdiantamento", "irRetidoAdiantamento", "valorLiquidoVale"
        FROM payroll_advances
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${input.employeeId}
      `)) as any).rows || [];
      if (oldRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registro de vale não encontrado." });
      }
      const row = oldRows[0];
      const brutoAnterior = row.valorTotalVale;
      const liquidoAnterior = row.valorLiquidoVale;

      const novoBruto = liquidoNum;
      const novoIR = 0;
      const liquidoFormatado = liquidoNum.toFixed(2);
      const brutoFormatado = novoBruto.toFixed(2);
      const editadoPor = ctx.user.name || "Master";
      const obs = `[LÍQUIDO EDITADO por ${editadoPor}: Líq R$ ${liquidoAnterior} → R$ ${liquidoFormatado}, Bruto R$ ${brutoAnterior} → R$ ${brutoFormatado}, IR zerado${input.motivo ? ` | Motivo: ${input.motivo}` : ""}]`;

      await db.execute(sql`
        UPDATE payroll_advances
        SET "valorTotalVale" = ${brutoFormatado},
            "valorAdiantamento" = ${brutoFormatado},
            "irRetidoAdiantamento" = ${"0.00"},
            "valorLiquidoVale" = ${liquidoFormatado},
            "ajusteArredondamento" = ${"0.00"},
            "valorLiquidoExato" = ${liquidoFormatado},
            "observacoes" = COALESCE("observacoes", '') || ${' ' + obs},
            "updatedAt" = NOW()
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
      `);

      // Rev. 3293 — override manual do master substitui o arredondamento automático;
      // remove a linha 'vale' do ledger p/ não corromper o carry-forward dos próximos
      // eventos (o valor forçado pelo master vira o pago final, sem residual).
      await db.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "employeeId" = ${input.employeeId} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'vale'`);

      await db.execute(sql`
        UPDATE financial_events
        SET valor = ${liquidoFormatado},
            descricao = descricao || ${` (líquido editado: ${liquidoAnterior} → ${liquidoFormatado})`}
        WHERE "companyId" = ${input.companyId}
          AND "mesCompetencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
          AND "origemTipo" = 'payroll_advance'
          AND tipo = 'saida_vale'
      `);

      await sincronizarValeJson(db, input.companyId, input.mesReferencia);

      return {
        success: true, employeeId: input.employeeId,
        novoBruto: brutoFormatado,
        novoIR: "0.00",
        novoLiquido: liquidoFormatado,
        brutoAnterior,
        liquidoAnterior,
        message: `Líquido editado: R$ ${liquidoAnterior} → R$ ${liquidoFormatado} (Bruto ajustado: R$ ${brutoAnterior} → R$ ${brutoFormatado}, IR zerado)`,
      };
    }),

  // Rev. 3302 — Arredondamento em LOTE ou INDIVIDUAL do líquido (real cheio, sem
  // centavos) na Folha de Vale OU Folha de Pagamento, forçando a DIREÇÃO (cima/baixo/
  // mais próximo). O valor forçado vira o PAGO FINAL — sem carry-forward (residual 0),
  // consistente com o override manual do Master (Rev. 3293). Usado quando a contabilidade
  // arredonda diferente do automático por já ter o histórico dos arredondamentos.
  arredondarLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      origem: z.enum(['vale', 'folha']),
      modo: z.enum(['cima', 'baixo', 'normal']),
      employeeIds: z.array(z.number()).optional(), // omitido/vazio = TODOS (lote)
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas usuários Master podem arredondar valores." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const roundFn = input.modo === 'cima' ? Math.ceil : input.modo === 'baixo' ? Math.floor : Math.round;
      const modoLabel = input.modo === 'cima' ? 'p/ cima' : input.modo === 'baixo' ? 'p/ baixo' : 'p/ mais próximo';
      const editadoPor = ctx.user.name || ctx.user.email || "Master";
      const alvoSet = input.employeeIds && input.employeeIds.length ? new Set(input.employeeIds.map(Number)) : null;

      if (input.origem === 'vale') {
        // Rev. 3302 — transação única: ou TUDO (advances + ledger + financial_events
        // + snapshot do vale) ou NADA. Sem isso, falha no meio deixava parte dos vales
        // arredondados, ledger divergente do valor pago e JSON fora de sincronia.
        return await db.transaction(async (tx: any) => {
          // Revalida consolidação DENTRO da transação, travando a linha do período
          // (FOR UPDATE) p/ eliminar corrida com consolidar/desconsolidar concorrente.
          const per = ((await tx.execute(sql`
            SELECT status FROM payroll_periods
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1 FOR UPDATE
          `)) as any).rows || [];
          if (per.length && per[0].status === 'vale_consolidado') {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Vale consolidado — desconsolide para arredondar." });
          }
          const rows = ((await tx.execute(sql`
            SELECT "employeeId", "valorTotalVale", "valorLiquidoVale", "valorLiquidoExato", status
            FROM payroll_advances
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
          `)) as any).rows || [];
          let n = 0;
          for (const r of rows) {
            const eid = Number(r.employeeId);
            if (alvoSet && !alvoSet.has(eid)) continue;
            if (r.status === 'rejeitado') continue; // não paga → não arredonda
            const exatoSrc = r.valorLiquidoExato != null ? r.valorLiquidoExato : r.valorLiquidoVale;
            const exato = parseFloat(String(exatoSrc)) || 0;
            const pago = Math.max(0, roundFn(exato));
            const pagoStr = pago.toFixed(2);
            const liqAnt = parseFloat(String(r.valorLiquidoVale)) || 0;
            const obs = `[ARRED ${modoLabel} por ${editadoPor}: Líq R$ ${liqAnt.toFixed(2)} → R$ ${pagoStr} (exato R$ ${exato.toFixed(2)}), IR zerado${input.motivo ? ` | Motivo: ${input.motivo}` : ""}]`;
            await tx.execute(sql`
              UPDATE payroll_advances
              SET "valorTotalVale" = ${pagoStr},
                  "valorAdiantamento" = ${pagoStr},
                  "irRetidoAdiantamento" = ${"0.00"},
                  "valorLiquidoVale" = ${pagoStr},
                  "ajusteArredondamento" = ${"0.00"},
                  "valorLiquidoExato" = ${exato.toFixed(2)},
                  "observacoes" = COALESCE("observacoes", '') || ${' ' + obs},
                  "updatedAt" = NOW()
              WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${eid}
            `);
            // override manual = sem residual: remove a linha 'vale' do ledger (carry-forward).
            await tx.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "employeeId" = ${eid} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'vale'`);
            await tx.execute(sql`
              UPDATE financial_events
              SET valor = ${pagoStr},
                  descricao = descricao || ${` (arred ${modoLabel}: → ${pagoStr})`}
              WHERE "companyId" = ${input.companyId}
                AND "mesCompetencia" = ${input.mesReferencia}
                AND "employeeId" = ${eid}
                AND "origemTipo" = 'payroll_advance'
                AND tipo = 'saida_vale'
            `);
            n++;
          }
          await sincronizarValeJson(tx, input.companyId, input.mesReferencia);
          return { success: true, origem: 'vale', total: n, message: `${n} vale(s) arredondado(s) ${modoLabel}.` };
        });
      }

      // origem === 'folha' — também em transação única (payments + ledger + snapshot).
      return await db.transaction(async (tx: any) => {
        // Revalida consolidação DENTRO da transação, travando o período (FOR UPDATE).
        const guard = ((await tx.execute(sql`
          SELECT "pagamentoConsolidadoEm", "pagamentoResultJson"
          FROM payroll_periods
          WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1 FOR UPDATE
        `)) as any).rows || [];
        if (guard.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Período de folha não encontrado" });
        if (guard[0].pagamentoConsolidadoEm) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pagamento consolidado — desconsolide para arredondar." });
        const payload = (() => { try { return JSON.parse(guard[0].pagamentoResultJson || '{}'); } catch { return {}; } })();
        const funcionarios: any[] = payload.funcionarios || [];
        const ordemFolha = ordemArredondamento(input.mesReferencia, "folha");
        let n = 0;
        for (let i = 0; i < funcionarios.length; i++) {
          const f = funcionarios[i];
          const eid = Number(f.employeeId);
          if (alvoSet && !alvoSet.has(eid)) continue;
          const exato = Number(f.salarioLiquidoExato != null ? f.salarioLiquidoExato : f.salarioLiquido) || 0;
          const pago = Math.max(0, roundFn(exato));
          const ajuste = Math.round((pago - exato) * 100) / 100;
          funcionarios[i] = { ...f, salarioLiquido: pago, salarioLiquidoExato: exato, ajusteArredondamento: ajuste, saldoAnteriorArredondamento: 0 };
          await tx.execute(sql`
            UPDATE payroll_payments
            SET "salarioLiquido" = ${formatMoney(pago)},
                "salarioLiquidoExato" = ${formatMoney(exato)},
                "ajusteArredondamento" = ${formatMoney(ajuste)},
                "updatedAt" = NOW()
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "employeeId" = ${eid}
          `);
          // override manual = sem residual: regrava a linha 'folha' do ledger com residual 0.
          await tx.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "employeeId" = ${eid} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'folha'`);
          await tx.execute(sql`
            INSERT INTO payroll_rounding_ledger ("companyId", "employeeId", "origem", "mesReferencia", "ordem",
              "valorExato", "saldoAnterior", "ajusteAplicado", "valorPago", "residualGerado")
            VALUES (${input.companyId}, ${eid}, 'folha', ${input.mesReferencia}, ${ordemFolha},
              ${formatMoney(exato)}, ${"0.00"}, ${formatMoney(ajuste)}, ${formatMoney(pago)}, ${"0.00"})
          `);
          n++;
        }
        const grandTotalLiquido = funcionarios.reduce((s, x) => s + Number(x.salarioLiquido || 0), 0);
        payload.funcionarios = funcionarios;
        payload.totalLiquido = grandTotalLiquido;
        await tx.execute(sql`
          UPDATE payroll_periods SET
            "totalLiquido" = ${formatMoney(grandTotalLiquido)},
            "pagamentoResultJson" = ${JSON.stringify(payload)}
          WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        `);
        return { success: true, origem: 'folha', total: n, message: `${n} líquido(s) arredondado(s) ${modoLabel}.` };
      });
    }),

  // ============================================================
  // 6. SIMULAR PAGAMENTO
  // ============================================================
  simularPagamento: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
      manterOverrides: z.boolean().optional(),
      descartarOverrides: z.boolean().optional(),
      // Decisão individual: manter os ajustes manuais APENAS destes employeeIds (os demais ressimulam do zero)
      manterOverridesIds: z.array(z.number()).optional(),
      aplicarDsrFalta: z.boolean().optional(),
      // Rev. 3989 — soma o líquido das diferenças salariais retroativas do
      // dissídio (relatorioDiferencas) no líquido desta folha (contador às vezes
      // paga em 1 holerite combinado, às vezes em 2 separados — por isso togglável).
      somarDiferencaDissidio: z.boolean().optional(),
      pontoInicioManual: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      pontoFimManual: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      forcarRecalculoPonto: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Tenant guard: intersecta as empresas pedidas com as acessíveis do usuário.
      // resolveCompanyIds confia no companyId/companyIds do cliente — sem isto,
      // simularPagamento leria/escreveria folha de empresa alheia (IDOR).
      {
        const permitidasSim = await getCompaniesForUser(ctx.user.id, ctx.user.role);
        const permitidasSimIds = new Set((permitidasSim || []).map((c: any) => Number(c.id)));
        const pedidas = resolveCompanyIds(input);
        if (!pedidas.every(id => permitidasSimIds.has(Number(id)))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso às empresas solicitadas" });
        }
      }

      // Garante que payroll_periods existe — sem isso UPDATEs de simulação
      // de pagamento afetavam 0 linhas e o card ficava 0% pós-reload.
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);

      // --- GUARD: block re-simulation if pagamento is consolidated ---
      const ppPagGuard = ((await db.execute(sql`
        SELECT "pagamentoConsolidadoEm", "pontoInicio", "pontoFim" FROM payroll_periods
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      if (ppPagGuard.length > 0 && ppPagGuard[0].pagamentoConsolidadoEm) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Pagamento consolidado — desconsolide primeiro para resimular.",
        });
      }
      const storedPontoInicio = ppPagGuard[0]?.pontoInicio ? String(ppPagGuard[0].pontoInicio).slice(0, 10) : null;
      const storedPontoFim = ppPagGuard[0]?.pontoFim ? String(ppPagGuard[0].pontoFim).slice(0, 10) : null;

      const criteria = await getPayrollCriteria(db, input.companyId);
      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);
      const nextMes = getNextMesRef(input.mesReferencia);
      const nextParsed = parseMesRef(nextMes);

      // Rev. 2496 — Desligados em aviso prévio com `dataFim` dentro do mês
      // devem ENTRAR na folha mensal (espelha a lógica do `gerarVale` L2101+).
      // Antes, o filtro `status IN ('Ativo','Ferias')` excluía-os e o vale
      // gerado ficava órfão (aviso amarelo "vale calculado mas fora da folha").
      const primeiroDiaMesAviso = `${year}-${String(month).padStart(2, '0')}-01`;
      const ultimoDiaMesAviso = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

      const allCltAtivos = await db.select({
        id: employees.id,
        nomeCompleto: employees.nomeCompleto,
        valorHora: employees.valorHora,
        salarioBase: employees.salarioBase,
        tipoRemuneracao: employees.tipoRemuneracao,
        horasMensais: employees.horasMensais,
        funcao: employees.funcao,
        codigoInterno: employees.codigoInterno,
        pensaoAlimenticia: employees.pensaoAlimenticia,
        pensaoValor: employees.pensaoValor,
        pensaoTipo: employees.pensaoTipo,
        pensaoPercentual: employees.pensaoPercentual,
        pensaoBase: employees.pensaoBase,
        vtValorDiario: employees.vtValorDiario,
        seguroVida: employees.seguroVida,
        fgtsPercentual: employees.fgtsPercentual,
        inssPercentual: employees.inssPercentual,
        contribuicaoSindical: employees.contribuicaoSindical,
        dependentesIr: employees.dependentesIR,
        vaRecebe: employees.vaRecebe,
        vaValor: employees.vaValor,
        banco: employees.banco,
        bancoNome: employees.bancoNome,
        agencia: employees.agencia,
        conta: employees.conta,
        tipoConta: employees.tipoConta,
        tipoChavePix: employees.tipoChavePix,
        chavePix: employees.chavePix,
        bancoPix: employees.bancoPix,
        cpf: employees.cpf,
        status: employees.status,
        jornadaTrabalho: employees.jornadaTrabalho,
        companyId: employees.companyId,
        // Rev. 4771 — Afastamento INSS: datas da licença p/ janela dos 15 dias
        licencaDataInicio: employees.licencaDataInicio,
        licencaDataFim: employees.licencaDataFim,
        // Rev. — Conta da Empresa para Pagamento (conta salário pela qual a
        // empresa paga o colaborador). É a CHAVE de agrupamento da remessa por
        // banco — NÃO o banco pessoal do funcionário.
        contaBancariaEmpresaId: employees.contaBancariaEmpresaId,
        // Rev. 3977 — Banco de Horas: exceção bidirecional por funcionário
        bancoHorasExcecao: employees.bancoHorasExcecao,
      }).from(employees).where(
        and(
          companyFilter(employees.companyId, input),
          eq(employees.tipoContrato, "CLT"),
          sql`${employees.deletedAt} IS NULL`,
          // Rev. 2496/2497/2498 — Ativos/Férias OU Desligados com aviso
          // TRABALHADO sobrepondo o mês E que não tenham `dataDesligamento
          // Efetiva` ANTERIOR ao mês (se o RH já efetivou a saída antes do
          // período, ele não entra na folha por mais que o aviso projete em
          // diante). Aviso INDENIZADO sempre fora (dataFim só projeção).
          //
          // Rev. 3281 — INCLUI também quem está em status='Aviso' (aviso prévio
          // TRABALHADO ainda EM ANDAMENTO — ainda não virou 'Desligado'). Esses
          // colaboradores estão trabalhando o aviso e DEVEM entrar na folha do
          // mês (senão o vale gerado p/ eles — que agora inclui 'Aviso' — ficaria
          // órfão). Espelha o ramo de Desligado: EXISTS de aviso não-indenizado,
          // não-cancelado, sobrepondo o mês. `criarAvisoPrevioInterno` carimba
          // status='Aviso' para TODO tipo (inclusive indenizado), por isso o
          // EXISTS com `tipo NOT LIKE '%indenizado%'` é OBRIGATÓRIO aqui.
          sql`(
            ${employees.status} IN ('Ativo', 'Ferias')
            OR ${employees.status} = 'Afastado'
            OR (
              ${employees.status} = 'Aviso'
              AND EXISTS (
                SELECT 1 FROM termination_notices tn
                WHERE tn."employeeId" = ${employees.id}
                  AND tn."deletedAt" IS NULL
                  AND tn.status NOT IN ('cancelado')
                  AND tn.tipo NOT LIKE '%indenizado%'
                  AND tn."dataFim" >= ${primeiroDiaMesAviso}::date
                  AND tn."dataInicio" <= ${ultimoDiaMesAviso}::date
              )
            )
            OR (
              ${employees.status} = 'Desligado'
              AND (${employees.dataDesligamentoEfetiva} IS NULL
                   OR ${employees.dataDesligamentoEfetiva} >= ${primeiroDiaMesAviso}::date)
              AND EXISTS (
                SELECT 1 FROM termination_notices tn
                WHERE tn."employeeId" = ${employees.id}
                  AND tn."deletedAt" IS NULL
                  AND tn.status NOT IN ('cancelado')
                  AND tn.tipo NOT LIKE '%indenizado%'
                  AND tn."dataFim" >= ${primeiroDiaMesAviso}::date
                  AND tn."dataInicio" <= ${ultimoDiaMesAviso}::date
              )
            )
          )`,
        )
      );

      const divergencias: { employeeId: number; nome: string; funcao: string | null; motivo: string }[] = [];
      const empList = allCltAtivos.filter(emp => {
        if (!emp.valorHora || emp.valorHora === '') {
          divergencias.push({
            employeeId: emp.id,
            nome: emp.nomeCompleto,
            funcao: emp.funcao,
            motivo: `Valor hora não preenchido${!emp.salarioBase ? ' e salário base também vazio' : ' (salário base: R$ ' + emp.salarioBase + ')'}`,
          });
          return false;
        }
        return true;
      });

      // Rev. 4771 — AFASTAMENTO INSS: janela dos 15 dias por conta da empresa.
      // Fonte do início: employees.licencaDataInicio; fallback = atestado que
      // alterou o status (status_alterado=1). Fim inclusivo: licencaDataFim ??
      // (atestado.dataRetorno - 1 dia). Afastado SEM data de início conhecida
      // fica FORA da folha (fail-safe = comportamento anterior).
      const toIsoDia = (v: any): string | null => {
        if (!v) return null;
        return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
      };
      const addDias = (iso: string, n: number): string => {
        const d = new Date(iso + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
      };
      // Map empId → { ini, fimIncl (null = em aberto) }
      const afastWindowMap = new Map<number, { ini: string; fimIncl: string | null }>();
      {
        const afastCandidatos = empList.filter((e: any) => e.status === 'Afastado' || e.licencaDataInicio);
        const semInicio = afastCandidatos.filter((e: any) => e.status === 'Afastado' && !e.licencaDataInicio);
        const atestadoMap = new Map<number, { ini: string; fimIncl: string | null }>();
        if (semInicio.length > 0) {
          const idsSqlAf = sql.join(semInicio.map((e: any) => sql`${e.id}`), sql`,`);
          const atRows = ((await db.execute(sql`
            SELECT DISTINCT ON ("employeeId") "employeeId", "dataEmissao", "dataRetorno"
            FROM atestados
            WHERE "employeeId" IN (${idsSqlAf})
              AND "deletedAt" IS NULL
              AND status_alterado = 1
            ORDER BY "employeeId", "dataEmissao" DESC
          `)) as any).rows || [];
          for (const r of atRows as any[]) {
            const ini = toIsoDia(r.dataEmissao);
            if (!ini) continue;
            const ret = toIsoDia(r.dataRetorno);
            atestadoMap.set(Number(r.employeeId), { ini, fimIncl: ret ? addDias(ret, -1) : null });
          }
        }
        for (const e of afastCandidatos as any[]) {
          const iniLic = toIsoDia(e.licencaDataInicio);
          const fimLic = toIsoDia(e.licencaDataFim);
          if (iniLic) {
            afastWindowMap.set(e.id, { ini: iniLic, fimIncl: fimLic });
          } else {
            const at = atestadoMap.get(e.id);
            if (at) afastWindowMap.set(e.id, at);
          }
        }
        // Afastado sem NENHUMA data de início → fora da folha (como antes)
        const semDataIds = new Set(
          afastCandidatos.filter((e: any) => e.status === 'Afastado' && !afastWindowMap.has(e.id)).map((e: any) => e.id),
        );
        if (semDataIds.size > 0) {
          console.log(`[SimPag AFASTAMENTO] ${semDataIds.size} afastado(s) sem data de início conhecida — mantidos FORA da folha.`);
          for (const id of semDataIds) {
            const idx = empList.findIndex((e: any) => e.id === id);
            if (idx >= 0) empList.splice(idx, 1);
          }
        }
      }

      const allCompanyIds = resolveCompanyIds(input);
      const allCompanyIdsSql = sql.join(allCompanyIds.map(id => sql`${id}`), sql`,`);

      // Rev. — Contas bancárias da empresa (conta salário). A remessa por banco
      // agrupa por ESTA conta (a que a empresa paga), não pelo banco pessoal.
      const contasEmpresa = await db.select().from(companyBankAccounts)
        .where(inArray(companyBankAccounts.companyId, allCompanyIds));
      const contaEmpresaMap = new Map(contasEmpresa.map((c: any) => [c.id, c]));

      console.log(`[SimPag DIAG] mesRef=${input.mesReferencia}, companyId=${input.companyId}, allCompanyIds=[${allCompanyIds.join(',')}], empList=${empList.length}`);

      // Rev. 3984 — Aviso prévio que ENCERRA dentro do mês de referência (dataFim
      // caindo em [primeiroDia, ultimoDia], não só sobrepondo) exige decisão explícita
      // "pagar ou não?" do RH antes de entrar normalmente na folha — espelha o padrão
      // de alerta já usado no Vale. Diferente do filtro de inclusão no empList acima
      // (que aceita QUALQUER sobreposição), aqui restringimos ao término efetivo no mês.
      const avisoEncerraNoMesRows = ((await db.execute(sql`
        SELECT tn."employeeId", tn."dataFim"
        FROM termination_notices tn
        WHERE tn."deletedAt" IS NULL
          AND tn.status NOT IN ('cancelado')
          AND tn.tipo NOT LIKE '%indenizado%'
          AND tn."dataFim" >= ${primeiroDiaMesAviso}::date
          AND tn."dataFim" <= ${ultimoDiaMesAviso}::date
      `)) as any).rows || [];
      const avisoEncerraNoMesMap = new Map<number, string>();
      for (const r of avisoEncerraNoMesRows as any[]) {
        avisoEncerraNoMesMap.set(Number(r.employeeId), r.dataFim);
      }

      // Decisões já registradas (persistem entre recálculos, já que payroll_payments
      // é DELETE+INSERT a cada simulação).
      const decisoesAvisoRows = ((await db.execute(sql`
        SELECT DISTINCT ON ("employeeId") "employeeId", decisao
        FROM payroll_folha_decisoes
        WHERE "companyId" IN (${allCompanyIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
        ORDER BY "employeeId", "decididoEm" DESC
      `)) as any).rows || [];
      const decisoesAvisoMap = new Map<number, string>();
      for (const r of decisoesAvisoRows as any[]) {
        decisoesAvisoMap.set(Number(r.employeeId), r.decisao);
      }
      const excluidosPorDecisaoAviso: { employeeId: number; nome: string }[] = [];

      // Get advances for this month
      const advRows = ((await db.execute(sql`
        SELECT * FROM payroll_advances 
        WHERE "companyId" IN (${allCompanyIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const advMap = new Map<number, any>();
      for (const a of (advRows || [])) {
        advMap.set(a.employeeId, a);
      }

      // Rev. 4868 — Descontos em Folha (menu RH): lançamentos mensais manuais.
      // pensao_alimenticia soma na coluna PENSÃO; os demais tipos na coluna OUTROS.
      const descFolhaMap = new Map<number, any[]>();
      try {
        const descFolhaRows = ((await db.execute(sql`
          SELECT "employeeId", tipo, valor FROM folha_descontos
          WHERE "companyId" IN (${allCompanyIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
        `)) as any).rows || [];
        for (const d of descFolhaRows) {
          const arr = descFolhaMap.get(d.employeeId) || [];
          arr.push(d);
          descFolhaMap.set(d.employeeId, arr);
        }
      } catch (err: any) {
        console.error('[Folha] erro lendo folha_descontos:', err?.message ?? err);
      }

      // Adicionais Legais (insalubridade/periculosidade) — vigências que intersectam a competência.
      const adicionaisMap = new Map<number, any[]>();
      try {
        const mesIniAdic = `${year}-${String(month).padStart(2, '0')}-01`;
        const mesFimAdic = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
        const adicRows = ((await db.execute(sql`
          SELECT "employeeId", tipo, percentual, "dataInicio", "dataFim" FROM employee_adicionais
          WHERE "companyId" IN (${allCompanyIdsSql})
            AND "dataInicio" <= ${mesFimAdic}
            AND ("dataFim" IS NULL OR "dataFim" >= ${mesIniAdic})
        `)) as any).rows || [];
        for (const a of adicRows) {
          const arr = adicionaisMap.get(Number(a.employeeId)) || [];
          arr.push(a);
          adicionaisMap.set(Number(a.employeeId), arr);
        }
      } catch (err: any) {
        console.error('[Folha] erro lendo employee_adicionais:', err?.message ?? err);
      }

      // Proventos em Folha (Outras Receitas — ex.: reembolso) da competência.
      const provFolhaMap = new Map<number, any[]>();
      try {
        const provRows = ((await db.execute(sql`
          SELECT "employeeId", tipo, descricao, valor FROM folha_proventos
          WHERE "companyId" IN (${allCompanyIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
        `)) as any).rows || [];
        for (const p of provRows) {
          const arr = provFolhaMap.get(Number(p.employeeId)) || [];
          arr.push(p);
          provFolhaMap.set(Number(p.employeeId), arr);
        }
      } catch (err: any) {
        console.error('[Folha] erro lendo folha_proventos:', err?.message ?? err);
      }

      // Get adjustments (from escuro aferição) for this month
      // Inclui 'pendente' E 'aplicado': os 'aplicado' ficaram órfãos na última simulação
      // (paymentId apontava para um payroll_payments que será deletado abaixo).
      // Também resetamos os 'aplicado' para 'pendente' depois do DELETE para manter consistência.
      // IMPORTANTE (Rev. 1199): filtrar por janela cut-to-cut da competência (16/prev → 15/current).
      // Adjustments antigos com data fora dessa janela são considerados stale e ignorados.
      const prevMesRefSim = getPrevMesRef(input.mesReferencia);
      const prevParsedSim = parseMesRef(prevMesRefSim);
      const diaCorteSim = criteria.diaCorte;
      const escuroInicioSim = `${prevParsedSim.year}-${String(prevParsedSim.month).padStart(2, "0")}-${String(diaCorteSim + 1).padStart(2, "0")}`;
      const escuroFimSim = `${year}-${String(month).padStart(2, "0")}-${String(diaCorteSim).padStart(2, "0")}`;
      const adjRows = ((await db.execute(sql`
        SELECT * FROM payroll_adjustments 
        WHERE "companyId" IN (${allCompanyIdsSql}) 
          AND "mesDesconto" = ${input.mesReferencia} 
          AND status IN ('pendente', 'aplicado')
          AND data >= ${escuroInicioSim}
          AND data <= ${escuroFimSim}
      `)) as any).rows || [];
      const adjMap = new Map<number, any[]>();
      for (const a of (adjRows || [])) {
        if (!adjMap.has(a.employeeId)) adjMap.set(a.employeeId, []);
        adjMap.get(a.employeeId)!.push(a);
      }

      // Check if timecard_daily has ANY records for this month (diagnostic)
      const timecardCountRows = ((await db.execute(sql`
        SELECT COUNT(*) as cnt FROM timecard_daily
        WHERE "companyId" IN (${allCompanyIdsSql})
          AND "mesCompetencia" = ${input.mesReferencia}
          AND "statusDia" = 'registrado'
      `)) as any).rows || [];
      const timecardDailyCount = Number(timecardCountRows[0]?.cnt) || 0;
      const pontoProcessado = timecardDailyCount > 0;

      // Also count ALL timecard_daily (any statusDia) for diagnostic
      const timecardAllRows = ((await db.execute(sql`
        SELECT "statusDia", COUNT(*) as cnt FROM timecard_daily
        WHERE "companyId" IN (${allCompanyIdsSql})
          AND "mesCompetencia" = ${input.mesReferencia}
        GROUP BY "statusDia"
      `)) as any).rows || [];
      console.log(`[SimPag DIAG] timecardDailyCount(registrado)=${timecardDailyCount}, pontoProcessado=${pontoProcessado}, allStatusCounts=${JSON.stringify(timecardAllRows)}`);

      const periodoDiferente = !!(input.pontoInicioManual && input.pontoFimManual) && (input.pontoInicioManual !== storedPontoInicio || input.pontoFimManual !== storedPontoFim);
      const forcarReprocessamento = (periodoDiferente && pontoProcessado) || (!!input.forcarRecalculoPonto && pontoProcessado);
      if (forcarReprocessamento) {
        if (periodoDiferente) {
          console.log(`[SimPag AUTO-PONTO] Período manual diferente do armazenado (${input.pontoInicioManual} → ${input.pontoFimManual} vs ${storedPontoInicio} → ${storedPontoFim}). Reprocessando...`);
        } else {
          console.log(`[SimPag AUTO-PONTO] forcarRecalculoPonto=true (Resimular). Reprocessando timecard_daily a partir de time_records...`);
        }
      }
      if (!pontoProcessado || forcarReprocessamento) {
        console.log(`[SimPag AUTO-PONTO] ${forcarReprocessamento ? 'Reprocessando' : 'Nenhum registro em timecard_daily para'} ${input.mesReferencia}. Auto-processando ponto...`);
        const prevMonthAP = month === 1 ? 12 : month - 1;
        const prevYearAP = month === 1 ? year - 1 : year;
        const diaCorteAP = criteria.diaCorte;
        let pontoInicioAP: string;
        let pontoFimAP: string;
        if (input.pontoInicioManual && input.pontoFimManual) {
          pontoInicioAP = input.pontoInicioManual;
          pontoFimAP = input.pontoFimManual;
          console.log(`[SimPag AUTO-PONTO] Período manual: ${pontoInicioAP} → ${pontoFimAP}`);
        } else {
          const pontoInicioDateAP = new Date(Date.UTC(prevYearAP, prevMonthAP - 1, diaCorteAP));
          pontoInicioDateAP.setUTCDate(pontoInicioDateAP.getUTCDate() + 1);
          pontoInicioAP = pontoInicioDateAP.toISOString().slice(0, 10);
          pontoFimAP = `${year}-${String(month).padStart(2, '0')}-${String(diaCorteAP).padStart(2, '0')}`;
        }
        const lastDayAP = new Date(year, month, 0).getDate();

        const autoRecords = ((await db.execute(sql`
          SELECT * FROM time_records
          WHERE "companyId" IN (${allCompanyIdsSql})
            AND data >= ${pontoInicioAP} AND data <= ${pontoFimAP}
        `)) as any).rows || [];

        // Quando NÃO há time_records:
        //   - Primeira importação (!pontoProcessado): mantém o SKIP histórico (não há nada a processar nem a limpar).
        //   - Reprocessamento forçado (forcarReprocessamento): ainda limpa derivados stale para evitar que a folha
        //     continue usando dados antigos quando o usuário removeu/zerou o ponto de origem.
        if (autoRecords.length === 0 && !forcarReprocessamento) {
          console.log(`[SimPag AUTO-PONTO] SKIP: nenhum time_record encontrado para ${pontoInicioAP} → ${pontoFimAP}. Ponto não importado?`);
        } else {
          if (autoRecords.length === 0) {
            console.log(`[SimPag AUTO-PONTO] AVISO: forcarRecalculoPonto=true e nenhum time_record para ${pontoInicioAP} → ${pontoFimAP}. Limpando timecard_daily não-manual; nada será reinserido.`);
          }
          const fmtDate = (d: any): string => {
            if (typeof d === 'string') return d.substring(0, 10);
            if (d instanceof Date) {
              return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            }
            return String(d);
          };
          const autoRecordMap = new Map<string, any[]>();
          for (const r of autoRecords) {
            const key = `${r.employeeId}-${fmtDate(r.data)}`;
            if (!autoRecordMap.has(key)) autoRecordMap.set(key, []);
            autoRecordMap.get(key)!.push(r);
          }

          // Preservar dias com edição manual / aferição (Fechamento de Ponto, ajustes manuais e aferição do escuro)
          // E também dias com resolução manual de inconsistência (atestado/justificar/abonar/feriado/bh) que
          // marcam isFalta=0 sem trocar origemRegistro para 'manual' (vide payrollEngine ~857-887).
          const preservedRows = ((await db.execute(sql`
            SELECT "employeeId", "data" FROM timecard_daily
            WHERE "companyId" IN (${allCompanyIdsSql})
              AND "mesCompetencia" = ${input.mesReferencia}
              AND ("origemRegistro" IN ('manual', 'ajuste_manual', 'ajusteManual', 'aferido')
                   OR "resolucaoTipo" IS NOT NULL)
          `)) as any).rows || [];
          const preservedKeys = new Set<string>();
          for (const r of preservedRows) {
            const dStr = typeof r.data === 'string' ? r.data.substring(0, 10) : (r.data instanceof Date ? `${r.data.getUTCFullYear()}-${String(r.data.getUTCMonth()+1).padStart(2,'0')}-${String(r.data.getUTCDate()).padStart(2,'0')}` : String(r.data).substring(0,10));
            preservedKeys.add(`${r.employeeId}-${dStr}`);
          }
          if (preservedKeys.size > 0) {
            console.log(`[SimPag AUTO-PONTO] Preservando ${preservedKeys.size} dia(s) com edição manual / aferição / resolução de inconsistência.`);
          }
          await db.execute(sql`
            DELETE FROM timecard_daily
            WHERE "companyId" IN (${allCompanyIdsSql})
              AND "mesCompetencia" = ${input.mesReferencia}
              AND "origemRegistro" NOT IN ('manual', 'ajuste_manual', 'ajusteManual', 'aferido')
              AND "resolucaoTipo" IS NULL
          `);

          // Rev. 3972 — Pré-carregar datas de férias do período do ponto para não gerar
          // isFalta=1 em dias que o funcionário está em gozo de férias.
          // Padrão idêntico ao da fase do escuro (linhas ~1268-1296).
          const autoPontoFeriasDateSet = new Set<string>();
          {
            const empIdsSqlAP = sql.join(empList.map((e: any) => sql`${e.id}`), sql`,`);
            const feriasAutoRows = ((await db.execute(sql`
              SELECT "employeeId", "dataInicio", "dataFim",
                     "periodo2Inicio", "periodo2Fim", "periodo3Inicio", "periodo3Fim"
              FROM vacation_periods
              WHERE "employeeId" IN (${empIdsSqlAP})
                AND status NOT IN ('cancelada', 'pendente')
                AND "dataInicio" IS NOT NULL AND "dataFim" IS NOT NULL
                AND "dataFim" >= ${pontoInicioAP} AND "dataInicio" <= ${pontoFimAP}
            `)) as any).rows || [];
            for (const vp of feriasAutoRows) {
              const periods = [
                { ini: vp.dataInicio, fim: vp.dataFim },
                { ini: vp.periodo2Inicio, fim: vp.periodo2Fim },
                { ini: vp.periodo3Inicio, fim: vp.periodo3Fim },
              ];
              for (const p of periods) {
                if (!p.ini || !p.fim) continue;
                const start = new Date(String(p.ini).slice(0, 10) + 'T12:00:00Z');
                const end   = new Date(String(p.fim).slice(0, 10) + 'T12:00:00Z');
                for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
                  autoPontoFeriasDateSet.add(`${vp.employeeId}-${d.toISOString().slice(0, 10)}`);
                }
              }
            }
            if (autoPontoFeriasDateSet.size > 0) {
              console.log(`[SimPag AUTO-PONTO] ${autoPontoFeriasDateSet.size} datas de férias carregadas (não serão marcadas como falta)`);
            }
          }

          let autoFaltas = 0, autoAtrasos = 0;
          const insertVals: any[] = [];

          for (const emp of empList) {
            const pontoDatesAP = getDateRange(pontoInicioAP, pontoFimAP);
            for (const dateStr of pontoDatesAP) {
              if (preservedKeys.has(`${emp.id}-${dateStr}`)) continue;
              const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
              if (dow === 0) continue;
              let tipoDia = 'util';
              if (dow === 6) tipoDia = criteria.jornadaSabadoTipo === 'compensado' ? 'compensado' : 'sabado';
              // Dias em gozo de férias não geram falta
              if (autoPontoFeriasDateSet.has(`${emp.id}-${dateStr}`)) tipoDia = 'ferias';
              // Rev. 4771 — dias dentro da janela de afastamento não geram falta.
              // Fim em aberto só vale para quem AINDA está Afastado; quem já
              // voltou (status ≠ Afastado) sem fim conhecido segue regra normal
              // (mesmo guard do desconto proporcional — senão o ponto suprime
              // faltas de dias em que a folha volta a pagar normal).
              {
                const wAf = afastWindowMap.get(emp.id);
                const fimAfOk = wAf ? (wAf.fimIncl ? dateStr <= wAf.fimIncl : emp.status === 'Afastado') : false;
                if (wAf && dateStr >= wAf.ini && fimAfOk) tipoDia = 'atestado';
              }

              const key = `${emp.id}-${dateStr}`;
              const recs = autoRecordMap.get(key) || [];
              let isFalta = 0, isAtraso = 0, minutosAtraso = 0;
              let horasTrabalhadas = '0:00', horasExtras = '0:00', horasNoturnas = '0:00';
              let numBatidas = 0;
              let timeRecordId: number | null = null;
              let obraId: number | null = null;

              if (recs.length > 0) {
                const rec = recs[0];
                timeRecordId = rec.id;
                obraId = rec.obraId || null;
                horasNoturnas = rec.horasNoturnas || '0:00';

                // Respeitar tipoDia abonado vindo do time_records (atestado/feriado/bh)
                const recTipoDia = (rec.tipoDia || "").toLowerCase();
                if (recTipoDia === "atestado" || recTipoDia === "feriado" || recTipoDia === "bh") {
                  tipoDia = recTipoDia;
                }

                if (recs.length > 1) {
                  let totalMins = 0;
                  for (const r of recs) totalMins += parseTime(r.horasTrabalhadas) || 0;
                  horasTrabalhadas = minutesToHHMM(totalMins);
                  numBatidas = recs.reduce((s: number, r: any) => s + [r.entrada1, r.saida1, r.entrada2, r.saida2, r.entrada3, r.saida3].filter(Boolean).length, 0);
                } else {
                  horasTrabalhadas = rec.horasTrabalhadas || '0:00';
                  numBatidas = [rec.entrada1, rec.saida1, rec.entrada2, rec.saida2, rec.entrada3, rec.saida3].filter(Boolean).length;
                }

                if (numBatidas === 0) {
                  if (tipoDia === 'util') { isFalta = 1; autoFaltas++; }
                }

                const entrada = parseTime(rec.entrada1);
                if (entrada !== null && tipoDia === 'util') {
                  const jornadaEntrada = getExpectedEntrada(emp.jornadaTrabalho, dateStr);
                  const atraso = entrada - jornadaEntrada;
                  if (atraso > criteria.pontoFaltaAposAtraso) {
                    isFalta = 1; autoFaltas++;
                  } else if (atraso > criteria.pontoToleranciaLegal) {
                    isAtraso = 1; minutosAtraso = atraso; autoAtrasos++;
                  }
                }

                const expectedMins = getExpectedMins(emp.jornadaTrabalho, dateStr, criteria.cargaHorariaDiaria);
                const actualMins = parseTime(horasTrabalhadas) || 0;
                const heMins = Math.max(0, actualMins - expectedMins);
                horasExtras = heMins > 0 ? minutesToHHMM(heMins) : '0:00';

                // Rev. 3973 — Turno incompleto (saída antecipada / não voltou do intervalo):
                // se o colaborador registrou batidas mas trabalhou MENOS que a jornada,
                // o déficit total substitui (ou complementa) o minutosAtraso de entrada.
                // Math.max evita dupla contagem: deficit >= atraso de entrada quando o turno
                // é incompleto (ambos medem o mesmo tempo não trabalhado).
                if (numBatidas > 0 && tipoDia === 'util' && isFalta === 0 && actualMins < expectedMins) {
                  const deficit = expectedMins - actualMins;
                  if (deficit > criteria.pontoToleranciaLegal) {
                    if (!isAtraso) { isAtraso = 1; autoAtrasos++; }
                    minutosAtraso = Math.max(minutosAtraso, deficit);
                  }
                }
              } else {
                if (tipoDia === 'util') { isFalta = 1; autoFaltas++; }
              }

              insertVals.push(sql`(${emp.companyId}, ${emp.id}, ${dateStr}, ${input.mesReferencia}, 'registrado',
                ${recs[0]?.entrada1 || null}, ${recs[0]?.saida1 || null}, ${recs[0]?.entrada2 || null}, ${recs[0]?.saida2 || null},
                ${horasTrabalhadas}, ${horasExtras}, ${horasNoturnas},
                ${isFalta}, ${isAtraso}, 0, ${minutosAtraso}, 0,
                ${tipoDia}, ${timeRecordId}, ${obraId},
                'auto', ${numBatidas}, 0)`);
            }

            if (criteria.fecharNoEscuro) {
              for (let d = diaCorteAP + 1; d <= lastDayAP; d++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                if (preservedKeys.has(`${emp.id}-${dateStr}`)) continue;
                const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
                if (dow === 0) continue;
                let tipoDia = 'util';
                if (dow === 6) tipoDia = criteria.jornadaSabadoTipo === 'compensado' ? 'compensado' : 'sabado';

                insertVals.push(sql`(${emp.companyId}, ${emp.id}, ${dateStr}, ${input.mesReferencia}, 'escuro',
                  ${null}, ${null}, ${null}, ${null},
                  ${minutesToHHMM(criteria.cargaHorariaDiaria * 60)}, '0:00', '0:00',
                  0, 0, 0, 0, 0,
                  ${tipoDia}, ${null}, ${null},
                  'escuro', 0, 0)`);
              }
            }
          }

          if (insertVals.length > 0) {
            const BATCH = 100;
            for (let i = 0; i < insertVals.length; i += BATCH) {
              const chunk = insertVals.slice(i, i + BATCH);
              await db.execute(sql`
                INSERT INTO timecard_daily ("companyId", "employeeId", "data", "mesCompetencia", "statusDia",
                  "entrada1", "saida1", "entrada2", "saida2",
                  "horasTrabalhadas", "horasExtras", "horasNoturnas",
                  "isFalta", "isAtraso", "isSaidaAntecipada", "minutosAtraso", "minutosSaidaAntecipada",
                  "tipoDia", "timeRecordId", "obraId",
                  "origemRegistro", "numBatidas", "isInconsistente")
                VALUES ${sql.join(chunk, sql`, `)}
              `);
            }
          }

          console.log(`[SimPag AUTO-PONTO] Concluído: ${empList.length} func, ${insertVals.length} registros, ${autoFaltas} faltas, ${autoAtrasos} atrasos`);

          await db.execute(sql`
            UPDATE payroll_periods SET
              status = CASE WHEN status = 'aberta' THEN 'ponto_importado' ELSE status END,
              "pontoImportadoEm" = COALESCE("pontoImportadoEm", NOW()),
              "pontoImportadoPor" = COALESCE("pontoImportadoPor", 'Auto-SimPag')
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
          `);
        }
      }

      // Rev. 3974 — Auto-reconciliar ajustes de falta do escuro contra timecard_daily.
      // Cenário: escuro aferição rodou ANTES da entrada manual do colaborador.
      // Gerou payroll_adjustment tipo='falta' (status='pendente').
      // Depois o usuário lançou manualmente no Espelho → timecard_daily corrigido
      // (isFalta=0, origemRegistro='manual'). O adjustment ficou órfão.
      // Aqui cancelamos automaticamente esses adjustments para não entrar em
      // descontoFaltasBase e gerar desconto indevido na Folha.
      {
        const autoReconcileRows = ((await db.execute(sql`
          WITH cancelados AS (
            UPDATE payroll_adjustments pa
            SET status = 'cancelado', "updatedAt" = NOW()
            FROM timecard_daily td
            WHERE pa."companyId" IN (${allCompanyIdsSql})
              AND pa."mesDesconto" = ${input.mesReferencia}
              AND pa.tipo = 'falta'
              AND pa.status = 'pendente'
              AND td."companyId" IN (${allCompanyIdsSql})
              AND td."mesCompetencia" = ${input.mesReferencia}
              AND td."employeeId" = pa."employeeId"
              AND td.data = pa.data
              AND td."isFalta" = 0
              AND td."statusDia" = 'registrado'
            RETURNING pa.id
          )
          SELECT id FROM cancelados
        `)) as any).rows || [];
        if (autoReconcileRows.length > 0) {
          const cancelledIds = new Set<number>(autoReconcileRows.map((r: any) => Number(r.id)));
          console.log(`[SimPag AUTO-RECONCILE] ${cancelledIds.size} ajuste(s) de falta cancelados por registro manual sem falta`);
          // Limpar do adjMap em memória (adjRows foi carregado antes do auto-ponto)
          for (const [empId, adjs] of adjMap.entries()) {
            const filtered = (adjs as any[]).filter((a: any) => !cancelledIds.has(Number(a.id)));
            if (filtered.length !== (adjs as any[]).length) adjMap.set(empId, filtered);
          }
        }
      }

      // Get faltas from timecard_daily for the ponto period (registrado only)
      const faltasRows2 = ((await db.execute(sql`
        SELECT "employeeId", 
          SUM("isFalta") as "totalFaltas",
          SUM("isAtraso") as "totalAtrasos",
          SUM("minutosAtraso") as "totalMinutosAtraso",
          ARRAY_AGG(CASE WHEN "isFalta" = 1 THEN to_char(data, 'DD/MM/YYYY') END ORDER BY data) FILTER (WHERE "isFalta" = 1) as "diasFalta",
          ARRAY_AGG(CASE WHEN "isAtraso" = 1 THEN to_char(data, 'DD/MM/YYYY') || ' (' || "minutosAtraso" || ' min)' END ORDER BY data) FILTER (WHERE "isAtraso" = 1) as "diasAtraso"
        FROM timecard_daily 
        WHERE "companyId" IN (${allCompanyIdsSql}) 
        AND "mesCompetencia" = ${input.mesReferencia}
        AND "statusDia" = 'registrado'
        GROUP BY "employeeId"
      `)) as any).rows || [];
      const faltasMap = new Map<number, any>();
      for (const r of (faltasRows2 || [])) {
        faltasMap.set(Number(r.employeeId), r);
      }
      console.log(`[SimPag DIAG] faltasRows2=${faltasRows2.length} employees with faltas/atrasos, adjRows(escuro)=${adjRows.length}, advRows(vale)=${advRows.length}`);

      // --- DSR (Descanso Semanal Remunerado) — Lei 605/49 Art. 6º ---
      // Lê o resumo já calculado por ponto_descontos (DSR-falta e DSR-atraso separados)
      // e expõe como dsrMap por funcionário.
      const dsrRows = ((await db.execute(sql`
        SELECT "employeeId",
               COALESCE("totalDsrFalta", 0)        AS "qtdFalta",
               COALESCE("valorTotalDsrFalta",  '0') AS "valorFalta"
        FROM ponto_descontos_resumo
        WHERE "companyId" IN (${allCompanyIdsSql})
          AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const dsrMap = new Map<number, { qtdFalta: number; valorFalta: number }>();
      for (const r of dsrRows) {
        dsrMap.set(Number(r.employeeId), {
          qtdFalta: Number(r.qtdFalta) || 0,
          valorFalta: parseBRL(r.valorFalta) || 0,
        });
      }

      // Ler default de aplicarDsrFalta do payroll_periods (se já existir registro)
      const ppCfgRows = ((await db.execute(sql`
        SELECT COALESCE("aplicarDsrFalta", 1)  AS "aplicarDsrFalta"
        FROM payroll_periods
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      const cfgFalta = ppCfgRows.length > 0 ? Number(ppCfgRows[0].aplicarDsrFalta) === 1 : true;
      // Input override > config persistida > default true
      const aplicarDsrFalta  = input.aplicarDsrFalta  != null ? input.aplicarDsrFalta  : cfgFalta;

      // Rev. 3989 — Ler default de somarDiferencaDissidio do payroll_periods
      const ppCfgDissidioRows = ((await db.execute(sql`
        SELECT COALESCE("somarDiferencaDissidio", 0) AS "somarDiferencaDissidio"
        FROM payroll_periods
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      const cfgSomarDissidio = ppCfgDissidioRows.length > 0 ? Number(ppCfgDissidioRows[0].somarDiferencaDissidio) === 1 : false;
      // Input override > config persistida > default false
      const somarDiferencaDissidio = input.somarDiferencaDissidio != null ? input.somarDiferencaDissidio : cfgSomarDissidio;

      // Rev. 3989 — mapa employeeId → líquido da diferença retroativa do dissídio
      // (mesma fórmula de relatorioDiferencas/sindical.ts), somado no líquido do
      // mês em que o contador efetivamente PAGA a diferença (diferencaMesPagamento).
      const diferencaDissidioMap = new Map<number, number>();
      if (somarDiferencaDissidio) {
        const diffRows = ((await db.execute(sql`
          SELECT df."employeeId" AS "employeeId", df."valorRetroativo" AS "valorRetroativo",
                 df."diferenca_tipo" AS "diferencaTipo", df."diferenca_breakdown_json" AS "diferencaBreakdownJson"
          FROM dissidio_funcionarios df
          LEFT JOIN dissidios d ON d.id = df."dissidioId"
          WHERE df."companyId" IN (${allCompanyIdsSql})
            AND df."diferenca_mes_pagamento" = ${input.mesReferencia}
            AND df."valorRetroativo" IS NOT NULL
            AND CAST(NULLIF(df."valorRetroativo", '') AS NUMERIC) > 0
            AND (d.status IS NULL OR d.status != 'cancelado')
        `)) as any).rows || [];
        for (const r of diffRows) {
          const enc = calcularEncargosDiferenca({
            diferencaTipo: r.diferencaTipo,
            valorRetroativo: r.valorRetroativo,
            diferencaBreakdownJson: r.diferencaBreakdownJson,
          });
          const empId = Number(r.employeeId);
          diferencaDissidioMap.set(empId, (diferencaDissidioMap.get(empId) || 0) + enc.liquido);
        }
      }

      // HE is now a SEPARATE MODULE (he_periods) — simularPagamento = salário base only
      // HE is tracked and paid via the dedicated HE module in Folha → Hora Extra

      // Capture existing manual overrides BEFORE deleting
      const existingOverridesRows = ((await db.execute(sql`
        SELECT "employeeId", "descontosManuaisJson", "descontosManuaisHistorico"
        FROM payroll_payments
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "descontosManuaisJson" IS NOT NULL
      `)) as any).rows || [];
      const overridesMap = new Map<number, { manuais: any; historico: any }>();
      for (const r of existingOverridesRows) {
        const manuais = r.descontosManuaisJson || {};
        const hasAny = Object.keys(manuais).length > 0;
        if (hasAny) {
          overridesMap.set(Number(r.employeeId), {
            manuais,
            historico: r.descontosManuaisHistorico || {},
          });
        }
      }
      // Líquido editado pelo Master (editarLiquidoFolha) NÃO fica em descontosManuaisJson —
      // é gravado direto em salarioLiquido + marcador nas observações. Capturar também,
      // senão a ressimulação apaga a edição SEM nem avisar (bug relatado 03/08/2026).
      const liquidoOverridesRows = ((await db.execute(sql`
        SELECT "employeeId", "salarioLiquido", "observacoes"
        FROM payroll_payments
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "observacoes" LIKE '%LÍQUIDO EDITADO%'
      `)) as any).rows || [];
      const liquidoOverridesMap = new Map<number, { salarioLiquido: number; obs: string }>();
      for (const r of liquidoOverridesRows) {
        const liq = parseFloat(String(r.salarioLiquido || "0"));
        if (Number.isFinite(liq)) {
          // guarda apenas os marcadores [LÍQUIDO EDITADO ...] para reanexar no novo registro
          const marcadores = (String(r.observacoes || "").match(/\[LÍQUIDO EDITADO[^\]]*\]/g) || []).join(" ");
          liquidoOverridesMap.set(Number(r.employeeId), { salarioLiquido: liq, obs: marcadores });
        }
      }
      const todosOverrideIds = Array.from(new Set([...overridesMap.keys(), ...liquidoOverridesMap.keys()]));
      if (todosOverrideIds.length > 0 && !input.manterOverrides && !input.descartarOverrides && input.manterOverridesIds === undefined) {
        // Lista nomes dos funcionários com ajustes manuais para o RH decidir individualmente
        const nomesRows = ((await db.execute(sql`
          SELECT id, COALESCE(NULLIF("nomeCompleto", ''), nome) AS nome FROM employees WHERE id IN (${sql.join(todosOverrideIds.map(id => sql`${id}`), sql`, `)})
        `)) as any).rows || [];
        const lista = todosOverrideIds.map(id => ({
          id,
          nome: String(nomesRows.find((r: any) => Number(r.id) === id)?.nome || `Funcionário ${id}`),
          campos: [
            ...Object.keys(overridesMap.get(id)?.manuais || {}),
            ...(liquidoOverridesMap.has(id) ? ["líquido"] : []),
          ],
        }));
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `OVERRIDES_EXIST:${todosOverrideIds.length}:${JSON.stringify(lista)}`,
        });
      }
      // descartarOverrides: limpa os maps → não reaplica
      if (input.descartarOverrides) { overridesMap.clear(); liquidoOverridesMap.clear(); }
      // Decisão individual: mantém só os ids escolhidos; os demais ressimulam do zero
      if (input.manterOverridesIds !== undefined && !input.manterOverrides && !input.descartarOverrides) {
        const keep = new Set(input.manterOverridesIds.map(Number));
        for (const id of Array.from(overridesMap.keys())) {
          if (!keep.has(id)) overridesMap.delete(id);
        }
        for (const id of Array.from(liquidoOverridesMap.keys())) {
          if (!keep.has(id)) liquidoOverridesMap.delete(id);
        }
      }

      // Clear existing payments for this month
      await db.execute(sql`
        DELETE FROM payroll_payments WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      // Rev. 3977 — Banco de Horas: reverter débitos de atraso/falta desta mesma competência antes
      // de recalcular (idempotência entre recálculos do mesmo período). Débito é marcado com
      // tipo='debito_atraso_falta' e a competência embutida na descrição (não há coluna dedicada).
      {
        const _debitoMarker977 = `Débito atraso/falta ${input.mesReferencia}`;
        const _oldDebitos977 = ((await db.execute(sql`
          SELECT id, "employeeId", "companyId", minutos FROM banco_horas_lancamentos
          WHERE "companyId" IN (${allCompanyIdsSql}) AND tipo = 'debito_atraso_falta'
            AND descricao LIKE ${_debitoMarker977 + '%'}
        `)) as any).rows || [];
        for (const d of _oldDebitos977) {
          // Rev. 4000 — reversão soma o valor ABSOLUTO de volta ao saldo, independente do sinal
          // gravado historicamente na linha (linhas antigas ficaram negativas por bug; linhas novas
          // são positivas, ver Rev. 4000 no INSERT abaixo). ABS() garante idempotência nos dois casos.
          await db.execute(sql`
            UPDATE banco_horas_saldo SET "saldoMinutos" = "saldoMinutos" + ABS(${Number(d.minutos)}), "atualizadoEm" = NOW()
            WHERE "employeeId" = ${d.employeeId} AND "companyId" = ${d.companyId}
          `);
        }
        if (_oldDebitos977.length > 0) {
          await db.execute(sql`
            DELETE FROM banco_horas_lancamentos
            WHERE "companyId" IN (${allCompanyIdsSql}) AND tipo = 'debito_atraso_falta'
              AND descricao LIKE ${_debitoMarker977 + '%'}
          `);
        }
      }

      // Rev. 3983 — Banco de Horas: mesma reversão idempotente acima, para os débitos de DSR
      // perdido redirecionados (tipo='debito_dsr', lançamento separado do de atraso/falta).
      {
        const _debitoMarkerDsr983 = `Débito DSR ${input.mesReferencia}`;
        const _oldDebitosDsr983 = ((await db.execute(sql`
          SELECT id, "employeeId", "companyId", minutos FROM banco_horas_lancamentos
          WHERE "companyId" IN (${allCompanyIdsSql}) AND tipo = 'debito_dsr'
            AND descricao LIKE ${_debitoMarkerDsr983 + '%'}
        `)) as any).rows || [];
        for (const d of _oldDebitosDsr983) {
          // Rev. 4000 — mesma reversão via ABS() do bloco de atraso/falta acima.
          await db.execute(sql`
            UPDATE banco_horas_saldo SET "saldoMinutos" = "saldoMinutos" + ABS(${Number(d.minutos)}), "atualizadoEm" = NOW()
            WHERE "employeeId" = ${d.employeeId} AND "companyId" = ${d.companyId}
          `);
        }
        if (_oldDebitosDsr983.length > 0) {
          await db.execute(sql`
            DELETE FROM banco_horas_lancamentos
            WHERE "companyId" IN (${allCompanyIdsSql}) AND tipo = 'debito_dsr'
              AND descricao LIKE ${_debitoMarkerDsr983 + '%'}
          `);
        }
      }

      // Reseta ajustes que estavam vinculados aos payments deletados de volta para 'pendente'
      // para que sejam re-aplicados consistentemente nesta nova simulação.
      await db.execute(sql`
        UPDATE payroll_adjustments 
        SET status = 'pendente', "paymentId" = NULL, "updatedAt" = NOW()
        WHERE "companyId" IN (${allCompanyIdsSql}) 
          AND "mesDesconto" = ${input.mesReferencia} 
          AND status = 'aplicado'
      `);

      const results: any[] = [];
      let grandTotalLiquido = 0;
      let grandTotalBruto = 0;
      let grandTotalDescontos = 0;

      // Calculate 5th business day of next month
      const dataPagamentoPrevista = getNthBusinessDay(nextParsed.year, nextParsed.month, criteria.diaPagamento);

      const empIds = empList.map(e => e.id);
      const empIdsSql = sql.join(empIds.map(id => sql`${id}`), sql`,`);

      // PRE-FETCH: VR diário for all employees in one query
      const vrBatchRows = ((await db.execute(sql`
        SELECT DISTINCT ON ("employeeId") "employeeId", "valorDiario"
        FROM vr_benefits
        WHERE "companyId" IN (${allCompanyIdsSql}) AND "employeeId" IN (${empIdsSql})
        ORDER BY "employeeId", "mesReferencia" DESC
      `)) as any).rows || [];
      const vrDiarioMap = new Map<number, number>();
      for (const r of vrBatchRows) vrDiarioMap.set(Number(r.employeeId), parseBRL(r.valorDiario));

      // PRE-FETCH: VA (vr_benefits valorTotal) for this competência
      const vaBatchRows = ((await db.execute(sql`
        SELECT "employeeId", "valorTotal" FROM vr_benefits
        WHERE "companyId" IN (${allCompanyIdsSql}) AND "employeeId" IN (${empIdsSql}) AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const vaMap = new Map<number, number>();
      for (const r of vaBatchRows) vaMap.set(Number(r.employeeId), parseBRL(r.valorTotal));

      // PRE-FETCH: Obra dias for all employees in one query
      const obraBatchRows = ((await db.execute(sql`
        SELECT td."employeeId", td."obraId", COUNT(*) as dias, o.nome as "obraNome"
        FROM timecard_daily td
        LEFT JOIN obras o ON td."obraId" = o.id
        WHERE td."employeeId" IN (${empIdsSql})
          AND td."companyId" IN (${allCompanyIdsSql})
          AND td."mesCompetencia" = ${input.mesReferencia}
          AND td."statusDia" = 'registrado'
          AND td."obraId" IS NOT NULL
        GROUP BY td."employeeId", td."obraId", o.nome
      `)) as any).rows || [];
      const obraMap = new Map<number, any[]>();
      for (const r of obraBatchRows) {
        if (!obraMap.has(Number(r.employeeId))) obraMap.set(Number(r.employeeId), []);
        obraMap.get(Number(r.employeeId))!.push(r);
      }

      // PRE-FETCH: Convênios for all employees in one query
      const convenioBatchRows = ((await db.execute(sql`
        SELECT lp."employeeId" as employee_id, COALESCE(SUM(CAST(lp.valor AS DECIMAL(15,2))), 0) as "totalConvenio"
        FROM lancamentos_parceiros lp
        WHERE lp."employeeId" IN (${empIdsSql}) AND lp."companyId" IN (${allCompanyIdsSql})
          AND lp.competencia_desconto = ${input.mesReferencia}
          AND lp.status = 'aprovado'
        GROUP BY lp."employeeId"
      `)) as any).rows || [];
      const convenioMap = new Map<number, number>();
      for (const r of convenioBatchRows) convenioMap.set(Number(r.employee_id), parseFloat(r.totalConvenio || '0'));
      console.log(`[SimPag DIAG] convenioBatchRows=${convenioBatchRows.length}, dsrRows=${dsrRows.length}, empIds=${empIds.length}`);

      // PRE-FETCH: Adjustments do mês de desconto (apenas 'outros') — sujeitos à aprovação RH (Rev. 1203)
      // Pensão NÃO entra mais aqui (Rev. 1205): cálculo é dinâmico direto do cadastro do funcionário.
      const adjBatchRows = ((await db.execute(sql`
        SELECT "employeeId", tipo, "valorDesconto", "aprovadoRh", id, descricao, data
        FROM payroll_adjustments
        WHERE "companyId" IN (${allCompanyIdsSql})
          AND "employeeId" IN (${empIdsSql})
          AND "mesDesconto" = ${input.mesReferencia}
          AND status IN ('pendente','aplicado')
          AND tipo = 'outros'
      `)) as any).rows || [];
      const adjustmentsByEmp = new Map<number, any[]>();
      for (const r of adjBatchRows) {
        const id = Number(r.employeeId);
        if (!adjustmentsByEmp.has(id)) adjustmentsByEmp.set(id, []);
        adjustmentsByEmp.get(id)!.push(r);
      }

      // PRE-FETCH: Horas extras do mês (he_period_employees) — para base da pensão
      const heBatchRows = ((await db.execute(sql`
        SELECT hpe."employeeId", COALESCE(SUM(CAST(hpe."valorHETotal" AS DECIMAL(15,2))), 0) as "totalHE"
        FROM he_period_employees hpe
        JOIN he_periods hp ON hp.id = hpe."hePeriodId"
        WHERE hpe."companyId" IN (${allCompanyIdsSql})
          AND hpe."employeeId" IN (${empIdsSql})
          AND hp."mesReferencia" = ${input.mesReferencia}
          AND hp.status IN ('aprovado','pago')
        GROUP BY hpe."employeeId"
      `)) as any).rows || [];
      const heMap = new Map<number, number>();
      for (const r of heBatchRows) heMap.set(Number(r.employeeId), parseFloat(r.totalHE || '0'));

      // Salário mínimo vigente (system_criteria)
      const salMinRow = ((await db.execute(sql`
        SELECT valor FROM system_criteria
        WHERE "companyId" = ${input.companyId} AND chave = 'salario_minimo_vigente'
        LIMIT 1
      `)) as any).rows || [];
      const salarioMinimoVigente = parseBRL(salMinRow[0]?.valor) || 1621;

      // PRE-FETCH: EPI discount alerts aprovados do mês
      const epiBatchRows = ((await db.execute(sql`
        SELECT "employeeId", status, valor_total, epi_nome, id
        FROM epi_discount_alerts
        WHERE "companyId" IN (${allCompanyIdsSql})
          AND "employeeId" IN (${empIdsSql})
          AND mes_referencia = ${input.mesReferencia}
      `)) as any).rows || [];
      const epiAlertsMap = new Map<number, any[]>();
      for (const r of epiBatchRows) {
        const id = Number(r.employeeId);
        if (!epiAlertsMap.has(id)) epiAlertsMap.set(id, []);
        epiAlertsMap.get(id)!.push(r);
      }

      const paymentInsertRows: any[] = [];
      // Rev. 3293 — arredondamento p/ R$ 1 com carry-forward (folha mensal). DELETE do
      // ledger folha/mês ANTES de ler saldos (idempotente em re-simulação).
      const ledgerInsertRowsFolha: any[] = [];
      const ordemFolha = ordemArredondamento(input.mesReferencia, "folha");
      await db.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'folha'`);
      const saldosArredFolha = await carregarSaldosArredondamento(db, [input.companyId]);

      // Rev. 3978 — DIFERENÇA SALARIAL retroativa do DISSÍDIO deixou de ser lançada
      // dentro da folha mensal (ela é PAGA À PARTE, com seus próprios encargos —
      // ver "Relatório de Diferenças Salariais (Dissídio)" em Folha de Pagamento,
      // que agora calcula INSS/IRRF sobre o valor). ZERO leitura de
      // dissidio_funcionarios aqui; ver `sindical.relatorioDiferencas`.

      // Dias reais do mês para cálculo proporcional do horista (220h = ref 30 dias)
      const diasNoMesSim = new Date(year, month, 0).getDate();

      // Rev. 4770 — FÉRIAS: salário proporcional na folha mensal.
      // Dias em gozo de férias dentro da competência NÃO são pagos como salário na
      // folha (já foram remunerados via módulo de Férias, com 1/3). Antes, as férias
      // só evitavam falta no ponto e o salário saía CHEIO (pagamento em dobro).
      // Espelha a regra do motor do Vale (feriasMesMap, ~L2455): dias de CALENDÁRIO
      // de férias sobrepostos ao mês, status em_gozo/concluida, não-deletadas.
      const feriasMesMapSim = new Map<number, number>();
      if (empList.length > 0) {
        const empIdsSqlFer = sql.join(empList.map((e: any) => sql`${e.id}`), sql`,`);
        const primeiroDiaMesFer = `${year}-${String(month).padStart(2, '0')}-01`;
        const ultimoDiaMesFer = `${year}-${String(month).padStart(2, '0')}-${String(diasNoMesSim).padStart(2, '0')}`;
        const feriasSimRows = ((await db.execute(sql`
          SELECT "employeeId", "dataInicio", "dataFim",
                 "periodo2Inicio", "periodo2Fim", "periodo3Inicio", "periodo3Fim"
          FROM vacation_periods
          WHERE "employeeId" IN (${empIdsSqlFer})
            AND "deletedAt" IS NULL
            AND status IN ('em_gozo', 'concluida')
            AND "dataInicio" IS NOT NULL
        `)) as any).rows || [];
        const mesIniFer = new Date(`${primeiroDiaMesFer}T12:00:00Z`);
        const mesFimFer = new Date(`${ultimoDiaMesFer}T12:00:00Z`);
        // Dedup por DIA de calendário (períodos sobrepostos não podem contar 2x)
        const feriasDiasSetSim = new Map<number, Set<string>>();
        for (const vp of feriasSimRows as any[]) {
          const periods = [
            { ini: vp.dataInicio, fim: vp.dataFim },
            { ini: vp.periodo2Inicio, fim: vp.periodo2Fim },
            { ini: vp.periodo3Inicio, fim: vp.periodo3Fim },
          ];
          for (const p of periods) {
            if (!p.ini) continue;
            const ini = new Date(String(p.ini).slice(0, 10) + 'T12:00:00Z');
            // dataFim nula = férias em curso → ativa até o fim do mês (mesma
            // semântica do motor do Vale, ~L2463).
            const fim = p.fim ? new Date(String(p.fim).slice(0, 10) + 'T12:00:00Z') : mesFimFer;
            const start = ini < mesIniFer ? mesIniFer : ini;
            const end = fim > mesFimFer ? mesFimFer : fim;
            if (start > end) continue;
            const empIdFer = Number(vp.employeeId);
            let daySet = feriasDiasSetSim.get(empIdFer);
            if (!daySet) { daySet = new Set(); feriasDiasSetSim.set(empIdFer, daySet); }
            for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
              daySet.add(d.toISOString().slice(0, 10));
            }
          }
        }
        // Rev. 4771 — AFASTAMENTO INSS: dias NÃO remunerados pela empresa no mês.
        // Empresa paga os 15 primeiros dias corridos (ini .. ini+14), mesmo
        // atravessando meses; do 16º dia em diante é INSS → sai da base do
        // salário. Fim em aberto: Afastado → até o fim do mês; quem já voltou
        // (status ≠ Afastado) sem fim conhecido → não desconta (fail-safe).
        for (const [empIdAf, w] of afastWindowMap) {
          const empRowAf: any = empList.find((e: any) => e.id === empIdAf);
          if (!empRowAf) continue;
          const inicioInssIso = addDias(w.ini, 15); // 1º dia por conta do INSS
          let fimIncl = w.fimIncl;
          if (!fimIncl) {
            if (empRowAf.status !== 'Afastado') continue; // já voltou, fim desconhecido
            fimIncl = ultimoDiaMesFer;
          }
          const ini = new Date(((inicioInssIso >= primeiroDiaMesFer) ? inicioInssIso : primeiroDiaMesFer) + 'T12:00:00Z');
          const fim = new Date(((fimIncl <= ultimoDiaMesFer) ? fimIncl : ultimoDiaMesFer) + 'T12:00:00Z');
          if (ini > fim) continue;
          let daySet = feriasDiasSetSim.get(empIdAf);
          if (!daySet) { daySet = new Set(); feriasDiasSetSim.set(empIdAf, daySet); }
          for (let d = new Date(ini); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
            daySet.add(d.toISOString().slice(0, 10));
          }
        }
        // Consolidação (férias + afastamento INSS, dedup por dia de calendário)
        for (const [empIdFer, daySet] of feriasDiasSetSim) {
          feriasMesMapSim.set(empIdFer, Math.min(diasNoMesSim, daySet.size));
        }
        if (feriasMesMapSim.size > 0) {
          console.log(`[SimPag FÉRIAS/AFAST] ${feriasMesMapSim.size} funcionário(s) com dias não remunerados na competência ${input.mesReferencia} → salário proporcional aplicado.`);
        }
      }

      // Rev. 3977 — Banco de Horas: acumula débitos de atraso/falta redirecionados
      // (aplicados em lote após o loop principal, uma vez que o period foi limpo acima).
      const bancoHorasDebitosBatch: { employeeId: number; companyId: number; minutos: number }[] = [];
      // Rev. 3983 — Banco de Horas: acumula débitos de DSR perdido redirecionados (separado do
      // débito de atraso/falta acima para aparecer discriminado no extrato). Cada DSR perdido
      // vale 7h20 (220h/30d = 7,3333h = 440min), valor fixo — não depende do dia da semana.
      const DSR_MINUTOS_POR_PERDA = 440;
      const bancoHorasDebitosDsrBatch: { employeeId: number; companyId: number; minutos: number; qtdDsr: number }[] = [];

      for (const emp of empList) {
        // Rev. 3984 — Aviso prévio encerrando no mês: se já foi decidido "não pagar",
        // o funcionário fica FORA da folha (não gera payroll_payments); se ainda não
        // há decisão, ele entra com status 'alerta_aviso_pendente' e fica de fora dos
        // totais até o RH decidir. Decisão "pagar" segue o fluxo normal.
        const avisoDataFimEmp = avisoEncerraNoMesMap.get(emp.id);
        const decisaoAvisoEmp = decisoesAvisoMap.get(emp.id);
        if (avisoDataFimEmp && decisaoAvisoEmp === 'nao_pagar') {
          excluidosPorDecisaoAviso.push({ employeeId: emp.id, nome: emp.nomeCompleto });
          continue;
        }
        const alertaAvisoPendente = !!avisoDataFimEmp && decisaoAvisoEmp !== 'pagar';
        const statusPagamentoRow = alertaAvisoPendente ? 'alerta_aviso_pendente' : 'simulado';

        // Rev. 4771 — Afastado com o mês 100% por conta do INSS: fora da folha
        // (nenhum dia devido pela empresa na competência).
        if (emp.status === 'Afastado' && (feriasMesMapSim.get(emp.id) || 0) >= diasNoMesSim) {
          continue;
        }

        const valorHora = parseBRL(emp.valorHora);
        // CLT horista: 220h = referência de 30 dias. Proporcional ao número real de dias do mês.
        const horasMensaisBaseEmp = emp.horasMensais ? Number(emp.horasMensais) : 220;
        const horasMensaisEmp = horasMensaisBaseEmp * diasNoMesSim / 30;
        // Rev. 4770 — dias de férias na competência saem da base do salário mensal
        // (já pagos via módulo de Férias). Proporção sobre os dias reais do mês.
        const diasFeriasNoMesEmp = feriasMesMapSim.get(emp.id) || 0;
        const fatorFeriasEmp = diasFeriasNoMesEmp > 0
          ? Math.max(0, diasNoMesSim - diasFeriasNoMesEmp) / diasNoMesSim
          : 1;
        // Rev. 4884 — Mensalista: salário FIXO (salarioBase), não varia com 28/29/30/31 dias.
        // Horista continua proporcional aos dias reais do mês (220h = referência de 30 dias).
        const isMensalistaEmp = (emp as any).tipoRemuneracao === 'mensalista';
        const salarioBruto = isMensalistaEmp
          ? (parseBRL(emp.salarioBase) || (valorHora * horasMensaisBaseEmp)) * fatorFeriasEmp
          : valorHora * horasMensaisEmp * fatorFeriasEmp;
        // HE = 0 — Hora Extra é módulo separado (he_periods)
        const valorHE = 0;

        // Adicionais Legais (insalubridade % × salário mínimo | periculosidade 30% × salário base),
        // pró-rata pelos dias de vigência dentro do mês. Integram a base de INSS/IRRF/FGTS.
        const salarioBaseEmpAdic = parseBRL(emp.salarioBase) || (valorHora * horasMensaisBaseEmp);
        const mesIni = `${year}-${String(month).padStart(2, '0')}-01`;
        const mesFim = `${year}-${String(month).padStart(2, '0')}-${String(diasNoMesSim).padStart(2, '0')}`;
        let adicionalTributavel = 0;
        const adicionaisDetalhesArr: any[] = [];
        for (const a of (adicionaisMap.get(emp.id) || [])) {
          const iniVig = a.dataInicio > mesIni ? a.dataInicio : mesIni;
          const fimVig = (a.dataFim && a.dataFim < mesFim) ? a.dataFim : mesFim;
          if (iniVig > fimVig) continue;
          const diasVig = (Number(fimVig.slice(8, 10)) - Number(iniVig.slice(8, 10))) + 1;
          const pct = Number(a.percentual) || 0;
          const baseCalc = a.tipo === 'insalubridade' ? salarioMinimoVigente : salarioBaseEmpAdic;
          const valorCheio = baseCalc * (pct / 100);
          const valorProRata = Math.round(valorCheio * (diasVig / diasNoMesSim) * 100) / 100;
          if (valorProRata <= 0) continue;
          adicionalTributavel += valorProRata;
          adicionaisDetalhesArr.push({
            tipo: a.tipo, percentual: pct, base: Math.round(baseCalc * 100) / 100,
            diasVigencia: diasVig, diasNoMes: diasNoMesSim, valor: valorProRata, tributavel: true,
          });
        }

        // Outras Receitas (lançamentos manuais do menu RH — ex.: reembolso).
        // Natureza indenizatória: soma no líquido, FORA da base de INSS/IRRF/FGTS.
        let outrasReceitasValor = 0;
        for (const p of (provFolhaMap.get(emp.id) || [])) {
          const v = parseBRL(p.valor);
          if (v <= 0) continue;
          outrasReceitasValor += v;
          adicionaisDetalhesArr.push({ tipo: p.tipo || 'outras_receitas', descricao: p.descricao || null, valor: v, tributavel: false });
        }

        const adicionaisValor = adicionalTributavel + outrasReceitasValor;
        const adicionaisDetalhes: any[] | null = adicionaisDetalhesArr.length > 0 ? adicionaisDetalhesArr : null;
        // Base tributável do mês (INSS/IRRF/FGTS/sindicato/pensão-percentual)
        const brutoTributavel = salarioBruto + adicionalTributavel;
        const totalProventos = salarioBruto + adicionaisValor;

        const adv = advMap.get(emp.id);
        // Rev. 4867 — vale cancelado/rejeitado NUNCA desconta na folha.
        // (ex.: Acacio jul/2026 — vale revertido na tela do Vale mas a folha
        // continuava lendo valorTotalVale sem olhar o status)
        const descontoAdiantamento = adv && adv.status !== 'rejeitado' ? parseBRL(adv.valorTotalVale) : 0;

        const faltaData = faltasMap.get(emp.id);
        const faltasQtdMes = faltaData?.totalFaltas || 0;
        const atrasosMinutos = faltaData?.totalMinutosAtraso || 0;

        const vrDiario = vrDiarioMap.get(emp.id) || 0;
        const vaLancamento = vaMap.get(emp.id) || 0;
        const descontoVaTotal = 0;
        const vtDiario = parseBRL(emp.vtValorDiario);
        const vtValorMensal = vtDiario * diasUteis;

        // Ajustes da Aferição do Escuro: redistribuir nos campos corretos
        // (faltas vão p/ "FALTAS", atrasos p/ "ATRASOS" e o resto p/ "OUTROS"=acertoEscuroValor)
        const adjustments = adjMap.get(emp.id) || [];
        let escFaltasValor = 0, escFaltasVr = 0, escFaltasVt = 0, escFaltasQtd = 0;
        let escAtrasosValor = 0;
        let acertoEscuroValor = 0;
        const acertoEscuroDetalhes = adjustments.map((a: any) => ({ data: a.data, tipo: a.tipo, valor: a.valorTotal, descricao: a.descricao }));
        const fmtDataBR = (d: any) => {
          if (!d) return '';
          const dt = typeof d === 'string' ? new Date(d) : d;
          if (isNaN(dt.getTime())) return String(d);
          const dd = String(dt.getUTCDate()).padStart(2, '0');
          const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const yy = dt.getUTCFullYear();
          return `${dd}/${mm}/${yy}`;
        };
        const escFaltasDias = adjustments.filter((a: any) => a.tipo === 'falta').map((a: any) => fmtDataBR(a.data));
        const escAtrasosDias = adjustments.filter((a: any) => a.tipo === 'atraso').map((a: any) => `${fmtDataBR(a.data)}${a.descricao ? ' (' + a.descricao + ')' : ''}`);
        for (const a of adjustments) {
          if (a.tipo === 'falta') {
            escFaltasValor += parseBRL(a.valorDesconto);
            escFaltasVr    += parseBRL(a.valorVrDesconto);
            escFaltasVt    += parseBRL(a.valorVtDesconto);
            escFaltasQtd   += 1;
          } else if (a.tipo === 'atraso') {
            escAtrasosValor += parseBRL(a.valorTotal);
          } else {
            acertoEscuroValor += parseBRL(a.valorTotal);
          }
        }

        const faltasQtd = faltasQtdMes + escFaltasQtd;
        const valorDiaFalta = valorDiaLegal(emp.salarioBase, valorHora);
        const descontoFaltasBase  = (faltasQtdMes * valorDiaFalta) + escFaltasValor;
        const descontoAtrasosBase = ((atrasosMinutos / 60) * valorHora) + escAtrasosValor;
        const descontoVrFaltas = (criteria.descontoVrFalta ? faltasQtdMes * vrDiario : 0) + escFaltasVr;
        const descontoVtFaltas = (criteria.descontoVtFalta ? faltasQtdMes * vtDiario : 0) + escFaltasVt;

        // DSR perdido (Lei 605/49 Art. 6º) — apenas DSR Falta (decisão RH FC, Rev. 1194)
        const dsrInfo = dsrMap.get(emp.id) || { qtdFalta: 0, valorFalta: 0 };
        const dsrFaltaValorAplicado = aplicarDsrFalta ? dsrInfo.valorFalta : 0;

        // Rev. 3977 — Banco de Horas: quando a empresa usa banco de horas (he_banco_horas=Sim)
        // e o funcionário NÃO tem a exceção bidirecional marcada, o valor que seria descontado
        // de atraso/falta é redirecionado como DÉBITO no saldo do banco de horas (valor cheio,
        // sem multiplicador), em vez de desconto monetário na folha.
        // Rev. 3983 — O DSR perdido (mesma condição de banco de horas) TAMBÉM é redirecionado como
        // débito de horas, só que discriminado num lançamento PRÓPRIO (tipo='debito_dsr', 7h20 fixas
        // por DSR perdido = 220h/30d), para o funcionário enxergar separadamente quantas horas são de
        // atraso/falta e quantas são de DSR. A regra de QUANDO se perde o DSR (Lei 605/49 Art. 6º — 1
        // DSR por semana com falta injustificada, não por falta) não muda, só o destino do valor.
        const usaBancoHorasAtrasoFalta = criteria.heBancoHoras && Number((emp as any).bancoHorasExcecao || 0) !== 1;
        let minutosDebitoBancoHoras = 0;
        if (usaBancoHorasAtrasoFalta && valorHora > 0 && (descontoFaltasBase > 0 || descontoAtrasosBase > 0)) {
          minutosDebitoBancoHoras = Math.round(((descontoFaltasBase + descontoAtrasosBase) / valorHora) * 60);
          if (minutosDebitoBancoHoras > 0) {
            bancoHorasDebitosBatch.push({
              employeeId: emp.id,
              companyId: (emp as any).companyId ?? input.companyId,
              minutos: minutosDebitoBancoHoras,
            });
          }
        }

        let minutosDebitoDsrBancoHoras = 0;
        if (usaBancoHorasAtrasoFalta && aplicarDsrFalta && dsrInfo.qtdFalta > 0) {
          minutosDebitoDsrBancoHoras = dsrInfo.qtdFalta * DSR_MINUTOS_POR_PERDA;
          bancoHorasDebitosDsrBatch.push({
            employeeId: emp.id,
            companyId: (emp as any).companyId ?? input.companyId,
            minutos: minutosDebitoDsrBancoHoras,
            qtdDsr: dsrInfo.qtdFalta,
          });
        }

        // Faltas/Atrasos e o DSR decorrente vão para o banco de horas quando ativo; sem banco de
        // horas, seguem monetários exatamente como antes.
        const descontoFaltas  = usaBancoHorasAtrasoFalta ? 0 : (descontoFaltasBase + dsrFaltaValorAplicado);
        const descontoAtrasos = usaBancoHorasAtrasoFalta ? 0 : descontoAtrasosBase;

        // PENSÃO ALIMENTÍCIA: cálculo dinâmico direto do cadastro do funcionário (Rev. 1205).
        // Não depende mais de payroll_adjustments nem de aprovação RH (a configuração da pensão
        // já é controlada no cadastro do colaborador). Base = bruto do mês (inclui HE aprovada)
        // OU salário mínimo vigente, conforme emp.pensaoBase.
        let descontoPensao = 0;
        if (Number(emp.pensaoAlimenticia) === 1) {
          if (emp.pensaoTipo === 'percentual') {
            const perc = (parseBRL(emp.pensaoPercentual) || 0) / 100;
            const heValor = heMap.get(emp.id) || 0;
            const baseBruto = brutoTributavel + heValor;
            const basePensao = emp.pensaoBase === 'salario_minimo' ? salarioMinimoVigente : baseBruto;
            descontoPensao = basePensao * perc;
          } else {
            // valor_fixo (default)
            descontoPensao = parseBRL(emp.pensaoValor) || 0;
          }
          if (descontoPensao < 0) descontoPensao = 0;
        }

        const vaValor = vaLancamento;
        const vrValorMensal = vrDiario * diasUteis;
        const seguroVidaValor = parseBRL(emp.seguroVida);
        const fgtsPerc = parseBRL(emp.fgtsPercentual) || 8;
        const fgtsValor = brutoTributavel * (fgtsPerc / 100);

        // INSS: se inssPercentual preenchido (>0), usa override manual; senão tabela progressiva (Lei 8.212/91)
        // Base inclui adicionais legais (insalubridade/periculosidade); outras receitas (indenizatórias) ficam fora.
        const inssPercManual = parseBRL(emp.inssPercentual) || 0;
        const inssValor = inssPercManual > 0
          ? brutoTributavel * (inssPercManual / 100)
          : calcularINSS(brutoTributavel);

        // IRRF: base = bruto - INSS - (dependentes × R$ 228,80) — Lei 7.713/88, IN RFB 2.141/2023
        const numDependentes = Number(emp.dependentesIr) || 0;
        const baseIrrf = Math.max(0, brutoTributavel - inssValor - (numDependentes * VALOR_DEPENDENTE_IR));
        const irrfValor = calcularIRRF(baseIrrf, brutoTributavel);

        // SINDICATO (CCT): 1% sobre salário bruto, com teto máximo de R$ 46,30/mês
        const SINDICATO_PERCENTUAL = 0.01;
        const SINDICATO_TETO = 46.30;
        const sindicatoValor = Math.min(brutoTributavel * SINDICATO_PERCENTUAL, SINDICATO_TETO);

        // EPI: somente alertas com status='aprovado' do mês de referência
        const epiAprovados = (epiAlertsMap.get(emp.id) || []).filter(
          (a: any) => a.status === 'aprovado'
        );
        const descontoEpi = epiAprovados.reduce((s: number, a: any) => s + Number(a.valor_total || 0), 0);

        // OUTROS: adjustments tipo='outros' aprovados pelo RH (seguro vida + escuro continuam automáticos)
        const outrosAdjs = (adjustmentsByEmp.get(emp.id) || []).filter(
          (a: any) => a.tipo === 'outros' && a.aprovadoRh === true
        );
        const outrosManuaisValor = outrosAdjs.reduce((s: number, a: any) => s + parseBRL(a.valorDesconto), 0);

        const obraDiasRows = obraMap.get(emp.id) || [];
        const totalDiasObra = obraDiasRows.reduce((s: number, r: any) => s + Number(r.dias), 0) || diasUteis;
        const rateioPorObra = obraDiasRows.map((r: any) => {
          const proporcao = Number(r.dias) / totalDiasObra;
          return {
            obraId: r.obraId, obraNome: r.obraNome || 'Sem obra', dias: Number(r.dias),
            proporcao: Math.round(proporcao * 10000) / 10000,
            salario: Math.round(salarioBruto * proporcao * 100) / 100,
            va: Math.round(vaValor * proporcao * 100) / 100,
            vt: Math.round(vtValorMensal * proporcao * 100) / 100,
            vr: Math.round(vrValorMensal * proporcao * 100) / 100,
            seguro: Math.round(seguroVidaValor * proporcao * 100) / 100,
            fgts: Math.round(fgtsValor * proporcao * 100) / 100,
            inss: Math.round(inssValor * proporcao * 100) / 100,
          };
        });

        const descontoConvenio = convenioMap.get(emp.id) || 0;

        // Rev. 4868 — Descontos em Folha (lançamentos manuais do menu RH)
        const descFolhaEmp = descFolhaMap.get(emp.id) || [];
        const descFolhaPensao = descFolhaEmp
          .filter((d: any) => d.tipo === 'pensao_alimenticia')
          .reduce((s: number, d: any) => s + parseBRL(d.valor), 0);
        const descFolhaOutros = descFolhaEmp
          .filter((d: any) => d.tipo !== 'pensao_alimenticia')
          .reduce((s: number, d: any) => s + parseBRL(d.valor), 0);

        // Rev. 1217: 11 categorias separadas de desconto, cada uma overridable.
        // Cada categoria entra como uma coluna na UI; total = soma dessas 11.
        // VA agora faz parte de "Outros" (junto com seguro vida, acerto escuro, outros manuais).
        const calcVale = descontoAdiantamento;
        const calcInss = inssValor;
        const calcIr = irrfValor;
        // Rev. 3987 — VR (dias de falta) é tratado só no módulo Vale Alimentação (alertas de
        // falta/abono), NUNCA entra na folha (evita duplicidade e a ilusão de "desconto de
        // falta" na coluna FALTAS). VT (dias de falta) continua entrando na folha, mas some
        // à coluna VT (não mistura mais com FALTAS).
        const calcFaltas = descontoFaltas; // sem atrasos, sem VR/VT
        const calcAtrasos = descontoAtrasos;
        const calcSindicato = sindicatoValor;
        const calcPensao = descontoPensao + descFolhaPensao;
        const calcVt = vtValorMensal + descontoVtFaltas;
        const calcConvenio = descontoConvenio;
        const calcEpi = descontoEpi;
        const calcOutros = seguroVidaValor + acertoEscuroValor + outrosManuaisValor + descontoVaTotal + descFolhaOutros;

        // Aplica overrides manuais (se mantidos)
        const ovr = overridesMap.get(emp.id);
        const ovrManuais: any = { ...(ovr?.manuais || {}) };
        const ovrHist: any = { ...(ovr?.historico || {}) };
        // Compat legado (Rev. 1217): chave antiga 'va' agora compõe 'outros'.
        if (ovrManuais.va != null) {
          if (ovrManuais.outros == null) ovrManuais.outros = Number(ovrManuais.va);
          delete ovrManuais.va;
          if (ovrHist.va) { delete ovrHist.va; }
        }
        const finalVale = ovrManuais.vale != null ? Number(ovrManuais.vale) : calcVale;
        const finalInss = ovrManuais.inss != null ? Number(ovrManuais.inss) : calcInss;
        const finalIr = ovrManuais.ir != null ? Number(ovrManuais.ir) : calcIr;
        const finalFaltas = ovrManuais.faltas != null ? Number(ovrManuais.faltas) : calcFaltas;
        const finalAtrasos = ovrManuais.atrasos != null ? Number(ovrManuais.atrasos) : calcAtrasos;
        const finalSindicato = ovrManuais.sindicato != null ? Number(ovrManuais.sindicato) : calcSindicato;
        const finalPensao = ovrManuais.pensao != null ? Number(ovrManuais.pensao) : calcPensao;
        const finalVt = ovrManuais.vt != null ? Number(ovrManuais.vt) : calcVt;
        const finalConvenio = ovrManuais.convenio != null ? Number(ovrManuais.convenio) : calcConvenio;
        const finalEpi = ovrManuais.epi != null ? Number(ovrManuais.epi) : calcEpi;
        const finalOutros = ovrManuais.outros != null ? Number(ovrManuais.outros) : calcOutros;

        const totalDescontos = finalVale + finalInss + finalIr + finalFaltas + finalAtrasos
                              + finalSindicato + finalPensao + finalVt + finalConvenio + finalEpi + finalOutros;
        // Rev. 3989 — líquido da diferença retroativa do dissídio (já líquida de INSS/IRRF
        // próprios, calculada em separado); somada diretamente no líquido do mês quando o
        // toggle está ativo (contador optou por pagar tudo em 1 holerite combinado).
        const diferencaDissidioValor = somarDiferencaDissidio ? (diferencaDissidioMap.get(emp.id) || 0) : 0;
        const salarioLiquidoExato = totalProventos - totalDescontos + diferencaDissidioValor;
        // Rev. 3293 — arredonda p/ R$ 1 com carry-forward; salarioLiquido = valor PAGO.
        const saldoAntFolha = saldoAnteriorArred(saldosArredFolha, input.companyId, emp.id, ordemFolha);
        const arrFolha = aplicarArredondamentoReal(salarioLiquidoExato, saldoAntFolha);
        const salarioLiquido = arrFolha.valorPago;
        ledgerInsertRowsFolha.push(sql`(${input.companyId}, ${emp.id}, 'folha', ${input.mesReferencia}, ${ordemFolha},
          ${formatMoney(salarioLiquidoExato)}, ${formatMoney(saldoAntFolha)}, ${formatMoney(arrFolha.ajuste)}, ${formatMoney(salarioLiquido)}, ${formatMoney(arrFolha.residual)})`);

        const manuaisJsonStr = Object.keys(ovrManuais).length > 0 ? JSON.stringify(ovrManuais) : null;
        const histJsonStr = Object.keys(ovrHist).length > 0 ? JSON.stringify(ovrHist) : null;

        paymentInsertRows.push(sql`(${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${emp.valorHora}, ${criteria.cargaHorariaDiaria}, ${diasUteis},
          ${formatMoney(salarioBruto)}, ${formatMoney(valorHE)}, ${formatMoney(totalProventos)},
          ${formatMoney(finalVale)}, ${formatMoney(descontoFaltas)}, ${faltasQtd}, ${formatMoney(finalAtrasos)}, ${atrasosMinutos},
          ${formatMoney(descontoVrFaltas)}, ${formatMoney(descontoVtFaltas)}, ${formatMoney(finalPensao)}, ${formatMoney(finalInss)}, ${formatMoney(fgtsValor)}, ${formatMoney(finalOutros)},
          ${formatMoney(finalConvenio)}, ${formatMoney(finalIr)}, ${formatMoney(finalSindicato)}, ${formatMoney(finalEpi)},
          ${formatMoney(totalDescontos)}, ${formatMoney(acertoEscuroValor)}, ${JSON.stringify(acertoEscuroDetalhes)}, ${formatMoney(salarioLiquido)},
          ${formatMoney(arrFolha.ajuste)}, ${formatMoney(salarioLiquidoExato)},
          ${statusPagamentoRow}, ${dataPagamentoPrevista}, ${manuaisJsonStr}, ${histJsonStr},
          ${formatMoney(adicionaisValor)}, ${adicionaisDetalhes ? JSON.stringify(adicionaisDetalhes) : null})`);

        // Rev. 3984 — enquanto pendente de decisão, o funcionário aparece na lista
        // (para o alerta) mas NÃO entra nos totais da folha.
        if (!alertaAvisoPendente) {
          grandTotalLiquido += salarioLiquido;
          grandTotalBruto += salarioBruto;
          grandTotalDescontos += totalDescontos;
        }

        results.push({
          employeeId: emp.id, nome: emp.nomeCompleto, funcao: emp.funcao, codigoInterno: emp.codigoInterno,
          salarioBruto, valorHE, totalProventos,
          // Rev. 3278 — diferença salarial retroativa do dissídio (provento).
          adicionaisValor, adicionaisDetalhes,
          // Valores finais (com overrides aplicados) — usados na tabela (11 categorias)
          descontoAdiantamento: finalVale, descontoInss: finalInss, descontoIrrf: finalIr,
          descontoFaltas, faltasQtd, descontoAtrasos: finalAtrasos, atrasosMinutos,
          descontoVrFaltas, descontoVtFaltas, descontoVaTotal,
          descontoPensao: finalPensao, descontoSindicato: finalSindicato, descontoEpi: finalEpi,
          descontoFgts: fgtsValor, acertoEscuroValor, descontoConvenio: finalConvenio,
          descontoOutros: finalOutros,
          totalDescontos, salarioLiquido, salarioLiquidoExato, ajusteArredondamento: arrFolha.ajuste, saldoAnteriorArredondamento: saldoAntFolha, dataPagamentoPrevista, vaValor,
          // Rev. 3989 — diferença retroativa do dissídio somada no líquido (transparência na UI)
          diferencaDissidioValor, diferencaDissidioAplicada: somarDiferencaDissidio && diferencaDissidioValor > 0,
          // Rev. 3984 — aviso prévio encerrando no mês, ainda sem decisão do RH.
          alertaAvisoEncerrado: alertaAvisoPendente,
          avisoDataFim: avisoDataFimEmp || null,
          vtValor: finalVt, vtDiario, vrValor: vrValorMensal, vrDiario, seguroVidaValor, rateioPorObra,
          // Memorial de cálculo (valores originais antes de overrides) — 11 chaves alinhadas com a UI
          calculadoOriginal: {
            vale: calcVale, inss: calcInss, ir: calcIr,
            faltas: calcFaltas, atrasos: calcAtrasos,
            sindicato: calcSindicato, pensao: calcPensao,
            vt: calcVt, convenio: calcConvenio, epi: calcEpi, outros: calcOutros,
          },
          memorialCalculo: {
            valorHora: parseBRL(emp.valorHora || '0'),
            cargaHorariaDiaria: criteria.cargaHorariaDiaria,
            diasUteis,
            // Faltas
            faltasQtdMes, escFaltasQtd,
            faltasMesDias: (faltaData?.diasFalta || []).filter((d: any) => d),
            atrasosMesDias: (faltaData?.diasAtraso || []).filter((d: any) => d),
            escFaltasDias,
            escAtrasosDias,
            descontoFaltasMes: faltasQtdMes * valorDiaFalta,
            valorDiaFalta,
            salarioBaseRef: parseBRL(emp.salarioBase || '0'),
            descontoFaltasEscuro: escFaltasValor,
            descontoVrFaltasMes: criteria.descontoVrFalta ? faltasQtdMes * vrDiario : 0,
            descontoVrFaltasEscuro: escFaltasVr,
            descontoVtFaltasMes: criteria.descontoVtFalta ? faltasQtdMes * vtDiario : 0,
            descontoVtFaltasEscuro: escFaltasVt,
            // DSR Falta (Lei 605/49 Art. 6º)
            dsrFaltaQtd: dsrInfo.qtdFalta,
            dsrFaltaValor: dsrInfo.valorFalta,
            dsrFaltaAplicado: aplicarDsrFalta,
            // Rev. 3983 — DSR redirecionado para o banco de horas (quando ativo)
            dsrRedirecionadoBancoHoras: usaBancoHorasAtrasoFalta && aplicarDsrFalta,
            dsrMinutosBancoHoras: minutosDebitoDsrBancoHoras,
            // Atrasos
            atrasosMinutos,
            descontoAtrasosMinutos: (atrasosMinutos / 60) * valorHora,
            descontoAtrasosEscuro: escAtrasosValor,
            // Rev. 3981 — Banco de Horas: quando ativo p/ este funcionário, o valor base de
            // falta/atraso (mês corrente) NÃO é descontado em dinheiro — vira débito de minutos
            // no banco de horas. Expondo os flags p/ a UI não exibir "desconto" enganoso.
            usaBancoHorasAtrasoFalta,
            minutosDebitoBancoHoras,
            // INSS
            inssPercentual: parseBRL(emp.inssPercentual || '0'),
            // VT
            vtDiario, vtValorMensal,
            // VA
            vaLancamento,
            // Outros
            descontoPensao, seguroVidaValor, acertoEscuroValor,
            pensaoTipo: emp.pensaoTipo, pensaoPercentual: emp.pensaoPercentual, pensaoValor: emp.pensaoValor,
            // Adjustments detalhe
            acertoEscuroDetalhes,
          },
          descontosManuais: ovrManuais,
          descontosManuaisHistorico: ovrHist,
          banco: emp.banco || null, bancoNome: emp.bancoNome || null,
          agencia: emp.agencia || null, conta: emp.conta || null,
          tipoConta: emp.tipoConta || null, tipoChavePix: emp.tipoChavePix || null,
          chavePix: emp.chavePix || null, bancoPix: emp.bancoPix || null, cpf: emp.cpf || null,
          // Rev. — Conta da Empresa para Pagamento (chave de agrupamento da
          // remessa por banco). Quando ausente → grupo "Sem conta definida".
          contaEmpresaId: emp.contaBancariaEmpresaId || null,
          ...(emp.contaBancariaEmpresaId && contaEmpresaMap.has(emp.contaBancariaEmpresaId) ? (() => {
            const ce: any = contaEmpresaMap.get(emp.contaBancariaEmpresaId);
            return {
              contaEmpresaBanco: ce.banco || null,
              contaEmpresaCodigoBanco: ce.codigoBanco || null,
              contaEmpresaAgencia: ce.agencia || null,
              contaEmpresaConta: ce.conta || null,
              contaEmpresaTipo: ce.tipoConta || null,
              contaEmpresaApelido: ce.apelido || null,
            };
          })() : {
            contaEmpresaBanco: null, contaEmpresaCodigoBanco: null,
            contaEmpresaAgencia: null, contaEmpresaConta: null,
            contaEmpresaTipo: null, contaEmpresaApelido: null,
          }),
        });
      }

      // Batch INSERT all payments in one query
      if (paymentInsertRows.length > 0) {
        await db.execute(sql`
          INSERT INTO payroll_payments ("companyId", "employeeId", "mesReferencia", "valorHora", "cargaHorariaDiaria", "diasUteisNoMes",
            "salarioBrutoMes", "horasExtrasValor", "totalProventos",
            "descontoAdiantamento", "descontoFaltas", "descontoFaltasQtd", "descontoAtrasos", "descontoAtrasosMinutos",
            "descontoVrFaltas", "descontoVtFaltas", "descontoPensao", "descontoInss", "descontoFgts", "descontoOutros",
            "descontoConvenio", "descontoIrrf", "descontoSindicato", "descontoEpi",
            "totalDescontos", "acertoEscuroValor", "acertoEscuroDetalhes", "salarioLiquido",
            "ajusteArredondamento", "salarioLiquidoExato",
            status, "dataPagamentoPrevista", "descontosManuaisJson", "descontosManuaisHistorico",
            "adicionaisValor", "adicionaisDetalhes")
          VALUES ${sql.join(paymentInsertRows, sql`,`)}
        `);
      }

      // Rev. 3293 — grava o ledger de arredondamento da folha (carry-forward auditável).
      if (ledgerInsertRowsFolha.length > 0) {
        await db.execute(sql`
          INSERT INTO payroll_rounding_ledger ("companyId", "employeeId", "origem", "mesReferencia", "ordem",
            "valorExato", "saldoAnterior", "ajusteAplicado", "valorPago", "residualGerado")
          VALUES ${sql.join(ledgerInsertRowsFolha, sql`,`)}
        `);
      }

      // Reaplica o LÍQUIDO editado pelo Master (mantido pelo RH na decisão de ressimulação):
      // sobrescreve o líquido recalculado, reanexa o marcador e remove o ledger 'folha'
      // (o override é o pago final, sem residual). Roda APÓS o INSERT do ledger.
      if (liquidoOverridesMap.size > 0) {
        const mantidos: number[] = [];
        for (const [empId, ovr] of liquidoOverridesMap) {
          const f = results.find((x: any) => Number(x.employeeId) === empId);
          if (!f) continue; // funcionário saiu da folha nesta ressimulação
          mantidos.push(empId);
          grandTotalLiquido += ovr.salarioLiquido - Number(f.salarioLiquido || 0);
          f.salarioLiquido = ovr.salarioLiquido;
          f.salarioLiquidoExato = ovr.salarioLiquido;
          f.ajusteArredondamento = 0;
          f.observacoes = ((f.observacoes ? f.observacoes + " " : "") + ovr.obs).trim();
          f.liquidoEditadoManualmente = true;
          const liqStr = ovr.salarioLiquido.toFixed(2);
          await db.execute(sql`
            UPDATE payroll_payments
            SET "salarioLiquido" = ${liqStr},
                "salarioLiquidoExato" = ${liqStr},
                "ajusteArredondamento" = ${"0.00"},
                "observacoes" = COALESCE("observacoes", '') || ${" " + ovr.obs},
                "updatedAt" = NOW()
            WHERE "companyId" = ${input.companyId}
              AND "mesReferencia" = ${input.mesReferencia}
              AND "employeeId" = ${empId}
          `);
        }
        if (mantidos.length > 0) {
          await db.execute(sql`
            DELETE FROM payroll_rounding_ledger
            WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
              AND "origem" = 'folha' AND "employeeId" IN (${sql.join(mantidos.map(id => sql`${id}`), sql`, `)})
          `);
        }
      }

      // Rev. 3977 — Banco de Horas: grava débitos de atraso/falta redirecionados (idempotente —
      // débitos antigos desta competência já foram revertidos/apagados no início da simulação).
      if (bancoHorasDebitosBatch.length > 0) {
        const _debitoDescricao977 = `Débito atraso/falta ${input.mesReferencia} (banco de horas)`;
        const _dataFimMes977 = `${year}-${String(month).padStart(2, '0')}-${String(diasNoMesSim).padStart(2, '0')}`;
        for (const d of bancoHorasDebitosBatch) {
          await db.execute(sql`
            INSERT INTO banco_horas_saldo ("employeeId", "companyId", "saldoMinutos", "atualizadoEm")
            VALUES (${d.employeeId}, ${d.companyId}, ${-d.minutos}, NOW())
            ON CONFLICT ("employeeId", "companyId") DO UPDATE SET
              "saldoMinutos" = banco_horas_saldo."saldoMinutos" + EXCLUDED."saldoMinutos",
              "atualizadoEm" = NOW()
          `);
          // Rev. 4000 — minutos gravado POSITIVO (magnitude), igual à convenção do débito manual;
          // o sinal é inferido pelo `tipo` nas leituras (getSaldoBancoMensal etc.), nunca pré-embutido
          // na coluna. Gravar negativo aqui causava dupla-negação nas somas "ELSE -minutos".
          await db.execute(sql`
            INSERT INTO banco_horas_lancamentos ("employeeId", "companyId", tipo, minutos, "minutosBase", "minutosAcrescimo", descricao, data, "criadoPor")
            VALUES (${d.employeeId}, ${d.companyId}, 'debito_atraso_falta', ${d.minutos}, ${d.minutos}, 0,
              ${_debitoDescricao977}, ${_dataFimMes977}::date, 'Sistema (folha)')
          `);
        }
      }

      // Rev. 3983 — Banco de Horas: grava débitos de DSR perdido redirecionados, num tipo PRÓPRIO
      // ('debito_dsr') para aparecer discriminado no extrato, separado do atraso/falta acima.
      if (bancoHorasDebitosDsrBatch.length > 0) {
        const _dataFimMesDsr983 = `${year}-${String(month).padStart(2, '0')}-${String(diasNoMesSim).padStart(2, '0')}`;
        for (const d of bancoHorasDebitosDsrBatch) {
          const _debitoDescricaoDsr983 = `Débito DSR ${input.mesReferencia} (banco de horas) — ${d.qtdDsr} DSR${d.qtdDsr > 1 ? 's' : ''} perdido${d.qtdDsr > 1 ? 's' : ''} x 7h20`;
          await db.execute(sql`
            INSERT INTO banco_horas_saldo ("employeeId", "companyId", "saldoMinutos", "atualizadoEm")
            VALUES (${d.employeeId}, ${d.companyId}, ${-d.minutos}, NOW())
            ON CONFLICT ("employeeId", "companyId") DO UPDATE SET
              "saldoMinutos" = banco_horas_saldo."saldoMinutos" + EXCLUDED."saldoMinutos",
              "atualizadoEm" = NOW()
          `);
          // Rev. 4000 — mesma correção de sinal (positivo) do bloco de atraso/falta acima.
          await db.execute(sql`
            INSERT INTO banco_horas_lancamentos ("employeeId", "companyId", tipo, minutos, "minutosBase", "minutosAcrescimo", descricao, data, "criadoPor")
            VALUES (${d.employeeId}, ${d.companyId}, 'debito_dsr', ${d.minutos}, ${d.minutos}, 0,
              ${_debitoDescricaoDsr983}, ${_dataFimMesDsr983}::date, 'Sistema (folha)')
          `);
        }
      }

      // Vale fora da folha: funcionários com vale calculado mas não incluídos na folha mensal
      const empIdsNaFolha = new Set(empList.map((e: any) => Number(e.id)));
      const valeAdvRows = ((await db.execute(sql`
        SELECT pa."employeeId", pa."valorTotalVale", pa."valorLiquidoVale", e."nomeCompleto", e.funcao
        FROM payroll_advances pa
        LEFT JOIN employees e ON e.id = pa."employeeId"
        WHERE pa."companyId" IN (${sql.join(allCompanyIds.map(id => sql`${id}`), sql`,`)})
          AND pa."mesReferencia" = ${input.mesReferencia}
          AND pa.status = 'calculado'
          -- Rev. 2733 — Não listar como "vale fora da folha" os DESLIGADOS que já
          -- haviam saído ANTES da competência (advance stale de mês anterior que
          -- nunca foi recalculado). Mantém os desligados-com-aviso cujo aviso
          -- prévio (não indenizado, não cancelado) sobrepõe o mês — esses têm vale
          -- proporcional legítimo e podem estar fora da folha. Espelha a regra de
          -- elegibilidade do motor (calcularVales L2122/2128/2129).
          AND NOT (
            e.status IN ('Desligado', 'Lista_Negra')
            AND NOT EXISTS (
              SELECT 1 FROM termination_notices tn
              WHERE tn."employeeId" = e.id
                AND tn."deletedAt" IS NULL
                AND tn.status NOT IN ('cancelado')
                AND tn.tipo NOT LIKE '%indenizado%'
                AND tn."dataFim" >= ${primeiroDiaMesAviso}::date
                AND tn."dataInicio" <= ${ultimoDiaMesAviso}::date
            )
          )
      `)) as any).rows || [];
      const valeForaDaFolha = valeAdvRows
        .filter((r: any) => !empIdsNaFolha.has(Number(r.employeeId)))
        .map((r: any) => ({
          employeeId: Number(r.employeeId),
          nome: r.nomeCompleto || `ID ${r.employeeId}`,
          funcao: r.funcao || null,
          valorBruto: parseFloat(r.valorTotalVale) || 0,
          valorLiquido: parseFloat(r.valorLiquidoVale) || 0,
        }))
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
      // Soma pelo Líquido para coerência com a UI (cada item exibe valorBruto, total exibe a soma do bruto)
      const totalValeForaDaFolhaBruto = valeForaDaFolha.reduce((s: number, r: any) => s + r.valorBruto, 0);
      const totalValeForaDaFolhaLiquido = valeForaDaFolha.reduce((s: number, r: any) => s + r.valorLiquido, 0);

      // Rev. 3984 — alerta "pagar ou não?" (aviso prévio encerrando no mês, sem decisão ainda)
      const alertasAvisoEncerrado = (results as any[])
        .filter(r => r.alertaAvisoEncerrado)
        .map(r => ({ employeeId: r.employeeId, nome: r.nome, funcao: r.funcao, avisoDataFim: r.avisoDataFim, valorLiquidoEstimado: r.salarioLiquido }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

      const pagamentoResultPayload = {
        totalFuncionarios: empList.length,
        totalCltAtivos: allCltAtivos.length,
        totalBruto: grandTotalBruto,
        totalDescontos: grandTotalDescontos,
        totalLiquido: grandTotalLiquido,
        dataPagamentoPrevista,
        diasUteis,
        funcionarios: results,
        divergencias,
        valeForaDaFolha,
        totalValeForaDaFolha: Math.round(totalValeForaDaFolhaBruto * 100) / 100,
        totalValeForaDaFolhaLiquido: Math.round(totalValeForaDaFolhaLiquido * 100) / 100,
        pontoProcessado,
        timecardDailyCount,
        // Rev. 3984 — funcionários com aviso prévio encerrando no mês aguardando decisão
        // "pagar ou não?" (ficam FORA dos totais acima até serem decididos).
        alertasAvisoEncerrado,
        excluidosPorDecisaoAviso,
        message: divergencias.length > 0
          ? `Simulação concluída: ${empList.length} de ${allCltAtivos.length} CLTs ativos processados. ATENÇÃO: ${divergencias.length} funcionário(s) excluído(s) da folha — verifique as divergências.`
          : alertasAvisoEncerrado.length > 0
          ? `Simulação concluída: ${empList.length} funcionários, líquido total R$ ${formatMoney(grandTotalLiquido)}. ATENÇÃO: ${alertasAvisoEncerrado.length} funcionário(s) com aviso prévio encerrando no mês aguardam decisão.`
          : `Simulação concluída: ${empList.length} funcionários, líquido total R$ ${formatMoney(grandTotalLiquido)}`,
      };
      const pagJson = JSON.stringify(pagamentoResultPayload);

      // Update period
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'pagamento_simulado',
          "pagamentoSimuladoEm" = NOW(),
          "pagamentoSimuladoPor" = ${ctx.user.name || "Sistema"},
          "totalSalarioBruto" = ${formatMoney(grandTotalBruto)},
          "totalDescontos" = ${formatMoney(grandTotalDescontos)},
          "totalLiquido" = ${formatMoney(grandTotalLiquido)},
          "aplicarDsrFalta"  = ${aplicarDsrFalta  ? 1 : 0},
          "aplicarDsrAtraso" = 0,
          "somarDiferencaDissidio" = ${somarDiferencaDissidio ? 1 : 0},
          "pagamentoResultJson" = ${pagJson}
          ${input.pontoInicioManual ? sql`, "pontoInicio" = ${input.pontoInicioManual}` : sql``}
          ${input.pontoFimManual ? sql`, "pontoFim" = ${input.pontoFimManual}` : sql``}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      return { ...pagamentoResultPayload, aplicarDsrFalta, somarDiferencaDissidio };
    }),

  // ============================================================
  // 6.1. EDITAR DESCONTO MANUAL (override)
  // ============================================================
  editarDescontoManual: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      employeeId: z.number(),
      campo: z.enum(['vale', 'inss', 'ir', 'faltas', 'atrasos', 'sindicato', 'pensao', 'vt', 'convenio', 'epi', 'outros']),
      valorNovo: z.number().nullable(), // null = reverter ao calculado
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Guard: bloqueia edição se pagamento estiver consolidado
      const guard = ((await db.execute(sql`
        SELECT "pagamentoConsolidadoEm", "pagamentoResultJson"
        FROM payroll_periods
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      if (guard.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Período de folha não encontrado" });
      }
      if (guard[0].pagamentoConsolidadoEm) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pagamento consolidado — desconsolide para editar" });
      }
      const payload = (() => { try { return JSON.parse(guard[0].pagamentoResultJson || '{}'); } catch { return {}; } })();
      const funcionarios: any[] = payload.funcionarios || [];
      const idx = funcionarios.findIndex(f => Number(f.employeeId) === Number(input.employeeId));
      if (idx < 0) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado na folha" });
      const f = funcionarios[idx];

      // Carrega manuais/historico atuais
      const manuais = { ...(f.descontosManuais || {}) };
      const historico = { ...(f.descontosManuaisHistorico || {}) };
      const calc = f.calculadoOriginal || {};

      const userName = ctx.user?.name || ctx.user?.email || 'Sistema';
      const agora = new Date().toISOString();

      if (input.valorNovo == null) {
        // Reverter ao calculado
        delete manuais[input.campo];
        delete historico[input.campo];
      } else {
        const valorOriginal = (calc as any)[input.campo] ?? 0;
        manuais[input.campo] = Math.round(input.valorNovo * 100) / 100;
        // Preserva valorOriginal da PRIMEIRA edição (não sobrescreve)
        if (!historico[input.campo]) {
          historico[input.campo] = {
            valorOriginal: Math.round(valorOriginal * 100) / 100,
            alteradoPor: userName,
            alteradoEm: agora,
            motivo: input.motivo || null,
          };
        } else {
          historico[input.campo] = {
            ...historico[input.campo],
            alteradoPor: userName,
            alteradoEm: agora,
            motivo: input.motivo || historico[input.campo].motivo || null,
          };
        }
      }

      // Rev. 1217: 11 categorias separadas. Total = soma das 11.
      const finalVale = manuais.vale != null ? Number(manuais.vale) : Number(calc.vale || 0);
      const finalInss = manuais.inss != null ? Number(manuais.inss) : Number(calc.inss || 0);
      const finalIr = manuais.ir != null ? Number(manuais.ir) : Number(calc.ir || 0);
      const finalFaltas = manuais.faltas != null ? Number(manuais.faltas) : Number(calc.faltas || 0);
      const finalAtrasos = manuais.atrasos != null ? Number(manuais.atrasos) : Number(calc.atrasos || 0);
      const finalSindicato = manuais.sindicato != null ? Number(manuais.sindicato) : Number(calc.sindicato || 0);
      const finalPensao = manuais.pensao != null ? Number(manuais.pensao) : Number(calc.pensao || 0);
      const finalVt = manuais.vt != null ? Number(manuais.vt) : Number(calc.vt || 0);
      const finalConvenio = manuais.convenio != null ? Number(manuais.convenio) : Number(calc.convenio || 0);
      const finalEpi = manuais.epi != null ? Number(manuais.epi) : Number(calc.epi || 0);
      const finalOutros = manuais.outros != null ? Number(manuais.outros) : Number(calc.outros || 0);

      const totalDescontos = finalVale + finalInss + finalIr + finalFaltas + finalAtrasos
                            + finalSindicato + finalPensao + finalVt + finalConvenio + finalEpi + finalOutros;
      const totalProventos = Number(f.totalProventos || 0);
      // Rev. 3989 — preserva a diferença do dissídio já somada (se o toggle estava ativo
      // na simulação) ao recalcular o líquido após uma edição manual de desconto.
      const diferencaDissidioValor = Number(f.diferencaDissidioValor || 0);
      const salarioLiquidoExato = totalProventos - totalDescontos + diferencaDissidioValor;
      // Rev. 3293 — reaplica arredondamento p/ R$ 1 com carry-forward ao editar desconto
      // manual; sem isto o líquido voltava a ter centavos e o ledger/colunas *Exato
      // ficavam defasados (o pago da folha deixava de ser múltiplo inteiro).
      const ordemFolhaEdit = ordemArredondamento(input.mesReferencia, "folha");
      const saldosArredEdit = await carregarSaldosArredondamento(db, [input.companyId]);
      const saldoAntEdit = saldoAnteriorArred(saldosArredEdit, input.companyId, input.employeeId, ordemFolhaEdit);
      const arrEdit = aplicarArredondamentoReal(salarioLiquidoExato, saldoAntEdit);
      const salarioLiquido = arrEdit.valorPago;

      // Atualiza objeto funcionario no payload (mantém colunas concretas em sincronia para a UI)
      funcionarios[idx] = {
        ...f,
        descontoAdiantamento: finalVale,
        descontoInss: finalInss,
        descontoIrrf: finalIr,
        descontoAtrasos: finalAtrasos,
        descontoSindicato: finalSindicato,
        descontoPensao: finalPensao,
        vtValor: finalVt,
        descontoConvenio: finalConvenio,
        descontoEpi: finalEpi,
        descontoOutros: finalOutros,
        totalDescontos,
        salarioLiquido,
        salarioLiquidoExato,
        ajusteArredondamento: arrEdit.ajuste,
        saldoAnteriorArredondamento: saldoAntEdit,
        descontosManuais: manuais,
        descontosManuaisHistorico: historico,
      };

      // Recalcula totais agregados
      const grandTotalDescontos = funcionarios.reduce((s, x) => s + Number(x.totalDescontos || 0), 0);
      const grandTotalLiquido = funcionarios.reduce((s, x) => s + Number(x.salarioLiquido || 0), 0);
      payload.funcionarios = funcionarios;
      payload.totalDescontos = grandTotalDescontos;
      payload.totalLiquido = grandTotalLiquido;

      // Persiste no payroll_payments
      // Estratégia: mantemos os componentes calculados intactos nas colunas concretas (descontoFaltas,
      // descontoAtrasos, descontoPensao, acertoEscuroValor etc.) e gravamos os overrides apenas no JSON.
      // Apenas vale e INSS, que têm coluna 1:1 sem composição, recebem write na coluna concreta —
      // assim reports legados continuam funcionando para esses dois campos.
      // O totalDescontos e salarioLiquido sempre refletem os overrides aplicados.
      const manuaisStr = Object.keys(manuais).length > 0 ? JSON.stringify(manuais) : null;
      const histStr = Object.keys(historico).length > 0 ? JSON.stringify(historico) : null;

      const setFragments: any[] = [
        sql`"totalDescontos" = ${formatMoney(totalDescontos)}`,
        sql`"salarioLiquido" = ${formatMoney(salarioLiquido)}`,
        sql`"ajusteArredondamento" = ${formatMoney(arrEdit.ajuste)}`,
        sql`"salarioLiquidoExato" = ${formatMoney(salarioLiquidoExato)}`,
        sql`"descontosManuaisJson" = ${manuaisStr}::jsonb`,
        sql`"descontosManuaisHistorico" = ${histStr}::jsonb`,
        sql`"updatedAt" = NOW()`,
      ];
      if (input.campo === 'vale') setFragments.push(sql`"descontoAdiantamento" = ${formatMoney(finalVale)}`);
      if (input.campo === 'inss') setFragments.push(sql`"descontoInss" = ${formatMoney(finalInss)}`);

      await db.execute(sql`
        UPDATE payroll_payments
        SET ${sql.join(setFragments, sql`, `)}
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
      `);

      // Rev. 3293 — regrava a linha 'folha' do ledger de arredondamento (idempotente:
      // DELETE+INSERT) p/ o carry-forward do próximo evento refletir o líquido editado.
      await db.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "employeeId" = ${input.employeeId} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'folha'`);
      await db.execute(sql`
        INSERT INTO payroll_rounding_ledger ("companyId", "employeeId", "origem", "mesReferencia", "ordem",
          "valorExato", "saldoAnterior", "ajusteAplicado", "valorPago", "residualGerado")
        VALUES (${input.companyId}, ${input.employeeId}, 'folha', ${input.mesReferencia}, ${ordemFolhaEdit},
          ${formatMoney(salarioLiquidoExato)}, ${formatMoney(saldoAntEdit)}, ${formatMoney(arrEdit.ajuste)}, ${formatMoney(salarioLiquido)}, ${formatMoney(arrEdit.residual)})
      `);

      // Atualiza payroll_periods com payload novo + totais
      await db.execute(sql`
        UPDATE payroll_periods SET
          "totalDescontos" = ${formatMoney(grandTotalDescontos)},
          "totalLiquido" = ${formatMoney(grandTotalLiquido)},
          "pagamentoResultJson" = ${JSON.stringify(payload)}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      return {
        funcionario: funcionarios[idx],
        totalDescontos: grandTotalDescontos,
        totalLiquido: grandTotalLiquido,
      };
    }),

  // ============================================================
  // 6.2. EDITAR LÍQUIDO DIRETO (override manual, mesmo padrão do editarLiquidoVale)
  // ============================================================
  // Rev. 3997 — usuário pediu, "assim como na folha do vale", um campo Líquido
  // editável (lápis → input → salvar/cancelar) na tela principal da Folha de
  // Pagamento. Diferente de editarDescontoManual (edita 1 categoria e o líquido
  // é RECALCULADO), aqui o líquido FINAL é forçado direto — o ajuste de
  // arredondamento zera e o ledger 'folha' é limpo p/ não corromper o carry-forward
  // do próximo evento (mesma lógica do override do vale, Rev. 3293).
  editarLiquidoFolha: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      employeeId: z.number(),
      novoLiquido: z.string(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin_master") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas usuários Master podem editar o líquido da folha." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const liquidoNum = parseFloat(input.novoLiquido.replace(/[^\d.,]/g, "").replace(",", "."));
      if (isNaN(liquidoNum) || liquidoNum < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Valor líquido inválido." });
      }

      // Guard: bloqueia edição se pagamento estiver consolidado
      const guard = ((await db.execute(sql`
        SELECT "pagamentoConsolidadoEm", "pagamentoResultJson"
        FROM payroll_periods
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
        LIMIT 1
      `)) as any).rows || [];
      if (guard.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Período de folha não encontrado" });
      }
      if (guard[0].pagamentoConsolidadoEm) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pagamento consolidado — desconsolide para editar" });
      }
      const payload = (() => { try { return JSON.parse(guard[0].pagamentoResultJson || '{}'); } catch { return {}; } })();
      const funcionarios: any[] = payload.funcionarios || [];
      const idx = funcionarios.findIndex(f => Number(f.employeeId) === Number(input.employeeId));
      if (idx < 0) throw new TRPCError({ code: "NOT_FOUND", message: "Funcionário não encontrado na folha" });
      const f = funcionarios[idx];

      const liquidoAnterior = Number(f.salarioLiquido || 0);
      const liquidoFormatado = liquidoNum.toFixed(2);
      const editadoPor = ctx.user.name || ctx.user.email || "Master";
      const agora = new Date().toISOString();
      const obs = `[LÍQUIDO EDITADO por ${editadoPor}: R$ ${liquidoAnterior.toFixed(2)} → R$ ${liquidoFormatado}${input.motivo ? ` | Motivo: ${input.motivo}` : ""}]`;

      funcionarios[idx] = {
        ...f,
        salarioLiquido: liquidoNum,
        salarioLiquidoExato: liquidoNum,
        ajusteArredondamento: 0,
        observacoes: (f.observacoes ? f.observacoes + ' ' : '') + obs,
        liquidoEditadoManualmente: true,
        liquidoEditadoPor: editadoPor,
        liquidoEditadoEm: agora,
      };

      const grandTotalLiquido = funcionarios.reduce((s, x) => s + Number(x.salarioLiquido || 0), 0);
      payload.funcionarios = funcionarios;
      payload.totalLiquido = grandTotalLiquido;

      await db.execute(sql`
        UPDATE payroll_payments
        SET "salarioLiquido" = ${liquidoFormatado},
            "salarioLiquidoExato" = ${liquidoFormatado},
            "ajusteArredondamento" = ${"0.00"},
            "observacoes" = COALESCE("observacoes", '') || ${' ' + obs},
            "updatedAt" = NOW()
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "employeeId" = ${input.employeeId}
      `);

      // Remove a linha 'folha' do ledger p/ o override virar o pago final sem residual
      // (mesma lógica do Rev. 3293 aplicada ao override do vale).
      await db.execute(sql`DELETE FROM payroll_rounding_ledger WHERE "companyId" = ${input.companyId} AND "employeeId" = ${input.employeeId} AND "mesReferencia" = ${input.mesReferencia} AND "origem" = 'folha'`);

      await db.execute(sql`
        UPDATE payroll_periods SET
          "totalLiquido" = ${formatMoney(grandTotalLiquido)},
          "pagamentoResultJson" = ${JSON.stringify(payload)}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      return {
        success: true,
        employeeId: input.employeeId,
        novoLiquido: liquidoFormatado,
        liquidoAnterior: liquidoAnterior.toFixed(2),
        message: `Líquido editado: R$ ${liquidoAnterior.toFixed(2)} → R$ ${liquidoFormatado}`,
      };
    }),

  // ============================================================
  // 7. LISTAR PAGAMENTOS
  // ============================================================
  listarPagamentos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pp.*, e."nomeCompleto", e.funcao, e."codigoInterno",
          e.banco, e."bancoNome", e.agencia, e.conta, e."tipoConta",
          e."tipoChavePix", e."chavePix", e."bancoPix", e.cpf
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp."employeeId" = e.id
        WHERE pp."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp."mesReferencia" = ${input.mesReferencia}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];
      return rows || [];
    }),

  validarDivergenciasFolha: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const allCltAtivos = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, "valorHora", "salarioBase", status, banco, agencia, conta, cpf
        FROM employees
        WHERE "companyId" = ${input.companyId}
          AND "tipoContrato" = 'CLT'
          AND status IN ('Ativo', 'Ferias')
          AND "deletedAt" IS NULL
      `)) as any).rows || [];

      const pagamentos = ((await db.execute(sql`
        SELECT "employeeId" FROM payroll_payments
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      const pagEmployeeIds = new Set(pagamentos.map((p: any) => p.employeeId));

      const divergencias: { employeeId: number; nome: string; funcao: string | null; motivo: string }[] = [];

      for (const emp of allCltAtivos) {
        if (!pagEmployeeIds.has(emp.id)) {
          const motivos: string[] = [];
          if (!emp.valorHora || emp.valorHora === '') motivos.push('Valor hora não preenchido');
          if (!emp.salarioBase) motivos.push('Salário base vazio');
          if (!emp.cpf) motivos.push('CPF não preenchido');
          if (!emp.banco && !emp.conta) motivos.push('Dados bancários não preenchidos');
          divergencias.push({
            employeeId: emp.id,
            nome: emp.nomeCompleto,
            funcao: emp.funcao,
            motivo: motivos.length > 0 ? motivos.join('; ') : 'Não foi incluído na última simulação (motivo desconhecido)',
          });
        }
      }

      const empNaFolhaMasInativo: { employeeId: number; nome: string; funcao: string | null; motivo: string }[] = [];
      const allCltIds = new Set(allCltAtivos.map((e: any) => e.id));
      const indevidoIds = pagamentos.filter((p: any) => !allCltIds.has(p.employeeId)).map((p: any) => p.employeeId);
      if (indevidoIds.length > 0) {
        const indevidoRows = ((await db.execute(sql`
          SELECT id, "nomeCompleto", funcao, status, "tipoContrato"
          FROM employees
          WHERE id IN (${sql.join(indevidoIds.map((id: number) => sql`${id}`), sql`,`)})
        `)) as any).rows || [];
        for (const empRow of indevidoRows) {
          empNaFolhaMasInativo.push({
            employeeId: empRow.id,
            nome: empRow.nomeCompleto,
            funcao: empRow.funcao,
            motivo: `Na folha mas status atual: ${empRow.status} / contrato: ${empRow.tipoContrato}`,
          });
        }
      }

      return {
        totalCltAtivos: allCltAtivos.length,
        totalNaFolha: pagamentos.length,
        temDivergencia: divergencias.length > 0 || empNaFolhaMasInativo.length > 0,
        excluidos: divergencias,
        indevidos: empNaFolhaMasInativo,
      };
    }),

  auditarFolha: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const { year, month } = parseMesRef(input.mesReferencia);
      const diasUteis = getDiasUteisNoMes(year, month);

      const allCltAtivos = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, status, "dataAdmissao", "dataDemissao",
          "valorHora", "salarioBase", "horasMensais", banco, agencia, conta, cpf,
          "pensaoAlimenticia", "vtValorDiario", "seguroVida", "vaRecebe", "vaValor",
          "fgtsPercentual", "inssPercentual"
        FROM employees
        WHERE "companyId" = ${input.companyId}
          AND "tipoContrato" = 'CLT'
          AND status IN ('Ativo', 'Ferias')
          AND "deletedAt" IS NULL
        ORDER BY "nomeCompleto"
      `)) as any).rows || [];

      const vales = ((await db.execute(sql`
        SELECT "employeeId", "valorTotalVale", "valorAdiantamento", "percentualAdiantamento",
          "salarioBrutoMes", bloqueado, "motivoBloqueio", "faltasNoPeriodo",
          "horasExtrasQtd", "valorHorasExtras"
        FROM payroll_advances
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const valeMap = new Map(vales.map((v: any) => [v.employeeId, v]));

      const pagamentos = ((await db.execute(sql`
        SELECT "employeeId", "salarioBrutoMes", "horasExtrasValor", "totalProventos",
          "descontoAdiantamento", "descontoFaltas", "descontoFaltasQtd",
          "descontoAtrasos", "descontoAtrasosMinutos", "descontoVrFaltas", "descontoVtFaltas",
          "descontoPensao", "descontoInss", "descontoIrrf", "descontoFgts",
          "descontoEpi", "descontoOutros", "descontoOutrosDetalhes",
          "totalDescontos", "salarioLiquido", "acertoEscuroValor", "acertoEscuroDetalhes", "adicionaisValor", "adicionaisDetalhes"
        FROM payroll_payments
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const pagMap = new Map(pagamentos.map((p: any) => [p.employeeId, p]));

      // ========== SEÇÕES ESTRUTURADAS ==========

      // 1. VALE: quem não recebeu
      const semVale: { nome: string; funcao: string | null; motivo: string; status: string }[] = [];
      const valeBloqueado: { nome: string; funcao: string | null; valor: string; motivo: string }[] = [];
      for (const emp of allCltAtivos) {
        const vale = valeMap.get(emp.id);
        if (!vale) {
          let motivo = '';
          if (emp.status === 'Ferias') motivo = 'Em férias — pagamento de férias já contempla a remuneração';
          else if (!emp.valorHora || emp.valorHora === '') motivo = 'Valor hora não cadastrado';
          else if (emp.dataAdmissao && new Date(emp.dataAdmissao) > new Date(year, month - 1, 15)) motivo = `Admitido em ${new Date(emp.dataAdmissao).toLocaleDateString('pt-BR')} (após dia 15)`;
          else motivo = 'Motivo não identificado — verificar cadastro';
          semVale.push({ nome: emp.nomeCompleto, funcao: emp.funcao, motivo, status: emp.status });
        } else if (vale.bloqueado === 1) {
          valeBloqueado.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valor: vale.valorTotalVale, motivo: vale.motivoBloqueio || 'Sem motivo registrado' });
        }
      }

      // 2. PAGAMENTO: quem não recebeu
      const semPagamento: { nome: string; funcao: string | null; motivo: string }[] = [];
      if (pagamentos.length > 0) {
        for (const emp of allCltAtivos) {
          if (!pagMap.has(emp.id)) {
            let motivo = 'Motivo não identificado';
            if (!emp.valorHora || emp.valorHora === '') motivo = 'Valor hora não cadastrado' + (!emp.salarioBase ? ' e salário base também vazio' : '');
            semPagamento.push({ nome: emp.nomeCompleto, funcao: emp.funcao, motivo });
          }
        }
      }

      // 3. VARIAÇÃO SALARIAL POR FUNÇÃO (structured)
      const variacaoSalarial: {
        funcao: string; qtd: number; variacao: number; explicacao: string;
        funcionarios: { nome: string; valorHora: string; bruto: number; he: number; liquido: number }[];
      }[] = [];
      const funcaoGroups = new Map<string, { nome: string; bruto: number; liquido: number; he: number; valorHora: string }[]>();
      for (const emp of allCltAtivos) {
        const pag = pagMap.get(emp.id);
        if (!pag || !emp.funcao) continue;
        const key = emp.funcao.toUpperCase().trim();
        if (!funcaoGroups.has(key)) funcaoGroups.set(key, []);
        funcaoGroups.get(key)!.push({
          nome: emp.nomeCompleto,
          bruto: parseFloat(pag.salarioBrutoMes) || 0,
          liquido: parseFloat(pag.salarioLiquido) || 0,
          he: parseFloat(pag.horasExtrasValor) || 0,
          valorHora: emp.valorHora || '0',
        });
      }
      for (const [funcao, emps] of funcaoGroups) {
        if (emps.length < 2) continue;
        const brutos = emps.map(e => e.bruto);
        const minB = Math.min(...brutos);
        const maxB = Math.max(...brutos);
        const diff = minB > 0 ? ((maxB - minB) / minB * 100) : 0;
        if (diff > 5) {
          const todosIguaisVH = new Set(emps.map(e => e.valorHora)).size === 1;
          const temHE = emps.some(e => e.he > 0);
          let explicacao = '';
          if (temHE && todosIguaisVH) explicacao = `Mesmo valor hora (R$ ${emps[0].valorHora}) — diferença causada por horas extras.`;
          else if (!todosIguaisVH) explicacao = 'Valores hora diferentes entre funcionários — verificar se está correto para a mesma função.';
          else explicacao = 'Verificar se houve bônus, adicional ou ajuste individual.';
          variacaoSalarial.push({
            funcao, qtd: emps.length, variacao: diff, explicacao,
            funcionarios: emps.sort((a, b) => a.bruto - b.bruto).map(e => ({
              nome: e.nome, valorHora: e.valorHora, bruto: e.bruto, he: e.he, liquido: e.liquido,
            })),
          });
        }
      }
      variacaoSalarial.sort((a, b) => b.variacao - a.variacao);

      // 4. FALTAS
      const comFaltas: { nome: string; funcao: string | null; faltas: number; valor: number; bruto: number }[] = [];
      // 5. ATRASOS
      const comAtrasos: { nome: string; funcao: string | null; minutos: number; valor: number }[] = [];
      // 6. DESCONTOS EXCESSIVOS (>50%)
      const descontosExcessivos: { nome: string; funcao: string | null; bruto: number; totalDesc: number; liquido: number; percentual: number; composicao: Record<string, number> }[] = [];
      // 7. HORAS EXTRAS (summary table)
      const comHorasExtras: { nome: string; funcao: string | null; valorHE: number; bruto: number; totalProventos: number }[] = [];
      // 8. DADOS BANCÁRIOS INCOMPLETOS
      const dadosBancariosIncompletos: { nome: string; funcao: string | null; problemas: string[] }[] = [];
      // 9. AJUSTES MANUAIS
      const ajustesManuais: { nome: string; funcao: string | null; valor: number; detalhes: string }[] = [];
      // 10. PENSÃO
      const comPensao: { nome: string; funcao: string | null; valor: number }[] = [];

      for (const emp of allCltAtivos) {
        const pag = pagMap.get(emp.id);
        if (!pag) continue;
        const bruto = parseFloat(pag.salarioBrutoMes) || 0;
        const liquido = parseFloat(pag.salarioLiquido) || 0;
        const totalDesc = parseFloat(pag.totalDescontos) || 0;
        const faltas = pag.descontoFaltasQtd || 0;
        const faltasVal = parseFloat(pag.descontoFaltas) || 0;
        const atrasosMin = pag.descontoAtrasosMinutos || 0;
        const atrasosVal = parseFloat(pag.descontoAtrasos) || 0;
        const pensao = parseFloat(pag.descontoPensao) || 0;
        const he = parseFloat(pag.horasExtrasValor) || 0;
        const acertoEscuro = parseFloat(pag.acertoEscuroValor) || 0;

        if (faltas > 0) comFaltas.push({ nome: emp.nomeCompleto, funcao: emp.funcao, faltas, valor: faltasVal, bruto });
        if (atrasosMin > 0) comAtrasos.push({ nome: emp.nomeCompleto, funcao: emp.funcao, minutos: atrasosMin, valor: atrasosVal });
        if (bruto > 0 && totalDesc / bruto > 0.5) {
          descontosExcessivos.push({
            nome: emp.nomeCompleto, funcao: emp.funcao, bruto, totalDesc, liquido, percentual: totalDesc / bruto * 100,
            composicao: {
              'Adiantamento': parseFloat(pag.descontoAdiantamento || '0'),
              'Faltas': faltasVal, 'Atrasos': atrasosVal,
              'INSS': parseFloat(pag.descontoInss || '0'), 'FGTS': parseFloat(pag.descontoFgts || '0'),
              'Pensão': pensao, 'EPI': parseFloat(pag.descontoEpi || '0'),
              'Outros': parseFloat(pag.descontoOutros || '0'),
            },
          });
        }
        if (he > 0) comHorasExtras.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valorHE: he, bruto, totalProventos: parseFloat(pag.totalProventos) || 0 });
        if (pensao > 0) comPensao.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valor: pensao });
        if (acertoEscuro !== 0) ajustesManuais.push({ nome: emp.nomeCompleto, funcao: emp.funcao, valor: acertoEscuro, detalhes: pag.acertoEscuroDetalhes ? JSON.stringify(pag.acertoEscuroDetalhes) : '' });

        const problemas: string[] = [];
        if (!emp.banco && !emp.conta) problemas.push('Banco e conta');
        else { if (!emp.banco) problemas.push('Banco'); if (!emp.conta) problemas.push('Conta'); }
        if (!emp.agencia) problemas.push('Agência');
        if (!emp.cpf) problemas.push('CPF');
        if (problemas.length > 0) dadosBancariosIncompletos.push({ nome: emp.nomeCompleto, funcao: emp.funcao, problemas });
      }

      comFaltas.sort((a, b) => b.faltas - a.faltas);
      comAtrasos.sort((a, b) => b.minutos - a.minutos);
      comHorasExtras.sort((a, b) => b.valorHE - a.valorHE);
      descontosExcessivos.sort((a, b) => b.percentual - a.percentual);

      const totalErros = semPagamento.length + descontosExcessivos.length + variacaoSalarial.filter(v => v.variacao > 20).length;
      const totalWarnings = semVale.length + comFaltas.length + variacaoSalarial.filter(v => v.variacao <= 20).length + dadosBancariosIncompletos.length;

      return {
        mesReferencia: input.mesReferencia,
        totalCltAtivos: allCltAtivos.length,
        totalNaFolha: pagamentos.length,
        totalNoVale: vales.length,
        diasUteisNoMes: diasUteis,
        totalErros,
        totalWarnings,
        secoes: {
          semPagamento,
          semVale,
          valeBloqueado,
          variacaoSalarial,
          comFaltas,
          comAtrasos,
          descontosExcessivos,
          comHorasExtras,
          comPensao,
          ajustesManuais,
          dadosBancariosIncompletos,
        },
      };
    }),

  // ============================================================
  // 9. TRAVAR COMPETÊNCIA
  // ============================================================
  travarCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'travada',
          "travadoEm" = NOW(),
          "travadoPor" = ${ctx.user.name || "Sistema"}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { message: "Competência travada com sucesso" };
    }),

  // ============================================================
  // 10. TIMECARD DAILY - Listar registros diários
  // ============================================================
  listarTimecardDaily: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      let baseQuery;
      if (input.employeeId) {
        baseQuery = sql`
          SELECT td.*, e."nomeCompleto", e.funcao, e."codigoInterno", o.nome as "obraNome"
          FROM timecard_daily td
          LEFT JOIN employees e ON td."employeeId" = e.id
          LEFT JOIN obras o ON td."obraId" = o.id
          WHERE td."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td."mesCompetencia" = ${input.mesReferencia}
          AND td."employeeId" = ${input.employeeId}
          ORDER BY td."data", e."nomeCompleto"
        `;
      } else {
        baseQuery = sql`
          SELECT td.*, e."nomeCompleto", e.funcao, e."codigoInterno", o.nome as "obraNome"
          FROM timecard_daily td
          LEFT JOIN employees e ON td."employeeId" = e.id
          LEFT JOIN obras o ON td."obraId" = o.id
          WHERE td."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td."mesCompetencia" = ${input.mesReferencia}
          ORDER BY td."data", e."nomeCompleto"
        `;
      }
      const rows = ((await db.execute(baseQuery)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 11. RELATÓRIO DE DIVERGÊNCIAS
  // ============================================================
  relatorioDivergencias: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT pa.*, e.nomeCompleto, e.funcao, e.codigoInterno
        FROM payroll_adjustments pa
        LEFT JOIN employees e ON pa.employeeId = e.id
        WHERE pa.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pa.mesDesconto = ${input.mesReferencia}
        ORDER BY pa.data, e.nomeCompleto
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // 12. ALERTAS
  // ============================================================
  listarAlertas: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      let query;
      if (input.mesReferencia) {
        query = sql`SELECT * FROM payroll_alerts WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} ORDER BY "createdAt" DESC`;
      } else {
        query = sql`SELECT * FROM payroll_alerts WHERE "companyId" = ${input.companyId} AND resolvido = 0 ORDER BY "createdAt" DESC LIMIT 50`;
      }
      const rows = ((await db.execute(query)) as any).rows || [];
      return rows || [];
    }),

  marcarAlertaLido: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_alerts SET lido = 1, lidoEm = NOW(), lidoPor = ${ctx.user.name || "Sistema"}
        WHERE id = ${input.alertId}
      `);
      return { success: true };
    }),

  resolverAlerta: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_alerts SET resolvido = 1, resolvidoEm = NOW(), resolvidoPor = ${ctx.user.name || "Sistema"}
        WHERE id = ${input.alertId}
      `);
      return { success: true };
    }),

  // ============================================================
  // 13. EVENTOS FINANCEIROS
  // ============================================================
  listarEventosFinanceiros: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string().optional(), limit: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const lim = input.limit || 100;
      let query;
      if (input.mesReferencia) {
        query = sql`SELECT * FROM financial_events WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia} ORDER BY "dataPrevista", tipo LIMIT ${lim}`;
      } else {
        query = sql`SELECT * FROM financial_events WHERE "companyId" = ${input.companyId} ORDER BY "dataPrevista" DESC LIMIT ${lim}`;
      }
      const rows = ((await db.execute(query)) as any).rows || [];
      return rows || [];
    }),

  previsaoFinanceira: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesesAFrente: z.number().default(6) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const criteria = await getPayrollCriteria(db, input.companyId);

      // Get active employees for projection
      const empRows = ((await db.execute(sql`
        SELECT COUNT(*) as total, SUM(CAST(REPLACE(REPLACE("valorHora", '.', ''), ',', '.') AS DECIMAL(10,2))) as "somaValorHora"
        FROM employees 
        WHERE "companyId" = ${input.companyId} AND "tipoContrato" = 'CLT' AND status IN ('Ativo', 'Ferias') AND "deletedAt" IS NULL
        AND "valorHora" IS NOT NULL AND "valorHora" != ''
      `)) as any).rows || [];
      const totalEmps = empRows[0]?.total || 0;
      const somaValorHora = empRows[0]?.somaValorHora || 0;

      const now = new Date();
      const projections: any[] = [];
      for (let i = 0; i < input.mesesAFrente; i++) {
        const projMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const y = projMonth.getFullYear();
        const m = projMonth.getMonth() + 1;
        const mesRef = `${y}-${String(m).padStart(2, "0")}`;
        const diasUteis = getDiasUteisNoMes(y, m);
        const salarioEstimado = somaValorHora * criteria.cargaHorariaDiaria * diasUteis;
        const valeEstimado = salarioEstimado * (criteria.percentualAdiantamento / 100);
        const pagamentoEstimado = salarioEstimado - valeEstimado;

        // Check if there's actual data
        const actual = ((await db.execute(sql`
          SELECT * FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${mesRef} LIMIT 1
        `)) as any).rows || [];
        const period = actual[0];

        projections.push({
          mesReferencia: mesRef,
          diasUteis,
          totalFuncionarios: totalEmps,
          salarioEstimado,
          valeEstimado,
          pagamentoEstimado,
          totalEstimado: salarioEstimado,
          status: period?.status || "projecao",
          valorReal: period ? parseBRL(period.totalLiquido) : null,
        });
      }

      return { projections, totalFuncionarios: totalEmps };
    }),

  // ============================================================
  // 14. DASHBOARD CUSTO POR OBRA
  // ============================================================
  custoPorObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      
      // Get timecard_daily grouped by obra
      const obraRows = ((await db.execute(sql`
        SELECT td."obraId", o.nome as "obraNome",
          COUNT(DISTINCT td."employeeId") as "totalFuncionarios",
          SUM(CASE WHEN td."isFalta" = 1 THEN 1 ELSE 0 END) as "totalFaltas",
          COUNT(*) as "totalDias"
        FROM timecard_daily td
        LEFT JOIN obras o ON td."obraId" = o.id
        WHERE td."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td."mesCompetencia" = ${input.mesReferencia}
        GROUP BY td."obraId", o.nome
        ORDER BY "totalFuncionarios" DESC
      `)) as any).rows || [];

      // Get payment totals by obra (via employee allocation)
      const payRows = ((await db.execute(sql`
        SELECT of2.obraId as obraId, o.nome as obraNome,
          SUM(CAST(pp.salarioBrutoMes AS DECIMAL(15,2))) as totalBruto,
          SUM(CAST(pp.salarioLiquido AS DECIMAL(15,2))) as totalLiquido,
          SUM(CAST(pp.horasExtrasValor AS DECIMAL(15,2))) as totalHE,
          COUNT(*) as totalFuncionarios
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        LEFT JOIN obra_funcionarios of2 ON of2.employeeId = e.id AND of2.isActive = 1
        LEFT JOIN obras o ON of2.obraId = o.id
        WHERE pp.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp.mesReferencia = ${input.mesReferencia}
        GROUP BY of2.obraId, o.nome
        ORDER BY totalBruto DESC
      `)) as any).rows || [];

      // Get employee-level detail per obra for expandable breakdown
      const detailRows = ((await db.execute(sql`
        SELECT of2.obraId as obraId, pp.employeeId, e.nomeCompleto,
          e.funcao, e.cargo,
          CAST(pp.salarioBrutoMes AS DECIMAL(15,2)) as salarioBruto,
          CAST(pp.salarioLiquido AS DECIMAL(15,2)) as salarioLiquido,
          CAST(pp.horasExtrasValor AS DECIMAL(15,2)) as horasExtrasValor,
          CAST(pp.totalDescontos AS DECIMAL(15,2)) as totalDescontos,
          CAST(pp.descontoAdiantamento AS DECIMAL(15,2)) as descontoAdiantamento,
          CAST(pp.descontoFaltas AS DECIMAL(15,2)) as descontoFaltas,
          CAST(pp.descontoAtrasos AS DECIMAL(15,2)) as descontoAtrasos,
          CAST(pp.descontoVrFaltas AS DECIMAL(15,2)) as descontoVrFaltas,
          CAST(pp.descontoVtFaltas AS DECIMAL(15,2)) as descontoVtFaltas,
          CAST(pp.descontoPensao AS DECIMAL(15,2)) as descontoPensao,
          CAST(pp.descontoInss AS DECIMAL(15,2)) as descontoInss,
          CAST(pp.descontoIrrf AS DECIMAL(15,2)) as descontoIrrf,
          CAST(pp.descontoFgts AS DECIMAL(15,2)) as descontoFgts,
          CAST(pp.descontoEpi AS DECIMAL(15,2)) as descontoEpi,
          CAST(pp.descontoOutros AS DECIMAL(15,2)) as descontoOutros,
          (pp.diasUteisNoMes - COALESCE(pp.descontoFaltasQtd, 0)) as diasTrabalhados,
          COALESCE(pp.descontoFaltasQtd, 0) as faltas
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp.employeeId = e.id
        LEFT JOIN obra_funcionarios of2 ON of2.employeeId = e.id AND of2.isActive = 1
        WHERE pp.companyId IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp.mesReferencia = ${input.mesReferencia}
        ORDER BY of2.obraId, e.nomeCompleto
      `)) as any).rows || [];

      return {
        porObra: payRows || [],
        timecardPorObra: obraRows || [],
        detalhePorFuncionario: detailRows || [],
      };
    }),

  // ============================================================
  // 15. CRITÉRIOS CONFIGURÁVEIS
  // ============================================================
  getCriterios: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      return await getPayrollCriteria(db, input.companyId);
    }),

  salvarCriterio: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), chave: z.string(),
      valor: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const existing = ((await db.execute(sql`
        SELECT id FROM system_criteria WHERE "companyId" = ${input.companyId} AND chave = ${input.chave} LIMIT 1
      `)) as any).rows || [];
      if (existing[0]) {
        await db.execute(sql`
          UPDATE system_criteria SET valor = ${input.valor} WHERE id = ${existing[0].id}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO system_criteria (companyId, chave, valor, descricao, categoria, tipo) 
          VALUES (${input.companyId}, ${input.chave}, ${input.valor}, ${input.chave}, 'folha', 'numero')
        `);
      }
      return { success: true };
    }),

  // ============================================================
  // 16. ABONAR AJUSTE (DIVERGÊNCIA)
  // ============================================================
  abonarAjuste: protectedProcedure
    .input(z.object({ adjustmentId: z.number(), motivo: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      await db.execute(sql`
        UPDATE payroll_adjustments SET 
          status = 'abonado',
          "abonadoPor" = ${ctx.user.name || "Sistema"},
          "abonadoEm" = NOW(),
          "motivoAbono" = ${input.motivo}
        WHERE id = ${input.adjustmentId}
      `);
      return { success: true };
    }),

  // ============================================================
  // 17. RESUMO DA COMPETÊNCIA
  // ============================================================
  resumoCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Period info
      const periodRows = ((await db.execute(sql`
        SELECT * FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1
      `)) as any).rows || [];
      const period = periodRows[0] || null;

      // Timecard stats
      const tcStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as "totalRegistros",
          SUM(CASE WHEN "statusDia" = 'registrado' THEN 1 ELSE 0 END) as registrados,
          SUM(CASE WHEN "statusDia" = 'escuro' THEN 1 ELSE 0 END) as "noEscuro",
          SUM(CASE WHEN "statusDia" = 'aferido' THEN 1 ELSE 0 END) as aferidos,
          SUM("isFalta") as "totalFaltas",
          SUM("isAtraso") as "totalAtrasos",
          COUNT(DISTINCT "employeeId") as "totalFuncionarios"
        FROM timecard_daily 
        WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Advances stats
      const advStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN bloqueado = 1 THEN 1 ELSE 0 END) as bloqueados,
          SUM(CAST("valorTotalVale" AS DECIMAL(15,2))) as "totalVale"
        FROM payroll_advances 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Payment stats
      const payStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CAST("salarioBrutoMes" AS DECIMAL(15,2))) as "totalBruto",
          SUM(CAST("totalDescontos" AS DECIMAL(15,2))) as "totalDescontos",
          SUM(CAST("salarioLiquido" AS DECIMAL(15,2))) as "totalLiquido"
        FROM payroll_payments 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Adjustments stats
      const adjStatsRows = ((await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN status = 'aplicado' THEN 1 ELSE 0 END) as aplicados,
          SUM(CASE WHEN status = 'abonado' THEN 1 ELSE 0 END) as abonados,
          SUM(CAST("valorTotal" AS DECIMAL(15,2))) as "totalValor"
        FROM payroll_adjustments 
        WHERE "companyId" = ${input.companyId} AND "mesDesconto" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Alerts
      const alertStatsRows = ((await db.execute(sql`
        SELECT COUNT(*) as total, SUM(CASE WHEN lido = 0 THEN 1 ELSE 0 END) as "naoLidos"
        FROM payroll_alerts 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      // Financial events
      const finStatsRows = ((await db.execute(sql`
        SELECT COUNT(*) as total, COALESCE(SUM(CAST(valor AS DECIMAL(15,2))), 0) as "totalValor"
        FROM financial_events 
        WHERE "companyId" = ${input.companyId} AND "mesCompetencia" = ${input.mesReferencia}
      `)) as any).rows || [];

      return {
        period,
        timecard: tcStatsRows[0] || {},
        advances: { totalVales: (advStatsRows[0] as any)?.total || 0, ...(advStatsRows[0] || {}) },
        payments: { totalPagamentos: (payStatsRows[0] as any)?.total || 0, ...(payStatsRows[0] || {}) },
        adjustments: { totalAjustes: (adjStatsRows[0] as any)?.total || 0, ...(adjStatsRows[0] || {}) },
        alerts: alertStatsRows[0] || {},
        financeiro: finStatsRows[0] || { total: 0 },
      };
    }),

  // ============================================================
  // 18. GERAR CONTRACHEQUE (HTML para impressão)
  // ============================================================
  gerarContracheque: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), employeeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Get company info
      const companyRows = ((await db.execute(sql`
        SELECT "razaoSocial", "nomeFantasia", cnpj, "logoUrl" FROM companies WHERE id = ${input.companyId} LIMIT 1
      `)) as any).rows || [];
      const company = companyRows[0] || {};

      // Get period info
      const periodRows = ((await db.execute(sql`
        SELECT * FROM payroll_periods WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} LIMIT 1
      `)) as any).rows || [];
      const period = periodRows[0] || null;

      // Build employee filter
      const empFilter = input.employeeId ? sql` AND pp."employeeId" = ${input.employeeId}` : sql``;

      // Get payments with employee details
      const payRows = ((await db.execute(sql`
        SELECT pp.*, e."nomeCompleto", e.funcao, e."codigoInterno", e.cpf, e."dataAdmissao", e."valorHora",
          e.pis, e.ctps, e."obraAtual"
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp."employeeId" = e.id
        WHERE pp."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND pp."mesReferencia" = ${input.mesReferencia} ${empFilter}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];

      // Get advances
      const advRows = ((await db.execute(sql`
        SELECT * FROM payroll_advances WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const advMap = new Map<number, any>();
      for (const a of (advRows || [])) advMap.set(a.employeeId, a);

      // Get obra names
      const obraRows = ((await db.execute(sql`SELECT id, nome FROM obras WHERE "companyId" = ${input.companyId}`)) as any).rows || [];
      const obraMap = new Map<number, string>();
      for (const o of (obraRows || [])) obraMap.set(o.id, o.nome);

      const contracheques = (payRows || []).map((p: any) => {
        const adv = advMap.get(p.employeeId);
        return {
          funcionario: {
            nome: p.nomeCompleto,
            funcao: p.funcao,
            codigo: p.codigoInterno,
            cpf: p.cpf,
            dataAdmissao: p.dataAdmissao,
            valorHora: p.valorHora,
            pis: p.pis,
            ctps: p.ctps,
            obra: obraMap.get(Number(p.obraAtual)) || "Não alocado",
          },
          proventos: [
            { descricao: "Salário Base", referencia: `${p.diasUteisNoMes} dias × ${p.cargaHorariaDiaria}h`, valor: parseBRL(p.salarioBrutoMes) },
            ...(parseBRL(p.horasExtrasValor) > 0 ? [{ descricao: "Horas Extras", referencia: "", valor: parseBRL(p.horasExtrasValor) }] : []),
          ],
          descontos: [
            ...(parseBRL(p.descontoAdiantamento) > 0 ? [{ descricao: "Adiantamento (Vale)", referencia: adv ? `${adv.percentualAdiantamento}%` : "40%", valor: parseBRL(p.descontoAdiantamento) }] : []),
            ...(parseBRL(p.descontoFaltas) > 0 ? [{ descricao: `Faltas (${p.descontoFaltasQtd} dias)`, referencia: "", valor: parseBRL(p.descontoFaltas) }] : []),
            ...(parseBRL(p.descontoAtrasos) > 0 ? [{ descricao: `Atrasos (${p.descontoAtrasosMinutos}min)`, referencia: "", valor: parseBRL(p.descontoAtrasos) }] : []),
            // Rev. 3987 — VR (dias de falta) não entra mais na folha/comprovante (tratado só
            // no módulo Vale Alimentação); VT (dias de falta) some ao VT normal, listado abaixo.
            ...(parseBRL(p.descontoVtFaltas) > 0 ? [{ descricao: "VT (dias de falta)", referencia: `${p.descontoFaltasQtd} dias`, valor: parseBRL(p.descontoVtFaltas) }] : []),
            ...(parseBRL(p.descontoPensao) > 0 ? [{ descricao: "Pensão Alimentícia", referencia: "", valor: parseBRL(p.descontoPensao) }] : []),
            ...(parseBRL(p.acertoEscuroValor) > 0 ? [{ descricao: "Acerto Período Escuro", referencia: `Ref. mês anterior`, valor: parseBRL(p.acertoEscuroValor) }] : []),
          ],
          totalProventos: parseBRL(p.totalProventos),
          totalDescontos: parseBRL(p.totalDescontos),
          salarioLiquido: parseBRL(p.salarioLiquido),
          dataPagamento: p.dataPagamentoPrevista,
          status: p.status,
          mesReferencia: input.mesReferencia,
          acertoEscuroDetalhes: p.acertoEscuroDetalhes ? JSON.parse(p.acertoEscuroDetalhes) : [],
        };
      });

      return {
        empresa: {
          nome: company.nomeFantasia || company.razaoSocial || "Empresa",
          cnpj: company.cnpj || "",
          logoUrl: company.logoUrl || "",
        },
        mesReferencia: input.mesReferencia,
        periodo: period,
        contracheques,      };
    }),
  // ============================================================
  // 20. ASSISTENTE IA DE INCONSISTÊNCIAS
  // ============================================================
  analisarInconsistenciaIA: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), timecardDailyId: z.number(),
      mesReferencia: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      // Get the inconsistent record with employee details
      const rows = ((await db.execute(sql`
        SELECT td.*, e."nomeCompleto", e.funcao, e."codigoInterno", e."dataAdmissao", e.status as "empStatus",
          o.nome as "obraNome"
        FROM timecard_daily td
        LEFT JOIN employees e ON td."employeeId" = e.id
        LEFT JOIN obras o ON td."obraId" = o.id
        WHERE td.id = ${input.timecardDailyId}
        LIMIT 1
      `)) as any).rows || [];
      const record = rows[0];
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
      // Get recent history for this employee (last 30 days)
      const histRows = ((await db.execute(sql`
        SELECT "data", "statusDia", "isFalta", "isAtraso", "isInconsistente", "inconsistenciaTipo",
          "entrada1", "saida1", "entrada2", "saida2", "horasTrabalhadas"
        FROM timecard_daily
        WHERE "employeeId" = ${record.employeeId} AND "companyId" = ${input.companyId}
          AND "mesCompetencia" = ${input.mesReferencia}
        ORDER BY "data" DESC LIMIT 30
      `)) as any).rows || [];
      // Get golden rules for context
      const rulesRows = ((await db.execute(sql`
        SELECT titulo, descricao, categoria FROM golden_rules
        WHERE "companyId" = ${input.companyId} AND "deletedAt" IS NULL
        AND categoria IN ('rh', 'operacional', 'geral')
        ORDER BY prioridade LIMIT 10
      `)) as any).rows || [];
      // Get criteria
      const criteria = await getPayrollCriteria(db, input.companyId);
      // Build context for LLM
      const historicoStr = (histRows || []).map((h: any) =>
        `${h.data}: ${h.statusDia} | E1:${h.entrada1||'-'} S1:${h.saida1||'-'} E2:${h.entrada2||'-'} S2:${h.saida2||'-'} | Horas:${h.horasTrabalhadas} | Falta:${h.isFalta} Atraso:${h.isAtraso} Incon:${h.is_inconsistente}(${h.inconsistencia_tipo||'-'})`
      ).join('\n');
      const regrasStr = (rulesRows || []).map((r: any) => `[${r.categoria}] ${r.titulo}: ${r.descricao}`).join('\n');
      const prompt = `Você é um assistente de RH especialista em ponto eletrônico e legislação trabalhista brasileira (CLT).

ANALISE esta inconsistência de ponto e sugira a melhor resolução:

## Funcionário
- Nome: ${record.nomeCompleto}
- Função: ${record.funcao}
- Código: ${record.codigoInterno}
- Admissão: ${record.dataAdmissao}
- Obra: ${record.obraNome || 'N/A'}

## Registro com Inconsistência
- Data: ${record.data}
- Tipo: ${record.inconsistencia_tipo}
- Entrada 1: ${record.entrada1 || 'AUSENTE'}
- Saída 1: ${record.saida1 || 'AUSENTE'}
- Entrada 2: ${record.entrada2 || 'AUSENTE'}
- Saída 2: ${record.saida2 || 'AUSENTE'}
- Batidas: ${record.num_batidas}
- Horas: ${record.horasTrabalhadas}
- Tipo dia: ${record.tipoDia}

## Critérios do Sistema
- Jornada diária: ${criteria.cargaHorariaDiaria}h
- Tolerância legal (CLT Art. 58 §1º + Súmula 366 TST): ${criteria.pontoToleranciaLegal} min (≤${criteria.pontoToleranciaLegal} min = OK, >${criteria.pontoToleranciaLegal} min = desconto integral)
- Falta após atraso: ${criteria.pontoFaltaAposAtraso} min

## Histórico Recente (últimos 30 dias)
${historicoStr || 'Sem histórico'}

## Regras de Ouro da Empresa
${regrasStr || 'Nenhuma regra cadastrada'}

Responda EXATAMENTE no formato JSON abaixo:`;
      const { invokeLLM } = await import('../_core/llm');
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "Você é um assistente de RH brasileiro especialista em ponto eletrônico, CLT e resolução de inconsistências. Responda sempre em JSON válido e em português." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ia_inconsistencia",
            strict: true,
            schema: {
              type: "object",
              properties: {
                resolucaoSugerida: {
                  type: "string",
                  description: "Tipo de resolução sugerida: ajustar_horario, atestado, advertencia, justificar ou abonar",
                },
                confianca: {
                  type: "string",
                  description: "Nível de confiança: alta, media ou baixa",
                },
                explicacao: {
                  type: "string",
                  description: "Explicação didática de por que essa resolução é a mais adequada, citando legislação quando aplicável",
                },
                horariosCorrigidos: {
                  type: "object",
                  properties: {
                    entrada1: { type: "string", description: "Horário de entrada 1 sugerido (HH:MM) ou vazio" },
                    saida1: { type: "string", description: "Horário de saída 1 sugerido (HH:MM) ou vazio" },
                    entrada2: { type: "string", description: "Horário de entrada 2 sugerido (HH:MM) ou vazio" },
                    saida2: { type: "string", description: "Horário de saída 2 sugerido (HH:MM) ou vazio" },
                  },
                  required: ["entrada1", "saida1", "entrada2", "saida2"],
                  additionalProperties: false,
                },
                observacaoSugerida: {
                  type: "string",
                  description: "Texto sugerido para o campo de observação da resolução",
                },
                alertas: {
                  type: "string",
                  description: "Alertas ou riscos trabalhistas que o RH deve considerar",
                },
              },
              required: ["resolucaoSugerida", "confianca", "explicacao", "horariosCorrigidos", "observacaoSugerida", "alertas"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices?.[0]?.message?.content as string;
      if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IA não retornou resposta" });
      try {
        return JSON.parse(content);
      } catch {
        return {
          resolucaoSugerida: "justificar",
          confianca: "baixa",
          explicacao: content,
          horariosCorrigidos: { entrada1: "", saida1: "", entrada2: "", saida2: "" },
          observacaoSugerida: "Análise IA indisponível",
          alertas: "Não foi possível analisar automaticamente. Resolva manualmente.",
        };
      }
    }),

  // ============================================================
  // LIMPAR ETAPA / LIMPAR COMPETÊNCIA
  // ============================================================
  resetarEtapa: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      etapa: z.enum(["ponto", "escuro", "vale", "pagamento", "consolidacao"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companyId, mesReferencia, etapa } = input;

      // Check period exists and is not travada
      const periods = ((await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia} LIMIT 1`
      )) as any).rows || [];
      if (!periods[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Competência não encontrada" });
      if (periods[0].status === "travada") throw new TRPCError({ code: "FORBIDDEN", message: "Competência travada. Não é possível limpar." });

      const periodId = periods[0].id;

      // Map etapa to tables and new status
      const etapaMap: Record<string, { tables: string[]; newStatus: string; clearFields: string[] }> = {
        ponto: {
          tables: ["timecard_daily", "time_records", "time_inconsistencies", "payroll_uploads"],
          newStatus: "aberta",
          clearFields: ["pontoImportadoEm", "pontoImportadoPor", "afericaoRealizada", "afericaoEm", "afericaoPor"],
        },
        escuro: {
          tables: ["payroll_adjustments"],
          newStatus: "ponto_importado",
          clearFields: ["afericaoRealizada", "afericaoEm", "afericaoPor"],
        },
        vale: {
          tables: ["payroll_advances"],
          newStatus: "aferida",
          clearFields: ["valeGeradoEm", "valeGeradoPor"],
        },
        pagamento: {
          tables: ["payroll_payments"],
          newStatus: "vale_gerado",
          clearFields: ["pagamentoSimuladoEm", "pagamentoSimuladoPor"],
        },
        consolidacao: {
          tables: [],
          newStatus: "pagamento_simulado",
          clearFields: ["consolidadoEm", "consolidadoPor"],
        },
      };

      const config = etapaMap[etapa];
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa inválida" });

      // Delete data from related tables (each table has different column names)
      const deleteFromTable = async (table: string) => {
        if (table === "timecard_daily") {
          await db.execute(sql`DELETE FROM timecard_daily WHERE "companyId" = ${companyId} AND "mesCompetencia" = ${mesReferencia}`);
          try { await db.execute(sql.raw(`DELETE FROM timecard_daily WHERE companyid = ${Number(companyId)} AND mescompetencia = '${String(mesReferencia).replace(/'/g, "''")}'`)); } catch {}
        } else if (table === "payroll_adjustments") {
          await db.execute(sql`DELETE FROM payroll_adjustments WHERE "companyId" = ${companyId} AND ("mesOrigem" = ${mesReferencia} OR "mesDesconto" = ${mesReferencia})`);
        } else if (table === "payroll_uploads") {
          await db.execute(sql`DELETE FROM payroll_uploads WHERE "companyId" = ${companyId} AND month = ${mesReferencia}`);
        } else if (table === "time_records") {
          await db.execute(sql`DELETE FROM time_records WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
        } else {
          await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
        }
      };

      for (const table of config.tables) {
        await deleteFromTable(table);
      }

      // Also clear downstream data (cascade)
      const etapaOrder = ["ponto", "escuro", "vale", "pagamento", "consolidacao"];
      const etapaIdx = etapaOrder.indexOf(etapa);
      for (let i = etapaIdx + 1; i < etapaOrder.length; i++) {
        const downstream = etapaMap[etapaOrder[i]];
        for (const table of downstream.tables) {
          await deleteFromTable(table);
        }
      }

      // Update period status and clear timestamp fields
      const clearSets = config.clearFields.map(f => `"${f}" = NULL`).join(", ");
      // Also clear downstream fields
      const allClearFields = new Set(config.clearFields);
      for (let i = etapaIdx + 1; i < etapaOrder.length; i++) {
        for (const f of etapaMap[etapaOrder[i]].clearFields) allClearFields.add(f);
      }
      const allClearSets = Array.from(allClearFields).map(f => `"${f}" = NULL`).join(", ");

      await db.execute(
        sql`UPDATE payroll_periods SET status = ${config.newStatus}, ${sql.raw(allClearSets)} WHERE id = ${periodId}`
      );

      return { success: true, newStatus: config.newStatus, etapaLimpa: etapa };
    }),

  resetarCompetencia: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { companyId, mesReferencia } = input;

      // Check period exists and is not travada
      const periods = ((await db.execute(
        sql`SELECT id, status FROM payroll_periods WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia} LIMIT 1`
      )) as any).rows || [];
      if (!periods[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Competência não encontrada" });
      if (periods[0].status === "travada") throw new TRPCError({ code: "FORBIDDEN", message: "Competência travada. Não é possível limpar." });

      const periodId = periods[0].id;

      // Delete ALL data for this competência (each table has different column names)
      await db.execute(sql`DELETE FROM timecard_daily WHERE "companyId" = ${companyId} AND "mesCompetencia" = ${mesReferencia}`);
      try { await db.execute(sql.raw(`DELETE FROM timecard_daily WHERE companyid = ${Number(companyId)} AND mescompetencia = '${String(mesReferencia).replace(/'/g, "''")}'`)); } catch {}
      await db.execute(sql`DELETE FROM time_records WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM time_inconsistencies WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_uploads WHERE "companyId" = ${companyId} AND month = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_adjustments WHERE "companyId" = ${companyId} AND ("mesOrigem" = ${mesReferencia} OR "mesDesconto" = ${mesReferencia})`);
      await db.execute(sql`DELETE FROM payroll_advances WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_payments WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM payroll_alerts WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);
      await db.execute(sql`DELETE FROM financial_events WHERE "companyId" = ${companyId} AND "mesCompetencia" = ${mesReferencia} AND "origemTipo" IN ('payroll_advance', 'payroll_payment')`);
      await db.execute(sql`DELETE FROM folha_lancamentos WHERE "companyId" = ${companyId} AND "mesReferencia" = ${mesReferencia}`);

      // Reset period to "aberta" and clear all timestamps
      await db.execute(sql`
        UPDATE payroll_periods SET 
          status = 'aberta',
          "pontoImportadoEm" = NULL, "pontoImportadoPor" = NULL,
          "afericaoRealizada" = 0, "afericaoEm" = NULL, "afericaoPor" = NULL,
          "valeGeradoEm" = NULL, "valeGeradoPor" = NULL,
          "pagamentoSimuladoEm" = NULL, "pagamentoSimuladoPor" = NULL,
          "consolidadoEm" = NULL, "consolidadoPor" = NULL,
          "totalDivergenciasAferidas" = 0, "retificadoEm" = NULL
        WHERE id = ${periodId}
      `);

      return { success: true, newStatus: "aberta" };
    }),

  // ============================================================
  // RESUMO DO PONTO POR FUNCIONÁRIO (para Etapa 2 do wizard)
  // ============================================================
  resumoPontoPorFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT 
          td."employeeId",
          e."nomeCompleto" as "employeeName",
          e.cpf as "employeeCpf",
          e.funcao as "employeeFuncao",
          e.funcao as "employeeRole",
          e."codigoInterno",
          e."codigoInterno" as "employeeCode",
          e."obraAtual" as "obraAtualId",
          oa.nome as "obraAtualNome",
          COUNT(DISTINCT td."data") as "totalDias",
          SUM(CASE WHEN td."isFalta" = 1 AND td."tipoDia" = 'util' THEN 1 ELSE 0 END) as "totalFaltas",
          SUM(CASE WHEN td."isAtraso" = 1 THEN 1 ELSE 0 END) as "totalAtrasos",
          SUM(td."minutosAtraso") as "totalMinutosAtraso",
          SUM(CASE WHEN td."isSaidaAntecipada" = 1 THEN 1 ELSE 0 END) as "saidasAntecipadas",
          SUM(CASE WHEN td."isInconsistente" = 1 AND td."inconsistenciaResolvida" = 0 THEN 1 ELSE 0 END) as "inconsistenciasPendentes",
          SUM(CASE WHEN td."isInconsistente" = 1 THEN 1 ELSE 0 END) as "totalInconsistencias",
          SUM(CASE WHEN td."statusDia" = 'escuro' THEN 1 ELSE 0 END) as "diasEscuro",
          SUM(CASE WHEN td."statusDia" = 'registrado' THEN 1 ELSE 0 END) as "diasRegistrados",
          SUM(EXTRACT(EPOCH FROM td."horasTrabalhadas"::interval)) as "horasTrabalhadasSec",
          SUM(EXTRACT(EPOCH FROM td."horasExtras"::interval)) as "horasExtrasSec",
          STRING_AGG(DISTINCT td."obraId"::text, ',') as "obraIds",
          STRING_AGG(DISTINCT o.nome, ',') as "obraNomes"
        FROM timecard_daily td
        LEFT JOIN employees e ON td."employeeId" = e.id
        LEFT JOIN obras o ON td."obraId" = o.id
        LEFT JOIN obras oa ON e."obraAtual" = oa.id
        WHERE td."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td."mesCompetencia" = ${input.mesReferencia}
        GROUP BY td."employeeId", e."nomeCompleto", e.cpf, e.funcao, e."codigoInterno", e."obraAtual", oa.nome
        ORDER BY e.nomeCompleto
      `)) as any).rows || [];
      
      // Parse the GROUP_CONCAT fields
      // Rev. 2001: se NENHUMA batida do mês trouxe obraId (raro mas comum pra funções
      // administrativas: mestre de obras, comprador, RH etc. que batem ponto no
      // escritório/QR-Code geral), faz fallback pra employees.obraAtual cadastrada.
      // Isso evita a coluna "Obra(s)" aparecer como "—" quando o funcionário ESTÁ sim
      // alocado a uma obra no cadastro — só não bateu ponto nela.
      return (rows || []).map((r: any) => {
        const obraIdsFromTd = r.obraIds ? r.obraIds.split(',').map(Number).filter((n: number) => !isNaN(n)) : [];
        const obraNomesFromTd = r.obraNomes ? r.obraNomes.split(',').filter(Boolean) : [];
        const useFallback = obraIdsFromTd.length === 0 && r.obraAtualId;
        return {
          ...r,
          obraIds: useFallback ? [Number(r.obraAtualId)] : obraIdsFromTd,
          obraNomes: useFallback && r.obraAtualNome ? [r.obraAtualNome] : obraNomesFromTd,
          obraFromCadastro: useFallback, // flag pra UI sinalizar origem (opcional)
          multiplasObras: obraIdsFromTd.length > 1,
        };
      });
    }),

  // ============================================================
  // ESPELHO DE PONTO POR FUNCIONÁRIO (para Etapa 2 do wizard)
  // ============================================================
  espelhoPontoFuncionario: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(), employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT td.*, e."nomeCompleto", e.funcao, e."codigoInterno", e.cpf, e."salarioBase",
               o.nome as "obraNome"
        FROM timecard_daily td
        LEFT JOIN employees e ON td."employeeId" = e.id
        LEFT JOIN obras o ON td."obraId" = o.id
        WHERE td."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) 
          AND td."mesCompetencia" = ${input.mesReferencia}
          AND td."employeeId" = ${input.employeeId}
        ORDER BY td."data" ASC
      `)) as any).rows || [];
      return rows || [];
    }),

  // ============================================================
  // CONFLITOS DE OBRA (funcionário em 2+ obras no mesmo dia)
  // ============================================================
  conflitosObra: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT 
          td."employeeId",
          e."nomeCompleto" as "employeeName",
          td."data",
          STRING_AGG(DISTINCT td."obraId"::text, ',') as "obraIds",
          STRING_AGG(DISTINCT o.nome, ',') as "obraNomes",
          STRING_AGG(CONCAT(COALESCE(td."entrada1",''), '|', COALESCE(td."saida1",''), '|', COALESCE(o.nome,'')), ',') as detalhes
        FROM timecard_daily td
        LEFT JOIN employees e ON td."employeeId" = e.id
        LEFT JOIN obras o ON td."obraId" = o.id
        WHERE td."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND td."mesCompetencia" = ${input.mesReferencia}
          AND td."obraId" IS NOT NULL
        GROUP BY td."employeeId", e."nomeCompleto", td."data"
        HAVING COUNT(DISTINCT td."obraId") > 1
        ORDER BY td."data", e."nomeCompleto"
      `)) as any).rows || [];
      return (rows || []).map((r: any) => ({
        ...r,
        obraIds: r.obraIds ? r.obraIds.split(',').map(Number) : [],
        obraNomes: r.obraNomes ? r.obraNomes.split(',') : [],
      }));
    }),

  // ============================================================
  // DIVERGÊNCIA: ATIVOS SEM FOLHA PROCESSADA
  // Cruza funcionários ativos com folha processada no mês
  // Retorna lista de quem ficou de fora do processamento
  // ============================================================
  divergenciaAtivosSemFolha: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const ids = resolveCompanyIds(input);

      // 1. Buscar todos os funcionários ativos (não desligados/lista_negra) que são CLT
      const ativosRows = ((await db.execute(sql`
        SELECT id, "nomeCompleto", funcao, "tipoContrato", "companyId", status, "codigoInterno"
        FROM employees
        WHERE "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND status NOT IN ('Desligado', 'Lista_Negra')
          AND "deletedAt" IS NULL
        ORDER BY "nomeCompleto"
      `)) as any).rows || [];

      // 2. Buscar employeeIds que têm pagamento processado neste mês
      const pagosRows = ((await db.execute(sql`
        SELECT DISTINCT "employeeId"
        FROM payroll_payments
        WHERE "companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND "mesReferencia" = ${input.mesReferencia}
      `)) as any).rows || [];
      const pagosSet = new Set((pagosRows || []).map((r: any) => r.employeeId));

      // 3. Buscar employeeIds que têm lançamento na folha importada (folha_itens) neste mês
      const folhaRows = ((await db.execute(sql`
        SELECT DISTINCT fi."employeeId"
        FROM folha_itens fi
        INNER JOIN folha_lancamentos fl ON fi."folhaLancamentoId" = fl.id
        WHERE fl."companyId" IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})
          AND fl."mesReferencia" = ${input.mesReferencia}
          AND fi."employeeId" IS NOT NULL
      `)) as any).rows || [];
      const folhaSet = new Set((folhaRows || []).map((r: any) => r.employeeId));

      // 4. Unir os dois conjuntos (quem tem folha processada = payroll_payments OU folha_itens)
      const processadosSet = new Set([...Array.from(pagosSet), ...Array.from(folhaSet)]);

      // 5. Separar ativos CLT e PJ
      const ativosCLT = (ativosRows || []).filter((e: any) => e.tipoContrato === 'CLT');
      const ativosPJ = (ativosRows || []).filter((e: any) => e.tipoContrato === 'PJ');
      const ativosOutros = (ativosRows || []).filter((e: any) => !['CLT', 'PJ'].includes(e.tipoContrato || ''));

      // 6. Identificar CLTs sem folha
      const cltSemFolha = ativosCLT.filter((e: any) => !processadosSet.has(e.id));

      // 7. Identificar PJs sem folha (informativo)
      const pjSemFolha = ativosPJ.filter((e: any) => !processadosSet.has(e.id));

      return {
        totalAtivos: ativosRows.length,
        totalAtivosCLT: ativosCLT.length,
        totalAtivosPJ: ativosPJ.length,
        totalAtivosOutros: ativosOutros.length,
        totalProcessados: processadosSet.size,
        totalCltComFolha: ativosCLT.filter((e: any) => processadosSet.has(e.id)).length,
        totalCltSemFolha: cltSemFolha.length,
        totalPjSemFolha: pjSemFolha.length,
        cltSemFolha: cltSemFolha.map((e: any) => ({
          id: e.id,
          nome: e.nomeCompleto,
          funcao: e.funcao || '—',
          status: e.status,
          codigo: e.codigoInterno || '—',
        })),
        pjSemFolha: pjSemFolha.map((e: any) => ({
          id: e.id,
          nome: e.nomeCompleto,
          funcao: e.funcao || '—',
          status: e.status,
          codigo: e.codigoInterno || '—',
        })),
        temDivergencia: cltSemFolha.length > 0 || pjSemFolha.length > 0,
      };
    }),

  // ============================================================
  // CONSOLIDAR / DESCONSOLIDAR VALE INTERNO (cálculo payroll_advances)
  // Sem verificações de PDF contábil — é o fluxo interno de adiantamento.
  // ============================================================
  consolidarVale: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";

      // Atualiza payroll_periods
      await db.execute(sql`
        UPDATE payroll_periods
        SET status = 'vale_consolidado',
            "valeConsolidadoEm" = ${agora},
            "valeConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);

      // Se existir folhaLancamento tipo 'vale', consolida também
      await db.execute(sql`
        UPDATE folha_lancamentos
        SET status = 'consolidado',
            "consolidadoPor" = ${quem},
            "consolidadoEm" = ${agora}
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "tipoLancamento" = 'vale'
          AND status != 'consolidado'
      `);

      return { success: true };
    }),

  desconsolidarVale: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);

      // Reverte payroll_periods para vale_gerado
      await db.execute(sql`
        UPDATE payroll_periods
        SET status = 'vale_gerado',
            "valeConsolidadoEm" = NULL,
            "valeConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
          AND status = 'vale_consolidado'
      `);

      // Reverte folhaLancamento se existir
      await db.execute(sql`
        UPDATE folha_lancamentos
        SET status = 'importado',
            "consolidadoPor" = NULL,
            "consolidadoEm" = NULL
        WHERE "companyId" = ${input.companyId}
          AND "mesReferencia" = ${input.mesReferencia}
          AND "tipoLancamento" = 'vale'
          AND status = 'consolidado'
      `);

      return { success: true };
    }),

  consolidarHE: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";
      await db.execute(sql`
        UPDATE payroll_periods
        SET "heConsolidadoEm" = ${agora},
            "heConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  desconsolidarHE: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      await db.execute(sql`
        UPDATE payroll_periods
        SET "heConsolidadoEm" = NULL,
            "heConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  consolidarAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";
      await db.execute(sql`
        UPDATE payroll_periods
        SET "afericaoConsolidadoEm" = ${agora},
            "afericaoConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  desconsolidarAfericao: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      await db.execute(sql`
        UPDATE payroll_periods
        SET "afericaoConsolidadoEm" = NULL,
            "afericaoConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  consolidarPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      const agora = new Date().toISOString().replace("T", " ").substring(0, 19);
      const quem = ctx.user?.name || "Sistema";
      await db.execute(sql`
        UPDATE payroll_periods
        SET "pagamentoConsolidadoEm" = ${agora},
            "pagamentoConsolidadoPor" = ${quem}
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  desconsolidarPagamento: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await ensurePeriodExists(db, resolveCompanyIds(input), input.mesReferencia);
      await db.execute(sql`
        UPDATE payroll_periods
        SET "pagamentoConsolidadoEm" = NULL,
            "pagamentoConsolidadoPor" = NULL
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}
      `);
      return { success: true };
    }),

  gerarRemessaCnab: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      mesReferencia: z.string(),
      codigoBanco: z.string(),
      contaBancariaId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      // Guard de tenancy: o usuário precisa ter acesso à empresa informada.
      // protectedProcedure só garante login; sem este check, `companyId` forjado
      // permitiria gerar remessa CNAB de empresa fora do tenant (IDOR).
      const empresasPermitidas = await getCompaniesForUser(ctx.user.id, ctx.user.role);
      if (!empresasPermitidas.some((c: any) => c.id === input.companyId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem acesso a esta empresa" });
      }

      const companyRows = ((await db.execute(sql`
        SELECT cnpj, "razaoSocial" FROM companies WHERE id = ${input.companyId} LIMIT 1
      `)) as any).rows || [];
      if (!companyRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada" });
      const company = companyRows[0];

      let bankAccountFilter = sql`"companyId" = ${input.companyId} AND "codigoBanco" = ${input.codigoBanco} AND ativo = 1 AND "deletedAt" IS NULL`;
      if (input.contaBancariaId) {
        bankAccountFilter = sql`id = ${input.contaBancariaId} AND "companyId" = ${input.companyId} AND ativo = 1 AND "deletedAt" IS NULL`;
      }
      const bankRows = ((await db.execute(sql`
        SELECT * FROM company_bank_accounts WHERE ${bankAccountFilter} LIMIT 1
      `)) as any).rows || [];
      if (!bankRows[0]) throw new TRPCError({ code: "NOT_FOUND", message: `Conta bancária da empresa não encontrada para o banco ${input.codigoBanco}. Configure uma conta bancária nas configurações.` });
      const bankAccount = bankRows[0];

      const payRows = ((await db.execute(sql`
        SELECT pp."salarioLiquido", pp."dataPagamentoPrevista",
          e."nomeCompleto", e.cpf, e.banco, e.agencia, e.conta, e."tipoConta",
          e."tipoChavePix", e."chavePix", e."contaBancariaEmpresaId"
        FROM payroll_payments pp
        LEFT JOIN employees e ON pp."employeeId" = e.id
        WHERE pp."companyId" = ${input.companyId} AND pp."mesReferencia" = ${input.mesReferencia}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];

      const funcBancoCodigo = input.codigoBanco;
      const bankCodeMap: Record<string, string> = {
        'caixa': '104', 'santander': '033', 'bradesco': '237',
        'itau': '341', 'itaú': '341', 'banco do brasil': '001',
        'c6': '336', 'nubank': '260', 'inter': '077',
      };
      function matchBankCode(bancoName: string): string {
        const lower = (bancoName || '').toLowerCase();
        for (const [key, code] of Object.entries(bankCodeMap)) {
          if (lower.includes(key)) return code;
        }
        return '000';
      }

      // Rev. — A remessa agrupa pela CONTA DA EMPRESA PARA PAGAMENTO (conta salário
      // pela qual a empresa paga), NÃO pelo banco pessoal do funcionário. Quando o
      // cliente envia `contaBancariaId`, filtramos os funcionários vinculados a essa
      // conta-empresa. Fallback legado (sem contaBancariaId): filtra pelo banco
      // pessoal por compatibilidade.
      const funcionariosFiltrados = input.contaBancariaId
        ? payRows.filter((r: any) => Number(r.contaBancariaEmpresaId) === input.contaBancariaId)
        : payRows.filter((r: any) => matchBankCode(r.banco || '') === funcBancoCodigo);

      if (funcionariosFiltrados.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Nenhum funcionário vinculado a esta conta de pagamento para ${input.mesReferencia}.` });
      }

      // Favorecido = conta da empresa para pagamento (conta salário). O banco
      // identifica o colaborador pelo CPF. Não usamos a conta pessoal.
      const cnabFuncionarios = funcionariosFiltrados.map((r: any) => ({
        nome: r.nomeCompleto || '',
        cpf: r.cpf || '',
        banco: bankAccount.banco || '',
        codigoBanco: bankAccount.codigoBanco || input.codigoBanco,
        agencia: bankAccount.agencia || '',
        conta: bankAccount.conta || '',
        tipoConta: bankAccount.tipoConta || 'corrente',
        valorLiquido: parseFloat(r.salarioLiquido || '0'),
        dataPagamento: r.dataPagamentoPrevista || '',
        tipoChavePix: r.tipoChavePix || '',
        chavePix: r.chavePix || '',
      }));

      const cnabEmpresa = {
        cnpj: company.cnpj || '',
        razaoSocial: company.razaoSocial || '',
        codigoBanco: bankAccount.codigoBanco || input.codigoBanco,
        agencia: bankAccount.agencia || '',
        conta: bankAccount.conta || '',
        tipoConta: bankAccount.tipoConta || 'corrente',
        convenio: bankAccount.convenio || '',
      };

      const arquivo = gerarCnab240(cnabEmpresa, cnabFuncionarios);
      const totalValor = cnabFuncionarios.reduce((s: number, f: any) => s + f.valorLiquido, 0);
      const bancoNome = funcBancoCodigo === '104' ? 'Caixa' : funcBancoCodigo === '033' ? 'Santander' : `Banco ${funcBancoCodigo}`;

      return {
        arquivo,
        nomeArquivo: `REMESSA_${bancoNome.toUpperCase()}_${input.mesReferencia.replace('-', '')}.rem`,
        totalFuncionarios: cnabFuncionarios.length,
        totalValor,
        banco: bancoNome,
      };
    }),

  // ===== APROVAÇÃO RH (Rev. 1203) =====
  // Lista lançamentos pendentes de aprovação RH (pensão, outros, EPI, convênio)
  listarPendenciasAprovacaoRh: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const userId = Number((ctx as any)?.user?.id);
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado" });
      // Multi-tenant: valida acesso à empresa via user_companies (Rev. 1214)
      const accessChk = ((await db.execute(sql`
        SELECT 1 FROM user_companies WHERE "userId" = ${userId} AND "companyId" = ${Number(input.companyId)} LIMIT 1
      `)) as any).rows || [];
      if (accessChk.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para ver pendências dessa empresa" });
      // Rev. 1205: pensão saiu da aprovação RH (cálculo é dinâmico do cadastro). Aqui só 'outros'.
      const adjs = ((await db.execute(sql`
        SELECT pa.id, pa."employeeId", pa.tipo, pa.descricao, pa."valorDesconto", pa.data,
               pa."aprovadoRh", pa."aprovadoRhEm", pa."aprovadoRhMotivo",
               e."nomeCompleto", e."codigoInterno", e.funcao
        FROM payroll_adjustments pa
        JOIN employees e ON e.id = pa."employeeId"
        WHERE pa."companyId" = ${input.companyId}
          AND pa."mesDesconto" = ${input.mesReferencia}
          AND pa.status IN ('pendente','aplicado')
          AND pa.tipo = 'outros'
        ORDER BY e."nomeCompleto", pa.data
      `)) as any).rows || [];
      const epi = ((await db.execute(sql`
        SELECT ed.id, ed."employeeId", ed.epi_nome, ed.ca, ed.quantidade, ed.valor_total, ed.status,
               ed.justificativa, ed.motivo_cobranca, ed.data_validacao,
               e."nomeCompleto", e."codigoInterno", e.funcao
        FROM epi_discount_alerts ed
        JOIN employees e ON e.id = ed."employeeId"
        WHERE ed."companyId" = ${input.companyId}
          AND ed.mes_referencia = ${input.mesReferencia}
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];
      // Janela de ponto: dia 16 do mês anterior até dia 15 do mês de competência.
      // Ex.: competência 2026-03 → 2026-02-16 a 2026-03-15.
      const [yyStr, mmStr] = String(input.mesReferencia).split("-");
      const yy = Number(yyStr);
      const mm = Number(mmStr);
      const prevYY = mm === 1 ? yy - 1 : yy;
      const prevMM = mm === 1 ? 12 : mm - 1;
      const cycleStart = `${prevYY}-${String(prevMM).padStart(2, "0")}-16`;
      const cycleEnd   = `${yy}-${String(mm).padStart(2, "0")}-15`;
      // Rev. 1215: cada lançamento aparece em UMA única competência (mesmo ciclo do ponto).
      // - Se `competencia_desconto` está preenchido → respeita o explícito (parcelamento etc).
      // - Caso contrário → deriva pelo ciclo de fechamento (16/N-1 a 15/N → competência N).
      const conv = ((await db.execute(sql`
        SELECT lp.id, lp."employeeId", lp.valor, lp.status,
               COALESCE(lp.descricao_itens, p.razao_social, 'Compra em parceiro') AS descricao,
               lp.data_compra, lp.competencia_desconto,
               e."nomeCompleto", e."codigoInterno", e.funcao
        FROM lancamentos_parceiros lp
        JOIN employees e ON e.id = lp."employeeId"
        LEFT JOIN parceiros_conveniados p ON p.id = lp."parceiroId"
        WHERE lp."companyId" = ${input.companyId}
          AND (
            (lp.competencia_desconto IS NOT NULL
              AND lp.competencia_desconto = ${input.mesReferencia})
            OR (lp.competencia_desconto IS NULL
              AND lp.data_compra::date >= ${cycleStart}::date
              AND lp.data_compra::date <= ${cycleEnd}::date)
          )
        ORDER BY e."nomeCompleto"
      `)) as any).rows || [];
      return { adjustments: adjs, epi, convenios: conv };
    }),

  // Aprova/reprova lançamento (outros/pensão/EPI/convênio). Aprovador vem de ctx.user (evita IDOR).
  // Rev. 1203: pensão volta a passar por aprovação RH via payroll_adjustments tipo='pensao'.
  aprovarAdjustmentRh: protectedProcedure
    .input(z.object({ adjustmentId: z.number(), aprovado: z.boolean(), motivo: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const userId = Number((ctx as any)?.user?.id);
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado" });
      // Valida ownership (tenant isolation) via user_companies (Rev. 1214)
      const chk = ((await db.execute(sql`
        SELECT "companyId", tipo FROM payroll_adjustments WHERE id = ${input.adjustmentId} LIMIT 1
      `)) as any).rows || [];
      if (chk.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
      const targetCompanyId = Number(chk[0].companyId);
      const accessChk = ((await db.execute(sql`
        SELECT 1 FROM user_companies WHERE "userId" = ${userId} AND "companyId" = ${targetCompanyId} LIMIT 1
      `)) as any).rows || [];
      if (accessChk.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para aprovar lançamento dessa empresa" });
      await db.execute(sql`
        UPDATE payroll_adjustments
        SET "aprovadoRh" = ${input.aprovado},
            "aprovadoRhPor" = ${userId},
            "aprovadoRhEm" = NOW(),
            "aprovadoRhMotivo" = ${input.motivo || null},
            "updatedAt" = NOW()
        WHERE id = ${input.adjustmentId} AND "companyId" = ${targetCompanyId}
      `);
      return { ok: true };
    }),

  // Aprova/reprova cobrança de EPI (usada na tela de Aprovações RH)
  aprovarEpiCobranca: protectedProcedure
    .input(z.object({ epiAlertId: z.number(), aprovado: z.boolean(), justificativa: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const userId = Number((ctx as any)?.user?.id);
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado" });
      const chk = ((await db.execute(sql`SELECT "companyId" FROM epi_discount_alerts WHERE id = ${input.epiAlertId} LIMIT 1`)) as any).rows || [];
      if (chk.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Cobrança não encontrada" });
      const targetCompanyId = Number(chk[0].companyId);
      const accessChk = ((await db.execute(sql`SELECT 1 FROM user_companies WHERE "userId" = ${userId} AND "companyId" = ${targetCompanyId} LIMIT 1`)) as any).rows || [];
      if (accessChk.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      await db.execute(sql`
        UPDATE epi_discount_alerts
        SET status = ${input.aprovado ? 'aprovado' : 'rejeitado'},
            "validadoPorUserId" = ${userId},
            data_validacao = NOW(),
            justificativa = ${input.justificativa || null},
            "updatedAt" = NOW()
        WHERE id = ${input.epiAlertId} AND "companyId" = ${targetCompanyId}
      `);
      return { ok: true };
    }),

  // Aprova/reprova lançamento de parceiro (convênio)
  aprovarLancamentoParceiro: protectedProcedure
    .input(z.object({ lancamentoId: z.number(), aprovado: z.boolean(), motivo: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const userId = Number((ctx as any)?.user?.id);
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado" });
      const chk = ((await db.execute(sql`SELECT "companyId" FROM lancamentos_parceiros WHERE id = ${input.lancamentoId} LIMIT 1`)) as any).rows || [];
      if (chk.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
      const targetCompanyId = Number(chk[0].companyId);
      const accessChk = ((await db.execute(sql`SELECT 1 FROM user_companies WHERE "userId" = ${userId} AND "companyId" = ${targetCompanyId} LIMIT 1`)) as any).rows || [];
      if (accessChk.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      await db.execute(sql`
        UPDATE lancamentos_parceiros
        SET status = ${input.aprovado ? 'aprovado' : 'rejeitado'},
            aprovado_por = ${userId},
            aprovado_em = NOW(),
            motivo_rejeicao = ${input.aprovado ? null : (input.motivo || null)},
            comentario_admin = ${input.motivo || null},
            updated_at = NOW()
        WHERE id = ${input.lancamentoId} AND "companyId" = ${targetCompanyId}
      `);
      return { ok: true };
    }),

  // Gera adjustments mensais de pensão alimentícia (tipo='pensao') aguardando aprovação RH (Rev. 1203).
  // Para cada empregado com pensaoAlimenticia=true: calcula valor (valor_fixo OU percentual sobre base bruto/SM)
  // e cria 1 lançamento aprovadoRh=false. Idempotente: ignora empregados que já tenham pensão criada no mês.
  gerarPensoesMes: protectedProcedure
    .input(z.object({ companyId: z.number(), mesReferencia: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const userId = Number((ctx as any)?.user?.id);
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário não autenticado" });
      const accessChk = ((await db.execute(sql`SELECT 1 FROM user_companies WHERE "userId" = ${userId} AND "companyId" = ${Number(input.companyId)} LIMIT 1`)) as any).rows || [];
      if (accessChk.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para gerar pensões dessa empresa" });

      // Salário mínimo vigente (system_criteria — chave/valor, igual ao simularPagamento)
      const smRows = ((await db.execute(sql`
        SELECT valor FROM system_criteria
        WHERE "companyId" = ${input.companyId} AND chave = 'salario_minimo_vigente'
        LIMIT 1
      `)) as any).rows || [];
      const salarioMinimo = parseBRL(smRows[0]?.valor) || 1621;

      // Idempotência sob concorrência: índice único parcial + ON CONFLICT DO NOTHING
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS padj_pensao_unique_mes
        ON payroll_adjustments ("companyId", "employeeId", "mesDesconto")
        WHERE tipo = 'pensao'
      `);

      // Empregados com pensão ativa (status segue convenção capitalizada do domínio)
      const emps = ((await db.execute(sql`
        SELECT id, "salarioBase", "pensaoTipo", "pensaoValor", "pensaoPercentual", "pensaoBase"
        FROM employees
        WHERE "companyId" = ${input.companyId}
          AND "pensaoAlimenticia" = 1
          AND "deletedAt" IS NULL
          AND status IN ('Ativo', 'Ferias')
      `)) as any).rows || [];

      // Mês destes adjustments (tanto origem quanto desconto = mês corrente)
      const dataLancamento = `${input.mesReferencia}-01`;
      let criados = 0;
      let pulados = 0;

      for (const e of emps) {
        // Idempotência: já existe pensão para este empregado no mês?
        const existente = ((await db.execute(sql`
          SELECT id FROM payroll_adjustments
          WHERE "companyId" = ${input.companyId}
            AND "employeeId" = ${Number(e.id)}
            AND tipo = 'pensao'
            AND "mesDesconto" = ${input.mesReferencia}
          LIMIT 1
        `)) as any).rows || [];
        if (existente.length > 0) { pulados++; continue; }

        // Calcula valor da pensão
        let valor = 0;
        let descricao = 'Pensão alimentícia';
        if (e.pensaoTipo === 'percentual') {
          const perc = (parseBRL(e.pensaoPercentual) || 0) / 100;
          const base = e.pensaoBase === 'salario_minimo' ? salarioMinimo : parseBRL(e.salarioBase);
          valor = base * perc;
          descricao = `Pensão ${(perc * 100).toFixed(2)}% sobre ${e.pensaoBase === 'salario_minimo' ? 'salário mínimo' : 'salário bruto'}`;
        } else {
          valor = parseBRL(e.pensaoValor) || 0;
          descricao = 'Pensão alimentícia (valor fixo)';
        }

        if (valor <= 0) { pulados++; continue; }

        const ins = (await db.execute(sql`
          INSERT INTO payroll_adjustments
            ("companyId", "employeeId", "mesOrigem", "mesDesconto", data, tipo, descricao,
             "valorDesconto", "valorTotal", status, "aprovadoRh")
          VALUES
            (${input.companyId}, ${Number(e.id)}, ${input.mesReferencia}, ${input.mesReferencia},
             ${dataLancamento}, 'pensao', ${descricao},
             ${valor.toFixed(2)}, ${valor.toFixed(2)}, 'pendente', false)
          ON CONFLICT ("companyId", "employeeId", "mesDesconto") WHERE tipo = 'pensao' DO NOTHING
          RETURNING id
        `)) as any;
        if ((ins.rowCount ?? ins.rows?.length ?? 0) > 0) criados++;
        else pulados++;
      }

      return { criados, pulados, total: emps.length };
    }),

  listarContasBancariasEmpresa: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const rows = ((await db.execute(sql`
        SELECT * FROM company_bank_accounts 
        WHERE "companyId" = ${input.companyId} AND ativo = 1 AND "deletedAt" IS NULL
        ORDER BY banco
      `)) as any).rows || [];
      return rows || [];
    }),
});
// ============================================================
// HELPER FUNCTIONS
// ============================================================
async function getEmployeeValorHora(db: any, employeeId: number): Promise<number> {
  const rows = ((await db.execute(sql`SELECT "valorHora" FROM employees WHERE id = ${employeeId} LIMIT 1`)) as any).rows || [];
  return parseBRL(rows[0]?.valorHora);
}

async function getEmployeeVrDiario(db: any, employeeId: number, companyId: number): Promise<number> {
  const rows = ((await db.execute(sql`
    SELECT "valorDiario" FROM vr_benefits 
    WHERE "employeeId" = ${employeeId} AND "companyId" = ${companyId}
    ORDER BY "mesReferencia" DESC LIMIT 1
  `)) as any).rows || [];
  if (rows[0]?.valorDiario) return parseBRL(rows[0].valorDiario);
  return 0;
}

async function getEmployeeVtDiario(db: any, employeeId: number): Promise<number> {
  const rows = ((await db.execute(sql`SELECT "vtValorDiario" FROM employees WHERE id = ${employeeId} LIMIT 1`)) as any).rows || [];
  return parseBRL(rows[0]?.vtValorDiario);
}
