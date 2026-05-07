import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { accidents, employees, obras, atestados } from "../../drizzle/schema";
import { and, eq, desc, isNull, sql } from "drizzle-orm";
import { companyFilter } from "../companyHelper";

export const GRAVIDADES = [
  "Quase-acidente",
  "Primeiros Socorros",
  "Leve sem afastamento",
  "Leve com afastamento",
  "Moderado",
  "Grave",
  "Gravíssimo",
  "Fatal",
] as const;

const inputSave = z.object({
  id: z.number().optional(),
  companyId: z.number(),
  employeeId: z.number(),
  obraId: z.number().nullable().optional(),
  dataAcidente: z.string(),
  horaAcidente: z.string().nullable().optional(),
  tipoAcidente: z.string(),
  gravidade: z.string(),
  localAcidente: z.string().nullable().optional(),
  parteCorpoAtingida: z.string().nullable().optional(),
  agenteCausador: z.string().nullable().optional(),
  descricao: z.string().nullable().optional(),
  testemunhas: z.string().nullable().optional(),
  diasAfastamento: z.number().nullable().optional(),
  houveCAT: z.number().nullable().optional(),
  catNumero: z.string().nullable().optional(),
  catData: z.string().nullable().optional(),
  motivoSemCAT: z.string().nullable().optional(),
  acaoCorretiva: z.string().nullable().optional(),
  statusAcaoCorretiva: z.string().nullable().optional(),
  prazoAcaoCorretiva: z.string().nullable().optional(),
  responsavelAcao: z.string().nullable().optional(),
  atestadoId: z.number().nullable().optional(),
  documentoUrl: z.string().nullable().optional(),
  anexosUrls: z.string().nullable().optional(),
});

