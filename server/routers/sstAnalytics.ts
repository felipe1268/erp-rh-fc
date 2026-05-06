import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { atestados, accidents, employees } from "../../drizzle/schema";
import { and, eq, gte, lte, isNull, sql, desc } from "drizzle-orm";
import { companyFilter } from "../companyHelper";

const inputSchema = z.object({
  companyId: z.number(),
  companyIds: z.array(z.number()).optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
});

function defaultRange(input: { dataInicio?: string; dataFim?: string }) {
  const fim = input.dataFim ? new Date(input.dataFim + "T00:00:00") : new Date();
  const inicio = input.dataInicio
    ? new Date(input.dataInicio + "T00:00:00")
    : (() => {
        const d = new Date(fim);
        d.setMonth(d.getMonth() - 11);
        d.setDate(1);
        return d;
      })();
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { dataInicio: toISO(inicio), dataFim: toISO(fim) };
}

export const sstAnalyticsRouter = router({
  atestadosAcidentes: protectedProcedure
    .input(inputSchema)
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const { dataInicio, dataFim } = defaultRange(input);

      const atestadosBase = and(
        companyFilter(atestados.companyId, input),
        isNull(atestados.deletedAt),
        gte(atestados.dataEmissao, dataInicio),
        lte(atestados.dataEmissao, dataFim),
      );

      const acidentesBase = and(
        companyFilter(accidents.companyId, input),
        gte(accidents.dataAcidente, dataInicio),
        lte(accidents.dataAcidente, dataFim),
      );

      // ---- ATESTADOS ----
      const atRows = await db
        .select({
          id: atestados.id,
          tipo: atestados.tipo,
          dataEmissao: atestados.dataEmissao,
          diasAfastamento: atestados.diasAfastamento,
          horasAfastamento: atestados.horasAfastamento,
          afastamentoTipo: atestados.afastamentoTipo,
          afastamentoINSS: atestados.afastamentoINSS,
          dataRetorno: atestados.dataRetorno,
          cid: atestados.cid,
          motivo: atestados.motivo,
          employeeId: atestados.employeeId,
          employeeNome: employees.nomeCompleto,
          employeeMatricula: employees.matricula,
          employeeFuncao: employees.funcao,
          employeeCargo: employees.cargo,
        })
        .from(atestados)
        .leftJoin(employees, eq(atestados.employeeId, employees.id))
        .where(atestadosBase)
        .orderBy(desc(atestados.dataEmissao));

      const totalAtestados = atRows.length;
      const totalDiasAfastamento = atRows.reduce((s, r) => s + (r.diasAfastamento || 0), 0);
      const totalHorasAfastamento = atRows.reduce((s, r) => s + (r.horasAfastamento || 0), 0);
      const colaboradoresAfetadosAt = new Set(atRows.map((r) => r.employeeId)).size;
      const totalAfastamentosINSS = atRows.filter((r) => (r.afastamentoINSS ?? 0) > 0).length;
      const mediaDiasAtestado = totalAtestados > 0 ? totalDiasAfastamento / totalAtestados : 0;

      // por tipo
      const porTipoMap = new Map<string, { tipo: string; quantidade: number; dias: number }>();
      for (const r of atRows) {
        const k = (r.tipo || "Não informado").trim() || "Não informado";
        const cur = porTipoMap.get(k) ?? { tipo: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        porTipoMap.set(k, cur);
      }
      const porTipo = Array.from(porTipoMap.values()).sort((a, b) => b.quantidade - a.quantidade);

      // por motivo
      const porMotivoMap = new Map<string, { motivo: string; quantidade: number; dias: number }>();
      for (const r of atRows) {
        const k = (r.motivo || "").trim() || "Não informado";
        const cur = porMotivoMap.get(k) ?? { motivo: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        porMotivoMap.set(k, cur);
      }
      const porMotivo = Array.from(porMotivoMap.values())
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);

      // top CIDs
      const cidMap = new Map<string, { cid: string; quantidade: number; dias: number }>();
      for (const r of atRows) {
        const k = (r.cid || "").trim().toUpperCase();
        if (!k) continue;
        const cur = cidMap.get(k) ?? { cid: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        cidMap.set(k, cur);
      }
      const topCIDs = Array.from(cidMap.values())
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10);
      const atestadosComCID = atRows.filter((r) => (r.cid || "").trim().length > 0).length;
      const atestadosSemCID = totalAtestados - atestadosComCID;

      // top funcionários (atestados)
      const funcMap = new Map<
        number,
        { employeeId: number; nome: string; matricula: string | null; funcao: string | null; quantidade: number; dias: number }
      >();
      for (const r of atRows) {
        const cur = funcMap.get(r.employeeId) ?? {
          employeeId: r.employeeId,
          nome: r.employeeNome || `Funcionário #${r.employeeId}`,
          matricula: r.employeeMatricula || null,
          funcao: r.employeeFuncao || r.employeeCargo || null,
          quantidade: 0,
          dias: 0,
        };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        funcMap.set(r.employeeId, cur);
      }
      const topFuncionariosAtestados = Array.from(funcMap.values())
        .sort((a, b) => b.quantidade - a.quantidade || b.dias - a.dias)
        .slice(0, 10);

      // ---- ACIDENTES ----
      const acRows = await db
        .select({
          id: accidents.id,
          dataAcidente: accidents.dataAcidente,
          horaAcidente: accidents.horaAcidente,
          tipoAcidente: accidents.tipoAcidente,
          gravidade: accidents.gravidade,
          localAcidente: accidents.localAcidente,
          parteCorpoAtingida: accidents.parteCorpoAtingida,
          catNumero: accidents.catNumero,
          catData: accidents.catData,
          diasAfastamento: accidents.diasAfastamento,
          descricao: accidents.descricao,
          acaoCorretiva: accidents.acaoCorretiva,
          employeeId: accidents.employeeId,
          employeeNome: employees.nomeCompleto,
          employeeMatricula: employees.matricula,
          employeeFuncao: employees.funcao,
          employeeCargo: employees.cargo,
        })
        .from(accidents)
        .leftJoin(employees, eq(accidents.employeeId, employees.id))
        .where(acidentesBase)
        .orderBy(desc(accidents.dataAcidente));

      const totalAcidentes = acRows.length;
      const totalDiasAfastamentoAcid = acRows.reduce((s, r) => s + (r.diasAfastamento || 0), 0);
      const colaboradoresAfetadosAc = new Set(acRows.map((r) => r.employeeId)).size;
      const acidentesComCAT = acRows.filter((r) => (r.catNumero || "").trim().length > 0).length;
      const acidentesSemCAT = totalAcidentes - acidentesComCAT;
      const acidentesComAfastamento = acRows.filter((r) => (r.diasAfastamento || 0) > 0).length;
      const acidentesSemAfastamento = totalAcidentes - acidentesComAfastamento;

      // por gravidade
      const gravMap = new Map<string, { gravidade: string; quantidade: number; dias: number }>();
      for (const r of acRows) {
        const k = (r.gravidade || "Não informado").trim() || "Não informado";
        const cur = gravMap.get(k) ?? { gravidade: k, quantidade: 0, dias: 0 };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        gravMap.set(k, cur);
      }
      const porGravidade = Array.from(gravMap.values()).sort((a, b) => b.quantidade - a.quantidade);

      // por tipo de acidente
      const tipoAcMap = new Map<string, { tipo: string; quantidade: number }>();
      for (const r of acRows) {
        const k = (r.tipoAcidente || "Não informado").trim() || "Não informado";
        const cur = tipoAcMap.get(k) ?? { tipo: k, quantidade: 0 };
        cur.quantidade += 1;
        tipoAcMap.set(k, cur);
      }
      const porTipoAcidente = Array.from(tipoAcMap.values()).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

      // por parte do corpo
      const parteMap = new Map<string, { parte: string; quantidade: number }>();
      for (const r of acRows) {
        const k = (r.parteCorpoAtingida || "Não informado").trim() || "Não informado";
        const cur = parteMap.get(k) ?? { parte: k, quantidade: 0 };
        cur.quantidade += 1;
        parteMap.set(k, cur);
      }
      const porParteCorpo = Array.from(parteMap.values()).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

      // por local
      const localMap = new Map<string, { local: string; quantidade: number }>();
      for (const r of acRows) {
        const k = (r.localAcidente || "Não informado").trim() || "Não informado";
        const cur = localMap.get(k) ?? { local: k, quantidade: 0 };
        cur.quantidade += 1;
        localMap.set(k, cur);
      }
      const porLocal = Array.from(localMap.values()).sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);

      // ---- Evolução Mensal (atestados + acidentes + dias) ----
      const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
      const months: string[] = [];
      {
        const start = new Date(dataInicio + "T00:00:00");
        const end = new Date(dataFim + "T00:00:00");
        const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
        while (cursor <= end) {
          months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
      const monthInit = () =>
        Object.fromEntries(
          months.map((m) => [
            m,
            { mes: m, atestados: 0, diasAtestado: 0, acidentes: 0, diasAcidente: 0 },
          ]),
        ) as Record<string, { mes: string; atestados: number; diasAtestado: number; acidentes: number; diasAcidente: number }>;
      const monthAgg = monthInit();
      for (const r of atRows) {
        const k = monthKey(r.dataEmissao);
        if (monthAgg[k]) {
          monthAgg[k].atestados += 1;
          monthAgg[k].diasAtestado += r.diasAfastamento || 0;
        }
      }
      for (const r of acRows) {
        const k = monthKey(r.dataAcidente);
        if (monthAgg[k]) {
          monthAgg[k].acidentes += 1;
          monthAgg[k].diasAcidente += r.diasAfastamento || 0;
        }
      }
      const evolucaoMensal = months.map((m) => monthAgg[m]);

      // ---- Headcount médio para taxas (TF/TG) ----
      const empRows = await db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            companyFilter(employees.companyId, input),
            isNull(employees.deletedAt),
            eq(employees.status, "Ativo"),
          ),
        );
      const headcount = empRows.length;

      // Horas-homem estimadas no período (220h/mês padrão CLT)
      const horasHomem = headcount * 220 * months.length;
      // Taxa de Frequência = (nº acidentes c/ afastamento × 1.000.000) / HH
      const taxaFrequencia = horasHomem > 0 ? (acidentesComAfastamento * 1_000_000) / horasHomem : 0;
      // Taxa de Gravidade = (dias perdidos × 1.000.000) / HH
      const taxaGravidade = horasHomem > 0 ? (totalDiasAfastamentoAcid * 1_000_000) / horasHomem : 0;

      // top funcionários (acidentes)
      const funcAcMap = new Map<
        number,
        { employeeId: number; nome: string; matricula: string | null; funcao: string | null; quantidade: number; dias: number }
      >();
      for (const r of acRows) {
        const cur = funcAcMap.get(r.employeeId) ?? {
          employeeId: r.employeeId,
          nome: r.employeeNome || `Funcionário #${r.employeeId}`,
          matricula: r.employeeMatricula || null,
          funcao: r.employeeFuncao || r.employeeCargo || null,
          quantidade: 0,
          dias: 0,
        };
        cur.quantidade += 1;
        cur.dias += r.diasAfastamento || 0;
        funcAcMap.set(r.employeeId, cur);
      }
      const topFuncionariosAcidentes = Array.from(funcAcMap.values())
        .sort((a, b) => b.quantidade - a.quantidade || b.dias - a.dias)
        .slice(0, 10);

      // últimos eventos (combinados)
      const ultimosAtestados = atRows.slice(0, 8).map((r) => ({
        id: r.id,
        data: r.dataEmissao,
        employeeId: r.employeeId,
        nome: r.employeeNome || `Funcionário #${r.employeeId}`,
        funcao: r.employeeFuncao || r.employeeCargo || null,
        tipo: r.tipo,
        cid: r.cid,
        dias: r.diasAfastamento || 0,
        motivo: r.motivo,
      }));
      const ultimosAcidentes = acRows.slice(0, 8).map((r) => ({
        id: r.id,
        data: r.dataAcidente,
        hora: r.horaAcidente,
        employeeId: r.employeeId,
        nome: r.employeeNome || `Funcionário #${r.employeeId}`,
        funcao: r.employeeFuncao || r.employeeCargo || null,
        tipo: r.tipoAcidente,
        gravidade: r.gravidade,
        local: r.localAcidente,
        parteCorpo: r.parteCorpoAtingida,
        catNumero: r.catNumero,
        dias: r.diasAfastamento || 0,
      }));

      return {
        periodo: { dataInicio, dataFim, meses: months.length },
        headcount,
        horasHomem,
        atestados: {
          total: totalAtestados,
          totalDiasAfastamento,
          totalHorasAfastamento,
          colaboradoresAfetados: colaboradoresAfetadosAt,
          totalAfastamentosINSS,
          mediaDiasAtestado,
          comCID: atestadosComCID,
          semCID: atestadosSemCID,
          porTipo,
          porMotivo,
          topCIDs,
          topFuncionarios: topFuncionariosAtestados,
        },
        acidentes: {
          total: totalAcidentes,
          totalDiasAfastamento: totalDiasAfastamentoAcid,
          colaboradoresAfetados: colaboradoresAfetadosAc,
          comCAT: acidentesComCAT,
          semCAT: acidentesSemCAT,
          comAfastamento: acidentesComAfastamento,
          semAfastamento: acidentesSemAfastamento,
          taxaFrequencia,
          taxaGravidade,
          porGravidade,
          porTipo: porTipoAcidente,
          porParteCorpo,
          porLocal,
          topFuncionarios: topFuncionariosAcidentes,
        },
        evolucaoMensal,
        ultimosAtestados,
        ultimosAcidentes,
      };
    }),
});
