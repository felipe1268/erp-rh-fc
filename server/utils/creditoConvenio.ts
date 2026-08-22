/**
 * Rev. 4707 — Motor de crédito do convênio de parceiros ("poka-yoke").
 *
 * Regras (ativas apenas quando o parceiro tem limite mensal > 0):
 *  1. Situação: Desligado/Lista_Negra/Inativo e Afastado → bloqueado.
 *     Férias → liberado (continua recebendo; dá pra descontar).
 *  2. Carência: menos de N dias de admissão (padrão 30) → bloqueado.
 *  3. Débito anterior (se travarDebitoAnterior=1): se a competência
 *     anterior tem consumo APROVADO do colaborador e a folha daquela
 *     competência ainda NÃO foi consolidada → bloqueado.
 *  4. Limite do mês: consumo já lançado (pendente+aprovado) no parceiro
 *     na competência + valor novo > limite → bloqueado.
 *
 * FAIL-SAFE: qualquer erro na avaliação → BLOQUEADO (nunca libera na dúvida).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { lancamentosParceiros, payrollPeriods, employees } from "../../drizzle/schema";
import { EMPLOYEE_STATUS_DESLIGADOS } from "../../shared/modules";

export type CreditoResultado = {
  liberado: boolean;
  codigo: "ok" | "sem_limite" | "situacao" | "carencia" | "debito_anterior" | "limite" | "erro";
  motivo: string;
  limite: number;
  usado: number;
  disponivel: number;
};

/** Competência do desconto pela regra 16→15 (mesma do lancamentos.create). */
export function competenciaDaData(dataCompra: string): string {
  const [yS, mS, dS] = String(dataCompra).slice(0, 10).split("-");
  let y = Number(yS); let m = Number(mS); const d = Number(dS);
  if (d >= 16) { m += 1; if (m > 12) { m = 1; y += 1; } }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function competenciaAnterior(comp: string): string {
  let [y, m] = comp.split("-").map(Number);
  m -= 1; if (m < 1) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function hojeBrasilia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const num = (v: any): number => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Contexto pré-computado (permite avaliar 1 ou N colaboradores). */
export type CreditoContexto = {
  limite: number;
  carenciaDias: number;
  travarDebito: boolean;
  competencia: string;
  /** soma por employeeId do consumo (pendente+aprovado) no PARCEIRO na competência */
  usadoPorEmp: Map<number, number>;
  /** employeeIds com consumo APROVADO (qualquer parceiro da empresa) na competência anterior */
  devedoresCompAnterior: Set<number>;
  /** folha da competência anterior consolidada? */
  folhaAnteriorConsolidada: boolean;
};

export async function montarContextoCredito(db: any, params: {
  companyId: number;
  parceiro: { id: number; limiteMensalPorColaborador?: any; carenciaDias?: any; travarDebitoAnterior?: any };
  competencia?: string;
}): Promise<CreditoContexto> {
  const competencia = params.competencia || competenciaDaData(hojeBrasilia());
  const limite = num(params.parceiro.limiteMensalPorColaborador);
  const carenciaDias = params.parceiro.carenciaDias == null ? 30 : Number(params.parceiro.carenciaDias) || 0;
  const travarDebito = params.parceiro.travarDebitoAnterior == null ? false : Number(params.parceiro.travarDebitoAnterior) === 1;

  const usadoPorEmp = new Map<number, number>();
  const devedoresCompAnterior = new Set<number>();
  let folhaAnteriorConsolidada = false;

  if (limite > 0) {
    // Consumo na competência atual (pendente + aprovado) DESTE parceiro
    const usados = await db.select({
      employeeId: lancamentosParceiros.employeeId,
      total: sql<string>`COALESCE(SUM(${lancamentosParceiros.valor}::numeric), 0)`,
    }).from(lancamentosParceiros).where(and(
      eq(lancamentosParceiros.companyId, params.companyId),
      eq(lancamentosParceiros.parceiroId, params.parceiro.id),
      eq(lancamentosParceiros.competenciaDesconto, competencia),
      inArray(lancamentosParceiros.status, ["pendente", "aprovado"]),
    )).groupBy(lancamentosParceiros.employeeId);
    for (const r of usados) usadoPorEmp.set(Number(r.employeeId), num(r.total));

    if (travarDebito) {
      const compAnt = competenciaAnterior(competencia);
      // Consolidação da folha da competência anterior
      const [pp] = await db.select({ c: payrollPeriods.pagamentoConsolidadoEm })
        .from(payrollPeriods)
        .where(and(eq(payrollPeriods.companyId, params.companyId), eq(payrollPeriods.mesReferencia, compAnt)))
        .limit(1);
      folhaAnteriorConsolidada = !!pp?.c;
      if (!folhaAnteriorConsolidada) {
        // Quem tem consumo aprovado (qualquer parceiro) na competência anterior
        const devs = await db.select({ employeeId: lancamentosParceiros.employeeId })
          .from(lancamentosParceiros).where(and(
            eq(lancamentosParceiros.companyId, params.companyId),
            eq(lancamentosParceiros.competenciaDesconto, compAnt),
            eq(lancamentosParceiros.status, "aprovado"),
          )).groupBy(lancamentosParceiros.employeeId);
        for (const r of devs) devedoresCompAnterior.add(Number(r.employeeId));
      }
    }
  }
  return { limite, carenciaDias, travarDebito, competencia, usadoPorEmp, devedoresCompAnterior, folhaAnteriorConsolidada };
}

/** Avalia um colaborador dentro de um contexto pré-computado. NUNCA lança. */
export function avaliarCredito(ctx: CreditoContexto, emp: {
  id: number; status?: string | null; dataAdmissao?: string | null;
}, valorNovo = 0): CreditoResultado {
  try {
    if (!(ctx.limite > 0)) {
      return { liberado: true, codigo: "sem_limite", motivo: "", limite: 0, usado: 0, disponivel: 0 };
    }
    const usado = ctx.usadoPorEmp.get(emp.id) || 0;
    const disponivel = Math.max(0, ctx.limite - usado);
    const base = { limite: ctx.limite, usado, disponivel };

    const st = String(emp.status || "");
    if (EMPLOYEE_STATUS_DESLIGADOS.includes(st)) {
      return { liberado: false, codigo: "situacao", motivo: "Colaborador desligado — benefício indisponível", ...base, disponivel: 0 };
    }
    if (st === "Afastado") {
      return { liberado: false, codigo: "situacao", motivo: "Colaborador afastado — benefício suspenso", ...base, disponivel: 0 };
    }

    // Carência — FAIL-SAFE: sem data de admissão registrada = bloqueado
    const adm = String(emp.dataAdmissao || "").slice(0, 10);
    if (ctx.carenciaDias > 0) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(adm)) {
        return { liberado: false, codigo: "carencia", motivo: "Cadastro sem data de admissão — procure o RH", ...base, disponivel: 0 };
      }
      const admDate = new Date(adm + "T12:00:00");
      const libera = new Date(admDate.getTime() + ctx.carenciaDias * 86_400_000);
      const hoje = new Date(hojeBrasilia() + "T12:00:00");
      if (hoje < libera) {
        const dd = String(libera.getDate()).padStart(2, "0");
        const mm = String(libera.getMonth() + 1).padStart(2, "0");
        return { liberado: false, codigo: "carencia", motivo: `Em carência — benefício libera em ${dd}/${mm}/${libera.getFullYear()}`, ...base, disponivel: 0 };
      }
    }

    if (ctx.travarDebito && !ctx.folhaAnteriorConsolidada && ctx.devedoresCompAnterior.has(emp.id)) {
      return { liberado: false, codigo: "debito_anterior", motivo: "Há consumo do mês anterior ainda não descontado em folha", ...base, disponivel: 0 };
    }

    if (valorNovo > 0 && usado + valorNovo > ctx.limite + 0.005) {
      return { liberado: false, codigo: "limite", motivo: `Limite do mês atingido — disponível R$ ${disponivel.toFixed(2).replace(".", ",")}`, ...base };
    }
    if (disponivel <= 0) {
      return { liberado: false, codigo: "limite", motivo: "Limite do mês atingido", ...base };
    }
    return { liberado: true, codigo: "ok", motivo: "", ...base };
  } catch (e) {
    // Poka-yoke: erro na avaliação NUNCA libera
    return { liberado: false, codigo: "erro", motivo: "Não foi possível validar o crédito — tente novamente ou procure o RH", limite: ctx?.limite || 0, usado: 0, disponivel: 0 };
  }
}