export const acidentesRouter = router({
  list: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      gravidade: z.string().optional(),
      obraId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conds: any[] = [
        companyFilter(accidents.companyId, input),
        isNull(accidents.deletedAt),
      ];
      if (input.dataInicio) conds.push(sql`${accidents.dataAcidente} >= ${input.dataInicio}`);
      if (input.dataFim) conds.push(sql`${accidents.dataAcidente} <= ${input.dataFim}`);
      if (input.gravidade) conds.push(eq(accidents.gravidade, input.gravidade));
      if (input.obraId) conds.push(eq(accidents.obraId, input.obraId));

      const rows = await db.select({
        id: accidents.id, companyId: accidents.companyId, employeeId: accidents.employeeId,
        obraId: accidents.obraId, dataAcidente: accidents.dataAcidente, horaAcidente: accidents.horaAcidente,
        tipoAcidente: accidents.tipoAcidente, gravidade: accidents.gravidade,
        localAcidente: accidents.localAcidente, parteCorpoAtingida: accidents.parteCorpoAtingida,
        agenteCausador: accidents.agenteCausador, descricao: accidents.descricao,
        testemunhas: accidents.testemunhas, diasAfastamento: accidents.diasAfastamento,
        houveCAT: accidents.houveCAT, catNumero: accidents.catNumero, catData: accidents.catData,
        motivoSemCAT: accidents.motivoSemCAT, acaoCorretiva: accidents.acaoCorretiva,
        statusAcaoCorretiva: accidents.statusAcaoCorretiva, prazoAcaoCorretiva: accidents.prazoAcaoCorretiva,
        responsavelAcao: accidents.responsavelAcao, atestadoId: accidents.atestadoId,
        documentoUrl: accidents.documentoUrl, anexosUrls: accidents.anexosUrls,
        createdAt: accidents.createdAt, updatedAt: accidents.updatedAt,
        employeeNome: employees.nomeCompleto, employeeMatricula: employees.matricula,
        employeeFuncao: employees.funcao, employeeCargo: employees.cargo,
        obraNome: obras.nome,
      })
        .from(accidents)
        .leftJoin(employees, eq(accidents.employeeId, employees.id))
        .leftJoin(obras, eq(accidents.obraId, obras.id))
        .where(and(...conds))
        .orderBy(desc(accidents.dataAcidente), desc(accidents.id));
      return rows;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [row] = await db.select().from(accidents)
        .where(and(eq(accidents.id, input.id), companyFilter(accidents.companyId, input), isNull(accidents.deletedAt)));
      return row || null;
    }),

  save: protectedProcedure
    .input(inputSave)
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;

      // Validação CAT: gravidades que exigem CAT precisam ter CAT emitida ou justificativa
      const exigeCAT = !["Quase-acidente", "Primeiros Socorros"].includes(data.gravidade);
      if (exigeCAT) {
        const temCat = (data.houveCAT ?? 0) === 1 && data.catNumero && data.catData;
        const temJustificativa = !!(data.motivoSemCAT && data.motivoSemCAT.trim().length >= 5);
        if (!temCat && !temJustificativa) {
          throw new Error(`Acidentes com gravidade '${data.gravidade}' exigem CAT (número + data) OU justificativa para não emissão (mínimo 5 caracteres).`);
        }
      }

      // Garantia de tenant isolation no UPDATE: confere se o registro pertence à mesma companyId
      if (id) {
        const [existing] = await db.select({ companyId: accidents.companyId })
          .from(accidents).where(and(eq(accidents.id, id), isNull(accidents.deletedAt)));
        if (!existing) throw new Error("Acidente não encontrado.");
        if (existing.companyId !== data.companyId) throw new Error("Acesso negado: acidente pertence a outra empresa.");
      }

      const payload: any = {
        ...data,
        diasAfastamento: data.diasAfastamento ?? 0,
        houveCAT: data.houveCAT ?? 0,
        statusAcaoCorretiva: data.statusAcaoCorretiva ?? "Pendente",
        updatedAt: new Date().toISOString(),
      };
      if (id) {
        await db.update(accidents).set(payload).where(eq(accidents.id, id));
        return { id };
      }
      const [r] = await db.insert(accidents).values(payload).returning({ id: accidents.id });
      return { id: r.id };
    }),

  // Lista atestados do funcionário (para vincular a um acidente).
  // Inclui se o atestado já está vinculado a outro acidente (para indicar visualmente).
  atestadosDoFuncionario: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      excludeAccidentId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db.select({
        id: atestados.id,
        tipo: atestados.tipo,
        dataEmissao: atestados.dataEmissao,
        dataRetorno: atestados.dataRetorno,
        diasAfastamento: atestados.diasAfastamento,
        horasAfastamento: atestados.horasAfastamento,
        afastamentoTipo: atestados.afastamentoTipo,
        cid: atestados.cid,
        medico: atestados.medico,
        crm: atestados.crm,
        motivo: atestados.motivo,
        descricao: atestados.descricao,
        documentoUrl: atestados.documentoUrl,
        afastamentoINSS: atestados.afastamentoINSS,
      })
        .from(atestados)
        .where(and(
          eq(atestados.employeeId, input.employeeId),
          companyFilter(atestados.companyId, input),
          isNull(atestados.deletedAt),
        ))
        .orderBy(desc(atestados.dataEmissao));

      // Marca os já vinculados a outro acidente (escopo: mesma company, somente atestados retornados)
      const ids = rows.map((r) => r.id);
      const vinculados = new Map<number, number>();
      if (ids.length > 0) {
        const vincQ = await db.select({ atestadoId: accidents.atestadoId, accId: accidents.id })
          .from(accidents)
          .where(and(
            companyFilter(accidents.companyId, input),
            isNull(accidents.deletedAt),
            sql`${accidents.atestadoId} IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
          ));
        for (const v of vincQ) {
          if (v.atestadoId && (!input.excludeAccidentId || v.accId !== input.excludeAccidentId)) {
            vinculados.set(v.atestadoId, v.accId);
          }
        }
      }
      return rows.map((r) => ({ ...r, jaVinculadoAoAcidenteId: vinculados.get(r.id) ?? null }));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number(), companyIds: z.array(z.number()).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const userName = (ctx as any)?.user?.fullName || (ctx as any)?.user?.username || "system";
      // Filtro de tenant: só deleta se o acidente pertencer a uma das companies do usuário
      const result = await db.update(accidents).set({
        deletedAt: new Date().toISOString(),
        deletedBy: userName,
      }).where(and(
        eq(accidents.id, input.id),
        companyFilter(accidents.companyId, input),
        isNull(accidents.deletedAt),
      )).returning({ id: accidents.id });
      if (result.length === 0) throw new Error("Acidente não encontrado ou acesso negado.");
      return { success: true };
    }),
});
