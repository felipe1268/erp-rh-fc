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

// Rev. 3355 — Feriados ESTADUAIS oficiais por UF (data fixa MM-DD), usados pelo
// "Baixar Feriados": o usuário escolhe as UFs (pré-marcadas pelas UFs das obras
// ativas, quando preenchidas) e o ERP semeia os feriados do estado correspondente.
// Lista curada (datas civis estabelecidas). Feriados MUNICIPAIS NÃO entram aqui
// (não há base pública confiável) → cadastro manual.
const FERIADOS_ESTADUAIS: Record<string, Array<{ nome: string; data: string }>> = {
  AC: [
    { nome: "Dia do Evangélico", data: "01-23" },
    { nome: "Aniversário do Acre", data: "06-15" },
    { nome: "Dia da Amazônia", data: "09-05" },
    { nome: "Assinatura do Tratado de Petrópolis", data: "11-17" },
  ],
  AL: [
    { nome: "São João", data: "06-24" },
    { nome: "São Pedro", data: "06-29" },
    { nome: "Emancipação Política de Alagoas", data: "09-16" },
    { nome: "Consciência Negra", data: "11-20" },
  ],
  AP: [
    { nome: "São José", data: "03-19" },
    { nome: "Criação do Território Federal do Amapá", data: "09-13" },
    { nome: "Consciência Negra", data: "11-20" },
  ],
  AM: [
    { nome: "Elevação do Amazonas à Província", data: "09-05" },
    { nome: "Consciência Negra", data: "11-20" },
    { nome: "Nossa Senhora da Conceição", data: "12-08" },
  ],
  BA: [
    { nome: "Independência da Bahia", data: "07-02" },
  ],
  CE: [
    { nome: "Data Magna do Ceará", data: "03-25" },
    { nome: "Nossa Senhora da Assunção", data: "08-15" },
  ],
  DF: [
    { nome: "Dia do Evangélico", data: "11-30" },
  ],
  MA: [
    { nome: "Adesão do Maranhão à Independência", data: "07-28" },
  ],
  MT: [
    { nome: "Consciência Negra", data: "11-20" },
  ],
  MS: [
    { nome: "Criação do Estado de Mato Grosso do Sul", data: "10-11" },
  ],
  PA: [
    { nome: "Adesão do Grão-Pará à Independência", data: "08-15" },
  ],
  PB: [
    { nome: "Homenagem à memória de João Pessoa", data: "07-26" },
    { nome: "Fundação do Estado da Paraíba", data: "08-05" },
  ],
  PR: [
    { nome: "Emancipação Política do Paraná", data: "12-19" },
  ],
  PE: [
    { nome: "Revolução Pernambucana", data: "03-06" },
    { nome: "São João", data: "06-24" },
  ],
  PI: [
    { nome: "Dia do Piauí", data: "10-19" },
  ],
  RJ: [
    { nome: "Dia de São Jorge", data: "04-23" },
    { nome: "Dia da Consciência Negra (Zumbi dos Palmares)", data: "11-20" },
  ],
  RN: [
    { nome: "Mártires de Cunhaú e Uruaçu", data: "10-03" },
  ],
  RS: [
    { nome: "Revolução Farroupilha", data: "09-20" },
  ],
  RO: [
    { nome: "Criação do Estado de Rondônia", data: "01-04" },
    { nome: "Dia do Evangélico", data: "06-18" },
  ],
  RR: [
    { nome: "Criação do Estado de Roraima", data: "10-05" },
  ],
  SC: [
    { nome: "Dia de Santa Catarina de Alexandria", data: "11-25" },
  ],
  SP: [
    { nome: "Revolução Constitucionalista (9 de Julho)", data: "07-09" },
  ],
  SE: [
    { nome: "Emancipação Política de Sergipe", data: "07-08" },
  ],
  TO: [
    { nome: "Autonomia do Estado do Tocantins", data: "03-18" },
    { nome: "Criação do Estado do Tocantins", data: "10-05" },
  ],
};

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

