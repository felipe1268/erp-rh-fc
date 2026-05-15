import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { feriados, userCompanies } from "../../drizzle/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { resolveCompanyIds, companyFilter } from "../companyHelper";
import { TRPCError } from "@trpc/server";

// Rev. 1840 — Tenant guard: garante que TODOS os companyIds requisitados pertencem
// ao usuario (via userCompanies). admin_master atravessa. Bloqueia IDOR quando o
// front passa companyIds arbitrarios.
async function ensureUserOwnsCompanies(db: any, user: any, ids: number[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const role = String(user?.role || "").toLowerCase();
  if (role === "admin_master") return;
  const owned = await db.select({ companyId: userCompanies.companyId })
    .from(userCompanies)
    .where(and(eq(userCompanies.userId, user.id), inArray(userCompanies.companyId, ids)));
  const ownedSet = new Set<number>(owned.map((r: any) => Number(r.companyId)));
  const ok = ids.every(id => ownedSet.has(Number(id)));
  if (!ok) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para uma ou mais empresas solicitadas." });
  }
}

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

  // Rev. 1840 — Lista todas as datas-feriado dentro de um período (YYYY-MM-DD).
  // Considera (a) registros do banco para a empresa (ou globais com companyId NULL),
  // expandindo recorrentes por todos os anos do período; (b) FERIADOS_NACIONAIS fixos
  // (caso seedNacionais ainda não tenha sido executado para a empresa); (c) feriados
  // móveis (Carnaval, Sexta Santa, Corpus Christi) por ano. É a fonte única para o
  // EspelhoPonto e qualquer outro consumidor que precise reconhecer feriados sem
  // duplicar a lógica que o `getFaltasReport` (fechamentoPonto.ts L4869-4887) faz.
  listarPeriodo: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dataInicio deve ser YYYY-MM-DD"),
      dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dataFim deve ser YYYY-MM-DD"),
    }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const { dataInicio, dataFim } = input;
      if (!dataInicio || !dataFim || dataInicio > dataFim) return [] as string[];

      const cids = input.companyIds && input.companyIds.length > 0
        ? input.companyIds
        : [input.companyId];
      // Rev. 1840 — guard tenant
      await ensureUserOwnsCompanies(db, ctx.user, cids);

      const rows = await db.select({ data: feriados.data, recorrente: feriados.recorrente })
        .from(feriados)
        .where(and(
          eq(feriados.ativo, 1),
          sql`(${feriados.companyId} IS NULL OR ${feriados.companyId} IN (${sql.join(cids.map(c => sql`${c}`), sql`, `)}))`,
        ));

      const set = new Set<string>();
      const yIni = parseInt(dataInicio.slice(0, 4), 10);
      const yFim = parseInt(dataFim.slice(0, 4), 10);

      // (a) Banco — recorrentes expandidos
      for (const f of rows) {
        const raw = String(f.data);
        if (f.recorrente === 1) {
          const md = raw.length >= 10 ? raw.slice(5) : raw; // suporta 'YYYY-MM-DD' ou 'MM-DD'
          for (let y = yIni; y <= yFim; y++) {
            const ds = `${y}-${md}`;
            if (ds >= dataInicio && ds <= dataFim) set.add(ds);
          }
        } else {
          if (raw >= dataInicio && raw <= dataFim) set.add(raw);
        }
      }

      // (b) Fixos nacionais — caso não estejam no banco
      for (let y = yIni; y <= yFim; y++) {
        for (const f of FERIADOS_NACIONAIS) {
          const ds = `${y}-${f.data}`;
          if (ds >= dataInicio && ds <= dataFim) set.add(ds);
        }
      }

      // (c) Móveis (Páscoa-derivados) por ano
      for (let y = yIni; y <= yFim; y++) {
        for (const f of feriadosMoveis(y)) {
          if (f.data >= dataInicio && f.data <= dataFim) set.add(f.data);
        }
      }

      return Array.from(set).sort();
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
