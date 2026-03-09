import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { feriados } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";

// Feriados nacionais fixos do Brasil
const FERIADOS_NACIONAIS = [
  { nome: "Confraternização Universal", data: "01-01", tipo: "nacional" as const },
  { nome: "Tiradentes", data: "04-21", tipo: "nacional" as const },
  { nome: "Dia do Trabalho", data: "05-01", tipo: "nacional" as const },
  { nome: "Independência do Brasil", data: "09-07", tipo: "nacional" as const },
  { nome: "Nossa Senhora Aparecida", data: "10-12", tipo: "nacional" as const },
  { nome: "Finados", data: "11-02", tipo: "nacional" as const },
  { nome: "Proclamação da República", data: "11-15", tipo: "nacional" as const },
  { nome: "Natal", data: "12-25", tipo: "nacional" as const },
];

// Calcular Páscoa (algoritmo de Meeus/Jones/Butcher)
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

// Feriados móveis baseados na Páscoa
function feriadosMoveis(ano: number): Array<{ nome: string; data: string; tipo: "nacional" }> {
  const pascoa = new Date(calcularPascoa(ano) + 'T12:00:00Z');
  
  const carnaval = new Date(pascoa);
  carnaval.setUTCDate(carnaval.getUTCDate() - 47);
  
  const sextaSanta = new Date(pascoa);
  sextaSanta.setUTCDate(sextaSanta.getUTCDate() - 2);
  
  const corpusChristi = new Date(pascoa);
  corpusChristi.setUTCDate(corpusChristi.getUTCDate() + 60);
  
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  
  return [
    { nome: "Carnaval", data: fmt(carnaval), tipo: "nacional" },
    { nome: "Sexta-Feira Santa", data: fmt(sextaSanta), tipo: "nacional" },
    { nome: "Corpus Christi", data: fmt(corpusChristi), tipo: "nacional" },
  ];
}