// Feriados móveis baseados na Páscoa.
// Rev. 3352 — Carnaval e Corpus Christi são PONTO FACULTATIVO no Brasil (não há lei
// federal que os declare feriado): nascem `observadoDefault: false` → cada empresa
// decide se "segue". A Sexta-Feira Santa é feriado nacional (Lei 9.093/95) →
// `observadoDefault: true`.
type FeriadoTipo = "nacional" | "estadual" | "municipal" | "ponto_facultativo" | "compensado";
function feriadosMoveis(ano: number): Array<{ nome: string; data: string; tipo: FeriadoTipo; observadoDefault: boolean }> {
  const pascoa = new Date(calcularPascoa(ano) + 'T12:00:00Z');
  
  const carnaval = new Date(pascoa);
  carnaval.setUTCDate(carnaval.getUTCDate() - 47);
  
  const sextaSanta = new Date(pascoa);
  sextaSanta.setUTCDate(sextaSanta.getUTCDate() - 2);
  
  const corpusChristi = new Date(pascoa);
  corpusChristi.setUTCDate(corpusChristi.getUTCDate() + 60);
  
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  
  return [
    { nome: "Carnaval", data: fmt(carnaval), tipo: "ponto_facultativo", observadoDefault: false },
    { nome: "Sexta-Feira Santa", data: fmt(sextaSanta), tipo: "nacional", observadoDefault: true },
    { nome: "Corpus Christi", data: fmt(corpusChristi), tipo: "ponto_facultativo", observadoDefault: false },
  ];
}

// Rev. 3352 — normalização de cidade/UF p/ casar `obras.cidade` × `feriados.cidade`
// (ambos free-text): minúsculas, sem acento, trim, espaços colapsados.
function _normCidade(s: string | null | undefined): string {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}
function _normUF(s: string | null | undefined): string {
  return String(s || "").toUpperCase().trim();
}

// Rev. 3352 — escopo geográfico DERIVADO de cidade/estado (independe do `tipo`):
// cidade preenchida → municipal; senão estado → estadual; senão → nacional.
type FeriadoEscopo = "nacional" | "estadual" | "municipal";
function _escopoDe(estado: string | null | undefined, cidade: string | null | undefined): FeriadoEscopo {
  if (cidade && String(cidade).trim()) return "municipal";
  if (estado && String(estado).trim()) return "estadual";
  return "nacional";
}

export type FeriadoOcorrencia = {
  data: string;           // YYYY-MM-DD
  escopo: FeriadoEscopo;
  estado: string | null;  // UF normalizada (estadual/municipal)
  cidade: string | null;  // cidade normalizada (municipal)
  observado: boolean;
  nome: string;
};