/** Avaliação completa de UM colaborador (carrega tudo). NUNCA libera em erro. */
export async function avaliarCreditoColaborador(db: any, params: {
  companyId: number;
  parceiro: any;
  employeeId: number;
  dataCompra?: string;
  valorNovo?: number;
}): Promise<CreditoResultado> {
  try {
    const competencia = competenciaDaData(params.dataCompra || hojeBrasilia());
    const ctx = await montarContextoCredito(db, { companyId: params.companyId, parceiro: params.parceiro, competencia });
    if (!(ctx.limite > 0)) return { liberado: true, codigo: "sem_limite", motivo: "", limite: 0, usado: 0, disponivel: 0 };
    const [emp] = await db.select({
      id: employees.id, status: employees.status, dataAdmissao: employees.dataAdmissao, companyId: employees.companyId,
    }).from(employees).where(eq(employees.id, params.employeeId)).limit(1);
    if (!emp || Number(emp.companyId) !== Number(params.companyId)) {
      return { liberado: false, codigo: "erro", motivo: "Colaborador não encontrado nesta empresa", limite: ctx.limite, usado: 0, disponivel: 0 };
    }
    return avaliarCredito(ctx, emp, params.valorNovo || 0);
  } catch (e) {
    console.error("[creditoConvenio] erro na avaliação — bloqueando por segurança:", e);
    return { liberado: false, codigo: "erro", motivo: "Não foi possível validar o crédito — tente novamente ou procure o RH", limite: 0, usado: 0, disponivel: 0 };
  }
}
