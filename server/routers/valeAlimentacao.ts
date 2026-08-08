import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { vrBenefits, employees, obras, obraFuncionarios, mealBenefitConfigs, vaFaltaAlerts } from "../../drizzle/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";

function parseBRL(v: string | null | undefined): number {
  if (!v) return 0;
  const raw = parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
  return Math.round(raw * 100) / 100;
}

function formatBRL(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

const FERIADOS_NACIONAIS_FIXOS = [
  "01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25",
];

function calcularPascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function getFeriadosMoveis(ano: number): string[] {
  const pascoa = new Date(calcularPascoa(ano) + 'T12:00:00Z');
  const carnaval = new Date(pascoa);
  carnaval.setUTCDate(carnaval.getUTCDate() - 47);
  const sextaSanta = new Date(pascoa);
  sextaSanta.setUTCDate(sextaSanta.getUTCDate() - 2);
  const corpusChristi = new Date(pascoa);
  corpusChristi.setUTCDate(corpusChristi.getUTCDate() + 60);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return [fmt(carnaval), fmt(sextaSanta), fmt(corpusChristi)];
}

async function calcularDiasUteisCidade(
  companyId: number,
  cidade: string | null,
  estado: string | null,
  mesReferencia: string // "YYYY-MM"
): Promise<number> {
  const [anoStr, mesStr] = mesReferencia.split("-");
  const ano = parseInt(anoStr);
  const mes = parseInt(mesStr);
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const totalDias = ultimoDia.getDate();

  const feriadosNacionais = new Set<string>();
  for (const mmdd of FERIADOS_NACIONAIS_FIXOS) {
    const full = `${ano}-${mmdd}`;
    feriadosNacionais.add(full);
  }
  for (const f of getFeriadosMoveis(ano)) {
    feriadosNacionais.add(f);
  }

  const db = (await getDb())!;
  const feriadosDb = ((await db.execute(
    sql`SELECT data, tipo, recorrente, estado, cidade FROM feriados 
        WHERE ("companyId" = ${companyId} OR "companyId" IS NULL) AND ativo = 1`
  )) as any).rows || [];

  const feriadosSet = new Set<string>(feriadosNacionais);
  for (const f of feriadosDb) {
    let dataFull = f.data;
    if (f.recorrente === 1 && f.data.length === 5) {
      dataFull = `${ano}-${f.data}`;
    }
    if (!dataFull.startsWith(anoStr + "-" + mesStr.padStart(2, '0'))) continue;

    if (f.tipo === 'municipal' && cidade) {
      if (f.cidade && f.cidade.toLowerCase().trim() !== cidade.toLowerCase().trim()) continue;
    }
    if (f.tipo === 'estadual' && estado) {
      if (f.estado && f.estado.toLowerCase().trim() !== estado.toLowerCase().trim()) continue;
    }
    feriadosSet.add(dataFull);
  }

  let diasUteis = 0;
  for (let d = 1; d <= totalDias; d++) {
    const date = new Date(ano, mes - 1, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (feriadosSet.has(dateStr)) continue;
    diasUteis++;
  }

  return diasUteis;
}

/** Conta dias úteis (seg-sex) entre ini e fim, EXCLUINDO feriados do mapa (mesma regra dos dias úteis do mês). */
function contarDiasUteisPeriodo(ini: Date, fim: Date, feriados: Map<string, any>): number {
  let dias = 0;
  const cur = new Date(ini);
  while (cur <= fim) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
      if (!feriados.has(iso)) dias++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dias;
}

const NOMES_FERIADOS_NACIONAIS: Record<string, string> = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "09-07": "Independência do Brasil",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "12-25": "Natal",
};

function getNomeFeriadoMovel(ano: number, dateStr: string): string | null {
  const pascoa = new Date(calcularPascoa(ano) + 'T12:00:00Z');
  const carnaval = new Date(pascoa);
  carnaval.setUTCDate(carnaval.getUTCDate() - 47);
  const sextaSanta = new Date(pascoa);
  sextaSanta.setUTCDate(sextaSanta.getUTCDate() - 2);
  const corpusChristi = new Date(pascoa);
  corpusChristi.setUTCDate(corpusChristi.getUTCDate() + 60);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  if (dateStr === fmt(carnaval)) return "Carnaval";
  if (dateStr === fmt(sextaSanta)) return "Sexta-Feira Santa";
  if (dateStr === fmt(corpusChristi)) return "Corpus Christi";
  return null;
}

async function obterFeriadosMes(
  companyId: number,
  cidade: string | null,
  estado: string | null,
  mesReferencia: string
): Promise<Map<string, { nome: string; tipo: string; cidade?: string; estado?: string }>> {
  const [anoStr, mesStr] = mesReferencia.split("-");
  const ano = parseInt(anoStr);
  const result = new Map<string, { nome: string; tipo: string; cidade?: string; estado?: string }>();

  for (const mmdd of FERIADOS_NACIONAIS_FIXOS) {
    const full = `${ano}-${mmdd}`;
    if (full.startsWith(`${anoStr}-${mesStr.padStart(2, '0')}`)) {
      result.set(full, { nome: NOMES_FERIADOS_NACIONAIS[mmdd] || "Feriado Nacional", tipo: "nacional" });
    }
  }
  for (const dateStr of getFeriadosMoveis(ano)) {
    if (dateStr.startsWith(`${anoStr}-${mesStr.padStart(2, '0')}`)) {
      result.set(dateStr, { nome: getNomeFeriadoMovel(ano, dateStr) || "Feriado Móvel", tipo: "nacional" });
    }
  }

  const db = (await getDb())!;
  const feriadosDb = ((await db.execute(
    sql`SELECT data, tipo, recorrente, estado, cidade, nome FROM feriados 
        WHERE ("companyId" = ${companyId} OR "companyId" IS NULL) AND ativo = 1`
  )) as any).rows || [];

  for (const f of feriadosDb) {
    let dataFull = f.data;
    if (f.recorrente === 1 && f.data.length === 5) {
      dataFull = `${ano}-${f.data}`;
    }
    if (!dataFull.startsWith(`${anoStr}-${mesStr.padStart(2, '0')}`)) continue;

    if (f.tipo === 'municipal') {
      if (!cidade) continue;
      if (f.cidade && f.cidade.toLowerCase().trim() !== cidade.toLowerCase().trim()) continue;
    }
    if (f.tipo === 'estadual') {
      if (!estado) continue;
      if (f.estado && f.estado.toLowerCase().trim() !== estado.toLowerCase().trim()) continue;
    }
    result.set(dataFull, {
      nome: f.nome || "Feriado",
      tipo: f.tipo || "municipal",
      cidade: f.cidade || undefined,
      estado: f.estado || undefined,
    });
  }
  return result;
}

function contarDiasUteisNoPeriodo(
  inicio: Date,
  fim: Date,
  feriadosSet: Set<string>
): number {
  let count = 0;
  const current = new Date(inicio);
  while (current <= fim) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      const dateStr = current.toISOString().split('T')[0];
      if (!feriadosSet.has(dateStr)) count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export const valeAlimentacaoRouter = router({
  listLancamentos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = ((await db.execute(
        sql`SELECT DISTINCT ON (vr.id) vr.*, e."nomeCompleto", e.cpf, e.cargo, e.funcao, e.status as "empStatus", e."fotoUrl",
            EXISTS (SELECT 1 FROM cipa_members cm WHERE cm."employeeId" = e.id AND cm."companyId" = vr."companyId" AND cm."statusMembro" = 'Ativo') as "isCipa",
            of2."obraId", o.nome as "obraNome",
            vr."diasUteisCalc", vr."cidadeObra", vr."diasFerias", vr."diasLicenca", vr."diasFaltas", vr."diasDescontados", vr."proporcionalDias", vr."memoriaCalculo"
            FROM vr_benefits vr
            LEFT JOIN employees e ON vr."employeeId" = e.id
            LEFT JOIN LATERAL (
              SELECT of3."obraId" FROM obra_funcionarios of3
              WHERE of3."employeeId" = e.id AND of3."isActive" = 1
              ORDER BY of3.id DESC LIMIT 1
            ) of2 ON true
            LEFT JOIN obras o ON of2."obraId" = o.id
            WHERE vr."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND vr."mesReferencia" = ${input.mesReferencia}
            AND (e.status NOT IN ('Desligado', 'Lista_Negra') OR e.status IS NULL)
            ORDER BY vr.id, e."nomeCompleto" ASC`
      )) as any).rows || [];
      return rows || [];
    }),

  mesesComLancamentos: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = ((await db.execute(
        sql`SELECT SUBSTRING(vr."mesReferencia" FROM 6 FOR 2) AS mes,
            COUNT(*) FILTER (WHERE vr.status != 'cancelado') AS total,
            COUNT(*) FILTER (WHERE vr.status = 'pago') AS pagos
            FROM vr_benefits vr
            WHERE vr."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)})
            AND vr."mesReferencia" LIKE ${`${input.ano}-%`}
            GROUP BY 1`
      )) as any).rows || [];
      return rows.map((r: any) => ({ mes: Number(r.mes), total: Number(r.total), pagos: Number(r.pagos) }));
    }),

  getStats: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      
      const empRows = ((await db.execute(
        sql`SELECT COUNT(*) as total FROM employees WHERE "companyId" = ${input.companyId} AND status = 'Ativo' AND "deletedAt" IS NULL`
      )) as any).rows || [];
      const totalAtivos = empRows?.[0]?.total || 0;

      const vrRows = ((await db.execute(
        sql`SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN vr.status = 'pendente' THEN 1 ELSE 0 END) as pendentes,
          SUM(CASE WHEN vr.status = 'aprovado' THEN 1 ELSE 0 END) as aprovados,
          SUM(CASE WHEN vr.status = 'pago' THEN 1 ELSE 0 END) as pagos,
          SUM(CASE WHEN vr.status = 'cancelado' THEN 1 ELSE 0 END) as cancelados,
          SUM(CASE WHEN vr.status != 'cancelado' THEN CAST(REPLACE(REPLACE(vr."valorTotal", '.', ''), ',', '.') AS DECIMAL(10,2)) ELSE 0 END) as "totalValor"
        FROM vr_benefits vr
        LEFT JOIN employees e ON vr."employeeId" = e.id
        WHERE vr."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND vr."mesReferencia" = ${input.mesReferencia}
        AND (e.status NOT IN ('Desligado', 'Lista_Negra') OR e.status IS NULL)`
      )) as any).rows || [];
      
      const stats = vrRows?.[0] || {};

      const alertRows = ((await db.execute(
        sql`SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN decisao = 'pendente' THEN 1 ELSE 0 END) as pendentes
        FROM va_falta_alerts 
        WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}`
      )) as any).rows || [];
      const alertStats = alertRows?.[0] || {};

      return {
        totalAtivos: Number(totalAtivos),
        totalLancamentos: Number(stats.total || 0),
        pendentes: Number(stats.pendentes || 0),
        aprovados: Number(stats.aprovados || 0),
        pagos: Number(stats.pagos || 0),
        cancelados: Number(stats.cancelados || 0),
        totalValor: Number(stats.totalValor || 0),
        alertasFaltas: Number(alertStats.total || 0),
        alertasFaltasPendentes: Number(alertStats.pendentes || 0),
      };
    }),

  gerarMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      diasUteis: z.number().optional(),
      geradoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
      const db = (await getDb())!;
      const userName = input.geradoPor || ctx.user?.name || "Sistema";

      const existing = ((await db.execute(
        sql`SELECT COUNT(*) as total FROM vr_benefits WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}`
      )) as any).rows || [];
      if (existing?.[0]?.total > 0) {
        return { success: false, message: `Já existem ${existing[0].total} lançamentos para este mês. Use "Regerar" para substituir.` };
      }

      // Rev. 3985 — usa a config VIGENTE no mês de referência (não mais "qualquer ativa"),
      // pegando a mais recente por vigenciaInicio dentro de cada escopo (obra/padrão).
      const refDateGerar = `${input.mesReferencia}-01`;
      const cfgRows = ((await db.execute(
        sql`SELECT * FROM meal_benefit_configs WHERE "companyId" = ${input.companyId} AND ativo = 1
            AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${refDateGerar}::date)
            AND (vigencia_fim IS NULL OR vigencia_fim >= ${refDateGerar}::date)
            ORDER BY "obraId" IS NULL DESC, "obraId", vigencia_inicio DESC NULLS LAST
            LIMIT 500`
      )) as any).rows || [];
      const configs = cfgRows || [];
      const cfgPadrao = configs.find((c: any) => !c.obraId) || null;
      const cfgPorObra: Record<number, any> = {};
      for (const c of configs) {
        if (c.obraId && !cfgPorObra[c.obraId]) cfgPorObra[c.obraId] = c;
      }

      const empRows = ((await db.execute(
        sql`SELECT e.id, e."nomeCompleto", e.cpf, e.cargo, e.funcao,
            e."dataAdmissao", e.status as "empStatus",
            e."licencaDataInicio",
            of2."obraId", o.cidade as "obraCidade", o.estado as "obraEstado"
            FROM employees e
            LEFT JOIN obra_funcionarios of2 ON of2."employeeId" = e.id AND of2."isActive" = 1
            LEFT JOIN obras o ON of2."obraId" = o.id
            WHERE e."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND e.status IN ('Ativo', 'Ferias', 'Afastado', 'Licenca') AND e."deletedAt" IS NULL
            AND (e."tipoContrato" IS NULL OR e."tipoContrato" NOT IN ('PJ','Socio'))
            ORDER BY e."nomeCompleto" ASC`
      )) as any).rows || [];
      const emps = empRows || [];
      const empMap: Record<number, { emp: any; obraId: number | null; cidade: string | null; estado: string | null }> = {};
      for (const e of emps) {
        if (!empMap[e.id]) {
          empMap[e.id] = { emp: e, obraId: e.obraId, cidade: e.obraCidade || null, estado: e.obraEstado || null };
        }
      }

      const [anoStr, mesStr] = input.mesReferencia.split("-");
      const ano = parseInt(anoStr);
      const mes = parseInt(mesStr);
      const primeiroDiaMes = new Date(ano, mes - 1, 1);
      const ultimoDiaMes = new Date(ano, mes, 0);

      const diasUteisPorCidade: Record<string, number> = {};
      async function getDiasUteisCidade(cidade: string | null, estado: string | null): Promise<number> {
        if (input.diasUteis) return input.diasUteis;
        const key = `${(cidade || 'default').toLowerCase()}_${(estado || '').toLowerCase()}`;
        if (diasUteisPorCidade[key] === undefined) {
          diasUteisPorCidade[key] = await calcularDiasUteisCidade(input.companyId, cidade, estado, input.mesReferencia);
        }
        return diasUteisPorCidade[key];
      }

      const feriasRows = ((await db.execute(
        sql`SELECT "employeeId", "dataInicio", "dataFim", "periodo2Inicio", "periodo2Fim", "periodo3Inicio", "periodo3Fim"
            FROM vacation_periods
            WHERE "companyId" = ${input.companyId} 
            AND status IN ('aprovada', 'em_gozo', 'concluida')
            AND "deletedAt" IS NULL
            AND (
              ("dataInicio" <= ${ultimoDiaMes.toISOString().split('T')[0]} AND "dataFim" >= ${primeiroDiaMes.toISOString().split('T')[0]})
              OR ("periodo2Inicio" <= ${ultimoDiaMes.toISOString().split('T')[0]} AND "periodo2Fim" >= ${primeiroDiaMes.toISOString().split('T')[0]})
              OR ("periodo3Inicio" <= ${ultimoDiaMes.toISOString().split('T')[0]} AND "periodo3Fim" >= ${primeiroDiaMes.toISOString().split('T')[0]})
            )`
      )) as any).rows || [];

      // Guarda os PERÍODOS (clampados ao mês); a contagem de dias é feita por funcionário,
      // excluindo os feriados da cidade da obra dele (mesma regra dos dias úteis do mês).
      const feriasPeriodosMap: Record<number, { ini: Date; fim: Date }[]> = {};
      for (const f of feriasRows) {
        const periodos = [
          { inicio: f.dataInicio, fim: f.dataFim },
          { inicio: f.periodo2Inicio, fim: f.periodo2Fim },
          { inicio: f.periodo3Inicio, fim: f.periodo3Fim },
        ];
        for (const p of periodos) {
          if (!p.inicio || !p.fim) continue;
          const ini = new Date(Math.max(new Date(p.inicio + 'T00:00:00').getTime(), primeiroDiaMes.getTime()));
          const fim = new Date(Math.min(new Date(p.fim + 'T00:00:00').getTime(), ultimoDiaMes.getTime()));
          if (ini > fim) continue;
          (feriasPeriodosMap[f.employeeId] = feriasPeriodosMap[f.employeeId] || []).push({ ini, fim });
        }
      }

      const licencaRows = ((await db.execute(
        sql`SELECT id, status FROM employees 
            WHERE "companyId" = ${input.companyId} AND status IN ('Afastado', 'Licenca') AND "deletedAt" IS NULL`
      )) as any).rows || [];
      const empLicenca = new Set((licencaRows || []).map((r: any) => r.id));

      const afericaoIniMes = mes - 1 <= 0 ? 12 : mes - 1;
      const afericaoIniAno = mes - 1 <= 0 ? ano - 1 : ano;
      const afericaoInicio = `${afericaoIniAno}-${String(afericaoIniMes).padStart(2,'0')}-16`;
      const afericaoFim = `${ano}-${String(mes).padStart(2,'0')}-15`;

      const faltasRows = ((await db.execute(
        sql`SELECT "employeeId", data, "isFalta", "atestadoId"
            FROM timecard_daily
            WHERE "companyId" = ${input.companyId}
            AND data >= ${afericaoInicio} AND data <= ${afericaoFim}
            AND "isFalta" = 1`
      )) as any).rows || [];

      const faltasPorEmp: Record<number, { comAtestado: number; semAtestado: number; datas: { data: string; temAtestado: boolean }[] }> = {};
      for (const f of faltasRows) {
        if (!faltasPorEmp[f.employeeId]) {
          faltasPorEmp[f.employeeId] = { comAtestado: 0, semAtestado: 0, datas: [] };
        }
        const temAtestado = f.atestadoId != null && f.atestadoId > 0;
        if (temAtestado) {
          faltasPorEmp[f.employeeId].comAtestado++;
        } else {
          faltasPorEmp[f.employeeId].semAtestado++;
        }
        faltasPorEmp[f.employeeId].datas.push({ data: f.data, temAtestado });
      }

      let gerados = 0;
      let alertasGerados = 0;
      let alertasFeriadoConflito = 0;
      const alertaInsertBuffer: any[] = [];
      const feriadosCachePorCidade: Record<string, Map<string, { nome: string; tipo: string; cidade?: string; estado?: string }>> = {};
      for (const { emp, obraId, cidade, estado } of Object.values(empMap)) {
        const cfg = (obraId && cfgPorObra[obraId]) || cfgPadrao;
        if (!cfg) continue;

        const cidadeKey = `${(cidade || 'default').toLowerCase()}_${(estado || '').toLowerCase()}`;
        if (!feriadosCachePorCidade[cidadeKey]) {
          feriadosCachePorCidade[cidadeKey] = await obterFeriadosMes(input.companyId, cidade, estado, input.mesReferencia);
        }
        const feriadosMes = feriadosCachePorCidade[cidadeKey];

        let diasUteis = await getDiasUteisCidade(cidade, estado);
        const diasUteisOriginal = diasUteis;
        
        const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
        const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
        const jantaAtivo = cfg.jantaAtivo === 1 || cfg.jantaAtivo === true;

        const diasUteisRef = cfg.diasUteisRef || 22;
        const cafeDia = cafeAtivo ? parseBRL(cfg.cafeManhaDia) : 0;
        const lancheDia = lancheAtivo ? parseBRL(cfg.lancheTardeDia) : 0;
        const jantaDia = jantaAtivo ? parseBRL(cfg.jantaDia) : 0;
        const cafeMensal = Math.round(cafeDia * diasUteisRef * 100) / 100;
        const lancheMensal = Math.round(lancheDia * diasUteisRef * 100) / 100;
        const jantaMensal = Math.round(jantaDia * diasUteisRef * 100) / 100;
        const vaTotalMes = parseBRL(cfg.va_total_mes || cfg.vaTotalMes);
        const totalIFood = parseBRL(cfg.totalVA_iFood);
        const vaMensal = vaTotalMes > 0 ? vaTotalMes : (totalIFood > 0 ? Math.round((totalIFood - cafeMensal - lancheMensal - jantaMensal) * 100) / 100 : parseBRL(cfg.valeAlimentacaoMes) * diasUteisRef);

        let proporcionalDias: number | null = null;
        let isProporcional = false;
        if (emp.dataAdmissao) {
          const admissao = new Date(emp.dataAdmissao + 'T00:00:00');
          if (admissao > primeiroDiaMes && admissao <= ultimoDiaMes) {
            const diasAdmissao = contarDiasUteisPeriodo(admissao, ultimoDiaMes, feriadosMes);
            proporcionalDias = diasAdmissao;
            diasUteis = Math.min(diasUteis, diasAdmissao);
            isProporcional = true;
          }
        }

        const isFerias = emp.empStatus === 'Ferias';
        const isAfastado = emp.empStatus === 'Afastado' || emp.empStatus === 'Licenca';

        let diasAfastadoDentro15 = 0;
        if (isAfastado) {
          if (!emp.licencaDataInicio) {
            continue;
          }
          const inicioAfast = new Date(emp.licencaDataInicio + 'T00:00:00');
          const fimEmpresa = new Date(inicioAfast);
          fimEmpresa.setDate(fimEmpresa.getDate() + 14);

          const overlapIni = new Date(Math.max(primeiroDiaMes.getTime(), inicioAfast.getTime()));
          const overlapFim = new Date(Math.min(ultimoDiaMes.getTime(), fimEmpresa.getTime()));

          if (overlapIni > overlapFim) {
            continue;
          }

          let diasOverlap = 0;
          let cur = new Date(overlapIni);
          while (cur <= overlapFim) {
            const dow = cur.getDay();
            if (dow !== 0 && dow !== 6) diasOverlap++;
            cur.setDate(cur.getDate() + 1);
          }
          diasAfastadoDentro15 = diasOverlap;
          if (diasAfastadoDentro15 <= 0) {
            continue;
          }
        }

        const diasFerias = (feriasPeriodosMap[emp.id] || []).reduce((acc, p) => acc + contarDiasUteisPeriodo(p.ini, p.fim, feriadosMes), 0);
        let diasLicenca = 0;
        if (empLicenca.has(emp.id) && !isAfastado) {
          diasLicenca = diasUteis;
        }

        let diasEfetivos = Math.max(0, diasUteis - diasFerias - diasLicenca);
        if (isAfastado) {
          diasEfetivos = diasAfastadoDentro15;
        }

        const valorCafe = (isFerias || isAfastado) ? 0 : Math.round(cafeDia * diasEfetivos * 100) / 100;
        const valorLanche = (isFerias || isAfastado) ? 0 : Math.round(lancheDia * diasEfetivos * 100) / 100;
        const valorJanta = (isFerias || isAfastado) ? 0 : Math.round(jantaDia * diasEfetivos * 100) / 100;
        // Empresa não paga VA nos dias de férias: proporcional sempre que houver diasFerias > 0,
        // admissão no meio do mês (isProporcional) ou afastamento INSS.
        const vaEhProporcional = isProporcional || isAfastado || diasFerias > 0;
        const valorVA = vaEhProporcional ? Math.round(vaMensal * diasEfetivos / diasUteisOriginal * 100) / 100 : vaMensal;
        const valorDiario = cafeDia + lancheDia + jantaDia;
        const valorBruto = Math.round((valorCafe + valorLanche + valorJanta + valorVA) * 100) / 100;
        const descontoVaPct = parseBRL(cfg.descontoVaPercentual) || 0;
        const valorDescontoVA = descontoVaPct > 0 ? Math.round(valorVA * descontoVaPct / 100 * 100) / 100 : 0;
        const valorTotal = Math.round((valorBruto - valorDescontoVA) * 100) / 100;

        if (valorTotal <= 0) continue;

        const memoria = JSON.stringify({
          totalIFood, diasUteisRef, diasUteisOriginal, diasEfetivos,
          cafeDia, lancheDia, jantaDia, cafeMensal, lancheMensal, jantaMensal, vaMensal,
          cafeAtivo, lancheAtivo, jantaAtivo,
          diasFerias, diasLicenca, isProporcional, proporcionalDias,
          isFerias, isAfastado, statusEmp: emp.empStatus,
          valorCafe, valorLanche, valorJanta, valorVA,
          valorBruto, descontoVaPct, valorDescontoVA, valorTotal,
          cidade: cidade || null,
        });

        const result = ((await db.execute(
          sql`INSERT INTO vr_benefits ("companyId", "employeeId", "mesReferencia", "valorDiario", "diasUteis", "valorTotal", "valorCafe", "valorLanche", "valorJanta", "valorVa", operadora, status, "geradoPor", "diasUteisCalc", "cidadeObra", "diasFerias", "diasLicenca", "diasFaltas", "diasDescontados", "proporcionalDias", "memoriaCalculo")
          VALUES (${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatBRL(valorDiario)}, ${diasEfetivos}, ${formatBRL(valorTotal)}, ${formatBRL(valorCafe)}, ${formatBRL(valorLanche)}, ${formatBRL(valorJanta)}, ${formatBRL(valorVA)}, 'iFood Benefícios', 'pendente', ${userName}, ${diasUteisOriginal}, ${cidade || null}, ${diasFerias}, ${diasLicenca}, 0, 0, ${proporcionalDias}, ${memoria})
          RETURNING id`
        )) as any).rows || [];
        const vrId = result?.[0]?.id;
        gerados++;

        const faltasEmp = faltasPorEmp[emp.id];
        if (faltasEmp && faltasEmp.semAtestado > 0) {
          for (const falta of faltasEmp.datas) {
            if (falta.temAtestado) continue;
            const feriadoMatch = feriadosMes.get(falta.data);
            let feriadoInfoJson: string | null = null;
            let tipoFalta = 'injustificada';
            if (feriadoMatch) {
              tipoFalta = 'conflito_feriado';
              feriadoInfoJson = JSON.stringify({
                nomeFeriado: feriadoMatch.nome,
                tipoFeriado: feriadoMatch.tipo,
                cidadeFeriado: feriadoMatch.cidade || cidade || null,
                estadoFeriado: feriadoMatch.estado || estado || null,
                mensagem: `⚠️ ATENÇÃO: Falta registrada em ${new Date(falta.data + 'T12:00:00').toLocaleDateString('pt-BR')} que é feriado "${feriadoMatch.nome}" (${feriadoMatch.tipo}${feriadoMatch.tipo === 'municipal' ? ` — ${feriadoMatch.cidade || cidade}` : feriadoMatch.tipo === 'estadual' ? ` — ${feriadoMatch.estado || estado}` : ''}). Verifique se houve expediente nesta data.`
              });
              alertasFeriadoConflito++;
            }
            alertaInsertBuffer.push({ companyId: input.companyId, employeeId: emp.id, mesReferencia: input.mesReferencia, obraId: obraId || null, dataFalta: falta.data, tipoFalta, temAtestado: 0, decisao: 'pendente', valorDescontoCafe: formatBRL(cafeDia), valorDescontoLanche: formatBRL(lancheDia), valorDescontoJantar: formatBRL(jantaDia), vrBenefitId: vrId || null, feriadoInfo: feriadoInfoJson });
            alertasGerados++;
          }
        }
      }

      if (alertaInsertBuffer.length > 0) {
        const ALERT_BATCH = 50;
        for (let i = 0; i < alertaInsertBuffer.length; i += ALERT_BATCH) {
          const chunk = alertaInsertBuffer.slice(i, i + ALERT_BATCH);
          const valuesStr = chunk.map(a =>
            `(${a.companyId}, ${a.employeeId}, '${a.mesReferencia}', ${a.obraId !== null ? a.obraId : 'NULL'}, '${a.dataFalta}', '${a.tipoFalta}', ${a.temAtestado}, '${a.decisao}', '${a.valorDescontoCafe}', '${a.valorDescontoLanche}', '${a.valorDescontoJantar}', ${a.vrBenefitId !== null ? a.vrBenefitId : 'NULL'}, ${a.feriadoInfo !== null ? `'${a.feriadoInfo.replace(/'/g, "''")}'` : 'NULL'})`
          ).join(',\n');
          await db.execute(sql.raw(`INSERT INTO va_falta_alerts ("companyId", "employeeId", "mesReferencia", "obraId", "dataFalta", "tipoFalta", "temAtestado", "decisao", "valorDescontoCafe", "valorDescontoLanche", "valorDescontoJantar", "vrBenefitId", "feriadoInfo") VALUES ${valuesStr}`));
        }
      }

      let msgExtra = '';
      if (alertasFeriadoConflito > 0) {
        msgExtra = ` 🏖️ ${alertasFeriadoConflito} faltas coincidem com feriados — revise na aba Alertas.`;
      }
      return { success: true, gerados, alertasGerados, alertasFeriadoConflito, message: `${gerados} lançamentos gerados! ${alertasGerados > 0 ? `⚠️ ${alertasGerados} alertas de falta gerados para revisão do RH.${msgExtra}` : 'Nenhum alerta de falta.'}` };
      } catch (err: any) {
        console.error('[VA gerarMes] Erro:', err?.message || err);
        return { success: false, gerados: 0, alertasGerados: 0, message: `Erro ao gerar: ${err?.message || 'erro desconhecido'}` };
      }
    }),

  regerarMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      diasUteis: z.number().optional(),
      geradoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
      const db = (await getDb())!;
      await db.execute(
        sql`DELETE FROM vr_benefits WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND status != 'pago'`
      );
      await db.execute(
        sql`DELETE FROM va_falta_alerts WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia}`
      );
      const userName = input.geradoPor || ctx.user?.name || "Sistema";

      // Rev. 3985 — usa a config VIGENTE no mês de referência (não mais "qualquer ativa")
      const refDateRegerar = `${input.mesReferencia}-01`;
      const cfgRows = ((await db.execute(
        sql`SELECT * FROM meal_benefit_configs WHERE "companyId" = ${input.companyId} AND ativo = 1
            AND (vigencia_inicio IS NULL OR vigencia_inicio <= ${refDateRegerar}::date)
            AND (vigencia_fim IS NULL OR vigencia_fim >= ${refDateRegerar}::date)
            ORDER BY "obraId" IS NULL DESC, "obraId", vigencia_inicio DESC NULLS LAST
            LIMIT 500`
      )) as any).rows || [];
      const configs = cfgRows || [];
      const cfgPadrao = configs.find((c: any) => !c.obraId) || null;
      const cfgPorObra: Record<number, any> = {};
      for (const c of configs) {
        if (c.obraId && !cfgPorObra[c.obraId]) cfgPorObra[c.obraId] = c;
      }

      const empRows = ((await db.execute(
        sql`SELECT e.id, e."nomeCompleto", e."dataAdmissao", e.status as "empStatus",
            e."licencaDataInicio",
            of2."obraId", o.cidade as "obraCidade", o.estado as "obraEstado"
            FROM employees e
            LEFT JOIN obra_funcionarios of2 ON of2."employeeId" = e.id AND of2."isActive" = 1
            LEFT JOIN obras o ON of2."obraId" = o.id
            WHERE e."companyId" IN (${sql.join(resolveCompanyIds(input).map(id => sql`${id}`), sql`,`)}) AND e.status IN ('Ativo', 'Ferias', 'Afastado', 'Licenca') AND e."deletedAt" IS NULL
            AND (e."tipoContrato" IS NULL OR e."tipoContrato" NOT IN ('PJ','Socio'))
            ORDER BY e."nomeCompleto" ASC`
      )) as any).rows || [];
      const emps = empRows || [];
      const empMap: Record<number, { emp: any; obraId: number | null; cidade: string | null; estado: string | null }> = {};
      for (const e of emps) {
        if (!empMap[e.id]) empMap[e.id] = { emp: e, obraId: e.obraId, cidade: e.obraCidade || null, estado: e.obraEstado || null };
      }

      const paidRows = ((await db.execute(
        sql`SELECT "employeeId" FROM vr_benefits WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND status = 'pago'`
      )) as any).rows || [];
      const paidEmpIds = new Set((paidRows || []).map((r: any) => r.employeeId));

      const [anoStr, mesStr] = input.mesReferencia.split("-");
      const ano = parseInt(anoStr);
      const mes = parseInt(mesStr);
      const primeiroDiaMes = new Date(ano, mes - 1, 1);
      const ultimoDiaMes = new Date(ano, mes, 0);

      const diasUteisPorCidade: Record<string, number> = {};
      async function getDiasUteisCidade(cidade: string | null, estado: string | null): Promise<number> {
        if (input.diasUteis) return input.diasUteis;
        const key = `${(cidade || 'default').toLowerCase()}_${(estado || '').toLowerCase()}`;
        if (diasUteisPorCidade[key] === undefined) {
          diasUteisPorCidade[key] = await calcularDiasUteisCidade(input.companyId, cidade, estado, input.mesReferencia);
        }
        return diasUteisPorCidade[key];
      }

      const feriasRows = ((await db.execute(
        sql`SELECT "employeeId", "dataInicio", "dataFim", "periodo2Inicio", "periodo2Fim", "periodo3Inicio", "periodo3Fim"
            FROM vacation_periods
            WHERE "companyId" = ${input.companyId}
            AND status IN ('aprovada', 'em_gozo', 'concluida')
            AND "deletedAt" IS NULL
            AND (
              ("dataInicio" <= ${ultimoDiaMes.toISOString().split('T')[0]} AND "dataFim" >= ${primeiroDiaMes.toISOString().split('T')[0]})
              OR ("periodo2Inicio" <= ${ultimoDiaMes.toISOString().split('T')[0]} AND "periodo2Fim" >= ${primeiroDiaMes.toISOString().split('T')[0]})
              OR ("periodo3Inicio" <= ${ultimoDiaMes.toISOString().split('T')[0]} AND "periodo3Fim" >= ${primeiroDiaMes.toISOString().split('T')[0]})
            )`
      )) as any).rows || [];
      // Guarda os PERÍODOS (clampados ao mês); a contagem de dias é feita por funcionário,
      // excluindo os feriados da cidade da obra dele (mesma regra dos dias úteis do mês).
      const feriasPeriodosMap: Record<number, { ini: Date; fim: Date }[]> = {};
      for (const f of feriasRows) {
        const periodos = [
          { inicio: f.dataInicio, fim: f.dataFim },
          { inicio: f.periodo2Inicio, fim: f.periodo2Fim },
          { inicio: f.periodo3Inicio, fim: f.periodo3Fim },
        ];
        for (const p of periodos) {
          if (!p.inicio || !p.fim) continue;
          const ini = new Date(Math.max(new Date(p.inicio + 'T00:00:00').getTime(), primeiroDiaMes.getTime()));
          const fim = new Date(Math.min(new Date(p.fim + 'T00:00:00').getTime(), ultimoDiaMes.getTime()));
          if (ini > fim) continue;
          (feriasPeriodosMap[f.employeeId] = feriasPeriodosMap[f.employeeId] || []).push({ ini, fim });
        }
      }

      const licencaRows = ((await db.execute(
        sql`SELECT id FROM employees WHERE "companyId" = ${input.companyId} AND status IN ('Afastado', 'Licenca') AND "deletedAt" IS NULL`
      )) as any).rows || [];
      const empLicenca = new Set((licencaRows || []).map((r: any) => r.id));

      const afericaoIniMes = mes - 1 <= 0 ? 12 : mes - 1;
      const afericaoIniAno = mes - 1 <= 0 ? ano - 1 : ano;
      const afericaoInicio = `${afericaoIniAno}-${String(afericaoIniMes).padStart(2,'0')}-16`;
      const afericaoFim = `${ano}-${String(mes).padStart(2,'0')}-15`;

      const faltasRows = ((await db.execute(
        sql`SELECT "employeeId", data, "isFalta", "atestadoId"
            FROM timecard_daily
            WHERE "companyId" = ${input.companyId}
            AND data >= ${afericaoInicio} AND data <= ${afericaoFim}
            AND "isFalta" = 1`
      )) as any).rows || [];
      const faltasPorEmp: Record<number, { comAtestado: number; semAtestado: number; datas: { data: string; temAtestado: boolean }[] }> = {};
      for (const f of faltasRows) {
        if (!faltasPorEmp[f.employeeId]) faltasPorEmp[f.employeeId] = { comAtestado: 0, semAtestado: 0, datas: [] };
        const temAtestado = f.atestadoId != null && f.atestadoId > 0;
        if (temAtestado) faltasPorEmp[f.employeeId].comAtestado++;
        else faltasPorEmp[f.employeeId].semAtestado++;
        faltasPorEmp[f.employeeId].datas.push({ data: f.data, temAtestado });
      }

      let gerados = 0;
      let alertasGerados = 0;
      let alertasFeriadoConflito = 0;
      const alertaInsertBuffer: any[] = [];
      const feriadosCachePorCidade: Record<string, Map<string, { nome: string; tipo: string; cidade?: string; estado?: string }>> = {};

      const empEntries = Object.values(empMap).filter(({ emp }) => !paidEmpIds.has(emp.id));
      const BATCH_SIZE = 20;

      for (let batch = 0; batch < empEntries.length; batch += BATCH_SIZE) {
        const chunk = empEntries.slice(batch, batch + BATCH_SIZE);
        for (const { emp, obraId, cidade, estado } of chunk) {
          const cfg = (obraId && cfgPorObra[obraId]) || cfgPadrao;
          if (!cfg) continue;

          const cidadeKey = `${(cidade || 'default').toLowerCase()}_${(estado || '').toLowerCase()}`;
          if (!feriadosCachePorCidade[cidadeKey]) {
            feriadosCachePorCidade[cidadeKey] = await obterFeriadosMes(input.companyId, cidade, estado, input.mesReferencia);
          }
          const feriadosMes = feriadosCachePorCidade[cidadeKey];

          let diasUteis = await getDiasUteisCidade(cidade, estado);
          const diasUteisOriginal = diasUteis;

          const cafeAtivo = cfg.cafeAtivo === 1 || cfg.cafeAtivo === true;
          const lancheAtivo = cfg.lancheAtivo === 1 || cfg.lancheAtivo === true;
          const jantaAtivo = cfg.jantaAtivo === 1 || cfg.jantaAtivo === true;

          const diasUteisRef = cfg.diasUteisRef || 22;
          const cafeDia = cafeAtivo ? parseBRL(cfg.cafeManhaDia) : 0;
          const lancheDia = lancheAtivo ? parseBRL(cfg.lancheTardeDia) : 0;
          const jantaDia = jantaAtivo ? parseBRL(cfg.jantaDia) : 0;
          const cafeMensal = Math.round(cafeDia * diasUteisRef * 100) / 100;
          const lancheMensal = Math.round(lancheDia * diasUteisRef * 100) / 100;
          const jantaMensal = Math.round(jantaDia * diasUteisRef * 100) / 100;
          const vaTotalMes = parseBRL(cfg.va_total_mes || cfg.vaTotalMes);
          const totalIFood = parseBRL(cfg.totalVA_iFood);
          const vaMensal = vaTotalMes > 0 ? vaTotalMes : (totalIFood > 0 ? Math.round((totalIFood - cafeMensal - lancheMensal - jantaMensal) * 100) / 100 : parseBRL(cfg.valeAlimentacaoMes) * diasUteisRef);

          let proporcionalDias: number | null = null;
          let isProporcional = false;
          if (emp.dataAdmissao) {
            const admissao = new Date(emp.dataAdmissao + 'T00:00:00');
            if (admissao > primeiroDiaMes && admissao <= ultimoDiaMes) {
              const diasAdmissao = contarDiasUteisPeriodo(admissao, ultimoDiaMes, feriadosMes);
              proporcionalDias = diasAdmissao;
              diasUteis = Math.min(diasUteis, diasAdmissao);
              isProporcional = true;
            }
          }

          const isFerias = emp.empStatus === 'Ferias';
          const isAfastado = emp.empStatus === 'Afastado' || emp.empStatus === 'Licenca';

          let diasAfastadoDentro15 = 0;
          if (isAfastado) {
            if (!emp.licencaDataInicio) {
              continue;
            }
            const inicioAfast = new Date(emp.licencaDataInicio + 'T00:00:00');
            const fimEmpresa = new Date(inicioAfast);
            fimEmpresa.setDate(fimEmpresa.getDate() + 14);

            const overlapIni = new Date(Math.max(primeiroDiaMes.getTime(), inicioAfast.getTime()));
            const overlapFim = new Date(Math.min(ultimoDiaMes.getTime(), fimEmpresa.getTime()));

            if (overlapIni > overlapFim) {
              continue;
            }

            let diasOverlap = 0;
            let cur = new Date(overlapIni);
            while (cur <= overlapFim) {
              const dow = cur.getDay();
              if (dow !== 0 && dow !== 6) diasOverlap++;
              cur.setDate(cur.getDate() + 1);
            }
            diasAfastadoDentro15 = diasOverlap;
            if (diasAfastadoDentro15 <= 0) {
              continue;
            }
          }

          const diasFerias = (feriasPeriodosMap[emp.id] || []).reduce((acc, p) => acc + contarDiasUteisPeriodo(p.ini, p.fim, feriadosMes), 0);
          let diasLicenca = 0;
          if (empLicenca.has(emp.id) && !isAfastado) diasLicenca = diasUteis;

          let diasEfetivos = Math.max(0, diasUteis - diasFerias - diasLicenca);
          if (isAfastado) {
            diasEfetivos = diasAfastadoDentro15;
          }

          const valorCafe = (isFerias || isAfastado) ? 0 : Math.round(cafeDia * diasEfetivos * 100) / 100;
          const valorLanche = (isFerias || isAfastado) ? 0 : Math.round(lancheDia * diasEfetivos * 100) / 100;
          const valorJanta = (isFerias || isAfastado) ? 0 : Math.round(jantaDia * diasEfetivos * 100) / 100;
          // Empresa não paga VA nos dias de férias: proporcional sempre que houver diasFerias > 0,
          // admissão no meio do mês (isProporcional) ou afastamento INSS.
          const vaEhProporcional = isProporcional || isAfastado || diasFerias > 0;
          const valorVA = vaEhProporcional ? Math.round(vaMensal * diasEfetivos / diasUteisOriginal * 100) / 100 : vaMensal;
          const valorDiario = cafeDia + lancheDia + jantaDia;
          const valorBruto = Math.round((valorCafe + valorLanche + valorJanta + valorVA) * 100) / 100;
          const descontoVaPct = parseBRL(cfg.descontoVaPercentual) || 0;
          const valorDescontoVA = descontoVaPct > 0 ? Math.round(valorVA * descontoVaPct / 100 * 100) / 100 : 0;
          const valorTotal = Math.round((valorBruto - valorDescontoVA) * 100) / 100;
          if (valorTotal <= 0) continue;

          const memoria = JSON.stringify({
            totalIFood, diasUteisRef, diasUteisOriginal, diasEfetivos,
            cafeDia, lancheDia, jantaDia, cafeMensal, lancheMensal, jantaMensal, vaMensal,
            cafeAtivo, lancheAtivo, jantaAtivo,
            diasFerias, diasLicenca, isProporcional, proporcionalDias,
            isFerias, isAfastado, statusEmp: emp.empStatus,
            valorCafe, valorLanche, valorJanta, valorVA,
            valorBruto, descontoVaPct, valorDescontoVA, valorTotal,
            cidade: cidade || null,
          });

          const result = ((await db.execute(
            sql`INSERT INTO vr_benefits ("companyId", "employeeId", "mesReferencia", "valorDiario", "diasUteis", "valorTotal", "valorCafe", "valorLanche", "valorJanta", "valorVa", operadora, status, "geradoPor", "diasUteisCalc", "cidadeObra", "diasFerias", "diasLicenca", "diasFaltas", "diasDescontados", "proporcionalDias", "memoriaCalculo")
            VALUES (${input.companyId}, ${emp.id}, ${input.mesReferencia}, ${formatBRL(valorDiario)}, ${diasEfetivos}, ${formatBRL(valorTotal)}, ${formatBRL(valorCafe)}, ${formatBRL(valorLanche)}, ${formatBRL(valorJanta)}, ${formatBRL(valorVA)}, 'iFood Benefícios', 'pendente', ${userName}, ${diasUteisOriginal}, ${cidade || null}, ${diasFerias}, ${diasLicenca}, 0, 0, ${proporcionalDias}, ${memoria})
            RETURNING id`
          )) as any).rows || [];
          const vrId = result?.[0]?.id;
          gerados++;

          const faltasEmp = faltasPorEmp[emp.id];
          if (faltasEmp && faltasEmp.semAtestado > 0) {
            for (const falta of faltasEmp.datas) {
              if (falta.temAtestado) continue;
              const feriadoMatch = feriadosMes.get(falta.data);
              let feriadoInfoJson: string | null = null;
              let tipoFalta = 'injustificada';
              if (feriadoMatch) {
                tipoFalta = 'conflito_feriado';
                feriadoInfoJson = JSON.stringify({
                  nomeFeriado: feriadoMatch.nome,
                  tipoFeriado: feriadoMatch.tipo,
                  cidadeFeriado: feriadoMatch.cidade || cidade || null,
                  estadoFeriado: feriadoMatch.estado || estado || null,
                  mensagem: `⚠️ ATENÇÃO: Falta registrada em ${new Date(falta.data + 'T12:00:00').toLocaleDateString('pt-BR')} que é feriado "${feriadoMatch.nome}" (${feriadoMatch.tipo}${feriadoMatch.tipo === 'municipal' ? ` — ${feriadoMatch.cidade || cidade}` : feriadoMatch.tipo === 'estadual' ? ` — ${feriadoMatch.estado || estado}` : ''}). Verifique se houve expediente nesta data.`
                });
                alertasFeriadoConflito++;
              }
              alertaInsertBuffer.push({ companyId: input.companyId, employeeId: emp.id, mesReferencia: input.mesReferencia, obraId: obraId || null, dataFalta: falta.data, tipoFalta, temAtestado: 0, decisao: 'pendente', valorDescontoCafe: formatBRL(cafeDia), valorDescontoLanche: formatBRL(lancheDia), valorDescontoJantar: formatBRL(jantaDia), vrBenefitId: vrId || null, feriadoInfo: feriadoInfoJson });
              alertasGerados++;
            }
          }
        }
      }

      if (alertaInsertBuffer.length > 0) {
        const ALERT_BATCH = 50;
        for (let i = 0; i < alertaInsertBuffer.length; i += ALERT_BATCH) {
          const chunk = alertaInsertBuffer.slice(i, i + ALERT_BATCH);
          const valuesStr = chunk.map(a =>
            `(${a.companyId}, ${a.employeeId}, '${a.mesReferencia}', ${a.obraId !== null ? a.obraId : 'NULL'}, '${a.dataFalta}', '${a.tipoFalta}', ${a.temAtestado}, '${a.decisao}', '${a.valorDescontoCafe}', '${a.valorDescontoLanche}', '${a.valorDescontoJantar}', ${a.vrBenefitId !== null ? a.vrBenefitId : 'NULL'}, ${a.feriadoInfo !== null ? `'${a.feriadoInfo.replace(/'/g, "''")}'` : 'NULL'})`
          ).join(',\n');
          await db.execute(sql.raw(`INSERT INTO va_falta_alerts ("companyId", "employeeId", "mesReferencia", "obraId", "dataFalta", "tipoFalta", "temAtestado", "decisao", "valorDescontoCafe", "valorDescontoLanche", "valorDescontoJantar", "vrBenefitId", "feriadoInfo") VALUES ${valuesStr}`));
        }
      }

      let msgExtra = '';
      if (alertasFeriadoConflito > 0) {
        msgExtra = ` 🏖️ ${alertasFeriadoConflito} faltas coincidem com feriados — revise na aba Alertas.`;
      }
      return { success: true, gerados, alertasGerados, alertasFeriadoConflito, message: `${gerados} lançamentos regerados! ${alertasGerados > 0 ? `⚠️ ${alertasGerados} alertas de falta para revisão.${msgExtra}` : ''}` };
      } catch (err: any) {
        console.error('[VA regerarMes] Erro:', err?.message || err);
        return { success: false, gerados: 0, alertasGerados: 0, message: `Erro ao regerar: ${err?.message || 'erro desconhecido'}` };
      }
    }),

  editarLancamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      valorTotal: z.string().optional(),
      valorCafe: z.string().optional(),
      valorLanche: z.string().optional(),
      valorJanta: z.string().optional(),
      valorVA: z.string().optional(),
      diasUteis: z.number().optional(),
      status: z.enum(["pendente", "aprovado", "pago", "cancelado"]).optional(),
      motivoAlteracao: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const updateData: Record<string, any> = {};
      if (input.valorTotal !== undefined) updateData.valorTotal = input.valorTotal;
      if (input.valorCafe !== undefined) updateData.valorCafe = input.valorCafe;
      if (input.valorLanche !== undefined) updateData.valorLanche = input.valorLanche;
      if (input.valorJanta !== undefined) updateData.valorJanta = input.valorJanta;
      if (input.valorVA !== undefined) updateData.valorVa = input.valorVA;
      if (input.diasUteis !== undefined) updateData.diasUteis = input.diasUteis;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.motivoAlteracao !== undefined) updateData.motivoAlteracao = input.motivoAlteracao;
      if (input.observacoes !== undefined) updateData.observacoes = input.observacoes;
      
      if (Object.keys(updateData).length === 0) return { success: false, message: "Nenhum campo para atualizar" };

      await db.update(vrBenefits).set(updateData).where(and(
        sql`${vrBenefits.id} = ${input.id}`,
        eq(vrBenefits.companyId, input.companyId)
      ));
      return { success: true };
    }),

  aprovarLote: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      ids: z.array(z.number()).optional(),
      aprovadoPor: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = input.aprovadoPor || ctx.user?.name || "RH";
      
      if (input.ids && input.ids.length > 0) {
        const result = await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado', "aprovadoPor" = ${userName} WHERE id IN (${sql.raw(input.ids.join(","))}) AND "companyId" = ${input.companyId} AND status = 'pendente'`
        );
        return { success: true, aprovados: (result as any)?.rowCount || 0 };
      } else {
        const result = await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado', "aprovadoPor" = ${userName} WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND status = 'pendente'`
        );
        return { success: true, aprovados: (result as any)?.rowCount || 0 };
      }
    }),

  marcarPago: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      ids: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      if (input.ids && input.ids.length > 0) {
        const result = await db.execute(
          sql`UPDATE vr_benefits SET status = 'pago' WHERE id IN (${sql.raw(input.ids.join(","))}) AND "companyId" = ${input.companyId} AND status = 'aprovado'`
        );
        return { success: true, pagos: (result as any)?.rowCount || 0 };
      } else {
        const result = await db.execute(
          sql`UPDATE vr_benefits SET status = 'pago' WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND status = 'aprovado'`
        );
        return { success: true, pagos: (result as any)?.rowCount || 0 };
      }
    }),

  reverterPago: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
      ids: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      if (input.ids && input.ids.length > 0) {
        const result = await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado' WHERE id IN (${sql.raw(input.ids.join(","))}) AND "companyId" = ${input.companyId} AND status = 'pago'`
        );
        return { success: true, revertidos: (result as any)?.rowCount || 0 };
      } else {
        const result = await db.execute(
          sql`UPDATE vr_benefits SET status = 'aprovado' WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND status = 'pago'`
        );
        return { success: true, revertidos: (result as any)?.rowCount || 0 };
      }
    }),

  cancelarLancamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.execute(
        sql`UPDATE vr_benefits SET status = 'cancelado', "motivoAlteracao" = ${input.motivo || 'Cancelado pelo usuário'} WHERE id = ${input.id} AND "companyId" = ${input.companyId}`
      );
      return { success: true };
    }),

  historicoColaborador: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), employeeId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = ((await db.execute(
        sql`SELECT * FROM vr_benefits WHERE "companyId" = ${input.companyId} AND "employeeId" = ${input.employeeId} ORDER BY "mesReferencia" DESC`
      )) as any).rows || [];
      return rows || [];
    }),

  limparMes: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), mesReferencia: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const result = await db.execute(
        sql`DELETE FROM vr_benefits WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND status IN ('pendente', 'cancelado')`
      );
      await db.execute(
        sql`DELETE FROM va_falta_alerts WHERE "companyId" = ${input.companyId} AND "mesReferencia" = ${input.mesReferencia} AND decisao = 'pendente'`
      );
      return { success: true, removidos: (result as any)?.rowCount || 0 };
    }),

  listarAlertasFaltas: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      mesReferencia: z.string(),
      status: z.enum(['pendente', 'descontar', 'abonar', 'todos']).default('todos'),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let statusFilter = sql`1=1`;
      if (input.status !== 'todos') {
        statusFilter = sql`a.decisao = ${input.status}`;
      }
      const rows = ((await db.execute(
        sql`SELECT a.*, e."nomeCompleto", e.cpf, e.funcao, o.nome as "obraNome"
            FROM va_falta_alerts a
            LEFT JOIN employees e ON a."employeeId" = e.id
            LEFT JOIN obras o ON a."obraId" = o.id
            WHERE a."companyId" = ${input.companyId} AND a."mesReferencia" = ${input.mesReferencia}
            AND ${statusFilter}
            ORDER BY a."dataFalta" ASC, e."nomeCompleto" ASC`
      )) as any).rows || [];
      return rows || [];
    }),

  decidirAlertaFalta: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyId: z.number(),
      decisao: z.enum(['descontar', 'abonar']),
      descontarCafe: z.boolean().default(true),
      descontarLanche: z.boolean().default(true),
      descontarJantar: z.boolean().default(true),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = ctx.user?.name || 'RH';
      const userId = ctx.user?.id;

      const existing = ((await db.execute(
        sql`SELECT * FROM va_falta_alerts WHERE id = ${input.id} AND "companyId" = ${input.companyId}`
      )) as any).rows || [];
      const alert = existing?.[0];
      if (!alert) return { success: false, message: "Alerta não encontrado" };
      if (alert.decisao !== 'pendente') return { success: false, message: "Este alerta já foi decidido" };

      await db.execute(
        sql`UPDATE va_falta_alerts SET 
          decisao = ${input.decisao},
          "descontarCafe" = ${input.decisao === 'descontar' && input.descontarCafe ? 1 : 0},
          "descontarLanche" = ${input.decisao === 'descontar' && input.descontarLanche ? 1 : 0},
          "descontarJantar" = ${input.decisao === 'descontar' && input.descontarJantar ? 1 : 0},
          decidido_por = ${userName},
          decidido_por_user_id = ${userId},
          decidido_em = NOW(),
          observacoes = ${input.observacoes || null},
          "updatedAt" = NOW()
        WHERE id = ${input.id} AND "companyId" = ${input.companyId} AND decisao = 'pendente'`
      );

      if (input.decisao === 'descontar' && alert.vrBenefitId) {
        let descCafe = input.descontarCafe ? parseBRL(alert.valorDescontoCafe) : 0;
        let descLanche = input.descontarLanche ? parseBRL(alert.valorDescontoLanche) : 0;
        let descJantar = input.descontarJantar ? parseBRL(alert.valorDescontoJantar) : 0;
        const totalDesconto = descCafe + descLanche + descJantar;

        if (totalDesconto > 0) {
          await db.execute(
            sql`UPDATE vr_benefits SET 
              "valorCafe" = CAST(GREATEST(0, CAST(REPLACE(REPLACE("valorCafe", '.', ''), ',', '.') AS DECIMAL(10,2)) - ${descCafe}) AS TEXT),
              "valorLanche" = CAST(GREATEST(0, CAST(REPLACE(REPLACE("valorLanche", '.', ''), ',', '.') AS DECIMAL(10,2)) - ${descLanche}) AS TEXT),
              "valorJanta" = CAST(GREATEST(0, CAST(REPLACE(REPLACE("valorJanta", '.', ''), ',', '.') AS DECIMAL(10,2)) - ${descJantar}) AS TEXT),
              "valorTotal" = CAST(GREATEST(0, CAST(REPLACE(REPLACE("valorTotal", '.', ''), ',', '.') AS DECIMAL(10,2)) - ${totalDesconto}) AS TEXT),
              "diasFaltas" = COALESCE("diasFaltas", 0) + 1,
              "diasDescontados" = COALESCE("diasDescontados", 0) + 1,
              "updatedAt" = NOW()
            WHERE id = ${alert.vrBenefitId} AND "companyId" = ${input.companyId}`
          );
        }
      }

      return { success: true };
    }),

  decidirAlertasFaltaLote: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      ids: z.array(z.number()),
      decisao: z.enum(['descontar', 'abonar']),
      descontarCafe: z.boolean().default(true),
      descontarLanche: z.boolean().default(true),
      descontarJantar: z.boolean().default(true),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = ctx.user?.name || 'RH';
      const userId = ctx.user?.id;
      let processados = 0;

      for (const id of input.ids) {
        const existing = ((await db.execute(
          sql`SELECT * FROM va_falta_alerts WHERE id = ${id} AND "companyId" = ${input.companyId} AND decisao = 'pendente'`
        )) as any).rows || [];
        const alert = existing?.[0];
        if (!alert) continue;

        await db.execute(
          sql`UPDATE va_falta_alerts SET 
            decisao = ${input.decisao},
            "descontarCafe" = ${input.decisao === 'descontar' && input.descontarCafe ? 1 : 0},
            "descontarLanche" = ${input.decisao === 'descontar' && input.descontarLanche ? 1 : 0},
            "descontarJantar" = ${input.decisao === 'descontar' && input.descontarJantar ? 1 : 0},
            decidido_por = ${userName},
            decidido_por_user_id = ${userId},
            decidido_em = NOW(),
            observacoes = ${input.observacoes || null},
            "updatedAt" = NOW()
          WHERE id = ${id} AND "companyId" = ${input.companyId} AND decisao = 'pendente'`
        );

        if (input.decisao === 'descontar' && alert.vrBenefitId) {
          let descCafe = input.descontarCafe ? parseBRL(alert.valorDescontoCafe) : 0;
          let descLanche = input.descontarLanche ? parseBRL(alert.valorDescontoLanche) : 0;
          let descJantar = input.descontarJantar ? parseBRL(alert.valorDescontoJantar) : 0;
          const totalDesconto = descCafe + descLanche + descJantar;
          if (totalDesconto > 0) {
            const vrRow = ((await db.execute(
              sql`SELECT "valorCafe", "valorLanche", "valorJanta", "valorTotal" FROM vr_benefits WHERE id = ${alert.vrBenefitId} AND "companyId" = ${input.companyId}`
            )) as any).rows?.[0];
            if (vrRow) {
              const newCafe = Math.max(0, Math.round((parseBRL(vrRow.valorCafe) - descCafe) * 100) / 100);
              const newLanche = Math.max(0, Math.round((parseBRL(vrRow.valorLanche) - descLanche) * 100) / 100);
              const newJanta = Math.max(0, Math.round((parseBRL(vrRow.valorJanta) - descJantar) * 100) / 100);
              const newTotal = Math.max(0, Math.round((parseBRL(vrRow.valorTotal) - totalDesconto) * 100) / 100);
              await db.execute(
                sql`UPDATE vr_benefits SET 
                  "valorCafe" = ${String(newCafe.toFixed(2).replace('.', ','))},
                  "valorLanche" = ${String(newLanche.toFixed(2).replace('.', ','))},
                  "valorJanta" = ${String(newJanta.toFixed(2).replace('.', ','))},
                  "valorTotal" = ${String(newTotal.toFixed(2).replace('.', ','))},
                  "diasFaltas" = COALESCE("diasFaltas", 0) + 1,
                  "diasDescontados" = COALESCE("diasDescontados", 0) + 1,
                  "updatedAt" = NOW()
                WHERE id = ${alert.vrBenefitId} AND "companyId" = ${input.companyId}`
              );
            }
          }
        }
        processados++;
      }

      return { success: true, processados };
    }),
});