// Rev. 3352 — Fonte ÚNICA city/observância-aware p/ a FOLHA/HE. Devolve as ocorrências
// de feriado no período (banco + defaults nacionais/móveis), cada uma com escopo
// geográfico e flag `observado`. Defaults são SUPRIMIDOS por NOME quando já existe um
// registro no banco com o mesmo nome (copy-on-write: assim que o gestor decide a
// observância de um default, o registro persistido manda).
//
// ⚠️ TENANT: NÃO valida ownership dos companyIds — o caller garante origem confiável
// (ex.: `period.companyId` lido do banco).
export async function getFeriadosObservadosForPeriod(
  db: any,
  companyIds: number[],
  dataInicio: string,
  dataFim: string,
): Promise<FeriadoOcorrencia[]> {
  const out: FeriadoOcorrencia[] = [];
  if (!dataInicio || !dataFim || dataInicio > dataFim) return out;
  const cids = (companyIds || []).filter((n) => Number.isFinite(Number(n)));
  if (cids.length === 0) return out;

  const rows = await db
    .select({
      data: feriados.data, recorrente: feriados.recorrente, nome: feriados.nome,
      estado: feriados.estado, cidade: feriados.cidade, observado: feriados.observado,
    })
    .from(feriados)
    .where(and(
      eq(feriados.ativo, 1),
      sql`(${feriados.companyId} IS NULL OR ${feriados.companyId} IN (${sql.join(cids.map((c) => sql`${c}`), sql`, `)}))`,
    ));

  const yIni = parseInt(dataInicio.slice(0, 4), 10);
  const yFim = parseInt(dataFim.slice(0, 4), 10);
  const nomesBanco = new Set<string>();

  const push = (data: string, nome: string, estado: any, cidade: any, observado: boolean) => {
    out.push({
      data, nome,
      escopo: _escopoDe(estado, cidade),
      estado: estado ? _normUF(estado) : null,
      cidade: cidade ? _normCidade(cidade) : null,
      observado,
    });
  };

  for (const f of rows) {
    nomesBanco.add(String(f.nome || "").toLowerCase().trim());
    const raw = String(f.data);
    const obs = Number(f.observado) === 1;
    if (f.recorrente === 1) {
      const md = raw.length >= 10 ? raw.slice(5) : raw;
      for (let y = yIni; y <= yFim; y++) {
        const ds = `${y}-${md}`;
        if (ds >= dataInicio && ds <= dataFim) push(ds, f.nome, f.estado, f.cidade, obs);
      }
    } else {
      if (raw >= dataInicio && raw <= dataFim) push(raw, f.nome, f.estado, f.cidade, obs);
    }
  }

  // Defaults nacionais fixos (observado=true) + móveis (observadoDefault) — suprimidos
  // por NOME quando o banco já tem o mesmo feriado (copy-on-write).
  for (let y = yIni; y <= yFim; y++) {
    for (const f of FERIADOS_NACIONAIS) {
      if (nomesBanco.has(f.nome.toLowerCase().trim())) continue;
      const ds = `${y}-${f.data}`;
      if (ds >= dataInicio && ds <= dataFim) push(ds, f.nome, null, null, true);
    }
    for (const f of feriadosMoveis(y)) {
      if (nomesBanco.has(f.nome.toLowerCase().trim())) continue;
      if (f.data >= dataInicio && f.data <= dataFim) push(f.data, f.nome, null, null, f.observadoDefault);
    }
  }
  return out;
}

// Index por data → ocorrências, p/ checagem O(1) no loop de HE.
export function indexFeriadosObservados(ocorrencias: FeriadoOcorrencia[]): Map<string, FeriadoOcorrencia[]> {
  const idx = new Map<string, FeriadoOcorrencia[]>();
  for (const o of ocorrencias) {
    const arr = idx.get(o.data);
    if (arr) arr.push(o); else idx.set(o.data, [o]);
  }
  return idx;
}

// Rev. 3352 — o dia `dateStr` é feriado OBSERVADO para quem trabalhou na cidade/UF
// informada? nacional vale p/ todos; estadual exige UF igual; municipal exige cidade
// igual. Basta UMA ocorrência aplicável observada (obrigatório nacional sempre ganha).
export function isFeriadoObservado(
  idx: Map<string, FeriadoOcorrencia[]>,
  dateStr: string,
  cidade: string | null | undefined,
  estado: string | null | undefined,
): boolean {
  const arr = idx.get(dateStr);
  if (!arr || arr.length === 0) return false;
  const c = _normCidade(cidade);
  const uf = _normUF(estado);
  for (const o of arr) {
    if (!o.observado) continue;
    if (o.escopo === "nacional") return true;
    if (o.escopo === "estadual" && o.estado && uf && o.estado === uf) return true;
    if (o.escopo === "municipal" && o.cidade && c && o.cidade === c) return true;
  }
  return false;
}