export const feriadosRouter = router({
  // Listar feriados de um ano
  listar: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const ano = input.ano || new Date().getFullYear();
      
      const result = await db.select().from(feriados)
        .where(and(
          sql`(${feriados.companyId} = ${input.companyId} OR ${feriados.companyId} IS NULL)`,
          eq(feriados.ativo, 1),
        ))
        .orderBy(feriados.data);

      // Filtrar por ano (considerando recorrentes)
      const filtrados = result.filter(f => {
        if (f.recorrente) {
          return true; // Recorrentes aparecem sempre
        }
        return f.data.startsWith(String(ano));
      });

      // Adicionar feriados nacionais fixos que não estão no banco
      const existentes = new Set(filtrados.map(f => {
        if (f.recorrente) return f.data.substring(5); // MM-DD
        return f.data;
      }));

      const nacionaisFixos = FERIADOS_NACIONAIS.filter(f => !existentes.has(f.data)).map(f => ({
        id: 0,
        companyId: null,
        nome: f.nome,
        data: `${ano}-${f.data}`,
        tipo: f.tipo,
        recorrente: 1,
        estado: null,
        cidade: null,
        ativo: 1,
        criadoPor: 'Sistema',
        createdAt: null,
        updatedAt: null,
        isDefault: true,
      }));

      // Adicionar feriados móveis
      const moveis = feriadosMoveis(ano).filter(f => !existentes.has(f.data.substring(5))).map(f => ({
        id: 0,
        companyId: null,
        nome: f.nome,
        data: f.data,
        tipo: f.tipo,
        recorrente: 0,
        estado: null,
        cidade: null,
        ativo: 1,
        criadoPor: 'Sistema',
        createdAt: null,
        updatedAt: null,
        isDefault: true,
      }));

      return [...filtrados.map(f => ({ ...f, isDefault: false })), ...nacionaisFixos, ...moveis]
        .sort((a, b) => {
          const dataA = a.recorrente && a.data.length === 5 ? `${ano}-${a.data}` : a.data;
          const dataB = b.recorrente && b.data.length === 5 ? `${ano}-${b.data}` : b.data;
          return dataA.localeCompare(dataB);
        });
    }),

  // Criar feriado personalizado
  criar: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), nome: z.string().min(1),
      data: z.string(),
      tipo: z.enum(['nacional','estadual','municipal','ponto_facultativo','compensado']),
      recorrente: z.boolean().default(true),
      estado: z.string().optional(),
      cidade: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await db.insert(feriados).values({
        companyId: input.companyId,
        nome: input.nome,
        data: input.data,
        tipo: input.tipo,
        recorrente: input.recorrente ? 1 : 0,
        estado: input.estado || null,
        cidade: input.cidade || null,
        criadoPor: ctx.user.name ?? 'Sistema',
      });
      return { success: true };
    }),

  // Atualizar feriado
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      data: z.string().optional(),
      tipo: z.enum(['nacional','estadual','municipal','ponto_facultativo','compensado']).optional(),
      recorrente: z.boolean().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...rest } = input;
      const updateData: any = {};
      if (rest.nome !== undefined) updateData.nome = rest.nome;
      if (rest.data !== undefined) updateData.data = rest.data;
      if (rest.tipo !== undefined) updateData.tipo = rest.tipo;
      if (rest.recorrente !== undefined) updateData.recorrente = rest.recorrente ? 1 : 0;
      if (rest.ativo !== undefined) updateData.ativo = rest.ativo ? 1 : 0;
      await db.update(feriados).set(updateData).where(eq(feriados.id, id));
      return { success: true };
    }),

  // Excluir feriado
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.update(feriados).set({ ativo: 0 }).where(eq(feriados.id, input.id));
      return { success: true };
    }),

  // Seed feriados nacionais para um ano
  seedNacionais: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), ano: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ano = input.ano;
      let count = 0;

      // Feriados fixos
      for (const f of FERIADOS_NACIONAIS) {
        const data = `${ano}-${f.data}`;
        const existing = await db.select().from(feriados)
          .where(and(
            sql`(${feriados.companyId} = ${input.companyId} OR ${feriados.companyId} IS NULL)`,
            eq(feriados.data, data),
          ));
        if (existing.length === 0) {
          await db.insert(feriados).values({
            companyId: null,
            nome: f.nome,
            data,
            tipo: f.tipo,
            recorrente: 1,
            criadoPor: ctx.user.name ?? 'Sistema',
          });
          count++;
        }
      }

      // Feriados móveis
      for (const f of feriadosMoveis(ano)) {
        const existing = await db.select().from(feriados)
          .where(and(
            sql`(${feriados.companyId} = ${input.companyId} OR ${feriados.companyId} IS NULL)`,
            eq(feriados.data, f.data),
          ));
        if (existing.length === 0) {
          await db.insert(feriados).values({
            companyId: null,
            nome: f.nome,
            data: f.data,
            tipo: f.tipo,
            recorrente: 0,
            criadoPor: ctx.user.name ?? 'Sistema',
          });
          count++;
        }
      }

      return { success: true, feriadosCriados: count };
    }),

  // Verificar se uma data é feriado
  verificarData: protectedProcedure
    .input(z.object({ companyId: z.number(), companyIds: z.array(z.number()).optional(), data: z.string() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const mmdd = input.data.substring(5); // MM-DD

      const result = await db.select().from(feriados)
        .where(and(
          sql`(${feriados.companyId} = ${input.companyId} OR ${feriados.companyId} IS NULL)`,
          eq(feriados.ativo, 1),
          sql`(${feriados.data} = ${input.data} OR (${feriados.recorrente} = 1 AND RIGHT(${feriados.data}, 5) = ${mmdd}))`,
        ));

      // Verificar também feriados móveis
      const ano = parseInt(input.data.substring(0, 4));
      const moveis = feriadosMoveis(ano);
      const movelMatch = moveis.find(m => m.data === input.data);

      if (result.length > 0) {
        return { isFeriado: true, feriado: result[0] };
      }
      if (movelMatch) {
        return { isFeriado: true, feriado: { nome: movelMatch.nome, tipo: movelMatch.tipo } };
      }
      // Check fixed national
      const fixoMatch = FERIADOS_NACIONAIS.find(f => f.data === mmdd);
      if (fixoMatch) {
        return { isFeriado: true, feriado: { nome: fixoMatch.nome, tipo: fixoMatch.tipo } };
      }

      return { isFeriado: false, feriado: null };
    }),
});