// Rev. 2216 — helper reusável (sem auth) para construir Set<YYYY-MM-DD> de
// feriados aplicáveis a um intervalo, considerando: (a) feriados custom do
// banco (recorrentes expandidos por ano), (b) FERIADOS_NACIONAIS fixos,
// (c) feriados móveis. Espelha exatamente a lógica de `listarPeriodo` e é
// usado por `horasExtras.ts` (memorialCalculo + computeHEForPeriod) para
// tratar feriado como domingo (HE 100%, jornada esperada 0).
//
// ⚠️ ATENÇÃO TENANT: este helper NÃO valida ownership dos `companyIds`.
// O caller é responsável por garantir que os IDs vieram de uma fonte
// confiável (ex.: `period.companyId` lido do próprio banco, ou já
// validado via `ensureUserOwnsCompanies`). NUNCA passe `input.companyIds`
// cru do cliente sem antes validar.
export async function getFeriadosSetForPeriod(
  db: any,
  companyIds: number[],
  dataInicio: string,
  dataFim: string,
): Promise<Set<string>> {
  const set = new Set<string>();
  if (!dataInicio || !dataFim || dataInicio > dataFim) return set;
  const cids = (companyIds || []).filter((n) => Number.isFinite(Number(n)));
  if (cids.length === 0) return set;

  const rows = await db
    .select({ data: feriados.data, recorrente: feriados.recorrente })
    .from(feriados)
    .where(and(
      eq(feriados.ativo, 1),
      sql`(${feriados.companyId} IS NULL OR ${feriados.companyId} IN (${sql.join(cids.map((c) => sql`${c}`), sql`, `)}))`,
    ));

  const yIni = parseInt(dataInicio.slice(0, 4), 10);
  const yFim = parseInt(dataFim.slice(0, 4), 10);

  for (const f of rows) {
    const raw = String(f.data);
    if (f.recorrente === 1) {
      const md = raw.length >= 10 ? raw.slice(5) : raw;
      for (let y = yIni; y <= yFim; y++) {
        const ds = `${y}-${md}`;
        if (ds >= dataInicio && ds <= dataFim) set.add(ds);
      }
    } else {
      if (raw >= dataInicio && raw <= dataFim) set.add(raw);
    }
  }
  for (let y = yIni; y <= yFim; y++) {
    for (const f of FERIADOS_NACIONAIS) {
      const ds = `${y}-${f.data}`;
      if (ds >= dataInicio && ds <= dataFim) set.add(ds);
    }
    for (const f of feriadosMoveis(y)) {
      if (f.data >= dataInicio && f.data <= dataFim) set.add(f.data);
    }
  }
  return set;
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

      // Rev. 3352 — suprime defaults por NOME quando já há registro no banco (copy-on-write),
      // pois o registro persistido carrega a observância escolhida pelo gestor.
      const nomesBanco = new Set(filtrados.map(f => String(f.nome || '').toLowerCase().trim()));

      const nacionaisFixos = FERIADOS_NACIONAIS
        .filter(f => !existentes.has(f.data) && !nomesBanco.has(f.nome.toLowerCase().trim()))
        .map(f => ({
          id: 0,
          companyId: null,
          nome: f.nome,
          data: `${ano}-${f.data}`,
          tipo: f.tipo,
          recorrente: 1,
          estado: null,
          cidade: null,
          ativo: 1,
          observado: 1, // obrigatório nacional: observado por padrão
          criadoPor: 'Sistema',
          createdAt: null,
          updatedAt: null,
          isDefault: true,
        }));

      // Adicionar feriados móveis (Carnaval/Corpus = facultativo observado=0 por padrão)
      const moveis = feriadosMoveis(ano)
        .filter(f => !existentes.has(f.data.substring(5)) && !nomesBanco.has(f.nome.toLowerCase().trim()))
        .map(f => ({
          id: 0,
          companyId: null,
          nome: f.nome,
          data: f.data,
          tipo: f.tipo,
          recorrente: 0,
          estado: null,
          cidade: null,
          ativo: 1,
          observado: f.observadoDefault ? 1 : 0,
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
      estado: z.string().nullish(),
      cidade: z.string().nullish(),
      observado: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      // Rev. 3352 — observado default por tipo: facultativo nasce 0 (empresa decide se
      // segue), demais nascem 1. Override explícito do form prevalece.
      const observado = input.observado !== undefined
        ? (input.observado ? 1 : 0)
        : (input.tipo === 'ponto_facultativo' ? 0 : 1);
      await db.insert(feriados).values({
        companyId: input.companyId,
        nome: input.nome,
        data: input.data,
        tipo: input.tipo,
        recorrente: input.recorrente ? 1 : 0,
        estado: input.estado || null,
        cidade: input.cidade || null,
        observado,
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
      estado: z.string().nullable().optional(),
      cidade: z.string().nullable().optional(),
      observado: z.boolean().optional(),
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
      if (rest.estado !== undefined) updateData.estado = rest.estado || null;
      if (rest.cidade !== undefined) updateData.cidade = rest.cidade || null;
      if (rest.observado !== undefined) updateData.observado = rest.observado ? 1 : 0;
      await db.update(feriados).set(updateData).where(eq(feriados.id, id));
      return { success: true };
    }),

  // Rev. 3352 — Define a OBSERVÂNCIA (empresa segue ou não) de um feriado, com
  // copy-on-write para os defaults nacionais/móveis (que só existem injetados no
  // `listar` com id=0): se o registro já existe (id>0) faz UPDATE; senão materializa
  // um registro da empresa com a observância escolhida. Espelha tipo/estado/cidade.
  definirObservancia: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      id: z.number().optional(),        // 0/undefined = default (copy-on-write)
      nome: z.string().min(1),
      data: z.string(),                  // YYYY-MM-DD
      tipo: z.enum(['nacional','estadual','municipal','ponto_facultativo','compensado']).default('nacional'),
      recorrente: z.boolean().default(true),
      estado: z.string().nullable().optional(),
      cidade: z.string().nullable().optional(),
      observado: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      await ensureUserOwnsCompanies(db, ctx.user, [input.companyId]);
      const obs = input.observado ? 1 : 0;

      // Registro real: UPDATE direto (com guard de empresa — global companyId NULL
      // também é editável por quem tem acesso, mas só promovendo cópia da empresa).
      if (input.id && input.id > 0) {
        const existing = await db.select({ companyId: feriados.companyId })
          .from(feriados).where(eq(feriados.id, input.id)).limit(1);
        const row = existing[0];
        if (row && row.companyId === input.companyId) {
          await db.update(feriados).set({ observado: obs }).where(eq(feriados.id, input.id));
          return { success: true, mode: "update" as const };
        }
        // Registro global (companyId NULL) ou de outra empresa → cai no copy-on-write.
      }

      // Copy-on-write: procura registro já materializado p/ esta empresa+nome.
      const mmdd = input.data.length >= 10 ? input.data.slice(5) : input.data;
      const dupe = await db.select({ id: feriados.id })
        .from(feriados)
        .where(and(
          eq(feriados.companyId, input.companyId),
          eq(feriados.nome, input.nome),
          eq(feriados.ativo, 1),
          input.recorrente
            ? sql`RIGHT(${feriados.data}::text, 5) = ${mmdd}`
            : eq(feriados.data, input.data),
        ))
        .limit(1);
      if (dupe[0]) {
        await db.update(feriados).set({ observado: obs }).where(eq(feriados.id, dupe[0].id));
        return { success: true, mode: "update" as const };
      }

      await db.insert(feriados).values({
        companyId: input.companyId,
        nome: input.nome,
        data: input.data,
        tipo: input.tipo,
        recorrente: input.recorrente ? 1 : 0,
        estado: input.estado || null,
        cidade: input.cidade || null,
        observado: obs,
        criadoPor: ctx.user.name ?? 'Sistema',
      });
      return { success: true, mode: "insert" as const };
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
            observado: 1, // obrigatório nacional
            criadoPor: ctx.user.name ?? 'Sistema',
          });
          count++;
        }
      }

      // Feriados móveis (Carnaval/Corpus = facultativo observado=0 por padrão)
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
            observado: f.observadoDefault ? 1 : 0,
            criadoPor: ctx.user.name ?? 'Sistema',
          });
          count++;
        }
      }

      return { success: true, feriadosCriados: count };
    }),

  // Rev. 3355 — UFs com base estadual curada (p/ o seletor do diálogo "Baixar Feriados").
  ufsEstaduaisDisponiveis: protectedProcedure.query(async () => {
    return Object.keys(FERIADOS_ESTADUAIS).sort();
  }),

  // Rev. 3355 — "Baixar Feriados": semeia NACIONAIS (fixos + móveis, globais) e os
  // ESTADUAIS das UFs ESCOLHIDAS pelo usuário (pré-marcadas pelas UFs das obras
  // ativas, quando preenchidas). Os estaduais são gravados na empresa selecionada
  // (companyId) e só contam como HE p/ quem tem a UF preenchida na obra onde bateu
  // ponto. Feriados MUNICIPAIS NÃO são baixados (sem base pública) → cadastro manual.
  baixarFeriados: protectedProcedure
    .input(z.object({
      companyId: z.number(),
      companyIds: z.array(z.number()).optional(),
      ano: z.number(),
      ufs: z.array(z.string()).optional(), // UFs escolhidas p/ baixar os estaduais
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;
      const ano = input.ano;
      // IDOR guard: input.companyId é usado na escrita dos estaduais (cmp), então
      // precisa SEMPRE ser validado — não só quando companyIds vem vazio. Une os dois.
      const cids = Array.from(new Set(
        [input.companyId, ...(input.companyIds || [])]
          .map(Number).filter((n) => Number.isFinite(n)),
      ));
      await ensureUserOwnsCompanies(db, ctx.user, cids);

      let nacionaisCriados = 0;
      let estaduaisCriados = 0;

      // (1) NACIONAIS fixos (globais, dedup por data)
      for (const f of FERIADOS_NACIONAIS) {
        const data = `${ano}-${f.data}`;
        const existing = await db.select({ id: feriados.id }).from(feriados)
          .where(and(sql`${feriados.companyId} IS NULL`, eq(feriados.data, data)));
        if (existing.length === 0) {
          await db.insert(feriados).values({
            companyId: null, nome: f.nome, data, tipo: f.tipo,
            recorrente: 1, observado: 1, criadoPor: ctx.user.name ?? 'Sistema',
          });
          nacionaisCriados++;
        }
      }

      // (2) NACIONAIS móveis (Carnaval/Corpus = facultativo observado=0)
      for (const f of feriadosMoveis(ano)) {
        const existing = await db.select({ id: feriados.id }).from(feriados)
          .where(and(sql`${feriados.companyId} IS NULL`, eq(feriados.data, f.data)));
        if (existing.length === 0) {
          await db.insert(feriados).values({
            companyId: null, nome: f.nome, data: f.data, tipo: f.tipo,
            recorrente: 0, observado: f.observadoDefault ? 1 : 0, criadoPor: ctx.user.name ?? 'Sistema',
          });
          nacionaisCriados++;
        }
      }

      // (3) ESTADUAIS — baixa os estaduais das UFs ESCOLHIDAS pelo usuário, gravados
      // na empresa selecionada (input.companyId). Detecção por obra é só sugestão de
      // UI (pré-marcação); aqui semeia exatamente o que veio em `input.ufs`. Os
      // estaduais só contam como HE p/ quem tem a UF preenchida na obra onde bateu ponto.
      const cmp = Number(input.companyId);
      const ufsSel = Array.from(new Set((input.ufs || []).map(_normUF).filter((u) => u.length === 2)));
      const ufsComFeriado = new Set<string>();
      const ufsSemBase = new Set<string>();
      for (const uf of ufsSel) {
        const base = FERIADOS_ESTADUAIS[uf];
        if (!base) { ufsSemBase.add(uf); continue; }
        for (const h of base) {
          const data = `${ano}-${h.data}`;
          // dedup por (empresa OU global) + data + nome (evita recriar a cada ano/clique)
          const existing = await db.select({ id: feriados.id }).from(feriados)
            .where(and(
              sql`(${feriados.companyId} = ${cmp} OR ${feriados.companyId} IS NULL)`,
              eq(feriados.data, data),
              eq(feriados.nome, h.nome),
            ));
          if (existing.length === 0) {
            await db.insert(feriados).values({
              companyId: cmp, nome: h.nome, data, tipo: 'estadual',
              recorrente: 1, estado: uf, observado: 1, criadoPor: ctx.user.name ?? 'Sistema',
            });
            estaduaisCriados++;
          }
          ufsComFeriado.add(uf);
        }
      }

      return {
        success: true,
        nacionaisCriados,
        estaduaisCriados,
        ufsComFeriado: Array.from(ufsComFeriado).sort(),
        ufsSemBase: Array.from(ufsSemBase).sort(),
      };
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
          sql`(${feriados.data}::text = ${input.data} OR (${feriados.recorrente} = 1 AND RIGHT(${feriados.data}::text, 5) = ${mmdd}))`,
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
